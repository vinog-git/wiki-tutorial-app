# SQL: Schema Migrations

## What is a Schema Migration?

A **schema migration** is a versioned, repeatable, ordered change to a database's structure — and sometimes its data — that is stored in source control alongside the application code.

Instead of a developer connecting to a database and typing `ALTER TABLE ...` by hand, the change is written as a file:

```sql
-- V7__add_status_to_orders.sql
ALTER TABLE orders ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';
```

A migration tool then applies pending files, in order, exactly once per database, and records what it did.

**The core guarantee:** any database — a developer laptop, CI, staging, production — can be brought from *any* older version to the current version by replaying the migrations it has not yet seen.

### Why not just edit the database directly?

| Manual DDL | Versioned migrations |
|---|---|
| Change exists only in one database | Change exists in git, applied everywhere |
| No record of who changed what, when | History table + code review + git blame |
| Staging and prod silently drift apart | Drift is detectable and fixable |
| Rebuilding a dev DB means guessing | `migrate` from empty gives an exact replica |
| No coupling to the code that needs it | Migration ships in the same commit/release |

---

## Anatomy of a Migration System

Almost every tool (Flyway, Liquibase, Alembic, ActiveRecord, EF Core, Prisma, golang-migrate) is built from the same four pieces:

1. **Migration files** with a sortable version prefix — `V1__`, `20240115093000_`, `0007_`
2. **A history table** inside the target database recording applied versions
3. **A checksum** of each applied file, so editing an already-applied migration is detected
4. **A lock** so two application instances starting at once cannot apply the same migration twice

### The history table

Flyway's looks roughly like this:

```sql
CREATE TABLE flyway_schema_history (
  installed_rank INT           NOT NULL PRIMARY KEY,
  version        VARCHAR(50),
  description    VARCHAR(200)  NOT NULL,
  type           VARCHAR(20)   NOT NULL,   -- SQL, JDBC, ...
  script         VARCHAR(1000) NOT NULL,
  checksum       INT,
  installed_by   VARCHAR(100)  NOT NULL,
  installed_on   TIMESTAMP     NOT NULL DEFAULT now(),
  execution_time INT           NOT NULL,
  success        BOOLEAN       NOT NULL
);
```

Inspecting it is the fastest way to answer "what version is this database on?":

```sql
SELECT version, description, success, installed_on
FROM flyway_schema_history
ORDER BY installed_rank DESC
LIMIT 10;
```

#### Output

> Tool output on this page is **illustrative** — representative of a real run, not captured from one.

```output
 version | description          | success | installed_on
---------+----------------------+---------+---------------------
 4       | add orders index     | t       | 2026-09-22 14:02:11
 3       | add status to users  | t       | 2026-09-20 09:41:55
 2       | create orders table  | t       | 2026-09-18 16:20:03
 1       | create users table   | t       | 2026-09-18 16:20:01
(4 rows)
```

A `success` of `f` is the row to look for. Flyway records a failed migration and then **refuses to proceed** until you resolve it, which is why a broken deploy often presents as every subsequent deploy failing at startup:

```output
 version | description        | success
---------+--------------------+---------
 5       | backfill amounts   | f
```

`flyway repair` deletes that failed row once you have manually undone whatever it half-applied.

### Naming convention (Flyway style)

```
V1__create_users_table.sql          -- versioned: runs once, in order
V2__create_orders_table.sql
V3.1__add_index_on_orders_user.sql
U2__drop_orders_table.sql           -- undo (Flyway Teams only)
R__user_order_summary_view.sql      -- repeatable: re-runs when its checksum changes
```

Rules that matter in practice:
- **Version prefixes must sort correctly.** `V10` vs `V9` sorts fine numerically in Flyway, but timestamp prefixes (`20240115093000_`) avoid merge conflicts when several developers add migrations the same week.
- **Descriptions are documentation.** `V23__fix.sql` is useless in a history table six months later.
- **One logical change per file.** Easier to review, and a failure leaves less half-applied.

---

## Tool Landscape

