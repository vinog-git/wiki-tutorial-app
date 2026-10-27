# SQL: Subqueries

A **subquery** is a `SELECT` nested inside another statement. The outer query uses its result as a value, a list, a table, or a yes/no test. Subqueries let you ask a question in steps ("the average order total, then the orders above it") without temporary tables. They are also the source of several common bugs, so this page covers the forms, when each one is right, and the traps.

## Sample data

Every example on this page uses these two tables.

```sql
CREATE TABLE customers (
    id    INT PRIMARY KEY,
    name  VARCHAR(50) NOT NULL,
    city  VARCHAR(50)
);

CREATE TABLE orders (
    id           INT PRIMARY KEY,
    customer_id  INT REFERENCES customers(id),
    total        NUMERIC(10,2) NOT NULL,
    status       VARCHAR(20) NOT NULL,
    created_at   DATE NOT NULL
);

INSERT INTO customers VALUES
    (1, 'Alice', 'London'),
    (2, 'Bob',   'Paris'),
    (3, 'Chen',  'London'),
    (4, 'Dana',  'Berlin');

INSERT INTO orders VALUES
    (1, 1, 120.00, 'DELIVERED', '2026-01-05'),
    (2, 1,  45.50, 'DELIVERED', '2026-02-11'),
    (3, 2, 300.00, 'CANCELLED', '2026-02-20'),
    (4, 3,  80.00, 'DELIVERED', '2026-03-02'),
    (5, 3,  15.00, 'PENDING',   '2026-03-09');
```

Dana (id 4) has no orders. Bob's only order was cancelled.

## Where a subquery can appear

| Location | Returns | Example use |
|---|---|---|
| `SELECT` list | One value per row | A count or total next to each customer |
| `FROM` | A table | A pre-aggregated result to join against |
| `WHERE` / `HAVING` | A value, a list, or a yes/no | Filter against an average, or a set of IDs |
| `JOIN ... ON` | A table | Joining to an aggregated summary |

## Scalar subquery: returns one value

A scalar subquery returns exactly one row with one column. It can stand anywhere a single value can.

```sql
-- Order count beside each customer
SELECT c.name,
       (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
FROM customers c
ORDER BY c.id;
```

```output
 name  | order_count
-------+-------------
 Alice |           2
 Bob   |           1
 Chen  |           2
 Dana  |           0
```

Note Dana shows `0`. A `JOIN` would have dropped her; the subquery keeps every customer.

Compare a value with a single aggregate:

```sql
-- Orders above the overall average order total (average is 112.10)
SELECT id, total
FROM orders
WHERE total > (SELECT AVG(total) FROM orders);
```

```output
 id | total
----+--------
  1 | 120.00
  3 | 300.00
```

If the subquery returns more than one row where a single value is expected, the database raises an error:

```sql
SELECT name FROM customers
WHERE id = (SELECT customer_id FROM orders);
-- ERROR:  more than one row returned by a subquery used as an expression
```

## Row-list subquery: `IN` and `NOT IN`

`IN` tests whether a value appears in the list the subquery returns.

```sql
-- Customers who have at least one delivered order
SELECT name
FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE status = 'DELIVERED')
ORDER BY name;
```

```output
 name
-------
 Alice
 Chen
```

### The `NOT IN` trap with NULL

`NOT IN` is dangerous when the subquery can return `NULL`. Any comparison with `NULL` is unknown, so the whole `NOT IN` test becomes unknown and no rows are returned.

```sql
-- Intended: customers with no orders. Returns Dana.
SELECT name FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);
```

```output
 name
------
 Dana
```

Now suppose a row arrives with `customer_id` NULL (an order with no customer):

```sql
INSERT INTO orders VALUES (6, NULL, 9.99, 'PENDING', '2026-03-10');

SELECT name FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);
```

```output
 name
------
(0 rows)
```

Dana disappeared, and nothing else replaced her. Use `NOT EXISTS` instead, which is not affected by NULL:

```sql
SELECT c.name
FROM customers c
WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
```

```output
 name
------
 Dana
```

Remove the test row before continuing: `DELETE FROM orders WHERE id = 6;`

## `EXISTS` and `NOT EXISTS`: yes or no

`EXISTS` is true when the subquery returns at least one row. The subquery can select anything, so `SELECT 1` is conventional. The database stops at the first match, which makes `EXISTS` efficient for "is there any ...?" questions.

```sql
-- Customers with at least one cancelled order
SELECT c.name
FROM customers c
WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.customer_id = c.id AND o.status = 'CANCELLED'
);
```

```output
 name
------
 Bob
```

| Test | Equivalent pattern | NULL-safe? |
|---|---|---|
| `IN (SELECT ...)` | Semi-join | Yes (NULLs in the list are ignored when matching) |
| `NOT IN (SELECT ...)` | Anti-join | **No** if the subquery can return NULL |
| `EXISTS (SELECT ...)` | Semi-join | Yes |
| `NOT EXISTS (SELECT ...)` | Anti-join | Yes |

