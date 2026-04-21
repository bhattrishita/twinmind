import { useState, useRef, useCallback, useEffect } from 'react';
import TranscriptPanel   from './components/TranscriptPanel';
import SuggestionsPanel  from './components/SuggestionsPanel';
import ChatPanel         from './components/ChatPanel';
import SettingsModal     from './components/SettingsModal';
import { useAudioRecorder }        from './hooks/useAudioRecorder';
import { useSuggestions }          from './hooks/useSuggestions';
import { useChat }                 from './hooks/useChat';
import { transcribeBlobWithRetry } from './utils/transcribe';
import { SUGGESTIONS_SYSTEM_PROMPT } from './utils/suggestions';
import { CHAT_SYSTEM_PROMPT, DETAILED_ANSWER_SYSTEM_PROMPT } from './utils/chat';
import './App.css';

// ── Settings helpers ───────────────────────────────────────────────────────
function loadSettings() {
  return {
    suggestionsPrompt:        localStorage.getItem('suggestions_prompt')        || SUGGESTIONS_SYSTEM_PROMPT,
    detailedAnswerPrompt:     localStorage.getItem('detailed_answer_prompt')    || DETAILED_ANSWER_SYSTEM_PROMPT,
    chatPrompt:               localStorage.getItem('chat_prompt')               || CHAT_SYSTEM_PROMPT,
    suggestionsContextWindow: parseInt(localStorage.getItem('suggestions_context_window') || '4', 10),
    chatContextWindow:        parseInt(localStorage.getItem('chat_context_window')        || '6', 10),
  };
}

