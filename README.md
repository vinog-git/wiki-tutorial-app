# Dev Wiki - Tutorial Application

A simple, Wikipedia-like tutorial app built with Next.js that reads content from Markdown files. Perfect for learning programming concepts and easily extendable with new topics.

## Features

✨ **Simple Stack**
- Next.js for easy setup and local development
- React for UI components
- Markdown for content files
- Plain CSS for styling

📚 **Easy Content Management**
- Add topics by creating `.md` files
- Automatically loads markdown files
- Organize topics in categories (Java, SQL, Angular, etc.)

🎨 **Clean UI**
- Header with category dropdown selector
- Left sidebar with topic list
- Main reading pane for content
- Responsive design
- Syntax highlighting for code blocks

⚡ **Zero Configuration**
- Run locally with simple commands
- No database needed
- Static content from files

## Project Structure

```
wiki-tutorial/
├── pages/
│   ├── index.jsx              # Main app page
│   ├── api/
│   │   ├── topics.js          # API to list topics
│   │   └── content.js         # API to fetch content
├── components/
│   ├── Header.jsx             # Header with dropdown
│   ├── Sidebar.jsx            # Topics list
│   └── ReadingPane.jsx        # Content display
├── styles/
│   └── globals.css            # Main stylesheet
├── public/
│   └── content/               # Markdown files
│       ├── Java/
│       │   ├── Core-Concepts.md
│       │   ├── Collections.md
│       │   └── ...
│       ├── SQL/
│       │   ├── Basic-Queries.md
│       │   ├── Joins.md
│       │   └── ...
│       └── Angular/
│           ├── Components.md
│           ├── Services.md
│           └── ...
├── package.json
├── next.config.js
└── README.md
```

## Installation

### Prerequisites
- Node.js 16+ and npm

### Setup Steps

1. **Clone or create project directory**
```bash
mkdir wiki-tutorial
cd wiki-tutorial
```

2. **Initialize Node project (if starting fresh)**
```bash
npm init -y
```

3. **Install dependencies**
```bash
npm install react react-dom next gray-matter marked
```

4. **Create project structure**
```bash
# Create directories
mkdir -p pages/api components styles public/content/{Java,SQL,Angular}

# Create empty files (they'll be filled with content)
touch pages/index.jsx
touch pages/api/{topics.js,content.js}
touch components/{Header.jsx,Sidebar.jsx,ReadingPane.jsx}
touch styles/globals.css
touch next.config.js
```

5. **Copy the provided files** into their respective locations

## Running the App

### Development Mode
```bash
npm run dev
```

The app will be available at: `http://localhost:3000`

### Production Build
```bash
npm run build
npm run start
```

## Adding New Topics

### Step 1: Create Markdown File

Add a new `.md` file in the appropriate category folder:

```bash
# For a new Java topic
touch public/content/Java/Streams-and-Lambdas.md
```

### Step 2: Write Content

Edit the markdown file with your content:

```markdown
# Streams and Lambdas

## What are Streams?

Streams in Java provide a functional way to process collections...

## Example

\`\`\`java
List<Integer> numbers = Arrays.asList(1, 2, 3, 4, 5);
numbers.stream()
    .filter(n -> n % 2 == 0)
    .forEach(System.out::println);
\`\`\`

## Key Points

- Points to remember
- ...
```

### Step 3: Refresh the App

The new topic will automatically appear in the sidebar when you select that category!

## Adding New Categories

### Step 1: Create Category Folder

```bash
mkdir public/content/Python
mkdir public/content/React
```

### Step 2: Add Content Files

Create `.md` files in the new category folder.

### Step 3: Update Header Component

Edit `components/Header.jsx` and add the new category to the topics array:

```jsx
const topics = ['Java', 'SQL', 'Angular', 'Python', 'React'];
```

### Step 4: Restart the App

```bash
npm run dev
```

The new category will appear in the header dropdown!

## Markdown Syntax Guide

The app supports standard markdown syntax:

