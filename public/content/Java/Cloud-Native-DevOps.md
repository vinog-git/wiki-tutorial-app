# Java: Cloud-Native & DevOps (Docker, ECS, CI/CD)

## What is Cloud-Native?

Cloud-native applications are designed to run in containerised, dynamically-orchestrated environments and to exploit cloud infrastructure (auto-scaling, managed databases, object storage).

**12-Factor App principles (key ones):**

| Factor | Practice |
|---|---|
| Codebase | One repo per service, tracked in git |
| Config | Environment variables, not hardcoded values |
| Backing services | DB, Kafka, S3 are attached resources — swappable |
| Processes | Stateless — any instance can handle any request |
| Port binding | Service exports its own port (embedded Tomcat) |
| Logs | Write to stdout/stderr, never to files |
| Disposability | Fast startup, graceful shutdown (SIGTERM → drain) |

## Multi-Stage Dockerfile

Multi-stage builds separate the build environment (JDK) from the runtime image (JRE). The final image is much smaller.

```dockerfile
# Stage 1: Build — uses full JDK to compile and package
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
COPY mvnw .
COPY .mvn .mvn
RUN ./mvnw clean package -DskipTests

# Stage 2: Runtime — uses slim JRE (no compiler, no source)
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

| Layer | eclipse-temurin:21-jdk | eclipse-temurin:21-jre |
|---|---|---|
| Size | ~450 MB | ~200 MB |
| Contains | Compiler, debugger, tools | Runtime only |
| Used for | Building | Running in production |

### Dependency Caching Layer

Copy `pom.xml` first and download dependencies before copying source. Docker caches this layer and skips the download on every build unless `pom.xml` changes:

```dockerfile
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app

# Copy pom.xml first — cached until dependencies change
COPY pom.xml .
COPY mvnw .
COPY .mvn .mvn
RUN ./mvnw dependency:go-offline -q

# Now copy source — this layer changes on every code edit
COPY src ./src
RUN ./mvnw clean package -DskipTests
```

#### Output

> Build and runtime output on this page is **illustrative** — representative of a real run, not captured from one.

The payoff of the cache layer is visible in the build log. First build:

```output
$ docker build -t billing-service .

 => [build 4/7] RUN ./mvnw dependency:go-offline -q          94.2s
 => [build 6/7] COPY src ./src                                0.1s
 => [build 7/7] RUN ./mvnw clean package -DskipTests          38.7s
 => exporting to image                                        2.1s
Successfully built 8f3a2c91d4e7

real    2m21.436s
```

Second build after editing one source file:

```output
 => CACHED [build 4/7] RUN ./mvnw dependency:go-offline -q     0.0s
 => [build 6/7] COPY src ./src                                 0.1s
 => [build 7/7] RUN ./mvnw clean package -DskipTests          37.9s

real    0m41.802s
```

The 94-second dependency download is `CACHED` and skipped entirely. Swap the `COPY` order — source before `pom.xml` — and every code edit invalidates the dependency layer, putting those 94 seconds back on every build.

The two-stage split shows up in the final image:

```output
$ docker images

REPOSITORY         TAG       SIZE
billing-service    latest    213MB
billing-single     latest    508MB
```

The runtime image carries no compiler, no Maven, no source and no `~/.m2` cache — smaller to ship, and a materially smaller attack surface.

## Docker Compose for Local Development

The hotel-microservices approach — each service depends on the database being up:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: hotel_db
      POSTGRES_USER: hoteluser
      POSTGRES_PASSWORD: hotelpass
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data

  eureka-server:
    build: ./eureka-server
    ports:
      - "8761:8761"

  hotel-service:
    build: ./hotel-service
    ports:
      - "8081:8081"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/hotel_db
      SPRING_DATASOURCE_USERNAME: hoteluser
      SPRING_DATASOURCE_PASSWORD: hotelpass
      EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE: http://eureka-server:8761/eureka/
    depends_on:
      - postgres
      - eureka-server

  reservation-service:
    build: ./reservation-service
    ports:
      - "8083:8083"
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/hotel_db
      EUREKA_CLIENT_SERVICE_URL_DEFAULTZONE: http://eureka-server:8761/eureka/
    depends_on:
      - postgres
      - eureka-server
      - hotel-service

volumes:
  postgres-data:
```

Environment variables passed via `environment:` override `application.yml` values — the 12-factor way to configure services per environment.

## Externalising Configuration

Never hardcode secrets. Use `${ENV_VAR:default}` syntax in Spring Boot:

