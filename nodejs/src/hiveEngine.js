// ScamTracer AI — H.I.V.E. Engagement Engine
// Phase 8: Deterministic rule-based response strategy.
//
// Purpose: Generate controlled H.I.V.E. responses to incoming scammer messages.
//
// Design principles:
//   - Deterministic: same message + same interactionCount → same response.
//     No external API or LLM dependency. Suitable for offline college demo.
//   - Probing: all responses are questions gathering investigative intelligence.
//   - Safe: no response provides OTPs, passwords, credentials, or payment details.
//
// Architecture:
//   selectStrategy(message)    → identifies the scam pattern
//   generateResponse(message, interactionCount) → deterministic response
//
// Strategy selection checks patterns in priority order. The first match wins.
// Fallback: NEUTRAL_CLARIFICATION for unmatched messages.

const STRATEGIES = Object.freeze({
  OTP_DEFLECTION:        'otp_deflection',
  CREDENTIAL_DEFLECTION: 'credential_deflection',
  PAYMENT_PROBE:         'payment_probe',
  SUSPENSION_PROBE:      'suspension_probe',
  URL_PROBE:             'url_probe',
  PRIZE_PROBE:           'prize_probe',
  NEUTRAL_CLARIFICATION: 'neutral_clarification'
});

// Rules are checked in order — first match wins.
const STRATEGY_RULES = [
  {
    strategy: STRATEGIES.OTP_DEFLECTION,
    pattern:  /\b(otp|one.time.?(password|code|pin)|verification\s+code|passcode|6.digit)\b/i
  },
  {
    strategy: STRATEGIES.CREDENTIAL_DEFLECTION,
    pattern:  /\b(password|your\s+pin|login\s+id|username|debit\s+card\s+number|cvv|card\s+number|net\s+banking)\b/i
  },
  {
    strategy: STRATEGIES.PAYMENT_PROBE,
    pattern:  /\b(transfer|send\s+(money|fund|rs|amount)|pay(ment)?|upi\s*id|neft|imps|account\s+number|bank\s+account)\b/i
  },
  {
    strategy: STRATEGIES.SUSPENSION_PROBE,
    pattern:  /\b(suspend|block(ed)?|freez(e|ing)|deactivat|clos(ed|e)|terminat)\b/i
  },
  {
    strategy: STRATEGIES.URL_PROBE,
    pattern:  /https?:\/\/|www\.|\.com\/|\.in\/|click\s+(here|this\s+link)|open\s+link|visit\s+link/i
  },
  {
    strategy: STRATEGIES.PRIZE_PROBE,
    pattern:  /\b(won|winner|prize|lottery|reward|congratulation|selected\s+for|lucky)\b/i
  }
];

// Response templates for each strategy.
// Each strategy has 3 templates cycled by interactionCount to avoid repetition.
//
// SAFETY GUARANTEE: No template provides credentials, OTPs, account numbers,
// payment authorisation, or any real sensitive information.
// All responses are controlled probing questions.
const TEMPLATES = {
  [STRATEGIES.OTP_DEFLECTION]: [
    "I received a notification, but I need to understand the process first. Why would you need a code from me to verify my own account?",
    "Can you explain what official system requires this code? My bank usually handles verification through their own application.",
    "Before I share any code, can you send me the official case reference number for this verification request?"
  ],
  [STRATEGIES.CREDENTIAL_DEFLECTION]: [
    "I am not comfortable sharing account details through this channel. What is the official procedure for this kind of request?",
    "Could you provide the official helpline number so I can call and verify this request independently?",
    "My bank has never asked for that information through a message. Which department is handling this?"
  ],
  [STRATEGIES.PAYMENT_PROBE]: [
    "Could you provide an official reference number and the registered name of the organization this payment would go to?",
    "I would need written confirmation of this payment requirement before proceeding. Can you send that through official channels?",
    "What is the official account name and registration number of the entity requesting this transfer?"
  ],
  [STRATEGIES.SUSPENSION_PROBE]: [
    "Can you provide the official reference number for this account issue and the name of your department?",
    "I would like to verify this by calling the official customer care number. Which bank or organization are you from?",
    "What is the official escalation process if I want to dispute this account action?"
  ],
  [STRATEGIES.URL_PROBE]: [
    "Can you tell me the official name of the organization behind this link before I open it?",
    "I prefer to navigate to official websites directly. What is the registered company name I should look for?",
    "Why would an official organization send a link through this channel rather than their verified domain?"
  ],
  [STRATEGIES.PRIZE_PROBE]: [
    "Could you provide the official terms and conditions document for this prize?",
    "What is the name of the registered organization running this programme, and where can I verify it independently?",
    "How did you obtain my contact information for this prize notification?"
  ],
  [STRATEGIES.NEUTRAL_CLARIFICATION]: [
    "I need more information before I can proceed. Could you provide official documentation for this request?",
    "Can you clarify what official process this relates to and provide a reference number?",
    "I would like to verify this through official channels. Could you provide your organization's registered contact details?"
  ]
};

/**
 * Select the response strategy for an incoming message.
 * Checks STRATEGY_RULES in order; returns first match.
 * Falls back to NEUTRAL_CLARIFICATION if no rule matches.
 */
function selectStrategy(message) {
  for (const rule of STRATEGY_RULES) {
    if (rule.pattern.test(message)) return rule.strategy;
  }
  return STRATEGIES.NEUTRAL_CLARIFICATION;
}

/**
 * Generate a controlled H.I.V.E. response.
 *
 * @param {string} message          Incoming message from the suspected scammer.
 * @param {number} interactionCount Number of completed interactions so far (0-indexed).
 * @returns {{ strategy: string, response: string }}
 *
 * Deterministic: interactionCount cycles through templates so repeated messages
 * on the same topic produce varied (but stable) probing responses.
 */
function generateResponse(message, interactionCount) {
  const strategy = selectStrategy(message);
  const pool     = TEMPLATES[strategy];
  const response = pool[interactionCount % pool.length];
  return { strategy, response };
}

module.exports = { generateResponse, selectStrategy, STRATEGIES, TEMPLATES };
