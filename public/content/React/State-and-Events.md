# React: State and Events

**State** is data that a component owns and can change over time. When state changes, React re-renders the component to reflect the new value.

## The `useState` Hook

```jsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <button onClick={() => setCount(count - 1)}>Decrement</button>
    </div>
  );
}
```

#### Output

Initial render, and after one click on Increment:

```output
<div>
  <p>Count: 0</p>
  <button>Increment</button>
  <button>Decrement</button>
</div>

<div>
  <p>Count: 1</p>
  <button>Increment</button>
  <button>Decrement</button>
</div>
```

React re-ran the whole `Counter` function and produced a new tree, but the only thing it actually touched in the DOM is the text node `0` → `1`. The two `<button>` elements are untouched, so focus and any in-progress interaction survive.

`useState(initialValue)` returns a pair:
1. The **current value** of the state (`count`)
2. A **setter function** to update it (`setCount`)

Calling the setter tells React "re-render this component with the new value."

## Handling Events

React wraps native DOM events, but the API looks and feels almost identical. Event names are camelCase, and you pass a function reference (not a string).

```jsx
function ClickButton() {
  function handleClick() {
    console.log('Button clicked!');
  }

  return <button onClick={handleClick}>Click me</button>;
}
```

```jsx
function TextInput() {
  function handleChange(event) {
    console.log('Current value:', event.target.value);
  }

  return <input type="text" onChange={handleChange} />;
}
```

#### Output

Clicking the button:

```output
Button clicked!
```

Typing `hi` into the input fires `onChange` once per keystroke:

```output
Current value: h
Current value: hi
```

Note `onChange` in React fires on **every keystroke**, unlike the native DOM `change` event, which only fires when the field loses focus. React's is really the native `input` event under a familiar name.

### Passing Arguments to Handlers

```jsx
function ItemList({ items, onRemove }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>
          {item.name}
          <button onClick={() => onRemove(item.id)}>Remove</button>
        </li>
      ))}
    </ul>
  );
}
```

## State Updates Are Asynchronous (Batched)

React batches multiple `setState` calls within the same event handler into a single re-render for performance.

```jsx
function Counter() {
  const [count, setCount] = useState(0);

  function handleTripleClick() {
    setCount(count + 1); // count is still 0 here
    setCount(count + 1); // still references the original 0
    setCount(count + 1); // still 0 -> result: count becomes 1, not 3!
  }

  return <button onClick={handleTripleClick}>Count: {count}</button>;
}
```

#### Output

Three `setCount` calls, one click:

```output
Count: 0    (initial)
Count: 1    (after clicking once)
```

Not 3. Every one of those three calls read `count` from the same closure, where it was `0`, so each queued "set the value to 1". The last one wins and they collapse into a single re-render.

### Fix: Use the Updater Function

When the new state depends on the previous state, pass a function to the setter:

```jsx
function handleTripleClick() {
  setCount((prev) => prev + 1);
  setCount((prev) => prev + 1);
  setCount((prev) => prev + 1);
  // count correctly increases by 3
}
```

#### Output

```output
Count: 3    (after clicking once)
```

Same three calls, same single re-render, different result. Each updater receives the value the **previous** updater returned rather than the value captured in the closure:

```output
setCount(count + 1) × 3    → 1   (each computes 0 + 1)
setCount(p => p + 1) × 3   → 3   (0 → 1 → 2 → 3)
```

The rule that follows: **if the new state is derived from the old state, pass a function.** Otherwise the plain value is fine and clearer.

## State with Objects and Arrays

Never mutate state directly - always create a new object/array.

```jsx
function ProfileForm() {
  const [profile, setProfile] = useState({ name: '', email: '' });

  function updateName(name) {
    // ❌ profile.name = name;  -- never mutate directly

    // ✅ create a new object
    setProfile({ ...profile, name });
  }

  return (
    <input
      value={profile.name}
      onChange={(e) => updateName(e.target.value)}
    />
  );
}
```

```jsx
function TodoApp() {
  const [todos, setTodos] = useState([]);

  function addTodo(text) {
    setTodos([...todos, { id: Date.now(), text, done: false }]);
  }

  function toggleTodo(id) {
    setTodos(
      todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  }

  function removeTodo(id) {
    setTodos(todos.filter((t) => t.id !== id));
  }

  return (
    <ul>
      {todos.map((todo) => (
        <li
          key={todo.id}
          style={{ textDecoration: todo.done ? 'line-through' : 'none' }}
          onClick={() => toggleTodo(todo.id)}
        >
          {todo.text}
          <button onClick={() => removeTodo(todo.id)}>x</button>
        </li>
      ))}
    </ul>
  );
}
```

#### Output

With one open and one completed todo:

```output
<ul>
  <li style="text-decoration:none">Learn React<button>x</button></li>
  <li style="text-decoration:line-through">Ship it<button>x</button></li>
</ul>
```

Note the style prop: JSX takes an **object** with camelCased keys (`textDecoration`), and React emits the hyphenated CSS (`text-decoration`).

The mutation trap is worth seeing. `todos.push(newTodo); setTodos(todos)` typically renders **nothing new at all**:

```output
(no re-render — the list still shows the old items)
```

React compares the new state to the old with `Object.is`. Pushing into the existing array leaves the same reference, so React concludes nothing changed and skips the render. The data is updated; the screen is not. That silent no-op is why `[...todos, item]` matters — it produces a new reference.

## Lifting State Up

When two components need to share the same state, move that state to their closest common parent and pass it down via props.

```jsx
function TemperatureConverter() {
  const [celsius, setCelsius] = useState(0);

  return (
    <div>
      <CelsiusInput value={celsius} onChange={setCelsius} />
      <FahrenheitDisplay celsius={celsius} />
    </div>
  );
}

function CelsiusInput({ value, onChange }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

function FahrenheitDisplay({ celsius }) {
  const fahrenheit = (celsius * 9) / 5 + 32;
  return <p>{fahrenheit}°F</p>;
}
```

#### Output

Typing into the Celsius input updates the Fahrenheit display on every keystroke:

```output
celsius=0   → <p>32°F</p>
celsius=25  → <p>77°F</p>
celsius=100 → <p>212°F</p>
```

`FahrenheitDisplay` holds no state of its own — it derives its value on each render. That is the payoff of lifting state up: there is exactly **one** source of truth, so the two components can never disagree.

Note `onChange={(e) => onChange(Number(e.target.value))}`. Without `Number`, `e.target.value` is the string `"25"`, and `("25" * 9) / 5 + 32` happens to still work because `*` coerces — but `celsius + 1` would produce `"251"`. Input values are always strings.

## Next Steps

Continue with:
- **Hooks Deep Dive** - `useEffect`, `useRef`, `useMemo`, `useCallback`, `useReducer`
- **Forms** - controlled inputs and React 19 Actions
