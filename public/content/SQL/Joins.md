# SQL: Joins

## What are Joins?

Joins combine rows from two or more tables based on related columns. They are essential for working with relational databases.

## Types of Joins

### INNER JOIN

Returns only rows that have matching values in both tables.

```sql
SELECT 
  u.name as customer,
  o.order_id,
  o.total_price
FROM users u
INNER JOIN orders o ON u.id = o.user_id;
```

#### Output

```output
 customer | order_id | total_price
----------+----------+-------------
 Alice    | 1        | 999.99
 Bob      | 2        | 99.98
 Alice    | 3        | 29.99
 Charlie  | 4        | 349.99
 Bob      | 5        | 299.99
 Diana    | 6        | 24.95
(6 rows)
```

Six rows for five users. Alice and Bob each appear **twice** — an inner join produces one row per *match*, not one per user. Eve is absent entirely: she has no orders, so there is nothing to match.

**Result includes only users who have orders.**

### LEFT JOIN

Returns all rows from the left table, and matching rows from the right table.

```sql
SELECT 
  u.name,
  COUNT(o.id) as order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name;
```

#### Output

```output
 name    | order_count
---------+-------------
 Alice   | 2
 Bob     | 2
 Charlie | 1
 Diana   | 1
 Eve     | 0
(5 rows)
```

Eve now appears, with a count of **0**. Before grouping, her row looks like this:

```output
 name    | order_id
---------+----------
 Alice   | 1
 Alice   | 3
 Bob     | 2
 Bob     | 5
 Charlie | 4
 Diana   | 6
 Eve     | NULL
(7 rows)
```

That `NULL` is why the query uses `COUNT(o.id)` and not `COUNT(*)`. `COUNT(*)` counts rows, and Eve *has* a row — so it would report `1` order for someone with none:

```output
 COUNT(o.id) | COUNT(*)
-------------+----------
 0           | 1
```

**`COUNT(column)` after a `LEFT JOIN`, never `COUNT(*)`.** This is the most common bug in reporting queries.

**Result includes all users, even those with no orders (NULL values for order columns).**

### RIGHT JOIN

Returns all rows from the right table, and matching rows from the left table.

```sql
SELECT 
  p.name as product,
  COUNT(o.id) as times_ordered
FROM orders o
RIGHT JOIN products p ON o.product_id = p.id
GROUP BY p.id, p.name;
```

**Result includes all products, even those never ordered.**

### FULL OUTER JOIN

Returns all rows from both tables.

```sql
SELECT 
  u.name,
  o.order_id
FROM users u
FULL OUTER JOIN orders o ON u.id = o.user_id;
```

**Result includes all users and all orders, with NULLs where no match.**

### CROSS JOIN

Returns cartesian product (every row from first table with every row from second table).

```sql
SELECT 
  u.name,
  p.name
FROM users u
CROSS JOIN products p;
```

**Warning: Can produce very large result sets!**

## Self Join

Join a table with itself to compare rows.

```sql
SELECT 
  u1.name as user1,
  u2.name as user2
FROM users u1
INNER JOIN users u2 ON u1.country = u2.country
WHERE u1.id < u2.id;
```

**Finds pairs of users from the same country.**

## Multiple Joins

Combine data from more than two tables.

```sql
SELECT 
  u.name as customer,
  p.name as product,
  o.quantity,
  o.total_price
FROM users u
INNER JOIN orders o ON u.id = o.user_id
INNER JOIN products p ON o.product_id = p.id
WHERE p.category = 'Electronics'
ORDER BY u.name;
```

## Join with Conditions

Add WHERE clauses to filter joined results.

```sql
SELECT 
  u.name,
  COUNT(o.id) as order_count,
  SUM(o.total_price) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.country = 'USA'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 0
ORDER BY total_spent DESC;
```

#### Output

A cross join has no `ON` clause — it pairs every left row with every right row:

```output
 cross_rows
------------
 30
(1 row)
```

5 users × 6 orders = 30. That number is the warning: cross joins grow multiplicatively, so two tables of 10,000 rows produce 100 million. Most accidental cross joins are a forgotten `ON` clause rather than a deliberate choice.

## Visual Representation

```
INNER JOIN          LEFT JOIN           RIGHT JOIN
┌─────┐             ┌─────┐             ┌─────┐
│  A  │             │  A  │             │  A  │
├─────┤             ├─────┤             ├─────┤
│ 1,2 │             │ 1,2 │             │ 1,2 │
├─────┤             ├─────┤             ├─────┤
│  B  │             │  B  │             │  B  │
├─────┤             ├─────┤             ├─────┤
│ 2,3 │             │ 2,3 │             │ 2,3 │
└─────┘             └─────┘             └─────┘
  Only match         A + match           Match + B
   (1,2)           (1,2,3,x)            (x,2,3)

FULL OUTER JOIN
┌─────┐
│  A  │
├─────┤
│1,2,3│
├─────┤
│  B  │
├─────┤
│2,3,4│
└─────┘
```

## Common Patterns

### Find customers and their total spending
```sql
SELECT 
  u.name,
  COUNT(o.id) as num_orders,
  SUM(o.total_price) as total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name
ORDER BY total_spent DESC;
```

#### Output

```output
 name    | num_orders | total_spent
---------+------------+-------------
 Alice   | 2          | 1029.98
 Bob     | 2          | 399.97
 Charlie | 1          | 349.99
 Diana   | 1          | 24.95
 Eve     | 0          | NULL
(5 rows)
```

Note Eve's `total_spent` is `NULL`, not `0`. `SUM` over zero non-NULL rows returns NULL — so `WHERE total_spent > 100` would exclude her (fine), but `total_spent * 1.2` would also be NULL, and displaying it raw shows an empty cell rather than a zero. Wrap it: `COALESCE(SUM(o.total_price), 0)`.

Also note she sorts **last** under `ORDER BY total_spent DESC`. NULL ordering is database-specific — PostgreSQL puts NULLs first on `DESC` by default. Say what you mean with `NULLS LAST`.

### Find products ordered by specific user
```sql
SELECT DISTINCT
  p.name,
  p.category,
  p.price
FROM users u
INNER JOIN orders o ON u.id = o.user_id
INNER JOIN products p ON o.product_id = p.id
WHERE u.name = 'Alice'
ORDER BY p.name;
```

### Find customers who haven't placed orders
```sql
SELECT 
  u.name,
  u.email
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE o.id IS NULL;
```

```output
 name | email
------+-----------------
 Eve  | eve@example.com
(1 row)
```

This is the **anti-join** pattern, and it is worth memorising: `LEFT JOIN` then `WHERE right.key IS NULL` means "rows on the left with no match on the right".

The reason it works is that the unmatched rows are exactly the ones the join filled with NULLs. Which is also why the `WHERE` must test a column that can **never** legitimately be NULL — a primary key. Testing a nullable column like `o.category` would also return orders that merely lack a category.

## Performance Tips

1. **Use INNER JOIN when possible** - More efficient than LEFT/RIGHT
2. **Join on indexed columns** - Usually primary/foreign keys
3. **Filter with WHERE** - Reduce data before joining
4. **Specify columns explicitly** - Don't use SELECT *
5. **Use meaningful aliases** - Makes queries readable

## Common Mistakes

- ❌ Forgetting the ON clause
- ❌ Wrong join type (LEFT instead of INNER)
- ❌ Not handling NULL values from outer joins
- ❌ Joining too many tables (can slow queries)
- ❌ Using implicit joins (old syntax)

## Next Steps

Learn about:
- GROUP BY and aggregate functions
- [Subqueries](/SQL/Subqueries) with joins
- Window functions
- Query optimization
