import { useEffect, useRef } from 'react';

/** Format an absolute timestamp (ms) as 24-hour wall-clock HH:MM:SS */
function formatTs(ms) {
  const d  = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

const ERROR_MESSAGES = {
  denied:         'Microphone access denied. Please allow mic access in your browser.',
  generic:        'Could not access the microphone. Check browser permissions.',
  'no-key':       'Please set your Groq API key in Settings before recording.',
  failed:         'Transcription failed — retrying…',
  'failed-final': 'Transcription failed. Check your API key and connection.',
};

export default function TranscriptPanel({
  transcript = [],
  isRecording,
  isTranscribing,
  error,
  onStartRecording,
  onStopRecording,
}) {
  const bottomRef = useRef(null);

  // Auto-scroll whenever the transcript array changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const isEmpty = transcript.length === 0;

  return (
    <div className="panel-content transcript-panel">

      {/* ── Recording controls ── */}
      <div className="recording-controls">
        {isRecording && <span className="rec-dot" aria-label="Recording" />}
        <button
          className={`btn btn-record ${isRecording ? 'btn-record--stop' : 'btn-record--start'}`}
          onClick={isRecording ? onStopRecording : onStartRecording}
        >
          {isRecording ? '⏹ Stop Recording' : '⏺ Start Recording'}
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className={`transcript-error ${error === 'failed' ? 'transcript-error--warn' : ''}`}>
          {ERROR_MESSAGES[error] ?? 'An unknown error occurred.'}
        </div>
      )}

      {/* ── Empty state ── */}
      {isEmpty && !isTranscribing && !error && (
        <p className="placeholder-text">
          {isRecording
            ? 'Listening… transcript will appear shortly.'
            : 'Transcript will appear here once recording starts…'}
        </p>
      )}

      {/* ── Transcribing indicator (shown even before first chunk) ── */}
      {isTranscribing && isEmpty && (
        <div className="transcribing-indicator transcribing-indicator--standalone">
          <span className="transcribing-dots">
            <span /><span /><span />
          </span>
          Transcribing…
        </div>
      )}

      {/* ── Transcript list (scroll container) ── */}
      {!isEmpty && (
        <div className="transcript-list">
          {transcript.map((chunk) => (
            <div key={chunk.id} className="transcript-chunk">
              <span className="chunk-timestamp">{formatTs(chunk.timestamp)}</span>
              <p className="chunk-text">{chunk.text}</p>
            </div>
          ))}

          {/* ── Transcribing indicator (appended after existing chunks) ── */}
          {isTranscribing && (
            <div className="transcribing-indicator">
              <span className="transcribing-dots">
                <span /><span /><span />
              </span>
              Transcribing…
            </div>
          )}

          {/* Scroll anchor — must be last child inside the scrollable div */}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