/** Format an absolute timestamp (ms) as HH:MM:SS */
function fmtTs(ms) {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

export default function App() {
  // ── UI ───────────────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);

  // ── Settings ──────────────────────────────────────────────────────────────
  const [settings, setSettings] = useState(loadSettings);

  // ── Transcript state ──────────────────────────────────────────────────────
  // { id: number, text: string, timestamp: number (absolute ms) }
  const [transcript,     setTranscript]     = useState([]);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptError, setTranscriptError] = useState(null);
  const recordingStartRef = useRef(null);

  // ── Suggestions ───────────────────────────────────────────────────────────
  const { suggestionBatches, isLoading: suggestionsLoading, error: suggestionsError,
          fetchSuggestions, clearSuggestionBatches } = useSuggestions({
    suggestionsPrompt: settings.suggestionsPrompt,
    contextWindow:     settings.suggestionsContextWindow,
  });

  // true while the full-history regeneration (multi-fetch) is in progress
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Mirror transcript into a ref so callbacks always read the latest value.
  const transcriptRef = useRef([]);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Tracks how many chunks were present the last time suggestions were fetched.
  // Used to skip fetches when the transcript hasn't changed since the last batch.
  const lastSuggestedLengthRef = useRef(0);

  // Stable ref so handleChunkReady (useCallback with [] deps) always calls the
  // latest fetchSuggestions without needing it in the dependency array.
  const fetchSuggestionsRef = useRef(fetchSuggestions);
  fetchSuggestionsRef.current = fetchSuggestions;

  // ── Chat ─────────────────────────────────────────────────────────────────
  const { messages: chatMessages, isLoading: chatLoading, sendMessage } = useChat({
    chatPrompt:           settings.chatPrompt,
    detailedAnswerPrompt: settings.detailedAnswerPrompt,
    contextWindow:        settings.chatContextWindow,
  });

  const handleSuggestionClick = useCallback((suggestion) => {
    sendMessage({
      userText:          suggestion.title,
      transcript:        transcriptRef.current,
      suggestionPreview: suggestion.preview,
    });
  }, [sendMessage]);

  // ── Transcription handler (called by useAudioRecorder) ───────────────────
  const handleChunkReady = useCallback(async (blob) => {
    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) { setTranscriptError('no-key'); return; }

    const elapsed = recordingStartRef.current
      ? Date.now() - recordingStartRef.current
      : 0;

    setIsTranscribing(true);
    setTranscriptError(null);

    try {
      const text = await transcribeBlobWithRetry(
        blob, apiKey,
        () => setTranscriptError('failed'),
      );
      setTranscriptError(null);

      if (text) {
        const newChunk = {
          id:        Date.now() + Math.random(),
          text,
          timestamp: recordingStartRef.current + elapsed,
        };
        // Update ref immediately so any concurrent callbacks read the latest state.
        const updatedTranscript = [...transcriptRef.current, newChunk];
        transcriptRef.current   = updatedTranscript;
        setTranscript(updatedTranscript);

        // Trigger suggestions immediately — no waiting for a pause/stop event.
        // useSuggestions' internal isLoadingRef guard prevents concurrent fetches.
        // lastSuggestedLengthRef is synced so the stop-handler fallback is a no-op
        // when the last chunk already triggered a fetch.
        lastSuggestedLengthRef.current = updatedTranscript.length;
        fetchSuggestionsRef.current(updatedTranscript);
      }
    } catch {
      setTranscriptError('failed-final');
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  // ── Suggestion fetch — guarded by deduplication ───────────────────────────
  // Only fetches when the transcript has grown since the last fetch.
  // Manual refresh (onRefresh button) bypasses this and calls fetchSuggestions directly.
  const maybeFetchSuggestions = useCallback(() => {
    if (transcriptRef.current.length === lastSuggestedLengthRef.current) return;
    lastSuggestedLengthRef.current = transcriptRef.current.length;
    fetchSuggestions(transcriptRef.current);
  }, [fetchSuggestions]);

  // ── Audio recorder ────────────────────────────────────────────────────────
  const { isRecording, error: micError, startRecording, stopRecording } =
    useAudioRecorder(handleChunkReady, maybeFetchSuggestions);

  const handleStart = useCallback(async () => {
    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) { setTranscriptError('no-key'); return; }
    setTranscriptError(null);
    recordingStartRef.current = Date.now();
    await startRecording();
  }, [startRecording]);

  const handleStop = useCallback(() => {
    stopRecording();
    // Only fetch on stop if the transcript has new content since the last fetch
    maybeFetchSuggestions();
  }, [stopRecording, maybeFetchSuggestions]);

  // ── Suggestions reload — clears all batches then re-generates from scratch ──
  // Uses overlapping 4-chunk windows (sliding by 1) so no context is skipped.
  const handleRefresh = useCallback(async () => {
    const chunks = transcriptRef.current;
    if (chunks.length === 0) return;

    clearSuggestionBatches();
    setIsRegenerating(true);

    if (chunks.length <= 4) {
      // Short transcript — one fetch covers everything
      await fetchSuggestions(chunks);
    } else {
      // Slide a 4-chunk window one chunk at a time: [0..3], [1..4], [2..5], …
      for (let i = 0; i <= chunks.length - 4; i++) {
        await fetchSuggestions(chunks.slice(i, i + 4));
      }
    }

    setIsRegenerating(false);
  }, [clearSuggestionBatches, fetchSuggestions]);

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExport() {
    if (transcript.length === 0) {
      alert('Nothing to export yet');
      return;
    }

    const data = {
      exportedAt: fmtTs(Date.now()),
      transcript: transcript.map((c) => ({
        id:        String(c.id),
        text:      c.text,
        timestamp: fmtTs(c.timestamp),
      })),
      suggestionBatches: suggestionBatches.map((b) => ({
        id:        String(b.id),
        timestamp: fmtTs(b.timestamp),
        suggestions: b.suggestions.map((s) => ({
          type:    s.type,
          title:   s.title,
          preview: s.preview,
        })),
      })),
      chatHistory: chatMessages.map((m) => ({
        role:      m.role,
        content:   m.content,
        timestamp: fmtTs(m.timestamp),
      })),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `twinmind-session-${fmtTs(Date.now())}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const activeError = micError ?? transcriptError;

  return (
    <div className="app">
      <nav className="navbar">
        <div className="navbar-brand">
          <span className="brand-dot" />
          TwinMind Live
        </div>
        <div className="navbar-actions">
          <div className="status-indicator">
            <span className={`status-dot ${isRecording ? 'active' : 'idle'}`} />
            <span className="status-label">
              {isRecording ? 'Recording' : 'Idle'}
            </span>
          </div>
          <button className="btn btn-export" onClick={handleExport}>
            ⬇ Export
          </button>
          <button className="btn btn-settings" onClick={() => setShowSettings(true)}>
            ⚙ Settings
          </button>
        </div>
      </nav>

      <main className="workspace">
        {/* ── Transcript ── */}
        <section className="column">
          <div className="column-header">
            <span className="column-icon">📝</span>
            Transcript
          </div>
          <TranscriptPanel
            transcript={transcript}
            isRecording={isRecording}
            isTranscribing={isTranscribing}
            error={activeError}
            onStartRecording={handleStart}
            onStopRecording={handleStop}
          />
        </section>

        <div className="column-divider" />

        {/* ── Live Suggestions ── */}
        <section className="column column--center">
          <div className="column-header column-header--accent">
            <span className="column-icon">✨</span>
            Live Suggestions
          </div>
          <SuggestionsPanel
            suggestionBatches={suggestionBatches}
            isLoading={suggestionsLoading}
            isRegenerating={isRegenerating}
            error={suggestionsError}
            hasTranscript={transcript.length > 0}
            onRefresh={handleRefresh}
            onSuggestionClick={handleSuggestionClick}
          />
        </section>

        <div className="column-divider" />

        {/* ── Chat ── */}
        <section className="column">
          <div className="column-header">
            <span className="column-icon">💬</span>
            Chat
          </div>
          <ChatPanel
            messages={chatMessages}
            isLoading={chatLoading}
            transcript={transcriptRef}
            onSend={sendMessage}
          />
        </section>
      </main>

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          settings={settings}
          onSave={(newSettings) => setSettings(newSettings)}
        />
      )}
    </div>
  );
}
