# Kafka: Operations, Security and Monitoring

Running Kafka well means watching the right metrics, sizing the cluster, securing access, and having runbooks for broker failures and lag. This page covers the operational side for a production cluster and a realistic local setup.

## A local cluster with Docker Compose

Three KRaft brokers and a web UI, for testing replication and failover:

```yaml
# docker-compose.yml
name: kafka-lab

x-common: &common
  image: apache/kafka:3.7.0
  restart: unless-stopped

services:
  kafka-1:
    <<: *common
    hostname: kafka-1
    ports: ["19092:9092"]
    environment: &env
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka-1:9093,2@kafka-2:9093,3@kafka-3:9093
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_NODE_ID: 1
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:19092
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk

  kafka-2:
    <<: *common
    hostname: kafka-2
    ports: ["29092:9092"]
    environment:
      <<: *env
      KAFKA_NODE_ID: 2
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:29092

  kafka-3:
    <<: *common
    hostname: kafka-3
    ports: ["39092:9092"]
    environment:
      <<: *env
      KAFKA_NODE_ID: 3
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:39092

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    depends_on: [kafka-1, kafka-2, kafka-3]
    ports: ["8080:8080"]
    environment:
      KAFKA_CLUSTERS_0_NAME: lab
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka-1:9092,kafka-2:9092,kafka-3:9092
```

Note the `CLUSTER_ID` on each broker must be identical. Generate a new one with `kafka-storage.sh random-uuid` for each new cluster. Some images read `CLUSTER_ID` from the environment; if yours does not, format storage once with the same ID before starting.

```bash
docker compose up -d
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 \
  --create --topic orders.placed --partitions 6 --replication-factor 3
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 \
  --describe --topic orders.placed | head -3
```

```output
Topic: orders.placed  PartitionCount: 6  ReplicationFactor: 3
  Topic: orders.placed  Partition: 0  Leader: 2  Replicas: 2,3,1  Isr: 2,3,1
```

### Failover drill

Stop one broker and check that the topic stays writable with `acks=all` and `min.insync.replicas=2`:

```bash
docker stop kafka-lab-kafka-2-1
docker exec kafka-1 /opt/kafka/bin/kafka-topics.sh --bootstrap-server kafka-1:9092 \
  --describe --topic orders.placed | head -3
```

```output
Topic: orders.placed  PartitionCount: 6  ReplicationFactor: 3
  Topic: orders.placed  Partition: 0  Leader: 3  Replicas: 2,3,1  Isr: 3,1
```

Leadership moved to broker 3, and the ISR now has two members, so writes still succeed. Stop a second broker and writes with `acks=all` fail with `NotEnoughReplicasException`, which is the intended safe behaviour.

## Key metrics

| Metric (JMX) | What it tells you | Alert when |
|---|---|---|
| `UnderReplicatedPartitions` | Partitions with fewer in-sync replicas than configured | Above 0 for more than a few minutes |
| `UnderMinIsrPartitionCount` | Partitions below `min.insync.replicas` (writes refused with acks=all) | Above 0 (page) |
| `OfflinePartitionsCount` | Partitions with no leader | Above 0 (page) |
| `ActiveControllerCount` | Should be exactly 1 across the cluster | Not 1 |
| `RequestHandlerAvgIdlePercent` | Broker thread saturation | Below 30% |
| `NetworkProcessorAvgIdlePercent` | Network thread saturation | Below 30% |
| `BytesInPerSec` / `BytesOutPerSec` | Throughput per broker | Capacity planning |
| Consumer `records-lag-max` | Worst consumer lag | Growing over 10 minutes |
| Producer `record-error-rate` | Failed sends | Above baseline |
| Producer `request-latency-avg` | Broker response time | Sustained increase |
| Disk usage per broker | Retention and ingest vs capacity | Above 70% |

Export JMX through the Prometheus JMX exporter and graph in Grafana (see the Grafana section). A typical dashboard has four panels: under-replicated partitions, bytes in/out, consumer lag per group, and disk.

## Consumer lag monitoring

```bash
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 \
  --describe --group billing
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 \
  --list
```

Lag per partition tells you whether one partition is stuck (a poison record or a hot key) or the whole group is slow (add consumers or optimise processing).

## Reset consumer offsets (carefully)

Reprocessing from an earlier point is sometimes necessary. Stop all consumers in the group first, or the command is rejected:

```bash
docker exec kafka-1 /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka-1:9092 \
  --group billing --topic orders.placed --reset-offsets --to-datetime 2026-10-26T00:00:00.000 --execute
```

