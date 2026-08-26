let socket = null;
let audioContext = null;
let workletNode = null;
let mediaStream = null;
let capturedTabId = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'START_AUDIO_STREAM') {
    startCapture(msg.streamId, msg.tabId);
  } else if (msg.action === 'STOP_AUDIO_STREAM') {
    stopCapture();
  }
});

function downsampleTo16k(input, inputRate) {
  if (inputRate === 16000) {
    return new Float32Array(input);
  }
  const ratio = inputRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio) || start + 1);
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += input[j];
      count++;
    }
    result[i] = count ? sum / count : input[start] || 0;
  }
  return result;
}

function updateStatus(status) {
  chrome.runtime.sendMessage({ action: 'UPDATE_STATUS', status }).catch(() => {});
}

async function startCapture(streamId, tabId) {
  console.log('[Offscreen] Starting capture with ID:', streamId);
  stopCapture(false);
  capturedTabId = tabId;

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId
        }
      },
      video: false
    });
    console.log('[Offscreen] Stream obtained successfully');

    socket = new WebSocket('ws://127.0.0.1:8000/audio');

    socket.onopen = () => {
      console.log('[Offscreen] WebSocket connected');
      updateStatus('Streaming');
      initAudioProcessing(mediaStream).catch((err) => {
        console.error('[Offscreen] Audio init failed:', err);
        updateStatus('Error: ' + err.message);
      });
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      chrome.runtime.sendMessage({
        action: 'NEW_CAPTIONS',
        data,
        tabId: capturedTabId
      }).catch(() => {});
    };

    socket.onclose = () => {
      updateStatus('Backend Offline');
    };

    socket.onerror = (e) => {
      console.error('WS Error:', e);
      updateStatus('Connection Error');
    };
  } catch (err) {
    console.error('Capture error:', err);
    updateStatus('Error: ' + err.message);
  }
}

async function initAudioProcessing(stream) {
  audioContext = new AudioContext();
  await audioContext.resume();
  console.log('[Offscreen] AudioContext sampleRate:', audioContext.sampleRate);

  await audioContext.audioWorklet.addModule(chrome.runtime.getURL('pcm-worklet.js'));

  const source = audioContext.createMediaStreamSource(stream);
  workletNode = new AudioWorkletNode(audioContext, 'pcm-worklet');
  workletNode.port.onmessage = (event) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const resampled = downsampleTo16k(event.data, audioContext.sampleRate);
    socket.send(resampled.buffer);
  };

  source.connect(workletNode);
  workletNode.connect(audioContext.destination);
}

function stopCapture(notify = true) {
  if (workletNode) {
    workletNode.port.onmessage = null;
    workletNode.disconnect();
    workletNode = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  if (notify) {
    updateStatus('Disconnected');
  }
}
