# SQL: Aggregate Functions

## What are Aggregate Functions?

Aggregate functions compute a single result from a set of rows. Instead of returning one row per input row, they collapse many rows into one summary value. They are indispensable for reporting, analytics, and any time you need to answer "how many?", "how much?", or "what's the average?".

## Sample Schema

All examples in this page use the following tables:

```sql
-- Users table
CREATE TABLE users (
  id       INT PRIMARY KEY,
  name     VARCHAR(100),
  email    VARCHAR(150),
  country  VARCHAR(50),
  age      INT,
  status   VARCHAR(20)  -- 'active', 'inactive', 'banned'
);

-- Orders table
CREATE TABLE orders (
  id           INT PRIMARY KEY,
  user_id      INT REFERENCES users(id),
  product_name VARCHAR(100),
  category     VARCHAR(50),
  quantity     INT,
  unit_price   DECIMAL(10,2),
  total_price  DECIMAL(10,2),
  created_at   DATE
);
```

Sample data in `orders`:

| id | user_id | product_name | category    | quantity | unit_price | total_price | created_at |
|----|---------|--------------|-------------|----------|------------|-------------|------------|
| 1  | 1       | Laptop       | Electronics | 1        | 999.99     | 999.99      | 2024-01-10 |
| 2  | 2       | Keyboard     | Electronics | 2        | 49.99      | 99.98       | 2024-01-12 |
| 3  | 1       | Mouse        | Electronics | 1        | 29.99      | 29.99       | 2024-02-01 |
| 4  | 3       | Desk Chair   | Furniture   | 1        | 349.99     | 349.99      | 2024-02-15 |
| 5  | 2       | Monitor      | Electronics | 1        | 299.99     | 299.99      | 2024-03-05 |
| 6  | 4       | Notebook     | Stationery  | 5        | 4.99       | 24.95       | 2024-03-10 |

---

## COUNT

`COUNT` is the most commonly used aggregate. It has three important forms.

### COUNT(*) — Count all rows

Counts every row regardless of NULL values.

```sql
-- How many orders are in the table?
SELECT COUNT(*) AS total_orders
FROM orders;
```

```output
 total_orders
--------------
 6
(1 row)
```

### COUNT(column) — Count non-NULL values

Counts rows where the specified column is NOT NULL.

```sql
-- How many orders have a recorded category?
SELECT COUNT(category) AS orders_with_category
FROM orders;
```

#### Output

With the six sample rows, all of which have a category, the two agree:

```output
 orders_with_category
----------------------
 6
(1 row)
```

Add two rows where `total_price` is NULL and one of them also has a NULL `category`, and they diverge:

```output
 rows_all | non_null_price | with_category
----------+----------------+---------------
 8        | 6              | 7
(1 row)
```

If some rows had a NULL `category`, `COUNT(category)` would be less than `COUNT(*)`. That gap is the useful signal — `COUNT(*) - COUNT(col)` is exactly the number of NULLs in that column.

### COUNT(DISTINCT column) — Count unique values

```sql
-- How many distinct products have been ordered?
SELECT COUNT(DISTINCT product_name) AS unique_products
FROM orders;

-- How many distinct users have placed at least one order?
SELECT COUNT(DISTINCT user_id) AS customers_who_ordered
FROM orders;
```

```output
 unique_products
-----------------
 6
(1 row)

 customers_who_ordered
-----------------------
 4
(1 row)
```

Six orders but only **four** customers — Alice placed orders 1 and 3, Bob placed 2 and 5. `COUNT(DISTINCT user_id)` is how you answer "how many people bought something" as opposed to "how many purchases were made".

### Practical COUNT example

```sql
-- Order stats across the whole catalog
SELECT
  COUNT(*)                      AS total_orders,
  COUNT(DISTINCT user_id)       AS unique_customers,
  COUNT(DISTINCT product_name)  AS unique_products,
  COUNT(DISTINCT category)      AS unique_categories
FROM orders;
```

```output
 total_orders | unique_customers | unique_products | unique_categories
--------------+------------------+-----------------+-------------------
 6            | 4                | 6               | 3
(1 row)
```

All four counts in **one pass** over the table. Running them as four separate queries would scan the data four times for the same answer.

---

## SUM

`SUM` adds up all values in a numeric column.

### Basic SUM

```sql
-- Total revenue across all orders
SELECT SUM(total_price) AS total_revenue
FROM orders;
-- Result: 1804.89
```

### SUM and NULL values

`SUM` ignores NULL values automatically. If a row has NULL in the column, it is skipped — not treated as zero.

```sql
-- If some orders have NULL total_price, SUM still works correctly
SELECT SUM(total_price) AS revenue
FROM orders;
-- NULLs are silently excluded from the sum
```

### Conditional SUM with CASE

Use `CASE` inside `SUM` to sum only rows that meet a condition — without a `WHERE` clause. This lets you compute multiple conditional sums in one query.

