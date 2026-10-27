# React: Components and Props

Components are reusable building blocks. **Props** (short for "properties") let you pass data from a parent component into a child component.

## Function Components

Modern React uses function components almost exclusively (class components still work but are considered legacy).

```jsx
function Welcome() {
  return <h1>Welcome!</h1>;
}
```

```jsx
// Arrow function style - equally common
const Welcome = () => {
  return <h1>Welcome!</h1>;
};
```

## Passing Props

Props are passed like HTML attributes and received as a single object argument.

```jsx
function UserCard(props) {
  return (
    <div className="card">
      <h2>{props.name}</h2>
      <p>{props.role}</p>
    </div>
  );
}

function App() {
  return (
    <div>
      <UserCard name="Ada Lovelace" role="Engineer" />
      <UserCard name="Grace Hopper" role="Admiral" />
    </div>
  );
}
```

#### Output

```output
<div>
  <div class="card">
    <h2>Ada Lovelace</h2>
    <p>Engineer</p>
  </div>
  <div class="card">
    <h2>Grace Hopper</h2>
    <p>Admiral</p>
  </div>
</div>
```

One component definition, two independent renders — the props are the only difference between them.

### Destructuring Props

It's idiomatic to destructure props right in the function signature:

```jsx
function UserCard({ name, role }) {
  return (
    <div className="card">
      <h2>{name}</h2>
      <p>{role}</p>
    </div>
  );
}
```

## Default Props

Give props a fallback value using default parameters:

```jsx
function Button({ label = 'Click me', variant = 'primary' }) {
  return <button className={`btn btn-${variant}`}>{label}</button>;
}

// <Button /> renders "Click me" with the "primary" style
// <Button label="Save" variant="success" /> overrides both
```

#### Output

```output
<Button />                               → <button class="btn btn-primary">Click me</button>
<Button label="Save" variant="success"/> → <button class="btn btn-success">Save</button>
```

Default parameters only kick in for `undefined`, **not** for other falsy values. `<Button label="" />` renders an empty button rather than falling back to "Click me", and `<Button label={null} />` renders nothing inside it — `null` is not `undefined`.

## Props Are Read-Only

A component must never modify its own props. Props flow **one-way**, from parent to child. If a child needs to change something in the parent, the parent passes down a *function* as a prop (see [State and Events](/React/State-and-Events)).

```jsx
function Bad({ count }) {
  count++; // ❌ Never mutate props
  return <p>{count}</p>;
}
```

#### Output

With `<Bad count={5} />` this renders `<p>6</p>` — it appears to work, which is what makes it dangerous. The parent's value is untouched, so the child now displays a number that exists nowhere in the application state. On the next parent re-render it resets to 6 again from 5, and any sibling reading the same value shows 5. The two views silently disagree.

## The `children` Prop

Anything nested inside a component's JSX tags is passed as `props.children`. This is how you build wrapper/layout components.

```jsx
function Card({ children }) {
  return <div className="card">{children}</div>;
}

function App() {
  return (
    <Card>
      <h2>Title</h2>
      <p>Some content inside the card.</p>
    </Card>
  );
}
```

#### Output

```output
<div class="card">
  <h2>Title</h2>
  <p>Some content inside the card.</p>
</div>
```

The `<Card>` tags are gone and their contents sit inside the rendered `<div class="card">`. `children` is just a prop — `<Card children={<h2>Title</h2>} />` is equivalent, only unreadable.

## Composition Over Inheritance

React favors composing components rather than using class inheritance:

```jsx
function Dialog({ title, children, footer }) {
  return (
    <div className="dialog">
      <div className="dialog-header">{title}</div>
      <div className="dialog-body">{children}</div>
      <div className="dialog-footer">{footer}</div>
    </div>
  );
}

function ConfirmDialog() {
  return (
    <Dialog
      title="Delete item?"
      footer={<button>Confirm</button>}
    >
      <p>This action cannot be undone.</p>
    </Dialog>
  );
}
```

#### Output

```output
<div class="dialog">
  <div class="dialog-header">Delete item?</div>
  <div class="dialog-body">
    <p>This action cannot be undone.</p>
  </div>
  <div class="dialog-footer">
    <button>Confirm</button>
  </div>
</div>
```

Note `footer` is a prop holding **JSX**, not a string. A prop can carry an entire element tree, which is how you get inheritance-like reuse without inheritance.

## Rendering Lists

Use `Array.prototype.map` to render a collection of items. Each item needs a stable, unique `key`.

```jsx
function TodoList({ todos }) {
  return (
    <ul>
      {todos.map((todo) => (
        <li key={todo.id}>{todo.text}</li>
      ))}
    </ul>
  );
}

const todos = [
  { id: 1, text: 'Learn React' },
  { id: 2, text: 'Build a project' },
  { id: 3, text: 'Ship it' },
];

// <TodoList todos={todos} />
```

#### Output

```output
<ul>
  <li>Learn React</li>
  <li>Build a project</li>
  <li>Ship it</li>
</ul>
```

The `key` does **not** appear in the DOM — it is purely for React's internal bookkeeping. Omit it and the markup is identical, but you get a console warning:

```output
Warning: Each child in a list should have a unique "key" prop.

Check the render method of `TodoList`. See https://react.dev/link/warning-keys for more information.
    at li
    at TodoList
```

> **Why keys matter:** React uses `key` to track which items changed, were added, or were removed between renders. Avoid using the array index as a key if the list can be reordered or filtered.

## Conditional Rendering

```jsx
function Greeting({ isLoggedIn, name }) {
  if (isLoggedIn) {
    return <h1>Welcome back, {name}!</h1>;
  }
  return <h1>Please sign in.</h1>;
}
```

```jsx
function Notification({ count }) {
  return (
    <div>
      {count > 0 && <span className="badge">{count}</span>}
      {count === 0 ? <p>No new notifications</p> : <p>{count} new</p>}
    </div>
  );
}
```

#### Output

`Greeting`, with each branch:

```output
<Greeting isLoggedIn={true} name="Ada" />  → <h1>Welcome back, Ada!</h1>
<Greeting isLoggedIn={false} />            → <h1>Please sign in.</h1>
```

`Notification` with `count={3}` and `count={0}`:

```output
count=3:
<div>
  <span class="badge">3</span>
  <p>3 new</p>
</div>

count=0:
<div>
  <p>No new notifications</p>
</div>
```

With `count={0}` the `&&` renders nothing — correct here, but only because the guard is `count > 0`, which yields a boolean. Write the very tempting shorter version and it breaks:

```jsx
{count && <span className="badge">{count}</span>}
```

```output
count=0: <div>0</div>
count=2: <div><span>has items</span></div>
```

A literal **`0` appears on the page**. `0 && x` evaluates to `0`, and React renders the number `0` while skipping `false`, `null` and `undefined`. This is the most common rendering bug in React: always coerce to a boolean (`count > 0 &&`, or `!!count &&`).

## Next Steps

Continue with:
- **[State and Events](/React/State-and-Events)** - making components interactive with `useState`
- **[Hooks Deep Dive](/React/Hooks-Deep-Dive)** - `useEffect`, `useRef`, `useMemo`, `useReducer`
