# 🎧 Kannada → English Real-Time Captioning Chrome Extension

## (Offline-First Architecture using Whisper + Twinara)

---

# 1. 📌 Objective

Build a Chrome Extension that:

* Captures **audio from a browser tab**
* Converts **Kannada speech → Kannada text**
* Translates **Kannada text → English**
* Displays **real-time captions overlay on the page**
* Works **fully offline (preferred)**

---

# 2. 🧠 System Overview

### High-Level Pipeline

```
Tab Audio
   ↓
Audio Stream (MediaStream API)
   ↓
Local Backend (Python Service)
   ↓
Speech-to-Text (Whisper)
   ↓
Translation (Twinara)
   ↓
Chrome Extension Overlay (Live Captions)
```

---

# 3. 🧩 System Components

## 3.1 Chrome Extension (Frontend)

### Responsibilities:

* Capture tab audio
* Send audio chunks to backend
* Receive translated text
* Render captions overlay

### Key Files:

```
/extension
  ├── manifest.json
  ├── background.js
  ├── content.js
  ├── popup.html (optional)
  └── styles.css
```

---

## 3.2 Local Backend (Python Service)

### Responsibilities:

* Receive audio stream
* Run speech recognition (Whisper)
* Run translation (Twinara)
* Send results back (WebSocket)

### Tech Stack:

* Python 3.10+
* FastAPI / Flask
* WebSockets
* PyTorch (for Whisper)

---

## 3.3 Models / Engines

### Speech-to-Text:

* Whisper (local)

### Translation:

* Twinara (offline, if accessible programmatically)

---

# 4. ⚙️ Functional Requirements

## 4.1 Audio Capture

* Capture audio from active tab
* Must work only after user interaction (Chrome policy)
* Stream audio in small chunks (~1–2 sec)

---

## 4.2 Speech Recognition

* Input: Raw audio chunks
* Output: Kannada text
* Must support streaming or chunk processing

---

## 4.3 Translation

* Input: Kannada text
* Output: English text
* Must be offline
* Prefer near real-time (<1 sec delay per chunk)

---

## 4.4 Caption Rendering

* Overlay UI on webpage
* Real-time updates
* Scroll or replace text dynamically

---

# 5. 🏗️ Technical Design

---

## 5.1 Chrome Extension

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "Kannada Live Caption",
  "version": "1.0",
  "permissions": ["tabCapture", "activeTab", "scripting"],
  "background": {
    "service_worker": "background.js"
  },
  "host_permissions": ["<all_urls>"]
}
```

---

## 5.2 Audio Capture (background.js)

```javascript
chrome.tabCapture.capture(
  { audio: true, video: false },
  (stream) => {
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);

    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);

      // Send to backend via WebSocket
      socket.send(data.buffer);
    };
  }
);
```

---

## 5.3 Backend (Python)

### Server Setup (FastAPI + WebSocket)

```python
from fastapi import FastAPI, WebSocket
import whisper

app = FastAPI()
model = whisper.load_model("base")

@app.websocket("/audio")
async def audio_stream(ws: WebSocket):
    await ws.accept()

    while True:
        audio_chunk = await ws.receive_bytes()

        # Convert audio chunk → text
        result = model.transcribe(audio_chunk, language='kn')
        kannada_text = result["text"]

        # Translate using Twinara
        english_text = translate_with_twinara(kannada_text)

        await ws.send_text(english_text)
```

---

## 5.4 Twinara Integration

### Option A: CLI Wrapper

```python
import subprocess

def translate_with_twinara(text):
    result = subprocess.run(
        ["twinara-cli", "--from", "kn", "--to", "en", text],
        capture_output=True,
        text=True
    )
    return result.stdout.strip()
```

---

### Option B: Local API (if available)

```
POST http://localhost:<port>/translate
{
  "source": "kn",
  "target": "en",
  "text": "..."
}
```

---

## 5.5 Content Script (Overlay UI)

```javascript
const captionBox = document.createElement("div");

captionBox.style.position = "fixed";
captionBox.style.bottom = "20px";
captionBox.style.left = "50%";
captionBox.style.transform = "translateX(-50%)";
captionBox.style.background = "rgba(0,0,0,0.7)";
captionBox.style.color = "white";
captionBox.style.padding = "10px";
captionBox.style.zIndex = 9999;

document.body.appendChild(captionBox);

chrome.runtime.onMessage.addListener((msg) => {
  captionBox.innerText = msg.text;
});
```

---

# 6. 🔌 Communication Flow

```
Extension (WebSocket Client)
        ⇄
Local Backend (WebSocket Server)
```

---

# 7. ⚠️ Constraints & Challenges

## 7.1 Chrome Limitations

* Requires user gesture for tab capture
* Cannot silently capture background tabs

---

## 7.2 Twinara Limitations

* No guaranteed API access
* May require CLI or reverse engineering

---

## 7.3 Latency Targets

* Speech recognition: ~1–2 sec
* Translation: <1 sec
* Total delay: ~2–3 sec

---

## 7.4 Hardware Requirements

* CPU: Minimum 4 cores
* RAM: 8GB+
* GPU (optional): Improves Whisper speed significantly

---

# 8. 🚀 Development Phases

---

## Phase 1: MVP

* Audio capture working
* Whisper transcription working
* Basic captions display

---

## Phase 2: Translation Integration

* Twinara integration
* Kannada → English pipeline

---

## Phase 3: Optimization

* Reduce latency
* Improve chunking strategy
* UI improvements

---

## Phase 4: Advanced Features

* Dual captions (Kannada + English)
* Save transcripts
* Language auto-detection
* Speaker detection

---

# 9. 🧪 Testing Strategy

### Test Cases:

* Clean Kannada speech
* Mixed Kannada + English
* Background noise scenarios
* YouTube videos
* Live streams

---

# 10. 📦 Deployment

## Extension

* Load unpacked via Chrome DevTools

## Backend

* Run locally:

```
uvicorn main:app --reload
```

---

# 11. 🔮 Future Improvements

* Replace Twinara with higher-quality local model if needed
* Add GPU acceleration
* Package as desktop app (Electron + extension hybrid)
* Publish to Chrome Web Store

---

# 12. ✅ Success Criteria

* Captions appear in real-time
* Kannada is correctly transcribed
* English translation is understandable
* System works offline

---

# 💬 Final Note

This system is essentially:

> **A universal offline live subtitle engine for any browser tab**

It combines:

* Real-time audio processing
* Speech recognition
* Machine translation
* UI rendering

A successful implementation can be extended into:

* Accessibility tool
* Meeting assistant
* Content translation platform

---
