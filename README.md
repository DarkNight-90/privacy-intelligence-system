<div align="center">

<h1>🛡️ Personal Data Privacy Manager</h1>

<p><strong>Privacy-first browser intelligence platform that gives users real-time visibility and control over trackers, cookies, browser fingerprinting, and personal data exposure — entirely on-device.</strong></p>

<br/>

[![JavaScript](https://img.shields.io/badge/JavaScript-ES2022-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![React](https://img.shields.io/badge/React-18.2-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org)
[![Flask](https://img.shields.io/badge/Flask-3.0-000000?style=flat-square&logo=flask&logoColor=white)](https://flask.palletsprojects.com)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![GDPR](https://img.shields.io/badge/GDPR-Compliant%20Design-0052CC?style=flat-square)](https://gdpr.eu)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

<br/>

> Block trackers. Classify cookies. Detect fingerprinting. Generate GDPR requests. Analyze privacy policies with NLP — all locally in your browser.

</div>

---

## 📸 Screenshots

| Dashboard Overview | GDPR Assistant | Storage Health |
|---|---|---|
| ![Dashboard](docs/screenshots/dashboard.png) | ![GDPR](docs/screenshots/gdpr.png) | ![Storage Health](docs/screenshots/storage-health.png) |

---

## ✨ Key Features

| Feature | Description |
|---|---|
| 🔍 **Real-Time Tracker Detection** | Intercepts and classifies web requests across 5 categories: analytics, advertising, social, fingerprinting, and tracking pixels |
| 🚫 **Declarative Tracker Blocking** | Uses Chrome's `declarativeNetRequest` API with a curated rule set — no background script overhead |
| 🧬 **Fingerprinting Protection** | Content script overrides `canvas`, `AudioContext`, `WebGL`, `navigator`, and screen APIs to prevent entropy harvesting |
| 🍪 **Cookie Inspection & Cleaning** | Classifies cookies by purpose (essential / analytics / advertising / functional) and removes non-essential cookies on demand |
| 🛡️ **Privacy Scoring Engine** | Produces a 0–100 privacy score per session based on tracker density, cookie exposure, and fingerprinting alerts |
| 🤖 **GDPR Request Generator** | Generates legally structured Article 15 (Access), Article 17 (Deletion), and Article 20 (Portability) request letters |
| 📄 **Privacy Policy NLP Analyzer** | Submits policy text to a local Flask backend; returns risk classification, red flag extraction, and plain-language recommendations |
| 💾 **Production Persistence Engine** | In-memory write cache with 200 ms debounced batch flushes, schema v2 migration, auto-repair of corrupted records, and crash-safe `onSuspend` forced flush |
| 📦 **Export Snapshots** | One-click JSON export: full inventory + global stats + schema version + storage health metrics |
| 🎭 **Demo Mode** | Loads realistic synthetic data for presentations — never touches real storage |
| 📊 **Storage Health Telemetry** | Live dashboard panel: flush count, average write latency, max queue depth, auto-repaired record count, last error |
| 🔔 **Badge & Notification System** | Extension badge updates live with blocked tracker count; optional browser notifications for high-risk detections |

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser Activity                          │
│           (Page loads, network requests, DOM access)             │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │       Content Scripts        │
              │  fingerprint-guard.js        │
              │  content.js                  │
              │  • Override privacy APIs     │
              │  • Detect DOM-based tracking │
              │  • Report to background      │
              └──────────────┬──────────────┘
                             │  chrome.runtime.sendMessage
              ┌──────────────▼──────────────┐
              │   Background Service Worker  │
              │   background.js (MV3 ESM)   │
              │  • webRequest interception   │
              │  • declarativeNetRequest     │
              │  • Badge management          │
              │  • Message routing           │
              └──────────────┬──────────────┘
                             │  updateDomain() — sync, zero I/O
              ┌──────────────▼──────────────┐
              │      Persistence Engine      │
              │  storage/persistence.js      │
              │  • In-memory Map cache       │
              │  • Schema v2 validation      │
              │  • 200 ms debounced flush    │
              │  • Auto-repair corrupted     │
              │  • onSuspend forced flush    │
              └──────────────┬──────────────┘
                             │  ONE atomic chrome.storage.set()
              ┌──────────────▼──────────────┐
              │      chrome.storage.local    │
              │  • inventory_[domain] keys   │
              │  • pm_schema_version         │
              │  • settings                  │
              └───────┬──────────────┬───────┘
                      │              │
       ┌──────────────▼──┐     ┌─────▼────────────────┐
       │  React Dashboard │     │   Flask NLP Backend   │
       │  Dashboard.jsx   │     │   app.py              │
       │  usePrivacyData  │     │  • /analyze-policy    │
       │  chromeStorage   │     │  • /generate-gdpr-    │
       │  GDPRAssistant   │     │    request            │
       │  Recharts UI     │     │  • /health            │
       └──────────────────┘     └───────────────────────┘
```

### Layer Responsibilities

| Layer | File(s) | Role |
|---|---|---|
| **Content Scripts** | `fingerprint-guard.js`, `content.js` | Injected at `document_start` in every frame. Intercepts fingerprinting APIs, monitors DOM mutations, reports tracker signals to the background worker |
| **Background Worker** | `background.js` | ES module service worker. Detects tracker patterns in web requests using a JSON rule set. Routes messages from popup, content scripts, and dashboard |
| **Persistence Engine** | `storage/persistence.js` | Single write authority. Maintains an in-memory domain inventory. Batches all writes into one `chrome.storage.local.set()` call per 200 ms window, eliminating N-concurrent-write race conditions |
| **Chrome Storage** | `chrome.storage.local` | Ground-truth storage. Stores per-domain inventory records under `inventory_[domain]` keys with schema version `pm_schema_version = 2` |
| **chromeStorage Service** | `src/services/chromeStorage.js` | Dashboard-side read layer. Subscribes to `chrome.storage.onChanged`, aggregates all inventory records, normalizes data for the React hook |
| **React Dashboard** | `src/hooks/usePrivacyData.js`, `src/components/Dashboard.jsx` | Single `useReducer` state atom. Initialized once from storage, updated via debounced subscriber. Tabs: Overview, Trackers, Cookies, Timeline, Sites, GDPR, Settings |
| **Flask Backend** | `backend/app.py`, `backend/routes/`, `backend/utils/` | Stateless local AI engine. Performs regex-based NLP risk scoring on submitted policy text. Generates GDPR request letter templates. Runs at `http://127.0.0.1:5000` |

---

## 🛠️ Tech Stack

### Frontend & Extension

| Technology | Version | Purpose |
|---|---|---|
| JavaScript (ES2022) | — | Extension logic, content scripts, service worker |
| React | 18.2 | Dashboard UI with hooks and `useReducer` state management |
| Recharts | 2.7 | PieChart, BarChart, LineChart data visualizations |
| Webpack | 5.88 | Bundles React dashboard into a single compliant script |
| Babel | 7.22 | JSX transpilation and ES2022 → ES5 downcompile |

### Chrome Extension APIs

| API | Purpose |
|---|---|
| `declarativeNetRequest` | Rule-based tracker blocking with zero background-script overhead |
| `webNavigation` | Tracks page transitions to reset per-tab counters |
| `cookies` | Reads, classifies, and removes cookies per active tab |
| `storage` | Persists tracker inventory, settings, whitelist |
| `scripting` | Dynamic content script injection |
| `notifications` | High-risk detection alerts |
| `action` | Badge text and colour management |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.10+ | Runtime |
| Flask | 3.0.3 | HTTP API server |
| Flask-CORS | 4.0.1 | Cross-origin requests from extension context |
| NLTK | 3.8.1 | Natural language tokenization |
| textstat | 0.7.3 | Readability scoring for policy text |
| Gunicorn | 22.0.0 | Production WSGI server |
| python-dotenv | 1.0.1 | Environment configuration |

### Persistence Engine

| Capability | Implementation |
|---|---|
| In-memory cache | `Map<domain, record>` — zero-latency writes, no storage reads on hot path |
| Schema validation | `_validateRecord()` repairs 8 field types on every load and write |
| Version migration | `pm_schema_version` key; auto-migrates v1 → v2 on first load |
| Batched writes | 200 ms debounce collapses N tracker events into one `chrome.storage.set()` |
| Forced flush | `flushNow()` called on `chrome.runtime.onSuspend` — prevents data loss on worker termination |
| Auto-repair | Corrupted records repaired in-place, never discarded; count tracked in metrics |
| Export snapshots | Full structured JSON: inventory + global stats + schema version + health metrics |

---

## ⚙️ Core Engineering Highlights

### 1 · Debounced Batch Persistence

The original implementation called `chrome.storage.local.get()` + `chrome.storage.local.set()` for every individual tracker event. On a tracker-heavy page this produced 30+ concurrent read-modify-write operations, 30 separate `onChanged` events, and 30 React re-renders.

The persistence engine solves this by maintaining an in-memory `Map`. All tracker merges are applied synchronously to the cache. A 200 ms debounced timer fires a single `chrome.storage.local.set()` containing all dirty domains — one atomic write, one `onChanged` event, one React render.

```
Before:  30 tracker events → 30 storage reads → 30 writes → 30 onChanged → 30 renders
After:   30 tracker events → 30 memory merges → 1 write   → 1  onChanged → 1  render
```

### 2 · Schema Validation & Auto-Repair

Every record loaded from storage is passed through `_validateRecord()`, which checks and repairs:

- Top-level type (must be a non-array object)
- `domain` field (string, falls back to key suffix)
- `trackers` map (each category key normalized, each array deduplicated and capped at 500 entries)
- `lastSeen` / `firstSeen` timestamps (repaired or estimated from other fields)
- `hitCount` (estimated from tracker array lengths for migrated v1 records)
- Schema version stamp `_v: 2`

Corrupted records are **never discarded** — they are repaired in place and written back to storage atomically.

### 3 · Schema Versioning

A `pm_schema_version` key in `chrome.storage.local` tracks the active schema version. On `init()`, the engine compares the stored version against `SCHEMA_VERSION = 2`. If they differ, all records are migrated, repaired, and written back — along with the new version stamp — in a single storage call.

### 4 · One-Render State Architecture

The React dashboard uses a single `useReducer` atom with a `HYDRATE` action that updates all state fields atomically. This replaces the previous architecture of 6 independent `useState` calls, which produced up to 6 separate render cycles per storage change.

The subscriber is registered **after** `initialize()` resolves — a critical detail that eliminates the double-hydration flicker caused by concurrent init + subscriber firing.

### 5 · Crash-Safe Flush

Chrome MV3 service workers are terminated aggressively by the browser. The extension registers `chrome.runtime.onSuspend` to call `Persistence.flushNow()` — a force-mode flush that bypasses the 200 ms debounce and writes all dirty records immediately. Chrome provides approximately 1–2 seconds before hard-killing the worker; the typical flush completes in under 50 ms.

### 6 · Storage Metrics Logger

The persistence engine maintains a live `_metrics` object:

| Metric | Description |
|---|---|
| `flushCount` | Successful flush operations since startup |
| `failedFlushes` | Write failures (triggers exponential retry) |
| `avgWriteMs` | Running average write latency |
| `maxQueueSize` | Peak dirty set size observed |
| `repairedRecords` | Cumulative auto-repaired records |
| `currentDirtySize` | Records pending next flush |
| `lastFlushAt` | Timestamp of last successful flush |
| `lastError` | Most recent write error message |

These are exposed through the `GET_PERSISTENCE_METRICS` message handler and rendered live in the dashboard's **Settings → Storage Health** panel.

---

## � Background Service Worker Architecture (MV3)

The background service worker (`extension/background.js`) is the core coordination hub for all extension activities. It runs in the service worker context, which means it can be terminated and restarted by the browser at any time.

### Lifecycle & State Management

```
┌─ Startup ──────────────────────┐
│ 1. initialize()               │
│    • Load tracker rules JSON   │
│    • Load whitelist storage    │
│    • Call Persistence.init()   │
│    • Print "initialized"       │
└────────────────────────────────┘
             ↓
┌─ Event Loop ─────────────────────────────────┐
│ • webNavigation.onCommitted                   │
│   → Update tabData domain on new page         │
│                                               │
│ • tabs.onUpdated (loading)                    │
│   → Reset blockedCount, trackers, badge      │
│                                               │
│ • tabs.onRemoved                              │
│   → Clean up tabData entry                    │
│                                               │
│ • runtime.onMessage (from content scripts)   │
│   → Handle GET_TAB_DATA, FINGERPRINT_ALERT   │
│   → Delegate to Persistence.updateDomain()   │
│                                               │
│ • runtime.onSuspend                           │
│   → Call Persistence.flushNow()              │
│   → Prevent data loss on termination         │
└────────────────────────────────────────────────┘
```

### Message Types Handled

| Message | Source | Action |
|---------|--------|--------|
| `GET_TAB_DATA` | Popup | Returns current tab's blockedCount, trackers, domain |
| `GET_ALL_STATS` | Dashboard | Returns global totalBlocked and tabCount |
| `ADD_TO_WHITELIST` / `REMOVE_FROM_WHITELIST` | Dashboard | Modifies whitelist Set, saves to storage |
| `GET_WHITELIST` | Dashboard | Returns current whitelist |
| `CONTENT_FINGERPRINT_ALERT` | fingerprint-guard.js | Records fingerprinting attempt, increments badge |
| `GET_SETTINGS` / `SAVE_SETTINGS` | Dashboard | Read/write user settings via chrome.storage |
| `GET_ALL_INVENTORY` | Dashboard | Aggregates all `inventory_*` records, computes statistics |
| `CLEAN_NON_ESSENTIAL_COOKIES` | Dashboard | Filters and removes cookies by category |
| `CLEAR_INVENTORY` | Dashboard | Calls `Persistence.clear()` to wipe all data |
| `GET_PERSISTENCE_METRICS` | Dashboard | Returns live metrics (flush count, latency, repair count) |
| `GET_EXPORT_SNAPSHOT` | Dashboard | Returns JSON export via `Persistence.exportSnapshot()` |
| `GET_DOMAIN_INVENTORY` | Dashboard | Returns specific domain's record |

### Tracker Detection in MV3

The extension uses a **hybrid tracking approach** because MV3 prohibits direct request interception via `chrome.webRequest`:

1. **Declarative Net Request (DNR)**: Browser-native rule engine blocks trackers with zero overhead
   - Rules defined in `extension/rules/dnr_rules.json`
   - No feedback to extension about blocked requests
   - Fastest path for high-volume tracker blocking

2. **Content Script Reporting**: Scripts report detected trackers to the background worker
   - `content.js` monitors actual fetch/XHR calls
   - `fingerprint-guard.js` detects canvas/WebGL/navigator API abuse
   - Both send messages to `runtime.onMessage` handler
   - Handler routes to `saveTrackerToInventory()` for persistence

3. **Message-Driven Inventory**: Tracker inventory built from content script signals
   - No lost data — all reports are persisted via batched writes
   - No race conditions — Persistence layer deduplicates + validates
   - Real-time badge updates reflect detected activity

### Badge Management

```javascript
updateBadge(tabId, count) {
  count = 0        → badge hidden
  count 1-10       → badge text in orange (#FF9500)
  count > 10       → badge text in red (#FF3B30)
}
```

The badge is updated in real-time as:
- Content scripts detect tracker activity
- Fingerprinting guards trigger
- Cookie inventory changes

---

## 💾 Storage Engine Deep Dive

The persistence engine (`extension/storage/persistence.js`) is the single source of truth for all inventory writes. It solves the classic problem of N-concurrent-writes by implementing an in-memory cache with debounced batch flushes.

### Data Flow

```
Content script or message handler
    ↓ Persistence.updateDomain(siteDomain, trackerDomain, category)
    ↓ (synchronous, zero I/O)
In-memory cache merge + dedup
    ↓ Mark domain as "dirty"
    ↓ Schedule flush (200 ms debounce)
Debounce timer fires
    ↓ _flush() builds validated payload
    ↓ ONE atomic chrome.storage.local.set(payload)
    ↓ ONE onChanged event → ONE dashboard re-render
    ↓ _recordFlushSuccess() updates metrics
```

### Schema & Validation

**Canonical v2 Record Format:**
```javascript
{
  _v:          2,                    // Record schema version
  domain:      "example.com",        // Primary key (also stored as inventory_example.com)
  trackers: {
    analytics:       ["ga.com", ...],
    advertising:     ["doubleclick.net", ...],
    fingerprinting:  ["..."],
  },
  lastSeen:    1715074800000,        // Timestamp of last tracker event (null if never seen)
  firstSeen:   1715074700000,        // Timestamp of first event (new in v2)
  hitCount:    42,                   // Total tracker events recorded (new in v2)
}
```

**Validation Checklist** (`_validateRecord()`):
- ✓ Type check: must be a non-array object
- ✓ `domain` field: string, fallback to key suffix
- ✓ `trackers` map: each category key normalized (`ads` → `advertising`)
- ✓ Category arrays: deduplicated, duplicates removed, capped at 500 entries
- ✓ Timestamps: valid numbers or null, estimated if missing
- ✓ `hitCount`: estimated from array lengths for v1 records
- ✓ Schema version: stamped with `_v: 2`

**Auto-Repair Guarantee**: Corrupted records are never discarded. They are repaired in-place and written back atomically. Repair count tracked in metrics.

### Version Migration

When `init()` runs, it checks the `pm_schema_version` key in storage:

```javascript
if (storedVersion !== SCHEMA_VERSION) {
  // Auto-migrate all records from v1 to v2
  // - Add firstSeen (estimate from lastSeen)
  // - Add hitCount (estimate from tracker array lengths)
  // - Normalize category keys
  // - Write back atomically with new version stamp
}
```

### Forced Flush on Worker Termination

MV3 service workers can be terminated at any time. To prevent data loss:

```javascript
chrome.runtime.onSuspend.addListener(() => {
  Persistence.flushNow();  // Bypass 200ms debounce, write immediately
});
```

Chrome provides ~1–2 seconds before hard-kill. Typical flush completes in <50 ms.

### Metrics Exposed to Dashboard

```javascript
GET_PERSISTENCE_METRICS response: {
  flushCount:       18,     // Successful batched writes
  failedFlushes:    0,      // Retried writes after failure
  avgWriteMs:       22,     // Average latency per flush
  maxQueueSize:     7,      // Peak dirty set observed
  repairedRecords:  2,      // Auto-repaired corrupted records
  currentDirtySize: 0,      // Records pending next flush
  cacheSize:        42,     // In-memory cached domains
  lastFlushAt:      1715..., // Timestamp of last success
  lastError:        null,   // Most recent error (if any)
}
```

---

## ⚙️ Manifest V3 Configuration

The `manifest.json` defines the extension's capabilities, permissions, and security constraints under Chrome's Manifest V3 framework.

### Permissions Justification

| Permission | Purpose | Justification |
|---|---|---|
| `tabs` | Read active tab info | Required to extract domain and URL for tracker detection |
| `cookies` | Read/delete cookies | Required for cookie inspection and cleaning feature |
| `storage` | chrome.storage.local | Required to persist tracker inventory and settings |
| `declarativeNetRequest` | Network rule engine | Required to define and enable blocking rules in DNR |
| `scripting` | Dynamic script injection | Reserved for future dynamic content script deployment |
| `webNavigation` | Track page transitions | Required to detect when user navigates to new page |
| `notifications` | Desktop notifications | Optional high-risk tracker alerts to user |
| `activeTab` | Current tab access | Required for popup to interact with current tab |

### host_permissions

```json
"host_permissions": ["<all_urls>"]
```

Required because the extension operates on all websites. This is the broadest host permission, justified by:
- Need to detect trackers on every website
- Need to read cookies on every domain
- User explicitly consents to privacy monitoring

### Background Service Worker

```json
"background": {
  "service_worker": "extension/background.js",
  "type": "module"
}
```

- `"type": "module"` enables ES module imports (required for `import Persistence`)
- Service worker runs in a separate context, isolated from web pages
- Browser terminates and restarts as needed (typically after 5 minutes idle)

### Content Scripts

```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["extension/scripts/fingerprint-guard.js", "extension/content.js"],
    "run_at": "document_start",
    "all_frames": true
  }
]
```

- `"run_at": "document_start"` ensures scripts run **before** page scripts (required to intercept APIs)
- `"all_frames": true` injects into all iframes (trackers hide in iframes)
- Injected into every page automatically by the browser

### Declarative Net Request (DNR)

```json
"declarative_net_request": {
  "rule_resources": [
    {
      "id": "tracker_rules",
      "enabled": true,
      "path": "extension/rules/dnr_rules.json"
    }
  ]
}
```

- Defines a rule resource that references `extension/rules/dnr_rules.json`
- Rules define which requests to block by domain/path patterns
- `"enabled": true` means rules are active on load
- Browser enforces rules with zero extension overhead

**DNR Rule Limits** (Chrome enforces):
- Max 30,000 rules per extension
- Max 100 dynamic rule updates per 1-minute window

### Web-Accessible Resources

```json
"web_accessible_resources": [
  {
    "resources": [
      "extension/dashboard/dashboard.html",
      "extension/dashboard/dashboard-react.html",
      "extension/assets/*",
      "extension/storage/*"
    ],
    "matches": ["<all_urls>"]
  }
]
```

Allows web pages to access listed resources. Required for:
- Dashboard to load as an extension page (not a content script)
- Icons and assets to be accessible to the popup
- Necessary because MV3 requires explicit resource allowlisting

### Content Security Policy (CSP)

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'self'"
}
```

Prevents inline scripts and external script CDNs:
- `script-src 'self'` — only scripts bundled with extension (no external CDN)
- `object-src 'self'` — prevents plugin injection attacks

---



```
personal-data-privacy-manager/
│
├── manifest.json                    # Chrome Manifest V3 — permissions, CSP, rules
├── package.json                     # Node dependencies and build scripts
├── requirements.txt                 # Python backend dependencies
├── webpack.config.js                # Webpack bundle config for React dashboard
│
├── extension/                       # Chrome extension source
│   ├── background.js                # Service worker — tracker detection, messaging
│   ├── content.js                   # Content script — DOM monitoring, tracker reporting
│   │
│   ├── storage/
│   │   └── persistence.js           # Persistence engine — in-memory cache, batched writes
│   │
│   ├── scripts/
│   │   ├── fingerprint-guard.js     # Fingerprinting API interception (canvas, WebGL, etc.)
│   │   ├── cookie-manager.js        # Cookie read, classify, clean
│   │   ├── data-inventory.js        # Inventory aggregation and subscription service
│   │   ├── gdpr-assistant.js        # Browser-side GDPR gateway (backend → local fallback)
│   │   └── tracker-detector.js      # Pattern matching logic for tracker classification
│   │
│   ├── popup/
│   │   ├── popup.html               # Extension popup shell
│   │   ├── popup.js                 # Live stats display, quick actions
│   │   └── popup.css                # Popup styling
│   │
│   ├── dashboard/
│   │   └── dashboard-react.html     # Dashboard page that loads the React bundle
│   │
│   ├── rules/
│   │   ├── dnr_rules.json           # DeclarativeNetRequest blocking rules
│   │   ├── tracker-rules.json       # Pattern-based tracker classification rules
│   │   └── cookie-categories.json   # Cookie name → category mappings
│   │
│   ├── assets/                      # Icons (16px, 32px, 48px, 128px)
│   └── styles/                      # Shared extension CSS
│
├── src/                             # React dashboard source
│   ├── index.js                     # Webpack entry point
│   ├── App.jsx                      # Root component
│   ├── components/
│   │   └── Dashboard.jsx            # Full dashboard — 7 tabs, charts, modals
│   ├── hooks/
│   │   └── usePrivacyData.js        # Central React hook — useReducer, hydration, actions
│   └── services/
│       └── chromeStorage.js         # Storage bridge — reads, normalizes, notifies
│
├── backend/                         # Python Flask NLP backend
│   ├── app.py                       # Application factory + CORS setup
│   ├── routes/
│   │   └── analyze.py               # /analyze-policy, /generate-gdpr-request, /health
│   └── utils/
│       ├── nlp_analyzer.py          # Regex + readability risk scoring engine
│       ├── gdpr_generator.py        # Article 15/17/20 letter template engine
│       └── text_utils.py            # Text preprocessing utilities
│
├── docs/
│   └── screenshots/                 # Dashboard screenshots for README
│
├── scripts/
│   └── build.js                     # Build orchestration script
│
└── tests/                           # Test suite (unit + integration)
```

---

## 🚀 Installation & Setup

### Prerequisites

- **Google Chrome** 109+ (Manifest V3 support)
- **Node.js** 18+ and npm
- **Python** 3.10+

---

### 1 · Clone the Repository

```bash
git clone https://github.com/your-org/personal-data-privacy-manager.git
cd personal-data-privacy-manager
```

---

### 2 · Backend (Flask NLP Engine)

The backend is **optional**. All GDPR generation and policy analysis degrade gracefully to local fallback templates when the backend is offline.

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate        # macOS / Linux
venv\Scripts\activate           # Windows

# Install dependencies
pip install -r requirements.txt

# Start the development server
cd backend
python app.py
```

The backend will start at `http://127.0.0.1:5000`. Verify with:

```bash
curl http://127.0.0.1:5000/health
# → {"status": "ok", "version": "1.0.0"}
```

For production, use Gunicorn:

```bash
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```

---

### 3 · Frontend (React Dashboard Bundle)

```bash
# Install Node dependencies
npm install

# Build the React dashboard bundle
npm run build
# Output: extension/dashboard/bundle.js
```

For development with watch mode:

```bash
npm run build:webpack -- --watch
```

---

### 4 · Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle, top-right corner)
3. Click **Load unpacked**
4. Select the root project directory (the folder containing `manifest.json`)
5. The **Privacy Manager** extension icon will appear in your toolbar

> **Note:** After any change to extension files, click the **↺ refresh** icon on the extension card at `chrome://extensions`.

---

## 📖 Usage Guide

### Scan Trackers on the Current Page

1. Click the **Privacy Manager** icon in the Chrome toolbar
2. The popup displays live counts: **Trackers Blocked**, **Cookies Detected**, **Privacy Score**
3. Click **Check Page** to trigger an immediate tracker scan of the active tab
4. Open the **full dashboard** by clicking **Open Dashboard** for detailed analytics

### Inspect & Clean Cookies

1. In the popup, click **Clean Cookies** to remove all non-essential cookies from the current tab
2. In the dashboard → **Cookies** tab, view per-category cookie breakdowns (essential, analytics, advertising, functional)
3. Essential cookies (session, auth, CSRF tokens) are always preserved

### Generate a GDPR Request

1. Open the dashboard → **GDPR** tab
2. Select the request type:
   - 📋 **Access Request** — Article 15: request all data held about you
   - 🗑️ **Deletion Request** — Article 17: right to be forgotten
   - 📦 **Export Request** — Article 20: data portability
3. Fill in the company name, contact email, and your name
4. Click **Generate** — the backend produces a legally structured letter
5. Click **Download Letter** to save as a text file

### Analyze a Privacy Policy

1. Open the dashboard → **GDPR** tab → **Policy Analyzer** section
2. Paste the raw text of any privacy policy
3. Click **Analyze Policy**
4. Results include:
   - **Risk Score** (0–100) and risk classification (Low / Medium / High / Critical)
   - **Red Flags** — specific clauses identified as high-risk
   - **Key Terms** — data sharing, retention, and consent language
   - **Recommendations** — plain-language action items

### Export Your Privacy Snapshot

1. Open the dashboard → click **⬇ Export Data** (top-right header)
2. A JSON file is downloaded containing:
   - Full domain tracker inventory
   - Global statistics (total trackers, category breakdown)
   - Schema version and export timestamp
   - Storage health metrics

---

## 📦 Example Export Snapshot

```json
{
  "_meta": {
    "exportedAt": "2025-05-07T08:14:00.000Z",
    "schemaVersion": 2,
    "generator": "Personal Data Privacy Manager"
  },
  "globalStats": {
    "totalDomains": 3,
    "totalTrackers": 31,
    "categoryBreakdown": {
      "analytics": 14,
      "advertising": 11,
      "social": 6
    }
  },
  "metrics": {
    "flushCount": 18,
    "failedFlushes": 0,
    "avgWriteMs": 22,
    "maxQueueSize": 7,
    "repairedRecords": 0,
    "currentDirtySize": 0,
    "cacheSize": 3,
    "lastFlushAt": 1715074980000,
    "lastError": null
  },
  "inventory": {
    "nytimes.com": {
      "_v": 2,
      "domain": "nytimes.com",
      "trackers": {
        "analytics":   ["googletagmanager.com", "chartbeat.com", "parsely.com"],
        "advertising": ["doubleclick.net", "adsystem.amazon.com", "criteo.com"]
      },
      "lastSeen": 1715074972000,
      "firstSeen": 1715074800000,
      "hitCount": 19
    },
    "reddit.com": {
      "_v": 2,
      "domain": "reddit.com",
      "trackers": {
        "analytics":   ["reddit-analytics.com"],
        "social":      ["platform.twitter.com", "connect.facebook.net"]
      },
      "lastSeen": 1715074960000,
      "firstSeen": 1715074900000,
      "hitCount": 12
    }
  }
}
```

---

## 🔐 Security & Privacy

This extension is built on a **local-first, zero-telemetry architecture**:

| Principle | Implementation |
|---|---|
| **No remote telemetry** | All tracker data stays in `chrome.storage.local`. Nothing is sent to external servers |
| **No third-party analytics** | The extension itself contains no analytics, tracking pixels, or external script dependencies |
| **Backend is optional and local** | The Flask NLP backend runs at `127.0.0.1:5000`. It is stateless, has no database, and is entirely under user control |
| **Minimal permissions** | Only permissions required for stated functionality are declared. No `history`, `bookmarks`, or `identity` access |
| **Strict CSP** | `script-src 'self'; object-src 'self'` — no inline scripts, no CDN-loaded code |
| **GDPR-by-design** | The tool exists to enforce GDPR rights. Its own data handling adheres to the same principles it helps users exercise |
| **No cloud sync** | Data never leaves the local machine unless the user explicitly triggers a JSON export |

---

## 🗺️ Roadmap

| Priority | Feature | Status |
|---|---|---|
| 🔴 High | Firefox / Manifest V2 compatibility layer | Planned |
| 🔴 High | ML-based tracker classification (on-device, ONNX) | Planned |
| 🟡 Medium | AES-256 encrypted storage option | Planned |
| 🟡 Medium | Optional cloud sync with E2E encryption | Planned |
| 🟡 Medium | Site-specific whitelist rules with regex support | Planned |
| 🟢 Low | Enterprise privacy reporting (CSV export + aggregated stats) | Planned |
| 🟢 Low | Safari Web Extension port | Planned |
| 🟢 Low | Browser extension store publication (Chrome Web Store) | Planned |

---

## 🤝 Contributing

Contributions are welcome. Please follow these steps:

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feat/your-feature-name`
3. **Commit** your changes: `git commit -m 'feat: add your feature'`
4. **Push** to the branch: `git push origin feat/your-feature-name`
5. **Open** a Pull Request against `main`

Please read `CONTRIBUTING.md` for code style guidelines and the PR review process.

---

## 👥 Contributors

<table>
  <tr>
    <td align="center">
      <a href="https://github.com/contributor1">
        <img src="https://github.com/contributor1.png" width="80px" alt="Contributor 1"/><br/>
        <sub><b>Alex Morgan</b></sub>
      </a><br/>
      <sub>Extension Architecture · Persistence Engine</sub>
    </td>
    <td align="center">
      <a href="https://github.com/contributor2">
        <img src="https://github.com/contributor2.png" width="80px" alt="Contributor 2"/><br/>
        <sub><b>Jordan Lee</b></sub>
      </a><br/>
      <sub>React Dashboard · GDPR Assistant</sub>
    </td>
    <td align="center">
      <a href="https://github.com/contributor3">
        <img src="https://github.com/contributor3.png" width="80px" alt="Contributor 3"/><br/>
        <sub><b>Sam Rivera</b></sub>
      </a><br/>
      <sub>Flask NLP Backend · Policy Analyzer</sub>
    </td>
  </tr>
</table>

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Privacy Manager Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
```

---

<div align="center">
  <sub>Built with ❤️ for digital privacy rights · <a href="https://gdpr.eu">GDPR</a> · <a href="https://developer.chrome.com/docs/extensions/mv3/">Chrome MV3</a></sub>
</div>