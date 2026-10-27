# SQL: GROUP BY and HAVING

## What is GROUP BY?

`GROUP BY` collapses multiple rows that share the same value in one or more columns into a single summary row. After grouping, aggregate functions (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`) are applied to each group independently instead of to the entire table.

**Conceptual model — three steps happen internally:**

1. Rows are sorted/bucketed by the `GROUP BY` column(s)
2. Each bucket is fed into the aggregate function(s)
3. One output row is produced per bucket

## Sample Schema

```sql
CREATE TABLE users (
  id       INT PRIMARY KEY,
  name     VARCHAR(100),
  country  VARCHAR(50),
  status   VARCHAR(20)   -- 'active', 'inactive', 'banned'
);

CREATE TABLE orders (
  id           INT PRIMARY KEY,
  user_id      INT REFERENCES users(id),
  product_name VARCHAR(100),
  category     VARCHAR(50),
  quantity     INT,
  unit_price   DECIMAL(10,2),
  total_price  DECIMAL(10,2),
  region       VARCHAR(50),
  created_at   DATE
);

CREATE TABLE products (
  id       INT PRIMARY KEY,
  name     VARCHAR(100),
  category VARCHAR(50),
  price    DECIMAL(10,2)
);
```

Sample `orders` data:

| id | user_id | product_name | category    | quantity | total_price | region | created_at |
|----|---------|--------------|-------------|----------|-------------|--------|------------|
| 1  | 1       | Laptop       | Electronics | 1        | 999.99      | North  | 2024-01-10 |
| 2  | 2       | Keyboard     | Electronics | 2        | 99.98       | South  | 2024-01-12 |
| 3  | 1       | Mouse        | Electronics | 1        | 29.99       | North  | 2024-02-01 |
| 4  | 3       | Desk Chair   | Furniture   | 1        | 349.99      | East   | 2024-02-15 |
| 5  | 2       | Monitor      | Electronics | 1        | 299.99      | South  | 2024-03-05 |
| 6  | 4       | Notebook     | Stationery  | 5        | 24.95       | West   | 2024-03-10 |
| 7  | 3       | Bookshelf    | Furniture   | 1        | 189.99      | East   | 2024-03-20 |
| 8  | 1       | Headphones   | Electronics | 1        | 149.99      | North  | 2024-04-01 |

---

## GROUP BY with a Single Column

```sql
-- Total revenue per category
SELECT
  category,
  COUNT(*)                   AS num_orders,
  SUM(total_price)           AS total_revenue
FROM orders
GROUP BY category;
```

Result:

| category    | num_orders | total_revenue |
|-------------|------------|---------------|
| Electronics | 5          | 1579.94       |
| Furniture   | 2          | 539.98        |
| Stationery  | 1          | 24.95         |

```sql
-- Orders per user
SELECT
  user_id,
  COUNT(*)         AS order_count,
  SUM(total_price) AS total_spent
FROM orders
GROUP BY user_id
ORDER BY total_spent DESC;
```

```output
 user_id | order_count | total_spent
---------+-------------+-------------
 1       | 3           | 1179.97
 3       | 2           | 539.98
 2       | 2           | 399.97
 4       | 1           | 24.95
(4 rows)
```

Eight order rows collapse to four user rows — one per distinct `user_id`. User 5 (Eve) is missing entirely: `GROUP BY` can only produce groups from rows that exist, and she has no orders. Getting a zero row for her requires a `LEFT JOIN` from `users`.

---

## GROUP BY with Multiple Columns

When you group by more than one column, each unique *combination* becomes its own group.

```sql
-- Revenue per category per region
SELECT
  region,
  category,
  COUNT(*)         AS orders,
  SUM(total_price) AS revenue
FROM orders
GROUP BY region, category
ORDER BY region, category;
```

Result:

| region | category    | orders | revenue |
|--------|-------------|--------|---------|
| East   | Furniture   | 2      | 539.98  |
| North  | Electronics | 3      | 1179.97 |
| South  | Electronics | 2      | 399.97  |
| West   | Stationery  | 1      | 24.95   |

---

## The GROUP BY Rule

**Every column in your `SELECT` that is NOT inside an aggregate function must appear in `GROUP BY`.**

```sql
-- WRONG: product_name is not aggregated and not in GROUP BY
SELECT category, product_name, COUNT(*)
FROM orders
GROUP BY category;  -- ❌ Error

-- CORRECT: include product_name in GROUP BY
SELECT category, product_name, COUNT(*)
FROM orders
GROUP BY category, product_name;  -- ✅

-- Also correct: wrap product_name in an aggregate
SELECT category, MIN(product_name) AS sample_product, COUNT(*)
FROM orders
GROUP BY category;  -- ✅
```

---

## WHERE with GROUP BY

`WHERE` filters rows **before** grouping. Use it to exclude rows you never want counted.

```sql
-- Revenue per category, but only for 2024-Q1 orders
SELECT
  category,
  SUM(total_price) AS q1_revenue
FROM orders
WHERE created_at BETWEEN '2024-01-01' AND '2024-03-31'
GROUP BY category;
```

The `WHERE` clause reduces the row set first, then `GROUP BY` groups what remains.

**Execution order:** `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY`

---

## HAVING — Filtering Groups

`HAVING` filters **after** grouping. It works on the aggregated results, not on individual rows.

```sql
-- Categories with more than 1 order
SELECT
  category,
  COUNT(*) AS order_count
FROM orders
GROUP BY category
HAVING COUNT(*) > 1;
```

```sql
-- Users who have spent more than $500 total
SELECT
  user_id,
  SUM(total_price) AS total_spent
FROM orders
GROUP BY user_id
HAVING SUM(total_price) > 500
ORDER BY total_spent DESC;
```

```output
 category    | order_count
-------------+-------------
 Electronics | 5
 Furniture   | 2
(2 rows)

 user_id | total_spent
---------+-------------
 1       | 1179.97
 3       | 539.98
(2 rows)
```

Stationery is filtered out of the first result (1 order) and users 2 and 4 out of the second — the rows still exist in the table, but their *groups* did not qualify.

### HAVING vs WHERE — side by side

```sql
-- WHERE: filter rows before grouping (use raw column values)
SELECT category, SUM(total_price)
FROM orders
WHERE total_price > 50           -- individual row filter
GROUP BY category;

-- HAVING: filter groups after aggregation (use aggregate results)
SELECT category, SUM(total_price)
FROM orders
GROUP BY category
HAVING SUM(total_price) > 200;   -- group-level filter
```

#### Output

```output
WHERE total_price > 50 ... GROUP BY category
 category    | sum
-------------+---------
 Electronics | 1549.95
 Furniture   | 539.98
(2 rows)

GROUP BY category HAVING SUM(total_price) > 200
 category    | sum
-------------+---------
 Electronics | 1579.94
 Furniture   | 539.98
(2 rows)
```

Look at the Electronics figures: `1549.95` versus `1579.94`, a difference of `29.99` — exactly the Mouse. `WHERE` removed that row **before** the sum was computed, so it never contributed. `HAVING` let every row into the sum and then judged the finished total.

That is the whole distinction, and it is why swapping one for the other silently changes your numbers rather than raising an error. Stationery disappears from both results, but for different reasons: from the first because its only row was filtered out, from the second because its total of 24.95 failed the group test.

### HAVING with multiple conditions

```sql
-- Categories with at least 2 orders AND more than $100 revenue
SELECT
  category,
  COUNT(*)         AS orders,
  SUM(total_price) AS revenue
FROM orders
GROUP BY category
HAVING COUNT(*) >= 2
   AND SUM(total_price) > 100;
```

```output
 category    | orders | revenue
-------------+--------+---------
 Electronics | 5      | 1579.94
 Furniture   | 2      | 539.98
(2 rows)
```

Stationery fails both conditions (1 order, $24.95). Note you may repeat an aggregate in `HAVING` even when it is not in the `SELECT` list — `HAVING MAX(total_price) > 500` is legal without selecting the max.

---

## GROUP BY with JOINs

Join tables first, then group the combined result.

```sql
-- Total spending per user (showing user name)
SELECT
  u.name,
  COUNT(o.id)        AS order_count,
  SUM(o.total_price) AS total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name
ORDER BY total_spent DESC;
```

```sql
-- Revenue per category per country (combining orders + users)
SELECT
  u.country,
  o.category,
  COUNT(o.id)        AS orders,
  SUM(o.total_price) AS revenue
FROM orders o
JOIN users u ON o.user_id = u.id
GROUP BY u.country, o.category
ORDER BY u.country, revenue DESC;
```

```sql
-- Users with more than 1 order in Electronics
SELECT
  u.name,
  COUNT(o.id) AS electronics_orders
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE o.category = 'Electronics'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 1;
```

---

## ROLLUP — Subtotals and Grand Totals

`ROLLUP` generates subtotals for each grouping level, plus a grand total row. Supported in MySQL, PostgreSQL, SQL Server, and Oracle.

```sql
-- Revenue with subtotals per region and grand total
SELECT
  COALESCE(region,   'ALL REGIONS')   AS region,
  COALESCE(category, 'ALL CATEGORIES') AS category,
  SUM(total_price) AS revenue
FROM orders
GROUP BY ROLLUP(region, category)
ORDER BY region, category;
```

Result (simplified):

| region        | category         | revenue  |
|---------------|------------------|----------|
| East          | Furniture        | 539.98   |
| East          | ALL CATEGORIES   | 539.98   |
| North         | Electronics      | 1179.97  |
| North         | ALL CATEGORIES   | 1179.97  |
| South         | Electronics      | 399.97   |
| South         | ALL CATEGORIES   | 399.97   |
| West          | Stationery       | 24.95    |
| West          | ALL CATEGORIES   | 24.95    |
| ALL REGIONS   | ALL CATEGORIES   | 2144.87  |

---

## Window Functions — Aggregates Without Collapsing Rows

Window functions apply an aggregate (or ranking) calculation to a set of rows related to the current row — but unlike `GROUP BY`, they do **not** collapse rows. Every input row still appears in the output.

### Syntax

```sql
function_name(column) OVER (
  PARTITION BY partition_column   -- optional: like GROUP BY within the window
  ORDER BY order_column           -- required for ranking / running totals
  ROWS/RANGE ...                  -- optional: window frame
)
```

### ROW_NUMBER

Assigns a unique sequential number to each row within a partition.

```sql
-- Number each user's orders chronologically
SELECT
  user_id,
  product_name,
  created_at,
  ROW_NUMBER() OVER (
    PARTITION BY user_id
    ORDER BY created_at
  ) AS order_sequence
FROM orders;
```

| user_id | product_name | created_at | order_sequence |
|---------|--------------|------------|----------------|
| 1       | Laptop       | 2024-01-10 | 1              |
| 1       | Mouse        | 2024-02-01 | 2              |
| 1       | Headphones   | 2024-04-01 | 3              |
| 2       | Keyboard     | 2024-01-12 | 1              |
| 2       | Monitor      | 2024-03-05 | 2              |

```output
 user_id | product_name | created_at | order_sequence
---------+--------------+------------+----------------
 1       | Laptop       | 2024-01-10 | 1
 1       | Mouse        | 2024-02-01 | 2
 1       | Headphones   | 2024-04-01 | 3
 2       | Keyboard     | 2024-01-12 | 1
 2       | Monitor      | 2024-03-05 | 2
 3       | Desk Chair   | 2024-02-15 | 1
 3       | Bookshelf    | 2024-03-20 | 2
 4       | Notebook     | 2024-03-10 | 1
(8 rows)
```

The counter **restarts at 1** for each `user_id` — that is what `PARTITION BY` does. Drop it and you get a single sequence 1–8 across the whole table.

`ROW_NUMBER() = 1` is the standard "most recent / first per group" idiom: wrap this in a subquery and filter on it.

### RANK and DENSE_RANK

Both assign ranks, but handle ties differently.

- `RANK`: tied rows get the same rank; the next rank skips (1, 2, 2, 4)
- `DENSE_RANK`: tied rows get the same rank; the next rank does NOT skip (1, 2, 2, 3)

```sql
-- Rank products by price within each category
SELECT
  category,
  product_name,
  unit_price,
  RANK()       OVER (PARTITION BY category ORDER BY unit_price DESC) AS rank,
  DENSE_RANK() OVER (PARTITION BY category ORDER BY unit_price DESC) AS dense_rank
FROM orders;
```

### Running Total with SUM OVER

```sql
-- Running total of revenue ordered by date
SELECT
  created_at,
  product_name,
  total_price,
  SUM(total_price) OVER (
    ORDER BY created_at
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS running_revenue
FROM orders
ORDER BY created_at;
```

```output
 created_at | product_name | total_price | running_revenue
------------+--------------+-------------+-----------------
 2024-01-10 | Laptop       | 999.99      | 999.99
 2024-01-12 | Keyboard     | 99.98       | 1099.97
 2024-02-01 | Mouse        | 29.99       | 1129.96
 2024-02-15 | Desk Chair   | 349.99      | 1479.95
 2024-03-05 | Monitor      | 299.99      | 1779.94
 2024-03-10 | Notebook     | 24.95       | 1804.89
 2024-03-20 | Bookshelf    | 189.99      | 1994.88
 2024-04-01 | Headphones   | 149.99      | 2144.87
(8 rows)
```

This is what separates a window function from `GROUP BY`: **all eight rows survive**. `SUM(total_price) GROUP BY` would have returned one row containing `2144.87`; `SUM(...) OVER (...)` keeps every row and adds the cumulative total alongside it.

Each `running_revenue` is the sum of `total_price` from the first row down to the current one — the final value equals the grand total.

### Running total per user (partitioned)

```sql
SELECT
  user_id,
  created_at,
  product_name,
  total_price,
  SUM(total_price) OVER (
    PARTITION BY user_id
    ORDER BY created_at
  ) AS cumulative_spend
FROM orders
ORDER BY user_id, created_at;
```

---

## LAG and LEAD — Row-to-Row Comparisons

`LAG` looks at the previous row; `LEAD` looks at the next row. Both accept an optional offset and default value.

```sql
LAG(column, offset, default)  OVER (PARTITION BY ... ORDER BY ...)
LEAD(column, offset, default) OVER (PARTITION BY ... ORDER BY ...)
```

### Month-over-month revenue change

```sql
WITH monthly AS (
  SELECT
    DATE_TRUNC('month', created_at) AS month,
    SUM(total_price)                AS revenue
  FROM orders
  GROUP BY DATE_TRUNC('month', created_at)
)
SELECT
  month,
  revenue,
  LAG(revenue) OVER (ORDER BY month)                           AS prev_month_revenue,
  revenue - LAG(revenue) OVER (ORDER BY month)                 AS change,
  ROUND(
    100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
    / NULLIF(LAG(revenue) OVER (ORDER BY month), 0),
    1
  )                                                            AS pct_change
FROM monthly
ORDER BY month;
```

### Each user's time between orders

```sql
SELECT
  user_id,
  created_at,
  LAG(created_at) OVER (PARTITION BY user_id ORDER BY created_at) AS prev_order_date,
  created_at - LAG(created_at) OVER (
    PARTITION BY user_id ORDER BY created_at
  )                                                               AS days_since_last_order
FROM orders
ORDER BY user_id, created_at;
```

---

## Real-World Examples

### Sales by region with percentage of total

```sql
SELECT
  region,
  SUM(total_price)                              AS region_revenue,
  ROUND(
    100.0 * SUM(total_price)
    / SUM(SUM(total_price)) OVER (),
    1
  )                                             AS pct_of_total
FROM orders
GROUP BY region
ORDER BY region_revenue DESC;
```

### Top N orders per category (Top 2 here)

```sql
WITH ranked AS (
  SELECT
    category,
    product_name,
    total_price,
    ROW_NUMBER() OVER (
      PARTITION BY category
      ORDER BY total_price DESC
    ) AS rn
  FROM orders
)
SELECT category, product_name, total_price
FROM ranked
WHERE rn <= 2
ORDER BY category, total_price DESC;
```

### Category revenue with running total

```sql
SELECT
  category,
  SUM(total_price)                                    AS revenue,
  SUM(SUM(total_price)) OVER (ORDER BY SUM(total_price) DESC) AS running_total
FROM orders
GROUP BY category
ORDER BY revenue DESC;
```

### Active customers with multiple orders (HAVING + JOIN)

```sql
SELECT
  u.name,
  u.country,
  COUNT(o.id)        AS orders,
  SUM(o.total_price) AS lifetime_value
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active'
GROUP BY u.id, u.name, u.country
HAVING COUNT(o.id) >= 2
ORDER BY lifetime_value DESC;
```

---

## Performance Tips

### 1. Filter early with WHERE, not HAVING

```sql
-- Slow: scans all rows then groups, then filters
SELECT category, SUM(total_price)
FROM orders
GROUP BY category
HAVING category = 'Electronics';   -- ❌ wastes work

-- Fast: filter before grouping
SELECT category, SUM(total_price)
FROM orders
WHERE category = 'Electronics'     -- ✅ fewer rows to group
GROUP BY category;
```

### 2. Index GROUP BY columns

If you frequently group by `category` or `region`, add an index:

```sql
CREATE INDEX idx_orders_category ON orders(category);
CREATE INDEX idx_orders_region   ON orders(region);
```

Composite indexes help when grouping by multiple columns together:

```sql
CREATE INDEX idx_orders_region_category ON orders(region, category);
```

### 3. Use covering indexes for common aggregation queries

A covering index includes both the GROUP BY column and the aggregated column so the database never touches the main table:

```sql
-- This query can be served entirely from the index below
SELECT category, SUM(total_price)
FROM orders
GROUP BY category;

CREATE INDEX idx_orders_cat_price ON orders(category, total_price);
```

### 4. Avoid GROUP BY on high-cardinality columns unless necessary

Grouping by a column with millions of distinct values (like `order_id`) produces one output row per input row — same cost as a full scan with no benefit from grouping.

---

## Quick Reference

| Clause   | Applied after... | Sees aggregate results? | Use for...                          |
|----------|------------------|------------------------|-------------------------------------|
| WHERE    | FROM / JOIN      | No                     | Filtering individual rows           |
| GROUP BY | WHERE            | No                     | Defining groups                     |
| HAVING   | GROUP BY         | Yes                    | Filtering groups by aggregate value |
| ORDER BY | HAVING / SELECT  | Yes                    | Sorting the final output            |

## Next Steps

Learn about:
- [Subqueries](/SQL/Subqueries) and CTEs (`WITH` clauses) for multi-step aggregations
- `FILTER` clause (PostgreSQL) as a cleaner alternative to `CASE` in aggregates
- `GROUPING SETS` for flexible multi-dimensional summaries
- Query execution plans (`EXPLAIN`) to understand how your aggregations run
