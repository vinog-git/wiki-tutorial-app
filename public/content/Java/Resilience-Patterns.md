# Java: Resilience Patterns (Circuit Breaker, Retry, Fallback)

## Why Resilience Matters

In microservices, network calls fail. A slow or crashed upstream service can cascade failures across your entire system — every request backs up waiting for a timeout, threads exhaust, and your healthy service goes down too.

Resilience patterns protect against this:

| Pattern | What it does |
|---|---|
| **Retry** | Automatically re-attempt transient failures |
| **Circuit Breaker** | Stop calling a failing service temporarily, return a fallback instead |
| **Fallback** | Return a safe default when a call fails |
| **Timeout** | Fail fast instead of waiting forever |
| **Bulkhead** | Limit concurrency so one slow service can't starve others |

## Resilience4j

Spring Boot's recommended library for resilience. Integrates with Spring Boot Actuator for health and metrics.

### Dependencies

```xml
<!-- Circuit breaker + retry -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-circuitbreaker-resilience4j</artifactId>
</dependency>
<!-- Feign integration — wraps every Feign call in a circuit breaker -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
<!-- Exposes circuit breaker state in /actuator/health -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

## Circuit Breaker States

```
        ┌─────────────────────────────────────────────────┐
        │                                                 │
   ┌────▼─────┐  failure rate   ┌──────────┐  timeout    │
   │  CLOSED  │ ──≥ threshold──▶│   OPEN   │─────────────┤
   │ (normal) │                 │ (blocked)│             │
   └──────────┘                 └────┬─────┘             │
        ▲                            │                   │
        │                    auto-transition              │
        │                            ▼                   │
   success             ┌──────────────────┐              │
   rate OK             │   HALF-OPEN      │──fail──────▶─┘
                       │ (probe 2 calls)  │
                       └──────────────────┘
```

- **CLOSED** — normal operation. All calls go through. Failures counted in sliding window.
- **OPEN** — circuit is tripped. Calls are rejected immediately (fallback returns instead). No HTTP call made.
- **HALF-OPEN** — after `wait-duration-in-open-state`, allows a small number of probe calls. If they succeed, transitions back to CLOSED. If they fail, returns to OPEN.

## Configuration (application.yml)

From the hotel-microservices reservation-service:

```yaml
# Enable Feign to use Resilience4j circuit breaker
feign:
  circuitbreaker:
    enabled: true

resilience4j:
  circuitbreaker:
    instances:
      hotel-service:
        register-health-indicator: true
        sliding-window-size: 5             # evaluate last 5 calls
        failure-rate-threshold: 50         # OPEN if ≥50% of last 5 calls fail
        wait-duration-in-open-state: 10s   # stay OPEN 10s, then try HALF-OPEN
        permitted-number-of-calls-in-half-open-state: 2
        automatic-transition-from-open-to-half-open-enabled: true
      room-type-service:
        register-health-indicator: true
        sliding-window-size: 5
        failure-rate-threshold: 50
        wait-duration-in-open-state: 10s
        permitted-number-of-calls-in-half-open-state: 2
        automatic-transition-from-open-to-half-open-enabled: true

  retry:
    instances:
      hotel-service:
        max-attempts: 3                    # try up to 3 times total
        wait-duration: 500ms              # initial wait between retries
        enable-exponential-backoff: true
        exponential-backoff-multiplier: 2  # 500ms → 1000ms → 2000ms
      room-type-service:
        max-attempts: 3
        wait-duration: 500ms
        enable-exponential-backoff: true
        exponential-backoff-multiplier: 2

management:
  endpoints:
    web:
      exposure:
        include: health, info, prometheus, metrics, circuitbreakers
  endpoint:
    health:
      show-details: always
  health:
    circuitbreakers:
      enabled: true    # shows circuit state in /actuator/health
```

## Code: @Retry + @CircuitBreaker Annotations

The key rule: **put resilience annotations in a separate `@Service` bean**. Spring AOP proxies only intercept calls *between* beans. Self-invocation bypasses the proxy.

```java
@Service
@RequiredArgsConstructor
public class RemoteCallService {

    private static final Logger log = LoggerFactory.getLogger(RemoteCallService.class);

    private final HotelClient hotelClient;
    private final RoomTypeClient roomTypeClient;

    // @Retry fires FIRST — retries up to 3 times with exponential backoff
    // @CircuitBreaker fires AFTER retries are exhausted:
    //   - if 50% of the last 5 calls failed → circuit opens
    //   - when circuit is OPEN → fallbackMethod is called immediately (no HTTP call)
    @Retry(name = "hotel-service")
    @CircuitBreaker(name = "hotel-service", fallbackMethod = "hotelFallback")
    public HotelDto fetchHotel(Long hotelId) {
        return hotelClient.getHotelById(hotelId);
    }

