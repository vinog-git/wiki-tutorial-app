# The Nginx Gateway — One Origin

A single nginx in front of everything, so the browser only ever talks to
`localhost:8080`. This buys two things: no CORS anywhere, and no hostname ever
baked into a frontend bundle.

It also contains the single most important line in the stack, which is a
`resolver` directive.

## The whole config

```nginx
server {
    listen 80;
    server_name _;

    resolver 127.0.0.11 valid=10s ipv6=off;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;

    # ---- micro frontend bundles ----
    location /mfe/users/ {
        set $users_mfe http://users-mfe:80;
        rewrite ^/mfe/users/(.*)$ /$1 break;
        proxy_pass $users_mfe;
    }

    location /mfe/products/ {
        set $products_mfe http://products-mfe:80;
        rewrite ^/mfe/products/(.*)$ /$1 break;
        proxy_pass $products_mfe;
    }

    location /mfe/purchases/ {
        set $purchases_mfe http://purchases-mfe:80;
        rewrite ^/mfe/purchases/(.*)$ /$1 break;
        proxy_pass $purchases_mfe;
    }

    # ---- micro services ----
    location /api/users {
        set $user_api http://user-service:8081;
        proxy_pass $user_api;
    }

    location /api/products {
        set $product_api http://product-service:8082;
        proxy_pass $product_api;
    }

    location /api/purchases {
        set $purchase_api http://purchase-service:8083;
        proxy_pass $purchase_api;
    }

    location = /gateway-health {
        access_log off;
        add_header Content-Type text/plain;
        return 200 'gateway ok';
    }

    # ---- the shell owns every other path ----
    location / {
        set $shell_mfe http://shell-mfe:80;
        proxy_pass $shell_mfe;
    }
}
```

## `set $var` + `resolver` — the load-bearing detail

Write a hostname *literally* in `proxy_pass` and **nginx resolves it exactly
once, at startup, then caches that IP forever.**

```nginx
proxy_pass http://users-mfe:80;      # resolved at startup, cached for the
                                     # lifetime of the process
```

That is fine for a stack you always restart as a unit. It is fatal here.
Recreating a single container — which is exactly what an affected-only deploy
does — gives it a **new IP on the Docker network**. The gateway keeps proxying
to the address of the container you just deleted, and every request to that
remote 502s until you restart the gateway too. Which would defeat the entire
point of deploying one app at a time.

Putting the upstream in a variable forces nginx to go through the resolver
instead, per request, honouring `valid=10s`:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;   # Docker's embedded DNS

location /mfe/users/ {
    set $users_mfe http://users-mfe:80;   # a variable, not a literal
    rewrite ^/mfe/users/(.*)$ /$1 break;
    proxy_pass $users_mfe;
}
```

`127.0.0.11` is Docker's embedded DNS server, present in every container on a
user-defined network. `ipv6=off` stops nginx from waiting on AAAA lookups that
will never resolve.

## Why the `rewrite` line is required

`proxy_pass` normally strips the matched location prefix automatically when the
target has a URI part:

```nginx
location /mfe/users/ {
    proxy_pass http://users-mfe:80/;     # trailing slash = strip /mfe/users/
}
```

**With a variable, that automatic strip does not happen.** nginx forwards the
full original path, so the remote receives a request for
`/mfe/users/remoteEntry.mjs` and returns 404 — its files live at the root of its
own nginx. The explicit `rewrite ... break` restores the behaviour you gave up
by using a variable.

Note the `/api/*` locations have no rewrite. There the full original path *is*
what the service expects (`/api/users` really is the Spring mapping), so
forwarding it unchanged is correct.

## Routing table

| Path | Goes to | Why |
|---|---|---|
| `/mfe/users/*` | users-mfe | static bundle, prefix stripped |
| `/mfe/products/*` | products-mfe | static bundle, prefix stripped |
| `/mfe/purchases/*` | purchases-mfe | static bundle, prefix stripped |
| `/api/users` | user-service:8081 | path forwarded as-is |
| `/api/products` | product-service:8082 | path forwarded as-is |
| `/api/purchases` | purchase-service:8083 | path forwarded as-is |
| `/gateway-health` | nginx itself | liveness without touching upstreams |
| everything else | shell-mfe | including `/users`, `/products`, `/purchases` |

That last row is the reason remote assets live under `/mfe/`. `/users` is an
**Angular route belonging to the shell** and must reach the shell so its router
can handle it. If remote static files also lived at `/users/`, a deep link there
would return the remote's bare `index.html`.

## Healthchecks must use `127.0.0.1`, not `localhost`

```yaml
healthcheck:
  test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1/health']
```

In these containers `localhost` resolves to `::1` first, and nginx's `listen 80`
binds IPv4 only. A `localhost` healthcheck reports `connection refused` against
a perfectly healthy server, compose marks the container unhealthy, and the
deploy script fails a deploy that actually worked.

## Verify

```bash
curl -s localhost:8080/gateway-health          # gateway ok
curl -sI localhost:8080/mfe/users/remoteEntry.mjs | grep -i 'content-type\|cache'
#   content-type: application/javascript
#   cache-control: no-store, must-revalidate
curl -s localhost:8080/api/products | head -c 200
```

#### Output

> Output on this page is **illustrative** — representative of a real run, not captured from one.

```output
$ curl -s localhost:8080/gateway-health
ok

$ curl -sI localhost:8080/mfe/users/remoteEntry.mjs | grep -i 'content-type\|cache'
content-type: application/javascript
cache-control: no-store, must-revalidate

$ curl -s localhost:8080/api/products | head -c 200
[{"id":1,"name":"Mechanical Keyboard","price":89.99,"stock":42},...]
```

The MIME type is the one that bites hardest when wrong. Serve `remoteEntry.mjs` as `text/plain` or `application/octet-stream` and the browser refuses to execute it, with an error that says nothing about nginx:

```output
Failed to load module script: Expected a JavaScript module script but the server
responded with a MIME type of "text/plain". Strict MIME type checking is enforced
for module scripts per HTML spec.
```

And when the `resolver` line is missing, nginx fails at **startup** rather than at request time — the container never becomes healthy:

```output
nginx: [emerg] host not found in upstream "users-mfe" in /etc/nginx/nginx.conf:42
```

Those three commands check the three things that silently break: the gateway is
up, the remote entry has the right MIME type *and* is uncacheable, and the API
proxy reaches a live service.
