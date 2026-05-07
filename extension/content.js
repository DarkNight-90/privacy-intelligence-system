/**
 * content.js
 * Personal Data Privacy Manager
 *
 * Responsibilities:
 * - Detect tracking pixels
 * - Detect hidden tracking iframes
 * - Detect beacon API usage
 * - Observe dynamic DOM injections
 * - Report suspicious privacy-invasive behaviors
 *
 * NOTE:
 * Fingerprinting hooks are handled ONLY by fingerprint-guard.js
 */

(() => {
  'use strict';

  // prevent double injection
  if (window.__privacyManagerContentLoaded) return;
  window.__privacyManagerContentLoaded = true;

  const REPORT_THROTTLE_MS = 1500;
  let lastReport = 0;

  const reported = new Set();

  function canReport(key) {
    const now = Date.now();

    if (reported.has(key) && now - lastReport < REPORT_THROTTLE_MS) {
      return false;
    }

    reported.add(key);
    lastReport = now;
    return true;
  }

  function sendAlert(type, detail, extra = {}) {
    try {
      chrome.runtime.sendMessage({
        type,
        detail,
        url: location.href,
        domain: location.hostname,
        timestamp: Date.now(),
        ...extra
      });
    } catch (_) {}
  }

  // ─────────────────────────────────────────────
  // Tracking Pixels
  // ─────────────────────────────────────────────
  function isHidden(el) {
    const style = window.getComputedStyle(el);

    return (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0' ||
      style.position === 'absolute' &&
      parseInt(style.left || 0, 10) < -500
    );
  }

  function inspectImage(img) {
    if (!img || !img.src) return;

    const tiny =
      img.naturalWidth <= 1 ||
      img.naturalHeight <= 1 ||
      img.width <= 1 ||
      img.height <= 1;

    const hidden = isHidden(img);

    if (tiny || hidden) {
      const key = `pixel:${img.src}`;

      if (canReport(key)) {
        sendAlert(
          'CONTENT_PIXEL_ALERT',
          'Suspicious tracking pixel detected',
          {
            source: img.src,
            tiny,
            hidden
          }
        );
      }
    }
  }

  function scanImages(root = document) {
    const imgs = root.querySelectorAll?.('img') || [];

    imgs.forEach(inspectImage);
  }

  // ─────────────────────────────────────────────
  // Hidden Iframes
  // ─────────────────────────────────────────────
  function inspectIframe(frame) {
    if (!frame || !frame.src) return;

    const tiny =
      frame.width <= 1 ||
      frame.height <= 1;

    const hidden = isHidden(frame);

    const suspicious =
      hidden ||
      tiny ||
      frame.src.includes('track') ||
      frame.src.includes('pixel') ||
      frame.src.includes('analytics');

    if (suspicious) {
      const key = `iframe:${frame.src}`;

      if (canReport(key)) {
        sendAlert(
          'CONTENT_TRACKER_ALERT',
          'Suspicious hidden iframe detected',
          {
            source: frame.src,
            tiny,
            hidden
          }
        );
      }
    }
  }

  function scanIframes(root = document) {
    const iframes = root.querySelectorAll?.('iframe') || [];

    iframes.forEach(inspectIframe);
  }

  // ─────────────────────────────────────────────
  // Beacon API
  // ─────────────────────────────────────────────
  function hookBeacon() {
    if (!navigator.sendBeacon) return;

    const original = navigator.sendBeacon;

    navigator.sendBeacon = function (...args) {
      const target = args[0];

      if (canReport(`beacon:${target}`)) {
        sendAlert(
          'CONTENT_TRACKER_ALERT',
          'navigator.sendBeacon used',
          {
            source: target
          }
        );
      }

      return original.apply(this, args);
    };
  }

  // ─────────────────────────────────────────────
  // Fetch/XHR lightweight detection
  // ─────────────────────────────────────────────
  function hookNetwork() {
    if (window.fetch) {
      const originalFetch = window.fetch;

      window.fetch = function (...args) {
        const url = String(args[0]);

        if (
          url.includes('analytics') ||
          url.includes('collect') ||
          url.includes('track')
        ) {
          if (canReport(`fetch:${url}`)) {
            sendAlert(
              'CONTENT_TRACKER_ALERT',
              'Suspicious tracking fetch request',
              { source: url }
            );
          }
        }

        return originalFetch.apply(this, args);
      };
    }

    if (window.XMLHttpRequest) {
      const originalOpen = XMLHttpRequest.prototype.open;

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        const target = String(url);

        if (
          target.includes('analytics') ||
          target.includes('collect') ||
          target.includes('track')
        ) {
          if (canReport(`xhr:${target}`)) {
            sendAlert(
              'CONTENT_TRACKER_ALERT',
              'Suspicious XHR tracking request',
              { source: target }
            );
          }
        }

        return originalOpen.call(this, method, url, ...rest);
      };
    }
  }

  // ─────────────────────────────────────────────
  // DOM observer
  // ─────────────────────────────────────────────
  let observerTimer = null;

  function observeDOM() {
    const observer = new MutationObserver(() => {
      clearTimeout(observerTimer);

      observerTimer = setTimeout(() => {
        scanImages();
        scanIframes();
      }, 500);
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // ─────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────
  function collectMetadata() {
    sendAlert('CONTENT_TRACKER_ALERT', 'Page loaded', {
      title: document.title,
      referrer: document.referrer
    });
  }

  // ─────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────
  function init() {
    hookBeacon();
    hookNetwork();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        scanImages();
        scanIframes();
        collectMetadata();
      });
    } else {
      scanImages();
      scanIframes();
      collectMetadata();
    }

    observeDOM();

    console.log('[PrivacyManager] content.js active');
  }

  init();
})();