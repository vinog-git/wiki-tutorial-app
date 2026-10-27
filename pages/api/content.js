import fs from 'fs';
import path from 'path';
import { marked } from 'marked';

// marked 11 does not emit heading ids, so an in-page "Contents" list has
// nothing to link to. Add them here, with a counter so repeated headings
// ("Verify", "Try it") still get unique anchors.
function withHeadingIds() {
  const renderer = new marked.Renderer();
  const seen = new Map();

  renderer.heading = (text, level) => {
    const base =
      text
        .replace(/<[^>]+>/g, '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'section';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    const id = n === 0 ? base : `${base}-${n}`;
    return `<h${level} id="${id}">${text}</h${level}>\n`;
  };

  return renderer;
}

// A path segment must not be able to escape the content directory.
const isSafeSegment = (value) => /^[\w.+-]+$/.test(value) && value !== '..';

export default function handler(req, res) {
  const { category, subtopic, example } = req.query;

  if (!category || !subtopic) {
    return res.status(400).json({ error: 'Category and subtopic required' });
  }

  try {
    if (example && !isSafeSegment(example)) {
      return res.status(400).json({ error: 'Invalid example' });
    }
    if (!isSafeSegment(subtopic)) {
      return res.status(400).json({ error: 'Invalid subtopic' });
    }

    const filePath = path.join(
      process.cwd(),
      'public',
      'content',
      category,
      ...(example ? [example] : []),
      `${subtopic}.md`
    );

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Content not found' });
    }

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const htmlContent = marked(fileContent, { renderer: withHeadingIds() });

    res.status(200).json({ content: htmlContent });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
}