    public HotelDto hotelFallback(Long hotelId, Throwable t) {
        log.warn("hotel-service circuit OPEN or retries exhausted for hotelId={}. Cause: {}",
                hotelId, t.getMessage());
        HotelDto fallback = new HotelDto();
        fallback.setId(hotelId);
        fallback.setName("Hotel information temporarily unavailable");
        fallback.setCity("N/A");
        return fallback;
    }

    @Retry(name = "room-type-service")
    @CircuitBreaker(name = "room-type-service", fallbackMethod = "roomTypeFallback")
    public RoomTypeDto fetchRoomType(Long roomTypeId) {
        return roomTypeClient.getRoomTypeById(roomTypeId);
    }

    public RoomTypeDto roomTypeFallback(Long roomTypeId, Throwable t) {
        log.warn("room-type-service circuit OPEN or retries exhausted for roomTypeId={}. Cause: {}",
                roomTypeId, t.getMessage());
        RoomTypeDto fallback = new RoomTypeDto();
        fallback.setId(roomTypeId);
        fallback.setName("Room type temporarily unavailable");
        fallback.setPricePerNight(BigDecimal.ZERO);
        return fallback;
    }
}
```

#### Output

> Log and HTTP output on this page is **illustrative** — representative of a real run, not captured from one, since it needs the full service mesh running.

Take down `hotel-service` and call `fetchHotel(42)`. The logs show all three retries, then the fallback:

```output
WARN  io.github.resilience4j.retry.RetryImpl : Retry 'hotel-service', attempt 1 failed. Waiting 500 ms.
      Cause: feign.RetryableException: Connection refused executing GET http://hotel-service/hotels/42
WARN  io.github.resilience4j.retry.RetryImpl : Retry 'hotel-service', attempt 2 failed. Waiting 1000 ms.
WARN  io.github.resilience4j.retry.RetryImpl : Retry 'hotel-service', attempt 3 failed. Giving up.
WARN  c.e.service.RemoteCallService : hotel-service circuit OPEN or retries exhausted for hotelId=42.
      Cause: Connection refused executing GET http://hotel-service/hotels/42
```

The caller sees no exception at all — it gets the fallback object:

```output
{"id":42,"name":"Hotel information temporarily unavailable","city":"N/A"}
```

Once the failure rate crosses the threshold the circuit opens, and the character of the logs changes completely:

```output
INFO  i.g.r.c.i.CircuitBreakerStateMachine : CircuitBreaker 'hotel-service' changed state from CLOSED to OPEN
WARN  c.e.service.RemoteCallService : hotel-service circuit OPEN or retries exhausted for hotelId=42.
      Cause: CircuitBreaker 'hotel-service' is OPEN and does not permit further calls
```

Note the cause on that last line: `CircuitBreaker ... is OPEN`, **not** `Connection refused`. No HTTP call was attempted and no retries ran — the fallback fired immediately. That difference is the whole point of the pattern, and the fastest way to tell from a log whether the circuit is open.

After `waitDurationInOpenState` elapses:

```output
INFO  i.g.r.c.i.CircuitBreakerStateMachine : CircuitBreaker 'hotel-service' changed state from OPEN to HALF_OPEN
INFO  i.g.r.c.i.CircuitBreakerStateMachine : CircuitBreaker 'hotel-service' changed state from HALF_OPEN to CLOSED
```

If the trial calls in `HALF_OPEN` fail instead, it goes straight back to `OPEN`.

### Fallback Method Signature Rules

The fallback method must:
- Be in the **same class** as the annotated method
- Have the **same return type**
- Have the **same parameters**, plus a trailing `Throwable` parameter

```java
// annotated method
public HotelDto fetchHotel(Long hotelId) { ... }

// fallback — same params + Throwable at the end
public HotelDto hotelFallback(Long hotelId, Throwable t) { ... }
```

## Feign-Level Fallback Factory

An alternative to `@CircuitBreaker` annotations: configure fallback directly on the `@FeignClient`:

```java
@FeignClient(name = "hotel-service", fallbackFactory = HotelClientFallbackFactory.class)
public interface HotelClient {
    @GetMapping("/api/hotels/{id}")
    HotelDto getHotelById(@PathVariable Long id);
}

@Component
public class HotelClientFallbackFactory implements FallbackFactory<HotelClient> {

    private static final Logger log = LoggerFactory.getLogger(HotelClientFallbackFactory.class);

