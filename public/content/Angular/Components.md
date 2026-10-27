# Angular: Components

## What are Components?

Components are the fundamental building blocks of Angular applications. A component is a TypeScript class decorated with `@Component` that controls a template (HTML), styles (CSS), and application logic.

## Component Structure

Every Angular component consists of:

1. **Template** - HTML that defines the view
2. **Component Class** - TypeScript class with logic
3. **Styles** - CSS for styling the component
4. **Metadata** - Decorator configuration

## Creating a Component

### Basic Component

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-greeting',
  template: `<h1>Hello {{ name }}</h1>`,
  styles: [`h1 { color: blue; }`]
})
export class GreetingComponent {
  name = 'World';
}
```

### Component with External Files

```typescript
import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  title = 'My Dashboard';
  data = [];
}
```

## Component Properties

### @Input - Parent to Child

Pass data from parent component to child component.

```typescript
// Child component
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-product-card',
  template: `
    <div>
      <h3>{{ product.name }}</h3>
      <p>${{ product.price }}</p>
    </div>
  `
})
export class ProductCardComponent {
  @Input() product = { name: 'Widget', price: 19.99 };
}

// Parent component
@Component({
  selector: 'app-store',
  template: `
    <app-product-card [product]="item"></app-product-card>
  `
})
export class StoreComponent {
  item = { name: 'Gadget', price: 49.99 };
}
```

### @Output - Child to Parent

Emit events from child component to parent component.

```typescript
// Child component
import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-button',
  template: `<button (click)="onClick()">Click me</button>`
})
export class ButtonComponent {
  @Output() clicked = new EventEmitter<string>();

  onClick() {
    this.clicked.emit('Button was clicked');
  }
}

// Parent component
@Component({
  selector: 'app-app',
  template: `
    <app-button (clicked)="onButtonClicked($event)"></app-button>
    <p>{{ message }}</p>
  `
})
export class AppComponent {
  message = '';

  onButtonClicked(msg: string) {
    this.message = msg;
  }
}
```

## Component Lifecycle

Angular components have a lifecycle with hooks you can use:

```typescript
import { 
  Component, 
  OnInit, 
  OnDestroy,
  OnChanges,
  AfterViewInit 
} from '@angular/core';

@Component({
  selector: 'app-lifecycle',
  template: `<p>{{ data }}</p>`
})
export class LifecycleComponent implements OnInit, OnDestroy {
  data = 'Loading...';

  // Called after component is initialized
  ngOnInit() {
    console.log('Component initialized');
    this.data = 'Loaded';
  }

  // Called when component is about to be destroyed
  ngOnDestroy() {
    console.log('Component destroyed');
  }

  // Called when input properties change
  ngOnChanges(changes) {
    console.log('Inputs changed', changes);
  }

