# Docker: Logging and Preserving Logs

When a container crashes, its logs are the first evidence you need. But the default behaviour can lose them: `docker rm` deletes them with the container, `--rm` deletes them the moment the container exits, and an orchestrator may replace a crashed pod before anyone looks. This page explains where Docker keeps logs, how to keep them after the container is gone, and how to write logs that are useful when something breaks.

## How Docker captures logs

Docker captures everything the container's main process writes to **stdout** and **stderr**, and stores it through a **logging driver**. The default driver is `json-file`.

```
app writes to stdout/stderr ──▶ containerd shim ──▶ logging driver ──▶ json-file on host
                                                                   or syslog / journald
                                                                   or Fluentd / awslogs / Loki / GELF
```

```bash
docker logs orders                 # all output so far
docker logs -f --tail 100 orders   # follow the last 100 lines
docker logs --since 10m orders     # last 10 minutes
docker logs -t orders              # with timestamps
```

With `json-file`, logs live under `/var/lib/docker/containers/<id>/<id>-json.log`. Each line is a JSON record:

```json
{"log":"Started OrdersApplication in 4.2 seconds\n","stream":"stdout","time":"2026-10-27T09:14:02.118Z"}
```

## What is lost, and when

| Action | Logs kept? |
|---|---|
| Container stops normally (`docker stop`) | Yes |
| Container crashes (non-zero exit) | Yes, until the container is removed |
| `docker restart` | Yes; the same container keeps its log |
| `docker rm <container>` | **No**: deleted with the container |
| `docker run --rm` | **No**: removed as soon as it exits |
| `docker compose down` | **No**: containers are removed |
| Host reboot with `--rm` containers | **No** |
| Container rebuilt or replaced by a new deploy | **No**, unless logs were shipped elsewhere |
| Logs written to a file inside the container, and the container is removed | **No** |
| Kubernetes pod replaced after crash | Only the previous container's logs, until the node rotates them |

Two facts drive the solution:

1. **Logs must leave the container** as they are written.
2. **Logs must be stored outside the lifecycle of the container**.

## Keep logs after the container is gone

### Option 1: Keep the container around after a crash

Remove `--rm` and avoid `docker rm` until you have looked. Use `docker inspect` to read the exit state:

```bash
docker run -d --name orders --restart on-failure:3 orders-service:1.0
docker inspect -f 'exit={{.State.ExitCode}} oom={{.State.OOMKilled}} error={{.State.Error}} finished={{.State.FinishedAt}}' orders
docker logs --timestamps orders > ~/incidents/orders-$(date +%F-%H%M).log
```

```output
exit=1 oom=false error= finished=2026-10-27T09:21:44.512Z
```

This is manual and does not scale. It is a debugging technique, not a retention policy.

### Option 2: Choose a log driver that ships logs

Set the driver per container, or set it as the daemon default in `/etc/docker/daemon.json`.

```bash
docker run -d --name orders \
  --log-driver json-file \
  --log-opt max-size=20m \
  --log-opt max-file=5 \
  --log-opt compress=true \
  --log-opt labels=service,env \
  orders-service:1.0
```

Note the rotation options. Without `max-size` the `json-file` log grows until the disk is full, which is a common outage.

| Driver | Ships to | Use when |
|---|---|---|
| `json-file` | Local file (default) | Single host, short-term |
| `local` | Local compressed binary store | Better default than json-file for rotation |
| `journald` | systemd journal | Linux hosts that already use journald |
| `syslog` / `gelf` | Syslog server, Graylog, Logstash | Central server |
| `fluentd` | Fluentd / Fluent Bit | Routing to Elasticsearch, S3, Loki |
| `awslogs` | CloudWatch Logs | Running on EC2 or ECS |
| `loki` | Grafana Loki (plugin) | Grafana-based stack |

```json
{
  "log-driver": "local",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
```

```bash
docker run -d --name orders --log-driver awslogs \
  --log-opt awslogs-region=us-east-1 \
  --log-opt awslogs-group=/ecs/orders \
  --log-opt awslogs-stream=orders-1 \
  orders-service:1.0
```

