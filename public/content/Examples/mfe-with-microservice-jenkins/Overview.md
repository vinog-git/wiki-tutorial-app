# Overview: Micro Frontends + Microservices You Can Deploy One at a Time

A complete worked example. By the end you have an Nx monorepo with four Angular
apps wired by Module Federation, three Spring Boot services, one Postgres, an
nginx gateway, and a Jenkins job that rebuilds **only what changed**.

The point of the whole exercise is the last part. Editing one micro frontend
should replace one container in about 40 seconds, while the other nine keep
their uptime. Everything else in the design exists to make that true.

## What you are building

```
                        ┌─────────────────────────────┐
   browser ──8080──────▶│  gateway (nginx)            │
                        └──┬───┬───┬───┬───┬───┬───┬──┘
              /            │   │   │   │   │   │   │
              ├────────────┘   │   │   │   │   │   │   shell-mfe
    /mfe/users/ ───────────────┘   │   │   │   │   │   users-mfe
 /mfe/products/ ───────────────────┘   │   │   │   │   products-mfe
/mfe/purchases/ ───────────────────────┘   │   │   │   purchases-mfe
    /api/users ────────────────────────────┘   │   │   user-service     ─┐
 /api/products ────────────────────────────────┘   │   product-service  ─┼─▶ postgres
/api/purchases ────────────────────────────────────┘   purchase-service ─┘
```

Ten containers, one origin. The browser only ever talks to `localhost:8080`.

## The repository layout

```
apps/
  shell/          host — nav + router, loads the three remotes at runtime
  users/          remote — enroll a user, list users
  products/       remote — catalogue, buy an item
  purchases/      remote — purchase history
libs/
  shared-api/     models + typed HTTP clients, shared by all four
services/
  user-service/       :8081  Spring Boot + JPA  -> usersdb
  product-service/    :8082  Spring Boot + JPA  -> productsdb
  purchase-service/   :8083  Spring Boot + JPA  -> purchasesdb
docker/
  gateway/        nginx, single origin for browser traffic
  mfe/            one Dockerfile that builds all four frontends
  java/           one Dockerfile that builds all three services
  postgres/       creates the three databases on first boot
  jenkins/        docker CLI + node + auto-configured job
tools/scripts/    affected detection and single-app deploy
styles/           shared stylesheet for all four frontends
```

## The three ideas that make independent deploys work

**1. Module Federation gives each remote a stable entry point.** Every remote
publishes a `remoteEntry.mjs` whose filename never changes, even though the
chunks behind it are content-hashed. The shell fetches that one file at runtime.
Replace the remote's container and the shell picks up the new code on the next
page load — with no shell rebuild and no coordinated release.

**2. One origin, so no URL is ever baked into a bundle.** Remotes are referenced
as `/mfe/users`, not `http://users-mfe:80`. A relative URL cannot go stale when
a container is recreated with a new IP.

**3. Nx knows the dependency graph, so "what changed" is a query, not a
guess.** Each deployable project declares a `deploy` target; one `nx show
projects --affected --with-target=deploy` answers the whole question across
frontend *and* backend.

## What you need installed

```bash
node -v          # v24.x  (Angular 22 wants >= 22.22.3 or >= 24.15)
npm -v
java -version    # 21
mvn -v           # 3.8+
docker --version
docker compose version
```

#### Output

A machine that is ready looks like this:

```output
v24.4.1
10.9.2
openjdk version "21.0.12.1" 2026-08-18
Apache Maven 3.9.6
Docker version 27.3.1, build ce12230
Docker Compose version v2.29.7
```

The two that actually block you:

```output
$ node -v
v20.11.0
                     ← Angular 22 refuses to build; the error names the range
$ npx nx build shell
The Angular CLI requires a minimum Node.js version of v22.22.3 or v24.15.
```

and

```output
$ docker run hello-world
docker: permission denied while trying to connect to the Docker daemon socket at
unix:///var/run/docker.sock
```

Docker must work without `sudo` (`docker run hello-world`), because the deploy
scripts and Jenkins both drive the daemon directly. A `permission denied` here means
`deploy-project.sh` and the Jenkins container will both fail later, in a much less
obvious way — usually as a build step that exits non-zero with no explanation.

## The order to build it in

| Step | Page |
|---|---|
| 1 | Nx Workspace Setup |
| 2 | Micro Frontends with Module Federation |
| 3 | Shared Library and HTTP Clients |
| 4 | Three Spring Boot Microservices |
| 5 | Postgres: One Container, Three Databases |
| 6 | Dockerizing the Frontends and Services |
| 7 | The Nginx Gateway: One Origin |
| 8 | The Docker Compose Stack |
| 9 | Deploy Only What Changed |
| 10 | Jenkins: An Affected-Only Pipeline |
| 11 | Running and Verifying the Stack |
| 12 | Mistakes Worth Avoiding |

Each page is self-contained enough to read on its own, but the build order
matters: the gateway cannot be tested before the remotes exist, and `nx
affected` needs a baseline commit before it will tell you anything useful.
