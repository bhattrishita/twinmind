const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL         = 'meta-llama/llama-4-scout-17b-16e-instruct';

export const SUGGESTIONS_SYSTEM_PROMPT = `You are a real-time meeting assistant. Surface exactly 3 highly useful, context-aware suggestions based on what is being said right now.

First, carefully read the transcript and identify:
- Was a question just asked? If yes, one suggestion MUST be of type ANSWER with a direct answer to that question.
- Is there a claim that seems uncertain or worth verifying? Use FACT_CHECK.
- Is there a topic worth expanding on? Use TALKING_POINT.
- Is there something vague or confusing? Use CLARIFICATION.
- Would a follow-up question add value? Use QUESTION.

Rules:
- If a question was just asked in the transcript, ALWAYS include an ANSWER type as one of the 3 suggestions.
- Mix types based on what the conversation actually needs — never default to the same 3 types every time.
- Titles: max 8 words, specific and descriptive.
- Previews: 1-2 sentences that are genuinely useful on their own, not just teasers.
- Be specific to what was actually said — never generic.
- Return ONLY a valid JSON array, no markdown, no extra text:
[
  { "type": "ANSWER", "title": "...", "preview": "..." },
  { "type": "FACT_CHECK", "title": "...", "preview": "..." },
  { "type": "TALKING_POINT", "title": "...", "preview": "..." }
]

Types available: QUESTION, TALKING_POINT, FACT_CHECK, CLARIFICATION, ANSWER`;

/** Build the user message from the last 3-4 transcript chunks. */
function buildUserMessage(chunks) {
  const text = chunks.map((c) => c.text).join('\n');
  return `Here is the recent conversation transcript:\n\n${text}\n\nGenerate 3 suggestions.`;
}

/**
 * Extract the first JSON array from a raw string.
 * Handles markdown code fences (```json ... ```) and bare arrays.
 */
function extractJsonArray(raw) {
  // Strip optional ```json / ``` fences
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '');
  const match    = stripped.match(/\[[\s\S]*?\]/);
  if (!match) throw new Error('No JSON array found in response');
  return JSON.parse(match[0]);
}

/** Single attempt: call Groq and return parsed suggestions array. */
async function callGroq(chunks, apiKey, systemPrompt) {
  const res = await fetch(GROQ_CHAT_URL, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:       MODEL,
      messages:    [
        { role: 'system', content: systemPrompt || SUGGESTIONS_SYSTEM_PROMPT },
        { role: 'user',   content: buildUserMessage(chunks) },
      ],
      temperature: 0.7,
      max_tokens:  640,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${body}`);
  }

  const data    = await res.json();
  const content = data.choices?.[0]?.message?.content ?? '';
  const parsed  = extractJsonArray(content);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Parsed result is not a non-empty array');
  }

  // Ensure each entry has the expected shape; trim to 3
  return parsed.slice(0, 3).map((s) => ({
    type:    String(s.type    ?? 'QUESTION').toUpperCase(),
    title:   String(s.title   ?? ''),
    preview: String(s.preview ?? ''),
  }));
}

/**
 * Fetch suggestions with one automatic retry on failure.
 * @param {Array<{text:string}>} chunks  Last 3-4 transcript chunks
 * @param {string}              apiKey  Groq API key
 * @returns {Promise<Array<{type,title,preview}>>}
 */
export async function fetchSuggestionsWithRetry(chunks, apiKey, systemPrompt) {
  try {
    return await callGroq(chunks, apiKey, systemPrompt);
  } catch (firstErr) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('[suggestions] first attempt failed, retrying:', firstErr.message);
    }
    await new Promise((r) => setTimeout(r, 1_000));
    return await callGroq(chunks, apiKey, systemPrompt); // throws on second failure
  }
}
