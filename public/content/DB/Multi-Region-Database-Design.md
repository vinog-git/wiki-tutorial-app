# DB: Multi-Region Database Design

Multi-region means the same system runs in more than one geographic region. This topic covers the data side: where each customer's data lives, how it is read and written across regions, and what consistency you can promise. The deployment side is in [Multi-Region Deployment](/DB/Multi-Region-Deployment).

## The scenario

A customer, Acme Corp, has users in the United States and in Canada. Acme is one logical customer with one set of accounts, orders and invoices, but:

- Canadian staff expect fast responses from a Canadian region.
- Acme's contract, or local rules about personal data, may require Canadian personal data to stay in Canada. This is data residency.
- Both regions must still show one consistent view of Acme's orders.

These pull against each other. Decide them explicitly, per kind of data. Residency rules vary by country, sector and contract, so get the actual requirements from legal or compliance before you design around them.

## Step 1: Give every tenant a home region

Each tenant has a **home region** that holds the system of record for its data.

```sql
CREATE TABLE tenants (
  id          BIGINT PRIMARY KEY,
  name        TEXT NOT NULL,
  home_region TEXT NOT NULL CHECK (home_region IN ('us-east-1', 'ca-central-1')),
  residency   TEXT NOT NULL DEFAULT 'regional' CHECK (residency IN ('regional', 'global'))
);
```

Writes for a tenant go to its home region. Every row that belongs to the tenant is stored there. Other regions can hold read copies only where residency allows.

## Step 2: Choose a placement model

Three common options:

1. **One home region per tenant.** Simplest. The whole tenant lives in one region, and users in other regions pay latency. Use it when residency applies to all of a tenant's data.
2. **Split by data class.** Personal data of residents stays in their region, and shared business data (contracts, billing) lives in one agreed place. This needs a clear rule for what goes where, and a way to find the region that holds a given user.
3. **Multi-master, any region writes any row.** Lowest latency, but it needs conflict resolution and makes residency very hard to meet. Use it only with a strong reason.

For Acme, the usual answer is option 2 if residency applies to personal data, and option 1 if it applies to the whole account. Decide with the residency requirement in hand, not by preference.

## Step 3: Route by home region

- A global **directory**, small and replicated everywhere, maps each tenant or user to its home region. Reads of the directory are cheap, and writes to it are rare.
- The entry point routes each request to the home region. A request arriving from another region is forwarded to the home region, rather than copying personal data elsewhere to serve it.
- Keep IDs opaque. Some systems encode the region in the ID so routing needs no lookup, but that makes moving a tenant later much harder.

## Step 4: Replication across regions

- **Cross-region replicas** serve disaster recovery. They are asynchronous. A copy in another region counts as a transfer of data, so check residency before creating one.
- **Latency.** A round trip between regions is tens of milliseconds, far above a call inside one region. A synchronous commit across regions adds that round trip to every write.
- **Default to asynchronous** replication across regions. Use synchronous replication only within a region, across availability zones.

## Step 5: Consistency promises

- Inside the home region, normal transactions apply; see [ACID Transactions](/DB/ACID-Transactions).
- Across regions, asynchronous replicas are eventually consistent. A user who reads from a remote replica right after a write may see old data. Send that user's reads to the home region for a short window after each write.
- A transaction that spans regions, such as moving money from a US account to a Canadian one, needs two-phase commit or a saga. Avoid it by keeping related data in one home region where you can.

The trade-offs here are the ones in [CAP and PACELC](/DB/CAP-and-PACELC).

## Step 6: Global data

Some tables really are global: the tenant directory, a product catalogue, currency rates. Replicate them to every region, keep them read-mostly, and give each one a clear owner. Never store residency-sensitive personal data in a global table.

## Step 7: IDs and uniqueness across regions

- Use IDs that cannot collide across regions, such as UUIDs or a region-aware sequence. A per-region `SERIAL` collides when the data is later combined.
- A unique constraint across regions, such as "one email per tenant", needs one place to do the check. A global unique index adds a cross-region round trip to every insert. Keep uniqueness inside the tenant's home region.

## Step 8: Schema changes

Migrations run in every region, in a fixed order, and must be backward compatible during the rollout. Use expand-then-contract: add the new shape, deploy code that handles both shapes, then remove the old shape later. See [SQL: Schema Migrations](/SQL/Schema-Migrations).

## How to implement it

1. Keep the tenant directory (above) in every region. It is small, so replicate it everywhere.
2. Fix each regional database's region with a database setting, then enforce it in the table with a `CHECK`.
3. Replicate only the global reference tables, using a publication. Set `wal_level = logical` first.
4. Route each request through the directory, and cache the lookup with a short time to live.
5. Keep uniqueness checks inside the tenant's home region.
6. Record which data class lives where, and check that before creating any replica.

### A database bound to one region

```sql
ALTER DATABASE wiki SET app.region = 'ca-central-1';   -- set once, when the regional database is created
-- sessions opened after this see current_setting('app.region') = 'ca-central-1'

CREATE TABLE personal_data (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  region    TEXT NOT NULL DEFAULT current_setting('app.region')
            CHECK (region = current_setting('app.region')),
  email     TEXT NOT NULL
);
```

Checked: inserting a row with `region = 'us-east-1'` into this database failed with `violates check constraint "personal_data_region_check"`. This is a guard against misrouted writes. It does not replace the routing layer.

### Publish only the global tables

```
# postgresql.conf on the primary (restart required)
wal_level = logical
```

```sql
CREATE PUBLICATION global_reference FOR TABLE products, currency_rates;
```

Checked: the publication listed only `products` and `currency_rates`. With `wal_level` still at its default, PostgreSQL warned that the WAL level was insufficient to publish logical changes.

On the other region's database, subscribe to that publication. Read the password from a secret store, not from the file:

```sql
CREATE SUBSCRIPTION global_reference_sub
  CONNECTION 'host=primary-us.internal dbname=wiki user=replicator password=<from secret store>'
  PUBLICATION global_reference;
```

This subscription needs a second server, so it was not run here.

### Routing lookup (sketch)

```java
public Region homeRegionOf(long tenantId) {
    // The directory changes rarely, but a tenant can move. Cache with a short expiry, not forever.
    return directoryCache.get(tenantId, directory::findHomeRegion);
}
```

## Common mistakes

- Creating a DR replica of Canadian personal data in a US region without checking residency.
- Writing every table in every region (active-active) to hit a latency target that home-region routing would already meet.
- A global `UNIQUE` constraint that forces a cross-region call on every insert.
- Assuming the cross-region replica is up to date at the moment of a read.
- No record of where each tenant's data lives. That breaks data-subject requests and audits.

## Key takeaways

- Every tenant, or every data class, has one home region that owns its writes.
- Residency decides what may be copied where. Check it before creating any replica.
- Cross-region replicas are asynchronous. Plan read-your-writes routing.
- Keep a directory of placements, and keep uniqueness checks inside one region.

Related: [Multi-Region Deployment](/DB/Multi-Region-Deployment), [Multi-Tenant Database Design](/DB/Multi-Tenant-Database-Design), [Replication and Sharding](/DB/Replication-and-Sharding), [CAP and PACELC](/DB/CAP-and-PACELC).
