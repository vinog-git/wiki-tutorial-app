# Angular: HTTP Client

## What is HttpClient?

`HttpClient` is Angular's built-in service for making HTTP requests. It returns **Observables**, integrates with RxJS operators, and handles JSON parsing automatically.

---

## Setup

### Standalone (Angular 14+)

```typescript
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideHttpClient()]
});
```

### Module-based

```typescript
// app.module.ts
import { HttpClientModule } from '@angular/common/http';

@NgModule({
  imports: [HttpClientModule]
})
export class AppModule {}
```

---

## Basic HTTP Methods

Inject `HttpClient` via the constructor, then call methods that return Observables.

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

interface User {
  id: number;
  name: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class UserService {
  private baseUrl = 'https://api.example.com/users';

  constructor(private http: HttpClient) {}

  // GET — fetch all
  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.baseUrl);
  }

  // GET — fetch one
  getUser(id: number): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/${id}`);
  }

  // POST — create
  createUser(user: Omit<User, 'id'>): Observable<User> {
    return this.http.post<User>(this.baseUrl, user);
  }

  // PUT — full replace
  updateUser(id: number, user: User): Observable<User> {
    return this.http.put<User>(`${this.baseUrl}/${id}`, user);
  }

  // PATCH — partial update
  patchUser(id: number, changes: Partial<User>): Observable<User> {
    return this.http.patch<User>(`${this.baseUrl}/${id}`, changes);
  }

  // DELETE
  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
```

#### Output

> HTTP output on this page is **illustrative** — representative of real calls, not captured from a running API.

```output
getUsers()        → GET    https://api.example.com/users
                    [{"id":1,"name":"Ada","email":"ada@example.com"},
                     {"id":2,"name":"Grace","email":"grace@example.com"}]

createUser({...}) → POST   https://api.example.com/users
                    201 Created
                    {"id":3,"name":"Alan","email":"alan@example.com"}

deleteUser(3)     → DELETE https://api.example.com/users/3
                    204 No Content
```

The critical thing about all six methods: **nothing above sends a request**. `http.get()` returns a cold Observable, and the HTTP call only happens when something subscribes:

```typescript
this.userService.getUsers();                    // no request is made
this.userService.getUsers().subscribe(...);     // request fires
```

Forgetting the `subscribe` is the single most common Angular HTTP bug, and it fails silently — no error, no network activity, no clue in the console. Subscribe twice and you get **two** requests, because each subscription re-runs the whole chain.

`Observable<void>` for `delete` reflects a `204 No Content`; the callback still fires, with `undefined`.

---

## Request Headers and Options

```typescript
import { HttpHeaders, HttpParams } from '@angular/common/http';

// Custom headers
const headers = new HttpHeaders({
  'Authorization': `Bearer ${token}`,
  'Content-Type':  'application/json',
  'X-Api-Version': '2',
});

// Query parameters
const params = new HttpParams()
  .set('page', 1)
  .set('limit', 20)
  .set('sort', 'name');

// Combine
this.http.get<User[]>(this.baseUrl, { headers, params })
```

### Appending params dynamically

```typescript
let params = new HttpParams();
if (filter.name)    params = params.set('name', filter.name);
if (filter.country) params = params.set('country', filter.country);

this.http.get<User[]>(this.baseUrl, { params });
```

---

## Type Safety with Generics

Always pass a type parameter — Angular deserializes the JSON and TypeScript type-checks your usage.

```typescript
interface ApiResponse<T> {
  data: T;
  total: number;
  page: number;
}

getUsers(): Observable<ApiResponse<User[]>> {
  return this.http.get<ApiResponse<User[]>>(`${this.baseUrl}`);
}

// Usage
this.userService.getUsers().subscribe(res => {
  this.users = res.data;         // typed as User[]
  this.total = res.total;        // number
});
```

---

## Error Handling

### catchError + throwError

```typescript
import { catchError, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';

getUsers(): Observable<User[]> {
  return this.http.get<User[]>(this.baseUrl).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        return throwError(() => new Error('Not authenticated'));
      }
      if (error.status === 404) {
        return throwError(() => new Error('Resource not found'));
      }
      if (error.status === 0) {
        return throwError(() => new Error('Network error — check your connection'));
      }
      return throwError(() => new Error(`Server error: ${error.status}`));
    })
  );
}
```

### Handling errors in the component

```typescript
this.userService.getUsers().subscribe({
  next:  (users) => { this.users = users; },
  error: (err)   => { this.errorMessage = err.message; },
});
```

#### Output

The status determines the message the component displays:

```output
401 Unauthorized  → "Not authenticated"
404 Not Found     → "Resource not found"
500 Server Error  → "Server error: 500"
(network down)    → "Network error — check your connection"
```

