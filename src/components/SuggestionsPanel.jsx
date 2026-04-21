import { useRef, useEffect } from 'react';

/** Color + label metadata for each suggestion type. */
const TYPE_META = {
  QUESTION:      { label: 'Question',       colorClass: 'badge--blue'   },
  FACT_CHECK:    { label: 'Fact Check',     colorClass: 'badge--orange' },
  TALKING_POINT: { label: 'Talking Point',  colorClass: 'badge--green'  },
  CLARIFICATION: { label: 'Clarification',  colorClass: 'badge--yellow' },
  ANSWER:        { label: 'Answer',         colorClass: 'badge--purple' },
};

function TypeBadge({ type }) {
  const meta = TYPE_META[type] ?? { label: type, colorClass: 'badge--blue' };
  return <span className={`suggestion-badge ${meta.colorClass}`}>{meta.label}</span>;
}

function SuggestionCard({ suggestion, onClick }) {
  return (
    <button className="suggestion-card" onClick={() => onClick(suggestion)}>
      <div className="suggestion-card-header">
        <TypeBadge type={suggestion.type} />
      </div>
      <p className="suggestion-title">{suggestion.title}</p>
      <p className="suggestion-preview">{suggestion.preview}</p>
    </button>
  );
}

function BatchTimestamp({ ms }) {
  const d  = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '00');
  const ss = String(d.getSeconds()).padStart(2, '00');
  return <span className="batch-timestamp">{hh}:{mm}:{ss}</span>;
}

/**
 * @param {object}   props
 * @param {Array}    props.suggestionBatches
 * @param {boolean}  props.isLoading       – true while a single fetch is in-flight
 * @param {boolean}  props.isRegenerating  – true while multi-batch regeneration runs
 * @param {string}   props.error
 * @param {boolean}  props.hasTranscript
 * @param {Function} props.onRefresh
 * @param {Function} props.onSuggestionClick
 */
export default function SuggestionsPanel({
  suggestionBatches = [],
  isLoading,
  isRegenerating,
  error,
  hasTranscript,
  onRefresh,
  onSuggestionClick,
}) {
  const isEmpty = suggestionBatches.length === 0;

  // Scroll to the top of the list whenever a new batch is prepended
  const topRef = useRef(null);
  useEffect(() => {
    if (suggestionBatches.length > 0) {
      topRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [suggestionBatches]);

  const busy        = isLoading || isRegenerating;
  const loadingText = isRegenerating ? 'Reloading all suggestions…' : 'Generating suggestions…';

  return (
    <div className="panel-content suggestions-panel">

      {/* ── Toolbar ── */}
      <div className="suggestions-toolbar">
        <button
          className="btn btn-refresh"
          onClick={onRefresh}
          disabled={busy || !hasTranscript}
          title={!hasTranscript ? 'Start recording first' : 'Reload all suggestions'}
        >
          <span className={`refresh-icon ${busy ? 'refresh-icon--spinning' : ''}`}>↻</span>
          {isRegenerating ? 'Reloading…' : isLoading ? 'Generating…' : 'Reload'}
        </button>
      </div>

      {/* ── Loading indicator ── */}
      {busy && (
        <div className="suggestions-loading">
          <span className="transcribing-dots">
            <span /><span /><span />
          </span>
          {loadingText}
        </div>
      )}

      {/* ── Error states ── */}
      {!busy && error === 'no-key' && (
        <p className="placeholder-text">
          Please set your Groq API key in Settings.
        </p>
      )}
      {!busy && error === 'failed' && (
        <div className="transcript-error">
          Failed to generate suggestions. Check your API key and connection.
        </div>
      )}

      {/* ── Empty states (no error) ── */}
      {!busy && !error && isEmpty && (
        <p className="placeholder-text">
          {hasTranscript
            ? 'Click Reload to generate suggestions.'
            : 'Start recording to see live suggestions.'}
        </p>
      )}

      {/* ── Suggestion batches (newest first) ── */}
      {!isEmpty && (
        <div className="suggestion-batches">
          {/* Scroll anchor — sits above all batches so new ones scroll into view */}
          <div ref={topRef} />

          {suggestionBatches.map((batch, batchIdx) => (
            <div
              key={batch.id}
              className={`suggestion-batch ${batchIdx === 0 ? 'suggestion-batch--latest' : ''}`}
            >
              <div className="batch-header">
                <span className="batch-label">
                  {batchIdx === 0 ? 'Latest' : 'Earlier'}
                </span>
                <BatchTimestamp ms={batch.timestamp} />
              </div>
              <div className="suggestion-cards">
                {batch.suggestions.map((s) => (
                  <SuggestionCard
                    key={s.id}
                    suggestion={s}
                    onClick={onSuggestionClick}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
