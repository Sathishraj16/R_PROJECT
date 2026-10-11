'use strict';

function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function riskBadgeClass(level) {
  switch ((level || '').toUpperCase()) {
    case 'HIGH':    return 'badge-high';
    case 'MEDIUM':  return 'badge-medium';
    case 'LOW':     return 'badge-low';
    default:        return 'badge-none';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Pure HTML builders — no DOM or chrome APIs (testable in Node.js) ──────────

/**
 * Render ongoing intelligence for an active H.I.V.E. session.
 */
function buildOngoingIntelHtml(intelResp) {
  const summary = (intelResp.intelligence && intelResp.intelligence.summary) || {};
  const parts = [];

  const entityTypes = summary.entity_types || [];
  if (entityTypes.length > 0)
    parts.push(`<div class="intel-row"><span class="intel-key">Entities found</span><span class="intel-val">${entityTypes.join(', ')}</span></div>`);

  const behavTypes = summary.behaviour_types || [];
  if (behavTypes.length > 0)
    parts.push(`<div class="intel-row"><span class="intel-key">Behaviours</span><span class="intel-val">${behavTypes.join(', ')}</span></div>`);

  const statements = summary.statements || [];
  if (statements.length > 0) {
    const items = statements.slice(0, 3).map(s => `<div class="intel-item">${escapeHtml(s)}</div>`).join('');
    parts.push(`<div class="intel-list">${items}</div>`);
  }

  if (intelResp.stop_reason)
    parts.push(`<div class="intel-stop">Stopped: ${escapeHtml(intelResp.stop_reason)}</div>`);

  parts.push('<div class="intel-unverified">All information is unverified — claims from suspect</div>');
  return parts.join('');
}

/**
 * Render the final investigation summary for a HIVE_ENDED session.
 * alertData — the alert object from GET /alerts (has message, risk_score, risk_level).
 * intelResp  — response from GET /hive/intelligence/:id.
 */
function buildFinalSummaryHtml(alertData, intelResp) {
  const summary = (intelResp.intelligence && intelResp.intelligence.summary) || {};
  const parts = [];

  // Original suspicious message (truncated to 120 chars)
  if (alertData && alertData.message) {
    const msg = alertData.message.length > 120
      ? alertData.message.slice(0, 120) + '…'
      : alertData.message;
    parts.push(`<div class="summary-msg">${escapeHtml(msg)}</div>`);
  }

  // Risk score + level
  if (alertData && typeof alertData.risk_score === 'number') {
    const lvl = (alertData.risk_level || '').toLowerCase();
    parts.push(`<div class="intel-row"><span class="intel-key">Risk score</span>` +
      `<span class="intel-val summary-risk summary-risk-${lvl}">${alertData.risk_score} (${(alertData.risk_level || '?')})</span></div>`);
  }

  // H.I.V.E. turn count
  if (typeof intelResp.interaction_count === 'number')
    parts.push(`<div class="intel-row"><span class="intel-key">H.I.V.E. turns</span><span class="intel-val">${intelResp.interaction_count}</span></div>`);

  // Extracted entity types
  const entityTypes = summary.entity_types || [];
  if (entityTypes.length > 0)
    parts.push(`<div class="intel-row"><span class="intel-key">Entities found</span><span class="intel-val">${entityTypes.join(', ')}</span></div>`);

  // Detected behaviour types
  const behavTypes = summary.behaviour_types || [];
  if (behavTypes.length > 0)
    parts.push(`<div class="intel-row"><span class="intel-key">Behaviours</span><span class="intel-val">${behavTypes.join(', ')}</span></div>`);

  // R statements (up to 3)
  const statements = summary.statements || [];
  if (statements.length > 0) {
    const items = statements.slice(0, 3).map(s => `<div class="intel-item">${escapeHtml(s)}</div>`).join('');
    parts.push(`<div class="intel-list">${items}</div>`);
  }

  // Why the investigation stopped
  if (intelResp.stop_reason)
    parts.push(`<div class="intel-stop">Stopped: ${escapeHtml(intelResp.stop_reason)}</div>`);

  // Unverified disclaimer — required before action buttons
  parts.push('<div class="intel-unverified">All extracted information is unverified — claims from suspect</div>');

  // Action buttons (both simulate — no real submission or blocking occurs)
  parts.push(
    `<div class="summary-actions">` +
    `<button class="btn-submit"   data-action="submit">Submit report &amp; block chat</button>` +
    `<button class="btn-nosubmit" data-action="no-submit">Don&#39;t submit &amp; block chat</button>` +
    `</div>`
  );

  return parts.join('');
}

/**
 * Render the post-action confirmation.
 * action — 'submit' or 'no-submit'.
 * Both outcomes are simulated; the text is explicit about this.
 */
function buildConfirmationHtml(action) {
  if (action === 'submit') {
    return `<div class="summary-confirm">` +
      `<strong>Demo mode — simulated only.</strong><br>` +
      `No real report was submitted. WhatsApp block is simulated.<br>` +
      `<span class="intel-unverified">No data was sent to any external service.</span>` +
      `</div>`;
  }
  return `<div class="summary-confirm">` +
    `No report submitted. WhatsApp block is simulated.<br>` +
    `Your choice not to submit has been preserved.` +
    `</div>`;
}

// ── DOM interaction ───────────────────────────────────────────────────────────

function handleFinalAction(action) {
  const content = document.getElementById('intel-content');
  if (!content) return;
  content.innerHTML = buildConfirmationHtml(action);
}

function renderStoredSummary(stored) {
  const section = document.getElementById('intel-section');
  const content = document.getElementById('intel-content');
  if (!section || !content || !stored || !stored.alertData || !stored.resp) return;
  const header = section.querySelector('.intel-header');
  if (header) header.textContent = 'Investigation Summary';
  section.style.display = 'block';
  content.innerHTML = buildFinalSummaryHtml(stored.alertData, stored.resp);
  content.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleFinalAction(btn.dataset.action));
  });
}

