# Dockerizing the Frontends and Services

Seven application images from **two** Dockerfiles. The trick is a build
arg that selects which project gets built, which keeps the expensive dependency
layer identical — and therefore cached — across every image of the same kind.

## `.dockerignore` first

Write this before the first build, not after.

```
node_modules
**/node_modules
dist
tmp
.nx
.git
.angular
services/*/target
docker/**/data
*.log
```

Without it, `COPY . .` ships `node_modules`, `dist` and `.git` into every build
context. That is slow, and worse, it poisons layer caching — any change under
`.nx/` invalidates the copy layer and rebuilds everything.

## One Dockerfile per *kind*, not per app

```dockerfile
# docker/mfe/Dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-slim AS build
WORKDIR /workspace

# Dependency layer — shared by every micro frontend image.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Source layer — changes here only invalidate the build step below.
COPY . .

ARG APP
RUN test -n "$APP" || (echo "APP build-arg is required" && exit 1) \
    && npx nx build "$APP" --configuration=production --skip-nx-cache

# ---------------------------------------------------------------------------

FROM nginx:1.27-alpine AS runtime
ARG APP
ENV APP=${APP}

COPY docker/mfe/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/dist/apps/${APP} /usr/share/nginx/html

# A tiny marker so you can prove which build is live inside a running container.
RUN printf '%s\n' "$APP" > /usr/share/nginx/html/.app

EXPOSE 80
```

Compose passes the arg:

```yaml
users-mfe:
  build:
    context: .
    dockerfile: docker/mfe/Dockerfile
    args:
      APP: users
  image: microshop/users-mfe:latest
```

### Why this layering matters

Everything above `COPY . .` is byte-identical for all four frontends. Docker
builds `npm ci` **once** and reuses the layer for the other three images. Four
separate Dockerfiles would give you four separate installs of the same
dependency tree.

The final images are ~49 MB each — nginx plus a compiled Angular bundle. The
Node toolchain stays in the build stage and never ships.

### `node:24-slim`, not `node:24-alpine`

Angular's toolchain pulls native binaries (`@swc/core`, `esbuild`). Those ship
glibc builds by default; the musl variants are an unnecessary risk in a build
stage that you are not shipping anyway. Alpine is the right call for the
*runtime* image, where nginx has no such problem.

## The same pattern for Java

```dockerfile
# docker/java/Dockerfile
# syntax=docker/dockerfile:1.7
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
ARG SERVICE
RUN test -n "$SERVICE" || (echo "SERVICE build-arg is required" && exit 1)

# Resolve dependencies first so a source-only change does not re-download them.
# The BuildKit cache mount is shared by all three service builds.
COPY services/${SERVICE}/pom.xml ./pom.xml
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn -B -q dependency:go-offline

COPY services/${SERVICE}/src ./src
RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    mvn -B -q -DskipTests package \
    && cp target/*.jar /build/app.jar

# ---------------------------------------------------------------------------

FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
ARG SERVICE
ENV SERVICE=${SERVICE}

RUN addgroup -S app && adduser -S app -G app
COPY --from=build /build/app.jar /app/app.jar
USER app

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
```

Four things to copy from this:

- **`pom.xml` before `src`.** A source-only change reuses the resolved
  dependency layer. Copy them together and every edit re-resolves the tree.
- **`--mount=type=cache,target=/root/.m2,sharing=locked`.** A BuildKit cache
  mount, shared by all three service builds, so Spring Boot's dependencies are
  downloaded once for the whole stack rather than once per service. `sharing=locked`
  keeps two concurrent builds from corrupting the local repository.
- **`-XX:MaxRAMPercentage=75`.** Without it the JVM sizes its heap against the
  *host's* memory in some container runtimes, and gets OOM-killed under a
  memory limit it never knew about.
- **`USER app`.** The runtime image drops root. There is no reason for a Spring
  Boot jar to run as uid 0.

## Per-remote nginx: two rules that fail silently

Each micro frontend image serves its own bundle from the root of its own nginx.
Two settings in `docker/mfe/nginx.conf` are easy to get wrong, and both fail in
ways that do not look like a config problem.

```nginx
# nginx's stock mime.types has NO mapping for .mjs, and a browser refuses to
# evaluate an ES module served as application/octet-stream.
# `types { }` clears the map for this location so default_type wins.
location = /remoteEntry.mjs {
    types { }
    default_type application/javascript;
    add_header Cache-Control "no-store, must-revalidate" always;
}

location ~* \.mjs$ {
    types { }
    default_type application/javascript;
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

# Content-hashed chunks are immutable, so they can be cached hard.
location ~* \.(js|css|woff2?|png|jpe?g|gif|svg|ico)$ {
    add_header Cache-Control "public, max-age=31536000, immutable" always;
}

location = /health {
    access_log off;
    add_header Content-Type text/plain;
    return 200 'ok';
}

location / {
    add_header Cache-Control "no-store, must-revalidate" always;
    try_files $uri $uri/ /index.html;
}
```

**The MIME type.** A browser refuses to evaluate an ES module served as
`application/octet-stream`. You get a console error about the MIME type and a
blank page, with a `200 OK` in the network tab — nothing in the nginx logs says
anything is wrong.

**`remoteEntry.mjs` must be `no-store`.** It is the one file with a stable name,
so if it is cached, a redeployed remote keeps serving the *old* build to any
browser that already has it. This is the failure that makes people conclude
independent deploys "don't really work": the deploy succeeded, the container is
new, and the page is unchanged. Note the two `.mjs` rules — the exact-match
location for `remoteEntry.mjs` is never cached; every other `.mjs` chunk is
content-hashed and cached for a year.

## Verify which build is live

```bash
docker compose exec users-mfe cat /usr/share/nginx/html/.app
# users
docker compose exec users-mfe ls /usr/share/nginx/html | head
```

#### Output

> Output on this page is **illustrative** — representative of a real run, not captured from one.

```output
$ docker compose exec users-mfe cat /usr/share/nginx/html/.app
users

$ docker compose exec users-mfe ls /usr/share/nginx/html | head
.app
chunk-4XK2LMQA.mjs
index.html
main-QF7ZP3RB.mjs
polyfills-B9CTXQ2E.mjs
remoteEntry.mjs
styles-K3MN8ZQR.css
```

The failure this catches is a copy-paste one: pointing two compose services at the same built image, so `products-mfe` is really serving the users bundle. Everything looks fine — the container is healthy, nginx answers, the page even renders — until you notice the wrong route loading:

```output
$ for s in shell users products purchases; do
    printf '%-10s %s\n' "$s" "$(docker compose exec -T $s-mfe cat /usr/share/nginx/html/.app)"
  done
shell      shell
users      users
products   users        ← wrong image
purchases  purchases
```

That `.app` marker exists exactly so you can prove a container is serving the
bundle you think it is, instead of inferring it from the compose service name.
