# Angular: Interview Questions and Answers

Common Angular interview questions covering components, dependency injection, forms, routing, and RxJS.

## Components

### Q: What is a component, and what are its key parts?
A component is a TypeScript class decorated with `@Component` that controls a piece of the UI. Its key parts are the **template** (HTML view), the **class** (logic and state), **styles** (CSS), and the **decorator metadata** (selector, template/styleUrls, etc.).

### Q: What's the difference between `@Input()` and `@Output()`?
`@Input()` lets a parent component pass data **down** into a child component's property. `@Output()` (paired with an `EventEmitter`) lets a child component emit events **up** to notify its parent, typically in response to a user action.

```typescript
// Child
@Input() product;
@Output() addedToCart = new EventEmitter<string>();

// Parent template
<app-product [product]="item" (addedToCart)="onAdd($event)"></app-product>
```

```output
parent passes  item = { name: 'Laptop' }
child renders  <app-product>Laptop</app-product>

user clicks "Add"
  child:  this.addedToCart.emit('Laptop')
  parent: onAdd('Laptop')   ← $event is the emitted value
```

`$event` is whatever the `EventEmitter` emitted — it is **not** a DOM event here. With `EventEmitter<string>` it is a string; the name is reused from native event bindings, which is a common source of confusion.

### Q: What is the component lifecycle, and which hooks are most commonly used?
Angular calls a sequence of lifecycle hooks as a component is created, updated, and destroyed. The most common:
- `ngOnInit()` - runs once after the component's inputs are set; ideal for initialization logic (like fetching data).
- `ngOnChanges()` - runs whenever an `@Input()` value changes.
- `ngOnDestroy()` - runs just before the component is removed; used to unsubscribe from observables and clean up resources.
- `ngAfterViewInit()` - runs after the component's view (and child views) have been fully initialized.

### Q: What's the difference between structural directives `*ngIf`/`*ngFor` and the newer `@if`/`@for` control flow syntax?
`*ngIf` and `*ngFor` are structural directives using Angular's template microsyntax, requiring the `CommonModule` to be imported. The newer built-in control flow (`@if`, `@for`, `@switch`, introduced in Angular 17) is compiled directly by the Angular compiler, doesn't require importing `CommonModule`, and offers better type-checking and performance (e.g., built-in tracking for `@for` instead of a separate `trackBy` function).

```typescript
// Structural directive
<div *ngIf="isVisible">Shown</div>
<li *ngFor="let item of items; trackBy: trackById">{{ item.name }}</li>

// New control flow
@if (isVisible) {
  <div>Shown</div>
}
@for (item of items; track item.id) {
  <li>{{ item.name }}</li>
}
```

## Dependency Injection & Services

### Q: What is dependency injection in Angular, and why use it?
Dependency injection is a design pattern where a class receives its dependencies (like services) from an external injector rather than creating them itself. Angular's built-in DI container manages object creation and lifecycle, which makes components easier to test (dependencies can be mocked) and promotes loose coupling.

### Q: What does `providedIn: 'root'` mean?
It registers a service as a singleton available application-wide, injected by Angular's root injector. This is the recommended way to provide most services - it also enables tree-shaking, so the service is excluded from the final bundle if it's never actually injected anywhere.

### Q: What's the difference between a service provided at the root level vs. at the component level?
A root-provided service (`providedIn: 'root'`) is a single shared instance across the entire app. A service listed in a component's `providers` array gets a **new instance** for that component (and its children), useful when you want isolated state per component instance (e.g., a wizard component that shouldn't share state with another).

### Q: What is a singleton service, and how does Angular ensure it stays a singleton?
A singleton service has exactly one instance shared across all consumers. Angular ensures this by resolving a service through the injector hierarchy - if it's already been created for a given injector, that same instance is returned to every subsequent request from the same injector.

## Data Binding

### Q: What are the four types of data binding in Angular?
1. **Interpolation** - `{{ value }}`, displays a component property in the template.
2. **Property binding** - `[property]="value"`, sets a DOM property from the component.
3. **Event binding** - `(event)="handler()"`, calls a component method in response to a DOM event.
4. **Two-way binding** - `[(ngModel)]="value"`, combines property and event binding so changes flow both directions.

