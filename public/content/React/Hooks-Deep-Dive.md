# React: Hooks Deep Dive

Hooks let function components use state, side effects, and other React features without writing classes. Rules of hooks:

1. Only call hooks at the **top level** of a component (never inside loops, conditions, or nested functions).
2. Only call hooks from **React function components** or **custom hooks**.

## useEffect - Side Effects

`useEffect` runs code after render, for things like data fetching, subscriptions, or manually touching the DOM.

```jsx
import { useState, useEffect } from 'react';

function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setUser(data);
      });

    return () => {
      cancelled = true; // cleanup avoids setting state on an unmounted component
    };
  }, [userId]); // re-run whenever userId changes

  if (!user) return <p>Loading...</p>;
  return <h2>{user.name}</h2>;
}
```

### The Dependency Array

```jsx
useEffect(() => {
  console.log('Runs after every render');
});

useEffect(() => {
  console.log('Runs only once, after the first render');
}, []);

useEffect(() => {
  console.log('Runs when `count` changes');
}, [count]);
```

#### Output

Mount the component, then click a button that increments `count` twice:

```output
Runs after every render
Runs only once, after the first render
Runs when `count` changes
--- count 0 → 1 ---
Runs after every render
Runs when `count` changes
--- count 1 → 2 ---
Runs after every render
Runs when `count` changes
```

The `[]` effect never fires again. The `[count]` effect fires only on renders where `count` actually changed — a re-render caused by *other* state would print only the first line.

In development under `StrictMode`, React deliberately mounts, unmounts and remounts each component once, so you see the mount effects twice on startup. That is a check for missing cleanup, not a bug.

### Cleanup Functions

Return a function from the effect to clean up subscriptions, timers, or event listeners.

```jsx
function WindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);

  useEffect(() => {
    function handleResize() {
      setWidth(window.innerWidth);
    }

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <p>Window width: {width}px</p>;
}
```

#### Output

```output
Window width: 1280px
```

Drag the window narrower and it updates live. The important part is invisible: the returned cleanup runs on unmount, removing the listener.

Delete that `return` line and nothing appears to break — which is the problem. Each mount adds another listener that is never removed:

```output
(after navigating to this component 4 times)
handleResize fired
handleResize fired
handleResize fired
handleResize fired
```

One resize, four handlers, all holding references to unmounted components. This is the classic React memory leak, and with `setState` inside it you eventually get:

```output
Warning: Can't perform a React state update on an unmounted component.
```

## useRef - Mutable Values and DOM Access

`useRef` creates a mutable object that persists across renders **without** triggering a re-render when changed.

### Accessing DOM Nodes

```jsx
import { useRef } from 'react';

function TextInputWithFocusButton() {
  const inputRef = useRef(null);

  function focusInput() {
    inputRef.current.focus();
  }

  return (
    <>
      <input ref={inputRef} type="text" />
      <button onClick={focusInput}>Focus the input</button>
    </>
  );
}
```

### Storing Mutable Values

```jsx
function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef(null);

  function start() {
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }

  function stop() {
    clearInterval(intervalRef.current);
  }

  return (
    <div>
      <p>{elapsed}s</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  );
}
```

> Note: In React 19, `ref` can be passed as a normal prop to function components - `forwardRef` is no longer required. See the [React 19 New Features](/React/React-19-New-Features) page.

## useMemo - Memoizing Expensive Calculations

```jsx
import { useMemo, useState } from 'react';

function ProductList({ products, filterText }) {
  const [sortOrder, setSortOrder] = useState('asc');

  const filteredAndSorted = useMemo(() => {
    console.log('Recomputing filtered list...');
    return products
      .filter((p) => p.name.includes(filterText))
      .sort((a, b) => (sortOrder === 'asc' ? a.price - b.price : b.price - a.price));
  }, [products, filterText, sortOrder]);

  return (
    <ul>
      {filteredAndSorted.map((p) => (
        <li key={p.id}>{p.name} - ${p.price}</li>
      ))}
    </ul>
  );
}
```

#### Input

```jsx
const products = [
  { id: 1, name: 'Laptop', price: 999 },
  { id: 2, name: 'Lamp',   price: 40  },
  { id: 3, name: 'Desk',   price: 350 },
];
```

#### Output

With `filterText="La"` and `sortOrder="asc"`:

```output
Recomputing filtered list...
<ul>
  <li>Lamp - $40</li>
  <li>Laptop - $999</li>
</ul>
```

Flip to `desc` and it recomputes, because `sortOrder` is a dependency:

```output
Recomputing filtered list...
<ul>
  <li>Laptop - $999</li>
  <li>Lamp - $40</li>
</ul>
```

