# Apache NiFi: Visual Data Flows

**Apache NiFi** moves, routes, transforms and tracks data between systems. You build flows in a browser by dragging **processors** onto a canvas and wiring them together. NiFi pairs well with Kafka: it ingests from many sources, converts formats and routes data at the edge, and Kafka carries the resulting events to your services.

## Core concepts

| Concept | What it is |
|---|---|
| FlowFile | One unit of data: its content (the bytes) plus attributes (key-value metadata) |
| Processor | A step that reads, transforms, routes or writes FlowFiles, such as `ListFile`, `ConvertRecord` or `PublishKafka` |
| Relationship | A named output of a processor, such as `success` or `failure`. You wire each one to a connection |
| Connection | A queue between two processors, with back-pressure limits and prioritization |
| Process Group | A container for related processors. Like a folder |
| Controller Service | A shared resource a processor uses: an SSL context, a database pool, or record readers and writers |
| Provenance | The lineage of every FlowFile: where it came from, what touched it, where it went |

**Back-pressure** stops an upstream processor from producing more work when a connection's queue is full. The defaults are 10,000 FlowFiles or 1 GB, whichever is reached first.

## Run NiFi locally

```bash
docker run --name nifi -p 8443:8443 \
  -e SINGLE_USER_CREDENTIALS_USERNAME=admin \
  -e SINGLE_USER_CREDENTIALS_PASSWORD=ChangeThisPassword123 \
  apache/nifi:2.0.0
```

Open `https://localhost:8443/nifi` and accept the self-signed certificate warning. The password must be at least 12 characters. Pin a current NiFi release.

## Build a flow: files to Kafka

This flow picks up CSV files, converts each one to JSON records, and publishes every record to a Kafka topic. Files that fail go to an error folder, so nothing is dropped.

1. Add **ListFile** with `Input Directory` set to `/data/in`, then **FetchFile** to read the content. Connect `success` from ListFile to FetchFile.
2. Add **ConvertRecord**. Give it a `CSVReader` and a `JsonRecordSetWriter` as controller services. Connect FetchFile `success` to it.
3. Add **PublishKafka** and set:
   - `Kafka Brokers`: `kafka:9092`
   - `Topic Name`: `orders`
   - `Delivery Guarantee`: `Guarantee Replicated Delivery`
4. Connect ConvertRecord `success` to PublishKafka.
5. Add **PutFile** with `Directory` set to `/data/error`. Connect `failure` from each processor to it.

Enable the controller services before starting the processors. The Controller Services list in the canvas settings shows each service's state.

Consuming from Kafka uses **ConsumeKafka** with the same broker settings, plus a `Group ID` and an `Offset Reset` policy. It sends records on to any processor, such as a PutDatabaseRecord.

## NiFi and Kafka Connect

Both move data into and out of Kafka. They suit different work:

| | Apache NiFi | Kafka Connect |
|---|---|---|
| Interface | Visual canvas | Configuration and REST API |
| Strength | Many protocols and formats, routing, transformation, provenance | Reliable source and sink connectors with Kafka's offset tracking |
| Typical source | Files, HTTP endpoints, SFTP, legacy systems | Database change data capture with Debezium |
| Scaling | A NiFi cluster | Connect worker group |
| Good for | Ops-driven ingestion and routing | Standard, always-on pipelines between systems |

## Operating NiFi

- **Find the bottleneck.** When a queue fills, look at the downstream processor's failure and bulletin messages first. The warning icon on a processor shows its last error.
- **Trace data.** Use provenance to see where a specific FlowFile went and what happened to it.
- **Keep secrets out of flows.** Put passwords and keys in a parameter context marked *sensitive*, not typed into processor properties.
- **Version your flows.** Store them in a flow registry so changes can be reviewed and rolled back, like code.
- **Secure the UI.** The single-user login is for local testing only. Real deployments use TLS and an external login such as OIDC. See [OIDC and Keycloak](/Java/OIDC-and-Keycloak).

## Key takeaways

- NiFi moves and routes data visually, with per-FlowFile provenance.
- Pair it with Kafka: NiFi ingests and routes, and Kafka distributes events to services.
- Send failures to an error path so no data is silently dropped.
- Use controller services for shared connections, and parameter contexts for secrets.
