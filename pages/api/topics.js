import fs from 'fs';
import path from 'path';

// A path segment must not be able to escape the content directory.
const isSafeSegment = (value) => /^[\w.+-]+$/.test(value) && value !== '..';

export default function handler(req, res) {
  const { category, example } = req.query;

  if (!category) {
    return res.status(400).json({ error: 'Category required' });
  }

  try {
    if (example && !isSafeSegment(example)) {
      return res.status(400).json({ error: 'Invalid example' });
    }

    const contentDir = example
      ? path.join(process.cwd(), 'public', 'content', category, example)
      : path.join(process.cwd(), 'public', 'content', category);
    
    if (!fs.existsSync(contentDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(contentDir);
    const topics = files
      .filter((file) => file.endsWith('.md'))
      .map((file) => file.replace('.md', ''))
      .sort();

    const orderPath = path.join(contentDir, '_order.json');
    if (fs.existsSync(orderPath)) {
      const order = JSON.parse(fs.readFileSync(orderPath, 'utf-8'));
      const known = new Set(topics);
      const ordered = order.filter((t) => known.has(t));
      const remaining = topics.filter((t) => !order.includes(t));
      return res.status(200).json([...ordered, ...remaining]);
    }

    res.status(200).json(topics);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
}
