# Java: Microservices Architecture

## What is Microservices Architecture?

Microservices splits a monolith into small, independently deployable services, each owning its own database and communicating over HTTP or a message broker. Each service is small enough to be owned and rewritten by a single team.

**Monolith vs Microservices:**

| Concern | Monolith | Microservices |
|---|---|---|
| Deployment | Deploy everything together | Deploy each service independently |
| Scaling | Scale the whole app | Scale only the bottleneck service |
| Failure | One bug can crash everything | Failures are isolated |
| Database | One shared schema | Each service owns its DB |
| Tech stack | One language/framework | Each service can choose its own |

## Hotel Booking System Example

The hotel-microservices project splits a hotel booking app into four services:

```
User Request
     │
     ▼
┌──────────────┐        ┌─────────────────┐
│  API Gateway │───────▶│  Eureka Server  │ (service registry)
│  port: 8080  │        │  port: 8761     │
└──────┬───────┘        └─────────────────┘
       │
       ├────▶ hotel-service        (port 8081) — manage hotels
       ├────▶ room-type-service    (port 8082) — manage room types
       └────▶ reservation-service (port 8083) — book rooms, calls hotel + room-type
```

## Defining Service Boundaries

Good boundaries follow **business capabilities**, not technical layers:

| Service | Owns | Does NOT own |
|---|---|---|
| `hotel-service` | Hotel entity, city, amenities | Room pricing, reservations |
| `room-type-service` | Room categories, price per night | Which rooms are booked |
| `reservation-service` | Booking, dates, status | Hotel/room master data (fetches from other services) |

### Why Separate These?

- Room pricing changes often (seasonal rates) — isolated redeploy
- Reservation logic (availability, cancellation, refunds) is complex and changes frequently
- Hotel master data is stable — cheaper calls, easy to cache

## Parent POM (Multi-Module Maven)

Each service is a Maven module under a shared parent:

```xml
<!-- hotel-microservices/pom.xml (parent) -->
<project>
    <groupId>com.hotel</groupId>
    <artifactId>hotel-microservices</artifactId>
    <version>1.0.0</version>
    <packaging>pom</packaging>

    <modules>
        <module>eureka-server</module>
        <module>api-gateway</module>
        <module>hotel-service</module>
        <module>room-type-service</module>
        <module>reservation-service</module>
    </modules>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.0</version>
    </parent>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>org.springframework.cloud</groupId>
                <artifactId>spring-cloud-dependencies</artifactId>
                <version>2023.0.0</version>
                <type>pom</type>
                <scope>import</scope>
            </dependency>
        </dependencies>
    </dependencyManagement>
</project>
```

## Service Dependencies

Each service has its own `pom.xml`. Reservation-service needs Feign + Resilience4j to call the other services:

```xml
<!-- reservation-service/pom.xml -->
<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <!-- Eureka client — registers this service and discovers others -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
    </dependency>
    <!-- Feign — declarative HTTP client -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-openfeign</artifactId>
    </dependency>
    <!-- Resilience4j — circuit breaker + retry -->
    <dependency>
        <groupId>org.springframework.cloud</groupId>
        <artifactId>spring-cloud-starter-circuitbreaker-resilience4j</artifactId>
    </dependency>
    <!-- Actuator — exposes health, metrics, circuit-breaker state -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-actuator</artifactId>
    </dependency>
</dependencies>
```

## Application Configuration

Each service configures its own port, datasource, and Eureka endpoint:

```yaml
# reservation-service/src/main/resources/application.yml
server:
  port: 8083

spring:
  application:
    name: reservation-service        # registered under this name in Eureka
  datasource:
    url: jdbc:postgresql://localhost:5432/hotel_db
    username: hoteluser
    password: hotelpass

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
  instance:
    prefer-ip-address: true          # register IP not hostname (better in Docker)
```

## Domain Model (reservation-service)

```java
@Entity
@Table(name = "reservations")
public class Reservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long hotelId;

    @Column(nullable = false)
    private Long roomTypeId;

    private LocalDate checkIn;
    private LocalDate checkOut;
    private String guestName;
    private String status = "CONFIRMED";   // CONFIRMED, CANCELLED

    // getters/setters
}
```

## Enriched Response DTO

The reservation response combines data from three services:

```java
public record ReservationResponse(
    Long id,
    String guestName,
    LocalDate checkIn,
    LocalDate checkOut,
    String status,
    HotelDto hotel,
    RoomTypeDto roomType
) {
    public static ReservationResponse from(Reservation r, HotelDto hotel, RoomTypeDto roomType) {
        return new ReservationResponse(
            r.getId(), r.getGuestName(),
            r.getCheckIn(), r.getCheckOut(),
            r.getStatus(), hotel, roomType
        );
    }
}
```

## Service Layer

