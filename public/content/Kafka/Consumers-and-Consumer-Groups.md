# Kafka: Consumers and Consumer Groups

A **consumer** polls the broker for records, processes them, and commits its **offset** to record progress. Consumers in a **group** share the partitions of a topic. Adding consumers spreads the load; if one dies, its partitions move to the others. Most consumer bugs come from offset handling and from processing that takes longer than the poll timeout.

## Dependency and configuration

```xml
<dependency>
    <groupId>org.apache.kafka</groupId>
    <artifactId>kafka-clients</artifactId>
    <version>3.7.0</version>
</dependency>
```

## A working consumer

```java
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.serialization.StringDeserializer;
import java.time.Duration;
import java.util.*;

public class OrderBillingConsumer {

    public static void main(String[] args) {
        Properties props = new Properties();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "billing");
        props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");   // new group starts at the beginning
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);       // we commit after processing
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 100);
        props.put(ConsumerConfig.ISOLATION_LEVEL_CONFIG, "read_committed");

        try (KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props)) {
            consumer.subscribe(List.of("orders.placed"));

            while (true) {
                ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));
                for (ConsumerRecord<String, String> record : records) {
                    System.out.printf("key=%s partition=%d offset=%d value=%s%n",
                        record.key(), record.partition(), record.offset(), record.value());
                    charge(record.value());                  // idempotent business logic
                }
                consumer.commitSync();                       // commit only after the batch is processed
            }
        }
    }

    static void charge(String json) { /* call billing service */ }
}
```

```output
key=o-1001 partition=2 offset=0 value={"orderId":"o-1001","total":129}
key=o-1002 partition=0 offset=0 value={"orderId":"o-1002","total":45}
```

Run two copies of this program with the same `group.id`, and Kafka splits the partitions between them. Each partition is consumed by exactly one member of the group at a time.

## Consumer groups and partition assignment

```
Topic orders.placed: 6 partitions

Group "billing" with 3 consumers:   C1 → [0, 1]   C2 → [2, 3]   C3 → [4, 5]
Group "billing" after C2 dies:      C1 → [0, 1, 2]   C3 → [3, 4, 5]    (rebalance)
Group "shipping" (independent):     C4 → [0 .. 5]                      (reads everything)
```

| Consumers vs partitions | Result |
|---|---|
| Fewer consumers than partitions | Some consumers handle several partitions |
| Equal | One partition each; best balance |
| More consumers than partitions | Extra consumers are idle |

## Offsets: where a group resumes

Each group stores its committed offset per partition in the internal `__consumer_offsets` topic.

| Setting | Meaning |
|---|---|
| `auto.offset.reset=earliest` | No committed offset yet: start at the oldest record |
| `auto.offset.reset=latest` | No committed offset yet: only new records |
| `enable.auto.commit=true` | Commits every few seconds, regardless of whether processing finished |

**At-least-once processing** is the common pattern: disable auto-commit, process, then commit. If the consumer crashes after processing but before committing, the batch is re-delivered. Your processing must tolerate that.

### Commit styles

```java
consumer.commitSync();        // blocks until committed; retries on transient errors
consumer.commitAsync();       // faster; no retry on failure, so use for intermediate commits
```

For per-record control, commit the offset of the next record:

```java
Map<TopicPartition, OffsetAndMetadata> toCommit = Map.of(
    new TopicPartition(record.topic(), record.partition()),
    new OffsetAndMetadata(record.offset() + 1));
consumer.commitSync(toCommit);
```

Committing `offset + 1` means "resume after this record". Committing `offset` re-reads that record on restart.

## Poll loop timing

Kafka removes a consumer from its group if it does not call `poll()` within `max.poll.interval.ms` (default 5 minutes). That triggers a rebalance. Keep processing per batch short, or reduce `max.poll.records`.

