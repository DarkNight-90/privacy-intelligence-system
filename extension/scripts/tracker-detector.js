/**
 * tracker-detector.js
 * Tracker detection utilities shared by popup and dashboard.
 */

const TrackerDetector = (() => {
  'use strict';

  /** Category display names and colors */
  const CATEGORY_META = {
    analytics: { label: 'Analytics', color: '#FF9500', icon: '📊' },
    advertising: { label: 'Advertising', color: '#FF3B30', icon: '📣' },
    social: { label: 'Social', color: '#5856D6', icon: '👥' },
    fingerprinting: { label: 'Fingerprinting', color: '#FF2D55', icon: '🔍' },
    tracking_pixel: { label: 'Tracking Pixel', color: '#AF52DE', icon: '🎯' },
    unknown: { label: 'Unknown', color: '#8E8E93', icon: '❓' }
  };

  /**
   * Get display metadata for a tracker category.
   * @param {string} category
   */
  function getCategoryMeta(category) {
    return CATEGORY_META[category] || CATEGORY_META.unknown;
  }

  /**
   * Group trackers array by category.
   * @param {Array} trackers - Array of tracker objects
   * @returns {Object} - { category: [trackers] }
   */
  function groupByCategory(trackers) {
    return trackers.reduce((groups, tracker) => {
      const cat = tracker.category || 'unknown';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(tracker);
      return groups;
    }, {});
  }

  /**
   * Calculate risk score from trackers array (0–100).
   * Higher weight for advertising and fingerprinting.
   */
  function calculateRiskScore(trackers) {
    if (!trackers || trackers.length === 0) return 0;

    const weights = {
      fingerprinting: 15,
      advertising: 10,
      tracking_pixel: 8,
      social: 5,
      analytics: 3,
      unknown: 2
    };

    let score = 0;
    trackers.forEach(t => {
      score += weights[t.category] || weights.unknown;
    });

    return Math.min(100, score);
  }

  /**
   * Format a tracker domain for display.
   */
  function formatDomain(domain) {
    return domain.replace('www.', '').substring(0, 40);
  }

  /**
   * Get total blocked count from background via messaging.
   * @returns {Promise<{blockedCount, trackers, domain}>}
   */
  async function getCurrentTabData() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_TAB_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ blockedCount: 0, trackers: [], domain: '' });
        } else {
          resolve(response?.data || { blockedCount: 0, trackers: [], domain: '' });
        }
      });
    });
  }

  /**
   * Add domain to whitelist.
   * @param {string} domain
   */
  async function whitelistDomain(domain) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'ADD_TO_WHITELIST', domain }, resolve);
    });
  }

  /**
   * Remove domain from whitelist.
   * @param {string} domain
   */
  async function unwhitelistDomain(domain) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'REMOVE_FROM_WHITELIST', domain }, resolve);
    });
  }

  /**
   * Get full whitelist.
   */
  async function getWhitelist() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_WHITELIST' }, (response) => {
        resolve(response?.whitelist || []);
      });
    });
  }

  return {
    getCategoryMeta,
    groupByCategory,
    calculateRiskScore,
    formatDomain,
    getCurrentTabData,
    whitelistDomain,
    unwhitelistDomain,
    getWhitelist,
    CATEGORY_META
  };
})();

// Export for use in other modules
if (typeof module !== 'undefined') module.exports = TrackerDetector;
