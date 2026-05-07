/**
 * cookie-manager.js
 * Cookie scanning, classification, deletion, and export.
 */

const CookieManager = (() => {
  'use strict';

  let cookieRules = null;

  /** Load cookie classification rules */
  async function loadRules() {
    if (cookieRules) return cookieRules;
    const url = chrome.runtime.getURL('extension/rules/cookie-categories.json');
    const res = await fetch(url);
    cookieRules = await res.json();
    return cookieRules;
  }

  /**
   * Classify a cookie by its name against known patterns.
   * @param {string} name - Cookie name
   * @returns {string} - category
   */
  async function classifyCookie(name) {
    const rules = await loadRules();
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
   * Get all cookies for the current active tab.
   * @returns {Promise<Array>} - enriched cookie objects
   */
  async function getCookiesForTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (!tabs[0]) return resolve([]);

        const url = tabs[0].url;
        const domain = extractDomain(url);

        chrome.cookies.getAll({ domain }, async (cookies) => {
          const enriched = await Promise.all(
            cookies.map(async (c) => ({
              ...c,
              category: await classifyCookie(c.name),
              displayExpiry: formatExpiry(c.expirationDate),
              age: calculateAge(c.expirationDate),
              risk: assessCookieRisk(c)
            }))
          );
          resolve(enriched);
        });
      });
    });
  }

  /**
   * Delete a single cookie by name and domain.
   */
  async function deleteCookie(name, domain, path = '/') {
    return new Promise((resolve) => {
      const url = `https://${domain}${path}`;
      chrome.cookies.remove({ url, name }, (result) => {
        resolve(!!result);
      });
    });
  }

  /**
   * Delete all cookies in a given category for current tab.
   */
  async function deleteCookiesByCategory(category) {
    const cookies = await getCookiesForTab();
    const targets = cookies.filter(c => c.category === category);

    const results = await Promise.all(
      targets.map(c => deleteCookie(c.name, c.domain, c.path))
    );

    return { deleted: results.filter(Boolean).length, total: targets.length };
  }

  /**
   * Delete all non-essential cookies for current tab.
   */
  async function deleteNonEssentialCookies() {
    const cookies = await getCookiesForTab();
    const targets = cookies.filter(c => c.category !== 'essential');

    const results = await Promise.all(
      targets.map(c => deleteCookie(c.name, c.domain, c.path))
    );

    return { deleted: results.filter(Boolean).length, total: targets.length };
  }

  /**
   * Delete ALL cookies for current tab.
   */
  async function deleteAllCookies() {
    const cookies = await getCookiesForTab();
    const results = await Promise.all(
      cookies.map(c => deleteCookie(c.name, c.domain, c.path))
    );
    return { deleted: results.filter(Boolean).length, total: cookies.length };
  }

  /**
   * Group cookies by category for display.
   */
  function groupByCategory(cookies) {
    return cookies.reduce((groups, cookie) => {
      const cat = cookie.category || 'unknown';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(cookie);
      return groups;
    }, {});
  }

  /**
   * Export cookie report as JSON string.
   */
  function exportReport(cookies) {
    const report = {
      generatedAt: new Date().toISOString(),
      domain: cookies[0]?.domain || 'unknown',
      totalCookies: cookies.length,
      byCategory: {},
      cookies: cookies.map(c => ({
        name: c.name,
        domain: c.domain,
        path: c.path,
        category: c.category,
        expiry: c.displayExpiry,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite
      }))
    };

    const grouped = groupByCategory(cookies);
    for (const [cat, list] of Object.entries(grouped)) {
      report.byCategory[cat] = list.length;
    }

    return JSON.stringify(report, null, 2);
  }

  /**
   * Calculate exposure score for a cookie set (0–100).
   */
  function calculateExposureScore(cookies) {
    if (!cookies.length) return 0;

    const weights = { advertising: 20, analytics: 10, unknown: 5, functional: 2, essential: 0 };
    let score = 0;
    cookies.forEach(c => { score += weights[c.category] || 5; });
    return Math.min(100, score);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function extractDomain(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  }

  function formatExpiry(expirationDate) {
    if (!expirationDate) return 'Session';
    const date = new Date(expirationDate * 1000);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function calculateAge(expirationDate) {
    if (!expirationDate) return null;
    const now = Date.now() / 1000;
    const daysLeft = Math.round((expirationDate - now) / 86400);
    return daysLeft;
  }

  function assessCookieRisk(cookie) {
    if (!cookie.secure && !cookie.httpOnly) return 'high';
    if (!cookie.secure || !cookie.httpOnly) return 'medium';
    return 'low';
  }

  // ─── Category Metadata ────────────────────────────────────────────────────

  const CATEGORY_META = {
    essential: { label: 'Essential', color: '#34C759', icon: '🔒', description: 'Required for the site to work' },
    functional: { label: 'Functional', color: '#007AFF', icon: '⚙️', description: 'Enhance user experience' },
    analytics: { label: 'Analytics', color: '#FF9500', icon: '📊', description: 'Track usage and performance' },
    advertising: { label: 'Advertising', color: '#FF3B30', icon: '📣', description: 'Used for targeted ads' },
    unknown: { label: 'Unknown', color: '#8E8E93', icon: '❓', description: 'Could not be classified' }
  };

  return {
    getCookiesForTab,
    classifyCookie,
    deleteCookie,
    deleteCookiesByCategory,
    deleteNonEssentialCookies,
    deleteAllCookies,
    groupByCategory,
    exportReport,
    calculateExposureScore,
    CATEGORY_META
  };
})();

if (typeof module !== 'undefined') module.exports = CookieManager;
