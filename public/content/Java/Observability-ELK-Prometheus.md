# Java: Observability — ELK Stack, Prometheus & Kibana

> **See also:** the Docker section covers how container logs are captured, rotated and kept after a crash (*Logging and Preserving Logs*). The Kibana and Grafana sections go deeper on KQL, dashboards, Loki and alerting.

## The Three Pillars of Observability

| Pillar | Tool | What it answers |
|---|---|---|
| **Logs** | ELK (Elasticsearch + Logstash + Kibana) | "What happened and when?" |
| **Metrics** | Prometheus + Grafana | "How is the system behaving over time?" |
| **Traces** | Micrometer Tracing / Zipkin | "How did this one request flow across services?" |

## ELK Stack Overview

```
Spring Boot App
    │ JSON logs via TCP
    ▼
Logstash :5000         ← receives, parses, routes
    │
    ▼
Elasticsearch :9200    ← stores and indexes logs
    │
    ▼
Kibana :5601           ← visualize, search, alert
```

## Docker Compose Setup

From the electricity billing system — full ELK + Prometheus stack:

```yaml
services:

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.3
    container_name: ebs-elasticsearch
    environment:
      discovery.type: single-node           # single-node for local dev
      xpack.security.enabled: "false"       # disable auth for local dev
      ES_JAVA_OPTS: "-Xms512m -Xmx512m"    # keep memory usage reasonable
    ports:
      - "9200:9200"
    volumes:
      - es-data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:8.15.3
    container_name: ebs-logstash
    depends_on: [elasticsearch]
    ports:
      - "5044:5044"       # Beats input
      - "5000:5000/tcp"   # TCP input (apps send JSON logs here)
      - "9600:9600"       # Logstash monitoring API
    volumes:
      - ./infrastructure/docker/logstash/pipeline:/usr/share/logstash/pipeline:ro
      - ./infrastructure/docker/logstash/config/logstash.yml:/usr/share/logstash/config/logstash.yml:ro

  kibana:
    image: docker.elastic.co/kibana/kibana:8.15.3
    container_name: ebs-kibana
    depends_on: [elasticsearch]
    ports:
      - "5601:5601"
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200

volumes:
  es-data:
```

## Logstash Pipeline Configuration

This pipeline receives JSON logs from all microservices and routes them to per-service indexes:

```
# infrastructure/docker/logstash/pipeline/logstash.conf

input {
  tcp {
    port  => 5000
    codec => json_lines      # expects one JSON object per line
  }
}

filter {
  # Route to index based on the "service" field in the JSON log
  if [service] {
    mutate { add_field => { "[@metadata][index]" => "ebs-%{service}-%{+YYYY.MM.dd}" } }
  } else {
    mutate { add_field => { "[@metadata][index]" => "ebs-unknown-%{+YYYY.MM.dd}" } }
  }
}

output {
  elasticsearch {
    hosts => ["http://elasticsearch:9200"]
    index => "%{[@metadata][index]}"
  }
  stdout { codec => rubydebug }   # also print to Logstash console for debugging
}
```

This produces daily rolling indexes like:
- `ebs-billing-service-2025-07-02`
- `ebs-payment-service-2025-07-02`

## Spring Boot: Sending Logs to Logstash

### Dependency

```xml
<!-- Logback Logstash encoder — formats logs as JSON and ships to Logstash -->
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
</dependency>
```

### logback-spring.xml

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>

    <!-- Console appender (human-readable for local dev) -->
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss} [%thread] %-5level %logger{36} — %msg%n</pattern>
        </encoder>
    </appender>

    <!-- Logstash TCP appender — sends structured JSON -->
    <appender name="LOGSTASH" class="net.logstash.logback.appender.LogstashTcpSocketAppender">
        <destination>localhost:5000</destination>
        <encoder class="net.logstash.logback.encoder.LogstashEncoder">
            <!-- Adds a "service" field so Logstash can route to the right index -->
            <customFields>{"service":"billing-service"}</customFields>
        </encoder>
    </appender>

    <root level="INFO">
        <appender-ref ref="CONSOLE"/>
        <appender-ref ref="LOGSTASH"/>
    </root>
</configuration>
```

### Structured Logging in Code

```java
@Component
public class MeterReadingListener {

    private static final Logger log = LoggerFactory.getLogger(MeterReadingListener.class);

