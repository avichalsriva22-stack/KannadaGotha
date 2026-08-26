if (!window.__kannadaGottaInjected) {
  window.__kannadaGottaInjected = true;

  let captionContainer = null;
  let knnText = null;
  let engText = null;

  function createCaptionUI() {
    if (captionContainer) return;

    captionContainer = document.createElement('div');
    captionContainer.id = 'kannada-gotta-captions';

    knnText = document.createElement('div');
    knnText.className = 'kn-text';

    engText = document.createElement('div');
    engText.className = 'en-text';

    captionContainer.appendChild(knnText);
    captionContainer.appendChild(engText);
    document.body.appendChild(captionContainer);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'UPDATE_CAPTION') {
      createCaptionUI();
      knnText.innerText = msg.data.kannada || '';
      engText.innerText = msg.data.english || 'Listening...';

      clearTimeout(captionContainer.hideTimeout);
      captionContainer.hideTimeout = setTimeout(() => {
        knnText.innerText = '';
        engText.innerText = '';
      }, 8000);
    }
  });
}
