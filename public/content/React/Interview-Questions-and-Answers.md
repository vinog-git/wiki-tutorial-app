# React: Interview Questions and Answers

A review of commonly asked React interview questions, from fundamentals through React 19 specifics.

## Core Concepts

### Q: What is React, and why use it?
React is a JavaScript library for building user interfaces from reusable components. It's declarative (you describe the desired UI for a given state, React updates the DOM), component-based, and efficient thanks to its reconciliation algorithm, which minimizes real DOM updates.

### Q: What is JSX? Is it required?
JSX is a syntax extension that lets you write HTML-like markup in JavaScript. It compiles to `React.createElement()` calls. It's not required - you can call `React.createElement` directly - but JSX is far more readable and is the overwhelming convention.

### Q: What is the virtual DOM, and how does reconciliation work?
The virtual DOM is an in-memory tree representation of the UI. When state changes, React builds a new virtual DOM tree, diffs it against the previous one, and applies only the minimal set of real DOM operations needed (reconciliation). This avoids expensive full re-renders of the actual DOM.

### Q: What's the difference between a controlled and uncontrolled component?
A **controlled component** has its value driven entirely by React state (`value` + `onChange`). An **uncontrolled component** manages its own state internally in the DOM, and React reads its value via a `ref` when needed. Controlled components are the recommended default; uncontrolled components are useful for simple forms or integrating with non-React code.

### Q: What are keys, and why are they important in lists?
`key` is a special prop that helps React identify which list items changed, were added, or were removed across renders. Without stable keys (or using array index as a key on a reorderable list), React may mismatch DOM nodes to the wrong data, causing incorrect updates or lost input focus/state.

## Component Model

### Q: What's the difference between props and state?
**Props** are inputs passed from a parent to a child - read-only from the child's perspective. **State** is data owned and managed internally by a component, which can change over time and triggers a re-render when updated via its setter.

### Q: What is "lifting state up"?
When two or more components need to share the same changing data, move that state to their closest common parent, then pass it (and updater functions) down as props. This keeps a single source of truth instead of trying to sync duplicate state across components.

### Q: What is prop drilling, and how do you avoid it?
Prop drilling is passing a prop down through several intermediate components that don't use it themselves, just to reach a deeply nested child. It's avoided using the **Context API** (`createContext`/`useContext`) or state management libraries (Redux, Zustand, Jotai) for widely-shared data.

### Q: What is composition, and why does React favor it over inheritance?
Composition means building complex components out of simpler ones by nesting/passing them as props (especially `children`), rather than extending a base class. React components rarely need to share behavior via inheritance - the `children` prop and higher-order composition patterns cover nearly every use case, and they're more flexible and explicit.

## Hooks

### Q: What problem do Hooks solve?
Before Hooks, only class components could hold state or use lifecycle methods, which led to complex patterns like higher-order components and render props to share logic. Hooks let function components use state, effects, and other React features directly, and make it easy to extract and reuse stateful logic via custom hooks.

### Q: What are the Rules of Hooks?
1. Only call Hooks at the top level - never inside loops, conditions, or nested functions.
2. Only call Hooks from React function components or from custom hooks.

These rules exist because React relies on the *order* Hooks are called in, across renders, to correctly associate state with each `useState`/`useEffect` call.