```markdown
# Heading 1
## Heading 2
### Heading 3

**Bold text**
*Italic text*
`inline code`

\`\`\`java
// Code block
public static void main(String[] args) {
    System.out.println("Hello");
}
\`\`\`

- Bullet list
- Second item

1. Numbered list
2. Second item

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |

> Blockquote

[Link text](https://example.com)
```

## Tips for Content Organization

### Naming Conventions

- Use descriptive, hyphenated names: `Core-Concepts.md` not `core.md`
- Match capitalization: `Java`, not `JAVA` or `java`
- Use clear topic titles

### Content Structure

Each topic should have:

```markdown
# Topic Title

## Introduction
Brief explanation of what this is

## Key Concepts
Main ideas with examples

## Code Examples
Practical, runnable examples

## Best Practices
Do's and don'ts

## Next Steps
What to learn next
```

### Example Topic Folder

```
Java/
├── Core-Concepts.md        # Basics
├── Collections.md          # Data structures
├── Streams-and-Lambdas.md # Modern features
├── Exception-Handling.md   # Error management
├── Multithreading.md       # Concurrency
└── Spring-Boot.md          # Framework
```

## Customization

### Change App Name

Edit `pages/index.jsx` and `components/Header.jsx`:

```jsx
<h1 className="logo">🎓 My Learning Wiki</h1>
```

### Change Colors

Edit `styles/globals.css`:

```css
:root {
  --primary-color: #2563eb;      /* Blue */
  --secondary-color: #1e40af;    /* Dark blue */
  /* ... change to your colors ... */
}
```

### Change Fonts

Edit `styles/globals.css`:

```css
body {
  font-family: 'Your Font', sans-serif;
}
```

### Adjust Layout

Edit `styles/globals.css` - all layout variables are at the top:

```css
:root {
  --sidebar-width: 250px;    /* Change sidebar width */
  --header-height: 80px;     /* Change header height */
}
```

## Deployment

### Deploy to Vercel (Recommended)

Vercel is the creator of Next.js and offers free hosting:

```bash
npm install -g vercel
vercel
```

### Deploy to Netlify

1. Push your code to GitHub
2. Connect repository to Netlify
3. Build command: `npm run build`
4. Publish directory: `.next`

## Troubleshooting

### Markdown not loading?

- Check file names match category dropdown values
- Ensure `.md` extension is lowercase
- Verify folder structure: `public/content/Category/Topic.md`

### Styles not applying?

- Clear browser cache
- Restart development server
- Check `styles/globals.css` is imported

### New category not appearing?

- Don't forget to add it to `Header.jsx` topics array
- Restart the development server
- Create at least one `.md` file in the category folder

## Browser Support

- Chrome/Chromium (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance Tips

- Keep markdown files under 2MB
- Use clear headings for better navigation
- Break very long topics into multiple files
- Use code blocks for all code examples

## Contributing More Topics

Here's a quick checklist for each new topic:

- [ ] Clear, descriptive title
- [ ] Brief introduction
- [ ] Practical code examples
- [ ] Common mistakes section
- [ ] Next steps/related topics
- [ ] Proper markdown formatting
- [ ] Proofread for typos

## Getting Help

If you encounter issues:

1. Check that file paths are correct
2. Verify markdown syntax is valid
3. Ensure category folder exists
4. Check browser console for errors (F12)
5. Try clearing cache and restarting server

## License

This project is open source and free to use for learning.

## Future Enhancements

Potential features to add:

- 🔍 Full-text search
- 🌙 Dark mode toggle
- 📌 Bookmarks/favorites
- 💬 Comments on topics
- 📊 Progress tracking
- 🏷️ Tags and filtering
- ⭐ Ratings system

## Quick Reference

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Start dev server | `npm run dev` |
| Build for production | `npm run build` |
| Start production server | `npm run start` |

---

Happy learning! 🚀

For questions or suggestions, feel free to expand and customize this app for your needs!
