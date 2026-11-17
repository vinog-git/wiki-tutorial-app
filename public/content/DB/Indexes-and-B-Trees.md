# DB: Indexes and B-Trees

An index is a separate, sorted structure that maps column values to the rows holding them. Without one, the database reads every row, which is a *sequential scan* or *full table scan*. With one, it can go straight to the matching rows.

## Why B-trees

Most relational databases use a **B-tree**, strictly a B+ tree: row pointers live in the leaf nodes, and the leaves are linked for range scans.

- **Balanced**: every lookup walks the same number of levels.
- **Shallow**: each node holds hundreds of keys, so a table with millions of rows is usually 3 or 4 levels deep. A lookup takes a handful of page reads, not millions.
- **Sorted**: range queries (`BETWEEN`, `>`, `ORDER BY`) read neighbouring leaves.

## Creating and checking an index

```sql
CREATE INDEX idx_orders_customer ON orders (customer_id);

EXPLAIN SELECT * FROM orders WHERE customer_id = 7;
```

Checked in SQLite, `EXPLAIN QUERY PLAN` reports:

```output
SEARCH orders USING INDEX idx_orders_customer (customer_id=?)
```

PostgreSQL's `EXPLAIN` prints a different format, but the question is the same: is it an index scan or a sequential scan? Without an index on `status`, this query reads the whole table:

```sql
SELECT * FROM orders WHERE status = 'open';
```

```output
SCAN orders
```

## Composite indexes and column order

```sql
CREATE INDEX idx_orders_cust_status ON orders (customer_id, status);
```

A B-tree sorts by the first column, then by the second within each value of the first. The index serves queries that filter on a **leftmost prefix** of its columns:

| Query filter | Uses `(customer_id, status)`? |
|---|---|
| `WHERE customer_id = 7` | Yes, on the first column |
| `WHERE customer_id = 7 AND status = 'open'` | Yes, on both columns |
| `WHERE status = 'open'` | Not efficiently; the first column is missing |

Checked in SQLite, the two-column query reports `SEARCH orders USING INDEX idx_orders_cust_status (customer_id=? AND status=?)`.

Put the columns used for equality first and any range or sort column last. With this index in place, a separate index on `customer_id` alone is usually redundant.

## Covering indexes

If an index contains every column a query needs, the database can answer from the index without reading the table. PostgreSQL calls this an index-only scan. For example, an index on `(customer_id, total)` answers `SELECT total FROM orders WHERE customer_id = 7` without touching the table. This needs an up-to-date visibility map, so run `VACUUM` after bulk loads.

## When an index is not used

- The query returns a large share of the table. A sequential scan is cheaper, and the planner is right to choose it.
- A function wraps the column, as in `WHERE lower(email) = ?`. Index `lower(email)` instead.
- A leading wildcard, as in `LIKE '%smith'`. A B-tree cannot narrow that search. `LIKE 'smith%'` can use a B-tree, but in a non-C collation only if the index uses `text_pattern_ops` (see below).
- A low-cardinality column alone, such as a boolean or a three-value status. It rarely helps by itself.
- Stale statistics. Run `ANALYZE` in PostgreSQL so the planner knows the data's shape.

## Costs

- Every `INSERT`, every `DELETE` and every `UPDATE` of an indexed column must update each index. Writes slow down as indexes are added.
- Each index uses disk and memory.
- An unused index is pure cost. Check usage statistics before adding more.

## How to implement it

1. Start from the slow queries. Find the columns in their `WHERE`, `JOIN` and `ORDER BY` clauses. The `pg_stat_statements` extension lists the slowest statements.
2. Create the index with `CREATE INDEX CONCURRENTLY` on a live table, so writes are not blocked. It cannot run inside a transaction block, so run it outside your migration's transaction.
3. Check the plan with `EXPLAIN (ANALYZE, BUFFERS)` on realistic data, not a small test table.
4. Run `VACUUM` after bulk loads. Index-only scans need an up-to-date visibility map.
5. Review unused indexes now and then, and drop them.

### Create the indexes

```sql
CREATE INDEX CONCURRENTLY idx_orders_cust_status ON orders (customer_id, status);
CREATE INDEX CONCURRENTLY idx_orders_open ON orders (customer_id) WHERE status = 'open';   -- partial
CREATE INDEX CONCURRENTLY idx_orders_cust_cover ON orders (customer_id) INCLUDE (total);   -- covering
```

Checked on 300,000 rows in PostgreSQL 16:

- `WHERE customer_id = 7` uses `idx_orders_cust_status`, because `customer_id` is its leading column.
- `WHERE customer_id = 7 AND status = 'open'` uses the partial index. It is smaller and matches this query exactly.
- `WHERE status = 'open'` alone does not use the composite index. Without the partial index, the planner does a sequential scan.
- Before `VACUUM`, `SELECT total FROM orders WHERE customer_id = 7` used the composite index. After `VACUUM`, it used an index-only scan on `idx_orders_cust_cover`.

### Prefix LIKE needs a special index in non-C collations

```sql
-- database collation en_US.utf8: a plain index cannot serve LIKE 'user1234%'
CREATE INDEX idx_people_email_pattern ON people (email text_pattern_ops);
```

Checked: with the plain index, `LIKE 'user1234%'` read the whole index and filtered it. With `text_pattern_ops`, the planner used an index range.

### Find unused indexes

```sql
SELECT s.relname AS table_name, s.indexrelname AS index_name, s.idx_scan
FROM pg_stat_user_indexes s
JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.idx_scan = 0 AND NOT i.indisunique AND NOT i.indisprimary
ORDER BY 1, 2;
```

The scan counters reset with the statistics, so look at a long period before dropping anything. Unique and primary-key indexes are excluded, because they enforce constraints even when no query uses them.

### Declare indexes in migrations, not only in the ORM

```java
@Entity
@Table(name = "orders", indexes = {
    @Index(name = "idx_orders_cust_status", columnList = "customer_id, status")
})
public class Order { /* ... */ }
```

Keep `ddl-auto` off in production, and put the real index definitions in versioned migrations, where `CONCURRENTLY` and partial indexes can be written by hand. A migration that uses `CONCURRENTLY` must run outside the migration's transaction, so check how your migration tool handles that.

## Common mistakes

- Indexing every column "just in case".
- Getting the column order wrong in a composite index.
- Assuming an index is used without checking `EXPLAIN`.
- Hiding the column from the index, as in `WHERE CAST(id AS TEXT) = '7'`.

## Key takeaways

- A B-tree index gives logarithmic lookups and sorted range access.
- Column order in a composite index decides which queries it serves.
- Always confirm the plan with `EXPLAIN`.
- Each index costs writes and storage.

Related: [SQL: Joins](/SQL/Joins), [SQL: Aggregate Functions](/SQL/Aggregate-Functions), [ACID Transactions](/DB/ACID-Transactions), [Multi-Tenant Database Design](/DB/Multi-Tenant-Database-Design).
