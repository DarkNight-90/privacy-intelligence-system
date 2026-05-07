/**
 * background.js - Service Worker
 * Personal Data Privacy Manager
 *
 * Responsibilities:
 * - Monitor all web requests for trackers
 * - Maintain blocked request counts per tab
 * - Update badge with live counts
 * - Handle messages from popup and content scripts
 * - Manage whitelist storage
 * - Persist data inventory via Persistence layer (batched writes)
 */

import Persistence from './storage/persistence.js';

// ─── State ───────────────────────────────────────────────────────────────────

/** Map of tabId → { blockedCount, trackers: [], domain } */
const tabData = new Map();

/** Set of whitelisted domains (user-managed) */
let whitelist = new Set();

/** Full tracker rules loaded from JSON */
let trackerRules = null;

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Load tracker rules from the rules JSON file and whitelist from storage.
 */
async function initialize() {
  try {
    // Load tracker rules
    const rulesUrl = chrome.runtime.getURL('extension/rules/tracker-rules.json');
    const response = await fetch(rulesUrl);
    trackerRules = await response.json();
    console.log('[PrivacyManager] Tracker rules loaded:', Object.keys(trackerRules.categories).length, 'categories');

    // Load saved whitelist
    const data = await chrome.storage.local.get(['whitelist']);
    if (data.whitelist) {
      whitelist = new Set(data.whitelist);
    }

    // Initialize persistence layer (loads existing inventory into memory)
    await Persistence.init();

    console.log('[PrivacyManager] Background service worker initialized.');
  } catch (err) {
    console.error('[PrivacyManager] Initialization error:', err);
  }
}

initialize();

/**
 * On page load start: reset per-tab badge counts.
 * Persistence layer captures tracker events in real-time.
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    // Page is loading — reset tab data for new page context
    const domain = extractDomain(changeInfo.url || tab.url || '');
    tabData.set(tabId, {
      blockedCount: 0,
      trackers: [],
      domain
    });
    updateBadge(tabId, 0);
  }
});

// ─── Tracker Detection Logic ─────────────────────────────────────────────────

/**
 * MV3 Tracker Detection Architecture:
 *
 * In Manifest V3, chrome.webRequest is NOT available to extensions.
 * Instead, we use a hybrid approach:
 *
 * 1. Declarative Net Request (DNR):
 *    - Defines rules in extension/rules/dnr_rules.json
 *    - Browser blocks matching requests with zero extension overhead
 *    - No feedback to extension about what was blocked
 *
 * 2. Content Script Detection:
 *    - extension/content.js monitors actual network requests via fetch/XHR
 *    - extension/scripts/fingerprint-guard.js detects API-based fingerprinting
 *    - Both report detected trackers to background via chrome.runtime.sendMessage()
 *    - Message handler routes to saveTrackerToInventory() for persistence
 *
 * 3. Optional Backend Verification:
 *    - Dashboard can submit URLs to Flask backend for policy analysis
 *    - Backend returns risk classification and red flags
 *
 * Result: Tracker inventory is built from content script reports + fingerprinting
 * detections, not from direct request interception (which MV3 prohibits).
 */

/**
 * Given a URL, determine if it matches any known tracker pattern.
 * Returns { isTracker: bool, category: string, reason: string }
 *
 * Used by:
 * - Message handlers (GET_ALL_INVENTORY, etc.)
 * - Optional future DNR rule generators
 * - For reference/validation purposes
 */
function detectTracker(url) {
  if (!trackerRules) return { isTracker: false };

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();
    const pathname = urlObj.pathname.toLowerCase();
    const fullUrl = url.toLowerCase();

    // Check whitelist first
    for (const domain of whitelist) {
      if (hostname.includes(domain)) {
        return { isTracker: false, whitelisted: true };
      }
    }

    // Check built-in whitelist
    for (const safeDomain of trackerRules.whitelist.domains) {
      if (hostname.includes(safeDomain)) {
        return { isTracker: false };
      }
    }

    // Check each category
    for (const [category, rules] of Object.entries(trackerRules.categories)) {
      // Check domains
      if (rules.domains) {
        for (const domain of rules.domains) {
          if (hostname.includes(domain) || fullUrl.includes(domain)) {
            return { isTracker: true, category, reason: `Matched domain: ${domain}` };
          }
        }
      }

      // Check script patterns
      if (rules.scripts) {
        for (const script of rules.scripts) {
          if (pathname.includes(script)) {
            return { isTracker: true, category, reason: `Matched script: ${script}` };
          }
        }
      }
    }

    // Check tracking pixels
    for (const pattern of trackerRules.tracking_pixels.patterns) {
      if (pathname.includes(pattern) || fullUrl.includes(pattern)) {
        return { isTracker: true, category: 'tracking_pixel', reason: `Matched pixel pattern: ${pattern}` };
      }
    }

  } catch (e) {
    // Invalid URL — skip
  }

  return { isTracker: false };
}

