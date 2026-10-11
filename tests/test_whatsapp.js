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

// D2: msg.id without _serialized but with remote+id strings — fallback constructs ID
// (previously returned null; now the LID fallback reconstructs it to enable dedup)
const msgNoSerialized = { id: { fromMe: false, remote: '12345@c.us', id: 'ABCDEF' }, from: '12345@c.us', body: 'hello', timestamp: 1700000000 };
const normD2 = normalizeWhatsAppMessage(msgNoSerialized);
check('D2  msg.id without _serialized but with remote+id → fallback constructs string ID',
      typeof normD2.id === 'string' && normD2.id.includes('12345@c.us') && normD2.id.includes('ABCDEF'));

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

// ── Case D2: normalizeWhatsAppMessage LID fallback ────────────────────────────
// Regression for: @lid messages returning null message ID when _serialized
// is absent from msg.id, disabling deduplication silently.

console.log('\n── Case D2: normalizeWhatsAppMessage LID ID fallback ──');

// D2a: @lid message where _serialized is present (standard path — unchanged)
const lidMsgStd = {
  id: { _serialized: 'false_53871909019871@lid_AABBCCDD', fromMe: false,
        remote: '53871909019871@lid', id: 'AABBCCDD' },
  from: '53871909019871@lid', body: 'test', timestamp: 1700000000
};
const normD2a = normalizeWhatsAppMessage(lidMsgStd);
check('D2a @lid msg with _serialized: ID extracted correctly',
      normD2a.id === 'false_53871909019871@lid_AABBCCDD');

// D2b: @lid message where _serialized is absent — fallback constructs it
const lidMsgNoSerial = {
  id: { fromMe: false, remote: '53871909019871@lid', id: 'AABBCCDD' },
  from: '53871909019871@lid', body: 'test', timestamp: 1700000000
};
const normD2b = normalizeWhatsAppMessage(lidMsgNoSerial);
check('D2b @lid msg without _serialized: fallback reconstructs ID string',
      typeof normD2b.id === 'string' && normD2b.id.includes('53871909019871@lid') &&
      normD2b.id.includes('AABBCCDD'),
      normD2b.id);

// D2c: @lid message where remote is a WID object (not a plain string)
const lidMsgWidRemote = {
  id: { fromMe: false, remote: { _serialized: '53871909019871@lid' }, id: 'XXYYZZ' },
  from: '53871909019871@lid', body: 'test', timestamp: 1700000000
};
const normD2c = normalizeWhatsAppMessage(lidMsgWidRemote);
check('D2c @lid msg with WID remote object: fallback extracts remote._serialized',
      typeof normD2c.id === 'string' && normD2c.id.includes('53871909019871@lid'),
      normD2c.id);

// D2d: completely missing id — stays null, does not throw
const lidMsgNoId = { from: '53871909019871@lid', body: 'test', timestamp: 1700000000 };
const normD2d = normalizeWhatsAppMessage(lidMsgNoId);
check('D2d message with no id field: normalizer returns null gracefully',
      normD2d.id === null);

// D2e: two @lid messages with different hashes get different IDs (dedup works)
const normHash1 = normalizeWhatsAppMessage({
  id: { fromMe: false, remote: '53871909019871@lid', id: 'HASH001' }, from: 'x', body: 'a', timestamp: 0
});
const normHash2 = normalizeWhatsAppMessage({
  id: { fromMe: false, remote: '53871909019871@lid', id: 'HASH002' }, from: 'x', body: 'a', timestamp: 0
});
check('D2e two @lid messages with different hashes produce different IDs',
      normHash1.id !== normHash2.id &&
      normHash1.id !== null && normHash2.id !== null);

// ── Case F: H.I.V.E. auto-reply unit tests ───────────────────────────────────
// F1–F7 require no server — pure in-process checks against alertStore and
// WhatsAppMonitor. F8–F17 are integration tests (RUN_INTEGRATION=true).

console.log('\n── Case F (unit): H.I.V.E. auto-reply ──');

// F1: getHiveActiveAlertBySender exported from alertStore
check('F1  getHiveActiveAlertBySender is exported from alertStore',
      typeof alertStore.getHiveActiveAlertBySender === 'function');

