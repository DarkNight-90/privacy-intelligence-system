/**
 * data-inventory.js
 * Personal Data Privacy Manager
 *
 * Centralized data inventory module.
 * Reads from chrome.storage.local and produces normalized aggregates
 * consumed by the popup, vanilla dashboard, and React dashboard.
 *
 * Public API (exposed via DataInventory global):
 *  - getAll()           → raw { domain → record } map
 *  - getForDomain(d)    → single domain record
 *  - aggregate()        → full normalized stats object
 *  - exportAsJSON()     → JSON string of all data
 *  - clear()            → wipe all inventory_* keys
 *  - subscribe(cb)      → live-update listener; returns unsubscribe fn
 */

const DataInventory = (() => {
  'use strict';

  // ─── Internal helpers ────────────────────────────────────────────────────

  /**
   * Read all keys from chrome.storage.local.
   * @returns {Promise<Object>}
   */
  function _readStorage() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve({});
        return;
      }
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime?.lastError) {
          console.warn('[DataInventory] Storage read error:', chrome.runtime.lastError.message);
          resolve({});
        } else {
          resolve(result || {});
        }
      });
    });
  }

  /**
   * Remove keys from chrome.storage.local.
   * @param {string[]} keys
   */
  function _removeKeys(keys) {
    return new Promise((resolve) => {
      if (!keys.length || typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve();
        return;
      }
      chrome.storage.local.remove(keys, resolve);
    });
  }

  /**
   * Extract all inventory_* records from raw storage.
   * @param {Object} raw
   * @returns {{ domain: string, trackers: Object, lastSeen: number|null }[]}
   */
  function _extractInventoryRecords(raw) {
    return Object.entries(raw)
      .filter(([key]) => key.startsWith('inventory_'))
      .map(([, record]) => record)
      .filter(Boolean);
  }

  // ─── Public: getAll ───────────────────────────────────────────────────────

  /**
   * Get all inventory records keyed by domain.
   * @returns {Promise<Object.<string, Object>>}
   */
  async function getAll() {
    const raw = await _readStorage();
    const result = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('inventory_') && value?.domain) {
        result[value.domain] = value;
      }
    }
    return result;
  }

  // ─── Public: getForDomain ─────────────────────────────────────────────────

  /**
   * Get inventory for a specific domain.
   * @param {string} domain
   * @returns {Promise<Object|null>}
   */
  async function getForDomain(domain) {
    const raw = await _readStorage();
    const key = `inventory_${domain}`;
    return raw[key] || null;
  }

  // ─── Public: aggregate ────────────────────────────────────────────────────

  /**
   * Aggregate all inventory records into a normalized dashboard dataset.
   *
   * Returns:
   * {
   *   totalTrackers: number,
   *   totalDomains: number,
   *   byCategory: { analytics: N, advertising: N, ... },
   *   byDomain: [{ domain, count, categories, lastSeen }],
   *   fingerprintEvents: number,
   *   privacyScore: number,        // 0–100 (higher = safer)
   *   timeline: [{ day, trackers }], // 7-day history
   *   mostRecentSite: string|null,
   *   lastActivity: number|null     // timestamp ms
   * }
   */
  async function aggregate() {
    const raw = await _readStorage();
    const records = _extractInventoryRecords(raw);

    let totalTrackers = 0;
    let fingerprintEvents = 0;

    const byCategory = {
      analytics: 0,
      advertising: 0,
      social: 0,
      fingerprinting: 0,
      tracking_pixel: 0
    };

    const byDomain = [];
    const allTimestamps = [];

    records.forEach(record => {
      if (!record.trackers) return;

      let domainCount = 0;
      const domainCategories = {};

      Object.entries(record.trackers).forEach(([category, trackerList]) => {
        const count = Array.isArray(trackerList) ? trackerList.length : 0;
        const normalizedCat = _normalizeCategory(category);

        totalTrackers += count;
        domainCount += count;

        byCategory[normalizedCat] = (byCategory[normalizedCat] || 0) + count;
        domainCategories[normalizedCat] = count;

        if (normalizedCat === 'fingerprinting') {
          fingerprintEvents += count;
        }
      });

      if (record.lastSeen) {
        allTimestamps.push(record.lastSeen);
      }

      byDomain.push({
        domain: record.domain,
        count: domainCount,
        categories: domainCategories,
        lastSeen: record.lastSeen || null
      });
    });

    // Sort domains by tracker count desc
    byDomain.sort((a, b) => b.count - a.count);

    // Privacy score: 100 minus penalties (capped at 0)
    const trackerPenalty = Math.min(60, totalTrackers * 2);
    const fpPenalty = Math.min(25, fingerprintEvents * 5);
    const privacyScore = Math.max(0, 100 - trackerPenalty - fpPenalty);

    // Timeline: real 7-day activity from timestamps
    const timeline = _buildTimeline(allTimestamps, records.length);

    // Most recent activity
    const lastActivity = allTimestamps.length > 0
      ? Math.max(...allTimestamps)
      : null;
    const mostRecentRecord = byDomain.find(d => d.lastSeen === lastActivity);

    return {
      totalTrackers,
      totalDomains: records.length,
      byCategory,
      byDomain: byDomain.slice(0, 20), // top 20 domains
      fingerprintEvents,
      privacyScore,
      timeline,
      mostRecentSite: mostRecentRecord?.domain || null,
      lastActivity
    };
  }

  // ─── Public: exportAsJSON ─────────────────────────────────────────────────

  /**
   * Export the full inventory as a formatted JSON string.
   * Suitable for file download.
   * @returns {Promise<string>}
   */
  async function exportAsJSON() {
    const raw = await _readStorage();
    const inventory = {};
    let totalTrackers = 0;
    const byCategory = {};

    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('inventory_') && value?.domain) {
        inventory[value.domain] = value;

        if (value.trackers) {
          Object.entries(value.trackers).forEach(([cat, list]) => {
            const count = Array.isArray(list) ? list.length : 0;
            totalTrackers += count;
            const norm = _normalizeCategory(cat);
            byCategory[norm] = (byCategory[norm] || 0) + count;
          });
        }
      }
    }

    const report = {
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      summary: {
        totalDomains: Object.keys(inventory).length,
        totalTrackers,
        byCategory
      },
      inventory,
      settings: raw.settings || null,
      whitelist: raw.whitelist || []
    };

    return JSON.stringify(report, null, 2);
  }

  // ─── Public: clear ────────────────────────────────────────────────────────

  /**
   * Remove all inventory_* keys from chrome.storage.local.
   * @returns {Promise<{ cleared: number }>}
   */
  async function clear() {
    const raw = await _readStorage();
    const keys = Object.keys(raw).filter(k => k.startsWith('inventory_'));
    await _removeKeys(keys);
    console.log(`[DataInventory] Cleared ${keys.length} inventory records.`);
    return { cleared: keys.length };
  }

  // ─── Public: subscribe ────────────────────────────────────────────────────

  /**
   * Subscribe to chrome.storage.local changes.
   * Callback receives the latest aggregate() result whenever inventory changes.
   *
   * @param {function} callback
   * @returns {function} unsubscribe
   */
  function subscribe(callback) {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
      return () => {};
    }

    const handler = (changes, namespace) => {
      if (namespace !== 'local') return;

      // Only re-aggregate if an inventory key changed
      const hasInventoryChange = Object.keys(changes).some(
        k => k.startsWith('inventory_')
      );

      if (hasInventoryChange) {
        aggregate().then(callback).catch(console.error);
      }
    };

    chrome.storage.onChanged.addListener(handler);

    // Return unsubscribe function
    return () => {
      chrome.storage.onChanged.removeListener(handler);
    };
  }

  // ─── Internal: helpers ────────────────────────────────────────────────────

  /**
   * Normalize variant category names to canonical keys.
   */
  function _normalizeCategory(cat) {
    const map = {
      ads: 'advertising',
      ad: 'advertising',
      social_media: 'social',
      pixel: 'tracking_pixel',
      tracking_pixels: 'tracking_pixel'
    };
    return map[cat] || cat;
  }

  /**
   * Build a 7-day timeline array from an array of lastSeen ms timestamps.
   * Returns [{ day: '6d', trackers: N }, ..., { day: 'Today', trackers: N }]
   */
  function _buildTimeline(timestamps, siteCount) {
    const DAY_MS = 86_400_000;
    const now = Date.now();
    const labels = ['6d', '5d', '4d', '3d', '2d', '1d', 'Today'];

    // Count how many records were seen on each day
    const dayCounts = {};
    timestamps.forEach(ts => {
      const dayOffset = Math.floor((now - ts) / DAY_MS);
      if (dayOffset >= 0 && dayOffset <= 6) {
        dayCounts[dayOffset] = (dayCounts[dayOffset] || 0) + 1;
      }
    });

    return labels.map((label, idx) => {
      const dayOffset = 6 - idx; // idx 0 = 6 days ago, idx 6 = today
      let count;

      if (timestamps.length > 0) {
        count = dayCounts[dayOffset] || 0;
      } else {
        // No real data yet — show siteCount as today's baseline proxy
        count = dayOffset === 0 ? siteCount : 0;
      }

      return { day: label, trackers: count };
    });
  }

  // ─── Exports ─────────────────────────────────────────────────────────────

  return {
    getAll,
    getForDomain,
    aggregate,
    exportAsJSON,
    clear,
    subscribe
  };
})();

// Support both browser extension (global) and Node/module environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataInventory;
}
