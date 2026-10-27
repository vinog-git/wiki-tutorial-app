# React: Routing

React itself has no built-in router. The standard choice for client-side routing is **React Router** (v6/v7), which works with plain React apps as well as framework setups.

## Installing React Router

```bash
npm install react-router-dom
```

## Basic Setup

```jsx
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import Home from './pages/Home.jsx';
import About from './pages/About.jsx';

createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<App />}>
        <Route index element={<Home />} />
        <Route path="about" element={<About />} />
      </Route>
    </Routes>
  </BrowserRouter>
);
```

#### Output

The URL selects which element renders — nothing else on the page changes:

```output
/          → <h1>Home</h1>
/about     → <h1>About</h1>
/products  → <h1>Products</h1>
```

These are **client-side** transitions: no network request, no page reload, and component state elsewhere in the tree survives the navigation. That is the whole difference between `<Link to="/about">` and `<a href="/about">`.

A route the router does not recognise renders nothing at all, with a console warning:

```output
No routes matched location "/pricing"
```

Which is why the catch-all route further down this page matters.

## Layouts with `<Outlet>`

The parent route renders shared layout (nav, header, footer) and an `<Outlet>` marks where the matched child route renders.

```jsx
import { Outlet, Link } from 'react-router-dom';

function App() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

## Navigation

### `<Link>` and `<NavLink>`

```jsx
import { Link, NavLink } from 'react-router-dom';

function Nav() {
  return (
    <nav>
      <Link to="/products">Products</Link>

      {/* NavLink knows when it's "active" for styling */}
      <NavLink
        to="/products"
        className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
      >
        Products
      </NavLink>
    </nav>
  );
}
```

### Programmatic Navigation

```jsx
import { useNavigate } from 'react-router-dom';

function LoginForm() {
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    await login();
    navigate('/dashboard');       // push a new entry
    // navigate('/dashboard', { replace: true }); // replace current entry
    // navigate(-1);              // go back
  }

  return <form onSubmit={handleSubmit}>{/* ... */}</form>;
}
```

## Dynamic Route Params

```jsx
<Routes>
  <Route path="/products/:productId" element={<ProductDetail />} />
</Routes>
```

```jsx
import { useParams } from 'react-router-dom';

function ProductDetail() {
  const { productId } = useParams();
  return <p>Showing product #{productId}</p>;
}
```

#### Output

For a route declared as `/products/:id`:

```output
/products/42     → useParams() === { id: "42" }
/products/abc    → useParams() === { id: "abc" }
```

**Params are always strings.** `id` is `"42"`, not `42` — so `id === 42` is false and `products.find(p => p.id === id)` silently returns `undefined` when your data uses numeric ids. Convert explicitly with `Number(id)`.

## Reading Query Strings

```jsx
import { useSearchParams } from 'react-router-dom';

function SearchResults() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') ?? '';

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setSearchParams({ q: e.target.value })}
      />
      <p>Searching for: {query}</p>
    </div>
  );
}
```

## Nested Routes

```jsx
<Routes>
  <Route path="/dashboard" element={<DashboardLayout />}>
    <Route index element={<DashboardHome />} />
    <Route path="settings" element={<Settings />} />
    <Route path="billing" element={<Billing />} />
  </Route>
</Routes>
```

```jsx
function DashboardLayout() {
  return (
    <div className="dashboard">
      <aside>
        <Link to="settings">Settings</Link>
        <Link to="billing">Billing</Link>
      </aside>
      <Outlet />
    </div>
  );
}
```

## 404 / Catch-All Route

```jsx
<Routes>
  <Route path="/" element={<Home />} />
  <Route path="/about" element={<About />} />
  <Route path="*" element={<NotFound />} />
</Routes>
```

## Protected Routes

```jsx
import { Navigate, Outlet } from 'react-router-dom';

function RequireAuth({ isAuthenticated }) {
  return isAuthenticated ? <Outlet /> : <Navigate to="/login" replace />;
}

<Routes>
  <Route element={<RequireAuth isAuthenticated={user != null} />}>
    <Route path="/dashboard" element={<Dashboard />} />
  </Route>
  <Route path="/login" element={<Login />} />
</Routes>
```

## Data Loading with Route Loaders (React Router v7 / "Data" APIs)

Newer React Router versions support loading data before a route renders, using `createBrowserRouter`.

```jsx
import { createBrowserRouter, RouterProvider, useLoaderData } from 'react-router-dom';

const router = createBrowserRouter([
  {
    path: '/products/:productId',
    element: <ProductDetail />,
    loader: async ({ params }) => {
      const res = await fetch(`/api/products/${params.productId}`);
      return res.json();
    },
  },
]);

function ProductDetail() {
  const product = useLoaderData();
  return <h1>{product.name}</h1>;
}

// createRoot(...).render(<RouterProvider router={router} />);
```

## Next Steps

Continue with:
- **[Data Fetching](/React/Data-Fetching)** - loading data with `useEffect`, `use()`, and Suspense
- **[Performance Optimization](/React/Performance-Optimization)** - code splitting routes with `React.lazy`