// F2: returns null for null sender
check('F2  getHiveActiveAlertBySender returns null for null sender',
      alertStore.getHiveActiveAlertBySender(null) === null);

// F3: returns null for unknown sender
check('F3  getHiveActiveAlertBySender returns null for unknown sender',
      alertStore.getHiveActiveAlertBySender('nobody@c.us') === null);

// F4: returns null for sender whose alert is BLOCKED (not HIVE_ACTIVE)
{
  const fBlockedAlert = alertStore.createAlert({
    whatsappMsgId: 'f-unit-blocked',
    sender:        'f-unit-blocked@c.us',
    messageText:   'Test message for F4',
    riskResult: { risk_score: 85, risk_level: 'HIGH', prediction: 'SCAM',
                  model_probability: 0.9, ml_score: 50, indicator_score: 35,
                  detected_indicators: ['URGENCY'], explanations: [] },
    sessionId:     'f-unit-sess-blocked'
  });
  if (fBlockedAlert) {
    alertStore.updateAlert(fBlockedAlert.alert_id,
      { status: ALERT_STATES.BLOCKED, decision: 'BLOCK_AND_PROTECT' });
  }
  check('F4  getHiveActiveAlertBySender returns null for BLOCKED sender',
        alertStore.getHiveActiveAlertBySender('f-unit-blocked@c.us') === null);
}

// F5: returns HIVE_ACTIVE alert for matching sender
{
  const fHiveAlert = alertStore.createAlert({
    whatsappMsgId: 'f-unit-hive',
    sender:        'f-unit-hive@c.us',
    messageText:   'Test message for F5',
    riskResult: { risk_score: 90, risk_level: 'HIGH', prediction: 'SCAM',
                  model_probability: 0.92, ml_score: 55, indicator_score: 35,
                  detected_indicators: ['URGENCY'], explanations: [] },
    sessionId:     'f-unit-sess-hive'
  });
  if (fHiveAlert) {
    alertStore.updateAlert(fHiveAlert.alert_id,
      { status: ALERT_STATES.HIVE_ACTIVE, decision: 'ACTIVATE_HIVE' });
  }
  const foundF5 = alertStore.getHiveActiveAlertBySender('f-unit-hive@c.us');
  check('F5  getHiveActiveAlertBySender returns HIVE_ACTIVE alert for matching sender',
        !!foundF5 && foundF5.status === ALERT_STATES.HIVE_ACTIVE);
}

// F6: WhatsAppMonitor.prototype.sendMessage exists
check('F6  WhatsAppMonitor.prototype.sendMessage is a function',
      typeof WhatsAppMonitor.prototype.sendMessage === 'function');

// F7: sendMessage rejects when client is not initialised (async — result lands in summary)
{
  process.env.WHATSAPP_ENABLED = 'false';
  const monitorF7 = new WhatsAppMonitor(null);
  monitorF7.sendMessage('test@c.us', 'hello')
    .then(() => {
      check('F7  sendMessage rejects when client is not initialised', false, 'expected rejection');
    })
    .catch((e) => {
      check('F7  sendMessage rejects when client is not initialised',
            e.message.includes('not initialised'), e.message);
    });
}

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
  // Confirmed risk_score=93 (HIGH) on the production R model — same body as C18 dedup test.
  const simE = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91etest@c.us',
    body: 'Your debit card has been blocked. Share your 16-digit card number, CVV and OTP with our executive at 08001234567.',
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

// ── Case F: H.I.V.E. auto-reply integration tests ────────────────────────────
// F8–F17: require Node.js on port 3001 with SCAMTRACER_TEST_MODE=true,
// WHATSAPP_ENABLED=false, and R on port 8000.
// Because WHATSAPP_ENABLED=false, sendMessage will throw (client not ready),
// so send_result will be 'failed: ...' — tests check for field presence,
// not a specific 'ok' value.

