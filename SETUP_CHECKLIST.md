# 📋 Dev Wiki - Complete Setup Checklist

## Files You Need to Copy

### Step 1: Create Folder Structure

```bash
# Create main project folder
mkdir wiki-tutorial
cd wiki-tutorial

# Create subdirectories
mkdir -p pages/api
mkdir -p components
mkdir -p styles
mkdir -p public/content/Java
mkdir -p public/content/SQL
mkdir -p public/content/Angular
```

### Step 2: Copy These Exact Files

#### Root Level Files (in wiki-tutorial/)
- [ ] `package.json` - Dependencies
- [ ] `next.config.js` - Next.js config
- [ ] `jsconfig.json` - Path aliases
- [ ] `.gitignore` - Git ignore
- [ ] `README.md` - Full documentation
- [ ] `GETTING_STARTED.md` - Quick start
- [ ] `PROJECT_SUMMARY.md` - Overview
- [ ] `COMPLETE_REFERENCE.md` - Technical details
- [ ] `VISUAL_DIAGRAMS.md` - Diagrams
- [ ] `QUICKSTART.sh` - Auto setup script

#### Pages Files (pages/)
- [ ] `index.jsx` - Main app component

#### API Files (pages/api/)
- [ ] `topics.js` - Get topic list API
- [ ] `content.js` - Get content API

#### Components (components/)
- [ ] `Header.jsx` - Top navigation
- [ ] `Sidebar.jsx` - Left sidebar
- [ ] `ReadingPane.jsx` - Content area

#### Styles (styles/)
- [ ] `globals.css` - All styling

#### Content Files (public/content/)

**Java Topics** (public/content/Java/)
- [ ] `Core-Concepts.md`
- [ ] `Collections.md`

**SQL Topics** (public/content/SQL/)
- [ ] `Basic-Queries.md`
- [ ] `Joins.md`

**Angular Topics** (public/content/Angular/)
- [ ] `Components.md`
- [ ] `Services.md`

## Total Files: 25

## Step-by-Step Setup

### Part 1: Prepare (2 minutes)

```bash
# Create project folder
mkdir wiki-tutorial
cd wiki-tutorial

# Create all directories
mkdir -p pages/api components styles
mkdir -p public/content/{Java,SQL,Angular}
```

### Part 2: Copy Files (5 minutes)

**Method A: Manual Copy (If not using command line)**
1. Create each file listed above
2. Copy content from provided files into each
3. Make sure file names match exactly

**Method B: Command Line**
```bash
# Copy source files from provided zip/folder
cp -r [source]/* .

# Verify structure
ls -la
# Should see: pages/ components/ styles/ public/ package.json ...
```

### Part 3: Install & Run (3 minutes)

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser
# http://localhost:3000
```

### Part 4: Verify (1 minute)

- [ ] Page loads at http://localhost:3000
- [ ] Header visible with "Dev Wiki" title
- [ ] Dropdown shows categories (Java, SQL, Angular)
- [ ] Sidebar shows topics
- [ ] Select a topic and see content

## File Size Reference

| File | Size | Type |
|------|------|------|
| package.json | ~300 bytes | Config |
| next.config.js | ~100 bytes | Config |
| jsconfig.json | ~150 bytes | Config |
| pages/index.jsx | ~2 KB | React |
| components/Header.jsx | ~1 KB | React |
| components/Sidebar.jsx | ~1.5 KB | React |
| components/ReadingPane.jsx | ~1 KB | React |
| pages/api/topics.js | ~500 bytes | API |
| pages/api/content.js | ~750 bytes | API |
| styles/globals.css | ~15 KB | CSS |
| Documentation files | ~50 KB | Markdown |
| Sample markdown topics | ~40 KB | Content |

**Total source code: ~120 KB** (very small!)
**With node_modules: ~600 MB**

## Troubleshooting Setup

### Problem: "npm: command not found"
**Solution:** Install Node.js from https://nodejs.org/

### Problem: "Module not found" errors
**Solution:** Make sure you ran `npm install`

### Problem: Port 3000 already in use
**Solution 1:** Kill process using port
```bash
# macOS/Linux
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID [PID] /F
```

**Solution 2:** Use different port
```bash
npm run dev -- -p 3001
# Then go to http://localhost:3001
```

### Problem: Files not showing up
**Check:**
- [ ] Files in correct folders?
- [ ] File names spelled correctly?
- [ ] Markdown files in public/content/Category/?
- [ ] Category added to Header.jsx topics array?
- [ ] Server restarted?

## Verification Checklist

### Before Running
- [ ] All files copied
- [ ] Folder structure matches diagram
- [ ] File names exact (case-sensitive on Linux/Mac)
- [ ] Node.js installed (node --version)
- [ ] npm installed (npm --version)

### After npm install
- [ ] node_modules folder created
- [ ] package-lock.json created
- [ ] No error messages

### After npm run dev
- [ ] Compiled successfully
- [ ] No error messages
- [ ] "ready - started server on..."
- [ ] Browser can load http://localhost:3000

### After Opening in Browser
- [ ] Page loads completely
- [ ] All components visible
- [ ] Dropdown works
- [ ] Sidebar shows topics
- [ ] Content displays when selected

## File Listing Command

Use this to verify your setup:
```bash
# Linux/Mac
tree -I 'node_modules' -L 3

