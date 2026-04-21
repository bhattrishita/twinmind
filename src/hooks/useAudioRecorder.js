import { useState, useRef, useCallback } from 'react';

/**
 * Returns true when the audio blob is below the RMS silence threshold (0.01).
 * Prevents sending silent or near-silent chunks to Whisper.
 * Uses vendor-prefixed AudioContext for cross-browser / Safari compatibility.
 */
async function isSilent(audioBlob) {
  const AudioCtx    = window.AudioContext || window.webkitAudioContext;
  const arrayBuffer = await audioBlob.arrayBuffer();
  const audioContext = new AudioCtx();
  const audioBuffer  = await audioContext.decodeAudioData(arrayBuffer);
  const channelData  = audioBuffer.getChannelData(0);
  const rms = Math.sqrt(
    channelData.reduce((sum, val) => sum + val * val, 0) / channelData.length
  );
  audioContext.close(); // avoid accumulating suspended AudioContext instances
  return rms < 0.01;
}

const SILENCE_THRESHOLD = 10;   // frequency-domain average, out of 255
const SILENCE_DURATION  = 2000; // ms of continuous quiet before onSpeechPause fires

/**
 * Encapsulates all MediaRecorder logic.
 *
 * @param {(blob: Blob) => void}  onChunkReady   Called every 30 s and on stop with a complete audio chunk.
 * @param {() => void}            onSpeechPause  Called when the user has been silent for 2 continuous seconds.
 *
 * Exposes: { isRecording, error, startRecording, stopRecording }
 */
export function useAudioRecorder(onChunkReady, onSpeechPause) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null); // null | 'denied' | 'generic'

  // Keep stable refs so closures always call the latest callbacks
  const onChunkReadyRef    = useRef(onChunkReady);
  onChunkReadyRef.current  = onChunkReady;
  const onSpeechPauseRef   = useRef(onSpeechPause);
  onSpeechPauseRef.current = onSpeechPause;

  const mediaRecorderRef = useRef(null);
  const streamRef        = useRef(null);
  const intervalRef      = useRef(null);
  const audioContextRef  = useRef(null);  // for pause detection
  const rafRef           = useRef(null);  // requestAnimationFrame ID

  // FIX 5: stable boolean flag readable inside rAF / setInterval closures
  // without stale React state. Kept in sync with setIsRecording().
  const isRecordingRef   = useRef(false);
  // FIX 3: silence-start timestamp as a ref so the rAF loop reads it correctly
  const silenceStartRef  = useRef(null);

  /** FIX 2: returns the best MIME type supported by this browser. */
  function pickMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',               // Safari / iOS on deployment
    ];
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) ?? '';
  }

  /**
   * Creates and starts a fresh MediaRecorder on the given stream.
   * Each recorder has its own local `chunks` array so there's no
   * race condition when the interval stops one and starts another.
   */
  const createRecorder = useCallback((stream) => {
    const mimeType = pickMimeType();
    const options  = mimeType ? { mimeType } : {};
    const recorder = new MediaRecorder(stream, options);
    const chunks   = [];

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = async () => {
      if (chunks.length === 0) return;
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      // Skip near-empty blobs (< 1 KB) that are just mic noise / silence
      if (blob.size < 1024) return;
      // Skip silent chunks via RMS analysis — avoids Whisper hallucinations
      if (await isSilent(blob)) return;
      onChunkReadyRef.current(blob);
    };

    // Collect data in 250 ms slices so we always get *something* in ondataavailable
    recorder.start(250);
    mediaRecorderRef.current = recorder;
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      createRecorder(stream);

      // FIX 5: set ref before setIsRecording so async loops see it immediately
      isRecordingRef.current = true;
      setIsRecording(true);

      // 30 s chunking interval — flush current recorder, start fresh one.
      // FIX 4: also fires onSpeechPause as a fallback in case pause detection
      // silently fails on the deployment environment.
      intervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();    // triggers onstop → blob dispatched
          createRecorder(streamRef.current);  // new recorder starts immediately
        }
        // Fallback trigger — maybeFetchSuggestions dedup guard prevents duplicates
        onSpeechPauseRef.current?.();
      }, 30_000);

      // ── FIX 1 + FIX 3: explicit AudioContext setup ────────────────────────
      // Use vendor-prefixed constructor and explicitly resume() — required on
      // some browsers that start an AudioContext in 'suspended' state even when
      // triggered by a user gesture.
      const AudioCtx    = window.AudioContext || window.webkitAudioContext;
      const audioContext = new AudioCtx();
      await audioContext.resume();
      audioContextRef.current = audioContext;

      // FIX 3: explicit audio graph — source → analyser (no destination needed)
      const source   = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      // FIX 3: silence-detection loop using isRecordingRef as a stop signal
      function checkSilence() {
        // FIX 5: bail out immediately if recording has already stopped
        if (!isRecordingRef.current) return;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

        if (avg < SILENCE_THRESHOLD) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current >= SILENCE_DURATION) {
            silenceStartRef.current = null; // reset so it won't fire again until next distinct pause

            // Flush current chunk to Whisper immediately — no need to wait 30 s
            if (mediaRecorderRef.current?.state === 'recording') {
              mediaRecorderRef.current.stop();    // onstop → blob sent to Whisper
              createRecorder(streamRef.current);  // fresh buffer — no audio duplication
            }

            onSpeechPauseRef.current?.(); // let App decide whether to fetch suggestions
          }
        } else {
          silenceStartRef.current = null; // user is speaking — reset the clock
        }

        rafRef.current = requestAnimationFrame(checkSilence);
      }
      rafRef.current = requestAnimationFrame(checkSilence);

    } catch (err) {
      const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError';
      setError(isDenied ? 'denied' : 'generic');
    }
  }, [createRecorder]);

  const stopRecording = useCallback(() => {
    // FIX 5: signal the rAF loop to exit before cancelling the frame —
    // this prevents a race where the loop fires one more time after cancel.
    isRecordingRef.current  = false;
    silenceStartRef.current = null;

    // Cancel the silence-detection loop
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    // Close the monitoring AudioContext
    audioContextRef.current?.close();
    audioContextRef.current = null;

    // Kill the chunking interval so it can't restart a recorder after we stop
    clearInterval(intervalRef.current);
    intervalRef.current = null;

    // Stop the active recorder — this fires onstop → final chunk dispatched
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Release the mic
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;

    setIsRecording(false);
  }, []);

  return { isRecording, error, startRecording, stopRecording };
}
