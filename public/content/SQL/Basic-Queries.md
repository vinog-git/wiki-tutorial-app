# SQL: Basic Queries

## What is SQL?

SQL (Structured Query Language) is a standard language for managing relational databases. It allows you to create, read, update, and delete data efficiently.

## Sample Data

Every query on this page runs against this `users` table:

```output
 id | name    | email               | country | age | status
----+---------+---------------------+---------+-----+----------
 1  | Alice   | alice@example.com   | USA     | 28  | active
 2  | Bob     | bob@example.com     | UK      | 35  | active
 3  | Charlie | charlie@example.com | USA     | 42  | inactive
 4  | Diana   | diana@example.com   | Canada  | 31  | active
 5  | Eve     | eve@example.com     | UK      | 24  | banned
```

## CRUD Operations

### CREATE - Insert Data

```sql
-- Insert single row
INSERT INTO users (name, email, age) 
VALUES ('Alice', 'alice@example.com', 28);

-- Insert multiple rows
INSERT INTO users (name, email, age) VALUES
('Bob', 'bob@example.com', 35),
('Charlie', 'charlie@example.com', 42);
```

### READ - Retrieve Data

```sql
-- Select all columns
SELECT * FROM users;

-- Select specific columns
SELECT name, email FROM users;

-- Select with WHERE condition
SELECT * FROM users WHERE age > 30;

-- Select with multiple conditions
SELECT * FROM users 
WHERE age > 25 AND country = 'USA';

-- Select with ORDER BY
SELECT * FROM users 
ORDER BY age DESC;

-- Select with LIMIT
SELECT * FROM users LIMIT 5;
```

#### Output

`SELECT name, email FROM users` returns every row, but only the two requested columns:

```output
 name    | email
---------+---------------------
 Alice   | alice@example.com
 Bob     | bob@example.com
 Charlie | charlie@example.com
 Diana   | diana@example.com
 Eve     | eve@example.com
(5 rows)
```

`SELECT * FROM users WHERE age > 30` filters rows instead:

```output
 id | name    | email               | country | age | status
----+---------+---------------------+---------+-----+----------
 2  | Bob     | bob@example.com     | UK      | 35  | active
 3  | Charlie | charlie@example.com | USA     | 42  | inactive
 4  | Diana   | diana@example.com   | Canada  | 31  | active
(3 rows)
```

That is the core distinction: `SELECT` chooses **columns**, `WHERE` chooses **rows**.

`ORDER BY age DESC`:

```output
 id | name    | age | ...
----+---------+-----+----
 3  | Charlie | 42  |
 2  | Bob     | 35  |
 4  | Diana   | 31  |
 1  | Alice   | 28  |
 5  | Eve     | 24  |
(5 rows)
```

Note that `LIMIT 5` returns all five rows here — the table only has five. `LIMIT` never pads or errors when there are fewer rows than requested.

### UPDATE - Modify Data

```sql
-- Update single column
UPDATE users SET age = 30 WHERE name = 'Alice';

-- Update multiple columns
UPDATE users 
SET age = 31, country = 'Canada' 
WHERE name = 'Bob';
```

### DELETE - Remove Data

```sql
-- Delete specific rows
DELETE FROM users WHERE name = 'Jack';

-- Delete all rows (be careful!)
DELETE FROM users;
```

## Filtering with WHERE

### Operators

```sql
-- Comparison operators
SELECT * FROM users WHERE age = 30;
SELECT * FROM users WHERE age > 25;
SELECT * FROM users WHERE age >= 25;
SELECT * FROM users WHERE age < 40;
SELECT * FROM users WHERE age <= 40;
SELECT * FROM users WHERE age != 30;
```

### Logical Operators

```sql
-- AND - both conditions must be true
SELECT * FROM users WHERE age > 25 AND country = 'USA';

-- OR - either condition must be true
SELECT * FROM users WHERE country = 'USA' OR country = 'UK';

-- NOT - negate a condition
SELECT * FROM users WHERE NOT age > 30;
```

#### Output

```output
AND  (age > 25 AND country = 'USA')   → Alice (28, USA), Charlie (42, USA)
OR   (country = 'USA' OR 'UK')        → Alice, Bob, Charlie, Eve
NOT  (NOT age > 30)                   → Alice (28), Eve (24)
```

`NOT age > 30` returns everyone aged **30 or under** — the negation includes the boundary that `> 30` excluded.

The trap here is `NULL`. If any user had a `NULL` age, they would be missing from **both** `age > 30` and `NOT age > 30`, because a comparison against `NULL` is neither true nor false — it is unknown. See the NULL section below.

