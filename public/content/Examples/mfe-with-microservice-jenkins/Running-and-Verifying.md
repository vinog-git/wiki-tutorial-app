# Running and Verifying the Stack

First boot, the endpoints to check, and the one experiment that proves
the whole design actually holds.

## First run

```bash
docker compose up -d --build     # ~5–10 min the first time
docker compose ps                # all ten, all healthy
```

#### Output

> Output on this page is **illustrative** — representative of a real run of this stack, not captured from one.

```output
$ docker compose ps

NAME               SERVICE            STATUS                   PORTS
microshop-gateway  gateway            Up 2 minutes (healthy)   0.0.0.0:8080->80/tcp
microshop-jenkins  jenkins            Up 2 minutes             0.0.0.0:8090->8080/tcp
microshop-pg       postgres           Up 2 minutes (healthy)   0.0.0.0:5432->5432/tcp
microshop-product  product-service    Up 2 minutes (healthy)   0.0.0.0:8082->8082/tcp
microshop-purchase purchase-service   Up 2 minutes (healthy)   0.0.0.0:8083->8083/tcp
microshop-purchmfe purchases-mfe      Up 2 minutes             80/tcp
microshop-prodmfe  products-mfe       Up 2 minutes             80/tcp
microshop-shell    shell-mfe          Up 2 minutes             80/tcp
microshop-user     user-service       Up 2 minutes (healthy)   0.0.0.0:8081->8081/tcp
microshop-usermfe  users-mfe          Up 2 minutes             80/tcp
```

`(healthy)` rather than just `Up` is the thing to check — a service can be running while its port is still refusing connections. Only containers with a `healthcheck` show it.

The first build is slow because four Angular builds and three Maven builds run
from scratch. Everything after that is fast — the `npm ci` layer is shared by
the four frontend images and the `~/.m2` BuildKit cache by the three services.

| What | Where |
|---|---|
| **The app** | <http://localhost:8080> |
| Jenkins | <http://localhost:8090> (`admin` / `admin`) |
| user-service | <http://localhost:8081/api/users> |
| product-service | <http://localhost:8082/api/products> |
| purchase-service | <http://localhost:8083/api/purchases> |
| postgres | `localhost:5432` (`microshop` / `microshop`) |

## Check the API through the gateway

Everything below goes through `:8080`, which is the path the browser actually
uses. Hitting `:8081` directly bypasses the gateway and tells you less.

```bash
curl -s localhost:8080/gateway-health
curl -s localhost:8080/api/products | head -c 200

# enroll a user (name + email only — no password by design)
curl -X POST localhost:8080/api/users \
  -H 'content-type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'

# buy something
curl -X POST localhost:8080/api/purchases \
  -H 'content-type: application/json' \
  -d '{"userId":1,"productId":1,"quantity":2}'

curl -s localhost:8080/api/purchases
```

#### Output

```output
$ curl -s localhost:8080/gateway-health
ok

$ curl -s localhost:8080/api/products | head -c 200
[{"id":1,"name":"Mechanical Keyboard","price":89.99,"stock":42},{"id":2,"name":"27\" Monitor","price":329.00,"stock":15},{"id":3,"name":"USB-C Dock","price":149.50,"stock":8}]

$ curl -X POST localhost:8080/api/users -H 'content-type: application/json' \
    -d '{"name":"Ada Lovelace","email":"ada@example.com"}'
{"id":1,"name":"Ada Lovelace","email":"ada@example.com"}

$ curl -X POST localhost:8080/api/purchases -H 'content-type: application/json' \
    -d '{"userId":1,"productId":1,"quantity":2}'
{"id":1,"userId":1,"userName":"Ada Lovelace","productId":1,
 "productName":"Mechanical Keyboard","unitPrice":89.99,"quantity":2,"total":179.98}
```

Look at what came back from that last call: `userName` and `productName` are in the response even though the request only sent ids. `purchase-service` fetched them from the other two services and stored its own copy.

The two failure modes are worth provoking. With `user-service` stopped:

```output
$ docker compose stop user-service
$ curl -i -X POST localhost:8080/api/purchases -H 'content-type: application/json' \
    -d '{"userId":1,"productId":1,"quantity":2}'

HTTP/1.1 502 Bad Gateway
{"error":"upstream user-service unavailable"}
```

With a valid service but a bad id:

```output
$ curl -i -X POST localhost:8080/api/purchases -H 'content-type: application/json' \
    -d '{"userId":999,"productId":1,"quantity":2}'

HTTP/1.1 404 Not Found
{"error":"user 999 not found"}
```

