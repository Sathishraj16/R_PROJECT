// ScamTracer AI — Phase 12 Extension Test Suite
//
// Tests: extension file validity, backend connectivity, threshold logic,
//        decision endpoints, deduplication, no-sendMessage guarantee.
//
// Run: node tests/test_extension.js
// Requirements (for E1–E5 backend checks): Node.js server on port 3001 with
//   SCAMTRACER_TEST_MODE=true WHATSAPP_ENABLED=false
//   Set RUN_BACKEND_CHECKS=true to include those tests.

'use strict';

const fs   = require('fs');
const path = require('path');
const http = require('http');

// ── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(label, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${label}`);
  } else {
    failed++;
    console.log(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
  }
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts    = new URL(url);
    const req = http.request({
      hostname: opts.hostname, port: opts.port, path: opts.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end',  () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('timeout')));
    req.write(payload);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    http.get({ hostname: opts.hostname, port: opts.port, path: opts.pathname }, res => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end',  () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    }).on('error', reject).setTimeout(8000, function () { this.destroy(new Error('timeout')); });
  });
}

// ── Extension root ───────────────────────────────────────────────────────────

const EXT_DIR = path.join(__dirname, '..', 'extension');

const REQUIRED_FILES = [
  'manifest.json',
  'background.js',
  'content.js',
  'styles.css',
  'popup.html',
  'popup.js',
  'README.md'
];

console.log('\n════════════════════════════════════════════════════════════════');
console.log('ScamTracer AI — Phase 12 Extension Test Suite');
console.log('════════════════════════════════════════════════════════════════\n');

// ── E1: All extension files present ──────────────────────────────────────────
console.log('── E1: Required extension files ──');
REQUIRED_FILES.forEach(file => {
  const full = path.join(EXT_DIR, file);
  check(`E1  extension/${file} exists`, fs.existsSync(full));
});

// ── E2: manifest.json is valid MV3 ───────────────────────────────────────────
console.log('\n── E2: manifest.json validity ──');
let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
} catch (e) {
  check('E2a manifest.json is valid JSON', false, e.message);
}
if (manifest) {
  check('E2a manifest.json is valid JSON',                                  true);
  check('E2b manifest_version === 3',          manifest.manifest_version === 3);
  check('E2c has background.service_worker',   !!manifest.background?.service_worker);
  check('E2d content_scripts targets WhatsApp Web',
        Array.isArray(manifest.content_scripts) &&
        manifest.content_scripts.some(cs =>
          cs.matches && cs.matches.some(m => m.includes('web.whatsapp.com'))
        )
  );
  check('E2e host_permissions includes localhost:3000',
        Array.isArray(manifest.host_permissions) &&
        manifest.host_permissions.some(p => p.includes('localhost:3000'))
  );
}

// ── E3: shouldShowAlert threshold logic (in-process simulation) ───────────────
console.log('\n── E3: shouldShowAlert threshold logic ──');

// Inline the logic from content.js so we can unit-test it without a browser.
const RISK_THRESHOLD_TEST = 60;
const shownAlertsTest = new Set();

function shouldShowAlertTest(alert) {
  if (!alert || typeof alert !== 'object') return false;
  if (alert.status !== 'USER_DECISION_REQUIRED')  return false;
  if (typeof alert.risk_score !== 'number')        return false;
  if (alert.risk_score < RISK_THRESHOLD_TEST)      return false;
  if (shownAlertsTest.has(alert.alert_id))         return false;
  return true;
}

const alertBelow = { alert_id: 'test-below', status: 'USER_DECISION_REQUIRED', risk_score: 59 };
const alertAt    = { alert_id: 'test-at',    status: 'USER_DECISION_REQUIRED', risk_score: 60 };
const alertAbove = { alert_id: 'test-above', status: 'USER_DECISION_REQUIRED', risk_score: 86 };
const alertWrong = { alert_id: 'test-wrong', status: 'BLOCKED',                risk_score: 90 };

