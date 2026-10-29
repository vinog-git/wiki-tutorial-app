import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

const MAX_TOPICS = 6;
const MAX_SUBTOPICS = 12;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The words typed, lowercased. Each word has to match, in any order.
const wordsOf = (query) => query.trim().toLowerCase().split(/\s+/).filter(Boolean);

const countPages = (count) => `${count} ${count === 1 ? 'page' : 'pages'}`;

// Where a result lives, shown under its name.
const metaOf = (entry) => {
  if (entry.kind === 'topic') return countPages(entry.pageCount);
  if (entry.kind === 'example') return `Examples · ${countPages(entry.pageCount)}`;
  return entry.exampleTitle ? `Examples › ${entry.exampleTitle}` : entry.category;
};

// Lower is better, and null means no match. A match on the name beats one
// that only comes from where the result lives.
function rank(entry, words) {
  const name = entry.label.toLowerCase();
  const meta = metaOf(entry).toLowerCase();
  if (!words.every((word) => name.includes(word) || meta.includes(word))) return null;
  if (name.startsWith(words.join(' '))) return 0;
  if (words.every((word) => name.includes(word))) return 1;
  return 2;
}

function findMatches(entries, query) {
  const words = wordsOf(query);
  if (words.length === 0) return { topics: [], subtopics: [], total: 0 };

  // Sorting is stable, so equal scores keep the header's topic order.
  const ranked = entries
    .map((entry) => ({ entry, score: rank(entry, words) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => a.score - b.score)
    .map(({ entry }) => entry);

  const topics = ranked.filter((entry) => entry.kind === 'topic');
  const subtopics = ranked.filter((entry) => entry.kind !== 'topic');
  return {
    topics: topics.slice(0, MAX_TOPICS),
    subtopics: subtopics.slice(0, MAX_SUBTOPICS),
    total: ranked.length,
  };
}

// Marks each typed word in the text, so the reader can see why a row matched.
function Highlight({ text, words }) {
  if (words.length === 0) return text;
  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi');
  // The pattern has one capture group, so split() puts each match at an odd index.
  return text.split(pattern).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="search-hit">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

/**
 * Header search across topics, examples and pages. Results appear as the user
 * types. Choosing one passes it to the page, which navigates there, so the
 * Topic and page dropdowns both show the match.
 */
export default function Search({ onSelect }) {
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  const [entries, setEntries] = useState(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  // The index is small, so it is fetched once and searched in the browser.
  useEffect(() => {
    let cancelled = false;
    const loadEntries = async () => {
      try {
        const res = await fetch('/api/search');
        if (!res.ok) throw new Error(`Search index returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) setEntries(data);
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading search index:', err);
          setFailed(true);
        }
      }
    };
    loadEntries();
    return () => { cancelled = true; };
  }, []);

  // Closes the list when the user clicks anywhere outside the search box.
  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const words = wordsOf(query);
  const { topics, subtopics, total } = useMemo(
    () => findMatches(entries ?? [], query),
    [entries, query]
  );
  const options = [...topics, ...subtopics];
  const showList = open && words.length > 0;
  const optionId = (index) => `${listId}-option-${index}`;

  // Keeps the highlighted row in view as the arrow keys move through the list.
  useEffect(() => {
    if (showList) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  }, [active, showList]);

  const choose = (entry) => {
    onSelect(entry);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!showList) {
        setOpen(true);
        return;
      }
      if (options.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index + step + options.length) % options.length);
    } else if (event.key === 'Enter' && showList && options[active]) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  // Keyed by what the entry points to, so two pages with the same name stay apart.
  const renderOption = (entry, index) => {
    const isActive = index === active;
    // Stops the input losing focus before the click lands.
    const keepFocus = (event) => event.preventDefault();

    return (
      <div
        key={`${entry.kind}:${entry.category}:${entry.example ?? ''}:${entry.subtopic ?? ''}`}
        id={optionId(index)}
        role="option"
        aria-selected={isActive}
        className={`search-option${isActive ? ' is-active' : ''}`}
        onMouseDown={keepFocus}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(entry)}
      >
        <span className="search-option-name">
          <Highlight text={entry.label} words={words} />
        </span>
        <span className="search-option-meta">
          <Highlight text={metaOf(entry)} words={words} />
        </span>
      </div>
    );
  };

  return (
    <div className="header-search" ref={rootRef}>
      <div className="search-field">
        <svg
          className="search-icon"
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          className="search-input"
          placeholder="Search topics and sub topics"
          aria-label="Search topics and sub topics"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={showList}
          aria-activedescendant={showList && options[active] ? optionId(active) : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </div>

      {showList && (
        <div className="search-results">
          <div role="listbox" id={listId} aria-label="Search results">
            {topics.length > 0 && (
              <>
                <div className="search-group-title" role="presentation">
                  Topics
                </div>
                {topics.map((entry, i) => renderOption(entry, i))}
              </>
            )}
            {subtopics.length > 0 && (
              <>
                <div className="search-group-title" role="presentation">
                  Sub topics
                </div>
                {subtopics.map((entry, i) => renderOption(entry, topics.length + i))}
              </>
            )}
          </div>

          {failed && <p className="search-status">Search is unavailable right now.</p>}
          {!failed && !entries && <p className="search-status">Loading…</p>}
          {entries && total === 0 && (
            <p className="search-status">Nothing matches “{query.trim()}”.</p>
          )}
          {total > options.length && (
            <p className="search-status">
              Showing {options.length} of {total} matches. Keep typing to narrow the list.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
