# Backend

FastAPI server providing TTS synthesis and speech transcription for the Teleprompter app.

## Stack

| Component | Role |
| --- | --- |
| **FastAPI** | HTTP + WebSocket server |
| **edge-tts** | Microsoft Azure Neural TTS via unofficial API |
| **faster-whisper** | OpenAI Whisper inference via CTranslate2 (CPU, int8) |
| **imageio-ffmpeg** | Bundled ffmpeg binary — no system install required |
| **uvicorn** | ASGI server |

## Endpoints

### `GET /api/voices`

Returns available edge-tts voices from the Azure Neural TTS service.

```json
[{ "name": "en-US-EricNeural", "locale": "en-US", "gender": "Male" }, ...]
```

### `POST /api/speak`

Synthesizes text in chunks of 3 paragraphs and streams the results as NDJSON (`application/x-ndjson`). Each newline-delimited JSON object is one chunk:

#### Request

```json
{ "text": "Hello world.", "voice": "en-US-EricNeural" }
```

#### Response (NDJSON — one object per line)

```json
{ "audio_b64": "<base64-encoded MP3>", "boundaries": [{ "word": "Hello world.", "offset_ms": 0, "duration_ms": 850 }], "chunk": 0, "is_last": true }
```

The text is split on `\n\n` into groups of 3 paragraphs (`split_into_chunks`). Each chunk is synthesized independently so the frontend can start playing the first chunk while the rest are still being synthesized.

`edge_tts.Communicate.stream()` yields two event types per chunk:

- `audio` events — raw MP3 bytes, accumulated in a `BytesIO` buffer
- `SentenceBoundary` events — contain `offset` and `duration` in 100-nanosecond units (divided by 10,000 → milliseconds)

The frontend reads the stream, plays chunk 0 immediately, queues the rest, and builds scroll timings per chunk as each one starts playing.

### `WS /api/transcribe`

Streams audio from the browser, returns partial and final transcriptions.

#### Protocol — client → server

| Frame | Description |
| --- | --- |
| `{"type":"start","language":"en","model":"small"}` | Load Whisper model, begin session |
| Binary | Raw `audio/webm;codecs=opus` chunks (1-second intervals from `MediaRecorder`) |
| `{"type":"pause_detected"}` | Silence detected by the frontend — trigger a partial transcription |
| `{"type":"stop"}` | End of recording — trigger final transcription and close |

#### Protocol — server → client

| Frame | Description |
| --- | --- |
| `{"type":"ready"}` | Model loaded, recording may begin |
| `{"type":"transcript","text":"...","is_final":false}` | Partial result (after silence) |
| `{"type":"transcript","text":"...","is_final":true}` | Final result (after stop) |
| `{"type":"error","message":"..."}` | Transcription failure |

## Audio pipeline

```text
Browser MediaRecorder (webm/opus)
  → binary WebSocket frames
    → BytesIO accumulation buffer
      → ffmpeg subprocess (pipe:0 → pipe:1)
        decodes webm/opus → PCM f32le, 16kHz, mono
          → numpy float32 array
            → faster-whisper transcribe()
              → text segments joined with spaces
```

`decode_webm_to_pcm` shells out to the bundled ffmpeg via `subprocess.run` with stdin/stdout pipes. This is synchronous; it runs in a thread via `asyncio.to_thread` so it does not block the event loop.

Whisper's built-in VAD filter (`vad_filter=True`, `min_silence_duration_ms=500`) suppresses non-speech regions inside each transcription call.

## Concurrency model

The server is single-process, async. Key points:

- **Whisper inference** is CPU-bound and synchronous — always dispatched via `asyncio.to_thread`.
- **Partial transcription tasks** (`partial_task`) are tracked so a second `pause_detected` signal does not launch a concurrent transcription while one is already running.
- On `stop`, any in-flight partial task is cancelled before the final transcription runs.
- The `closed` flag guards against sending on the WebSocket after disconnect.

## Model caching

`_whisper_models` is a module-level dict. `get_whisper_model(name)` loads the model on first call and returns the cached instance thereafter. Models persist for the lifetime of the server process, shared across all WebSocket connections.

```python
_whisper_models: dict[str, WhisperModel] = {}

def get_whisper_model(name: str) -> WhisperModel:
    if name not in _whisper_models:
        _whisper_models[name] = WhisperModel(name, compute_type="int8")
    return _whisper_models[name]
```

`compute_type="int8"` quantizes weights to 8-bit integers — significantly reduces memory and speeds up CPU inference with acceptable accuracy loss.

## Static file serving

In Docker (after `npm run build`), the frontend's `dist/` is copied to `backend/static/`. If that directory exists at startup, FastAPI mounts it at `/` via `StaticFiles(html=True)`, which serves `index.html` for any unmatched route (SPA fallback). In development this mount is absent; Vite dev server handles the frontend separately and proxies `/api` to port 8000.

## Running

```bash
# Development
uv run uvicorn main:app --reload

# Docker
docker build -t teleprompter .
docker run -p 8000:8000 teleprompter
```

Python 3.12+ required. Dependencies managed with `uv`.
