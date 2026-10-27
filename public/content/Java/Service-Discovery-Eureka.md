# Java: Service Discovery & API Gateway (Eureka + Spring Cloud)

## The Problem Service Discovery Solves

In a monolith, you call a function directly. In microservices, services run on dynamic IPs (especially in Docker/Kubernetes). Hard-coding URLs breaks the moment you scale out or redeploy:

```
# Bad — hardcoded
http://192.168.1.45:8081/api/hotels/1

# Good — resolved at runtime via service name
lb://hotel-service/api/hotels/1
```

Eureka is a service registry: services register when they start, discover each other by name, and deregister when they stop.

## Architecture

```
┌──────────────────────┐
│   Eureka Server      │  ← single registry for all services
│   port: 8761         │
└─────────┬────────────┘
          │ register / heartbeat / lookup
    ┌─────┼─────────────┬──────────────┐
    │     │             │              │
hotel-svc  room-type-svc  reservation-svc  api-gateway
:8081      :8082           :8083            :8080
```

## 1. Eureka Server Setup

### Dependency

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-server</artifactId>
</dependency>
```

### Main Class

```java
@SpringBootApplication
@EnableEurekaServer          // turns this app into the registry
public class EurekaServerApplication {
    public static void main(String[] args) {
        SpringApplication.run(EurekaServerApplication.class, args);
    }
}
```

### Configuration

```yaml
# eureka-server/src/main/resources/application.yml
server:
  port: 8761

spring:
  application:
    name: eureka-server

eureka:
  instance:
    hostname: localhost
  client:
    register-with-eureka: false   # server doesn't register itself
    fetch-registry: false         # server doesn't fetch from another server
    service-url:
      defaultZone: http://${eureka.instance.hostname}:${server.port}/eureka/
  server:
    wait-time-in-ms-when-sync-empty: 0  # don't wait on startup
```

#### Output

> Console and HTTP output on this page is **illustrative** — representative of a real run, not captured from one, since it needs the full service stack running.

A service starting up and registering itself:

```output
INFO  c.n.d.DiscoveryClient : Getting all instance registry info from the eureka server
INFO  c.n.d.DiscoveryClient : The response status is 200
INFO  c.n.d.DiscoveryClient : Starting heartbeat executor: renew interval is: 30
INFO  c.n.d.DiscoveryClient : DiscoveryClient_HOTEL-SERVICE/192.168.1.20:hotel-service:8081 - registration status: 204
INFO  o.s.c.n.e.s.EurekaAutoServiceRegistration : Updating port to 8081
```

A `204` on that registration line is success. The registry itself is queryable as JSON:

```output
$ curl -H "Accept: application/json" http://localhost:8761/eureka/apps | jq '.applications.application[].name'

"HOTEL-SERVICE"
"ROOM-TYPE-SERVICE"
"RESERVATION-SERVICE"
```

Note the names come back **upper-cased** — Eureka normalises `spring.application.name`, which is why `@FeignClient(name = "hotel-service")` matches `HOTEL-SERVICE`.

Kill a service without a clean shutdown and the registry does not notice immediately:

```output
WARN  c.n.e.r.PeerAwareInstanceRegistryImpl : EMERGENCY! EUREKA MAY BE INCORRECTLY CLAIMING
      INSTANCES ARE UP WHEN THEY'RE NOT. RENEWALS ARE LESSER THAN THRESHOLD AND HENCE THE
      INSTANCES ARE NOT BEING EXPIRED JUST TO BE SAFE.
```

That is **self-preservation mode**, and it surprises people constantly. Eureka saw heartbeats drop below the expected rate and chose to assume a network partition rather than mass-evict healthy instances. The consequence is that a dead instance can stay listed for minutes, and Feign will keep trying to call it — which is exactly why a circuit breaker sits in front of these calls.

Open `http://localhost:8761` to see the Eureka dashboard listing all registered services.

## 2. Registering a Service (Eureka Client)

