# DB: ACID Transactions

A **transaction** groups several reads and writes into one unit of work. ACID is the set of guarantees a relational database gives that unit: **A**tomicity, **C**onsistency, **I**solation and **D**urability.

## The example: transferring money

Moving $100 from Alice to Bob is two updates. Without a transaction, a crash between them destroys money.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;  -- Alice
UPDATE accounts SET balance = balance + 100 WHERE id = 2;  -- Bob
COMMIT;
```

If anything fails before `COMMIT`, the client sends `ROLLBACK` and neither update takes effect.

## The four properties

### Atomicity

All operations in a transaction succeed, or none do. The database keeps undo information so an interrupted or failed transaction can be reversed.

Failure paths that all end in a rollback: an error in the second statement, an exception in the application, or a dropped connection before `COMMIT`.

```sql
CREATE TABLE accounts (
  id      INTEGER PRIMARY KEY,
  owner   TEXT NOT NULL,
  balance NUMERIC NOT NULL CHECK (balance >= 0)
);

INSERT INTO accounts VALUES (1, 'Alice', 100), (2, 'Bob', 50);

BEGIN;
UPDATE accounts SET balance = balance + 25 WHERE id = 2;   -- Bob gets +25
UPDATE accounts SET balance = balance - 500 WHERE id = 1;  -- violates CHECK
COMMIT;                                                    -- never reached
```

The second `UPDATE` is refused with `CHECK constraint failed: balance >= 0`. The transaction must end in `ROLLBACK`, and afterwards both balances are exactly what they were before `BEGIN`. Bob's +25 is not kept.

### Consistency

A transaction takes the database from one valid state to another. The rules it checks are the constraints you declare: `NOT NULL`, `CHECK`, `UNIQUE`, primary keys and foreign keys. The database enforces what you declared. It cannot enforce a rule you never encoded, such as "a customer may have at most five open orders", unless you add a constraint, a trigger, or application logic that runs under a suitable isolation level.

Note that this "C" is about business rules. It is not the same as the "C" in [CAP](/DB/CAP-and-PACELC), which is about whether replicas agree.

### Isolation

Concurrent transactions must not interfere in ways that break correctness. The ideal is that the result matches running them one after another (serializable). Real databases default to weaker levels for speed, and each level allows some anomalies. See [Isolation Levels and Anomalies](/DB/Isolation-Levels-and-Anomalies).

### Durability

Once `COMMIT` returns, the change survives a crash. The database writes the change to a **write-ahead log** (WAL) and flushes it to disk before it acknowledges the commit. After a crash it replays the log.

Durability has a cost: a disk flush per commit. Some databases offer settings that trade durability for speed. For example, PostgreSQL's `synchronous_commit = off` can lose the last few commits on a crash. Replicating to another machine adds protection against losing a whole machine.

## Using transactions in application code

JDBC, showing what a framework does for you:

```java
try (Connection con = dataSource.getConnection()) {
    con.setAutoCommit(false);
    try {
        debit(con, fromId, amount);
        credit(con, toId, amount);
        con.commit();
    } catch (SQLException e) {
        con.rollback();
        throw e;
    }
}
```

In Spring, `@Transactional` on a service method does the same begin, commit and rollback. By default it rolls back on unchecked exceptions and does not roll back on checked ones unless you say `rollbackFor`.

Keep transactions short. Locks are held until `COMMIT`, so don't call an HTTP service or wait for user input inside one.

## How to implement it

1. Put each multi-row change in one transaction, in the service layer, not in the controller.
2. Declare the rules as constraints, so the database enforces them even when application code has a bug.
3. When a transaction touches several rows, lock them in a fixed order (here, by `id`), so two transactions cannot deadlock on each other.
4. Keep transactions short, and set a timeout.
5. Roll back on any error. Retry only errors that are transient, such as deadlocks and serialization failures.

### Constraints

```sql
CREATE TABLE accounts (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner      TEXT NOT NULL,
  balance    NUMERIC(14,2) NOT NULL CHECK (balance >= 0),
  currency   CHAR(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  version    BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`CHECK (balance >= 0)` means no code path can overdraw an account. The `version` column supports the optimistic updates in [Isolation Levels and Anomalies](/DB/Isolation-Levels-and-Anomalies).

### The transfer as one database function

```sql
CREATE OR REPLACE FUNCTION transfer(p_from BIGINT, p_to BIGINT, p_amount NUMERIC)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;
  -- lock both rows in id order so opposite transfers cannot deadlock
  PERFORM 1 FROM accounts WHERE id IN (p_from, p_to) ORDER BY id FOR UPDATE;
  UPDATE accounts SET balance = balance - p_amount, version = version + 1 WHERE id = p_from;
  UPDATE accounts SET balance = balance + p_amount, version = version + 1 WHERE id = p_to;
END $$;
```

Checked on PostgreSQL 16:

- `SELECT transfer(1, 2, 30);` moves 30 from Alice (100 to 70) to Bob (50 to 80).
- `SELECT transfer(2, 1, 500);` fails with `violates check constraint "accounts_balance_check"`, and both balances stay as they were.
- Inserting a currency of `'us'` fails with `accounts_currency_check`.

### Calling it from Spring (sketch)

```java
@Service
public class TransferService {

    private final JdbcTemplate jdbc;

    public TransferService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // One database transaction. A RuntimeException rolls it back.
    @Transactional(timeout = 5, rollbackFor = Exception.class)
    public void transfer(long fromId, long toId, BigDecimal amount) {
        jdbc.queryForObject("SELECT transfer(?, ?, ?)", Object.class, fromId, toId, amount);
    }
}
```

`@Transactional` begins and commits the transaction, and rolls it back on an unchecked exception. Without `rollbackFor`, a checked exception commits whatever was already written.

### Configuration

```
# postgresql.conf: the defaults are safe. Change them only with a measured reason.
synchronous_commit = on     # COMMIT returns only after the WAL is flushed to disk
```

For one session, only for data you can afford to lose:

```sql
SET synchronous_commit = off;   -- faster commits; the most recent ones can be lost in a crash
```

## Common mistakes

- Two statements that must succeed together, run as separate autocommit statements.
- Catching an exception inside a transaction and then committing anyway. The partial writes are committed.
- Long transactions that hold locks and block other work.
- Treating "ACID" as one switch. Each property is implemented differently by each database, and some guarantees need specific settings.

## Key takeaways

- A transaction is all-or-nothing: `BEGIN` ... `COMMIT` or `ROLLBACK`.
- Consistency comes from the constraints you declare, so declare them.
- Isolation levels control what concurrent transactions may see.
- Durability means the WAL is flushed before `COMMIT` returns.
- Keep transactions short.

Related: [Isolation Levels and Anomalies](/DB/Isolation-Levels-and-Anomalies), [Indexes and B-Trees](/DB/Indexes-and-B-Trees), [SQL: Error Handling](/SQL/Error-Handling), [Java: Locking and Idempotency](/Java/Locking-and-Idempotency).
