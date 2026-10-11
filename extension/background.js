// ScamTracer AI — Background Service Worker (Manifest V3)
//
// Handles all network communication with the Node.js backend on behalf of
// content.js and popup.js. Content scripts cannot reliably reach http://
// origins from an https:// page without routing through the service worker.
//
// Message types received:
//   FETCH_ALERTS        → GET  /alerts
//   FETCH_STATUS        → GET  /whatsapp/status
//   POST_DECISION       → POST /alerts/:alertId/decision  { action }
//   FETCH_INVESTIGATION → GET  /hive/intelligence/:session_id
//
// All responses are returned as { ok: true, ... } or { ok: false, error: "..." }.

'use strict';

const NODE_URL = 'http://localhost:3000';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'FETCH_ALERTS') {
    fetch(`${NODE_URL}/alerts`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => sendResponse({ ok: true, alerts: data.alerts || [] }))
      .catch(err => sendResponse({ ok: false, error: err.message, alerts: [] }));
    return true; // keep message channel open for async response
  }

  if (message.type === 'FETCH_STATUS') {
    fetch(`${NODE_URL}/whatsapp/status`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => sendResponse({ ok: true, data }))
      .catch(err => sendResponse({ ok: false, error: err.message, data: null }));
    return true;
  }

  if (message.type === 'POST_DECISION') {
    const { alertId, action } = message;
    if (!alertId || !action) {
      sendResponse({ ok: false, error: 'alertId and action are required.' });
      return false;
    }
    fetch(`${NODE_URL}/alerts/${encodeURIComponent(alertId)}/decision`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action })
    })
      .then(r => r.json().then(data => ({ status: r.status, data })))
      .then(({ status, data }) => {
        if (status !== 200) {
          sendResponse({ ok: false, error: data.message || `HTTP ${status}`, data });
        } else {
          sendResponse({ ok: true, data });
        }
      })
      .catch(err => sendResponse({ ok: false, error: err.message, data: null }));
    return true;
  }

  if (message.type === 'FETCH_INVESTIGATION') {
    const { sessionId } = message;
    if (!sessionId) {
      sendResponse({ ok: false, error: 'sessionId is required.', intelligence: null });
      return false;
    }
    fetch(`${NODE_URL}/hive/intelligence/${encodeURIComponent(sessionId)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => sendResponse({
        ok:               true,
        session_id:       data.session_id                  || null,
        intelligence:     data.intelligence                || null,
        state:            data.state                       || null,
        stop_reason:      data.stop_reason                 || null,
        interaction_count: data.interaction_count != null   ? data.interaction_count : null
      }))
      .catch(err => sendResponse({ ok: false, error: err.message, intelligence: null }));
    return true;
  }

});
