# Java: Microservices Interview Preparation

## Core Architecture Questions

### Q: What is a microservice?
A microservice is a small, independently deployable service that owns a single business capability and its own database. Services communicate over HTTP (REST/gRPC) or a message broker (Kafka).

Key properties:
- Single Responsibility — does one thing well
- Independently deployable — deploy hotel-service without touching reservation-service
- Owns its data — no shared database
- Communicates over the network — REST, Feign, Kafka

### Q: What are the main challenges of microservices?
| Challenge | Solution |
|---|---|
| Service discovery | Eureka (or Kubernetes DNS) |
| Network failures | Resilience4j: retry, circuit breaker, fallback |
| Distributed tracing | Micrometer Tracing + Zipkin (traceId in every log) |
| Data consistency | Saga pattern, eventual consistency, Kafka events |
| Operational complexity | Docker, Kubernetes, CI/CD pipelines |
| Configuration management | Spring Cloud Config, AWS Secrets Manager |

### Q: Monolith vs Microservices — when to choose what?
Use a **monolith** when:
- Small team (< 5 engineers)
- Domain is simple or not yet understood
- You don't need independent scaling

Use **microservices** when:
- Teams work on different parts simultaneously
- Services need to scale independently (payment spikes during promotions)
- Different tech stacks are needed per service
- You need independent deployments

---

## Service Discovery & Communication

### Q: How does Eureka work?
1. Eureka server starts (port 8761)
2. Services register on startup: name, IP, port, health check URL
3. Services send heartbeats every 30s
4. Services removed after 90s of missed heartbeats
5. Consumers fetch the registry, cache it locally, and call by name via load balancer

```yaml
# Client config
eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
  instance:
    prefer-ip-address: true   # use IP not hostname — important in Docker
```

### Q: What is a Feign client?
OpenFeign is a declarative HTTP client. Define an interface annotated with Spring MVC annotations — Feign generates the HTTP calls at runtime:

```java
@FeignClient(name = "hotel-service", fallbackFactory = HotelClientFallbackFactory.class)
public interface HotelClient {
    @GetMapping("/api/hotels/{id}")
    HotelDto getHotelById(@PathVariable Long id);
}
```

> Output in this page's answers is **illustrative** — representative of a real stack, not captured from one.

Calling `hotelClient.getHotelById(1L)` produces an ordinary HTTP call you never wrote:

```output
DEBUG c.e.r.client.HotelClient : [HotelClient#getHotelById] ---> GET http://hotel-service/api/hotels/1 HTTP/1.1
DEBUG c.e.r.client.HotelClient : [HotelClient#getHotelById] <--- HTTP/1.1 200 OK (34ms)
DEBUG c.e.r.client.HotelClient : [HotelClient#getHotelById] {"id":1,"name":"Grand Plaza","city":"Chennai"}
```

Note the host is the **service name**, `http://hotel-service`, not an address. The load balancer substitutes a real instance at call time:

```output
DEBUG o.s.c.l.core.RoundRobinLoadBalancer : Supplier returned 2 instances, selecting 192.168.1.20:8085
```

Feign resolves `hotel-service` in Eureka and load-balances across all instances. No URL hardcoding.

### Q: REST vs Kafka — when to use which?
| Use REST when | Use Kafka when |
|---|---|
| You need an immediate response | You can process asynchronously |
| Strong consistency required | Eventual consistency is acceptable |
| Simple request/reply | Fan-out to multiple consumers |
| Caller needs the result | Fire and forget |

Hotel example — REST: get reservation details (needs immediate hotel info).
Electricity example — Kafka: meter reading recorded → billing → notification (each step async).

---

## Resilience

### Q: What is a circuit breaker and why do you need one?
Without a circuit breaker, if `hotel-service` is slow, `reservation-service` threads pile up waiting for timeouts. Eventually `reservation-service` itself runs out of threads and crashes — cascading failure.

The circuit breaker monitors failure rate. When it exceeds the threshold, it opens the circuit: calls are rejected immediately and the fallback fires. No threads wasted waiting on a dead service.

```
hotel-service DOWN
    ↓
reservation-service: 5/5 calls fail → circuit OPENS
    ↓
Next 100 calls: circuit OPEN → fallback fires instantly → threads free
    ↓
After 10s: circuit goes HALF-OPEN → 2 probe calls
    ↓
hotel-service recovered → probes succeed → circuit CLOSES
```

### Q: What is the difference between Retry and Circuit Breaker?
- **Retry** — handles transient failures (network blips). Retries a few times with backoff.
- **Circuit Breaker** — handles sustained failures (service down). Stops calling after too many failures and gives the service time to recover.

