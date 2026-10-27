# Nx Workspace Setup

Two flags in the workspace generator decide
whether the rest of the tutorial is possible at all, so this short page is worth
reading before you run anything.

## Create the workspace

```bash
npx create-nx-workspace@latest microshop \
  --preset=angular-monorepo \
  --appName=shell \
  --appDir=apps \
  --style=scss \
  --bundler=webpack \
  --ssr=false \
  --unitTestRunner=none \
  --e2eTestRunner=none \
  --nxCloud=skip \
  --packageManager=npm \
  --no-interactive
cd microshop
```

### Why `--bundler=webpack`

Module Federation in Nx/Angular is webpack-based — the generators produce a
`withModuleFederation` wrapper around a webpack config. Choose esbuild and the
Module Federation generators have nothing to attach to; they simply are not
available.

### Why `--preset=angular-monorepo`

Nx 23's plain `apps` / `ts` presets set up TypeScript **project references**,
which Angular does not support. The moment you add `@nx/angular` you get:

```
The Angular framework doesn't support a TypeScript setup with project references
```

There is no flag to turn that off after the fact. Use the Angular preset.

> `create-nx-workspace` refuses to run if the target directory already exists,
> even when it is empty. Generate under a new name and move the contents in.

## Clear out the template

The Angular preset scaffolds a demo shop app you do not want:

```bash
rm -rf apps/shop apps/shop-e2e apps/api packages
```

## Remove the `@nx/docker` plugin

The template enables `@nx/docker`, which auto-infers an Nx project from every
`Dockerfile` it can find. That is fine today and fatal the moment you add a
`docker/` folder:

```
The projects in the following directories have no name provided:
  - docker/gateway
  - docker/java
  - docker/mfe
  - docker/postgres
```

Delete the plugin entry from `nx.json` (and the stale `release.projects` entry
that comes with it). Compose is driving Docker in this stack, so the plugin has
no job to do.

## Tell Nx which root files invalidate everything

`sharedGlobals` is the list of workspace-root files that should mark *every*
project affected when they change. The shared stylesheet belongs there — it is
genuinely compiled into all four frontends:

```jsonc
// nx.json
"namedInputs": {
  "sharedGlobals": [
    "{workspaceRoot}/styles/**/*",
    "{workspaceRoot}/package.json",
    "{workspaceRoot}/tsconfig.base.json"
  ]
}
```

Get this wrong in the other direction — listing a file that does not really
affect builds — and every commit redeploys the whole stack.

## Sanity check

```bash
npx nx show projects
npx nx graph          # opens the dependency graph in a browser
```

#### Output

> Output on this page is **illustrative** — representative of a real workspace, not captured from one.

```output
$ npx nx show projects
shell
users
products
purchases
user-service
product-service
purchase-service
shared-api
```

`nx show projects` listing a project is the precondition for everything else — `nx affected` can only reason about projects it knows exist. A Java service missing here means its `project.json` was never created, and `affected` will silently never select it.

An empty-ish graph at this point is expected. The next page adds the four apps.