```java
@Service
@RequiredArgsConstructor
public class ReservationService {

    private final ReservationRepository reservationRepository;
    private final RemoteCallService remoteCallService;  // handles retries + circuit breaker

    public ReservationResponse createReservation(Reservation reservation) {
        Reservation saved = reservationRepository.save(reservation);
        return enrich(saved);
    }

    public ReservationResponse getReservationById(Long id) {
        Reservation r = reservationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Reservation not found: " + id));
        return enrich(r);
    }

    public List<ReservationResponse> getAllReservations() {
        return reservationRepository.findAll().stream()
                .map(this::enrich)
                .toList();
    }

    public ReservationResponse cancelReservation(Long id) {
        Reservation r = reservationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Reservation not found: " + id));
        r.setStatus("CANCELLED");
        return enrich(reservationRepository.save(r));
    }

    private ReservationResponse enrich(Reservation r) {
        HotelDto hotel     = remoteCallService.fetchHotel(r.getHotelId());
        RoomTypeDto room   = remoteCallService.fetchRoomType(r.getRoomTypeId());
        return ReservationResponse.from(r, hotel, room);
    }
}
```

## REST Controller

```java
@RestController
@RequestMapping("/api/reservations")
@RequiredArgsConstructor
public class ReservationController {

    private final ReservationService reservationService;

    @GetMapping
    public List<ReservationResponse> getAll() {
        return reservationService.getAllReservations();
    }

    @GetMapping("/{id}")
    public ResponseEntity<ReservationResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(reservationService.getReservationById(id));
    }

    @PostMapping
    public ResponseEntity<ReservationResponse> create(@Valid @RequestBody Reservation reservation) {
        return ResponseEntity.ok(reservationService.createReservation(reservation));
    }

    @PatchMapping("/{id}/cancel")
    public ResponseEntity<ReservationResponse> cancel(@PathVariable Long id) {
        return ResponseEntity.ok(reservationService.cancelReservation(id));
    }
}
```

#### Output

> Output on this page is **illustrative** — representative of a real run, not captured from one, since it needs the full multi-service stack.

`GET /api/reservations/1` with every service healthy. One stored reservation becomes an enriched response assembled from three services:

```output
{
  "id": 1,
  "guestName": "Alice",
  "checkIn": "2026-08-01",
  "checkOut": "2026-08-05",
  "status": "CONFIRMED",
  "hotel":    { "id": 1, "name": "Grand Plaza", "city": "Chennai" },
  "roomType": { "id": 1, "name": "Deluxe King", "pricePerNight": 4500.00 }
}
```

The `hotel` and `roomType` blocks were not in the reservation table — `enrich()` fetched them over HTTP.

Now stop `hotel-service` and repeat the same request:

```output
{
  "id": 1,
  "guestName": "Alice",
  "checkIn": "2026-08-01",
  "checkOut": "2026-08-05",
  "status": "CONFIRMED",
  "hotel":    { "id": 1, "name": "Hotel information temporarily unavailable", "city": "N/A" },
  "roomType": { "id": 1, "name": "Deluxe King", "pricePerNight": 4500.00 }
}
```

Still `200 OK`. The reservation and room-type data are intact, and only the unavailable part is degraded. That is the entire argument for fallbacks over propagating the failure — without them this request would be a `500` and the user would lose the booking details too, for want of a hotel name.

The `RuntimeException` path is less graceful. `GET /api/reservations/999`:

```output
HTTP/1.1 500 Internal Server Error
{"timestamp":"2026-09-23T10:22:41.188+00:00","status":500,"error":"Internal Server Error","path":"/api/reservations/999"}
```

A missing reservation is a client error, not a server fault — this should be a `404`. Throwing a bare `RuntimeException` from the service layer is what produces the wrong status; a dedicated exception plus `@ExceptionHandler` (or `ResponseStatusException`) is the fix.

## Why Separate RemoteCallService?

Spring AOP proxies handle `@CircuitBreaker` and `@Retry` by wrapping beans. If `ReservationService` called its own methods, the proxy would be bypassed and the annotations would have no effect:

```
ReservationService.enrich()
    └─▶ remoteCallService.fetchHotel()   ← proxy intercepts, applies retry/CB
        └─▶ HotelClient.getHotelById()   ← actual Feign HTTP call
```

Keep resilience annotations in a separate `@Service` bean so the proxy always intercepts.

## Electricity Billing System Architecture

A more complex real-world example with 9 services:

```
API Gateway (AWS) + Cognito (JWT)
        │
┌───────┼──────────────────────────────────────────┐
│       │                                          │
auth  customer  agent  meter-reading  tariff  billing  payment  receipt  notification
 :8081   :8082   :8083    :8084      :8085    :8086    :8087    :8088     :8089
                             │                  ▲        │
                      Kafka events              │        │
                      meter.readings.recorded ──┘        │
                                                 payment.completed
                                                         ▼
                                                    receipt + notification
```

