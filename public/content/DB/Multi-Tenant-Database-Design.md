# DB: Multi-Tenant Database Design

A multi-tenant system serves many customers, called tenants, from one deployment. The database question is how tenant data is separated: a shared table with a tenant column, a schema per tenant, or a database per tenant. For the tenancy models and business trade-offs, see [Domain: Multi-Tenant](/Domain/Multi-Tenant). This topic covers the database design.

## The three isolation models

| Model | Layout | Isolation | Cost per tenant | Operational load | Best for |
|---|---|---|---|---|---|
| **Shared tables** | One schema; every table has `tenant_id` | Logical only | Lowest | Lowest; one migration run | Many small tenants |
| **Schema per tenant** | One database; one schema per tenant | Stronger; separate tables | Medium | Each migration runs once per schema | Tens to hundreds of mid-size tenants |
| **Database per tenant** | A database per tenant, on shared or dedicated servers | Strongest | Highest | Highest; fleet management | Regulated or large enterprise tenants |

Most SaaS products start with shared tables and move large tenants to stronger isolation later.

## Shared tables with tenant_id

```sql
CREATE TABLE customers (
  tenant_id BIGINT NOT NULL,
  id        BIGINT NOT NULL,
  name      TEXT   NOT NULL,
  PRIMARY KEY (tenant_id, id)
);

CREATE TABLE orders (
  tenant_id   BIGINT        NOT NULL,
  id          BIGINT        NOT NULL,
  customer_id BIGINT        NOT NULL,
  total       NUMERIC(12,2) NOT NULL,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customers (tenant_id, id)
);

CREATE INDEX idx_orders_tenant_created ON orders (tenant_id, created_at);
```

Rules for this model:

- **Every table carries `tenant_id`**, including join tables and child tables such as line items. Do not rely on joining back to a parent to find the tenant. A missed join leaks data.
- **Put `tenant_id` first in primary keys and indexes.** Almost every query filters by tenant, so the tenant must be the leading column. This follows the leftmost-prefix rule in [Indexes and B-Trees](/DB/Indexes-and-B-Trees).
- **Make foreign keys include `tenant_id`**, as in the composite key above. Then an order cannot point at another tenant's customer, even by mistake.

## Enforcing isolation in the database

Do not rely on every query remembering `WHERE tenant_id = ?`. Enforce it where the data lives.

PostgreSQL row-level security (RLS) filters rows by a session setting:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;  -- applies to the table owner too

CREATE POLICY tenant_isolation ON orders
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint);

-- at the start of each request's transaction:
SET LOCAL app.tenant_id = '42';
```

- Connect as a role that does not own the tables. Owners bypass RLS unless `FORCE` is set.
- `SET LOCAL` lasts only for the current transaction, so a pooled connection cannot carry one tenant's setting into the next request.
- The application layer can add a tenant filter as a second line of defence, but it should not be the only one.

## Schema per tenant

- Each tenant gets its own schema, such as `tenant_42.orders`. The connection sets `search_path` per request.
- Every schema must be migrated. The migration tool has to loop over all schemas and track each schema's version. A failure halfway leaves some tenants on the old version, so plan for resuming.
- Each schema adds catalog entries. Very large counts slow down planning, backups and migrations. Measure before going past a few hundred schemas in one database.

## Database per tenant

- Strongest isolation: each tenant has its own backup, restore, encryption keys, maintenance window and region placement.
- A **tenant directory** maps each tenant to its database connection. Connection pools are per database, or a router picks one per request.
- Migrations and monitoring run across the whole fleet. Cost rises with every tenant.

## Noisy neighbours

One tenant's large query or bulk import can slow everyone else. Mitigations:

- Per-tenant rate limits and query timeouts.
- Tiering: small tenants share a pool, and large tenants get their own database or cluster.
- Heavy batch work runs off-peak or on a replica.

## Per-tenant operations

- **Backup and restore for one tenant.** Easy with a database per tenant. With shared tables it needs a logical export filtered by `tenant_id`. Decide this before a customer asks for it.
- **Offboarding and deletion.** A deletion must reach every table that holds tenant data, and backups per your retention policy. Keep a list of every table that holds tenant data.
- **Unique constraints** include the tenant: `UNIQUE (tenant_id, email)`, not `UNIQUE (email)`.
- **Caches, search indexes and queues** follow the same rule. A cache key `user:42` collides across tenants; use `tenant:42:user:42`.

## Where tenant identity comes from

Take the tenant from a verified source, such as a token claim, a signed subdomain or an API key bound to a tenant. Never take it from a request field the client can change.

## How to implement it

1. Add `tenant_id BIGINT NOT NULL` to every table. Include it in primary keys, unique constraints and foreign keys, as in the composite keys above.
2. Create an application role that owns nothing, and grant it only the privileges it needs.
3. Enable row-level security with `FORCE`, and write both `USING` and `WITH CHECK` on each tenant table.
4. In each transaction, set the tenant with `set_config(..., true)`. The `true` limits the setting to the current transaction, so a pooled connection cannot carry it into the next request.
5. Onboard a tenant by inserting its row. For schema-per-tenant, also create its schema and run the migrations there.
6. Test isolation as the application role: read and write across tenants, and check what is refused.

### Roles and row-level security

```sql
CREATE ROLE app_user NOLOGIN;   -- owns nothing; the application's login role is granted this
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON customers, orders TO app_user;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::bigint);
-- repeat the ENABLE, FORCE and CREATE POLICY lines for customers
```

`NULLIF` is needed. After a transaction-local setting ends, `current_setting` returns an empty string, not NULL, and a bare `''::bigint` fails with `invalid input syntax for type bigint`. `NULLIF` turns the empty string into NULL, so the policy matches no rows.

Checked on PostgreSQL 16, with the same structure as the tables above:

- As `app_user` with no tenant set, `SELECT count(*)` returns 0.
- With tenant 1 set in a transaction, only tenant 1's two rows are returned.
- After the commit, the same query returns 0 rows with no error.
- Inserting a row labelled with tenant 2 while tenant 1 is set fails with `new row violates row-level security policy`.

### Set the tenant per transaction (Spring sketch)

```java
@Transactional
public List<Order> ordersForTenant(long tenantId) {
    // Set once per transaction. Put this in one place, such as an aspect or a DataSource wrapper,
    // rather than repeating it in every method.
    jdbc.queryForObject("SELECT set_config('app.tenant_id', ?, true)", String.class, String.valueOf(tenantId));
    return orderRepository.findAll();
}
```

The setting applies to the connection that runs the queries. Inside `@Transactional` that is guaranteed, because the whole transaction uses one connection.

## Common mistakes

- Forgetting `tenant_id` on one table. This is the bug that leaks data in production.
- A `UNIQUE` constraint without `tenant_id`.
- A tenant filter applied in code, which a new endpoint forgets.
- A pooled connection that keeps a previous tenant's session setting.
- No tenant in the index, so every tenant's query scans all tenants' rows.

## Key takeaways

- Shared tables with `tenant_id` is the usual starting point. Stronger models cost operational effort.
- Put `tenant_id` in every table, key, index, constraint and cache key.
- Enforce isolation in the database, with RLS or composite keys, not only in application code.
- Design backup, restore and deletion per tenant from the start.

Related: [Domain: Multi-Tenant](/Domain/Multi-Tenant), [Indexes and B-Trees](/DB/Indexes-and-B-Trees), [Multi-Region Database Design](/DB/Multi-Region-Database-Design), [Multi-Region Deployment](/DB/Multi-Region-Deployment).
