# Kafka Interview Questions

Short answers first, with the page that has the depth.

## Core concepts

**1. What is Kafka?**
A distributed, partitioned, replicated commit log for event streaming. Producers append records to topics; consumers read at their own pace using offsets, and records are retained for a configured period. *(See Overview.)*

**2. Kafka vs a traditional message queue?**
A queue usually deletes a message once consumed; Kafka keeps records for the retention period, so many independent consumer groups can read the same events and new consumers can replay history. *(See Overview.)*

**3. What is a partition and why does it matter?**
A partition is an ordered, append-only log inside a topic. It is the unit of ordering (guaranteed within a partition only) and of parallelism (one consumer per partition per group). *(See Overview and Topics.)*

**4. What is an offset?**
A sequential ID for a record within a partition. Consumers store the offset of their next record per partition to track progress. *(See Consumers.)*

**5. How does Kafka guarantee ordering?**
Within a single partition only. Records with the same key always go to the same partition, so keying by aggregate ID keeps related events ordered. *(See Topics.)*

**6. What is a consumer group?**
A set of consumers sharing a `group.id`. Each partition is assigned to exactly one member at a time, so the group reads the topic in parallel. Different groups read independently. *(See Consumers.)*

**7. What happens when a consumer in a group dies?**
After the session timeout, the group coordinator triggers a rebalance and reassigns its partitions to the remaining members, which continue from the last committed offset. *(See Consumers.)*

**8. What is the maximum parallelism for a group?**
The number of partitions. Extra consumers sit idle. *(See Topics.)*

**9. What is ISR?**
In-Sync Replicas: the replicas that are caught up with the leader. `min.insync.replicas` sets how many must have a write before `acks=all` succeeds. *(See Topics and Reliability.)*

**10. What is KRaft?**
Kafka's built-in Raft-based metadata management, replacing ZooKeeper. Brokers hold metadata in a Raft quorum (controller role), simplifying operations and speeding up recovery. *(See Overview.)*

## Reliability and semantics

**11. Explain the three delivery semantics.**
At most once (may lose, never duplicates), at least once (never loses, may duplicate), and exactly once (each record affects the result once). Kafka's exactly-once is within Kafka's own read-process-write flows, using idempotent producers and transactions. *(See Reliability.)*

**12. How do you achieve no data loss on the producer side?**
`acks=all`, `enable.idempotence=true`, retries with a delivery timeout, and handling the failure callback. On brokers, replication factor 3 and `min.insync.replicas=2`, with unclean leader election disabled. *(See Producers and Reliability.)*

**13. What does an idempotent producer prevent?**
Duplicates caused by its own retries. It assigns sequence numbers per partition, and the broker drops repeats. It does not stop an application from publishing the same business event twice. *(See Producers.)*

**14. How do you make consumers idempotent?**
Record processed event IDs in the same transaction as the business change, or use naturally idempotent updates. *(See Reliability.)*

**15. What is the dual-write problem and how do you solve it?**
Saving to a database and publishing to Kafka cannot be atomic with plain code, so one can succeed without the other. The outbox pattern writes the event to an outbox table in the same database transaction, and a poller or CDC connector publishes it to Kafka. *(See Reliability.)*

**16. What is a dead-letter topic?**
A topic that receives records that repeatedly fail processing, with error details in headers. It keeps the partition moving and lets you investigate and replay later. *(See Spring Kafka.)*

**17. How do you handle a poison message?**
Limit retries with backoff, send it to a dead-letter topic, commit, and alert on DLT volume. Never let one bad record block a partition indefinitely. *(See Consumers and Spring Kafka.)*

## Configuration and internals

**18. What does `acks` control?**
How many replicas must acknowledge a write before the producer considers it successful: 0 (none), 1 (leader), or all in-sync replicas. *(See Producers.)*

**19. What is `auto.offset.reset`?**
What a consumer group does when there is no committed offset: `earliest` starts from the beginning, `latest` starts from new records. *(See Consumers.)*

**20. Why disable auto-commit?**
With auto-commit, offsets can be committed before processing finishes, which risks loss on a crash. Commit after successful processing for at-least-once semantics. *(See Consumers.)*

**21. What causes a rebalance?**
A consumer joining or leaving, a consumer missing heartbeats or exceeding `max.poll.interval.ms`, or partition count changes. Frequent rebalances usually point to slow processing or unstable consumers. *(See Consumers.)*

**22. What is the cooperative rebalance protocol?**
A rebalance strategy that moves only the partitions that must change, instead of revoking all partitions from every consumer. *(See Consumers.)*

**23. How does Kafka store data on disk?**
As segment files per partition, with an index for offset lookup. Old segments are deleted by time or size, or compacted to keep the latest value per key. *(See Topics and Operations.)*

**24. What is log compaction?**
A cleanup policy that keeps the most recent record for each key and removes older ones. A null value (tombstone) removes the key. Used for state and changelog topics. *(See Topics.)*

**25. Why is the partition count hard to change?**
Increasing it changes the key-to-partition mapping, so records for an existing key can move to a different partition, breaking per-key ordering during the transition. *(See Topics.)*