Prefer `EXISTS` and `NOT EXISTS` in new code.

## Correlated subqueries

A **correlated** subquery refers to a column from the outer query, so it is evaluated once per outer row. This is the standard way to compare a row with its own group.

```sql
-- Orders larger than that customer's own average order
SELECT o.id, o.customer_id, o.total
FROM orders o
WHERE o.total > (
    SELECT AVG(i.total)
    FROM orders i
    WHERE i.customer_id = o.customer_id
)
ORDER BY o.id;
```

```output
 id | customer_id | total
----+-------------+--------
  1 |           1 | 120.00
  4 |           3 |  80.00
```

Customer averages are Alice 82.75, Bob 300.00, Chen 47.50. Order 3 (300.00) equals Bob's average, so it is not strictly greater and is excluded.

Correlated subqueries can run once per row, which is slow on large tables. Check the plan with `EXPLAIN`. Usually an index on `orders(customer_id)` makes the inner lookup fast, and a window function (next section) can often replace the pattern entirely.

### The same question with a window function

```sql
SELECT id, customer_id, total
FROM (
    SELECT o.id, o.customer_id, o.total,
           AVG(o.total) OVER (PARTITION BY o.customer_id) AS customer_avg
    FROM orders o
) x
WHERE total > customer_avg
ORDER BY id;
```

The result is the same. The window version reads the table once.

## Derived tables: a subquery in `FROM`

A subquery in `FROM` must have an alias. It behaves like a temporary table for the rest of the query.

```sql
-- Total spent per customer, joined back to names
SELECT c.name, t.order_total
FROM customers c
JOIN (
    SELECT customer_id, SUM(total) AS order_total
    FROM orders
    GROUP BY customer_id
) t ON t.customer_id = c.id
ORDER BY c.name;
```

```output
 name  | order_total
-------+-------------
 Alice |      165.50
 Bob   |      300.00
 Chen  |       95.00
```

Filter on an aggregate by putting the aggregate in a derived table, since `WHERE` cannot see aggregates:

```sql
-- Customers whose total spend is above the average spend per customer
SELECT customer_id, spent
FROM (
    SELECT customer_id, SUM(total) AS spent
    FROM orders
    GROUP BY customer_id
) totals
WHERE spent > (SELECT AVG(spent) FROM (SELECT SUM(total) AS spent FROM orders GROUP BY customer_id) x);
```

```output
 customer_id |  spent
-------------+--------
           2 | 300.00
```

The average of the three customer totals is 186.83, so only Bob (300.00) is above it.

## `ANY` and `ALL`

`ANY` is true if the comparison holds for at least one returned value. `ALL` requires it to hold for every returned value.

```sql
-- Orders larger than every pending order
SELECT id, total
FROM orders
WHERE total > ALL (SELECT total FROM orders WHERE status = 'PENDING')
ORDER BY id;
```

```output
 id | total
----+--------
  1 | 120.00
  2 |  45.50
  3 | 300.00
  4 |  80.00
```

The only pending order is 15.00, so every order above 15.00 qualifies. If the subquery returns no rows, `ALL` is true and `ANY` is false. Keep that in mind when the subquery can be empty.

## Subqueries in `HAVING`

```sql
-- Customers whose total spend is above the average customer spend
SELECT customer_id, SUM(total) AS spent
FROM orders
GROUP BY customer_id
HAVING SUM(total) > (
    SELECT AVG(s.spent)
    FROM (SELECT SUM(total) AS spent FROM orders GROUP BY customer_id) s
);
```

```output
 customer_id |  spent
-------------+--------
           2 | 300.00
```

## Common Table Expressions (`WITH`)

A CTE names a subquery at the top of the statement. It makes long queries readable, and it can be referenced more than once.

```sql
WITH customer_totals AS (
    SELECT customer_id, SUM(total) AS spent
    FROM orders
    GROUP BY customer_id
)
SELECT c.name, ct.spent
FROM customer_totals ct
JOIN customers c ON c.id = ct.customer_id
ORDER BY ct.spent DESC;
```

```output
 name  |  spent
-------+--------
 Bob   | 300.00
 Alice | 165.50
 Chen  |  95.00
```

A CTE is a readability tool. In PostgreSQL 12 and later, a CTE that is referenced once is inlined by the optimiser, so it does not force a materialisation. Check `EXPLAIN` when performance matters.

### Recursive CTEs: hierarchies

A recursive CTE repeats a step until no new rows appear. It is the standard way to walk a tree such as an org chart.

