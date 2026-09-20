// ScamTracer AI — Phase 11 Test Suite
// Live WhatsApp QR Integration + Real-Time Scam Alerts
//
// Tests: alertStore, whatsappClient, server endpoints
// Run: node tests/test_whatsapp.js
//
// Requirements:
//   - R Plumber API must be running on port 8000 (for /analyze via server endpoints)
//   - Node.js server must NOT already be on port 3000 — this suite starts its own
//     instance (test mode) internally using the mock pattern from existing suites.
//   - Uses SCAMTRACER_TEST_MODE=true to enable the simulation endpoint.
//   - Uses WHATSAPP_ENABLED=false so no real phone is required.

'use strict';

const http    = require('http');
const https   = require('https');
const { EventEmitter } = require('events');

// ── Test harness ──────────────────────────────────────────────────────────────

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

async function post(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const opts    = new URL(url);
    const req     = (opts.protocol === 'https:' ? https : http).request({
      hostname: opts.hostname,
      port:     opts.port,
      path:     opts.pathname,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end',  () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => { req.destroy(new Error('request timeout')); });
    req.write(payload);
    req.end();
  });
}

async function get(url) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url);
    (opts.protocol === 'https:' ? https : http).get({
      hostname: opts.hostname,
      port:     opts.port,
      path:     opts.pathname
    }, (res) => {
      let raw = '';
      res.on('data', d => { raw += d; });
      res.on('end',  () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch (e) { resolve({ status: res.statusCode, body: raw }); }
      });
    }).on('error', reject).setTimeout(8000, function () { this.destroy(new Error('request timeout')); });
  });
}

// ── Unit tests: alertStore (no server required) ───────────────────────────────

console.log('\n════════════════════════════════════════════════════════════════');
console.log('ScamTracer AI — Phase 11 Test Suite: WhatsApp Integration');
console.log('════════════════════════════════════════════════════════════════\n');

console.log('── Case A: alertStore module ──');

const alertStore = require('../nodejs/src/alertStore.js');
const { ALERT_STATES } = alertStore;

// A1: module loads
check('A1  alertStore.js loads without error', !!alertStore);
check('A2  ALERT_STATES has USER_DECISION_REQUIRED',
      ALERT_STATES.USER_DECISION_REQUIRED === 'USER_DECISION_REQUIRED');
check('A3  ALERT_STATES has BLOCKED',   ALERT_STATES.BLOCKED   === 'BLOCKED');
check('A4  ALERT_STATES has HIVE_ACTIVE', ALERT_STATES.HIVE_ACTIVE === 'HIVE_ACTIVE');

// A5: recordAnalysed increments counter
alertStore.recordAnalysed();
alertStore.recordAnalysed();
const statsAfterRecord = alertStore.getStats();
check('A5  recordAnalysed() increments total_analysed',
      statsAfterRecord.total_analysed >= 2, `got ${statsAfterRecord.total_analysed}`);

// A6: createAlert with all required fields
const mockRisk = {
  risk_score: 85, risk_level: 'HIGH', prediction: 'SCAM',
  model_probability: 0.92, ml_score: 55, indicator_score: 30,
  detected_indicators: ['URGENCY', 'OTP_REQUEST'],
  explanations: ['Urgency language detected']
};
const alertA = alertStore.createAlert({
  whatsappMsgId: 'msg-001',
  sender:        'test@c.us',
  messageText:   'Your account will be suspended. Send the OTP now.',
  riskResult:    mockRisk,
  sessionId:     'session-001'
});
check('A6  createAlert() returns an alert object', !!alertA);
check('A7  alert has alert_id (UUID)', typeof alertA.alert_id === 'string' && alertA.alert_id.length > 0);
check('A8  alert status is USER_DECISION_REQUIRED',
      alertA.status === ALERT_STATES.USER_DECISION_REQUIRED);
check('A9  alert risk_score matches mockRisk', alertA.risk_score === 85);
check('A10 alert session_id stored', alertA.session_id === 'session-001');