function fetchAndRenderIntelligence(sessionId, alertData) {
  chrome.runtime.sendMessage({ type: 'FETCH_INVESTIGATION', sessionId }, (resp) => {
    console.log('[ScamTracer] FETCH_INVESTIGATION resp:', {
      ok: resp && resp.ok,
      state: resp && resp.state,
      hasIntel: resp && !!resp.intelligence,
      interaction_count: resp && resp.interaction_count,
      lastError: chrome.runtime.lastError && chrome.runtime.lastError.message
    });

    const section = document.getElementById('intel-section');
    const content = document.getElementById('intel-content');
    if (!section || !content) return;

    if (!resp || !resp.ok) {
      console.warn('[ScamTracer] FETCH_INVESTIGATION failed — hiding intel section');
      section.style.display = 'none';
      return;
    }

    if (resp.state === 'HIVE_ENDED') {
      console.log('[ScamTracer] Session HIVE_ENDED — rendering Investigation Summary');
      section.style.display = 'block';
      const header = section.querySelector('.intel-header');
      if (header) header.textContent = 'Investigation Summary';
      content.innerHTML = buildFinalSummaryHtml(alertData, resp);
      content.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleFinalAction(btn.dataset.action));
      });
      // Persist so the summary survives popup close/reopen and server restarts
      chrome.storage.local.set({ scamtracer_ended_session: { alertData, resp } }, () => {
        console.log('[ScamTracer] Ended session persisted to chrome.storage.local');
      });
      return;
    }

    if (!resp.intelligence) {
      console.warn('[ScamTracer] HIVE_ACTIVE but intelligence is null — hiding section');
      section.style.display = 'none';
      return;
    }

    console.log('[ScamTracer] Session HIVE_ACTIVE — rendering ongoing intel');
    section.style.display = 'block';
    const header = section.querySelector('.intel-header');
    if (header) header.textContent = 'H.I.V.E. Evidence Collected';
    content.innerHTML = buildOngoingIntelHtml(resp);
    // Poll once per popup open while the session is still active
    setTimeout(refresh, 4000);
  });
}

