// ScamTracer AI — Analysis Logger
//
// Formats a presentation-friendly analysis block for every incoming text message.
// This is a PURE DISPLAY function:
//   - It never recalculates risk scores or probabilities.
//   - All values come directly from the R analysis result.
//   - It never sends the analysis to the WhatsApp sender.
//   - It only prints to the Node.js operator console.

'use strict';

const BORDER = '─'.repeat(44);

/**
 * Format a full analysis log block for one incoming WhatsApp message.
 *
 * @param {string} from        - WhatsApp sender identifier
 * @param {string} body        - Original message text
 * @param {object} riskResult  - Validated R analysis result (all scalar fields)
 * @param {number} threshold   - Risk alert threshold (e.g. 60)
 * @returns {string} Multi-line log string, ready for console.log()
 */
function formatAnalysisLog(from, body, riskResult, threshold) {
  const time    = new Date().toTimeString().slice(0, 8);
  const isAlert = riskResult.risk_score >= threshold;
  const decision = isAlert ? 'ALERT TRIGGERED' : 'NO ALERT';
  const reason   = isAlert
    ? `Risk Score >= ${threshold}`
    : `Risk Score < ${threshold}`;

  // Truncate long messages for terminal readability — never for risk scoring
  const msgDisplay = body.length > 140
    ? body.slice(0, 140) + '…'
    : body;

  const indicators = Array.isArray(riskResult.detected_indicators) && riskResult.detected_indicators.length > 0
    ? riskResult.detected_indicators.map(i => `  - ${i}`).join('\n')
    : '  None';

  return [
    BORDER,
    'SCAMTRACER — MESSAGE ANALYSIS',
    `Time:   ${time}`,
    `Sender: ${from || 'unknown'}`,
    '',
    'Message:',
    `"${msgDisplay}"`,
    '',
    `Risk Score:      ${riskResult.risk_score}/100`,
    `Risk Level:      ${riskResult.risk_level}`,
    `Prediction:      ${riskResult.prediction}`,
    '',
    `ML Probability:  ${riskResult.model_probability}`,
    `ML Score:        ${riskResult.ml_score}/60`,
    `Indicator Score: ${riskResult.indicator_score}/40`,
    '',
    'Detected Indicators:',
    indicators,
    '',
    `Threshold: ${threshold}`,
    `Decision:  ${decision}`,
    `Reason:    ${reason}`,
    BORDER,
  ].join('\n');
}

module.exports = { formatAnalysisLog, BORDER };