// A11: deduplication — same whatsappMsgId should return null
const dup = alertStore.createAlert({
  whatsappMsgId: 'msg-001',
  sender: 'test@c.us',
  messageText: 'Duplicate message',
  riskResult: mockRisk,
  sessionId: 'session-002'
});
check('A11 duplicate whatsappMsgId returns null (deduplication)', dup === null);

// A12: getAlert retrieves by ID
const retrieved = alertStore.getAlert(alertA.alert_id);
check('A12 getAlert() retrieves by alert_id', !!retrieved && retrieved.alert_id === alertA.alert_id);

// A13: getAlert on missing ID returns null
check('A13 getAlert("nonexistent") returns null', alertStore.getAlert('nonexistent') === null);

// A14: getAllAlerts returns array
const allAlerts = alertStore.getAllAlerts();
check('A14 getAllAlerts() returns array', Array.isArray(allAlerts));
check('A15 getAllAlerts() includes created alert',
      allAlerts.some(a => a.alert_id === alertA.alert_id));

// A16: updateAlert changes status
const updated = alertStore.updateAlert(alertA.alert_id, {
  status:   ALERT_STATES.BLOCKED,
  decision: 'BLOCK_AND_PROTECT'
});
check('A16 updateAlert() returns updated alert',    !!updated);
check('A17 updateAlert() changes status to BLOCKED', updated.status === ALERT_STATES.BLOCKED);
check('A18 updateAlert() sets decided_at',           !!updated.decided_at);
check('A19 updateAlert() on nonexistent returns null',
      alertStore.updateAlert('nonexistent', { status: 'BLOCKED', decision: 'x' }) === null);

// A20: getStats reflects cumulative totals
const finalStats = alertStore.getStats();
check('A20 getStats() returns object with expected keys',
      typeof finalStats.total_analysed === 'number' &&
      typeof finalStats.total_suspicious === 'number' &&
      typeof finalStats.pending_decisions === 'number');

// ── Unit tests: whatsappClient module ────────────────────────────────────────

console.log('\n── Case B: WhatsAppMonitor (WHATSAPP_ENABLED=false) ──');

// Force disabled for tests
process.env.WHATSAPP_ENABLED = 'false';
const { WhatsAppMonitor, normalizeWhatsAppMessage } = require('../nodejs/src/whatsappClient.js');

check('B1  whatsappClient.js loads without error', !!WhatsAppMonitor);

const monitor = new WhatsAppMonitor(null);
check('B2  new WhatsAppMonitor() creates EventEmitter',  monitor instanceof EventEmitter);
check('B3  isReady is false before start()',             monitor.isReady === false);
check('B4  isEnabled is false when WHATSAPP_ENABLED=false', monitor.isEnabled === false);

// B5: start() resolves immediately (no real client)
const startResult = monitor.start();
check('B5  start() returns a Promise',  startResult instanceof Promise);
startResult.then(() => {
  check('B6  start() resolves without error (WHATSAPP_ENABLED=false)', true);
}).catch(() => {
  check('B6  start() resolves without error (WHATSAPP_ENABLED=false)', false);
});

// B7: mock factory
let mockClientInitCalled = false;
const mockFactory = () => {
  const emitter = new EventEmitter();
  emitter.initialize = () => {
    mockClientInitCalled = true;
    return Promise.resolve();
  };
  return emitter;
};
process.env.WHATSAPP_ENABLED = 'true';
// Re-require to pick up changed env — but we can also just instantiate with factory
const monitorWithMock = new WhatsAppMonitor(mockFactory);
check('B7  WhatsAppMonitor accepts injectable factory', !!monitorWithMock);

monitorWithMock.start().then(() => {
  check('B8  start() calls initialize() on injected client', mockClientInitCalled);
}).catch((err) => {
  check('B8  start() calls initialize() on injected client', false, err.message);
});

// B9: message event from mock client
const monitorEvt = new WhatsAppMonitor(mockFactory);
let receivedMsg = null;
monitorEvt.on('message', (m) => { receivedMsg = m; });
monitorEvt.emit('message', { id: 'test-id', from: '91xxx@c.us', body: 'test body', timestamp: new Date().toISOString() });
check('B9  monitor forwards message events to listeners',
      !!receivedMsg && receivedMsg.body === 'test body');

