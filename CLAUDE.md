# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-based teleprompter and pronunciation trainer for public speakers. React 18 + Vite frontend, FastAPI + edge-tts + faster-whisper Python backend.

## Commands

```bash
# Frontend (frontend/)
npm run dev          # Vite dev server → http://localhost:5173
npm run build        # Production build → dist/
npm test             # Vitest unit tests (speechUtils)

# Backend (backend/)
uv run uvicorn main:app --reload   # Dev server → http://localhost:8000

# Docker
docker build -t teleprompter .
docker run -p 8000:8000 teleprompter
```

No lint scripts configured.

## Architecture

### Frontend (`frontend/`)

- **main.jsx** — Entry point, tab bar (SPEAKER / TUTOR), mounts both panels with display-toggle to preserve state
- **shared.jsx** — Shared constants and components: `C` (color palette), `btnSmall`, `ScanLines`, `Vignette`, `FilePicker`, `b64ToBlob`, `playTts`, `useAudioDevices`, `DeviceSelect`, `AudioLevelMeter`
- **teleprompter.jsx** — Speaker panel: file picker, scroll animation, TTS with synchronized scroll, keyboard controls
- **tutor.jsx** — Tutor panel: mic capture → WebSocket → faster-whisper transcription → word-level diff vs reference text
- **diffUtils.js** — LCS-based word diff: `diffWords(ref, rec)` → `[{word, type}]` where type is `match|extra|missing`
- **speechUtils.js** — Pure functions: `parseSpeech`, `countSentences`, `buildItemTimings`
- **speechUtils.test.js** — Vitest unit tests (18 tests, no DOM required)
- **vite.config.js** — Proxies `/api` (HTTP + WebSocket) → `http://localhost:8000` in dev

Speech files are loaded via FileReader API (file picker). Never uploaded to the server.

### Backend (`backend/`)

- **main.py** — FastAPI app:
  - `GET /api/voices` — lists available edge-tts voices
  - `POST /api/speak` — synthesizes text, returns `{audio_b64, boundaries}` (SentenceBoundary events in ms)
  - `WS /api/transcribe` — streams audio chunks from browser, returns partial and final transcriptions via faster-whisper
- **pyproject.toml** / **uv.lock** — managed with `uv`; requires Python 3.12+

In Docker, the backend also serves the built frontend from `./static/`.

### WebSocket transcription protocol

Client → Server:
- `{"type":"start","language":"en","model":"small"}` — load model
- Binary frames — raw `audio/webm;codecs=opus` chunks (1s intervals from MediaRecorder)
- `{"type":"pause_detected"}` — sent by frontend silence detector (300ms default, configurable)
- `{"type":"stop"}` — end of session

Server → Client:
- `{"type":"ready"}` — model loaded, start recording
- `{"type":"transcript","text":"...","is_final":false|true}` — partial or final result
- `{"type":"error","message":"..."}` — error

Backend caches `WhisperModel` instances per model name to avoid reloading across connections.

### Scroll animation (Speaker — manual play mode)

Uses `requestAnimationFrame` with `speedRef` (ref, not state) so the loop never restarts on speed change. Sub-pixel amounts accumulate in `accumRef` and flush when ≥1px — prevents stalling at slow speeds.

### TTS + synchronized scroll (Speaker)

`speak()` flow:
1. Collect text (selected text or from guide-line position to end)
2. POST to `/api/speak`, receive base64 audio + sentence boundary timings
3. Decode to blob URL, create `Audio` object, set `playbackRate = speedRef.current`
4. Pre-compute `targetScrollTop` per item using `getBoundingClientRect`
5. rAF loop syncs `scrollTop` by interpolating between sentence boundary timestamps via `audio.currentTime`
6. Speed slider updates `audio.playbackRate` and scroll speed live every frame

`stopTts()` cancels the AbortController, cancels rAF, pauses and revokes the audio blob URL.

### b64ToBlob (shared)

`b64ToBlob(audio_b64, mimeType?)` decodes a base64 audio string to a blob URL. Used by both `playTts` and `teleprompter.jsx` — single source of truth for the atob → Uint8Array → Blob → createObjectURL pattern.

### playTts (shared)

Returns `{ abort(), audio }`. `audio` is the live `HTMLAudioElement` (null until fetch resolves) — call `audio.setSinkId(deviceId)` to hot-swap output device mid-playback. `.catch` only fires `onEnd` on non-AbortError to avoid double-firing on intentional stop.

### AudioLevelMeter (shared)

Accepts `barRef` (a React ref to the inner bar `div`). The bar width, background, and boxShadow are written directly to the DOM from the rAF tick in `tutor.jsx` — no React state updates, no re-renders at 60 fps while listening.

### Tutor listen states

`idle → starting → listening → processing → finished`

- **starting** — WebSocket connecting, model loading
- **listening** — actively recording; silence detector fires `pause_detected` for partial transcriptions
- **processing** — stop clicked, waiting for final transcript (WS still open)
- **finished** — final transcript received, diff displayed

### Tutor TTS voices

`LANG_VOICES` maps each language code to a valid Azure Neural voice (e.g. `en → en-US-EricNeural`, `es → es-ES-AlvaroNeural`). Used in `playPronunciation` to avoid constructing invalid voice strings like `es-US-EricNeural`.

### Mic hot-swap (Tutor)

A `useEffect` on `selectedMic` calls `cleanup()` (stops recorder/stream/level meter), acquires the new device, restarts the level meter, and creates a new MediaRecorder — WebSocket stays open throughout.

### Output hot-swap (both panels)

A `useEffect` on `selectedOutput` calls `setSinkId()` on the active audio element, switching output instantly mid-playback.

### Speech file format

`##` → section header · `**text**` → bold · `---` → spacer · plain text → paragraph

### Styling

All inline CSS. Amber phosphor broadcast aesthetic: EB Garamond (body) + Courier Prime (UI), `#ffaa22` amber accent, scan-line texture overlay, vignette, fade masks, glowing guide line at 38% viewport height.
