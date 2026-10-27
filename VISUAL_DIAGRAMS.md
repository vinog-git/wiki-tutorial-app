# Dev Wiki - Visual Diagrams

## App Layout

```
╔══════════════════════════════════════════════════════════════════════════╗
║                            📚 Dev Wiki                                   ║
║                  Learn Programming Concepts                              ║
║                                              [Java ▼]                    ║
╠════════════════════════════════════════════════════════════════════════════╣
║                           │                                               ║
║   SIDEBAR                 │          READING PANE                        ║
║                           │                                               ║
║  📋 Topics                │  # Collections                               ║
║                           │                                               ║
║  ☑ Core-Concepts          │  Ordered collection that allows              ║
║  □ Collections            │  duplicates...                               ║
║  □ Exception-Handling     │                                              ║
║  □ Multithreading         │  ## List Implementation                      ║
║  □ Streams-and-Lambdas    │                                              ║
║  □ OOP-Concepts           │  ArrayList is a dynamic array                ║
║                           │  that automatically resizes...               ║
║  💡 Select a topic        │                                              ║
║                           │  ## Code Example                             ║
║                           │                                              ║
║                           │  ```java                                    ║
║                           │  List<String> list =                        ║
║                           │    new ArrayList<>();                       ║
║                           │  list.add("Item");                          ║
║                           │  ```                                        ║
║                           │                                              ║
║                           │  ## Best Practices                           ║
║                           │                                              ║
║                           │  ✓ Use ArrayList for random access         ║
║                           │  ✓ Use LinkedList for inserts...           ║
║                           │                                              ║
╚════════════════════════════════════════════════════════════════════════════╝
```

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERACTIONS                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    1. Select Category                            │
│           (Java, SQL, Angular from dropdown)                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ pages/index.jsx │
                    │ (Main Component)│
                    └─────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ API: /topics    │
                    │ Reads folder    │
                    │ for .md files   │
                    └─────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│   2. Sidebar Displays Topics                                    │
│   ["Core-Concepts", "Collections", ...]                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    3. Select Topic                              │
│         (User clicks on topic in sidebar)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    ┌─────────────────┐
                    │ API: /content   │
                    │ Reads .md file  │
                    │ Parses markdown │
                    │ to HTML         │
                    └─────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│   4. Reading Pane Displays Content                              │
│   Formatted HTML from markdown                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Component Hierarchy

```
App (pages/index.jsx)
│
├── Header
│   └── Dropdown [Java ▼]
│
├── Main Content Container
│   │
│   ├── Sidebar
│   │   ├── Header "Topics"
│   │   ├── Topics List
│   │   │   ├── Topic Item (Collections)
│   │   │   ├── Topic Item (Core-Concepts)
│   │   │   └── ...
│   │   └── Footer Hint
│   │
│   └── ReadingPane
│       ├── Article Title
│       ├── Article Content
│       └── Markdown HTML
```

## File Organization

```
public/content/
│
├── Java/                    (Java category)
│   ├── Core-Concepts.md    (Topic 1)
│   ├── Collections.md      (Topic 2)
│   ├── Exception-Handling.md
│   ├── Multithreading.md
│   └── ...
│
├── SQL/                     (SQL category)
│   ├── Basic-Queries.md    (Topic 1)
│   ├── Joins.md            (Topic 2)
│   ├── Aggregate-Functions.md
│   └── ...
│
└── Angular/                 (Angular category)
    ├── Components.md        (Topic 1)
    ├── Services.md          (Topic 2)
    ├── Routing.md
    └── ...
```

## Adding New Topic - Process Flow

```
1. Create Markdown File
   └─> public/content/Java/New-Topic.md

2. Write Content
   └─> # New Topic
       ## Section 1
       ```code```

3. Refresh Browser
   └─> App detects file

4. Topic Appears in Sidebar
   └─> User can select and read
```

## Browser Rendering

```
URL Bar: http://localhost:3000
    ↓
[Page Loads]
    ↓
React App (index.jsx)
    ↓
┌──────────────────────────────────────┐
│          Header Component            │
│    ┌──────────────────────────────┐  │
│    │ 📚 Dev Wiki | [Java ▼]      │  │
│    └──────────────────────────────┘  │
└──────────────────────────────────────┘
    ↓
┌──────────────────────────────────────┐
│    Sidebar      │  Reading Pane      │
│ ┌────────────┐  │ ┌───────────────┐  │
│ │ • Core-C.. │  │ │  # Collections│  │
│ │ • Collect  │  │ │               │  │
│ │ • Except.. │  │ │ Content here  │  │
│ │ • Multith..│  │ │               │  │
│ └────────────┘  │ └───────────────┘  │
└──────────────────────────────────────┘
```

