import asyncio
import base64
import json
import logging
from io import BytesIO
from pathlib import Path

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")  # silent if .env missing — optional config

import edge_tts
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from lib.audio import decode_webm_to_pcm, get_whisper_model, transcribe_pcm

log = logging.getLogger("uvicorn")
app = FastAPI()


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


CHUNK_SIZE = 3  # paragraphs per chunk — communicated to frontend in each NDJSON line


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
                "chunk_size": CHUNK_SIZE,
                "chunk": i,
                "is_last": i == len(chunks) - 1,
            }) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")


# WebSocket message types must stay synchronized with frontend/lib/transcription-protocol.js
@app.websocket("/api/transcribe")
async def transcribe_ws(ws: WebSocket):
    await ws.accept()
    audio_chunks = BytesIO()
    model = None
    language = "en"
    vad_filter = True
    closed = False
    partial_task: asyncio.Task | None = None
    last_partial_pcm_len: int = 0   # sample count at time of last completed partial
    last_partial_text: str = ""     # text produced by last completed partial

    async def do_transcribe(is_final: bool):
        nonlocal last_partial_pcm_len, last_partial_text
        if closed:
            return
        size = audio_chunks.tell()
        if size == 0 or model is None:
            if is_final and last_partial_text:
                await ws.send_json({"type": "transcript", "text": last_partial_text, "is_final": True})
            return

        # Decode full buffer once — fast (ffmpeg runs at >> real-time)
        audio_chunks.seek(0)
        audio_data = audio_chunks.read()
        audio_chunks.seek(0, 2)
        pcm = await asyncio.to_thread(decode_webm_to_pcm, audio_data)

        if is_final and last_partial_pcm_len > 0:
            # Only transcribe the audio recorded after the last partial
            delta_pcm = pcm[last_partial_pcm_len:]
            log.info("[final-delta] %.1fs delta (%.1fs total)", len(delta_pcm) / 16000, len(pcm) / 16000)
            delta_text = await asyncio.to_thread(transcribe_pcm, model, delta_pcm, language, vad_filter)
            if delta_text:
                sep = "\n" if last_partial_text.endswith(".") else " "
                text = (last_partial_text + sep + delta_text).strip()
            else:
                text = last_partial_text
        else:
            kind = "final" if is_final else "partial"
            log.info("[%s] Transcribing %.1fs...", kind, len(pcm) / 16000)
            text = await asyncio.to_thread(transcribe_pcm, model, pcm, language, vad_filter)
            if not is_final:
                last_partial_pcm_len = len(pcm)
                last_partial_text = text

        if closed:
            return
        log.info("[%s] Result: %s", "final" if is_final else "partial", text[:200])
        await ws.send_json({"type": "transcript", "text": text, "is_final": is_final})

    try:
        while True:
            message = await ws.receive()

            if "text" in message:
                data = json.loads(message["text"])

                if data["type"] == "start":
                    language = data.get("language", "en")
                    model_name = data.get("model", "small")
                    vad_filter = data.get("vad", True)
                    log.info("Loading whisper model '%s' (lang=%s vad=%s)...", model_name, language, vad_filter)
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
                    # Let any in-flight partial complete — its result updates
                    # last_partial_pcm_len/text so the final only transcribes the delta.
                    # (asyncio.to_thread threads cannot be interrupted anyway, so
                    # cancelling would just discard the completed result.)
                    if partial_task and not partial_task.done():
                        try:
                            await partial_task
                        except Exception:
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
