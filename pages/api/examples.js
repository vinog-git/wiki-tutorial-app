import fs from 'fs';
import path from 'path';

const EXAMPLES_DIR = path.join(process.cwd(), 'public', 'content', 'Examples');

/**
 * Lists the examples: one sub-directory of public/content/Examples each.
 *
 * Adding an example means dropping in a folder with an _example.json (title,
 * summary, stack) and the usual _order.json plus markdown pages. Nothing here
 * or in the UI has to change.
 */
export default function handler(req, res) {
  try {
    if (!fs.existsSync(EXAMPLES_DIR)) {
      return res.status(200).json([]);
    }

    const examples = fs
      .readdirSync(EXAMPLES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const metaPath = path.join(EXAMPLES_DIR, entry.name, '_example.json');
        const meta = fs.existsSync(metaPath)
          ? JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
          : {};
        const pages = fs
          .readdirSync(path.join(EXAMPLES_DIR, entry.name))
          .filter((file) => file.endsWith('.md'));

        return {
          slug: entry.name,
          title: meta.title || entry.name.replace(/-/g, ' '),
          summary: meta.summary || '',
          description: meta.description || '',
          stack: meta.stack || [],
          facts: meta.facts || [],
          pageCount: pages.length,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    res.status(200).json(examples);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to list examples' });
  }
}