| Tool | Ecosystem | Format | Rollback support | Notes |
|---|---|---|---|---|
| **Flyway** | Java / JVM, CLI | Plain SQL (+ Java) | Undo scripts (paid tier) | Simple, SQL-first, the common Spring Boot default |
| **Liquibase** | Java / JVM, CLI | XML / YAML / JSON / SQL | `rollback` blocks (free) | DB-agnostic changelogs, more ceremony |
| **Alembic** | Python / SQLAlchemy | Python scripts | `downgrade()` per revision | Can autogenerate from models |
| **ActiveRecord** | Ruby on Rails | Ruby DSL | `down` / reversible | Tightly integrated with the ORM |
| **EF Core Migrations** | .NET | C# | `Down()` per migration | Generated from model diffs |
| **Prisma Migrate** | Node / TypeScript | SQL generated from schema | Forward-only in practice | Declarative schema is the source of truth |
| **golang-migrate** | Go, CLI | Paired `.up.sql` / `.down.sql` | Explicit down files | Very thin, no magic |

### Imperative vs declarative

- **Imperative** (Flyway, Alembic, golang-migrate): you write the *steps*. Full control over locking, batching, and data backfills — which is why production teams usually prefer it.
- **Declarative** (Prisma, EF Core model-first, Atlas, schema-diff tools): you write the *desired end state* and the tool computes a diff. Convenient, but a generated diff can silently pick a destructive path (e.g. drop-and-recreate instead of rename). **Always read generated SQL before merging it.**

---

## Flyway with Spring Boot

Add the dependency and Flyway runs automatically at startup, before JPA validates entities.

```xml
<dependency>
  <groupId>org.flywaydb</groupId>
  <artifactId>flyway-core</artifactId>
</dependency>
<!-- MySQL 8+ also needs: flyway-mysql -->
```

```yaml
# application.yml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/appdb
    username: app
    password: secret
  jpa:
    hibernate:
      ddl-auto: validate      # never 'update' outside a scratch DB
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: false
    validate-on-migrate: true
    out-of-order: false
```

```
src/main/resources/db/migration/
├── V1__create_users.sql
├── V2__create_orders.sql
└── V3__add_status_to_orders.sql
```

```sql
-- V1__create_users.sql
CREATE TABLE users (
  id         BIGSERIAL PRIMARY KEY,
  email      VARCHAR(255) NOT NULL,
  name       VARCHAR(100) NOT NULL,
  country    VARCHAR(50),
  status     VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at TIMESTAMP    NOT NULL DEFAULT now(),
  CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX idx_users_country ON users(country);
```

> **`ddl-auto: update` is not a migration strategy.** Hibernate's auto-DDL never drops or renames anything, ignores data, produces different schemas depending on the order entities load, and leaves no history. Use it only on a throwaway local database.

### Useful CLI commands

```bash
flyway info      # what's applied, what's pending
flyway migrate   # apply pending migrations
flyway validate  # checksums + ordering match the history table
flyway repair    # fix a failed-migration row / re-align checksums
flyway baseline  # mark an existing DB as being at version N
```

#### Output

`flyway info` is the one you will read most:

```output
Schema version: 4

+-----------+---------+---------------------+------+---------------------+---------+
| Category  | Version | Description         | Type | Installed On        | State   |
+-----------+---------+---------------------+------+---------------------+---------+
| Versioned | 1       | create users table  | SQL  | 2026-09-18 16:20:01 | Success |
| Versioned | 2       | create orders table | SQL  | 2026-09-18 16:20:03 | Success |
| Versioned | 3       | add status to users | SQL  | 2026-09-20 09:41:55 | Success |
| Versioned | 4       | add orders index    | SQL  | 2026-09-22 14:02:11 | Success |
| Versioned | 5       | add customer tier   | SQL  |                     | Pending |
+-----------+---------+---------------------+------+---------------------+---------+
```

Blank `Installed On` plus `Pending` means the file is on disk but has not run yet.

The failure mode worth recognising is a checksum mismatch — what you get from editing a migration that has already been applied:

```output
ERROR: Validate failed: Migrations have failed validation
Migration checksum mismatch for migration version 3
-> Applied to database : 1284735029
-> Resolved locally    : -905512740
Either revert the changes to the migration, or run repair to update the schema history.
```

The tool cannot tell whether your edit was cosmetic or structural, so it refuses to guess. Every developer hits this once; the answer is almost always to revert the edit and add a **new** migration instead.

