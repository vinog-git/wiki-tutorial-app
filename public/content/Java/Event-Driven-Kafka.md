# Java: Event-Driven Architecture with Kafka

## Why Kafka?

In synchronous microservices (REST calls), if the receiving service is down, the caller fails. Kafka decouples producer and consumer: the producer publishes an event and carries on. The consumer processes it when it's ready — even if it was offline.

| Concern | REST (Sync) | Kafka (Async) |
|---|---|---|
| Coupling | Tight — caller knows receiver | Loose — producer doesn't know consumers |
| Failure isolation | Consumer down = producer fails | Consumer down = messages queue up |
| Ordering | Per-request | Per-partition, by key |
| Replay | Not possible | Yes — consumers read from any offset |
| Fan-out | Call each receiver separately | Many consumers on one topic |

## Core Concepts

| Concept | Meaning |
|---|---|
| **Event** | Immutable record of something that happened ("bill generated") |
| **Topic** | Named log of events (like a table in a DB) |
| **Partition** | A topic is split into N partitions; each partition is an ordered log |
| **Producer** | Publishes events to a topic |
| **Consumer** | Reads events from a topic |
| **Consumer group** | Multiple consumers sharing the load; each partition is consumed by one member |
| **Offset** | Position of a message within a partition |
| **Broker** | Kafka server that stores and serves messages |

## Electricity Billing System — Event Flow

The electricity board uses Kafka to wire 9 services together:

```
Field Agent (mobile)
    │
    ▼
meter-reading-service
    │
    │ publishes: meter.readings.recorded
    ▼
Kafka
    │
    ├──▶ billing-service          consumes meter.readings.recorded
    │         │                   → calculates bill
    │         │ publishes: bill.generated
    │         ▼
    │       Kafka
    │         │
    │         └──▶ notification-service   → emails customer
    │
payment-service
    │ publishes: payment.completed
    ▼
Kafka
    ├──▶ receipt-service    → generates PDF, uploads to S3, publishes receipt.generated
    └──▶ notification-service → emails receipt link
```

### Topic Registry

```java
public final class Topics {
    public static final String METER_READINGS_RECORDED = "meter.readings.recorded";
    public static final String BILL_GENERATED          = "bill.generated";
    public static final String PAYMENT_INITIATED       = "payment.initiated";
    public static final String PAYMENT_COMPLETED       = "payment.completed";
    public static final String PAYMENT_FAILED          = "payment.failed";
    public static final String RECEIPT_GENERATED       = "receipt.generated";

    private Topics() {}  // utility class
}
```

Keeping all topic names in one constants class prevents typos across services.

## Docker Compose Setup (KRaft Mode — no Zookeeper)

Kafka 3.7 with KRaft — no Zookeeper dependency:

```yaml
kafka:
  image: bitnami/kafka:3.7
  container_name: ebs-kafka
  ports:
    - "9092:9092"    # internal Docker network
    - "9094:9094"    # external (host access)
  environment:
    KAFKA_CFG_NODE_ID: 0
    KAFKA_CFG_PROCESS_ROLES: controller,broker
    KAFKA_CFG_CONTROLLER_QUORUM_VOTERS: 0@kafka:9093
    KAFKA_CFG_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093,EXTERNAL://:9094
    KAFKA_CFG_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092,EXTERNAL://localhost:9094
    KAFKA_CFG_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT,EXTERNAL:PLAINTEXT
    KAFKA_CFG_INTER_BROKER_LISTENER_NAME: PLAINTEXT
    KAFKA_CFG_CONTROLLER_LISTENER_NAMES: CONTROLLER
    KAFKA_CFG_AUTO_CREATE_TOPICS_ENABLE: "true"

kafka-ui:
  image: provectuslabs/kafka-ui:latest
  ports:
    - "8090:8080"
  environment:
    KAFKA_CLUSTERS_0_NAME: local
    KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
```

Two listeners:
- `PLAINTEXT://kafka:9092` — used by other Docker containers (service-to-service)
- `EXTERNAL://localhost:9094` — used by apps running on the host machine

## Spring Boot Producer Setup

### Dependencies

```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
</dependency>
```

### Consumer Application Config

```yaml
# billing-service/application.yml
spring:
  application:
    name: billing-service
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP:localhost:9094}
    consumer:
      group-id: billing-service              # all instances share one group — Kafka distributes partitions
      auto-offset-reset: earliest            # on first start, read from the beginning
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      properties:
        spring.json.trusted.packages: "com.electricity.billing.events"
        spring.json.use.type.headers: false
        spring.json.value.default.type: com.electricity.billing.events.MeterReadingRecordedEvent
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      properties:
        spring.json.add.type.headers: false  # don't embed Java type in header (cleaner for cross-service)
```

## Shared Event DTOs

Events live in a shared `common-events` module — both producer and consumer depend on it:

```java
// MeterReadingRecordedEvent — produced by meter-reading-service, consumed by billing-service
public record MeterReadingRecordedEvent(
    Long readingId,
    Long customerId,
    BigDecimal unitsConsumed,
    LocalDate readingDate
) {}

// BillGeneratedEvent — produced by billing-service, consumed by notification-service
public record BillGeneratedEvent(
    Long billId,
    Long customerId,
    Long readingId,
    BigDecimal unitsConsumed,
    BigDecimal energyCharges,
    BigDecimal fixedCharges,
    BigDecimal taxes,
    BigDecimal totalAmount,
    LocalDate dueDate,
    LocalDateTime generatedAt
) {}
```

Using Java records for events: immutable, compact, no getters/setters needed.

## Kafka Consumer (billing-service)

```java
@Component
public class MeterReadingListener {

    private static final Logger log = LoggerFactory.getLogger(MeterReadingListener.class);

    private final BillRepository bills;
    private final TariffClient tariff;
    private final KafkaTemplate<String, Object> kafka;

    public MeterReadingListener(BillRepository bills, TariffClient tariff,
                                KafkaTemplate<String, Object> kafka) {
        this.bills = bills;
        this.tariff = tariff;
        this.kafka = kafka;
    }

    @KafkaListener(topics = Topics.METER_READINGS_RECORDED, groupId = "billing-service")
    public void onReading(MeterReadingRecordedEvent event) {

        // Idempotency check: Kafka delivers "at least once" — we may get duplicates
        // Guard with a unique key (readingId) before processing
        if (bills.findByReadingId(event.readingId()).isPresent()) {
            log.info("Skipping duplicate reading {}", event.readingId());
            return;
        }

        // Sync REST call to tariff-service (wrapped in Resilience4j circuit breaker)
        var breakdown = tariff.calculate("DOMESTIC", event.unitsConsumed());

        Bill bill = new Bill();
        bill.setCustomerId(event.customerId());
        bill.setReadingId(event.readingId());
        bill.setUnitsConsumed(event.unitsConsumed());
        bill.setEnergyCharges(breakdown.energyCharges());
        bill.setFixedCharges(breakdown.fixedCharges());
        bill.setTaxes(breakdown.taxes());
        bill.setTotalAmount(breakdown.total());
        bill.setDueDate(LocalDate.now().plusDays(15));

        Bill saved = bills.save(bill);

        // Publish downstream event
        var generated = new BillGeneratedEvent(
                saved.getId(), saved.getCustomerId(), saved.getReadingId(),
                saved.getUnitsConsumed(), saved.getEnergyCharges(), saved.getFixedCharges(),
                saved.getTaxes(), saved.getTotalAmount(), saved.getDueDate(), saved.getGeneratedAt());

        kafka.send(Topics.BILL_GENERATED, saved.getCustomerId().toString(), generated);
        log.info("Generated bill {} for customer {} amount={}",
                saved.getId(), saved.getCustomerId(), saved.getTotalAmount());
    }
}
```

#### Input

A message published to `meter-readings.recorded`, keyed by customer id:

```json
{
  "readingId": "rd-90211",
  "customerId": 7,
  "unitsConsumed": 340,
  "recordedAt": "2026-09-23T09:15:00Z"
}
```

#### Output

> Log output on this page is **illustrative** — representative of a real run, not captured from one, since it needs a running Kafka cluster and the services deployed.

```output
INFO  o.a.k.c.c.internals.ConsumerCoordinator : [Consumer clientId=billing-1, groupId=billing-service]
      Successfully joined group with generation 4
INFO  o.a.k.c.c.internals.ConsumerCoordinator : Adding newly assigned partitions:
      meter-readings.recorded-0, meter-readings.recorded-1, meter-readings.recorded-2
INFO  c.e.b.listener.MeterReadingListener : Generated bill 5012 for customer 7 amount=2856.40
```

Redeliver the **same** message — which Kafka will do if the consumer dies before committing its offset — and the idempotency guard takes the other branch:

```output
INFO  c.e.b.listener.MeterReadingListener : Skipping duplicate reading rd-90211
```

One log line, no second bill, no second `BillGeneratedEvent`. Remove that guard and the customer is billed twice for one reading — the single most common event-driven bug.

Start a **second** instance of the service and watch the partitions redistribute:

```output
INFO  o.a.k.c.c.internals.ConsumerCoordinator : [Consumer clientId=billing-1, groupId=billing-service]
      Revoke previously assigned partitions meter-readings.recorded-0, -1, -2
INFO  o.a.k.c.c.internals.ConsumerCoordinator : Adding newly assigned partitions:
      meter-readings.recorded-0, meter-readings.recorded-1
```

Instance 1 gave up partition 2 to instance the new one. That rebalance is automatic, and it is why the partition count caps your parallelism: with 3 partitions, a fourth instance in the same group would sit idle.

Key points:
- `@KafkaListener(groupId = "billing-service")` — if you run 3 instances, Kafka distributes partitions across all 3. Each message processed by exactly one instance.
- The message key is `customerId` — all events for the same customer go to the same partition, preserving order.
- Idempotency check before saving prevents duplicate bills on redelivery.

## Kafka Producer

