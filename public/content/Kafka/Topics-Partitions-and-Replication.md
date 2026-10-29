# Kafka: Topics, Partitions and Replication

Topic design decides how much parallelism, ordering and fault tolerance you get. Most production issues trace back to partition counts, keys, or replication settings chosen without thinking about them.

## Creating and describing topics

```bash
K="docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092"

$K --create --topic orders.placed --partitions 6 --replication-factor 1
$K --describe --topic orders.placed
```

```output
Topic: orders.placed  TopicId: Qk3... PartitionCount: 6  ReplicationFactor: 1
  Topic: orders.placed  Partition: 0  Leader: 1  Replicas: 1  Isr: 1
  Topic: orders.placed  Partition: 1  Leader: 1  Replicas: 1  Isr: 1
  ...
```

In a three-broker production cluster, the same command shows `Replicas: 1,2,3` and an `Isr` list that should match.

## Topic configuration

| Config | Meaning | Typical production value |
|---|---|---|
| `partitions` | Parallelism and max consumers per group | Plan for future growth; 6 to 50 for busy topics |
| `replication.factor` | Copies of each partition | 3 |
| `min.insync.replicas` | Minimum ISR size for a write with `acks=all` to succeed | 2 (with replication factor 3) |
| `retention.ms` | How long to keep records | 7 days (604800000) by default |
| `retention.bytes` | Size limit per partition | Set when disk is a concern |
| `cleanup.policy` | `delete` (time/size) or `compact` (keep latest per key) | `compact` for state or changelog topics |
| `max.message.bytes` | Largest record accepted | Keep small; store large payloads in S3 and send a reference |

```bash
$K --create --topic customers.state --partitions 6 --replication-factor 3 \
  --config cleanup.policy=compact --config min.insync.replicas=2
$K --alter --topic orders.placed --config retention.ms=259200000   # 3 days
$K --describe --topic orders.placed --topic customers.state
```

## Partition count: how to choose

- Max consumers in a group equals the partition count. Extra consumers sit idle.
- Each partition adds file handles, memory and replication traffic. Thousands of partitions per topic slow leader elections.
- A rough start: `partitions = max(expected peak throughput / per-partition throughput, expected consumer count)`, with headroom.
- You **can** increase partitions later, but keys will then map to different partitions, so per-key ordering for existing keys can break during the change. Plan up front.

```bash
$K --alter --topic orders.placed --partitions 12
```

## Keys and partitioning

The default partitioner hashes the key:

```
partition = hash(key) % number_of_partitions
```

| Key choice | Result |
|---|---|
| `orderId` | Per-order ordering; even spread across partitions |
| `customerId` | All events for a customer in order; a very active customer creates a hot partition |
| `null` | Round-robin; no ordering across records |
| Constant (e.g. `"all"`) | Everything in one partition; a bottleneck; avoid |

Choose a key with many distinct values and a natural ordering scope (an aggregate ID is typical).

## Replication and leaders

For each partition, one replica is the **leader** and serves all reads and writes. Followers fetch from the leader and join the **ISR** when caught up. If the leader fails, the controller elects a new leader from the ISR.

```
Partition 0, replication factor 3, min.insync.replicas 2

   broker 1 (leader)  ✓ in ISR
   broker 2 (follower) ✓ in ISR
   broker 3 (follower) ✗ lagging, out of ISR
```

With `acks=all` and `min.insync.replicas=2`, a write succeeds only when at least two copies have it. Lose two brokers and writes are refused rather than silently lost. That is the correct trade-off for most business data.

### Unclean leader election

`unclean.leader.election.enable` lets an out-of-sync replica become leader. It keeps availability but can lose acknowledged records. Keep it `false` (the default) for data you cannot lose.

## Consuming topic metadata in code