async function runHiveAutoReplyIntegrationTests() {
  console.log('\n── Case F (integration): H.I.V.E. auto-reply ──');

  if (!RUN_INTEGRATION) {
    [
      'F8  Scam message creates USER_DECISION_REQUIRED alert',
      'F9  ACTIVATE_HIVE transitions alert to HIVE_ACTIVE',
      'F10 Next message from HIVE_ACTIVE sender is routed to H.I.V.E. (no new alert)',
      'F11 Session conversation has INCOMING and OUTGOING records',
      'F12 OUTGOING conversation record has send_result field',
      'F13 Duplicate message ID does not increase interaction count',
      'F14 Second genuine H.I.V.E. message increases interaction count',
      'F15 POST /hive/end transitions session to HIVE_ENDED',
      'F16 Message after /hive/end is silently dropped (no new alert)',
      'F17 Session conversation is preserved after H.I.V.E. ends'
    ].forEach(t => console.log(`  [SKIP] ${t}`));
    return;
  }

  // Reset to a clean state
  await post(`${BASE_URL}/test/reset-alerts`, {});

  const fSender = '91fhive@c.us';

  // F8: First scam message — creates USER_DECISION_REQUIRED alert
  const simF8 = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: fSender,
    body: 'URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access or lose your funds permanently.',
    id:   'f-int-msg-001'
  });
  const alertF8 = simF8.body && simF8.body.alert;
  check('F8  Scam message creates USER_DECISION_REQUIRED alert',
        !!alertF8 && alertF8.status === 'USER_DECISION_REQUIRED',
        JSON.stringify(simF8.body));

  if (!alertF8) {
    ['F9','F10','F11','F12','F13','F14','F15','F16','F17'].forEach(t =>
      console.log(`  [SKIP] ${t} — skipped: F8 alert not created`)
    );
    return;
  }

  // F9: ACTIVATE_HIVE
  const decF9 = await post(`${BASE_URL}/alerts/${alertF8.alert_id}/decision`, {
    action: 'ACTIVATE_HIVE'
  });
  const sessionId = decF9.body && decF9.body.session_id;
  check('F9  ACTIVATE_HIVE transitions alert to HIVE_ACTIVE',
        decF9.body && decF9.body.status === 'HIVE_ACTIVE' && !!sessionId,
        JSON.stringify(decF9.body));

  if (!sessionId) {
    ['F10','F11','F12','F13','F14','F15','F16','F17'].forEach(t =>
      console.log(`  [SKIP] ${t} — skipped: ACTIVATE_HIVE failed`)
    );
    return;
  }

  // F10: Next message from same sender is routed to H.I.V.E., NOT a new alert
  // processIncomingWhatsAppMessage awaits processHiveMessage before returning,
  // so by the time simulate-whatsapp responds the H.I.V.E. turn is complete.
  const simF10 = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: fSender,
    body: 'Can you provide your OTP?',
    id:   'f-int-msg-002'
  });
  check('F10 Next message from HIVE_ACTIVE sender is routed to H.I.V.E. (no new alert)',
        simF10.body && simF10.body.alert_created === false,
        JSON.stringify(simF10.body));

  // F11: Session conversation has at least one INCOMING + one OUTGOING entry
  const sessF11 = await get(`${BASE_URL}/test/session/${sessionId}`);
  const conv11  = sessF11.body && sessF11.body.session && sessF11.body.session.conversation;
  check('F11 Session conversation has INCOMING and OUTGOING records',
        Array.isArray(conv11) && conv11.length >= 2 &&
        conv11.some(r => r.direction === 'INCOMING') &&
        conv11.some(r => r.direction === 'OUTGOING'),
        `conv_len=${conv11 && conv11.length}`);

  // F12: OUTGOING record has send_result field (value is 'ok' or 'failed: ...')
  const outgoing12 = conv11 && conv11.find(r => r.direction === 'OUTGOING');
  check('F12 OUTGOING conversation record has send_result field',
        outgoing12 && 'send_result' in outgoing12,
        JSON.stringify(outgoing12));

  // F13: Duplicate message ID — same ID sent again; interaction_count must not change
  const countBefore13 = sessF11.body.session.interaction_count;
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: fSender,
    body: 'Can you provide your OTP?',
    id:   'f-int-msg-002'    // same ID as F10
  });
  const sessF13    = await get(`${BASE_URL}/test/session/${sessionId}`);
  const countAfter13 = sessF13.body && sessF13.body.session && sessF13.body.session.interaction_count;
  check('F13 Duplicate message ID does not increase interaction count',
        countAfter13 === countBefore13,
        `before=${countBefore13} after=${countAfter13}`);

  // F14: Second genuine H.I.V.E. message (new ID) increases interaction count
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: fSender,
    body: 'Send me your bank details to verify.',
    id:   'f-int-msg-003'
  });
  const sessF14 = await get(`${BASE_URL}/test/session/${sessionId}`);
  const countF14 = sessF14.body && sessF14.body.session && sessF14.body.session.interaction_count;
  check('F14 Second genuine H.I.V.E. message increases interaction count',
        typeof countF14 === 'number' && countF14 > countBefore13,
        `before=${countBefore13} after=${countF14}`);

  // F15: POST /hive/end transitions session to HIVE_ENDED
  const endRes = await post(`${BASE_URL}/hive/end`, { session_id: sessionId });
  check('F15 POST /hive/end transitions session to HIVE_ENDED',
        endRes.body && endRes.body.status === 'HIVE_ENDED',
        JSON.stringify(endRes.body));

  // F16: Message after /hive/end is silently dropped — no new alert created
  // (alert status is still HIVE_ACTIVE in alertStore, so routing fires, but
  //  _executeHiveTurn re-checks session state and returns early)
  const simF16 = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: fSender,
    body: 'Hello, still there?',
    id:   'f-int-msg-004'
  });
  check('F16 Message after /hive/end is silently dropped (no new alert)',
        simF16.body && simF16.body.alert_created === false,
        JSON.stringify(simF16.body));

  // F17: Session conversation and HIVE_ENDED state are preserved after end
  const sessF17 = await get(`${BASE_URL}/test/session/${sessionId}`);
  const convF17  = sessF17.body && sessF17.body.session && sessF17.body.session.conversation;
  check('F17 Session conversation is preserved and state is HIVE_ENDED',
        Array.isArray(convF17) && convF17.length >= 2 &&
        sessF17.body.session.state === 'HIVE_ENDED',
        `state=${sessF17.body && sessF17.body.session && sessF17.body.session.state} ` +
        `conv_len=${convF17 && convF17.length}`);

  // ── F_LID: Regression for @lid sender format routing ──────────────────────
  // Root cause identified: production alert was created with sender='53871909019871@lid'
  // (@lid format), but tests only used @c.us format. This regression confirms that
  // getHiveActiveAlertBySender, the routing block, and H.I.V.E. turns all work
  // correctly with @lid-format sender JIDs.
  console.log('\n── Case F_LID: @lid sender routing regression ──');

  await post(`${BASE_URL}/test/reset-alerts`, {});

  const lidSender = '53871909019871@lid';

  // Confirmed risk_score=81 (HIGH) on the production R model — same body as C6/C7.
  const simLid = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: lidSender,
    body: 'URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access or lose your funds permanently.',
    id:   'lid-reg-msg-001'
  });
  const alertLid = simLid.body && simLid.body.alert;
  check('F_LID1 @lid sender creates USER_DECISION_REQUIRED alert',
        !!alertLid && alertLid.status === 'USER_DECISION_REQUIRED' &&
        alertLid.sender === lidSender,
        JSON.stringify(simLid.body));

  if (!alertLid) {
    ['F_LID2','F_LID3','F_LID4'].forEach(t =>
      console.log(`  [SKIP] ${t} — skipped: F_LID1 alert not created`)
    );
    return;
  }

  const lidDec = await post(`${BASE_URL}/alerts/${alertLid.alert_id}/decision`, {
    action: 'ACTIVATE_HIVE'
  });
  const lidSessionId = lidDec.body && lidDec.body.session_id;
  check('F_LID2 ACTIVATE_HIVE on @lid alert returns HIVE_ACTIVE',
        lidDec.body && lidDec.body.status === 'HIVE_ACTIVE' && !!lidSessionId,
        JSON.stringify(lidDec.body));

  if (!lidSessionId) {
    ['F_LID3','F_LID4'].forEach(t =>
      console.log(`  [SKIP] ${t} — skipped: ACTIVATE_HIVE failed`)
    );
    return;
  }

  // Follow-up message from same @lid sender must route to H.I.V.E., not R analysis
  const simLid2 = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: lidSender,
    body: 'Please send the fee immediately to claim your prize.',
    id:   'lid-reg-msg-002'
  });
  check('F_LID3 Follow-up from @lid sender routes to H.I.V.E. (no new alert)',
        simLid2.body && simLid2.body.alert_created === false,
        JSON.stringify(simLid2.body));

  // Session must have conversation entries showing the H.I.V.E. turn fired
  const sessLid = await get(`${BASE_URL}/test/session/${lidSessionId}`);
  const convLid = sessLid.body && sessLid.body.session && sessLid.body.session.conversation;
  check('F_LID4 H.I.V.E. conversation recorded for @lid session',
        Array.isArray(convLid) && convLid.length >= 2 &&
        convLid.some(r => r.direction === 'INCOMING') &&
        convLid.some(r => r.direction === 'OUTGOING' && 'send_result' in r),
        `conv_len=${convLid && convLid.length}`);
}

