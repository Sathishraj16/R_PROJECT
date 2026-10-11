// ScamTracer AI — Node.js Communication Layer
// Phase 11: Live WhatsApp QR Integration + Real-Time Scam Alerts
//
// Responsibilities:
//   GET  /health                    — Node.js + R backend status
//   POST /analyze                   — raw R risk assessment (Phase 6, no session)
//   POST /message                   — analyze + session + user notification (Phase 7)
//   POST /decision                  — explicit BLOCK_AND_PROTECT or ACTIVATE_HIVE (Phase 7)
//   POST /hive/message              — one H.I.V.E. engagement turn (Phase 8)
//   POST /hive/end                  — end H.I.V.E. engagement, produce summary (Phase 8)
//   POST /investigate               — intelligence extraction + behaviour analysis (Phase 9)
//   GET  /whatsapp/status           — WhatsApp monitor status + stats (Phase 11)
//   GET  /alerts                    — list all suspicious-message alerts (Phase 11)
//   GET  /alerts/:id                — single alert by ID (Phase 11)
//   POST /alerts/:id/decision       — user action on alert (Phase 11)
//   POST /test/simulate-whatsapp    — simulate incoming message (test mode only)
//
// Architecture:
//   R is the analytical engine. Node.js is the communication/integration layer.
//   Node.js does NOT calculate risk scores, ML probabilities, or scam indicators.
//   All analytical values originate from R.
//
// CRITICAL DESIGN PRINCIPLE:
//   H.I.V.E. is NEVER activated automatically.
//   A suspicious/high-risk message produces USER_DECISION_REQUIRED.
//   Only an explicit POST /decision { "action": "ACTIVATE_HIVE" } can produce HIVE_ACTIVE.
//   POST /hive/message is ONLY available for sessions in HIVE_ACTIVE state.
//
//   WhatsApp integration is DETECTION + USER NOTIFICATION ONLY.
//   It never replies to senders, sends OTPs, or activates H.I.V.E. automatically.
//   Explicit user consent via POST /alerts/:id/decision is MANDATORY.
//
// Start (from nodejs/):
//   npm start
//   R Plumber API must already be running on port 8000.

const express = require('express');
const { analyzeMessage, checkRHealth, investigateConversation, R_API_URL } = require('./rApiClient');
const { createSession, getSession, applyDecision, addInteraction, endHiveSession, STATES, VALID_ACTIONS } = require('./sessionStore');
const { generateResponse } = require('./hiveEngine');
const { createAlert, getAlert, getAllAlerts, updateAlert, recordAnalysed, resetAlerts, getStats, getHiveActiveAlertBySender, getAlertBySessionId, ALERT_STATES } = require('./alertStore');
const { WhatsAppMonitor } = require('./whatsappClient');
const { validateRiskResult }  = require('./riskResultValidator');
const { formatAnalysisLog }   = require('./analysisLogger');
const fs   = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const RISK_ALERT_THRESHOLD = parseInt(process.env.SCAMTRACER_RISK_THRESHOLD || '60', 10);
const TEST_MODE = process.env.SCAMTRACER_TEST_MODE === 'true';

// ── Logging middleware ───────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ── Shared helpers ───────────────────────────────────────────────────────────

function validateMessage(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object.';
  }
  if (!('message' in body)) {
    return "Required field 'message' is missing. Expected: {\"message\": \"...\"}";
  }
  if (body.message === null || body.message === undefined) {
    return "Field 'message' must not be null.";
  }
  if (typeof body.message !== 'string') {
    return `Field 'message' must be a string. Received type: ${typeof body.message}.`;
  }
  return null;
}

function handleRError(err, res, prefix) {
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ECONNRESET') {
    console.error(`${prefix} R API unavailable:`, err.message);
    return res.status(503).json({
      error: true,
      message: `R analytical backend is unavailable. Ensure the R Plumber API is running at ${R_API_URL}.`
    });
  }
  if (err.code === 'ECONNABORTED' || (err.message && err.message.includes('timeout'))) {
    console.error(`${prefix} R API timeout:`, err.message);
    return res.status(503).json({
      error: true,
      message: 'R analytical backend timed out. The R Plumber API is not responding.'
    });
  }
  if (err.response) {
    const status = err.response.status;
    const rBody = err.response.data || {};
    console.error(`${prefix} R returned HTTP ${status}:`, rBody.message || '(no message)');
    if (status === 400) {
      return res.status(400).json({
        error: true,
        message: rBody.message || 'R API rejected the request.'
      });
    }
    return res.status(502).json({
      error: true,
      message: 'R analytical backend returned an unexpected error.'
    });
  }
  console.error(`${prefix} Unexpected error:`, err.message);
  return res.status(500).json({
    error: true,
    message: 'Unexpected internal error during analysis.'
  });
}

