// ScamTracer AI — Phase 6 Integration Test Suite
// tests/test_integration.js
//
// Tests the full Node.js → R Plumber → analyze_risk() → Node.js data flow.
// Verifies that:
//   - Node.js correctly forwards messages to R
//   - R performs the real analysis (ML + indicators)
//   - Node.js returns the actual R result unchanged
//   - Node.js validates input before forwarding
//   - Errors are handled gracefully
//
// Requires both services running:
//   Terminal 1 (project root):
//     Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'
//   Terminal 2 (nodejs/):
//     npm start
//
// Run from project root:
//   node tests/test_integration.js

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
    req.setTimeout(12000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('ScamTracer AI — Phase 6 Integration Test Suite');
  console.log(`Target: http://${NODE_HOST}:${NODE_PORT}  (Node.js → R Plumber → analyze_risk)`);
  console.log('════════════════════════════════════════════════════════════════\n');

  // ── Server connectivity check ───────────────────────────────────────────
  let ping;
  try {
    ping = await httpRequest('GET', '/health', null);
  } catch (err) {
    console.error('ERROR: Cannot connect to Node.js server at port', NODE_PORT);
    console.error('Start the Node.js server first:');
    console.error('  cd "E:/R PROJECT/nodejs" && npm start');
    process.exit(1);
  }
  if (ping.status === 0) {
    console.error('ERROR: Node.js server not responding.');
    process.exit(1);
  }
  console.log(`Node.js server reachable (HTTP ${ping.status}). Running tests...\n`);

  // ── Test 1: GET /health — Node healthy, R reachable ─────────────────────
  console.log('── Test 1: GET /health — Node + R status ──');
  const r1 = await httpRequest('GET', '/health', null);
  console.log(`   HTTP status   : ${r1.status}`);
  console.log(`   node_status   : ${r1.parsed && r1.parsed.node_status}`);
  console.log(`   r_api_status  : ${r1.parsed && r1.parsed.r_api_status}`);
  console.log(`   r_model_loaded: ${r1.parsed && r1.parsed.r_model_loaded}`);
  check('HTTP 200', r1.status === 200, r1.status);
  check('Body is valid JSON', r1.parsed !== null);
  check('node_status = ok', r1.parsed && r1.parsed.node_status === 'ok', r1.parsed && r1.parsed.node_status);
  check('r_api_status = ok', r1.parsed && r1.parsed.r_api_status === 'ok', r1.parsed && r1.parsed.r_api_status);
  check('r_model_loaded = true', r1.parsed && r1.parsed.r_model_loaded === true, r1.parsed && r1.parsed.r_model_loaded);
  check('r_api_url present', r1.parsed && typeof r1.parsed.r_api_url === 'string');

  // ── Test 2: POST /analyze — normal conversational message ───────────────
  console.log('\n── Test 2: POST /analyze — normal message (Node → R → Node) ──');
  const r2 = await httpRequest('POST', '/analyze', {
    message: 'Hey, are we still meeting at the coffee shop at 5 PM? Let me know.'
  });
  console.log(`   HTTP status   : ${r2.status}`);
  console.log(`   prediction    : ${r2.parsed && r2.parsed.prediction}`);
  console.log(`   risk_level    : ${r2.parsed && r2.parsed.risk_level}`);
  console.log(`   risk_score    : ${r2.parsed && r2.parsed.risk_score}`);
  check('HTTP 200', r2.status === 200, r2.status);
  check('Body is valid JSON', r2.parsed !== null);
  check('prediction = LEGITIMATE', r2.parsed && r2.parsed.prediction === 'LEGITIMATE', r2.parsed && r2.parsed.prediction);
  check('risk_level = LOW', r2.parsed && r2.parsed.risk_level === 'LOW', r2.parsed && r2.parsed.risk_level);
  check('risk_score in [0,100]', r2.parsed && typeof r2.parsed.risk_score === 'number' &&
        r2.parsed.risk_score >= 0 && r2.parsed.risk_score <= 100, r2.parsed && r2.parsed.risk_score);
  check('model_probability in [0,1]', r2.parsed && typeof r2.parsed.model_probability === 'number' &&
        r2.parsed.model_probability >= 0 && r2.parsed.model_probability <= 1,
        r2.parsed && r2.parsed.model_probability !== undefined ? r2.parsed.model_probability.toFixed(4) : 'missing');
  check('result originates from R (model_used present)', r2.parsed && typeof r2.parsed.model_used === 'string');

  // ── Test 3: POST /analyze — prize scam (HIGH ML + indicator score) ───────
  console.log('\n── Test 3: POST /analyze — promotional/prize scam message ──');
  const r3 = await httpRequest('POST', '/analyze', {
    message: 'Congratulations! You have WON a guaranteed cash prize of GBP 900. Call 08002986030 FREE NOW to claim your reward! Hurry, offer expires today.'
  });
  console.log(`   HTTP status   : ${r3.status}`);
  console.log(`   prediction    : ${r3.parsed && r3.parsed.prediction}`);
  console.log(`   risk_level    : ${r3.parsed && r3.parsed.risk_level}`);
  console.log(`   risk_score    : ${r3.parsed && r3.parsed.risk_score}`);
  check('HTTP 200', r3.status === 200, r3.status);
  check('Body is valid JSON', r3.parsed !== null);
  check('prediction = SCAM', r3.parsed && r3.parsed.prediction === 'SCAM', r3.parsed && r3.parsed.prediction);
  check('risk_level = HIGH or MEDIUM', r3.parsed && ['HIGH', 'MEDIUM'].includes(r3.parsed.risk_level), r3.parsed && r3.parsed.risk_level);
  check('risk_score >= 30', r3.parsed && typeof r3.parsed.risk_score === 'number' && r3.parsed.risk_score >= 30, r3.parsed && r3.parsed.risk_score);
  check('detected_indicators is array', r3.parsed && Array.isArray(r3.parsed.detected_indicators));
  check('explanations is array', r3.parsed && Array.isArray(r3.parsed.explanations));

  // ── Test 4: POST /analyze — banking scam (OTP + suspension) ─────────────
  console.log('\n── Test 4: POST /analyze — banking scam with OTP and suspension ──');
  const r4 = await httpRequest('POST', '/analyze', {
    message: 'Your bank account will be suspended today. Send the OTP immediately to verify your account.'
  });
  console.log(`   HTTP status   : ${r4.status}`);
  console.log(`   prediction    : ${r4.parsed && r4.parsed.prediction}`);
  console.log(`   risk_level    : ${r4.parsed && r4.parsed.risk_level}`);
  console.log(`   risk_score    : ${r4.parsed && r4.parsed.risk_score}`);
  console.log(`   indicator_score: ${r4.parsed && r4.parsed.indicator_score}`);
  const r4indicators = r4.parsed && r4.parsed.detected_indicators ? r4.parsed.detected_indicators : [];
  console.log(`   # indicators  : ${r4indicators.length}`);
  check('HTTP 200', r4.status === 200, r4.status);
  check('Body is valid JSON', r4.parsed !== null);
  check('risk_level = MEDIUM or HIGH', r4.parsed && ['MEDIUM', 'HIGH'].includes(r4.parsed.risk_level), r4.parsed && r4.parsed.risk_level);
  check('indicator_score > 0 (rule engine fired)', r4.parsed && typeof r4.parsed.indicator_score === 'number' && r4.parsed.indicator_score > 0, r4.parsed && r4.parsed.indicator_score);
  check('at least 1 indicator detected', r4indicators.length >= 1, r4indicators.length);
  check('caveat present (R statistical disclaimer)', r4.parsed && typeof r4.parsed.caveat === 'string');

  // ── Test 5: POST /analyze — OTP-specific scam ───────────────────────────
  console.log('\n── Test 5: POST /analyze — OTP credential request ──');
  const r5 = await httpRequest('POST', '/analyze', {
    message: 'URGENT: Please share the OTP you received on your registered mobile number to complete verification. Do not share with anyone else.'
  });
  console.log(`   HTTP status   : ${r5.status}`);
  console.log(`   prediction    : ${r5.parsed && r5.parsed.prediction}`);
  console.log(`   risk_level    : ${r5.parsed && r5.parsed.risk_level}`);
  console.log(`   risk_score    : ${r5.parsed && r5.parsed.risk_score}`);
  check('HTTP 200', r5.status === 200, r5.status);
  check('Body is valid JSON', r5.parsed !== null);
  check('risk_score in [0,100]', r5.parsed && typeof r5.parsed.risk_score === 'number' &&
        r5.parsed.risk_score >= 0 && r5.parsed.risk_score <= 100, r5.parsed && r5.parsed.risk_score);
  check('risk_level = MEDIUM or HIGH', r5.parsed && ['MEDIUM', 'HIGH'].includes(r5.parsed.risk_level), r5.parsed && r5.parsed.risk_level);
  const r5indicators = r5.parsed && r5.parsed.detected_indicators ? r5.parsed.detected_indicators : [];
  check('OTP-related indicator detected', r5indicators.length >= 1, `${r5indicators.length} indicators`);
  check('result originates from R (caveat present)', r5.parsed && typeof r5.parsed.caveat === 'string');

  // ── Test 6: POST /analyze — invalid input (Node-side validation) ─────────
  console.log('\n── Test 6: POST /analyze — invalid inputs (Node.js validation) ──');

  // 6a: missing field
  const r6a = await httpRequest('POST', '/analyze', {});
  check('Missing field → HTTP 400', r6a.status === 400, r6a.status);
  check('Missing field → error: true', r6a.parsed && r6a.parsed.error === true);

  // 6b: null message
  const r6b = await httpRequest('POST', '/analyze', { message: null });
  check('Null message → HTTP 400', r6b.status === 400, r6b.status);
  check('Null message → error: true', r6b.parsed && r6b.parsed.error === true);

  // 6c: wrong type (number)
  const r6c = await httpRequest('POST', '/analyze', { message: 99999 });
  check('Number message → HTTP 400', r6c.status === 400, r6c.status);
  check('Number message → error: true', r6c.parsed && r6c.parsed.error === true);
  check('Number message → error message mentions type', r6c.parsed && r6c.parsed.message &&
        (r6c.parsed.message.includes('string') || r6c.parsed.message.includes('type')));

  // 6d: empty body (send raw empty string)
  const r6d = await new Promise((resolve, reject) => {
    const options = {
      hostname: NODE_HOST, port: NODE_PORT, path: '/analyze', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': 0 }
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
    req.on('error', reject);
    req.end();
  });
  check('Empty body → HTTP 400', r6d.status === 400, r6d.status);

  // ── Test 7: Data flow verification ───────────────────────────────────────
  console.log('\n── Test 7: Data flow verification — all R fields pass through Node ──');
  const r7 = await httpRequest('POST', '/analyze', {
    message: 'URGENT: Your account will be suspended. Transfer Rs 5000 to UPI ID help@paytm immediately.'
  });
  console.log(`   HTTP status   : ${r7.status}`);
  console.log(`   risk_score    : ${r7.parsed && r7.parsed.risk_score}`);
  console.log(`   risk_level    : ${r7.parsed && r7.parsed.risk_level}`);
  console.log(`   # indicators  : ${r7.parsed && r7.parsed.detected_indicators ? r7.parsed.detected_indicators.length : 'N/A'}`);
  const REQUIRED_FIELDS = [
    'prediction', 'model_probability', 'ml_score', 'indicator_score',
    'risk_score', 'risk_level', 'detected_indicators', 'explanations',
    'summary_text', 'model_used', 'caveat'
  ];
  check('HTTP 200', r7.status === 200, r7.status);
  for (const field of REQUIRED_FIELDS) {
    check(`R field '${field}' passes through Node`, r7.parsed && (field in r7.parsed), field);
  }
  check('risk_level = HIGH or MEDIUM', r7.parsed && ['HIGH', 'MEDIUM'].includes(r7.parsed.risk_level), r7.parsed && r7.parsed.risk_level);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  const total = passCount + failCount;
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log(`INTEGRATION TEST SUMMARY: ${passCount} / ${total} passed  (${failCount} failed)`);
  console.log('════════════════════════════════════════════════════════════════');
  if (failCount === 0) {
    console.log('All integration tests passed.');
    console.log('\nData flow verified: Node.js → R Plumber → analyze_risk() → Node.js');
    console.log('All analytical values originate from R. Node.js is the integration layer only.');
  } else {
    console.log('Some integration tests failed — review output above.');
    process.exit(1);
  }

  console.log('\n── Manual error-handling tests (run separately) ──');
  console.log('R unavailable (503):');
  console.log('  Start Node with: R_API_URL=http://localhost:9999 npm start');
  console.log('  Then: curl -X POST http://localhost:3000/analyze -H "Content-Type: application/json" -d \'{"message":"test"}\'');
  console.log('  Expected: HTTP 503 with error: true, message about R being unavailable.');
}

main().catch(err => {
  console.error('Test runner error:', err.message);
  process.exit(1);
});
