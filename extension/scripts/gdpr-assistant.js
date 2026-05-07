/**
 * gdpr-assistant.js
 * Personal Data Privacy Manager
 *
 * Central GDPR assistant module.
 * ALL frontend GDPR calls go through this module — no direct API calls
 * from React components or other scripts.
 *
 * Exposes global: window.GDPRAssistant
 *
 * Public API:
 *   generateRequest(type, params)   → Promise<{ subject, template, type }>
 *   analyzePolicy(text)             → Promise<{ risk_score, classification, ... }>
 *   downloadText(content, filename) → void (triggers file download)
 *   getBackendUrl()                 → Promise<string>
 */

(function () {
  'use strict';

  // ── Config ──────────────────────────────────────────────────────────────────
  const DEFAULT_BACKEND = 'http://127.0.0.1:5000';
  const FETCH_TIMEOUT_MS = 6000;

  // ── Backend URL (reads chrome.storage settings) ──────────────────────────

  async function getBackendUrl() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        resolve(DEFAULT_BACKEND);
        return;
      }
      chrome.storage.local.get(['settings'], (result) => {
        const url = result?.settings?.backendUrl;
        resolve((url && url.trim()) ? url.trim() : DEFAULT_BACKEND);
      });
    });
  }

  // ── Fetch helper with timeout ────────────────────────────────────────────

  async function _fetchWithTimeout(url, options) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  }

  // ── generateRequest ──────────────────────────────────────────────────────
  /**
   * Generate a GDPR request letter via backend, falling back to local template.
   *
   * @param {'access'|'deletion'|'export'} type
   * @param {{ company, email, name, additional_info }} params
   * @returns {Promise<{ subject, template, type, source }>}
   */
  async function generateRequest(type, params) {
    const { company = '', email = '', name = 'The Data Subject', additional_info = '' } = params || {};

    // Try backend first
    try {
      const backendUrl = await getBackendUrl();
      const data = await _fetchWithTimeout(`${backendUrl}/generate-gdpr-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, company, email, name, additional_info }),
      });
      return { ...data, source: 'backend' };
    } catch (err) {
      console.warn('[GDPRAssistant] Backend unavailable, using local template:', err.message);
    }

    // Local fallback
    return _localTemplate(type, { company, email, name, additional_info });
  }

  // ── analyzePolicy ────────────────────────────────────────────────────────
  /**
   * Analyze a privacy policy text via backend.
   * Returns a structured risk assessment.
   *
   * @param {string} text
   * @returns {Promise<{ risk_score, classification, red_flags, key_terms, summary, recommendations }>}
   */
  async function analyzePolicy(text) {
    if (!text || !text.trim()) {
      throw new Error('Policy text cannot be empty.');
    }

    const backendUrl = await getBackendUrl();
    return _fetchWithTimeout(`${backendUrl}/analyze-policy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    });
  }

  // ── downloadText ─────────────────────────────────────────────────────────
  /**
   * Trigger a plain-text file download in the browser.
   *
   * @param {string} content
   * @param {string} filename
   */
  function downloadText(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename || 'gdpr-request.txt';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  /**
   * Trigger a JSON file download.
   */
  function downloadJSON(content, filename) {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename || 'privacy-export.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  // ── Local template fallback ──────────────────────────────────────────────

  function _localTemplate(type, { company, email, name, additional_info }) {
    const today  = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const extra  = additional_info ? `\n\nAdditional context: ${additional_info}` : '';
    const titles = { access: 'Subject Access Request', deletion: 'Right to Erasure Request', export: 'Data Portability Request' };
    const refs   = {
      access:   'GDPR Article 15 – Right of Access',
      deletion: 'GDPR Article 17 – Right to Erasure',
      export:   'GDPR Article 20 – Right to Data Portability',
    };
    const bodies = {
      access: `I am writing to exercise my right of access under Article 15 GDPR.\n\nI request a copy of all personal data you hold about me, including the purposes of processing, categories of data, recipients, retention periods, and any automated decision-making.${extra}\n\nPlease respond within one calendar month as required by Article 12(3) GDPR.`,
      deletion: `I am writing to exercise my right to erasure under Article 17 GDPR.\n\nI request the permanent deletion of all personal data you hold about me, including account information, behavioural data, device identifiers, and any data shared with third parties. Please notify any third parties accordingly (Article 19 GDPR).${extra}\n\nPlease confirm erasure within one calendar month.`,
      export: `I am writing to exercise my right to data portability under Article 20 GDPR.\n\nI request all personal data I have provided to you in a structured, commonly used, machine-readable format (e.g. JSON or CSV).${extra}\n\nPlease fulfil this request within one calendar month.`,
    };

    const subject  = `${titles[type] || 'GDPR Request'} – ${refs[type] || ''} – ${email}`;
    const template = `Date: ${today}\n\nTo: Data Protection Officer\nOrganisation: ${company}\n\nSubject: ${subject}\n\nDear Data Protection Officer,\n\n${bodies[type]}\n\nMy contact details:\n  Name:  ${name}\n  Email: ${email}\n\nYours faithfully,\n\n${name}\n${email}\n\n---\nGenerated by Privacy Manager (offline mode)\nReference: ${refs[type]}`;

    return {
      type,
      subject,
      template,
      generated_at: new Date().toISOString(),
      source: 'local',
    };
  }

  // ── Expose global ────────────────────────────────────────────────────────

  window.GDPRAssistant = {
    generateRequest,
    analyzePolicy,
    downloadText,
    downloadJSON,
    getBackendUrl,
  };

  console.log('[PrivacyManager] GDPR Assistant loaded.');
})();