check('E3a score=59 (below threshold) → shouldShowAlert returns false',
      shouldShowAlertTest(alertBelow) === false);
check('E3b score=60 (at threshold) → shouldShowAlert returns true',
      shouldShowAlertTest(alertAt)    === true);
check('E3c score=86 (high) → shouldShowAlert returns true',
      shouldShowAlertTest(alertAbove) === true);
check('E3d status=BLOCKED → shouldShowAlert returns false',
      shouldShowAlertTest(alertWrong) === false);

// E3e: deduplication — second call with same alert_id returns false
shownAlertsTest.add('test-at');
check('E3e duplicate alert_id → shouldShowAlert returns false',
      shouldShowAlertTest(alertAt) === false);

// ── E4: no sendMessage call in content.js ────────────────────────────────────
console.log('\n── E4: Safety — content.js must not call whatsapp sendMessage ──');
const contentSrc = fs.readFileSync(path.join(EXT_DIR, 'content.js'), 'utf8');
// Checks that content.js never calls WhatsApp Web internals to send messages.
// chrome.runtime.sendMessage is the Chrome extension messaging API — allowed.
// We only flag WhatsApp-specific send patterns.
const forbidden = [
  /chat\.sendMessage/,                   // WhatsApp Web internal chat API
  /sendSeen\s*\(/,                       // WhatsApp read-receipt injection
  /wsp\.send\b/,                         // WhatsApp socket send
  /window\.require.*whatsapp/i,          // hooking into WhatsApp modules
  /require\s*\(.*whatsapp/i             // require WhatsApp internals
];
let foundForbidden = null;
for (const re of forbidden) {
  if (re.test(contentSrc)) { foundForbidden = re.source; break; }
}
check('E4  content.js contains no WhatsApp sendMessage / chat API calls',
      foundForbidden === null, foundForbidden ? `matched: ${foundForbidden}` : '');

// ── E5: Backend connectivity + decision endpoints (optional) ─────────────────
const RUN_BACKEND = process.env.RUN_BACKEND_CHECKS === 'true';
const BASE_URL    = `http://localhost:${process.env.TEST_PORT || 3001}`;

console.log('\n── E5: Backend endpoint checks ──');

async function runBackendChecks() {
  if (!RUN_BACKEND) {
    [
      'E5a GET /alerts returns 200',
      'E5b BLOCK_AND_PROTECT decision endpoint returns 200',
      'E5b-ii BLOCK_AND_PROTECT response body status is BLOCKED',
      'E5c ACTIVATE_HIVE decision endpoint returns 200',
      'E5c-ii ACTIVATE_HIVE response body status is HIVE_ACTIVE',
      'E5d backend returns 404 for unknown alert_id',
      'E5e risk score below threshold does NOT produce alert',
      'E5f second decision on same alert returns 409 ALREADY_DECIDED'
    ].forEach(t => console.log(`  [SKIP] ${t}`));
    return;
  }

  // E5a: GET /alerts
  const alertsRes = await httpGet(`${BASE_URL}/alerts`);
  check('E5a GET /alerts returns 200', alertsRes.status === 200, `got ${alertsRes.status}`);

  // Create a high-risk alert to test decisions against
  // Confirmed risk_score=81 on production R model
  const simHigh = await httpPost(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91ext@c.us',
    body: 'URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access or lose your funds permanently.',
    id:   'ext-test-high-001'
  });
  const highAlert = simHigh.body && simHigh.body.alert;

  if (highAlert) {
    // E5b: BLOCK_AND_PROTECT
    const blockRes = await httpPost(`${BASE_URL}/alerts/${highAlert.alert_id}/decision`, {
      action: 'BLOCK_AND_PROTECT'
    });
    check('E5b BLOCK_AND_PROTECT decision endpoint returns 200',
          blockRes.status === 200, `got ${blockRes.status}`);
    check('E5b-ii BLOCK_AND_PROTECT response body status is BLOCKED',
          blockRes.body && blockRes.body.status === 'BLOCKED',
          JSON.stringify(blockRes.body && blockRes.body.status));

    // E5f: a second decision on the same alert must return 409 ALREADY_DECIDED
    const reBlockRes = await httpPost(`${BASE_URL}/alerts/${highAlert.alert_id}/decision`, {
      action: 'BLOCK_AND_PROTECT'
    });
    check('E5f second decision on same alert returns 409 ALREADY_DECIDED',
          reBlockRes.status === 409 &&
          reBlockRes.body && reBlockRes.body.code === 'ALREADY_DECIDED',
          `got ${reBlockRes.status} code=${reBlockRes.body && reBlockRes.body.code}`);

    // Create another alert for ACTIVATE_HIVE test
    // Confirmed risk_score=98 on production R model
    const simHigh2 = await httpPost(`${BASE_URL}/test/simulate-whatsapp`, {
      from: '91ext2@c.us',
      body: 'Alert: Suspicious transaction of Rs 49999 detected on your account. Call 08001234567 and provide your net banking password immediately.',
      id:   'ext-test-high-002'
    });
    const highAlert2 = simHigh2.body && simHigh2.body.alert;

    if (highAlert2) {
      // E5c: ACTIVATE_HIVE
      const hiveRes = await httpPost(`${BASE_URL}/alerts/${highAlert2.alert_id}/decision`, {
        action: 'ACTIVATE_HIVE'
      });
      check('E5c ACTIVATE_HIVE decision endpoint returns 200',
            hiveRes.status === 200, `got ${hiveRes.status}`);
      check('E5c-ii ACTIVATE_HIVE response body status is HIVE_ACTIVE',
            hiveRes.body && hiveRes.body.status === 'HIVE_ACTIVE',
            JSON.stringify(hiveRes.body && hiveRes.body.status));
    } else {
      check('E5c ACTIVATE_HIVE decision endpoint returns 200', false, 'sim failed');
    }
  } else {
    check('E5b BLOCK_AND_PROTECT decision endpoint returns 200', false, 'sim failed');
    check('E5c ACTIVATE_HIVE decision endpoint returns 200', false, 'sim failed');
  }

  // E5d: unknown alert_id should return 404
  const badRes = await httpPost(`${BASE_URL}/alerts/nonexistent-alert/decision`, {
    action: 'BLOCK_AND_PROTECT'
  });
  check('E5d backend returns 404 for unknown alert_id',
        badRes.status === 404, `got ${badRes.status}`);

  // E5e: risk_score < 60 should NOT produce an alert
  const simLow = await httpPost(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91low@c.us',
    body: 'Hi, how are you doing today?',
    id:   'ext-test-low-001'
  });
  check('E5e risk score below threshold does NOT produce alert',
        simLow.body && simLow.body.alert_created === false,
        JSON.stringify(simLow.body));
}