---

---

## Liquibase Changelogs

```xml
<!-- db/changelog/db.changelog-master.xml -->
<databaseChangeLog xmlns="http://www.liquibase.org/xml/ns/dbchangelog" ...>
  <include file="db/changelog/changes/001-create-orders.xml"/>
  <include file="db/changelog/changes/002-add-region.xml"/>
</databaseChangeLog>
```

```xml
<!-- 002-add-region.xml -->
<changeSet id="002-add-region" author="vgunasekaran">
  <addColumn tableName="orders">
    <column name="region" type="VARCHAR(50)"/>
  </addColumn>
  <rollback>
    <dropColumn tableName="orders" columnName="region"/>
  </rollback>
</changeSet>
```

Liquibase tracks state in `DATABASECHANGELOG` (applied changesets + `MD5SUM`) and `DATABASECHANGELOGLOCK` (the concurrency lock). Its selling point over Flyway is first-class rollback and database-agnostic change types; its cost is verbosity and an abstraction layer between you and the SQL that actually runs.

---

## Versioned vs Repeatable Migrations

| | Versioned | Repeatable |
|---|---|---|
| Runs | Exactly once, in version order | Every time its checksum changes, after all versioned ones |
| Prefix | `V` | `R` |
| Good for | Tables, columns, indexes, data backfills | Views, stored procedures, functions, triggers, seed/reference data |

Repeatable migrations exist because `CREATE OR REPLACE VIEW` is idempotent — you want the *current* definition in one file, with git history as the changelog, rather than a chain of `V12`, `V18`, `V31` edits to the same view.

```sql
-- R__user_order_summary.sql
CREATE OR REPLACE VIEW user_order_summary AS
SELECT
  u.id,
  u.name,
  COUNT(o.id)                    AS order_count,
  COALESCE(SUM(o.total_price),0) AS lifetime_value
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;
```

---

## Rollback: Down Migrations vs Forward-Only

There are two philosophies, and knowing why teams pick the second is a common interview discriminator.

### Down migrations

Every migration ships with its inverse:

```sql
-- 0007_add_status_to_orders.up.sql
ALTER TABLE orders ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending';

-- 0007_add_status_to_orders.down.sql
ALTER TABLE orders DROP COLUMN status;
```

### Forward-only (roll forward)

Most teams running continuous delivery **do not roll back schema in production.** Reasons:

1. **Destructive down migrations lose data.** Undoing "add column" after two hours of production writes deletes real customer data. The down migration is syntactically correct and semantically catastrophic.
2. **Down migrations are rarely tested.** They run in dev, almost never in prod, so they rot.
3. **Some changes are irreversible.** A `DROP COLUMN` or a lossy type narrowing (`VARCHAR(255)` → `VARCHAR(50)`) cannot be undone from schema alone.
4. **A failed deploy usually needs a code rollback, not a schema rollback** — which is exactly why backward-compatible migrations matter (next section).

Practical stance: **write down migrations for local development convenience; in production, fix forward with a new migration** and restore from backup/PITR only for genuine data loss.

---

## Backward Compatibility and Deploy Ordering

During any rolling deploy, **old code and new code run against the same database at the same time.** Old pods are still serving traffic while new pods start.

```
Time ──────────────────────────────────────────►
DB schema     v1        │  v2 (migrated)
App instances  old,old  │  old,new  ← both must work against v2
                        │  new,new
```

This forces one rule:

> **Every migration must be compatible with the currently deployed application code.**

Consequences:
- Adding a nullable column or a new table: **safe**, old code ignores it.
- Dropping or renaming a column the running code still selects: **breaks production immediately.**
- Adding a `NOT NULL` column with no default: breaks old `INSERT`s that don't mention it.

The standard order for a change that would otherwise break:

```
Release N   : migrate (additive only) → deploy code that writes both old + new
Release N+1 : backfill → deploy code that reads new only
Release N+2 : migrate (drop the old thing)
```

---

## Expand–Contract (Parallel Change)

The canonical zero-downtime pattern. Example: rename `orders.total_price` to `orders.amount`.

A single `ALTER TABLE orders RENAME COLUMN total_price TO amount;` breaks every running instance the moment it commits. Instead, split it across three releases:

