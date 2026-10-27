# Shared Library and HTTP Clients

A small Nx library holding the models and the typed HTTP clients that
all four frontends use. It earns its place twice: once for the obvious reason,
and once because it is what makes the affected-deploy demo convincing.

## Generate it

```bash
npx nx g @nx/angular:library libs/shared-api \
  --name=shared-api --unitTestRunner=none --skipFormat --no-interactive

rm -rf libs/shared-api/src/lib/shared-api    # drop the placeholder component
```

## The models

Plain interfaces, no classes, no decorators — they cross the network boundary
and nothing more:

```ts
// libs/shared-api/src/lib/models.ts
export interface User {
  id: number;
  name: string;
  email: string;
  enrolledAt: string;
}

export interface NewUser {
  name: string;
  email: string;
}

export interface Purchase {
  id: number;
  userId: number;
  userName: string;      // denormalised at purchase time — see the services page
  productId: number;
  productTitle: string;
  quantity: number;
  unitPrice: number;
  total: number;
  purchasedAt: string;
}

export interface NewPurchase {
  userId: number;
  productId: number;
  quantity: number;
}
```

Note the split between `User` and `NewUser`. What you send and what you get back
are different shapes, and pretending otherwise means `id` is either a lie on the
way in or optional forever.

## The API base is a relative path, never a hostname

This is the single most important line in the library:

```ts
// libs/shared-api/src/lib/api.config.ts
import { InjectionToken } from '@angular/core';

/**
 * Base path every micro frontend uses to reach the Java micro services.
 *
 * In Docker everything is served from a single origin by the `gateway` nginx,
 * so a relative `/api` prefix is all that is ever needed and no micro frontend
 * has to be rebuilt when a backend service moves.
 */
export const API_BASE = new InjectionToken<string>('API_BASE', {
  providedIn: 'root',
  factory: () => '/api',
});
```

#### Output

> Output on this page is **illustrative** — representative of a real run, not captured from one.

Because the base is relative, the request the browser makes depends entirely on where the page is served from — and never on a value baked into the bundle:

```output
page origin                 UserService.list() requests
--------------------------  ----------------------------------
http://localhost:8080       http://localhost:8080/api/users
http://localhost:4200       http://localhost:4200/api/users   (dev proxy → :8081)
https://shop.example.com    https://shop.example.com/api/users
```

The same compiled bundle works in all three. Hardcode `http://user-service:8081` instead and the browser — which has no idea what `user-service` is — fails with:

```output
GET http://user-service:8081/api/users net::ERR_NAME_NOT_RESOLVED

Access to fetch at 'http://user-service:8081/api/users' from origin
'http://localhost:8080' has been blocked by CORS policy.
```

Two errors for one mistake: the Docker-internal hostname does not resolve from the browser, and even if it did, it would be a cross-origin request.

An `InjectionToken` rather than a bare constant, so a test or a differently
hosted deployment can override it without touching the services.

## The clients

```ts
// libs/shared-api/src/lib/user.service.ts
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE)}/users`;

  list(): Observable<User[]> {
    return this.http.get<User[]>(this.base);
  }

  enroll(user: NewUser): Observable<User> {
    return this.http.post<User>(this.base, user);
  }
}
```

`providedIn: 'root'` matters for micro frontends. A remote loaded through the
shell resolves this against the shell's root injector, and the service is a
singleton across the whole page rather than one instance per remote.

## Re-export everything from the barrel

```ts
// libs/shared-api/src/index.ts
export * from './lib/models';
export * from './lib/api.config';
export * from './lib/user.service';
export * from './lib/product.service';
export * from './lib/purchase.service';
```

Consumers import from the mapped path, never from a deep file:

```ts
import { UserService, User } from '@microshop/shared-api';
```

## The second reason this library exists

Because all four apps import it, changing one line in `models.ts` makes Nx mark
all four frontends affected — and *only* the frontends. The three Java services
are untouched.

```bash
echo "// x" >> libs/shared-api/src/lib/models.ts
./tools/scripts/affected.sh auto
# -> users products purchases shell
```

That is the clearest demonstration in the repo that the affected calculation is
reading a real import graph and not a folder-name heuristic. A shared library
with genuine fan-out is what makes it visible.
