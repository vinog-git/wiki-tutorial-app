# Deploy Only What Changed

This is the page the rest of the tutorial exists to make possible.
Edit one micro frontend, and one container is rebuilt and replaced while the
other nine keep their uptime.

```bash
npm run affected           # what would deploy
npm run deploy:affected    # deploy exactly that
```

| You change | Nx deploys | Left untouched |
|---|---|---|
| `apps/users/**` | `users`, `shell` | products, purchases, all 3 services, postgres |
| `apps/products/**` | `products`, `shell` | users, purchases, all 3 services, postgres |
| `libs/shared-api/**` | all 4 frontends | all 3 services, postgres |
| `services/user-service/**` | `user-service` | every frontend, other services, postgres |
| `styles/global.scss` | all 4 frontends | all 3 services, postgres |

## Make the Java services Nx projects

Nx only knows about projects it can see. Dropping a `project.json` into each
`services/*` folder puts the backend in the same graph as the frontend, so one
query covers both:

```jsonc
// services/user-service/project.json
{
  "name": "user-service",
  "projectType": "application",
  "sourceRoot": "services/user-service/src",
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "options": {
        "command": "mvn -B -q -DskipTests package -f services/user-service/pom.xml",
        "cwd": "{workspaceRoot}"
      }
    },
    "docker-build": {
      "executor": "nx:run-commands",
      "options": { "command": "docker compose build user-service", "cwd": "{workspaceRoot}" }
    },
    "deploy": {
      "executor": "nx:run-commands",
      "options": { "command": "tools/scripts/deploy-project.sh user-service", "cwd": "{workspaceRoot}" }
    }
  }
}
```

Add the same `docker-build` / `deploy` pair to the four app `project.json`s,
mapping each to its compose service (`users` → `users-mfe`, and so on).

**Declaring a `deploy` target is how a project opts into being deployable.** No
separate list to maintain — the whole question becomes one query:

```bash
npx nx show projects --affected --with-target=deploy --base=<sha> --head=HEAD
```

## Commit, so affected has a baseline

```bash
git add -A && git commit -m "microshop scaffold"
```

`nx affected` needs a base commit to diff against, and Jenkins reads its
pipeline definition from git. Skipping this leaves both with nothing to work
from.

## The three scripts

### `tools/scripts/affected.sh [auto|since-last-deploy|all]`

Prints the affected deployable projects, one per line.

```bash
MODE="${1:-auto}"
LAST_DEPLOY_FILE=".nx-last-deploy-sha"

case "${MODE}" in
  all)
    npx nx show projects --with-target=deploy --json
    ;;
  since-last-deploy)
    base="$(cat "${LAST_DEPLOY_FILE}")"
    npx nx show projects --affected --with-target=deploy \
      --base="${base}" --head=HEAD --json
    ;;
  auto)
    # Uncommitted work wins: it is what you are actually trying to see running.
    changed="$(git status --porcelain --untracked-files=all \
                 | awk '{ if ($1 == "R") print $4; else print $2 }' \
                 | paste -sd, -)"
    if [[ -n "${changed}" ]]; then
      npx nx show projects --affected --with-target=deploy --files="${changed}" --json
    else
      "$0" since-last-deploy
    fi
    ;;
esac
```

| Mode | Compares |
|---|---|
| `auto` *(default)* | Uncommitted files if the tree is dirty, otherwise falls through to `since-last-deploy`. This is the one you want while iterating. |
| `since-last-deploy` | `.nx-last-deploy-sha`, written by the last green deploy, against `HEAD`. Falls back to `HEAD~1` on a fresh checkout. |
| `all` | Every deployable project, no comparison. The escape hatch. |

The `--files` mode is what makes `auto` useful. Nx will happily tell you what a
*commit range* affects, but while you are iterating your change is not committed
yet — feeding it the dirty file list gets you the same answer for work in
progress.

### `tools/scripts/deploy-project.sh <compose-service>`

Deploys exactly one compose service.

```bash
docker compose build "${SERVICE}"
docker compose up -d --no-deps "${SERVICE}"
# then poll docker inspect until .State.Health.Status is healthy
```

**`--no-deps` is the load-bearing flag.** Without it, compose also recreates
every service this one depends on — postgres included — which is precisely the
full-stack bounce you are trying to avoid. One missing flag turns a surgical
deploy back into a restart of everything.

