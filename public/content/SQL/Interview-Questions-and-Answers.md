# SQL: Interview Questions and Answers

Common SQL interview questions covering queries, joins, aggregation, indexing, and database design.

## Basic Queries

### Q: What's the difference between `WHERE` and `HAVING`?
`WHERE` filters individual rows **before** any grouping happens, and cannot reference aggregate functions. `HAVING` filters **groups** after `GROUP BY` has run, and can reference aggregate functions like `COUNT()` or `SUM()`.

```sql
SELECT department, COUNT(*) AS emp_count
FROM employees
WHERE status = 'active'          -- filters rows first
GROUP BY department
HAVING COUNT(*) > 10;            -- filters groups after aggregation
```

#### Sample data

```output
 id | name  | department  | salary | manager_id | status
----+-------+-------------+--------+------------+----------
 1  | Ada   | Engineering | 150000 | NULL       | active
 2  | Brian | Engineering | 120000 | 1          | active
 3  | Cleo  | Engineering | 110000 | 1          | active
 4  | Dev   | Sales       | 90000  | NULL       | active
 5  | Elena | Sales       | 95000  | 4          | inactive
```

#### Output

```output
 department  | emp_count
-------------+-----------
 Engineering | 3
 Sales       | 1
(2 rows)
```

Elena is `inactive`, so `WHERE` removed her before grouping — which is why Sales counts 1 rather than 2. Had that been written as `HAVING status = 'active'` it would not even run: `status` is neither grouped nor aggregated.

(With `HAVING COUNT(*) > 10` as written, both groups would be filtered out and the result would be empty; the numbers above are for the query without that clause.)

### Q: What's the difference between `DELETE`, `TRUNCATE`, and `DROP`?
- `DELETE` removes rows matching a `WHERE` clause (or all rows without one), is logged row-by-row, can be rolled back, and fires triggers.
- `TRUNCATE` removes all rows at once, is minimally logged, generally cannot be rolled back (in most databases), and resets auto-increment counters.
- `DROP` removes the entire table structure along with its data.