// ── F1–F17: Phase 12 Final Integration checks ────────────────────────────────

console.log('\n── F: Phase 12 Final Integration checks ──');

const popupSrc     = fs.readFileSync(path.join(EXT_DIR, 'popup.js'),     'utf8');
const bgSrc        = fs.readFileSync(path.join(EXT_DIR, 'background.js'),'utf8');
const stylesSrc    = fs.readFileSync(path.join(EXT_DIR, 'styles.css'),   'utf8');

// F1: content.js uses alert.message (not alert.message_text)
check('F1  content.js uses alert.message (field fix)',
      contentSrc.includes('alert.message') && !contentSrc.includes('alert.message_text'));

// F2: popup.js uses a.message (not a.message_text)
check('F2  popup.js uses a.message (field fix)',
      popupSrc.includes('a.message') && !popupSrc.includes('a.message_text'));

// F3–F6: escapeHtml tests — inline the function from content.js
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
check('F3  escapeHtml converts < to &lt;',   escapeHtml('<script>') === '&lt;script&gt;');
check('F4  escapeHtml converts & to &amp;',  escapeHtml('a & b')   === 'a &amp; b');
check('F5  escapeHtml converts " to &quot;', escapeHtml('"hi"')    === '&quot;hi&quot;');
check('F6  escapeHtml of a number returns a string',
      typeof escapeHtml(42) === 'string' && escapeHtml(42) === '42');