```sql
-- Revenue split by category in a single query
SELECT
  SUM(CASE WHEN category = 'Electronics' THEN total_price ELSE 0 END) AS electronics_revenue,
  SUM(CASE WHEN category = 'Furniture'   THEN total_price ELSE 0 END) AS furniture_revenue,
  SUM(CASE WHEN category = 'Stationery'  THEN total_price ELSE 0 END) AS stationery_revenue,
  SUM(total_price)                                                      AS grand_total
FROM orders;
```

---

## AVG

`AVG` calculates the arithmetic mean of a numeric column.

### Basic AVG

```sql
-- Average order value
SELECT AVG(total_price) AS avg_order_value
FROM orders;
```

### AVG and NULL

Like `SUM`, `AVG` ignores NULL rows entirely. It does NOT treat NULL as zero.

```sql
-- Suppose 2 out of 6 orders have NULL total_price
-- AVG divides the sum by 4, not 6
SELECT AVG(total_price) AS avg_excluding_nulls
FROM orders;
```

If you want NULLs treated as zero:

```sql
SELECT AVG(COALESCE(total_price, 0)) AS avg_including_nulls_as_zero
FROM orders;
```

#### Output

With the two NULL-priced rows added, the difference is stark:

```output
 avg_excluding_nulls | avg_including_nulls_as_zero
---------------------+-----------------------------
 300.815             | 225.61125
(1 row)
```

Same rows, same column, a 25% difference in the answer. `AVG` divided by 6 (the non-NULL rows); `AVG(COALESCE(...))` divided by 8.

Neither is "right" — it depends on what a NULL price *means*. If it means "not yet priced", excluding it is correct. If it means "free", zero is correct. The bug is not choosing.

### Rounding AVG

```sql
SELECT ROUND(AVG(total_price), 2) AS avg_order_value
FROM orders;
```

```output
 avg_order_value
-----------------
 300.81
(1 row)
```

The unrounded value is `300.815`, so you might expect `300.82`. It depends on the column type, and this is a genuine cross-database difference:

- On a **`DECIMAL`/`NUMERIC`** column, `ROUND` does exact decimal arithmetic and gives `300.82`.
- On a **`FLOAT`/`REAL`/`DOUBLE`** column, `300.815` is not exactly representable in binary — it is stored as `300.8149999…` — so it rounds **down** to `300.81`.

The schema at the top of this page declares `DECIMAL(10,2)`, which is the correct choice for money and gives `300.82`. The `300.81` above is what you get from the same query when the column is a float. Never use a floating-point type for currency.

---

## MIN and MAX

`MIN` returns the smallest value; `MAX` returns the largest. Both work on numbers, strings (alphabetical), and dates.

### On numbers

```sql
SELECT
  MIN(total_price) AS cheapest_order,
  MAX(total_price) AS most_expensive_order
FROM orders;
```

### On strings (alphabetical order)

```sql
SELECT
  MIN(product_name) AS first_product_alpha,
  MAX(product_name) AS last_product_alpha
FROM orders;
```

### On dates

```sql
SELECT
  MIN(created_at) AS first_order_date,
  MAX(created_at) AS most_recent_order_date
FROM orders;
```

### Finding the range

```sql
SELECT
  MAX(total_price) - MIN(total_price) AS price_range
FROM orders;
```

---

## Combining Aggregates in One Query

You can mix and match all aggregate functions in a single `SELECT`.

```sql
-- Complete order summary
SELECT
  COUNT(*)                        AS total_orders,
  COUNT(DISTINCT user_id)         AS unique_customers,
  SUM(total_price)                AS total_revenue,
  ROUND(AVG(total_price), 2)      AS avg_order_value,
  MIN(total_price)                AS smallest_order,
  MAX(total_price)                AS largest_order,
  MIN(created_at)                 AS first_order_on,
  MAX(created_at)                 AS latest_order_on
FROM orders;
```

```output
 total_orders | unique_customers | total_revenue | avg_order_value | smallest_order | largest_order | first_order_on | latest_order_on
--------------+------------------+---------------+-----------------+----------------+---------------+----------------+-----------------
 6            | 4                | 1804.89       | 300.82          | 24.95          | 999.99        | 2024-01-10     | 2024-03-10
(1 row)
```

Eight aggregates, one row, one scan. `MIN`/`MAX` on `created_at` work because dates order naturally — they give you the reporting period's bounds without a separate query.

---

## Using Aliases

Always alias your aggregates. Without aliases, column names like `COUNT(*)` are ugly and hard to use in application code.

```sql
-- Bad: unnamed columns
SELECT COUNT(*), SUM(total_price) FROM orders;

-- Good: clear aliases
SELECT
  COUNT(*)         AS order_count,
  SUM(total_price) AS total_revenue
FROM orders;
```

---

## Aggregates with WHERE

`WHERE` filters rows **before** the aggregate function runs. Use `WHERE` to restrict which rows are included in the calculation.

```sql
-- Revenue from Electronics orders only
SELECT
  COUNT(*)         AS electronics_orders,
  SUM(total_price) AS electronics_revenue
FROM orders
WHERE category = 'Electronics';
```

```sql
-- Stats for orders placed in Q1 2024
SELECT
  COUNT(*)                   AS q1_orders,
  SUM(total_price)           AS q1_revenue,
  ROUND(AVG(total_price), 2) AS q1_avg_order
FROM orders
WHERE created_at BETWEEN '2024-01-01' AND '2024-03-31';
```

