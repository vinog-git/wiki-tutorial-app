import React from 'react';

/**
 * The landing view for the Examples tab: one card per worked example.
 * Choosing one swaps the sidebar over to that example's pages.
 */
export default function ExamplesIndex({ examples, onSelectExample, loading }) {
  if (loading) {
    return (
      <main className="reading-pane">
        <div className="loading">
          <span className="spinner" />
          Loading…
        </div>
      </main>
    );
  }

  return (
    <main className="reading-pane">
      <div className="article-wrap">
        <div className="examples-intro">
          <h1>Examples</h1>
          <p>
            Complete, working projects — each one built from scratch, with the
            traps called out where they were actually hit.
          </p>
        </div>

        {examples.length === 0 ? (
          <div className="empty-state">
            <p>No examples yet</p>
          </div>
        ) : (
          <div className="example-cards">
            {examples.map((example) => (
              <button
                key={example.slug}
                type="button"
                className="example-card"
                onClick={() => onSelectExample(example.slug)}
              >
                <div className="example-card-head">
                  <h2>{example.title}</h2>
                  <span className="example-card-count">
                    {example.pageCount} {example.pageCount === 1 ? 'page' : 'pages'}
                  </span>
                </div>

                {example.summary && (
                  <p className="example-card-summary">{example.summary}</p>
                )}
                {example.description && (
                  <p className="example-card-description">{example.description}</p>
                )}

                {example.stack.length > 0 && (
                  <div className="example-card-stack">
                    {example.stack.map((item) => (
                      <span key={item} className="example-tag">
                        {item}
                      </span>
                    ))}
                  </div>
                )}

                {example.facts.length > 0 && (
                  <dl className="example-card-facts">
                    {example.facts.map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
