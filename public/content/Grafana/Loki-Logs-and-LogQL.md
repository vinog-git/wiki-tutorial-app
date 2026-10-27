# Grafana: Logs with Loki and LogQL

**Grafana Loki** is a log aggregation system designed to be cheap to run. Instead of indexing the full text of every line (as Elasticsearch does), Loki indexes only a small set of **labels** per stream and stores the log lines compressed in object storage. You search by label first, then filter the text. That trade-off keeps storage and cost low, and it pairs naturally with Prometheus, because both use the same label model.

## Loki compared with Elasticsearch

| | Loki | Elasticsearch (Kibana) |
|---|---|---|
| Indexing | Labels only; text is scanned at query time | Full inverted index on every field |
| Storage cost | Low; compressed chunks in object storage | Higher; index plus data |
| Query speed for label-selective queries | Fast | Fast |
| Free-text search over huge ranges | Slower; scans chunks | Faster |
| Query language | LogQL | KQL, Lucene, ES|QL |
| Best for | Operational logs alongside Prometheus metrics | Full-text search, security analytics, complex log analytics |

Choose Loki when the team already lives in Grafana and wants low-cost, label-driven logs. Choose Elasticsearch when you need rich search across every field.

## Labels: the design decision

Labels define a **stream**: all lines with the same label set form one stream. Keep labels bounded, like Prometheus labels.

| Good labels | Bad labels |
|---|---|
| `service`, `env`, `namespace`, `container`, `level` (if bounded) | `traceId`, `orderId`, `userId`, IP addresses, anything unique per request |

Put high-cardinality values such as `traceId` in the log line as structured fields, and extract them at query time with `| json`.

## Shipping logs to Loki

### Option 1: Docker logging driver

The simplest path for containers on one host. Install the plugin once, then set the driver per container or in `daemon.json`:

```bash
docker plugin install grafana/loki-docker-driver:3.1.0 --alias loki --grant-all-permissions
```

```yaml
# docker-compose.yml
services:
  orders:
    image: orders-service:1.0
    logging:
      driver: loki
      options:
        loki-url: "http://loki:3100/loki/api/v1/push"
        loki-retries: "3"
        loki-batch-size: "400"
        loki-external-labels: "service=orders,env=dev"
```

### Option 2: Grafana Alloy or Promtail (agent)

Alloy (the successor to Promtail) runs on each host, reads Docker container logs, attaches labels, and pushes to Loki. It is the standard for multi-host setups and survives container restarts.

```river
// config.alloy
discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

discovery.relabel "containers" {
  targets = discovery.docker.containers.targets

  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/(.*)"
    target_label  = "container"
  }
  rule {
    source_labels = ["__meta_docker_container_label_com_docker_compose_service"]
    target_label  = "service"
  }
}

loki.source.docker "containers" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.relabel.containers.output
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```

### Option 3: Structured logs from the application

Log JSON to stdout (see the Docker Logging page). The agent does not parse anything; LogQL's `| json` does it at query time. Keep the field names consistent across services so one query works everywhere.

### Loki configuration

```yaml
# loki-config.yaml (single binary, filesystem storage, for learning)
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 336h    # 14 days
  allow_structured_metadata: true
```

Production deployments use object storage (S3 or GCS) for chunks and a separate retention configuration. Keep retention explicit: logs grow without it.

## LogQL basics

LogQL has two query types: **log queries** return lines, and **metric queries** turn logs into numbers.

### Stream selector

Every query starts with a label selector in braces:

```logql
{service="orders"}
{service="orders", env="prod"}
{service=~"orders|payments", env="prod"}
{service="orders", env!="dev"}
```

Selectors are fast because they use the index. Always narrow by label before filtering text.

### Line filters

```logql
{service="orders"} |= "ERROR"                    # contains
{service="orders"} != "health"                   # does not contain
{service="orders"} |~ "timeout|timed out"        # regex match
{service="orders"} !~ "GET /actuator/health"     # regex does not match
```

Chain filters left to right; each narrows the previous result.

### Parsing and label filters

Parsers extract fields from the line at query time:

```logql
{service="orders"} | json | level="ERROR"
{service="orders"} | json | latencyMs > 2000
{service="orders"} | json | line_format "{{.level}} {{.orderId}} {{.msg}}"
```

With `| json`, every JSON field becomes a label for the rest of the query. Filter on them with `level="ERROR"` or numeric comparisons.

Other parsers:

| Parser | Use for |
|---|---|
| `json` | JSON logs (most common in this wiki's approach) |
| `logfmt` | `key=value` format |
| `pattern` | Simple structured text: `pattern "<ip> - - <_> \"<method> <path> <_>\" <status>"` |
| `regexp` | Named capture groups for anything else |

### Finding a trace across services

```logql
{env="prod"} | json | traceId="4bf92f3577b34da6a3ce929d0e0e4736"
```

Run the same query for every service with one selector, and the lines show the request's path across services in time order.

## Metric queries from logs

Metric queries count or aggregate log lines, so logs can drive graphs and alerts:

```logql
# Error lines per second, per service
sum by (service) (rate({env="prod"} | json | level="ERROR" [5m]))

# Number of ERROR lines in the last 10 minutes
count_over_time({service="orders"} |= "ERROR" [10m])

# 95th percentile latency extracted from logs
quantile_over_time(0.95, {service="orders"} | json | unwrap latencyMs [5m]) by (service)
```

`unwrap` turns a field into a numeric sample. It is useful when a metric is not exported by the application but is logged.

Prefer Prometheus metrics for numbers you track continuously. Logs are the right source for events that never became a metric.

## Log panels and Explore

- **Explore** with the Loki data source: run a LogQL query, then switch to the Logs view. Use the field filters on the left to add or remove labels quickly.
- **Logs panel** on a dashboard: set the query with dashboard variables, for example `{service="$service", env="$env"}`.
- **Context**: click a log line and choose "Show context" to see the surrounding lines from the same stream.
- **Derived fields**: link a field such as `traceId` to a Tempo trace view with a regular expression, so a log line becomes a clickable trace.

## Performance and cost

| Problem | Fix |
|---|---|
| Query is slow | Narrow the label selector and the time range first |
| Too many streams | Remove high-cardinality labels; check `loki_ingester_streams` |
| Ingestion rejected (rate limit) | Raise `ingestion_rate_mb` in `limits_config`, or reduce noisy logs |
| Storage grows fast | Lower log volume (DEBUG off), enable retention, sample health checks |
| Line too long | Truncate in the application; set `max_line_size` deliberately |

Drop health-check lines at the source or in the agent (a `drop` stage), since they add cost without value:

```river
loki.process "filter" {
  stage.drop {
    expression = ".*GET /actuator/health.*"
  }
  forward_to = [loki.write.default.receiver]
}
```

## Retention

```yaml
limits_config:
  retention_period: 336h          # default for all streams: 14 days
```

Per-stream retention can be set with the compactor and `retention_stream` rules, so audit logs can be kept longer than debug logs.

## Key takeaways

- Loki indexes labels, not text; keep labels bounded and put high-cardinality values in the log line.
- Ship logs with Alloy, the Docker logging driver, or structured stdout.
- LogQL starts with a label selector, then line filters, then `| json` parsing.
- Use metric queries for counts and rates from logs, and link traces with derived fields.
- Set retention explicitly and drop noise at the source.