```yaml
# application.yml — safe to commit
spring:
  datasource:
    url: ${DB_URL:jdbc:postgresql://localhost:5432/ebs}
    username: ${DB_USER:ebs}
    password: ${DB_PASSWORD:ebs}
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP:localhost:9094}

ebs:
  security:
    jwt:
      secret: ${JWT_SECRET:dev-secret-change-me-in-prod-this-must-be-at-least-32-bytes}
  payment:
    gateway: ${PAYMENT_GATEWAY:mock}   # swap to razorpay / stripe in prod
```

In production, inject secrets via:
- AWS Secrets Manager / Parameter Store (ECS task definition)
- Kubernetes Secrets
- Jenkins credentials binding

## Jenkins CI/CD Pipeline

From the reservation-service `Jenkinsfile`:

```groovy
pipeline {
    agent any

    environment {
        // Jenkins credentials store — not stored in code
        DB_URL      = credentials('DB_URL')
        DB_USER     = credentials('DB_USER')
        DB_PASSWORD = credentials('DB_PASSWORD')
        JWT_SECRET  = credentials('JWT_SECRET')
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                sh './mvnw clean package -DskipTests'
            }
        }

        stage('Test') {
            steps {
                sh './mvnw test'
            }
        }

        stage('Docker Build') {
            steps {
                sh 'docker build -t hotel-reservation:${BUILD_NUMBER} .'
            }
        }

        stage('Docker Run') {
            steps {
                sh '''
                    docker stop hotel-app || true
                    docker rm hotel-app || true
                    docker run -d \
                        --name hotel-app \
                        -p 8080:8080 \
                        -e SPRING_DATASOURCE_URL=${DB_URL} \
                        -e SPRING_DATASOURCE_USERNAME=${DB_USER} \
                        -e SPRING_DATASOURCE_PASSWORD=${DB_PASSWORD} \
                        -e APP_JWT_SECRET=${JWT_SECRET} \
                        hotel-reservation:${BUILD_NUMBER}
                '''
            }
        }
    }

    post {
        success {
            echo 'Deployment successful!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
}
```

### Pipeline Stages Explained

| Stage | What it does |
|---|---|
| Checkout | Pull the latest code from the SCM (GitHub/Bitbucket) |
| Build | Compile and package (skip tests to keep this fast) |
| Test | Run unit + integration tests separately — fail fast |
| Docker Build | Build image tagged with `BUILD_NUMBER` for traceability |
| Docker Run | Stop old container, start new one with injected secrets |

## AWS ECS Deployment (Production Pattern)

ECS (Elastic Container Service) runs Docker containers on managed EC2 or Fargate:

```
Developer → push code
    │
    ▼
GitHub/Bitbucket
    │
    ▼
CI Pipeline (Jenkins / GitHub Actions / CodePipeline)
    │
    ├─ Build JAR
    ├─ Build Docker image
    ├─ Push to ECR (Elastic Container Registry)
    │
    ▼
ECS Service → pulls new image → rolling update
    │
    ├─ Task Definition (CPU, memory, env vars, secrets from Secrets Manager)
    └─ Service (desired count=3, rolling deploy, health check)
```

### ECS Task Definition (JSON excerpt)

```json
{
  "family": "reservation-service",
  "containerDefinitions": [
    {
      "name": "reservation-service",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/reservation-service:42",
      "portMappings": [{ "containerPort": 8083 }],
      "environment": [
        { "name": "SPRING_PROFILES_ACTIVE", "value": "prod" }
      ],
      "secrets": [
        { "name": "DB_URL",      "valueFrom": "arn:aws:secretsmanager:...:DB_URL" },
        { "name": "DB_USER",     "valueFrom": "arn:aws:secretsmanager:...:DB_USER" },
        { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:...:DB_PASSWORD" }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/reservation-service",
          "awslogs-region": "us-east-1"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8083/actuator/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ],
  "cpu": "512",
  "memory": "1024",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"]
}
```

### Local → Production Swap Map (Electricity Billing System)

| Local | Production | Changed by |
|---|---|---|
| Self-signed JWT | Cognito User Pool tokens | `JwtProperties.issuer` |
| Postgres (Docker) | RDS Aurora PostgreSQL | `spring.datasource.url` via Secrets Manager |
| MinIO | S3 | `ebs.s3.endpoint` unset, `ebs.s3.region` set |
| Bitnami Kafka | MSK (Managed Streaming for Kafka) | `spring.kafka.bootstrap-servers` + IAM auth |
| MockPaymentGateway | Razorpay / Stripe | flip `ebs.payment.gateway=razorpay` |
| LocalLogNotifier | SES + SNS | flip `ebs.notification.channel=aws` |
| Logstash → local ES | Logstash → OpenSearch | `LOGSTASH_HOST/PORT` env vars |

## Spring Security for JWT (Stateless APIs)