// ── GET /health ──────────────────────────────────────────────────────────────
// Reports Node.js status and probes the R analytical backend.
// Node.js health ≠ R analytical health — both reported separately.
app.get('/health', async (req, res) => {
  const response = {
    node_status: 'ok',
    service: 'ScamTracer AI Node.js Communication Layer',
    version: '0.9.0',
    r_api_url: R_API_URL,
    r_api_status: 'unknown'
  };

  try {
    const rHealth = await checkRHealth();
    response.r_api_status = rHealth.status || 'ok';
    response.r_model_loaded = rHealth.model_loaded;
    if (rHealth.model_name) response.r_model_name = rHealth.model_name;
    if (rHealth.model_f1)   response.r_model_f1   = rHealth.model_f1;
    if (rHealth.model_auc)  response.r_model_auc  = rHealth.model_auc;
    console.log(`[health] R API reachable — model_loaded: ${rHealth.model_loaded}`);
  } catch (err) {
    response.r_api_status = 'unavailable';
    response.r_api_error = 'R analytical backend is not reachable.';
    console.warn('[health] R API unreachable:', err.message);
  }

  res.json(response);
});

// ── POST /analyze ────────────────────────────────────────────────────────────
// Phase 6: raw R risk assessment — no session, no notification.
// Returns the actual R JSON unchanged.
app.post('/analyze', async (req, res) => {
  console.log('[analyze] Request received');

  const validationError = validateMessage(req.body);
  if (validationError) {
    console.warn('[analyze] Validation failed:', validationError);
    return res.status(400).json({ error: true, message: validationError });
  }

  const message = req.body.message;
  console.log('[analyze] Forwarding to R Plumber...');

  try {
    const result = await analyzeMessage(message);
    console.log(`[analyze] R response: prediction=${result.prediction}, risk_level=${result.risk_level}, risk_score=${result.risk_score}`);
    res.json(result);
  } catch (err) {
    return handleRError(err, res, '[analyze]');
  }
});

// ── POST /message ────────────────────────────────────────────────────────────
// Phase 7: Full intake flow.
//   1. Validate input.
//   2. Forward to R for analysis.
//   3. Create a session with state based on risk_level.
//   4. Return session ID + risk assessment + notification if suspicious.
//
// Decision policy (uses R's risk_level — never a Node.js-calculated value):
//   LOW    → state: NORMAL               — no user action needed
//   MEDIUM → state: USER_DECISION_REQUIRED — user must explicitly choose
//   HIGH   → state: USER_DECISION_REQUIRED — user must explicitly choose
//
// HIGH risk does NOT automatically activate H.I.V.E.
// The user must separately call POST /decision { "action": "ACTIVATE_HIVE" }.
app.post('/message', async (req, res) => {
  console.log('[message] Request received');

  const validationError = validateMessage(req.body);
  if (validationError) {
    console.warn('[message] Validation failed:', validationError);
    return res.status(400).json({ error: true, message: validationError });
  }

  const message = req.body.message;
  console.log('[message] Forwarding to R Plumber for analysis...');

  let riskAssessment;
  try {
    riskAssessment = await analyzeMessage(message);
    console.log(`[message] R response: prediction=${riskAssessment.prediction}, risk_level=${riskAssessment.risk_level}, risk_score=${riskAssessment.risk_score}`);
  } catch (err) {
    return handleRError(err, res, '[message]');
  }

  const session = createSession(message, riskAssessment);
  console.log(`[message] Session ${session.session_id} created — state: ${session.state}`);

  const response = {
    session_id:      session.session_id,
    status:          session.state,
    risk_assessment: riskAssessment
  };

  if (session.state === STATES.USER_DECISION_REQUIRED) {
    response.notification = {
      title:        'Suspicious message detected',
      message:      `This message has been assessed as ${riskAssessment.risk_level} risk (score: ${riskAssessment.risk_score}/100). It contains indicators associated with scam activity.`,
      actions:      ['BLOCK_AND_PROTECT', 'ACTIVATE_HIVE'],
      instructions: 'Choose BLOCK_AND_PROTECT to end the interaction safely. Choose ACTIVATE_HIVE to begin controlled investigation (Phase 8). H.I.V.E. requires your explicit activation and is never automatic.'
    };
  }

  res.json(response);
});