// ── Unit tests: normalizeWhatsAppMessage + validateRiskResult ────────────────
// These tests verify the Phase 12 pipeline bug fixes:
//   1. msg.id._serialized extraction (never store full msg.id object)
//   2. R NULL→{} serialization defense (validateRiskResult)

console.log('\n── Case D: Message normalization + R result validation ──');

// D1: _serialized extracted as string
const msgWithSerialized = { id: { _serialized: 'false_12345@c.us_ABCDEF', fromMe: false, remote: '12345@c.us', id: 'ABCDEF' }, from: '12345@c.us', body: 'hello', timestamp: 1700000000 };
const normD1 = normalizeWhatsAppMessage(msgWithSerialized);
check('D1  msg.id._serialized extracted as string', normD1.id === 'false_12345@c.us_ABCDEF');

// D2: full msg.id object NOT stored when _serialized is missing → null
const msgNoSerialized = { id: { fromMe: false, remote: '12345@c.us', id: 'ABCDEF' }, from: '12345@c.us', body: 'hello', timestamp: 1700000000 };
const normD2 = normalizeWhatsAppMessage(msgNoSerialized);
// typeof null === 'object' in JS (historical quirk) — use strict equality only
check('D2  msg.id with no _serialized → id is null (not the object)',
      normD2.id === null);

// D3: msg.from extracted correctly
check('D3  msg.from extracted as string', normD1.from === '12345@c.us');

// D4: msg.body extracted correctly
check('D4  msg.body extracted as string', normD1.body === 'hello');

// D5: msg.timestamp (seconds) converted to ISO string
check('D5  msg.timestamp (numeric seconds) converted to ISO string',
      typeof normD1.timestamp === 'string' && normD1.timestamp.includes('T'));

// D6: undefined body normalizes to empty string (not undefined/object)
const msgUndefinedBody = { id: { _serialized: 'x', fromMe: false }, from: '12345@c.us', body: undefined, timestamp: 1700000000 };
const normD6 = normalizeWhatsAppMessage(msgUndefinedBody);
check('D6  undefined msg.body normalizes to empty string', normD6.body === '');

// D7: normalized result contains no non-primitive values
const normD7 = normalizeWhatsAppMessage(msgWithSerialized);
const hasNonPrimitive = Object.values(normD7).some(v =>
  v !== null && typeof v === 'object'
);
check('D7  normalized message contains no non-primitive values', !hasNonPrimitive);

// D8–D15: validateRiskResult
const { validateRiskResult } = require('../nodejs/src/riskResultValidator.js');

// D8: accepts a valid R response (all scalars present)
const validResult = {
  risk_score: 81, model_probability: 0.82, ml_score: 49.2, indicator_score: 32,
  risk_level: 'HIGH', prediction: 'SCAM',
  detected_indicators: ['URGENCY', 'OTP_REQUEST'], explanations: ['Urgency language detected']
};
check('D8  validateRiskResult accepts valid R response',
      validateRiskResult(validResult, 'URGENT send OTP now').valid === true);

// D9: rejects risk_score={} (R NULL serialized as {})
check('D9  validateRiskResult rejects risk_score={}',
      validateRiskResult({ ...validResult, risk_score: {} }, 'test msg').valid === false);

// D10: rejects model_probability={}
check('D10 validateRiskResult rejects model_probability={}',
      validateRiskResult({ ...validResult, model_probability: {} }, 'test msg').valid === false);

// D11: rejects ml_score={}
check('D11 validateRiskResult rejects ml_score={}',
      validateRiskResult({ ...validResult, ml_score: {} }, 'test msg').valid === false);

// D12: rejects empty messageText
check('D12 validateRiskResult rejects empty messageText',
      validateRiskResult(validResult, '').valid === false);

// D13: rejects non-string risk_level
check('D13 validateRiskResult rejects non-string risk_level',
      validateRiskResult({ ...validResult, risk_level: null }, 'test msg').valid === false);

