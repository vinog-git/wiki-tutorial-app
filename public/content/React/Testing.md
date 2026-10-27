# React: Testing

The standard tools for testing React components are **Vitest** (or Jest) as the test runner and **React Testing Library (RTL)** for rendering and querying components the way a user would.

## Setup

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

```js
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test-setup.js',
  },
});
```

```js
// src/test-setup.js
import '@testing-library/jest-dom/vitest';
```

## Rendering and Querying

```jsx
// Greeting.jsx
export default function Greeting({ name }) {
  return <h1>Hello, {name}!</h1>;
}
```

```jsx
// Greeting.test.jsx
import { render, screen } from '@testing-library/react';
import Greeting from './Greeting';

test('renders a greeting with the given name', () => {
  render(<Greeting name="Ada" />);
  expect(screen.getByText('Hello, Ada!')).toBeInTheDocument();
});
```

#### Output

```output
 ✓ src/Greeting.test.jsx (1)
   ✓ renders a greeting with the given name

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Duration  412ms
```

A failure is the more instructive case. Change the assertion to `'Hello, Grace!'` and Testing Library prints the **rendered DOM** alongside the error:

```output
 FAIL  src/Greeting.test.jsx > renders a greeting with the given name
TestingLibraryElementError: Unable to find an element with the text: Hello, Grace!.
This could be because the text is broken up by multiple elements.

Ignored nodes: comments, script, style
<body>
  <div>
    <h1>Hello, Ada!</h1>
  </div>
</body>
```

That DOM dump is the reason these failures are usually quick to diagnose — you can see exactly what was on screen instead of guessing.

### Common Queries

```jsx
screen.getByText('Submit');               // exact text match
screen.getByRole('button', { name: /submit/i });  // preferred: query by role
screen.getByLabelText('Email');           // form fields by their <label>
screen.getByPlaceholderText('Search...');
screen.queryByText('Error');              // returns null instead of throwing if not found
screen.findByText('Loaded');              // async - waits for the element to appear
```

> Prefer `getByRole` over `getByTestId` where possible - it tests the app the way assistive technology and real users perceive it.

## Simulating User Interaction

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>Count: {count}</button>
  );
}

test('increments the count when clicked', async () => {
  const user = userEvent.setup();
  render(<Counter />);

  const button = screen.getByRole('button', { name: /count: 0/i });
  await user.click(button);

  expect(screen.getByRole('button', { name: /count: 1/i })).toBeInTheDocument();
});
```

#### Output

```output
 ✓ src/Counter.test.jsx (1)
   ✓ increments the count when clicked
```

Note the test never inspects `count` or reaches into component internals — it finds the button by its accessible name before the click and again after. If you refactored `useState` to `useReducer`, this test would not change.

Forgetting `await` on `user.click` is the most common failure here, and the message points straight at it:

```output
Warning: An update to Counter inside a test was not wrapped in act(...).
```

## Testing Forms

```jsx
test('submits the entered name', async () => {
  const handleSubmit = vi.fn();
  const user = userEvent.setup();

  render(<NameForm onSubmit={handleSubmit} />);

  await user.type(screen.getByLabelText('Name'), 'Grace Hopper');
  await user.click(screen.getByRole('button', { name: /submit/i }));

  expect(handleSubmit).toHaveBeenCalledWith('Grace Hopper');
});
```

## Testing Async Components (Data Fetching)

Use `findBy*` queries, which retry until the element appears or a timeout is reached - ideal for content that loads after a fetch resolves.

```jsx
import { render, screen } from '@testing-library/react';
import ProductList from './ProductList';

test('renders products after loading', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ id: 1, name: 'Widget' }],
  });

  render(<ProductList />);

  expect(screen.getByText('Loading products...')).toBeInTheDocument();
  expect(await screen.findByText('Widget')).toBeInTheDocument();
});
```

## Mocking Modules and Hooks

```jsx
import { vi } from 'vitest';
import * as api from './api';

vi.spyOn(api, 'fetchUser').mockResolvedValue({ id: 1, name: 'Ada' });
```

## Testing Custom Hooks

```jsx
import { renderHook, act } from '@testing-library/react';
import { useCounter } from './useCounter';

test('useCounter increments correctly', () => {
  const { result } = renderHook(() => useCounter());

  act(() => {
    result.current.increment();
  });

  expect(result.current.count).toBe(1);
});
```

## Snapshot Testing (Use Sparingly)

```jsx
import { render } from '@testing-library/react';

test('matches snapshot', () => {
  const { container } = render(<Greeting name="Ada" />);
  expect(container).toMatchSnapshot();
});
```

Snapshots are easy to write but easy to rubber-stamp on updates without reading the diff - prefer explicit assertions (`getByText`, `getByRole`) for behavior that matters.

## Guiding Principle

> "The more your tests resemble the way your software is used, the more confidence they can give you." - Kent C. Dodds, creator of React Testing Library

Test what the user sees and does (rendered text, clicks, form input) rather than internal implementation details (state variable names, internal function calls).

## Next Steps

Continue with:
- **[Interview Questions and Answers](/React/Interview-Questions-and-Answers)** - review core React concepts in Q&A form
