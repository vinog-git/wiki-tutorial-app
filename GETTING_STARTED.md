# Getting Started with Dev Wiki

Welcome to Dev Wiki! This is a simple, self-hosted tutorial application perfect for learning programming concepts.

## 5-Minute Setup

### Step 1: Install Node.js
Download and install from https://nodejs.org/ (choose the LTS version)

### Step 2: Copy All Files
Copy all project files into a folder on your computer:
```
wiki-tutorial/
├── pages/
├── components/
├── styles/
├── public/
├── package.json
├── next.config.js
└── ...
```

### Step 3: Install Dependencies
Open terminal/command prompt in the project folder and run:
```bash
npm install
```

### Step 4: Start the App
```bash
npm run dev
```

### Step 5: Open in Browser
Go to: **http://localhost:3000**

That's it! 🎉

## Using the App

### Navigation

1. **Header (Top)**: Select a category from the dropdown
   - Java
   - SQL
   - Angular
   - (Add more categories as you create content)

2. **Sidebar (Left)**: Browse topics in the selected category
   - Click any topic to read it
   - Topics are highlighted when selected

3. **Main Area (Center)**: Read the content
   - Markdown is converted to formatted HTML
   - Code blocks are displayed clearly
   - Tables and lists are formatted nicely

## Adding Your First Topic

### Easy Steps

1. **Create a markdown file**
   ```
   public/content/Java/My-New-Topic.md
   ```

2. **Write some content** using markdown:
   ```markdown
   # My Topic

   This is my learning note.

   ## Sub-heading

   Some content here.

   \`\`\`java
   // Code example
   System.out.println("Hello");
   \`\`\`
   ```

3. **Refresh browser** - It will appear automatically!

## Common Tasks

### Stop the App
Press `Ctrl + C` in the terminal

### Restart the App
```bash
npm run dev
```

### Make the App Production-Ready
```bash
npm run build
npm run start
```

### Add a New Category
1. Create folder: `public/content/YourCategory/`
2. Add `.md` files to it
3. Edit `components/Header.jsx`:
   ```jsx
   const topics = ['Java', 'SQL', 'Angular', 'YourCategory'];
   ```
4. Restart app

## Markdown Syntax Quick Reference

```markdown
# Heading 1
## Heading 2

**Bold text**
*Italic text*

- Bullet point
- Another point

1. Numbered item
2. Another item

\`\`\`javascript
// Code block
console.log("Hello");
\`\`\`

| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |

[Link text](https://example.com)

> Quote text
```

## File Structure Tips

**Good organization:**
```
Java/
├── Core-Concepts.md
├── Collections.md
├── Exception-Handling.md
└── Streams.md

SQL/
├── Basic-Queries.md
├── Joins.md
└── Advanced-Queries.md

Angular/
├── Components.md
├── Services.md
└── Routing.md
```

## Troubleshooting

### Problem: "command not found: npm"
**Solution:** Install Node.js from https://nodejs.org/

### Problem: Port 3000 already in use
**Solution:** Change port in package.json or kill the process using port 3000

### Problem: Markdown not showing
**Solution:** Check file location is `public/content/Category/Topic.md`

### Problem: New topic not appearing
**Solution:** 
1. Check folder exists: `public/content/YourCategory/`
2. Restart the dev server
3. Clear browser cache

### Problem: Styles look broken
**Solution:** 
1. Clear browser cache (Ctrl+Shift+Delete)
2. Restart dev server
3. Hard refresh browser (Ctrl+Shift+R)

## Tips for Best Results

✅ **Do:**
- Use clear, descriptive file names
- Organize topics into logical categories
- Write in markdown format
- Keep markdown files under 2MB
- Include code examples
- Add related topics section at the end

❌ **Don't:**
- Use special characters in file names
- Mix categories arbitrarily
- Forget the `.md` extension
- Put spaces in file names (use hyphens instead)
- Use complex HTML - markdown is simpler

## Next Steps

1. **Explore the existing content** to see examples
2. **Create your first topic** in the Java or SQL category
3. **Add a new category** with topics you want to learn
4. **Share with others** - send them the folder and they can run it too!

## Need Help?

- Check the full README.md for detailed documentation
- Look at existing markdown files for examples
- Try the Markdown syntax in your editor to preview

## Have Fun Learning! 🚀

This is YOUR wiki - make it yours by adding the content you want to learn!

Questions? Ideas? Just add more markdown files and watch them appear! ✨
