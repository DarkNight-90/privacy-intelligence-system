# Personal Data Privacy Manager - React Dashboard

## Overview

This Chrome extension provides comprehensive privacy protection with a React-based dashboard that displays real-time tracker and cookie data.

## Features

- **Real-time Tracker Detection**: Monitors and blocks trackers across all websites
- **Cookie Classification**: Automatically categorizes cookies (essential, analytics, advertising)
- **Fingerprinting Protection**: Detects and alerts on fingerprinting attempts
- **Persistent Data Storage**: Stores tracker data across browser sessions
- **Interactive Dashboard**: React-based UI with Recharts visualizations

## Architecture

### Data Flow
1. **Background Service Worker** (`extension/background.js`)
   - Detects trackers using pattern matching
   - Saves data to `chrome.storage.local` with keys like `inventory_[domain]`
   - Handles fingerprinting detection from content scripts

2. **Chrome Storage Service** (`src/services/chromeStorage.js`)
   - Reads from `chrome.storage.local`
   - Listens to `chrome.storage.onChanged` events
   - Normalizes data into dashboard format

3. **React Hook** (`src/hooks/usePrivacyData.js`)
   - Provides real-time data updates to components
   - Automatically syncs when storage changes

4. **Dashboard Component** (`src/components/Dashboard.jsx`)
   - Displays charts and statistics
   - Uses Recharts for visualizations

## Installation & Setup

### Prerequisites
- Node.js 16+
- npm or yarn

### Install Dependencies
```bash
npm install
```

### Build the React Dashboard
```bash
npm run build
```

### Load Extension in Chrome
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

### Access Dashboard
- Click extension icon → "Dashboard" button
- Or navigate to `chrome-extension://[extension-id]/dashboard/dashboard-react.html`

## Data Storage Structure

### Chrome Storage Keys
- `inventory_[domain]`: Tracker data per website
  ```json
  {
    "domain": "google.com",
    "trackers": {
      "analytics": ["google-analytics.com"],
      "ads": ["doubleclick.net"]
    },
    "lastSeen": 1234567890
  }
  ```
- `whitelist`: User-allowed domains
- `settings`: Extension configuration

### Normalized Dashboard Data
```javascript
{
  trackers: 15,           // Total trackers across all sites
  cookies: 8,            // Cookies on current tab
  fingerprint: 3,        // Fingerprinting attempts
  privacyScore: 72,      // Calculated score
  trackerBreakdown: {
    analytics: 8,
    ads: 5,
    social: 2
  },
  cookieBreakdown: {
    essential: 3,
    analytics: 3,
    ads: 2
  },
  timeline: [
    { day: 'Mon', trackers: 12 },
    { day: 'Tue', trackers: 19 }
  ]
}
```

## Development

### Start Development Build
```bash
npm run dev
```

### File Structure
```
src/
├── components/
│   └── Dashboard.jsx      # Main dashboard component
├── hooks/
│   └── usePrivacyData.js  # Data synchronization hook
├── services/
│   └── chromeStorage.js   # Chrome storage bridge
├── App.jsx                # Root component
└── index.js               # React entry point

extension/
├── background.js          # Service worker
├── content.js             # Content script
├── dashboard/
│   ├── dashboard-react.html  # React dashboard HTML
│   ├── dist/              # Built React bundle
│   └── dashboard.js       # Original vanilla JS (kept for reference)
└── popup/
    └── popup.html         # Extension popup
```

## API Reference

### Chrome Storage Service
```javascript
import chromeStorageService from './services/chromeStorage.js';

// Initialize and get current data
const data = await chromeStorageService.initialize();

// Subscribe to changes
const unsubscribe = chromeStorageService.subscribe((newData) => {
  console.log('Data updated:', newData);
});
```

### Privacy Data Hook
```javascript
import usePrivacyData from './hooks/usePrivacyData.js';

const MyComponent = () => {
  const { stats, trackerData, cookieData, timeline } = usePrivacyData();

  return (
    <div>
      <h2>Trackers: {stats.trackers}</h2>
      {/* Render charts with trackerData, cookieData, timeline */}
    </div>
  );
};
```

## Testing

### Manual Testing Steps
1. Load extension in Chrome
2. Visit websites with trackers (news sites, shopping sites)
3. Open dashboard - should show real data
4. Data should persist after page refresh
5. Clear history should reset all data

### Data Validation
- Check `chrome://extensions` → Background page console for logs
- Use Chrome DevTools → Application → Storage → Local Storage
- Verify `inventory_[domain]` keys are created/updated

## Troubleshooting

### Common Issues

**Dashboard shows no data**
- Check console for errors
- Verify extension permissions in manifest.json
- Ensure background service worker is running

**Data not updating**
- Check if `chrome.storage.onChanged` is firing
- Verify background.js is saving data correctly
- Check for Chrome extension API errors

**Build fails**
- Ensure all dependencies are installed: `npm install`
- Check Node.js version (16+ required)
- Clear node_modules and reinstall if needed

### Debug Commands
```javascript
// Check current storage
chrome.storage.local.get(null, (data) => console.log(data));

// Clear all data
chrome.storage.local.clear();

// Manual data fetch
chrome.runtime.sendMessage({ type: 'GET_ALL_INVENTORY' });
```

## Contributing

1. Follow React best practices
2. Use functional components with hooks
3. Maintain TypeScript-like prop validation
4. Test in Chrome extension environment
5. Update documentation for API changes

## License

MIT License - see LICENSE file for details.