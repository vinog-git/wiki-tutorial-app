# React 19: New Features

React 19 (stable release) brings several new APIs that simplify common patterns like data fetching, forms, and optimistic UI. This page assumes you're already comfortable with `useState` and `useEffect` (see [Hooks Deep Dive](/React/Hooks-Deep-Dive)).

## The `use()` API

`use()` lets you read the value of a Promise or Context directly during render - and unlike hooks, it **can** be called conditionally or in loops.

### Reading a Promise

```jsx
import { use, Suspense } from 'react';

function Comments({ commentsPromise }) {
  // `use` suspends until the promise resolves
  const comments = use(commentsPromise);
  return (
    <ul>
      {comments.map((c) => (
        <li key={c.id}>{c.text}</li>
      ))}
    </ul>
  );
}

function Post({ commentsPromise }) {
  return (
    <Suspense fallback={<p>Loading comments...</p>}>
      <Comments commentsPromise={commentsPromise} />
    </Suspense>
  );
}
```

### Reading Context Conditionally

```jsx
import { use } from 'react';

function Panel({ show }) {
  if (!show) return null;

  // Regular hooks can't be called after an early return - `use` can
  const theme = use(ThemeContext);
  return <div className={`panel-${theme}`}>Panel content</div>;
}
```

## `useOptimistic` - Optimistic UI Updates

Instantly show the expected result of an action while the real request is still in flight, then reconcile automatically.

```jsx
import { useOptimistic, useState, useRef } from 'react';

function ChatThread({ messages, sendMessage }) {
  const [optimisticMessages, addOptimisticMessage] = useOptimistic(
    messages,
    (state, newMessage) => [...state, { ...newMessage, sending: true }]
  );

  async function formAction(formData) {
    const text = formData.get('message');
    addOptimisticMessage({ id: Date.now(), text });
    await sendMessage(text); // actual network request
  }

  return (
    <div>
      {optimisticMessages.map((m) => (
        <p key={m.id} style={{ opacity: m.sending ? 0.5 : 1 }}>
          {m.text}
        </p>
      ))}
      <form action={formAction}>
        <input name="message" />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
```

The message appears immediately with reduced opacity; once `sendMessage` resolves and `messages` updates for real, React reconciles the optimistic entry away.

## Refs as Props (No More `forwardRef`)

In React 19, function components can accept `ref` as a regular prop - `forwardRef` is no longer necessary for the common case.

```jsx
// React 19
function TextInput({ label, ref }) {
  return (
    <label>
      {label}
      <input ref={ref} />
    </label>
  );
}

function App() {
  const inputRef = useRef(null);
  return <TextInput label="Name" ref={inputRef} />;
}
```

```jsx
// Old way (still works, but no longer required)
import { forwardRef } from 'react';

const TextInput = forwardRef(function TextInput({ label }, ref) {
  return (
    <label>
      {label}
      <input ref={ref} />
    </label>
  );
});
```

#### Output

Both versions render the same DOM:

```output
<label>Name<input></label>
```

and `inputRef.current` points at the real `<input>` node, so `inputRef.current.focus()` works.

The difference shows up when you forget. In React 18, passing `ref` to a plain function component silently did nothing and warned:

```output
Warning: Function components cannot be given refs.
Attempts to access this ref will fail. Did you mean to use React.forwardRef()?
```

`inputRef.current` stayed `null`. In React 19 the same code just works, because `ref` arrives as an ordinary prop.

## Document Metadata in Components

React 19 lets you render `<title>`, `<meta>`, and `<link>` tags directly inside any component - React hoists them into `<head>` automatically.

```jsx
function BlogPost({ post }) {
  return (
    <article>
      <title>{post.title} - My Blog</title>
      <meta name="description" content={post.summary} />
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </article>
  );
}
```

#### Output

The `<title>` and `<meta>` are written inside `<article>` but React **hoists them into `<head>`**:

```output
<head>
  <title>Hello World - My Blog</title>
  <meta name="description" content="A short summary">
</head>
<body>
  <article>
    <h1>Hello World</h1>
    <p>...</p>
  </article>
</body>
```

Note they are absent from the `<article>` in the body — they moved, rather than being duplicated. Render two components that each specify a `<title>` and the last one to render wins, which is worth knowing before relying on this in a deep tree.

No need for a separate library to manage `<head>` content in simple cases.

## Stylesheets and Async Scripts

React 19 can manage `<link rel="stylesheet">` and `<script async>` tags rendered anywhere in the tree, de-duplicating and ordering them correctly.

```jsx
function Component() {
  return (
    <>
      <link rel="stylesheet" href="/styles/component.css" precedence="default" />
      <script async src="https://example.com/widget.js" />
      <div className="component">Content</div>
    </>
  );
}
```

## Simpler Context Syntax

`<Context>` can now be used directly as a provider, instead of `<Context.Provider>`.

```jsx
const ThemeContext = createContext('light');

// React 19
<ThemeContext value="dark">
  <App />
</ThemeContext>

// Still works
<ThemeContext.Provider value="dark">
  <App />
</ThemeContext.Provider>
```

## Recap: Forms + Actions (from the Forms page)

- `<form action={asyncFunction}>` - pass an async function directly as a form action
- `useActionState` - track pending/result state for an action
- `useFormStatus` - let a nested component read the parent form's pending state

## Summary Table

| Feature | Purpose |
|---|---|
| `use()` | Read a Promise or Context during render, including conditionally |
| `useOptimistic` | Show an optimistic result before the real update completes |
| `ref` as prop | Pass refs to function components without `forwardRef` |
| `<title>`, `<meta>`, `<link>` | Manage document head from any component |
| `useActionState` | Manage state, pending, and errors for a form action |
| `useFormStatus` | Read pending status from a nested form component |

## Next Steps

Ideas for future topics:
- [Routing with React Router](/React/Routing)
- [Data fetching patterns and caching](/React/Data-Fetching)
- [Performance optimization](/React/Performance-Optimization) (`memo`, code splitting, `React.lazy`)
- [Testing components with React Testing Library](/React/Testing)