### Phase 1 — Expand (Release N)

```sql
-- V10__add_amount_column.sql
ALTER TABLE orders ADD COLUMN amount DECIMAL(10,2);   -- nullable, no default rewrite
```

Deploy code that **writes both columns** and still **reads `total_price`**:

```java
order.setTotalPrice(value);
order.setAmount(value);       // dual write
```

### Phase 2 — Migrate the data (Release N)

```sql
-- V11__backfill_amount.sql   (batched; see below)
UPDATE orders SET amount = total_price WHERE amount IS NULL;
```

### Phase 3 — Switch reads (Release N+1)

Deploy code that reads `amount`, still dual-writing. Verify with a consistency check:

```sql
SELECT COUNT(*) AS mismatches
FROM orders
WHERE amount IS DISTINCT FROM total_price;   -- must be 0
```

### Phase 4 — Stop writing the old column (Release N+2)

Remove `setTotalPrice` from the code. Deploy.

### Phase 5 — Contract (Release N+3)

```sql
-- V15__drop_total_price.sql
ALTER TABLE orders DROP COLUMN total_price;
```

Only after the old column has been provably unused for at least one full rollback window — because if you need to redeploy release N+1, that column must still exist.

The same five phases apply to splitting a column, changing a type, moving a column to another table, or replacing a table entirely.

---

## Safe vs Dangerous DDL

Most migration outages are lock problems, not syntax problems. DDL takes a table-level lock, and on a busy table an exclusive lock for even 2 seconds means thousands of queued queries and timeouts cascading upstream.

### PostgreSQL

| Operation | Cost | Notes |
|---|---|---|
| `ADD COLUMN` nullable, no default | Instant | Metadata only |
| `ADD COLUMN ... DEFAULT <constant>` | Instant on PG 11+ | Full table rewrite on PG ≤ 10 |
| `ADD COLUMN ... DEFAULT now()` (volatile) | **Table rewrite** | Add nullable, then backfill |
| `DROP COLUMN` | Instant | Space reclaimed later by `VACUUM` |
| `CREATE INDEX` | **Blocks writes** | Use `CREATE INDEX CONCURRENTLY` |
| `ALTER COLUMN SET NOT NULL` | Full scan under lock | Use a validated `CHECK` first (PG 12+) |
| `ADD FOREIGN KEY` | Locks both tables + validates | Use `NOT VALID`, then `VALIDATE CONSTRAINT` |
| Type change (`INT` → `BIGINT`) | **Table rewrite** | Expand–contract with a new column |
| `RENAME COLUMN` / `RENAME TABLE` | Instant, but **breaks running code** | Expand–contract |

Safe index creation:

```sql
-- Does not block reads or writes; takes longer; cannot run inside a transaction
CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders(created_at);
```

```sql
-- Flyway: disable the wrapping transaction for this script
-- flyway:executeInTransaction=false
CREATE INDEX CONCURRENTLY idx_orders_region_category ON orders(region, category);
```

A `CONCURRENTLY` build that fails leaves an **invalid index** behind — detect and clean it up:

```sql
SELECT c.relname
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE NOT i.indisvalid;

DROP INDEX CONCURRENTLY idx_orders_created_at;   -- then retry
```

Safe `NOT NULL` on a large table (PG 12+):

```sql
-- 1. Add a constraint that only checks new/updated rows
ALTER TABLE orders ADD CONSTRAINT orders_amount_nn
  CHECK (amount IS NOT NULL) NOT VALID;

-- 2. Validate existing rows without an exclusive lock
ALTER TABLE orders VALIDATE CONSTRAINT orders_amount_nn;

-- 3. Now this is a cheap metadata check
ALTER TABLE orders ALTER COLUMN amount SET NOT NULL;
ALTER TABLE orders DROP CONSTRAINT orders_amount_nn;
```

Always cap how long a migration is willing to wait for its lock, so it fails fast instead of stalling every query behind it:

```sql
SET lock_timeout = '3s';
SET statement_timeout = '30s';
ALTER TABLE orders ADD COLUMN notes TEXT;
```

### MySQL

MySQL 8 performs many `ALTER`s with `ALGORITHM=INPLACE, LOCK=NONE` (online DDL), but not all. Force the engine to refuse a blocking path rather than discovering it in production:

