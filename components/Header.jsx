import React from 'react';

export default function Header({ topic, setTopic }) {
  const topics = ['Learning-Path', 'Java', 'Docker', 'Kubernetes', 'AWS', 'Kafka', 'Kibana', 'Grafana', 'SQL', 'Angular', 'React', 'AI', 'Domain', 'Examples'];

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo-mark">{'{}'}</div>
        <div className="logo-text">
          <span className="logo">Dev Wiki</span>
          <span className="tagline">Learn programming concepts</span>
        </div>
      </div>

      <div className="topic-switcher" role="tablist" aria-label="Topic">
        {topics.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={topic === t}
            className={`topic-tab ${topic === t ? 'active' : ''}`}
            onClick={() => setTopic(t)}
          >
            {t}
          </button>
        ))}
      </div>
    </header>
  );
}