But a re-render caused by unrelated state prints **nothing** — the memo is reused:

```output
(no "Recomputing" line; the previous list is returned as-is)
```

That `console.log` inside the memo is the single best way to check whether `useMemo` is actually helping. If it prints on every render, a dependency is unstable — usually an object or array literal recreated each time.

`useMemo` only recalculates when one of its dependencies changes, avoiding expensive recomputation on unrelated re-renders.

## useCallback - Memoizing Functions

Useful when passing callbacks to memoized child components (`React.memo`) so they don't re-render unnecessarily.

```jsx
import { useCallback, useState, memo } from 'react';

const ExpensiveChild = memo(function ExpensiveChild({ onClick }) {
  console.log('ExpensiveChild rendered');
  return <button onClick={onClick}>Click me</button>;
});

function Parent() {
  const [count, setCount] = useState(0);
  const [text, setText] = useState('');

  const handleClick = useCallback(() => {
    setCount((c) => c + 1);
  }, []); // stable function reference across renders

  return (
    <div>
      <input value={text} onChange={(e) => setText(e.target.value)} />
      <p>Count: {count}</p>
      <ExpensiveChild onClick={handleClick} />
    </div>
  );
}
```

#### Output

Typing in the input re-renders `Parent` on every keystroke. With `useCallback`:

```output
(typing "abc" — ExpensiveChild logs nothing)
```

Remove the `useCallback` and the same three keystrokes give:

```output
ExpensiveChild rendered
ExpensiveChild rendered
ExpensiveChild rendered
```

`memo` compares props with `Object.is`. A function defined inline in the component body is a **brand-new object on every render**, so `onClick` always looks different and `memo` never gets to skip anything.

This is why `useCallback` and `memo` are a pair. `memo` alone on a child that receives an inline function is pure overhead — it does the comparison work and then re-renders anyway.

## useReducer - Complex State Logic

An alternative to `useState` for state with multiple sub-values or complex transitions.

```jsx
import { useReducer } from 'react';

const initialState = { count: 0 };

function reducer(state, action) {
  switch (action.type) {
    case 'increment':
      return { count: state.count + 1 };
    case 'decrement':
      return { count: state.count - 1 };
    case 'reset':
      return initialState;
    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}

function Counter() {
  const [state, dispatch] = useReducer(reducer, initialState);

  return (
    <div>
      <p>Count: {state.count}</p>
      <button onClick={() => dispatch({ type: 'increment' })}>+</button>
      <button onClick={() => dispatch({ type: 'decrement' })}>-</button>
      <button onClick={() => dispatch({ type: 'reset' })}>Reset</button>
    </div>
  );
}
```

#### Output

Clicking `+`, `+`, `-`, then `Reset`:

```output
{"count":0} + {"type":"increment"} -> {"count":1}
{"count":1} + {"type":"increment"} -> {"count":2}
{"count":2} + {"type":"decrement"} -> {"count":1}
{"count":1} + {"type":"reset"}     -> {"count":0}
```

Each transition is a pure function of `(state, action)` — which is exactly why reducers are easy to unit test: no React, no rendering, no mocking. The block above is real output from calling `reducer` directly in Node.

The `default` branch earns its keep on a typo:

```output
Uncaught Error: Unknown action: multiply
```

Without it, an unrecognised action would silently return `undefined` and wipe your state, which is far harder to debug than an exception.

## useContext - Avoiding Prop Drilling

Share values (theme, current user, locale) across the tree without passing props manually at every level.

```jsx
import { createContext, useContext, useState } from 'react';

const ThemeContext = createContext('light');

function App() {
  const [theme, setTheme] = useState('dark');

  return (
    <ThemeContext value={theme}>
      <Toolbar />
      <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
        Toggle theme
      </button>
    </ThemeContext>
  );
}

function Toolbar() {
  return <ThemedButton />; // no need to pass `theme` through Toolbar
}

function ThemedButton() {
  const theme = useContext(ThemeContext);
  return <button className={`btn-${theme}`}>I am styled by theme context</button>;
}
```

> React 19 lets you render `<ThemeContext value={theme}>` directly instead of `<ThemeContext.Provider value={theme}>` (the old syntax still works).

## Custom Hooks

Extract reusable stateful logic into your own hook (a function starting with `use`).

```jsx
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

function Settings() {
  const [name, setName] = useLocalStorage('name', '');

  return (
    <input value={name} onChange={(e) => setName(e.target.value)} />
  );
}
```

## Next Steps

Continue with:
- **[Forms](/React/Forms)** - controlled inputs and React 19 Actions
- **[React 19 New Features](/React/React-19-New-Features)** - `use()`, `useOptimistic`, `useActionState`
