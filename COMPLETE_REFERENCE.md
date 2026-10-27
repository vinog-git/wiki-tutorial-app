# Dev Wiki - Complete File Structure & Overview

## Full Project Structure

```
wiki-tutorial/
├── pages/
│   ├── index.jsx                    # Main app page
│   ├── _app.jsx                     # Next.js app wrapper (optional)
│   └── api/
│       ├── topics.js                # API: List topics for category
│       └── content.js               # API: Get markdown content
│
├── components/
│   ├── Header.jsx                   # Header with category dropdown
│   ├── Sidebar.jsx                  # Left sidebar with topic list
│   └── ReadingPane.jsx              # Main content display area
│
├── styles/
│   └── globals.css                  # All styling (no other files needed)
│
├── public/
│   └── content/
│       ├── Java/
│       │   ├── Core-Concepts.md
│       │   ├── Collections.md
│       │   ├── Exception-Handling.md
│       │   ├── Multithreading.md
│       │   ├── Streams-and-Lambdas.md
│       │   ├── OOP-Concepts.md
│       │   └── ... (add more)
│       │
│       ├── SQL/
│       │   ├── Basic-Queries.md
│       │   ├── Joins.md
│       │   ├── Aggregate-Functions.md
│       │   ├── GROUP-BY-and-HAVING.md
│       │   ├── Schema-Migrations.md
│       │   └── ... (add more)
│       │
│       └── Angular/
│           ├── Components.md
│           ├── Services.md
│           ├── Routing.md
│           ├── Forms.md
│           ├── HTTP-Client.md
│           └── ... (add more)
│
├── next.config.js                   # Next.js configuration
├── jsconfig.json                    # JavaScript/path configuration
├── package.json                     # Node dependencies
├── .gitignore                       # Git ignore file
├── README.md                        # Full documentation
├── GETTING_STARTED.md               # Quick start guide
├── QUICKSTART.sh                    # Auto setup script
└── .env.local                       # (Optional) Environment variables
```

## What Each File Does

### Core Application Files

| File | Purpose |
|------|---------|
| `pages/index.jsx` | Main React component - handles app state and renders layout |
| `pages/api/topics.js` | Backend API - reads markdown filenames from folders |
| `pages/api/content.js` | Backend API - reads and parses markdown files to HTML |
| `components/Header.jsx` | Top navigation bar with category dropdown |
| `components/Sidebar.jsx` | Left panel showing list of topics |
| `components/ReadingPane.jsx` | Main reading area displaying content |
| `styles/globals.css` | All CSS styling for the entire app |

### Configuration Files

| File | Purpose |
|------|---------|
| `next.config.js` | Next.js settings |
| `jsconfig.json` | Path aliases (e.g., `@/*` maps to root) |
| `package.json` | Project metadata and dependencies |
| `.gitignore` | Files to ignore in git |

### Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Complete documentation |
| `GETTING_STARTED.md` | Quick start guide for new users |
| `QUICKSTART.sh` | Automated setup script |

### Content Files

| Location | Purpose |
|----------|---------|
| `public/content/Java/*.md` | Java learning topics |
| `public/content/SQL/*.md` | SQL learning topics |
| `public/content/Angular/*.md` | Angular learning topics |

## Installation Checklist

- [ ] Create project folder
- [ ] Copy all files into folder
- [ ] Run `npm install`
- [ ] Run `npm run dev`
- [ ] Open `http://localhost:3000`

## Component Data Flow

```
App (pages/index.jsx)
├── State
│   ├── topic (current category: "Java", "SQL", etc)
│   ├── subtopic (selected topic: "Collections", etc)
│   ├── content (HTML from markdown)
│   ├── topics (list of available topics)
│   └── loading (loading state)
│
├── API Calls
│   ├── GET /api/topics?category=Java
│   │   └── Returns: ["Collections", "Core-Concepts", ...]
│   │
│   └── GET /api/content?category=Java&subtopic=Collections
│       └── Returns: {content: "<h1>Collections</h1><p>..."}
│
└── Renders
    ├── Header (topic, setTopic)
    ├── Sidebar (topics, selectedTopic, onSelectTopic)
    └── ReadingPane (title, content, loading)
```

## CSS Classes Used

### Header
- `.header` - Main header container
- `.header-left` - Left side (logo and tagline)
- `.header-right` - Right side (dropdown)
- `.logo` - App logo/title
- `.tagline` - Subtitle
- `.topic-dropdown` - Category selector

