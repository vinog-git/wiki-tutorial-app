# Kafka: Connect, Streams and Schema Registry

Kafka is more than producers and consumers. Three companion pieces cover most real pipelines: **Kafka Connect** moves data between Kafka and other systems without custom code, **Kafka Streams** processes data in your application, and the **Schema Registry** keeps producers and consumers compatible as events change.

## Kafka Connect

Connect runs **connectors** that move data in or out of Kafka:

| Direction | Typical connectors |
|---|---|
| Source (into Kafka) | Debezium (database change data capture), JDBC source, S3 source, file source |
| Sink (out of Kafka) | Elasticsearch sink, JDBC sink, S3 sink, MongoDB sink, Snowflake sink |

Connect workers run as a cluster, distribute tasks, and track offsets in Kafka itself, so they restart cleanly.

### Running Connect

```yaml
# docker-compose.yml excerpt
services:
  connect:
    image: confluentinc/cp-kafka-connect:7.6.0
    depends_on: [kafka, schema-registry]
    ports: ["8083:8083"]
    environment:
      CONNECT_BOOTSTRAP_SERVERS: kafka:9092
      CONNECT_REST_PORT: 8083
      CONNECT_GROUP_ID: connect-cluster
      CONNECT_CONFIG_STORAGE_TOPIC: connect-configs
      CONNECT_OFFSET_STORAGE_TOPIC: connect-offsets
      CONNECT_STATUS_STORAGE_TOPIC: connect-status
      CONNECT_KEY_CONVERTER: org.apache.kafka.connect.storage.StringConverter
      CONNECT_VALUE_CONVERTER: io.confluent.connect.avro.AvroConverter
      CONNECT_VALUE_CONVERTER_SCHEMA_REGISTRY_URL: http://schema-registry:8081
      CONNECT_PLUGIN_PATH: /usr/share/confluent-hub-components
```

Connectors are created with a REST call:

```bash
curl -s -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "name": "orders-db-cdc",
    "config": {
      "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
      "database.hostname": "orders-db",
      "database.port": "5432",
      "database.user": "replicator",
      "database.password": "${file:/secrets/db.properties:password}",
      "database.dbname": "orders",
      "topic.prefix": "orders",
      "table.include.list": "public.orders,public.customers",
      "plugin.name": "pgoutput"
    }
  }'

curl -s http://localhost:8083/connectors/orders-db-cdc/status | python3 -m json.tool
```

```output
{
    "name": "orders-db-cdc",
    "connector": { "state": "RUNNING", "worker_id": "connect:8083" },
    "tasks": [ { "id": 0, "state": "RUNNING", "worker_id": "connect:8083" } ]
}
```

Debezium then publishes one topic per table, for example `orders.public.orders`, with an event for each insert, update and delete.

### Sink example: Kafka to Elasticsearch

```json
{
  "name": "orders-to-es",
  "config": {
    "connector.class": "io.confluent.connect.elasticsearch.ElasticsearchSinkConnector",
    "topics": "orders.public.orders",
    "connection.url": "http://elasticsearch:9200",
    "key.ignore": "false",
    "schema.ignore": "true",
    "behavior.on.null.values": "delete",
    "errors.tolerance": "all",
    "errors.deadletterqueue.topic.name": "orders-to-es.DLQ"
  }
}
```

`errors.tolerance=all` with a dead-letter queue keeps the connector running when individual records are bad.

## Kafka Streams

Kafka Streams is a Java library for stateful stream processing. Your application reads topics, transforms or aggregates them, and writes results back to Kafka. It needs no separate cluster: each application instance is a consumer group member, and state is stored locally and backed up to Kafka.

```xml
<dependency>
    <groupId>org.apache.kafka</groupId>
    <artifactId>kafka-streams</artifactId>
    <version>3.7.0</version>
</dependency>
```

### Count orders per customer in 5-minute windows