    @Override
    public HotelClient create(Throwable cause) {
        return hotelId -> {
            log.warn("hotel-service circuit OPEN — returning fallback for hotelId={}. Cause: {}",
                    hotelId, cause.getMessage());
            HotelDto fallback = new HotelDto();
            fallback.setId(hotelId);
            fallback.setName("Hotel information temporarily unavailable");
            fallback.setCity("N/A");
            return fallback;
        };
    }
}
```

Use `FallbackFactory` instead of `fallback =` when you need access to the exception that caused the failure (for logging or different responses per error type).

## Billing Service Example (Electricity Board)

The billing service wraps tariff calls with a circuit breaker:

```yaml
# billing-service/application.yml
resilience4j:
  circuitbreaker:
    instances:
      tariff:
        slidingWindowSize: 10
        failureRateThreshold: 50
        waitDurationInOpenState: 30s
```

```java
@Component
public class TariffClient {

    private final RestClient http;

    public TariffClient(@Value("${ebs.tariff.base-url:http://localhost:8085}") String baseUrl) {
        this.http = RestClient.builder().baseUrl(baseUrl).build();
    }

    public record Breakdown(BigDecimal energyCharges, BigDecimal fixedCharges,
                            BigDecimal taxes, BigDecimal total) {}

    public Breakdown calculate(String connectionType, BigDecimal units) {
        return http.post()
                .uri("/tariffs/calculate")
                .body(Map.of("connectionType", connectionType, "units", units))
                .retrieve()
                .body(Breakdown.class);
    }
}
```

## Observing Circuit Breaker State

Check the live state of all circuit breakers:

```bash
curl http://localhost:8083/actuator/health | jq .

# Output shows each circuit breaker's state:
# {
#   "components": {
#     "circuitBreakers": {
#       "details": {
#         "hotel-service": { "status": "UP", "details": { "state": "CLOSED", ... } },
#         "room-type-service": { "status": "UP", "details": { "state": "OPEN", ... } }
#       }
#     }
#   }
# }
```

```bash
# List all registered circuit breakers
curl http://localhost:8083/actuator/circuitbreakers
```

#### Output

```output
{
  "circuitBreakers": {
    "hotel-service": {
      "failureRate": "100.0%",
      "slowCallRate": "0.0%",
      "failureRateThreshold": "50.0%",
      "bufferedCalls": 5,
      "failedCalls": 5,
      "notPermittedCalls": 17,
      "state": "OPEN"
    },
    "room-type-service": {
      "failureRate": "-1.0%",
      "bufferedCalls": 2,
      "failedCalls": 0,
      "notPermittedCalls": 0,
      "state": "CLOSED"
    }
  }
}
```

Two fields are worth knowing how to read:

- **`notPermittedCalls: 17`** — seventeen calls were rejected outright without touching the network. This is the number that shows the breaker is actually protecting the downstream service, not just logging about it.
- **`failureRate: "-1.0%"`** on the healthy breaker is not an error. Resilience4j reports `-1` when fewer calls have been recorded than `minimumNumberOfCalls`, meaning the rate is not yet statistically meaningful. A breaker with only two buffered calls cannot open, whatever those two calls did.

## Execution Order: Retry wraps Circuit Breaker

```
fetchHotel() called
    │
    ▼ @Retry intercepts first
    ├─ attempt 1 → circuit CLOSED → HTTP call → fails
    │    wait 500ms
    ├─ attempt 2 → circuit CLOSED → HTTP call → fails
    │    wait 1000ms
    └─ attempt 3 → circuit CLOSED → HTTP call → fails
              │
              ▼ all retries exhausted → circuit evaluates sliding window
              If failure rate ≥ threshold → circuit opens
              @CircuitBreaker fallback fires → hotelFallback() returns safe default
```

On subsequent calls while circuit is OPEN:
```
fetchHotel() called
    │
    ▼ @CircuitBreaker sees OPEN state
    └─ hotelFallback() fires immediately (no HTTP call, no retry)
```

## Interview Questions

**Q: What is the difference between a timeout and a circuit breaker?**
- A timeout protects a single call — it fails after N seconds. A circuit breaker tracks the overall health of a dependency across many calls. When too many fail, it stops calling altogether for a period, protecting both your service and the struggling upstream from being overwhelmed.

**Q: Why use exponential backoff in retry?**
- If a service is overloaded and you immediately retry, you add more load. Exponential backoff (500ms → 1s → 2s) gives the service time to recover between attempts. Adding jitter (random offset) prevents multiple callers retrying at exactly the same time.

**Q: What should a fallback return?**
- A safe default that lets the core flow continue. In the hotel example, the reservation is still created even if hotel details are unavailable. Never throw in a fallback.

**Q: When does the circuit transition from OPEN to HALF-OPEN?**
- After `wait-duration-in-open-state` (10 seconds in the hotel example), it automatically transitions to HALF-OPEN and allows `permitted-number-of-calls-in-half-open-state` probe calls through. Success → CLOSED. Failure → OPEN again.

**Q: Can you use @Retry without @CircuitBreaker?**
- Yes. Retry alone is fine for transient failures (network blips). Add CircuitBreaker when the dependency might be down for longer periods and you need to stop retrying entirely.