```sql
ALTER TABLE orders
  ADD COLUMN notes TEXT,
  ALGORITHM = INPLACE,
  LOCK = NONE;      -- errors out if MySQL cannot do it online
```

For operations MySQL cannot do online (some type changes, adding a column in a specific position, older versions), use an external tool that builds a shadow table and swaps it:

```bash
# Percona toolkit
pt-online-schema-change \
  --alter "MODIFY COLUMN amount DECIMAL(12,2) NOT NULL" \
  D=appdb,t=orders --execute

# GitHub's gh-ost (replication-based, lighter on the primary)
gh-ost --database=appdb --table=orders \
  --alter="ADD COLUMN notes TEXT" --execute
```

### Transactional DDL

| Database | DDL inside a transaction? |
|---|---|
| PostgreSQL | Yes — a failed migration rolls back completely |
| SQL Server | Yes (mostly) |
| MySQL / MariaDB | **No** — each statement auto-commits; a failure leaves the migration half-applied |
| Oracle | No — implicit commit around DDL |

This is why **one logical change per migration file** matters so much more on MySQL: there is no automatic cleanup, so a failed multi-statement migration must be repaired by hand (`flyway repair` plus manual DDL).

---

## Batched Backfills

Never `UPDATE` ten million rows in one statement: it takes a long-lived lock, bloats the WAL/undo log, and blocks replication.

```sql
-- PostgreSQL: loop in batches, committing between them
DO $$
DECLARE
  rows_updated INT;
BEGIN
  LOOP
    UPDATE orders
    SET    amount = total_price
    WHERE  id IN (
      SELECT id FROM orders
      WHERE amount IS NULL
      ORDER BY id
      LIMIT 5000
      FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS rows_updated = ROW_COUNT;
    EXIT WHEN rows_updated = 0;
    COMMIT;                    -- PG 11+ inside a procedure/DO block
    PERFORM pg_sleep(0.1);     -- let replicas catch up
  END LOOP;
END $$;
```

For very large tables (hundreds of millions of rows), take the backfill out of the migration entirely: ship a nullable column in the migration, and run the backfill as an idempotent, restartable, rate-limited background job. A migration that runs for 40 minutes blocks your entire deploy pipeline and usually can't be safely interrupted.

#### Output

Running that loop against 10 million rows, with `RAISE NOTICE` added per batch:

```output
NOTICE:  batch committed, 5000 rows
NOTICE:  batch committed, 5000 rows
...
NOTICE:  batch committed, 3172 rows
NOTICE:  batch committed, 0 rows
DO
Time: 2841193.402 ms (47:21.193)
```

Forty-seven minutes — and that is the *good* outcome, because each batch committed separately and held its locks for milliseconds. The final `0 rows` is the loop's exit condition: no rows remain where `amount IS NULL`.

Compare a single unbatched `UPDATE` on the same table:

```output
ERROR:  canceling statement due to statement timeout
```

or, without a timeout configured, the symptom everyone remembers:

```output
-- from a concurrent session:
SELECT wait_event_type, wait_event, query FROM pg_stat_activity WHERE state = 'active';

 wait_event_type | wait_event | query
-----------------+------------+---------------------------------------
 Lock            | transactionid | UPDATE orders SET status = 'shipped'...
 Lock            | transactionid | UPDATE orders SET status = 'shipped'...
```

Ordinary application writes piling up behind one long transaction. The forty-seven minutes is why the advice below says to move the backfill out of the migration entirely.

Rules for any backfill:
- **Idempotent** — safe to re-run (`WHERE amount IS NULL`)
- **Restartable** — checkpoint by primary key, not by offset
- **Rate-limited** — watch replica lag, not just wall-clock time
- **Separate from schema change** — so a slow backfill never blocks a fast `ALTER`

---

## Schema Migrations vs Data Migrations

| | Schema migration | Data migration |
|---|---|---|
| Changes | Structure (DDL) | Row contents (DML) |
| Duration | Milliseconds to minutes | Minutes to days |
| Reversible? | Sometimes | Rarely |
| Where it runs | Deploy step, blocking | Background job, ideally |
| Idempotent? | Guarded by the history table | Must be written idempotent |

