# Three Spring Boot Microservices

Three standalone Maven projects under `services/`. **No parent POM** —
on purpose. Each service has to build and deploy without the others, and a
shared parent quietly reintroduces the coupling you are trying to remove.

```bash
mkdir -p services/user-service/src/main/{java/com/microshop/user,resources}
mkdir -p services/product-service/src/main/{java/com/microshop/product,resources}
mkdir -p services/purchase-service/src/main/{java/com/microshop/purchase,resources}
```

## What each service owns

| Service | Port | Database | Endpoints |
|---|---|---|---|
| user-service | 8081 | `usersdb` | `GET/POST /api/users`, `GET /api/users/{id}` |
| product-service | 8082 | `productsdb` | `GET /api/products`, `GET /api/products/{id}` |
| purchase-service | 8083 | `purchasesdb` | `GET/POST /api/purchases` |

Each `pom.xml` inherits `spring-boot-starter-parent:3.4.1`, targets Java 21, and
pulls `web`, `data-jpa`, `validation`, `actuator` and the `postgresql` driver.

**Actuator is not optional here.** The compose healthchecks and the deploy
script's "wait until healthy" step both poll `/actuator/health`. Drop it and the
deploy script has nothing to wait on.

## Configuration is environment-driven

The same jar has to run on your laptop against `localhost:5432` and inside a
container against `postgres:5432`. Defaults in the config, overrides from the
environment:

```yaml
# services/user-service/src/main/resources/application.yml
server:
  port: 8081
  error:
    include-message: always      # so the UI can show a real message on 4xx
spring:
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/usersdb}
    username: ${DB_USER:microshop}
    password: ${DB_PASSWORD:microshop}
  jpa:
    hibernate:
      ddl-auto: update           # demo shortcut; use Flyway for anything real
    open-in-view: false
management:
  endpoints:
    web:
      exposure:
        include: health,info
```

Two settings worth calling out. `include-message: always` is off by default in
Spring Boot, which is why a validation failure otherwise reaches the browser as
an empty `400` with no explanation. And `open-in-view: false` closes the
Hibernate session at the end of the service call rather than holding a database
connection open for the entire HTTP request.

## Service-to-service calls

Each service owns its database outright and no service reads another's tables.
When `purchase-service` needs a user's name and a product's price, it makes an
HTTP call:

```java
@Component
public class CatalogueClient {

    private final RestTemplate restTemplate;
    private final String userUrl;
    private final String productUrl;

    public CatalogueClient(
            RestTemplateBuilder builder,
            @Value("${services.user-url}") String userUrl,
            @Value("${services.product-url}") String productUrl) {
        this.restTemplate = builder
                .connectTimeout(Duration.ofSeconds(3))
                .readTimeout(Duration.ofSeconds(5))
                .build();
        this.userUrl = userUrl;
        this.productUrl = productUrl;
    }

    public RemoteUser fetchUser(Long userId) {
        try {
            RemoteUser user = restTemplate.getForObject(
                    userUrl + "/api/users/" + userId, RemoteUser.class);
            if (user == null) {
                throw notFound("user", userId);
            }
            return user;
        } catch (RestClientException ex) {
            throw unreachable("user-service", userId, ex);
        }
    }
    // ...
}
```

Three details that are easy to skip and painful to debug later:

- **Timeouts are set explicitly.** `RestTemplate`'s default is *no timeout*. One
  slow dependency will otherwise hold a request thread forever, and enough of
  them take the service down with it.
- **A missing id is a `404`, an unreachable dependency is a `502`.** Collapsing
  both into a `500` means you cannot tell "you asked for something that does not
  exist" from "the other service is down" from a log line.
- **The DTO ignores unknown fields.** `@JsonIgnoreProperties(ignoreUnknown =
  true)` on the payload record means product-service can add a field without
  breaking purchase-service's deserialisation.

`GET /api/users/{id}` and `GET /api/products/{id}` exist *for these calls*, not
for the UI. Neither micro frontend uses them.

## Denormalise at write time

```java
@PostMapping
public ResponseEntity<PurchaseView> buy(@Valid @RequestBody NewPurchase payload) {
    RemoteUser user = catalogue.fetchUser(payload.userId());
    RemoteProduct product = catalogue.fetchProduct(payload.productId());

    Purchase saved = repository.save(new Purchase(
            user.id(), user.name(),
            product.id(), product.title(),
            payload.quantity(), product.price()));

    return ResponseEntity.status(HttpStatus.CREATED).body(PurchaseView.of(saved));
}
```

`purchase-service` stores its **own copy** of `userName`, `productTitle` and
`unitPrice` at purchase time. This is not redundancy to be normalised away — it
is the correct model:

- A purchase is a historical fact. If the product is renamed or repriced next
  week, last week's receipt must still say what was actually bought and paid.
- Listing purchase history needs no calls to the other two services, so history
  keeps working while they are down.

The read path becomes a single-table query, and the only moment of coupling is
the write.

## Seed data without an internet dependency

`product-service` seeds its catalogue once on first boot from
`https://dummyjson.com/products`, and falls back to a hard-coded list on any
failure. The stack comes up fully offline — a demo that requires network access
to show anything is a demo that fails in the room where you need it.

## Verify

```bash
for s in user-service product-service purchase-service; do
  mvn -q -f services/$s/pom.xml -DskipTests package && echo "$s ok"
done
```

#### Output

> Output on this page is **illustrative** — representative of a real run, not captured from one.

```output
user-service ok
product-service ok
purchase-service ok
```

Once running, each service reports its own database on startup — the check that the environment-driven config actually took effect:

```output
INFO  com.zaxxer.hikari.HikariDataSource : HikariPool-1 - Starting...
INFO  org.hibernate.dialect.Dialect      : HHH000400: Using dialect: PostgreSQLDialect
INFO  c.m.user.UserServiceApplication    : Started UserServiceApplication in 3.1 s
```

A service that picked up the wrong `SPRING_DATASOURCE_URL` still starts cleanly and then fails on the first query, which is much harder to trace:

```output
ERROR org.hibernate.engine.jdbc.spi.SqlExceptionHelper :
  ERROR: relation "users" does not exist
```

Seeing `relation ... does not exist` on a freshly built stack almost always means the service is connected to a sibling's database, not that a migration failed.
