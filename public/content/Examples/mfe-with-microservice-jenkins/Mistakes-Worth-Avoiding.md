# Mistakes Worth Avoiding

The page to read first if something is broken. Everything below was
hit while building this stack, in roughly this order.

## The whole list

| Symptom | Cause | Fix |
|---|---|---|
| `The Angular framework doesn't support a TypeScript setup with project references` | Nx 23's default preset uses TS project references | Use `--preset=angular-monorepo` |
| `create-nx-workspace` refuses to run | Target directory exists, even if empty | Generate under a new name and move the contents in |
| Module Federation generators missing | Workspace built with esbuild | `--bundler=webpack` |
| Deep link to `/users/` serves a bare remote page | Asset prefix collides with an Angular route | Serve remotes under `/mfe/<app>/` |
| Browser: "module script failed… MIME type" | nginx has no `.mjs` mapping | `types { } default_type application/javascript;` |
| Redeployed remote still serves old code | `remoteEntry.mjs` was cached | `Cache-Control: no-store` on that one file |
| `NullInjectorError: No provider for HttpClient` | `provideHttpClient()` in only one app config | Add it to all four |
| Gateway 502s after redeploying one app | nginx cached the old container IP from a literal `proxy_pass` | Put the upstream in `set $var` and add `resolver 127.0.0.11` |
| Remote 404s everything after adding the resolver | `proxy_pass` with a variable does not strip the location prefix | Add `rewrite ^/mfe/users/(.*)$ /$1 break;` |
| Container healthy but healthcheck says "connection refused" | `localhost` → `::1`, nginx binds IPv4 only | Use `127.0.0.1` |
| `nx show projects` fails on `docker/*` having no name | `@nx/docker` infers a project per Dockerfile | Remove the plugin from `nx.json` |
| Deploying one service bounces the whole stack | Missing `--no-deps` | `docker compose up -d --no-deps <svc>` |
| Jenkins creates a second copy of the stack | Project name derived from the directory | Pin `name: microshop` in compose |
| `.hpi` 404s while building the Jenkins image | Multi-line `--plugins` argument | Use `--plugin-file` |
| Jenkins ignores Configuration as Code entirely | `casc.yaml` under `/var/jenkins_home`, hidden by the volume | Move it to `/usr/share/jenkins/casc/` |
| `Checkout of Git remote '/workspace' aborted` | git plugin blocks local-path remotes | `-Dhudson.plugins.git.GitSCM.ALLOW_LOCAL_CHECKOUT=true` |
| git: "dubious ownership" in the Jenkins build | Jenkins runs as root, `/workspace` is yours | `git config --global --add safe.directory '*'` |
| `buildWithParameters` returns 400 | Parameters register only after the first run | Trigger plain `/build` once |
| Changing `init.sql` has no effect | Init scripts run only on an empty data dir | `docker compose down -v` |
| Bind-mounted config is empty inside a container | Compose driven from inside Jenkins resolves host paths | Bake configs into images |

## The four that cost the most time

### `remoteEntry.mjs` cached

The failure that makes people conclude independent deploys "don't really work".
The deploy succeeds, the container is new, the image id changed — and the page
is unchanged, because the browser is still holding the previous manifest.

It is the one file in the build with a stable name, so it is the one file that
must never be cached. Everything it points at is content-hashed and can be
cached for a year.

```nginx
location = /remoteEntry.mjs {
    add_header Cache-Control "no-store, must-revalidate" always;
}
```

### nginx caching the container IP

nginx resolves a literal hostname in `proxy_pass` **once, at startup**, then
holds that IP for the life of the process. Replace one container and it gets a
new IP on the Docker network; the gateway keeps proxying to the address of the
container you just deleted.

The symptom is a 502 on exactly the app you deployed, which clears when you
restart the gateway — and restarting the gateway on every deploy defeats the
entire point.

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;
set $users_mfe http://users-mfe:80;
rewrite ^/mfe/users/(.*)$ /$1 break;
proxy_pass $users_mfe;
```

Both extra lines are needed: the variable forces per-request DNS, and the
rewrite restores the prefix strip you lose by using a variable.

### The missing `--no-deps`

```bash
docker compose up -d users-mfe             # recreates postgres too
docker compose up -d --no-deps users-mfe   # replaces exactly one container
```

One flag is the difference between a surgical deploy and a full-stack bounce.
The symptom is subtle: the deploy works, the app works, and you only notice when
`docker compose ps` shows every container with the same fresh uptime.

### `casc.yaml` under `/var/jenkins_home`

`/var/jenkins_home` is a named volume at runtime. Anything you `COPY` there at
build time is hidden the moment the volume mounts over it. Configuration as Code
finds no file, does nothing, and logs nothing useful — Jenkins just boots with
no job and you go looking for a syntax error that does not exist.

Keep it anywhere else, and point `CASC_JENKINS_CONFIG` at it.

## Debugging order when something breaks

```bash
docker compose ps                        # who is unhealthy
docker compose logs --tail 50 <service>  # why
curl -s localhost:8080/gateway-health    # is the gateway even up
docker compose exec gateway nginx -T     # what config is actually loaded
docker compose exec users-mfe cat /usr/share/nginx/html/.app   # what build is live
```

#### Output

> Output on this page is **illustrative** — representative of a real debugging session, not captured from one.

Each command narrows the problem, and each has a characteristic "bad" answer:

```output
$ docker compose ps
microshop-gateway   gateway   Up 40 seconds (unhealthy)   0.0.0.0:8080->80/tcp
                                          ↑ start here

$ docker compose logs --tail 50 gateway
nginx: [emerg] host not found in upstream "users-mfe" in /etc/nginx/nginx.conf:42
                                          ↑ a missing `resolver`, not a typo

$ curl -s localhost:8080/gateway-health
curl: (52) Empty reply from server
                                          ↑ container up, nginx not serving

$ docker compose exec gateway nginx -T | grep proxy_pass
proxy_pass http://user-service:8081;
                                          ↑ what is *loaded*, not what is on disk

$ docker compose exec users-mfe cat /usr/share/nginx/html/.app
products
                                          ↑ wrong bundle in this container
```

The order matters: each step assumes the previous one passed. Running `nginx -T` before checking `docker compose ps` wastes time reading a config from a container that never started.

That last one is worth the trouble of having added the marker file. "Which build
is actually in this container" is otherwise a question you can only answer by
inference, and inference is exactly what fails you when a cached file or a stale
IP is involved.