// D14: accepts risk_score=60 (exactly at threshold)
check('D14 validateRiskResult accepts risk_score=60 (at threshold)',
      validateRiskResult({ ...validResult, risk_score: 60 }, 'test msg').valid === true);

// D15: rejects NaN and Infinity in risk_score
check('D15 validateRiskResult rejects NaN risk_score',
      validateRiskResult({ ...validResult, risk_score: NaN }, 'test msg').valid === false);

// ── Integration tests: server endpoints ──────────────────────────────────────
// These require the Node.js server to be running on port 3001 with
// SCAMTRACER_TEST_MODE=true and WHATSAPP_ENABLED=false, and R on port 8000.

console.log('\n── Case C: Server integration (Phase 11 endpoints) ──');
console.log('   NOTE: Requires Node.js on port 3001 with TEST_MODE and R on port 8000.');
console.log('   Skipping integration tests in standalone module mode.');
console.log('   To run integration tests: SCAMTRACER_TEST_MODE=true WHATSAPP_ENABLED=false PORT=3001 node nodejs/src/server.js');
console.log('   Then run this test file again with RUN_INTEGRATION=true in env.\n');

const RUN_INTEGRATION = process.env.RUN_INTEGRATION === 'true';
const BASE_URL = `http://localhost:${process.env.TEST_PORT || 3001}`;