    @KafkaListener(topics = "meter.readings.recorded", groupId = "billing-service")
    public void onReading(MeterReadingRecordedEvent event) {
        // Structured key=value pairs — Logstash can filter on these
        log.info("Generated bill {} for customer {} amount={}",
                saved.getId(), saved.getCustomerId(), saved.getTotalAmount());

        log.warn("Skipping duplicate reading {}", event.readingId());
    }
}
```

The JSON log line sent to Logstash looks like:
```json
{
  "@timestamp": "2025-07-02T10:30:00.000Z",
  "level": "INFO",
  "logger_name": "com.electricity.billing.billing.MeterReadingListener",
  "message": "Generated bill 42 for customer 7 amount=345.50",
  "service": "billing-service"
}
```

> Output on this page is **illustrative** — representative of a real stack, not captured from one, since it needs Elasticsearch, Logstash, Kibana and Prometheus running.

Two things to notice about that JSON. First, the human-readable `message` still carries the interesting values (`bill 42`, `customer 7`, `amount=345.50`) glued into a sentence — which means searching for "all bills over 300" is a substring hunt, not a query. Adding them as real fields fixes that:

```java
log.atInfo()
   .addKeyValue("billId", saved.getId())
   .addKeyValue("customerId", saved.getCustomerId())
   .addKeyValue("amount", saved.getTotalAmount())
   .log("Generated bill");
```

```output
{
  "@timestamp": "2026-09-23T10:30:00.000Z",
  "level": "INFO",
  "logger_name": "com.electricity.billing.billing.MeterReadingListener",
  "message": "Generated bill",
  "service": "billing-service",
  "billId": 42,
  "customerId": 7,
  "amount": 345.50
}
```

Now `amount > 300` is a real Kibana filter rather than a regex over free text. That is the practical difference between "logging in JSON" and structured logging.

## Kibana: Exploring Logs

### First-Time Setup

1. Open `http://localhost:5601`
2. **Stack Management → Index Patterns → Create index pattern**
3. Pattern: `ebs-*` (matches all service indexes)
4. Time field: `@timestamp`

### Useful Discover Queries

```
# All billing service logs
service: "billing-service"

# Logs containing a specific customer
message: "customer 7"

# Errors only
level: "ERROR"

# Specific time range — use the date picker in the UI
service: "payment-service" AND level: "WARN"
```

### Creating a Dashboard

1. Discover → save a search "Billing Errors" (filter: `service:billing-service AND level:ERROR`)
2. Dashboard → Add panel → choose the saved search
3. Add a **Lens** visualization: bar chart of log count by service by hour
4. Set auto-refresh to 30s for live monitoring

## Prometheus Metrics

Prometheus scrapes metrics from `/actuator/prometheus` on each service and stores time-series data for graphing in Grafana.

### Dependencies

```xml
<!-- Micrometer Prometheus registry -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
<!-- Actuator exposes /actuator/prometheus -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

### Application Config

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info, metrics, prometheus
```

### Prometheus Scrape Config

```yaml
# prometheus.yml
global:
  scrape_interval: 15s   # pull metrics every 15 seconds

scrape_configs:
  - job_name: reservation-app
    metrics_path: /actuator/prometheus
    static_configs:
      - targets:
          - host.docker.internal:8080   # use host.docker.internal when app runs outside Docker
```

For the electricity billing system with 9 services:

```yaml
scrape_configs:
  - job_name: billing-service
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ["billing-service:8086"]

  - job_name: payment-service
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ["payment-service:8087"]

  # ... one entry per service
```

### Key Metrics Spring Boot Exposes Automatically

| Metric | What it measures |
|---|---|
| `http_server_requests_seconds` | Request count, latency (p50, p95, p99) by path + status |
| `jvm_memory_used_bytes` | Heap and non-heap memory |
| `jvm_gc_pause_seconds` | GC pause durations |
| `hikaricp_connections_active` | Active DB connection pool usage |
| `resilience4j_circuitbreaker_state` | 0=CLOSED, 1=OPEN, 2=HALF_OPEN |
| `kafka_consumer_lag` | How far behind the consumer is |

### Querying in Prometheus/Grafana (PromQL)

