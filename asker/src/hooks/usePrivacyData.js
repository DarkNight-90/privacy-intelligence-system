/**
 * usePrivacyData.js
 * Personal Data Privacy Manager
 *
 * React hook — single entry point for all privacy data and actions.
 *
 * Flicker-free hydration contract:
 *  - ALL state lives in ONE useReducer → one atomic render per data change
 *  - isLoading=true until initialize() resolves → skeleton shown, not 0s
 *  - Subscriber is registered AFTER initialize() resolves → no double hydration
 *  - 80ms debounce on subscriber → coalesces batch writes from Persistence layer
 *  - updateState validates data before committing → no partial renders
 */

import { useReducer, useEffect, useCallback, useRef } from 'react';
import chromeStorageService from '../services/chromeStorage.js';

// ── Category colors ───────────────────────────────────────────────────────────

const COLORS = {
  analytics:     '#6366f1',
  advertising:   '#ef4444',
  social:        '#10b981',
  essential:     '#22c55e',
  fingerprinting:'#f59e0b',
  tracking_pixel:'#8b5cf6',
  functional:    '#3b82f6',
  unknown:       '#6b7280',
  ads:           '#ef4444',
};
const getColor = (cat) => COLORS[cat] || '#8b5cf6';

// ── GDPRAssistant accessor ────────────────────────────────────────────────────
function getAssistant() {
  return (typeof window !== 'undefined' && window.GDPRAssistant) || null;
}

// ── Demo sample data ──────────────────────────────────────────────────────────
const DEMO_DATA = {
  trackers:     47,
  cookies:      23,
  fingerprint:   8,
  privacyScore: 34,
  trackerBreakdown: { analytics: 18, advertising: 14, social: 7, fingerprinting: 8 },
  cookieBreakdown:  { essential: 4, analytics: 9, advertising: 7, functional: 2, unknown: 1 },
  timeline: [
    { day: '6d', trackers: 12 }, { day: '5d', trackers: 19 }, { day: '4d', trackers: 8 },
    { day: '3d', trackers: 25 }, { day: '2d', trackers: 33 }, { day: '1d', trackers: 15 },
    { day: 'Today', trackers: 47 },
  ],
  topDomains: [
    { domain: 'nytimes.com', count: 12, categories: { analytics: 5, advertising: 7 }, lastSeen: Date.now() - 300_000 },
    { domain: 'cnn.com',     count:  9, categories: { analytics: 4, social: 5 },      lastSeen: Date.now() - 600_000 },
    { domain: 'amazon.com',  count:  8, categories: { advertising: 6, analytics: 2 }, lastSeen: Date.now() - 900_000 },
    { domain: 'reddit.com',  count:  7, categories: { analytics: 3, advertising: 4 }, lastSeen: Date.now() - 1_200_000 },
    { domain: 'youtube.com', count:  6, categories: { social: 4, analytics: 2 },      lastSeen: Date.now() - 1_500_000 },
  ],
  settings: chromeStorageService._defaultSettings(),
};

// ── Reducer ───────────────────────────────────────────────────────────────────
// ONE atomic dispatch = ONE React render. Eliminates the 6-setState-per-update
// problem that was causing multiple render cycles per storage event.

const INITIAL_STATE = {
  stats:       null,   // null until storage resolves
  trackerData: null,
  cookieData:  null,
  timeline:    null,
  settings:    null,
  topDomains:  null,
  isLoading:   true,
  isDemoMode:  false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      // Single atomic update — ONE render
      return { ...state, ...action.payload, isLoading: false };
    case 'SET_LOADING':
      return { ...state, isLoading: action.value };
    case 'SET_DEMO':
      return { ...state, isDemoMode: action.value };
    case 'SET_SETTINGS':
      return { ...state, settings: action.settings };
    default:
      return state;
  }
}

// ── Data transformer ──────────────────────────────────────────────────────────
// Converts raw chromeStorage data → chart-ready payload for a single HYDRATE dispatch.