async function refresh() {
  // Fetch WhatsApp/backend status
  chrome.runtime.sendMessage({ type: 'FETCH_STATUS' }, (statusResp) => {
    const el = document.getElementById('status-indicator');
    if (!el) return;

    if (chrome.runtime.lastError || !statusResp || !statusResp.ok) {
      el.textContent  = 'Disconnected';
      el.className    = 'value status-disconnected';
      setEl('wa-status', '—');
      setEl('threshold', '—');
    } else {
      el.textContent = 'Connected';
      el.className   = 'value status-connected';
      const d = statusResp.data || {};
      setEl('wa-status',  d.enabled ? 'Enabled' : 'Disabled');
      setEl('threshold',  d.risk_threshold !== undefined ? `${d.risk_threshold}` : '60');
    }
  });

  // Fetch alerts
  chrome.runtime.sendMessage({ type: 'FETCH_ALERTS' }, (alertsResp) => {
    if (chrome.runtime.lastError || !alertsResp || !alertsResp.ok) {
      setEl('pending-count', '—');
      setEl('latest-risk', '—');
      // Backend unreachable — still show any persisted ended-session summary
      chrome.storage.local.get('scamtracer_ended_session', (stored) => {
        if (stored && stored.scamtracer_ended_session)
          renderStoredSummary(stored.scamtracer_ended_session);
      });
      return;
    }

    const alerts  = alertsResp.alerts || [];
    const pending = alerts.filter(a => a.status === 'USER_DECISION_REQUIRED');

    // Pending count
    setEl('pending-count', pending.length > 0 ? `${pending.length}` : 'None');

    // Latest risk badge — find highest risk_score among all alerts
    let latestEl = document.getElementById('latest-risk');
    if (alerts.length > 0) {
      const top = alerts.reduce((a, b) =>
        (b.risk_score || 0) > (a.risk_score || 0) ? b : a
      );
      if (latestEl) {
        latestEl.textContent = `${top.risk_level || '?'} (${top.risk_score || '?'})`;
        latestEl.className   = `badge ${riskBadgeClass(top.risk_level)}`;
      }
    } else if (latestEl) {
      latestEl.textContent = 'None';
      latestEl.className   = 'badge badge-none';
    }

    // Check for H.I.V.E. session before the early return for empty pending list.
    // A HIVE_ACTIVE alert has zero pending decisions — show intel/summary regardless.
    const hiveAlert    = alerts.find(a => a.status === 'HIVE_ACTIVE');
    const intelSection = document.getElementById('intel-section');
    console.log('[ScamTracer] FETCH_ALERTS result:', {
      totalAlerts: alerts.length,
      hiveAlertFound: !!hiveAlert,
      hiveSessionId: hiveAlert && hiveAlert.session_id
    });
    if (hiveAlert && hiveAlert.session_id && intelSection) {
      fetchAndRenderIntelligence(hiveAlert.session_id, hiveAlert);
    } else if (intelSection) {
      // No live session — show any persisted ended-session summary
      chrome.storage.local.get('scamtracer_ended_session', (stored) => {
        const hasStored = !!(stored && stored.scamtracer_ended_session);
        console.log('[ScamTracer] No live HIVE_ACTIVE alert — storage fallback, hasStored:', hasStored);
        if (hasStored) {
          renderStoredSummary(stored.scamtracer_ended_session);
        } else {
          intelSection.style.display = 'none';
        }
      });
    }

    // Pending alert list (top 3)
    const listEl = document.getElementById('pending-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (pending.length === 0) {
      const empty = document.createElement('p');
      empty.className   = 'pending-empty';
      empty.textContent = 'No pending decisions.';
      listEl.appendChild(empty);
      return;
    }

    pending.slice(0, 3).forEach(a => {
      const item  = document.createElement('div');
      item.className  = 'pending-item';
      const score = document.createElement('span');
      score.className = 'score';
      score.textContent = a.risk_score;
      item.appendChild(score);
      const preview = document.createTextNode(
        a.message
          ? (a.message.length > 50
              ? a.message.slice(0, 50) + '…'
              : a.message)
          : `Alert ID: ${a.alert_id}`
      );
      item.appendChild(preview);
      listEl.appendChild(item);
    });

    if (pending.length > 3) {
      const more  = document.createElement('p');
      more.className   = 'pending-empty';
      more.textContent = `+${pending.length - 3} more — open WhatsApp Web`;
      listEl.appendChild(more);
    }
  });
}

document.addEventListener('DOMContentLoaded', refresh);
