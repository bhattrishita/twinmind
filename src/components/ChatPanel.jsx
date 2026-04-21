import { useState, useEffect, useRef } from 'react';

function formatTs(ms) {
  const d  = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/** Animated thinking indicator — styled like an assistant bubble. */
function ThinkingBubble() {
  return (
    <div className="chat-msg chat-msg--assistant">
      <span className="chat-sender-label">AI</span>
      <div className="chat-bubble chat-bubble--thinking">
        <span className="chat-think-dots">
          <span /><span /><span />
        </span>
      </div>
    </div>
  );
}

/**
 * @param {object}   props
 * @param {Array}    props.messages    – [{ id, role, content, timestamp }]
 * @param {boolean}  props.isLoading   – true while waiting for assistant reply
 * @param {object}   props.transcript  – ref to the full transcript array in App
 * @param {Function} props.onSend      – ({ userText, transcript }) => void
 */
export default function ChatPanel({ messages = [], isLoading, transcript, onSend }) {
  const [inputValue, setInputValue] = useState('');
  const bottomRef = useRef(null);

  // Auto-scroll whenever messages grow or the thinking bubble appears/disappears
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  function handleSend() {
    const text = inputValue.trim();
    if (!text || isLoading) return;
    setInputValue('');
    onSend({ userText: text, transcript: transcript.current });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="panel-content chat-panel-content">

      {/* ── Message list ── */}
      <div className="chat-messages">

        {/* Empty state */}
        {messages.length === 0 && !isLoading && (
          <div className="chat-empty-state">
            <span className="chat-empty-icon">💬</span>
            <p className="chat-empty-text">
              Click a suggestion card or type a question below
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`chat-msg chat-msg--${msg.role}`}
          >
            <span className="chat-sender-label">
              {msg.role === 'user' ? 'You' : 'AI'}
            </span>
            <div className={`chat-bubble chat-bubble--${msg.role}`}>
              <p className="chat-bubble-text">{msg.content}</p>
              <span className="chat-bubble-ts">{formatTs(msg.timestamp)}</span>
            </div>
          </div>
        ))}

        {/* Thinking indicator after the last user message */}
        {isLoading && <ThinkingBubble />}

        {/* Scroll anchor — must be last inside the scrollable div */}
        <div ref={bottomRef} />
      </div>

      {/* ── Input bar ── */}
      <div className="chat-input-area">
        <input
          className="chat-input"
          type="text"
          placeholder="Ask anything about the conversation…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!inputValue.trim() || isLoading}
        >
          Send
        </button>
      </div>
    </div>
  );
}