Caveat: if a driver cannot reach its destination, some drivers block the container or drop messages. Use `--log-opt mode=non-blocking` with `max-buffer-size` for the `gelf`, `fluentd` and `awslogs` drivers when losing a few lines is better than stalling the app.

### Option 3: A log-shipping sidecar (recommended for a full stack)

Run **Fluent Bit** (or Filebeat) on each host. It reads the container log files, adds metadata, and ships them to a central store that outlives every container. This is the pattern used by Kubernetes and most Docker fleets.

```yaml
# docker-compose.yml: ship all container logs to Loki, Elasticsearch, or S3
services:
  fluent-bit:
    image: fluent/fluent-bit:3.0
    volumes:
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - ./fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf:ro
    restart: unless-stopped

  orders:
    image: orders-service:1.0
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"
        tag: "{{.Name}}"
```

```ini
# fluent-bit.conf
[SERVICE]
    Flush        5
    Parsers_File parsers.conf

[INPUT]
    Name             tail
    Path             /var/lib/docker/containers/*/*.log
    Parser           docker
    Tag              docker.*
    Refresh_Interval 5
    DB               /var/log/flb_docker.db

[FILTER]
    Name   parser
    Match  docker.*
    Key_Name log
    Parser json
    Reserve_Data On

[OUTPUT]
    Name   es
    Match  *
    Host   elasticsearch
    Port   9200
    Index  docker-logs
```

Fluent Bit's `DB` file remembers its read position, so logs are not sent twice after a restart. Note that Fluent Bit must be able to read logs after the container is removed; `json-file` files remain until Docker deletes them with the container. Shipping must happen quickly, or use a driver that sends directly.

### Option 4: Bind-mount a log directory (for apps that write files)

If an application writes log files, mount a host directory so the files outlive the container:

```bash
mkdir -p /var/log/orders
docker run -d --name orders -v /var/log/orders:/var/log/app orders-service:1.0
```

Configure the app to log to `/var/log/app/orders.log`, and rotate the files on the host with `logrotate`. Prefer stdout where possible, since file logs need extra plumbing.

## Writing logs that survive and help

Preserving logs is half the job. The other half is writing them so someone can use them during an incident.

### 1. Log to stdout and stderr

Do not write log files inside the container. Anything written to the container's filesystem is lost when the container is removed, and it fills the writable layer.

```bash
# Good: the app writes to stdout; Docker handles the rest
java -jar app.jar

# Bad: writing to a path inside the container layer
java -jar app.jar > /app/logs/app.log
```

Configure Spring Boot's console appender to write to stdout and let the framework format it:

```xml
<!-- logback-spring.xml -->
<configuration>
  <appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
  </appender>
  <root level="INFO">
    <appender-ref ref="JSON"/>
  </root>
</configuration>
```

### 2. Use structured JSON

One JSON object per line is easy to parse, filter and query in any log tool. Free text is hard to search.

```json
{"ts":"2026-10-27T09:21:44.512Z","level":"ERROR","service":"orders","env":"prod","traceId":"4bf92f3577b34da6","orderId":"o-1001","msg":"payment gateway timeout","latencyMs":5012,"exception":"java.net.SocketTimeoutException"}
```

Filtering becomes `level = "ERROR" and service = "orders"` in Kibana, Grafana Loki, or CloudWatch Logs Insights.

### 3. Include the context you will need later

| Field | Why |
|---|---|
| `ts` (UTC, ISO 8601, with milliseconds) | Ordering across services and hosts |
| `level` | Filter noise |
| `service`, `version`, `env` | Which build and environment produced the line |
| `traceId` / `requestId` | Follow one request across services |
| `hostname` or container ID | Which instance, when several run |
| Business identifiers (orderId, customerId) | Support questions start from an ID |
| Duration and outcome | Performance and failure analysis |

### 4. Use the right level

| Level | Use for |
|---|---|
| `ERROR` | Something failed and needs attention; the request or job did not complete |
| `WARN` | Unexpected but handled, or a degraded state (retry, fallback) |
| `INFO` | Significant lifecycle and business events (started, order placed) |
| `DEBUG` | Detail for diagnosis; off in production by default |

