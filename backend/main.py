import asyncio
import base64
from io import BytesIO
from pathlib import Path

import edge_tts
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

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


@app.post("/api/speak")
async def speak(req: SpeakRequest):
    communicate = edge_tts.Communicate(req.text, req.voice)
    audio_buf = BytesIO()
    boundaries = []

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_buf.write(chunk["data"])
        elif chunk["type"] == "SentenceBoundary":
            boundaries.append(
                {
                    "word": chunk["text"],
                    "offset_ms": chunk["offset"] // 10_000,
                    "duration_ms": chunk["duration"] // 10_000,
                }
            )

    return {
        "audio_b64": base64.b64encode(audio_buf.getvalue()).decode(),
        "boundaries": boundaries,
    }


# Serve built frontend — only present in Docker / after `npm run build`
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/", StaticFiles(directory=static_path, html=True), name="static")
