# React: Performance Optimization

Most React apps don't need manual optimization until they actually show jank. Measure first (React DevTools Profiler), then optimize the specific bottleneck.

## Why Components Re-render

A component re-renders when:
1. Its own state changes (`useState`/`useReducer`)
2. Its parent re-renders (by default, children re-render too)
3. Its context value changes

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <button onClick={() => setCount(count + 1)}>{count}</button>
      <ExpensiveChild /> {/* re-renders every time count changes, even though it uses no props */}
    </div>
  );
}
```

#### Output

Clicking the button three times, with a `console.log` in each component:

```output
Parent rendered
ExpensiveChild rendered
Parent rendered
ExpensiveChild rendered
Parent rendered
ExpensiveChild rendered
```

`ExpensiveChild` takes no props at all and cannot possibly look different — yet it re-ran on every click. "Re-render" here means React called the function and diffed the result; it found no DOM changes and wrote nothing. That is cheap for a `<div>` and expensive for a subtree of hundreds of nodes, which is the entire subject of this page.

## `React.memo` - Skip Re-rendering When Props Are Unchanged

```jsx
import { memo } from 'react';

const ExpensiveChild = memo(function ExpensiveChild({ label }) {
  console.log('Rendering ExpensiveChild');
  return <div>{label}</div>;
});
```

`memo` does a shallow comparison of props. If none changed, React skips re-rendering that subtree.

> **Common pitfall:** passing a new inline object, array, or function as a prop on every render defeats `memo`, because the shallow comparison sees a "different" reference each time. Combine `memo` with `useMemo`/`useCallback` for those props.

```jsx
function Parent() {
  const [count, setCount] = useState(0);

  // ❌ new function identity every render - defeats memo on Child
  // return <Child onClick={() => doSomething()} />;

  // ✅ stable identity across renders
  const handleClick = useCallback(() => doSomething(), []);
  return <Child onClick={handleClick} />;
}
```

#### Output

Wrapping the same child in `memo`, then clicking three times:

```output
Parent rendered
Rendering ExpensiveChild
Parent rendered
Parent rendered
```

`ExpensiveChild` renders **once**. On the next two clicks `memo` compared props, found them unchanged, and reused the previous result.

Now the pitfall, with an inline function passed as a prop:

```output
Parent rendered
Rendering ExpensiveChild
Parent rendered
Rendering ExpensiveChild
Parent rendered
Rendering ExpensiveChild
```

Back to rendering every time — and now *slower* than having no `memo` at all, because React does the prop comparison and then re-renders anyway. `memo` is not free; applying it without stabilising the props is a net loss.

## `useMemo` and `useCallback` (Recap)

```jsx
// Memoize an expensive computed value
const sorted = useMemo(() => expensiveSort(items), [items]);

// Memoize a function reference (useful when passed to memoized children)
const handleSelect = useCallback((id) => setSelectedId(id), []);
```

Don't reach for these everywhere - they have their own (small) overhead. Use them when:
- The computation is genuinely expensive, or
- The value/function is passed to a `memo`-wrapped child or a dependency array

## Code Splitting with `React.lazy` and `Suspense`

Split large components (routes, dialogs, rarely-used features) into separate bundles, loaded only when needed.

```jsx
import { lazy, Suspense } from 'react';

const AdminDashboard = lazy(() => import('./AdminDashboard.jsx'));

function App({ isAdmin }) {
  return (
    <div>
      <p>Welcome</p>
      {isAdmin && (
        <Suspense fallback={<p>Loading dashboard...</p>}>
          <AdminDashboard />
        </Suspense>
      )}
    </div>
  );
}
```

### Lazy-loading Routes

```jsx
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';

const Settings = lazy(() => import('./pages/Settings.jsx'));
const Billing = lazy(() => import('./pages/Billing.jsx'));

function App() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/billing" element={<Billing />} />
      </Routes>
    </Suspense>
  );
}
```

## Virtualizing Long Lists

Rendering thousands of DOM nodes at once is slow. Libraries like `react-window` or `@tanstack/react-virtual` render only the visible rows.

```jsx
import { FixedSizeList } from 'react-window';

function BigList({ items }) {
  return (
    <FixedSizeList height={400} width={300} itemCount={items.length} itemSize={35}>
      {({ index, style }) => (
        <div style={style}>{items[index].name}</div>
      )}
    </FixedSizeList>
  );
}
```

## Keys and List Performance

Using array index as `key` for a reorderable list forces React to re-render/re-mount items unnecessarily and can cause subtle state bugs. Always use a stable, unique identifier.

```jsx
// ❌ Bad when list order or contents can change
{items.map((item, index) => <Row key={index} item={item} />)}

// ✅ Good
{items.map((item) => <Row key={item.id} item={item} />)}
```

#### Output

The damage from an index key is state, not markup. Given a list of inputs and a row deleted from the front:

```output
Before:  key=0 <input value="Alice">
         key=1 <input value="Bob">
         key=2 <input value="Carol">

Delete "Alice", with key={index}:
         key=0 <input value="Alice">   ← Bob's row, showing Alice's text
         key=1 <input value="Bob">     ← Carol's row, showing Bob's text

Delete "Alice", with key={item.id}:
         key=2 <input value="Bob">
         key=3 <input value="Carol">
```

React matches old and new elements **by key**. With index keys, the row that used to be `key=0` still is, so React reuses its DOM node and its internal state — and the typed text stays put while the data underneath it shifts up by one.

Nothing errors. The list simply shows the wrong values next to the wrong items, which is why this bug usually reaches production.

## The React Compiler

React 19's ecosystem includes the **React Compiler** (previously "React Forget"), a build-time tool that automatically memoizes components and values - reducing the need to manually sprinkle `useMemo`/`useCallback`/`memo` throughout your code. It analyzes your component code and inserts the equivalent optimizations for you.

```bash
npm install -D babel-plugin-react-compiler
```

```js
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-react-compiler', {}],
  ],
};
```

With the compiler enabled, most manual `useMemo`/`useCallback` calls become unnecessary - though they remain valid for cases the compiler can't infer.

## Profiling Before Optimizing

Use the **Profiler** tab in React DevTools to record a session and see which components rendered, how often, and why. Don't guess - measure, find the actual expensive component, then apply the specific fix (`memo`, `useMemo`, virtualization, or code splitting).

## Next Steps

Continue with:
- **[Testing](/React/Testing)** - verifying components behave correctly as you optimize them
