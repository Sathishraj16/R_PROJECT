// ScamTracer AI — R response validator
//
// Validates that the response from R's /analyze endpoint contains proper scalar
// fields before the Node.js layer creates an alert or session.
//
// WHY THIS IS NEEDED:
//   R's jsonlite serializes NULL list elements as {} (empty JSON objects), not
//   JSON null. This means a malformed or empty-message R response produces:
//     { "risk_score": {}, "model_probability": {}, "ml_score": {} }
//   In JavaScript, {} < 60 → NaN < 60 → false, which silently bypasses the
//   risk threshold check and creates a garbage alert.
//   This validator explicitly rejects any result where numeric fields are not
//   finite numbers.

'use strict';

/**
 * Validate that a risk result from R contains proper scalar fields.
 *
 * @param  {*}      riskResult  - The object returned by analyzeMessage()
 * @param  {*}      messageText - The original message text that was analysed
 * @returns {{ valid: true } | { valid: false, reason: string }}
 */
function validateRiskResult(riskResult, messageText) {
  if (!riskResult || typeof riskResult !== 'object' || Array.isArray(riskResult)) {
    return { valid: false, reason: 'R result is not an object' };
  }

  if (typeof messageText !== 'string' || !messageText.trim()) {
    return { valid: false, reason: 'message is empty or not a string' };
  }

  const numericFields = ['risk_score', 'model_probability', 'ml_score', 'indicator_score'];
  for (const field of numericFields) {
    const val = riskResult[field];
    if (typeof val !== 'number' || !isFinite(val)) {
      return {
        valid:  false,
        reason: `${field} is not a finite number (got ${JSON.stringify(val)}) — likely an empty-message R response with NULL serialized as {}`
      };
    }
  }

  if (typeof riskResult.risk_level !== 'string') {
    return { valid: false, reason: `risk_level is not a string (got ${typeof riskResult.risk_level})` };
  }

  if (typeof riskResult.prediction !== 'string') {
    return { valid: false, reason: `prediction is not a string (got ${typeof riskResult.prediction})` };
  }

  return { valid: true };
}

module.exports = { validateRiskResult };