### Q: What's the difference between `UNION` and `UNION ALL`?
`UNION` combines result sets from two queries and removes duplicate rows (which requires an implicit sort/dedup, so it's slower). `UNION ALL` combines result sets and keeps all rows, including duplicates - faster since no deduplication is needed.

### Q: What is the difference between `IN` and `EXISTS`?
`IN` compares a value against a list or subquery result set. `EXISTS` checks whether a subquery returns any rows at all, stopping as soon as one match is found. `EXISTS` is often more efficient for large subqueries because it doesn't need to materialize the full result set.

```sql
-- IN
SELECT * FROM orders WHERE customer_id IN (SELECT id FROM vip_customers);

-- EXISTS
SELECT * FROM orders o
WHERE EXISTS (SELECT 1 FROM vip_customers v WHERE v.id = o.customer_id);
```

Both return the same rows here; the difference is how the database gets there. `EXISTS` can stop at the first match per outer row, while `IN` may materialise the whole subquery first.

One real behavioural difference: **`NOT IN` breaks on NULLs.** If the subquery returns even one `NULL`, `NOT IN` returns no rows at all, because `x <> NULL` is unknown rather than true:

```output
SELECT * FROM orders WHERE customer_id NOT IN (SELECT id FROM vip_customers);
-- vip_customers.id contains a NULL

(0 rows)
```

`NOT EXISTS` has no such problem and is the safer default.

## Joins

### Q: What's the difference between `INNER JOIN` and `LEFT JOIN`?
`INNER JOIN` returns only rows that have matching values in both tables. `LEFT JOIN` returns all rows from the left table, with `NULL`s filled in for columns from the right table where no match exists.

### Q: What's the difference between `LEFT JOIN` and `RIGHT JOIN`?
They're mirror images: `LEFT JOIN` keeps all rows from the table listed first (left side), `RIGHT JOIN` keeps all rows from the table listed second (right side). Any `RIGHT JOIN` can be rewritten as a `LEFT JOIN` by swapping the table order - most style guides prefer sticking to `LEFT JOIN` for consistency.

### Q: What is a self-join, and when would you use one?
A self-join joins a table to itself, useful for comparing rows within the same table - e.g., finding employees and their managers, both stored in the same `employees` table.

```sql
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;
```

```output
 employee | manager
----------+---------
 Ada      | NULL
 Brian    | Ada
 Cleo     | Ada
 Dev      | NULL
 Elena    | Dev
(5 rows)
```

Two aliases, one table. `e` is the employee side and `m` the manager side, and the join condition `e.manager_id = m.id` walks one level up the hierarchy.

The `LEFT JOIN` matters: Ada and Dev have no manager, and an `INNER JOIN` would silently drop them — losing the two most senior people from an org chart.

### Q: What's a `CROSS JOIN`?
A `CROSS JOIN` produces the Cartesian product of two tables - every row from the first table paired with every row from the second. Useful for generating combinations (e.g., all size/color pairs for a product), but dangerous if used unintentionally since it can produce huge result sets.

## Aggregation

### Q: Why can't you use an aggregate function's result directly in the same query's `WHERE` clause?
Because `WHERE` is evaluated before aggregation happens (per the logical query processing order: `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY`). At the point `WHERE` runs, aggregate values don't exist yet - that's why `HAVING` exists, to filter after aggregation.

### Q: What's the difference between `COUNT(*)`, `COUNT(column)`, and `COUNT(DISTINCT column)`?
- `COUNT(*)` counts all rows, including those with `NULL` values in any column.
- `COUNT(column)` counts only rows where that specific column is non-`NULL`.
- `COUNT(DISTINCT column)` counts unique non-`NULL` values in that column.

```output
 COUNT(*) | COUNT(manager_id) | COUNT(DISTINCT department)
----------+-------------------+----------------------------
 5        | 3                 | 2
(1 row)
```

Five employees, but only three have a `manager_id` — Ada and Dev are top-level, so their NULLs are skipped by `COUNT(manager_id)`. The difference `COUNT(*) - COUNT(col)` is precisely the NULL count, which makes this pair a quick data-quality check.

### Q: How do `GROUP BY` and window functions differ?
`GROUP BY` collapses multiple rows into one summary row per group, losing row-level detail. Window functions (`SUM() OVER (...)`, `ROW_NUMBER() OVER (...)`) compute aggregates *across* a set of rows related to the current row, while still returning one output row per input row - letting you combine detail and aggregate values in the same result set.

```sql
SELECT
  name,
  department,
  salary,
  AVG(salary) OVER (PARTITION BY department) AS dept_avg_salary
FROM employees;
```

```output
 name  | department  | salary | dept_avg_salary
-------+-------------+--------+------------------
 Ada   | Engineering | 150000 | 126666.67
 Brian | Engineering | 120000 | 126666.67
 Cleo  | Engineering | 110000 | 126666.67
 Dev   | Sales       | 90000  | 92500.00
 Elena | Sales       | 95000  | 92500.00
(5 rows)
```

Five rows in, five rows out — each keeping its own salary **and** gaining its department's average. The equivalent `GROUP BY` collapses them:

```output
 department  | avg_salary
-------------+------------
 Engineering | 126666.67
 Sales       | 92500.00
(2 rows)
```

Two rows, and the individual salaries are gone. That is the trade: `GROUP BY` summarises, a window function annotates. Only the first form lets you ask "who earns more than their department average", because only it has both numbers on the same row.

## Database Design & Indexing

### Q: What is normalization, and what are the first three normal forms?
Normalization organizes data to reduce redundancy and prevent update anomalies.
- **1NF** - each column holds atomic (indivisible) values, no repeating groups.
- **2NF** - 1NF, plus every non-key column depends on the *entire* primary key (relevant for composite keys).
- **3NF** - 2NF, plus no non-key column depends on another non-key column (no transitive dependencies).

### Q: When would you denormalize a database?
When read performance matters more than avoiding redundancy - e.g., reporting/analytics tables, caching computed aggregates, or avoiding expensive joins on hot query paths. The tradeoff is more complex writes (keeping duplicated data in sync) for faster reads.

### Q: What is a primary key vs. a foreign key?
A **primary key** uniquely identifies each row in a table and cannot be `NULL`. A **foreign key** is a column (or set of columns) in one table that references a primary key in another table, enforcing referential integrity between the two.

### Q: How does an index improve query performance, and what's the tradeoff?
An index (commonly a B-tree) lets the database locate rows matching a condition without scanning the entire table, turning an `O(n)` scan into roughly `O(log n)` lookups. The tradeoff: indexes speed up reads but slow down writes (`INSERT`/`UPDATE`/`DELETE`), since every index must also be updated, and they consume additional storage.

### Q: What's the difference between a clustered and non-clustered index?
A **clustered index** determines the physical order in which rows are stored on disk - a table can have only one. A **non-clustered index** is a separate structure that stores pointers back to the actual row data - a table can have several.

## Transactions

### Q: What does ACID stand for?
- **Atomicity** - a transaction's operations either all succeed or all roll back together.
- **Consistency** - a transaction moves the database from one valid state to another, respecting constraints.
- **Isolation** - concurrent transactions don't interfere with each other's intermediate state.
- **Durability** - once committed, a transaction's changes survive even a crash.

### Q: What is a transaction isolation level, and what are the common ones?
Isolation levels control how much one transaction can see of another transaction's uncommitted changes, trading consistency guarantees for concurrency/performance:
- **Read Uncommitted** - can see uncommitted changes from other transactions (dirty reads).
- **Read Committed** - only sees committed data (default in many databases).
- **Repeatable Read** - guarantees the same row returns the same data if read twice in one transaction.
- **Serializable** - fully isolates transactions as if executed one at a time (strictest, slowest).

### Q: What is a deadlock in a database context?
A deadlock occurs when two transactions each hold a lock the other needs, and neither can proceed. Most database engines detect this automatically and abort one of the transactions (raising an error) so the other can continue.

## Schema Migrations

### Q: What is a schema migration, and why keep migrations in source control?
A migration is a versioned, ordered, apply-once change to the database structure, stored as code alongside the application. Source control gives review, history, and reproducibility: any environment — laptop, CI, staging, prod — reaches the current schema by replaying the migrations it hasn't applied yet. Manual `ALTER TABLE` leaves no record and lets environments drift apart.

### Q: How does a migration tool know what has already run?
It keeps a history table inside the target database (`flyway_schema_history`, `DATABASECHANGELOG`, `alembic_version`, `schema_migrations`) recording each applied version, its description, a checksum of the file, who applied it, when, and whether it succeeded. On startup it diffs the files on disk against that table and applies only the missing ones, in version order.

### Q: What happens if you edit a migration that has already been applied?
Its checksum stops matching the recorded value and `validate` fails the deploy. That's intentional — databases that ran the old version would silently differ from ones running the edited version. The fix is always a **new** migration, never an edit to history.

### Q: Why do most teams run forward-only migrations instead of rollbacks?
Rolling a schema back is usually more dangerous than rolling forward: undoing "add column" destroys everything written since deploy, `DROP COLUMN` and lossy type changes are irreversible, and down migrations are almost never exercised in production so they rot. Teams instead make each migration backward-compatible — so the *code* can be rolled back without touching the schema — and fix problems with a new forward migration.

### Q: You need to rename a column on a table with live traffic. How?
Expand–contract, across several releases: add the new column nullable → deploy code that writes both and reads the old one → backfill in batches → deploy code that reads the new one → stop writing the old one → after the rollback window, drop it. A plain `RENAME COLUMN` breaks every already-running instance the moment it commits, because old and new code share the database during a rolling deploy.

### Q: How do you add an index to a large table without downtime?
PostgreSQL: `CREATE INDEX CONCURRENTLY`, which doesn't block reads or writes — it can't run inside a transaction, so disable the tool's wrapping transaction, and check for a leftover invalid index if the build fails. MySQL 8: `ALTER TABLE ... ALGORITHM=INPLACE, LOCK=NONE` so the server errors out instead of silently locking; otherwise `gh-ost` or `pt-online-schema-change`.

### Q: Why is adding a `NOT NULL` column with a default risky?
It can force a full table rewrite under an exclusive lock (PostgreSQL ≤ 10, volatile defaults like `now()`, many MySQL cases), and it constrains the table while older code may still insert rows that don't mention the column. Safe sequence: add it nullable → backfill in batches → add the `NOT NULL` constraint (via a `NOT VALID` `CHECK` that you then validate, on PG 12+).

### Q: Which databases support transactional DDL, and why does it matter?
PostgreSQL and SQL Server do; MySQL, MariaDB, and Oracle don't — there, each DDL statement auto-commits, so a migration that fails partway leaves a half-applied schema needing manual repair. That's the main reason to keep one logical change per migration file on MySQL.

### Q: Ten app instances boot at once — what stops them all from migrating?
The tool takes a database lock first (Flyway: a row/advisory lock on its history table; Liquibase: `DATABASECHANGELOGLOCK`). One wins, the rest wait and then find nothing pending. The failure mode is a process killed mid-migration leaving a stale lock. More robust: don't migrate from application startup at all — run migrations as a single dedicated pre-deploy step or job, and gate the rollout on it.

### Q: How would you backfill 50 million rows?
In batches, not one statement: a few thousand rows per transaction, keyed by primary key so it's restartable, filtered so it's idempotent (`WHERE new_col IS NULL`), with a pause between batches and monitoring on replica lag. At that size run it as a background job rather than inside a migration, so a multi-hour data change doesn't block the deploy pipeline.

### Q: Why not use Hibernate's `ddl-auto: update` in production?
It never drops or renames (removed fields leave orphan columns), generates different DDL depending on dialect and entity-scan order, can't express backfills or `CONCURRENTLY`, leaves no history, and can't be reviewed or tested independently. Use `validate` in production so the app refuses to start against an unexpected schema, and let Flyway or Liquibase own the changes.

### Q: How do you introduce migrations to an existing production database?
Baseline it: dump the current schema as `V1__baseline.sql`, then run `flyway baseline -baselineVersion=1` on each existing environment, which writes a history row without executing anything. New/empty databases replay the baseline instead. Everything converges from `V2` onward — then add a CI drift check so nobody resumes manual DDL.

### Q: How do two developers on separate branches avoid version collisions?
Use timestamp prefixes (`20240115093000_add_status.sql`) instead of sequential integers — two timestamps merge cleanly, two `V7__` files conflict. Keep out-of-order execution disabled so a migration that lands with an older timestamp than one already applied fails loudly rather than being silently skipped.

> See the **[Schema Migrations](/SQL/Schema-Migrations)** topic for the expand–contract walkthrough, safe/unsafe DDL tables per engine, batched-backfill code, and CI testing patterns.

## Practical / Scenario Questions

### Q: How would you find duplicate rows in a table?
```sql
SELECT email, COUNT(*) AS occurrences
FROM users
GROUP BY email
HAVING COUNT(*) > 1;
```

### Q: How would you find the second-highest salary in a table?
```sql
SELECT MAX(salary) AS second_highest
FROM employees
WHERE salary < (SELECT MAX(salary) FROM employees);

-- Or, more generally, using a window function:
SELECT salary FROM (
  SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk
  FROM employees
) ranked
WHERE rnk = 2;
```

### Q: How would you write a query to find employees who earn more than their manager?
```sql
SELECT e.name AS employee, e.salary, m.name AS manager, m.salary AS manager_salary
FROM employees e
JOIN employees m ON e.manager_id = m.id
WHERE e.salary > m.salary;
```
