/**
 * chromeStorage.js
 * Personal Data Privacy Manager
 *
 * Chrome Storage Data Bridge — connects React dashboard to chrome.storage.local.
 *
 * Responsibilities:
 *  - Read and normalize all inventory_* keys into dashboard-ready format
 *  - Classify cookies into 5 categories using cookie-categories.json patterns
 *  - Build a real 7-day timeline from inventory lastSeen timestamps
 *  - Notify React subscribers on every storage change
 *  - Expose utility actions: clearInventory, exportAll, getSettings, saveSettings
 */

class ChromeStorageService {
  constructor() {
    this._listeners = [];
    this._cookieRules   = null;   // loaded lazily
    this._debounceTimer = null;   // debounce handle for storage onChanged
    this._updating      = false;  // true while __doUpdate is running
    this._pendingData   = null;   // latest raw storage data waiting to be processed

    // Default normalized data shape
    this.data = {
      trackers: 0,
      cookies: 0,
      fingerprint: 0,
      privacyScore: 50,
      trackerBreakdown: {},
      cookieBreakdown: {},
      timeline: [],
      topDomains: [],
      settings: this._defaultSettings()
    };

    // Wire real-time storage change listener
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(this._handleStorageChange.bind(this));
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Initialize: load all storage, normalize, return current data snapshot.
   */
  async initialize() {
    try {
      const raw = await this._getAllStorage();
      await this._updateDataFromStorage(raw);
      return this.data;
    } catch (err) {
      console.error('[ChromeStorage] Init error:', err);
      return this.data;
    }
  }

  /** Subscribe to data changes. Returns unsubscribe function. */
  subscribe(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(l => l !== callback);
    };
  }

  /** Get current normalized data snapshot. */
  getData() {
    return this.data;
  }

  /** Clear all inventory_* keys from storage. */
  async clearInventory() {
    const raw = await this._getAllStorage();
    const keys = Object.keys(raw).filter(k => k.startsWith('inventory_'));
    if (keys.length > 0) {
      await this._removeKeys(keys);
    }
    // Reset in-memory stats
    this.data = {
      ...this.data,
      trackers: 0,
      fingerprint: 0,
      trackerBreakdown: {},
      timeline: [],
      topDomains: []
    };
    this._notifyListeners();
  }

