/**
 * popup.js
 * Personal Data Privacy Manager
 *
 * Responsibilities:
 *  - Load and display live stats (trackers, cookies, privacy score) on open
 *  - Auto-refresh stats when chrome.storage changes
 *  - "Check Page" → query background for current tab tracker data and render inline
 *  - "Clean Cookies" → ask background to remove non-essential cookies for this tab
 *  - "Dashboard" → open vanilla dashboard tab
 *  - "React Dashboard" → open React dashboard tab
 */

document.addEventListener('DOMContentLoaded', async () => {
  // ─── Element references ─────────────────────────────────────────────────
  const openDashboardBtn      = document.getElementById('open-dashboard');
  const openDashboardReactBtn = document.getElementById('open-dashboard-react');
  const runCheckBtn           = document.getElementById('run-check');
  const cleanCookiesBtn       = document.getElementById('clean-cookies');

  const trackersEl  = document.getElementById('popup-trackers');
  const cookiesEl   = document.getElementById('popup-cookies');
  const scoreEl     = document.getElementById('popup-score');
  const statusEl    = document.getElementById('popup-status');

  // ─── Helpers ────────────────────────────────────────────────────────────

  function setStatus(msg, type = 'info') {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = `popup-status popup-status--${type}`;
    statusEl.style.display = msg ? 'block' : 'none';

    if (type !== 'error') {
      setTimeout(() => {
        statusEl.style.display = 'none';
      }, 3000);
    }
  }

  function setButtonLoading(btn, loading, originalText) {
    btn.disabled = loading;
    btn.textContent = loading ? 'Working…' : originalText;
  }

  /** Send a message to background and return a Promise of the response. */
  function sendMessage(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  // ─── Stats Loading ──────────────────────────────────────────────────────

  /**
   * Calculate total trackers, cookies, and privacy score from storage.
   * Returns { trackers, cookies, privacyScore }.
   */
  async function computeStats() {
    let totalTrackers = 0;
    let fingerprintCount = 0;

    // Read all inventory keys for tracker totals
    await new Promise((resolve) => {
      chrome.storage.local.get(null, (raw) => {
        if (chrome.runtime.lastError) { resolve(); return; }
        Object.entries(raw || {}).forEach(([key, record]) => {
          if (!key.startsWith('inventory_') || !record?.trackers) return;
          Object.entries(record.trackers).forEach(([cat, list]) => {
            const count = Array.isArray(list) ? list.length : 0;
            totalTrackers += count;
            if (cat === 'fingerprinting') fingerprintCount += count;
          });
        });
        resolve();
      });
    });

    // Read cookies for current tab
    let cookieCount = 0;
    await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs?.[0]?.url) { resolve(); return; }
        try {
          const hostname = new URL(tabs[0].url).hostname;
          chrome.cookies.getAll({ domain: hostname }, (cookies) => {
            cookieCount = cookies?.length || 0;
            resolve();
          });
        } catch { resolve(); }
      });
    });

    const trackerPenalty  = Math.min(60, totalTrackers * 2);
    const fpPenalty       = Math.min(25, fingerprintCount * 5);
    const privacyScore    = Math.max(0, 100 - trackerPenalty - fpPenalty);

    return { trackers: totalTrackers, cookies: cookieCount, privacyScore };
  }

  async function refreshStats() {
    try {
      const { trackers, cookies, privacyScore } = await computeStats();

      if (trackersEl) trackersEl.textContent = trackers;
      if (cookiesEl)  cookiesEl.textContent  = cookies;
      if (scoreEl)    scoreEl.textContent     = Math.round(privacyScore);

      // Colour the score badge by risk level
      if (scoreEl) {
        scoreEl.style.color =
          privacyScore >= 80 ? '#34c759' :
          privacyScore >= 50 ? '#ff9500' :
          '#ff3b30';
      }
    } catch (e) {
      console.warn('[Popup] refreshStats error:', e);
    }
  }

  // ─── Button: Open Dashboards ─────────────────────────────────────────────

  openDashboardBtn.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('extension/dashboard/dashboard.html')
    });
  });

  openDashboardReactBtn.addEventListener('click', () => {
    chrome.tabs.create({
      url: chrome.runtime.getURL('extension/dashboard/dashboard-react.html')
    });
  });

  // ─── Button: Check Page ──────────────────────────────────────────────────

  runCheckBtn.addEventListener('click', async () => {
    setButtonLoading(runCheckBtn, true, '🔍 Check Page');
    setStatus('');

    const response = await sendMessage({ type: 'GET_TAB_DATA' });

    if (response?.data) {
      const { blockedCount, trackers, domain } = response.data;
      const count = trackers?.length || blockedCount || 0;
      const domainStr = domain ? ` on ${domain}` : '';

      if (count > 0) {
        setStatus(`🚨 ${count} tracker${count !== 1 ? 's' : ''} detected${domainStr}.`, 'warn');
      } else {
        setStatus(`✅ No trackers detected${domainStr}.`, 'ok');
      }
    } else {
      setStatus('ℹ️ Could not read page data. Try reloading the tab.', 'info');
    }

    setButtonLoading(runCheckBtn, false, '🔍 Check Page');
  });

  // ─── Button: Clean Cookies ──────────────────────────────────────────────

  cleanCookiesBtn.addEventListener('click', async () => {
    setButtonLoading(cleanCookiesBtn, true, '🍪 Clean Cookies');
    setStatus('');

    const response = await sendMessage({ type: 'CLEAN_NON_ESSENTIAL_COOKIES' });

    if (response?.success) {
      const { deleted, total } = response;
      setStatus(
        deleted > 0
          ? `🧹 Removed ${deleted} of ${total} non-essential cookie${deleted !== 1 ? 's' : ''}.`
          : '✅ No non-essential cookies to remove.',
        'ok'
      );
      // Refresh cookie count
      await refreshStats();
    } else {
      setStatus(
        response?.error || 'Could not clean cookies for this page.',
        'error'
      );
    }

    setButtonLoading(cleanCookiesBtn, false, '🍪 Clean Cookies');
  });

  // ─── Real-time storage listener ──────────────────────────────────────────

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    const hasInventoryChange = Object.keys(changes).some(
      k => k.startsWith('inventory_')
    );
    if (hasInventoryChange) {
      refreshStats();
    }
  });

  // ─── Initial load ────────────────────────────────────────────────────────

  await refreshStats();
});