That last `POST` is the interesting one — it makes `purchase-service` call
`user-service` and `product-service` over HTTP, then store its own denormalised
copy of the name and price. If it returns a `502`, one of those two is down; a
`404` means the id does not exist. The two cases are deliberately distinct.

## Check the frontends

```bash
# the shell fetches exactly this file to find each remote
curl -sI localhost:8080/mfe/users/remoteEntry.mjs | head -3
#   HTTP/1.1 200 OK
#   content-type: application/javascript
#   cache-control: no-store, must-revalidate

# which build is inside each container
for s in shell users products purchases; do
  printf '%-10s %s\n' "$s" "$(docker compose exec -T $s-mfe cat /usr/share/nginx/html/.app)"
done
```

#### Output

```output
$ curl -sI localhost:8080/mfe/users/remoteEntry.mjs | head -3
HTTP/1.1 200 OK
content-type: application/javascript
cache-control: no-store, must-revalidate

$ for s in shell users products purchases; do ... done
shell      2026-09-23T09:14:02Z 8f3a2c9
users      2026-09-23T09:14:11Z 8f3a2c9
products   2026-09-23T09:14:19Z 8f3a2c9
purchases  2026-09-23T09:14:26Z 8f3a2c9
```

`cache-control: no-store` on `remoteEntry.mjs` is deliberate and load-bearing. That file is the manifest the shell reads to find each remote's chunks; if a browser caches it, the shell keeps asking for chunk filenames that no longer exist after a deploy, and you get:

```output
GET /mfe/users/chunk-7KJ2QF4A.mjs  404 (Not Found)
Uncaught (in promise) ScriptExternalLoadError: Loading script failed.
```

The hashed chunks it points at *are* cached — only the manifest must not be.

Then open <http://localhost:8080>: enroll a user under **Users**, buy something
under **Products**, and see it under **Purchases**.

## Confirm the deployment story actually holds

This is the experiment worth running. It is the whole reason for the
architecture.

```bash
# 1. note everyone's uptime
docker compose ps --format '{{.Service}}\t{{.RunningFor}}'

# 2. change one micro frontend
sed -i 's|<h2>Users</h2>|<h2>Enrolled People</h2>|' \
  apps/users/src/app/remote-entry/entry.ts

# 3. ask what that affects — nothing is deployed yet
npm run affected
#   users
#   shell

# 4. deploy exactly that
npm run deploy:affected

# 5. check the blast radius
docker compose ps --format '{{.Service}}\t{{.RunningFor}}'
```

#### Output

```output
# 1. before
shell-mfe          About an hour ago
users-mfe          About an hour ago
products-mfe       About an hour ago
purchases-mfe      About an hour ago
user-service       About an hour ago
product-service    About an hour ago
purchase-service   About an hour ago
postgres           About an hour ago

# 3. what changed
$ npm run affected
users
shell

# 5. after deploying
shell-mfe          12 seconds ago      ← restarted
users-mfe          15 seconds ago      ← restarted
products-mfe       About an hour ago
purchases-mfe      About an hour ago
user-service       About an hour ago
product-service    About an hour ago
purchase-service   About an hour ago
postgres           About an hour ago
```

Two of eight restarted. `shell` is in the affected list even though nobody edited it — Nx knows it depends on `users` through the Module Federation remote configuration, so its build output changes too.

The uptime column is the proof: postgres was never touched, so the user you enrolled and the purchase you made are still in the database after the deploy.

Only `users-mfe` and `shell-mfe` restart. `products-mfe`, `purchases-mfe`, all
three Java services and postgres keep their original uptime — and because
postgres was never touched, the user you enrolled and the purchase you made are
still there.

Reload the page and the new heading is live.

## Local development without Docker

Faster inner loop for frontend work. Leave the stack running for the backends
and serve the frontends from Nx:

```bash
# backends: easiest is to leave the containers running
docker compose up -d postgres user-service product-service purchase-service

# frontends
npx nx serve shell            # :4200, loads the remotes from :4201-4203
```

The remotes are served on 4201/4202/4203 and the shell proxies `/api` to the
running services. Note the caveat from the Module Federation page: this is the
mode where a missing `provideHttpClient()` in a remote's own `app.config.ts`
shows up, because the remote now uses its own injector.

## Tearing down

```bash
docker compose down       # stop everything, keep the database
docker compose down -v    # also drop the volume — the only way to re-run init.sql
```
