# Grafana, Prometheus and Observability Interview Questions

Short answers first, with the page that has the depth.

## Concepts

**1. What is Grafana and what does it not do?**
Grafana visualises and alerts on data from many sources through their query languages. It does not store the metrics or logs itself; those live in data sources such as Prometheus, Loki, Tempo or CloudWatch. *(See Overview.)*

**2. What are the three pillars of observability?**
Metrics (numeric time series), logs (discrete events), and traces (the path of a request across services). Good observability joins them, using shared labels and trace IDs. *(See Overview and Loki.)*

**3. Pull vs push monitoring?**
Prometheus pulls (scrapes) metrics from targets on an interval, so it knows when a target disappears. Push models send data to a collector, which is useful for short-lived jobs that cannot be scraped. *(See Prometheus.)*

**4. What is the difference between monitoring and observability?**
Monitoring checks known failure modes with predefined dashboards and alerts. Observability lets you ask new questions about unknown failures, using high-cardinality data and correlated signals. *(See Overview.)*

## Prometheus and PromQL

**5. Name the Prometheus metric types.**
Counter (only increases), gauge (goes up and down), histogram (buckets with sum and count), and summary (client-side quantiles). *(See Prometheus.)*

**6. Why use `rate()` on a counter?**
A counter only increases and resets on restart, so its raw value is not a useful rate. `rate()` gives the per-second increase, handling resets, over a time range. *(See Prometheus.)*

**7. How do you compute p95 latency in PromQL?**
`histogram_quantile(0.95, sum by (le) (rate(<metric>_bucket[5m])))`. The `le` label must be kept in the aggregation. *(See Prometheus.)*

**8. What is cardinality and why does it matter?**
The number of unique label combinations. Each combination is a separate time series that uses memory and storage. High-cardinality labels such as user IDs or raw URLs can overwhelm Prometheus. *(See Prometheus.)*

**9. What are recording rules?**
Rules that precompute an expensive expression and store it as a new series, so dashboards and alerts read a cheap result. *(See Prometheus.)*

**10. Why is `rate()` over `[5m]` better than `[1m]` for dashboards?**
A longer window smooths noise and needs at least two samples inside it. With a 15-second scrape interval, `[1m]` is the minimum that works; `[5m]` gives stable graphs. `$__rate_interval` picks a suitable window automatically. *(See Prometheus and Dashboards.)*

**11. How do you calculate an error ratio?**
Divide the sum of the rate of error responses by the sum of the rate of all responses, using `sum` on both sides so the labels match. *(See Prometheus.)*

## Dashboards

**12. How do you design a dashboard for an incident?**
Headline stat panels on top (traffic, errors, latency, alerts, SLO), then trends, latency percentiles, saturation, dependencies and logs, with variables for service and environment and links to detailed dashboards. *(See Dashboards.)*

**13. What are dashboard variables used for?**
They make one dashboard work for many services and environments. Query variables read values from the data source, and chained variables keep dropdowns relevant. *(See Dashboards.)*

**14. Why show latency as percentiles rather than averages?**
Averages hide the slow tail. p95 and p99 show what the slowest users experience, which is what most SLOs measure. *(See Prometheus and Dashboards.)*

**15. How do you show deployments on a graph?**
Add annotations: from the deployment pipeline through the HTTP API, or from a log query that matches the startup message. *(See Dashboards.)*

## Logs

**16. Loki vs Elasticsearch?**
Loki indexes only labels and stores compressed log chunks, which is cheap to run. Elasticsearch indexes every field, which makes free-text and field search faster at a higher storage cost. *(See Loki.)*

**17. What labels should a Loki stream have?**
Bounded labels such as service, environment, namespace and container. Put high-cardinality values such as trace IDs in the log line and extract them with `| json`. *(See Loki.)*

**18. How do you find a request across services in Loki?**
Query all services in one environment for the trace ID in the log line: `{env="prod"} | json | traceId="..."`. *(See Loki.)*

**19. What is a metric query in LogQL?**
A query that aggregates log lines into numbers, such as `rate({...} |= "ERROR" [5m])` or `count_over_time`. It is useful for events that were never exported as metrics. *(See Loki.)*

## Alerting

**20. Why do alerts need a `for` period?**
A single bad sample should not page anyone. The pending period requires the condition to hold for a set time, which removes transient spikes. *(See Alerting.)*

