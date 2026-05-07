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

## 📁 Folder Structure

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