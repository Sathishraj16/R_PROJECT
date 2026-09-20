// ScamTracer AI — Phase 8 Test Suite
// H.I.V.E. Controlled Engagement Engine
//
// Prerequisites:
//   Both the R Plumber API (port 8000) and Node.js server (port 3000) must be running.
//
// Usage:
//   node tests/test_hive_engagement.js
//
// Scenarios covered:
//   A  POST /hive/message — missing session_id
//   B  POST /hive/message — missing message
//   C  POST /hive/message — empty message (whitespace)
//   D  POST /hive/message — unknown session_id (404)
//   E  POST /hive/message — session in NORMAL state (409 NOT_HIVE_ACTIVE)
//   F  POST /hive/message — session in USER_DECISION_REQUIRED (409 NOT_HIVE_ACTIVE)
//   G  POST /hive/message — session in BLOCKED (409 NOT_HIVE_ACTIVE)
//   H  POST /hive/message — valid HIVE_ACTIVE session, OTP message → otp_deflection
//   I  POST /hive/message — valid HIVE_ACTIVE session, payment message → payment_probe
//   J  POST /hive/message — valid HIVE_ACTIVE session, URL message → url_probe
//   K  POST /hive/message — valid HIVE_ACTIVE session, neutral message → neutral_clarification
//   L  POST /hive/message — multiple turns cycle templates deterministically
//   M  POST /hive/end — valid HIVE_ACTIVE session → HIVE_ENDED
//   N  POST /hive/end — HIVE_ENDED session cannot continue (409 ALREADY_ENDED)
//   O  Explicit consent chain: HIGH risk → USER_DECISION_REQUIRED → ACTIVATE_HIVE → HIVE_ACTIVE
//        (H.I.V.E. NEVER activates automatically — verified end to end)

const http = require('http');

const PORT = 3000;
const HOST = 'localhost';

// Verified HIGH-risk message used by Phase 7 tests.
const HIGH_MSG = 'Congratulations! You have WON a guaranteed cash prize of GBP 900. Call 08002986030 FREE NOW to claim.';

// A verified LOW-risk message.
const LOW_MSG = 'Hey, are we still meeting at the coffee shop at 5 PM?';

// ── HTTP helpers ─────────────────────────────────────────────────────────────

function post(endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = {
      host:    HOST,
      port:    PORT,
      path:    endpoint,
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Test framework ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function check(name, value, expected) {
  if (value === expected) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    console.log(`        expected: ${JSON.stringify(expected)}`);
    console.log(`        received: ${JSON.stringify(value)}`);
    failed++;
  }
}

function checkContains(name, value, substr) {
  if (typeof value === 'string' && value.includes(substr)) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    console.log(`        expected string containing: ${JSON.stringify(substr)}`);
    console.log(`        received: ${JSON.stringify(value)}`);
    failed++;
  }
}

function checkTruthy(name, value) {
  if (value) {
    console.log(`  PASS  ${name}`);
    passed++;
  } else {
    console.log(`  FAIL  ${name}`);
    console.log(`        expected truthy, received: ${JSON.stringify(value)}`);
    failed++;
  }
}

// ── Session setup helpers ─────────────────────────────────────────────────────

/**
 * Create a session in HIVE_ACTIVE state via the full consent chain:
 * POST /message → USER_DECISION_REQUIRED → POST /decision ACTIVATE_HIVE → HIVE_ACTIVE
 *
 * This is the ONLY valid path to HIVE_ACTIVE. H.I.V.E. is never automatic.
 */
async function createHiveActiveSession() {
  const msgRes = await post('/message', { message: HIGH_MSG });
  if (msgRes.status !== 200 || msgRes.body.status !== 'USER_DECISION_REQUIRED') {
    throw new Error(`Setup failed: expected USER_DECISION_REQUIRED, got ${msgRes.status} ${msgRes.body.status}`);
  }
  const sessionId = msgRes.body.session_id;
  const decRes = await post('/decision', { session_id: sessionId, action: 'ACTIVATE_HIVE' });
  if (decRes.status !== 200 || decRes.body.status !== 'HIVE_ACTIVE') {
    throw new Error(`Setup failed: expected HIVE_ACTIVE, got ${decRes.status} ${decRes.body.status}`);
  }
  return sessionId;
}

/** Create a NORMAL (LOW risk) session. */
async function createNormalSession() {
  const msgRes = await post('/message', { message: LOW_MSG });
  if (msgRes.status !== 200) throw new Error(`Setup failed: ${msgRes.status}`);
  return msgRes.body.session_id;
}

