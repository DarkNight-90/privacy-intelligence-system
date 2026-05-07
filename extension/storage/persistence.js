/**
 * persistence.js  —  v2
 * Personal Data Privacy Manager · Unified Persistence Layer
 *
 * Runs in the background service worker context only.
 * Single source of truth for all inventory write operations.
 *
 * ┌──────────────────────────────────────────────────────────┐
 * │  background.js event                                      │
 * │    → updateDomain()      in-memory merge (sync, no I/O)  │
 * │      → _scheduleFlush()  200 ms debounce                 │
 * │        → _flush()        ONE atomic chrome.storage.set() │
 * │          → ONE onChanged  → ONE dashboard re-render      │
 * └──────────────────────────────────────────────────────────┘
 *
 * Hardening features (Phase 4):
 *   1. Schema validation    — every record validated on load & write
 *   2. Versioned format     — pm_schema_version key; auto-migrates v1 → v2
 *   3. Auto-repair          — corrupted fields repaired, not discarded
 *   4. onSuspend flush      — background.js calls flushNow() on suspend
 *   5. Snapshot export      — exportSnapshot() returns full structured JSON
 *   6. Metrics logger       — flush count, latency, queue size, error rate
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const SCHEMA_VERSION   = 2;
const VERSION_KEY      = 'pm_schema_version';
const KEY_PREFIX       = 'inventory_';
const SETTINGS_KEY     = 'settings';
const WRITE_DELAY_MS   = 200;    // normal debounce window
const RETRY_DELAY_MS   = 500;    // retry after write failure
const MAX_TRACKERS_PER_CATEGORY = 500;  // cap to prevent unbounded growth

/** All valid tracker category names. Anything outside this list is remapped to "unknown". */
const VALID_CATEGORIES = new Set([
  'analytics', 'advertising', 'social', 'fingerprinting',
  'tracking_pixel', 'functional', 'essential', 'unknown',
]);

// ── Category normalizer ───────────────────────────────────────────────────────

const CAT_MAP = {
  ads: 'advertising', ad: 'advertising',
  social_media: 'social',
  pixel: 'tracking_pixel', tracking_pixels: 'tracking_pixel',
};

function _normalizeCategory(cat) {
  if (typeof cat !== 'string') return 'unknown';
  const lower = cat.toLowerCase().trim();
  const mapped = CAT_MAP[lower] || lower;
  return VALID_CATEGORIES.has(mapped) ? mapped : 'unknown';
}

// ── Schema ────────────────────────────────────────────────────────────────────

/**
 * Canonical shape for a domain inventory record (v2).
 *
 * {
 *   _v:       2,                  ← record schema version
 *   domain:   "example.com",
 *   trackers: {
 *     analytics:   ["ga.js", ...],
 *     advertising: ["doubleclick.net", ...],
 *     ...
 *   },
 *   lastSeen:   1715074800000,    ← ms timestamp or null
 *   firstSeen:  1715074700000,    ← ms timestamp (new in v2)
 *   hitCount:   42,               ← total tracker events seen (new in v2)
 * }
 */

/**
 * Validate and auto-repair a single domain record.
 * Never throws. Always returns a usable record.
 *
 * @param {*}      raw     - value loaded from chrome.storage (any type)
 * @param {string} domain  - the key's domain suffix
 * @returns {{ record: object, repaired: boolean }}
 */