// ─── Web Request Monitoring ───────────────────────────────────────────────────

/**
 * Track domain changes when navigating (Manifest V3 compatible)
 */
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;

  const domain = extractDomain(details.url);
  if (tabData.has(details.tabId)) {
    tabData.get(details.tabId).domain = domain;
  } else {
    tabData.set(details.tabId, { blockedCount: 0, trackers: [], domain });
  }
  console.debug(`[PrivacyManager] Domain committed: ${domain} on tab ${details.tabId}`);
});

/**
 * Reset counts when navigating to a new page
 */
// Consolidated into single onUpdated listener above

/**
 * Clean up when tab is closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  tabData.delete(tabId);
});

// ─── Badge Management ─────────────────────────────────────────────────────────

function updateBadge(tabId, count) {
  const text = count > 0 ? String(count) : '';
  const color = count > 10 ? '#FF3B30' : count > 0 ? '#FF9500' : '#34C759';

  chrome.action.setBadgeText({ text, tabId });
  chrome.action.setBadgeBackgroundColor({ color, tabId });
}

// ─── Messaging ────────────────────────────────────────────────────────────────

/**
 * Handle messages from popup.js and content.js
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    case 'GET_TAB_DATA': {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          const data = tabData.get(tabs[0].id) || { blockedCount: 0, trackers: [], domain: '' };
          sendResponse({ success: true, data, tabId: tabs[0].id });
        } else {
          sendResponse({ success: false, data: null });
        }
      });
      return true; // async
    }

    case 'GET_ALL_STATS': {
      let totalBlocked = 0;
      tabData.forEach(d => { totalBlocked += d.blockedCount; });
      sendResponse({ totalBlocked, tabCount: tabData.size });
      return true;
    }

    case 'ADD_TO_WHITELIST': {
      whitelist.add(message.domain);
      chrome.storage.local.set({ whitelist: [...whitelist] });
      sendResponse({ success: true });
      return true;
    }

    case 'REMOVE_FROM_WHITELIST': {
      whitelist.delete(message.domain);
      chrome.storage.local.set({ whitelist: [...whitelist] });
      sendResponse({ success: true });
      return true;
    }

    case 'GET_WHITELIST': {
      sendResponse({ whitelist: [...whitelist] });
      return true;
    }

    case 'CONTENT_FINGERPRINT_ALERT': {
      // Fingerprinting detected by content script
      const tabId = sender.tab?.id;
      if (tabId && tabId >= 0) {
        if (!tabData.has(tabId)) tabData.set(tabId, { blockedCount: 0, trackers: [], domain: '' });
        const data = tabData.get(tabId);
        const domain = extractDomain(sender.tab?.url || '');
        data.blockedCount++;
        updateBadge(tabId, data.blockedCount);
        data.trackers.push({
          domain: domain,
          category: 'fingerprinting',
          reason: message.method,
          timestamp: Date.now()
        });
        saveTrackerToInventory(domain, 'fingerprinting', message.method);
      }
      return true;
    }

    case 'GET_SETTINGS': {
      chrome.storage.local.get(['settings'], (result) => {
        sendResponse({ settings: result.settings || getDefaultSettings() });
      });
      return true;
    }

    case 'SAVE_SETTINGS': {
      chrome.storage.local.set({ settings: message.settings }, () => {
        sendResponse({ success: true });
      });
      return true;
    }

    case 'GET_ALL_INVENTORY': {
      chrome.storage.local.get(null, (allData) => {
        const inventory = {};
        let totalTrackers = 0;
        const categoryCount = {};
        
        for (const [key, value] of Object.entries(allData)) {
          if (key.startsWith('inventory_')) {
            // Guard: skip corrupted records missing trackers or domain
            if (!value || typeof value !== 'object' || !value.trackers) continue;
            inventory[value.domain] = value.trackers;
            for (const [cat, trackers] of Object.entries(value.trackers)) {
              if (!Array.isArray(trackers)) continue;
              categoryCount[cat] = (categoryCount[cat] || 0) + trackers.length;
              totalTrackers += trackers.length;
            }
          }
        }
        
        sendResponse({ 
          success: true, 
          inventory, 
          totalTrackers,
          categoryCount,
          allData
        });
      });
      return true;
    }

    case 'CLEAN_NON_ESSENTIAL_COOKIES': {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        const tabUrl = tabs?.[0]?.url || '';

        if (!tabUrl) {
          sendResponse({ success: false, error: 'No active tab found.' });
          return;
        }

        // Only clean cookies on normal web pages; chrome:// and file:// have no cookies
        if (!tabUrl.startsWith('http://') && !tabUrl.startsWith('https://')) {
          sendResponse({ success: false, error: 'Cookie cleaning is only available on http/https pages.' });
          return;
        }

        const ESSENTIAL_PATTERNS = [
          'session', 'sess', 'csrf', 'xsrf', '_token', 'auth', 'login',
          'user_id', 'uid', 'sid', 'phpsessid', 'jsessionid', 'cart', 'security'
        ];

        function isEssential(name) {
          const lower = name.toLowerCase();
          return ESSENTIAL_PATTERNS.some(p => lower.includes(p));
        }

        try {
          const hostname = new URL(tabUrl).hostname;
          if (!hostname) {
            sendResponse({ success: false, error: 'Could not determine page hostname.' });
            return;
          }

          chrome.cookies.getAll({ domain: hostname }, async (cookies) => {
            if (chrome.runtime.lastError) {
              sendResponse({ success: false, error: chrome.runtime.lastError.message });
              return;
            }

            const nonEssential = (cookies || []).filter(c => !isEssential(c.name));
            let deleted = 0;

            await Promise.all(nonEssential.map(c => {
              return new Promise(res => {
                const cookieUrl = `https://${c.domain.replace(/^\./, '')}${c.path}`;
                chrome.cookies.remove({ url: cookieUrl, name: c.name }, (result) => {
                  if (result) deleted++;
                  res();
                });
              });
            }));

            sendResponse({ success: true, deleted, total: nonEssential.length });
          });
        } catch (e) {
          sendResponse({ success: false, error: `Unexpected error: ${e.message}` });
        }
      });
      return true;
    }

    case 'CLEAR_INVENTORY': {
      Persistence.clear().then(() => {
        sendResponse({ success: true });
      }).catch(err => {
        sendResponse({ success: false, error: err.message });
      });
      return true;
    }

    case 'GET_PERSISTENCE_METRICS': {
      // Returns live storage metrics for dashboard diagnostics
      sendResponse({ success: true, metrics: Persistence.getMetrics() });
      return true;
    }

    case 'GET_EXPORT_SNAPSHOT': {
      // Returns full JSON snapshot (inventory + globalStats + metrics)
      // The dashboard can offer this as a download without going through chromeStorage
      try {
        const json = Persistence.exportSnapshot();
        sendResponse({ success: true, json });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }

    case 'GET_DOMAIN_INVENTORY': {
      const key = `inventory_${message.domain}`;
      chrome.storage.local.get([key], (result) => {
        sendResponse({ success: true, record: result[key] || null });
      });
      return true;
    }

    default:
      sendResponse({ error: 'Unknown message type' });
  }
});

// ─── Crash-safe suspend flush ─────────────────────────────────────────────────

/**
 * MV3 service workers can be terminated at any time.
 * onSuspend gives us a last-chance opportunity to flush the write queue.
 * flushNow() bypasses the 200ms debounce and writes synchronously (as much
 * as the JS event loop allows before the worker is killed).
 *
 * Note: Chrome gives ~1-2 seconds before hard-killing the worker.
 * The Persistence layer responds in <50ms for typical queue sizes.
 */