```java
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.common.TopicPartitionInfo;
import java.util.*;

public class TopicInspector {
    public static void main(String[] args) throws Exception {
        Properties props = new Properties();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");

        try (Admin admin = Admin.create(props)) {
            var desc = admin.describeTopics(List.of("orders.placed")).allTopicNames().get();
            for (TopicPartitionInfo p : desc.get("orders.placed").partitions()) {
                System.out.printf("partition=%d leader=%s replicas=%s isr=%s%n",
                    p.partition(), p.leader().id(), p.replicas(), p.isr());
            }
        }
    }
}
```

```output
partition=0 leader=1 replicas=[1, 2, 3] isr=[1, 2, 3]
partition=1 leader=2 replicas=[2, 3, 1] isr=[2, 3, 1]
```

Topics are often created by infrastructure code, not by applications. Manage them with Terraform (the Kafka provider), Strimzi (`KafkaTopic` resources on Kubernetes), or a reviewed script, so partition and replication decisions get reviewed.

## Naming and schemas

- Name topics `<domain>.<entity>.<event>` in lowercase, e.g. `orders.order.placed`. Dots and underscores should not be mixed, because metric names can collide.
- Version the event schema, not the topic name. Use a schema registry (Avro, Protobuf or JSON Schema) with compatibility rules.
- One topic per event type is simpler to reason about than one topic per service.

## Retention and disk

```bash
$K --describe --topic orders.placed --config retention.ms
docker exec kafka du -sh /var/lib/kafka/data
```

Retention is per partition. Size the disk as `daily ingest × retention days × replication factor × 1.3` for headroom.

## Deleting a topic

```bash
$K --delete --topic hello
```

Deletion is irreversible and removes all data for the topic. Confirm the topic name and check the consumers that depend on it first.

## Non-Functional Requirements and Disaster Recovery

Replication settings decide what a broker failure costs. With the production settings above, a broker can fail without losing an acknowledged message. Losing a whole region needs a second cluster, and Kafka does not switch to it on its own.

### Non-functional requirements

| Requirement | Target | Setting |
|---|---|---|
| No acknowledged message lost in a cluster | RPO of zero | `replication.factor=3`, `min.insync.replicas=2`, producers with `acks=all` |
| Broker failure | A short pause while a new leader is elected | The same settings; one broker can fail and writes continue |
| No data loss from a stale replica | Safe leader election | `unclean.leader.election.enable=false` (the default) |
| Region failure | Under 5 minutes | A second cluster kept current with MirrorMaker 2 |

With `min.insync.replicas=2` and three replicas, one broker can fail and writes continue. If two are down, producers using `acks=all` get errors for the affected partitions. That is the trade-off: those partitions refuse writes rather than accept writes that could be lost.

### Cross-region failover with MirrorMaker 2

MirrorMaker 2 copies topics and consumer group offsets from the primary cluster to a second cluster. Replication is asynchronous, so messages not yet copied when the primary fails are missing from the secondary. That gap is your RPO.

```properties
# mm2.properties
clusters = primary, dr
primary.bootstrap.servers = kafka-primary:9092
dr.bootstrap.servers = kafka-dr:9092
primary->dr.enabled = true
primary->dr.topics = orders.*
```

Failover is a runbook, not a single switch:

1. Confirm the primary is down, and decide whether to accept the gap.
2. Point producers at the DR cluster.
3. Point consumers at the DR cluster. They resume from the translated offsets that MirrorMaker 2 writes as checkpoints.
4. Reconcile the gap when the primary returns.

A five-minute target means this runbook is scripted and rehearsed. Measure the time from the decision to the first message consumed on the DR cluster.

## Key takeaways

- Cross-region failover is asynchronous with MirrorMaker 2, and Kafka does not do it by itself. Rehearse the switch, and treat the replication lag as your RPO.
- The partition count sets the maximum parallelism for a consumer group; plan it because it is hard to undo cleanly.
- Choose keys for the ordering you need, and avoid hot keys.
- Production: replication factor 3, `min.insync.replicas=2`, `acks=all`, no unclean leader election.
- Use `cleanup.policy=compact` for state topics where only the latest value per key matters.
- Create topics through reviewed infrastructure code, not ad hoc.
