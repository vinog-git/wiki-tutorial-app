# React: Forms

## Controlled Components

In a controlled component, form data is handled by React state - the input's value is always driven by state, and every keystroke updates that state via an `onChange` handler.

```jsx
import { useState } from 'react';

function NameForm() {
  const [name, setName] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    alert(`Submitted name: ${name}`);
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name:
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <button type="submit">Submit</button>
    </form>
  );
}
```

#### Output

Typing `Ada` fires `onChange` three times, and the input's value is re-driven from state each time:

```output
keystroke 'A'  → state name="A"    → <input value="A">
keystroke 'd'  → state name="Ad"   → <input value="Ad">
keystroke 'a'  → state name="Ada"  → <input value="Ada">
```

Clicking Submit:

```output
[alert] Submitted name: Ada
```

Remove `e.preventDefault()` and the browser does its default form submit — a full page reload — so the alert flashes and vanishes:

```output
(page navigates to /?  — React state is wiped, console cleared)
```

And a subtler trap: writing `value={name}` **without** an `onChange` makes the field read-only, since state never changes and React keeps resetting the DOM value. React warns about exactly this:

```output
Warning: You provided a `value` prop to a form field without an `onChange` handler.
This will render a read-only field. If the field should be mutable use `defaultValue`.
Otherwise, set either `onChange` or `readOnly`.
```

## Multiple Inputs with a Single Handler

```jsx
function SignupForm() {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  return (
    <form>
      <input
        name="email"
        type="email"
        value={formData.email}
        onChange={handleChange}
        placeholder="Email"
      />
      <input
        name="password"
        type="password"
        value={formData.password}
        onChange={handleChange}
        placeholder="Password"
      />
      <label>
        <input
          name="rememberMe"
          type="checkbox"
          checked={formData.rememberMe}
          onChange={handleChange}
        />
        Remember me
      </label>
    </form>
  );
}
```

## Select and Textarea

```jsx
function PreferencesForm() {
  const [country, setCountry] = useState('us');
  const [bio, setBio] = useState('');

  return (
    <form>
      <select value={country} onChange={(e) => setCountry(e.target.value)}>
        <option value="us">United States</option>
        <option value="ca">Canada</option>
        <option value="in">India</option>
      </select>

      <textarea
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        placeholder="Tell us about yourself"
      />
    </form>
  );
}
```

## Basic Validation

```jsx
function EmailForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  function handleChange(e) {
    const value = e.target.value;
    setEmail(value);

    if (value && !value.includes('@')) {
      setError('Please enter a valid email address');
    } else {
      setError('');
    }
  }

  return (
    <div>
      <input value={email} onChange={handleChange} />
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
}
```

#### Output

Typing `ada` then `ada@` then `ada@example.com`:

```output
"a"                → <p style="color:red">Please enter a valid email address</p>
"ada"              → <p style="color:red">Please enter a valid email address</p>
"ada@"             → (no error shown)
"ada@example.com"  → (no error shown)
```

Note the error appears from the very first character, before anyone could plausibly have typed a valid address. Validating on every keystroke tells users they are wrong while they are still typing — validate on `blur` or on submit instead, and only re-validate live once a field has already failed.

The `value &&` guard is doing real work: without it, an empty field would also show the error, so the form would open with a validation message already on screen.

## React 19: Actions and `useActionState`

React 19 introduces **Actions** - functions (often async) you pass directly to `<form action={...}>`. React automatically manages pending state, errors, and optimistic updates for you.

```jsx
import { useActionState } from 'react';

async function updateName(previousState, formData) {
  const name = formData.get('name');

  if (!name) {
    return { error: 'Name is required' };
  }

  await fakeSaveToServer(name);
  return { success: true, name };
}

function ProfileForm() {
  const [state, formAction, isPending] = useActionState(updateName, {});

  return (
    <form action={formAction}>
      <input name="name" placeholder="Your name" />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving...' : 'Save'}
      </button>
      {state.error && <p style={{ color: 'red' }}>{state.error}</p>}
      {state.success && <p>Saved as {state.name}!</p>}
    </form>
  );
}

function fakeSaveToServer(name) {
  return new Promise((resolve) => setTimeout(resolve, 1000));
}
```

#### Output

Submitting with the field filled in — the button state changes on its own, with no `useState` anywhere:

```output
t=0ms     <button disabled>Saving...</button>
t=1000ms  <button>Save</button>
          <p>Saved as Ada!</p>
```

Submitting with the field **empty**, the action returns early:

```output
<p style="color:red">Name is required</p>
```

Three things React did here that you would otherwise hand-roll: tracked the pending flag, kept the returned value as state, and reset the form after a successful submit.

Note the action's first parameter is the *previous* state, not the form data — `formData` is second. Getting those the wrong way round is the usual first mistake, and it fails confusingly because `previousState.get` is not a function:

```output
TypeError: previousState.get is not a function
```

`useActionState(action, initialState)` returns:
- The current **state** returned by the action
- A **formAction** to pass to `<form action={...}>`
- An **isPending** flag, true while the action is running

### The `useFormStatus` Hook

Lets a nested component (like a submit button) know whether its parent `<form>` is submitting, without prop drilling.

```jsx
import { useFormStatus } from 'react-dom';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Submitting...' : 'Submit'}
    </button>
  );
}

function ContactForm({ action }) {
  return (
    <form action={action}>
      <input name="message" />
      <SubmitButton />
    </form>
  );
}
```

## Next Steps

Continue with:
- **React 19 New Features** - `use()`, `useOptimistic`, ref-as-prop