chrome.runtime.onSuspend.addListener(() => {
  console.log('[PrivacyManager] onSuspend — forcing persistence flush...');
  Persistence.flushNow().then(() => {
    console.log('[PrivacyManager] onSuspend flush complete.');
  }).catch(err => {
    console.error('[PrivacyManager] onSuspend flush error:', err.message);
  });
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function sendToPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // Popup not open — ignore
  });
}

function shouldBlockRequests() {
  // Read from settings cache — default true
  return true;
}

function getDefaultSettings() {
  return {
    blockTrackers: true,
    blockAds: true,
    blockAnalytics: true,
    blockFingerprinting: true,
    autoCleanCookies: false,
    showBadge: true,
    showNotifications: true,
    backendUrl: 'http://localhost:5000'
  };
}

/**
 * Persist tracker encounter to data inventory.
 * Delegates to Persistence layer for in-memory merge + batched storage write.
 * REPLACES the old read-modify-write pattern (which caused N concurrent writes and N onChanged events).
 */
function saveTrackerToInventory(siteDomain, trackerDomain, category) {
  if (!siteDomain) return;
  // Persistence handles deduplication, merge, and debounced batch flush
  Persistence.updateDomain(siteDomain, trackerDomain, category);
}

console.log('[PrivacyManager] Background service worker started.');
