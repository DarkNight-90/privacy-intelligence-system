/**
 * fingerprint-guard.js
 * Personal Data Privacy Manager
 *
 * Detects browser fingerprinting attempts by hooking sensitive browser APIs.
 * Runs at document_start.
 */

(() => {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Config
  // ─────────────────────────────────────────────────────────────
  const CONFIG = {
    throttleMs: 2000,
    burstWindowMs: 5000,
    suspiciousThreshold: 50,
    aggressiveThreshold: 80
  };

  // ─────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────
  const state = {
    lastSent: 0,
    score: 0,
    calls: [],
    reportedMethods: new Map()
  };

  // ─────────────────────────────────────────────────────────────
  // Utils
  // ─────────────────────────────────────────────────────────────
  function now() {
    return Date.now();
  }

  function cleanupOldCalls() {
    const cutoff = now() - CONFIG.burstWindowMs;
    state.calls = state.calls.filter(c => c.time > cutoff);
  }

  function getSeverity(score) {
    if (score >= CONFIG.aggressiveThreshold) return 'critical';
    if (score >= CONFIG.suspiciousThreshold) return 'high';
    if (score >= 25) return 'medium';
    return 'low';
  }

  function reportFingerprint(method, category, weight = 10) {
    const t = now();

    state.score += weight;
    state.calls.push({
      method,
      category,
      time: t
    });

    cleanupOldCalls();

    const count = state.calls.length;
    const severity = getSeverity(state.score);

    // throttle
    if (t - state.lastSent < CONFIG.throttleMs) return;

    state.lastSent = t;

    try {
      chrome.runtime.sendMessage({
        type: 'CONTENT_FINGERPRINT_ALERT',
        method,
        category,
        score: state.score,
        severity,
        burstCount: count,
        domain: location.hostname,
        timestamp: t
      });
    } catch (_) {}
  }

  function safePatch(obj, prop, wrapper) {
    if (!obj || !obj[prop]) return;

    const original = obj[prop];

    try {
      Object.defineProperty(obj, prop, {
        configurable: true,
        enumerable: false,
        writable: true,
        value: wrapper(original)
      });
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────
  // Canvas fingerprinting
  // ─────────────────────────────────────────────────────────────
  function hookCanvas() {
    safePatch(HTMLCanvasElement.prototype, 'toDataURL', (original) =>
      function (...args) {
        reportFingerprint('canvas.toDataURL', 'canvas', 30);
        return original.apply(this, args);
      }
    );

    safePatch(CanvasRenderingContext2D.prototype, 'getImageData', (original) =>
      function (...args) {
        reportFingerprint('canvas.getImageData', 'canvas', 25);
        return original.apply(this, args);
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // WebGL fingerprinting
  // ─────────────────────────────────────────────────────────────
  function hookWebGL() {
    const hook = (proto) => {
      if (!proto) return;

      safePatch(proto, 'getParameter', (original) =>
        function (...args) {
          reportFingerprint('webgl.getParameter', 'webgl', 20);
          return original.apply(this, args);
        }
      );
    };

    hook(window.WebGLRenderingContext?.prototype);
    hook(window.WebGL2RenderingContext?.prototype);
  }

  // ─────────────────────────────────────────────────────────────
  // Audio fingerprinting
  // ─────────────────────────────────────────────────────────────
  function hookAudio() {
    const proto = window.OfflineAudioContext?.prototype ||
                  window.webkitOfflineAudioContext?.prototype;

    if (!proto) return;

    safePatch(proto, 'startRendering', (original) =>
      function (...args) {
        reportFingerprint('audio.startRendering', 'audio', 25);
        return original.apply(this, args);
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Font enumeration
  // ─────────────────────────────────────────────────────────────
  function hookFonts() {
    if (!document.fonts) return;

    safePatch(document.fonts, 'check', (original) =>
      function (...args) {
        reportFingerprint('fonts.check', 'fonts', 15);
        return original.apply(this, args);
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Navigator fingerprinting
  // ─────────────────────────────────────────────────────────────
  function hookNavigator() {
    const props = [
      'plugins',
      'mimeTypes',
      'hardwareConcurrency',
      'deviceMemory',
      'languages',
      'platform',
      'userAgent'
    ];

    props.forEach((prop) => {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(
          Navigator.prototype,
          prop
        );

        if (!descriptor || !descriptor.get) return;

        Object.defineProperty(Navigator.prototype, prop, {
          configurable: true,
          enumerable: descriptor.enumerable,
          get() {
            reportFingerprint(`navigator.${prop}`, 'navigator', 10);
            return descriptor.get.call(this);
          }
        });
      } catch (_) {}
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Screen fingerprinting
  // ─────────────────────────────────────────────────────────────
  function hookScreen() {
    const props = [
      'width',
      'height',
      'availWidth',
      'availHeight',
      'colorDepth',
      'pixelDepth'
    ];

    props.forEach((prop) => {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(
          Screen.prototype,
          prop
        );

        if (!descriptor || !descriptor.get) return;

        Object.defineProperty(Screen.prototype, prop, {
          configurable: true,
          enumerable: descriptor.enumerable,
          get() {
            reportFingerprint(`screen.${prop}`, 'screen', 5);
            return descriptor.get.call(this);
          }
        });
      } catch (_) {}
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Battery fingerprinting
  // ─────────────────────────────────────────────────────────────
  function hookBattery() {
    if (!navigator.getBattery) return;

    safePatch(navigator, 'getBattery', (original) =>
      function (...args) {
        reportFingerprint('navigator.getBattery', 'battery', 10);
        return original.apply(this, args);
      }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────
  function init() {
    hookCanvas();
    hookWebGL();
    hookAudio();
    hookFonts();
    hookNavigator();
    hookScreen();
    hookBattery();

    console.log('[PrivacyManager] Fingerprint guard active.');
  }

  init();
})();