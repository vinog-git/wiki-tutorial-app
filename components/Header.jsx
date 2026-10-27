import React from 'react';

export default function Header({ topic, setTopic }) {
  const topics = ['Learning-Path', 'Java', 'Docker', 'Kubernetes', 'AWS', 'Kafka', 'Kibana', 'Grafana', 'SQL', 'Angular', 'React', 'AI', 'Domain', 'Examples'];

  return (
    <header className="header">
      <div className="header-left">
        <div className="logo-mark">{'{}'}</div>
        <div className="logo-text">
          <span className="logo">Dev Wiki</span>
        </div>
      </div>

      <select
        className="topic-select"
        aria-label="Topic"
        value={topic}
        onChange={(e) => {
          setTopic(e.target.value);
          e.target.blur();
        }}
      >
        {topics.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </header>
  );
}