**21. What is SLO burn-rate alerting?**
Alerting on how fast the error budget is being consumed, typically with two windows (for example 1 hour and 5 minutes) to catch fast burns quickly and slow burns without flapping. *(See Alerting.)*

**22. What is the difference between a contact point and a notification policy?**
A contact point is a destination such as Slack or PagerDuty. A notification policy is a routing tree that matches alert labels and chooses contact points, grouping and repeat intervals. *(See Alerting.)*

**23. How do you handle alert fatigue?**
Alert on user impact and SLO burn rather than resource thresholds, use ratios instead of counts, set sensible `for` periods, group alerts per service, require a runbook for page-severity alerts, and review and delete alerts that never need action. *(See Alerting.)*

**24. When should you silence an alert?**
During an incident you are already handling, or during planned maintenance. Always set an expiry and a comment explaining why. *(See Alerting.)*

## Architecture and operations

**25. How do you make Prometheus highly available?**
Run two identical Prometheus servers that scrape the same targets, and send alerts to Alertmanager (or Grafana's alerting) from both; deduplication handles the duplicates. For long-term storage and a global view, use Thanos or Grafana Mimir. *(See Overview.)*

**26. Where should Grafana's own configuration live?**
In a database (SQLite by default; PostgreSQL in production) for state such as users and dashboards. Dashboards and data sources should be provisioned from files in git. *(See Overview.)*

**27. How do you secure Grafana in production?**
Single sign-on, disabled sign-up, role-based folder permissions, service accounts for automation, TLS through a reverse proxy, read-only data source credentials, and secrets from environment variables. *(See Overview.)*

**28. What is OpenTelemetry and where does it fit?**
A vendor-neutral standard and SDK for generating metrics, logs and traces, with a collector that routes them to backends such as Prometheus, Loki and Tempo. It avoids locking applications to one vendor. *(See the Kibana and Grafana pages.)*

## Scenario questions

**29. Users report slow checkout, but CPU and memory look normal. How do you investigate?**
Check the request latency histogram for the checkout endpoint (p95 and p99 by endpoint and status), compare with dependency latency (database and payment calls), check connection pool saturation (Hikari active and pending), look at error logs for timeouts with a LogQL query, and check recent deployments as annotations. CPU and memory being normal points to waiting on dependencies, not computing.

**30. Design the monitoring for a new payments service.**
RED metrics per endpoint (rate, errors, duration as a histogram) from Micrometer. USE metrics for the infrastructure (utilisation, saturation, errors). Business metrics such as payments authorised per minute. Structured logs with trace IDs shipped to Loki. Traces to Tempo with OpenTelemetry. Dashboards with the layout from the Dashboards page. Burn-rate alerts on availability and latency, page for fast burn, ticket for slow burn, runbooks linked, and a deployment annotation from the pipeline.

**31. An alert fired at 3 a.m. but resolved itself before anyone looked. What do you change?**
Decide whether the alert was actionable. If not, change it: lengthen the `for` period, alert on sustained SLO burn instead of a spike, or downgrade to a ticket. If it was real, keep it and make sure the page reaches a person with a runbook. Review the alert history to confirm the timeline.

**32. Prometheus memory keeps growing. What do you check?**
Series count (`prometheus_tsdb_head_series`), the top metrics by series count, and labels with unbounded values such as IDs or raw paths. Fix the instrumentation to use bounded labels, drop unused metrics with `metric_relabel_configs`, and add recording rules for expensive dashboards.

## Quick-fire

- **`up` metric?** Set to 1 when a scrape succeeds and 0 when it fails; alert on `up == 0`.
- **`increase()` vs `rate()`?** `increase()` returns the total increase over the range; `rate()` returns the per-second average.
- **Scrape interval vs evaluation interval?** How often targets are scraped versus how often rules are evaluated.
- **RED method?** Rate, Errors, Duration: for request-driven services.
- **USE method?** Utilisation, Saturation, Errors: for resources such as CPU, disks and pools.
- **Golden signals?** Latency, traffic, errors and saturation, from Google's SRE book.
- **Exemplar?** A sample link from a metric point to a trace ID, connecting metrics to traces.
- **Mimir / Thanos / Cortex?** Long-term, horizontally scalable Prometheus-compatible storage.
