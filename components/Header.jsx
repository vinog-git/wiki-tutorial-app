import React from 'react';
import Search from '@/components/Search';
import { TOPICS } from '@/lib/topics';

export default function Header({ topic, setTopic, sidebarOpen, onToggleSidebar, onSearchSelect }) {
  return (
    <header className="header">
      <div className="header-left">
        <button
          type="button"
          className="sidebar-toggle"
          aria-label={sidebarOpen ? 'Hide menu' : 'Show menu'}
          aria-expanded={sidebarOpen}
          title={sidebarOpen ? 'Hide menu' : 'Show menu'}
          onClick={onToggleSidebar}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <line x1="9" y1="4" x2="9" y2="20" />
          </svg>
        </button>
        <div className="logo-mark">{'{}'}</div>
        <div className="logo-text">
          <span className="logo">Dev Wiki</span>
        </div>
      </div>

      <Search onSelect={onSearchSelect} />

      <select
        className="topic-select"
        aria-label="Topic"
        value={topic}
        onChange={(e) => {
          setTopic(e.target.value);
          e.target.blur();
        }}
      >
        {TOPICS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </header>
  );
}