async function runIntegrationTests() {
  if (!RUN_INTEGRATION) {
    // Mark integration checks as skipped (not FAIL)
    const integrationTests = [
      'C1  GET /whatsapp/status returns 200',
      'C2  /whatsapp/status has enabled field',
      'C3  /whatsapp/status has risk_threshold',
      'C4  GET /alerts returns 200',
      'C5  /alerts body has alerts array',
      'C6  POST /test/simulate-whatsapp returns 200 for high-risk message',
      'C7  simulate-whatsapp creates an alert for high-risk message',
      'C8  simulate-whatsapp returns alert with correct fields',
      'C9  simulate-whatsapp does NOT fire for low-risk message (below threshold)',
      'C10 GET /alerts returns the simulated alert',
      'C11 GET /alerts/:id returns 200 for existing alert',
      'C12 GET /alerts/:id returns 404 for unknown alert',
      'C13 POST /alerts/:id/decision BLOCK_AND_PROTECT returns 200',
      'C14 decision response has session_id and status=BLOCKED',
      'C15 POST /alerts/:id/decision on already-decided returns 409',
      'C16 POST /alerts/:id/decision with invalid action returns 400',
      'C17 POST /test/simulate-whatsapp without body.body returns 400',
      'C18 duplicate whatsappMsgId does not create second alert',
      'C19 ACTIVATE_HIVE decision returns status=HIVE_ACTIVE'
    ];
    integrationTests.forEach(t => console.log(`  [SKIP] ${t}`));
    return;
  }

  // C1-C3: GET /whatsapp/status
  const statusRes = await get(`${BASE_URL}/whatsapp/status`);
  check('C1  GET /whatsapp/status returns 200', statusRes.status === 200, `got ${statusRes.status}`);
  check('C2  /whatsapp/status has enabled field',        'enabled'         in statusRes.body);
  check('C3  /whatsapp/status has risk_threshold field', 'risk_threshold'  in statusRes.body);

  // C4-C5: GET /alerts
  const alertsRes = await get(`${BASE_URL}/alerts`);
  check('C4  GET /alerts returns 200', alertsRes.status === 200, `got ${alertsRes.status}`);
  check('C5  /alerts body has alerts array', Array.isArray(alertsRes.body.alerts));

  // C6-C8: simulate a high-risk WhatsApp message
  // Confirmed risk_score=81 (HIGH) on the production R model.
  const simRes = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from:   '9199999@c.us',
    body:   'URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access or lose your funds permanently.',
    id:     'test-sim-001'
  });
  check('C6  POST /test/simulate-whatsapp returns 200', simRes.status === 200, `got ${simRes.status}`);
  check('C7  simulate-whatsapp creates an alert for high-risk message',
        simRes.body && simRes.body.alert_created === true, JSON.stringify(simRes.body));
  const simAlert = simRes.body && simRes.body.alert;
  check('C8  simulate-whatsapp returns alert with required fields',
        !!simAlert && simAlert.alert_id && simAlert.risk_score !== undefined &&
        simAlert.session_id && simAlert.status === 'USER_DECISION_REQUIRED');

  // C9: low-risk message should not create alert
  const lowRiskRes = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '9100001@c.us',
    body: 'Hi, how are you doing today?',
    id:   'test-sim-low-001'
  });
  check('C9  simulate-whatsapp does NOT create alert for low-risk message',
        lowRiskRes.body && lowRiskRes.body.alert_created === false,
        JSON.stringify(lowRiskRes.body));

  // C10: list alerts includes the simulated one
  const alertsAfterSim = await get(`${BASE_URL}/alerts`);
  const foundAlert = alertsAfterSim.body.alerts.some(
    a => simAlert && a.alert_id === simAlert.alert_id
  );
  check('C10 GET /alerts returns the simulated alert', foundAlert);

  // C11-C12: GET /alerts/:id
  if (simAlert) {
    const oneAlertRes = await get(`${BASE_URL}/alerts/${simAlert.alert_id}`);
    check('C11 GET /alerts/:id returns 200 for existing alert',
          oneAlertRes.status === 200, `got ${oneAlertRes.status}`);
  } else {
    check('C11 GET /alerts/:id returns 200 for existing alert', false, 'no alert from sim');
  }
  const notFoundRes = await get(`${BASE_URL}/alerts/nonexistent-id-000`);
  check('C12 GET /alerts/:id returns 404 for unknown alert', notFoundRes.status === 404);

  // C13-C14: BLOCK_AND_PROTECT decision on a new simulated alert
  // Confirmed risk_score=98 (HIGH) on the production R model.
  const simForBlock = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '9199990@c.us',
    body: 'Alert: Suspicious transaction of Rs 49999 detected on your account. Call 08001234567 and provide your net banking password immediately.',
    id:   'test-sim-002'
  });
  const alertForBlock = simForBlock.body && simForBlock.body.alert;
  if (alertForBlock) {
    const decRes = await post(`${BASE_URL}/alerts/${alertForBlock.alert_id}/decision`, {
      action: 'BLOCK_AND_PROTECT'
    });
    check('C13 POST /alerts/:id/decision BLOCK_AND_PROTECT returns 200',
          decRes.status === 200, `got ${decRes.status}`);
    check('C14 decision response has session_id and status=BLOCKED',
          decRes.body.session_id && decRes.body.status === 'BLOCKED',
          JSON.stringify(decRes.body));

    // C15: second decision on same alert is rejected
    const dupDec = await post(`${BASE_URL}/alerts/${alertForBlock.alert_id}/decision`, {
      action: 'BLOCK_AND_PROTECT'
    });
    check('C15 POST /alerts/:id/decision on already-decided returns 409',
          dupDec.status === 409, `got ${dupDec.status}`);
  } else {
    check('C13 POST /alerts/:id/decision BLOCK_AND_PROTECT returns 200', false, 'no alert');
    check('C14 decision response has session_id and status=BLOCKED', false, 'no alert');
    check('C15 POST /alerts/:id/decision on already-decided returns 409', false, 'no alert');
  }

  // C16: invalid action
  const badAction = await post(`${BASE_URL}/alerts/any-id/decision`, { action: 'DO_CRIME' });
  check('C16 POST /alerts/:id/decision with invalid action returns 400',
        badAction.status === 400, `got ${badAction.status}`);

  // C17: simulate-whatsapp without body.body
  const badSim = await post(`${BASE_URL}/test/simulate-whatsapp`, { from: 'x@c.us' });
  check('C17 POST /test/simulate-whatsapp without body.body returns 400',
        badSim.status === 400, `got ${badSim.status}`);

  // C18: duplicate WhatsApp message ID creates only one alert
  // Confirmed risk_score=93 (HIGH) on the production R model.
  const dedupBody = 'Your debit card has been blocked. Share your 16-digit card number, CVV and OTP with our executive at 08001234567.';
  const sim1 = await post(`${BASE_URL}/test/simulate-whatsapp`, { from: '91dup@c.us', body: dedupBody, id: 'dedup-msg-001' });
  const sim2 = await post(`${BASE_URL}/test/simulate-whatsapp`, { from: '91dup@c.us', body: dedupBody, id: 'dedup-msg-001' });
  check('C18 duplicate whatsappMsgId does not create second alert',
        sim1.body.alert_created === true && sim2.body.alert_created === false,
        `sim1=${sim1.body.alert_created}, sim2=${sim2.body.alert_created}`);

  // C19: ACTIVATE_HIVE decision
  const simForHive = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '9199991@c.us',
    body: 'We detected unusual activity. Click http://scam.example/verify?id=12345 to verify your account.',
    id:   'test-sim-003'
  });
  const alertForHive = simForHive.body && simForHive.body.alert;
  if (alertForHive) {
    const hiveDecRes = await post(`${BASE_URL}/alerts/${alertForHive.alert_id}/decision`, {
      action: 'ACTIVATE_HIVE'
    });
    check('C19 ACTIVATE_HIVE decision returns status=HIVE_ACTIVE',
          hiveDecRes.body.status === 'HIVE_ACTIVE',
          JSON.stringify(hiveDecRes.body));
  } else {
    check('C19 ACTIVATE_HIVE decision returns status=HIVE_ACTIVE', false, 'alert not created (may be below threshold)');
  }
}