function _validateRecord(raw, domain) {
  let repaired = false;

  // ── Top-level type ────────────────────────────────────────────────────────
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    console.warn(`[Persistence] Corrupted record for "${domain}" — was ${typeof raw}. Replacing with empty record.`);
    return {
      record: _emptyRecord(domain),
      repaired: true,
    };
  }

  const r = { ...raw };

  // ── domain field ─────────────────────────────────────────────────────────
  if (typeof r.domain !== 'string' || !r.domain) {
    r.domain = domain;
    repaired = true;
  }

  // ── trackers map ─────────────────────────────────────────────────────────
  if (!r.trackers || typeof r.trackers !== 'object' || Array.isArray(r.trackers)) {
    r.trackers = {};
    repaired = true;
  } else {
    // Validate / repair each category array
    for (const [cat, list] of Object.entries(r.trackers)) {
      const normalized = _normalizeCategory(cat);

      // Rename unknown/invalid category keys
      if (normalized !== cat) {
        r.trackers[normalized] = r.trackers[normalized] || [];
        delete r.trackers[cat];
        repaired = true;
      }

      const targetList = r.trackers[normalized] ?? r.trackers[cat];

      if (!Array.isArray(targetList)) {
        r.trackers[normalized] = [];
        repaired = true;
      } else {
        // Remove non-string entries and duplicates
        const cleaned = [...new Set(targetList.filter(x => typeof x === 'string' && x.length > 0))];
        if (cleaned.length !== targetList.length) repaired = true;

        // Cap to prevent unbounded growth
        r.trackers[normalized] = cleaned.slice(0, MAX_TRACKERS_PER_CATEGORY);
        if (cleaned.length > MAX_TRACKERS_PER_CATEGORY) repaired = true;
      }
    }
  }

  // ── timestamps ───────────────────────────────────────────────────────────
  if (typeof r.lastSeen !== 'number' || r.lastSeen <= 0) {
    r.lastSeen = null;
    repaired = true;
  }
  if (typeof r.firstSeen !== 'number' || r.firstSeen <= 0) {
    // Migrate v1 records: set firstSeen to lastSeen as best estimate
    r.firstSeen = r.lastSeen || Date.now();
    repaired = true;
  }

  // ── hitCount (v2) ────────────────────────────────────────────────────────
  if (typeof r.hitCount !== 'number' || r.hitCount < 0) {
    // Estimate from total tracker entries for migrated records
    r.hitCount = Object.values(r.trackers).reduce((s, a) => s + (Array.isArray(a) ? a.length : 0), 0);
    repaired = true;
  }

  // ── schema version stamp ─────────────────────────────────────────────────
  if (r._v !== SCHEMA_VERSION) {
    r._v = SCHEMA_VERSION;
    repaired = true;
  }

  return { record: r, repaired };
}

function _emptyRecord(domain) {
  const now = Date.now();
  return { _v: SCHEMA_VERSION, domain, trackers: {}, lastSeen: null, firstSeen: now, hitCount: 0 };
}

// ── Metrics ───────────────────────────────────────────────────────────────────

const _metrics = {
  flushCount:      0,    // successful flushes
  failedFlushes:   0,    // failed write attempts
  totalWriteMs:    0,    // cumulative write latency
  maxQueueSize:    0,    // peak dirty set size observed
  repairedRecords: 0,    // records auto-repaired on load
  lastFlushAt:     null, // timestamp of last successful flush
  lastError:       null, // last error message
};

function _recordFlushSuccess(domainCount, latencyMs) {
  _metrics.flushCount++;
  _metrics.totalWriteMs += latencyMs;
  _metrics.lastFlushAt = Date.now();
  console.debug(
    `[Persistence] ✓ Flush #${_metrics.flushCount}: ${domainCount} domain(s) in ${latencyMs}ms` +
    ` | avg ${Math.round(_metrics.totalWriteMs / _metrics.flushCount)}ms/flush`
  );
}

function _recordFlushFailure(err) {
  _metrics.failedFlushes++;
  _metrics.lastError = err.message || String(err);
  console.warn(`[Persistence] ✗ Flush failed (attempt ${_metrics.failedFlushes}): ${_metrics.lastError}`);
}

function _trackQueueSize() {
  if (_dirty.size > _metrics.maxQueueSize) {
    _metrics.maxQueueSize = _dirty.size;
  }
}

// ── In-memory state ───────────────────────────────────────────────────────────

/** Authoritative in-memory cache: domain → validated record */
const _cache = new Map();

/** Dirty set: domains whose records need flushing */
const _dirty = new Set();

let _flushTimer  = null;
let _writing     = false;
let _initialized = false;

// ── Public: init ─────────────────────────────────────────────────────────────

/**
 * Load all inventory_* records into memory, validate schema, auto-migrate v1→v2.
 * Must be called once at service worker startup before any updateDomain() calls.
 */
