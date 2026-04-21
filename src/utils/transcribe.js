const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3';

/** Returns the file extension that matches the blob's MIME type. */
function blobExtension(blob) {
  const mime = blob.type || '';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg'))  return 'ogg';
  if (mime.includes('wav'))  return 'wav';
  if (mime.includes('mp4'))  return 'mp4';
  return 'webm'; // safe fallback — Groq accepts webm
}

/**
 * Sends one audio blob to Groq Whisper and returns the transcript text.
 * Throws on network or API errors so the caller can retry.
 *
 * @param {Blob}   blob    Raw audio blob from MediaRecorder
 * @param {string} apiKey  Groq API key
 * @returns {Promise<string>} Transcript text (may be empty string for silence)
 */
export async function transcribeBlob(blob, apiKey) {
  const ext  = blobExtension(blob);
  const form = new FormData();
  form.append('file',  blob, `recording.${ext}`);
  form.append('model', MODEL);
  form.append('response_format', 'json');

  const res = await fetch(GROQ_TRANSCRIPTION_URL, {
    method:  'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body:    form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Groq ${res.status}: ${body}`);
  }

  const data = await res.json();
  return (data.text ?? '').trim();
}

/**
 * Wraps transcribeBlob with a single automatic retry.
 * Returns { text } on success, throws on double failure.
 */
export async function transcribeBlobWithRetry(blob, apiKey, onRetry) {
  try {
    return await transcribeBlob(blob, apiKey);
  } catch (firstErr) {
    onRetry?.(firstErr);
    // Wait 1 s before retry to let transient issues clear
    await new Promise(r => setTimeout(r, 1000));
    return await transcribeBlob(blob, apiKey);
  }
}
