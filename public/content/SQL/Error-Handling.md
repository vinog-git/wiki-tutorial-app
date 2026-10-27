# SQL: Error Handling

Every SQL statement can fail: a constraint is violated, a value cannot be converted, a lock times out, a deadlock is detected, or a row a query expects is missing. The database reports each failure with an error code. Good error handling has four parts: prevent errors the database can avoid, recognise the error when it happens, keep the data consistent with transactions, and retry only the failures that are safe to retry.

## Sample schema

```sql
CREATE TABLE customers (
    id     INT PRIMARY KEY,
    email  VARCHAR(100) NOT NULL UNIQUE,
    name   VARCHAR(50)  NOT NULL
);

CREATE TABLE orders (
    id           INT PRIMARY KEY,
    customer_id  INT NOT NULL REFERENCES customers(id),
    total        NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    status       VARCHAR(20) NOT NULL
);

INSERT INTO customers VALUES (1, 'alice@example.com', 'Alice');
```

The examples use PostgreSQL output and error messages. Other databases differ in wording and error codes, covered in the dialect table below.

## Constraints: let the database reject bad data

The cheapest error to handle is the one the database never allows. Constraints are the first line of defence.

| Constraint | Protects against | Example |
|---|---|---|
| `NOT NULL` | Missing required values | `name VARCHAR(50) NOT NULL` |
| `UNIQUE` | Duplicate values | `email ... UNIQUE` |
| `PRIMARY KEY` | Duplicate or missing identity | `id INT PRIMARY KEY` |
| `FOREIGN KEY` | Orphan rows | `customer_id REFERENCES customers(id)` |
| `CHECK` | Values outside a rule | `CHECK (total >= 0)` |
| `DEFAULT` | Forgotten values | `status DEFAULT 'PENDING'` |

Each violation returns an error. Here is a duplicate email:

```sql
INSERT INTO customers VALUES (2, 'alice@example.com', 'Alice Two');
```

```output
ERROR:  duplicate key value violates unique constraint "customers_email_key"
DETAIL:  Key (email)=(alice@example.com) already exists.
```

Constraints are the last line of defence, not a substitute for validation in the application. Validate first so users get a helpful message, and let the constraint catch anything that slips through, such as a race between two requests.

## SQLSTATE: the error code you should match on

Each error has a five-character **SQLSTATE** code. The first two characters are the class; the last three identify the specific error. Match on SQLSTATE, not on the message text, because messages change between versions and locales.

| SQLSTATE | Meaning (PostgreSQL) | Typical cause |
|---|---|---|
| `23502` | `not_null_violation` | Inserting NULL into a NOT NULL column |
| `23503` | `foreign_key_violation` | Referencing a missing parent row, or deleting a referenced parent |
| `23505` | `unique_violation` | Duplicate key |
| `23514` | `check_violation` | A CHECK rule failed |
| `22001` | `string_data_right_truncation` | Value longer than the column |
| `22003` | `numeric_value_out_of_range` | Number too large for the type |
| `22012` | `division_by_zero` | Dividing by zero |
| `22P02` | `invalid_text_representation` | Cannot cast text such as `'abc'` to an integer |
| `40001` | `serialization_failure` | Transaction conflict under SERIALIZABLE isolation |
| `40P01` | `deadlock_detected` | Two transactions waiting on each other |
| `42P01` | `undefined_table` | Table does not exist |
| `42703` | `undefined_column` | Column does not exist |
| `42601` | `syntax_error` | Invalid SQL |
| `55P03` | `lock_not_available` | `NOWAIT` or `lock_timeout` expired |
| `57014` | `query_canceled` | Statement timeout or cancellation |
| `08xxx` | Connection exceptions | Network failure, server restart |

Class `23` (integrity constraint violation) is the group most applications need to handle explicitly.

## Preventing errors in queries

### Safe division

```sql
-- Fails on a zero denominator
SELECT total / customer_count FROM stats;

-- NULLIF turns zero into NULL; the division yields NULL instead of an error
SELECT total / NULLIF(customer_count, 0) FROM stats;
```