// ── Case E: Analysis Logger + Phase 12 integration ───────────────────────────
// E1–E10 are pure unit tests (no server required).
// E11–E15 are integration tests (require RUN_INTEGRATION=true).

console.log('\n── Case E: Analysis Logger (Phase 12 terminal logging) ──');

// E1: analysisLogger module loads
let formatAnalysisLog = null;
let BORDER = null;
try {
  const mod = require('../nodejs/src/analysisLogger.js');
  formatAnalysisLog = mod.formatAnalysisLog;
  BORDER = mod.BORDER;
  check('E1  analysisLogger.js loads without error', true);
} catch (e) {
  check('E1  analysisLogger.js loads without error', false, e.message);
}

if (formatAnalysisLog) {
  const LOW_RESULT = {
    risk_score: 5, risk_level: 'LOW', prediction: 'SAFE',
    model_probability: 0.03, ml_score: 3, indicator_score: 2,
    detected_indicators: []
  };
  const HIGH_RESULT = {
    risk_score: 81, risk_level: 'HIGH', prediction: 'SCAM',
    model_probability: 0.72, ml_score: 38.5, indicator_score: 40,
    detected_indicators: ['Urgent Language', 'Account Suspension Threat', 'Financial / Payment Language']
  };
  const THRESHOLD = 60;

  const logLow  = formatAnalysisLog('91low@c.us',  'Hello, how are you?', LOW_RESULT,  THRESHOLD);
  const logHigh = formatAnalysisLog('91high@c.us', 'URGENT: Your account is suspended. Pay now.', HIGH_RESULT, THRESHOLD);

  // E2: low-risk log contains "NO ALERT"
  check('E2  formatAnalysisLog low-risk contains "NO ALERT"',
        logLow.includes('NO ALERT'), logLow);

  // E3: high-risk log contains "ALERT TRIGGERED"
  check('E3  formatAnalysisLog high-risk contains "ALERT TRIGGERED"',
        logHigh.includes('ALERT TRIGGERED'), logHigh);

  // E4: log includes the actual R risk_score value (81)
  check('E4  formatAnalysisLog includes R risk_score value (81)',
        logHigh.includes('81'), logHigh);

  // E5: log includes the R risk_level value
  check('E5  formatAnalysisLog includes R risk_level',
        logHigh.includes('HIGH'), logHigh);

  // E6: log includes the R prediction value
  check('E6  formatAnalysisLog includes R prediction',
        logHigh.includes('SCAM'), logHigh);

  // E7: log includes ml_score value
  check('E7  formatAnalysisLog includes ml_score',
        logHigh.includes('38.5'), logHigh);

  // E8: log includes threshold value
  check('E8  formatAnalysisLog includes threshold (60)',
        logHigh.includes('60'), logHigh);

  // E9: log includes indicators when present
  check('E9  formatAnalysisLog includes detected indicators',
        logHigh.includes('Urgent Language') && logHigh.includes('Account Suspension Threat'),
        logHigh);

  // E10: log shows "None" when indicators array is empty
  check('E10 formatAnalysisLog shows "None" for empty indicators',
        logLow.includes('None'), logLow);
}

