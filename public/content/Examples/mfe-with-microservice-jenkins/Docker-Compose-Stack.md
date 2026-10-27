# The Docker Compose Stack

Ten services in one file. Three settings in it exist purely so that
deploying one container at a time works, and one of them is a single line at the
very top.

## Pin the project name

```yaml
# docker-compose.yml
name: microshop
```

Compose derives its project name from the directory by default. Pin it, and a
targeted redeploy issued from *anywhere* — your shell, a script, or the Jenkins
container with a different working directory — acts on the same running stack.
Leave it out and Jenkins cheerfully creates a second, parallel copy of
everything.

## Services at a glance

| Service | Image | Published port | Depends on |
|---|---|---|---|
| postgres | `microshop/postgres` | 5432 | — |
| user-service | `microshop/user-service` | 8081 | postgres (healthy) |
| product-service | `microshop/product-service` | 8082 | postgres (healthy) |
| purchase-service | `microshop/purchase-service` | 8083 | postgres (healthy) |
| shell-mfe | `microshop/shell-mfe` | — | — |
| users-mfe | `microshop/users-mfe` | — | — |
| products-mfe | `microshop/products-mfe` | — | — |
| purchases-mfe | `microshop/purchases-mfe` | — | — |
| gateway | `microshop/gateway` | 8080 | the four frontends |
| jenkins | `microshop/jenkins` | 8090 | — |

Only three ports are published for the browser: 8080 (the app), 8090 (Jenkins),
5432 (psql). The service ports 8081–8083 are published for convenience while
debugging — the frontends never use them, they go through the gateway.

## A frontend service

```yaml
users-mfe:
  build:
    context: .
    dockerfile: docker/mfe/Dockerfile
    args:
      APP: users
  image: microshop/users-mfe:latest
  healthcheck:
    test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1/health']
    interval: 10s
    timeout: 3s
    retries: 10
  networks: [microshop]
```

All four are identical apart from `APP` and the image tag. The build context is
the workspace root for every one of them, because the Nx build needs the whole
monorepo.

## A backend service

```yaml
user-service:
  build:
    context: .
    dockerfile: docker/java/Dockerfile
    args:
      SERVICE: user-service
  image: microshop/user-service:latest
  environment:
    DB_URL: jdbc:postgresql://postgres:5432/usersdb
    DB_USER: microshop
    DB_PASSWORD: microshop
  ports:
    - '8081:8081'
  depends_on:
    postgres:
      condition: service_healthy
  healthcheck:
    test: ['CMD', 'wget', '-qO-', 'http://localhost:8081/actuator/health']
    interval: 10s
    timeout: 5s
    retries: 20
    start_period: 30s
  networks: [microshop]
```

`condition: service_healthy` rather than a bare `depends_on` list. Plain
`depends_on` waits for the container to *start*, not to be *ready* — Postgres
takes several seconds to initialise, and all three services would crash-loop
against a refused connection in the meantime.

`start_period: 30s` gives the JVM time to boot before failed healthchecks start
counting against `retries`. Without it a slow first start is recorded as
unhealthy.

## Avoid bind mounts for configuration

The only bind mounts in this stack are Jenkins' docker socket and workspace.
Every nginx config, the Postgres init script — all baked into images.

The reason is Jenkins. When compose is driven from *inside* a container, a
relative host path in a bind mount is resolved by the daemon against the host
filesystem, using a path that only makes sense inside Jenkins. It resolves to
nothing, and nginx starts with a default config that serves the welcome page.
Baking configs into images removes the whole failure mode.

## Healthchecks: `127.0.0.1`, not `localhost`

```yaml
test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1/health']
```

In the nginx containers `localhost` resolves to `::1` first, and `listen 80`
binds IPv4 only, so `localhost` reports `connection refused` against a healthy
server. The Java containers happen to bind both stacks, which is why their
checks can use `localhost` — but there is no harm in using `127.0.0.1`
everywhere.

## The Jenkins service

```yaml
jenkins:
  build:
    context: .
    dockerfile: docker/jenkins/Dockerfile
  image: microshop/jenkins:latest
  user: root
  ports:
    - '8090:8080'
  environment:
    COMPOSE_PROJECT_NAME: microshop
  volumes:
    - jenkins_home:/var/jenkins_home
    # Docker-out-of-docker: the CLI in this container drives the host daemon.
    - /var/run/docker.sock:/var/run/docker.sock
    # Your working tree, so a build can deploy exactly what you just edited.
    - ./:/workspace
  networks: [microshop]
```

- **`user: root`** so the mounted docker socket is writable. This is a local
  demo; in a real environment you would add the jenkins user to the group that
  owns the socket instead.
- **The socket mount is docker-out-of-docker,** not docker-in-docker. The CLI
  inside the container drives the *host's* daemon, which is what lets Jenkins
  build and replace containers that are siblings of itself.
- **`COMPOSE_PROJECT_NAME: microshop`** so the pipeline targets the same stack
  it is running in, matching the pinned `name:` at the top of the file.

> Mounting the docker socket into a container grants that container root on the
> host. It is the right trade for a demo you run locally, and the wrong one for
> anything reachable from a network you do not control.

## Everyday commands

```bash
docker compose up -d --build     # first run: ~5–10 min
docker compose ps                # what is running, and health
docker compose logs -f           # tail everything
docker compose logs -f gateway   # tail one
docker compose down              # stop; add -v to drop the database too
```

#### Output

> Output on this page is **illustrative** — representative of a real run, not captured from one.

```output
$ docker compose ps

NAME                SERVICE            STATUS                  PORTS
microshop-gateway   gateway            Up 3 minutes (healthy)  0.0.0.0:8080->80/tcp
microshop-pg        postgres           Up 3 minutes (healthy)  0.0.0.0:5432->5432/tcp
microshop-user      user-service       Up 3 minutes (healthy)  0.0.0.0:8081->8081/tcp
microshop-usermfe   users-mfe          Up 3 minutes            80/tcp
...
```

`(healthy)` versus a bare `Up` is the distinction worth reading. A container can be `Up` for a minute before its port accepts connections — which is why `depends_on` alone is not enough and the healthchecks exist:

```output
$ docker compose ps
microshop-user      user-service       Up 8 seconds (health: starting)   0.0.0.0:8081->8081/tcp
```

A service stuck in `(health: starting)` and then flipping to `(unhealthy)` is almost always the `localhost` mistake covered above — the check runs *inside* the container, where `localhost` may resolve to IPv6 `::1` while the app listens on IPv4 only:

```output
microshop-user      user-service       Up 2 minutes (unhealthy)   0.0.0.0:8081->8081/tcp
```

There are npm wrappers for the common three:

```bash
npm run stack:up      # docker compose up -d --build
npm run stack:down    # docker compose down
npm run stack:logs    # docker compose logs -f --tail=100
```

And the one that matters, covered on the next page:

```bash
docker compose up -d --no-deps users-mfe    # replace exactly one container
```
