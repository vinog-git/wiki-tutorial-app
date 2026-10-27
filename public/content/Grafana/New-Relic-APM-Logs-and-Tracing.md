# New Relic: APM, Logs and Distributed Tracing

Overview and setup get data into New Relic. This page covers what to do with it when something is slow or failing: the **APM** views for each service, distributed traces that follow one request across services, and logs that link back to the trace they came from. The thread through all three is the trace ID, which lets you move from a slow endpoint to the exact log lines and the database call that caused it.

## The APM view of a service

Open **APM & Services**, choose the service, and the summary page shows the golden signals:

| Panel | What to look for |
|---|---|
| **Throughput** | Requests per minute. A sudden drop often means a routing or upstream problem, not a fast service. |
| **Response time** | Average and percentile latency. Average hides tail latency, so use the percentile view. |
| **Error rate** | Percentage of transactions that failed. Click through to the error inbox. |
| **Apdex** | A satisfaction score from a target threshold (`T`). Useful for a single number per service, but set `T` for your own SLO. |
| **Web transactions** | Breakdown by route name. The slowest route is usually the first thing to investigate. |
| **Database** | Time spent in SQL and the slowest statements, with the query text when enabled. |
| **External services** | Time spent in HTTP calls to other services and third-party APIs. |

Use **Transactions** to sort routes by response time, and select a route to see a sample trace. The **Breakdown table** shows which share of the time goes to the app code, database, external calls and the JVM.

## Error inbox

The **Errors** page groups exceptions into error groups by class and message, with a count and the first and last seen times. Mark a group as resolved, assign it, or link it to a bug ticket. A regression is an error group that comes back after being resolved, and New Relic flags it as such.

Ignore expected errors with an error rule instead of filtering them out in code. For example, a 404 on a bot path should not page anyone. Rules keep the data and hide the noise from the inbox.

## Distributed tracing

A **distributed trace** follows one request across services. Each service adds **spans**, the timed steps it performed, and the trace ties them together with a shared trace ID. The Java agent propagates the trace context in the `traceparent` and `newrelic` headers, so a call from `orders` to `payments` shows as one trace with both services in it.

```
checkout (orders)                              total 1.84 s
├── validate-cart (orders)                     0.02 s
├── GET /v1/prices (catalog)                   0.11 s
├── POST /v1/charge (payments)                 1.61 s
│   ├── SELECT card_tokens (payments-db)       0.04 s
│   └── HTTP POST psp.example.com              1.52 s   ◀ the slow step
└── INSERT orders (orders-db)                  0.06 s
```

Read a trace from the top down and look for the widest bar. In this example the time is in the external payment provider, not in New Relic's agent or in the local database. That answer changes the next step: contact the provider, add a timeout, or look at retries, not tune SQL.

Trace ID rules to remember:

- A trace only shows services that propagate context. Each service must have the agent or OpenTelemetry SDK, and HTTP clients must forward the headers.
- Message queues need the context in message headers. Kafka and JMS instrumentation do this for you, but a custom producer does not.
- Sampling reduces volume. A trace you need may not have been kept, so check the sampling settings before assuming a service did not handle the request.

## Logs in context

With the agent, log lines from a supported framework (Logback, Log4j2) are forwarded with the trace ID and span ID added. In the trace view, **Logs** shows the lines that belong to that request. In the logs view, selecting a line opens the trace.

Make sure the log pattern writes the trace fields, or the link is not possible. For Logback with the agent, the fields are added automatically, but a custom pattern can remove them. A simple JSON layout keeps them:

```xml
<!-- logback.xml -->
<appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
  <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
</appender>
```

Querying logs uses NRQL on the `Log` type. Filter by level and group by service:

```sql
SELECT count(*) FROM Log
WHERE level = 'ERROR' AND service.name = 'orders'
SINCE 1 hour ago TIMESERIES AUTO
```

To find the log lines for one trace, filter by the trace ID:

```sql
SELECT timestamp, message FROM Log
WHERE trace.id = '4bf92f3577b34da6a3ce929d0e0e4736'
SINCE 1 day ago ORDER BY timestamp
```

## Infrastructure and host views

The infrastructure agent (or the Kubernetes bundle from the previous page) adds host metrics: CPU, memory, disk and network per host, plus process samples. Use them to answer "is this a code problem or a capacity problem". If latency rises at the same time as CPU steal or memory pressure on the host, check the host before you change the code.

For Kubernetes, the **Kubernetes cluster explorer** shows pods, deployments and nodes. A pod in `CrashLoopBackOff` or with high restart counts is visible there without opening `kubectl`.

## Comparing with Grafana and Loki

| Task | Grafana and Loki | New Relic |
|---|---|---|
| Find slow endpoints | Histogram panels with PromQL | APM Transactions, sorted by time |
| Find the slow dependency | Client latency metrics | Trace view with span bars |
| Read logs for a request | LogQL filter by trace ID | Logs in the trace view, one click |
| Own the storage | You run it | New Relic runs it |

Both approaches work. The practical difference is that New Relic links the signals automatically through the agent, while in the Grafana stack you configure the links yourself using exemplars and derived fields.

## Quick-fire

- **Why not use average response time?** Averages hide the slow tail. Use p95 or p99.
- **What is an error group?** A collection of similar errors, grouped by class and message.
- **What does a span represent?** One timed step in a request, such as a database query or an HTTP call.
- **What links a log line to a trace?** The trace ID and span ID that the agent adds to the log record.
- **Why might a trace be missing a service?** Context was not propagated (a header was dropped), the service has no agent, or sampling dropped the trace.
