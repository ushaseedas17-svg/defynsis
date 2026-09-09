/* ============================================================
   DEFENSYS — java.js
   Live Voice Code Word + Secret Shake Trigger
   ============================================================

   IMPORTANT:
   - Microphone requires HTTPS or localhost.
   - GitHub Pages HTTPS works.
   - Opening the HTML with file:// will NOT work.
   ============================================================ */

(function () {
  'use strict';

  /* ============================================================
     SETTINGS
     ============================================================ */

  const CODE_WORDS = [
    'aegis',
    'egis',
    'ages',
    'aigis',
    'aygis',
    'ayges',
    'agies',
    'agis',
    'edges',

    // Emergency fallback words
    'help',
    'sos',
    'emergency',
    'danger',
    'save me',
    'defensys'
  ];

  const RESTART_DELAY = 500;

  let speechRecognition = null;
  let speechRecognitionEnabled = false;
  let restarting = false;

  let motionListenerEnabled = false;
  let motionHits = [];
  let lastMotionHitAt = 0;


  /* ============================================================
     LIVE MIC STATUS
     Your HTML uses this object to display:
     "Mic listening"
     "Mic not armed yet"
     etc.
     ============================================================ */

  window.__defensysCodeWordStatus = {
    armed: false,
    lastError: null,
    lastHeard: null,
    lastHeardAt: null,
    restarts: 0,
    audioActive: false
  };


  /* ============================================================
     LIVE SHAKE STATUS
     ============================================================ */

  window.__defensysGestureStatus = {
    armed: false,
    supported: ('DeviceMotionEvent' in window),
    lastError: null,
    lastShakeAt: null,
    hits: 0
  };


  /* ============================================================
     HELPER — UPDATE DEFENSYS UI
     ============================================================ */

  function refreshDefenSysUI() {

    /*
     * Your HTML already has a function that refreshes the
     * live-trigger status every second.
     *
     * This makes the update happen immediately as well.
     */

    try {
      if (typeof window.__defensysRerender__ === 'function') {
        window.__defensysRerender__();
      }
    } catch (error) {
      console.warn(
        '[DefenSys] UI refresh failed:',
        error
      );
    }

    try {
      const statusElement =
        document.getElementById('liveTriggerStatus');

      if (
        statusElement &&
        typeof window.renderLiveTriggerStatus === 'function'
      ) {
        statusElement.innerHTML =
          window.renderLiveTriggerStatus();
      }
    } catch (error) {
      // Safe to ignore.
    }
  }


  /* ============================================================
     HELPER — UPDATE DISTRESS RISK
     ============================================================ */

  function updateDistress(level) {

    console.info(
      '[DefenSys] Distress level →',
      level
    );

    /*
     * setRisk() belongs to the main DefenSys HTML.
     * It is available globally after the page loads.
     */

    try {

      if (typeof window.setRisk === 'function') {
        window.setRisk(level);
      }

    } catch (error) {

      console.warn(
        '[DefenSys] Could not update distress level:',
        error
      );

    }

    /*
     * Force the visible screen to update.
     */

    try {

      if (typeof window.__defensysRerender__ === 'function') {
        window.__defensysRerender__();
      }

    } catch (error) {}

  }


  /* ============================================================
     HELPER — NORMALIZE SPEECH
     ============================================================ */

  function normalizeSpeech(value) {

    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  }


  /* ============================================================
     CHECK BROWSER SUPPORT
     ============================================================ */

  function isSupported() {

    return !!(
      window.SpeechRecognition ||
      window.webkitSpeechRecognition
    );

  }


  /* ============================================================
     CHECK HTTPS / SECURE CONTEXT
     ============================================================ */

  function isSecure() {

    return window.isSecureContext;

  }


  /* ============================================================
     HANDLE MICROPHONE AUDIO START
     ============================================================ */

  function handleAudioStart() {

    console.info(
      '[DefenSys][codeword] 🔊 AUDIO INPUT STARTED'
    );

    window.__defensysCodeWordStatus.audioActive = true;

    /*
     * THIS IS IMPORTANT:
     *
     * As soon as Chrome tells us that audio input has started,
     * consider the microphone armed.
     *
     * This prevents the app from saying:
     * "Mic not armed"
     *
     * while Chrome is actually listening.
     */

    window.__defensysCodeWordStatus.armed = true;

    window.__defensysCodeWordStatus.lastError = null;

    /*
     * Show Moderate when the microphone becomes active.
     */

    updateDistress('moderate');

    refreshDefenSysUI();

  }


  /* ============================================================
     HANDLE SPEECH START
     ============================================================ */

  function handleSpeechStart() {

    console.info(
      '[DefenSys][codeword] 🗣️ SPEECH DETECTED'
    );

    window.__defensysCodeWordStatus.armed = true;

    window.__defensysCodeWordStatus.audioActive = true;

    window.__defensysCodeWordStatus.lastError = null;

    /*
     * Speech detected = at least Moderate monitoring.
     */

    updateDistress('moderate');

    refreshDefenSysUI();

  }


  /* ============================================================
     START CODE WORD LISTENER
     ============================================================ */

  function startCodeWordListener() {

    /* ----------------------------------------------------------
       SECURITY CHECK
       ---------------------------------------------------------- */

    if (!isSecure()) {

      window.__defensysCodeWordStatus.armed = false;

      window.__defensysCodeWordStatus.lastError =
        'insecure-context';

      console.warn(
        '[DefenSys][codeword] ❌ Microphone blocked because page ' +
        'is not running in a secure context.'
      );

      refreshDefenSysUI();

      return false;

    }


    /* ----------------------------------------------------------
       BROWSER SUPPORT CHECK
       ---------------------------------------------------------- */

    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;


    if (!SpeechRecognition) {

      window.__defensysCodeWordStatus.armed = false;

      window.__defensysCodeWordStatus.lastError =
        'unsupported-browser';

      console.warn(
        '[DefenSys][codeword] ❌ Speech recognition is not ' +
        'supported in this browser.'
      );

      refreshDefenSysUI();

      return false;

    }


    /* ----------------------------------------------------------
       ALREADY RUNNING
       ---------------------------------------------------------- */

    if (
      speechRecognitionEnabled &&
      speechRecognition
    ) {

      console.info(
        '[DefenSys][codeword] Listener already running.'
      );

      return true;

    }


    /* ----------------------------------------------------------
       CREATE SPEECH RECOGNITION
       ---------------------------------------------------------- */

    try {

      speechRecognition =
        new SpeechRecognition();


      /* --------------------------------------------------------
         RECOGNITION SETTINGS
         -------------------------------------------------------- */

      speechRecognition.continuous = true;

      speechRecognition.interimResults = true;

      speechRecognition.maxAlternatives = 5;

      /*
       * English is used because your safety word is AEGIS.
       */

      speechRecognition.lang = 'en-US';


      /* --------------------------------------------------------
         MIC STARTED
         -------------------------------------------------------- */

      speechRecognition.onstart = function () {

        console.info(
          '[DefenSys][codeword] 🎤 MIC IS LIVE'
        );

        window.__defensysCodeWordStatus.armed = true;

        window.__defensysCodeWordStatus.lastError = null;

        /*
         * Recognition started → Moderate monitoring.
         */

        updateDistress('moderate');

        refreshDefenSysUI();

      };


      /* --------------------------------------------------------
         AUDIO START
         -------------------------------------------------------- */

      speechRecognition.onaudiostart =
        handleAudioStart;


      /* --------------------------------------------------------
         SOUND START
         -------------------------------------------------------- */

      speechRecognition.onsoundstart =
        function () {

          console.info(
            '[DefenSys][codeword] 🔊 SOUND DETECTED'
          );

          window.__defensysCodeWordStatus.armed =
            true;

          window.__defensysCodeWordStatus.audioActive =
            true;

          updateDistress('moderate');

          refreshDefenSysUI();

        };


      /* --------------------------------------------------------
         SPEECH START
         -------------------------------------------------------- */

      speechRecognition.onspeechstart =
        handleSpeechStart;


      /* --------------------------------------------------------
         SPEECH RESULT
         -------------------------------------------------------- */

      speechRecognition.onresult =
        function (event) {

          let transcript = '';


          for (
            let i = event.resultIndex;
            i < event.results.length;
            i++
          ) {

            if (
              event.results[i] &&
              event.results[i][0]
            ) {

              transcript +=
                ' ' +
                event.results[i][0].transcript;

            }

          }


          const cleaned =
            normalizeSpeech(transcript);


          if (!cleaned) {
            return;
          }


          /* ----------------------------------------------------
             SAVE LAST HEARD TEXT
             ---------------------------------------------------- */

          window.__defensysCodeWordStatus.lastHeard =
            cleaned;

          window.__defensysCodeWordStatus.lastHeardAt =
            Date.now();

          window.__defensysCodeWordStatus.armed =
            true;

          window.__defensysCodeWordStatus.audioActive =
            true;


          console.info(
            '[DefenSys][codeword] 📝 SPEECH RESULT:',
            cleaned
          );


          /*
           * Speech is being detected.
           */

          updateDistress('moderate');

          refreshDefenSysUI();


          /* ----------------------------------------------------
             CHECK FOR CODE WORD
             ---------------------------------------------------- */

          const isMatch =
            CODE_WORDS.some(function (word) {

              return cleaned.includes(word);

            });


          if (isMatch) {

            console.info(
              '[DefenSys][codeword] 🚨 CODE WORD MATCHED:',
              cleaned
            );


            /*
             * Immediately show Critical distress.
             */

            updateDistress('critical');


            /*
             * Stop current recognition session.
             * The emergency system will take over.
             */

            speechRecognitionEnabled = false;

            try {
              speechRecognition.stop();
            } catch (error) {}


            /*
             * Trigger DefenSys emergency.
             */

            setTimeout(function () {

              if (
                typeof window.simulate ===
                'function'
              ) {

                window.simulate(
                  'codeword'
                );

              } else {

                console.warn(
                  '[DefenSys][codeword] ' +
                  'simulate() is not available.'
                );

              }

            }, 100);

          }

        };


      /* --------------------------------------------------------
         NO MATCH / SPEECH ERROR
         -------------------------------------------------------- */

      speechRecognition.onerror =
        function (event) {

          const error =
            event &&
            event.error
              ? event.error
              : 'unknown';


          console.warn(
            '[DefenSys][codeword] ERROR:',
            error
          );


          window.__defensysCodeWordStatus.lastError =
            error;


          /*
           * IMPORTANT:
           *
           * "no-speech" does NOT mean the microphone is off.
           *
           * Chrome can report no-speech when the microphone is
           * active but nobody said anything.
           *
           * Therefore KEEP MIC ARMED for no-speech.
           */

          if (error === 'no-speech') {

            window.__defensysCodeWordStatus.armed =
              true;

            window.__defensysCodeWordStatus.audioActive =
              true;

            /*
             * Keep Moderate rather than dropping back
             * to "Mic not armed".
             */

            updateDistress('moderate');

            console.info(
              '[DefenSys][codeword] ' +
              'No speech detected — microphone remains armed.'
            );

          }


          /* ----------------------------------------------------
             PERMISSION DENIED
             ---------------------------------------------------- */

          else if (
            error === 'not-allowed' ||
            error === 'service-not-allowed'
          ) {

            window.__defensysCodeWordStatus.armed =
              false;

            window.__defensysCodeWordStatus.audioActive =
              false;

            speechRecognitionEnabled =
              false;

            console.warn(
              '[DefenSys][codeword] ❌ Microphone permission denied.'
            );

          }


          /* ----------------------------------------------------
             MICROPHONE NOT FOUND
             ---------------------------------------------------- */

          else if (
            error === 'audio-capture'
          ) {

            window.__defensysCodeWordStatus.armed =
              false;

            window.__defensysCodeWordStatus.audioActive =
              false;

            speechRecognitionEnabled =
              false;

            console.warn(
              '[DefenSys][codeword] ❌ No microphone found.'
            );

          }


          /* ----------------------------------------------------
             OTHER ERRORS
             ---------------------------------------------------- */

          else {

            /*
             * Keep it armed if the recognition engine is
             * expected to restart.
             */

            if (speechRecognitionEnabled) {

              window.__defensysCodeWordStatus.armed =
                true;

            }

          }


          refreshDefenSysUI();

        };


      /* --------------------------------------------------------
         RECOGNITION END
         -------------------------------------------------------- */

      speechRecognition.onend =
        function () {

          console.info(
            '[DefenSys][codeword] 🎤 MIC SESSION ENDED'
          );


          window.__defensysCodeWordStatus.audioActive =
            false;


          /*
           * If we are still supposed to be listening,
           * restart automatically.
           */

          if (
            speechRecognitionEnabled &&
            !restarting
          ) {

            restarting = true;


            window.__defensysCodeWordStatus.restarts++;


            /*
             * Keep status armed during the restart.
             */

            window.__defensysCodeWordStatus.armed =
              true;


            refreshDefenSysUI();


            setTimeout(
              function () {

                restarting = false;


                if (
                  !speechRecognitionEnabled
                ) {
                  return;
                }


                try {

                  speechRecognition.start();

                  console.info(
                    '[DefenSys][codeword] 🔄 ' +
                    'Restarting microphone...'
                  );

                } catch (error) {

                  console.warn(
                    '[DefenSys][codeword] ' +
                    'Restart failed:',
                    error
                  );

                }

              },
              RESTART_DELAY
            );

          }

          else {

            window.__defensysCodeWordStatus.armed =
              false;

            refreshDefenSysUI();

          }

        };


      /* --------------------------------------------------------
         ENABLE + START
         -------------------------------------------------------- */

      speechRecognitionEnabled = true;


      /*
       * Mark as armed immediately.
       * onstart / onaudiostart will confirm it.
       */

      window.__defensysCodeWordStatus.armed =
        true;

      window.__defensysCodeWordStatus.lastError =
        null;


      updateDistress('moderate');

      refreshDefenSysUI();


      try {

        speechRecognition.start();

        console.info(
          '[DefenSys][codeword] 🎤 ' +
          'Starting AEGIS voice listener...'
        );

        return true;

      } catch (error) {

        console.warn(
          '[DefenSys][codeword] Start error:',
          error
        );

        window.__defensysCodeWordStatus.armed =
          false;

        window.__defensysCodeWordStatus.lastError =
          error.message || 'start-error';

        speechRecognitionEnabled =
          false;

        refreshDefenSysUI();

        return false;

      }

    } catch (error) {

      console.error(
        '[DefenSys][codeword] ❌ Could not create speech recognition:',
        error
      );

      window.__defensysCodeWordStatus.armed =
        false;

      window.__defensysCodeWordStatus.lastError =
        error.message || 'initialization-error';

      speechRecognitionEnabled =
        false;

      refreshDefenSysUI();

      return false;

    }

  }


  /* ============================================================
     STOP CODE WORD LISTENER
     ============================================================ */

  function stopCodeWordListener() {

    console.info(
      '[DefenSys][codeword] Stopping microphone listener.'
    );


    speechRecognitionEnabled =
      false;

    restarting =
      false;


    window.__defensysCodeWordStatus.armed =
      false;

    window.__defensysCodeWordStatus.audioActive =
      false;


    if (speechRecognition) {

      try {
        speechRecognition.onend = null;
      } catch (error) {}


      try {
        speechRecognition.stop();
      } catch (error) {}


      speechRecognition = null;

    }


    refreshDefenSysUI();

  }


  /* ============================================================
     SHAKE / SECRET GESTURE
     ============================================================ */

  function handleDeviceMotion(event) {

    if (!event) {
      return;
    }


    const acceleration =
      event.accelerationIncludingGravity ||
      event.acceleration;


    if (!acceleration) {
      return;
    }


    const x =
      Number(acceleration.x || 0);

    const y =
      Number(acceleration.y || 0);

    const z =
      Number(acceleration.z || 0);


    const magnitude =
      Math.sqrt(
        x * x +
        y * y +
        z * z
      );


    const now =
      Date.now();


    /*
     * Shake sensitivity.
     */

    if (
      magnitude < 22 ||
      now - lastMotionHitAt < 180
    ) {

      return;

    }


    lastMotionHitAt =
      now;


    /*
     * Keep only recent shakes.
     */

    motionHits =
      motionHits.filter(
        function (hit) {

          return now - hit < 1800;

        }
      );


    motionHits.push(now);


    window.__defensysGestureStatus.lastShakeAt =
      now;

    window.__defensysGestureStatus.hits =
      motionHits.length;


    console.info(
      '[DefenSys][gesture] Shake detected:',
      motionHits.length
    );


    refreshDefenSysUI();


    /*
     * THREE SHAKES = SECRET GESTURE
     */

    if (
      motionHits.length >= 3
    ) {

      console.info(
        '[DefenSys][gesture] 🚨 TRIPLE SHAKE DETECTED'
      );


      motionHits = [];


      window.__defensysGestureStatus.hits =
        0;


      updateDistress('critical');


      if (
        typeof window.simulate ===
        'function'
      ) {

        window.simulate(
          'gesture'
        );

      } else {

        console.warn(
          '[DefenSys][gesture] ' +
          'simulate() is not available.'
        );

      }

    }

  }


  /* ============================================================
     START SHAKE LISTENER
     ============================================================ */

  async function startGestureListener() {

    if (
      motionListenerEnabled
    ) {

      return true;

    }


    /*
     * Browser doesn't support motion.
     */

    if (
      !('DeviceMotionEvent' in window)
    ) {

      window.__defensysGestureStatus.supported =
        false;

      window.__defensysGestureStatus.lastError =
        'unsupported';

      console.warn(
        '[DefenSys][gesture] ❌ DeviceMotionEvent unsupported.'
      );

      refreshDefenSysUI();

      return false;

    }


    /*
     * Some browsers require explicit permission.
     */

    if (
      typeof DeviceMotionEvent.requestPermission ===
      'function'
    ) {

      try {

        const permission =
          await DeviceMotionEvent.requestPermission();


        if (
          permission !== 'granted'
        ) {

          window.__defensysGestureStatus.armed =
            false;

          window.__defensysGestureStatus.lastError =
            'permission-denied';

          console.warn(
            '[DefenSys][gesture] ❌ Motion permission denied.'
          );

          refreshDefenSysUI();

          return false;

        }

      } catch (error) {

        window.__defensysGestureStatus.armed =
          false;

        window.__defensysGestureStatus.lastError =
          error.message ||
          'permission-error';

        console.warn(
          '[DefenSys][gesture] Permission error:',
          error
        );

        refreshDefenSysUI();

        return false;

      }

    }


    /*
     * Attach motion listener.
     */

    window.addEventListener(
      'devicemotion',
      handleDeviceMotion,
      {
        passive: true
      }
    );


    motionListenerEnabled =
      true;


    window.__defensysGestureStatus.armed =
      true;

    window.__defensysGestureStatus.lastError =
      null;


    console.info(
      '[DefenSys][gesture] ✋ Shake listener armed.'
    );


    refreshDefenSysUI();


    return true;

  }


  /* ============================================================
     STOP SHAKE LISTENER
     ============================================================ */

  function stopGestureListener() {

    if (
      motionListenerEnabled
    ) {

      window.removeEventListener(
        'devicemotion',
        handleDeviceMotion
      );

    }


    motionListenerEnabled =
      false;

    motionHits = [];


    window.__defensysGestureStatus.armed =
      false;

    window.__defensysGestureStatus.hits =
      0;


    refreshDefenSysUI();

  }


  /* ============================================================
     START ALL LIVE TRIGGERS
     ============================================================ */

  window.startDefenSysLiveTriggers =
    async function () {

      console.info(
        '[DefenSys] 🛡️ Starting live safety triggers...'
      );


      /*
       * Start microphone.
       */

      startCodeWordListener();


      /*
       * Start shake detection.
       */

      await startGestureListener();


      refreshDefenSysUI();

    };


  /* ============================================================
     STOP ALL LIVE TRIGGERS
     ============================================================ */

  window.stopDefenSysLiveTriggers =
    function () {

      console.info(
        '[DefenSys] Stopping all live triggers.'
      );


      stopCodeWordListener();

      stopGestureListener();

    };


  /* ============================================================
     PUBLIC VOICE API
     ============================================================ */

  window.startDefenSysCodeWordListener =
    startCodeWordListener;


  window.stopDefenSysCodeWordListener =
    stopCodeWordListener;


  window.isDefenSysCodeWordSupported =
    isSupported;


  /* ============================================================
     PUBLIC GESTURE API
     ============================================================ */

  window.startDefenSysGestureListener =
    startGestureListener;


  window.stopDefenSysGestureListener =
    stopGestureListener;


  /* ============================================================
     START LIVE TRIGGERS AFTER FIRST USER INTERACTION
     ============================================================ */

  document.addEventListener(
    'click',
    function () {

      console.info(
        '[DefenSys] 👆 First interaction detected.'
      );


      /*
       * Browsers allow microphone permission more reliably
       * when recognition starts because of a user gesture.
       */

      window.startDefenSysLiveTriggers();

    },
    {
      once: true
    }
  );


  /* ============================================================
     INITIAL LOG
     ============================================================ */

  console.info(
    '[DefenSys] java.js loaded successfully.'
  );


  if (
    isSupported()
  ) {

    console.info(
      '[DefenSys] 🎙️ SpeechRecognition supported.'
    );

  } else {

    console.warn(
      '[DefenSys] ⚠️ SpeechRecognition NOT supported.'
    );

  }


  if (
    isSecure()
  ) {

    console.info(
      '[DefenSys] 🔒 Secure context confirmed.'
    );

  } else {

    console.warn(
      '[DefenSys] ⚠️ NOT a secure context.'
    );

  }

})();
