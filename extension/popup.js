const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

function setStatus(text) {
  statusEl.innerText = text;
}

function setRunning(running) {
  startBtn.style.display = running ? 'none' : 'block';
  stopBtn.style.display = running ? 'block' : 'none';
}

chrome.runtime.sendMessage({ action: 'ENSURE_OFFSCREEN' }).catch(() => {});

fetch('http://127.0.0.1:8000/health')
  .then((res) => {
    if (res.ok) setStatus('Backend ready');
    else setStatus('Backend not ready');
  })
  .catch(() => {
    setStatus('Backend offline — run backend/main.py');
  });

startBtn.addEventListener('click', async () => {
  console.log('[Popup] Start button clicked');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      setStatus('Error: no active tab');
      return;
    }
    if (tab.url && (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || tab.url.startsWith('edge://') || tab.url.startsWith('about:'))) {
      setStatus('Error: cannot capture this page');
      return;
    }

    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
    console.log('[Popup] Stream ID generated for tab:', tab.id);
    chrome.runtime.sendMessage({
      action: 'START_CAPTURE',
      tabId: tab.id,
      streamId
    });

    setRunning(true);
    setStatus('Starting...');
  } catch (err) {
    console.error('[Popup] Start failed:', err);
    setRunning(false);
    setStatus('Error: ' + err.message);
  }
});

stopBtn.addEventListener('click', () => {
  console.log('[Popup] Stop button clicked');
  chrome.runtime.sendMessage({ action: 'STOP_CAPTURE' });
  setRunning(false);
  setStatus('Stopped');
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'UPDATE_STATUS') {
    setStatus(msg.status);
    if (msg.status === 'Disconnected' || String(msg.status).includes('Error') || msg.status === 'Backend Offline' || msg.status === 'Connection Error') {
      setRunning(false);
    }
  }
});
