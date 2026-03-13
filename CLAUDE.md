# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Browser-based teleprompter for public speakers. React 18 + Vite frontend, FastAPI + edge-tts Python backend.

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

- **main.jsx** — Entry point, mounts to `#root`
- **teleprompter.jsx** — All app logic: file picker, scroll animation, TTS, keyboard controls, UI
- **speechUtils.js** — Pure functions: `parseSpeech`, `countSentences`, `buildItemTimings`
- **speechUtils.test.js** — Vitest unit tests for the above (18 tests, no DOM required)
- **vite.config.js** — Proxies `/api` → `http://localhost:8000` in dev

Speech files are loaded via the browser FileReader API (file picker). Never uploaded to the server.

### Backend (`backend/`)

- **main.py** — FastAPI app with two endpoints:
  - `GET /api/voices` — lists available edge-tts voices
  - `POST /api/speak` — synthesizes text, returns `{audio_b64, boundaries}` where `boundaries` are `SentenceBoundary` events (offset/duration in ms)
- **pyproject.toml** / **uv.lock** — managed with `uv`

In Docker, the backend also serves the built frontend from `./static/`.

### Scroll animation (manual play mode)

Uses `requestAnimationFrame` with `speedRef` (ref, not state) so the loop never restarts on speed change. Sub-pixel amounts accumulate in `accumRef` and flush when ≥1px — prevents stalling at slow speeds.

### TTS + synchronized scroll

`speak()` flow:
1. Collect text (selected text or from guide-line position to end)
2. POST to `/api/speak`, receive base64 audio + sentence boundary timings
3. Decode to blob URL, create `Audio` object, set `playbackRate = speedRef.current`
4. Pre-compute `targetScrollTop` per item using `getBoundingClientRect` (reliable across all layout configurations)
5. rAF loop syncs `scrollTop` by interpolating between sentence boundary timestamps using `audio.currentTime`
6. `speedRef` is read every frame — moving the speed slider updates `audio.playbackRate` and scroll speed live

`stopTts()` cancels the AbortController (for in-flight fetch), cancels the rAF, pauses and revokes the audio blob URL.

### Speech format

`##` → section header · `**text**` → bold · `---` → spacer · plain text → paragraph

### Speed control

Slider 0.1x–3.0x (step 0.05). Arrow keys ±0.1x. Constants: `SPEED_MIN`, `SPEED_MAX`, `SPEED_DEFAULT`. During TTS, `audio.playbackRate` is synced to `speedRef` on every animation frame.

### Styling

All inline CSS. Amber phosphor broadcast aesthetic: EB Garamond (body) + Courier Prime (UI), `#ffaa22` amber accent, scan-line texture overlay, vignette, fade masks, glowing guide line at 38% viewport height.
