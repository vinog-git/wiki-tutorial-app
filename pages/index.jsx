import React, { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import ReadingPane from '@/components/ReadingPane';
import ExamplesIndex from '@/components/ExamplesIndex';

const EXAMPLES = 'Examples';

export default function Home() {
  const router = useRouter();
  const [topic, setTopic] = useState('Java');
  const [subtopic, setSubtopic] = useState(null);
  const [content, setContent] = useState('');
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(false);

  // Examples are two levels deep: a list of examples, then the pages of one.
  // `example` is null while the list is showing.
  const [example, setExample] = useState(null);
  const [examples, setExamples] = useState([]);
  const [examplesLoading, setExamplesLoading] = useState(false);

  // Flipped once the initial URL params have been applied to state. Every
  // other effect waits on it: without the gate they run against the default
  // category first, and the fetch that starts there consumes the subtopic the
  // URL asked for (or writes a half-restored URL back over the real one).
  const [restored, setRestored] = useState(false);
  const initialized = useRef(false);
  // Holds a subtopic from the URL that needs to be restored after topics load.
  const urlSubtopic = useRef(null);

  const inExamplesList = topic === EXAMPLES && !example;
  const activeExample = examples.find((e) => e.slug === example);

  // Restore state from URL query params on first load.
  useEffect(() => {
    if (!router.isReady || initialized.current) return;
    initialized.current = true;
    const { category, subtopic: sub, example: ex } = router.query;
    if (category) setTopic(category);
    if (ex) setExample(ex);
    if (sub) urlSubtopic.current = sub;
    // Batched with the setState calls above, so the first render that sees
    // `restored` also sees the category and example from the URL.
    setRestored(true);
  }, [router.isReady, router.query]);

  // The example list is only needed for that one category.
  useEffect(() => {
    if (!restored || topic !== EXAMPLES || examples.length > 0) return;
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
  }, [restored, topic, examples.length]);

  // Fetch the topic list when the category (or the chosen example) changes.
  // Uses a cancellation flag so a stale response from the previous category
  // can't clobber the subtopic after the user has already switched.
  useEffect(() => {
    if (!restored) return;
    if (inExamplesList) {
      setTopics([]);
      setSubtopic(null);
      setContent('');
      return;
    }

    let cancelled = false;
    const fetchTopics = async () => {
      try {
        const query = new URLSearchParams({ category: topic });
        if (example) query.set('example', example);
        const res = await fetch(`/api/topics?${query}`);
        const data = await res.json();
        if (cancelled) return;
        setTopics(data);
        const desired = urlSubtopic.current;
        urlSubtopic.current = null;
        if (desired && data.includes(desired)) {
          setSubtopic(desired);
        } else if (data.length > 0) {
          setSubtopic(data[0]);
        } else {
          setSubtopic(null);
        }
      } catch (err) {
        if (!cancelled) console.error('Error fetching topics:', err);
      }
    };
    fetchTopics();
    return () => { cancelled = true; };
  }, [restored, topic, example, inExamplesList]);

  // Fetch content and sync the URL whenever the active page changes.
  // URL update is skipped until the router is ready so we never overwrite
  // the original URL params before we've had a chance to read them.
  useEffect(() => {
    if (!restored) return;

    if (inExamplesList) {
      router.replace({ pathname: '/', query: { category: topic } }, undefined, {
        shallow: true,
      });
      return;
    }

    if (!subtopic) return;

    router.replace(
      {
        pathname: '/',
        query: example
          ? { category: topic, example, subtopic }
          : { category: topic, subtopic },
      },
      undefined,
      { shallow: true }
    );

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
  }, [restored, topic, example, subtopic, inExamplesList]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTopicChange = (newTopic) => {
    setTopic(newTopic);
    setExample(null);
    setSubtopic(null);
    setContent('');
  };

  const handleSelectExample = (slug) => {
    setExample(slug);
    setSubtopic(null);
    setContent('');
  };

  const handleBackToExamples = () => {
    setExample(null);
    setSubtopic(null);
    setContent('');
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
        <Header topic={topic} setTopic={handleTopicChange} />

        <div className="main-content">
          {inExamplesList ? (
            <>
              <Sidebar
                heading="Examples"
                topics={examples.map((e) => e.slug)}
                labels={Object.fromEntries(examples.map((e) => [e.slug, e.title]))}
                selectedTopic={null}
                onSelectTopic={handleSelectExample}
              />
              <ExamplesIndex
                examples={examples}
                onSelectExample={handleSelectExample}
                loading={examplesLoading}
              />
            </>
          ) : (
            <>
              <Sidebar
                heading={example ? 'Pages' : 'Topics'}
                topics={topics}
                selectedTopic={subtopic}
                onSelectTopic={setSubtopic}
                onBack={example ? handleBackToExamples : undefined}
                backLabel="All examples"
              />
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
