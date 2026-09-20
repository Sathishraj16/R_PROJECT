// ScamTracer AI — Alert Store (Phase 11)
//
// In-memory store for suspicious WhatsApp message alerts.
// Each alert is linked to a ScamTracer session in sessionStore.js.
//
// WARNING: Demo-only. Not persistent — all alerts are lost on Node.js restart.
//
// Deduplication: WhatsApp message IDs are tracked to prevent creating duplicate
// alerts if the same message event fires more than once (can happen with
// whatsapp-web.js in some reconnection scenarios).
//
// Alert lifecycle:
//   created          → USER_DECISION_REQUIRED
//   user: BLOCK_AND_PROTECT → BLOCKED
//   user: ACTIVATE_HIVE     → HIVE_ACTIVE
//                             (session transitions happen in sessionStore.js)

const crypto = require('crypto');

const ALERT_STATES = Object.freeze({
  USER_DECISION_REQUIRED: 'USER_DECISION_REQUIRED',
  BLOCKED:                'BLOCKED',
  HIVE_ACTIVE:            'HIVE_ACTIVE',
  DISMISSED:              'DISMISSED'
});

// Main storage
const _alerts   = new Map();   // alert_id  → alert object
const _seenMsgIds = new Set(); // whatsapp message IDs already processed

// Running totals (persists until server restart)
let _totalAnalysed   = 0;
let _totalSuspicious = 0;

/**
 * Record that a message was analysed (regardless of risk level).
 * Called for every incoming WhatsApp message, even those below threshold.
 */
function recordAnalysed() {
  _totalAnalysed++;
}

/**
 * Create a new suspicious-message alert.
 *
 * @param {object} opts
 *   whatsappMsgId {string|null} — WhatsApp message ID for deduplication
 *   sender        {string}      — WhatsApp sender identifier
 *   messageText   {string}      — Original message body
 *   riskResult    {object}      — Full result from analyze_risk() via R
 *   sessionId     {string}      — ID of the linked ScamTracer session
 *
 * @returns {object|null} The created alert, or null if it was a duplicate.
 */
function createAlert({ whatsappMsgId, sender, messageText, riskResult, sessionId }) {
  // Last-resort guard: reject malformed R results even if the caller skipped validateRiskResult.
  // R serializes NULL as {} — typeof {} !== 'number' catches this.
  if (!riskResult || typeof riskResult.risk_score !== 'number' || !isFinite(riskResult.risk_score)) {
    console.error('[alertStore] createAlert() rejected: risk_score is not a finite number',
                  JSON.stringify(riskResult && riskResult.risk_score));
    return null;
  }
  if (typeof messageText !== 'string' || !messageText.trim()) {
    console.error('[alertStore] createAlert() rejected: messageText is empty or not a string');
    return null;
  }

  // Deduplication by WhatsApp message ID
  if (whatsappMsgId && _seenMsgIds.has(whatsappMsgId)) {
    return null;
  }
  if (whatsappMsgId) _seenMsgIds.add(whatsappMsgId);

  _totalSuspicious++;

  const alertId = crypto.randomUUID();
  const alert = {
    alert_id:            alertId,
    whatsapp_msg_id:     whatsappMsgId  || null,
    sender:              sender         || 'unknown',
    message:             messageText,
    risk_score:          riskResult.risk_score,
    risk_level:          riskResult.risk_level,
    prediction:          riskResult.prediction,
    model_probability:   riskResult.model_probability,
    ml_score:            riskResult.ml_score,
    indicator_score:     riskResult.indicator_score,
    detected_indicators: riskResult.detected_indicators || [],
    explanations:        riskResult.explanations        || [],
    session_id:          sessionId,
    status:              ALERT_STATES.USER_DECISION_REQUIRED,
    created_at:          new Date().toISOString(),
    decided_at:          null,
    decision:            null
  };
  _alerts.set(alertId, alert);
  return alert;
}

/**
 * Retrieve a single alert by ID.
 * @returns {object|null}
 */
function getAlert(alertId) {
  return _alerts.get(alertId) || null;
}

/**
 * Return all alerts, most recent first.
 */
function getAllAlerts() {
  return [..._alerts.values()].sort(
    (a, b) => b.created_at.localeCompare(a.created_at)
  );
}

/**
 * Return alerts still awaiting a user decision.
 */
function getPendingAlerts() {
  return getAllAlerts().filter(a => a.status === ALERT_STATES.USER_DECISION_REQUIRED);
}

/**
 * Update an alert's status after a user decision.
 *
 * @param {string} alertId
 * @param {string} status   — BLOCKED or HIVE_ACTIVE
 * @param {string} decision — 'BLOCK_AND_PROTECT' or 'ACTIVATE_HIVE'
 * @returns {object|null} Updated alert, or null if not found.
 */
function updateAlert(alertId, { status, decision }) {
  const alert = _alerts.get(alertId);
  if (!alert) return null;
  alert.status     = status;
  alert.decision   = decision;
  alert.decided_at = new Date().toISOString();
  return alert;
}

/**
 * Statistics for the /whatsapp/status endpoint.
 */
function getStats() {
  return {
    total_analysed:     _totalAnalysed,
    total_suspicious:   _totalSuspicious,
    pending_decisions:  getPendingAlerts().length
  };
}

/**
 * Reset the in-memory alert store — clears all alerts, deduplication IDs,
 * and running totals.
 *
 * DEVELOPMENT / TESTING ONLY.
 * This is never called from production code paths; it is only exposed via
 * POST /test/reset-alerts (TEST_MODE=true) and the test suite.
 */
function resetAlerts() {
  _alerts.clear();
  _seenMsgIds.clear();
  _totalAnalysed   = 0;
  _totalSuspicious = 0;
}

module.exports = {
  createAlert,
  getAlert,
  getAllAlerts,
  getPendingAlerts,
  updateAlert,
  recordAnalysed,
  resetAlerts,
  getStats,
  ALERT_STATES
};
