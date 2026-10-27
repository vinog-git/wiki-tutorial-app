# Grafana: Prometheus Metrics and PromQL

**Prometheus** collects numeric time series by pulling (scraping) metrics from HTTP endpoints. Grafana uses Prometheus as its most common data source, and **PromQL** is the language that turns raw counters into rates, percentiles and error ratios. Most dashboard panels are PromQL queries, so learning the few functions that matter pays off quickly.

## Metric types

| Type | Behaviour | Example | Query with |
|---|---|---|---|
| **Counter** | Only goes up (resets on restart) | `http_server_requests_seconds_count` | `rate()`, `increase()` |
| **Gauge** | Goes up and down | `jvm_memory_used_bytes`, `hikaricp_connections_active` | Direct value, `avg_over_time()` |
| **Histogram** | Buckets of observations plus `_sum` and `_count` | `http_server_requests_seconds_bucket` | `histogram_quantile()` over `rate()` |
| **Summary** | Client-side quantiles | `..._sum`, `..._count` | Rarely queried; prefer histograms |

Never graph a raw counter. It only increases, so the line climbs forever. Take a `rate()` to see requests per second.

## Scraping a Spring Boot service

Spring Boot with Micrometer exposes metrics at `/actuator/prometheus`:

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

```yaml
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  metrics:
    tags:
      service: orders
      env: ${ENV:dev}
    distribution:
      percentiles-histogram:
        http.server.requests: true     # emit histogram buckets for latency percentiles
```

```bash
curl -s localhost:8080/actuator/prometheus | grep '^http_server_requests_seconds_count' | head -3
```

```output
http_server_requests_seconds_count{application="orders",env="dev",exception="None",method="GET",outcome="SUCCESS",service="orders",status="200",uri="/orders/{id}"} 1842.0
```

Note the labels: Prometheus identifies each series by its metric name plus label set. Labels such as `method`, `status` and `uri` let you slice the data. Avoid labels with unbounded values (user IDs, order IDs); each unique combination creates a new series and can exhaust memory.

## Prometheus configuration

Prometheus scrapes targets on an interval and stores samples in its time-series database. Service discovery replaces hand-written target lists in production.

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: orders
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ["orders:8080"]

  # Kubernetes: discover pods with an annotation
  - job_name: kubernetes-pods
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: "true"
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: service
```

Prometheus also supports AWS EC2 and ECS service discovery, which is useful for the AWS section's workloads.

## PromQL essentials

### Selectors and filters

```promql
http_server_requests_seconds_count                              # every series with this name
http_server_requests_seconds_count{service="orders"}            # equals
http_server_requests_seconds_count{status=~"5.."}               # regex match
http_server_requests_seconds_count{uri!="/actuator/health"}     # not equal
```

### Rates over counters

```promql
# Requests per second, averaged over the last 5 minutes
rate(http_server_requests_seconds_count{service="orders"}[5m])

# Total requests in the last hour
increase(http_server_requests_seconds_count{service="orders"}[1h])
```

Use `rate()` for graphs and alerts. Use a range of at least four times the scrape interval, so there are enough points to compute the rate. With a 15-second scrape interval, `[1m]` is the minimum; `[5m]` is a common default.

### Aggregation

```promql
# Total requests per second across all instances
sum(rate(http_server_requests_seconds_count{service="orders"}[5m]))

# Per status code
sum by (status) (rate(http_server_requests_seconds_count{service="orders"}[5m]))

# Per endpoint, keep only the top five
topk(5, sum by (uri) (rate(http_server_requests_seconds_count{service="orders"}[5m])))
```

`by (...)` keeps the listed labels and drops the rest. `without (...)` does the reverse.

### Error ratio

```promql
sum(rate(http_server_requests_seconds_count{service="orders", status=~"5.."}[5m]))
/
sum(rate(http_server_requests_seconds_count{service="orders"}[5m]))
```

Multiply by 100 for a percentage. Dividing two sums of rates gives a clean ratio even as traffic changes.

### Latency percentiles from histograms

```promql
histogram_quantile(
  0.95,
  sum by (le) (rate(http_server_requests_seconds_bucket{service="orders"}[5m]))
)
```

The `le` label is the bucket boundary; it must stay in the `sum by`. This query returns the 95th percentile latency in seconds.

### Gauges and resources

```promql
# JVM heap used as a percentage of the max
100 * sum(jvm_memory_used_bytes{area="heap"}) / sum(jvm_memory_max_bytes{area="heap"})

# Connection pool saturation
hikaricp_connections_active / hikaricp_connections_max

# Pod restarts in the last hour
increase(kube_pod_container_status_restarts_total[1h]) > 0
```

### Time offsets and comparison

```promql
# Current request rate versus the same time yesterday
sum(rate(http_server_requests_seconds_count{service="orders"}[5m]))
/
sum(rate(http_server_requests_seconds_count{service="orders"}[5m] offset 1d))
```

A value near 1 means traffic matches yesterday. This is a simple way to spot an anomaly without a model.

## Evaluating queries

Use Grafana's **Explore** with the Prometheus data source. Run a query, check the result shape, and only then add it to a panel. The Prometheus UI at `:9090` shows the same results and the query's series count.

```promql
count(http_server_requests_seconds_count)   # how many series a metric has
```

If a query returns more series than expected, a label is probably high-cardinality. Check with `count by (uri) (...)`.

## Recording rules

A recording rule precomputes an expensive query and stores the result as a new metric. Dashboards and alerts then read the cheap result.

```yaml
# rules/orders.yml
groups:
  - name: orders-recording
    interval: 30s
    rules:
      - record: service:http_requests:rate5m
        expr: sum by (service, status) (rate(http_server_requests_seconds_count[5m]))

      - record: service:http_latency_p95:5m
        expr: |
          histogram_quantile(0.95,
            sum by (service, le) (rate(http_server_requests_seconds_bucket[5m])))
```

Naming convention: `level:metric:operations` (the form above follows it), so readers know what a series represents.

## Cardinality: the silent killer

Each unique label combination is a separate time series. A label such as `customerId` on an HTTP metric creates one series per customer and can exhaust memory.

| Good labels | Bad labels |
|---|---|
| `service`, `env`, `region`, `status`, `method` | `userId`, `orderId`, `traceId`, `email`, raw URL paths with IDs |
| Bounded, known sets | Unbounded, unique per request |

Use the URI template (`/orders/{id}`), not the raw path, in metric labels. Spring Boot does this by default for `uri`.

## Key takeaways

- Counters need `rate()` or `increase()`; gauges can be read directly; histograms need `histogram_quantile()`.
- Aggregate with `sum by (...)` and divide sums of rates for ratios.
- Keep label sets bounded to avoid cardinality explosions.
- Use recording rules for expensive queries that dashboards and alerts reuse.
- Test every query in Explore before putting it on a dashboard.
