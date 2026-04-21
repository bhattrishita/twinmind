const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL         = 'meta-llama/llama-4-scout-17b-16e-instruct';

/** Default prompt for free-text chat questions. */
export const CHAT_SYSTEM_PROMPT = `You are a highly knowledgeable meeting assistant. When the user clicks on a suggestion or asks a question, your job is to provide a detailed, helpful, and well-structured answer based on the full conversation transcript so far.

Rules:
- Be specific to what was actually discussed in the transcript
- Structure your answer clearly — use short paragraphs or bullet points where appropriate
- Be thorough but concise — aim for 3-6 sentences or bullet points
- If the suggestion is a QUESTION, answer it fully
- If it is a FACT_CHECK, verify the claim and give context
- If it is a TALKING_POINT, expand on it with useful details
- If it is a CLARIFICATION, explain the concept clearly
- Never be generic — always tie back to what was said in the meeting`;

/** Default prompt used when the user clicks a suggestion card. Intentionally brief. */
export const DETAILED_ANSWER_SYSTEM_PROMPT = `You are a highly knowledgeable meeting assistant. When the user clicks on a suggestion, provide a concise, direct answer based on the conversation transcript.

Rules:
- Maximum 2-3 sentences only. Never exceed this.
- Be specific to what was discussed in the transcript
- Get straight to the point — no preamble, no filler phrases like 'Great question' or 'Certainly'
- If the suggestion is a QUESTION, answer it directly in 2-3 sentences
- If it is a FACT_CHECK, confirm or deny the claim with context in 2-3 sentences
- If it is a TALKING_POINT, summarize the key insight in 2-3 sentences
- If it is a CLARIFICATION, explain it clearly in 2-3 sentences
- Never use bullet points or headers — plain sentences only
- Never be generic — always tie back to what was said in the meeting`;

/**
 * Build the user-turn content for the API.
 * For suggestion clicks: includes title + preview.
 * For free-text: just the question.
 */
function buildUserContent(transcript, userText, suggestionPreview = null) {
  const transcriptText = transcript.length
    ? transcript.map((c) => c.text).join('\n')
    : '(No transcript yet)';

  if (suggestionPreview) {
    return (
      `Full transcript so far:\n\n${transcriptText}\n\n` +
      `Suggestion clicked: ${userText}\n` +
      `Suggestion preview: ${suggestionPreview}\n\n` +
      `Please provide a detailed answer.`
    );
  }

  return `Full transcript so far:\n\n${transcriptText}\n\n${userText}`;
}

/**
 * Call Groq and return the assistant's reply text.
 *
 * @param {object} opts
 * @param {string}              opts.userText          Text shown as the user bubble
 * @param {Array}               opts.transcript        Full transcript chunks
 * @param {string|null}         opts.suggestionPreview Extra context for suggestion clicks
 * @param {Array}               opts.history           Current chat messages (for context window)
 * @param {string}              opts.apiKey
 * @param {string|null}         opts.systemPrompt      Custom system prompt (falls back to default)
 * @param {number}              opts.contextWindow     How many history messages to include (default: 6)
 * @param {number}              opts.maxTokens         Max tokens for the completion (default: 1024)
 */
export async function fetchChatAnswer({ userText, transcript, suggestionPreview = null, history, apiKey, systemPrompt, contextWindow = 6, maxTokens = 1024 }) {
  const contextMessages = history.slice(-contextWindow).map((m) => ({
    role:    m.role,
    content: m.content,
  }));

  const res = await fetch(GROQ_CHAT_URL, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model:       MODEL,
      messages:    [
        { role: 'system', content: systemPrompt || CHAT_SYSTEM_PROMPT },
        ...contextMessages,
        { role: 'user',   content: buildUserContent(transcript, userText, suggestionPreview) },
      ],
      temperature: 0.7,
      max_tokens:  maxTokens,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${body}`);
  }

  const data = await res.json();
  return (data.choices?.[0]?.message?.content ?? '').trim();
}