Keeping them in separate files means a slow data change never holds up a schema change — and a re-run of the data step doesn't double-apply anything.

---

## Multiple Instances, One Database

When ten pods boot simultaneously, all ten try to migrate. Tools handle this with a database lock:

- **Flyway** — `SELECT ... FOR UPDATE` on the history table (PG uses an advisory lock); losers wait, then see nothing pending.
- **Liquibase** — the `DATABASECHANGELOGLOCK` table. Its weakness: if a pod is `SIGKILL`ed mid-migration the row is never released and every subsequent boot hangs until you clear it (`liquibase releaseLocks`).

More robust in orchestrated environments: **don't migrate from application startup at all.** Run migrations as an explicit, single-execution step before rolling out new pods.

```yaml
# Kubernetes: an init-container-free, run-once migration Job
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate-v2-14-0
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: flyway
          image: myapp:2.14.0
          command: ["java", "-jar", "/app.jar", "--spring.flyway.migrate-only=true"]
```

Then gate the deployment on that Job completing. Benefits: one runner, real logs, a clear failure signal, and no lock contention between pods.

---

## Testing and CI

1. **Migrate from empty on every build.** The whole point is that an empty DB plus all migrations equals production's schema. Test it, don't assume it.
2. **Run tests against a real engine**, not H2 — Testcontainers spins up the actual database:

```java
@SpringBootTest
@Testcontainers
class MigrationTest {

  @Container
  static PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16");

  @DynamicPropertySource
  static void props(DynamicPropertyRegistry r) {
    r.add("spring.datasource.url", db::getJdbcUrl);
    r.add("spring.datasource.username", db::getUsername);
    r.add("spring.datasource.password", db::getPassword);
  }

  @Test
  void allMigrationsApplyCleanly() {
    // Flyway ran during context startup; assert the end state
    assertThat(jdbc.queryForObject(
        "SELECT COUNT(*) FROM flyway_schema_history WHERE success = false",
        Integer.class)).isZero();
  }
}
```

3. **Test the upgrade path, not just the fresh install.** Restore a production-shaped dump at version N, apply pending migrations, then run the test suite. Fresh-install tests never catch "this migration fails when the table already has 40M rows and a duplicate email".
4. **Check for drift in CI** — `flyway validate`, or `liquibase diff` between the migrated schema and the live one. A non-empty diff means someone ran manual DDL.
5. **Lint checksums.** Editing an already-applied migration is the single most common mistake; `validate` catches it before deploy, not after.
6. **Time the migration against production-scale data** before it reaches production. "It took 80ms locally" says nothing about a 200M-row table.

### Adopting migrations on an existing database

```bash
# 1. Dump the current schema into V1__baseline.sql
pg_dump --schema-only appdb > V1__baseline.sql

# 2. Tell Flyway this DB is already at version 1 (writes the history row, runs nothing)
flyway baseline -baselineVersion=1 -baselineDescription="existing schema"
```

From then on, every environment either replays `V1__baseline.sql` (new/empty DBs) or is baselined at 1 (existing ones), and both converge at `V2`.

---

## Common Pitfalls

| Pitfall | Why it hurts | Fix |
|---|---|---|
| Editing an applied migration | Checksum mismatch; environments diverge | New migration; never touch history |
| `ddl-auto: update` in production | No history, no review, silent drift | Flyway/Liquibase with `validate` |
| Rename/drop in a single release | Old pods break the moment DDL commits | Expand–contract |
| `CREATE INDEX` without `CONCURRENTLY` | Writes block for the whole build | `CONCURRENTLY` + `executeInTransaction=false` |
| Backfilling millions of rows in one `UPDATE` | Long lock, WAL bloat, replica lag | Batch + commit + sleep |
| No `lock_timeout` | One migration stalls behind a long query and queues all traffic | `SET lock_timeout` at the top |
| Migration files depending on application code | Entity class renamed later ⇒ migration breaks | Plain SQL, frozen forever |
| Duplicate version numbers from parallel branches | Merge conflict or skipped migration | Timestamp prefixes; `out-of-order=false` |
| Assuming down migrations work | Untested and data-destructive | Fix forward; back up before destructive DDL |
| Seeding environment-specific data in a migration | Prod gets test rows | Repeatable migrations for reference data only; app-level seeding for the rest |
| Long transaction wrapping the whole migration on MySQL | No transactional DDL ⇒ half-applied state | One change per file |

