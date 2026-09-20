// ScamTracer AI — R Plumber API client
//
// This module is the single point of contact between the Node.js communication
// layer and the R analytical engine.
//
// Architecture:
//   Node.js = communication/integration layer (this file)
//   R Plumber = API interface to the R analytics engine
//   R = analytical engine (ML scoring, risk analysis, indicators)
//
// Node.js does NOT calculate any risk scores, ML probabilities, or scam
// indicators. All analytical values come from R.

const axios = require('axios');

const R_API_URL = process.env.R_API_URL || 'http://localhost:8000';
const TIMEOUT_MS = 10000; // 10 s — do not let the process hang indefinitely

/**
 * POST /analyze — send message text to R for full risk assessment.
 * Returns the raw R response object on success.
 * Throws on network error, timeout, or HTTP error from R.
 */
async function analyzeMessage(message) {
  const response = await axios.post(
    `${R_API_URL}/analyze`,
    { message },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: TIMEOUT_MS
    }
  );
  return response.data;
}

/**
 * GET /health — check whether the R analytical backend is reachable and the
 * model is loaded. Throws on network error or timeout.
 */
async function checkRHealth() {
  const response = await axios.get(`${R_API_URL}/health`, {
    timeout: TIMEOUT_MS
  });
  return response.data;
}

/**
 * POST /investigate — send H.I.V.E. conversation data to R for intelligence
 * extraction and behaviour analysis.
 *
 * @param {string} sessionId  The session identifier (for provenance).
 * @param {Array}  conversation  Array of turn objects:
 *   { direction: "INCOMING"|"OUTGOING", text: string, turn: number }
 *
 * Returns the raw R investigation result on success.
 * Throws on network error, timeout, or HTTP error from R.
 */
async function investigateConversation(sessionId, conversation) {
  const response = await axios.post(
    `${R_API_URL}/investigate`,
    { session_id: sessionId, conversation },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: TIMEOUT_MS
    }
  );
  return response.data;
}

module.exports = { analyzeMessage, checkRHealth, investigateConversation, R_API_URL };