### Sidebar
- `.sidebar` - Left sidebar container
- `.sidebar-header` - "Topics" heading
- `.topics-list` - Container for topic buttons
- `.topic-item` - Individual topic button
- `.topic-item.active` - Active/selected topic
- `.no-topics` - Message when no topics available
- `.sidebar-footer` - Bottom hint text
- `.sidebar-hint` - Hint message

### Reading Pane
- `.reading-pane` - Main content area
- `.article-title` - Topic title
- `.article-content` - The actual markdown content
- `.empty-state` - Message when no topic selected
- `.loading` - Loading indicator

### Markdown Content Styles
- `.article-content h1/h2/h3` - Headings
- `.article-content p` - Paragraphs
- `.article-content code` - Inline code
- `.article-content pre` - Code blocks
- `.article-content blockquote` - Quotes
- `.article-content a` - Links
- `.article-content table` - Tables

## How Content Loads

1. **User selects category** → "Java"
2. **App fetches topics** → API call to `/api/topics?category=Java`
3. **API reads folder** → `public/content/Java/`
4. **Returns file list** → ["Collections.md", "Core-Concepts.md", ...]
5. **Sidebar displays topics** → User clicks one
6. **App fetches content** → API call to `/api/content?category=Java&subtopic=Collections`
7. **API reads file** → `public/content/Java/Collections.md`
8. **Markdown converted** → HTML using `marked` library
9. **Content displayed** → Rendered in ReadingPane

## Adding Content Step-by-Step

### Adding a Topic to Existing Category

```bash
1. Create file: public/content/Java/My-New-Topic.md
2. Write markdown content
3. Refresh browser
4. Topic appears in sidebar immediately!
```

### Adding a New Category

```bash
1. Create folder: public/content/MyCategory/
2. Create file: public/content/MyCategory/Topic1.md
3. Edit components/Header.jsx - add category to topics array
4. Create more .md files in the folder
5. Restart server
6. Select category from dropdown
```

## Technology Stack Explanation

### Next.js
- Modern React framework
- Server-side rendering
- Built-in API routes (/api folder)
- Automatic code splitting
- Fast development with hot reload

### React
- UI component library
- Hooks for state management
- Re-renders when state changes

### Markdown (via `marked`)
- Simple text format for writing
- Converts to HTML automatically
- Supports code blocks, tables, lists, etc.

### CSS
- Plain CSS (no preprocessor needed)
- CSS variables for theming
- Responsive design with media queries
- Flexbox for layout

## Performance Considerations

✅ **Good Performance Because:**
- No database queries needed
- Static content loaded from files
- Single page app (no full page reloads)
- Markdown parsed on server
- Minimal JavaScript

⚡ **Optimization Tips:**
- Keep markdown files under 2MB
- Use headings to structure content
- Browser caches responses
- Serve from CDN for production

## Security Notes

🔒 **Safe Features:**
- No user input to database
- No SQL injection possible
- No authentication needed
- Static content only
- Running locally is most secure

## Customization Examples

### Change Primary Color
In `styles/globals.css`:
```css
:root {
  --primary-color: #FF6B6B;  /* Change from blue to red */
}
```

### Change App Name
In `components/Header.jsx`:
```jsx
<h1 className="logo">📕 My Learning Hub</h1>
```

### Change Sidebar Width
In `styles/globals.css`:
```css
:root {
  --sidebar-width: 350px;  /* Make it wider */
}
```

### Add Dark Mode
In `styles/globals.css`:
```css
@media (prefers-color-scheme: dark) {
  body {
    background-color: #1a1a1a;
    color: #f0f0f0;
  }
}
```

## Deployment Options

### Vercel (Recommended - Free)
- Created by Next.js team
- Zero configuration
- Automatic deployments on push
- Free tier is generous

### Netlify (Free)
- GitHub integration
- Automatic builds
- Simple deployment

### Traditional Server
- Any server with Node.js
- Use `npm run build && npm run start`
- Set up as systemd service

## File Size Guide

| Component | Size | Notes |
|-----------|------|-------|
| Next.js build | ~2-3MB | Includes all code and dependencies |
| Single markdown | <50KB | Keep well-organized |
| Total markdown | Unlimited | Server can handle large libraries |

## Best Practices Summary

✅ **DO:**
- Organize topics by category
- Use clear file names (with hyphens)
- Write markdown with proper structure
- Include code examples
- Keep content focused and concise
- Use syntax highlighting in code blocks
- Link to related topics
- Regular backups of content

❌ **DON'T:**
- Use spaces in file names
- Create deeply nested folders
- Store binary files (images) in markdown
- Mix categories randomly
- Leave incomplete topics
- Use very long markdown files
- Store sensitive information

---

Everything you need to run a professional learning wiki is included! 🚀