The result is NULL rather than an error. Decide in the application what a NULL ratio means (often "no data") and handle it explicitly.

### Safe conversion

PostgreSQL has no `TRY_CAST`, so validate the text before casting:

```sql
SELECT CASE
         WHEN raw_qty ~ '^[0-9]+$' THEN raw_qty::INT
       END AS qty
FROM imports;
```

SQL Server offers `TRY_CAST` and `TRY_CONVERT`, which return NULL instead of failing. A strict type check at the boundary (the import step) is more reliable than a cast that silently changes meaning.

### Upserts that do not fail on duplicates

When a duplicate is an expected outcome, avoid raising an error at all:

```sql
-- Insert a customer, or do nothing if the email already exists
INSERT INTO customers (id, email, name)
VALUES (3, 'bob@example.com', 'Bob')
ON CONFLICT (email) DO NOTHING;
```

```output
INSERT 0 1
```

Run it again and the output reports zero rows inserted:

```output
INSERT 0 0
```

To update instead of ignoring:

```sql
INSERT INTO customers (id, email, name)
VALUES (3, 'bob@example.com', 'Robert')
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;
```

`EXCLUDED` refers to the row you tried to insert. MySQL uses `INSERT ... ON DUPLICATE KEY UPDATE`, and SQL Server uses `MERGE`.

### Checking before writing

```sql
-- Race-prone: two sessions can both see "no row" and both insert
IF NOT EXISTS (SELECT 1 FROM customers WHERE email = 'carol@example.com')
    INSERT INTO customers ...;
```

Checking first is fine for user messages, but it is not safe alone under concurrency. The unique constraint (or `ON CONFLICT`) is what actually guarantees correctness.

## Transactions: all or nothing

A transaction groups statements so that either all succeed or none take effect. That is how you keep data consistent when one step fails.

```sql
BEGIN;

INSERT INTO orders (id, customer_id, total, status)
VALUES (10, 1, 49.99, 'PENDING');

UPDATE customers SET name = 'Alice Smith' WHERE id = 1;

COMMIT;
```

If anything fails before `COMMIT`, issue `ROLLBACK` to undo everything since `BEGIN`.

```sql
BEGIN;
INSERT INTO orders (id, customer_id, total, status)
VALUES (11, 999, 20.00, 'PENDING');   -- customer 999 does not exist
```

```output
ERROR:  insert or update on table "orders" violates foreign key constraint "orders_customer_id_fkey"
DETAIL:  Key (customer_id)=(999) is not present in table "customers".
```

PostgreSQL now refuses any further statement in that transaction until you end it:

```sql
SELECT 1;
```

```output
ERROR:  current transaction is aborted, commands ignored until end of transaction block
```

```sql
ROLLBACK;
```

The rule: **after an error, roll back**. Do not try to continue the same transaction.

### Savepoints: recover from part of a transaction

A savepoint marks a point you can return to without abandoning the whole transaction:

```sql
BEGIN;

INSERT INTO orders (id, customer_id, total, status)
VALUES (12, 1, 10.00, 'PENDING');

SAVEPOINT before_risky;

INSERT INTO orders (id, customer_id, total, status)
VALUES (13, 999, 5.00, 'PENDING');     -- fails

ROLLBACK TO SAVEPOINT before_risky;    -- order 12 is kept, the transaction is usable again

COMMIT;
```

Order 12 is committed; order 13 never existed. Savepoints are useful in batch loops where one bad row should not stop the others.

## Error handling inside the database

### PostgreSQL (PL/pgSQL)

A function can catch specific errors with an `EXCEPTION` block. Each `WHEN` clause matches a condition name, which maps to a SQLSTATE:

```sql
CREATE OR REPLACE FUNCTION place_order(p_customer INT, p_total NUMERIC)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_id INT;
BEGIN
    INSERT INTO orders (id, customer_id, total, status)
    VALUES (nextval('orders_id_seq'), p_customer, p_total, 'PENDING')
    RETURNING id INTO v_id;

    RETURN v_id;
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE EXCEPTION 'customer % does not exist', p_customer;
    WHEN check_violation THEN
        RAISE EXCEPTION 'total must not be negative, got %', p_total;
END;
$$;
```