---

## Quick Reference

```bash
flyway info | migrate | validate | repair | baseline | clean   # never `clean` in prod
liquibase status | update | rollbackCount 1 | releaseLocks | diff
alembic upgrade head | downgrade -1 | revision --autogenerate -m "msg"
rails db:migrate | db:rollback STEP=1 | db:migrate:status
dotnet ef migrations add Name | database update | migrations script
migrate -path ./db -database "$URL" up | down 1 | force 7
```

| Situation | Do this |
|---|---|
| Add a column | Nullable, no volatile default → backfill → set `NOT NULL` |
| Remove a column | Stop reading → stop writing → drop, one release apart each |
| Rename anything | Expand–contract, 3+ releases |
| Change a column type | New column + dual write + backfill + swap + drop |
| Add an index (PG) | `CREATE INDEX CONCURRENTLY`, outside a transaction |
| Add an FK (PG) | `ADD CONSTRAINT ... NOT VALID` → `VALIDATE CONSTRAINT` |
| Big data change | Separate idempotent, restartable background job |
| Prod migration failed | Fix forward with a new migration; `repair` the history row |

---

## Interview Questions and Answers

### Q: What is a schema migration, and why keep migrations in version control?
A migration is a versioned, ordered, apply-once change to the database structure, stored as code next to the application. Version control gives you review, history, and reproducibility: any environment can be built from scratch or upgraded from any prior version by replaying the migrations it hasn't applied. The alternative — manual DDL — leaves no record and causes environments to drift.

### Q: How does a migration tool know which migrations have already run?
It maintains a history table in the target database (`flyway_schema_history`, `DATABASECHANGELOG`, `alembic_version`, `schema_migrations`). Each row records the version, description, a checksum of the file, who applied it, when, and whether it succeeded. On startup the tool compares the files on disk to that table and applies only the missing ones, in version order.

### Q: What happens if you edit a migration that has already been applied?
The file's checksum no longer matches the value recorded in the history table, and `validate` fails the deploy. That is deliberate: databases that already ran the old version would silently differ from ones that run the new version. The correct fix is a **new** migration. `flyway repair` can re-align checksums, but only use it when you're certain the applied schema already matches the edited file.

### Q: Why do most teams run forward-only migrations instead of rollbacks?
Because rolling a schema back is usually more dangerous than rolling forward. Undoing "add column" destroys data written since deploy; many changes (`DROP COLUMN`, lossy type narrowing) can't be reversed from schema alone; and down migrations almost never run in production, so they're untested. Instead, teams make migrations backward-compatible so the *code* can be rolled back without touching the schema, and fix problems with a new forward migration.

### Q: You need to rename a column on a table with live traffic. How?
Expand–contract, over multiple releases: (1) add the new column, nullable; (2) deploy code that writes both columns, still reading the old one; (3) backfill the new column in batches; (4) deploy code that reads the new column; (5) stop writing the old one; (6) once you're past the rollback window, drop the old column. A single `RENAME COLUMN` breaks every already-running instance the instant it commits.

### Q: Why is adding a `NOT NULL` column with a default risky?
Two reasons. Historically it forced a full table rewrite under an exclusive lock (PostgreSQL ≤ 10; still true for volatile defaults like `now()`, and for many MySQL cases). And it's backward-incompatible in a subtler way: it constrains the table while old code may still `INSERT` rows without that column — safe only if the default covers them. Safe sequence: add nullable → backfill in batches → add the `NOT NULL` constraint.

### Q: How do you add an index to a large table without downtime?
PostgreSQL: `CREATE INDEX CONCURRENTLY`, which doesn't block reads or writes — but it can't run inside a transaction, so tell your tool to skip the wrapping transaction (`-- flyway:executeInTransaction=false`), and check afterwards for an invalid index if the build failed. MySQL 8: `ALTER TABLE ... ALGORITHM=INPLACE, LOCK=NONE` so the server errors out rather than silently blocking; otherwise `gh-ost` or `pt-online-schema-change`.

