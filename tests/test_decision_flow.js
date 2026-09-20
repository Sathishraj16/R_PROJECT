// ScamTracer AI — Phase 7 Decision Flow Test Suite
// tests/test_decision_flow.js
//
// Tests the complete Phase 7 user notification and explicit decision flow.
//
// Critical verification: HIGH risk does NOT automatically activate H.I.V.E.
//   - POST /message with HIGH-risk → must produce USER_DECISION_REQUIRED
//   - Only POST /decision { action: "ACTIVATE_HIVE" } → produces HIVE_ACTIVE
//
// Scenarios:
//   A. LOW-risk message    → NORMAL, no notification, no H.I.V.E.
//   B. MEDIUM-risk message → USER_DECISION_REQUIRED, notification present
//   C. HIGH-risk message   → USER_DECISION_REQUIRED (NOT HIVE_ACTIVE — consent required)
//   D. BLOCK_AND_PROTECT   → BLOCKED
//   E. ACTIVATE_HIVE       → HIVE_ACTIVE (explicit user decision recorded)
//   F. Decision without session_id → 400
//   G. Invalid action      → 400
//   H. BLOCK then ACTIVATE → 409 ALREADY_BLOCKED
//   I. Repeated activation → 409 ALREADY_ACTIVE
//   J. Unknown session     → 404
//
//   Critical (explicit consent): HIGH risk → USER_DECISION_REQUIRED → ACTIVATE_HIVE → HIVE_ACTIVE
//
// Requires both services running:
//   Terminal 1 (project root):
//     Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'
//   Terminal 2 (nodejs/):
//     npm start
//
// Run from project root:
//   node tests/test_decision_flow.js

const http = require('http');

const NODE_HOST = '127.0.0.1';
const NODE_PORT = 3000;

let passCount = 0;
let failCount = 0;

function check(label, condition, detail) {
  const status = condition ? 'PASS' : 'FAIL';
  if (condition) passCount++; else failCount++;
  const detailStr = detail !== undefined && detail !== null ? ` [${detail}]` : '';
  console.log(`  [${status}] ${label}${detailStr}`);
}

function httpRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = (body !== undefined && body !== null) ? JSON.stringify(body) : '';
    const options = {
      hostname: NODE_HOST,
      port: NODE_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) {}
        resolve({ status: res.statusCode, body: data, parsed });
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Known-good messages — verified risk levels from Phase 6 testing.
const LOW_MSG    = 'Hey, are we still meeting at the coffee shop at 5 PM? Let me know.';
const MEDIUM_MSG = 'Your bank account will be suspended today. Send the OTP immediately to verify your account.';
const HIGH_MSG   = 'Congratulations! You have WON a guaranteed cash prize of GBP 900. Call 08002986030 FREE NOW to claim your reward! Hurry, offer expires today.';

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('ScamTracer AI — Phase 7 Decision Flow Test Suite');
  console.log(`Target: http://${NODE_HOST}:${NODE_PORT}`);
  console.log('════════════════════════════════════════════════════════════════\n');

  // Server connectivity check
  try {
    const ping = await httpRequest('GET', '/health', null);
    if (ping.status === 0) throw new Error('no response');
    console.log(`Node.js server reachable (HTTP ${ping.status}). Running tests...\n`);
  } catch (err) {
    console.error('ERROR: Cannot connect to Node.js server at port', NODE_PORT);
    console.error('Start both services:');
    console.error('  Terminal 1: cd "E:/R PROJECT" && Rscript -e \'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)\'');
    console.error('  Terminal 2: cd "E:/R PROJECT/nodejs" && npm start');
    process.exit(1);
  }

  // ── Test A: LOW-risk message → NORMAL, no notification ──────────────────
  console.log('── Test A: LOW-risk message → NORMAL (no user decision required) ──');
  const rA = await httpRequest('POST', '/message', { message: LOW_MSG });
  console.log(`   HTTP status : ${rA.status}`);
  console.log(`   status      : ${rA.parsed && rA.parsed.status}`);
  console.log(`   risk_level  : ${rA.parsed && rA.parsed.risk_assessment && rA.parsed.risk_assessment.risk_level}`);
  check('HTTP 200', rA.status === 200, rA.status);
  check('status = NORMAL', rA.parsed && rA.parsed.status === 'NORMAL', rA.parsed && rA.parsed.status);
  check('session_id present', rA.parsed && typeof rA.parsed.session_id === 'string');
  check('risk_assessment present', rA.parsed && rA.parsed.risk_assessment != null);
  check('risk_level = LOW', rA.parsed && rA.parsed.risk_assessment && rA.parsed.risk_assessment.risk_level === 'LOW',
        rA.parsed && rA.parsed.risk_assessment && rA.parsed.risk_assessment.risk_level);
  check('no notification (LOW risk does not need one)', rA.parsed && rA.parsed.notification === undefined);
  check('H.I.V.E. NOT activated (no automatic activation)', rA.parsed && rA.parsed.status !== 'HIVE_ACTIVE');

  // ── Test B: MEDIUM-risk message → USER_DECISION_REQUIRED ────────────────
  console.log('\n── Test B: MEDIUM-risk message → USER_DECISION_REQUIRED ──');
  const rB = await httpRequest('POST', '/message', { message: MEDIUM_MSG });
  console.log(`   HTTP status : ${rB.status}`);
  console.log(`   status      : ${rB.parsed && rB.parsed.status}`);
  console.log(`   risk_level  : ${rB.parsed && rB.parsed.risk_assessment && rB.parsed.risk_assessment.risk_level}`);
  check('HTTP 200', rB.status === 200, rB.status);
  check('status = USER_DECISION_REQUIRED', rB.parsed && rB.parsed.status === 'USER_DECISION_REQUIRED', rB.parsed && rB.parsed.status);
  check('session_id present', rB.parsed && typeof rB.parsed.session_id === 'string');
  check('risk_level = MEDIUM', rB.parsed && rB.parsed.risk_assessment && rB.parsed.risk_assessment.risk_level === 'MEDIUM',
        rB.parsed && rB.parsed.risk_assessment && rB.parsed.risk_assessment.risk_level);
  check('notification present', rB.parsed && rB.parsed.notification != null);
  check('notification.actions includes BLOCK_AND_PROTECT',
        rB.parsed && rB.parsed.notification && Array.isArray(rB.parsed.notification.actions) &&
        rB.parsed.notification.actions.includes('BLOCK_AND_PROTECT'));
  check('notification.actions includes ACTIVATE_HIVE',
        rB.parsed && rB.parsed.notification && Array.isArray(rB.parsed.notification.actions) &&
        rB.parsed.notification.actions.includes('ACTIVATE_HIVE'));
  check('H.I.V.E. NOT activated automatically', rB.parsed && rB.parsed.status !== 'HIVE_ACTIVE');
  const sessionB = rB.parsed && rB.parsed.session_id;

  // ── Test C: HIGH-risk message → USER_DECISION_REQUIRED (NOT HIVE_ACTIVE) ─
  console.log('\n── Test C: HIGH-risk message → USER_DECISION_REQUIRED (explicit consent required) ──');
  const rC = await httpRequest('POST', '/message', { message: HIGH_MSG });
  console.log(`   HTTP status : ${rC.status}`);
  console.log(`   status      : ${rC.parsed && rC.parsed.status}`);
  console.log(`   risk_level  : ${rC.parsed && rC.parsed.risk_assessment && rC.parsed.risk_assessment.risk_level}`);
  console.log(`   risk_score  : ${rC.parsed && rC.parsed.risk_assessment && rC.parsed.risk_assessment.risk_score}`);
  check('HTTP 200', rC.status === 200, rC.status);
  check('status = USER_DECISION_REQUIRED (not HIVE_ACTIVE)',
        rC.parsed && rC.parsed.status === 'USER_DECISION_REQUIRED', rC.parsed && rC.parsed.status);
  check('risk_level = HIGH',
        rC.parsed && rC.parsed.risk_assessment && rC.parsed.risk_assessment.risk_level === 'HIGH',
        rC.parsed && rC.parsed.risk_assessment && rC.parsed.risk_assessment.risk_level);
  check('H.I.V.E. NOT activated automatically — explicit consent required',
        rC.parsed && rC.parsed.status !== 'HIVE_ACTIVE');
  check('notification present', rC.parsed && rC.parsed.notification != null);
  const sessionC = rC.parsed && rC.parsed.session_id;

  // ── Test D: BLOCK_AND_PROTECT → BLOCKED ──────────────────────────────────
  console.log('\n── Test D: BLOCK_AND_PROTECT → BLOCKED ──');
  // Use a fresh session (from a new MEDIUM/HIGH message)
  const rD0 = await httpRequest('POST', '/message', { message: MEDIUM_MSG });
  const sessionD = rD0.parsed && rD0.parsed.session_id;
  const rD = await httpRequest('POST', '/decision', {
    session_id: sessionD,
    action: 'BLOCK_AND_PROTECT'
  });
  console.log(`   HTTP status : ${rD.status}`);
  console.log(`   status      : ${rD.parsed && rD.parsed.status}`);
  console.log(`   action      : ${rD.parsed && rD.parsed.action}`);
  check('HTTP 200', rD.status === 200, rD.status);
  check('status = BLOCKED', rD.parsed && rD.parsed.status === 'BLOCKED', rD.parsed && rD.parsed.status);
  check('action = BLOCK_AND_PROTECT', rD.parsed && rD.parsed.action === 'BLOCK_AND_PROTECT');
  check('decided_at present', rD.parsed && typeof rD.parsed.decided_at === 'string');
  check('H.I.V.E. NOT activated', rD.parsed && rD.parsed.status !== 'HIVE_ACTIVE');

  // ── Test E: ACTIVATE_HIVE → HIVE_ACTIVE (explicit user decision) ─────────
  console.log('\n── Test E: ACTIVATE_HIVE → HIVE_ACTIVE (explicit user decision) ──');
  // Use a fresh session
  const rE0 = await httpRequest('POST', '/message', { message: HIGH_MSG });
  const sessionE = rE0.parsed && rE0.parsed.session_id;
  // Verify it started in USER_DECISION_REQUIRED (not HIVE_ACTIVE)
  check('Session starts in USER_DECISION_REQUIRED (not HIVE_ACTIVE)',
        rE0.parsed && rE0.parsed.status === 'USER_DECISION_REQUIRED', rE0.parsed && rE0.parsed.status);

  const rE = await httpRequest('POST', '/decision', {
    session_id: sessionE,
    action: 'ACTIVATE_HIVE'
  });
  console.log(`   HTTP status : ${rE.status}`);
  console.log(`   status      : ${rE.parsed && rE.parsed.status}`);
  console.log(`   action      : ${rE.parsed && rE.parsed.action}`);
  check('HTTP 200', rE.status === 200, rE.status);
  check('status = HIVE_ACTIVE', rE.parsed && rE.parsed.status === 'HIVE_ACTIVE', rE.parsed && rE.parsed.status);
  check('action = ACTIVATE_HIVE', rE.parsed && rE.parsed.action === 'ACTIVATE_HIVE');
  check('decided_at present', rE.parsed && typeof rE.parsed.decided_at === 'string');
  check('session_id matches', rE.parsed && rE.parsed.session_id === sessionE);

  // ── Test F: Decision without session_id → 400 ────────────────────────────
  console.log('\n── Test F: Decision without session_id → 400 ──');
  const rF = await httpRequest('POST', '/decision', { action: 'BLOCK_AND_PROTECT' });
  console.log(`   HTTP status : ${rF.status}`);
  check('HTTP 400', rF.status === 400, rF.status);
  check('error = true', rF.parsed && rF.parsed.error === true);
  check('message mentions session_id', rF.parsed && rF.parsed.message &&
        rF.parsed.message.toLowerCase().includes('session_id'));

  // ── Test G: Invalid action → 400 ─────────────────────────────────────────
  console.log('\n── Test G: Invalid action (DELETE_ACCOUNT) → 400 ──');
  const rG = await httpRequest('POST', '/decision', {
    session_id: sessionB || 'any-id',
    action: 'DELETE_ACCOUNT'
  });
  console.log(`   HTTP status : ${rG.status}`);
  check('HTTP 400', rG.status === 400, rG.status);
  check('error = true', rG.parsed && rG.parsed.error === true);
  check('message mentions invalid action', rG.parsed && rG.parsed.message &&
        (rG.parsed.message.toLowerCase().includes('invalid') || rG.parsed.message.toLowerCase().includes('action')));

  // ── Test H: Block then attempt ACTIVATE_HIVE → 409 ALREADY_BLOCKED ───────
  console.log('\n── Test H: BLOCKED session → ACTIVATE_HIVE → 409 ALREADY_BLOCKED ──');
  const rH0 = await httpRequest('POST', '/message', { message: MEDIUM_MSG });
  const sessionH = rH0.parsed && rH0.parsed.session_id;
  await httpRequest('POST', '/decision', { session_id: sessionH, action: 'BLOCK_AND_PROTECT' });
  const rH = await httpRequest('POST', '/decision', { session_id: sessionH, action: 'ACTIVATE_HIVE' });
  console.log(`   HTTP status : ${rH.status}`);
  console.log(`   code        : ${rH.parsed && rH.parsed.code}`);
  check('HTTP 409', rH.status === 409, rH.status);
  check('error = true', rH.parsed && rH.parsed.error === true);
  check('code = ALREADY_BLOCKED', rH.parsed && rH.parsed.code === 'ALREADY_BLOCKED', rH.parsed && rH.parsed.code);

  // ── Test I: Repeated ACTIVATE_HIVE → 409 ALREADY_ACTIVE ──────────────────
  console.log('\n── Test I: HIVE_ACTIVE session → ACTIVATE_HIVE again → 409 ALREADY_ACTIVE ──');
  const rI0 = await httpRequest('POST', '/message', { message: HIGH_MSG });
  const sessionI = rI0.parsed && rI0.parsed.session_id;
  await httpRequest('POST', '/decision', { session_id: sessionI, action: 'ACTIVATE_HIVE' });
  const rI = await httpRequest('POST', '/decision', { session_id: sessionI, action: 'ACTIVATE_HIVE' });
  console.log(`   HTTP status : ${rI.status}`);
  console.log(`   code        : ${rI.parsed && rI.parsed.code}`);
  check('HTTP 409', rI.status === 409, rI.status);
  check('error = true', rI.parsed && rI.parsed.error === true);
  check('code = ALREADY_ACTIVE', rI.parsed && rI.parsed.code === 'ALREADY_ACTIVE', rI.parsed && rI.parsed.code);

  // ── Test J: Unknown session_id → 404 SESSION_NOT_FOUND ───────────────────
  console.log('\n── Test J: Unknown session_id → 404 ──');
  const rJ = await httpRequest('POST', '/decision', {
    session_id: 'xxxxxxxx-0000-0000-0000-000000000000',
    action: 'BLOCK_AND_PROTECT'
  });
  console.log(`   HTTP status : ${rJ.status}`);
  console.log(`   code        : ${rJ.parsed && rJ.parsed.code}`);
  check('HTTP 404', rJ.status === 404, rJ.status);
  check('error = true', rJ.parsed && rJ.parsed.error === true);
  check('code = SESSION_NOT_FOUND', rJ.parsed && rJ.parsed.code === 'SESSION_NOT_FOUND', rJ.parsed && rJ.parsed.code);

  // ── Critical test: HIGH risk → USER_DECISION_REQUIRED → ACTIVATE_HIVE → HIVE_ACTIVE ──
  console.log('\n── Critical (Explicit Consent): HIGH risk must NOT auto-activate H.I.V.E. ──');
  const rK0 = await httpRequest('POST', '/message', { message: HIGH_MSG });
  console.log(`   After POST /message: status = ${rK0.parsed && rK0.parsed.status}`);
  check('HIGH risk → status = USER_DECISION_REQUIRED (not HIVE_ACTIVE)',
        rK0.parsed && rK0.parsed.status === 'USER_DECISION_REQUIRED', rK0.parsed && rK0.parsed.status);
  check('risk_level = HIGH confirmed',
        rK0.parsed && rK0.parsed.risk_assessment && rK0.parsed.risk_assessment.risk_level === 'HIGH',
        rK0.parsed && rK0.parsed.risk_assessment && rK0.parsed.risk_assessment.risk_level);
  check('H.I.V.E. NOT active after analysis alone',
        rK0.parsed && rK0.parsed.status !== 'HIVE_ACTIVE');

  const rK = await httpRequest('POST', '/decision', {
    session_id: rK0.parsed.session_id,
    action: 'ACTIVATE_HIVE'
  });
  console.log(`   After POST /decision ACTIVATE_HIVE: status = ${rK.parsed && rK.parsed.status}`);
  check('HIVE_ACTIVE only after explicit ACTIVATE_HIVE decision',
        rK.parsed && rK.parsed.status === 'HIVE_ACTIVE', rK.parsed && rK.parsed.status);
  check('action = ACTIVATE_HIVE recorded', rK.parsed && rK.parsed.action === 'ACTIVATE_HIVE');

  // ── Input validation for POST /message ───────────────────────────────────
  console.log('\n── POST /message input validation ──');
  const rV1 = await httpRequest('POST', '/message', {});
  check('/message: missing field → HTTP 400', rV1.status === 400, rV1.status);
  const rV2 = await httpRequest('POST', '/message', { message: null });
  check('/message: null message → HTTP 400', rV2.status === 400, rV2.status);
  const rV3 = await httpRequest('POST', '/message', { message: 99 });
  check('/message: number message → HTTP 400', rV3.status === 400, rV3.status);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  const total = passCount + failCount;
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`PHASE 7 TEST SUMMARY: ${passCount} / ${total} passed  (${failCount} failed)`);
  console.log('════════════════════════════════════════════════════════════════');

  if (failCount === 0) {
    console.log('All Phase 7 tests passed.');
    console.log('\nExplicit consent verified:');
    console.log('  HIGH risk → USER_DECISION_REQUIRED (not HIVE_ACTIVE)');
    console.log('  ACTIVATE_HIVE → HIVE_ACTIVE only after explicit user action');
    console.log('  H.I.V.E. is never activated automatically.');
  } else {
    console.log('Some Phase 7 tests failed — review output above.');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
