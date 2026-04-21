import { useState, useRef, useCallback } from 'react';
import { fetchChatAnswer } from '../utils/chat';

/**
 * Encapsulates all chat logic.
 *
 * @param {object} opts
 * @param {string} opts.chatPrompt            – System prompt for free-text questions
 * @param {string} opts.detailedAnswerPrompt  – System prompt for suggestion-click answers
 * @param {number} opts.contextWindow         – How many history messages to include (default: 6)
 *
 * Exposes:
 *   messages    – Array<{ id, role:'user'|'assistant', content, timestamp }>
 *   isLoading   – true while a response is in-flight
 *   sendMessage – ({ userText, transcript, suggestionPreview? }) => void
 */
export function useChat({ chatPrompt, detailedAnswerPrompt, contextWindow = 6 } = {}) {
  const [messages,  setMessages]  = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Stable ref so sendMessage's closure always reads the latest messages
  // without making sendMessage itself change on every render.
  const messagesRef = useRef([]);

  /** Keep the ref in sync with state (runs synchronously inside setMessages below). */
  function updateMessages(updater) {
    setMessages((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      messagesRef.current = next;
      return next;
    });
  }

  function makeMsg(role, content) {
    return { id: Date.now() + Math.random(), role, content, timestamp: Date.now() };
  }

  /**
   * Send a message and stream back the assistant reply.
   *
   * @param {object} opts
   * @param {string}      opts.userText          Shown in the user bubble
   * @param {Array}       opts.transcript        Full transcript for context
   * @param {string|null} opts.suggestionPreview Extra context (suggestion clicks only)
   */
  const sendMessage = useCallback(async ({ userText, transcript, suggestionPreview = null }) => {
    if (isLoading) return; // don't stack requests

    const apiKey = localStorage.getItem('groq_api_key');

    // Immediately show the user bubble
    const userMsg = makeMsg('user', userText);
    updateMessages((prev) => [...prev, userMsg]);

    // Guard: no API key
    if (!apiKey) {
      updateMessages((prev) => [
        ...prev,
        makeMsg('assistant', 'Please set your Groq API key in Settings.'),
      ]);
      return;
    }

    setIsLoading(true);

    // Use the detailed-answer prompt (and tighter token cap) for suggestion clicks
    const systemPrompt = suggestionPreview ? detailedAnswerPrompt : chatPrompt;
    const maxTokens    = suggestionPreview ? 150 : 1024;

    try {
      const answerText = await fetchChatAnswer({
        userText,
        transcript,
        suggestionPreview,
        history:       messagesRef.current, // latest messages including the user bubble we just added
        apiKey,
        systemPrompt,
        contextWindow,
        maxTokens,
      });

      updateMessages((prev) => [...prev, makeMsg('assistant', answerText)]);
    } catch {
      updateMessages((prev) => [
        ...prev,
        makeMsg('assistant', 'Failed to get an answer. Please try again.'),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, chatPrompt, detailedAnswerPrompt, contextWindow]);

  return { messages, isLoading, sendMessage };
}