  /** Export full raw storage as JSON string. */
  async exportAll() {
    const raw = await this._getAllStorage();
    const inventoryEntries = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key.startsWith('inventory_')) {
        inventoryEntries[key] = value;
      }
    }
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      version: '1.0.0',
      totalDomains: Object.keys(inventoryEntries).length,
      inventory: inventoryEntries,
      settings: raw.settings || this._defaultSettings()
    }, null, 2);
  }

  /** Get extension settings from storage. */
  async getSettings() {
    const raw = await this._getAllStorage();
    return raw.settings || this._defaultSettings();
  }

  /** Save extension settings to storage. */
  async saveSettings(settings) {
    await this._setStorage({ settings });
  }

  // ─── Internal: Storage Helpers ────────────────────────────────────────────

  _getAllStorage() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve({});
        return;
      }
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) {
          console.warn('[ChromeStorage] get error:', chrome.runtime.lastError.message);
          resolve({});
        } else {
          resolve(result || {});
        }
      });
    });
  }

  _removeKeys(keys) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve();
        return;
      }
      chrome.storage.local.remove(keys, resolve);
    });
  }

  _setStorage(obj) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve();
        return;
      }
      chrome.storage.local.set(obj, resolve);
    });
  }

  _handleStorageChange(changes, namespace) {
    if (namespace !== 'local') return;

    // Only react when inventory_, settings, or whitelist keys change
    const relevant = Object.keys(changes).some(
      k => k.startsWith('inventory_') || k === 'settings' || k === 'whitelist'
    );
    if (!relevant) return;

    // Debounce: coalesce rapid writes (e.g. visiting a tracker-heavy page)
    // into a single re-read 120ms after the last change.
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      if (this._updating) return; // skip if a full update is already running
      this._getAllStorage().then(raw => this._updateDataFromStorage(raw));
    }, 120);
  }

  // ─── Internal: Data Normalization ─────────────────────────────────────────

  /**
   * Master normalization function.
   * Reads all inventory_* records and aggregates into this.data.
   */
  async _updateDataFromStorage(raw) {
    if (this._updating) {
      // A run is in progress — store the latest data so it gets processed after
      this._pendingData = raw;
      return;
    }
    this._updating = true;
    this._pendingData = null;
    try {
      await this.__doUpdate(raw);
    } finally {
      this._updating = false;
      // If newer data arrived while we were running, process it now
      if (this._pendingData !== null) {
        const next = this._pendingData;
        this._pendingData = null;
        await this._updateDataFromStorage(next);
      }
    }
  }

  async __doUpdate(raw) {
    const inventoryKeys = Object.keys(raw).filter(k => k.startsWith('inventory_'));

    // ── Tracker aggregation ──────────────────────────────────────────────────
    let totalTrackers = 0;
    let fingerprintCount = 0;

    // All possible tracker categories from tracker-rules.json + content.js
    const trackerBreakdown = {
      analytics: 0,
      advertising: 0,
      social: 0,
      fingerprinting: 0,
      tracking_pixel: 0
    };

    // For top domains and timeline
    const domainStats = [];
    const seenTimestamps = [];

    inventoryKeys.forEach(key => {
      const record = raw[key];
      if (!record || !record.trackers) return;

      let domainTotal = 0;

      Object.entries(record.trackers).forEach(([category, trackers]) => {
        const count = Array.isArray(trackers) ? trackers.length : 0;
        totalTrackers += count;
        domainTotal += count;

        if (category === 'fingerprinting') {
          fingerprintCount += count;
        }

        // Map to known categories (normalize aliases)
        const normalized = this._normalizeCategoryKey(category);
        if (normalized in trackerBreakdown) {
          trackerBreakdown[normalized] += count;
        } else {
          // Unknown category — add it dynamically
          trackerBreakdown[normalized] = (trackerBreakdown[normalized] || 0) + count;
        }
      });

      domainStats.push({
        domain: record.domain || key.replace('inventory_', ''),
        count: domainTotal,
        lastSeen: record.lastSeen || null,
        categories: record.trackers
      });

      if (record.lastSeen) {
        seenTimestamps.push(record.lastSeen);
      }
    });

    // Sort top domains by tracker count
    const topDomains = domainStats
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Cookie aggregation ───────────────────────────────────────────────────
    const cookies = await this._getCurrentTabCookies();
    const cookieBreakdown = await this._classifyCookies(cookies);

    // ── Privacy score ────────────────────────────────────────────────────────
    // Lower is worse. Starts at 100, deducted by tracker/fingerprint exposure.
    const trackerPenalty = Math.min(60, totalTrackers * 2);
    const fingerprintPenalty = Math.min(30, fingerprintCount * 5);
    const cookiePenalty = Math.min(10, (cookieBreakdown.advertising || 0) * 2);
    const privacyScore = Math.max(0, 100 - trackerPenalty - fingerprintPenalty - cookiePenalty);

    // ── Timeline: real 7-day aggregation ────────────────────────────────────
    const timeline = this._buildTimeline(seenTimestamps, inventoryKeys.length);

    // ── Commit ───────────────────────────────────────────────────────────────
    this.data = {
      trackers: totalTrackers,
      cookies: cookies.length,
      fingerprint: fingerprintCount,
      privacyScore,
      trackerBreakdown,
      cookieBreakdown,
      timeline,
      topDomains,
      settings: raw.settings || this._defaultSettings()
    };

    this._notifyListeners();
  }

  /**
   * Normalize variant category names to canonical keys.
   */
  _normalizeCategoryKey(category) {
    const map = {
      ads: 'advertising',
      ad: 'advertising',
      social_media: 'social',
      pixel: 'tracking_pixel',
      tracking_pixels: 'tracking_pixel'
    };
    return map[category] || category;
  }

  // ─── Internal: Cookie Classification ──────────────────────────────────────

  /**
   * Load cookie-categories.json rules (cached).
   */
  async _loadCookieRules() {
    if (this._cookieRules) return this._cookieRules;
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
        const url = chrome.runtime.getURL('extension/rules/cookie-categories.json');
        const res = await fetch(url);
        this._cookieRules = await res.json();
        return this._cookieRules;
      }
    } catch (e) {
      console.warn('[ChromeStorage] Could not load cookie rules:', e);
    }
    // Fallback inline rules (mirrors cookie-categories.json)
    this._cookieRules = {
      categories: {
        essential:   { patterns: ['session','sess','csrf','xsrf','_token','auth','login','user_id','uid','sid','phpsessid','jsessionid','cart','security'] },
        functional:  { patterns: ['lang','language','locale','timezone','theme','currency','prefs','preferences','settings','region','country','dark_mode'] },
        analytics:   { patterns: ['_ga','_gid','_gat','_utm','__utma','__utmb','__utmz','_hjid','mixpanel','amplitude','mp_','ajs_','heap','piwik','matomo'] },
        advertising: { patterns: ['_fbp','_fbc','ads_','adroll','criteo','_gcl_','gads','ide','dsid','rul','nid','muid','1p_jar','doubleclick','li_sugr','lidc','bcookie'] }
      }
    };
    return this._cookieRules;
  }

  /**
   * Classify a single cookie name → category string.
   */
  async _classifyCookieName(name) {
    const rules = await this._loadCookieRules();
    const nameLower = name.toLowerCase();
    for (const [category, data] of Object.entries(rules.categories)) {
      for (const pattern of data.patterns) {
        if (nameLower.includes(pattern.toLowerCase())) {
          return category;
        }
      }
    }
    return 'unknown';
  }

  /**
   * Classify a full cookie array and return breakdown counts.
   */
  async _classifyCookies(cookies) {
    const breakdown = {
      essential: 0,
      functional: 0,
      analytics: 0,
      advertising: 0,
      unknown: 0
    };

    await Promise.all(
      cookies.map(async (c) => {
        const category = await this._classifyCookieName(c.name);
        breakdown[category] = (breakdown[category] || 0) + 1;
      })
    );

    return breakdown;
  }

  /**
   * Get all cookies for the currently active tab.
   */
  _getCurrentTabCookies() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.tabs || !chrome.cookies) {
        resolve([]);
        return;
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs?.[0]?.url || '';
        if (!url) return resolve([]);

        // Skip non-http pages (chrome://, file://, about:, devtools:/ etc.)
        // chrome.cookies.getAll with an empty hostname returns ALL cookies — avoid.
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return resolve([]);
        }

        try {
          const hostname = new URL(url).hostname;
          if (!hostname) return resolve([]);
          chrome.cookies.getAll({ domain: hostname }, (cookies) => {
            if (chrome.runtime.lastError) {
              console.debug('[ChromeStorage] cookies.getAll error (ignored):', chrome.runtime.lastError.message);
              resolve([]);
            } else {
              resolve(cookies || []);
            }
          });
        } catch (e) {
          console.debug('[ChromeStorage] URL parse error (ignored):', e.message);
          resolve([]);
        }
      });
    });
  }

  // ─── Internal: Real Timeline ───────────────────────────────────────────────

  /**
   * Build a 7-day tracker activity timeline from real lastSeen timestamps.
   * Days with no data get 0. If no timestamps exist, uses siteCount as proxy.
   */
  _buildTimeline(timestamps, siteCount) {
    const DAY_MS = 86_400_000;
    const now = Date.now();

    // Build a map: dayOffset (0=today, 6=7 days ago) → count
    const dayCounts = {};
    for (let i = 6; i >= 0; i--) {
      dayCounts[i] = 0;
    }

    timestamps.forEach(ts => {
      const ageMs = now - ts;
      const dayOffset = Math.floor(ageMs / DAY_MS);
      if (dayOffset >= 0 && dayOffset <= 6) {
        dayCounts[dayOffset] = (dayCounts[dayOffset] || 0) + 1;
      }
    });

    // If we have no real timestamps but do have sites, distribute evenly
    const hasRealData = timestamps.length > 0;
    const labels = ['6d', '5d', '4d', '3d', '2d', '1d', 'Today'];

    return labels.map((label, idx) => {
      const dayOffset = 6 - idx; // idx 0 = 6 days ago, idx 6 = today
      const count = hasRealData
        ? (dayCounts[dayOffset] || 0)
        : (dayOffset === 0 ? siteCount : 0); // proxy: today only
      return { day: label, trackers: count };
    });
  }

  // ─── Internal: Notifications ──────────────────────────────────────────────

  _notifyListeners() {
    this._listeners.forEach(cb => {
      try { cb(this.data); } catch (e) {}
    });
  }

  // ─── Internal: Defaults ──────────────────────────────────────────────────

  _defaultSettings() {
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
}

// ── Singleton export ──────────────────────────────────────────────────────────
const chromeStorageService = new ChromeStorageService();
export default chromeStorageService;