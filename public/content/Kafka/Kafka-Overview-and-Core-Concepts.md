# Kafka: Overview and Core Concepts

**Apache Kafka** is a distributed event streaming platform. Producers write events to durable, replicated logs called **topics**; consumers read them at their own pace, and events stay on disk for a configurable retention period. Kafka is used for event-driven microservices, activity tracking, log and metrics pipelines, change data capture from databases, and stream processing.

## Why Kafka, and not a plain queue?

| Question | Traditional queue (RabbitMQ, SQS) | Kafka |
|---|---|---|
| After a consumer reads a message, is it gone? | Usually yes (acknowledged and deleted) | No: events stay for the retention period |
| Can a new consumer read history? | Usually no | Yes, from any offset |
| Can many independent systems read the same events? | Via fan-out setup | Yes, each consumer group keeps its own position |
| Ordering | Per queue, varies | Guaranteed per partition |
| Throughput | Thousands to tens of thousands per second | Hundreds of thousands to millions per second per cluster |

Think of Kafka as a **distributed commit log**, not a mailbox.

## Core concepts

| Term | Meaning |
|---|---|
| **Event / record** | A key, a value (payload), a timestamp, and optional headers |
| **Topic** | A named stream of records, e.g. `orders.placed` |
| **Partition** | An ordered, append-only sub-log of a topic. Partitions are the unit of parallelism. |
| **Offset** | A record's sequential position within its partition |
| **Broker** | A Kafka server that stores partitions |
| **Cluster** | A set of brokers working together |
| **Replication factor** | How many brokers hold a copy of each partition (typically 3 in production) |
| **Leader / follower** | One replica per partition handles reads and writes; followers copy it |
| **ISR** | In-Sync Replicas: the replicas caught up with the leader |
| **Producer** | Client that writes records |
| **Consumer** | Client that reads records |
| **Consumer group** | Consumers sharing a `group.id`; each partition goes to exactly one member |
| **Controller** | Broker that manages leader election and cluster metadata |

```
Topic: orders.placed  (3 partitions, replication factor 3)

Partition 0:  [o-1|o-4|o-7|o-10 ...]   leader on broker 1, followers on 2 and 3
Partition 1:  [o-2|o-5|o-8|o-11 ...]   leader on broker 2
Partition 2:  [o-3|o-6|o-9|o-12 ...]   leader on broker 3

Consumer group "billing" (3 consumers): each consumer owns one partition
Consumer group "shipping" (2 consumers): partitions split between them
```

Both groups read every record, independently, with their own offsets.

## Ordering and keys

- Kafka guarantees order **within a partition**, not across the topic.
- Records with the same **key** always go to the same partition (hash of the key). So all events for `orderId=o-1001` stay in order if you key by order ID.
- Without a key, records spread across partitions round-robin.

## KRaft instead of ZooKeeper

Early Kafka used ZooKeeper to store cluster metadata. Modern Kafka (3.3+ production-ready, 4.0 removed ZooKeeper) uses **KRaft** mode: brokers form their own Raft quorum for metadata. Setup is simpler and recovery is faster. New clusters should use KRaft.

## Running a local broker

A single-node KRaft broker in Docker is enough for learning and tests:

```yaml
# docker-compose.yml
services:
  kafka:
    image: apache/kafka:3.7.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0
      KAFKA_NUM_PARTITIONS: 3
```

```bash
docker compose up -d kafka
docker exec kafka /opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092 | head -1
```

```output
localhost:9092 (id: 1 rack: null isFenced: false) -> (
```

## Command-line round trip

Create a topic, produce a message, and consume it:

```bash
docker exec kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 \
  --create --topic hello --partitions 3 --replication-factor 1

echo '{"orderId":"o-1001","total":129}' | docker exec -i kafka \
  /opt/kafka/bin/kafka-console-producer.sh --bootstrap-server localhost:9092 --topic hello

docker exec kafka /opt/kafka/bin/kafka-console-consumer.sh --bootstrap-server localhost:9092 \
  --topic hello --from-beginning --max-messages 1
```

```output
Created topic hello.
{"orderId":"o-1001","total":129}
Processed a total of 1 messages
```

## Where Kafka fits in a full stack

| Layer | Kafka role |
|---|---|
| Service-to-service | Asynchronous events instead of synchronous calls (`OrderPlaced` → billing, shipping, notifications) |
| Data | Change data capture (Debezium) streams database changes to other systems |
| Observability | Logs and metrics pipelines (Fluent Bit → Kafka → Elasticsearch) |
| Analytics | Stream processing with Kafka Streams or Flink |

## Key takeaways

- Kafka is a durable, partitioned, replicated log; consumers track their own offsets.
- Ordering is per partition; use a meaningful key (such as an aggregate ID) to keep related events ordered.
- Consumer groups scale reading; the number of partitions caps the parallelism within a group.
- Use KRaft for new clusters and a replication factor of 3 in production.