// ── POST /decision ───────────────────────────────────────────────────────────
// Phase 7: Explicit user decision for a specific session.
//
// Input: { "session_id": "...", "action": "BLOCK_AND_PROTECT" | "ACTIVATE_HIVE" }
//
// Valid transitions:
//   USER_DECISION_REQUIRED + BLOCK_AND_PROTECT → BLOCKED
//   USER_DECISION_REQUIRED + ACTIVATE_HIVE     → HIVE_ACTIVE
//
// Rejected transitions:
//   BLOCKED      → ACTIVATE_HIVE  (409 ALREADY_BLOCKED)
//   HIVE_ACTIVE  → ACTIVATE_HIVE  (409 ALREADY_ACTIVE)
//   NORMAL       → any action     (409 NO_DECISION_REQUIRED)
//   unknown ID   → any action     (404 SESSION_NOT_FOUND)
//
// CRITICAL: HIVE_ACTIVE is a state transition only.
//           No automated replies, scammer engagement, or extraction happen here.
//           Those belong to Phase 8.
app.post('/decision', (req, res) => {
  console.log('[decision] Request received');

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: true, message: 'Request body must be a JSON object.' });
  }
  if (!('session_id' in body) || typeof body.session_id !== 'string' || !body.session_id.trim()) {
    return res.status(400).json({ error: true, message: "Required field 'session_id' must be a non-empty string." });
  }
  if (!('action' in body)) {
    return res.status(400).json({ error: true, message: "Required field 'action' is missing." });
  }
  if (typeof body.action !== 'string') {
    return res.status(400).json({ error: true, message: "Field 'action' must be a string." });
  }
  if (!VALID_ACTIONS.has(body.action)) {
    return res.status(400).json({
      error: true,
      message: `Invalid action '${body.action}'. Allowed: ${[...VALID_ACTIONS].join(', ')}.`
    });
  }

  const { session_id, action } = body;
  console.log(`[decision] session_id=${session_id}, action=${action}`);

  const result = applyDecision(session_id, action);
  if (!result.ok) {
    const httpStatus = result.code === 'SESSION_NOT_FOUND' ? 404 : 409;
    console.warn(`[decision] Rejected — ${result.code}: ${result.message}`);
    return res.status(httpStatus).json({
      error:   true,
      code:    result.code,
      message: result.message
    });
  }

  const session = result.session;
  console.log(`[decision] Session ${session_id} transitioned to ${session.state}`);

  if (action === 'BLOCK_AND_PROTECT') {
    return res.json({
      session_id,
      status:     'BLOCKED',
      action:     'BLOCK_AND_PROTECT',
      message:    'Conversation blocked and protected. No further engagement will occur.',
      decided_at: session.decided_at
    });
  }

  return res.json({
    session_id,
    status:     'HIVE_ACTIVE',
    action:     'ACTIVATE_HIVE',
    message:    'H.I.V.E. activated for controlled investigation. Explicit user consent recorded.',
    decided_at: session.decided_at
  });
});

// ── POST /hive/message ───────────────────────────────────────────────────────
// Phase 8: One H.I.V.E. engagement turn.
//
// Requires the session to be in HIVE_ACTIVE state.
// Generates a controlled probing response using the deterministic hive engine.
// Records both the incoming scammer message and the outgoing H.I.V.E. response.
//
// Input:  { "session_id": "...", "message": "..." }
// Output: { session_id, interaction_number, strategy, incoming, response, timestamp }
app.post('/hive/message', (req, res) => {
  console.log('[hive/message] Request received');

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: true, message: 'Request body must be a JSON object.' });
  }
  if (!('session_id' in body) || typeof body.session_id !== 'string' || !body.session_id.trim()) {
    return res.status(400).json({ error: true, message: "Required field 'session_id' must be a non-empty string." });
  }

  const validationError = validateMessage(body);
  if (validationError) {
    console.warn('[hive/message] Validation failed:', validationError);
    return res.status(400).json({ error: true, message: validationError });
  }
  if (!body.message.trim()) {
    return res.status(400).json({ error: true, message: "Field 'message' must not be empty or whitespace." });
  }

  const { session_id, message } = body;
  console.log(`[hive/message] session_id=${session_id}`);

  // Verify session exists and is HIVE_ACTIVE before generating a response.
  const { getSession } = require('./sessionStore');
  const session = getSession(session_id);

  if (!session) {
    console.warn(`[hive/message] Session ${session_id} not found.`);
    return res.status(404).json({
      error: true, code: 'SESSION_NOT_FOUND',
      message: `Session '${session_id}' not found.`
    });
  }
  if (session.state !== STATES.HIVE_ACTIVE) {
    console.warn(`[hive/message] Session ${session_id} is not HIVE_ACTIVE (state: ${session.state}).`);
    return res.status(409).json({
      error: true, code: 'NOT_HIVE_ACTIVE',
      message: `H.I.V.E. is not active for this session (state: ${session.state}). Engagement requires explicit user activation.`
    });
  }

  const { strategy, response } = generateResponse(message, session.interaction_count);
  console.log(`[hive/message] strategy=${strategy}, interaction=${session.interaction_count + 1}`);

  const result = addInteraction(session_id, message, response, strategy);
  if (!result.ok) {
    console.warn(`[hive/message] addInteraction failed — ${result.code}: ${result.message}`);
    return res.status(409).json({ error: true, code: result.code, message: result.message });
  }

  const interactionNumber = result.session.interaction_count;
  const timestamp = result.session.conversation[result.session.conversation.length - 1].timestamp;

  res.json({
    session_id,
    interaction_number: interactionNumber,
    strategy,
    incoming:  message,
    response,
    timestamp
  });
});

