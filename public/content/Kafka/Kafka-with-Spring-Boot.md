# Kafka with Spring Boot

Spring for Apache Kafka wraps the raw client in `KafkaTemplate` for sending and `@KafkaListener` for consuming. It handles consumer threads, commits, retries and dead-letter topics, so you write business code instead of poll loops. This is how most Java teams use Kafka.

## Dependencies and configuration

```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
</dependency>
```

```yaml
# application.yml
spring:
  kafka:
    bootstrap-servers: localhost:9092
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
      properties:
        enable.idempotence: true
        compression.type: lz4
    consumer:
      group-id: billing
      auto-offset-reset: earliest
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      enable-auto-commit: false
      properties:
        spring.json.trusted.packages: com.acme.orders.events
        isolation.level: read_committed
    listener:
      ack-mode: record         # Spring commits after each record succeeds
```

Spring Boot auto-configures the `ProducerFactory`, `ConsumerFactory` and `KafkaTemplate` from these properties.

## An event class

Use a record for the event payload. Keep it backward compatible: add optional fields rather than renaming or removing them.

```java
package com.acme.orders.events;

import java.math.BigDecimal;
import java.time.Instant;

public record OrderPlaced(
        String eventId,         // unique per event, used for idempotency
        String orderId,
        String customerId,
        BigDecimal total,
        Instant placedAt
) {}
```

## Publishing with KafkaTemplate

```java
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import java.util.UUID;
import java.time.Instant;

@Service
public class OrderEvents {

    private final KafkaTemplate<String, OrderPlaced> kafka;

    public OrderEvents(KafkaTemplate<String, OrderPlaced> kafka) {
        this.kafka = kafka;
    }

    public void orderPlaced(String orderId, String customerId, BigDecimal total) {
        var event = new OrderPlaced(UUID.randomUUID().toString(), orderId, customerId, total, Instant.now());
        kafka.send("orders.placed", orderId, event)          // key = orderId
             .whenComplete((result, ex) -> {
                 if (ex != null) {
                     // log and alert; or fail the business transaction, see the outbox pattern
                 }
             });
    }
}
```

`send` returns a `CompletableFuture`. Use `.get()` only where the caller must know the result before continuing.

## Consuming with @KafkaListener

```java
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class BillingListener {

    private final BillingService billing;
    private final ProcessedEvents processed;   // table of eventIds already handled

    public BillingListener(BillingService billing, ProcessedEvents processed) {
        this.billing = billing;
        this.processed = processed;
    }

    @KafkaListener(topics = "orders.placed", groupId = "billing", concurrency = "3")
    public void onOrderPlaced(OrderPlaced event) {
        if (!processed.markIfNew(event.eventId())) {
            return;                                         // duplicate delivery: already charged
        }
        billing.charge(event.orderId(), event.total());
    }
}
```

`concurrency = "3"` starts three consumer threads in the group. It should not exceed the partition count of the topic, or the extra threads sit idle.

### Batch listeners

For high throughput, receive a list per poll:

```java
@KafkaListener(topics = "audit.log", groupId = "audit", batch = "true")
public void onBatch(List<ConsumerRecord<String, String>> records) {
    auditStore.saveAll(records);
}
```

With batch listeners, set `ack-mode: batch` so offsets are committed once the whole batch is processed.

## Retries and dead-letter topics

Spring's `DefaultErrorHandler` retries with backoff, then sends the failed record to a dead-letter topic. Configure it once:

```java
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.ExponentialBackOff;
import org.springframework.context.annotation.*;

@Configuration
public class KafkaErrorConfig {

    @Bean
    public DefaultErrorHandler errorHandler(KafkaTemplate<Object, Object> template) {
        var recoverer = new DeadLetterPublishingRecoverer(template);   // → <topic>-dlt
        var backOff = new ExponentialBackOff(500L, 2.0);              // 0.5 s, 1 s, 2 s ...
        backOff.setMaxElapsedTime(30_000L);                           // give up after 30 s
        return new DefaultErrorHandler(recoverer, backOff);
    }
}
```

Mark errors that should not be retried, such as a malformed event:

```java
DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);
handler.addNotRetryableExceptions(IllegalArgumentException.class, DeserializationException.class);
```

Spring Boot wires the `DefaultErrorHandler` bean into the listener container factory automatically. Replay dead-lettered records after fixing the cause:

```bash
docker exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic orders.placed-dlt --from-beginning --property print.headers=true
```

The DLT record carries headers such as `kafka_dlt-exception-message` and `kafka_dlt-original-topic`, which explain the failure.

## Testing with an embedded or real broker

```java
@SpringBootTest
@EmbeddedKafka(partitions = 1, topics = "orders.placed")
class OrderEventsTest {

    @Autowired
    OrderEvents events;

    @Autowired
    BillingListener listener;   // or a test consumer that captures records

    @Test
    void placedOrderIsPublished() {
        events.orderPlaced("o-1001", "c-42", BigDecimal.valueOf(129));
        // assert with a test consumer, or with KafkaTestUtils
    }
}
```

For tests closer to production, use Testcontainers (`KafkaContainer`) so the real broker behaviour is exercised.

## Kafka and HTTP: request flow

```
Client ──POST /orders──▶ OrderController
                             │ save order in DB
                             │ publish OrderPlaced (acks=all)
                             ▼
                        Kafka: orders.placed
                             │
           ┌─────────────────┼──────────────────┐
           ▼                 ▼                  ▼
    BillingListener    ShippingListener   NotificationListener
```

The HTTP request returns once the order is saved. Other services react asynchronously. Note the gap: if the database commit succeeds and the publish fails, the event is lost. The outbox pattern closes that gap (next page).

## Key takeaways

- `KafkaTemplate` sends; `@KafkaListener` consumes; the framework manages threads and commits.
- Use a unique `eventId` and store processed IDs to make consumers idempotent.
- Set `concurrency` no higher than the partition count.
- Configure `DefaultErrorHandler` with backoff and a dead-letter topic.
- Save-then-publish can lose events on failure; use the outbox pattern for reliable publishing.
