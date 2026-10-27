# New Relic: NRQL, Dashboards and Alerts

NRQL is the query language for everything in New Relic. Dashboards are sets of NRQL charts, and alerts are NRQL conditions evaluated on a schedule. Once you can write NRQL, the rest of the platform is a matter of saving queries in the right place. This page covers the query syntax, the patterns that come up most often, and how to turn a chart into a dashboard and an alert that routes to a person.

## NRQL basics

NRQL reads like SQL with time-series extensions. Every query names an event type in `FROM`.

```sql
SELECT <aggregation(s)> FROM <event type> WHERE <filter>
FACET <group by> SINCE <time window> UNTIL <time window>
TIMESERIES <bucket size> LIMIT <n>
```

| Clause | Purpose | Example |
|---|---|---|
| `SELECT` | Aggregations: `count`, `average`, `sum`, `max`, `min`, `percentile`, `rate`, `uniques` | `percentile(duration, 95)` |
| `FROM` | Event type | `Transaction`, `Log`, `Metric`, `Span` |
| `WHERE` | Filter on attributes | `appName = 'orders'` |
| `FACET` | Group by one or more attributes | `FACET name` |
| `SINCE` / `UNTIL` | Time range | `SINCE 1 hour ago` |
| `TIMESERIES` | Bucket by time for a line chart | `TIMESERIES AUTO` |
| `COMPARE WITH` | Compare to an earlier period | `COMPARE WITH 1 week ago` |

## Patterns worth memorising

Response time at the 95th percentile, per route, for one service:

```sql
SELECT percentile(duration, 95) FROM Transaction
WHERE appName = 'orders' AND transactionType = 'Web'
FACET name SINCE 1 hour ago LIMIT 20
```

Error rate as a percentage of transactions, over time:

```sql
SELECT percentage(count(*), WHERE error IS true) FROM Transaction
WHERE appName = 'orders' SINCE 3 hours ago TIMESERIES AUTO
```

Throughput compared with last week, to catch a drop in traffic:

```sql
SELECT rate(count(*), 1 minute) FROM Transaction
WHERE appName = 'orders' SINCE 1 day ago COMPARE WITH 1 week ago TIMESERIES
```

Top exception classes this week:

```sql
SELECT count(*) FROM TransactionError
WHERE appName = 'orders' FACET error.class SINCE 7 days ago LIMIT 10
```

Count of log errors by service, for the logs that carry the level field:

```sql
SELECT count(*) FROM Log
WHERE level = 'ERROR' FACET service.name SINCE 1 hour ago TIMESERIES AUTO
```

Custom metric from an event your code sends, such as orders placed per region:

```sql
SELECT sum(orderCount) FROM OrderPlaced
FACET region SINCE 1 day ago TIMESERIES 1 hour
```

## Writing queries that stay fast

- **Filter before you facet.** A `WHERE` clause on `appName` or `service.name` narrows the scan. A facet across all accounts and all time is slow and expensive.
- **Keep facet cardinality low.** Faceting on user ID or order ID creates one row per value. Use a bounded attribute such as route name, status class or region.
- **Use `LIMIT`.** Charts with more than 20 series are hard to read anyway.
- **Use `TIMESERIES AUTO` for dashboards.** It picks a bucket size that fits the window.
- **Check the query time.** The query builder shows how many bytes and records were scanned. A chart that scans days of raw logs should use a metric or a smaller window.

## Dashboards

A **dashboard** is a page of charts. Each chart is one NRQL query with a visualization: line, bar, billboard (single number), table, pie or heat map. Put related charts together, and keep one purpose per dashboard.

A layout that works for a service:

| Row | Charts |
|---|---|
| Health | Billboard for error rate, throughput and p95 latency, each with a threshold colour |
| Traffic | Throughput by route, and throughput compared with last week |
| Latency | p50, p95 and p99 over time, and the slowest routes table |
| Errors | Error count by class, and error rate by route |
| Dependencies | External call latency by host, database time by statement |
| Logs | Error log count by service, and a table of recent errors |

Use **variables** for the service name and environment, so one dashboard can show each service. Add a **deployment marker** annotation from the pipeline (the New Relic change tracking API or a `Deployment` event) so a latency change can be lined up with the release that caused it.

Dashboards can be exported as JSON and kept in version control, which helps when several environments need the same layout.

## Alerts with NRQL conditions

An **alert condition** runs a NRQL query on a schedule and decides whether to open an incident. The main settings:

| Setting | What it does |
|---|---|
| **Query** | Returns a numeric value per series |
| **Threshold type** | Static (fixed number) or anomaly (learned baseline) |
| **Critical threshold** | Opens a critical incident when the value crosses this line for the threshold duration |
| **Warning threshold** | Optional, for a less urgent incident |
| **Threshold duration** | How long the value must stay past the line before the incident opens |
| **Aggregation window** | The time slice each evaluation looks at |
| **Loss of signal** | What to do when no data arrives (open an incident or close it) |

An example: the orders service p95 latency above 1.5 seconds for five minutes.

```sql
SELECT percentile(duration, 95) FROM Transaction
WHERE appName = 'orders' AND transactionType = 'Web'
```

Set the critical threshold to `1.5`, the threshold duration to 5 minutes, and the aggregation window to 1 minute. A single spike does not page anyone, but a sustained slowdown does.

Error rate alert, for an SLO of 99.5% availability:

```sql
SELECT percentage(count(*), WHERE error IS true) FROM Transaction
WHERE appName = 'orders' AND transactionType = 'Web'
```

Critical at `0.5` for 10 minutes. Add a warning at `0.2` for 30 minutes to create a ticket for a slow-burning problem.

## Routing: workflows and destinations

An incident needs a route to a person. New Relic uses **destinations** (Slack, PagerDuty, email, webhook, Microsoft Teams, ServiceNow and others) and **workflows**, which match incidents by tags and send them to the right destination.

| Concept | Meaning |
|---|---|
| **Destination** | A connection to a tool, such as a Slack channel or a PagerDuty service |
| **Workflow** | A rule that matches incidents, for example `team = payments` and `priority = critical`, and sends them to a destination |
| **Enrichment** | Adds data to a notification, such as a NRQL query result or a link to the runbook |
| **Muting rule** | Suppresses notifications for a time window, such as a planned maintenance |

Put the owning team and the runbook link in the alert description or the tags. An alert without a runbook link tells the on-call person that something is wrong and nothing about what to do next.

## Alert hygiene

The same principles as Grafana alerting apply. Alert on symptoms that users feel (latency, error rate, availability), not on every internal metric. Give every critical alert a runbook. Review the alerts that fired last month: any alert that resolved itself before anyone acted should have a longer threshold duration, a higher threshold, or should move to a warning.

## Quick-fire

- **What is NRQL?** New Relic's query language for all event types, similar to SQL.
- **`FACET` vs `GROUP BY`?** `FACET` is the NRQL clause for grouping. There is no `GROUP BY` in NRQL.
- **Why use `percentile` instead of `average`?** Averages hide the tail. The p95 or p99 shows what slow users experience.
- **Static vs anomaly threshold?** Static uses a fixed number. Anomaly compares against a learned baseline, which suits metrics with a daily pattern.
- **Threshold duration?** How long the condition must hold before an incident opens. It is the main protection against noisy alerts.
- **What is a destination?** A connection to a notification tool, used by workflows to send incidents.