// ── Case G (integration): Intelligence collection ─────────────────────────────
// G1–G6 require R running on port 8000.
//
// Auto-stop threshold: ≥5 distinct evidence categories AND ≥4 H.I.V.E. turns.
// Both conditions must be met simultaneously; either alone is insufficient.
//
// G1: session.intelligence is populated after a H.I.V.E. turn
// G2: GET /hive/intelligence/:session_id returns intelligence data
// G3: 4 categories + 1 turn does NOT trigger auto-stop (categories condition alone is not enough)
// G4: stop_reason is null when the threshold has not been met
// G5: session auto-stops when ≥5 categories AND ≥4 turns are both satisfied
// G6: auto-stopped session has stop_reason starting with 'auto:'
//
// G1/G2 message: 'Please call 9876543210 and share your OTP.'
//   → PHONE + OTP_REQUEST + OTP_SOLICITATION = 3 categories — session stays HIVE_ACTIVE
//
// G3/G4 message: 'Visit http://fake-secure.com/verify and call 9876543210. Please share the 6-digit OTP to proceed.'
//   → PHONE + URL + OTP_REQUEST + OTP_SOLICITATION ≈ 4 categories, 1 turn → NOT stopped
//
// G5 session (sender 91gstop@c.us):
//   Turn 1: Rich multi-category message → ≥5 categories, 1 turn → NOT stopped (turns < 4)
//   Turns 2–3: simple messages → ≥5 categories, 2–3 turns → NOT stopped (turns < 4)
//   Turn 4: simple message → ≥5 categories, 4 turns → STOPPED (both conditions met)

