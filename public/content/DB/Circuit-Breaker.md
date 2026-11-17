# DB: Circuit Breaker

A **circuit breaker** wraps calls to a remote dependency, such as a database, another service or a payment API. When the dependency keeps failing, the breaker stops sending calls for a while and fails fast. This protects the caller's threads and connections, and gives the dependency room to recover.

The name comes from electrical breakers: they trip on a fault so the wiring does not burn.

## The three states

| State | Behaviour |
|---|---|
| **Closed** | Calls go through. Failures are counted. |
| **Open** | Calls are rejected at once, and no request is sent. After a wait period the breaker moves to Half-Open. |
| **Half-Open** | A limited number of trial calls go through. If they succeed, the breaker closes. If any fails, it opens again. |

```
           failure rate above threshold
   CLOSED ------------------------------> OPEN
     ^                                     |
     |  trial calls succeed                | wait period elapses
     |                                     v
     +--------------------------------- HALF-OPEN
                                          |
                     a trial call fails -> back to OPEN
```

## Tripping rules

Typical settings:

- **Sliding window**: the last N calls, or the calls in the last T seconds.
- **Failure threshold**: for example, 50% of the calls in the window failed.
- **Minimum calls**: do not trip on two failures out of two. Require something like 20 calls first.
- **Slow calls**: count calls slower than a limit as failures too. A dependency that answers in 30 seconds is failing, even if it never returns an error.
- **Open duration**: how long to wait before trial calls, for example 30 seconds.
- **Trial calls**: how many calls the half-open state allows, for example 5.

Count timeouts, connection errors and 5xx responses as failures. Usually do not count 4xx responses, because those are the caller's mistake, not the dependency's.

## What the caller does when the breaker is open

The caller needs a plan for a rejected call:

- **Fallback**: a cached value, a safe default, or a "try again later" message.
- **Fail fast**: return an error to the user immediately.
- **Queue for later**: store the work and process it once the dependency recovers. Only do this for operations that are safe to delay.

Never return a wrong value as the fallback. A stale price shown as current is worse than an error.

## A simplified sketch

This is not a library API. The real Spring implementation is in [Java: Resilience Patterns](/Java/Resilience-Patterns).

```java
public Order getOrder(long id) {
    if (!breaker.tryAcquire()) {                 // OPEN: reject without calling
        return cache.getOrDefault(id, Order.unavailable());
    }
    try {
        Order order = orderClient.fetch(id);     // the client has its own timeout
        breaker.onSuccess();
        return order;
    } catch (TimeoutException | ServiceException e) {
        breaker.onFailure();
        return cache.getOrDefault(id, Order.unavailable());
    }
}
```

## How to implement it

1. Set connect and read timeouts on the client first. A breaker cannot trip on a call that never fails.
2. Create one breaker per dependency, with thresholds based on its measured normal error rate.
3. Wrap each call with the breaker, and write a fallback that returns correct data or a clear error.
4. Expose the breaker's state through health checks and metrics, and alert when a breaker opens.
5. Test by stopping the dependency, and by making it slow. Both should trip it.

### Configuration (Resilience4j with Spring Boot 3)

```yaml
resilience4j:
  circuitbreaker:
    instances:
      orderService:
        slidingWindowType: COUNT_BASED
        slidingWindowSize: 20
        minimumNumberOfCalls: 10
        failureRateThreshold: 50
        slowCallDurationThreshold: 2s
        slowCallRateThreshold: 50
        waitDurationInOpenState: 30s
        permittedNumberOfCallsInHalfOpenState: 5
        automaticTransitionFromOpenToHalfOpenEnabled: true
        registerHealthIndicator: true
```

Read it this way: the breaker looks at the last 20 calls, and does nothing until there are 10. If half of them fail, or half are slower than 2 seconds, it opens. It stays open for 30 seconds, then lets 5 trial calls through. Every property name was checked against the Resilience4j 2.4.0 configuration setters.

### Applying it (Java)

The annotation needs `spring-boot-starter-aop` and `resilience4j-spring-boot3` on the classpath.

```java
@Service
public class OrderClient {

    private final RestClient restClient;   // timeouts set on its request factory
    private final OrderCache cache;

    public OrderClient(RestClient restClient, OrderCache cache) {
        this.restClient = restClient;
        this.cache = cache;
    }

    @CircuitBreaker(name = "orderService", fallbackMethod = "orderFallback")
    public Order getOrder(long id) {
        return restClient.get().uri("/orders/{id}", id).retrieve().body(Order.class);
    }

    // The fallback takes the same parameters, plus the exception that caused it.
    // It must be in the same class. Never invent data here: a cache miss is an error.
    Order orderFallback(long id, Throwable cause) {
        return cache.find(id)
                .orElseThrow(() -> new ServiceUnavailableException("orders are temporarily unavailable", cause));
    }
}
```

This was not compiled here. The full Spring setup is in [Java: Resilience Patterns](/Java/Resilience-Patterns).

## Common mistakes

- **No timeout on the call.** The breaker counts failures, and a call that hangs forever never fails, so it never trips.
- **One breaker for several unrelated dependencies.** One failing dependency then blocks all of them. Use one breaker per dependency.
- **Retries that ignore the breaker.** Each retry adds load to a service that is already struggling.
- **Thresholds chosen by guesswork.** Measure the normal error rate first.
- **Never testing it.** Inject failures in staging and check the state changes and the fallbacks.

## Key takeaways

- Closed moves to Open when failures cross the threshold. Open moves to Half-Open after the wait. Half-Open moves to Closed on successful trial calls.
- Timeouts are required, and slow calls count as failures.
- Use one breaker per dependency, and give it a fallback that is correct.
- Retries and breakers have to be designed together. See [Fault Tolerance](/DB/Fault-Tolerance).

Related: [Fault Tolerance](/DB/Fault-Tolerance), [Java: Resilience Patterns](/Java/Resilience-Patterns).
