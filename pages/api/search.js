import fs from 'fs';
import path from 'path';
import { TOPICS } from '@/lib/topics';

const CONTENT_DIR = path.join(process.cwd(), 'public', 'content');
const EXAMPLES = 'Examples';

const titleOf = (name) => name.replace(/-/g, ' ');

// Page names in one folder, without the .md extension.
const pagesIn = (dir) =>
  fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.replace('.md', ''))
    .sort();

/**
 * Lists every topic, example and page in one response, so the header search
 * can filter them as the user types without asking the server again.
 *
 * Only file and folder names are read, so a new page shows up in search on
 * the next request. Titles come from the names, as the sidebar shows them.
 */
export default function handler(req, res) {
  try {
    const entries = [];

    for (const category of TOPICS) {
      const categoryDir = path.join(CONTENT_DIR, category);
      if (!fs.existsSync(categoryDir)) continue;

      if (category === EXAMPLES) {
        // Each example is a folder of its own pages, one level deeper.
        const examples = fs
          .readdirSync(categoryDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((folder) => {
            const exampleDir = path.join(categoryDir, folder.name);
            const metaPath = path.join(exampleDir, '_example.json');
            const title = fs.existsSync(metaPath)
              ? JSON.parse(fs.readFileSync(metaPath, 'utf-8')).title || titleOf(folder.name)
              : titleOf(folder.name);
            return { slug: folder.name, title, pages: pagesIn(exampleDir) };
          });

        // The Examples topic counts the pages across all of its examples.
        entries.push({
          kind: 'topic',
          category,
          label: category,
          pageCount: examples.reduce((total, example) => total + example.pages.length, 0),
        });
        for (const example of examples) {
          entries.push({
            kind: 'example',
            category,
            example: example.slug,
            label: example.title,
            pageCount: example.pages.length,
          });
          for (const page of example.pages) {
            entries.push({
              kind: 'page',
              category,
              example: example.slug,
              exampleTitle: example.title,
              subtopic: page,
              label: titleOf(page),
            });
          }
        }
      } else {
        const pages = pagesIn(categoryDir);

        entries.push({ kind: 'topic', category, label: category, pageCount: pages.length });
        for (const page of pages) {
          entries.push({ kind: 'page', category, subtopic: page, label: titleOf(page) });
        }
      }
    }

    res.status(200).json(entries);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to build the search index' });
  }
}
