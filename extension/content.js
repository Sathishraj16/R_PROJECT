'use strict';

// ScamTracer AI — Content Script
// Runs on https://web.whatsapp.com/* at document_idle.
// Polls GET /alerts via background service worker every 2 seconds.
// Renders a floating alert panel for any alert that:
//   - has status === 'USER_DECISION_REQUIRED'
//   - has risk_score >= 60
// Each alert_id is shown at most once (deduplication via shownAlerts Set).
// Never sends messages to WhatsApp contacts. Never activates H.I.V.E. automatically.

const POLL_INTERVAL_MS = 2000;
const RISK_THRESHOLD   = 60;

const shownAlerts = new Set();

// Extension context validity flag — set to false if the service worker
// has been invalidated (e.g. after an extension reload), so the polling
// loop stops attempting dead message channels.
let _contextValid = true;

// ── safeSendMessage ───────────────────────────────────────────────────────────
// Wraps chrome.runtime.sendMessage with context-invalidation safety.
// Silently stops all future calls once the extension context is invalidated.
function safeSendMessage(msg, callback) {
  if (!_contextValid) return;
  try {
    chrome.runtime.sendMessage(msg, (response) => {
      if (chrome.runtime.lastError) {
        const errMsg = chrome.runtime.lastError.message || '';
        if (
          errMsg.includes('context invalidated') ||
          errMsg.includes('Extension context') ||
          errMsg.includes('no listeners')
        ) {
          _contextValid = false;
        }
        if (callback) callback(null);
        return;
      }
      if (callback) callback(response);
    });
  } catch (e) {
    if (e && e.message && (
      e.message.includes('context invalidated') ||
      e.message.includes('Extension context')
    )) {
      _contextValid = false;
    }
  }
}

// ── shouldShowAlert ──────────────────────────────────────────────────────────
// Pure function — no side effects. Returns true only when the alert meets
// both status AND threshold criteria AND hasn't been shown before.
function shouldShowAlert(alert) {
  if (!alert || typeof alert !== 'object') return false;
  if (alert.status !== 'USER_DECISION_REQUIRED')  return false;
  if (typeof alert.risk_score !== 'number')        return false;
  if (alert.risk_score < RISK_THRESHOLD)           return false;
  if (shownAlerts.has(alert.alert_id))             return false;
  return true;
}

// ── Panel renderer ───────────────────────────────────────────────────────────

function riskLevelClass(score) {
  if (score >= 80) return 'scamtracer-risk-critical';
  if (score >= 60) return 'scamtracer-risk-high';
  return 'scamtracer-risk-medium';
}

