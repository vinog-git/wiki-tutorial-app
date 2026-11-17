# DB: Fault Tolerance

A system is fault tolerant when the failure of some of its parts does not stop it from doing its job, or from doing it correctly. In distributed systems failures are normal: disks die, networks drop packets, processes run out of memory, and deployments break things. Design for them instead of hoping they do not happen.

## Failure modes to design for

- **Crash**: a process or machine stops.
- **Slow response**: often the worst case, because callers wait and resources pile up.
- **Network partition**: some nodes cannot reach others. See [CAP and PACELC](/DB/CAP-and-PACELC).
- **Partial failure**: one instance of a service is bad while the rest are fine.
- **Duplicate or lost messages**: retries and timeouts cause repeats, and crashes cause losses.
- **Overload**: more requests than capacity, so everything slows down.
- **Bad data or a bad deploy**: wrong data written everywhere.

## Core techniques

### 1. Timeouts on every remote call

Without a timeout, one stuck dependency ties up threads until your service dies too. Set a timeout on every network call: database, HTTP and message broker. Budget them. The timeout for the whole request must be larger than the timeouts of the calls it makes.

### 2. Retries with backoff and jitter

Retry only transient failures, such as timeouts, 503 responses and connection resets. Never retry validation errors. Use exponential backoff with random jitter:

```
sleep = random(0, min(cap, base * 2^attempt))
```

Jitter spreads retries out, so clients do not all hit the service at the same moment. Limit the number of attempts. Retrying a non-idempotent operation, such as charging a card, can charge it twice.

### 3. Idempotency

Make operations safe to repeat. Give each request an idempotency key that the client generates, and store the result against it. A repeated request then returns the stored result instead of acting again. See [Java: Locking and Idempotency](/Java/Locking-and-Idempotency).

### 4. Circuit breakers and bulkheads

- A [circuit breaker](/DB/Circuit-Breaker) stops calls to a failing dependency.
- A **bulkhead** isolates resources per dependency: a separate thread pool or connection pool for each. One slow dependency then cannot exhaust a pool that everything shares. The name comes from the watertight compartments of a ship.

### 5. Redundancy and failover

Run at least two of each critical component in separate failure domains: different machines, racks or availability zones. Failover moves traffic to a healthy one. The data layer needs replication; see [Replication and Sharding](/DB/Replication-and-Sharding). A stateless service behind a load balancer is the easiest part to make redundant.

Health checks let the load balancer remove unhealthy instances. Keep two kinds distinct:

- **Liveness** asks "should this instance be restarted?"
- **Readiness** asks "should this instance receive traffic now?"

Confusing them causes restart loops or traffic sent to instances that cannot serve it.

### 6. Graceful degradation and load shedding

When the system is overloaded, serve less rather than nothing:

- Return cached or partial results.
- Turn off non-essential features, such as recommendations or analytics.
- Reject excess requests early with `429` or `503` and a `Retry-After` header, instead of queueing them until everything times out. This is **load shedding**.

### 7. Durable messaging

Acknowledge a message only after it has been processed. Assume delivery is at least once, and make consumers idempotent. See [Kafka: Reliability and Delivery Semantics](/Kafka/Reliability-and-Delivery-Semantics).

### 8. Backups and recovery

Replication protects against a failed machine. Backups protect against mistakes and corruption, which replication copies. Test restores regularly. A backup you have never restored is a hope, not a plan.

## Designing for a failure

For each dependency, answer these questions and write the answers down:

1. What happens if it is down for ten minutes?
2. What happens if it is slow, say five seconds per call, rather than down?
3. Can a retry cause duplicate work?
4. What does the user see, and is it correct?

The answers are the fault-tolerance design.

## Testing it

- Kill instances during a load test and check that the error rate stays within budget.
- Inject latency and packet loss with a tool such as Toxiproxy or Chaos Mesh. Clean shutdowns alone do not test much.
- Run game days: practise failovers and restores on a schedule.

## How to implement it

