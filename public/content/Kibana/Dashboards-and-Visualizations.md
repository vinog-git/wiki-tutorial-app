# Kibana: Visualizations, Lens and Dashboards

A dashboard turns a stream of events into a few panels that answer standing questions: how many requests, how many errors, how slow, which service. This page covers building visualisations with Lens, the aggregations behind them, and assembling a dashboard that someone can use during an incident.

## Lens: the default visualisation editor

Lens builds charts by dragging fields onto axes, with no query syntax to learn. It suggests chart types based on your data.

1. Analytics → Dashboards → **Create visualization**
2. Choose the data view (`logs-orders-*`)
3. Drag `@timestamp` to the horizontal axis (time histogram)
4. Drag `level` to the breakdown (split series)
5. Set the vertical axis to **Count of records**
6. Save as `Log volume by level`

| Chart type | Use for |
|---|---|
| **Line / area** | Trends over time: requests per minute, latency p95 |
| **Bar** | Comparisons: errors per service |
| **Metric** | A single number: total orders today |
| **Gauge / Goal** | A value against a target |
| **Table** | Exact values for many dimensions |
| **Heat map** | Two dimensions: hour of day against service |
| **Pie / Donut** | Share of a whole, with few categories only |
| **Tag cloud** | Most frequent terms, for quick scanning |

## Aggregations

Every chart is an aggregation over documents in the time range. The aggregation determines what the number means:

| Aggregation | Meaning | Example |
|---|---|---|
| **Count** | Number of documents | Log lines per minute |
| **Unique count** | Distinct values (approximate) | Distinct customers hitting the API |
| **Average / Median / Max** | Statistic of a numeric field | Average `latencyMs` |
| **Percentile** | Value below which N% fall | p95 `latencyMs` |
| **Sum** | Total of a numeric field | Total order value |
| **Top values** | Most frequent values of a keyword | Top 10 error messages |
| **Filters** | Count under named conditions | Errors vs successes side by side |
| **Date histogram** | Buckets by time | Requests every 5 minutes |

Percentiles are the right measure for latency. An average hides the slow tail; p95 and p99 show what your slowest users experience.

## Lens examples

**Error rate per service (ratio of two counts):**
- Use a formula: `count(kql='level : "ERROR"') / count() * 100`
- Breakdown by `service`

**Latency p95 over time:**
- Vertical axis: Percentile of `latencyMs`, 95th
- Horizontal axis: `@timestamp`, interval Auto

**Top error messages:**
- Table, rows split by `message.raw`, filtered with `level : ERROR`, sorted by count

## Creating a visualisation with a formula

Lens formulas combine aggregations and KQL filters:

```
count(kql='service : orders and level : ERROR')
  / count(kql='service : orders') * 100
```

The denominator covers every log line from the service, so the result is a percentage.

## Markdown panels

Dashboards accept Markdown panels for context: what the dashboard is for, who owns it, which runbook to follow, and links to other dashboards.

```markdown
## Orders service: health

- Runbook: https://wiki.example.com/runbooks/orders
- Owner: Payments team
- Targets: p95 latency under 800 ms, error rate under 1%
```

## Building a dashboard

Analytics → Dashboards → **Create dashboard**. Add panels from saved visualisations and saved searches. A dashboard that works in an incident usually has these rows:

| Row | Panels |
|---|---|
| **Headline** | Requests per minute, error rate, p95 latency, active alerts (metric panels) |
| **Trends** | Requests and errors over time, latency percentiles over time |
| **Breakdown** | Errors by service, errors by message, slow requests by endpoint |
| **Detail** | Saved search of recent ERROR logs for the selected service |

### Dashboard controls

Controls let a viewer filter all panels at once:

- **Options list** on `service` and `env`
- **Time range** saved with the dashboard, or set to follow "Last 1 hour"
- **Filters** added at the top apply to every panel

Set the dashboard's default time range to the window people usually investigate (for example last 4 hours), so it opens with data.

## Drilldowns and navigation

- Click a bar in a chart to filter the dashboard by that value
- Add a **drilldown** from a panel to Discover with the same filters applied, so a viewer can go from "error spike" to "the actual lines" in one click
- Link to the matching trace view or Grafana dashboard from a Markdown panel

## Saved objects and sharing

Visualisations, searches, data views and dashboards are **saved objects**. You can:

- Export them as NDJSON from Stack Management → Saved Objects, and import into another environment
- Manage them through the Saved Objects API
- Keep them in version control with the export file, so changes are reviewed

```bash
curl -s -X POST "localhost:5601/api/saved_objects/_export" \
  -H "kbn-xsrf: true" -H "Content-Type: application/json" \
  -d '{"type": ["dashboard", "visualization", "search"], "includeReferencesDeep": true}' \
  -o kibana-exports.ndjson
wc -l kibana-exports.ndjson
```

```output
42 kibana-exports.ndjson
```

## Spaces

Spaces separate dashboards and saved objects for teams or environments. A payments team can have its own space with its own dashboards, while the platform team uses another. Spaces control what is visible; use roles (next page) to control what people can change.

## Performance tips

| Issue | Fix |
|---|---|
| Dashboard slow to load | Reduce the number of panels; shorten the default time range |
| High-cardinality breakdown | Limit to top 10 values; avoid splitting by `traceId` or `orderId` |
| Expensive percentiles over long ranges | Use a rollup or a data stream with a shorter window for trends |
| Many panels with the same filter | Move the filter to the dashboard controls |

## Dashboard checklist

- [ ] Headline metrics answer "is it broken right now?" in under 5 seconds
- [ ] Each panel has a title that says what it measures and the unit
- [ ] Latency is shown as percentiles, not only averages
- [ ] A link to the runbook is visible
- [ ] Default time range matches how people investigate
- [ ] No panel depends on a field that was renamed last month

## Key takeaways

- Lens builds charts from aggregations; choose count, percentile, or formula deliberately.
- Show latency as p95 and p99, not averages.
- Build dashboards in rows: headline, trends, breakdown, detail.
- Use drilldowns to move from a chart into Discover with the same filters.
- Export saved objects to version control so dashboards are reviewed like code.