// ── POST /hive/end ───────────────────────────────────────────────────────────
// Phase 8: End a H.I.V.E. engagement session.
//
// Transitions: HIVE_ACTIVE → HIVE_ENDED.
// Returns a summary with conversation length and duration.
//
// Input:  { "session_id": "..." }
// Output: { session_id, status: "HIVE_ENDED", conversation_length, hive_started_at, hive_ended_at }
app.post('/hive/end', (req, res) => {
  console.log('[hive/end] Request received');

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: true, message: 'Request body must be a JSON object.' });
  }
  if (!('session_id' in body) || typeof body.session_id !== 'string' || !body.session_id.trim()) {
    return res.status(400).json({ error: true, message: "Required field 'session_id' must be a non-empty string." });
  }

  const { session_id } = body;
  console.log(`[hive/end] session_id=${session_id}`);

  const result = endHiveSession(session_id);
  if (!result.ok) {
    const httpStatus = result.code === 'SESSION_NOT_FOUND' ? 404 : 409;
    console.warn(`[hive/end] Rejected — ${result.code}: ${result.message}`);
    return res.status(httpStatus).json({ error: true, code: result.code, message: result.message });
  }

  const session = result.session;
  console.log(`[hive/end] Session ${session_id} ended — ${session.interaction_count} interaction(s) recorded.`);
  saveCompletedInvestigation(session);

  res.json({
    session_id,
    status:              'HIVE_ENDED',
    conversation_length: session.interaction_count,
    hive_started_at:     session.hive_started_at,
    hive_ended_at:       session.hive_ended_at
  });
});

// ── GET /hive/intelligence/:session_id ──────────────────────────────────────
// Returns the latest cached intelligence for a H.I.V.E. session.
// Updated automatically after each auto-reply turn.
app.get('/hive/intelligence/:session_id', (req, res) => {
  const session = getSession(req.params.session_id);
  if (!session) {
    return res.status(404).json({ error: true, code: 'SESSION_NOT_FOUND', message: 'Session not found.' });
  }
  res.json({
    session_id:        session.session_id,
    state:             session.state,
    interaction_count: session.interaction_count,
    intelligence:      session.intelligence || null,
    stop_reason:       session.stop_reason  || null
  });
});

// ── POST /investigate ────────────────────────────────────────────────────────
// Phase 9: Intelligence extraction and behaviour analysis.
//
// Accepts a session_id for a HIVE_ENDED or HIVE_ACTIVE session.
// Retrieves the recorded conversation from the session store, adds turn numbers,
// and forwards to R POST /investigate.
// R performs all analytical work — Node.js is the integration layer only.
//
// Input:  { "session_id": "..." }
// Output: { session_id, intelligence: [...], behaviour: [...], summary: {...} }
app.post('/investigate', async (req, res) => {
  console.log('[investigate] Request received');

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: true, message: 'Request body must be a JSON object.' });
  }
  if (!('session_id' in body) || typeof body.session_id !== 'string' || !body.session_id.trim()) {
    return res.status(400).json({ error: true, message: "Required field 'session_id' must be a non-empty string." });
  }

  const { session_id } = body;
  console.log(`[investigate] session_id=${session_id}`);

  const { getSession } = require('./sessionStore');
  const session = getSession(session_id);

  if (!session) {
    console.warn(`[investigate] Session ${session_id} not found.`);
    return res.status(404).json({
      error: true, code: 'SESSION_NOT_FOUND',
      message: `Session '${session_id}' not found.`
    });
  }

  // Investigation is only meaningful for sessions that had H.I.V.E. engagement
  if (session.state !== STATES.HIVE_ENDED && session.state !== STATES.HIVE_ACTIVE) {
    return res.status(409).json({
      error: true, code: 'NO_CONVERSATION',
      message: `Session state is '${session.state}'. Investigation requires a HIVE_ACTIVE or HIVE_ENDED session with conversation history.`
    });
  }

  const convo = session.conversation;
  if (!convo || convo.length === 0) {
    return res.status(409).json({
      error: true, code: 'EMPTY_CONVERSATION',
      message: 'No conversation history recorded for this session.'
    });
  }

  // Build conversation array with turn numbers for R.
  // Session store records alternating INCOMING / OUTGOING pairs.
  // Pair at indices (2k, 2k+1) = turn k+1.
  const conversationForR = convo.map((msg, idx) => ({
    direction: msg.direction,
    text:      msg.text,
    turn:      Math.floor(idx / 2) + 1,
    timestamp: msg.timestamp
  }));

  console.log(`[investigate] Forwarding ${conversationForR.length} messages (${session.interaction_count} turns) to R...`);

  try {
    const result = await investigateConversation(session_id, conversationForR);
    console.log(`[investigate] R returned: ${result.summary?.n_entities ?? '?'} entities, ${result.summary?.n_behaviours ?? '?'} behaviours`);
    res.json(result);
  } catch (err) {
    return handleRError(err, res, '[investigate]');
  }
});