```promql
# Request rate per service (requests/sec over last 5 min)
rate(http_server_requests_seconds_count[5m])

# 95th percentile response time for reservation-service
histogram_quantile(0.95,
  rate(http_server_requests_seconds_bucket{job="reservation-service"}[5m])
)

# Circuit breaker state (1 = OPEN = bad)
resilience4j_circuitbreaker_state{name="hotel-service"}

# DB connection pool saturation
hikaricp_connections_active / hikaricp_connections_max
```

#### Output

Each query returns a labelled series. `rate(http_server_requests_seconds_count[5m])`:

```output
{job="reservation-service", method="GET", uri="/api/reservations", status="200"}   12.4
{job="reservation-service", method="POST", uri="/api/reservations", status="200"}   3.1
{job="reservation-service", method="GET", uri="/api/reservations/{id}", status="404"} 0.7
```

Note `uri` is the **templated** path, `/api/reservations/{id}`, not `/api/reservations/42`. Micrometer does that deliberately — recording the raw path would create a new time series per id and blow up cardinality until Prometheus falls over. High-cardinality labels are the standard way to break a metrics backend.

The circuit breaker gauge is the one to alert on:

```output
resilience4j_circuitbreaker_state{name="hotel-service", state="closed"}     0
resilience4j_circuitbreaker_state{name="hotel-service", state="open"}       1
resilience4j_circuitbreaker_state{name="hotel-service", state="half_open"}  0
```

It is exposed as one series **per state**, each 0 or 1, rather than a single series with a numeric state. So the alert expression is `resilience4j_circuitbreaker_state{state="open"} == 1`, not `... == 1` on a bare gauge — a detail that trips people up when writing the first alert rule.

And the pool saturation query returns a plain ratio:

```output
{job="reservation-service", pool="HikariPool-1"}   0.9
```

0.9 means nine of ten connections are checked out. Sustained above ~0.8 and requests are queueing for a connection, which surfaces to users as latency with no obvious cause in the application code.

## Correlation: Connecting Logs to Metrics

Add a `traceId` field to every log so you can jump from a Kibana log to Zipkin trace:

```xml
<!-- pom.xml -->
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-brave</artifactId>
</dependency>
<dependency>
    <groupId>io.zipkin.reporter2</groupId>
    <artifactId>zipkin-reporter-brave</artifactId>
</dependency>
```

```yaml
management:
  tracing:
    sampling:
      probability: 1.0   # sample every request (use 0.1 in prod)
  zipkin:
    tracing:
      endpoint: http://localhost:9411/api/v2/spans
```

The `traceId` auto-appears in every log line so you can search Kibana by trace ID.

## Complete Observability Stack (docker-compose excerpt)

```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports: ["9090:9090"]
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports: ["3000:3000"]
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.3
    ports: ["9200:9200"]

  logstash:
    image: docker.elastic.co/logstash/logstash:8.15.3
    ports: ["5000:5000"]

  kibana:
    image: docker.elastic.co/kibana/kibana:8.15.3
    ports: ["5601:5601"]

  zipkin:
    image: openzipkin/zipkin
    ports: ["9411:9411"]
```

## Interview Questions

**Q: What is ELK?**
- Elasticsearch (search/storage), Logstash (pipeline — receive, transform, route), Kibana (visualization and dashboards). Apps ship logs to Logstash → stored in Elasticsearch → visualized in Kibana.

**Q: What is the difference between logs and metrics?**
- Logs are discrete events: "bill generated for customer 7, amount=345.50". Metrics are aggregated numbers over time: "billing service processed 1200 bills/min this hour". Logs give detail; metrics give trends.

**Q: What is a sliding window in Prometheus?**
- In PromQL, `rate(metric[5m])` computes the per-second rate over the last 5 minutes. The 5m is the sliding window — it moves with time, always showing the most recent 5 minutes.

**Q: How do you search Kibana for logs from a specific trace?**
- Add the trace ID as a field in your log output (`traceId: "abc123"`). In Kibana Discover, filter on `traceId: "abc123"` to see all log lines from that request across all services.

**Q: What is the difference between Logstash and Filebeat?**
- Filebeat is a lightweight shipper — it tails log files and forwards lines. Logstash is a full pipeline: it parses, transforms, filters, and routes. In production, Filebeat ships to Logstash which processes and sends to Elasticsearch (Filebeat → Logstash → Elasticsearch → Kibana).