1. List every remote call, and give each one a timeout. The timeout for the whole request must be larger than the sum of the calls it makes.
2. Retry only transient failures, and only operations that are safe to repeat. Use exponential backoff with jitter, and a small attempt limit.
3. Give every state-changing endpoint an idempotency key, and store the outcome against it.
4. Give each dependency its own concurrency limit and connection pool, so one slow dependency cannot exhaust the others.
5. Set liveness and readiness probes, and shed load early when queues grow.
6. Test with injected latency and killed instances, and check the error rate against your budget.

### Timeouts and limits (Spring Boot properties)

```properties
# HTTP server: when all threads are busy, requests queue up to accept-count, then are refused
server.tomcat.threads.max=200
server.tomcat.accept-count=100

# database: fail fast instead of waiting forever for a pooled connection (milliseconds)
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.connection-timeout=2000
```

### Retry and bulkhead (Resilience4j)

```yaml
resilience4j:
  retry:
    instances:
      paymentService:
        maxAttempts: 3
        waitDuration: 200ms
        enableExponentialBackoff: true
        exponentialBackoffMultiplier: 2
        retryExceptions:
          - java.io.IOException
          - java.util.concurrent.TimeoutException
        ignoreExceptions:
          - com.example.payments.ValidationException
  bulkhead:
    instances:
      paymentService:
        maxConcurrentCalls: 20
        maxWaitDuration: 0s
```

Only the exceptions in `retryExceptions` are retried, and `ignoreExceptions` is never retried. The backoff doubles each time: 200 ms, then 400 ms. The bulkhead allows 20 concurrent calls to the payment service, and a caller that finds all 20 busy fails at once instead of queueing. Property names were checked against Resilience4j 2.4.0.

### Jitter for your own retry loop (Java)

Exponential backoff without jitter makes every client retry at the same moments. This function gives a random delay between zero and the backoff ceiling:

```java
static Duration backoff(int attempt, Duration base, Duration cap) {
    long ceiling = Math.min(cap.toMillis(), base.toMillis() * (1L << Math.min(attempt, 30)));
    return Duration.ofMillis(ThreadLocalRandom.current().nextLong(ceiling + 1));   // full jitter
}
```

Checked: with a 200 ms base and a 5 s cap, every delay for attempts 0 to 8 fell between zero and the ceiling, over 10,000 draws per attempt. The YAML above does not add jitter. Use this function in your own loop, or check your Resilience4j version's randomized-wait option before combining it with exponential backoff.

### Idempotency keys

The `idempotency_keys` table from above is claimed with an insert that does nothing if the key already exists:

```sql
INSERT INTO idempotency_keys (client_id, idempotency_key, request_hash)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;
-- 1 row: this request owns the key. Do the work, then store status_code and response on the same row.
-- 0 rows: load the existing row.
--   same request_hash and a stored response: return the stored response
--   different request_hash: reject with 422, because the key was reused for another request
--   no response yet: return 409 and let the client retry later
```

Checked: the first insert returned 1 row, and the repeat returned 0. Where possible, store the response in the same transaction as the business change.

### Liveness and readiness probes (Kubernetes)

```yaml
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  initialDelaySeconds: 20
  periodSeconds: 10
  failureThreshold: 3
readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  periodSeconds: 5
  failureThreshold: 2
```

The YAML parses, but was not applied to a cluster. Keep the liveness check independent of the database. If it fails during a database outage, the orchestrator restarts every instance and makes the outage worse. The readiness check may check dependencies, because failing it only removes the instance from traffic.

## Common mistakes

- Retries without timeouts or limits, which cause a retry storm.
- Assuming a replicated cluster is fault tolerant without testing failover.
- One shared pool for all dependencies.
- Catching exceptions and returning success, so nothing looks broken.
- Fallbacks that return wrong data.

## Key takeaways

- Assume every remote call can hang, fail or repeat.
- Timeouts, bounded retries with jitter, idempotency and circuit breakers work together.
- Redundancy only helps when failover is automatic and has been tested.
- Degrade gracefully, and shed load early.

Related: [Circuit Breaker](/DB/Circuit-Breaker), [Replication and Sharding](/DB/Replication-and-Sharding), [CAP and PACELC](/DB/CAP-and-PACELC), [Multi-Region Deployment](/DB/Multi-Region-Deployment), [Java: Resilience Patterns](/Java/Resilience-Patterns).