### Q: Why does transactional DDL matter, and which databases have it?
With transactional DDL, a multi-statement migration that fails rolls back entirely, leaving a clean state. PostgreSQL and SQL Server support it; MySQL, MariaDB, and Oracle do not — each DDL statement auto-commits, so a failure mid-file leaves a half-applied migration that must be repaired manually. That's the main reason to keep one logical change per migration file on MySQL.

### Q: Ten application instances start at once. What stops them from all migrating?
The tool takes a lock in the database before migrating — Flyway uses a row lock/advisory lock on its history table, Liquibase uses `DATABASECHANGELOGLOCK`. The winner migrates; the others block, then find nothing pending. The failure mode is a process killed mid-migration leaving a stale lock (Liquibase: `releaseLocks`). The more robust pattern is not to migrate from app startup at all: run migrations as a single dedicated pre-deploy step or Kubernetes Job.

### Q: How would you backfill 50 million rows?
Not in one statement. Batch it — a few thousand rows per transaction, keyed by primary key so it's restartable, filtered so it's idempotent (`WHERE new_col IS NULL`), with a short pause between batches and monitoring on replica lag. For a table that large, run it as a background job rather than inside a migration, so a multi-hour data change doesn't hold the deploy pipeline hostage or become unsafe to interrupt.

### Q: What's the difference between a versioned and a repeatable migration?
A versioned migration (`V3__...`) runs exactly once, in order, and is the right shape for tables, columns, indexes, and one-off backfills. A repeatable migration (`R__...`) re-runs whenever its checksum changes and runs after all versioned ones — right for objects with idempotent definitions like views, functions, and stored procedures, where you want one file always holding the current definition instead of a scattered chain of edits.

### Q: Why not use Hibernate's `ddl-auto: update` in production?
It never drops or renames, so removed fields leave orphan columns; the generated DDL varies with dialect and entity-scan order; it can't express backfills, batched changes, or `CONCURRENTLY`; it leaves no history and nothing to review; and it can't be tested independently of the app. Use `validate` in production so the app refuses to start against an unexpected schema, and let a migration tool own changes.

### Q: How do you introduce migrations to a database that already exists in production?
Baseline it. Dump the current schema as `V1__baseline.sql`, then run `flyway baseline -baselineVersion=1` against each existing environment, which writes a history row without executing anything. New/empty databases replay the baseline instead. From `V2` onward every environment follows the same path. Then add a CI drift check so nobody resumes making manual changes.

### Q: How do you test migrations?
Apply all migrations to an empty database on every CI build, using the real engine (Testcontainers, not H2), and run the test suite against the result. Separately, test the *upgrade* path: restore a production-shaped dump at the previous version, apply the pending migrations, and verify — that's what catches "fails when the table already has 40M rows and duplicate emails". Also run `validate` to catch edited checksums, and time long migrations against production-scale data before shipping.

### Q: A migration failed halfway through in production. What now?
First determine what actually committed: on PostgreSQL the transaction rolled back and the history row is marked failed; on MySQL, part of the file likely applied. Read the history table, inspect the real schema, and reconcile by hand if needed. Then `flyway repair` to clear/realign the failed row, and fix forward with a new migration rather than attempting an undo. If data was lost, that's a restore/PITR problem, not a migration problem — which is why destructive DDL should always be preceded by a verified backup.

### Q: How do two developers on separate branches avoid migration version collisions?
Timestamp-based prefixes (`20240115093000_add_status.sql`) instead of sequential integers, so both branches get unique, sortable versions. Merging two `V7__` files is a conflict; merging two timestamps isn't. Keep `out-of-order` disabled so a migration that lands with an older timestamp than one already applied fails loudly instead of being silently skipped — then rename it and re-run.

---

## Next Steps

- **Transactions and isolation levels** — what locks a migration actually competes with
- **Indexing** — read `Aggregate-Functions` and the performance notes in `GROUP-BY-and-HAVING`, then revisit index-creation strategy here
- **Blue/green and canary deploys** — how deploy strategy changes what "backward compatible" means
- **Event sourcing / CDC** — Debezium and downstream consumers add another schema-compatibility surface
- **Multi-tenant migrations** — applying the same change across thousands of schemas or shards without a maintenance window