### Q: How does two-way binding with `[(ngModel)]` actually work under the hood?
`[(ngModel)]="value"` is syntactic sugar (banana-in-a-box syntax) for `[ngModel]="value" (ngModelChange)="value = $event"` - it combines a property binding (to set the input's value) with an event binding (to update the component property when the input changes).

## Forms

### Q: What's the difference between template-driven and reactive forms?
**Template-driven forms** define form structure and validation mostly in the HTML template, using directives like `ngModel` - simpler for basic forms. **Reactive forms** define the form model (using `FormGroup`/`FormControl`) explicitly in the component class - more scalable, easier to unit test, and better suited for dynamic or complex forms.

### Q: How do you add custom validation to a reactive form?
Write a validator function matching the `ValidatorFn` signature, returning `null` if valid or a validation errors object if invalid, then attach it to a `FormControl`.

```typescript
function forbiddenNameValidator(control: AbstractControl): ValidationErrors | null {
  return control.value === 'admin' ? { forbiddenName: true } : null;
}

username = new FormControl('', [Validators.required, forbiddenNameValidator]);
```

```output
value ""       → { required: true }
value "admin"  → { forbiddenName: true }
value "ada"    → null
```

Note `"admin"` reports **only** `forbiddenName` — `Validators.required` passes, since the field is not empty. And the validator returns `null` for valid, which reads backwards until you remember it returns the *errors*, not a verdict.

### Q: How do you check if a form field is invalid and has been touched, to show an error message?
```output
fresh form, empty     → invalid=true,  touched=false → message hidden
user focuses and tabs → invalid=true,  touched=true  → message shown
user types "a@b.com"  → invalid=false, touched=true  → message hidden
```

The `touched` half is what stops every error appearing the moment the form loads. The trade-off is that clicking Submit on an untouched form shows nothing — call `form.markAllAsTouched()` in the submit handler to reveal them all at once.

```html
<input formControlName="email" />
<div *ngIf="form.get('email')?.invalid && form.get('email')?.touched">
  Please enter a valid email.
</div>
```

## Routing

### Q: What is the purpose of `<router-outlet>`?
It's a placeholder directive that marks where Angular Router renders the component matching the currently active route - similar to a "slot" that swaps content as the URL changes.

### Q: How do you protect a route so only authenticated users can access it?
Use a route guard, typically a `CanActivate` function-based guard (modern Angular) or class implementing `CanActivate`, which returns `true`/`false` (or a `UrlTree` to redirect) to decide whether navigation proceeds.

```typescript
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() ? true : router.parseUrl('/login');
};

// In routes:
{ path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] }
```

### Q: What's the difference between a route parameter and a query parameter?
A **route parameter** (`/products/:id`) is part of the URL path itself, typically used to identify a specific resource. A **query parameter** (`/products?sort=price`) is appended after `?`, typically used for optional filters/settings that don't change which "page" is being viewed.

## RxJS & HTTP

### Q: Why does `HttpClient` return an Observable instead of a Promise?
Observables are lazy (the HTTP request doesn't fire until you `subscribe()`), cancellable (unsubscribing aborts the request), and composable with RxJS operators (`retry`, `map`, `switchMap`, `debounceTime`) - capabilities a Promise doesn't offer natively.

### Q: Why is it important to unsubscribe from observables, and how do you do it cleanly?
Failing to unsubscribe from a long-lived observable (like an interval or a manually-created subject) can cause memory leaks, since the subscription keeps a reference alive even after the component is destroyed. Common cleanup approaches: store subscriptions and call `.unsubscribe()` in `ngOnDestroy()`, or use the `async` pipe in templates (which auto-unsubscribes when the component is destroyed).

```typescript
private destroy$ = new Subject<void>();

ngOnInit() {
  this.dataService.data$
    .pipe(takeUntil(this.destroy$))
    .subscribe(data => this.data = data);
}

ngOnDestroy() {
  this.destroy$.next();
  this.destroy$.complete();
}
```

### Q: What's the difference between `switchMap`, `mergeMap`, and `concatMap`?
All three flatten an observable-of-observables, but differ in how they handle overlapping emissions:
- `switchMap` - cancels the previous inner observable when a new value arrives (ideal for typeahead search, where only the latest request matters).
- `mergeMap` - runs all inner observables concurrently, merging their results as they arrive (order not guaranteed).
- `concatMap` - queues inner observables and runs them strictly one after another, preserving order.

### Q: What is `BehaviorSubject`, and how is it different from a regular `Subject`?
A `Subject` only emits values to subscribers that are already subscribed when the value is emitted. A `BehaviorSubject` requires an initial value and always emits its **current** value immediately to any new subscriber - useful for representing state that has a "current value" at all times (like the logged-in user or a theme setting).

## Change Detection & Performance

### Q: What is Angular's change detection, and how does `OnPush` improve performance?
Change detection is how Angular checks whether a component's bound values have changed and updates the DOM accordingly. By default, Angular checks every component on every change detection cycle (triggered by events, timers, HTTP responses, etc.). `ChangeDetectionStrategy.OnPush` tells Angular to skip checking a component unless one of its `@Input()` references changes, an event originates from within it, or an observable it's watching (via the `async` pipe) emits - significantly reducing unnecessary checks in large component trees.

### Q: What are standalone components, and how do they change Angular app structure?
Standalone components (default since Angular 17+) don't need to be declared in an `NgModule` - they declare their own dependencies directly via an `imports` array in the `@Component` decorator. This simplifies the mental model (no more juggling `NgModule` declarations/exports/imports) and makes lazy loading individual components more straightforward.

```typescript
@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `...`,
})
export class ProductCardComponent {}
```
