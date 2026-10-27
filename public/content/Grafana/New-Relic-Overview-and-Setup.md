# New Relic: Overview, Agents and Setup

**New Relic** is a hosted observability platform. Instead of running your own Prometheus, Loki and Tempo, you install an agent or send OpenTelemetry data to New Relic, and it stores metrics, logs, traces and events for you in one place. You query everything with one language, **NRQL**, and build dashboards and alerts on top of it. This page covers where New Relic fits next to Grafana, the data it stores, and how to get the first data in.

## New Relic in the observability stack

| Question | Self-hosted (Grafana stack) | New Relic |
|---|---|---|
| Where does data live? | Prometheus, Loki, Tempo, you run them | New Relic cloud, you send data to it |
| How do you query? | PromQL, LogQL, TraceQL | NRQL for all data types |
| How do you instrument Java? | Micrometer endpoint plus your own tracing setup | Java agent, no code changes |
| Who runs the storage? | Your team | New Relic |
| Cost driver | Infrastructure and staff time | Data ingested and retained (GB per month) |

Many teams run both. Grafana is free to self-host and strong for dashboards over many sources. New Relic removes the operational work of running the backends and adds application-level views such as service maps, error inbox and per-transaction breakdowns.

## The data model

New Relic stores data as **event types**. Every type is queryable with NRQL using the `FROM` clause.

| Event type | What it holds | Typical source |
|---|---|---|
| **Transaction** | One row per web or background request, with duration and attributes | Java, Node, .NET and Python agents |
| **TransactionError** | Errors raised inside transactions, with class and message | APM agents |
| **Span** | Timed steps inside a distributed trace | APM agents, OpenTelemetry |
| **Metric** | Numeric time series, similar to Prometheus metrics | Infrastructure agent, OpenTelemetry, Micrometer |
| **Log** | Log lines with attributes, including trace IDs for correlation | Log forwarder, OpenTelemetry collector |
| **SystemSample**, **ProcessSample** | Host and process resource usage | Infrastructure agent |
| **Custom events** | Any event your code sends, such as `OrderPlaced` | Insights API, agent APIs |

An **account** holds the data. Users and API keys belong to the account, and data can be scoped by **entity** (an application, host or service).

## Credentials and regions

| Item | Use |
|---|---|
| **License key** (ingest key) | Sends data from agents and OpenTelemetry. Keep it secret. |
| **User API key** | Runs NRQL from scripts or the API. It is not the same as the license key. |
| **Region** | US or EU. Pick the region when you create the account, because data does not move between regions. |

For the EU region, the endpoints differ, for example `otlp.eu01.nr-data.net` instead of `otlp.nr-data.net`. Check the region in the account before you configure any agent.

Store the license key as an environment variable or a Kubernetes secret. Never commit it:

```bash
export NEW_RELIC_LICENSE_KEY="<your-license-key>"
export NEW_RELIC_APP_NAME="orders-service"
```

## Your first data: a Java service

The Java agent is a single jar that attaches to the JVM at startup and instruments common frameworks (Spring MVC, Spring Boot, JDBC, HTTP clients, Kafka and others) without code changes.

1. Download `newrelic-java.zip` from the New Relic Java agent page and unzip it, for example to `/opt/newrelic`.
2. Edit `newrelic.yml` in that folder, or rely on environment variables. The minimum settings:

```yaml
# /opt/newrelic/newrelic.yml
common: &default_settings
  license_key: <%= ENV['NEW_RELIC_LICENSE_KEY'] %>
  app_name: <%= ENV['NEW_RELIC_APP_NAME'] %>
  distributed_tracing:
    enabled: true
  log:
    level: info
```

3. Start the application with the agent attached:

```bash
java -javaagent:/opt/newrelic/newrelic.jar -jar orders-service.jar
```

In Docker, set the same option through `JAVA_TOOL_OPTIONS` so the image does not change its entry point:

```yaml
# docker-compose.yml (fragment)
services:
  orders:
    image: orders-service:1.4.0
    environment:
      NEW_RELIC_LICENSE_KEY: ${NEW_RELIC_LICENSE_KEY}
      NEW_RELIC_APP_NAME: orders-service
      JAVA_TOOL_OPTIONS: "-javaagent:/opt/newrelic/newrelic.jar"
    volumes:
      - ./newrelic:/opt/newrelic:ro
```

After a minute or two, the service appears under **APM & Services** in the UI. Send a few requests and check that **Transaction** rows appear in the query builder.

## Kubernetes: the infrastructure bundle

For clusters, New Relic publishes a Helm chart that installs the infrastructure agent, the Kubernetes integration, log forwarding and the Prometheus OpenMetrics scraper in one step:

```bash
helm repo add newrelic https://helm-charts.newrelic.com
helm repo update

helm upgrade --install newrelic-bundle newrelic/nri-bundle \
  --namespace newrelic --create-namespace \
  --set global.licenseKey="$NEW_RELIC_LICENSE_KEY" \
  --set global.cluster=dev-eks \
  --set newrelic-infrastructure.privileged=true \
  --set logging.enabled=true
```

Use a secret reference (`global.licenseKeySecret`) rather than a literal key in any shared pipeline.

## Checking the data

Open **Query your data** and run a simple query. If the result is empty, the agent is not sending data, or the account is wrong.

```sql
SELECT count(*) FROM Transaction SINCE 30 minutes ago FACET appName
```

If the query returns rows for your app name, the pipeline works. If it returns nothing, check in order: the license key, the region endpoint, outbound network access from the container, and the agent log in the `logs/` folder of the agent directory.

## Quick-fire

- **Agent vs OpenTelemetry?** The agent is New Relic's own instrumentation, with no code changes. OpenTelemetry is the vendor-neutral standard, and New Relic accepts its data over OTLP.
- **License key vs user API key?** The license key sends data in. The user API key reads data out through the API.
- **Why use the EU region?** Data residency rules. The region is fixed at account creation.
- **What is an entity?** A monitored thing such as an application, host, database or service.
- **Where do traces come from?** Distributed tracing is on by default in current Java agents; spans appear under the Transaction.