# Or list important files
find . -type f -name "*.jsx" -o -name "*.js" -o -name "*.css" -o -name "*.md" | grep -v node_modules | sort
```

Expected output:
```
./GETTING_STARTED.md
./README.md
./components/Header.jsx
./components/ReadingPane.jsx
./components/Sidebar.jsx
./jsconfig.json
./next.config.js
./package.json
./pages/api/content.js
./pages/api/topics.js
./pages/index.jsx
./public/content/Angular/Components.md
./public/content/Angular/Services.md
./public/content/Java/Collections.md
./public/content/Java/Core-Concepts.md
./public/content/SQL/Basic-Queries.md
./public/content/SQL/Joins.md
./styles/globals.css
```

## Quick Commands Reference

| Command | What it does |
|---------|-------------|
| `npm install` | Install dependencies (do this first!) |
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm test` | Run tests (if configured) |
| `Ctrl + C` | Stop server |

## Starting Over

If something goes wrong, start fresh:

```bash
# Stop the server (Ctrl+C)

# Remove node_modules and cache
rm -rf node_modules package-lock.json

# Reinstall
npm install

# Start again
npm run dev
```

## Next After Setup

1. **Explore** - Read the existing content
2. **Understand** - Study the components and CSS
3. **Customize** - Change colors and text
4. **Create** - Add your first markdown topic
5. **Expand** - Add more categories
6. **Share** - Send to others!

## Success Indicators

✅ **You're ready when:**
- [ ] All files copied
- [ ] npm install completed
- [ ] npm run dev shows "ready"
- [ ] Browser loads http://localhost:3000
- [ ] You can select topics and read content
- [ ] You can add new markdown files and see them appear

## Common Mistakes to Avoid

❌ **Don't:**
- Forget to run `npm install`
- Copy files to wrong folders
- Use wrong file names (case matters!)
- Leave out any .jsx or .js files
- Forget the .gitignore and package.json
- Try to run before all files are copied
- Use npm instead of npm (they're different on some systems)

## Performance Check

After setup, verify performance:
- [ ] Page loads in <2 seconds
- [ ] Topic selection responds instantly
- [ ] No console errors (F12)
- [ ] No memory leaks (check Task Manager)
- [ ] CSS styling loads correctly

## Backup Your Content

```bash
# Backup markdown files
tar -czf wiki-backup.tar.gz public/content/

# Or just copy the folder
cp -r public/content/ ~/wiki-backup/
```

## Next Steps After Successful Setup

1. Read GETTING_STARTED.md
2. Follow PROJECT_SUMMARY.md
3. Look at COMPLETE_REFERENCE.md for customization
4. Create your first topic (see GETTING_STARTED.md)
5. Explore VISUAL_DIAGRAMS.md to understand architecture

---

## Checklist Summary

- [ ] Folder structure created
- [ ] All 25 files copied
- [ ] npm install completed
- [ ] npm run dev started
- [ ] Browser loads http://localhost:3000
- [ ] All components visible and working
- [ ] Can select topics from sidebar
- [ ] Content displays correctly

**If all checked, you're ready to go! 🚀**

---

Need help? Check the documentation files:
- 📖 README.md - Full documentation
- 🚀 GETTING_STARTED.md - Beginner guide
- 📚 PROJECT_SUMMARY.md - Overview
- 🎓 COMPLETE_REFERENCE.md - Technical details
- 📊 VISUAL_DIAGRAMS.md - Architecture diagrams