```java
@Configuration
public class KafkaConfig {

    // Explicitly create the topic with 3 partitions
    // (auto-creation gives 1 partition — not suitable for parallel consumption)
    @Bean
    public NewTopic billGeneratedTopic() {
        return TopicBuilder.name(Topics.BILL_GENERATED)
                .partitions(3)
                .replicas(1)
                .build();
    }
}
```

```java
// Publishing an event (producer side)
kafka.send(Topics.BILL_GENERATED, customerId.toString(), billGeneratedEvent);
//                                ─────────────────────
//                                message key — events with the same key
//                                go to the same partition (ordering guarantee)
```

## Notification Consumer (fan-out pattern)

Multiple topics, one listener class:

```java
@Component
public class NotificationListener {

    @KafkaListener(topics = Topics.BILL_GENERATED, groupId = "notification-service")
    public void onBillGenerated(BillGeneratedEvent event) {
        // email: "Your electricity bill is ready — ₹345.50 due by 2025-07-17"
        emailService.send(event.customerId(), "Bill ready", buildBillEmail(event));
    }

    @KafkaListener(topics = Topics.PAYMENT_COMPLETED, groupId = "notification-service")
    public void onPaymentCompleted(PaymentCompletedEvent event) {
        // email: "Payment received — ₹345.50"
        emailService.send(event.customerId(), "Payment received", buildPaymentEmail(event));
    }

    @KafkaListener(topics = Topics.RECEIPT_GENERATED, groupId = "notification-service")
    public void onReceiptGenerated(ReceiptGeneratedEvent event) {
        // email: "Download your receipt: https://..."
        emailService.send(event.customerId(), "Your receipt", buildReceiptEmail(event));
    }
}
```

## At-Least-Once Delivery and Idempotency

Kafka guarantees **at-least-once** delivery: a message might be delivered more than once if the consumer crashes after processing but before committing the offset.

**Design every consumer to be idempotent:**

```java
// Check for existing record before processing
if (bills.findByReadingId(event.readingId()).isPresent()) {
    log.info("Skipping duplicate reading {}", event.readingId());
    return;
}
```

Use a unique key from the event (readingId, paymentId, etc.) as the idempotency key.

## Message Ordering

Ordering is guaranteed **within a partition**. If you need all events for customer 7 in order:

```java
// Use customerId as the message key
kafka.send(topic, customerId.toString(), event);
```

All messages with the same key hash to the same partition → delivered in order to one consumer instance.

## Inspecting Kafka with Kafka UI

Open `http://localhost:8090` after starting with docker-compose:

1. **Topics** — see all topics, partition count, message count
2. **Messages** — browse actual messages (key, value, offset, timestamp)
3. **Consumer Groups** — see lag per partition (lag = messages produced but not yet consumed)

#### Output

The same information is available from the CLI, and this is the output to know how to read:

```output
$ kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
    --describe --group billing-service

GROUP            TOPIC                      PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG   CONSUMER-ID
billing-service  meter-readings.recorded    0          15234           15234           0     billing-1-a3f
billing-service  meter-readings.recorded    1          15102           15890           788   billing-1-a3f
billing-service  meter-readings.recorded    2          14998           14998           0     billing-2-b71
```

`LAG` is `LOG-END-OFFSET - CURRENT-OFFSET`: how many messages have been produced that this group has not yet processed. Partition 1 is 788 behind while the others are caught up — a lag concentrated on **one** partition usually means a hot key, not an undersized consumer. Here every event for a single high-volume customer hashes to the same partition, so adding instances will not help; the fix is a better key.

A `CONSUMER-ID` of `-` on a row means no instance currently owns that partition, and its lag will grow without bound.

Consumer lag is the most important operational metric for Kafka. Lag growing = your consumer can't keep up.

## Interview Questions

**Q: What is a consumer group?**
- Multiple instances of a service form a group. Kafka distributes partitions across group members so each message is processed by exactly one instance. Scale the consumer group by adding instances — more members = more partitions processed in parallel.

**Q: How does Kafka guarantee ordering?**
- Within a single partition, messages are ordered by offset. Use a consistent key (e.g., customerId) to route all related messages to the same partition.

**Q: What is the difference between a queue and a topic?**
- A queue delivers each message to one consumer and removes it. A Kafka topic retains messages for a configured period; multiple consumer groups can each read all messages independently. Kafka is a log, not a queue.

**Q: What is consumer lag?**
- The number of messages in a partition that have been produced but not yet consumed. Lag = latest offset − committed offset. High lag means the consumer is falling behind and may need more instances.

**Q: How do you handle schema evolution?**
- Additive changes (new optional fields) are backwards compatible. Use a schema registry (Confluent or AWS Glue) for strict governance. Avro/Protobuf are preferred over plain JSON for strongly-typed schemas with evolution support.

**Q: What is at-least-once vs exactly-once delivery?**
- At-least-once: message may be redelivered if consumer crashes before committing. Make consumers idempotent.
- Exactly-once: Kafka supports this with transactional producers + consumers (Kafka Transactions), but it's complex. Most systems use at-least-once + idempotent consumers.