```sql
SELECT place_order(999, 20.00);
```

```output
ERROR:  customer 999 does not exist
```

`RAISE EXCEPTION` reports a clear message to the caller. Unlisted errors still propagate unchanged, which is what you want: do not swallow errors you did not plan for.

Use `RAISE WARNING` for something worth logging that does not stop the work. Use `GET STACKED DIAGNOSTICS` inside a handler to read the SQLSTATE, message and constraint name:

```sql
EXCEPTION
    WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS
            v_constraint = CONSTRAINT_NAME,
            v_message    = MESSAGE_TEXT;
        RAISE NOTICE 'duplicate on %: %', v_constraint, v_message;
```

### MySQL: handlers

MySQL uses `DECLARE ... HANDLER` inside a stored procedure. Error 1062 is `ER_DUP_ENTRY`, the duplicate-key error:

```sql
DELIMITER //
CREATE PROCEDURE add_customer(IN p_email VARCHAR(100), IN p_name VARCHAR(50))
BEGIN
    DECLARE EXIT HANDLER FOR 1062
    BEGIN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'email already registered';
    END;

    INSERT INTO customers (email, name) VALUES (p_email, p_name);
END //
DELIMITER ;
```

`EXIT HANDLER` leaves the block after running the handler. `CONTINUE HANDLER` resumes after it. `DECLARE EXIT HANDLER FOR SQLEXCEPTION` catches every error, which is usually too broad. `SIGNAL` raises a new error with your own message.

### SQL Server: TRY ... CATCH

```sql
BEGIN TRY
    BEGIN TRANSACTION;

    INSERT INTO orders (id, customer_id, total, status)
    VALUES (14, 999, 20.00, 'PENDING');

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF XACT_STATE() <> 0
        ROLLBACK TRANSACTION;

    SELECT ERROR_NUMBER()  AS error_number,   -- 547 for a foreign key violation
           ERROR_MESSAGE() AS error_message;
END CATCH;
```

`XACT_STATE()` tells you whether a transaction is still open and committable (1), open but doomed (-1), or not open (0). Check it before rolling back.

## Deadlocks, lock timeouts and retries

Some errors are temporary. A deadlock or serialization failure means the same transaction would probably succeed if run again. A foreign key violation will fail forever and must not be retried.

| Error | Retry? | Notes |
|---|---|---|
| `40P01` deadlock | Yes | The database rolled back one transaction; rerun it |
| `40001` serialization failure | Yes | Rerun the whole transaction, not one statement |
| `55P03` lock timeout | Sometimes | Retry with backoff; investigate long transactions |
| `57014` statement timeout | Only if idempotent | The query may be too slow, not a transient fault |
| `23xxx` constraint violation | No | A retry will fail the same way; fix the data |
| `42xxx` syntax or missing object | No | A bug or a missing migration |
| `08xxx` connection error | Yes, with backoff | Reconnect, then retry idempotent work |

Retry the whole transaction, with a limit and a backoff:

```sql
-- Keep locks short so conflicts resolve quickly
SET lock_timeout = '2s';
SET statement_timeout = '5s';
```

```python
import time, random
import psycopg2
from psycopg2 import errors

RETRYABLE = (errors.DeadlockDetected, errors.SerializationFailure)

def run_with_retry(conn, work, attempts=5):
    for attempt in range(1, attempts + 1):
        try:
            with conn:                       # commits on success, rolls back on error
                with conn.cursor() as cur:
                    return work(cur)
        except RETRYABLE:
            if attempt == attempts:
                raise
            time.sleep(min(2 ** attempt, 8) * random.uniform(0.5, 1.0))   # jittered backoff
```

Retries are only safe when the work is idempotent. Pair retries with a unique key, as in the outbox and idempotency patterns in the Kafka and Java sections, so a retried request cannot apply twice.

## Errors in application code

### JDBC

`SQLException` carries the SQLSTATE and vendor error code. Match on the SQLSTATE class:

```java
try (PreparedStatement ps = conn.prepareStatement(
        "INSERT INTO customers (id, email, name) VALUES (?, ?, ?)")) {
    ps.setInt(1, id);
    ps.setString(2, email);
    ps.setString(3, name);
    ps.executeUpdate();
} catch (SQLException e) {
    String state = e.getSQLState();
    if ("23505".equals(state)) {
        throw new EmailAlreadyRegisteredException(email, e);     // expected: tell the user
    }
    if ("23503".equals(state)) {
        throw new CustomerNotFoundException(id, e);
    }
    if ("40P01".equals(state) || "40001".equals(state)) {
        throw new RetryableDataException(e);                    // caller retries the transaction
    }
    throw new DataAccessFailure("insert customer failed, state=" + state, e);   // unexpected
}
```

Do not catch `SQLException` and ignore it. Every branch either translates the error into something meaningful, retries it, or rethrows it.

### Spring

Spring translates SQLSTATE codes into a hierarchy of `DataAccessException` subclasses, so you rarely parse codes yourself:

| Exception | Usually means |
|---|---|
| `DuplicateKeyException` | Unique constraint violated |
| `DataIntegrityViolationException` | Not null, foreign key, or check violated |
| `DeadlockLoserDataAccessException` | Chosen as the deadlock victim; retry |
| `CannotAcquireLockException` | Lock could not be obtained in time |
| `QueryTimeoutException` | Statement timed out |
| `EmptyResultDataAccessException` | Expected one row, found none |
| `IncorrectResultSizeDataAccessException` | Expected one row, found several |

```java
@Service
public class CustomerService {

    private final JdbcTemplate jdbc;

    public CustomerService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public void register(int id, String email, String name) {
        try {
            jdbc.update("INSERT INTO customers (id, email, name) VALUES (?, ?, ?)", id, email, name);
        } catch (DuplicateKeyException e) {
            throw new EmailAlreadyRegisteredException(email, e);
        }
    }

    public Customer findByEmail(String email) {
        try {
            return jdbc.queryForObject("SELECT id, email, name FROM customers WHERE email = ?",
                                       customerMapper, email);
        } catch (EmptyResultDataAccessException e) {
            throw new CustomerNotFoundException(email, e);
        }
    }
}
```

`@Transactional` rolls back on unchecked exceptions by default, which covers `DataAccessException`. Declare `rollbackFor` only when you need checked exceptions to roll back too.

## Error handling dialect reference

| Need | PostgreSQL | MySQL | SQL Server | Oracle |
|---|---|---|---|---|
| Catch errors in a block | `EXCEPTION WHEN ...` | `DECLARE ... HANDLER` | `BEGIN TRY ... BEGIN CATCH` | `EXCEPTION WHEN ... THEN` |
| Raise a custom error | `RAISE EXCEPTION` | `SIGNAL SQLSTATE` | `THROW` / `RAISERROR` | `RAISE_APPLICATION_ERROR` |
| Duplicate key code | `23505` | `1062` / `23000` | `2627` / `2601` | `ORA-00001` |
| Safe conversion | Validate, then cast | Strict mode errors; `CAST` with check | `TRY_CAST`, `TRY_CONVERT` | `VALIDATE_CONVERSION` |
| Ignore duplicates | `ON CONFLICT DO NOTHING` | `INSERT IGNORE` (careful) or `ON DUPLICATE KEY` | `MERGE` | `MERGE` |
| Statement timeout | `SET statement_timeout` | `max_execution_time` (SELECT) | Query timeout in client | Resource limits |

`INSERT IGNORE` in MySQL downgrades many errors to warnings, including some you want to see, such as truncated data. Prefer `ON DUPLICATE KEY UPDATE` or explicit checks.

## Logging errors safely

- Log the SQLSTATE, the constraint or table name, and a request or correlation ID.
- Do not log parameter values that contain personal data, passwords or card numbers. The error DETAIL line can echo a value, such as `Key (email)=(alice@example.com)`, so redact it before it reaches shared logs.
- Log the full error once, at the boundary where you handle it, not at every layer.

