// Real data will be fetched from background service worker
let stats = {
  trackers: 0,
  cookies: 0,
  fingerprintAlerts: 0,
  privacyScore: 50
};

let trackerData = [];
let cookieData = [];
let timelineData = [];

const tabButtons = document.querySelectorAll('.tab-button');
const panels = document.querySelectorAll('.dashboard-panel');
const trackerLegend = document.getElementById('tracker-legend');
const trackerPie = document.getElementById('tracker-pie');
const cookieBars = document.getElementById('cookie-bars');
const trackerList = document.getElementById('tracker-list');
const cookieList = document.getElementById('cookie-list');
const timelineChart = document.getElementById('timeline-chart');
const runScanButton = document.getElementById('run-scan-button');
const clearHistoryButton = document.getElementById('clear-history-button');

// Fetch ALL accumulated tracker data (persistent storage)
async function fetchRealData() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_ALL_INVENTORY' }, (response) => {
      if (response && response.success) {
        // Use categoryCount from persistent inventory
        stats.trackers = response.totalTrackers || 0;
        stats.fingerprintAlerts = response.categoryCount?.fingerprinting || 0;
        stats.privacyScore = Math.max(50, 100 - (stats.trackers * 2) - (stats.fingerprintAlerts * 3));
        
        if (response.categoryCount && Object.keys(response.categoryCount).length > 0) {
          const grouped = response.categoryCount;
          trackerData = Object.entries(grouped).map(([name, value], i) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            value,
            color: ['#6366f1', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'][i % 5]
          }));
        }
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// Fetch real cookies from the current tab
async function fetchRealCookies() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        try {
          const url = new URL(tabs[0].url);
          const domain = url.hostname;
          
          chrome.cookies.getAll({ domain }, (cookies) => {
            stats.cookies = cookies.length;
            
            if (cookies.length > 0) {
              const grouped = { essential: 0, functional: 0, analytics: 0, advertising: 0 };
              
              cookies.forEach(cookie => {
                const name = cookie.name.toLowerCase();
                if (name.includes('session') || name.includes('csrf') || name.includes('auth')) {
                  grouped.essential++;
                } else if (name.includes('_ga') || name.includes('analytics') || name.includes('track')) {
                  grouped.analytics++;
                } else if (name.includes('ad_') || name.includes('_fbp') || name.includes('doubleclick')) {
                  grouped.advertising++;
                } else if (name.includes('lang') || name.includes('theme') || name.includes('pref')) {
                  grouped.functional++;
                }
              });
              
              cookieData = [
                { name: 'Essential', value: grouped.essential, color: '#22c55e' },
                { name: 'Functional', value: grouped.functional, color: '#3b82f6' },
                { name: 'Analytics', value: grouped.analytics, color: '#6366f1' },
                { name: 'Advertising', value: grouped.advertising, color: '#ef4444' }
              ].filter(item => item.value > 0);
            }
            
            resolve(true);
          });
        } catch (e) {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    });
  });
}

function generateTimeline() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  timelineData = days.map(day => ({ day, trackers: Math.floor(Math.random() * 30) + 5 }));
}

function setActiveTab(tabName) {
  tabButtons.forEach(button => button.classList.toggle('active', button.dataset.tab === tabName));
  panels.forEach(panel => panel.classList.toggle('hidden', panel.id !== `panel-${tabName}`));
}

function updateStats() {
  document.getElementById('stat-trackers').textContent = stats.trackers;
  document.getElementById('stat-cookies').textContent = stats.cookies;
  document.getElementById('stat-fingerprint').textContent = stats.fingerprintAlerts;
  document.getElementById('stat-score').textContent = `${Math.round(stats.privacyScore)}/100`;
}

function renderTrackerDistribution() {
  trackerLegend.innerHTML = '';
  trackerPie.innerHTML = '';

  if (trackerData.length === 0) {
    trackerPie.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">No trackers detected yet</p>';
    return;
  }

  const total = trackerData.reduce((sum, item) => sum + item.value, 0);
  trackerData.forEach(item => {
    const legendItem = document.createElement('li');
    legendItem.className = 'legend-item';
    legendItem.innerHTML = `<div><span class="legend-badge" style="background:${item.color};"></span><strong>${item.name}</strong></div><span>${item.value}</span>`;
    trackerLegend.appendChild(legendItem);

    const slice = document.createElement('div');
    slice.className = 'pie-slice';
    slice.style.background = item.color;
    slice.style.width = `${(item.value / total) * 100}%`;
    slice.textContent = `${Math.round((item.value / total) * 100)}%`;
    trackerPie.appendChild(slice);
  });
}

