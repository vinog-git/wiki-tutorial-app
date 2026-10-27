# Angular: Routing

## What is Client-Side Routing?

Client-side routing lets Angular swap views without a full page reload. The browser URL changes, the back/forward buttons work, but only the relevant component re-renders — making apps feel fast and native.

**Without routing:** every page change is a server round-trip.  
**With routing:** Angular intercepts navigation, matches a URL to a component, and renders it instantly.

---

## Setting Up the Router

### 1. Define Routes

```typescript
// app.routes.ts
import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { AboutComponent } from './about/about.component';
import { ProductDetailComponent } from './products/product-detail.component';
import { NotFoundComponent } from './not-found/not-found.component';

export const routes: Routes = [
  { path: '',           component: HomeComponent },
  { path: 'about',     component: AboutComponent },
  { path: 'products/:id', component: ProductDetailComponent },
  { path: '**',        component: NotFoundComponent },   // wildcard — must be last
];
```

### 2. Bootstrap with provideRouter (Angular 14+)

```typescript
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [provideRouter(routes)]
});
```

### 3. Module-based alternative (older style)

```typescript
// app.module.ts
import { RouterModule } from '@angular/router';
import { routes } from './app.routes';

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppModule {}
```

---

## Router Outlet and RouterLink

`<router-outlet>` is the placeholder where routed components are rendered.

```typescript
// app.component.ts
import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <nav>
      <a routerLink="/"       routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">Home</a>
      <a routerLink="/about"  routerLinkActive="active">About</a>
      <a routerLink="/products/42" routerLinkActive="active">Product 42</a>
    </nav>

    <router-outlet />
  `
})
export class AppComponent {}
```

`routerLinkActive` adds the CSS class when the route is active.  
`[routerLinkActiveOptions]="{ exact: true }"` prevents `/` matching every route.

---

## Route Parameters

### Defining a parameterized route

```typescript
{ path: 'products/:id', component: ProductDetailComponent }
```

### Reading the parameter

```typescript
// product-detail.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  standalone: true,
  template: `<h2>Product ID: {{ productId }}</h2>`
})
export class ProductDetailComponent implements OnInit {
  productId = '';

  constructor(private route: ActivatedRoute) {}

  ngOnInit() {
    // Snapshot — good for one-time reads
    this.productId = this.route.snapshot.paramMap.get('id') ?? '';

    // Observable — good when component stays alive across navigation
    this.route.paramMap.subscribe(params => {
      this.productId = params.get('id') ?? '';
    });
  }
}
```

#### Output

```output
/products/42   → <h2>Product ID: 42</h2>
/products/abc  → <h2>Product ID: abc</h2>
```

Route params are **always strings** — `'42'`, never `42`. So `products.find(p => p.id === this.productId)` returns `undefined` against numeric ids; convert with `Number(...)` or `+`.

The snapshot-versus-observable distinction has a concrete failure mode. Navigating from `/products/42` to `/products/43` **reuses the same component instance** — Angular does not destroy and recreate it — so `ngOnInit` never runs again:

```output
with snapshot only:
  /products/42 → "Product ID: 42"
  /products/43 → "Product ID: 42"   ← stale, ngOnInit did not re-run

with paramMap.subscribe:
  /products/42 → "Product ID: 42"
  /products/43 → "Product ID: 43"
```

The code above uses both, so it works; using only the snapshot is the bug. Note the subscription also needs unsubscribing (`takeUntilDestroyed`, or the `async` pipe) to avoid a leak.

---

## Query Parameters and Fragments

```typescript
// Navigating with query params
this.router.navigate(['/search'], {
  queryParams: { q: 'angular', page: 2 },
  fragment: 'results'
});
// URL: /search?q=angular&page=2#results
```

### Reading query params

```typescript
import { ActivatedRoute } from '@angular/router';

constructor(private route: ActivatedRoute) {}