async function init() {
  if (_initialized) return;

  try {
    const all = await chrome.storage.local.get(null);

    // ── Schema version check & migration ─────────────────────────────────
    const storedVersion = all[VERSION_KEY];
    const needsMigration = storedVersion !== SCHEMA_VERSION;

    if (needsMigration) {
      console.log(`[Persistence] Schema migration: v${storedVersion ?? 'unknown'} → v${SCHEMA_VERSION}`);
    }

    // ── Load and validate all inventory records ───────────────────────────
    let repairedCount = 0;
    const repairedKeys = {};

    for (const [key, value] of Object.entries(all || {})) {
      if (!key.startsWith(KEY_PREFIX)) continue;

      const domain = key.slice(KEY_PREFIX.length);
      if (!domain) continue;

      const { record, repaired } = _validateRecord(value, domain);
      _cache.set(domain, record);

      if (repaired) {
        repairedCount++;
        repairedKeys[key] = record;  // write back the repaired record
      }
    }

    _metrics.repairedRecords += repairedCount;

    // ── Write back repaired records + version stamp in one call ──────────
    if (needsMigration || repairedCount > 0) {
      const writeBack = { [VERSION_KEY]: SCHEMA_VERSION, ...repairedKeys };
      await chrome.storage.local.set(writeBack);
      console.log(`[Persistence] Migration complete. Repaired ${repairedCount} record(s).`);
    }

    console.log(
      `[Persistence] Initialized: ${_cache.size} domain(s) loaded` +
      (repairedCount > 0 ? `, ${repairedCount} auto-repaired` : '')
    );
  } catch (err) {
    console.error('[Persistence] init error (continuing with empty cache):', err.message);
  }

  _initialized = true;
}

// ── Public: updateDomain ──────────────────────────────────────────────────────

/**
 * Record a tracker event. Merges into in-memory cache only (zero I/O).
 * Validates inputs. Schedules batched flush.
 *
 * @param {string} siteDomain    — e.g. "nytimes.com"
 * @param {string} trackerDomain — e.g. "doubleclick.net"
 * @param {string} category      — e.g. "advertising"
 */
function updateDomain(siteDomain, trackerDomain, category) {
  if (typeof siteDomain !== 'string' || !siteDomain.trim()) return;
  if (typeof category !== 'string' || !category.trim()) return;

  const domain        = siteDomain.trim();
  const tracker       = String(trackerDomain || '').trim();
  const normalizedCat = _normalizeCategory(category);

  const record = _cache.get(domain) || _emptyRecord(domain);

  // Ensure category array exists
  if (!Array.isArray(record.trackers[normalizedCat])) {
    record.trackers[normalizedCat] = [];
  }

  // Deduplication + cap
  const list = record.trackers[normalizedCat];
  if (tracker && !list.includes(tracker) && list.length < MAX_TRACKERS_PER_CATEGORY) {
    list.push(tracker);
  }

  record.lastSeen = Date.now();
  if (!record.firstSeen) record.firstSeen = record.lastSeen;
  record.hitCount = (record.hitCount || 0) + 1;

  _cache.set(domain, record);
  _dirty.add(domain);
  _trackQueueSize();
  _scheduleFlush();
}

// ── Public: getSnapshot ───────────────────────────────────────────────────────

/**
 * Return a zero-latency snapshot of the in-memory cache.
 * Does NOT read chrome.storage.
 */
function getSnapshot() {
  const out = {};
  for (const [domain, record] of _cache.entries()) {
    out[domain] = record;
  }
  return out;
}

// ── Public: flushNow ─────────────────────────────────────────────────────────

/**
 * Force an immediate synchronous-as-possible flush of all dirty records.
 * Must be called from chrome.runtime.onSuspend to prevent data loss on
 * service worker termination.
 *
 * @returns {Promise<void>}
 */
async function flushNow() {
  clearTimeout(_flushTimer);
  _flushTimer = null;
  console.log(`[Persistence] onSuspend flush: ${_dirty.size} dirty domain(s).`);
  await _flush({ force: true });
}

// ── Public: clear ─────────────────────────────────────────────────────────────

/**
 * Wipe all inventory data from in-memory cache and chrome.storage.
 */
async function clear() {
  // Cancel any pending flush before clearing
  clearTimeout(_flushTimer);
  _flushTimer = null;
  _dirty.clear();
  _cache.clear();

  const all  = await chrome.storage.local.get(null);
  const keys = Object.keys(all || {}).filter(k => k.startsWith(KEY_PREFIX));
  if (keys.length > 0) {
    await chrome.storage.local.remove(keys);
  }
  console.log(`[Persistence] Cleared ${keys.length} inventory record(s) from storage.`);
}

// ── Public: exportSnapshot ────────────────────────────────────────────────────

/**
 * Build a complete, human-readable export package.
 * Includes: all domain inventory, global stats, metrics, schema version.
 *
 * @returns {string} Formatted JSON string ready for download.
 */