function renderCookieBars() {
  cookieBars.innerHTML = '';
  if (cookieData.length === 0) {
    cookieBars.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 20px;">No cookies detected</p>';
    return;
  }

  const maxValue = Math.max(...cookieData.map(item => item.value), 1);
  cookieData.forEach(item => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `<span>${item.name}</span><div class="bar-base"><div class="bar-fill" style="width:${(item.value / maxValue) * 100}%; background:${item.color};"></div></div><span>${item.value}</span>`;
    cookieBars.appendChild(row);
  });
}

function renderTrackerList() {
  trackerList.innerHTML = '';
  if (trackerData.length === 0) {
    trackerList.innerHTML = '<li class="item-card" style="text-align: center; color: #94a3b8;">No trackers detected</li>';
    return;
  }
  trackerData.forEach(item => {
    const li = document.createElement('li');
    li.className = 'item-card';
    li.innerHTML = `<span>${item.name} trackers</span><span class="status-badge">${item.value}</span>`;
    trackerList.appendChild(li);
  });
}

function renderCookieList() {
  cookieList.innerHTML = '';
  if (cookieData.length === 0) {
    cookieList.innerHTML = '<li class="item-card" style="text-align: center; color: #94a3b8;">No cookies detected</li>';
    return;
  }
  cookieData.forEach(item => {
    const li = document.createElement('li');
    li.className = 'item-card';
    li.innerHTML = `<span>${item.name}</span><span class="status-badge">${item.value}</span>`;
    cookieList.appendChild(li);
  });
}

function renderTimeline() {
  timelineChart.innerHTML = '';
  const maxTrackers = Math.max(...timelineData.map(item => item.trackers), 1);
  timelineData.forEach(item => {
    const row = document.createElement('div');
    row.className = 'timeline-point';
    row.innerHTML = `<strong>${item.day}</strong><div class="timeline-bar"><div class="timeline-fill" style="width:${(item.trackers / maxTrackers) * 100}%;"></div></div><span>${item.trackers}</span>`;
    timelineChart.appendChild(row);
  });
}

async function initDashboard() {
  await fetchRealData();
  await fetchRealCookies();
  generateTimeline();
  setActiveTab('overview');
  updateStats();
  renderTrackerDistribution();
  renderCookieBars();
  renderTrackerList();
  renderCookieList();
  renderTimeline();
}

tabButtons.forEach(button => button.addEventListener('click', () => setActiveTab(button.dataset.tab)));

runScanButton.addEventListener('click', async () => {
  runScanButton.textContent = 'Scanning...';
  runScanButton.disabled = true;
  await fetchRealData();
  await fetchRealCookies();
  updateStats();
  renderTrackerDistribution();
  renderCookieBars();
  renderTrackerList();
  renderCookieList();
  runScanButton.textContent = 'Run Scan';
  runScanButton.disabled = false;
});

clearHistoryButton.addEventListener('click', async () => {
  if (confirm('Are you sure you want to clear all stored tracker data? This cannot be undone.')) {
    clearHistoryButton.textContent = 'Clearing...';
    clearHistoryButton.disabled = true;
    
    // Get all storage keys and delete inventory items
    chrome.storage.local.get(null, (allData) => {
      const keysToDelete = Object.keys(allData).filter(key => key.startsWith('inventory_'));
      chrome.storage.local.remove(keysToDelete, () => {
        stats = { trackers: 0, cookies: 0, fingerprintAlerts: 0, privacyScore: 50 };
        trackerData = [];
        updateStats();
        renderTrackerDistribution();
        renderCookieBars();
        renderTrackerList();
        renderCookieList();
        clearHistoryButton.textContent = 'Clear History';
        clearHistoryButton.disabled = false;
      });
    });
  }
});

setInterval(async () => {
  await fetchRealData();
  await fetchRealCookies();
  updateStats();
  if (!document.getElementById('panel-overview').classList.contains('hidden')) {
    renderTrackerDistribution();
    renderCookieBars();
  }
}, 5000);

initDashboard();