### Pattern Matching

```sql
-- LIKE operator
SELECT * FROM users WHERE name LIKE 'A%';      -- Starts with A
SELECT * FROM users WHERE name LIKE '%ce';     -- Ends with ce
SELECT * FROM users WHERE email LIKE '%@%.com'; -- Contains pattern
```

#### Output

```output
LIKE 'A%'        → Alice
LIKE '%ce'       → Alice
LIKE '%@%.com'   → Alice, Bob, Charlie, Diana, Eve   (all 5)
```

`%` matches any number of characters, including none. Use `_` to match exactly one — `'A____'` matches `Alice` but not `Alexander`.

Note `LIKE 'A%'` matched only `Alice`, not `alice@example.com` — `LIKE` is applied to the `name` column, and in most databases (PostgreSQL, and MySQL with a binary collation) it is **case-sensitive**. Use `ILIKE` in PostgreSQL, or `LOWER(name) LIKE 'a%'`, when case should not matter.

### IN Operator

```sql
SELECT * FROM users 
WHERE country IN ('USA', 'UK', 'Canada');
```

### BETWEEN Operator

```sql
SELECT * FROM users 
WHERE age BETWEEN 25 AND 35;
```

#### Output

```output
 id | name  | age
----+-------+-----
 1  | Alice | 28
 2  | Bob   | 35
 4  | Diana | 31
(3 rows)
```

**`BETWEEN` is inclusive at both ends.** Bob at exactly 35 is included, which is the single thing to remember about it — it means `BETWEEN 25 AND 35` and `BETWEEN 36 AND 45` would both match a 35-year-old if you wrote the second range as `35 AND 45`.

For dates this matters more than people expect: `created_at BETWEEN '2024-01-01' AND '2024-01-31'` silently excludes anything on the 31st with a time component, because `'2024-01-31 14:00'` is greater than `'2024-01-31 00:00'`. Prefer `>= '2024-01-01' AND < '2024-02-01'`.

## Sorting Results

```sql
-- Sort ascending (default)
SELECT * FROM users ORDER BY age ASC;

-- Sort descending
SELECT * FROM users ORDER BY age DESC;

-- Sort by multiple columns
SELECT * FROM users 
ORDER BY country ASC, age DESC;
```

## Limiting Results

```sql
-- Get first 5 rows
SELECT * FROM users LIMIT 5;

-- Skip first 10, get next 5
SELECT * FROM users 
LIMIT 5 OFFSET 10;
```

## Distinct Values

```sql
-- Get unique countries
SELECT DISTINCT country FROM users;

-- Count unique countries
SELECT COUNT(DISTINCT country) FROM users;
```

## NULL Values

```sql
-- Check for NULL
SELECT * FROM users WHERE age IS NULL;
SELECT * FROM users WHERE age IS NOT NULL;
```

## Query Examples

### Find active users over 25 years old
```sql
SELECT name, email, age 
FROM users 
WHERE age > 25 AND status = 'active'
ORDER BY age DESC;
```

### Find users in USA or Canada sorted by name
```sql
SELECT name, country, email 
FROM users 
WHERE country IN ('USA', 'Canada')
ORDER BY name ASC;
```

#### Output

```output
 id | name  | email             | country | age | status
----+-------+-------------------+---------+-----+--------
 1  | Alice | alice@example.com | USA     | 28  | active
 4  | Diana | diana@example.com | Canada  | 31  | active
 2  | Bob   | bob@example.com   | UK      | 35  | active
(3 rows)
```

Charlie is 42 and over 25, but his status is `inactive`; Eve is `banned`. Both conditions have to hold.

### Get 10 youngest active users
```sql
SELECT name, age, email 
FROM users 
WHERE status = 'active'
ORDER BY age ASC
LIMIT 10;
```

## Common Mistakes

- ❌ Forgetting WHERE clause in UPDATE/DELETE
- ❌ Using = instead of LIKE for patterns
- ❌ Not checking for NULL values
- ❌ Mixing AND/OR without parentheses (can cause logic errors)

## Next Steps

Learn about:
- [Aggregate functions](/SQL/Aggregate-Functions) (COUNT, SUM, AVG, MAX, MIN)
- [GROUP BY and HAVING](/SQL/GROUP-BY-and-HAVING) clauses
- [JOINs](/SQL/Joins) to combine data from multiple tables
- [Subqueries](/SQL/Subqueries) for complex filtering