function renderPanel(alert) {
  const panelId = `scamtracer-panel-${alert.alert_id}`;
  if (document.getElementById(panelId)) return; // already rendered

  const panel = document.createElement('div');
  panel.id        = panelId;
  panel.className = `scamtracer-panel ${riskLevelClass(alert.risk_score)}`;
  panel.setAttribute('role', 'alertdialog');
  panel.setAttribute('aria-modal', 'false');

  // alert.message is the field name used by alertStore.js
  const msgRaw = alert.message || '';
  const msgDisplay = msgRaw.length > 200
    ? msgRaw.slice(0, 200) + '…'
    : msgRaw;

  // Detected indicators — array of strings from R
  const indicators = Array.isArray(alert.detected_indicators) && alert.detected_indicators.length > 0
    ? alert.detected_indicators
        .map(i => `<li class="scamtracer-indicator">${escapeHtml(String(i))}</li>`)
        .join('')
    : '<li class="scamtracer-indicator scamtracer-indicator-none">None detected</li>';

  const senderDisplay  = escapeHtml(String(alert.sender || 'unknown'));
  const predDisplay    = escapeHtml(String(alert.prediction || '—'));
  const scoreDisplay   = typeof alert.risk_score === 'number' ? alert.risk_score : '—';
  const levelDisplay   = escapeHtml(String(alert.risk_level  || 'HIGH'));

  panel.innerHTML = `
    <div class="scamtracer-header">
      <span class="scamtracer-logo">ScamTracer AI</span>
      <span class="scamtracer-badge">${levelDisplay} — ${scoreDisplay}/100</span>
    </div>
    <div class="scamtracer-body">
      <div class="scamtracer-meta">
        <span class="scamtracer-meta-item">Risk Level: <strong>${levelDisplay}</strong></span>
        <span class="scamtracer-meta-sep">|</span>
        <span class="scamtracer-meta-item">Risk Score: <strong>${scoreDisplay}/100</strong></span>
        <span class="scamtracer-meta-sep">|</span>
        <span class="scamtracer-meta-item">Prediction: <strong>${predDisplay}</strong></span>
      </div>
      <p class="scamtracer-sender">From: ${senderDisplay}</p>
      <p class="scamtracer-label">Suspicious message:</p>
      <blockquote class="scamtracer-quote">${escapeHtml(msgDisplay)}</blockquote>
      <p class="scamtracer-label">Detected indicators:</p>
      <ul class="scamtracer-indicators">${indicators}</ul>
    </div>
    <div class="scamtracer-actions">
      <button class="scamtracer-btn scamtracer-btn-block"  data-id="${escapeHtml(alert.alert_id)}" data-action="BLOCK_AND_PROTECT">
        Block &amp; Protect
      </button>
      <button class="scamtracer-btn scamtracer-btn-hive"   data-id="${escapeHtml(alert.alert_id)}" data-action="ACTIVATE_HIVE">
        Activate H.I.V.E.
      </button>
    </div>
    <p class="scamtracer-note">You must choose an action to dismiss this alert.</p>
  `;

  panel.querySelectorAll('.scamtracer-btn').forEach(btn => {
    btn.addEventListener('click', () => handleDecision(btn, panel, alert.alert_id));
  });

  document.body.appendChild(panel);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Decision handler ─────────────────────────────────────────────────────────

function handleDecision(btn, panel, alertId) {
  const action = btn.dataset.action;
  if (!action) return;

  // Disable both buttons immediately so the user can't double-submit
  panel.querySelectorAll('.scamtracer-btn').forEach(b => { b.disabled = true; });
  // Action-specific pending label so the user knows which action is running
  btn.textContent = action === 'BLOCK_AND_PROTECT' ? 'Protecting…' : 'Activating H.I.V.E.…';

  safeSendMessage(
    { type: 'POST_DECISION', alertId, action },
    (response) => {
      if (!response) {
        // null response: lastError set (context invalidated or service worker not ready)
        showPanelError(panel, 'Extension disconnected. Reload the page.');
        panel.querySelectorAll('.scamtracer-btn').forEach(b => { b.disabled = false; });
        btn.textContent = action === 'BLOCK_AND_PROTECT' ? 'Block & Protect' : 'Activate H.I.V.E.';
        return;
      }
      if (response.ok) {
        // Show a brief success confirmation, then remove the panel after 1.5 s
        const successLabel = action === 'BLOCK_AND_PROTECT'
          ? 'PROTECTION ACTIVATED'
          : 'H.I.V.E. ACTIVATED';
        showPanelSuccess(panel, successLabel);
        setTimeout(() => { panel.remove(); }, 1500);
      } else {
        const msg = response.error || 'Unknown error.';
        showPanelError(panel, msg);
        panel.querySelectorAll('.scamtracer-btn').forEach(b => { b.disabled = false; });
        btn.textContent = action === 'BLOCK_AND_PROTECT' ? 'Block & Protect' : 'Activate H.I.V.E.';
      }
    }
  );
}

function showPanelSuccess(panel, message) {
  // Hide action buttons and note; apply success styling to the panel
  const actionsEl = panel.querySelector('.scamtracer-actions');
  const noteEl    = panel.querySelector('.scamtracer-note');
  if (actionsEl) actionsEl.style.display = 'none';
  if (noteEl)    noteEl.style.display    = 'none';
  panel.classList.add('scamtracer-success');
  const badge = panel.querySelector('.scamtracer-badge');
  if (badge) badge.textContent = '✓ ' + message;
  let succ = panel.querySelector('.scamtracer-success-msg');
  if (!succ) {
    succ = document.createElement('p');
    succ.className = 'scamtracer-success-msg';
    panel.appendChild(succ);
  }
  succ.textContent = message;
}

function showPanelError(panel, message) {
  let err = panel.querySelector('.scamtracer-error');
  if (!err) {
    err = document.createElement('p');
    err.className = 'scamtracer-error';
    panel.appendChild(err);
  }
  err.textContent = message;
}

// ── Polling loop ─────────────────────────────────────────────────────────────

function pollAlerts() {
  if (!_contextValid) return;
  safeSendMessage({ type: 'FETCH_ALERTS' }, (response) => {
    if (!response || !response.ok) return;

    const alerts = response.alerts || [];
    alerts.forEach(alert => {
      if (shouldShowAlert(alert)) {
        shownAlerts.add(alert.alert_id);
        renderPanel(alert);
      }
    });
  });
}

setInterval(pollAlerts, POLL_INTERVAL_MS);
pollAlerts(); // run immediately on load