function exportSnapshot() {
  const domains = getSnapshot();

  let totalTrackers = 0;
  let totalDomains  = 0;
  const categoryTotals = {};

  for (const record of Object.values(domains)) {
    totalDomains++;
    for (const [cat, list] of Object.entries(record.trackers || {})) {
      if (!Array.isArray(list)) continue;
      categoryTotals[cat] = (categoryTotals[cat] || 0) + list.length;
      totalTrackers += list.length;
    }
  }

  const snapshot = {
    _meta: {
      exportedAt:    new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      generator:     'Personal Data Privacy Manager',
    },
    globalStats: {
      totalDomains,
      totalTrackers,
      categoryBreakdown: categoryTotals,
    },
    metrics: getMetrics(),
    inventory: domains,
  };

  return JSON.stringify(snapshot, null, 2);
}

// ── Public: getMetrics ────────────────────────────────────────────────────────

/**
 * Return a copy of current storage metrics.
 *
 * @returns {{
 *   flushCount: number,
 *   failedFlushes: number,
 *   avgWriteMs: number,
 *   maxQueueSize: number,
 *   repairedRecords: number,
 *   currentDirtySize: number,
 *   cacheSize: number,
 *   lastFlushAt: number|null,
 *   lastError: string|null,
 * }}
 */
function getMetrics() {
  return {
    flushCount:       _metrics.flushCount,
    failedFlushes:    _metrics.failedFlushes,
    avgWriteMs:       _metrics.flushCount > 0
                        ? Math.round(_metrics.totalWriteMs / _metrics.flushCount)
                        : 0,
    maxQueueSize:     _metrics.maxQueueSize,
    repairedRecords:  _metrics.repairedRecords,
    currentDirtySize: _dirty.size,
    cacheSize:        _cache.size,
    lastFlushAt:      _metrics.lastFlushAt,
    lastError:        _metrics.lastError,
  };
}

// ── Internal: flush ───────────────────────────────────────────────────────────

function _scheduleFlush() {
  clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => _flush({}), WRITE_DELAY_MS);
}

function _scheduleFlushDelayed(ms) {
  clearTimeout(_flushTimer);
  _flushTimer = setTimeout(() => _flush({}), ms);
}

/**
 * Write all dirty domains to chrome.storage.local in ONE atomic call.
 *
 * @param {{ force?: boolean }} opts
 *   force=true  skips the _writing guard (used by flushNow / onSuspend only)
 */
async function _flush({ force = false } = {}) {
  if (_dirty.size === 0) return;

  if (_writing && !force) {
    // A write is in flight — wait, then retry
    _scheduleFlushDelayed(RETRY_DELAY_MS);
    return;
  }

  _writing = true;

  // Snapshot current dirty set before async operation
  const domainsToFlush = new Set(_dirty);
  _dirty.clear();  // clear BEFORE write; new changes will re-add during write

  // Build validated payload
  const payload = {};
  for (const domain of domainsToFlush) {
    const record = _cache.get(domain);
    if (!record) continue;

    // Final validation pass before writing to storage
    const { record: validRecord, repaired } = _validateRecord(record, domain);
    if (repaired) {
      _cache.set(domain, validRecord);   // update cache with repaired version
      _metrics.repairedRecords++;
    }
    payload[`${KEY_PREFIX}${domain}`] = validRecord;
  }

  const t0 = Date.now();

  try {
    await chrome.storage.local.set(payload);
    _recordFlushSuccess(domainsToFlush.size, Date.now() - t0);
  } catch (err) {
    _recordFlushFailure(err);
    // Re-queue failed domains (they will be re-flushed on next attempt)
    for (const domain of domainsToFlush) {
      _dirty.add(domain);
    }
    _scheduleFlushDelayed(RETRY_DELAY_MS);
  } finally {
    _writing = false;
    // If new dirty domains arrived during the write, flush them
    if (_dirty.size > 0 && !force) {
      _scheduleFlush();
    }
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export default {
  // Lifecycle
  init,
  flushNow,
  clear,

  // Write
  updateDomain,

  // Read
  getSnapshot,
  exportSnapshot,
  getMetrics,

  // Settings (passthrough — not cached in memory, reads storage directly)
  async getSettings() {
    const r = await chrome.storage.local.get([SETTINGS_KEY]);
    return r[SETTINGS_KEY] || null;
  },
  async saveSettings(settings) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  },
};
