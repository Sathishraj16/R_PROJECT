// ScamTracer AI — Session Store
// Phase 7: In-memory session state management for the user decision flow.
// Phase 8: Extended with HIVE_ENDED state and conversation tracking.
//
// WARNING: Demo-only. Not persistent — state is lost on server restart.
//          A production system would use a database.
//
// State machine:
//
//   POST /message (LOW risk)
//     → NORMAL
//
//   POST /message (MEDIUM or HIGH risk)
//     → USER_DECISION_REQUIRED
//       ↓
//       POST /decision { action: "BLOCK_AND_PROTECT" }
//         → BLOCKED
//       POST /decision { action: "ACTIVATE_HIVE" }
//         → HIVE_ACTIVE
//           ↓
//           POST /hive/message  (multiple turns)
//           POST /hive/end
//             → HIVE_ENDED
//
// Decision threshold:
//   LOW   → NORMAL               (no user action needed)
//   MEDIUM → USER_DECISION_REQUIRED
//   HIGH  → USER_DECISION_REQUIRED
//
// H.I.V.E. is ONLY activated by an explicit user decision (ACTIVATE_HIVE).
// A MEDIUM or HIGH risk score NEVER automatically produces HIVE_ACTIVE.

const crypto = require('crypto');

const STATES = Object.freeze({
  NORMAL:                 'NORMAL',
  USER_DECISION_REQUIRED: 'USER_DECISION_REQUIRED',
  BLOCKED:                'BLOCKED',
  HIVE_ACTIVE:            'HIVE_ACTIVE',
  HIVE_ENDED:             'HIVE_ENDED'
});

// Risk levels that require a user decision before any action is taken.
const DECISION_THRESHOLD = new Set(['MEDIUM', 'HIGH']);

// Allowed user actions. Any other string is rejected.
const VALID_ACTIONS = new Set(['BLOCK_AND_PROTECT', 'ACTIVATE_HIVE']);

// In-memory store — Map<session_id, session_object>
const sessions = new Map();

/**
 * Create a new session from an incoming message and its R risk assessment.
 * State is set based on risk_level using the decision threshold above.
 */
function createSession(message, riskAssessment) {
  const sessionId = crypto.randomUUID();
  const state = DECISION_THRESHOLD.has(riskAssessment.risk_level)
    ? STATES.USER_DECISION_REQUIRED
    : STATES.NORMAL;

  const session = {
    session_id:      sessionId,
    state,
    message,
    risk_assessment: riskAssessment,
    decision:        null,
    created_at:      new Date().toISOString(),
    decided_at:      null
  };
  sessions.set(sessionId, session);
  return session;
}

/**
 * Retrieve a session by ID. Returns null if not found.
 */
function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * Apply a user decision to a session.
 * Enforces valid state transitions:
 *   USER_DECISION_REQUIRED → BLOCKED     (BLOCK_AND_PROTECT)
 *   USER_DECISION_REQUIRED → HIVE_ACTIVE (ACTIVATE_HIVE)
 *
 * All other transitions are rejected with a descriptive error code.
 * Returns { ok: true, session } on success, { ok: false, code, message } on failure.
 */
function applyDecision(sessionId, action) {
  const session = sessions.get(sessionId);

  if (!session) {
    return {
      ok: false,
      code: 'SESSION_NOT_FOUND',
      message: `Session '${sessionId}' not found.`
    };
  }

  if (session.state === STATES.NORMAL) {
    return {
      ok: false,
      code: 'NO_DECISION_REQUIRED',
      message: 'No decision is required for this session — risk level is LOW.'
    };
  }

  if (session.state === STATES.BLOCKED) {
    return {
      ok: false,
      code: 'ALREADY_BLOCKED',
      message: 'This session is already blocked. H.I.V.E. cannot be activated on a blocked session.'
    };
  }

  if (session.state === STATES.HIVE_ACTIVE) {
    return {
      ok: false,
      code: 'ALREADY_ACTIVE',
      message: 'H.I.V.E. is already active for this session.'
    };
  }

  if (session.state !== STATES.USER_DECISION_REQUIRED) {
    return {
      ok: false,
      code: 'INVALID_STATE',
      message: `Cannot apply decision in current state '${session.state}'.`
    };
  }

  session.state      = action === 'BLOCK_AND_PROTECT' ? STATES.BLOCKED : STATES.HIVE_ACTIVE;
  session.decision   = action;
  session.decided_at = new Date().toISOString();

  if (session.state === STATES.HIVE_ACTIVE) {
    session.conversation       = [];
    session.interaction_count  = 0;
    session.hive_started_at    = new Date().toISOString();
    session.hive_ended_at      = null;
    session.intelligence       = null; // populated after each H.I.V.E. turn
    session.stop_reason        = null; // set on auto-stop or preserved for display
  }

  return { ok: true, session };
}

/**
 * Record a single H.I.V.E. interaction (one incoming + one outgoing message).
 * Requires the session to be in HIVE_ACTIVE state.
 * Returns { ok: true, session } on success, { ok: false, code, message } on failure.
 */
function addInteraction(sessionId, incoming, outgoing, strategy) {
  const session = sessions.get(sessionId);

  if (!session) {
    return { ok: false, code: 'SESSION_NOT_FOUND', message: `Session '${sessionId}' not found.` };
  }
  if (session.state !== STATES.HIVE_ACTIVE) {
    return {
      ok: false,
      code: 'NOT_HIVE_ACTIVE',
      message: `H.I.V.E. is not active for this session (state: ${session.state}).`
    };
  }

  const now = new Date().toISOString();
  session.conversation.push(
    { direction: 'INCOMING', text: incoming,  timestamp: now, strategy },
    { direction: 'OUTGOING', text: outgoing,  timestamp: now }
  );
  session.interaction_count += 1;

  return { ok: true, session };
}

/**
 * End a H.I.V.E. engagement session.
 * Transitions HIVE_ACTIVE → HIVE_ENDED.
 * A session in HIVE_ENDED cannot be continued.
 * Returns { ok: true, session } on success, { ok: false, code, message } on failure.
 */
function endHiveSession(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) {
    return { ok: false, code: 'SESSION_NOT_FOUND', message: `Session '${sessionId}' not found.` };
  }
  if (session.state === STATES.HIVE_ENDED) {
    return { ok: false, code: 'ALREADY_ENDED', message: 'This H.I.V.E. session has already ended.' };
  }
  if (session.state !== STATES.HIVE_ACTIVE) {
    return {
      ok: false,
      code: 'NOT_HIVE_ACTIVE',
      message: `H.I.V.E. is not active for this session (state: ${session.state}).`
    };
  }

  session.state        = STATES.HIVE_ENDED;
  session.hive_ended_at = new Date().toISOString();

  return { ok: true, session };
}

module.exports = {
  createSession,
  getSession,
  applyDecision,
  addInteraction,
  endHiveSession,
  STATES,
  VALID_ACTIONS,
  DECISION_THRESHOLD
};