### Dependency

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
</dependency>
```

### Configuration

```yaml
# hotel-service/src/main/resources/application.yml
server:
  port: 8081

spring:
  application:
    name: hotel-service          # this is the service ID in Eureka

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
  instance:
    prefer-ip-address: true      # register IP not hostname — important in Docker

management:
  endpoints:
    web:
      exposure:
        include: health, info, prometheus, metrics
```

No annotation needed — `spring-cloud-starter-netflix-eureka-client` on the classpath auto-enables registration.

## 3. Feign Client — Declarative HTTP Calls

OpenFeign lets you call another service as if it were a local Java interface. No `RestTemplate` boilerplate.

### Dependency

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
</dependency>
```

### Enable Feign in main class

```java
@SpringBootApplication
@EnableFeignClients           // scans for @FeignClient interfaces
public class ReservationServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(ReservationServiceApplication.class, args);
    }
}
```

### Define a Feign Client

```java
// "hotel-service" = spring.application.name of the target service
// Feign looks it up in Eureka and load-balances across all instances
// fallbackFactory = what to call when the circuit is OPEN
@FeignClient(name = "hotel-service", fallbackFactory = HotelClientFallbackFactory.class)
public interface HotelClient {

    @GetMapping("/api/hotels/{id}")
    HotelDto getHotelById(@PathVariable Long id);
}
```

```java
@FeignClient(name = "room-type-service", fallbackFactory = RoomTypeClientFallbackFactory.class)
public interface RoomTypeClient {

    @GetMapping("/api/room-types/{id}")
    RoomTypeDto getRoomTypeById(@PathVariable Long id);
}
```

### Fallback Factory

The fallback runs when the circuit is OPEN or all retries fail:

```java
@Component
public class HotelClientFallbackFactory implements FallbackFactory<HotelClient> {

    private static final Logger log = LoggerFactory.getLogger(HotelClientFallbackFactory.class);

    @Override
    public HotelClient create(Throwable cause) {
        return hotelId -> {
            log.warn("hotel-service circuit OPEN — fallback for hotelId={}. Cause: {}",
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

Use `FallbackFactory` (not plain `fallback =`) when you need access to the root cause exception for logging.

## 4. API Gateway (Spring Cloud Gateway)

The API gateway is the single entry point. It routes requests to the right service using Eureka-resolved names:

### Dependency

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-gateway</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-netflix-eureka-client</artifactId>
</dependency>
```

### Route Configuration

```yaml
# api-gateway/src/main/resources/application.yml
server:
  port: 8080

spring:
  application:
    name: api-gateway

  cloud:
    gateway:
      routes:
        # lb:// = "load-balance using Eureka"
        # Spring Cloud LoadBalancer picks one instance (round-robin by default)
        - id: hotel-service
          uri: lb://hotel-service
          predicates:
            - Path=/api/hotels/**

        - id: room-type-service
          uri: lb://room-type-service
          predicates:
            - Path=/api/room-types/**

        - id: reservation-service
          uri: lb://reservation-service
          predicates:
            - Path=/api/reservations/**

eureka:
  client:
    service-url:
      defaultZone: http://localhost:8761/eureka/
  instance:
    prefer-ip-address: true

management:
  endpoints:
    web:
      exposure:
        include: health, info, prometheus, gateway
  endpoint:
    gateway:
      enabled: true           # exposes /actuator/gateway/routes for debugging
```

### Request Flow

```
Client → :8080/api/hotels/1
           │
           ▼
    API Gateway matches route: hotel-service
           │
           ▼
    Eureka lookup → [192.168.1.10:8081, 192.168.1.11:8081]
           │
           ▼
    Load balancer picks one → :8081/api/hotels/1
           │
           ▼
    Hotel Service → response → Gateway → Client
```

## 5. Load Balancing

Spring Cloud LoadBalancer (replaces the deprecated Ribbon) provides client-side load balancing. It pulls the instance list from Eureka and distributes calls round-robin.

No code needed — `lb://` in the gateway route enables it automatically. For Feign clients, it's also automatic when Eureka client is on the classpath.

