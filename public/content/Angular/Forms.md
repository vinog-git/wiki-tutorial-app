# Angular: Forms

## Two Approaches

Angular offers two strategies for building forms:

| Feature | Template-Driven | Reactive |
|---------|----------------|---------|
| Form model lives in | HTML template | Component class |
| Setup complexity | Low | Moderate |
| Validation | HTML attributes + directives | Validators in TypeScript |
| Dynamic fields | Hard | Easy (FormArray) |
| Unit testability | Difficult | Easy |
| Best for | Simple login/contact forms | Complex, dynamic forms |

---

## Template-Driven Forms

### Setup

```typescript
// app.module.ts (module-based)
import { FormsModule } from '@angular/forms';
@NgModule({ imports: [FormsModule] })
export class AppModule {}

// OR standalone component
import { FormsModule } from '@angular/forms';
@Component({ imports: [FormsModule], ... })
```

### Basic Form

```typescript
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <form #loginForm="ngForm" (ngSubmit)="onSubmit(loginForm)">

      <div>
        <label for="email">Email</label>
        <input
          id="email"
          type="email"
          name="email"
          [(ngModel)]="model.email"
          required
          email
          #emailField="ngModel"
        />
        <span *ngIf="emailField.invalid && emailField.touched">
          Valid email is required
        </span>
      </div>

      <div>
        <label for="password">Password</label>
        <input
          id="password"
          type="password"
          name="password"
          [(ngModel)]="model.password"
          required
          minlength="8"
          #passwordField="ngModel"
        />
        <span *ngIf="passwordField.errors?.['required'] && passwordField.touched">
          Password is required
        </span>
        <span *ngIf="passwordField.errors?.['minlength'] && passwordField.touched">
          Password must be at least 8 characters
        </span>
      </div>

      <button type="submit" [disabled]="loginForm.invalid">Login</button>
    </form>
  `
})
export class LoginComponent {
  model = { email: '', password: '' };

  onSubmit(form: any) {
    if (form.valid) {
      console.log('Submitted:', this.model);
    }
  }
}
```

---

## Reactive Forms

### Setup

```typescript
import { ReactiveFormsModule } from '@angular/forms';
@Component({ imports: [ReactiveFormsModule], ... })
```

### FormGroup and FormControl

```typescript
import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, ReactiveFormsModule } from '@angular/forms';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">

      <div>
        <input formControlName="email" placeholder="Email" />
        <div *ngIf="form.get('email')?.invalid && form.get('email')?.touched">
          <span *ngIf="form.get('email')?.errors?.['required']">Email is required</span>
          <span *ngIf="form.get('email')?.errors?.['email']">Invalid email format</span>
        </div>
      </div>

      <div>
        <input formControlName="password" type="password" placeholder="Password" />
        <div *ngIf="form.get('password')?.invalid && form.get('password')?.touched">
          <span *ngIf="form.get('password')?.errors?.['minlength']">
            Min {{ form.get('password')?.errors?.['minlength'].requiredLength }} characters
          </span>
        </div>
      </div>

      <button type="submit" [disabled]="form.invalid">Submit</button>
    </form>
  `
})
export class RegisterComponent implements OnInit {
  form!: FormGroup;

  ngOnInit() {
    this.form = new FormGroup({
      email:    new FormControl('', [Validators.required, Validators.email]),
      password: new FormControl('', [Validators.required, Validators.minLength(8)]),
    });
  }

  onSubmit() {
    if (this.form.valid) {
      console.log(this.form.value);
    }
  }
}
```

### FormBuilder (shorthand)

```typescript
import { FormBuilder, Validators } from '@angular/forms';

constructor(private fb: FormBuilder) {}

ngOnInit() {
  this.form = this.fb.group({
    firstName: ['',    [Validators.required, Validators.minLength(2)]],
    lastName:  ['',    Validators.required],
    email:     ['',    [Validators.required, Validators.email]],
    age:       [null,  [Validators.min(18), Validators.max(120)]],
    bio:       [''],
  });
}
```

---

## Built-in Validators

