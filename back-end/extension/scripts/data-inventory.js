window.DataInventory = (() => {
  const STORAGE_KEY = 'privacy_data_inventory';
  const subscribers = [];

  function notify(eventType, data) {
    subscribers.forEach(callback => {
      try {
        callback({ type: eventType, data });
      } catch (err) {
        console.error('Subscriber error:', err);
      }
    });
  }

  function normalizeData(entry) {
    return {
      id: entry.id || Math.random().toString(36).substr(2, 9),
      domain: entry.domain || 'unknown',
      category: entry.category || 'other',
      dataType: entry.dataType || '',
      value: entry.value || '',
      timestamp: entry.timestamp || Date.now(),
      source: entry.source || 'unknown',
      purpose: entry.purpose || ''
    };
  }

  function getPrivacyScore(data) {
    let score = 100;
    const categories = {
      'personal_identifiable': 30,
      'location': 25,
      'financial': 25,
      'health': 35,
      'behavioral': 15,
      'communication': 10,
      'device': 8,
      'other': 5
    };

    data.forEach(item => {
      score -= (categories[item.category] || 5);
    });

    return Math.max(score, 0);
  }

  function load() {
    try {
      const json = localStorage.getItem(STORAGE_KEY);
      return json ? JSON.parse(json) : [];
    } catch (err) {
      console.error('Error loading inventory:', err);
      return [];
    }
  }

  function save(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      notify('updated', data);
    } catch (err) {
      console.error('Error saving inventory:', err);
    }
  }

  return {
    getAll() {
      return load();
    },

    getForDomain(domain) {
      return load().filter(item => item.domain === domain);
    },

    add(entry) {
      const normalized = normalizeData(entry);
      const data = load();
      data.push(normalized);
      save(data);
      notify('added', normalized);
      return normalized;
    },

    remove(id) {
      const data = load().filter(item => item.id !== id);
      save(data);
      notify('removed', { id });
    },

    aggregate() {
      const data = load();
      const aggregated = {
        totalEntries: data.length,
        byCategory: {},
        byDomain: {},
        byPurpose: {},
        timeline: []
      };

      data.forEach(item => {
        aggregated.byCategory[item.category] = (aggregated.byCategory[item.category] || 0) + 1;
        aggregated.byDomain[item.domain] = (aggregated.byDomain[item.domain] || 0) + 1;
        aggregated.byPurpose[item.purpose] = (aggregated.byPurpose[item.purpose] || 0) + 1;
      });

      const sortedDomains = Object.entries(aggregated.byDomain)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([domain, count]) => ({ domain, count }));

      aggregated.topDomains = sortedDomains;
      aggregated.privacyScore = getPrivacyScore(data);

      const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
      aggregated.recentCount = data.filter(item => item.timestamp > dayAgo).length;

      return aggregated;
    },

    exportAsJSON() {
      const data = load();
      const aggregated = this.aggregate();
      return {
        exportDate: new Date().toISOString(),
        summary: aggregated,
        entries: data
      };
    },

    clear() {
      localStorage.removeItem(STORAGE_KEY);
      notify('cleared', null);
    },

    subscribe(callback) {
      subscribers.push(callback);
      return () => {
        subscribers.splice(subscribers.indexOf(callback), 1);
      };
    }
  };
})();