`error.status === 0` is the case worth knowing. A status of **zero is not an HTTP status** — it means the browser never received a response at all: the host is unreachable, the request was blocked by CORS, or the user is offline. Treating it as a server error sends people to look in the wrong logs.

The raw `HttpErrorResponse` for that last case looks like:

```output
HttpErrorResponse {
  status: 0,
  statusText: "Unknown Error",
  url: "https://api.example.com/users",
  message: "Http failure response for https://api.example.com/users: 0 Unknown Error",
  error: ProgressEvent { type: "error" }
}
```

Note `error.error` holds the parsed response **body** while `error.message` is Angular's own summary — server-side validation details live in the former, and reaching for the latter is why so many apps show "Http failure response for..." to their users.

---

## Retry Logic

### retry — fixed number of retries

```typescript
import { retry } from 'rxjs/operators';

getUsers(): Observable<User[]> {
  return this.http.get<User[]>(this.baseUrl).pipe(
    retry(3),    // retry up to 3 times on error
    catchError(this.handleError)
  );
}
```

### Retry with delay

```typescript
import { retryWhen, delay, take } from 'rxjs/operators';

getUsers(): Observable<User[]> {
  return this.http.get<User[]>(this.baseUrl).pipe(
    retryWhen(errors =>
      errors.pipe(
        delay(1000),   // wait 1 second between retries
        take(3)        // give up after 3 attempts
      )
    ),
    catchError(this.handleError)
  );
}
```

---

## HTTP Interceptors

Interceptors sit between your app and the HTTP layer — great for auth headers, logging, and error handling.

### Auth token interceptor

```typescript
// auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth  = inject(AuthService);
  const token = auth.getToken();

  if (!token) return next(req);

  const authReq = req.clone({
    headers: req.headers.set('Authorization', `Bearer ${token}`)
  });
  return next(authReq);
};
```

### Logging interceptor

```typescript
// logging.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { tap } from 'rxjs/operators';

export const loggingInterceptor: HttpInterceptorFn = (req, next) => {
  const start = Date.now();
  console.log(`→ ${req.method} ${req.url}`);

  return next(req).pipe(
    tap({
      next:  (event) => console.log(`← ${req.url} (${Date.now() - start}ms)`),
      error: (err)   => console.error(`✗ ${req.url}`, err),
    })
  );
};
```

### Global error interceptor

```typescript
// error.interceptor.ts
import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from './notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router       = inject(Router);
  const notification = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      switch (error.status) {
        case 401:
          router.navigate(['/login']);
          break;
        case 403:
          notification.error('You do not have permission.');
          break;
        case 500:
          notification.error('A server error occurred. Please try again.');
          break;
      }
      return throwError(() => error);
    })
  );
};
```

### Register interceptors

```typescript
// main.ts
import { provideHttpClient, withInterceptors } from '@angular/common/http';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(
      withInterceptors([authInterceptor, loggingInterceptor, errorInterceptor])
    )
  ]
});
```

---

## Loading State Pattern

```typescript
@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="loading" class="spinner">Loading...</div>
    <div *ngIf="error" class="error">{{ error }}</div>
    <ul *ngIf="!loading && !error">
      <li *ngFor="let user of users">{{ user.name }}</li>
    </ul>
  `
})
export class UsersComponent implements OnInit {
  users:   User[]  = [];
  loading          = false;
  error:   string  = '';

  constructor(private userService: UserService) {}

  ngOnInit() {
    this.loadUsers();
  }

  loadUsers() {
    this.loading = true;
    this.error   = '';

    this.userService.getUsers().subscribe({
      next:     (data) => { this.users = data; },
      error:    (err)  => { this.error = err.message; },
      complete: ()     => { this.loading = false; }
    });
  }
}
```

---

## Canceling Requests with takeUntil

Prevent memory leaks when a component is destroyed before a request completes.

```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({ standalone: true, template: '...' })
export class SearchComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  constructor(private userService: UserService) {}

  ngOnInit() {
    this.userService.getUsers().pipe(
      takeUntil(this.destroy$)   // auto-cancels on destroy
    ).subscribe(users => {
      this.users = users;
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
```

---

## Environment-Based API URLs

```typescript
// environments/environment.ts (development)
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api'
};

// environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.myapp.com'
};
```

```typescript
// user.service.ts
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private baseUrl = `${environment.apiUrl}/users`;
  // ...
}
```

---

## Best Practices

| Do | Don't |
|----|-------|
| Type every response with generics | Use `any` — you lose all type safety |
| Handle errors with `catchError` | Let errors silently fail |
| Use interceptors for auth/logging | Add headers manually in every service |
| Cancel subscriptions with `takeUntil` | Leave subscriptions open (memory leaks) |
| Use environment files for API URLs | Hard-code URLs in services |
| `retry()` on flaky network calls | Retry on 4xx errors (user/auth errors) |
| Return Observables from services | Subscribe inside services |