// ── processIncomingWhatsAppMessage ───────────────────────────────────────────
// Called when the WhatsApp monitor emits a 'message' event (or from the test
// simulation endpoint). Analyses the message via R, and if the risk score
// meets the threshold, creates a ScamTracer session + alert.
//
// SAFETY: This function only reads messages and creates alerts.
//         It never replies to the sender, never activates H.I.V.E.,
//         never sends OTPs, and never takes any action on the user's behalf.
async function processIncomingWhatsAppMessage({ id, from, body, timestamp }) {
  const logPrefix = `[whatsapp:process] from=${from}`;
  recordAnalysed();

  // Guard: skip non-text or empty messages — they produce NULL fields in R which
  // jsonlite serializes as {} (empty objects). JavaScript's {} < 60 = false, which
  // silently bypasses the threshold check and creates malformed alerts.
  if (typeof body !== 'string' || !body.trim()) {
    console.log(`[ScamTracer] Skipped non-text WhatsApp message from ${from || 'unknown'}.`);
    return null;
  }

  // Guard: only store primitive string IDs — never a complex WhatsApp object.
  const normalizedId = typeof id === 'string' ? id : null;

  // ── Boundary log ─────────────────────────────────────────────────────────────
  // Emitted for every text message that reaches analysis. Logs sender and whether
  // a stable message ID was extracted (affects deduplication quality).
  console.log(`${logPrefix} message received (id=${normalizedId ? 'present' : 'null'})`);

  // ── H.I.V.E. routing ────────────────────────────────────────────────────────
  // If this sender has an existing HIVE_ACTIVE alert the user explicitly created,
  // route the message to the H.I.V.E. engine instead of running R analysis again.
  // SAFETY: getHiveActiveAlertBySender only returns alerts in HIVE_ACTIVE status,
  //         which requires a prior explicit POST /alerts/:id/decision ACTIVATE_HIVE.
  const activeHiveAlert = getHiveActiveAlertBySender(from);
  if (activeHiveAlert) {
    console.log(`${logPrefix} → H.I.V.E. session=${activeHiveAlert.session_id} (routing to engagement engine)`);
    await processHiveMessage({
      from, body, normalizedId, sessionId: activeHiveAlert.session_id
    });
    return null; // no new alert created; H.I.V.E. handled the message
  }
  console.log(`${logPrefix} → R analysis (no active H.I.V.E. session for this sender)`);

  let riskResult;
  try {
    riskResult = await analyzeMessage(body);
  } catch (err) {
    console.error(`${logPrefix} R analysis failed:`, err.message);
    return null;
  }

  // Validate R response: reject {} (NULL serialized by R's jsonlite), NaN, Infinity, etc.
  const validation = validateRiskResult(riskResult, body);
  if (!validation.valid) {
    console.warn(`${logPrefix} R returned invalid analysis — no alert created. Reason: ${validation.reason}`);
    return null;
  }

  // Print the full analysis block to the operator terminal.
  // All values are taken directly from R — this function never recalculates.
  console.log(formatAnalysisLog(from, body, riskResult, RISK_ALERT_THRESHOLD));

  if (riskResult.risk_score < RISK_ALERT_THRESHOLD) {
    return null;
  }

  const session = createSession(body, riskResult);
  const alert = createAlert({
    whatsappMsgId: normalizedId,
    sender:        from,
    messageText:   body,
    riskResult,
    sessionId:     session.session_id
  });

  if (!alert) {
    console.log(`${logPrefix} Duplicate message ID — alert skipped.`);
    return null;
  }

  console.log(`${logPrefix} ALERT created: alert_id=${alert.alert_id} session_id=${session.session_id}`);
  return alert;
}

// ── H.I.V.E. auto-reply infrastructure ──────────────────────────────────────
//
// Used by processIncomingWhatsAppMessage when the incoming sender already has a
// HIVE_ACTIVE alert (i.e. the user has previously clicked ACTIVATE H.I.V.E.).
//
// Design:
//   _hiveSeenIds  — tracks message IDs already processed in H.I.V.E. context to
//                   prevent duplicate replies when the same message fires twice.
//   _hiveQueues   — per-session Promise chain; ensures replies are generated and
//                   sent ONE AT A TIME per session, even if two messages arrive
//                   concurrently.
//
// SAFETY RULES (enforced in _executeHiveTurn):
//   1. Session state is rechecked to HIVE_ACTIVE immediately before any action.
//   2. Own messages (fromMe) never reach here — filtered in whatsappClient.js.
//   3. Non-text / empty messages never reach here — filtered in whatsappClient.js.
//   4. Failed sends are caught, logged, and annotated — never retried in a loop.
//   5. H.I.V.E. responses never include OTPs, passwords, or sensitive credentials
//      (enforced by hiveEngine.js template design).

