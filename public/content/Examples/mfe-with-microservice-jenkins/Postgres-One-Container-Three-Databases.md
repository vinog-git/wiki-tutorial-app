# Postgres — One Container, Three Databases

Each service owns a database outright and no service reads another's
tables. One container is enough to model that honestly, and it keeps the demo
startable on a laptop.

```sql
-- docker/postgres/init.sql
CREATE DATABASE usersdb;
CREATE DATABASE productsdb;
CREATE DATABASE purchasesdb;
```

## Bake the init script into an image

```dockerfile
# docker/postgres/Dockerfile
FROM postgres:16-alpine
COPY docker/postgres/init.sql /docker-entrypoint-initdb.d/10-create-databases.sql
```

The obvious alternative is a bind mount in compose:

```yaml
volumes:
  - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql   # don't
```

Don't. Later in this tutorial, Jenkins drives `docker compose` from *inside* a
container. A bind-mounted host path is resolved by the **daemon**, against the
host filesystem, using a path that only makes sense inside the Jenkins
container. It silently resolves to nothing and Postgres starts with no
databases. Baking the file into the image sidesteps the whole class of problem.

## The rule that will catch you once

**`/docker-entrypoint-initdb.d/` only runs when the data directory is empty.**

Edit `init.sql` after the first successful start and absolutely nothing happens
— no error, no warning, no new database. The volume already has data, so the
entrypoint skips initialisation entirely.

```bash
docker compose down -v      # -v drops the volume; this is the only way
docker compose up -d postgres
```

## Compose service

```yaml
postgres:
  build:
    context: .
    dockerfile: docker/postgres/Dockerfile
  image: microshop/postgres:latest
  environment:
    POSTGRES_USER: microshop
    POSTGRES_PASSWORD: microshop
    POSTGRES_DB: microshop
  ports:
    - '5432:5432'
  volumes:
    - pgdata:/var/lib/postgresql/data
  healthcheck:
    test: ['CMD-SHELL', 'pg_isready -U microshop -d microshop']
    interval: 5s
    timeout: 5s
    retries: 20
  networks: [microshop]
```

`POSTGRES_DB: microshop` creates a fourth, unused database. It is the
entrypoint's default connection target while the init scripts run — you need it
even though nothing stores anything there.

The healthcheck matters more than it looks. The three services declare
`depends_on: postgres: condition: service_healthy`, so this is what stops all
three from starting up, failing to connect, and crash-looping while Postgres is
still initialising.

## Verify

```bash
docker compose exec postgres psql -U microshop -lqt | awk -F'|' '{print $1}' | grep db
#  usersdb
#  productsdb
#  purchasesdb
```

#### Output

> Output on this page is **illustrative** — representative of a real run, not captured from one.

```output
 usersdb
 productsdb
 purchasesdb
```

Three databases, one server process. The check that matters is the negative one — a cross-database join is simply not expressible:

```output
$ docker compose exec postgres psql -U microshop -d usersdb \
    -c 'SELECT * FROM productsdb.public.products;'

ERROR:  cross-database references are not implemented:
        "productsdb.public.products"
```

That error is the feature. A shared schema would have let someone write that join, and the service boundary would have quietly stopped being one.

## When one container stops being enough

For this tutorial, one Postgres with three databases gives you the property that
matters — no cross-database joins are possible, so the service boundaries cannot
quietly rot. What it does not give you is independent failure, independent
backup, or independent scaling; all three services go down together when this
container does.

Splitting into three containers later is a compose change and three connection
strings. Nothing in the application code assumes they share a server, which is
the point of keeping the boundary honest from day one.
