# Grafana: Overview, Data Sources and Local Setup

**Grafana** is an open-source platform for visualising and alerting on data. It does not store data itself. It connects to **data sources** such as Prometheus (metrics), Loki (logs), Tempo (traces), Elasticsearch, PostgreSQL, CloudWatch and dozens more, and builds dashboards from their queries. One Grafana can show a service's latency from Prometheus next to its error logs from Loki on the same screen.

## Grafana in the observability stack

| Signal | Typical store | Query language | Grafana panel |
|---|---|---|---|
| **Metrics** | Prometheus, Mimir, CloudWatch | PromQL | Time series, gauge, stat, heatmap |
| **Logs** | Loki, Elasticsearch | LogQL | Logs panel, log-count graphs |
| **Traces** | Tempo, Jaeger | TraceQL | Trace view |
| **Business data** | PostgreSQL, MySQL | SQL | Table, bar, time series |
| **Cloud** | CloudWatch, Azure Monitor | Cloud-specific | Any panel type |

Grafana vs Kibana in one line: Kibana is built around Elasticsearch documents and search; Grafana is built around time-series dashboards across many sources. Many teams use both: Grafana for metrics and dashboards, Kibana for deep log search.

## Architecture

```
Application ──/actuator/prometheus──▶ Prometheus ──┐
Containers  ──log driver / agent────▶ Loki ─────────┼──▶ Grafana (dashboards, explore, alerting)
Services    ──OpenTelemetry─────────▶ Tempo ────────┘
```

Grafana holds only its own configuration (dashboards, users, data source definitions) in a database, SQLite by default. The data stays in the data sources.

## Local setup with Docker Compose

This stack runs Grafana, Prometheus scraping a sample Spring Boot service, and Loki for logs:

```yaml
# docker-compose.yml
name: grafana-lab

services:
  grafana:
    image: grafana/grafana:11.2.0
    ports: ["3000:3000"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: change-me-locally
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    depends_on: [prometheus, loki]

  prometheus:
    image: prom/prometheus:v2.54.1
    ports: ["9090:9090"]
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus-data:/prometheus
    command:
      - --config.file=/etc/prometheus/prometheus.yml
      - --storage.tsdb.retention.time=15d

  loki:
    image: grafana/loki:3.1.0
    ports: ["3100:3100"]
    command: ["-config.file=/etc/loki/local-config.yaml"]

  orders:
    image: orders-service:1.0
    ports: ["8080:8080"]

volumes:
  grafana-data:
  prometheus-data:
```

Provisioning means Grafana loads its data sources and dashboards from files at start-up, so the setup is reproducible and reviewable in git:

```yaml
# grafana/provisioning/datasources/datasources.yml
apiVersion: 1
datasources:
  - name: Prometheus
    uid: prometheus
    type: prometheus
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: 15s

  - name: Loki
    uid: loki
    type: loki
    url: http://loki:3100
    jsonData:
      maxLines: 1000
```

```yaml
# grafana/provisioning/dashboards/dashboards.yml
apiVersion: 1
providers:
  - name: default
    folder: Services
    type: file
    disableDeletion: true
    options:
      path: /etc/grafana/provisioning/dashboards/json
```

Scrape the application's metrics endpoint:

```yaml
# prometheus/prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: orders
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ["orders:8080"]
        labels:
          service: orders
          env: dev
```

```bash
docker compose up -d
curl -s localhost:9090/api/v1/targets | python3 -m json.tool | grep -E '"health"|"scrapeUrl"'
```

```output
"health": "up",
"scrapeUrl": "http://orders:8080/actuator/prometheus",
```

Open **http://localhost:3000** and sign in as `admin`. Under Connections → Data sources, Prometheus and Loki should show as working when you press **Save & test**.

## Grafana's main areas

| Area | Purpose |
|---|---|
| **Home / Dashboards** | Browse, search and organise dashboards in folders |
| **Explore** | Ad hoc queries against any data source; the fastest way to test PromQL or LogQL |
| **Drilldown** | Guided views of metrics, logs and traces without writing queries (Grafana 11+) |
| **Alerting** | Alert rules, contact points, notification policies, silences |
| **Connections** | Data sources and plugins |
| **Administration** | Users, teams, organisations, folders, permissions, service accounts |

Use **Explore** to build a query, then copy it into a panel. Explore shows the query results before you commit to a layout.

## Grafana concepts

| Term | Meaning |
|---|---|
| **Data source** | Connection to a store, with URL and credentials |
| **Dashboard** | A page of panels, with variables and a time range |
| **Panel** | One visualisation with one or more queries |
| **Query** | The data request, in the data source's language |
| **Variable** | A dropdown or text value that changes queries across all panels (for example `service`) |
| **Annotation** | A marker on a graph for an event, such as a deployment |
| **Folder** | Group of dashboards, with permissions |
| **Organisation** | Top-level tenant; separates users and dashboards |
| **Service account** | Non-human identity with an API token, for automation |

## Dashboards as code

The Grafana API and Terraform (`grafana` provider) can create dashboards, data sources and alert rules. Export a dashboard as JSON from its settings, store the JSON in git, and load it through provisioning. Changes then go through review like any other code.

```bash
curl -s -H "Authorization: Bearer $GRAFANA_TOKEN" \
  localhost:3000/api/dashboards/uid/orders-overview | python3 -m json.tool > orders-overview.json
```

## Security basics

| Practice | Why |
|---|---|
| Change the admin password on first start | The default is public knowledge |
| Disable sign-up; use SSO (OIDC, SAML, LDAP) in production | Central accounts and offboarding |
| Use teams and folder permissions | Limit who edits which dashboards |
| Use service accounts with minimal roles for automation | Avoid personal tokens in scripts |
| Put Grafana behind TLS and a reverse proxy | Credentials and dashboards in transit |
| Restrict data source credentials to read-only users | Dashboards should not change data |

## Key takeaways

- Grafana visualises data from many sources; it does not store the metrics or logs itself.
- Provision data sources and dashboards from files so the setup is reproducible.
- Use Explore to test queries before adding them to dashboards.
- Prometheus scrapes metrics from `/actuator/prometheus`; Loki stores logs; Grafana joins them on one screen.
