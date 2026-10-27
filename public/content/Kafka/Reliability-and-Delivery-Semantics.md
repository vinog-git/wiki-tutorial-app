# Kafka: Reliability, Delivery Semantics and the Outbox Pattern

"Does Kafka guarantee the message is delivered?" is the most common Kafka interview question, and the honest answer depends on configuration and on your code. This page explains the three delivery semantics, how to get each one, and the outbox pattern that makes "save data and publish event" safe.

## Three delivery semantics

| Semantics | Meaning | How to achieve it | Cost |
|---|---|---|---|
| **At most once** | Might lose a message; never duplicates | Commit offsets before processing; `acks=0` or `1` | Lost events |
| **At least once** | Never loses; might duplicate | Commit after processing; `acks=all`; retries | Consumers must be idempotent |
| **Exactly once** | Each message affects the result once | Idempotent producer + transactions + `read_committed` + idempotent sinks | More complexity and latency |

Kafka's "exactly once" is exactly-once **within Kafka** (read from topic A, write to topic B and commit the offset atomically). Writing to an external database is still at-least-once unless the database write and the offset commit are in the same transaction, or the write is idempotent.

## Where messages can be lost or duplicated

```
Producer ──(1)──▶ Broker leader ──(2)──▶ Replicas
    ▲                    │
    └────(3) ack ◀───────┘

Consumer ──(4) poll──▶ Broker
   │
   ├─ (5) process
   └─ (6) commit offset ──▶ __consumer_offsets
```

| Failure point | Result | Prevention |
|---|---|---|
| Producer send fails (network) | Loss if not retried | Retries, `acks=all`, check the callback |
| Retry after a success that was not acknowledged | Duplicate | Idempotent producer |
| Leader fails before replicas copy | Loss | `acks=all`, `min.insync.replicas=2`, no unclean election |
| Consumer commits before processing, then crashes | Loss | Commit after processing |
| Consumer processes, crashes before commit | Duplicate | Idempotent consumer |
| Consumer exceeds `max.poll.interval.ms` | Rebalance, duplicates | Shorter batches, tune the interval |

## Producer side: safe defaults

```properties
acks=all
enable.idempotence=true
retries=2147483647
delivery.timeout.ms=120000
max.in.flight.requests.per.connection=5
```

Brokers and topics:

```properties
default.replication.factor=3
min.insync.replicas=2
unclean.leader.election.enable=false
```

With these settings a write is acknowledged only after at least two of three replicas have it, and a failed leader does not hand leadership to a stale replica.

## Consumer side: idempotent processing

The consumer must treat redelivered events as no-ops. Three common techniques:

1. **Processed-event table** keyed by `eventId`, written in the same database transaction as the business change:

```sql
CREATE TABLE processed_events (
    event_id     VARCHAR(64) PRIMARY KEY,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

```java
@Transactional
public void charge(OrderPlaced event) {
    try {
        jdbc.update("INSERT INTO processed_events(event_id) VALUES (?)", event.eventId());
    } catch (DuplicateKeyException e) {
        return;                                    // already processed: skip silently
    }
    payments.capture(event.orderId(), event.total());
}
```

The insert and the business change commit together. A redelivery hits the primary key and is skipped.

2. **Natural idempotency**: `UPDATE orders SET status = 'SHIPPED' WHERE id = ? AND status = 'PACKED'`. Running it twice has no extra effect.

3. **Upsert by business key**: `INSERT ... ON CONFLICT (order_id) DO UPDATE ...` for state projections.

## The dual-write problem

A service often needs to save data and publish an event:

```java
orderRepository.save(order);        // step 1: database
kafka.send("orders.placed", event); // step 2: Kafka
```

If step 1 commits and step 2 fails, the order exists but no one knows. If step 2 succeeds and step 1 rolls back, others act on an order that does not exist. You cannot make a database and Kafka commit atomically with plain code.

## The outbox pattern

Write the event to a table in the **same database transaction** as the business change. A separate process publishes outbox rows to Kafka.

```sql
CREATE TABLE outbox (
    id           BIGSERIAL PRIMARY KEY,
    aggregate_id VARCHAR(64) NOT NULL,      -- used as the Kafka key
    topic        VARCHAR(128) NOT NULL,
    event_type   VARCHAR(128) NOT NULL,
    payload      JSONB NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP
);
```

```java
@Transactional
public void placeOrder(Order order) {
    orderRepository.save(order);
    outboxRepository.save(new OutboxEvent(
        order.getId(), "orders.placed", "OrderPlaced",
        objectMapper.writeValueAsString(OrderPlaced.from(order))));
}   // both rows commit or neither does
```

### Publishing from the outbox

Two options:

**Polling publisher**: a scheduled job reads unpublished rows, sends them, and marks them published.

```java
@Scheduled(fixedDelay = 500)
@Transactional
public void publishPending() {
    List<OutboxEvent> batch = outboxRepository.findTop100ByPublishedAtIsNullOrderByIdAsc();
    for (OutboxEvent e : batch) {
        kafka.send(e.getTopic(), e.getAggregateId(), e.getPayload()).get();   // wait for ack
        e.markPublished();
    }
}
```

If the process crashes after sending but before marking, the row is sent again on restart. That is at-least-once, which the consumers already handle.

**Change data capture (CDC)**: Debezium reads the database's write-ahead log and streams outbox inserts to Kafka. No polling, lower latency, and no application code for publishing. Use the Debezium outbox event router to map rows to topics.

```json
{
  "name": "orders-outbox",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "orders-db",
    "database.dbname": "orders",
    "table.include.list": "public.outbox",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.route.by.field": "topic",
    "transforms.outbox.table.field.event.key": "aggregate_id"
  }
}
```

Table cleanup: delete published rows after a retention period, or the outbox grows without bound.

## Ordering across retries

Retries can reorder records unless idempotence is on. With `enable.idempotence=true` and `max.in.flight.requests.per.connection` up to 5, order within a partition is preserved. Without idempotence, set `max.in.flight.requests.per.connection=1` if strict order matters.

## Exactly-once with transactions

For a consume-transform-produce pipeline inside Kafka, a transaction includes the output records and the input offset commit:

```java
producer.beginTransaction();
for (ConsumerRecord<String, String> r : records) {
    producer.send(new ProducerRecord<>("orders.enriched", r.key(), enrich(r.value())));
}
producer.sendOffsetsToTransaction(offsetsOf(records), consumer.groupMetadata());
producer.commitTransaction();
```

Downstream consumers use `isolation.level=read_committed`. Kafka Streams enables this with `processing.guarantee=exactly_once_v2`.

## Dead-letter handling

Poison messages should not stop the partition. Route them to a dead-letter topic with the error details, alert on the DLT depth, and replay after a fix (see the Spring Kafka page).

## Testing failure modes

- Kill a broker during a load test and check no acknowledged writes are missing.
- Kill a consumer mid-batch and check that re-delivered events do not change results.
- Stop the database while publishing and check the outbox drains after recovery.
- Use Toxiproxy or Testcontainers to inject network latency and disconnects.

## Key takeaways

- At-least-once with idempotent consumers is the practical default; exactly-once applies within Kafka.
- Producer: `acks=all`, idempotence, sensible retries. Brokers: replication 3, `min.insync.replicas=2`, no unclean election.
- Consumer: commit after processing; make processing idempotent with an event ID table or natural keys.
- The outbox pattern makes "save and publish" atomic from the application's point of view.
- Debezium CDC can replace the polling publisher when you need lower latency and less code.