// ── Completed investigation persistence ──────────────────────────────────────
// Writes a JSON snapshot to data/completed_sessions/{session_id}.json whenever
// a H.I.V.E. session reaches HIVE_ENDED. Overwrites an existing file for the
// same session (repeated saves are safe). Non-fatal — a write failure is logged
// but does not affect session state or the HTTP response.
const COMPLETED_DIR = path.join(__dirname, '..', '..', 'data', 'completed_sessions');

function saveCompletedInvestigation(session) {
  try {
    const alert = getAlertBySessionId(session.session_id);
    const snapshot = {
      session_id:          session.session_id,
      completed_at:        session.hive_ended_at || new Date().toISOString(),
      sender:              alert ? alert.sender             : 'unknown',
      initial_message:     alert ? alert.message            : (session.message || ''),
      risk_score:          alert ? alert.risk_score         : null,
      risk_level:          alert ? alert.risk_level         : null,
      prediction:          alert ? alert.prediction         : null,
      model_probability:   alert ? alert.model_probability  : null,
      ml_score:            alert ? alert.ml_score           : null,
      indicator_score:     alert ? alert.indicator_score    : null,
      detected_indicators: alert ? alert.detected_indicators : [],
      explanations:        alert ? alert.explanations        : [],
      interaction_count:   session.interaction_count,
      stop_reason:         session.stop_reason || null,
      conversation:        session.conversation || [],
      intelligence:        session.intelligence || null
    };

    fs.mkdirSync(COMPLETED_DIR, { recursive: true });
    const filePath = path.join(COMPLETED_DIR, `${session.session_id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
    console.log(`[hive] Completed investigation saved: ${filePath}`);
  } catch (err) {
    console.error(`[hive] Failed to save completed investigation for ${session.session_id}: ${err.message}`);
  }
}

const _hiveSeenIds = new Set(); // dedup for H.I.V.E. messages (separate from alertStore)
const _hiveQueues  = new Map(); // sessionId → tail Promise (ensures sequential processing)

/**
 * Count the number of distinct evidence categories in an R intelligence result.
 * Entity types (PHONE, UPI_ID, URL, …) and behaviour types (URGENCY, THREAT, …)
 * each count as a separate category. A Set ensures no double-counting.
 */
function countEvidenceCategories(intelResult) {
  const cats = new Set();
  const s = intelResult && intelResult.summary;
  if (s) {
    if (Array.isArray(s.entity_types))    s.entity_types.forEach(t => cats.add(t));
    if (Array.isArray(s.behaviour_types)) s.behaviour_types.forEach(t => cats.add(t));
  }
  return cats.size;
}

/**
 * Route an incoming WhatsApp message to its active H.I.V.E. session.
 * Deduplicates by message ID, then chains onto the session's processing queue.
 */
async function processHiveMessage({ from, body, normalizedId, sessionId }) {
  const logPrefix = `[hive:auto] session=${sessionId} from=${from}`;

  console.log(`${logPrefix} H.I.V.E. turn received (id=${normalizedId || 'null'})`);

  // Dedup: skip if this exact message ID was already processed in H.I.V.E.
  if (normalizedId && _hiveSeenIds.has(normalizedId)) {
    console.log(`${logPrefix} Duplicate message ID — skipped.`);
    return;
  }
  if (normalizedId) _hiveSeenIds.add(normalizedId);

  // Chain onto the session queue — sequential processing, one turn at a time.
  const prev   = _hiveQueues.get(sessionId) || Promise.resolve();
  const thisTurn = prev.then(() => _executeHiveTurn({ from, body, sessionId, logPrefix }));
  // Store a non-rejecting tail so the chain survives errors in individual turns.
  _hiveQueues.set(sessionId, thisTurn.catch(() => {}));
  await thisTurn;
}

/**
 * Execute one H.I.V.E. engagement turn:
 *   1. Re-verify the session is still HIVE_ACTIVE.
 *   2. Generate a deterministic reply via the existing H.I.V.E. engine.
 *   3. Attempt to send via the WhatsApp client.
 *   4. Record the turn in the session conversation regardless of send outcome.
 *   5. Annotate send_result ('ok' or 'failed: <reason>') on the OUTGOING record.
 */
async function _executeHiveTurn({ from, body, sessionId, logPrefix }) {
  // Re-check session state before generating or sending anything.
  const session = getSession(sessionId);
  if (!session || session.state !== STATES.HIVE_ACTIVE) {
    const state = session ? session.state : 'not found';
    console.log(`${logPrefix} Session no longer active (state: ${state}) — no reply sent.`);
    return;
  }

  // Generate the H.I.V.E. reply using the existing deterministic engine.
  const { strategy, response } = generateResponse(body, session.interaction_count);
  console.log(`${logPrefix} strategy=${strategy} turn=${session.interaction_count + 1}`);

  // Attempt to send. Failure is caught, logged, and recorded — never triggers a retry.
  let sendResult = 'ok';
  try {
    console.log(`${logPrefix} Sending reply (client_ready=${whatsappMonitor.isReady})`);
    await whatsappMonitor.sendMessage(from, response);
    console.log(`${logPrefix} Reply sent.`);
  } catch (err) {
    sendResult = `failed: ${err.message}`;
    console.error(`${logPrefix} Send failed — reply not delivered:`, err.message);
  }

  // Record the interaction (addInteraction re-checks HIVE_ACTIVE — safe if session ended
  // between the state check above and this call).
  const interactionResult = addInteraction(sessionId, body, response, strategy);
  if (!interactionResult.ok) {
    console.warn(`${logPrefix} addInteraction rejected — ${interactionResult.code}: ${interactionResult.message}`);
    return;
  }

  // Annotate send outcome on the OUTGOING conversation record.
  const convo    = interactionResult.session.conversation;
  const outgoing = convo[convo.length - 1];
  if (outgoing && outgoing.direction === 'OUTGOING') {
    outgoing.send_result = sendResult;
  }

  // Update the intelligence summary and check the auto-stop condition.
  // Non-fatal: if R is unavailable, the session continues unaffected.
  const liveSession = interactionResult.session;
  try {
    if (liveSession.state === STATES.HIVE_ACTIVE) {
      const convoForR = liveSession.conversation.map((msg, idx) => ({
        direction: msg.direction,
        text:      msg.text,
        turn:      Math.floor(idx / 2) + 1,
        timestamp: msg.timestamp
      }));
      const intelResult = await investigateConversation(sessionId, convoForR);
      liveSession.intelligence = intelResult;
      const cats = countEvidenceCategories(intelResult);
      console.log(`${logPrefix} intelligence updated — ${cats} evidence category/ies, ${liveSession.interaction_count} turn(s)`);
      if (cats >= 5 && liveSession.interaction_count >= 4) {
        const endResult = endHiveSession(sessionId);
        if (endResult.ok) {
          endResult.session.stop_reason = `auto: ${cats} evidence categories across ${liveSession.interaction_count} turns`;
          console.log(`${logPrefix} Auto-stopped — ${cats} categories, ${liveSession.interaction_count} turns.`);
          saveCompletedInvestigation(endResult.session);
        }
      }
    }
  } catch (err) {
    console.warn(`${logPrefix} Intelligence update skipped (R unavailable): ${err.message}`);
  }
}

// ── GET /whatsapp/status ─────────────────────────────────────────────────────
// Phase 11: WhatsApp monitor connection status and running totals.
app.get('/whatsapp/status', (req, res) => {
  const stats = getStats();
  res.json({
    enabled:             whatsappMonitor.isEnabled,
    connected:           whatsappMonitor.isReady,
    risk_threshold:      RISK_ALERT_THRESHOLD,
    total_analysed:      stats.total_analysed,
    total_suspicious:    stats.total_suspicious,
    pending_decisions:   stats.pending_decisions
  });
});

// ── GET /alerts ──────────────────────────────────────────────────────────────
// Phase 11: Return all suspicious-message alerts, most recent first.
app.get('/alerts', (req, res) => {
  res.json({ alerts: getAllAlerts() });
});

// ── GET /alerts/:id ──────────────────────────────────────────────────────────
// Phase 11: Return a single alert by its alert_id.
app.get('/alerts/:id', (req, res) => {
  const alert = getAlert(req.params.id);
  if (!alert) {
    return res.status(404).json({ error: true, code: 'ALERT_NOT_FOUND', message: `Alert '${req.params.id}' not found.` });
  }
  res.json(alert);
});

// ── POST /alerts/:id/decision ────────────────────────────────────────────────
// Phase 11: User decision on a suspicious-message alert.
//
// Input:  { "action": "BLOCK_AND_PROTECT" | "ACTIVATE_HIVE" }
// Output: { alert_id, session_id, action, status, decided_at }
//
// BLOCK_AND_PROTECT: marks alert BLOCKED, transitions session to BLOCKED.
// ACTIVATE_HIVE:     marks alert HIVE_ACTIVE, transitions session to HIVE_ACTIVE.
//                    User is responsible for POST /hive/message after this.
//
// H.I.V.E. is NOT activated automatically. This endpoint records the
// EXPLICIT user consent before any session transition occurs.
app.post('/alerts/:id/decision', (req, res) => {
  console.log(`[alerts/decision] alert_id=${req.params.id}`);

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: true, message: 'Request body must be a JSON object.' });
  }
  if (!('action' in body)) {
    return res.status(400).json({ error: true, message: "Required field 'action' is missing." });
  }
  if (!VALID_ACTIONS.has(body.action)) {
    return res.status(400).json({
      error: true,
      message: `Invalid action '${body.action}'. Allowed: ${[...VALID_ACTIONS].join(', ')}.`
    });
  }

  const alert = getAlert(req.params.id);
  if (!alert) {
    return res.status(404).json({ error: true, code: 'ALERT_NOT_FOUND', message: `Alert '${req.params.id}' not found.` });
  }
  if (alert.status !== ALERT_STATES.USER_DECISION_REQUIRED) {
    return res.status(409).json({
      error: true,
      code:  'ALREADY_DECIDED',
      message: `Alert has already been actioned (status: ${alert.status}).`
    });
  }

  const { action } = body;
  const newAlertStatus = action === 'ACTIVATE_HIVE' ? ALERT_STATES.HIVE_ACTIVE : ALERT_STATES.BLOCKED;
  const updatedAlert = updateAlert(req.params.id, { status: newAlertStatus, decision: action });

  // Mirror the decision into the linked ScamTracer session.
  const sessionResult = applyDecision(alert.session_id, action);
  if (!sessionResult.ok) {
    console.warn(`[alerts/decision] Session transition failed for ${alert.session_id}: ${sessionResult.message}`);
  }

  console.log(`[alerts/decision] alert_id=${req.params.id} → ${newAlertStatus}`);

  res.json({
    alert_id:   req.params.id,
    session_id: alert.session_id,
    action,
    status:     newAlertStatus,
    decided_at: updatedAlert.decided_at,
    message:    action === 'BLOCK_AND_PROTECT'
      ? 'Conversation blocked and protected. No further engagement will occur.'
      : 'H.I.V.E. session created. Use POST /hive/message with the session_id to begin controlled investigation. Explicit consent recorded.'
  });
});

// ── POST /test/simulate-whatsapp ─────────────────────────────────────────────
// Phase 11: Simulate an incoming WhatsApp message without a real phone.
// ONLY available when SCAMTRACER_TEST_MODE=true.
// Used by the automated test suite (tests/test_whatsapp.js).
//
// Input:  { "from": "...", "body": "...", "id": "..." (optional) }
// Output: { alert (if above threshold) | null, risk_score, risk_level }
if (TEST_MODE) {
  // Development-only: clear all in-memory alerts and running totals.
  // Useful after manual testing to discard malformed historical alerts.
  // Never available in production (TEST_MODE=false).
  app.post('/test/reset-alerts', (req, res) => {
    resetAlerts();
    _hiveSeenIds.clear();
    _hiveQueues.clear();
    console.log('[test/reset-alerts] Alert store and H.I.V.E. dedup/queue state cleared.');
    res.json({ ok: true, message: 'Alert store and H.I.V.E. state reset — all alerts, running totals, and H.I.V.E. dedup cleared.' });
  });

  app.post('/test/simulate-whatsapp', async (req, res) => {
    console.log('[test/simulate-whatsapp] Simulating incoming WhatsApp message');

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: true, message: 'Request body must be a JSON object.' });
    }
    if (!body.body || typeof body.body !== 'string') {
      return res.status(400).json({ error: true, message: "Required field 'body' (message text) is missing or not a string." });
    }

    const msgObj = {
      id:        body.id || null,
      from:      body.from || 'test@c.us',
      body:      body.body,
      timestamp: new Date().toISOString()
    };

    try {
      const alert = await processIncomingWhatsAppMessage(msgObj);
      const stats = getStats();
      res.json({
        simulated:    true,
        alert:        alert || null,
        alert_created: !!alert,
        total_analysed: stats.total_analysed
      });
    } catch (err) {
      return handleRError(err, res, '[test/simulate-whatsapp]');
    }
  });

  // Expose session state for test verification — allows tests to inspect
  // conversation history, send_result fields, and interaction counts without
  // coupling to internal module internals.
  app.get('/test/session/:id', (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
      return res.status(404).json({ error: true, code: 'NOT_FOUND', message: 'Session not found.' });
    }
    res.json({ ok: true, session });
  });
}

// ── WhatsApp monitor setup ────────────────────────────────────────────────────
const whatsappMonitor = new WhatsAppMonitor();

whatsappMonitor.on('message', async (msgObj) => {
  try {
    await processIncomingWhatsAppMessage(msgObj);
  } catch (err) {
    console.error('[whatsapp] Message processing error:', err.message);
  }
});

whatsappMonitor.on('error', (err) => {
  console.error('[whatsapp] Monitor error:', err.message);
});

app.listen(PORT, () => {
  console.log(`[startup] ScamTracer AI Node.js layer listening on port ${PORT}`);
  console.log(`[startup] R Plumber API expected at: ${R_API_URL}`);
  console.log(`[startup] Phase 11: WhatsApp monitor enabled=${whatsappMonitor.isEnabled}, risk_threshold=${RISK_ALERT_THRESHOLD}`);
  if (TEST_MODE) console.log('[startup] SCAMTRACER_TEST_MODE=true — test simulation endpoint active.');

  whatsappMonitor.start().catch((err) => {
    console.error('[startup] WhatsApp monitor failed to start:', err.message);
  });
});