From the reservation-service (`SecurityConfig`):

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Value("${app.jwt.secret}")
    private String jwtSecret;

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)       // REST APIs are stateless — no CSRF
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS))  // no HTTP session
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.GET, "/api/**").permitAll()   // reads are public
                .requestMatchers("/actuator/**").permitAll()              // health checks are public
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.decoder(jwtDecoder()))
            );
        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        SecretKeySpec secretKey = new SecretKeySpec(
                jwtSecret.getBytes(), "HmacSHA256"
        );
        return NimbusJwtDecoder.withSecretKey(secretKey).build();
    }
}
```

## Shared Security Library (common-security)

The electricity billing system extracts JWT handling into a shared auto-configuration module, used by all 9 services:

```java
@AutoConfiguration
@EnableConfigurationProperties(JwtProperties.class)
public class SecurityAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public JwtService jwtService(JwtProperties props) {
        return new JwtService(props);
    }

    @Bean
    @ConditionalOnMissingBean
    public JwtAuthenticationFilter jwtAuthenticationFilter(JwtService jwtService) {
        return new JwtAuthenticationFilter(jwtService);
    }

    @Bean
    @ConditionalOnMissingBean
    public SecurityFilterChain securityFilterChain(HttpSecurity http, JwtAuthenticationFilter jwtFilter)
            throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/**", "/v3/api-docs/**", "/swagger-ui/**").permitAll()
                .requestMatchers("/auth/**").permitAll()
                .anyRequest().authenticated())
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
```

`@ConditionalOnMissingBean` — each service can override a specific bean without losing the others. Add this to `/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` to activate Spring Boot's auto-configuration mechanism.

## Actuator Health Checks for ECS

ECS needs a health check endpoint to know whether to route traffic to the container:

```yaml
management:
  endpoint:
    health:
      show-details: always
  health:
    circuitbreakers:
      enabled: true
```

```bash
# ECS health check command
curl -f http://localhost:8083/actuator/health || exit 1
```

#### Output

Healthy, with `show-details: always`:

```output
{
  "status": "UP",
  "components": {
    "circuitBreakers": {
      "status": "UP",
      "details": {
        "hotel-service": { "status": "UP", "details": { "state": "CLOSED", "failureRate": "0.0%" } }
      }
    },
    "db":   { "status": "UP", "details": { "database": "MySQL", "validationQuery": "isValid()" } },
    "disk": { "status": "UP", "details": { "free": 41231257600, "threshold": 10485760 } }
  }
}
```

With the database down, the top-level status flips and the response code changes with it:

```output
$ curl -i http://localhost:8083/actuator/health
HTTP/1.1 503 Service Unavailable

{
  "status": "DOWN",
  "components": {
    "db": { "status": "DOWN", "details": { "error": "com.mysql.cj.jdbc.exceptions.CommunicationsException: Communications link failure" } }
  }
}
```

The `503` is what `curl -f` keys on, so ECS pulls the container out of the load balancer.

One deliberate decision worth making here: `circuitbreakers.enabled: true` means an **open circuit marks the whole service DOWN**. That is often wrong. A service that has correctly degraded a non-essential dependency is still serving traffic, and killing it makes the outage worse rather than better. Consider leaving circuit breakers out of the readiness probe and alerting on their metrics instead.

Returns `{"status":"UP"}` when the app is healthy. ECS deregisters the container from the load balancer if this returns non-2xx.

## Interview Questions

**Q: What is the difference between Docker and ECS?**
- Docker is the container runtime (runs images). ECS is AWS's orchestration layer — it decides how many containers to run, on which hosts, handles health checks, rolling deploys, and scaling. ECS runs Docker containers under the hood.

**Q: What is Fargate vs EC2 launch type in ECS?**
- EC2: you manage the underlying EC2 instances (patching, capacity). Fargate: serverless — AWS manages the infrastructure. You specify CPU/memory per task; AWS handles placement. Fargate is easier; EC2 gives more control and cost optimization at scale.

**Q: How do you do a zero-downtime deployment?**
- ECS rolling update: start new containers, wait for them to pass health checks, then stop old ones. Minimum healthy percent = 50% means at least half the desired count stays running during the deploy.

**Q: How should secrets be handled in production?**
- Never in code or docker-compose files. Store in AWS Secrets Manager or Parameter Store. Inject at runtime via ECS task definition `secrets` field — the container gets the value as an environment variable without it ever appearing in logs or task definitions in plain text.

**Q: What does stateless mean for a Spring Boot service?**
- The service holds no session state between requests. Any request can be handled by any instance. This enables horizontal scaling — add more instances and load-balance across all of them without sticky sessions. `SessionCreationPolicy.STATELESS` in Spring Security enforces this.
