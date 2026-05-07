window.GDPRAssistant = (() => {
  const API_BASE_URL = 'http://localhost:5000/api';
  const TIMEOUT = 10000;

  async function makeRequest(endpoint, method = 'GET', data = null) {
    try {
      const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
      };

      if (data) {
        options.body = JSON.stringify(data);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Request failed');
      }

      return await response.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    }
  }

  function generateLocalRequest(type, companyName, requesterName, requesterEmail) {
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const templates = {
      access: `Dear ${companyName},\n\nI am writing to exercise my right of access to my personal data in accordance with Article 15 of the GDPR.\n\nRequester: ${requesterName}\nEmail: ${requesterEmail}\nDate: ${today}\n\nRegards,\n${requesterName}`,
      deletion: `Dear ${companyName},\n\nI am writing to exercise my right to erasure (right to be forgotten) in accordance with Article 17 of the GDPR.\n\nRequester: ${requesterName}\nEmail: ${requesterEmail}\nDate: ${today}\n\nRegards,\n${requesterName}`,
      export: `Dear ${companyName},\n\nI am writing to exercise my right to data portability in accordance with Article 20 of the GDPR.\n\nRequester: ${requesterName}\nEmail: ${requesterEmail}\nDate: ${today}\n\nRegards,\n${requesterName}`
    };

    return templates[type] || '';
  }

  return {
    async generateAccessRequest(companyName, requesterName, requesterEmail) {
      try {
        const result = await makeRequest('/generate-gdpr-request', 'POST', {
          request_type: 'access',
          company_name: companyName,
          requester_name: requesterName,
          requester_email: requesterEmail
        });
        return result.letter;
      } catch (err) {
        console.warn('API unavailable, using local fallback:', err.message);
        return generateLocalRequest('access', companyName, requesterName, requesterEmail);
      }
    },

    async generateDeletionRequest(companyName, requesterName, requesterEmail) {
      try {
        const result = await makeRequest('/generate-gdpr-request', 'POST', {
          request_type: 'deletion',
          company_name: companyName,
          requester_name: requesterName,
          requester_email: requesterEmail
        });
        return result.letter;
      } catch (err) {
        console.warn('API unavailable, using local fallback:', err.message);
        return generateLocalRequest('deletion', companyName, requesterName, requesterEmail);
      }
    },

    async generateExportRequest(companyName, requesterName, requesterEmail) {
      try {
        const result = await makeRequest('/generate-gdpr-request', 'POST', {
          request_type: 'export',
          company_name: companyName,
          requester_name: requesterName,
          requester_email: requesterEmail
        });
        return result.letter;
      } catch (err) {
        console.warn('API unavailable, using local fallback:', err.message);
        return generateLocalRequest('export', companyName, requesterName, requesterEmail);
      }
    },

    async generateRequest(type, companyName, requesterName, requesterEmail, reason = '') {
      try {
        const result = await makeRequest('/generate-gdpr-request', 'POST', {
          request_type: type,
          company_name: companyName,
          requester_name: requesterName,
          requester_email: requesterEmail,
          reason: reason
        });
        return result.letter;
      } catch (err) {
        console.warn('API unavailable, using local fallback:', err.message);
        return generateLocalRequest(type, companyName, requesterName, requesterEmail);
      }
    },

    async analyzePolicy(policyText) {
      try {
        const result = await makeRequest('/analyze-policy', 'POST', {
          policy_text: policyText
        });
        return result.analysis;
      } catch (err) {
        console.error('Policy analysis failed:', err.message);
        return {
          status: 'error',
          message: err.message,
          risk_score: null,
          categories_found: [],
          total_words: policyText.split(/\s+/).length
        };
      }
    },

    downloadText(content, filename = 'privacy-request.txt') {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    downloadJSON(data, filename = 'privacy-data.json') {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  };
})();
