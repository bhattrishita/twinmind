# TwinMind Live

An always-on AI meeting copilot that listens to live audio, transcribes speech in real time, and surfaces smart suggestions while you talk.

## Stack
- React + Vite (frontend)
- Groq API (Whisper Large V3 for transcription, Llama 4 Scout for suggestions and chat)
- No backend — fully client side

## Setup
1. Clone the repo
2. Run: npm install
3. Run: npm run dev
4. Open localhost:5173
5. Click Settings and paste your Groq API key
6. Click Test Connection to verify
7. Start recording!

## Prompt Strategy
- Suggestions use the last 4 transcript chunks as context window
- Suggestions are triggered by 2 seconds of silence after speech (pause detection)
- Deduplication prevents the same transcript state from generating duplicate batches
- All 5 suggestion types are used: QUESTION, TALKING_POINT, FACT_CHECK, CLARIFICATION, ANSWER
- The model is instructed to detect when a question was just asked and prioritize ANSWER type
- Detailed chat answers are capped at 2-3 sentences and 150 max tokens for conciseness
- Chat maintains last 6 messages as rolling context window

## Tradeoffs
- Fully client side means API key is stored in localStorage — acceptable for a demo, not for production at scale
- Pause detection threshold (2 seconds, volume below 10/255) works well in quiet environments
- Silence RMS threshold (0.01) prevents Whisper hallucinations on silent audio chunks
- No backend means no server costs and instant deployment

## Features
- Live transcription with HH:MM:SS timestamps
- Pause-triggered AI suggestions (3 per batch, 5 types)
- Clickable suggestion cards with concise 2-3 sentence answers
- Continuous chat with full transcript context
- Editable prompts and context window sizes in Settings
- Export full session as JSON (transcript + suggestions + chat)