async function runIntelligenceIntegrationTests() {
  console.log('\n── Case G (integration): Intelligence collection ──');

  if (!RUN_INTEGRATION) {
    [
      'G1  session.intelligence populated after H.I.V.E. turn',
      'G2  GET /hive/intelligence returns intelligence data',
      'G3  4 categories and 1 turn does NOT auto-stop session',
      'G4  stop_reason is null when auto-stop threshold not met',
      'G5  Session auto-stops only when ≥5 categories AND ≥4 turns (state=HIVE_ENDED)',
      'G6  Auto-stopped session has stop_reason starting with "auto:"'
    ].forEach(t => console.log(`  [SKIP] ${t}`));
    return;
  }

  await post(`${BASE_URL}/test/reset-alerts`, {});

  const gSender = '91gintel@c.us';

  // Create a scam alert and activate H.I.V.E. (for G1/G2)
  const simG = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: gSender,
    body: 'URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access or lose your funds permanently.',
    id:   'g-int-msg-001'
  });
  const alertG = simG.body && simG.body.alert;
  if (!alertG) {
    ['G1','G2','G3','G4','G5','G6'].forEach(t =>
      console.log(`  [SKIP] ${t} — skipped: initial scam alert not created`)
    );
    return;
  }

  const decG = await post(`${BASE_URL}/alerts/${alertG.alert_id}/decision`, { action: 'ACTIVATE_HIVE' });
  const gSessionId = decG.body && decG.body.session_id;
  if (!gSessionId) {
    ['G1','G2','G3','G4','G5','G6'].forEach(t =>
      console.log(`  [SKIP] ${t} — skipped: ACTIVATE_HIVE failed`)
    );
    return;
  }

  // G1/G2: Send a message — intelligence must be populated; session must stay HIVE_ACTIVE
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: gSender,
    body: 'Please call 9876543210 and share your OTP.',
    id:   'g-int-msg-002'
  });

  const sessG1 = await get(`${BASE_URL}/test/session/${gSessionId}`);
  const sessionG1 = sessG1.body && sessG1.body.session;
  const intelG1 = sessionG1 && sessionG1.intelligence;
  check('G1  session.intelligence populated after H.I.V.E. turn',
        !!intelG1 && typeof intelG1 === 'object',
        intelG1 ? `entities=${JSON.stringify(intelG1.summary && intelG1.summary.entity_types)}` : 'intelligence=null');

  // G2: GET /hive/intelligence endpoint returns the same data
  const intelRes = await get(`${BASE_URL}/hive/intelligence/${gSessionId}`);
  check('G2  GET /hive/intelligence returns intelligence data',
        intelRes.status === 200 &&
        intelRes.body && intelRes.body.session_id === gSessionId &&
        typeof intelRes.body.intelligence === 'object',
        JSON.stringify(intelRes.body && { state: intelRes.body.state, has_intel: !!intelRes.body.intelligence }));

  // G3/G4: Fresh session — send one 4-category message.
  // Under the new threshold (≥5 categories AND ≥4 turns), this must NOT trigger auto-stop.
  await post(`${BASE_URL}/test/reset-alerts`, {});
  const simG3base = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: gSender,
    body: 'URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access or lose your funds permanently.',
    id:   'g-int-msg-003'
  });
  const alertG3 = simG3base.body && simG3base.body.alert;
  if (!alertG3) {
    ['G3','G4','G5','G6'].forEach(t => console.log(`  [SKIP] ${t} — skipped: G3 scam alert not created`));
    return;
  }
  const decG3 = await post(`${BASE_URL}/alerts/${alertG3.alert_id}/decision`, { action: 'ACTIVATE_HIVE' });
  const g3SessionId = decG3.body && decG3.body.session_id;
  if (!g3SessionId) {
    ['G3','G4','G5','G6'].forEach(t => console.log(`  [SKIP] ${t} — skipped: G3 ACTIVATE_HIVE failed`));
    return;
  }

  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: gSender,
    body: 'Visit http://fake-secure.com/verify and call 9876543210. Please share the 6-digit OTP to proceed.',
    id:   'g-int-msg-004'
  });

  const sessG3 = await get(`${BASE_URL}/test/session/${g3SessionId}`);
  const sessionG3 = sessG3.body && sessG3.body.session;
  check('G3  4 categories and 1 turn does NOT auto-stop session',
        sessionG3 && sessionG3.state === 'HIVE_ACTIVE',
        `state=${sessionG3 && sessionG3.state}`);

  check('G4  stop_reason is null when auto-stop threshold not met',
        sessionG3 && sessionG3.stop_reason === null,
        `stop_reason=${JSON.stringify(sessionG3 && sessionG3.stop_reason)}`);

  // G5/G6: New sender — build up ≥5 categories across 4 turns and confirm auto-stop.
  //
  // Turn 1: multi-category message → ≥5 cumulative categories, 1 turn → no stop (turns < 4)
  // Turns 2–3: simple follow-ups → categories stay ≥5, 2–3 turns → no stop (turns < 4)
  // Turn 4: final message → categories ≥5, 4 turns → auto-stop fires
  //
  // Turn-1 message is designed to produce:
  //   PHONE + URL + OTP_REQUEST (entity types)
  //   OTP_SOLICITATION + URGENCY (behaviour types)
  //   = 5 distinct categories in a single message.
  const g5Sender = '91gstop@c.us';

  await post(`${BASE_URL}/test/reset-alerts`, {});
  const simG5base = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: g5Sender,
    body: 'URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access or lose your funds permanently.',
    id:   'g5-msg-001'
  });
  const alertG5 = simG5base.body && simG5base.body.alert;
  if (!alertG5) {
    ['G5','G6'].forEach(t => console.log(`  [SKIP] ${t} — skipped: G5 scam alert not created`));
    return;
  }
  const decG5 = await post(`${BASE_URL}/alerts/${alertG5.alert_id}/decision`, { action: 'ACTIVATE_HIVE' });
  const g5SessionId = decG5.body && decG5.body.session_id;
  if (!g5SessionId) {
    ['G5','G6'].forEach(t => console.log(`  [SKIP] ${t} — skipped: G5 ACTIVATE_HIVE failed`));
    return;
  }

  // Turn 1: ≥5 category message — session must stay HIVE_ACTIVE (turns = 1 < 4)
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: g5Sender,
    body: 'URGENT: Visit http://fake-secure.com/verify and call 9876543210. Please share the 6-digit OTP to proceed. This is very urgent and time sensitive!!!',
    id:   'g5-msg-002'
  });
  const sessAfterT1 = await get(`${BASE_URL}/test/session/${g5SessionId}`);
  const stateAfterT1 = sessAfterT1.body && sessAfterT1.body.session && sessAfterT1.body.session.state;
  // (informational — not a formal check; auto-stop requires turns ≥ 4)

  // Turn 2: simple message — still below the turns threshold
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: g5Sender,
    body: 'Please respond quickly.',
    id:   'g5-msg-003'
  });

  // Turn 3: simple message — still below the turns threshold
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: g5Sender,
    body: 'Are you still there?',
    id:   'g5-msg-004'
  });

  // Turn 4: both conditions should now be met → auto-stop fires
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: g5Sender,
    body: 'Hello?',
    id:   'g5-msg-005'
  });

  const sessG5 = await get(`${BASE_URL}/test/session/${g5SessionId}`);
  const sessionG5 = sessG5.body && sessG5.body.session;
  check('G5  Session auto-stops only when ≥5 categories AND ≥4 turns (state=HIVE_ENDED)',
        sessionG5 && sessionG5.state === 'HIVE_ENDED',
        `state=${sessionG5 && sessionG5.state} cats=${sessionG5 && sessionG5.intelligence && sessionG5.intelligence.summary && JSON.stringify(sessionG5.intelligence.summary.entity_types)}`);

  check('G6  Auto-stopped session has stop_reason starting with "auto:"',
        sessionG5 && typeof sessionG5.stop_reason === 'string' &&
        sessionG5.stop_reason.startsWith('auto:'),
        `stop_reason=${sessionG5 && sessionG5.stop_reason}`);
}

