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
