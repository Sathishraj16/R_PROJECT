// ScamTracer AI — H.I.V.E. Demo Runner
// Phase 8: Runs a complete H.I.V.E. engagement demo against localhost:3000.
//
// The demo uses the fictional scenario from data/demo/hive_demo_scenario.json.
// All bank names, UPI IDs, URLs, and identities are entirely fabricated.
//
// Prerequisites:
//   1. R Plumber API running on port 8000
//   2. Node.js server running on port 3000  (npm start in nodejs/)
//
// Usage:
//   node nodejs/src/runHiveDemo.js

const http   = require('http');
const path   = require('path');
const fs     = require('fs');

const PORT = 3000;
const HOST = 'localhost';

// ── HTTP helper ──────────────────────────────────────────────────────────────

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

function sep(title) {
  console.log('\n' + '═'.repeat(70));
  if (title) console.log('  ' + title);
  console.log('═'.repeat(70));
}

function line() { console.log('─'.repeat(70)); }

// ── Load demo scenario ───────────────────────────────────────────────────────

const scenarioPath = path.join(__dirname, '..', '..', 'data', 'demo', 'hive_demo_scenario.json');
const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  sep('ScamTracer AI — H.I.V.E. Controlled Engagement Demo');
  console.log(`  Scenario: ${scenario.scenario_name}`);
  console.log(`  DISCLAIMER: ${scenario._disclaimer.substring(0, 90)}...`);
  line();

  // Step 1: Submit initial suspicious message to intake flow
  sep('Step 1 — Submit suspicious message to POST /message');
  console.log(`  Message: "${scenario.initial_suspicious_message}"`);

  const msgRes = await post('/message', { message: scenario.initial_suspicious_message });
  console.log(`\n  Status: HTTP ${msgRes.status}`);
  console.log(`  Session ID:  ${msgRes.body.session_id}`);
  console.log(`  State:       ${msgRes.body.status}`);

  if (msgRes.body.risk_assessment) {
    const ra = msgRes.body.risk_assessment;
    console.log(`  Risk Level:  ${ra.risk_level} (score: ${ra.risk_score}/100)`);
    console.log(`  Prediction:  ${ra.prediction}`);
  }

  if (msgRes.body.notification) {
    const n = msgRes.body.notification;
    console.log(`\n  NOTIFICATION: ${n.title}`);
    console.log(`  ${n.message}`);
    console.log(`  Available actions: ${n.actions.join(', ')}`);
    console.log(`  Instructions: ${n.instructions}`);
  }

  if (msgRes.status !== 200 || msgRes.body.status !== 'USER_DECISION_REQUIRED') {
    console.error('\n  ERROR: Expected USER_DECISION_REQUIRED. Aborting demo.');
    process.exit(1);
  }

  const sessionId = msgRes.body.session_id;

  // Step 2: User explicitly activates H.I.V.E.
  sep('Step 2 — User explicitly activates H.I.V.E. via POST /decision');
  console.log('  Action: ACTIVATE_HIVE (explicit user consent)');
  console.log('  H.I.V.E. is NEVER activated automatically. This represents an explicit user choice.');

  const decRes = await post('/decision', { session_id: sessionId, action: 'ACTIVATE_HIVE' });
  console.log(`\n  Status: HTTP ${decRes.status}`);
  console.log(`  State:  ${decRes.body.status}`);
  console.log(`  Consent recorded at: ${decRes.body.decided_at}`);

  if (decRes.status !== 200 || decRes.body.status !== 'HIVE_ACTIVE') {
    console.error('\n  ERROR: Expected HIVE_ACTIVE. Aborting demo.');
    process.exit(1);
  }

  // Step 3: Run through the 5 demo scenario turns
  sep('Step 3 — H.I.V.E. Controlled Engagement (5 turns)');
  console.log('  All H.I.V.E. responses are controlled probing questions.');
  console.log('  No OTPs, passwords, credentials, or payment details are ever provided.\n');

  for (const turn of scenario.scammer_messages) {
    line();
    console.log(`\n  TURN ${turn.turn}  [${turn.indicator_type}]`);
    console.log(`  SCAMMER: "${turn.text}"`);
    if (turn.note) console.log(`  NOTE: ${turn.note}`);

    const hiveRes = await post('/hive/message', { session_id: sessionId, message: turn.text });

    if (hiveRes.status !== 200) {
      console.error(`\n  ERROR HTTP ${hiveRes.status}:`, hiveRes.body);
      process.exit(1);
    }

    console.log(`\n  H.I.V.E. [${hiveRes.body.strategy}]: "${hiveRes.body.response}"`);
    console.log(`  Interaction #: ${hiveRes.body.interaction_number}`);
  }

  // Step 4: End the H.I.V.E. session
  sep('Step 4 — End H.I.V.E. session via POST /hive/end');

  const endRes = await post('/hive/end', { session_id: sessionId });
  console.log(`\n  Status: HTTP ${endRes.status}`);
  console.log(`  State:               ${endRes.body.status}`);
  console.log(`  Conversations turns: ${endRes.body.conversation_length}`);
  console.log(`  H.I.V.E. started:   ${endRes.body.hive_started_at}`);
  console.log(`  H.I.V.E. ended:     ${endRes.body.hive_ended_at}`);

  if (endRes.status !== 200 || endRes.body.status !== 'HIVE_ENDED') {
    console.error('\n  ERROR: Expected HIVE_ENDED.');
    process.exit(1);
  }

  // Step 5: Run intelligence extraction + behaviour analysis via POST /investigate
  sep('Step 5 — Intelligence + Behaviour Analysis via POST /investigate');

  const invRes = await post('/investigate', { session_id: sessionId });
  console.log(`\n  Status: HTTP ${invRes.status}`);

  if (invRes.status !== 200) {
    console.error('  ERROR calling /investigate:', invRes.body);
    process.exit(1);
  }

  const inv = invRes.body;
  const smry = inv.summary || {};

  console.log(`\n  Entities extracted:  ${smry.n_entities ?? '?'}`);
  console.log(`  Entity types:        ${(smry.entity_types || []).join(', ')}`);
  console.log(`  Behaviour records:   ${smry.n_behaviours ?? '?'}`);
  console.log(`  Behaviour types:     ${(smry.behaviour_types || []).join(', ')}`);
  console.log(`  Escalation:          ${smry.escalation_detected}`);
  console.log(`  Repeated requests:   ${smry.repeated_requests}`);

  if (smry.statements && smry.statements.length > 0) {
    console.log('\n  Investigation Statements:');
    for (const stmt of smry.statements) {
      console.log(`    - ${stmt}`);
    }
  }

  // Save session output to data/demo/demo_session_output.json for dashboard use
  const outputPath = path.join(__dirname, '..', '..', 'data', 'demo', 'demo_session_output.json');
  const outputData = {
    _generated:   new Date().toISOString(),
    _disclaimer:  scenario._disclaimer,
    session_id:   sessionId,
    scenario_name: scenario.scenario_name,
    investigation: inv
  };
  try {
    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf8');
    console.log(`\n  Session output saved to: data/demo/demo_session_output.json`);
  } catch (writeErr) {
    console.warn('  WARNING: Could not save session output:', writeErr.message);
  }

  sep('Demo Complete — Full Pipeline Verified');
  console.log('  Session ID:   ' + sessionId);
  console.log('  Final State:  HIVE_ENDED');
  console.log('  Pipeline:     message → risk → decision → H.I.V.E. → investigate');
  console.log('  All H.I.V.E. responses were controlled probing questions.');
  console.log('  No sensitive information was provided at any point.');
  console.log('═'.repeat(70) + '\n');
})();