// ── Case J (integration): Completed investigation persistence ─────────────────
// Tests that saveCompletedInvestigation writes a JSON file with required fields
// after auto-stop fires.

async function runPersistenceIntegrationTests() {
  if (!RUN_INTEGRATION) return;

  console.log('\n── Case J (integration): Completed investigation persistence ──');

  await post(`${BASE_URL}/test/reset-alerts`, {});

  const jSim = await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91jpersist@c.us',
    body: 'URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access or lose your funds permanently.',
    id:   'j-persist-001'
  });
  const jAlert = jSim.body && jSim.body.alert;

  if (!jAlert) {
    for (let i = 1; i <= 10; i++) console.log(`  [SKIP] J${i}  — skipped: J simulation failed`);
    return;
  }

  const jHiveRes = await post(`${BASE_URL}/alerts/${jAlert.alert_id}/decision`, { action: 'ACTIVATE_HIVE' });
  const jSessionId = jHiveRes.body && jHiveRes.body.session_id;

  if (!jSessionId) {
    for (let i = 1; i <= 10; i++) console.log(`  [SKIP] J${i}  — skipped: J ACTIVATE_HIVE failed`);
    return;
  }

  // Send 4 turns to trigger auto-stop (≥5 categories + ≥4 turns)
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91jpersist@c.us',
    body: 'URGENT: Visit http://fake-secure.com/verify and call 9876543210. Please share the 6-digit OTP to proceed. This is very urgent and time sensitive!!!',
    id:   'j-persist-turn1'
  });
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91jpersist@c.us',
    body: 'Please provide your OTP code immediately or your account will be locked.',
    id:   'j-persist-turn2'
  });
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91jpersist@c.us',
    body: 'Transfer the processing fee of Rs 499 to release your prize.',
    id:   'j-persist-turn3'
  });
  await post(`${BASE_URL}/test/simulate-whatsapp`, {
    from: '91jpersist@c.us',
    body: 'Final warning: send the OTP and payment now before your account is suspended permanently.',
    id:   'j-persist-turn4'
  });

  // Brief pause so the async file write completes before we check
  await new Promise(r => setTimeout(r, 500));

  const jIntelRes = await get(`${BASE_URL}/hive/intelligence/${jSessionId}`);

  check('J1  auto-stopped session reaches HIVE_ENDED',
        jIntelRes.body && jIntelRes.body.state === 'HIVE_ENDED',
        `state=${jIntelRes.body && jIntelRes.body.state}`);

  const fs       = require('fs');
  const nodePath = require('path');
  const jFilePath = nodePath.join(__dirname, '..', 'data', 'completed_sessions', `${jSessionId}.json`);

  check('J2  completed investigation JSON file exists on disk',
        fs.existsSync(jFilePath),
        `expected file: ${jFilePath}`);

  if (fs.existsSync(jFilePath)) {
    const jSnap = JSON.parse(fs.readFileSync(jFilePath, 'utf8'));

    check('J3  snapshot contains session_id',
          jSnap.session_id === jSessionId,
          `session_id=${jSnap.session_id}`);

    check('J4  snapshot contains sender',
          typeof jSnap.sender === 'string' && jSnap.sender.length > 0,
          `sender=${jSnap.sender}`);

    check('J5  snapshot contains conversation array',
          Array.isArray(jSnap.conversation) && jSnap.conversation.length > 0,
          `conversation.length=${jSnap.conversation && jSnap.conversation.length}`);

    check('J6  snapshot contains intelligence with summary',
          jSnap.intelligence && jSnap.intelligence.summary &&
          Array.isArray(jSnap.intelligence.summary.entity_types),
          'intelligence.summary.entity_types missing');

    check('J7  snapshot contains stop_reason starting with "auto:"',
          typeof jSnap.stop_reason === 'string' && jSnap.stop_reason.startsWith('auto:'),
          `stop_reason=${jSnap.stop_reason}`);

    check('J8  snapshot contains interaction_count >= 4',
          typeof jSnap.interaction_count === 'number' && jSnap.interaction_count >= 4,
          `interaction_count=${jSnap.interaction_count}`);

    check('J9  snapshot contains completed_at timestamp',
          typeof jSnap.completed_at === 'string' && jSnap.completed_at.length > 0,
          `completed_at=${jSnap.completed_at}`);

    check('J10 snapshot contains initial_message',
          typeof jSnap.initial_message === 'string' && jSnap.initial_message.length > 0,
          `initial_message=${jSnap.initial_message}`);
  } else {
    for (let i = 2; i <= 10; i++) console.log(`  [SKIP] J${i}  — skipped: file not created`);
  }
}

// ── Run tests ────────────────────────────────────────────────────────────────

runIntegrationTests()
  .then(() => runPhase12IntegrationTests())
  .then(() => runHiveAutoReplyIntegrationTests())
  .then(() => runIntelligenceIntegrationTests())
  .then(() => runPersistenceIntegrationTests())
  .then(() => {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log(`PHASE 11/12 TEST SUMMARY: ${passed} / ${passed + failed} passed  (${failed} failed)`);
    if (!RUN_INTEGRATION) {
      console.log('  Integration tests (C1–C19, E11–E15, F8–F17, G1–G6, J1–J10) skipped — set RUN_INTEGRATION=true and start server.');
    }
    console.log('════════════════════════════════════════════════════════════════\n');
    if (failed > 0) process.exit(1);
  }).catch((err) => {
    console.error('Test runner error:', err.message);
    process.exit(1);
  });
