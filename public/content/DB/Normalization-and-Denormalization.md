# DB: Normalization and Denormalization

Normalization organises tables so that each fact is stored once, which prevents update, insert and delete anomalies. Denormalization deliberately stores some facts more than once to make reads faster. Know the first well before choosing the second.

## A table that goes wrong

```
order_items
order_id | product_id | product_name | product_price | customer_name | customer_email
---------+------------+--------------+---------------+---------------+------------------
1        | 10         | Keyboard     | 49.99         | Alice         | alice@example.com
1        | 11         | Mouse        | 19.99         | Alice         | alice@example.com
2        | 10         | Keyboard     | 49.99         | Bob           | bob@example.com
```

- **Update anomaly**: Alice changes her email. Every row that mentions her must change, and missing one leaves contradictory data.
- **Insert anomaly**: a new product cannot be stored until someone orders it.
- **Delete anomaly**: deleting the last order for a product also deletes the only record of that product's name and price.

## The normal forms

- **1NF**: each column holds one atomic value, with no repeating groups. No `phone1`, `phone2`, `phone3` columns and no comma-separated lists.
- **2NF**: every non-key column depends on the whole primary key. Here `product_name` depends only on `product_id`, which is part of the key `(order_id, product_id)`. That is a partial dependency.
- **3NF**: no non-key column depends on another non-key column. Here `customer_email` depends on the customer, not on the order. That is a transitive dependency.
- **BCNF**: a stricter form of 3NF in which every determinant is a candidate key. Know the name; you rarely need more.

## The normalized version

```sql
CREATE TABLE customers (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers (id),
  placed_at   TIMESTAMP NOT NULL
);

CREATE TABLE order_items (
  order_id   INTEGER NOT NULL REFERENCES orders (id),
  product_id INTEGER NOT NULL REFERENCES products (id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
```

Note `order_items.unit_price`. It is not duplication to remove. It records the price at the moment of the order. If the product's price changes later, old orders must still show what the customer paid. A value that records history belongs in the table.

With this design, Alice's email changes in one row, and a product exists before anyone orders it.

## Choosing the normal form

Normalize transactional data (orders, accounts, users) to 3NF, or BCNF where it applies. The data stays correct, and each fact has exactly one place to change.

## When to denormalize

Denormalize when measured read performance requires it and you can keep the copies correct:

- **Precomputed counters**, such as `posts.comment_count`, updated in the same transaction as the insert.
- **Copied columns**, such as `orders.customer_email` kept on the order so a hot report avoids a join.
- **Materialized views**, which store a query result that you refresh.
- **Read models or search indexes**, built from the normalized source in a separate store.

Every copy needs a rule for keeping it right: update it in the same transaction, refresh it from a job, or accept that it may be stale.

A materialized view in PostgreSQL:

```sql
CREATE MATERIALIZED VIEW daily_sales AS
SELECT o.placed_at::date AS day,
       SUM(oi.quantity * oi.unit_price) AS revenue
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.placed_at::date;

REFRESH MATERIALIZED VIEW daily_sales;
```

## How to implement it

1. Write down each entity and its natural key before writing any DDL.
2. Create the tables with primary keys, foreign keys and `CHECK` constraints. The normalized schema above already has them.
3. Choose `ON DELETE` on purpose. Use `RESTRICT` for business records, and `CASCADE` only for rows that cannot exist without their parent.
4. For each copied value, write the rule that keeps it right. A counter can be kept by a trigger, as below.
5. When you add a copied column to a large table, backfill it, then add the `NOT NULL` or other constraint.

### A comment counter kept in step by a trigger

```sql
CREATE TABLE posts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title         TEXT NOT NULL,
  comment_count INT NOT NULL DEFAULT 0 CHECK (comment_count >= 0)
);

CREATE TABLE comments (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts (id) ON DELETE RESTRICT,
  body    TEXT NOT NULL CHECK (length(body) > 0)
);

CREATE OR REPLACE FUNCTION maintain_comment_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET comment_count = comment_count - 1 WHERE id = OLD.post_id;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_comment_count AFTER INSERT OR DELETE ON comments
  FOR EACH ROW EXECUTE FUNCTION maintain_comment_count();
```

Checked on PostgreSQL 16: after two inserts the count was 2, after one delete it was 1, and deleting a post that still had comments failed with the foreign-key error.

The trigger runs in the same transaction as the insert or delete, so the count cannot drift from the rows, unless someone bypasses the trigger.

### A materialized view that refreshes without blocking readers

```sql
CREATE MATERIALIZED VIEW comments_per_post AS
  SELECT post_id, count(*) AS n FROM comments GROUP BY post_id;

-- REFRESH ... CONCURRENTLY needs a unique index on the view
CREATE UNIQUE INDEX ux_comments_per_post ON comments_per_post (post_id);

REFRESH MATERIALIZED VIEW CONCURRENTLY comments_per_post;
```

### Backfill a copied column

```sql
-- one statement backfills the copied counts
UPDATE posts SET comment_count = c.n
FROM (SELECT post_id, count(*) AS n FROM comments GROUP BY post_id) c
WHERE posts.id = c.post_id;
```

Checked. On a very large table, run it in key ranges (`WHERE posts.id BETWEEN ...`), so each transaction stays short.

## Common mistakes

- Normalizing so far that a common screen needs six joins. Check the query side as well as the write side.
- Denormalizing before measuring.
- Storing a derived value with no rule for keeping it in sync.
- Removing a historical snapshot, such as the price on an order, because it looks like duplication.

## Key takeaways

- Normalize transactional data to 3NF so that each fact lives in one place.
- Each normal form removes one kind of dependency: partial in 2NF, transitive in 3NF.
- Denormalize deliberately, after measuring, and give every copy a rule.
- Values that record history at a point in time belong in the table.

Related: [Indexes and B-Trees](/DB/Indexes-and-B-Trees), [SQL: Joins](/SQL/Joins), [SQL: Schema Migrations](/SQL/Schema-Migrations), [Multi-Tenant Database Design](/DB/Multi-Tenant-Database-Design).
