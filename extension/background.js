async function ensureOffscreen() {
  const existing = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (existing.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Capturing tab audio for live captions.'
  });
}

async function sendCaptionToTab(tabId, data) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CAPTION', data });
    return;
  } catch (err) {
    console.warn('[Background] Content script missing, injecting:', err.message);
  }

  try {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await chrome.tabs.sendMessage(tabId, { action: 'UPDATE_CAPTION', data });
  } catch (err) {
    console.error('[Background] Could not deliver captions to tab', tabId, err);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  console.log('[Background] Received message:', msg.action);

  if (msg.action === 'ENSURE_OFFSCREEN') {
    ensureOffscreen()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.action === 'START_CAPTURE') {
    (async () => {
      try {
        await ensureOffscreen();
        let streamId = msg.streamId;
        if (!streamId) {
          streamId = await chrome.tabCapture.getMediaStreamId({
            targetTabId: msg.tabId
          });
        }
        chrome.runtime.sendMessage({
          action: 'START_AUDIO_STREAM',
          streamId,
          tabId: msg.tabId
        }).catch(() => {});
      } catch (err) {
        console.error('[Background] START_CAPTURE failed:', err);
        chrome.runtime.sendMessage({
          action: 'UPDATE_STATUS',
          status: 'Error: ' + err.message
        }).catch(() => {});
      }
    })();
    return false;
  }

  if (msg.action === 'STOP_CAPTURE') {
    chrome.runtime.sendMessage({ action: 'STOP_AUDIO_STREAM' }).catch(() => {});
    return false;
  }

  if (msg.action === 'NEW_CAPTIONS' && msg.tabId) {
    sendCaptionToTab(msg.tabId, msg.data);
    return false;
  }

  return false;
});