Do not log at `ERROR` for expected conditions such as "user not found", or alerts become noise.

### 5. Never log secrets or personal data

Passwords, tokens, card numbers, and full personal records must not appear in logs. Logs are copied, retained, and read by many people.

```java
log.info("Connecting to db user={} url={}", user, url);     // ok, no password
log.debug("Request headers: {}", headers);                  // risky: Authorization header
```

Mask at the source (`****1234` for card numbers), and configure the logging library to drop known sensitive fields.

### 6. Log exceptions with stack traces, once

```java
try {
    gateway.charge(order);
} catch (GatewayTimeoutException e) {
    log.error("Payment failed for orderId={} attempt={}", order.id(), attempt, e);
    throw e;
}
```

Pass the exception as the last argument so the stack trace is kept. Logging the same error at every layer produces duplicates; log it where it is handled.

### 7. Flush before you exit

When a process is killed, buffered log lines can be lost. Let the app shut down gracefully on `SIGTERM`, and make sure the logging library flushes its buffer. Use an asynchronous appender with a bounded queue, and set a sensible shutdown timeout:

```xml
<appender name="ASYNC" class="ch.qos.logback.classic.AsyncAppender">
  <queueSize>8192</queueSize>
  <discardingThreshold>0</discardingThreshold>
  <neverBlock>false</neverBlock>
  <appender-ref ref="JSON"/>
</appender>
```

### 8. Capture the crash itself

- Let the JVM write a heap dump on out-of-memory: `-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps`, with `/dumps` on a volume.
- Write a crash marker to stderr before exiting on a fatal error.
- Keep the exit code; `137` often means the kernel OOM killer stopped the process (check `OOMKilled`).

```bash
docker run -d --name orders \
  -v orders-dumps:/dumps \
  -e JAVA_TOOL_OPTIONS="-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps" \
  --memory 1g orders-service:1.0
```

### 9. Timestamps and time zones

Use UTC everywhere. Containers often run in UTC while laptops run in local time; mixed zones make incident timelines wrong.

## Log rotation and retention

| Layer | Setting | Guidance |
|---|---|---|
| Docker driver | `max-size`, `max-file` | 10 to 50 MB, 3 to 5 files, on every container |
| Central store | Retention in days | Application logs 14 to 30 days; audit logs per compliance |
| Cold storage | S3 lifecycle to Glacier | For long-term audit |
| Cost | Sampling or filtering | Drop DEBUG in prod; sample noisy health checks |

## Reading logs after a crash: a short runbook

```bash
# 1. Is the container still there?
docker ps -a --filter name=orders

# 2. Why did it stop?
docker inspect -f '{{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}}' orders

# 3. What did it say last?
docker logs --timestamps --tail 200 orders

# 4. Is the central store holding it?
#    Search by service and time range in Kibana, Grafana (Loki), or CloudWatch Logs Insights

# 5. Save evidence before cleaning up
docker logs --timestamps orders > incident-orders-$(date +%F-%H%M).log
docker inspect orders > incident-orders-inspect.json
```

## Where this topic is taught in the wiki

- **Docker** (this page): how Docker captures and rotates logs, log drivers, keeping logs after crashes, and writing container-friendly logs.
- **Java > Observability** (ELK, Logstash, Logback configuration): how a Java service produces structured logs and ships them to Elasticsearch.
- **AWS > Monitoring**: CloudWatch Logs, retention, and Logs Insights, used when the awslogs driver or ECS ships logs.
- **Kibana** and **Grafana**: searching and alerting on the logs once they are stored.

## Key takeaways

- Docker keeps logs only as long as the container, unless a log driver or shipper moves them.
- Use `--rm` with care: it deletes the evidence.
- Log to stdout as structured JSON with a timestamp, level, service, version and trace ID.
- Ship logs to a central store with a shipper such as Fluent Bit, and set rotation limits on every container.
- Never log secrets; never write logs to the container filesystem.
