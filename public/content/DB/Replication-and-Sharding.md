# DB: Replication and Sharding

Replication keeps copies of the same data on several machines, for availability and read capacity. Sharding (partitioning across machines) splits the data itself, for storage and write capacity. They are often used together, but they solve different problems.

## Replication

### Leader and followers

One node, the **leader**, accepts writes. It sends the changes to **followers**, which serve reads.

- **Synchronous** replication: the leader waits for a follower to confirm before reporting success. Nothing is lost on failover, but a slow or dead follower slows every write.
- **Asynchronous** replication: the leader reports success immediately. This is fast, but the newest writes can be lost if the leader dies before they are copied.
- **Replication lag**: followers can fall seconds or more behind under load.

### Problems to design for

- **Read-your-writes**: a user saves a profile, then reads from a replica that has not caught up, and sees the old profile. Fix it by reading from the leader for that user for a short time after a write, or by routing by session or version.
- **Monotonic reads**: a user sees newer data, then older data on the next request because it hit a more lagged replica. Fix it by pinning a user to one replica.
- **Failover**: promoting a follower must pick the most up-to-date copy. If the old leader comes back, it must step down, or the system has **split brain**, with two leaders accepting writes. Use a consensus-based system or fencing tokens.

### Multi-leader and leaderless

- **Multi-leader**: each region has a leader, and writes on both sides are merged later. This needs conflict resolution such as last-write-wins, merge rules or CRDTs.
- **Leaderless** (Dynamo-style): any replica accepts writes, and reads and writes go to a quorum. See [CAP and PACELC](/DB/CAP-and-PACELC).

### Replication is not backup

Replication copies mistakes as well. A `DROP TABLE` or a bad `UPDATE` reaches every follower within seconds. Keep point-in-time backups separately.

## Sharding (partitioning)

Each shard holds a subset of the rows, and each row lives on exactly one shard, chosen by a **shard key**.

- **Range partitioning**: customers 1 to 1M on shard A, 1M to 2M on shard B. Good for range queries and time-ordered data, but recent writes all hit one shard, which is a hot spot.
- **Hash partitioning**: shard = `hash(customer_id) mod N`. Writes spread evenly, but a range query must touch every shard.
- **Consistent hashing**: shards sit on a ring, so adding a node moves only a fraction of the keys. Many distributed stores use it.

PostgreSQL's declarative partitioning splits a table within one server. That is partitioning, not sharding across machines. Sharding across servers needs a system that routes queries, such as Citus, Vitess, CockroachDB or Cassandra, or routing code in the application.

### Choosing a shard key

- Pick a key with high cardinality that is spread evenly, such as `customer_id` or `tenant_id`, not `country` or `status`.
- Match the main query. A query that includes the shard key goes to one shard; any other query fans out to all of them.
- Avoid a key that is effectively the time alone when every write goes to "now".

### Costs

- **Cross-shard queries** need scatter-gather and are slower.
- **Cross-shard transactions** need two-phase commit or a saga. ACID across shards is much harder than inside one database; see [ACID Transactions](/DB/ACID-Transactions).
- **Rebalancing** means moving data between shards while the system keeps serving traffic.
- **Joins across shards** are expensive. Keep related data on the same shard; for tenants, see [Multi-Tenant Database Design](/DB/Multi-Tenant-Database-Design).

## How to implement it

1. Add one read replica first. Send only reads that tolerate lag to it, and measure the lag.
2. Set up streaming replication, and fail over with a tool you have tested, such as Patroni or your cloud provider's managed failover.
3. For large append-only tables, partition by time. For multi-tenant tables, partition by a hash of the tenant.
4. Include the partition key in every primary key and unique constraint. PostgreSQL rejects the table otherwise.
5. For sharding across servers, pick the shard key, route queries in the application, and test the cross-shard queries you still need.

### Streaming replication (PostgreSQL)

```
# postgresql.conf on the primary
wal_level = replica
max_wal_senders = 10
```

Create a standby from a base backup. The `-R` flag writes the connection settings and creates the standby marker file:

```bash
pg_basebackup -h primary.internal -U replicator -D /var/lib/postgresql/data -R -X stream
```

Monitor lag on the primary:

```sql
SELECT application_name, state, sent_lsn, replay_lsn,
       pg_wal_lsn_diff(sent_lsn, replay_lsn) AS replay_lag_bytes
FROM pg_stat_replication;
```

The configuration keys and the lag query were checked on PostgreSQL 16. A live standby was not set up for this page, so the `pg_basebackup` step is not run here.

### Partitioning

```sql
-- range: time-ordered data; old partitions can be dropped cheaply
CREATE TABLE events (
  tenant_id  BIGINT NOT NULL,
  id         BIGINT GENERATED ALWAYS AS IDENTITY,
  created_at TIMESTAMPTZ NOT NULL,
  payload    JSONB,
  PRIMARY KEY (tenant_id, id, created_at)   -- the partition key must be part of the key
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_11 PARTITION OF events
  FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');

-- hash: spreads tenants across partitions
CREATE TABLE tenant_events (
  tenant_id BIGINT NOT NULL,
  id        BIGINT GENERATED ALWAYS AS IDENTITY,
  payload   JSONB,
  PRIMARY KEY (tenant_id, id)
) PARTITION BY HASH (tenant_id);

CREATE TABLE tenant_events_p0 PARTITION OF tenant_events FOR VALUES WITH (MODULUS 4, REMAINDER 0);
-- and REMAINDER 1, 2 and 3 for the other partitions
```

Checked on PostgreSQL 16. A primary key on `(tenant_id, id)` alone, in the range-partitioned table, fails with `unique constraint on partitioned table must include all partitioning columns`. With few rows, hash partitions can be uneven, so judge the spread on real data.

### Route to a shard (sketch)

```java
// The same key must always map to the same shard. With modulo hashing,
// changing SHARD_COUNT means moving data between shards.
static DataSource shardFor(long tenantId) {
    int shard = Math.floorMod(Long.hashCode(tenantId), SHARD_COUNT);
    return shards.get(shard);
}
```

## Common mistakes

- Sharding too early. A well-tuned single server with replicas handles far more than people expect.
- A shard key that makes one shard hot.
- Forgetting that a replica can be behind when the application reads from it.
- Using replication as a backup.

## Key takeaways

- Replication gives copies for availability and read scale. Choose synchronous or asynchronous knowingly.
- Plan for replica lag. Read-your-writes and failover are the usual traps.
- Sharding splits data for capacity, and the shard key decides almost everything.
- Cross-shard queries and transactions are the price. Keep them off the hot path.

Related: [Normalization and Denormalization](/DB/Normalization-and-Denormalization), [Kafka: Topics, Partitions and Replication](/Kafka/Topics-Partitions-and-Replication), [Multi-Region Database Design](/DB/Multi-Region-Database-Design).