## State Management

```
App State
│
├── topic
│   └─ Current category: "Java"
│
├── subtopic
│   └─ Selected topic: "Collections"
│
├── topics
│   └─ ["Core-Concepts", "Collections", ...]
│
├── content
│   └─ "<h1>Collections</h1><p>...</p>"
│
└── loading
    └─ false (true while fetching)
```

## CSS Class Hierarchy

```
.app-container
├── .header
│   ├── .header-left
│   │   ├── .logo
│   │   └── .tagline
│   └── .header-right
│       └── .topic-dropdown
│
└── .main-content
    ├── .sidebar
    │   ├── .sidebar-header
    │   ├── .topics-list
    │   │   └── .topic-item (repeats)
    │   │       └── &.active (when selected)
    │   └── .sidebar-footer
    │
    └── .reading-pane
        ├── .article-title
        ├── .article-content
        │   ├── h1, h2, h3
        │   ├── p
        │   ├── code
        │   ├── pre
        │   ├── blockquote
        │   ├── a
        │   ├── table
        │   └── ...
        └── .empty-state or .loading
```

## Network Requests

```
Browser                          Server

[1] Load http://localhost:3000
    ├─────────────────────────────→ GET / (HTML)
    ←─────────────────────────────
    
[2] Select category "Java"
    ├─────────────────────────────→ GET /api/topics?category=Java
    ←───── ["Collections", ...] ───
    
[3] Click "Collections"
    ├─────────────────────────────→ GET /api/content?category=Java
    │                                &subtopic=Collections
    ←───────── {content: HTML} ────
    
[4] Content rendered in browser
    (HTML displayed in Reading Pane)
```

## Markdown Transformation

```
Raw Markdown File:
┌────────────────────────────────┐
│ # Collections                  │
│                                │
│ Ordered collection that        │
│ allows duplicates.             │
│                                │
│ ## List                        │
│ ```java                        │
│ List<String> list = new ...   │
│ ```                            │
└────────────────────────────────┘
         ↓ [Parsing]
      marked.js
         ↓
HTML Output:
┌────────────────────────────────┐
│ <h1>Collections</h1>          │
│ <p>Ordered collection...</p>  │
│ <h2>List</h2>                 │
│ <pre><code class="language-  │
│ java">List&lt;String&gt;...   │
│ </code></pre>                 │
└────────────────────────────────┘
         ↓ [Rendering]
    Browser Display
         ↓
┌────────────────────────────────┐
│ Collections                    │
│                                │
│ Ordered collection that allows │
│ duplicates.                    │
│                                │
│ List                           │
│ List<String> list = new ...   │
└────────────────────────────────┘
```

## Page Load Sequence

```
1. Page Loads (0ms)
   └─ Browser receives HTML

2. React Mounts (50ms)
   └─ App component initializes
   └─ State initialized
   └─ useEffect hooks run

3. API Call - Get Topics (100ms)
   └─ Fetches /api/topics?category=Java

4. API Response (300ms)
   └─ Receives topic list
   └─ Sidebar updates

5. First Topic Selected (350ms)
   └─ useEffect runs
   └─ API Call - Get Content

6. Content API Response (450ms)
   └─ Markdown received

7. Markdown Parsing (500ms)
   └─ marked() converts to HTML
   └─ ReadingPane updates

8. User Sees Full Page (600ms)
   └─ Header, Sidebar, Content all visible
```

## Responsive Breakpoints

```
Desktop (1200px+)
┌─────────────────────────────────┐
│ Header Full Width               │
├──────────┬──────────────────────┤
│ Sidebar  │ Reading Pane         │
│ 250px    │ (Full width)         │
└──────────┴──────────────────────┘

Tablet (600px - 1199px)
┌─────────────────────────────────┐
│ Header (stacked)                │
├──────────┬──────────────────────┤
│ Sidebar  │ Reading Pane         │
│ (reduced)│ (reduced)            │
└──────────┴──────────────────────┘

Mobile (<600px)
┌─────────────────────────────────┐
│ Header (dropdown, no tagline)   │
├─────────────────────────────────┤
│ Sidebar (full width, scrollable)│
├─────────────────────────────────┤
│ Reading Pane (full width)       │
└─────────────────────────────────┘
```

## Deployment Flow

```
Local Development          Production Deployment
   (npm run dev)          (e.g., Vercel)
        ↓                        ↓
   Hot Reload          Automatic Build
        ↓                        ↓
  Port 3000            CDN/Server
        ↓                        ↓
  http://localhost:3000  https://myapp.com
```

---

These diagrams help visualize how all the pieces fit together!