| Setting | Default | Purpose |
|---|---|---|
| `max.poll.records` | 500 | Records per `poll()`; lower it if each record is slow |
| `max.poll.interval.ms` | 300000 | Maximum time between polls before the consumer is considered dead |
| `session.timeout.ms` | 45000 | Heartbeat-based liveness timeout |
| `heartbeat.interval.ms` | 3000 | How often heartbeats are sent |

A rebalance pauses all consumers in the group briefly. Frequent rebalances usually mean slow processing or unstable consumers (out-of-memory restarts, crashing pods).

## Rebalancing with the cooperative protocol

The default eager protocol revokes every partition during a rebalance. The cooperative protocol moves only the affected partitions:

```java
props.put(ConsumerConfig.PARTITION_ASSIGNMENT_STRATEGY_CONFIG,
          CooperativeStickyAssignor.class.getName());
```

Use `ConsumerRebalanceListener` to commit offsets before partitions are taken away:

```java
consumer.subscribe(List.of("orders.placed"), new ConsumerRebalanceListener() {
    @Override
    public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
        consumer.commitSync();           // don't lose progress when a partition moves
    }
    @Override
    public void onPartitionsAssigned(Collection<TopicPartition> partitions) { }
});
```

## Seeking and replay

Replay is one of Kafka's main advantages. Seek to an offset, or to a point in time:

```java
consumer.assign(List.of(new TopicPartition("orders.placed", 0)));
consumer.seekToBeginning(consumer.assignment());          // full replay

// Replay from a timestamp (for example, after fixing a bug from yesterday)
Map<TopicPartition, Long> times = Map.of(new TopicPartition("orders.placed", 0),
                                         Instant.parse("2026-10-26T00:00:00Z").toEpochMilli());
Map<TopicPartition, OffsetAndMetadata> offsets = consumer.offsetsForTimes(times)
    .entrySet().stream()
    .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey,
        e -> new OffsetAndMetadata(e.getValue().offset())));
consumer.seek(new TopicPartition("orders.placed", 0), offsets.get(new TopicPartition("orders.placed", 0)).offset());
```

Use a **new consumer group** for a replay, so the original group's offsets are not disturbed.

## Lag: the most important metric

Consumer lag is the number of records between the consumer's committed offset and the partition's end. Growing lag means consumers are falling behind.

```bash
docker exec kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --describe --group billing
```

```output
GROUP    TOPIC           PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG   CONSUMER-ID
billing  orders.placed   0          1450            1452            2     consumer-billing-1-...
billing  orders.placed   1          1290            1290            0     consumer-billing-2-...
```

Alert on lag that keeps growing over several minutes, not on a single spike.

## Error handling

A poison record (malformed JSON, a business rule violation) must not block the partition forever. Options:

1. **Dead-letter topic**: catch the failure, publish the record and error to `orders.placed.DLT`, commit, and continue.
2. **Bounded retries with backoff** for transient errors (database down), then the dead-letter topic.
3. **Stop and alert** only for systemic failures, such as a broken deployment.

```java
try {
    charge(record.value());
} catch (InvalidEventException e) {
    dlt.send(new ProducerRecord<>("orders.placed.DLT", record.key(), record.value()));
} catch (TransientException e) {
    throw e;   // let the consumer retry this batch after a pause
}
```

Spring Kafka provides retry and dead-letter handling out of the box (next page).

## Static membership

Give each consumer a stable `group.instance.id` (for example, the pod name in a StatefulSet). A restart within the session timeout then does not cause a rebalance:

```java
props.put(ConsumerConfig.GROUP_INSTANCE_ID_CONFIG, System.getenv("HOSTNAME"));
```

## Key takeaways

- A consumer group shares partitions; the partition count caps the parallelism.
- Disable auto-commit for at-least-once processing, and commit after processing.
- Keep each poll batch short enough to finish within `max.poll.interval.ms`.
- Use dead-letter topics for poison records, and alert on lag trends.
- Replay by seeking, and use a new group for replay so live offsets are not affected.
