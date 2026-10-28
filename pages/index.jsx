import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ReadingPane from '@/components/ReadingPane';
import ExamplesIndex from '@/components/ExamplesIndex';

const EXAMPLES = 'Examples';

// Names which page list a category and example produce, so a list fetched for
// one can't be mistaken for another.
const listKeyOf = (topic, example) => `${topic}/${example ?? ''}`;

export default function Home() {
  const router = useRouter();
  // The URL is the source of truth. Choosing something pushes a new URL, and
  // back and forward just change it, so every view is derived from these params.
  const { category, subtopic: urlSubtopic, example } = router.query;
  // Query params are empty until the router is ready. Fetching before then
  // would load the default category and ignore the one in the link.
  const ready = router.isReady;
  const topic = category || 'Java';
  const inExamplesList = topic === EXAMPLES && !example;

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [topicList, setTopicList] = useState({ key: null, items: [] });
  // Hides the side menu so the reading pane can use the full width.
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Examples are two levels deep: a list of examples, then the pages of one.
  const [examples, setExamples] = useState([]);
  const [examplesLoading, setExamplesLoading] = useState(false);

  // A list fetched for another category counts as empty until this one arrives.
  const topics = topicList.key === listKeyOf(topic, example) ? topicList.items : [];
  // Falls back to the first page when the URL names none, or one that doesn't exist.
  const subtopic = topics.includes(urlSubtopic) ? urlSubtopic : (topics[0] ?? null);
  const activeExample = examples.find((e) => e.slug === example);

  // The example list is only needed for that one category.
  useEffect(() => {
    if (!ready || topic !== EXAMPLES || examples.length > 0) return;
    let cancelled = false;
    const fetchExamples = async () => {
      setExamplesLoading(true);
      try {
        const res = await fetch('/api/examples');
        const data = await res.json();
        if (!cancelled) setExamples(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled) console.error('Error fetching examples:', err);
      } finally {
        if (!cancelled) setExamplesLoading(false);
      }
    };
    fetchExamples();
    return () => { cancelled = true; };
  }, [ready, topic, examples.length]);

  // Fetch the page list whenever the category or example changes.
  // Uses a cancellation flag so a stale response from the previous category
  // can't land after the user has already moved on.
  useEffect(() => {
    if (!ready || inExamplesList) return;

    let cancelled = false;
    const fetchTopics = async () => {
      try {
        const query = new URLSearchParams({ category: topic });
        if (example) query.set('example', example);
        const res = await fetch(`/api/topics?${query}`);
        const data = await res.json();
        if (!cancelled) setTopicList({ key: listKeyOf(topic, example), items: data });
      } catch (err) {
        if (!cancelled) console.error('Error fetching topics:', err);
      }
    };
    fetchTopics();
    return () => { cancelled = true; };
  }, [ready, topic, example, inExamplesList]);

  // Fetch the page content whenever the active page changes.
  useEffect(() => {
    if (!ready || inExamplesList || !subtopic) {
      setContent('');
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchContent = async () => {
      setLoading(true);
      try {
        const query = new URLSearchParams({ category: topic, subtopic });
        if (example) query.set('example', example);
        const res = await fetch(`/api/content?${query}`);
        const data = await res.json();
        if (!cancelled) setContent(data.content);
      } catch (err) {
        if (!cancelled) {
          console.error('Error fetching content:', err);
          setContent('Error loading content');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchContent();
    return () => { cancelled = true; };
  }, [ready, topic, example, subtopic, inExamplesList]);

  // Each change of view is pushed, not replaced, so it gets its own history
  // entry and the browser's back and forward buttons can step through them.
  const navigate = (query) => {
    router.push({ pathname: '/', query }, undefined, { shallow: true });
  };

  const handleTopicChange = (newTopic) => {
    navigate({ category: newTopic });
  };

  const handleSelectExample = (slug) => {
    navigate({ category: topic, example: slug });
  };

  const handleBackToExamples = () => {
    navigate({ category: topic });
  };

  const handleSelectSubtopic = (name) => {
    // Re-picking the open page would stack an identical history entry.
    if (name === subtopic) return;
    navigate(
      example
        ? { category: topic, example, subtopic: name }
        : { category: topic, subtopic: name }
    );
  };

  return (
    <>
      <Head>
        <title>Dev Wiki - Learn Programming</title>
        <meta name="description" content="A simple wiki for learning programming" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="app-container">
        <Header
        topic={topic}
        setTopic={handleTopicChange}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((open) => !open)}
      />

        <div className="main-content">
          {inExamplesList ? (
            <>
              {sidebarOpen && (
                <Sidebar
                  topics={examples.map((e) => e.slug)}
                  labels={Object.fromEntries(examples.map((e) => [e.slug, e.title]))}
                  selectedTopic={null}
                  onSelectTopic={handleSelectExample}
                />
              )}
              <ExamplesIndex
                examples={examples}
                onSelectExample={handleSelectExample}
                loading={examplesLoading}
              />
            </>
          ) : (
            <>
              {sidebarOpen && (
                <Sidebar
                  topics={topics}
                  selectedTopic={subtopic}
                  onSelectTopic={handleSelectSubtopic}
                  onBack={example ? handleBackToExamples : undefined}
                  backLabel="All examples"
                />
              )}
              <ReadingPane
                topic={topic}
                parent={activeExample?.title}
                title={subtopic}
                content={content}
                loading={loading}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
