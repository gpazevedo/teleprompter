# Frontend

React 18 + Vite SPA with three panels: Speaker, Tutor, and Free Speech. Amber phosphor broadcast aesthetic — all inline CSS.

## Stack

| Component | Role |
| --- | --- |
| **React 18** | UI components and hooks |
| **Vite** | Dev server, build, `/api` proxy |
| **Vitest** | Unit tests (`speechUtils.test.js`) |
| **MediaRecorder API** | Browser audio capture (webm/opus) |
| **Web Audio API** | Mic level meter, silence detection |

## Structure

```text
frontend/
├── main.jsx              Entry point, tab bar, mounts all three panels
├── teleprompter.jsx      Speaker — scroll + TTS
├── tutor.jsx             Tutor — pronunciation practice with word diff
├── freespeech.jsx        Free Speech — open-ended transcription
├── transcription.js      useMicTranscription hook — WebSocket + recorder + silence detector
├── speechUtils.js        parseSpeech, countSentences, buildItemTimings
├── speechUtils.test.js   18 Vitest unit tests
├── diffUtils.js          LCS-based word-level diff (match / extra / missing)
├── lib/
│   ├── theme.js          Color palette C, btnSmall style
│   ├── ui.jsx            ScanLines, Vignette, DeviceSelect, AudioLevelMeter
│   ├── audio.js          b64ToBlob, playTts, useAudioDevices, getAudioStream
│   ├── FilePicker.jsx    File load + paste-text screen
│   └── transcription-protocol.js   WS_MSG constants — canonical message types
├── index.html
├── vite.config.js
└── package.json
```

## Panels

### Speaker (`teleprompter.jsx`)

Teleprompter with two independent play modes sharing a scroll container:

- **Manual scroll** — `requestAnimationFrame` loop using `speedRef` (ref, not state) so the loop never restarts on speed change. Sub-pixel accumulation prevents stalling at slow speeds.
- **TTS + synchronized scroll** — POSTs to `/api/speak`, reads NDJSON stream, queues audio chunks, syncs `scrollTop` via rAF against merged sentence-boundary timings.

Speed adjusts live during TTS playback — `audio.playbackRate` and scroll interpolation update every frame. Select text before pressing T to speak only the selection.

### Tutor (`tutor.jsx`)

Pronunciation practice against a reference text. State machine: `idle → starting → listening → processing → finished`. Word-level diff via LCS algorithm renders matches (green), extra words (amber), and missing words (red strikethrough). Click a missed word to hear it spoken via TTS in the session language.

### Free Speech (`freespeech.jsx`)

Open-ended transcription. Transcript accumulates across multiple recording sessions. Partial text shows in dimmed italic while recording.

### Shared hook: `useMicTranscription` (`transcription.js`)

Used by both Tutor and Free Speech. Encapsulates:

- WebSocket lifecycle (`/api/transcribe`)
- `MediaRecorder` with 1-second `audio/webm;codecs=opus` chunks
- Silence detector (300 ms threshold via `AnalyserNode`)
- Mic level meter (direct DOM writes via ref — no React re-renders at 60 fps)
- Mic hot-swap (tears down old stream/recorder/meter, acquires new device, re-attaches — WebSocket stays open)

Exposes `{ listenState, start, stop }`.

## WebSocket transcription protocol

Defined canonically in `lib/transcription-protocol.js`. Backend `main.py` stays synchronized with these constants.

| Direction | Message |
| --- | --- |
| Client → Server | `{type:"start", language, model, vad}` |
| Client → Server | Binary `audio/webm;codecs=opus` chunks |
| Client → Server | `{type:"pause_detected"}` |
| Client → Server | `{type:"stop"}` |
| Server → Client | `{type:"ready"}` |
| Server → Client | `{type:"transcript", text, is_final}` |
| Server → Client | `{type:"error", message}` |

## Audio device management (`lib/audio.js`)

- `useAudioDevices()` — enumerates input/output devices, listens for `devicechange`, returns selected mic/output + setters
- `getAudioStream(deviceId)` — acquires a `MediaStream` for a given device, or triggers `getDisplayMedia` for tab audio capture
- `playTts(text, voice, onEnd, outputDeviceId)` — streams TTS via `/api/speak` NDJSON, queues chunks, plays sequentially. Returns `{ abort(), audio }`. Output hot-swap via `setSinkId`
- `b64ToBlob(audio_b64, mimeType?)` — decodes base64 audio to a blob URL

## Speech file format

```text
## Section Title     → amber section header
**Bold line**        → emphasized text
---                  → visual spacer
Regular line         → normal paragraph
```

Files are loaded via `FileReader` API — never uploaded.

## Running

```bash
npm install
npm run dev     # http://localhost:5173 (proxies /api to :8000)
npm test        # Vitest unit tests
npm run build   # Production build → dist/
```