```typescript
import { Validators } from '@angular/forms';

// Usage in FormControl:
new FormControl('', [
  Validators.required,                   // must not be empty
  Validators.minLength(3),               // at least 3 chars
  Validators.maxLength(50),              // at most 50 chars
  Validators.email,                      // valid email format
  Validators.pattern(/^[a-zA-Z0-9]+$/), // alphanumeric only
  Validators.min(0),                     // numeric minimum
  Validators.max(100),                   // numeric maximum
]);
```

#### Output

A control's `errors` object is `null` when valid, or a map of failed validators. For a control with `[Validators.required, Validators.minLength(3), Validators.email]`:

```output
value ""        → { required: true }
value "ab"      → { minlength: { requiredLength: 3, actualLength: 2 }, email: true }
value "abc"     → { email: true }
value "a@b.com" → null
```

Two things to note. The key is lower-case `minlength`, not `minLength` — a mismatch there means your `*ngIf="hasError('name','minLength')"` silently never fires. And each validator reports independently, so a control can fail several at once.

`Validators.required` on an empty string gives `{ required: true }`, but on a whitespace-only string it **passes** — use `Validators.pattern(/\\S/)` if that matters.

---

## Custom Validators

### Synchronous validator

```typescript
// validators/password-strength.validator.ts
import { AbstractControl, ValidationErrors } from '@angular/forms';

export function strongPasswordValidator(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  const hasUpperCase = /[A-Z]/.test(value);
  const hasNumber    = /[0-9]/.test(value);
  const hasSpecial   = /[!@#$%^&*]/.test(value);

  if (hasUpperCase && hasNumber && hasSpecial) {
    return null;  // valid
  }
  return {
    strongPassword: {
      hasUpperCase,
      hasNumber,
      hasSpecial,
    }
  };
}
```

```typescript
// Usage
password: ['', [Validators.required, strongPasswordValidator]]
```

#### Output

Running the validator against progressively stronger passwords:

```output
""            → { strongPassword: { hasUpperCase: false, hasNumber: false, hasSpecial: false } }
"password"    → { strongPassword: { hasUpperCase: false, hasNumber: false, hasSpecial: false } }
"Password"    → { strongPassword: { hasUpperCase: true,  hasNumber: false, hasSpecial: false } }
"Password1"   → { strongPassword: { hasUpperCase: true,  hasNumber: true,  hasSpecial: false } }
"Password1!"  → null
```

Returning `null` for valid is the part that catches people out — it reads backwards, but a validator returns the *errors*, and no errors means no object.

Returning the three booleans rather than a bare `true` is what lets the template tell the user precisely what is missing, instead of a generic "password is too weak".

### Cross-field validator (passwords must match)

```typescript
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function passwordMatchValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const password = group.get('password')?.value;
    const confirm  = group.get('confirmPassword')?.value;
    return password === confirm ? null : { passwordMismatch: true };
  };
}
```

```typescript
this.form = this.fb.group({
  password:        ['', [Validators.required, Validators.minLength(8)]],
  confirmPassword: ['', Validators.required],
}, { validators: passwordMatchValidator() });
```

```html
<span *ngIf="form.errors?.['passwordMismatch']">Passwords do not match</span>
```

### Async validator (check username availability)

```typescript
import { AbstractControl, AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { map, catchError, debounceTime, switchMap } from 'rxjs/operators';

export function usernameAvailableValidator(userService: UserService): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    return of(control.value).pipe(
      debounceTime(400),
      switchMap(value => userService.checkUsername(value)),
      map(isTaken => isTaken ? { usernameTaken: true } : null),
      catchError(() => of(null))
    );
  };
}
```

```typescript
username: ['', Validators.required, usernameAvailableValidator(this.userService)]
```

---

## Form Arrays (Dynamic Fields)

```typescript
import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule],
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <div formArrayName="emails">
        <div *ngFor="let email of emails.controls; let i = index">
          <input [formControlName]="i" placeholder="Email {{ i + 1 }}" />
          <button type="button" (click)="removeEmail(i)">Remove</button>
        </div>
      </div>
      <button type="button" (click)="addEmail()">Add Email</button>
      <button type="submit">Submit</button>
    </form>
  `
})
export class DynamicFormComponent implements OnInit {
  form!: FormGroup;