ngOnInit() {
  this.route.queryParamMap.subscribe(params => {
    const query = params.get('q');
    const page  = Number(params.get('page') ?? 1);
    console.log(query, page);
  });

  // Read fragment
  this.route.fragment.subscribe(fragment => {
    console.log('Fragment:', fragment);
  });
}
```

---

## Child Routes (Nested Routing)

```typescript
// app.routes.ts
{
  path: 'settings',
  component: SettingsComponent,   // has its own <router-outlet>
  children: [
    { path: '',        redirectTo: 'profile', pathMatch: 'full' },
    { path: 'profile', component: ProfileComponent },
    { path: 'security', component: SecurityComponent },
    { path: 'billing',  component: BillingComponent },
  ]
}
```

```typescript
// settings.component.ts
@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <aside>
      <a routerLink="profile">Profile</a>
      <a routerLink="security">Security</a>
      <a routerLink="billing">Billing</a>
    </aside>
    <section>
      <router-outlet />
    </section>
  `
})
export class SettingsComponent {}
```

---

## Lazy Loading

Split your app into chunks — only load a feature when the user navigates to it.

```typescript
// app.routes.ts
{
  path: 'admin',
  loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES)
}
```

```typescript
// admin/admin.routes.ts
import { Routes } from '@angular/router';
import { AdminDashboardComponent } from './dashboard.component';
import { AdminUsersComponent } from './users.component';

export const ADMIN_ROUTES: Routes = [
  { path: '',      component: AdminDashboardComponent },
  { path: 'users', component: AdminUsersComponent },
];
```

Angular generates a separate JS chunk for the admin feature. The browser only downloads it when someone visits `/admin`.

---

## Route Guards

### CanActivate — protect a route

```typescript
// auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) {
    return true;
  }
  // Redirect to login, preserving the intended URL
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
```

```typescript
// Apply it to a route
{ path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] }
```

### CanDeactivate — warn before leaving

```typescript
// unsaved-changes.guard.ts
import { CanDeactivateFn } from '@angular/router';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (component.hasUnsavedChanges()) {
    return confirm('You have unsaved changes. Leave anyway?');
  }
  return true;
};
```

```typescript
// edit-profile.component.ts
export class EditProfileComponent implements HasUnsavedChanges {
  isDirty = false;

  hasUnsavedChanges() {
    return this.isDirty;
  }
}
```

---

## Wildcard Route (404)

Always place the wildcard `**` last — the router matches routes top to bottom.

```typescript
{ path: '**', component: NotFoundComponent }
```

```typescript
@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <h1>404 — Page Not Found</h1>
    <a routerLink="/">Go home</a>
  `
})
export class NotFoundComponent {}
```

---

## Programmatic Navigation

```typescript
import { Router } from '@angular/router';

constructor(private router: Router) {}

// Basic navigation
this.router.navigate(['/products', productId]);

// With query params
this.router.navigate(['/search'], { queryParams: { q: 'angular' } });

// Relative navigation (from current route)
this.router.navigate(['../sibling'], { relativeTo: this.route });

// Replace current history entry (no back button)
this.router.navigate(['/dashboard'], { replaceUrl: true });
```

---

## Route Resolvers

Pre-fetch data before the route renders — avoids a blank/loading component.

```typescript
// product.resolver.ts
import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { ProductService } from './product.service';
import { Product } from './product.model';

export const productResolver: ResolveFn<Product> = (route) => {
  const id = route.paramMap.get('id')!;
  return inject(ProductService).getProduct(id);
};
```

```typescript
// routes
{
  path: 'products/:id',
  component: ProductDetailComponent,
  resolve: { product: productResolver }
}
```

```typescript
// product-detail.component.ts
ngOnInit() {
  this.route.data.subscribe(data => {
    this.product = data['product'];  // already loaded, no spinner needed
  });
}
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Use functional guards (`CanActivateFn`) | Use class-based guards (deprecated in v15+) |
| Lazy-load feature modules | Import everything into AppModule |
| Keep routes in a dedicated `*.routes.ts` file | Define routes inline in components |
| Use `resolve` for required data | Fetch data in `ngOnInit` when it's critical for rendering |
| Use `[routerLinkActiveOptions]="{exact:true}"` on `/` | Let the home link stay active on every route |
| Handle the wildcard `**` route | Leave 404 unhandled |