Use both together: retry first, then if all retries fail, the circuit breaker tracks the failure.

### Q: What is exponential backoff with jitter?
Exponential backoff increases the wait time between retries:
- Attempt 1 fails → wait 500ms
- Attempt 2 fails → wait 1000ms
- Attempt 3 fails → wait 2000ms

Jitter adds a random offset to prevent all retrying callers from slamming the recovering service at the same time.

```yaml
resilience4j:
  retry:
    instances:
      hotel-service:
        max-attempts: 3
        wait-duration: 500ms
        enable-exponential-backoff: true
        exponential-backoff-multiplier: 2
```

### Q: What should a fallback method return?
A safe default that allows the main flow to continue degraded:

```java
public HotelDto hotelFallback(Long hotelId, Throwable t) {
    log.warn("hotel-service circuit OPEN for hotelId={}. Cause: {}", hotelId, t.getMessage());
    HotelDto fallback = new HotelDto();
    fallback.setId(hotelId);
    fallback.setName("Hotel information temporarily unavailable");
    fallback.setCity("N/A");
    return fallback;
}
```

```output
WARN  c.e.service.RemoteCallService : hotel-service circuit OPEN for hotelId=42.
      Cause: CircuitBreaker 'hotel-service' is OPEN and does not permit further calls

# what the caller receives — 200 OK, degraded:
{"id":42,"name":"Hotel information temporarily unavailable","city":"N/A"}
```

If the fallback throws instead, the exception propagates to the caller and you get the cascading failure the circuit breaker was added to prevent:

```output
HTTP/1.1 500 Internal Server Error
{"status":500,"error":"Internal Server Error","path":"/api/reservations/1"}
```

Never throw in a fallback — that defeats the purpose.

---

## Event-Driven / Kafka

### Q: What is a consumer group?
Multiple service instances form a group. Kafka distributes topic partitions across group members. Each message is delivered to exactly one member. Add instances to process more partitions in parallel.

```
Topic: bill.generated (3 partitions)

notification-service instance 1 → handles partition 0
notification-service instance 2 → handles partition 1
notification-service instance 3 → handles partition 2
```

### Q: How do you ensure ordering in Kafka?
Use a consistent message key. Messages with the same key go to the same partition, which is consumed in order by one consumer:

```java
// All events for customerId=7 go to the same partition
kafka.send(topic, customerId.toString(), event);
```

### Q: What is idempotency and why does Kafka need it?
Kafka delivers "at least once" — a consumer may receive the same message twice (if it crashes after processing but before committing the offset). The consumer must detect and skip duplicates:

```java
@KafkaListener(topics = "meter.readings.recorded", groupId = "billing-service")
public void onReading(MeterReadingRecordedEvent event) {
    if (bills.findByReadingId(event.readingId()).isPresent()) {
        log.info("Skipping duplicate reading {}", event.readingId());
        return;   // idempotent — safe to skip
    }
    // ... process
}
```

Delivering the same event twice gives:

```output
INFO  c.e.b.listener.MeterReadingListener : Generated bill 5012 for customer 7 amount=2856.40
INFO  c.e.b.listener.MeterReadingListener : Skipping duplicate reading rd-90211
```

Two deliveries, one bill. The second call cost a single database lookup and produced no side effect.

Use the upstream event's unique ID as the idempotency key.

### Q: What is consumer lag?
Lag = number of unprocessed messages = latest offset − consumer's committed offset.

```output
GROUP            TOPIC                     PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
billing-service  meter-readings.recorded   0          15234           15234           0
billing-service  meter-readings.recorded   1          15102           15890           788
billing-service  meter-readings.recorded   2          14998           14998           0
```

Lag concentrated on one partition, as here, points at a hot key rather than an undersized consumer — adding instances will not help, because one partition can only ever be read by one member of the group.

High lag means the consumer is falling behind. Fix by:
- Adding more consumer instances (up to the number of partitions)
- Optimising the consumer's processing logic
- Increasing partition count (requires rebalancing)

---

## Observability

### Q: What is the ELK stack?
- **E**lasticsearch — stores and indexes logs
- **L**ogstash — receives logs (TCP/Beats), parses, routes to Elasticsearch
- **K**ibana — visualize logs, create dashboards, set alerts

Spring Boot → Logback (JSON format) → Logstash TCP → Elasticsearch → Kibana

### Q: What is the difference between logs and metrics?
- **Logs** — individual events with context: "Bill 42 generated for customer 7, amount=345.50"
- **Metrics** — aggregated numbers over time: "billing-service processed 1,200 bills/min this hour"

Use logs to debug a specific incident. Use metrics to monitor trends and set alerts.

