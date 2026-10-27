# Docker: Dockerfile and Building Images

A **Dockerfile** is a script of instructions that builds an image. Each instruction creates a layer. Good Dockerfiles build fast (cache-friendly), stay small, run as non-root, and start the process correctly so signals and logs work.

## Core instructions

| Instruction | Purpose |
|---|---|
| `FROM` | Base image (`FROM eclipse-temurin:21-jre`) |
| `WORKDIR` | Set the working directory for later steps |
| `COPY` / `ADD` | Copy files from the build context. Prefer `COPY`. |
| `RUN` | Run a command during the build (creates a layer) |
| `ENV` / `ARG` | Environment variable at runtime / build-time variable |
| `EXPOSE` | Documents the port (does not publish it) |
| `USER` | Switch to a non-root user for the following instructions and the runtime |
| `ENTRYPOINT` | The executable that always runs |
| `CMD` | Default arguments (overridable with `docker run image other-args`) |
| `HEALTHCHECK` | Command Docker runs to report healthy/unhealthy |
| `LABEL` | Metadata such as version, maintainer, git SHA |

## A complete, production-style example

A Spring Boot service with a multi-stage build, a non-root user and a health check:

```dockerfile
# syntax=docker/dockerfile:1

# ---- Build stage: full JDK, not shipped ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN ./mvnw -q dependency:go-offline           # cached until pom.xml changes
COPY src ./src
RUN ./mvnw -q package -DskipTests

# ---- Runtime stage: JRE only, non-root ----
FROM eclipse-temurin:21-jre
RUN groupadd --system app && useradd --system --gid app app
WORKDIR /app
COPY --from=build /src/target/orders-service.jar app.jar
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
```

```bash
docker build -t orders-service:1.0 .
docker run -d --name orders -p 8080:8080 orders-service:1.0
docker inspect -f '{{.State.Health.Status}}' orders
```

```output
healthy
```

Note the `ENTRYPOINT` in exec form (JSON array). The JVM then runs as PID 1 and receives `SIGTERM` from `docker stop`, so the app can shut down gracefully. In shell form (`ENTRYPOINT java -jar ...`) the shell is PID 1 and may swallow the signal.

## ENTRYPOINT vs CMD

```dockerfile
ENTRYPOINT ["python", "report.py"]
CMD ["--format", "csv"]
```

| Command | What runs |
|---|---|
| `docker run img` | `python report.py --format csv` |
| `docker run img --format json` | `python report.py --format json` |

## Layer caching

Docker reuses a layer if its instruction and inputs are unchanged. Once one layer changes, every layer after it rebuilds. So put the things that change least at the top:

```dockerfile
COPY pom.xml .                 # changes rarely: cache the dependency download
RUN ./mvnw dependency:go-offline
COPY src ./src                 # changes often: only this and later layers rebuild
RUN ./mvnw package
```

Check layers and sizes:

```bash
docker history orders-service:1.0
docker image ls orders-service
```

```output
IMAGE          CREATED         CREATED BY                                      SIZE
a1b2c3d4e5f6   2 minutes ago   ENTRYPOINT ["java" "-XX:MaxRAMPercentage=75"…   0B
...
REPOSITORY        TAG    IMAGE ID       CREATED          SIZE
orders-service    1.0    a1b2c3d4e5f6   2 minutes ago    231MB
```

## .dockerignore

The build context is everything sent to the daemon. Exclude what the image does not need. This speeds builds and keeps secrets out of the image.

```
# .dockerignore
.git
target
*.log
.env
**/secrets/
node_modules
```

## Image size and base image choice

| Base | Typical size | Notes |
|---|---|---|
| `eclipse-temurin:21-jdk` | ~450 MB | Build stage only |
| `eclipse-temurin:21-jre` | ~200 MB | Runtime for Java |
| `alpine` variants | Small | Uses musl libc; some native libraries may not work |
| `distroless` (`gcr.io/distroless/java21`) | Very small, no shell | Hard to debug; no package manager |
| `scratch` | 0 bytes | Only for static binaries (Go, Rust) |

Pin the tag, or better the digest, in production: `FROM eclipse-temurin:21-jre@sha256:...`.

## Build options

```bash
docker build --no-cache -t orders-service:1.0 .
docker build --build-arg APP_VERSION=1.0.3 -t orders-service:1.0.3 .
docker buildx build --platform linux/amd64,linux/arm64 -t repo/orders:1.0 --push .
```

- `--build-arg` values feed `ARG` instructions. Do not pass secrets this way, since they remain in the image history.
- Use **BuildKit** secret mounts for credentials needed during build:

```dockerfile
RUN --mount=type=secret,id=maven_token \
    MAVEN_TOKEN=$(cat /run/secrets/maven_token) ./mvnw -q package
```

```bash
docker build --secret id=maven_token,src=$HOME/.m2/token -t orders-service:1.0 .
```

## Tag and push

```bash
docker tag orders-service:1.0 123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-service:1.0
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/orders-service:1.0
```

See the ECR page in the AWS section for the login step.

## Best practices checklist

- Pin base image versions; rebuild regularly for security patches.
- One process per container; use separate containers for the app, the database and the cache.
- Run as a non-root `USER`.
- Do not store secrets in `ENV` or `ARG`; mount them at runtime or use BuildKit secrets.
- Write logs to stdout and stderr, not to files inside the image (see the Logging page).
- Add a `HEALTHCHECK` or use an orchestrator probe.
- Scan images for vulnerabilities (Trivy, ECR scan, Docker Scout).

## Key takeaways

- Multi-stage builds keep build tools out of the runtime image.
- Order instructions from least to most frequently changing to use the cache well.
- Use exec-form `ENTRYPOINT` so the app receives signals.
- Keep secrets out of layers and the build context.
