# Micro Frontends with Module Federation

One generator creates the host and all three remotes and wires them
together. The interesting work is the two production webpack edits at the end —
they are what make a remote independently deployable.

## Generate the host and three remotes

```bash
npx nx g @nx/angular:host apps/shell \
  --name=shell \
  --remotes=users,products,purchases \
  --style=scss \
  --unitTestRunner=none \
  --e2eTestRunner=none \
  --ssr=false \
  --skipFormat --no-interactive
```

You get `apps/{shell,users,products,purchases}`, each with a
`module-federation.config.ts` and a `webpack.config.ts`, plus:

- `tsconfig.base.json` path mappings, so `import('users/Routes')` type-checks
- `apps/shell/src/app/app.routes.ts` lazy-loading each remote
- dev ports 4200 (shell) / 4201 / 4202 / 4203

## Each remote exposes only its route tree

Not components — routes. The remote owns its own routing, the shell just mounts
it at a path.

```ts
// apps/users/module-federation.config.ts
const config: ModuleFederationConfig = {
  name: 'users',
  exposes: { './Routes': 'apps/users/src/app/remote-entry/entry.routes.ts' },
};
```

And the shell lazy-loads it:

```ts
// apps/shell/src/app/app.routes.ts
export const appRoutes: Route[] = [
  { path: 'users',     loadChildren: () => import('users/Routes').then((m) => m.remoteRoutes) },
  { path: 'products',  loadChildren: () => import('products/Routes').then((m) => m.remoteRoutes) },
  { path: 'purchases', loadChildren: () => import('purchases/Routes').then((m) => m.remoteRoutes) },
];
```

## Provide HttpClient in all four apps

A remote loaded *through the shell* uses the **shell's** injector. The same
remote served standalone under `nx serve users` uses **its own**. So
`provideHttpClient()` must appear in all four `app.config.ts` files:

```ts
// apps/users/src/app/app.config.ts  — and shell, products, purchases
export const appConfig: ApplicationConfig = {
  providers: [provideRouter(appRoutes), provideHttpClient()],
};
```

Put it in only one place and the app works in one mode and throws
`NullInjectorError: No provider for HttpClient` in the other.

#### Output

> Output on this page is **illustrative** — representative of a real run, not captured from one.

Missing `provideHttpClient()` in the remote's own config, then running it standalone:

```output
$ npx nx serve users

ERROR NullInjectorError: R3InjectorError(Standalone[RemoteEntryComponent])[
  UserService -> HttpClient -> HttpClient ]:
  NullInjectorError: No provider for HttpClient!
```

The same build loaded **through the shell** works perfectly, because it inherits the shell's injector. That asymmetry is what makes this bug so confusing: it appears only in the mode you are not currently testing, and CI usually tests just one of them.

## Production remote URLs — the important bit

The generated `webpack.prod.config.ts` files contain no remote URLs. Two edits
make the whole deployment story work.

**Each remote pins where its own chunks come from.** Without this, a remote's
lazy chunks are requested relative to the *shell's* URL and 404:

```ts
// apps/users/webpack.prod.config.ts
export default async (webpackConfig: any, ctx: any) => {
  const withMF = await withModuleFederation(config, { dts: false });
  const merged = await withMF(webpackConfig, ctx);
  merged.output = { ...(merged.output ?? {}), publicPath: '/mfe/users/' };
  return merged;
};
```

**The shell points at those paths, relatively:**

```ts
// apps/shell/webpack.prod.config.ts
export default withModuleFederation({
  ...config,
  remotes: [
    ['users', '/mfe/users'],
    ['products', '/mfe/products'],
    ['purchases', '/mfe/purchases'],
  ],
}, { dts: false });
```

### Why `/mfe/<app>/` and not `/<app>/`

`/users`, `/products` and `/purchases` are the **shell's own Angular routes**.
They must reach the shell so the router can handle them. If you also serve the
remote's static files at `/users/`, a deep link to `/users/` returns the
remote's bare `index.html` instead of the application. Namespacing the static
assets under `/mfe/` keeps the two apart permanently.

### Verify no hostname leaked into the bundle

```bash
npx nx run-many -t build -p shell users products purchases
grep -o '.\{20\}remoteEntry\.mjs' dist/apps/shell/main.*.js
# -> import*as Us from"/mfe/users/remoteEntry.mjs"
```

A relative path in that output is the whole ballgame. If you see
`http://localhost:4201/remoteEntry.mjs` there, the shell is pinned to a dev
server and nothing you deploy will work.

## Why the entry point being stable matters

Every build emits content-hashed chunks — `main.8f2a1c.js` and friends — but
`remoteEntry.mjs` always has that exact name. It is a small manifest listing the
current hashed chunk names.

```
users-mfe container
 ├── remoteEntry.mjs        ← stable name, contents change every build
 ├── main.8f2a1c9d.js       ← hashed, cached forever
 └── chunk.4b7e02af.js
```

#### Output

What the shell actually requests on first load:

```output
GET /                                  200  (shell index.html)
GET /main-QF7ZP3RB.mjs                 200  (shell bundle)
GET /mfe/users/remoteEntry.mjs         200  (manifest — not cached)
GET /mfe/users/chunk-4XK2LMQA.mjs      200  (hashed — cached forever)
```

After redeploying only `users-mfe`, a reload fetches the manifest again and follows it to a **different** chunk:

```output
GET /mfe/users/remoteEntry.mjs         200  (fresh — no-store)
GET /mfe/users/chunk-9PL3WDVC.mjs      200  (new hash)
```

The shell bundle was served from cache and never changed. That is the payoff: new remote code reaches users without redeploying or re-downloading the host.

The shell fetches `remoteEntry.mjs` at runtime and follows it to whatever chunks
the current build produced. Replace the container, and the very next page load
gets the new code. That is the mechanism the entire deploy story rests on — and
it is why the nginx page insists that this one file must never be cached.

## Shared stylesheet

Put `styles/global.scss` at the workspace root and import it from each app's
`src/styles.scss`:

```scss
@use '../../../styles/global';
```

Root-level, so a change to it marks every project affected — which is exactly
right, since it is compiled into all four bundles.