## 6. Health Checks and Actuator

Each service exposes actuator endpoints so Eureka can validate health:

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health, info, prometheus, metrics
  endpoint:
    health:
      show-details: always
  health:
    circuitbreakers:
      enabled: true    # shows circuit breaker state in /actuator/health
```

Useful URLs per service:
- `/actuator/health` — UP/DOWN + circuit breaker states
- `/actuator/metrics` — JVM, HTTP, and custom metrics
- `/actuator/prometheus` — Prometheus-format metrics scrape endpoint

## 7. Running the Full Stack

Start services in this order (each service needs Eureka first):

```bash
# 1. Start the registry
./mvnw -pl eureka-server spring-boot:run

# 2. Start downstream services (any order)
./mvnw -pl hotel-service spring-boot:run
./mvnw -pl room-type-service spring-boot:run

# 3. Start reservation-service (calls hotel + room-type)
./mvnw -pl reservation-service spring-boot:run

# 4. Start the gateway last
./mvnw -pl api-gateway spring-boot:run
```

#### Output

The dashboard's registry table, rendered as text:

```output
Application            AMIs      Availability Zones   Status
HOTEL-SERVICE          n/a (2)   (2)                  UP (2) - 192.168.1.20:hotel-service:8081,
                                                               192.168.1.20:hotel-service:8085
ROOM-TYPE-SERVICE      n/a (1)   (1)                  UP (1) - 192.168.1.20:room-type-service:8082
RESERVATION-SERVICE    n/a (1)   (1)                  UP (1) - 192.168.1.20:reservation-service:8083
API-GATEWAY            n/a (1)   (1)                  UP (1) - 192.168.1.20:api-gateway:8080
```

`HOTEL-SERVICE` shows **two** instances on different ports. Neither the Feign client nor the gateway config changed to make that happen — starting a second instance with the same `spring.application.name` is the entire operation, and client-side load balancing picks up the new instance on its next registry refresh (30 seconds by default).

Calling through the gateway then alternates between them:

```output
$ curl http://localhost:8080/api/hotels/1
{"id":1,"name":"Grand Plaza","city":"Chennai"}

# hotel-service instance 1 log:
INFO  c.e.h.controller.HotelController : GET /api/hotels/1

$ curl http://localhost:8080/api/hotels/1
# hotel-service instance 2 log:
INFO  c.e.h.controller.HotelController : GET /api/hotels/1
```

Same response, different instance served it — round-robin is the default `LoadBalancerClient` policy.

Verify at `http://localhost:8761` — all four services should appear as REGISTERED.

Test through the gateway:
```bash
# These hit port 8080 (gateway) and route to the right service
curl http://localhost:8080/api/hotels/1
curl http://localhost:8080/api/room-types/1
curl http://localhost:8080/api/reservations

# Create a reservation
curl -X POST http://localhost:8080/api/reservations \
  -H "Content-Type: application/json" \
  -d '{"hotelId":1,"roomTypeId":1,"guestName":"Alice","checkIn":"2025-08-01","checkOut":"2025-08-05"}'
```

## Interview Questions

**Q: What is the difference between client-side and server-side load balancing?**
- Client-side (Eureka + Spring Cloud LB): the calling service fetches the instance list and picks one itself. No dedicated load balancer process needed.
- Server-side (AWS ALB, NGINX): a central proxy balances traffic; clients just hit the proxy.

**Q: What happens if Eureka goes down?**
- Clients cache the registry locally. They continue routing to known instances even if Eureka is unreachable. Calls fail only if the target service itself is down.

**Q: How does the API gateway differ from a load balancer?**
- A load balancer distributes traffic to identical instances. An API gateway also handles routing to *different* services, authentication, rate limiting, request transformation, and logging.

**Q: What is prefer-ip-address in Eureka?**
- By default Eureka registers the hostname. In Docker, hostnames don't resolve across containers. `prefer-ip-address: true` registers the container's IP instead.