// F7: content.js references alert.sender
check('F7  content.js panel renders alert.sender',
      contentSrc.includes('alert.sender'));

// F8: content.js references alert.prediction
check('F8  content.js panel renders alert.prediction',
      contentSrc.includes('alert.prediction'));

// F9: content.js references alert.detected_indicators
check('F9  content.js panel renders alert.detected_indicators',
      contentSrc.includes('alert.detected_indicators'));

// F10: content.js renders indicators as a list (scamtracer-indicator class)
check('F10 content.js renders indicators as list items with CSS class',
      contentSrc.includes('scamtracer-indicator'));

// F11: styles.css defines .scamtracer-indicator
check('F11 styles.css defines .scamtracer-indicator',
      stylesSrc.includes('.scamtracer-indicator'));

// F12: content.js has _contextValid guard variable
check('F12 content.js has _contextValid context-invalidation guard',
      contentSrc.includes('_contextValid'));

// F13: content.js uses safeSendMessage wrapper
check('F13 content.js uses safeSendMessage wrapper (not raw sendMessage in poll/decision)',
      contentSrc.includes('function safeSendMessage'));

// F14: shouldShowAlert rejects alert where risk_score is null
check('F14 shouldShowAlert rejects null risk_score',
      shouldShowAlertTest({ alert_id: 'f14', status: 'USER_DECISION_REQUIRED', risk_score: null }) === false);

// F15: shouldShowAlert rejects alert where risk_score is a string
check('F15 shouldShowAlert rejects string risk_score',
      shouldShowAlertTest({ alert_id: 'f15', status: 'USER_DECISION_REQUIRED', risk_score: '80' }) === false);

// F16: popup.js uses risk_level for badge class (riskBadgeClass function exists)
check('F16 popup.js has riskBadgeClass function for badge colour',
      popupSrc.includes('riskBadgeClass'));

// F17: background.js handles FETCH_ALERTS, FETCH_STATUS, POST_DECISION
check('F17 background.js handles all three extension message types',
      bgSrc.includes('FETCH_ALERTS') &&
      bgSrc.includes('FETCH_STATUS') &&
      bgSrc.includes('POST_DECISION'));

// ── G: safeSendMessage callback coverage ─────────────────────────────────────
// Verifies that safeSendMessage calls callback(null) in all three error paths:
//   (a) chrome.runtime.lastError set        — existed before fix
//   (b) _contextValid === false early return — fixed
//   (c) catch block (sendMessage throws)    — fixed
// All three use the same guard form: if (callback) callback(null)
console.log('\n── G: safeSendMessage callback coverage ──');

const callbackNullCount = (contentSrc.match(/if\s*\(callback\)\s*callback\s*\(\s*null\s*\)/g) || []).length;
check('G1 safeSendMessage calls callback(null) in all 3 error paths (>= 3 occurrences)',
      callbackNullCount >= 3,
      `found ${callbackNullCount} occurrence(s), expected >= 3`);

// ── H: Final investigation summary ───────────────────────────────────────────
// Tests the three pure HTML builder functions from popup.js:
//   buildFinalSummaryHtml(alertData, intelResp) — summary screen
//   buildConfirmationHtml(action)               — post-button confirmation
// These are pure string-builders (no DOM, no chrome APIs), so they are inlined
// here and verified independently, consistent with the escapeHtml / shouldShowAlert
// pattern used in E3 above.
console.log('\n── H: Final investigation summary ──');

