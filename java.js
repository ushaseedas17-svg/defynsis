/* DefenSys — Code Word Voice Trigger
 * Listens continuously for the safety code word ("AEGIS") and phonetic
 * near-matches, then fires window.simulate('codeword') when heard.
 *
 * IMPORTANT: the browser's SpeechRecognition API (and getUserMedia, which it
 * relies on for microphone access) is only available in a "secure context" —
 * that means the page must be served over https:// or http://localhost.
 * If you open this HTML file directly by double-clicking it (a file:// URL),
 * Chrome/Edge/Safari will silently block the microphone and this listener
 * will never start. Run a tiny local server instead, e.g.:
 *     python -m http.server 8000
 * then open http://localhost:8000/defensys-elegant.html
 */
(function () {
  'use strict';

  // Supported code word + phonetic / safety-keyword fallbacks
  const CODE_WORDS = [
    'aegis', 'egis', 'ages', 'aigis', 'aygis', 'agies', 'edges',
    'help', 'sos', 'emergency', 'defensys', 'danger', 'save me'
  ];

  let speechRecognition = null;
  let speechRecognitionEnabled = false;

  function normalizeSpeech(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function isSecure() {
    return window.isSecureContext;
  }

  function startCodeWordListener() {
    if (!isSecure()) {
      console.warn(
        '[DefenSys][codeword] Blocked: page is not a secure context (' +
        window.location.protocol + '). Serve over https:// or http://localhost.'
      );
      return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[DefenSys][codeword] Speech recognition is not supported in this browser.');
      return false;
    }

    if (speechRecognitionEnabled && speechRecognition) return true;

    try {
      speechRecognition = new SpeechRecognition();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.lang = navigator.language || 'en-US';

      speechRecognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += ` ${event.results[i][0].transcript}`;
        }
        const cleaned = normalizeSpeech(transcript);
        console.info('[DefenSys][codeword] Heard speech:', cleaned);

        const isMatch = CODE_WORDS.some((w) => cleaned.includes(w));
        if (isMatch) {
          console.info('[DefenSys][codeword] Code word trigger matched:', cleaned);
          try { speechRecognition.stop(); } catch (e) {}
          if (typeof window.simulate === 'function') {
            window.simulate('codeword');
          }
        }
      };

      speechRecognition.onerror = (event) => {
        console.warn('[DefenSys][codeword] Listener error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          speechRecognitionEnabled = false;
        }
      };

      speechRecognition.onend = () => {
        if (speechRecognitionEnabled) {
          setTimeout(() => {
            try {
              if (speechRecognitionEnabled) speechRecognition.start();
            } catch (error) {}
          }, 300);
        }
      };

      speechRecognitionEnabled = true;
      speechRecognition.start();
      console.info("[DefenSys][codeword] Listener active: listening for 'AEGIS' & safety keywords.");
      return true;
    } catch (error) {
      console.warn('[DefenSys][codeword] Start error:', error.message);
      return false;
    }
  }

  function stopCodeWordListener() {
    speechRecognitionEnabled = false;
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch (error) {}
      speechRecognition = null;
    }
  }

  // Expose a small public API used by defensys-elegant.html
  window.startDefenSysCodeWordListener = startCodeWordListener;
  window.stopDefenSysCodeWordListener = stopCodeWordListener;
  window.isDefenSysCodeWordSupported = isSupported;
})();