```output
GROUP    TOPIC           PARTITION  NEW-OFFSET
billing  orders.placed   0          1032
billing  orders.placed   1          987
```

Use `--dry-run` first. Resetting to the past reprocesses events, so the consumers must be idempotent.

## Retention and log cleanup

| Setting | Scope | Notes |
|---|---|---|
| `log.retention.hours` | Broker default | 168 (7 days) |
| `retention.ms` | Per topic | Overrides the broker default |
| `log.segment.bytes` | Segment size (default 1 GiB) | Segments are deleted or compacted as a whole |
| `cleanup.policy=compact` | Per topic | Keeps the latest value per key |
| `delete.retention.ms` | Compacted topics | How long tombstones (null values) are kept |

A tombstone (a record with a null value) deletes a key from a compacted topic. Useful for state topics.

## Security

Production clusters should use three layers:

| Layer | Mechanism |
|---|---|
| Encryption in transit | TLS listeners (`SSL` or `SASL_SSL` protocol) |
| Authentication | SASL/SCRAM, SASL/OAUTHBEARER, mTLS, or AWS IAM (MSK) |
| Authorization | ACLs per principal and topic, or Ranger / OPA |

```properties
# client.properties for SASL_SSL with SCRAM
security.protocol=SASL_SSL
sasl.mechanism=SCRAM-SHA-512
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required \
    username="billing" password="${KAFKA_PASSWORD}";
ssl.truststore.location=/etc/kafka/truststore.jks
ssl.truststore.password=${TRUSTSTORE_PASSWORD}
```

```bash
# Grant the billing service read access to its topic and group
kafka-acls.sh --bootstrap-server kafka-1:9093 --command-config admin.properties \
  --add --allow-principal User:billing --operation Read --topic orders.placed
kafka-acls.sh --bootstrap-server kafka-1:9093 --command-config admin.properties \
  --add --allow-principal User:billing --operation Read --group billing
```

Managed Kafka options:

| Service | Notes |
|---|---|
| **Amazon MSK** | Managed brokers in your VPC; IAM authentication; MSK Connect for connectors |
| **Confluent Cloud** | Fully managed, plus Schema Registry, ksqlDB and connectors |
| **Aiven, Redpanda Cloud** | Managed Kafka-compatible options |

On AWS, MSK removes broker patching and replacement work. You still own topics, consumers, schemas and sizing.

## Capacity planning

A quick sizing approach:

```
ingest throughput (MB/s)         = events/s × average event size
replicated write load            = ingest × replication factor
disk per broker                  = ingest × 86400 × retention_days × replication factor / brokers × 1.3
network per broker               ≈ (ingest × RF) / brokers  +  consumer fan-out reads
```

Example: 5,000 events/s at 1 KB each is about 5 MB/s. With replication factor 3 and 7-day retention, the cluster stores about 5 × 86,400 × 7 × 3 ≈ 9 TB before compression. Compression (lz4 or zstd) often reduces that by half or more, and the 1.3 factor adds headroom.

## Runbooks

| Incident | First steps |
|---|---|
| Consumer lag growing | Check `kafka-consumer-groups` per partition; look for one stuck partition; scale consumers up to the partition count; check downstream latency |
| `NotEnoughReplicasException` on produce | Check broker health and `UnderMinIsrPartitionCount`; restore the failed broker; do not lower `min.insync.replicas` to hide the problem |
| Under-replicated partitions after a broker restart | Wait for the broker to catch up; check disk and network; check `replica.lag.time.max.ms` |
| Disk full on a broker | Check topic sizes with `kafka-log-dirs`; shorten retention on high-volume topics; add disk or brokers |
| Rebalance storm | Look for consumers exceeding `max.poll.interval.ms`; check GC pauses and crash loops |
| Controller changes often | Check controller quorum health and network stability between brokers |

## Upgrades

- Upgrade brokers one at a time, waiting for the ISR to recover between each.
- Follow the upgrade order in the release notes (metadata version first in KRaft).
- Upgrade clients after brokers, and test with a canary consumer group.

## Key takeaways

- Alert on under-replicated and offline partitions, and on consumer lag trends.
- Use three brokers, replication factor 3, and `min.insync.replicas=2` for resilience to one broker failure.
- Secure with TLS, authentication, and ACLs; managed services such as MSK simplify broker operations.
- Practise failover and offset resets on a lab cluster before you need them in production.