  // Called after view is initialized
  ngAfterViewInit() {
    console.log('View initialized');
  }
}
```

## Data Binding

### Interpolation

```html
<p>{{ variableName }}</p>
<p>{{ 5 + 3 }}</p>
<p>{{ functionName() }}</p>
```

#### Input

```typescript
variableName = 'Angular';
functionName() { return 'from a method'; }
```

#### Output

```output
<p>Angular</p>
<p>8</p>
<p>from a method</p>
```

Interpolation evaluates the expression and inserts the **result as text**. It does not insert HTML: if `variableName` were `'<b>bold</b>'` the page would literally show `<b>bold</b>`, which is Angular's built-in XSS protection.

Calling a function in a template works but runs on **every change detection cycle** — often many times per second. Prefer a property, or a pure pipe, for anything non-trivial.

### Property Binding

```html
<!-- Bind component property to HTML element -->
<img [src]="imageUrl" />
<button [disabled]="isDisabled">Click</button>
<div [style.color]="textColor">Text</div>
```

#### Output

With `imageUrl = '/logo.png'`, `isDisabled = true`, `textColor = 'crimson'`:

```output
<img src="/logo.png">
<button disabled>Click</button>
<div style="color: crimson">Text</div>
```

The square brackets matter. `[disabled]="isDisabled"` evaluates the expression, so `false` removes the attribute entirely. Written without brackets, `disabled="isDisabled"` passes the literal **string** `"isDisabled"`, which is truthy — the button is permanently disabled:

```output
<button disabled>Click</button>     <!-- even when isDisabled is false -->
```

### Event Binding

```html
<!-- Bind HTML event to component method -->
<button (click)="onClick()">Click me</button>
<input (change)="onInputChange($event)" />
<form (submit)="onSubmit()">Submit</form>
```

### Two-Way Binding

```html
<!-- Bind both property and event -->
<input [(ngModel)]="userName" />
<!-- Changes to input update component property -->
<!-- Changes to component property update input -->
```

#### Output

Typing `Ada` into the two-way bound input:

```output
keystroke 'A'  → userName === 'A'
keystroke 'd'  → userName === 'Ad'
keystroke 'a'  → userName === 'Ada'
```

And setting `userName = 'Grace'` in the component pushes the new value back into the input without any event handler.

`[(ngModel)]` is just the two syntaxes combined — the "banana in a box" is literally `[ngModel]` plus `(ngModelChange)`:

```html
<input [ngModel]="userName" (ngModelChange)="userName = $event" />
```

Using it without importing `FormsModule` is the standard first error:

```output
NG8002: Can't bind to 'ngModel' since it isn't a known property of 'input'.
```

## Structural Directives

### *ngIf

```html
<div *ngIf="isVisible">This is visible</div>
<div *ngIf="user; else noUser">Hello {{ user.name }}</div>
<ng-template #noUser>
  <div>No user logged in</div>
</ng-template>
```

### *ngFor

```html
<ul>
  <li *ngFor="let item of items">{{ item }}</li>
</ul>

<div *ngFor="let item of items; let i = index">
  {{ i }}: {{ item }}
</div>
```

#### Output

With `isVisible = true` and `user = { name: 'Ada' }`:

```output
<div>This is visible</div>
<div>Hello Ada</div>
```

With `isVisible = false` and `user = null`:

```output
<div>No user logged in</div>
```

Note the first `<div>` is **not** hidden with CSS — it is absent from the DOM entirely. That is the difference between `*ngIf` and `[hidden]`: `*ngIf` destroys the component and its state, `[hidden]` only stops it being painted.

For `*ngFor` with `items = ['apple', 'banana', 'cherry']`:

```output
<ul>
  <li>apple</li>
  <li>banana</li>
  <li>cherry</li>
</ul>

<div>0: apple</div>
<div>1: banana</div>
<div>2: cherry</div>
```

`let i = index` is zero-based. For lists that change, add `trackBy` — without it Angular destroys and rebuilds every DOM node when the array reference changes, losing focus and input state along the way.

## Component Communication

### Using Services

```typescript
// Service
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class DataService {
  private data = new BehaviorSubject<string>('Initial');
  public data$ = this.data.asObservable();

  updateData(newData: string) {
    this.data.next(newData);
  }
}

// Component 1 - Provider
@Component({
  selector: 'app-provider',
  template: `<button (click)="sendData()">Send</button>`
})
export class ProviderComponent {
  constructor(private dataService: DataService) {}

  sendData() {
    this.dataService.updateData('New Data');
  }
}

// Component 2 - Consumer
@Component({
  selector: 'app-consumer',
  template: `<p>{{ data$ | async }}</p>`
})
export class ConsumerComponent {
  data$ = this.dataService.data$;

  constructor(private dataService: DataService) {}
}
```

## Best Practices

1. **Single Responsibility** - Each component should do one thing
2. **Use @Input and @Output** - For parent-child communication
3. **Use Services** - For sharing data between unrelated components
4. **Unsubscribe** - Remember to unsubscribe from observables
5. **Use OnPush Detection** - For better performance
6. **Keep Templates Simple** - Move complex logic to component class

## Next Steps

Learn about:
- Services and dependency injection
- Routing and navigation
- HTTP client for API calls
- Forms (template-driven and reactive)
- RxJS and Observables