```sql
-- Stats for active users only (joining tables first, then aggregating)
SELECT
  COUNT(o.id)         AS orders_from_active_users,
  SUM(o.total_price)  AS revenue_from_active_users
FROM orders o
JOIN users u ON o.user_id = u.id
WHERE u.status = 'active';
```

---

## COALESCE for NULL Handling

`COALESCE(value, fallback)` returns the first non-NULL argument. Use it inside aggregates to control how NULLs behave.

```sql
-- Treat NULL prices as 0 in SUM
SELECT SUM(COALESCE(total_price, 0)) AS total_with_nulls_as_zero
FROM orders;

-- Treat NULL quantity as 1 in AVG
SELECT AVG(COALESCE(quantity, 1)) AS avg_quantity
FROM orders;
```

### Providing a default when AVG returns NULL

If a `WHERE` clause filters out all rows, `AVG` returns NULL. Use `COALESCE` to return a sensible default:

```sql
SELECT COALESCE(AVG(total_price), 0) AS avg_or_zero
FROM orders
WHERE category = 'NonExistentCategory';
-- Returns 0 instead of NULL
```

---

## Real-World Examples

### Sales dashboard summary

```sql
SELECT
  COUNT(*)                               AS total_orders,
  COUNT(DISTINCT user_id)                AS paying_customers,
  ROUND(SUM(total_price), 2)             AS gross_revenue,
  ROUND(AVG(total_price), 2)             AS avg_order_value,
  ROUND(MAX(total_price), 2)             AS largest_order,
  MIN(created_at)                        AS first_sale,
  MAX(created_at)                        AS latest_sale
FROM orders;
```

### User activity stats

```sql
SELECT
  COUNT(*)                            AS total_users,
  COUNT(CASE WHEN status = 'active'   THEN 1 END) AS active_users,
  COUNT(CASE WHEN status = 'inactive' THEN 1 END) AS inactive_users,
  COUNT(CASE WHEN status = 'banned'   THEN 1 END) AS banned_users,
  ROUND(AVG(age), 1)                  AS avg_age,
  MIN(age)                            AS youngest,
  MAX(age)                            AS oldest
FROM users;
```

### Product analytics

```sql
-- Top-level product metrics
SELECT
  COUNT(DISTINCT product_name)           AS distinct_products_sold,
  SUM(quantity)                          AS total_units_sold,
  ROUND(SUM(total_price), 2)             AS total_revenue,
  ROUND(AVG(unit_price), 2)             AS avg_unit_price,
  MIN(unit_price)                        AS cheapest_item,
  MAX(unit_price)                        AS priciest_item
FROM orders;
```

---

## Common Mistakes

### Mistake 1: Using an aggregate in a WHERE clause

`WHERE` is evaluated before aggregation — you cannot reference an aggregate result there.

```sql
-- WRONG: This will error
SELECT user_id, SUM(total_price)
FROM orders
WHERE SUM(total_price) > 500;   -- ❌ Cannot use aggregate in WHERE

-- CORRECT: Use HAVING (covered in GROUP BY & HAVING)
SELECT user_id, SUM(total_price) AS total_spent
FROM orders
GROUP BY user_id
HAVING SUM(total_price) > 500;  -- ✅
```

### Mistake 2: Assuming SUM/AVG treats NULL as zero

```sql
-- Table has 3 rows: total_price = 100, 200, NULL
SELECT AVG(total_price) FROM orders;
-- Returns 150 (average of 100 and 200), NOT 100 (average of 100, 200, 0)
-- NULL is excluded entirely, not treated as 0
```

### Mistake 3: Mixing aggregates and non-aggregated columns without GROUP BY

```sql
-- WRONG: name is not aggregated and not in GROUP BY
SELECT name, COUNT(*) FROM orders;  -- ❌ Error in most databases

-- CORRECT
SELECT user_id, COUNT(*) AS order_count
FROM orders
GROUP BY user_id;  -- ✅
```

### Mistake 4: COUNT(column) vs COUNT(*)

```sql
-- These can return different results if total_price has NULLs
SELECT COUNT(*)            FROM orders;  -- Counts every row
SELECT COUNT(total_price)  FROM orders;  -- Skips rows where total_price IS NULL
```

---

## Quick Reference

| Function | Ignores NULLs? | Works on strings? | Works on dates? |
|----------|---------------|-------------------|-----------------|
| COUNT(*) | No            | N/A               | N/A             |
| COUNT(col) | Yes         | Yes               | Yes             |
| SUM      | Yes           | No                | No              |
| AVG      | Yes           | No                | No              |
| MIN      | Yes           | Yes (alpha)       | Yes             |
| MAX      | Yes           | Yes (alpha)       | Yes             |

## Next Steps

Learn about:
- [GROUP BY and HAVING](/SQL/GROUP-BY-and-HAVING) to apply aggregates per group
- Window functions for row-level aggregates (no collapsing)
- [Subqueries](/SQL/Subqueries) that reference aggregate results
- CTEs (WITH clauses) for readable multi-step aggregations