  constructor(private fb: FormBuilder) {}

  ngOnInit() {
    this.form = this.fb.group({
      name:   ['', Validators.required],
      emails: this.fb.array([
        this.fb.control('', [Validators.required, Validators.email])
      ])
    });
  }

  get emails(): FormArray {
    return this.form.get('emails') as FormArray;
  }

  addEmail() {
    this.emails.push(this.fb.control('', [Validators.required, Validators.email]));
  }

  removeEmail(index: number) {
    this.emails.removeAt(index);
  }

  onSubmit() {
    console.log(this.form.value);
  }
}
```

---

## Patching Values

```typescript
// patchValue — update only specified fields, leave others unchanged
this.form.patchValue({
  email: 'user@example.com',
  // password left unchanged
});

// setValue — must provide ALL fields
this.form.setValue({
  email:    'user@example.com',
  password: '',
  age:      30,
});

// Reset form (clears values and marks pristine/untouched)
this.form.reset();

// Reset with specific values
this.form.reset({ email: '', password: '' });
```

---

## Error Display Pattern

A clean reusable helper:

```typescript
// component
hasError(controlName: string, errorCode: string): boolean {
  const control = this.form.get(controlName);
  return !!(control?.errors?.[errorCode] && (control.dirty || control.touched));
}
```

```html
<input formControlName="email" />
<div class="errors">
  <span *ngIf="hasError('email', 'required')">Email is required</span>
  <span *ngIf="hasError('email', 'email')">Enter a valid email</span>
</div>
```

#### Output

`hasError` deliberately returns `false` until the user has interacted, so a fresh form is not covered in red:

```output
untouched, empty      → false   (no message shown)
after typing "a"      → true    (dirty, and 'email' error present)
after blur, still ""  → true    (touched, and 'required' error present)
after "a@b.com"       → false   (no errors)
```

That `(control.dirty || control.touched)` clause is doing the work. Drop it and every required field shows its error the instant the form renders.

---

## Form Submission and Reset

```typescript
onSubmit() {
  if (this.form.invalid) {
    // Touch all fields to show errors
    this.form.markAllAsTouched();
    return;
  }

  this.loading = true;
  this.apiService.save(this.form.value).subscribe({
    next: () => {
      this.successMessage = 'Saved!';
      this.form.reset();
    },
    error: (err) => {
      this.errorMessage = 'Save failed: ' + err.message;
    },
    complete: () => {
      this.loading = false;
    }
  });
}
```

#### Output

Submitting an invalid form:

```output
(nothing sent — markAllAsTouched() fires, every error message appears at once)
```

`markAllAsTouched()` matters because of the pattern above: the errors already exist on the controls, but the template is hiding them until `touched` is true. Without this call, clicking Submit on an empty form appears to do **nothing at all** — no request, no feedback.

A successful submit:

```output
loading = true
POST /api/save  →  200 OK
successMessage = "Saved!"
form.reset()    →  all controls back to null, pristine and untouched
loading = false
```

Note `form.reset()` sets every control to `null`, not to `''`. If a control had an initial value you want restored, pass it: `form.reset({ country: 'UK' })`.

One bug lurking in that `subscribe`: `complete` does not fire on error for most HTTP observables — it does here because `HttpClient` completes after emitting, but if you swap in an observable that errors, `loading` would stay `true` forever. `finalize()` from RxJS is the safer place for cleanup.

---

## Best Practices

1. **Prefer reactive forms** for anything beyond a simple login/contact form.
2. **Always validate on the server** — client-side validation is UX, not security.
3. **Use `markAllAsTouched()`** on submit to trigger all error messages at once.
4. **Extract validators** into separate files — keep components clean.
5. **Use async validators sparingly** — add `debounceTime` to avoid hammering the API.
6. **Disable the submit button** while the form is invalid or loading.
7. **Reset properly** — `form.reset()` clears values and marks the form pristine.
