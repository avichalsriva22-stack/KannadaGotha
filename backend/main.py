import asyncio
import logging
import os

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

from audio_util import (
    MAX_PENDING_SAMPLES,
    OVERLAP_SAMPLES,
    WHISPER_SAMPLE_RATE,
    WINDOW_SAMPLES,
    AudioRingBuffer,
    bytes_to_float32,
    is_silent,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_NAME = os.getenv("WHISPER_MODEL", "base")
COMPUTE_TYPE = "int8"
WINDOW_MS = int(WINDOW_SAMPLES / WHISPER_SAMPLE_RATE * 1000)

logger.info("Loading faster-whisper model (%s, %s)...", MODEL_NAME, COMPUTE_TYPE)
stt_model = WhisperModel(MODEL_NAME, device="cpu", compute_type=COMPUTE_TYPE)


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "compute_type": COMPUTE_TYPE,
        "window_ms": WINDOW_MS,
    }


def transcribe_chunk(process_data: np.ndarray) -> str:
    segments, _info = stt_model.transcribe(
        process_data,
        language="kn",
        task="translate",
        beam_size=5,
        temperature=0.0,
        vad_filter=True,
        without_timestamps=True,
        condition_on_previous_text=False,
    )
    parts = []
    for seg in segments:
        text = (seg.text or "").strip()
        logger.info(
            "Segment logprob=%.3f no_speech=%.3f text=%s",
            seg.avg_logprob,
            seg.no_speech_prob,
            text or "(empty)",
        )
        if text:
            parts.append(text)
    return " ".join(parts).strip()


async def run_transcribe(window: np.ndarray, websocket: WebSocket) -> None:
    try:
        english_text = await asyncio.to_thread(transcribe_chunk, window)
    except Exception as transcribe_error:
        logger.error("Transcription failed: %s", transcribe_error)
        return

    if not english_text:
        return

    logger.info("Direct Translation (EN): %s", english_text)
    try:
        await websocket.send_json({
            "kannada": "[Kannada Audio Detected]",
            "english": english_text,
        })
    except Exception as send_error:
        logger.error("Failed to send caption: %s", send_error)


@app.websocket("/audio")
async def audio_endpoint(websocket: WebSocket):
    await websocket.accept()
    logger.info("Client connected to /audio")

    buffer = AudioRingBuffer()
    transcribe_task = None

    try:
        while True:
            data = await websocket.receive_bytes()
            chunk = bytes_to_float32(data)
            if chunk.size == 0:
                continue

            buffer.append(chunk)

            if transcribe_task is not None and not transcribe_task.done():
                buffer.drop_oldest_to(MAX_PENDING_SAMPLES)
                continue

            if transcribe_task is not None:
                exc = transcribe_task.exception()
                if exc is not None:
                    logger.error("Transcription task failed: %s", exc)
                transcribe_task = None

            if buffer.size < WINDOW_SAMPLES:
                continue

            window = buffer.take_window(WINDOW_SAMPLES, keep=OVERLAP_SAMPLES)
            if is_silent(window):
                continue

            transcribe_task = asyncio.create_task(run_transcribe(window, websocket))
    except WebSocketDisconnect:
        logger.info("Client closed the socket")
    except Exception as e:
        logger.error("WebSocket error: %s", e)
    finally:
        if transcribe_task is not None and not transcribe_task.done():
            transcribe_task.cancel()
        logger.info("Client disconnected")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