Services that are separated for clear reasons:

| Boundary | Why |
|---|---|
| tariff ≠ billing | Slab rates change by regulation (rare); billing logic changes often |
| payment ≠ billing | Payments have idempotency + webhook concerns; different reliability profile |
| receipt ≠ payment | PDF generation can fail/retry independently — a bug must not roll back a payment |
| notification ≠ everything | All SES/SNS dependencies in one place; templates change without touching domain |

## Non-Functional Requirements and Disaster Recovery

Functional requirements say what the system does. Non-functional requirements (NFRs) say how well it must do it. For the hotel booking system, the central NFR is recovery: **a failure must cost under 5 minutes of downtime.** That is a recovery time objective (RTO) of 5 minutes or less for each incident.

### Non-functional requirements

| Requirement | Target for the hotel system | How the design supports it |
|---|---|---|
| Availability | 99.95% a month for search and booking | Two or more replicas of every service, spread across availability zones (AZs) |
| Recovery time (RTO) | Under 5 minutes per incident | Automatic failover and replacement; no manual step on the booking path |
| Recovery point (RPO) | Near zero for bookings and payments | Booking data is replicated to a standby before a failure; events in Kafka can be replayed |
| Latency | p95 under 300 ms for search and booking | Timeouts and circuit breakers on every remote call (see [Resilience Patterns](/Java/Resilience-Patterns)) |
| Isolation | A non-critical failure never blocks a booking | Receipts and notifications run asynchronously; service boundaries are also failure boundaries |

> **Read the target carefully.** Availability is a budget over time. At 99.95% a month you can lose about 22 minutes, so a 5-minute recovery fits. At 99.99% the budget is about 4 minutes a month, and one 5-minute incident breaks it. A total annual budget of 5 minutes is about 99.999%, which allows one incident of this size a year and no planned downtime.

### Disaster recovery strategies

Recovery strategies trade cost for speed. Backups alone cannot meet 5 minutes. A warm standby can, if failover is automatic and the standby is already scaled up. Active-active is the most reliable choice for losing a whole region.

| Strategy | What runs in the standby region | Typical RTO | Typical RPO | Meets 5 minutes? |
|---|---|---|---|---|
| Backup and restore | Nothing; rebuild from backups | Hours | Hours | No |
| Pilot light | Data replicated; core services off | Tens of minutes | Minutes | No |
| Warm standby | A scaled-down copy, running | Minutes | Seconds | Yes, if failover is automatic and capacity is pre-scaled |
| Multi-site active-active | A full copy serving traffic | Near zero | Near zero | Yes |

These ranges follow the four strategies in the AWS disaster recovery whitepaper. Treat them as orders of magnitude, not promises.

### Time budget for a regional failover

This budget shows how a warm standby can finish inside 5 minutes. Each number is a plan to test, not a measurement.

| Step | Budget | Mechanism |
|---|---|---|
| Detect | 30 s | Synthetic probe every 10 s; declared down after 3 failures |
| Route | 60 s | Failover DNS record with a 60-second TTL |
| Promote data | 90 s | Script promotes a warm replica in the standby region |
| Start services | 60 s | Standby services already running at size; readiness probes gate traffic |
| Verify | 20 s | Automated smoke test before the region takes full traffic |
| **Total** | **4 min 20 s** | **40 seconds of spare time** |

The spare time is small. Some clients keep using an old DNS answer past its TTL, and a slow database promotion uses up the budget quickly. That is why active-active is the stronger option for a whole region.

### What makes the budget achievable

- **Stateless services.** A service that keeps no session data on one instance can restart on any other. Put sessions in Redis or the database.
- **Automatic failover.** Health checks trigger the routing change. Nobody should have to act at 3 a.m. to switch regions.
- **Warm capacity.** Scaling up during an outage uses up the budget. Keep the standby at a size that can take real traffic.
- **Replication plus backups.** Replication gives a near-zero RPO, but it copies a bad delete within seconds. Keep point-in-time backups for that case.
- **Rehearsal.** Run a region failover drill each quarter, and record the real time of each step. Compare it with the budget.

## Interview Questions

**Q: How do microservices communicate?**
- Synchronous: REST (Feign) or gRPC for real-time request/response
- Asynchronous: Kafka or RabbitMQ for fire-and-forget / event-driven flows

**Q: How do you handle a shared database?**
- You don't. Each service owns its own schema. Use events or APIs to share data.

**Q: What is the Strangler Fig pattern?**
- Gradually replace a monolith by routing specific paths to new microservices, shrinking the monolith over time until it disappears.

**Q: When should you NOT use microservices?**
- Small teams with a simple domain — the operational overhead (service discovery, distributed tracing, separate deploys) outweighs the benefits.
