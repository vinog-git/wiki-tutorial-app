# DB: CAP and PACELC

When nodes in a distributed system cannot reach each other, the system must choose what to do: answer with possibly old data, or refuse to answer. CAP names that choice. PACELC extends it to normal operation, when nothing is broken.

## The three letters

- **Consistency (C)**: every read sees the most recent successful write, as if there were a single copy of the data. Formally this is *linearizability*. It is not the same as the "C" in ACID.
- **Availability (A)**: every request to a non-failed node gets a response, not an error or a timeout, even if that response may be stale.
- **Partition tolerance (P)**: the system keeps running when messages between nodes are lost or delayed.

## What CAP actually says

Network partitions happen on any real network, so P is not optional. The useful reading is: **during a partition, you choose between C and A.**

- **CP**: some requests are refused or time out so that answers stay consistent. Example: a single-leader store where the minority side refuses writes.
- **AP**: the system keeps answering and accepts writes on both sides, then reconciles later. Example: a leaderless store that accepts writes on both sides of a split.

The slogan "pick two of three" is common and misleading, because you cannot drop P.

## PACELC: the part CAP leaves out

Most of the time there is no partition, and the trade-off still exists:

- **P**artition: choose **A**vailability or **C**onsistency.
- **E**lse, in normal operation: choose **L**atency or **C**onsistency.

Waiting for replicas to confirm a write makes the data consistent but slower. Answering from the first copy is fast but may return stale data.

## Consistency models

From weakest to strongest, in broad terms:

- **Eventual**: replicas converge if writes stop. Reads can be stale for a while.
- **Causal**: operations that depend on each other are seen in order. A reply is never seen before the question it answers.
- **Linearizable**: all operations appear to take effect atomically in one real-time order. A read after a successful write sees that write.

## Quorums: tuning consistency per request

With N replicas, a write waits for W acknowledgements and a read contacts R replicas. If **R + W > N**, every read overlaps with every successful write on at least one replica.

With N = 3, W = 2 and R = 2, a read of any two replicas includes at least one replica that acknowledged the latest write. Quorum overlap alone does not give full linearizability in every case, for example with concurrent writes or sloppy quorums. Treat it as a tuning knob, and read the system's documentation for the exact guarantee.

Real systems:

- **Apache Cassandra** lets each query choose a consistency level such as `ONE`, `QUORUM` or `ALL`.
- **Amazon DynamoDB** reads are eventually consistent by default, and a request can ask for a strongly consistent read.
- **PostgreSQL with one primary** has a single writer, so there is no partition choice for writes. A synchronous standby adds durability at a latency cost.

## How to implement it

1. For each operation, decide whether it needs the latest value (a balance check, a seat booking) or can accept stale data (a view counter, a recommendation list).
2. Choose the store's default for the safer case. Relax only the operations where measurement shows the cost matters.
3. Set consistency per request in the client, not once for the whole application.
4. Turn on synchronous replication only if the extra write latency is acceptable.
5. Test the choice: stop a replica, and check how each operation behaves.

### PostgreSQL: how many standbys a commit waits for

```
# postgresql.conf on the primary
synchronous_standby_names = 'FIRST 1 (standby_eu)'   # commits wait for one named standby
synchronous_commit = on                              # wait for that standby to flush the WAL
```

Per transaction, for writes you can afford to lose if the primary fails:

```sql
BEGIN;
SET LOCAL synchronous_commit = local;   -- wait only for the local WAL flush, not the standby
INSERT INTO page_views (article_id, viewed_at) VALUES (42, now());
COMMIT;
```

The valid values are `off`, `local`, `on`, `remote_write` and `remote_apply`. `ALTER SYSTEM SET synchronous_standby_names` and `SET LOCAL synchronous_commit` were both accepted on PostgreSQL 16.

### Per-request consistency in drivers

Cassandra (cqlsh; drivers set the level on each statement):

```sql
CONSISTENCY QUORUM;   -- for this cqlsh session
```

DynamoDB, AWS SDK for Java v2:

```java
GetItemRequest request = GetItemRequest.builder()
        .tableName("Orders")
        .key(Map.of("orderId", AttributeValue.fromS(orderId)))
        .consistentRead(true)      // strongly consistent: higher latency and cost than the default
        .build();
```

These two were not run here. They show the setting names as the drivers document them.

## Common mistakes

- Calling a system "a CAP database" as if that were a design. Choose the behaviour you need for each operation.
- Assuming a guarantee the cluster does not give in its default configuration.
- Reading from a replica right after writing to the primary and seeing old data. This breaks read-your-writes; see [Replication and Sharding](/DB/Replication-and-Sharding).
- Treating "eventual" as "soon". Under load the lag can be seconds or minutes.

## Key takeaways

- Partitions happen. The real choice is consistency or availability while they last.
- PACELC: even without partitions, you trade latency for consistency.
- Quorums (R + W > N) let you tune consistency per request.
- Know the default consistency of your store, and whether a request can override it.

Related: [Replication and Sharding](/DB/Replication-and-Sharding), [Multi-Region Database Design](/DB/Multi-Region-Database-Design), [Fault Tolerance](/DB/Fault-Tolerance), [Kafka: Reliability and Delivery Semantics](/Kafka/Reliability-and-Delivery-Semantics).