```sql
CREATE TABLE employees (id INT PRIMARY KEY, name VARCHAR(50), manager_id INT);
INSERT INTO employees VALUES (1, 'Ava', NULL), (2, 'Ben', 1), (3, 'Cy', 2);

WITH RECURSIVE chain AS (
    SELECT id, name, 0 AS depth
    FROM employees
    WHERE manager_id IS NULL                      -- anchor: the top of the tree
    UNION ALL
    SELECT e.id, e.name, c.depth + 1
    FROM employees e
    JOIN chain c ON e.manager_id = c.id           -- step: children of the previous rows
)
SELECT id, name, depth FROM chain ORDER BY depth;
```

```output
 id | name | depth
----+------+-------
  1 | Ava  |     0
  2 | Ben  |     1
  3 | Cy   |     2
```

Always include a termination condition. A cycle in the data (an employee who manages their own manager) makes a recursive CTE run forever. PostgreSQL's `CYCLE` clause and a depth limit (`WHERE depth < 20`) guard against that.

## Subquery or JOIN?

Often they are interchangeable, and the optimiser rewrites one into the other. Choose for clarity first, then check the plan.

| Question | Usually write |
|---|---|
| Do I need columns from the other table in the output? | `JOIN` |
| Am I only testing whether a match exists? | `EXISTS` |
| Am I checking that no match exists? | `NOT EXISTS` (not `NOT IN`) |
| Do I need a value computed from a group? | Scalar subquery, derived table, or window function |
| Do I need the same intermediate result twice? | CTE |

A `JOIN` can duplicate rows when the other side has several matches. `EXISTS` cannot, because it only asks yes or no. That is a common reason to prefer it when you do not need the other table's columns.

## Performance checklist

- Index the columns in correlated conditions: `orders(customer_id)`.
- Prefer `EXISTS` over `IN` for large subqueries, and always `NOT EXISTS` over `NOT IN` on nullable columns.
- Use `EXPLAIN ANALYZE` to see whether a correlated subquery runs once per row.
- Replace correlated subqueries with window functions or a derived table when the plan shows repeated work.

## Common mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| `NOT IN` against a nullable column | Returns no rows, silently | `NOT EXISTS` |
| Scalar subquery returns several rows | "more than one row returned by a subquery used as an expression" | Add a `WHERE` that makes it unique, use `LIMIT 1` with an `ORDER BY`, or use `IN` |
| Derived table with no alias | "subquery in FROM must have an alias" | Add an alias |
| Aggregate in `WHERE` | "aggregate functions are not allowed in WHERE" | Move the test to `HAVING` or a derived table |
| Correlated subquery on a big table with no index | Query time grows with the square of the table size | Index the join column |
| Subquery uses the wrong alias scope | Inner column silently refers to the wrong table | Qualify every column with a table alias |

## Quick reference

```sql
-- Scalar
SELECT ..., (SELECT COUNT(*) FROM t WHERE t.k = o.k) FROM o;
WHERE x > (SELECT AVG(x) FROM t);

-- Row list
WHERE k IN (SELECT k FROM t WHERE ...);

-- Existence
WHERE EXISTS (SELECT 1 FROM t WHERE t.k = o.k);
WHERE NOT EXISTS (SELECT 1 FROM t WHERE t.k = o.k);

-- Correlated
WHERE x > (SELECT AVG(i.x) FROM t i WHERE i.k = o.k);

-- Derived table
FROM (SELECT k, SUM(x) AS s FROM t GROUP BY k) d

-- CTE
WITH d AS (SELECT ...) SELECT ... FROM d;
```

## Interview questions

**Q: What is the difference between a correlated and a non-correlated subquery?**
A non-correlated subquery does not reference the outer query, so it runs once and its result is reused. A correlated subquery references an outer column and runs once per outer row, which can be slow without an index.

**Q: Why is `NOT IN` dangerous, and what should you use instead?**
If the subquery returns any `NULL`, `x NOT IN (...)` evaluates to unknown for every row, so the query returns nothing. Use `NOT EXISTS`, which handles NULL correctly.

**Q: When would you use `EXISTS` instead of a `JOIN`?**
When you only need to know whether a match exists and do not need the other table's columns. `EXISTS` stops at the first match and cannot multiply rows the way a join can.

**Q: What is a CTE, and how does it differ from a derived table?**
Both name an intermediate result. A CTE is declared at the top with `WITH`, can be referenced several times, and can be recursive. A derived table is written inline in `FROM` and used once.

**Q: How do you find the second-highest salary with a subquery?**
`SELECT MAX(salary) FROM employees WHERE salary < (SELECT MAX(salary) FROM employees);`. Handle ties by using `DISTINCT` on the salary or by using `DENSE_RANK()`.

**Q: A query with a correlated subquery is slow on 10 million rows. What do you do?**
Check `EXPLAIN ANALYZE`, add an index on the correlated column, and consider rewriting with a window function or a derived table that aggregates once.

**Q: What does `ANY` return when the subquery is empty?**
`FALSE`. `ALL` returns `TRUE` for an empty subquery.
