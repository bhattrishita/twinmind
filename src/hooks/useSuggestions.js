import { useState, useRef } from 'react';
import { fetchSuggestionsWithRetry } from '../utils/suggestions';

/**
 * Encapsulates all suggestion-fetching logic.
 *
 * @param {object} opts
 * @param {string} opts.suggestionsPrompt  – Custom system prompt (falls back to default inside util)
 * @param {number} opts.contextWindow      – How many recent chunks to send (default: 4)
 *
 * Exposes:
 *   suggestionBatches  – array of { id, timestamp, suggestions:[{id,type,title,preview}] }
 *   isLoading          – true while a request is in-flight
 *   error              – 'no-key' | 'failed' | null
 *   fetchSuggestions   – (transcriptChunks: Array) => void
 */
export function useSuggestions({ suggestionsPrompt, contextWindow = 4 } = {}) {
  const [suggestionBatches, setSuggestionBatches] = useState([]);
  const [isLoading,         setIsLoading]         = useState(false);
  const [error,             setError]             = useState(null);

  // Ref so the interval closure always respects the current in-flight state
  // without adding isLoading to fetchSuggestions' dependency array.
  const isLoadingRef = useRef(false);

  // Plain async function — no useCallback, no closure capture of any state.
  // latestChunks is passed directly by the caller (always transcriptRef.current),
  // so this function never reads stale data regardless of when it was defined.
  async function fetchSuggestions(latestChunks) {
    // Guard: skip if already fetching or nothing to work with
    if (isLoadingRef.current) return;
    if (!latestChunks || latestChunks.length === 0) return;

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[suggestions] fetching with ${latestChunks.length} chunk(s), context window: ${contextWindow}. ` +
        `Last chunk: "${latestChunks[latestChunks.length - 1]?.text?.slice(0, 80)}…"`
      );
    }

    const apiKey = localStorage.getItem('groq_api_key');
    if (!apiKey) {
      setError('no-key');
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const recentChunks = latestChunks.slice(-contextWindow);

      // First attempt
      let rawSuggestions = await fetchSuggestionsWithRetry(recentChunks, apiKey, suggestionsPrompt);

      // Fix 2 — minimum count: if fewer than 3 came back, retry once
      if (rawSuggestions.length < 3) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[suggestions] only got ${rawSuggestions.length} suggestions, retrying once…`);
        }
        try {
          const retried = await fetchSuggestionsWithRetry(recentChunks, apiKey, suggestionsPrompt);
          if (retried.length > rawSuggestions.length) rawSuggestions = retried;
        } catch {
          // keep whatever we already have — never show an empty batch on retry failure
        }
      }

      const batchId = Date.now();
      const batch = {
        id:          batchId,
        timestamp:   batchId,
        suggestions: rawSuggestions.map((s, i) => ({ ...s, id: `${batchId}-${i}` })),
      };

      // Prepend so newest is always first
      setSuggestionBatches((prev) => [batch, ...prev]);
    } catch {
      setError('failed');
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }

  function clearSuggestionBatches() {
    setSuggestionBatches([]);
  }

  return { suggestionBatches, isLoading, error, fetchSuggestions, clearSuggestionBatches };
}
