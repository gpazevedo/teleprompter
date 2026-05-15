import logging
import subprocess
import threading

import imageio_ffmpeg
import numpy as np
from faster_whisper import WhisperModel

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FFMPEG_TIMEOUT = 30

log = logging.getLogger("uvicorn")

_whisper_models: dict[str, WhisperModel] = {}
_whisper_models_lock = threading.Lock()


def get_whisper_model(name: str) -> WhisperModel:
    if name not in _whisper_models:
        model = WhisperModel(name, compute_type="int8")
        with _whisper_models_lock:
            if name not in _whisper_models:
                _whisper_models[name] = model
    return _whisper_models[name]


def decode_webm_to_pcm(audio_bytes: bytes) -> np.ndarray:
    """Decode webm/opus audio to 16kHz float32 PCM via ffmpeg."""
    try:
        proc = subprocess.run(
            [
                FFMPEG, "-i", "pipe:0",
                "-f", "f32le", "-acodec", "pcm_f32le",
                "-ar", "16000", "-ac", "1",
                "pipe:1",
            ],
            input=audio_bytes,
            capture_output=True,
            timeout=FFMPEG_TIMEOUT,
        )
    except subprocess.TimeoutExpired as e:
        raise RuntimeError(
            f"ffmpeg timed out after {FFMPEG_TIMEOUT}s: {e}"
        )
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr.decode()}")
    return np.frombuffer(proc.stdout, dtype=np.float32)


def transcribe_pcm(model: WhisperModel, pcm: np.ndarray, language: str, vad_filter: bool = True) -> str:
    """Transcribe float32 16kHz PCM, return text."""
    if len(pcm) < 1600:  # < 0.1s at 16kHz
        return ""
    rms = float(np.sqrt(np.mean(pcm ** 2)))
    log.info("PCM rms=%.4f len=%.1fs vad=%s", rms, len(pcm) / 16000, vad_filter)
    segments, _ = model.transcribe(
        pcm,
        language=language,
        vad_filter=vad_filter,
        vad_parameters={"min_silence_duration_ms": 300},
    )
    parts = [s.text.strip() for s in segments if s.text.strip()]
    result = ""
    for part in parts:
        if result:
            result += ("\n" if result.endswith(".") else " ") + part
        else:
            result = part
    return result



