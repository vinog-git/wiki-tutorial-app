import React from 'react';

export default function Sidebar({ topics, selectedTopic, onSelectTopic, heading = 'Topics', onBack, backLabel, labels }) {
  return (
    <aside className="sidebar">
      {onBack && (
        <button type="button" className="sidebar-back" onClick={onBack}>
          <span aria-hidden="true">&larr;</span> {backLabel}
        </button>
      )}

      <div className="sidebar-header">
        <h2>{heading}</h2>
      </div>

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
