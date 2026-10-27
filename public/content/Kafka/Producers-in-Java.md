# Kafka: Producers in Java

A **producer** serializes records and sends them to partitions. The client batches records, compresses them, retries on transient errors, and tracks acknowledgements. Most of the decisions that matter are configuration: how many replicas must confirm, how many retries, and how much batching to trade latency for throughput.

## Dependency

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.apache.kafka</groupId>
    <artifactId>kafka-clients</artifactId>
    <version>3.7.0</version>
</dependency>
```

## A working producer

```java
import org.apache.kafka.clients.producer.*;
import org.apache.kafka.common.serialization.StringSerializer;
import java.util.Properties;

public class OrderEventProducer {

    private final KafkaProducer<String, String> producer;

    public OrderEventProducer(String bootstrapServers) {
        Properties props = new Properties();
        props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers);
        props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);

        // Reliability
        props.put(ProducerConfig.ACKS_CONFIG, "all");                       // wait for all in-sync replicas
        props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);          // no duplicates from retries
        props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
        props.put(ProducerConfig.DELIVERY_TIMEOUT_MS_CONFIG, 120_000);

        // Throughput
        props.put(ProducerConfig.LINGER_MS_CONFIG, 5);                      // wait up to 5 ms to fill batches
        props.put(ProducerConfig.BATCH_SIZE_CONFIG, 64 * 1024);
        props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "lz4");

        this.producer = new KafkaProducer<>(props);
    }

    public void publish(String orderId, String json) {
        ProducerRecord<String, String> record =
            new ProducerRecord<>("orders.placed", orderId, json);   // key = orderId

        producer.send(record, (metadata, exception) -> {
            if (exception != null) {
                // Final failure after retries: alert, park the event, or fail the request
                System.err.println("Publish failed for " + orderId + ": " + exception);
            } else {
                System.out.printf("sent %s to partition=%d offset=%d%n",
                    orderId, metadata.partition(), metadata.offset());
            }
        });
    }

    public void close() {
        producer.flush();   // send anything buffered
        producer.close();
    }

    public static void main(String[] args) {
        OrderEventProducer events = new OrderEventProducer("localhost:9092");
        events.publish("o-1001", "{\"orderId\":\"o-1001\",\"total\":129}");
        events.publish("o-1002", "{\"orderId\":\"o-1002\",\"total\":45}");
        events.close();
    }
}
```

```output
sent o-1001 to partition=2 offset=0
sent o-1002 to partition=0 offset=0
```

The partitions depend on the key hash, so your output may differ. Offsets are per partition.

## Synchronous send

Asynchronous `send` with a callback is the default, but sometimes you need the result before continuing (for example, before returning HTTP 201 to a client):

```java
try {
    RecordMetadata meta = producer.send(record).get(5, TimeUnit.SECONDS);
    System.out.println("acknowledged at offset " + meta.offset());
} catch (ExecutionException e) {
    throw new IllegalStateException("event not stored", e.getCause());
}
```

Waiting on every send removes the throughput benefit of batching. Prefer async sends with callbacks, and wait only where the business needs confirmation.

## Acks and what they mean

| `acks` | Waits for | Data loss risk | Use for |
|---|---|---|---|
| `0` | Nothing | High | Metrics where loss is acceptable |
| `1` | Leader write only | Lost if the leader fails before replicating | Rarely the right choice |
| `all` (`-1`) | All in-sync replicas | Only if all in-sync replicas are lost | Business events (default for idempotent producers) |

## Idempotence and retries

Network timeouts make the producer retry, and a retry after a successful write creates a duplicate. `enable.idempotence=true` gives each producer a sequence number per partition, so the broker drops duplicates. It requires `acks=all`, and the client sets the other values for you.

Idempotence covers duplicates caused by the producer's own retries. It does not stop duplicates caused by your application publishing the same business event twice. Make publishing idempotent at the business level as well (event IDs, see the Reliability page).

## Batching and latency

| Setting | Effect |
|---|---|
| `linger.ms` | How long to wait for more records before sending a batch. 0 means send immediately. |
| `batch.size` | Maximum bytes per batch per partition |
| `compression.type` | `lz4` or `zstd` reduce network and disk use with little CPU cost |
| `max.in.flight.requests.per.connection` | With idempotence, up to 5 keeps ordering |
| `buffer.memory` | Memory for unsent records; `send` blocks when it is full |

## Serialization

`StringSerializer` is fine for JSON. For typed events use Avro or Protobuf with a schema registry, so producers and consumers agree on the schema:

```java
props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG,
          io.confluent.kafka.serializers.KafkaAvroSerializer.class);
props.put("schema.registry.url", "http://localhost:8081");
```

Custom serializers implement `org.apache.kafka.common.serialization.Serializer<T>`. Keep them stateless and thread-safe.

## Headers

Headers carry metadata without changing the payload, such as trace IDs or the producing service:

```java
ProducerRecord<String, String> record = new ProducerRecord<>("orders.placed", null, orderId, json);
record.headers()
      .add("traceparent", traceId.getBytes(StandardCharsets.UTF_8))
      .add("source", "orders-service".getBytes(StandardCharsets.UTF_8));
```

## Thread safety and lifecycle

`KafkaProducer` is thread-safe. Create one per application and share it; a producer per request is very expensive. Call `flush()` and `close()` on shutdown, typically from a shutdown hook or the framework's destroy method, so buffered records are not lost.

```java
Runtime.getRuntime().addShutdownHook(new Thread(events::close));
```

## Transactions (exactly-once across topics)

Transactions let a producer write to several topics, and optionally commit consumer offsets, as one atomic unit. Use them for read-process-write pipelines, not for every publish.

```java
props.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "orders-producer-1");
producer.initTransactions();

producer.beginTransaction();
try {
    producer.send(new ProducerRecord<>("orders.placed", orderId, json));
    producer.send(new ProducerRecord<>("audit.log", orderId, "placed"));
    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
    throw e;
}
```

Consumers must set `isolation.level=read_committed` to see only committed records.

## Testing producers

Use Testcontainers for an integration test against a real broker, rather than mocks that hide serialization and partitioning problems:

```java
@Testcontainers
class OrderEventProducerTest {
    @Container
    static KafkaContainer kafka = new KafkaContainer(DockerImageName.parse("apache/kafka:3.7.0"));

    @Test
    void publishesToTopic() {
        var producer = new OrderEventProducer(kafka.getBootstrapServers());
        producer.publish("o-1", "{}");
        producer.close();
        // consume and assert, see the Consumers page
    }
}
```

## Key takeaways

- Use `acks=all` with idempotence for business events; the defaults in this page are a good baseline.
- Send asynchronously with a callback; wait synchronously only where the caller needs confirmation.
- Share one producer per application and close it on shutdown.
- Key by the aggregate ID to keep related events ordered.
- Idempotent producers stop retry duplicates; business idempotency needs event IDs.