```java
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.common.utils.Bytes;
import org.apache.kafka.streams.*;
import org.apache.kafka.streams.kstream.*;
import java.time.Duration;
import java.util.Properties;

public class OrdersPerCustomer {
    public static void main(String[] args) {
        Properties props = new Properties();
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, "orders-per-customer");
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "localhost:9092");
        props.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.PROCESSING_GUARANTEE_CONFIG, StreamsConfig.EXACTLY_ONCE_V2);

        StreamsBuilder builder = new StreamsBuilder();

        builder.stream("orders.placed", Consumed.with(Serdes.String(), Serdes.String()))
               .selectKey((orderId, json) -> extractCustomerId(json))     // re-key by customer
               .groupByKey()
               .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(5)))
               .count(Materialized.as("orders-per-customer-store"))
               .toStream()
               .map((windowed, count) -> KeyValue.pair(
                       windowed.key() + "@" + windowed.window().startTime(), String.valueOf(count)))
               .to("orders.per-customer.5m", Produced.with(Serdes.String(), Serdes.String()));

        KafkaStreams streams = new KafkaStreams(builder.build(), props);
        Runtime.getRuntime().addShutdownHook(new Thread(streams::close));
        streams.start();
    }

    static String extractCustomerId(String json) {
        return json.replaceAll(".*\"customerId\":\"([^\"]+)\".*", "$1");   // use a real JSON parser in practice
    }
}
```

Key concepts:

| Concept | Meaning |
|---|---|
| **KStream** | An unbounded stream of records (each event is independent) |
| **KTable** | A changelog: the latest value per key |
| **GlobalKTable** | A full copy of a small table on every instance (for lookups) |
| **Windowing** | Group events by time: tumbling, hopping, session, sliding |
| **State store** | Local key-value store (RocksDB) backed up to a changelog topic |
| **Repartition topic** | Created automatically when you change the key (`selectKey`, `map`) |

Scale by starting more instances with the same `application.id`. Partitions are shared among instances, so the parallelism limit is the partition count again.

## Schema Registry and schema evolution

Schemas are the contract between producers and consumers. A schema registry stores each schema version and rejects changes that break compatibility.

```bash
# Register a schema
curl -s -X POST http://localhost:8081/subjects/orders.placed-value/versions \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d '{"schemaType":"AVRO","schema":"{\"type\":\"record\",\"name\":\"OrderPlaced\",\"fields\":[{\"name\":\"orderId\",\"type\":\"string\"},{\"name\":\"total\",\"type\":\"double\"}]}"}'

# Check compatibility of a candidate change before deploying it
curl -s -X POST http://localhost:8081/compatibility/subjects/orders.placed-value/versions/latest \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d '{"schemaType":"AVRO","schema":"..."}'
```

```output
{"is_compatible":true}
```

### Compatibility modes

| Mode | Rule | Safe change |
|---|---|---|
| `BACKWARD` (default) | New schema can read data written with the previous schema | Add a field with a default; remove a field |
| `FORWARD` | Old schema can read data written with the new one | Add a field; remove a field with a default |
| `FULL` | Both directions | Add or remove optional fields with defaults only |
| `NONE` | No checks | Avoid in shared topics |

Adding a required field without a default is breaking under every mode except `NONE`.

### Avro example with a default

```json
{
  "type": "record",
  "name": "OrderPlaced",
  "fields": [
    { "name": "orderId", "type": "string" },
    { "name": "total", "type": "double" },
    { "name": "currency", "type": "string", "default": "USD" }
  ]
}
```

Consumers on the old schema ignore `currency`; consumers on the new one read it. Both keep working.

## Choosing the right tool

| Need | Use |
|---|---|
| Copy a database table's changes into Kafka | Connect with Debezium |
| Load Kafka data into a search index or warehouse | Connect sink |
| Compute aggregates or joins over event streams in your code | Kafka Streams |
| Complex analytics over streams with SQL | Apache Flink or ksqlDB |
| Enforce event contracts across teams | Schema Registry with compatibility rules |

## Key takeaways

- Kafka Connect moves data in and out of Kafka with configuration; Debezium CDC is the common source.
- Kafka Streams processes streams in your application, with local state and exactly-once processing.
- Use the Schema Registry with BACKWARD compatibility, and give every new field a default.
- Connect sinks should use a dead-letter queue so one bad record does not stop the pipeline.