### Q: What Prometheus metrics does Spring Boot expose automatically?
```
http_server_requests_seconds    — request rate and latency by path + status code
jvm_memory_used_bytes           — heap and non-heap usage
hikaricp_connections_active     — DB connection pool usage
resilience4j_circuitbreaker_state — 0=CLOSED, 1=OPEN, 2=HALF_OPEN
```

Enable with:
```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

---

## Security

### Q: What is JWT and how does stateless auth work?
JSON Web Token — a signed, self-contained token that carries claims (userId, roles). The server validates the signature without a database lookup:

```
Client → POST /auth/login → auth-service returns JWT
Client → GET /api/reservations (Authorization: Bearer <jwt>) → any service instance validates token
```

No session stored on the server — any instance can validate any request. This enables horizontal scaling.

### Q: How do you share JWT validation across microservices?
Extract JWT parsing into a shared library (`common-security`) used by all services:

```java
@AutoConfiguration
public class SecurityAutoConfiguration {
    @Bean
    @ConditionalOnMissingBean
    public JwtAuthenticationFilter jwtAuthenticationFilter(JwtService jwtService) {
        return new JwtAuthenticationFilter(jwtService);
    }
}
```

`@ConditionalOnMissingBean` — a service can override one specific bean without losing the rest.

---

## DevOps

### Q: What is the difference between Docker and Kubernetes?
- **Docker** — runs containers on one machine
- **Kubernetes** — orchestrates containers across a cluster: scheduling, scaling, health checks, rolling deploys, service discovery

ECS is AWS's managed alternative to Kubernetes — simpler to operate, less portable.

### Q: What is a multi-stage Dockerfile?
Two stages: build (JDK + Maven → JAR) and runtime (JRE + JAR). The final image only contains the JRE — no compiler or build tools, reducing image size from ~450 MB to ~200 MB.

```dockerfile
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY . .
RUN ./mvnw clean package -DskipTests

FROM eclipse-temurin:21-jre
COPY --from=build /app/target/*.jar app.jar
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### Q: How do you do a zero-downtime deployment?
ECS rolling update: start new containers, wait for health check to pass (`/actuator/health` returns 200), then stop old containers. At least 50% of the desired count stays running throughout.

In Kubernetes: `RollingUpdate` strategy with `maxUnavailable: 0` achieves the same.

---

## Design Patterns

### Q: What is the Saga pattern?
Manages distributed transactions across microservices. Since there is no shared database, a single business operation (e.g., hotel booking) that spans multiple services uses a saga — a sequence of local transactions, each publishing an event that triggers the next.

**Choreography saga (event-driven):**
```
reservation-service → creates reservation → publishes ReservationCreated
payment-service → consumes ReservationCreated → charges card → publishes PaymentCompleted
room-service → consumes PaymentCompleted → marks room BOOKED
```

If a step fails, a compensating transaction rolls back:
```
payment fails → publishes PaymentFailed
reservation-service → consumes PaymentFailed → marks reservation CANCELLED
```

### Q: What is the API Gateway pattern?
A single entry point for all clients. Responsibilities:
- Route `/api/hotels/**` to hotel-service
- Route `/api/reservations/**` to reservation-service
- Authenticate requests (JWT validation at the gateway)
- Rate limiting, request transformation
- SSL termination

Clients call the gateway — they never know about individual service ports.

### Q: What is the Strangler Fig pattern?
Migrate a monolith incrementally:
1. Put a proxy (API gateway) in front of the monolith
2. Implement a new feature as a standalone microservice
3. Route that feature's traffic to the new service
4. Shrink the monolith, repeat

The monolith is "strangled" over time without a risky big-bang rewrite.

---

## Quick-Reference Code Snippets

**Enable Feign:**
```java
@SpringBootApplication
@EnableFeignClients
public class ReservationServiceApplication { ... }
```

**Enable Eureka server:**
```java
@SpringBootApplication
@EnableEurekaServer
public class EurekaServerApplication { ... }
```

**Circuit breaker + retry (separate bean required):**
```java
@Retry(name = "hotel-service")
@CircuitBreaker(name = "hotel-service", fallbackMethod = "hotelFallback")
public HotelDto fetchHotel(Long hotelId) { ... }
```

**Kafka listener with idempotency:**

> The snippets in this section are fragments for recall, not runnable programs — the outputs below show what each produces in a running stack, and are illustrative rather than captured.

```java
@KafkaListener(topics = "meter.readings.recorded", groupId = "billing-service")
public void onReading(MeterReadingRecordedEvent event) {
    if (bills.findByReadingId(event.readingId()).isPresent()) return;
    // ... process
}
```

**Expose Prometheus metrics:**
```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info, prometheus, metrics, circuitbreakers
```
