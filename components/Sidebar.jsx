import React from 'react';

export default function Sidebar({ topics, selectedTopic, onSelectTopic, onBack, backLabel, labels }) {
  return (
    <aside className="sidebar">
      {onBack && (
        <button type="button" className="sidebar-back" onClick={onBack}>
          <span aria-hidden="true">&larr;</span> {backLabel}
        </button>
      )}

      {topics.length > 0 && (
        <select
          className="topic-dropdown"
          aria-label="Page"
          value={selectedTopic ?? ''}
          onChange={(e) => {
            onSelectTopic(e.target.value);
            e.target.blur();
          }}
        >
          {selectedTopic == null && (
            <option value="" disabled>
              Choose a page
            </option>
          )}
          {topics.map((topic) => (
            <option key={topic} value={topic}>
              {labels?.[topic] ?? topic.replace(/-/g, ' ')}
            </option>
          ))}
        </select>
      )}

      <div className="topics-list">
        {topics.length === 0 ? (
          <p className="no-topics">No topics available</p>
        ) : (
          topics.map((topic) => (
            <button
              key={topic}
              type="button"
              className={`topic-item ${selectedTopic === topic ? 'active' : ''}`}
              onClick={() => onSelectTopic(topic)}
            >
              {labels?.[topic] ?? topic.replace(/-/g, ' ')}
            </button>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <p className="sidebar-hint">Select a topic to read</p>
      </div>
    </aside>
  );
}
