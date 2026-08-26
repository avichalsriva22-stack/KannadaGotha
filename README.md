# KannadaGotta — Real-Time Kannada → English Tab Captions

Chrome extension + local Python service that captures audio from the active browser tab, translates Kannada speech, and overlays English captions on the page. All processing runs on your machine — audio never leaves `127.0.0.1`.

**Who it is for:** English readers following Kannada news, lectures, or YouTube; Kannada speakers who want English notes; and anyone who needs live captions without sending speech to a cloud API.

> **Note:** `SPEC.MD` describes an earlier design (Whisper STT + Twinara translation). The implemented pipeline uses **faster-whisper** with `task="translate"` so Kannada audio is decoded straight to English in one model pass.

## How it works

```
Active tab audio
        ↓
Chrome MV3 offscreen document + AudioWorklet (PCM)
        ↓
Client-side downsample → 16 kHz float32
        ↓
WebSocket  ws://127.0.0.1:8000/audio
        ↓
Ring buffer (3 s windows, 1 s overlap) + RMS silence gate
        ↓
faster-whisper (Kannada → English, CPU int8)
        ↓
JSON captions → content-script overlay
```

1. Popup requests a `tabCapture` stream ID for the active tab (blocked on `chrome://`, `edge://`, and similar pages).
2. An **offscreen document** obtains the MediaStream, runs an AudioWorklet (`pcm-worklet.js`, 4096-sample batches), downsamples to 16 kHz, and streams raw float32 over WebSocket. Tab audio is also played through the offscreen document so the video does not go silent while captions run.
3. The backend accumulates samples in `AudioRingBuffer`, skips silent windows (RMS &lt; 0.01), and transcribes non-overlapping work on a thread pool so the socket stays responsive.
4. Captions are injected as a dual-line overlay (Kannada status + English text). The overlay auto-clears after 8 seconds of inactivity.

Kannada line in the overlay is currently a status placeholder (`[Kannada Audio Detected]`), not a separate Kannada transcript. English comes from Whisper’s built-in translation task.

## Tech stack

| Layer | Technologies |
| --- | --- |
| Extension | Chrome Manifest V3, `tabCapture`, offscreen documents, AudioWorklet, content scripts |
| Backend | Python, FastAPI, Uvicorn, WebSockets, NumPy |
| Speech / translation | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) (`base` by default), CTranslate2 **int8** on CPU |
| Tests | 8 unit tests in `backend/test_audio_util.py` (ring buffer, silence, resample, byte decode) |

`backend/requirements.txt` also lists `torch`, `transformers`, and `sentencepiece`. Those are **not imported** by the current server; they are leftover from the planned Twinara / Hugging Face translation path.

## Repository layout

```
KANNADAGOTHA/
├── README.md
├── SPEC.MD                 # original design notes (partially outdated)
├── backend/
│   ├── main.py             # FastAPI app, /health + /audio WebSocket
│   ├── audio_util.py       # ring buffer, silence, resample helpers
│   ├── test_audio_util.py
│   └── requirements.txt
└── extension/
    ├── manifest.json
    ├── popup.html / popup.js
    ├── background.js       # service worker: offscreen + caption routing
    ├── offscreen.html / offscreen.js
    ├── pcm-worklet.js
    ├── content.js / content.css
```

## Audio / model parameters (from code)

| Constant | Value | Source |
| --- | --- | --- |
| Whisper sample rate | 16 kHz | `audio_util.py` |
| Inference window | 48,000 samples = **3.0 s** | `WINDOW_SAMPLES` |
| Overlap kept after a window | 16,000 samples = **1.0 s** | `OVERLAP_SAMPLES` |
| Max backlog while busy | 64,000 samples = **4.0 s** | `MAX_PENDING_SAMPLES` |
| Silence gate | RMS &lt; **0.01** | `SILENCE_RMS` |
| Default model | `base` (override with `WHISPER_MODEL`) | `main.py` |
| Device / compute | CPU, `int8` | `main.py` |
| Decode | `language="kn"`, `task="translate"`, `beam_size=5`, `temperature=0.0`, VAD filter on | `main.py` |

`SPEC.MD` lists **target** latency of ~2–3 s end-to-end. That is a design goal, not a measured benchmark in this repo.

## Setup

### Backend

Requires Python 3.10+. First run downloads the Whisper weights (network required once; later runs can stay offline).

```bash
cd backend
pip install -r requirements.txt
python main.py
```

Server binds to `127.0.0.1:8000`. Health check: `GET http://127.0.0.1:8000/health`.

Optional: `set WHISPER_MODEL=small` (Windows) or `export WHISPER_MODEL=small` before starting for a larger local model.

### Extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. **Load unpacked** → select the `extension/` folder.
4. Play Kannada audio in a normal https tab (YouTube, news, etc.).
5. Click the extension icon → **Start Captioning**. Confirm the popup says **Backend ready**.

Stop with **Stop Captioning**. The popup will also reset if the WebSocket drops.

## Features

- Tab-only capture (no microphone) via Chrome `tabCapture` + offscreen document (Manifest V3).
- Playback continues while captioning — captured tab audio is routed so the page does not mute.
- Live English captions on ordinary https pages (YouTube, news, lectures), with a retry if the page script was not yet loaded.
- Local inference; speech never leaves the machine.
- Health check in the popup (`Backend ready` / offline) before capture starts.
- Back-pressure: while a window is transcribing, older samples are dropped so captions stay timely instead of falling further behind.
- Dual-line overlay (Kannada status + English text) that clears after 8 seconds of inactivity.

## Limitations

- Not published to the Chrome Web Store; load unpacked only.
- Chrome/Edge internal pages cannot be captured.
- Kannada text is not returned as a full transcript yet (English-only Whisper `translate` path).
- No GPU path wired up (`device="cpu"` is hardcoded).


## Tests

```bash
cd backend
python test_audio_util.py
```

Expected: prints `ok` and exits 0.

## License

Not specified in this repository.