### Q: What's the difference between `useEffect` and `useLayoutEffect`?
`useEffect` runs asynchronously after the browser has painted. `useLayoutEffect` runs synchronously after DOM mutations but before the browser paints - use it only when you need to measure or mutate the DOM before the user sees a flicker (e.g., measuring an element's size to position a tooltip).

### Q: Why does `useEffect` need a dependency array, and what happens if you omit it?
The dependency array tells React when to re-run the effect. Omit it entirely and the effect runs after *every* render. Pass `[]` and it runs once after the initial render. Pass `[a, b]` and it re-runs whenever `a` or `b` changes between renders.

### Q: What is a stale closure, and how does it happen with hooks?
A stale closure occurs when a function (e.g., inside `useEffect` or an event handler) captures a variable's value from a previous render and keeps using that old value, because dependency arrays weren't updated correctly.

```jsx
useEffect(() => {
  const id = setInterval(() => {
    console.log(count); // always logs the initial value of `count`
  }, 1000);
  return () => clearInterval(id);
}, []); // missing `count` in the dependency array
```

#### Output

With `count` incrementing every second but `[]` as the dependency array:

```output
0
0
0
0
```

The interval callback was created once, on the first render, and closed over `count` when it was `0`. Every later render creates a *new* `count`, but the interval is still running the old function.

With `[count]` in the dependency array, the effect tears down and re-registers on each change:

```output
0
1
2
3
```

The block above is real output from simulating both cases in Node — the behaviour is plain JavaScript closure semantics, not something React does specially.

Fix: include `count` in the dependency array, or use the functional updater form (`setCount(prev => prev + 1)`) which doesn't depend on the captured value.

### Q: When would you use `useReducer` instead of `useState`?
When state has multiple sub-values that update together, when the next state depends on complex logic based on the previous state, or when you want to centralize update logic (similar to a small Redux reducer) for easier testing and readability.

### Q: What's the difference between `useMemo` and `useCallback`?
`useMemo` memoizes a **computed value** - it returns the cached result unless a dependency changes. `useCallback` memoizes a **function reference** - it returns the same function identity unless a dependency changes. `useCallback(fn, deps)` is equivalent to `useMemo(() => fn, deps)`.

## Performance

### Q: How do you prevent unnecessary re-renders?
- Wrap a component in `React.memo` to skip re-rendering when props haven't changed (shallow comparison).
- Memoize props passed to a `memo`-wrapped child with `useMemo`/`useCallback` so their reference stays stable.
- Split state so unrelated UI doesn't share a parent that re-renders together.
- Use the React DevTools Profiler to confirm you're solving an actual measured problem, not a hypothetical one.

### Q: What is code splitting, and how do you do it in React?
Code splitting breaks your JS bundle into smaller chunks loaded on demand, reducing initial load time. In React, use `React.lazy(() => import('./Component'))` combined with `<Suspense fallback={...}>` to lazily load a component only when it's rendered.

### Q: What is the React Compiler?
An automatic, build-time optimization tool that analyzes component code and inserts memoization equivalent to manual `useMemo`/`useCallback`/`React.memo`, reducing the need to hand-tune performance in most components.

## State Management & Data Flow

### Q: When do you reach for a state management library instead of Context?
Context is fine for low-frequency updates shared across a subtree (theme, current user, locale). For frequently-changing, widely-consumed state (e.g., a large normalized data cache), a dedicated library (Redux Toolkit, Zustand, Jotai) or a data-fetching library (TanStack Query) usually performs and scales better, since Context re-renders every consumer on any value change.

### Q: How do you cancel an in-flight fetch request when a component unmounts?
Use an `AbortController` and call `.abort()` in the effect's cleanup function.

```jsx
useEffect(() => {
  const controller = new AbortController();
  fetch(url, { signal: controller.signal }).then(/* ... */);
  return () => controller.abort();
}, [url]);
```

## React 19 Specifics

### Q: What does the `use()` API do, and how is it different from a Hook?
`use()` reads the value of a Promise or Context during render. Unlike regular Hooks, it can be called conditionally or inside loops, because it isn't restricted by the Rules of Hooks the same way - it integrates with Suspense (for promises) and the component tree (for context) at the point it's called.

### Q: What is `useOptimistic` used for?
It lets you show an optimistic UI update immediately (e.g., a message appearing as "sent" right away) while the real async operation is still in progress, then reconciles automatically once the real data arrives.

### Q: What changed with `ref` in React 19?
Function components can now accept `ref` as a normal prop without wrapping them in `forwardRef`. `forwardRef` still works for backward compatibility but is no longer necessary for new code.

### Q: What are Actions in React 19?
Actions are (often async) functions passed to `<form action={fn}>` or invoked via a transition. React manages pending state, errors, and optimistic UI around them automatically, paired with hooks like `useActionState` and `useFormStatus`.

## Practical / Scenario Questions

### Q: A child component needs to notify its parent when something happens. How do you implement that?
Pass a callback function as a prop from parent to child; the child calls it (optionally with arguments) in response to an event.

```jsx
function Child({ onSave }) {
  return <button onClick={() => onSave('data')}>Save</button>;
}

function Parent() {
  function handleSave(data) {
    console.log('Saved:', data);
  }
  return <Child onSave={handleSave} />;
}
```

### Q: How would you debounce a search input in React?
Combine local state for the immediate input value with a `useEffect` that delays the expensive operation (API call) using `setTimeout`, clearing the timeout on cleanup so only the last keystroke within the delay window triggers it.

```jsx
function SearchBox({ onSearch }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timeoutId = setTimeout(() => onSearch(query), 300);
    return () => clearTimeout(timeoutId);
  }, [query, onSearch]);

  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

### Q: How do you share logic between two components that isn't tied to markup?
Extract a **custom hook** (a function prefixed with `use` that itself may call other hooks). It lets you share stateful logic (data fetching, subscriptions, form handling) between components without duplicating code or introducing wrapper components.
