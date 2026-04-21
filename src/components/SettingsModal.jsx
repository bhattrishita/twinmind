import { useState, useEffect } from 'react';

/**
 * @param {object}   props
 * @param {Function} props.onClose
 * @param {object}   props.settings     – current settings from App state
 * @param {Function} props.onSave       – (newSettings) => void
 */
export default function SettingsModal({ onClose, settings = {}, onSave }) {
  const [apiKey,                   setApiKey]                   = useState('');
  const [suggestionsPrompt,        setSuggestionsPrompt]        = useState('');
  const [detailedAnswerPrompt,     setDetailedAnswerPrompt]     = useState('');
  const [chatPrompt,               setChatPrompt]               = useState('');
  const [suggestionsContextWindow, setSuggestionsContextWindow] = useState(4);
  const [chatContextWindow,        setChatContextWindow]        = useState(6);

  const [testStatus, setTestStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [saved,      setSaved]      = useState(false);

  // Populate fields from localStorage / passed settings on open
  useEffect(() => {
    const stored = localStorage.getItem('groq_api_key');
    if (stored) setApiKey(stored);

    if (settings.suggestionsPrompt)        setSuggestionsPrompt(settings.suggestionsPrompt);
    if (settings.detailedAnswerPrompt)     setDetailedAnswerPrompt(settings.detailedAnswerPrompt);
    if (settings.chatPrompt)               setChatPrompt(settings.chatPrompt);
    if (settings.suggestionsContextWindow) setSuggestionsContextWindow(settings.suggestionsContextWindow);
    if (settings.chatContextWindow)        setChatContextWindow(settings.chatContextWindow);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSave() {
    localStorage.setItem('groq_api_key',               apiKey);
    localStorage.setItem('suggestions_prompt',         suggestionsPrompt);
    localStorage.setItem('detailed_answer_prompt',     detailedAnswerPrompt);
    localStorage.setItem('chat_prompt',                chatPrompt);
    localStorage.setItem('suggestions_context_window', String(suggestionsContextWindow));
    localStorage.setItem('chat_context_window',        String(chatContextWindow));

    onSave?.({
      suggestionsPrompt,
      detailedAnswerPrompt,
      chatPrompt,
      suggestionsContextWindow: parseInt(suggestionsContextWindow, 10),
      chatContextWindow:        parseInt(chatContextWindow,        10),
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleTestConnection() {
    if (!apiKey.trim()) { setTestStatus('error'); return; }
    setTestStatus('loading');
    try {
      const res = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      setTestStatus(res.ok ? 'success' : 'error');
    } catch {
      setTestStatus('error');
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal modal--wide">
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">

          {/* ── API Key ── */}
          <div className="form-group">
            <label htmlFor="groq-key">Groq API Key</label>
            <input
              id="groq-key"
              type="password"
              className="form-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="gsk_..."
              autoComplete="off"
            />
            <span className="form-hint">
              Get your key at{' '}
              <a href="https://console.groq.com" target="_blank" rel="noreferrer">
                console.groq.com
              </a>
            </span>
          </div>

          {testStatus && (
            <div className={`test-result ${testStatus}`}>
              {testStatus === 'loading' && 'Testing connection…'}
              {testStatus === 'success' && '✓ Connected!'}
              {testStatus === 'error'   && '✗ Failed — check your key'}
            </div>
          )}

          <div className="settings-divider" />

          {/* ── Suggestions Prompt ── */}
          <div className="form-group">
            <label htmlFor="suggestions-prompt">Suggestions Prompt</label>
            <textarea
              id="suggestions-prompt"
              className="form-textarea"
              value={suggestionsPrompt}
              onChange={(e) => setSuggestionsPrompt(e.target.value)}
              rows={6}
            />
            <span className="form-hint">System prompt used when generating live suggestions.</span>
          </div>

          {/* ── Detailed Answer Prompt ── */}
          <div className="form-group">
            <label htmlFor="detailed-answer-prompt">Detailed Answer Prompt</label>
            <textarea
              id="detailed-answer-prompt"
              className="form-textarea"
              value={detailedAnswerPrompt}
              onChange={(e) => setDetailedAnswerPrompt(e.target.value)}
              rows={6}
            />
            <span className="form-hint">System prompt used when you click a suggestion card in chat.</span>
          </div>

          {/* ── Chat Prompt ── */}
          <div className="form-group">
            <label htmlFor="chat-prompt">Chat Prompt</label>
            <textarea
              id="chat-prompt"
              className="form-textarea"
              value={chatPrompt}
              onChange={(e) => setChatPrompt(e.target.value)}
              rows={6}
            />
            <span className="form-hint">System prompt used for free-text chat questions.</span>
          </div>

          <div className="settings-divider" />

          {/* ── Context Windows ── */}
          <div className="form-row">
            <div className="form-group form-group--half">
              <label htmlFor="suggestions-ctx">Suggestions Context Window</label>
              <input
                id="suggestions-ctx"
                type="number"
                className="form-input form-input--number"
                min={1}
                max={20}
                value={suggestionsContextWindow}
                onChange={(e) => setSuggestionsContextWindow(e.target.value)}
              />
              <span className="form-hint">Recent transcript chunks sent to the suggestions model.</span>
            </div>

            <div className="form-group form-group--half">
              <label htmlFor="chat-ctx">Chat Context Window</label>
              <input
                id="chat-ctx"
                type="number"
                className="form-input form-input--number"
                min={1}
                max={40}
                value={chatContextWindow}
                onChange={(e) => setChatContextWindow(e.target.value)}
              />
              <span className="form-hint">Recent chat messages included as conversation history.</span>
            </div>
          </div>

        </div>{/* end modal-body */}

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={handleTestConnection}
            disabled={testStatus === 'loading'}
          >
            Test Connection
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? '✓ Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
