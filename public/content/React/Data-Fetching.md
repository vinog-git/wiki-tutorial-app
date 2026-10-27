# React: Data Fetching

## The Classic Pattern: `useEffect` + `useState`

```jsx
import { useState, useEffect } from 'react';

function ProductList() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      try {
        setLoading(true);
        const res = await fetch('/api/products', { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setProducts(data);
        setError(null);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
    return () => controller.abort(); // cancel the request if the component unmounts
  }, []);

  if (loading) return <p>Loading products...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <ul>
      {products.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}
```

#### Output

The component renders three different things over its lifetime:

```output
t=0ms    <p>Loading products...</p>

t=180ms  <ul>
           <li>Laptop</li>
           <li>Keyboard</li>
           <li>Monitor</li>
         </ul>
```

With the API down:

```output
t=0ms    <p>Loading products...</p>
t=120ms  <p>Error: HTTP 500</p>
```

Two details in that code are easy to skip and both matter.

`if (!res.ok) throw` is required because **`fetch` does not reject on HTTP errors**. A 404 or 500 resolves normally with `ok: false`, so without that line the component would call `res.json()` on an error page and fail with a confusing parse error instead:

```output
<p>Error: Unexpected token '<', "<!DOCTYPE "... is not valid JSON</p>
```

And `controller.abort()` in the cleanup is what prevents this, which appears when a component unmounts before its request finishes:

```output
Warning: Can't perform a React state update on an unmounted component.
```

Aborting also makes the `err.name !== 'AbortError'` check necessary — a cancelled request rejects, and you do not want to show the user an error for a request you cancelled yourself.

### Re-fetching When Props Change

```jsx
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/users/${userId}`, { signal: controller.signal })
      .then((res) => res.json())
      .then(setUser)
      .catch((err) => {
        if (err.name !== 'AbortError') console.error(err);
      });
    return () => controller.abort();
  }, [userId]); // re-fetch whenever userId changes

  if (!user) return <p>Loading...</p>;
  return <h2>{user.name}</h2>;
}
```

## A Reusable `useFetch` Hook

```jsx
function useFetch(url) {
  const [state, setState] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, loading: true, error: null });

    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setState({ data: null, loading: false, error: err.message });
        }
      });

    return () => controller.abort();
  }, [url]);

  return state;
}

function Orders() {
  const { data, loading, error } = useFetch('/api/orders');

  if (loading) return <p>Loading orders...</p>;
  if (error) return <p>Failed to load orders: {error}</p>;
  return <ul>{data.map((o) => <li key={o.id}>{o.reference}</li>)}</ul>;
}
```

## React 19: Fetching with `use()` and Suspense

React 19's `use()` API lets a component "read" a promise directly, and `<Suspense>` shows a fallback while it resolves - no manual loading state needed.

```jsx
import { use, Suspense } from 'react';

function fetchUser(id) {
  return fetch(`/api/users/${id}`).then((res) => res.json());
}

function UserProfile({ userPromise }) {
  const user = use(userPromise); // suspends until resolved
  return <h2>{user.name}</h2>;
}

function App({ userId }) {
  const userPromise = fetchUser(userId); // created during render (or cached upstream)

  return (
    <Suspense fallback={<p>Loading user...</p>}>
      <UserProfile userPromise={userPromise} />
    </Suspense>
  );
}
```

> **Caveat:** don't create a brand-new promise on every render inside the component that also calls `use()` - it will refetch endlessly. Create the promise once (e.g. in a parent, a cache, or via a data-fetching library) and pass it down.

### Handling Errors with Error Boundaries

`use()` throws the rejection up to the nearest error boundary, similar to how it throws the pending promise up to Suspense.

```jsx
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) return <p>Something went wrong.</p>;
    return this.props.children;
  }
}

function App({ userPromise }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<p>Loading...</p>}>
        <UserProfile userPromise={userPromise} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

## Data Fetching Libraries

For production apps, most teams use a dedicated data-fetching/caching library instead of hand-rolled `useEffect` calls:

- **TanStack Query (React Query)** - caching, retries, background refetching, mutations
- **SWR** - lightweight "stale-while-revalidate" fetching
- **RTK Query** - integrated with Redux Toolkit

Example with TanStack Query:

```jsx
import { useQuery } from '@tanstack/react-query';

function Products() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['products'],
    queryFn: () => fetch('/api/products').then((res) => res.json()),
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return <ul>{data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;
}
```

These libraries handle caching, deduping identical in-flight requests, and background revalidation - problems that get tedious to solve by hand with `useEffect`.

## Next Steps

Continue with:
- **[Performance Optimization](/React/Performance-Optimization)** - avoiding unnecessary re-renders and re-fetches
- **[Testing](/React/Testing)** - mocking fetch calls in component tests
