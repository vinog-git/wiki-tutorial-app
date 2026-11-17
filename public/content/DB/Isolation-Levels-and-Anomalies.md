# DB: Isolation Levels and Anomalies

Isolation decides what one transaction may see of another transaction running at the same time. Stronger isolation prevents more anomalies, but costs throughput because transactions wait for each other or get retried.

## The anomalies

- **Dirty read**: reading a value another transaction wrote but has not committed. If that transaction rolls back, you acted on data that never existed.
- **Non-repeatable read**: reading the same row twice in one transaction and getting different values, because another transaction committed a change in between.
- **Phantom read**: running the same range query twice and getting a different *set* of rows, because another transaction inserted or deleted matching rows.
- **Lost update**: two transactions read a value, each computes a new value from it, and the second write silently overwrites the first.
- **Write skew**: two transactions read overlapping data, each checks a rule, then each writes a *different* row. Together they break the rule, and neither write conflicts with the other directly.

## The standard levels

| Isolation level | Dirty read | Non-repeatable read | Phantom read | Write skew |
|---|---|---|---|---|
| Read Uncommitted | possible | possible | possible | possible |
| Read Committed | prevented | possible | possible | possible |
| Repeatable Read | prevented | prevented | possible (per the SQL standard) | possible |
| Serializable | prevented | prevented | prevented | prevented |

This is the SQL standard's table. Engines differ in detail:

- **PostgreSQL** defaults to Read Committed. Its Repeatable Read is snapshot isolation, which also hides phantoms but still allows write skew. Read Uncommitted behaves like Read Committed. Serializable detects dangerous patterns, including write skew, and aborts one of the transactions.
- **MySQL InnoDB** defaults to Repeatable Read.

## Lost update

Under Read Committed, this interleaving loses Alice's deposit. Both transactions start with a balance of 100.

```sql
-- Transaction A: deposit 50                 -- Transaction B: deposit 30
SELECT balance FROM accounts WHERE id = 1;   -- reads 100
                                             SELECT balance FROM accounts WHERE id = 1;  -- reads 100
UPDATE accounts SET balance = 150 WHERE id = 1;   -- commits
                                             UPDATE accounts SET balance = 130 WHERE id = 1;  -- commits: A's +50 is gone
```

Fixes:

- Let the database do the arithmetic: `UPDATE accounts SET balance = balance + 30 WHERE id = 1;`
- Lock the row when you read it: `SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;`
- Use a version column and retry on conflict: `UPDATE accounts SET balance = ?, version = version + 1 WHERE id = ? AND version = ?`. If zero rows change, someone else got there first.

## Write skew

Rule: at least one doctor must stay on call. Alice and Bob are both on call, and each checks the count before leaving.

```
Start: Alice and Bob are both on call.

Transaction A (Alice)                          Transaction B (Bob)
-------------------------------------------    -------------------------------------------
SELECT COUNT(*) FROM doctors                   SELECT COUNT(*) FROM doctors
  WHERE on_call;     -- sees 2, safe to leave    WHERE on_call;     -- sees 2, safe to leave
UPDATE doctors SET on_call = false             UPDATE doctors SET on_call = false
  WHERE name = 'Alice';                          WHERE name = 'Bob';
COMMIT;                                        COMMIT;

Result: nobody is on call. The rule is broken.
```

Under Repeatable Read, both transactions read a consistent snapshot. Each updates a different row, so no row-level write conflict occurs and both commit.

Fixes:

- Run the transactions at Serializable, and retry the ones the database aborts.
- Make both transactions update the same row, for example a per-shift row. The database then sees the conflict.

## Choosing a level

- Know your database's default, and don't assume it is serializable.
- For rules that span rows (on-call coverage, "no overlapping bookings"), use Serializable with retries, or a shared row that both transactions must update.
- For single-row counters and balances, use an atomic `SET x = x + ?`, `SELECT ... FOR UPDATE`, or a version column.
- If you use Serializable, the application must handle retry on serialization failure. It is part of the design.

## How to implement it

1. Check the default for your database: `SHOW default_transaction_isolation;`.
2. Set the level for the transactions that need it, not for the whole database.
3. Use a version column for read-modify-write on rows that many transactions update.
4. At Serializable, run the whole transaction again when the database reports SQLSTATE `40001`.
5. Test the interleavings with two sessions, as the timelines above do.

### Set the level for one transaction

```sql
BEGIN ISOLATION LEVEL SERIALIZABLE;
SELECT count(*) FROM doctors WHERE on_call;
UPDATE doctors SET on_call = false WHERE name = 'Alice';
COMMIT;   -- can fail with SQLSTATE 40001: run the whole transaction again
```

Checked with two sessions on PostgreSQL 16. At SERIALIZABLE the second commit failed with `could not serialize access due to read/write dependencies among transactions`, and one doctor stayed on call. At REPEATABLE READ both commits succeeded, and nobody was on call.

### Optimistic update with a version column

```sql
UPDATE accounts
SET balance = balance + 30, version = version + 1
WHERE id = 1 AND version = 1;   -- UPDATE 0 means another transaction changed the row first: re-read and retry
```

Checked: once the version has moved on, the stale update changes 0 rows.

### Retry loop (Spring sketch)

```java
public <T> T inSerializableTransaction(Supplier<T> work) {
    TransactionTemplate template = new TransactionTemplate(transactionManager);
    template.setIsolationLevel(TransactionDefinition.ISOLATION_SERIALIZABLE);

    for (int attempt = 1; ; attempt++) {
        try {
            return template.execute(status -> work.get());
        } catch (CannotSerializeTransactionException e) {   // Spring maps SQLSTATE 40001 to this
            if (attempt == 5) {
                throw e;
            }
            // a short jittered pause here, then run the whole unit of work again
        }
    }
}
```

The `work` supplier must be safe to run more than once. Do not send an email or call another service inside it without an idempotency key.

## Key takeaways

- Read Committed prevents dirty reads and nothing else in the table.
- Repeatable Read stops rows changing under you, but it does not stop write skew.
- Serializable is the only level that prevents every anomaly in the table, and it may abort transactions you must retry.
- Lost updates are avoided with atomic updates, `FOR UPDATE`, or a version column.

Related: [ACID Transactions](/DB/ACID-Transactions), [SQL: Error Handling](/SQL/Error-Handling).
