import asyncio
import base64
import json
import logging
import subprocess
from io import BytesIO
from pathlib import Path

import edge_tts
import imageio_ffmpeg
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from faster_whisper import WhisperModel
from pydantic import BaseModel

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

log = logging.getLogger("uvicorn")
app = FastAPI()

# Cache loaded Whisper models to avoid reloading per connection
_whisper_models: dict[str, WhisperModel] = {}


def get_whisper_model(name: str) -> WhisperModel:
    if name not in _whisper_models:
        _whisper_models[name] = WhisperModel(name, compute_type="int8")
    return _whisper_models[name]


def decode_webm_to_pcm(audio_bytes: bytes) -> np.ndarray:
    """Decode webm/opus audio to 16kHz float32 PCM via ffmpeg."""
    proc = subprocess.run(
        [
            FFMPEG, "-i", "pipe:0",
            "-f", "f32le", "-acodec", "pcm_f32le",
            "-ar", "16000", "-ac", "1",
            "pipe:1",
        ],
        input=audio_bytes,
        capture_output=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr.decode()}")
    return np.frombuffer(proc.stdout, dtype=np.float32)


def transcribe_audio(model: WhisperModel, audio_bytes: bytes, language: str) -> str:
    """Decode and transcribe audio bytes, return text."""
    pcm = decode_webm_to_pcm(audio_bytes)
    if len(pcm) < 1600:  # less than 0.1s
        return ""
    segments, _ = model.transcribe(
        pcm,
        language=language,
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
    )
    return " ".join(s.text.strip() for s in segments)


class SpeakRequest(BaseModel):
    text: str
    voice: str = "en-US-EricNeural"


@app.get("/api/voices")
async def list_voices():
    voices = await edge_tts.list_voices()
    return [
        {"name": v["Name"], "locale": v["Locale"], "gender": v["Gender"]}
        for v in voices
    ]


CHUNK_SIZE = 3  # paragraphs per streamed chunk


def split_into_chunks(text: str) -> list[str]:
    """Split text into groups of CHUNK_SIZE non-empty paragraphs."""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paras:
        return [text]
    return ["\n\n".join(paras[i:i + CHUNK_SIZE]) for i in range(0, len(paras), CHUNK_SIZE)]


@app.post("/api/speak")
async def speak(req: SpeakRequest):
    chunks = split_into_chunks(req.text)

    async def generate():
        for i, chunk_text in enumerate(chunks):
            communicate = edge_tts.Communicate(chunk_text, req.voice)
            audio_buf = BytesIO()
            boundaries = []
            async for item in communicate.stream():
                if item["type"] == "audio":
                    audio_buf.write(item["data"])
                elif item["type"] == "SentenceBoundary":
                    boundaries.append({
                        "word": item["text"],
                        "offset_ms": item["offset"] // 10_000,
                        "duration_ms": item["duration"] // 10_000,
                    })
            yield json.dumps({
                "audio_b64": base64.b64encode(audio_buf.getvalue()).decode(),
                "boundaries": boundaries,
                "chunk": i,
                "is_last": i == len(chunks) - 1,
            }) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


@app.websocket("/api/transcribe")
async def transcribe_ws(ws: WebSocket):
    await ws.accept()
    audio_chunks = BytesIO()
    model = None
    language = "en"
    closed = False
    partial_task: asyncio.Task | None = None

    async def do_transcribe(is_final: bool):
        if closed:
            return
        size = audio_chunks.tell()
        if size == 0 or model is None:
            return
        audio_chunks.seek(0)
        audio_data = audio_chunks.read()
        audio_chunks.seek(0, 2)
        kind = "final" if is_final else "partial"
        log.info("[%s] Transcribing %d bytes...", kind, len(audio_data))
        text = await asyncio.to_thread(
            transcribe_audio, model, audio_data, language
        )
        if closed:
            return
        log.info("[%s] Result: %s", kind, text[:200])
        await ws.send_json({
            "type": "transcript", "text": text, "is_final": is_final,
        })

    try:
        while True:
            message = await ws.receive()

            if "text" in message:
                data = json.loads(message["text"])

                if data["type"] == "start":
                    language = data.get("language", "en")
                    model_name = data.get("model", "small")
                    log.info("Loading whisper model '%s' (lang=%s)...", model_name, language)
                    model = await asyncio.to_thread(get_whisper_model, model_name)
                    log.info("Model '%s' ready", model_name)
                    await ws.send_json({"type": "ready"})

                elif data["type"] == "pause_detected":
                    # Only fire if no partial is already in flight
                    if partial_task is None or partial_task.done():
                        log.info("Pause detected, triggering partial transcription")
                        partial_task = asyncio.create_task(do_transcribe(is_final=False))

                elif data["type"] == "stop":
                    log.info("Stop received, audio buffer: %d bytes", audio_chunks.tell())
                    # Wait for any in-flight partial to finish before final
                    if partial_task and not partial_task.done():
                        partial_task.cancel()
                        try:
                            await partial_task
                        except asyncio.CancelledError:
                            pass
                    try:
                        await do_transcribe(is_final=True)
                    except Exception as e:
                        log.error("Final transcription error: %s", e)
                        await ws.send_json({"type": "error", "message": str(e)})
                    break

            elif "bytes" in message:
                audio_chunks.write(message["bytes"])

    except WebSocketDisconnect:
        log.info("WebSocket disconnected")
    finally:
        closed = True


# Serve built frontend — only present in Docker / after `npm run build`
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