/** Create a USER_DECISION_REQUIRED session (HIGH risk, no decision taken). */
async function createUdrSession() {
  const msgRes = await post('/message', { message: HIGH_MSG });
  if (msgRes.status !== 200 || msgRes.body.status !== 'USER_DECISION_REQUIRED') {
    throw new Error(`Setup failed: expected USER_DECISION_REQUIRED, got ${msgRes.status} ${msgRes.body.status}`);
  }
  return msgRes.body.session_id;
}

/** Create a BLOCKED session. */
async function createBlockedSession() {
  const msgRes = await post('/message', { message: HIGH_MSG });
  const sessionId = msgRes.body.session_id;
  await post('/decision', { session_id: sessionId, action: 'BLOCK_AND_PROTECT' });
  return sessionId;
}

// ── Test runner ───────────────────────────────────────────────────────────────

(async () => {
  console.log('ScamTracer AI — Phase 8 Test Suite: H.I.V.E. Controlled Engagement');
  console.log('─'.repeat(70));
  console.log('Prerequisite: R Plumber API on :8000 and Node.js on :3000 must be running.');
  console.log('─'.repeat(70));

  // ── Scenario A: POST /hive/message — missing session_id ────────────────────
  console.log('\nScenario A: POST /hive/message — missing session_id');
  {
    const res = await post('/hive/message', { message: 'Hello' });
    check('A1  HTTP 400', res.status, 400);
    check('A2  error flag', res.body.error, true);
    checkContains('A3  error mentions session_id', res.body.message, 'session_id');
  }

  // ── Scenario B: POST /hive/message — missing message ──────────────────────
  console.log('\nScenario B: POST /hive/message — missing message field');
  {
    const sessionId = await createHiveActiveSession();
    const res = await post('/hive/message', { session_id: sessionId });
    check('B1  HTTP 400', res.status, 400);
    check('B2  error flag', res.body.error, true);
    checkContains('B3  error mentions message', res.body.message, 'message');
  }

  // ── Scenario C: POST /hive/message — empty/whitespace message ─────────────
  console.log('\nScenario C: POST /hive/message — empty/whitespace message');
  {
    const sessionId = await createHiveActiveSession();
    const res = await post('/hive/message', { session_id: sessionId, message: '   ' });
    check('C1  HTTP 400', res.status, 400);
    check('C2  error flag', res.body.error, true);
  }

  // ── Scenario D: POST /hive/message — unknown session_id ───────────────────
  console.log('\nScenario D: POST /hive/message — unknown session_id (404)');
  {
    const res = await post('/hive/message', {
      session_id: '00000000-0000-0000-0000-000000000000',
      message:    'Hello'
    });
    check('D1  HTTP 404', res.status, 404);
    check('D2  error flag', res.body.error, true);
    check('D3  code SESSION_NOT_FOUND', res.body.code, 'SESSION_NOT_FOUND');
  }

  // ── Scenario E: POST /hive/message — NORMAL session (409) ─────────────────
  console.log('\nScenario E: POST /hive/message — session in NORMAL state (409)');
  {
    const sessionId = await createNormalSession();
    const res = await post('/hive/message', { session_id: sessionId, message: 'Hello' });
    check('E1  HTTP 409', res.status, 409);
    check('E2  error flag', res.body.error, true);
    check('E3  code NOT_HIVE_ACTIVE', res.body.code, 'NOT_HIVE_ACTIVE');
  }

  // ── Scenario F: POST /hive/message — USER_DECISION_REQUIRED (409) ─────────
  console.log('\nScenario F: POST /hive/message — session in USER_DECISION_REQUIRED (409)');
  {
    const sessionId = await createUdrSession();
    const res = await post('/hive/message', { session_id: sessionId, message: 'Hello' });
    check('F1  HTTP 409', res.status, 409);
    check('F2  code NOT_HIVE_ACTIVE', res.body.code, 'NOT_HIVE_ACTIVE');
  }

  // ── Scenario G: POST /hive/message — BLOCKED session (409) ────────────────
  console.log('\nScenario G: POST /hive/message — session in BLOCKED state (409)');
  {
    const sessionId = await createBlockedSession();
    const res = await post('/hive/message', { session_id: sessionId, message: 'Hello' });
    check('G1  HTTP 409', res.status, 409);
    check('G2  code NOT_HIVE_ACTIVE', res.body.code, 'NOT_HIVE_ACTIVE');
  }

  // ── Scenario H: OTP message → otp_deflection ──────────────────────────────
  console.log('\nScenario H: POST /hive/message — OTP message triggers otp_deflection');
  {
    const sessionId = await createHiveActiveSession();
    const res = await post('/hive/message', {
      session_id: sessionId,
      message:    'Please share the 6-digit OTP sent to your phone.'
    });
    check('H1  HTTP 200', res.status, 200);
    check('H2  session_id present', typeof res.body.session_id, 'string');
    check('H3  strategy otp_deflection', res.body.strategy, 'otp_deflection');
    checkTruthy('H4  response is non-empty string', typeof res.body.response === 'string' && res.body.response.length > 0);
    check('H5  interaction_number is 1', res.body.interaction_number, 1);
    checkTruthy('H6  incoming recorded', res.body.incoming === 'Please share the 6-digit OTP sent to your phone.');
    checkTruthy('H7  response is a question (ends with ?)', res.body.response.includes('?'));
  }

  // ── Scenario I: payment message → payment_probe ───────────────────────────
  console.log('\nScenario I: POST /hive/message — payment message triggers payment_probe');
  {
    const sessionId = await createHiveActiveSession();
    const res = await post('/hive/message', {
      session_id: sessionId,
      message:    'Please transfer Rs 1 to UPI ID verifyaccount@fakebank to confirm ownership.'
    });
    check('I1  HTTP 200', res.status, 200);
    check('I2  strategy payment_probe', res.body.strategy, 'payment_probe');
    checkTruthy('I3  response is a question', res.body.response.includes('?'));
    check('I4  interaction_number is 1', res.body.interaction_number, 1);
  }

  // ── Scenario J: URL message → url_probe ───────────────────────────────────
  console.log('\nScenario J: POST /hive/message — URL message triggers url_probe');
  {
    const sessionId = await createHiveActiveSession();
    const res = await post('/hive/message', {
      session_id: sessionId,
      message:    'Click this link to verify: http://fakesecure-verify.fictional/confirm'
    });
    check('J1  HTTP 200', res.status, 200);
    check('J2  strategy url_probe', res.body.strategy, 'url_probe');
    checkTruthy('J3  response is a question', res.body.response.includes('?'));
  }

  // ── Scenario K: neutral message → neutral_clarification ───────────────────
  console.log('\nScenario K: POST /hive/message — neutral message → neutral_clarification');
  {
    const sessionId = await createHiveActiveSession();
    const res = await post('/hive/message', {
      session_id: sessionId,
      message:    'We need you to confirm your identity for internal records.'
    });
    check('K1  HTTP 200', res.status, 200);
    check('K2  strategy neutral_clarification', res.body.strategy, 'neutral_clarification');
    checkTruthy('K3  response non-empty', res.body.response.length > 0);
  }

  // ── Scenario L: multiple turns — interaction counter increments ────────────
  console.log('\nScenario L: Multiple turns — interaction_number increments correctly');
  {
    const sessionId = await createHiveActiveSession();
    const otp = 'Please share your OTP now.';

    const r1 = await post('/hive/message', { session_id: sessionId, message: otp });
    const r2 = await post('/hive/message', { session_id: sessionId, message: otp });
    const r3 = await post('/hive/message', { session_id: sessionId, message: otp });

    check('L1  turn 1 interaction_number is 1', r1.body.interaction_number, 1);
    check('L2  turn 2 interaction_number is 2', r2.body.interaction_number, 2);
    check('L3  turn 3 interaction_number is 3', r3.body.interaction_number, 3);

    // Template cycling: 3 templates per strategy → turn 4 cycles back to template 0
    const r4 = await post('/hive/message', { session_id: sessionId, message: otp });
    check('L4  turn 4 interaction_number is 4', r4.body.interaction_number, 4);
    check('L5  turn 1 and turn 4 same response (cycle)', r1.body.response, r4.body.response);
    check('L6  turn 1 and turn 2 different responses', r1.body.response !== r2.body.response, true);
  }

  // ── Scenario M: POST /hive/end — HIVE_ACTIVE → HIVE_ENDED ────────────────
  console.log('\nScenario M: POST /hive/end — HIVE_ACTIVE → HIVE_ENDED');
  {
    const sessionId = await createHiveActiveSession();

    // Record two interactions before ending
    await post('/hive/message', { session_id: sessionId, message: 'Share your OTP.' });
    await post('/hive/message', { session_id: sessionId, message: 'Your account will be suspended.' });

    const res = await post('/hive/end', { session_id: sessionId });
    check('M1  HTTP 200', res.status, 200);
    check('M2  status HIVE_ENDED', res.body.status, 'HIVE_ENDED');
    check('M3  session_id present', res.body.session_id, sessionId);
    check('M4  conversation_length is 2', res.body.conversation_length, 2);
    checkTruthy('M5  hive_started_at present', typeof res.body.hive_started_at === 'string');
    checkTruthy('M6  hive_ended_at present', typeof res.body.hive_ended_at === 'string');
  }

  // ── Scenario N: POST /hive/end — already HIVE_ENDED cannot continue ───────
  console.log('\nScenario N: POST /hive/end — HIVE_ENDED session cannot be ended again');
  {
    const sessionId = await createHiveActiveSession();
    await post('/hive/end', { session_id: sessionId });

    // Attempt to end again
    const res = await post('/hive/end', { session_id: sessionId });
    check('N1  HTTP 409', res.status, 409);
    check('N2  code ALREADY_ENDED', res.body.code, 'ALREADY_ENDED');

    // Attempt to send a message to an ended session
    const res2 = await post('/hive/message', { session_id: sessionId, message: 'Hello' });
    check('N3  POST /hive/message to HIVE_ENDED session → 409', res2.status, 409);
    check('N4  code NOT_HIVE_ACTIVE', res2.body.code, 'NOT_HIVE_ACTIVE');
  }

  // ── Scenario O: Explicit consent chain verification ────────────────────────
  // CRITICAL: Verifies that H.I.V.E. is NEVER activated automatically.
  //   HIGH risk → USER_DECISION_REQUIRED (not HIVE_ACTIVE)
  //   Only explicit POST /decision { action: "ACTIVATE_HIVE" } produces HIVE_ACTIVE.
  console.log('\nScenario O: Explicit consent chain (CRITICAL)');
  console.log('  HIGH risk must NEVER automatically produce HIVE_ACTIVE.');
  {
    // Step 1: Submit HIGH-risk message
    const msgRes = await post('/message', { message: HIGH_MSG });
    check('O1  POST /message HTTP 200', msgRes.status, 200);
    check('O2  state is USER_DECISION_REQUIRED (not HIVE_ACTIVE)', msgRes.body.status, 'USER_DECISION_REQUIRED');

    const sessionId = msgRes.body.session_id;

    // Step 2: Verify that POST /hive/message fails before any decision is made
    const prematureRes = await post('/hive/message', { session_id: sessionId, message: 'Test' });
    check('O3  /hive/message before activation → 409', prematureRes.status, 409);
    check('O4  code NOT_HIVE_ACTIVE (consent not given)', prematureRes.body.code, 'NOT_HIVE_ACTIVE');

    // Step 3: User explicitly activates H.I.V.E.
    const decRes = await post('/decision', { session_id: sessionId, action: 'ACTIVATE_HIVE' });
    check('O5  POST /decision HTTP 200', decRes.status, 200);
    check('O6  state is HIVE_ACTIVE after explicit decision', decRes.body.status, 'HIVE_ACTIVE');

    // Step 4: H.I.V.E. engagement now available
    const hiveRes = await post('/hive/message', {
      session_id: sessionId,
      message:    'Please verify your account by sharing the OTP.'
    });
    check('O7  POST /hive/message HTTP 200 after consent', hiveRes.status, 200);
    checkTruthy('O8  response is a probing question', hiveRes.body.response && hiveRes.body.response.includes('?'));
    check('O9  strategy otp_deflection', hiveRes.body.strategy, 'otp_deflection');

    // Step 5: End the session
    const endRes = await post('/hive/end', { session_id: sessionId });
    check('O10 POST /hive/end HTTP 200', endRes.status, 200);
    check('O11 state is HIVE_ENDED', endRes.body.status, 'HIVE_ENDED');
    check('O12 conversation_length is 1', endRes.body.conversation_length, 1);
  }

  // ── Results ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(70));
  console.log(`Result: ${passed} passed, ${failed} failed out of ${passed + failed} checks`);
  console.log('─'.repeat(70));

  if (failed > 0) {
    console.log('SOME CHECKS FAILED.');
    process.exit(1);
  } else {
    console.log('ALL CHECKS PASSED.');
    process.exit(0);
  }
})();