**26. What is a leader election and when does it happen?**
When a partition's leader broker fails, the controller elects a new leader from the ISR. With unclean election enabled, an out-of-sync replica may be chosen, risking loss of acknowledged records. *(See Topics and Operations.)*

## Ecosystem

**27. What is Kafka Connect?**
A framework for moving data between Kafka and external systems using connectors, configured via REST, with distributed workers and offset tracking. *(See Connect.)*

**28. What is Debezium?**
A CDC connector that reads a database's transaction log and publishes row changes to Kafka topics. Often used for the outbox pattern. *(See Connect and Reliability.)*

**29. What is Kafka Streams and how does it differ from a consumer?**
A Java library for stateful stream processing (aggregations, joins, windows) that runs inside your application. It has local state stores backed by changelog topics, and supports exactly-once processing. *(See Connect and Streams.)*

**30. What is a KTable?**
A changelog stream interpreted as a table: the latest value per key. Contrast with a KStream, where each record is an independent event. *(See Connect and Streams.)*

**31. What is the Schema Registry for?**
Storing event schemas and enforcing compatibility rules (for example BACKWARD) so producers and consumers can evolve independently. *(See Connect and Streams.)*

**32. How do you evolve an Avro event safely?**
Add optional fields with defaults, avoid renaming or removing required fields, and check compatibility in the registry before deploying. *(See Connect and Streams.)*

## Operations

**33. Which metrics do you alert on?**
Offline partitions, under-minimum-ISR partitions (writes refused), under-replicated partitions, active controller count not equal to one, consumer lag trends, disk usage, and request handler idle time. *(See Operations.)*

**34. A consumer group's lag keeps growing. What do you check?**
Lag per partition to see whether it is one stuck partition or the whole group; processing time per record; downstream latency; consumer count versus partition count; and rebalance frequency. *(See Operations.)*

**35. How do you reprocess the last day of events?**
Stop the consumers, reset the offsets with `kafka-consumer-groups --reset-offsets --to-datetime` (dry-run first), and restart. Use a new group if the original group's progress must be kept. Consumers must be idempotent. *(See Operations and Consumers.)*

**36. How do you secure a Kafka cluster?**
TLS for encryption in transit, SASL or mTLS for authentication, and ACLs for authorization per principal, topic and group. Managed services offer IAM-based authentication (such as Amazon MSK). *(See Operations.)*

**37. How do you size a cluster?**
From events per second, average size, replication factor, retention and compression, plus headroom: disk, network and partition count per broker. *(See Operations.)*

## Scenario questions

**38. Design an order pipeline where billing, shipping and notifications all react to an order being placed, and no order can be silently lost.**
Order service saves the order and an outbox row in one transaction. Debezium publishes the outbox to `orders.placed`, keyed by order ID, with `acks=all` and replication factor 3. Each consumer group (billing, shipping, notifications) processes idempotently using the event ID, commits after processing, and sends poison records to a dead-letter topic. Lag, DLT depth and under-replicated partitions are alerted on. The schema is registered with BACKWARD compatibility.

**39. Consumers process events in the wrong order after a retry. Why, and how do you fix it?**
Without idempotence and with several in-flight requests, a retried batch can land after a later one. Enable idempotent producers (keeps order with up to five in-flight requests) or set `max.in.flight.requests.per.connection=1` where strict order matters. Also check that the key is the aggregate ID.

**40. A single partition has most of the lag, and the others are fine. What now?**
A hot key or a poison record is blocking that partition. Check the offset of the stuck record, inspect its content, and dead-letter it if it is malformed. If one key is genuinely hot, consider a finer key, a separate topic for that key's traffic, or batching for that key.

**41. The team wants exactly-once end to end, including writes to PostgreSQL. What do you tell them?**
Kafka's exactly-once covers Kafka-to-Kafka flows. For a database sink, achieve effectively-once: store processed event IDs in the same database transaction as the write, or use idempotent upserts. Kafka transactions cannot span a PostgreSQL commit.

**42. Your cluster lost a broker and writes are failing. What happened and how do you recover?**
If two brokers are down with replication factor 3 and `min.insync.replicas=2`, partitions drop below the minimum ISR and `acks=all` writes are refused, which is correct: no silent loss. Restore brokers, verify under-replicated partitions return to zero, and do not lower `min.insync.replicas` as a shortcut. Then review why two brokers failed together (zone placement, shared disks).

## Quick-fire

- **Broker vs cluster?** A broker is one server; a cluster is the set of brokers.
- **Controller?** The broker that manages leader election and metadata.
- **Record structure?** Key, value, timestamp, headers.
- **Compression?** Set on the producer; lz4 and zstd are common.
- **`linger.ms`?** How long to wait to fill a batch.
- **Tombstone?** A null-value record that deletes a key in a compacted topic.
- **Retention vs compaction?** Retention deletes by age or size; compaction keeps the latest per key.
- **Kafka vs Pulsar vs Kinesis?** All streaming platforms; Kinesis is managed by AWS with shards; Pulsar separates serving and storage layers.
