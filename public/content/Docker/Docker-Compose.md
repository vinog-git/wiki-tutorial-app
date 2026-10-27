# Docker: Compose (Multi-Container Applications)

Docker Compose describes a multi-container application in one YAML file: services, networks, volumes and configuration. One command starts the whole stack, and the same file documents how the pieces fit. Compose is ideal for local development, integration tests, and small single-host deployments.

## A full-stack example

An API, a PostgreSQL database, a Redis cache, and an nginx reverse proxy, with proper networks, health checks and volumes:

```yaml
# docker-compose.yml
name: orders

services:
  proxy:
    image: nginx:1.27
    ports:
      - "80:80"
    volumes:
      - ./proxy/default.conf:/etc/nginx/conf.d/default.conf:ro
    networks: [public]
    depends_on:
      api:
        condition: service_healthy
    restart: unless-stopped

  api:
    build:
      context: ./api
      target: runtime                # multi-stage target from the Dockerfile
    image: orders-api:dev
    env_file: .env
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/orders
      SPRING_DATA_REDIS_HOST: cache
    networks: [public, backend]
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/actuator/health"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "20m"
        max-file: "5"
    restart: unless-stopped

  db:
    image: postgres:16
    environment:
      POSTGRES_DB: orders
      POSTGRES_USER: app
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks: [backend]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d orders"]
      interval: 5s
      timeout: 3s
      retries: 10
    restart: unless-stopped

  cache:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redisdata:/data
    networks: [backend]

networks:
  public:
  backend:
    internal: true                   # no route to the internet for db and cache

volumes:
  pgdata:
  redisdata:
```

```bash
echo "DB_PASSWORD=$(openssl rand -base64 24)" > .env   # keep .env out of git
docker compose up -d --build
docker compose ps
```

```output
NAME                    IMAGE              STATUS                    PORTS
orders-api-1            orders-api:dev     Up 25 seconds (healthy)   8080/tcp
orders-cache-1          redis:7-alpine     Up 27 seconds             6379/tcp
orders-db-1             postgres:16        Up 27 seconds (healthy)   5432/tcp
orders-proxy-1          nginx:1.27         Up 20 seconds             0.0.0.0:80->80/tcp
```

Note the `internal: true` backend network: `api` reaches `db` and `cache`, but `db` and `cache` cannot reach the internet. The `api` is on both networks, which is how the proxy can reach it.

## Essential commands

| Task | Command |
|---|---|
| Start in background, rebuild images | `docker compose up -d --build` |
| Stop and remove containers and networks (keep volumes) | `docker compose down` |
| Also delete named volumes (destructive) | `docker compose down -v` |
| Logs for one service, following | `docker compose logs -f --tail 100 api` |
| Run a one-off command | `docker compose run --rm api ./mvnw test` |
| Shell in a running service | `docker compose exec api sh` |
| Scale a service | `docker compose up -d --scale worker=3` |
| Show the fully rendered config | `docker compose config` |
| Restart one service | `docker compose restart api` |
| Pull newer images | `docker compose pull` |

## Dependencies and health

`depends_on` only controls start order by default. Use `condition: service_healthy` to wait until a health check passes. Without it, an API may start before the database accepts connections and crash on boot.

| Condition | Waits until |
|---|---|
| `service_started` (default) | Container started |
| `service_healthy` | Health check passes |
| `service_completed_successfully` | A one-shot container (migrations) exits with code 0 |

A migration service is a good use of the last one:

```yaml
services:
  migrate:
    image: orders-api:dev
    command: ["java", "-jar", "app.jar", "--spring.flyway.migrate-only=true"]
    depends_on:
      db:
        condition: service_healthy
    networks: [backend]
    restart: "no"

  api:
    depends_on:
      migrate:
        condition: service_completed_successfully
```

## Environment and secrets

| Mechanism | Where it goes | Use for |
|---|---|---|
| `environment:` | In the file | Non-secret defaults |
| `env_file: .env` | Read from a file | Local values; keep `.env` out of git |
| `${VAR}` substitution | Read from the shell or `.env` | Parameterising the file |
| `${VAR:?message}` | Fails if unset | Required values |
| `secrets:` | Mounted at `/run/secrets/<name>` | Passwords in dev or single-host prod |

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

Commit a `.env.example` with placeholder values, never the real `.env`.

## Override files for each environment

Compose merges files in order. Use a base file plus an override for development and another for production:

```yaml
# docker-compose.override.yml (picked up automatically in development)
services:
  api:
    build:
      target: dev
    volumes:
      - ./api/src:/app/src        # live code for hot reload
    ports:
      - "5005:5005"               # remote debugger
```

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Profiles: optional services

Profiles let you start extra tools only when asked, for example a database admin UI:

```yaml
services:
  adminer:
    image: adminer
    ports: ["8081:8080"]
    profiles: ["debug"]
```

```bash
docker compose up -d                     # no adminer
docker compose --profile debug up -d     # adminer included
```

## Testing with Compose

```bash
docker compose up -d --wait              # start and block until all health checks pass
docker compose run --rm api ./mvnw -q verify
docker compose down -v                   # clean state for the next run (the test database is disposable)
```

`--wait` is the reliable way to wait for a stack in CI. A `sleep 30` is a guess.

## Compose and the rest of the stack

| Need | Next step |
|---|---|
| Logs from every service in one place | Use a log shipper (Logging page) |
| Metrics and dashboards | Prometheus and Grafana (Grafana section) |
| Central log search | Elasticsearch and Kibana (Kibana section) |
| Event streaming between services | Kafka (Kafka section) |
| Moving to production orchestration | Kubernetes (Kubernetes section) or ECS (AWS section) |

Compose is not a production orchestrator: it does not reschedule across hosts or do rolling deploys. Use it for single hosts, development and CI.

## Key takeaways

- One `docker-compose.yml` describes services, networks and volumes; `up -d --build` starts everything.
- Use `condition: service_healthy` and health checks to order startup correctly.
- `down` keeps volumes; `down -v` deletes data.
- Keep secrets out of the file and out of git.
- Use override files and profiles to vary the stack per environment.