The script then waits on the container's healthcheck (60 attempts, 2 s apart),
tails the last 40 log lines if it goes unhealthy, and exits non-zero. A deploy
that "succeeded" while leaving a crash-looping container behind is worse than
one that failed loudly.

### `tools/scripts/deploy-affected.sh [mode]`

Glues them together: asks `affected.sh` what to deploy, runs each project's
`deploy` target in turn, records the new sha in `.nx-last-deploy-sha`, and
prints a summary of what was deployed and what was left running.

```bash
chmod +x tools/scripts/*.sh
```

## Why the shell shows up when a remote changes

This is correct, not a bug. `apps/shell/src/app/app.routes.ts` imports
`users/Routes`, which `tsconfig.base.json` maps to the remote's real source
file. That is a genuine compile-time dependency — the shell type-checks against
the remote's exported routes — so Nx is right to flag it.

At *runtime* the shell only needs the remote's URL, which never changes, so this
is Nx being conservative rather than doing necessary work. The shell is the
cheapest image in the stack to rebuild, so the honest trade is to leave it
alone.

If you would rather the shell never rebuilt for a remote-only change, drop the
`users/Routes` path mappings from `tsconfig.base.json` and declare the remotes
in a `remotes.d.ts` instead. You lose type safety across the boundary and gain a
fully decoupled graph.

## Try it

With the stack already up:

```bash
# note the uptime of services you are NOT going to touch
docker compose ps --format '{{.Service}}\t{{.RunningFor}}'

# change one micro frontend
sed -i 's/>Users</>Enrolled People</' apps/users/src/app/remote-entry/entry.ts

# see the plan without doing anything
npm run affected
#   users
#   shell

# deploy it
npm run deploy:affected

# confirm the blast radius
docker compose ps --format '{{.Service}}\t{{.RunningFor}}'
```

`users-mfe` and `shell-mfe` show as just started. `products-mfe`,
`purchases-mfe`, all three Java services and postgres still show their original
uptime — they were never touched. Reload `http://localhost:8080/users` and the
new label is there.

#### Output

> Output on this page is **illustrative** — representative of a real run, not captured from one.

```output
# before
shell-mfe          About an hour ago
users-mfe          About an hour ago
products-mfe       About an hour ago
purchases-mfe      About an hour ago
user-service       About an hour ago
postgres           About an hour ago

$ npm run affected
users
shell

$ npm run deploy:affected
  ✓ users-mfe deployed in 47s
  ✓ shell-mfe deployed in 51s

# after
shell-mfe          14 seconds ago
users-mfe          18 seconds ago
products-mfe       About an hour ago
purchases-mfe      About an hour ago
user-service       About an hour ago
postgres           About an hour ago
```

Two of six restarted. The `About an hour ago` entries are the whole point — those containers were never stopped, so postgres kept its data and the Java services kept their warm JVMs.

Running `npm run affected` again immediately afterwards prints nothing, because the working tree now matches the deploy baseline:

```output
$ npm run affected
(no projects affected)
```

### Prove the remote really is served from its own container

```bash
for s in shell users products purchases; do
  printf '%-10s %s\n' "$s" "$(docker compose exec -T $s-mfe cat /usr/share/nginx/html/.app)"
done

curl -sI http://localhost:8080/mfe/users/remoteEntry.mjs | head -3
```

## Deploying a specific project directly

Skipping affected-detection entirely:

```bash
npx nx run users:deploy
npx nx run user-service:deploy
npx nx run-many -t deploy -p users products
```

## Escape hatches

```bash
npm run deploy:affected all         # redeploy everything, still one at a time
docker compose up -d --build        # full rebuild, the blunt instrument
docker compose restart users-mfe    # restart without rebuilding
docker compose logs -f users-mfe    # tail one container
```

## Known rough edges

- **The shell hard-imports every remote.** Nx emits the remote entries as static
  ESM imports, so if a remote container is down the shell will not boot at all —
  including during the second or two its container is being replaced. Reload and
  it is fine. Tolerating a missing remote means switching to Nx's runtime
  manifest (`setRemoteDefinitions`) instead of build-time remotes.
- **First build is slow** (~5–10 min): four Angular builds and three Maven
  builds from scratch. Subsequent single-app deploys are much faster, because
  the `npm ci` and `~/.m2` layers are shared and cached across images.
