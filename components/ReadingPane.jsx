import React, { useEffect, useRef } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';

const LANG_NAMES = {
  java: 'Java',
  sql: 'SQL',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  javascript: 'JavaScript',
  js: 'JavaScript',
  html: 'HTML',
  xml: 'HTML',
  css: 'CSS',
  bash: 'Shell',
  shell: 'Shell',
  json: 'JSON',
  jsonc: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  dockerfile: 'Dockerfile',
  nginx: 'nginx',
  groovy: 'Groovy',
  scss: 'SCSS',
  text: 'Text',
  output: 'Output',
};

// Fences we never syntax-highlight: console output and plain text.
const PLAIN_LANGS = new Set(['text', 'output']);

export default function ReadingPane({ topic, parent, title, content, loading }) {
  const ref = useRef(null);
  const prettyTitle = title ? title.replace(/-/g, ' ') : '';

  // Syntax-highlight and decorate code blocks after content renders.
  useEffect(() => {
    const root = ref.current;
    if (!root || !content) return;

    root.querySelectorAll('pre > code').forEach((code) => {
      const cls = [...code.classList].find((c) => c.startsWith('language-'));
      const lang = cls ? cls.replace('language-', '') : '';
      if (cls && !PLAIN_LANGS.has(lang)) {
        try {
          hljs.highlightElement(code);
        } catch (e) {
          /* leave plain on failure */
        }
      }

      const pre = code.parentElement;
      if (pre.parentElement && pre.parentElement.classList.contains('code-block')) {
        return; // already decorated
      }

      const wrap = document.createElement('div');
      wrap.className = lang === 'output' ? 'code-block is-output' : 'code-block';

      const bar = document.createElement('div');
      bar.className = 'code-block-header';

      const label = document.createElement('span');
      label.className = 'code-lang';
      label.textContent = LANG_NAMES[lang] || (lang ? lang : 'Text');
      bar.appendChild(label);

      const btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => {
        const text = code.textContent;
        const done = () => {
          btn.textContent = 'Copied';
          setTimeout(() => {
            btn.textContent = 'Copy';
          }, 1300);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(done);
        } else {
          done();
        }
      });
      bar.appendChild(btn);

      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(bar);
      wrap.appendChild(pre);
    });
  }, [content]);

  return (
    <main className="reading-pane">
      {loading ? (
        <div className="loading">
          <span className="spinner" />
          Loading…
        </div>
      ) : (
        <div className="article-wrap">
          {title && (
            <div className="breadcrumb">
              <span className="crumb-topic">{topic}</span>
              <span className="crumb-sep">/</span>
              {parent && (
                <>
                  <span className="crumb-parent">{parent}</span>
                  <span className="crumb-sep">/</span>
                </>
              )}
              <span className="crumb-title">{prettyTitle}</span>
            </div>
          )}

          {content ? (
            <div
              className="article-content"
              ref={ref}
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            <div className="empty-state">
              <p>Select a topic from the left to get started</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
