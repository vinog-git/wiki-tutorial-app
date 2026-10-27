# Kibana: Overview, Elasticsearch Basics and Local Setup

**Kibana** is the web interface for **Elasticsearch**. Elasticsearch stores and searches data (logs, metrics, traces, business events); Kibana lets you search, filter, chart, build dashboards and configure alerts on that data. Together with a shipper such as Filebeat or Logstash, they form the "ELK" or "Elastic Stack" pipeline that the Java Observability page describes.

## The Elastic Stack

```
Applications / containers
        │  stdout, log files, OpenTelemetry
        ▼
   Shipper: Filebeat, Elastic Agent, Fluent Bit, Logstash
        │  parse, enrich, route
        ▼
  Elasticsearch  ◀────── stores and indexes ──────▶  Kibana (search, dashboards, alerts)
```

| Component | Role |
|---|---|
| **Elasticsearch** | Distributed search and analytics engine built on Apache Lucene |
| **Kibana** | UI for Discover, Dashboards, Visualizations, Alerting, Dev Tools, and administration |
| **Filebeat** | Lightweight shipper that reads log files and container logs |
| **Logstash** | Heavier pipeline: parse with grok, transform, enrich, route |
| **Elastic Agent** | One agent that runs integrations (Filebeat, Metricbeat, APM) under central policy |
| **Fleet** | Central management of Elastic Agents |

## Elasticsearch concepts you need for Kibana

| Term | Meaning | Relational analogy |
|---|---|---|
| **Document** | A JSON object, one log line or event | Row |
| **Index** | A collection of documents with similar shape | Table |
| **Mapping** | The schema: field names and types | Table schema |
| **Field** | A key in a document | Column |
| **Shard** | A slice of an index, a Lucene index on one node | Partition |
| **Replica** | A copy of a shard for resilience and read throughput | Read replica |
| **Inverted index** | Maps each term to the documents containing it; why full-text search is fast | Index at the back of a book |
| **Data stream** | Append-only index pattern for time-series data such as logs, with automatic rollover | Rolling log tables |
| **ILM** | Index Lifecycle Management: hot, warm, cold, delete phases | Retention policy |

Search for `ERROR` in a message field works through the inverted index: Elasticsearch looks up the term `error` and returns the matching document IDs, instead of scanning every document.

## Local setup with Docker Compose

This stack runs a single-node Elasticsearch and Kibana with security disabled. That is suitable for learning only. Production clusters require security, TLS and multiple nodes.

```yaml
# docker-compose.yml
name: elastic-lab

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.0
    environment:
      discovery.type: single-node
      xpack.security.enabled: "false"       # learning only; enable security in production
      ES_JAVA_OPTS: "-Xms1g -Xmx1g"
    ulimits:
      memlock: { soft: -1, hard: -1 }
    ports: ["9200:9200"]
    volumes:
      - esdata:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD-SHELL", "curl -fsS http://localhost:9200/_cluster/health || exit 1"]
      interval: 10s
      retries: 20

  kibana:
    image: docker.elastic.co/kibana/kibana:8.15.0
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    ports: ["5601:5601"]
    depends_on:
      elasticsearch:
        condition: service_healthy

volumes:
  esdata:
```

```bash
docker compose up -d
curl -s localhost:9200/_cluster/health?pretty
```

```output
{
  "cluster_name" : "docker-cluster",
  "status" : "green",
  "number_of_nodes" : 1,
  ...
}
```

A `green` status means all primary and replica shards are allocated. On a single node, replicas cannot be placed, so `yellow` is common; set `"number_of_replicas": 0` on development indices to get `green`.

Open **http://localhost:5601**. Kibana takes a minute to start the first time.

## Working with Elasticsearch directly: Dev Tools

Kibana's **Dev Tools** console (Management → Dev Tools) sends REST requests to Elasticsearch. The same requests work with `curl`.

```
PUT /orders-2026.10.27
{
  "settings": { "number_of_shards": 1, "number_of_replicas": 0 },
  "mappings": {
    "properties": {
      "@timestamp":  { "type": "date" },
      "level":       { "type": "keyword" },
      "service":     { "type": "keyword" },
      "message":     { "type": "text" },
      "orderId":     { "type": "keyword" },
      "latencyMs":   { "type": "integer" }
    }
  }
}

POST /orders-2026.10.27/_doc
{
  "@timestamp": "2026-10-27T09:14:02Z",
  "level": "ERROR",
  "service": "orders",
  "message": "payment gateway timeout",
  "orderId": "o-1001",
  "latencyMs": 5012
}

GET /orders-2026.10.27/_search
{
  "query": { "match": { "message": "timeout" } }
}
```

```output
{
  "hits": {
    "total": { "value": 1, "relation": "eq" },
    "hits": [ { "_index": "orders-2026.10.27", "_source": { "level": "ERROR", "service": "orders", ... } } ]
  }
}
```

Two field types matter most:

| Type | Use for | Searchable as |
|---|---|---|
| `keyword` | Exact values: IDs, levels, service names, status codes | Exact match, filters, aggregations |
| `text` | Free text such as messages | Full-text search, analysed (tokenised, lower-cased) |

Mapping choices are hard to change once data is indexed. Set them up front, or let dynamic mapping decide and review it.

## Kibana areas

| Area | Purpose |
|---|---|
| **Discover** | Search and browse documents, the daily log-reading tool |
| **Dashboards** | Collections of panels for a view of a system |
| **Visualize / Lens** | Build charts without writing queries |
| **Alerts and Rules** | Notify when a condition in the data is met |
| **Observability** | Prebuilt views for logs, APM traces, uptime and infrastructure |
| **Stack Management** | Data views, index lifecycle, users, roles, spaces, saved objects |
| **Dev Tools** | Raw Elasticsearch requests |

## Key takeaways

- Elasticsearch stores and indexes; Kibana visualises and alerts; shippers get data in.
- An index is a table, a document is a row, and the mapping decides how fields are searched.
- `keyword` is for exact matches and aggregations; `text` is for full-text search.
- The local stack above disables security; never copy that setting to production.
- Health: `green` means all shards are allocated; single-node clusters usually need replicas set to 0.
