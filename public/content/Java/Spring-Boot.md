# Java: Spring Boot & REST APIs

## What is Spring Boot?

Spring Boot is a framework for building production-ready Java applications. It removes boilerplate configuration through auto-configuration, bundles an embedded Tomcat server, and provides first-class support for REST APIs and database access.

Key features:
- Auto-configuration — sensible defaults out of the box
- Embedded server — no separate Tomcat install needed
- Dependency injection — managed by the Spring container
- JPA / Hibernate — database access without raw SQL
- RESTful API support — built-in with `@RestController`

## Project Setup

### 1. Create the Project

```bash
mvn archetype:generate \
  -DgroupId=com.example \
  -DartifactId=my-app \
  -DarchetypeArtifactId=maven-archetype-quickstart
```

Or use [start.spring.io](https://start.spring.io) to generate a project with the dependencies pre-selected.

### 2. Add Dependencies to pom.xml

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
<dependency>
    <groupId>mysql</groupId>
    <artifactId>mysql-connector-java</artifactId>
</dependency>
```

### 3. Configure the Database

`src/main/resources/application.properties`:

```properties
spring.datasource.url=jdbc:mysql://localhost:3306/mydb
spring.datasource.username=root
spring.datasource.password=password
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
server.port=8080
```

`ddl-auto=update` lets Hibernate create or update tables automatically from your entity classes.

### 4. Run the Application

```bash
mvn spring-boot:run
```

#### Output

> Console and HTTP output on this page is **illustrative** — representative of a real run, not captured from one, since it needs a running MySQL and a built application.

```output
  .   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/
 :: Spring Boot ::                (v3.2.0)

INFO 12345 --- [  restartedMain] com.example.Application  : Starting Application using Java 21
INFO 12345 --- [  restartedMain] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat initialized with port 8080 (http)
INFO 12345 --- [  restartedMain] o.hibernate.jpa.internal.util.LogHelper  : HHH000204: Processing PersistenceUnitInfo [name: default]
Hibernate: create table users (id bigint not null auto_increment, age integer, email varchar(255), name varchar(255) not null, primary key (id)) engine=InnoDB
Hibernate: alter table users add constraint UK_6dotkott2kjsp8vw4d0m25fb7 unique (email)
INFO 12345 --- [  restartedMain] o.s.b.w.embedded.tomcat.TomcatWebServer  : Tomcat started on port 8080 (http)
INFO 12345 --- [  restartedMain] com.example.Application  : Started Application in 2.847 seconds
```

The two `Hibernate:` lines are `ddl-auto=update` at work — it read the `@Entity` class and issued the `CREATE TABLE` itself. The unique constraint comes from `@Column(unique = true)` on `email`. Those lines appear because `spring.jpa.show-sql=true` is set; turn it off and the schema work still happens, silently.

If port 8080 is already taken you get this instead, which is the most common first-run failure:

```output
***************************
APPLICATION FAILED TO START
***************************

Description:
Web server failed to start. Port 8080 was already in use.

Action:
Identify and stop the process that's listening on port 8080 or configure this application to listen on another port.
```

The API is then available at `http://localhost:8080`.

## Key Annotations

| Annotation | Where used | Purpose |
|---|---|---|
| `@SpringBootApplication` | Main class | Enables auto-config, component scan, bean registration |
| `@Entity` | Model class | Maps the class to a database table |
| `@Table(name = "...")` | Model class | Specifies the table name |
| `@Id` | Field | Marks the primary key |
| `@GeneratedValue` | Field | Auto-increment strategy |
| `@Column` | Field | Column constraints (nullable, unique, etc.) |
| `@Repository` | Interface | Database access layer |
| `@Service` | Class | Business logic layer |
| `@RestController` | Class | Handles HTTP requests, returns JSON |
| `@RequestMapping` | Class/Method | Base URL path |
| `@GetMapping` | Method | HTTP GET handler |
| `@PostMapping` | Method | HTTP POST handler |
| `@PutMapping` | Method | HTTP PUT handler |
| `@DeleteMapping` | Method | HTTP DELETE handler |
| `@PathVariable` | Parameter | Extracts `{id}` from the URL |
| `@RequestParam` | Parameter | Extracts `?name=value` from query string |
| `@RequestBody` | Parameter | Deserializes JSON body into an object |
| `@Autowired` | Field/Constructor | Injects a Spring-managed bean |

## Building a Users API

### Step 1 — Main Application Class

```java
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}
```

### Step 2 — Entity (Database Model)

```java
import javax.persistence.*;

@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Column(unique = true)
    private String email;

    private Integer age;

    // Constructors
    public User() {}

    public User(String name, String email, Integer age) {
        this.name = name;
        this.email = email;
        this.age = age;
    }

    // Getters and Setters
    public Long getId()              { return id; }
    public void setId(Long id)       { this.id = id; }

    public String getName()          { return name; }
    public void setName(String name) { this.name = name; }

    public String getEmail()             { return email; }
    public void setEmail(String email)   { this.email = email; }

    public Integer getAge()              { return age; }
    public void setAge(Integer age)      { this.age = age; }
}
```

### Step 3 — Repository (Database Access)

Extend `JpaRepository` — Spring generates all standard CRUD methods automatically. Custom finder methods are derived from the method name.

```java
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
    User findByEmail(String email);
    List<User> findByAge(Integer age);
    List<User> findByNameContaining(String name);
}
```

`JpaRepository<User, Long>` — first type is the entity, second is the primary key type. You get `findAll()`, `findById()`, `save()`, `delete()`, and more for free.

#### Output

You write no implementation, yet the method names become SQL. With `show-sql=true`, calling `findByNameContaining("Ali")` logs:

```output
Hibernate: select u1_0.id,u1_0.age,u1_0.email,u1_0.name from users u1_0 where u1_0.name like ? escape '\\'
```

Spring Data parses the method name into a query at startup — which means a **typo is a startup failure, not a runtime one**:

```java
List<User> findByNmae(String name);   // misspelled
```

```output
org.springframework.beans.factory.BeanCreationException: Error creating bean with name 'userRepository':
  Could not create query for public abstract java.util.List UserRepository.findByNmae(java.lang.String);
  Reason: Failed to create query for method; No property 'nmae' found for type 'User'; Did you mean 'name'?
```

Failing at boot rather than on the first request is the point — you find out before the code is deployed.

### Step 4 — REST Controller

```java
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @Autowired
    private UserRepository userRepository;

    // GET /api/users — all users
    @GetMapping
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    // GET /api/users/{id} — single user
    @GetMapping("/{id}")
    public ResponseEntity<User> getUserById(@PathVariable Long id) {
        return userRepository.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    // POST /api/users — create user
    @PostMapping
    public User createUser(@RequestBody User user) {
        return userRepository.save(user);
    }

    // PUT /api/users/{id} — update user
    @PutMapping("/{id}")
    public ResponseEntity<User> updateUser(
            @PathVariable Long id,
            @RequestBody User userDetails) {

        return userRepository.findById(id)
            .map(user -> {
                user.setName(userDetails.getName());
                user.setEmail(userDetails.getEmail());
                user.setAge(userDetails.getAge());
                return ResponseEntity.ok(userRepository.save(user));
            })
            .orElse(ResponseEntity.notFound().build());
    }

    // DELETE /api/users/{id} — delete user
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable Long id) {
        return userRepository.findById(id)
            .map(user -> {
                userRepository.delete(user);
                return ResponseEntity.noContent().<Void>build();
            })
            .orElse(ResponseEntity.notFound().build());
    }

    // GET /api/users/age/{age}
    @GetMapping("/age/{age}")
    public List<User> getUsersByAge(@PathVariable Integer age) {
        return userRepository.findByAge(age);
    }

    // GET /api/users/search?name=Alice
    @GetMapping("/search")
    public List<User> searchUsers(@RequestParam String name) {
        return userRepository.findByNameContaining(name);
    }
}
```

## Testing the API

```bash
# Get all users
curl http://localhost:8080/api/users

# Get user by id
curl http://localhost:8080/api/users/1

# Create a user
curl -X POST http://localhost:8080/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","age":28}'

# Update a user
curl -X PUT http://localhost:8080/api/users/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice Smith","email":"alice@example.com","age":29}'

# Delete a user
curl -X DELETE http://localhost:8080/api/users/1

# Search by name
curl "http://localhost:8080/api/users/search?name=Alice"
```

#### Output

Creating a user — note the response carries an `id` the request did not have, generated by the database:

```output
$ curl -X POST http://localhost:8080/api/users \
    -H "Content-Type: application/json" \
    -d '{"name":"Alice","email":"alice@example.com","age":28}'

{"id":1,"name":"Alice","email":"alice@example.com","age":28}
```

Fetching all users returns a JSON array:

```output
$ curl http://localhost:8080/api/users

[{"id":1,"name":"Alice","email":"alice@example.com","age":28},
 {"id":2,"name":"Bob","email":"bob@example.com","age":35}]
```

Now the status codes, which are the part worth studying. A hit versus a miss:

```output
$ curl -i http://localhost:8080/api/users/1
HTTP/1.1 200 OK
Content-Type: application/json
{"id":1,"name":"Alice","email":"alice@example.com","age":28}

$ curl -i http://localhost:8080/api/users/999
HTTP/1.1 404 Not Found
```

That 404 is the `.orElse(ResponseEntity.notFound().build())` branch. Without `ResponseEntity`, returning a bare `null` would give you `200 OK` with an empty body — technically a success response for a resource that does not exist.

Delete returns no body at all:

```output
$ curl -i -X DELETE http://localhost:8080/api/users/1
HTTP/1.1 204 No Content
```

And violating the unique constraint on `email` surfaces as a 500 unless you add an `@ExceptionHandler`:

```output
$ curl -i -X POST http://localhost:8080/api/users \
    -H "Content-Type: application/json" \
    -d '{"name":"Alice Clone","email":"alice@example.com","age":30}'

HTTP/1.1 500 Internal Server Error
{"timestamp":"2026-09-23T10:14:22.104+00:00","status":500,"error":"Internal Server Error","path":"/api/users"}

# server log:
ERROR 12345 --- [nio-8080-exec-3] o.h.engine.jdbc.spi.SqlExceptionHelper :
  Duplicate entry 'alice@example.com' for key 'users.UK_6dotkott2kjsp8vw4d0m25fb7'
```

A 500 for what is really a client mistake is poor API behaviour — this is exactly the case the `@ExceptionHandler` suggestion at the end of this page is meant to fix, by turning it into a `409 Conflict` with a useful message.

## Practical Example: Products API

A complete second example using a `Product` entity:

```java
@Entity
@Table(name = "products")
public class Product {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    private String description;
    private double price;
    private int quantity;

    // Getters and setters omitted for brevity
}
```

```java
public interface ProductRepository extends JpaRepository<Product, Long> {
    List<Product> findByNameContaining(String name);
    List<Product> findByPriceLessThan(double price);
}
```

```java
@RestController
@RequestMapping("/api/products")
public class ProductController {

    @Autowired
    private ProductRepository repository;

    @GetMapping
    public List<Product> getAll() {
        return repository.findAll();
    }

    @GetMapping("/{id}")
    public ResponseEntity<Product> getById(@PathVariable Long id) {
        return repository.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public Product create(@RequestBody Product product) {
        return repository.save(product);
    }

    @PutMapping("/{id}")
    public ResponseEntity<Product> update(
            @PathVariable Long id,
            @RequestBody Product details) {
        return repository.findById(id)
            .map(product -> {
                product.setName(details.getName());
                product.setPrice(details.getPrice());
                return ResponseEntity.ok(repository.save(product));
            })
            .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        repository.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/search")
    public List<Product> search(@RequestParam String name) {
        return repository.findByNameContaining(name);
    }
}
```

## Layered Architecture Summary

A Spring Boot application is typically organised into three layers:

```
Controller  →  Service  →  Repository  →  Database
(@RestController) (@Service) (@Repository / JpaRepository)
```

- **Controller** — receives HTTP requests, validates input, returns responses
- **Service** — business logic (not shown above for brevity, but recommended)
- **Repository** — database queries via JPA

## Next Steps

- Add a `@Service` layer between controller and repository
- Add input validation with `@Valid` and `@NotNull`
- Add Spring Security for authentication
- Add `@ExceptionHandler` for clean error responses
- Connect to PostgreSQL by swapping the driver dependency
