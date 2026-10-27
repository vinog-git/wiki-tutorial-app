# Grafana: Dashboards, Panels and Variables

A good Grafana dashboard answers one operational question at a glance and lets the viewer drill into detail without building new queries. This page covers panel types, the time picker, variables that make one dashboard serve many services, and the layout conventions that make dashboards usable during an incident.

## Anatomy of a dashboard

| Element | Purpose |
|---|---|
| **Time picker** (top right) | Sets the time range for every panel; supports relative ranges (`Last 6 hours`) and absolute ranges |
| **Refresh interval** | How often panels re-query (`10s`, `1m`, off) |
| **Variables** (top left) | Dropdowns that change queries across panels |
| **Rows** | Collapsible groups of panels |
| **Panels** | Individual charts, stats, tables or logs |
| **Annotations** | Event markers on time series, such as deployments |

## Panel types

| Panel | Use for | Example |
|---|---|---|
| **Time series** | Trends over time (default choice) | Requests per second, p95 latency |
| **Stat** | A single current value with optional sparkline | Current error rate |
| **Gauge** | A value against a range or threshold | Heap usage percentage |
| **Bar gauge** | Several values side by side | CPU per pod |
| **Table** | Exact values for many series | Top endpoints by latency |
| **Heatmap** | Distribution over time | Latency histogram buckets over time |
| **Logs** | Log lines from Loki or Elasticsearch | Recent errors for the selected service |
| **Traces** | Trace view from Tempo | Slowest request traces |
| **Alert list** | Currently firing alerts | Active alerts for the service |
| **Text** | Markdown context | Runbook links, owners |

Use **time series** unless you have a reason not to. Stat panels are good for the top row; they answer "is it broken now?" in a glance.

## Building a panel

Example: request rate for the orders service.

1. Add visualisation → choose the Prometheus data source
2. Query: `sum by (status) (rate(http_server_requests_seconds_count{service="$service"}[$__rate_interval]))`
3. Legend: `{{status}}`
4. Unit: `reqps` (Standard options → Unit → Throughput → requests/sec)
5. Thresholds: colour the warning level in yellow
6. Title: `Requests per second by status`
7. Description: a short sentence on what the panel means (shown as an info icon)

Use `$__rate_interval` instead of a fixed `[5m]`. Grafana picks a range that suits the time window and scrape interval, which keeps the panel accurate when you zoom in or out.

## Variables

Variables make one dashboard work for every service and environment. Create them in Dashboard settings → Variables.

| Type | Source | Example |
|---|---|---|
| **Query** | Values from the data source | `label_values(http_server_requests_seconds_count, service)` |
| **Custom** | A fixed list | `orders,payments,shipping` |
| **Constant** | A value you do not want to change in the UI | `cluster=prod-eu` |
| **Text box** | Free text input | A customer ID to filter by |
| **Interval** | Time intervals | `1m,5m,15m` for aggregation windows |
| **Data source** | Choose between data sources of one type | Prod Prometheus or staging Prometheus |
| **Ad hoc filters** | Filters applied to all panels | Click a label value to filter the dashboard |

### Example: service and environment variables

```promql
# Variable "service": label_values(http_server_requests_seconds_count, service)
# Variable "env":     label_values(http_server_requests_seconds_count{service="$service"}, env)

sum by (uri) (rate(http_server_requests_seconds_count{service="$service", env="$env"}[$__rate_interval]))
```

Enable **Multi-value** and **Include All** on `service` if you want one panel to compare several services. Use `=~"$service"` in the query when the variable can hold several values:

```promql
sum by (service) (rate(http_server_requests_seconds_count{service=~"$service"}[$__rate_interval]))
```

### Variable chains

Variables can depend on each other: `env` depends on `service` (above), so the env list only shows environments where that service runs. Dependencies keep dropdowns relevant.

### Variables in other places

Variables work in panel titles, descriptions, links and Loki queries:

```logql
{service="$service", env="$env"} |= "ERROR"
```

## Layout conventions

A dashboard that works in an incident is laid out in rows, from the most important to the most detailed:

| Row | Content |
|---|---|
| **Headline** | Stat panels: request rate, error ratio, p95 latency, active alerts, SLO remaining |
| **Traffic and errors** | Time series: requests by status, error ratio, errors by endpoint |
| **Latency** | p50, p95, p99 over time; latency heatmap |
| **Saturation** | CPU, memory, heap, connection pools, thread counts, queue depth |
| **Dependencies** | Outbound call latency and errors to databases and other services |
| **Logs** | Logs panel filtered by the same variables |

Put the headline row on top with a height that lets people read it from across a room. Collapse detail rows by default so the first screen stays short.

### Thresholds and colours

Thresholds turn numbers into signals. Use them for the SLO, not for arbitrary values:

- Green below the target
- Yellow when the error budget is at risk
- Red when the SLO is breached

Use colour sparingly. Red should mean "act now", or people will stop looking at colour at all.

## Dashboard links and drilldown

- **Data links** on a panel open another dashboard with the same variables (for example, from `service` to a detailed service dashboard).
- **Dashboard links** in the settings open related dashboards, such as the runbook or the logs view.
- Carry the time range with the link so the viewer keeps the context of the incident.

```
/d/orders-detail?var-service=${__data.fields.service}&from=${__from}&to=${__to}
```

## Annotations

Annotations mark events on the time axis. A deployment marker lets you see whether a latency change started at the release.

Create an annotation query from Prometheus or Loki, for example:

```logql
count_over_time({service="orders", env="prod"} |= "Started OrdersApplication" [1m]) > 0
```

Or post an annotation from the deployment pipeline with the HTTP API:

```bash
curl -s -X POST localhost:3000/api/annotations \
  -H "Authorization: Bearer $GRAFANA_TOKEN" -H "Content-Type: application/json" \
  -d '{"text": "orders 1.4.2 deployed", "tags": ["deploy", "orders"]}'
```

```output
{"id":42,"message":"Annotation added"}
```

## Dashboard JSON and provisioning

Every dashboard is JSON. You can edit the JSON directly, export it, or provision it from files:

```bash
# Export
curl -s -H "Authorization: Bearer $GRAFANA_TOKEN" \
  localhost:3000/api/dashboards/uid/orders-overview | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['dashboard'], indent=2))" > orders-overview.json
```

A minimal provisioned dashboard fragment:

```json
{
  "uid": "orders-overview",
  "title": "Orders service",
  "tags": ["orders", "tier-1"],
  "time": { "from": "now-6h", "to": "now" },
  "refresh": "30s",
  "templating": {
    "list": [
      {
        "name": "service",
        "type": "query",
        "datasource": { "type": "prometheus", "uid": "prometheus" },
        "query": "label_values(http_server_requests_seconds_count, service)",
        "multi": true,
        "includeAll": true
      }
    ]
  },
  "panels": []
}
```

Store dashboards in git and provision them with the file provider from the Overview page. Edits made in the UI are then reviewed as JSON diffs.

## Dashboard hygiene

| Practice | Why |
|---|---|
| One dashboard per service, plus one overview | Quick to find; shared language across teams |
| Units on every axis | Numbers without units cause mistakes |
| Descriptions on non-obvious panels | Future readers know what the panel means |
| Remove panels nobody uses | Each panel is a query running every refresh |
| Version and owner in the title or a text panel | Ownership is visible |
| Limit refresh on expensive dashboards | Protects Prometheus during incidents |

## Key takeaways

- Put headline numbers on top, then traffic, latency, saturation and logs in rows.
- Variables make one dashboard serve many services; chain them so dropdowns stay relevant.
- Use `$__rate_interval` for rates so panels stay correct across time windows.
- Mark deployments with annotations and link panels to detailed dashboards that keep the time range.
- Keep dashboards as JSON in git and provision them.
