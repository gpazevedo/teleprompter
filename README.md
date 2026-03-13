# Teleprompter

Browser-based teleprompter for Toastmasters and public speakers. Smooth auto-scroll with adjustable speed, font size, mirror mode, and text-to-speech with synchronized scrolling.

## Stack

- **Frontend** — React 18 + Vite, inline CSS (amber phosphor aesthetic), Vitest unit tests
- **Backend** — FastAPI + Python `edge-tts`, served via `uvicorn`
- **Packaging** — Multi-stage Docker image (node build → python runtime)

## Run locally

```bash
# Backend (from backend/)
uv run uvicorn main:app --reload   # http://localhost:8000

# Frontend (from frontend/)
npm install
npm run dev                        # http://localhost:5173
npm test                           # unit tests
```

## Run with Docker

```bash
docker build -t teleprompter .
docker run -p 8000:8000 teleprompter   # http://localhost:8000
```

## Usage

Load a `.txt` speech file using the file picker (or the **load file** link in the controls bar). The file is read locally — never uploaded.

## Controls

| Action | Keyboard | UI |
|---|---|---|
| Play / Pause scroll | `Space` | PLAY button |
| Speak / Stop TTS | `T` | SPEAK button |
| Speed (scroll & TTS) | `↑` / `↓` (±0.1x) | Slider (0.1x – 3.0x) |
| Font size | `[` / `]` | A− / A+ buttons |
| Reset | `R` | RESET button |
| Mirror | `M` | MIRROR button |

Speed can be adjusted live during TTS playback — voice and scroll respond immediately.

## Speech file format

```
## Section Title     → amber section header
**Bold line**        → emphasized text
---                  → visual spacer
Regular line         → normal paragraph
```
