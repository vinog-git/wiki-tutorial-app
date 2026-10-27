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