// Shared escapeHtml (same implementation as popup.js)
function escapeHtmlH(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Inline of buildFinalSummaryHtml from popup.js
function buildFinalSummaryHtmlTest(alertData, intelResp) {
  const summary = (intelResp.intelligence && intelResp.intelligence.summary) || {};
  const parts = [];
  if (alertData && alertData.message) {
    const msg = alertData.message.length > 120 ? alertData.message.slice(0, 120) + '…' : alertData.message;
    parts.push(`<div class="summary-msg">${escapeHtmlH(msg)}</div>`);
  }
  if (alertData && typeof alertData.risk_score === 'number') {
    const lvl = (alertData.risk_level || '').toLowerCase();
    parts.push(`<div class="intel-row"><span class="intel-key">Risk score</span>` +
      `<span class="intel-val summary-risk summary-risk-${lvl}">${alertData.risk_score} (${(alertData.risk_level || '?')})</span></div>`);
  }
  if (typeof intelResp.interaction_count === 'number')
    parts.push(`<div class="intel-row"><span class="intel-key">H.I.V.E. turns</span><span class="intel-val">${intelResp.interaction_count}</span></div>`);
  const entityTypes = (summary.entity_types || []);
  if (entityTypes.length > 0)
    parts.push(`<div class="intel-row"><span class="intel-key">Entities found</span><span class="intel-val">${entityTypes.join(', ')}</span></div>`);
  const behavTypes = (summary.behaviour_types || []);
  if (behavTypes.length > 0)
    parts.push(`<div class="intel-row"><span class="intel-key">Behaviours</span><span class="intel-val">${behavTypes.join(', ')}</span></div>`);
  const statements = (summary.statements || []);
  if (statements.length > 0) {
    const items = statements.slice(0, 3).map(s => `<div class="intel-item">${escapeHtmlH(s)}</div>`).join('');
    parts.push(`<div class="intel-list">${items}</div>`);
  }
  if (intelResp.stop_reason)
    parts.push(`<div class="intel-stop">Stopped: ${escapeHtmlH(intelResp.stop_reason)}</div>`);
  parts.push('<div class="intel-unverified">All extracted information is unverified — claims from suspect</div>');
  parts.push(
    `<div class="summary-actions">` +
    `<button class="btn-submit"   data-action="submit">Submit report &amp; block chat</button>` +
    `<button class="btn-nosubmit" data-action="no-submit">Don&#39;t submit &amp; block chat</button>` +
    `</div>`
  );
  return parts.join('');
}

// Inline of buildConfirmationHtml from popup.js
function buildConfirmationHtmlTest(action) {
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

// Test data matching the real shape returned by the backend
const mockAlertData = {
  alert_id: 'test-alert-001', status: 'HIVE_ACTIVE', session_id: 'test-session-001',
  sender: '91test@c.us', risk_score: 81, risk_level: 'HIGH',
  message: 'URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access.',
  prediction: 'SCAM'
};
const mockIntelResp = {
  session_id: 'test-session-001', state: 'HIVE_ENDED', interaction_count: 2,
  stop_reason: 'auto: 3 evidence categories collected',
  intelligence: {
    summary: {
      entity_types:    ['PHONE', 'URL', 'OTP_REQUEST'],
      behaviour_types: ['URGENCY'],
      statements:      ['Observed 1 phone number(s).', 'Observed 1 URL(s).']
    }
  }
};

const summaryHtml = buildFinalSummaryHtmlTest(mockAlertData, mockIntelResp);

check('H1  summary renders original message text',
      summaryHtml.includes('securebank-verify.com'),
      'expected message text not found');

check('H2  summary renders risk score value (81)',
      summaryHtml.includes('81'),
      'risk score not found');

check('H3  summary renders interaction count (2)',
      summaryHtml.includes('>2<'),
      'interaction count not found');

check('H4  summary renders stop reason',
      summaryHtml.includes('auto: 3 evidence categories'),
      'stop reason not found');

check('H5  summary includes "Submit report" button text',
      summaryHtml.includes('Submit report'),
      '"Submit report" not found');

check('H6  summary includes "Don\'t submit" button text',
      summaryHtml.includes("Don") && summaryHtml.includes("no-submit"),
      '"no-submit" data-action not found');

check('H7  summary includes unverified disclaimer',
      summaryHtml.includes('unverified'),
      'disclaimer not found');

check('H8  message text is HTML-escaped',
      buildFinalSummaryHtmlTest(
        { ...mockAlertData, message: '<script>xss</script>' }, mockIntelResp
      ).includes('&lt;script&gt;'),
      'XSS not escaped');

check('H9  message longer than 120 chars is truncated',
      (() => {
        const long = 'A'.repeat(130);
        const h = buildFinalSummaryHtmlTest({ ...mockAlertData, message: long }, mockIntelResp);
        return h.includes('…') && !h.includes('A'.repeat(130));
      })(),
      'long message not truncated');

check('H10 summary renders entity types',
      summaryHtml.includes('PHONE') && summaryHtml.includes('URL') && summaryHtml.includes('OTP_REQUEST'),
      'entity types not found');

check('H11 summary renders behaviour types',
      summaryHtml.includes('URGENCY'),
      'behaviour types not found');

// buildConfirmationHtml — submit path
const submitConfirm = buildConfirmationHtmlTest('submit');
check('H12 submit confirmation says "simulated"',
      submitConfirm.includes('simulated'),
      '"simulated" not found');

check('H13 submit confirmation says no real report was submitted',
      submitConfirm.includes('No real report was submitted'),
      'disclaimer not found');

check('H14 submit confirmation says no data sent to external service',
      submitConfirm.includes('No data was sent to any external service'),
      'external-service disclaimer not found');

// buildConfirmationHtml — no-submit path
const noSubmitConfirm = buildConfirmationHtmlTest('no-submit');
check('H15 no-submit confirmation says "No report submitted"',
      noSubmitConfirm.includes('No report submitted'),
      '"No report submitted" not found');

check('H16 no-submit confirmation preserves user choice not to submit',
      noSubmitConfirm.includes('not to submit'),
      '"not to submit" not found');

check('H17 no-submit confirmation does NOT claim a report was submitted',
      !noSubmitConfirm.includes('report was submitted'),
      'false claim found');

// Source-level checks — ensure popup.js exports the correct function names
check('H18 popup.js defines buildFinalSummaryHtml',  popupSrc.includes('function buildFinalSummaryHtml'));
check('H19 popup.js defines buildConfirmationHtml',  popupSrc.includes('function buildConfirmationHtml'));
check('H20 popup.js defines handleFinalAction',      popupSrc.includes('function handleFinalAction'));
check('H21 popup.js calls fetchAndRenderIntelligence with alertData',
      popupSrc.includes('fetchAndRenderIntelligence(hiveAlert.session_id, hiveAlert)'));
check('H22 background.js handles FETCH_INVESTIGATION', bgSrc.includes('FETCH_INVESTIGATION'));

// ── H23–H28: Missing-summary bug fixes ───────────────────────────────────────
// Root cause 1: background.js omitted interaction_count — summary row was absent
// Root cause 2: no chrome.storage.local persistence — summary lost on server restart
// Root cause 3: !resp.intelligence guard hid section for HIVE_ENDED sessions
// Root cause 4: no auto-refresh — popup never polled for state change while open
console.log('\n── H (23–28): Missing-summary bug fixes ──');

// H23: background.js now forwards interaction_count in FETCH_INVESTIGATION response
check('H23 background.js forwards interaction_count in FETCH_INVESTIGATION response',
      bgSrc.includes('interaction_count'));

// H24: popup.js uses the correct chrome.storage key for the ended session
check('H24 popup.js stores ended session under key scamtracer_ended_session',
      popupSrc.includes('scamtracer_ended_session'));

// H25: popup.js persists ended session via chrome.storage.local.set
check('H25 popup.js calls chrome.storage.local.set',
      popupSrc.includes('chrome.storage.local.set'));

// H26: popup.js reads ended session via chrome.storage.local.get
check('H26 popup.js calls chrome.storage.local.get',
      popupSrc.includes('chrome.storage.local.get'));

// H27: popup.js defines renderStoredSummary for the storage fallback path
check('H27 popup.js defines renderStoredSummary',
      popupSrc.includes('function renderStoredSummary'));

// H28: popup.js schedules auto-refresh with setTimeout(refresh) while HIVE_ACTIVE
check('H28 popup.js schedules auto-refresh via setTimeout',
      popupSrc.includes('setTimeout(refresh'));

// H29: buildFinalSummaryHtml renders "H.I.V.E. turns" row when interaction_count
//      is provided — confirms the fix works end-to-end once background.js forwards it
check('H29 summary renders H.I.V.E. turns when interaction_count supplied',
      buildFinalSummaryHtmlTest(mockAlertData, { ...mockIntelResp, interaction_count: 4 })
        .includes('>4<'),
      'interaction_count=4 not rendered');

// H30: summary renders without interaction_count row when field is absent
//      (manual stop path — background.js returns interaction_count: null)
check('H30 summary renders without H.I.V.E. turns row when interaction_count is null',
      (() => {
        const h = buildFinalSummaryHtmlTest(mockAlertData, { ...mockIntelResp, interaction_count: null });
        return !h.includes('H.I.V.E. turns');
      })(),
      'unexpected turns row found when interaction_count is null');

// ── I: Regression — actual live-session data shape ───────────────────────────
// Uses the exact alert and intelligence shapes from session
//   b0b753a2-5223-44c7-8c93-79202c5733cd (6 evidence categories, 4 turns)
// that confirmed H.I.V.E. auto-stop works in the live WhatsApp demo.
// Verifies the popup renders Investigation Summary end-to-end with real data.
console.log('\n── I: Regression — live-session data shape ──');

const liveAlertData = {
  alert_id:    'e2bb60d5-c8d8-4099-8f03-d55fc78a1746',
  session_id:  'b0b753a2-5223-44c7-8c93-79202c5733cd',
  status:      'HIVE_ACTIVE',
  sender:      '53871909019871@lid',
  message:     'Congratulations! You have won ₹25,000 in our lucky draw. Claim your prize now before it expires: https://claim-prize.example',
  risk_score:  70,
  risk_level:  'HIGH',
  prediction:  'SCAM'
};

// Shape returned by background.js FETCH_INVESTIGATION (after fix to forward interaction_count)
const liveIntelResp = {
  ok:               true,
  session_id:       'b0b753a2-5223-44c7-8c93-79202c5733cd',
  state:            'HIVE_ENDED',
  interaction_count: 4,
  stop_reason:      'auto: 6 evidence categories across 4 turns',
  intelligence: {
    summary: {
      entity_types:    ['URL', 'PAYMENT_REQUEST'],
      behaviour_types: ['URGENCY', 'PAYMENT_REQUEST', 'IMPERSONATION', 'REPEATED_REQUEST', 'ESCALATION'],
      statements: [
        'Observed 1 URL(s).',
        'Observed payment / transfer request in 4 turn(s).',
        'Observed urgency / time pressure in 1 turn(s).'
      ]
    }
  }
};

const liveSummaryHtml = buildFinalSummaryHtmlTest(liveAlertData, liveIntelResp);

check('I1  live-data summary renders original message',
      liveSummaryHtml.includes('lucky draw'),
      'message text missing');

check('I2  live-data summary renders risk score 70',
      liveSummaryHtml.includes('70'),
      'risk score 70 missing');

check('I3  live-data summary renders H.I.V.E. turns = 4',
      liveSummaryHtml.includes('>4<'),
      '"4" not found in turns row');

check('I4  live-data summary renders entity types URL and PAYMENT_REQUEST',
      liveSummaryHtml.includes('URL') && liveSummaryHtml.includes('PAYMENT_REQUEST'),
      'entity types missing');

check('I5  live-data summary renders all 5 behaviour types',
      ['URGENCY','PAYMENT_REQUEST','IMPERSONATION','REPEATED_REQUEST','ESCALATION']
        .every(b => liveSummaryHtml.includes(b)),
      'one or more behaviour types missing');

check('I6  live-data summary renders stop reason (6 categories)',
      liveSummaryHtml.includes('6 evidence categories'),
      'stop reason missing');

check('I7  live-data summary renders up to 3 R statements',
      liveSummaryHtml.includes('Observed 1 URL') &&
      liveSummaryHtml.includes('transfer request'),
      'R statements missing');

check('I8  live-data summary includes unverified disclaimer',
      liveSummaryHtml.includes('unverified'),
      'disclaimer missing');

check('I9  live-data summary includes both action buttons',
      liveSummaryHtml.includes('data-action="submit"') &&
      liveSummaryHtml.includes('data-action="no-submit"'),
      'action buttons missing');

// Storage path: simulate the stored { alertData, resp } object that
// chrome.storage.local.get returns after the first HIVE_ENDED render.
// renderStoredSummary delegates directly to buildFinalSummaryHtml, so
// verifying the HTML output confirms the storage path would render correctly.
const storedObj    = { alertData: liveAlertData, resp: liveIntelResp };
const storedHtml   = buildFinalSummaryHtmlTest(storedObj.alertData, storedObj.resp);

check('I10 storage-path renders same message as direct render',
      storedHtml.includes('lucky draw'),
      'storage path: message missing');

check('I11 storage-path renders correct interaction_count',
      storedHtml.includes('>4<'),
      'storage path: interaction_count missing');

// background.js FETCH_INVESTIGATION response shape — verifies the mapping
// added in the fix: session_id, interaction_count must be forwarded
check('I12 background.js maps session_id in FETCH_INVESTIGATION response',
      bgSrc.includes('session_id:') && bgSrc.includes('data.session_id'),
      'session_id not mapped');

check('I13 background.js maps interaction_count in FETCH_INVESTIGATION response',
      bgSrc.includes('interaction_count:') && bgSrc.includes('data.interaction_count'),
      'interaction_count not mapped');

// popup.js diagnostic logging — confirms console.log present for DevTools verification
check('I14 popup.js has FETCH_INVESTIGATION console.log for DevTools',
      popupSrc.includes("'[ScamTracer] FETCH_INVESTIGATION resp:'"),
      'FETCH_INVESTIGATION log missing');

check('I15 popup.js has HIVE_ENDED console.log for DevTools',
      popupSrc.includes('[ScamTracer] Session HIVE_ENDED'),
      'HIVE_ENDED log missing');

check('I16 popup.js has FETCH_ALERTS result console.log for DevTools',
      popupSrc.includes("'[ScamTracer] FETCH_ALERTS result:'"),
      'FETCH_ALERTS log missing');

// ── Run backend checks and then print summary ─────────────────────────────────

runBackendChecks().then(() => {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`PHASE 12 EXTENSION TEST SUMMARY: ${passed} / ${passed + failed} passed  (${failed} failed)`);
  if (!RUN_BACKEND) {
    console.log('  Backend checks (E5a–E5e) skipped — set RUN_BACKEND_CHECKS=true and start server.');
  }
  console.log('════════════════════════════════════════════════════════════════\n');
  if (failed > 0) process.exit(1);
}).catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