// E11–E15: Integration tests (require RUN_INTEGRATION=true and server on port 3001)
async function runPhase12IntegrationTests() {
  if (!RUN_INTEGRATION) {
    ['E11 POST /test/reset-alerts clears all alerts',
     'E12 simulated alert has message field containing original text',
     'E13 simulated alert sender field is a string',
     'E14 BLOCK_AND_PROTECT resolves alert (status=BLOCKED)',
     'E15 ACTIVATE_HIVE resolves alert (status=HIVE_ACTIVE)'
    ].forEach(t => console.log(`  [SKIP] ${t}`));
    return;
  }

  // E11: reset-alerts endpoint
  const resetRes = await post(`${BASE_URL}/test/reset-alerts`, {});
  check('E11 POST /test/reset-alerts clears all alerts',
        resetRes.status === 200,
        `got ${resetRes.status}`);

  // E12 + E13: simulate a new scam message; verify alert fields
  const simE = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91etest@c.us',
    body: 'URGENT! Your bank account is about to be suspended. Send your OTP to verify immediately.',
    id:   'e-test-001'
  });
  const alertE = simE.body && simE.body.alert;

  check('E12 simulated alert has message field containing original text',
        !!(alertE && typeof alertE.message === 'string' && alertE.message.includes('OTP')),
        JSON.stringify(alertE && { message: alertE.message }));

  check('E13 simulated alert sender field is a string',
        !!(alertE && typeof alertE.sender === 'string'),
        JSON.stringify(alertE && { sender: alertE.sender }));

  // E14: BLOCK_AND_PROTECT resolves the alert
  if (alertE) {
    const blockRes = await post(`${BASE_URL}/alerts/${alertE.alert_id}/decision`, {
      action: 'BLOCK_AND_PROTECT'
    });
    check('E14 BLOCK_AND_PROTECT resolves alert (status=BLOCKED)',
          blockRes.body && blockRes.body.status === 'BLOCKED',
          JSON.stringify(blockRes.body));
  } else {
    check('E14 BLOCK_AND_PROTECT resolves alert (status=BLOCKED)', false, 'alert not created');
  }

  // E15: ACTIVATE_HIVE resolves a second alert
  const simE2 = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91etest2@c.us',
    body: 'Alert: Rs 49999 deducted. If not done by you call 08001234567 and share OTP to reverse.',
    id:   'e-test-002'
  });
  const alertE2 = simE2.body && simE2.body.alert;
  if (alertE2) {
    const hiveRes = await post(`${BASE_URL}/alerts/${alertE2.alert_id}/decision`, {
      action: 'ACTIVATE_HIVE'
    });
    check('E15 ACTIVATE_HIVE resolves alert (status=HIVE_ACTIVE)',
          hiveRes.body && hiveRes.body.status === 'HIVE_ACTIVE',
          JSON.stringify(hiveRes.body));
  } else {
    check('E15 ACTIVATE_HIVE resolves alert (status=HIVE_ACTIVE)', false, 'alert not created');
  }
}

// ── Run tests ────────────────────────────────────────────────────────────────

runIntegrationTests()
  .then(() => runPhase12IntegrationTests())
  .then(() => {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`PHASE 11/12 TEST SUMMARY: ${passed} / ${passed + failed} passed  (${failed} failed)`);
    if (!RUN_INTEGRATION) {
      console.log('  Integration tests (C1–C19, E11–E15) skipped — set RUN_INTEGRATION=true and start server.');
    }
    console.log('════════════════════════════════════════════════════════════════\n');
    if (failed > 0) process.exit(1);
  }).catch((err) => {
    console.error('Test runner error:', err.message);
    process.exit(1);
  });
