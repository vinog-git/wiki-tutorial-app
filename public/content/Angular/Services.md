# Angular: Services

## What are Services?

Services are TypeScript classes that encapsulate business logic and can be reused across multiple components. They promote code reuse, maintainability, and separation of concerns.

## Creating a Service

A service is a simple TypeScript class decorated with `@Injectable`.

```typescript
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'  // Available throughout the app
})
export class UserService {
  private users = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' }
  ];

  getUsers() {
    return this.users;
  }

  getUserById(id: number) {
    return this.users.find(u => u.id === id);
  }

  addUser(name: string) {
    const newUser = { id: this.users.length + 1, name };
    this.users.push(newUser);
    return newUser;
  }
}
```

## Using Services in Components

Inject a service into a component using the constructor.

```typescript
import { Component, OnInit } from '@angular/core';
import { UserService } from './user.service';

@Component({
  selector: 'app-user-list',
  template: `
    <ul>
      <li *ngFor="let user of users">{{ user.name }}</li>
    </ul>
  `
})
export class UserListComponent implements OnInit {
  users: any[] = [];

  constructor(private userService: UserService) {}

  ngOnInit() {
    this.users = this.userService.getUsers();
  }
}
```

## HTTP Services

Services are commonly used to make API calls.

```typescript
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private apiUrl = 'https://api.example.com';

  constructor(private http: HttpClient) {}

  // GET request
  getUsers(): Observable<any> {
    return this.http.get(`${this.apiUrl}/users`);
  }

  // POST request
  createUser(user: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/users`, user);
  }

  // PUT request
  updateUser(id: number, user: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/users/${id}`, user);
  }

  // DELETE request
  deleteUser(id: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/users/${id}`);
  }
}
```

## Using HTTP Service in Component

```typescript
@Component({
  selector: 'app-users',
  template: `
    <div *ngIf="loading">Loading...</div>
    <div *ngIf="error" class="error">{{ error }}</div>
    <ul *ngIf="users">
      <li *ngFor="let user of users">{{ user.name }}</li>
    </ul>
  `
})
export class UsersComponent implements OnInit {
  users: any[] = [];
  loading = false;
  error = '';

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loading = true;
    this.apiService.getUsers().subscribe({
      next: (data) => {
        this.users = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load users';
        this.loading = false;
      }
    });
  }
}
```

## State Management with Services

Share data across components using services.

```typescript
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class StateService {
  private appState = new BehaviorSubject<any>({
    user: null,
    isLoggedIn: false
  });

  public state$ = this.appState.asObservable();

  login(user: any) {
    const newState = {
      user,
      isLoggedIn: true
    };
    this.appState.next(newState);
  }

  logout() {
    const newState = {
      user: null,
      isLoggedIn: false
    };
    this.appState.next(newState);
  }

  getState() {
    return this.appState.getValue();
  }
}
```

## Using BehaviorSubject for Observables

```typescript
// Service
@Injectable({ providedIn: 'root' })
export class CartService {
  private items = new BehaviorSubject<any[]>([]);
  public items$ = this.items.asObservable();

  addItem(item: any) {
    const currentItems = this.items.getValue();
    this.items.next([...currentItems, item]);
  }

  removeItem(id: number) {
    const currentItems = this.items.getValue();
    const filtered = currentItems.filter(item => item.id !== id);
    this.items.next(filtered);
  }

  getTotal(): number {
    return this.items.getValue().reduce((sum, item) => sum + item.price, 0);
  }
}

// Component
@Component({
  selector: 'app-cart',
  template: `
    <div>
      <h2>Cart ({{ items$ | async | length }} items)</h2>
      <ul>
        <li *ngFor="let item of items$ | async">
          {{ item.name }} - ${{ item.price }}
        </li>
      </ul>
      <p>Total: ${{ total }}</p>
    </div>
  `
})
export class CartComponent {
  items$ = this.cartService.items$;
  total = 0;

  constructor(private cartService: CartService) {}

  ngOnInit() {
    this.items$.subscribe(() => {
      this.total = this.cartService.getTotal();
    });
  }

  addItem(item: any) {
    this.cartService.addItem(item);
  }
}
```

#### Output

Adding two items to the cart:

```output
<div>
  <h2>Cart (2 items)</h2>
  <ul>
    <li>Laptop - $999</li>
    <li>Mouse - $29</li>
  </ul>
  <p>Total: $1028</p>
</div>
```

Any component injecting `CartService` sees the same `BehaviorSubject`, because `providedIn: 'root'` makes it a singleton — that is what makes this work as shared state.

Two problems in that component, though, and both are worth seeing.

**There is no `length` pipe in Angular.** `{{ items$ | async | length }}` fails at runtime:

```output
NG0302: The pipe 'length' could not be found in the 'CartComponent' component.
```

Use `(items$ | async)?.length` instead.

**The `async` pipe is used twice**, once for the count and once for the `*ngFor`. Each `async` pipe creates its **own subscription**, so a plain HTTP-backed observable would fire two requests. `BehaviorSubject` survives this because it is multicast, but the habit does not generalise — bind once with `*ngIf="items$ | async as items"` and reuse `items`.

The manual `subscribe` in `ngOnInit` is also never unsubscribed. For a root-provided service that outlives the component, this leaks on every mount.

## Service Hierarchies

Services can be provided at different levels:

```typescript
// App-wide singleton
@Injectable({ providedIn: 'root' })
export class AppService { }

// Module-wide
@NgModule({
  providers: [ModuleService]
})
export class MyModule { }

// Component-specific
@Component({
  providers: [ComponentService]
})
export class MyComponent { }
```

## Common Service Patterns

### Logger Service
```typescript
@Injectable({ providedIn: 'root' })
export class LoggerService {
  log(message: string) {
    console.log(`[LOG] ${new Date().toISOString()}: ${message}`);
  }

  error(message: string) {
    console.error(`[ERROR] ${new Date().toISOString()}: ${message}`);
  }
}
```

### Authentication Service
```typescript
@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentUser = new BehaviorSubject<any>(null);
  public currentUser$ = this.currentUser.asObservable();

  login(username: string, password: string): Observable<any> {
    return this.http.post('/api/login', { username, password })
      .pipe(
        tap(response => {
          this.currentUser.next(response.user);
          localStorage.setItem('token', response.token);
        })
      );
  }

  logout() {
    this.currentUser.next(null);
    localStorage.removeItem('token');
  }

  isLoggedIn(): boolean {
    return this.currentUser.getValue() !== null;
  }
}
```

## Best Practices

1. **Single Responsibility** - Service should do one thing
2. **Use Dependency Injection** - Inject dependencies in constructor
3. **Use Observables** - For async operations
4. **Unsubscribe** - In ngOnDestroy to prevent memory leaks
5. **Use async pipe** - In templates with Observables
6. **Error Handling** - Handle errors in HTTP calls

## Next Steps

Learn about:
- RxJS operators (map, filter, switchMap)
- Error handling and retry logic
- Authentication and guards
- Interceptors for HTTP requests