function buildPayload(data) {
  if (!data || typeof data !== 'object' || data.trackers === undefined) {
    console.warn('[usePrivacyData] buildPayload: invalid data, skipping.', data);
    return null;
  }

  const trackerData = Object.entries(data.trackerBreakdown || {})
    .map(([name, value]) => ({
      name:  name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' '),
      value: typeof value === 'number' ? value : 0,
      color: getColor(name),
    }))
    .filter(d => d.value > 0);

  const cookieData = Object.entries(data.cookieBreakdown || {})
    .map(([name, value]) => ({
      name:  name.charAt(0).toUpperCase() + name.slice(1),
      value: typeof value === 'number' ? value : 0,
      color: getColor(name),
    }))
    .filter(d => d.value > 0);

  console.debug('[usePrivacyData] Hydrating →', {
    trackers:    data.trackers,
    cookies:     data.cookies,
    fingerprint: data.fingerprint,
    privacyScore: data.privacyScore,
    trackerCategories: Object.keys(data.trackerBreakdown || {}),
    timelinePoints:    (data.timeline || []).length,
    domains:           (data.topDomains || []).length,
  });

  return {
    stats: {
      trackers:     data.trackers,
      cookies:      data.cookies,
      fingerprint:  data.fingerprint,
      privacyScore: data.privacyScore,
    },
    trackerData,
    cookieData,
    timeline:   data.timeline   || [],
    topDomains: data.topDomains || [],
    settings:   (data.settings && typeof data.settings === 'object')
                  ? data.settings
                  : chromeStorageService._defaultSettings(),
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

const usePrivacyData = () => {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

  const demoRef     = useRef(false);  // ref prevents stale closure in subscriber
  const debounceRef = useRef(null);
  const loadedRef   = useRef(false);  // true after first initialize() completes

  // ── Initialize + subscribe ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled   = false;
    let unsubscribe = null; // holds the chromeStorageService unsubscribe fn

    const init = async () => {
      try {
        const data = await chromeStorageService.initialize();
        if (cancelled || demoRef.current) return;

        const payload = buildPayload(data);
        if (payload) {
          dispatch({ type: 'HYDRATE', payload });
        } else {
          dispatch({ type: 'SET_LOADING', value: false });
        }
      } catch (err) {
        console.error('[usePrivacyData] initialize() failed:', err);
        if (!cancelled) dispatch({ type: 'SET_LOADING', value: false });
      } finally {
        loadedRef.current = true;

        // ── Register subscriber AFTER init completes ──────────────────────
        // Critical: prevents subscriber from firing concurrently with init,
        // which was causing the double-hydration flicker.
        if (!cancelled) {
          unsubscribe = chromeStorageService.subscribe((newData) => {
            if (demoRef.current || !loadedRef.current) return;
            clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              if (cancelled) return;
              const payload = buildPayload(newData);
              if (payload) dispatch({ type: 'HYDRATE', payload });
            }, 80);
          });
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
      if (unsubscribe) unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Demo mode ─────────────────────────────────────────────────────────────
  const enableDemoMode = useCallback(() => {
    demoRef.current = true;
    const payload = buildPayload(DEMO_DATA);
    dispatch({ type: 'SET_DEMO', value: true });
    if (payload) dispatch({ type: 'HYDRATE', payload });
    console.debug('[usePrivacyData] Demo mode ON.');
  }, []);

  const disableDemoMode = useCallback(async () => {
    demoRef.current = false;
    dispatch({ type: 'SET_DEMO', value: false });
    dispatch({ type: 'SET_LOADING', value: true });
    try {
      const data = await chromeStorageService.initialize();
      const payload = buildPayload(data);
      if (payload) dispatch({ type: 'HYDRATE', payload });
      else dispatch({ type: 'SET_LOADING', value: false });
    } catch (err) {
      console.error('[usePrivacyData] disableDemoMode re-init failed:', err);
      dispatch({ type: 'SET_LOADING', value: false });
    }
    console.debug('[usePrivacyData] Demo mode OFF.');
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const clearHistory = useCallback(async () => {
    await chromeStorageService.clearInventory();
    // Subscriber will fire and dispatch HYDRATE automatically
  }, []);

  /**
   * Export a full, validated snapshot from the Persistence layer.
   * Routes through GET_EXPORT_SNAPSHOT → background.js → Persistence.exportSnapshot()
   * which includes: inventory + globalStats + schema version + storage metrics.
   * Falls back to chromeStorageService.exportAll() if messaging is unavailable.
   */
  const exportData = useCallback(async () => {
    const filename = `privacy-export-${new Date().toISOString().slice(0, 10)}.json`;
    let json = null;

    // Try the persistence-layer export first (richest format)
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        json = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'GET_EXPORT_SNAPSHOT' }, (resp) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (resp?.success && resp.json) return resolve(resp.json);
            reject(new Error(resp?.error || 'Empty snapshot response'));
          });
        });
      }
    } catch (e) {
      console.warn('[usePrivacyData] GET_EXPORT_SNAPSHOT failed, falling back to chromeStorage.exportAll():', e.message);
    }

    // Fallback: basic export from chromeStorageService
    if (!json) {
      json = await chromeStorageService.exportAll();
    }

    const _download = (j) => {
      const blob = new Blob([j], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    };

    const assistant = getAssistant();
    if (assistant?.downloadJSON) {
      assistant.downloadJSON(json, filename);
    } else {
      _download(json);
    }
  }, []);

  const gdprAction = useCallback(async (type, params) => {
    const a = getAssistant();
    if (!a) throw new Error('GDPR Assistant not loaded.');
    return a.generateRequest(type, params);
  }, []);

  const analyzePolicy = useCallback(async (text) => {
    const a = getAssistant();
    if (!a) throw new Error('GDPR Assistant not loaded.');
    return a.analyzePolicy(text);
  }, []);

  const updateSettings = useCallback(async (newSettings) => {
    await chromeStorageService.saveSettings(newSettings);
    dispatch({ type: 'SET_SETTINGS', settings: newSettings });
  }, []);

  /**
   * Fetch live storage metrics from the Persistence layer via background.js.
   * Returns null if not in an extension context.
   *
   * @returns {Promise<{
   *   flushCount: number, failedFlushes: number, avgWriteMs: number,
   *   maxQueueSize: number, repairedRecords: number, currentDirtySize: number,
   *   cacheSize: number, lastFlushAt: number|null, lastError: string|null
   * }|null>}
   */
  const getPersistenceMetrics = useCallback(async () => {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return null;
      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'GET_PERSISTENCE_METRICS' }, (resp) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(resp?.success ? resp.metrics : null);
        });
      });
    } catch (e) {
      console.warn('[usePrivacyData] getPersistenceMetrics failed:', e.message);
      return null;
    }
  }, []);

  // ── Return ────────────────────────────────────────────────────────────────
  return {
    // Data (null while loading)
    stats:       state.stats,
    trackerData: state.trackerData,
    cookieData:  state.cookieData,
    timeline:    state.timeline,
    settings:    state.settings,
    topDomains:  state.topDomains,
    // Loading gate
    isLoading:   state.isLoading,
    // Demo mode
    isDemoMode:      state.isDemoMode,
    enableDemoMode,
    disableDemoMode,
    // Actions
    clearHistory,
    exportData,
    gdprAction,
    analyzePolicy,
    updateSettings,
    getPersistenceMetrics,
  };
};

export default usePrivacyData;