## Timeouts as error prevention

A query that waits forever is an error waiting to happen. Set limits so failures come quickly and visibly:

| Setting | Scope | Effect |
|---|---|---|
| `statement_timeout` | PostgreSQL session or role | Cancels statements that run too long (`57014`) |
| `lock_timeout` | PostgreSQL session | Gives up waiting for a lock (`55P03`) |
| `idle_in_transaction_session_timeout` | PostgreSQL | Ends sessions that hold a transaction open while idle, freeing locks |
| JDBC `setQueryTimeout` | Client | Cancels a statement from the application side |
| Connection pool timeouts | Client | Fail fast when the pool is exhausted |

Apply them to migrations too. A long `ALTER TABLE` with no `lock_timeout` can queue behind a long read and block every query behind it (see the [Schema Migrations](/SQL/Schema-Migrations) page).

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Catching all errors and continuing | Silent data loss or partial writes | Catch specific SQLSTATEs, rethrow the rest |
| Continuing a transaction after an error | Every later statement fails (PostgreSQL) | Roll back, or use a savepoint |
| Checking existence before inserting, with no unique constraint | Race conditions create duplicates | Add the unique constraint and handle `23505` |
| Retrying a constraint violation | Same failure, repeated | Retry only transient errors |
| Retrying without idempotency | Duplicate orders or charges | Use idempotency keys |
| Matching on the message text | Breaks on a version or locale change | Match on SQLSTATE |
| No timeouts | One slow query holds locks and exhausts the pool | Set `statement_timeout` and `lock_timeout` |
| Using `INSERT IGNORE` everywhere | Real problems hidden as warnings | Use `ON CONFLICT` for expected duplicates only |

## Quick reference

```sql
-- Prevent: constraints, safe division, upserts
total / NULLIF(count, 0)
INSERT ... ON CONFLICT (key) DO NOTHING;

-- Transactions
BEGIN; ... COMMIT;   -- or ROLLBACK after any error
SAVEPOINT s; ... ROLLBACK TO SAVEPOINT s;

-- Timeouts
SET statement_timeout = '5s';
SET lock_timeout = '2s';

-- PostgreSQL handler
EXCEPTION WHEN unique_violation THEN ...
RAISE EXCEPTION 'message %', value;
```

## Interview questions

**Q: What is SQLSTATE and why should applications match on it?**
A five-character standard error code. The class (first two characters) groups errors, and the full code identifies the specific error. Messages change across versions and languages; SQLSTATE does not.

**Q: How do you handle a duplicate insert without an error reaching the user?**
Use `INSERT ... ON CONFLICT DO NOTHING` (or `DO UPDATE`), so the duplicate is an expected outcome rather than an exception. Keep the unique constraint as the guarantee.

**Q: Why is "check if exists, then insert" not enough?**
Two sessions can both see that the row is missing and both insert. Only a unique constraint enforced by the database prevents that race.

**Q: What happens to a PostgreSQL transaction after a statement fails?**
It enters an aborted state, and every later statement fails until you `ROLLBACK`. Use a savepoint to recover from part of a transaction.

**Q: Which errors are safe to retry?**
Transient ones: deadlocks, serialization failures, lock timeouts and dropped connections. Constraint violations and syntax errors are not transient and will fail again. Retries must be idempotent, or the work must be keyed so it cannot apply twice.

**Q: How do you make a long-running migration safe to run on a busy table?**
Set `lock_timeout` so it gives up quickly instead of queueing behind active queries, retry it on timeout, and split large changes into batched steps.

**Q: Why roll back on error instead of continuing?**
The transaction may be in an inconsistent state, and in PostgreSQL it cannot continue at all. Rolling back restores the state from before `BEGIN`, so the caller can retry from a known point.

**Q: What is wrong with `INSERT IGNORE` in MySQL?**
It converts many errors into warnings, so real problems such as invalid data or truncation pass silently. Use `ON DUPLICATE KEY UPDATE` for duplicates you expect, and let other errors surface.
