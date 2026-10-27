# React: Core Concepts

React is a JavaScript library for building user interfaces out of small, reusable pieces called **components**. This tutorial series uses **React 19**, the latest stable version.

## Why React?

- **Declarative** - You describe *what* the UI should look like for a given state, and React figures out *how* to update the DOM.
- **Component-based** - UIs are built from small, composable pieces that manage their own logic and markup.
- **Learn once, write anywhere** - The same component model powers web apps (React DOM), native apps (React Native), and more.

## Setting Up a New Project

The React team now recommends starting new projects with a framework like **Vite** (for client-only apps) or a full-stack framework such as **Next.js** or **React Router (Framework mode)**.

### Quick start with Vite

```bash
npm create vite@latest my-app -- --template react
cd my-app
npm install
npm run dev
```

This scaffolds a React 19 + Vite project and starts a dev server, usually at `http://localhost:5173`.

### Checking your React version

```bash
npm ls react
```

```json
// package.json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

## JSX: HTML-like Syntax in JavaScript

JSX lets you write markup directly inside JavaScript. It compiles down to `React.createElement` calls.

```jsx
function Greeting() {
  return <h1>Hello, world!</h1>;
}
```

is equivalent to:

```js
function Greeting() {
  return React.createElement('h1', null, 'Hello, world!');
}
```

### JSX Rules

1. **One root element** - Wrap multiple elements in a fragment `<>...</>` or a single parent tag.
2. **Close every tag** - `<img />`, `<br />`, `<input />` must be self-closed.
3. **camelCase attributes** - `className` instead of `class`, `onClick` instead of `onclick`.
4. **JavaScript in curly braces** - Embed expressions with `{ }`.

```jsx
function UserCard({ name, age }) {
  const isAdult = age >= 18;

  return (
    <>
      <h2 className="user-name">{name}</h2>
      <p>{isAdult ? 'Adult' : 'Minor'}</p>
    </>
  );
}
```

## Your First Component

A React component is just a JavaScript function that returns JSX.

```jsx
function App() {
  return (
    <div>
      <h1>Welcome to React</h1>
      <p>This is my first component.</p>
    </div>
  );
}

export default App;
```

#### Output

A React component's "output" is DOM. This one renders:

```output
<div>
  <h1>Welcome to React</h1>
  <p>This is my first component.</p>
</div>
```

Which the browser paints as:

```output
Welcome to React
This is my first component.
```

Note there is no `<App>` element in the result — component names exist only in your code and in React DevTools, never in the DOM.

Rendering it to the page (React 19, using the `react-dom/client` API):

```jsx
// main.jsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

const root = createRoot(document.getElementById('root'));
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

#### Output

After `root.render(...)`, the `<div id="root">` in your HTML contains the component's markup:

```output
<div id="root">
  <div>
    <h1>Welcome to React</h1>
    <p>This is my first component.</p>
  </div>
</div>
```

One thing `StrictMode` does in development is **render every component twice** to surface accidental side effects. So a `console.log` inside a component prints twice:

```output
App rendered
App rendered
```

This is development-only — production builds render once. Chasing this "bug" is a rite of passage; the duplicate log is the tool working as intended, telling you your render is not pure if the two runs differ.

## The Virtual DOM (Briefly)

React keeps an in-memory representation of the UI (the "virtual DOM"). When state changes:

1. React re-runs the component function to get a new virtual DOM tree.
2. It **diffs** the new tree against the previous one.
3. It applies only the minimal set of changes to the real DOM.

This is why you never manually call `document.getElementById` or `element.innerHTML` in idiomatic React code - you just describe the desired output, and React handles the DOM updates.

## Composing Components

Real apps are trees of components:

```jsx
function App() {
  return (
    <div className="app">
      <Header />
      <MainContent />
      <Footer />
    </div>
  );
}

function Header() {
  return <header><h1>My App</h1></header>;
}

function MainContent() {
  return <main><p>Main content goes here.</p></main>;
}

function Footer() {
  return <footer><small>&copy; 2026</small></footer>;
}
```

#### Output

The four components flatten into one DOM tree:

```output
<div class="app">
  <header>
    <h1>My App</h1>
  </header>
  <main>
    <p>Main content goes here.</p>
  </main>
  <footer>
    <small>© 2026</small>
  </footer>
</div>
```

Two details visible here:

- `className="app"` became `class="app"`. JSX uses `className` because `class` is a reserved word in JavaScript; React translates it on the way out.
- `&copy;` was decoded to the actual `©` character, not left as an entity.

`<Header />`, `<MainContent />` and `<Footer />` have vanished — each was replaced by whatever it returned. Composition is purely a source-code concept.

## Next Steps

Continue with:
- **Components and Props** - passing data between components
- **State and Events** - making components interactive
- **Hooks Deep Dive** - useEffect, useRef, useMemo, and more
- **Forms** - controlled inputs and React 19 Actions
- **React 19 New Features** - `use()`, `useOptimistic`, and more
