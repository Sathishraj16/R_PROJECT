# ScamTracer AI — Project Log

---

## Phase 12 Final Integration — Terminal Logging, Richer Panel, Context Safety, 32 New Tests

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Complete Phase 12 by:
1. Adding a formatted terminal analysis block for every incoming WhatsApp message
2. Fixing the "(message text unavailable)" bug in the extension
3. Expanding the floating panel to show sender, prediction, and detected indicators
4. Hardening the extension against Chrome extension-context invalidation
5. Adding 32 new test checks (15 in test_whatsapp.js, 17 in test_extension.js)

### Changes

**`nodejs/src/analysisLogger.js` (NEW)**
Pure function `formatAnalysisLog(from, body, riskResult, threshold)` — formats a human-readable analysis block for the Node.js operator terminal. Reads values directly from R's result; never recalculates. Called by `processIncomingWhatsAppMessage` after R analysis and validation pass. Exported for unit testing.

**`nodejs/src/server.js`**
- Import `formatAnalysisLog` from `analysisLogger.js`
- `processIncomingWhatsAppMessage`: call `console.log(formatAnalysisLog(...))` after validation succeeds; the block always prints (whether an alert is created or not), showing the threshold decision
- Updated empty-body skip log message: `[ScamTracer] Skipped non-text WhatsApp message from <sender>.`

**`extension/content.js`**
- **Bug fix**: Changed `alert.message_text` → `alert.message` (field name used by alertStore.js) — this was causing "(message text unavailable)" in every live alert
- **Expanded panel**: `renderPanel()` now shows sender, risk level/score/prediction meta row, full message (truncated at 200 chars), and detected indicators as a bullet list
- **Context invalidation safety**: Added `_contextValid` boolean flag and `safeSendMessage()` wrapper that catches `chrome.runtime.lastError` and stops polling if the extension context is invalidated. All `chrome.runtime.sendMessage` calls replaced with `safeSendMessage`

**`extension/popup.js`**
- **Bug fix**: Changed `a.message_text` → `a.message` in pending alert list preview (was showing "Alert ID: xxx" fallback for every alert)

**`extension/styles.css`**
- Added `.scamtracer-meta` (risk level/score/prediction row), `.scamtracer-sender`, `.scamtracer-indicators`, `.scamtracer-indicator`, `.scamtracer-indicator-none`

### Test Results
- **test_extension.js**: **35/35 passed** (18 original + 17 new F-checks)
- **test_whatsapp.js unit**: **54/54 passed** (39 original + 10 new E1–E10 unit tests; E11–E15 integration skipped — require server)
- All existing baselines unchanged

### Terminal Output Sample (live alert)
```
────────────────────────────────────────────
SCAMTRACER — MESSAGE ANALYSIS
Time:   20:15:32
Sender: 91xxx@c.us

Message:
"URGENT! Your bank account will be suspended today. Send your OTP and complete the UPI payment..."

Risk Score:      65/100
Risk Level:      HIGH
Prediction:      LEGITIMATE

ML Probability:  0.4128
ML Score:        24.77/60
Indicator Score: 40/40

Detected Indicators:
  - OTP Request
  - Account Suspension Threat
  - Financial / Payment Language
  - Urgent Language
  - ...

Threshold: 60
Decision:  ALERT TRIGGERED
Reason:    Risk Score >= 60
────────────────────────────────────────────
```

---

## Phase 12 Hotfix — WhatsApp Alert Pipeline Bug Fix

**Date:** 2026-09-20
**Status:** COMPLETE

### Root Causes Found and Fixed

**Bug 1 — `risk_score: {}` (malformed alerts from non-text WhatsApp messages)**

Root cause: `R/api/plumber.R` returned `NULL` for numeric fields in its empty-message short-circuit path. In R's jsonlite, `NULL` list elements serialize as `{}` (empty JSON object), not `null`. JavaScript receives `{}`, and `{} < 60` evaluates to `NaN < 60 = false`, silently bypassing the risk threshold check and creating garbage alerts.

Fix: Changed `NULL` to `NA_real_` / `NA_character_` in the plumber.R empty-message early return. `NA_real_` serializes as `null` in JSON (correct). JavaScript's `null < 60 = true`, so the threshold check now correctly rejects empty messages.

**Bug 2 — `whatsapp_msg_id: { fromMe, remote, id, $1 }` (full object stored)**

Root cause: `whatsappClient.js` used `msg.id._serialized || msg.id`. With newer `@lid` identifiers in whatsapp-web.js, `msg.id._serialized` is `undefined`, so `undefined || msg.id` stored the full object.

Fix: Extracted `normalizeWhatsAppMessage(msg)` that uses `typeof msg.id._serialized === 'string'` check. Falls back to `null`, never stores the object.

**Bug 3 — `message: ""` (non-text WhatsApp messages processed)**

Root cause: Non-text messages (stickers, reactions, images) have `msg.body = ""`. These were emitted and sent to R.

Fix: `normalizeWhatsAppMessage` + the `message` event handler now skip any message where `body.trim()` is empty. `processIncomingWhatsAppMessage` also has an early return guard.

### Defense-in-Depth Layers Added

1. `R/api/plumber.R` — source fix: `NA_real_` instead of `NULL`
2. `nodejs/src/whatsappClient.js` — `normalizeWhatsAppMessage()`: only primitive values, skip empty bodies
3. `nodejs/src/riskResultValidator.js` (NEW) — `validateRiskResult()`: rejects any result where numeric fields are not finite numbers
4. `nodejs/src/server.js` — `processIncomingWhatsAppMessage`: empty-body guard + `validateRiskResult()` call before alert creation
5. `nodejs/src/alertStore.js` — last-resort guard in `createAlert()`: rejects non-finite `risk_score`

### Development Reset Mechanism

`POST /test/reset-alerts` (available only when `SCAMTRACER_TEST_MODE=true`) calls `resetAlerts()` in alertStore.js, clearing all in-memory alerts and running totals. Use this to discard the 11 malformed historical alerts after restarting the server.

### Files Changed
- `R/api/plumber.R` — NULL → NA_real_ fix
- `nodejs/src/whatsappClient.js` — normalizeWhatsAppMessage, skip empty bodies, export
- `nodejs/src/riskResultValidator.js` (NEW) — validateRiskResult
- `nodejs/src/server.js` — import validator, processIncomingWhatsAppMessage guards, reset endpoint
- `nodejs/src/alertStore.js` — createAlert guard, resetAlerts()
- `tests/test_whatsapp.js` — Case D: 15 new normalization/validation unit tests

### Test Results
- **Phase 11 test_whatsapp.js (unit + integration): 63/63 passed** (28 unit A/B + 15 new D + 20 integration C including reset endpoint check)
- R API tests (test_api.R): 55/55
- All existing baselines: unchanged

### GET /alerts After Fix (Controlled Real Test)
Message: `"URGENT! Your bank account will be suspended today. Send your OTP and complete the UPI payment immediately to avoid account closure."`

```json
{
  "whatsapp_msg_id": "live-test-001",
  "message": "URGENT! Your bank account will be suspended today. Send your OTP and complete the UPI payment immediately to avoid account closure.",
  "risk_score": 65,
  "risk_level": "HIGH",
  "prediction": "LEGITIMATE",
  "model_probability": 0.4128,
  "ml_score": 24.77,
  "indicator_score": 40,
  "detected_indicators": ["OTP Request","Account Suspension Threat","Credential Sharing Request","Financial / Payment Language","Urgent Language","Banking / Account Language","UPI ID / Payment Reference"],
  "status": "USER_DECISION_REQUIRED"
}
```

All fields are correct primitive types. Scores come from the real R model — not fabricated.

---

## Phase 12 — Chrome Extension UI

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Build a minimal Chrome extension that displays a floating alert panel on WhatsApp Web whenever the Node.js backend detects a suspicious message. The extension surfaces existing backend alerts to the user via a browser UI — it never sends messages to contacts and never activates H.I.V.E. automatically.

### Work Completed
- Created `extension/manifest.json` — Manifest V3; content script on `https://web.whatsapp.com/*`; background service worker; `host_permissions` for `http://localhost:3000/*`; popup action.
- Created `extension/background.js` — Service worker handling `FETCH_ALERTS`, `FETCH_STATUS`, `POST_DECISION` messages from content script. All HTTP requests to `localhost:3000` go through here (content scripts cannot reach `http://` from `https://`).
- Created `extension/content.js` — Runs on WhatsApp Web; polls `GET /alerts` every 2 seconds; renders floating alert panel for alerts meeting `status === USER_DECISION_REQUIRED AND risk_score >= 60`; tracks shown `alert_id` values in a `Set` for deduplication; handles BLOCK & PROTECT and ACTIVATE H.I.V.E. button clicks via `POST /alerts/:id/decision`.
- Created `extension/styles.css` — Floating panel styles: fixed position, top-right, high z-index, colour-coded risk levels (critical/high/medium), slide-in animation.
- Created `extension/popup.html` + `extension/popup.js` — Toolbar popup showing backend connection status, WhatsApp enabled state, risk threshold, pending alert count, and preview of up to 3 pending alerts.
- Created `extension/README.md` — 10-step manual test instructions for Windows.
- Created `tests/test_extension.js` — 18 checks: file presence (E1), manifest validity (E2), `shouldShowAlert` threshold logic at 59/60/86/BLOCKED/dedup (E3), no WhatsApp sendMessage API calls in content.js (E4), optional backend endpoint checks (E5, requires server).

### Safety Constraints (all enforced)
- Extension **never** sends a message to the suspicious sender
- Extension **never** automatically activates H.I.V.E. — explicit button click required
- Extension **never** exposes risk analysis to the suspicious sender
- `content.js` contains zero WhatsApp Web internal API calls (verified by E4 test)
- Alert panel cannot be dismissed without making a decision

### Files Created
- `extension/manifest.json`
- `extension/background.js`
- `extension/content.js`
- `extension/styles.css`
- `extension/popup.html`
- `extension/popup.js`
- `extension/README.md`
- `tests/test_extension.js`

### Test Results
- Phase 12 extension tests: **18/18 passed** (E5a–E5e skipped — require live server)
- Existing regression (R unit): 69/69 (risk engine) + 79/79 (intelligence/behaviour) = 148/148
- Phase 11 unit tests: 28/28
- Full baseline: 556/556 confirmed unchanged

---

## Phase 11 — Live WhatsApp QR Integration + Real-Time Scam Alerts

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Add live WhatsApp Web integration using `whatsapp-web.js`. Incoming messages are intercepted in real time, analysed by the R risk engine, and — if above a configurable threshold — presented as alerts for the user to decide upon. The dashboard gains a Live Monitor tab. H.I.V.E. is never activated automatically; explicit user consent is required for all actions.

### Work Completed
- Installed `whatsapp-web.js@1.34.7` and `qrcode-terminal@0.12.0` (210 new packages, 294 total).
- Created `nodejs/src/alertStore.js` — in-memory alert store with UUID alert IDs, deduplication by WhatsApp message ID, running totals, and `ALERT_STATES` enum.
- Created `nodejs/src/whatsappClient.js` — `WhatsAppMonitor` EventEmitter wrapping `whatsapp-web.js`; injectable client factory for test mocking; `WHATSAPP_ENABLED=false` no-op mode; never sends messages.
- Updated `nodejs/src/server.js` — added `processIncomingWhatsAppMessage()`, `SCAMTRACER_RISK_THRESHOLD` config (default 60), four new REST endpoints, test simulation endpoint, and WhatsApp monitor wiring.
- Updated `dashboard/ui.R` — added seventh tab: Live Monitor with status display, metrics, alert cards, BLOCK & PROTECT / ACTIVATE H.I.V.E. buttons.
- Updated `dashboard/server.R` — added `reactivePoll()` for `/whatsapp/status` and `/alerts` every 2s, alert card rendering, decision button `observeEvent` handlers.
- Updated `dashboard/helpers.R` — added `fetch_whatsapp_status()`, `fetch_alerts()`, `post_decision()` using `httr` (already in renv.lock).
- Updated `.gitignore` — added `.wwebjs_auth/` and `.wwebjs_cache/`.
- Created `tests/test_whatsapp.js` — 28 unit checks (A1–A20 alertStore, B1–B9 WhatsAppMonitor) + 19 integration checks (C1–C19, require server running). **Unit result: 28/28 passed.**

### Safety Constraints (verbatim from spec, all enforced)
- Monitor is DETECTION + USER NOTIFICATION ONLY — no automatic replies, no H.I.V.E. activation
- No OTPs, passwords, credentials, or payment information sent automatically
- No WhatsApp messages sent by this system at any point
- Explicit user consent required for all actions via POST /alerts/:id/decision
- No authentication credentials stored in source code
- `.wwebjs_auth/` and `.wwebjs_cache/` excluded from Git

### New REST Endpoints

| Endpoint | Purpose |
|---|---|
| GET /whatsapp/status | Connection state, total_analysed, total_suspicious, pending_decisions |
| GET /alerts | All suspicious-message alerts (most recent first) |
| GET /alerts/:id | Single alert by alert_id |
| POST /alerts/:id/decision | User action: BLOCK_AND_PROTECT or ACTIVATE_HIVE |
| POST /test/simulate-whatsapp | Test only (SCAMTRACER_TEST_MODE=true) — simulate incoming message |

### Files Created
- `nodejs/src/alertStore.js` — in-memory alert storage
- `nodejs/src/whatsappClient.js` — WhatsAppMonitor EventEmitter
- `tests/test_whatsapp.js` — Phase 11 test suite

### Files Modified
- `nodejs/src/server.js` — new endpoints, WhatsApp wiring
- `nodejs/package.json` — whatsapp-web.js + qrcode-terminal
- `dashboard/ui.R` — added Live Monitor tab (tab 7)
- `dashboard/server.R` — Live Monitor reactive outputs
- `dashboard/helpers.R` — Node.js API fetch helpers
- `.gitignore` — WhatsApp session exclusions

### Test Results
- Phase 11 unit tests: 28/28 passed (alertStore + whatsappClient, no server required)
- Phase 11 integration tests (C1–C19): require Node.js on port 3001 with SCAMTRACER_TEST_MODE=true
- Existing regression tests: 53+54+63 = 170/170 Node.js tests still passing

### Environment Variables (Phase 11)
| Variable | Default | Purpose |
|---|---|---|
| SCAMTRACER_RISK_THRESHOLD | 60 | Minimum risk_score to create an alert |
| WHATSAPP_ENABLED | true | false = no real client started (dev/test mode) |
| SCAMTRACER_TEST_MODE | false | true = enables POST /test/simulate-whatsapp |

---

## Phase 10 — R Shiny Dashboard + Complete End-to-End Showcase

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Build the final R Shiny investigation dashboard visualizing output from all previous phases (risk assessment, H.I.V.E. conversation, intelligence extraction, behaviour analysis). Update the demo runner to include the full pipeline through investigation. Provide a complete end-to-end showcase.

### Work Completed
- Created `dashboard/helpers.R` — data bridge: `setup_analytics()` sources all R engines; `load_demo_data()` runs `analyze_risk()` + reconstructs H.I.V.E. conversation + runs `investigate_session()` and returns all results as a structured list. Also includes an R port of `hiveEngine.js` strategy logic (`.hive_select_strategy()`, `.hive_generate_response()`) to reconstruct deterministic H.I.V.E. responses without requiring Node.js.
- Created `dashboard/ui.R` — six-tab `navbarPage` UI: Overview/Risk, H.I.V.E. Status, Conversation, Intelligence, Behaviour Analysis, Investigation Summary. Custom CSS. No extra package dependencies.
- Created `dashboard/server.R` — server logic driving all six tabs: reactive outputs consuming `load_demo_data()` results. `renderTable` for tables, `renderPlot` (ggplot2) for charts, `renderUI` for styled dynamic content.
- Replaced `dashboard/app.R` placeholder — full implementation: working directory bootstrap, `setup_analytics()`, sources `ui.R`/`server.R`, calls `shinyApp(ui, server)`.
- Updated `nodejs/src/runHiveDemo.js` — added Step 5: calls `POST /investigate`, prints investigation results (entities, behaviours, statements), saves session output to `data/demo/demo_session_output.json`.
- Created `tests/test_dashboard.R` — 83-check test suite (Cases A–M). **Result: 83/83 passed.**
- All regressions still passing.

### Dashboard Sections

| Tab | Content |
|---|---|
| Overview / Risk | Session message, risk score (0–100), risk level badge, ML prediction, model probability, ML score, indicator score, detected indicators, explanations, model caveat |
| H.I.V.E. Status | Session state (HIVE_ENDED), engagement turns, total messages, metadata table, consent note |
| Conversation | Full 10-message conversation (5 scammer + 5 H.I.V.E.), styled with direction-colored rows, explicit labeling of SCAMMER vs H.I.V.E. |
| Intelligence | Entity table (Type/Value/Turn/Direction/Source) with type filter, entity type bar chart, entity count summary |
| Behaviour Analysis | Behaviour table (Behaviour/Severity/Turn/Evidence), behaviour frequency bar chart, escalation + repeated request alerts |
| Investigation Summary | Factual statements list, summary counts table, escalation/repeated alerts, system info, full project disclaimer |

### Files Created
- `dashboard/helpers.R` — data loading + chart + table helpers
- `dashboard/ui.R` — six-section navbarPage UI
- `dashboard/server.R` — server logic
- `tests/test_dashboard.R` — Phase 10 test suite (83/83 passed)

### Files Modified
- `dashboard/app.R` — replaced placeholder with full implementation
- `nodejs/src/runHiveDemo.js` — added Step 5 (investigate + save output)

### Packages / Dependencies Added
None. Phase 10 uses `shiny`, `ggplot2`, `jsonlite`, `stringr` — all already in renv.lock.

### Commands Executed
```bash
# Run Phase 10 tests (no server needed):
cd "E:/R PROJECT"
Rscript tests/test_dashboard.R    # Phase 10: 83/83

# Launch dashboard (from project root, R Plumber and Node.js NOT required):
Rscript -e 'shiny::runApp("dashboard", port=4000, launch.browser=FALSE)'
# Open browser at http://localhost:4000

# Run full end-to-end demo (both services must be running):
# Terminal 1: Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'
# Terminal 2: cd nodejs && npm start
# Terminal 3: node nodejs/src/runHiveDemo.js
```

### Tests Performed

#### Phase 10 Tests (`tests/test_dashboard.R`)
- A: All four dashboard files exist
- B: helpers.R loads cleanly, all public functions defined
- C: setup_analytics() loads all four R engines without error
- D: load_demo_data() returns correct structure (scenario, risk, conversation, investigation)
- E: Risk assessment — risk_score numeric, risk_level HIGH, prediction SCAM, probability in [0,1], score in [0,100]
- F: Conversation — 10 messages, correct INCOMING/OUTGOING order, all text non-empty, no OTP values in OUTGOING responses
- G: Intelligence — 7 entities, UPI_ID with @fakebank, URL, OTP_REQUEST, PAYMENT_REQUEST, all provenance fields present
- H: Behaviour — 10 records, URGENCY/THREAT/IMPERSONATION/ESCALATION/REPEATED_REQUEST all detected, all fields present
- I: Summary — statements non-empty, escalation_detected=TRUE, repeated_requests=TRUE, n_turns=5, no "scammer" claims, "Observed" language
- J: Table formatters — correct data.frames, filter works, correct row counts
- K: Chart renderers — ggplot objects returned for both populated and empty data
- L: ui.R/server.R source correctly, valid Shiny app object created
- M: Edge cases — empty inputs return 0-row data.frames, risk_colour returns valid hex

**Result: 83/83 passed**

#### Regression Tests
- Phase 4: **69/69 passed**
- Phase 9: **79/79 passed**
(Phases 5–8 use live services; R-only regression confirmed via test_risk_engine.R and test_intelligence_behaviour.R)

### End-to-End Validation (Dashboard)
Ran `load_demo_data()` inside test suite. Dashboard values confirmed against actual R output:

| Property | Dashboard Value | Verified |
|---|---|---|
| Initial message | "Your FakeSecure Bank account has been flagged…" | ✓ demo scenario |
| Risk score | 71 | ✓ from analyze_risk() |
| Risk level | HIGH | ✓ from analyze_risk() |
| ML prediction | SCAM | ✓ from analyze_risk() |
| Conversation turns | 5 (10 messages) | ✓ reconstructed from demo scenario |
| Entities extracted | 7 | ✓ from investigate_session() |
| Behaviour records | 10 | ✓ from investigate_session() |
| Escalation detected | TRUE | ✓ from investigate_session() |
| Repeated requests | TRUE | ✓ from investigate_session() |

No fabricated values. All dashboard outputs are derived from actual R function calls on the demo scenario.

### Known Limitations
1. **Dashboard is standalone** — calls R analytics directly; does not require Node.js or R Plumber. This means it uses the R port of hiveEngine.js (`.hive_generate_response()`) to reconstruct H.I.V.E. responses deterministically rather than calling the live Node.js session.
2. **No DT (DataTables)** — tables use Shiny's built-in `renderTable`. Sorting and pagination require DT package (not installed).
3. **No live session integration** — dashboard always shows the fixed demo scenario. Integrating with a live Node.js session would require either persisting session data to disk or calling the Node.js API from Shiny.
4. **ML model India-specific limitation** — as noted in Phase 9: model trained on UK/Singapore SMS; OTP/UPI patterns may score MEDIUM rather than HIGH by ML alone; indicator engine compensates.

---

## Phase 9 — Intelligence Extraction + Behaviour Analysis

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Build intelligence extraction and behaviour analysis on top of the Phase 8 H.I.V.E. conversation history. R performs all analytical work. Node.js remains the communication layer. The system extracts observable entities from conversation turns and detects scam behaviour patterns. Provenance (source text + turn number) is preserved for every extracted item.

### Work Completed
- Created `R/analysis/intelligence_extractor.R` — entity extraction engine (`extract_entities`) and investigation orchestrator (`investigate_session`). Extracts: PHONE, UPI_ID, URL, EMAIL, BANK_NAME, TRANSACTION_ID, OTP_REQUEST, PAYMENT_REQUEST, CREDENTIAL_REQUEST.
- Created `R/analysis/behaviour_analyzer.R` — behaviour pattern detector (`analyze_behaviour`). Detects: URGENCY, THREAT, IMPERSONATION, OTP_SOLICITATION, PAYMENT_REQUEST, CREDENTIAL_REQUEST, REPEATED_REQUEST, ESCALATION.
- Updated `R/api/plumber.R` — sourced both Phase 9 modules, added `POST /investigate` endpoint. Version 0.9.0.
- Updated `nodejs/src/rApiClient.js` — added `investigateConversation()`.
- Updated `nodejs/src/server.js` — added `POST /investigate` route (retrieves conversation from session store, adds turn numbers, forwards to R). Version 0.9.0.
- Created `tests/test_intelligence_behaviour.R` — 79-check test suite (Cases A–S). **Result: 79/79 passed.**
- All regressions still passing.

### Entity Extraction Categories
| Entity Type        | Detection method                                              |
|---|---|
| PHONE              | Regex: 10-digit Indian mobile numbers, international formats  |
| UPI_ID             | Regex: `username@bank` pattern without TLD                    |
| URL                | Regex: `http(s)://` prefixed strings                          |
| EMAIL              | Regex: `user@domain.tld` pattern (requires TLD)               |
| BANK_NAME          | Curated dictionary of 20+ bank name fragments (substring match) |
| TRANSACTION_ID     | Keyword prefix (ref/txn/transaction/ticket) + digit-containing ID |
| OTP_REQUEST        | Keyword regex: "otp", "6-digit", "one-time code", "passcode" |
| PAYMENT_REQUEST    | Keyword regex: "transfer", "send money", "pay", "upi id", "neft" |
| CREDENTIAL_REQUEST | Keyword regex: "password", "atm pin", "cvv", "net banking"    |

### Behaviour Detection Categories
| Behaviour         | Severity | Detection method                              |
|---|---|---|
| URGENCY           | HIGH     | Time-pressure keywords: "immediately", "final warning", "within N" |
| THREAT            | HIGH     | Suspension/block keywords: "suspended", "frozen", "deactivated" |
| IMPERSONATION     | HIGH     | "security team", "fraud department", "from SBI/bank" patterns |
| OTP_SOLICITATION  | HIGH     | OTP keyword patterns                          |
| PAYMENT_REQUEST   | HIGH     | Payment keyword patterns                      |
| CREDENTIAL_REQUEST| HIGH     | Credential keyword patterns                   |
| REPEATED_REQUEST  | MEDIUM   | Same category detected in 2+ distinct turns   |
| ESCALATION        | HIGH     | Sensitivity rank increases across turns (1=impersonation → 6=payment) |

### Files Created
- `R/analysis/intelligence_extractor.R` — entity extraction + investigation orchestrator
- `R/analysis/behaviour_analyzer.R` — behaviour pattern analysis
- `tests/test_intelligence_behaviour.R` — Phase 9 test suite (79/79 passed)

### Files Modified
- `R/api/plumber.R` — sourcing + POST /investigate, version 0.9.0
- `nodejs/src/rApiClient.js` — added investigateConversation()
- `nodejs/src/server.js` — added POST /investigate route, version 0.9.0
- `CLAUDE_HANDOVER.md` — updated to Phase 9 complete
- `README.md` — updated status and commands

### Packages / Dependencies Added
None. Phase 9 uses `stringr` (already in renv.lock from Phase 2).

### Commands Executed
```bash
# Start R Plumber API (Terminal 1 — project root):
Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'

# Start Node.js server (Terminal 2 — nodejs/):
cd "E:/R PROJECT/nodejs" && npm start

# Investigate a HIVE_ENDED session:
curl -X POST http://localhost:3000/investigate \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<id of HIVE_ENDED session>"}'

# Run all tests:
cd "E:/R PROJECT"
Rscript tests/test_risk_engine.R          # Phase 4
Rscript tests/test_api.R                  # Phase 5
node tests/test_integration.js            # Phase 6
node tests/test_decision_flow.js          # Phase 7
node tests/test_hive_engagement.js        # Phase 8
Rscript tests/test_intelligence_behaviour.R # Phase 9
```

### Tests Performed

#### Phase 9 Tests (`tests/test_intelligence_behaviour.R`)
- A: Phone number extraction (10-digit mobile, international)
- B: UPI ID extraction, value and provenance verified
- C: URL extraction, value and provenance verified
- D: Email extraction, correctly distinguished from UPI
- E: Bank name extraction (FakeSecure Bank, SBI)
- F: Transaction/reference ID extraction (digit-containing IDs only)
- G: OTP request detection (explicit "OTP", "6-digit OTP")
- H: Payment request detection ("transfer", "Rs")
- I: Credential request detection ("ATM PIN", "net banking password")
- J: Urgency detection with evidence preserved
- K: Threat/suspension detection with evidence preserved
- L: Impersonation detection ("security team at FakeSecure Bank", "fraud team from SBI")
- M: Repeated request detection (OTP in turns 2 + 3)
- N: Escalation detection (rank 1 → rank 6 across 4 turns)
- O: Empty conversation → empty results (no crash)
- P: Null/whitespace turns → skipped gracefully, valid turns still extracted
- Q: Benign message → 0 entities, 0 behaviours (no fabrication)
- R: Provenance fields verified (entity_type, value, source_text, turn, direction)
- S: Full `investigate_session()` integration: correct counts, repeated=TRUE, escalation=TRUE

**Result: 79/79 passed**

#### Regression Tests
- Phase 4: **69/69 passed**
- Phase 5: **55/55 passed**
- Phase 6: **53/53 passed**
- Phase 7: **54/54 passed**
- Phase 8: **63/63 passed**

### Actual Investigation Output (recorded — not fabricated)

Ran on the demo session (5 turns, banking scam scenario):
```
Entities (7):
  [BANK_NAME]          turn=1  fakesecure bank
  [OTP_REQUEST]        turn=2  OTP solicitation: "6-digit OTP"
  [OTP_REQUEST]        turn=3  OTP solicitation: "OTP"
  [UPI_ID]             turn=4  verifyaccount@fakebank
  [PAYMENT_REQUEST]    turn=4  Payment request: "transfer"
  [PAYMENT_REQUEST]    turn=4  Payment request: "payment"
  [URL]                turn=5  http://fakesecure-verify.fictional/confirm

Behaviours (10):
  [IMPERSONATION]      turn=1  sev=HIGH  "security team"
  [OTP_SOLICITATION]   turn=2  sev=HIGH  "6-digit"
  [URGENCY]            turn=3  sev=HIGH  "final warning"
  [THREAT]             turn=3  sev=HIGH  "suspended"
  [OTP_SOLICITATION]   turn=3  sev=HIGH  "OTP"
  [URGENCY]            turn=4  sev=HIGH  "immediately"
  [PAYMENT_REQUEST]    turn=4  sev=HIGH  "transfer"
  [REPEATED_REQUEST]   turn=2  sev=MEDIUM  "OTP_SOLICITATION in turns: 2, 3"
  [REPEATED_REQUEST]   turn=3  sev=MEDIUM  "URGENCY in turns: 3, 4"
  [ESCALATION]         turn=1  sev=HIGH  "Sensitivity rank increased from 1 to 6 across 4 turns"

Investigation statements:
  - Observed 1 bank name mention(s).
  - Observed OTP solicitation in 2 turn(s).
  - Observed 1 UPI ID(s).
  - Observed payment / transfer request in 2 turn(s).
  - Observed 1 URL(s).
  - Observed impersonation of an organisation or authority.
  - Observed OTP solicitation behaviour in 2 turn(s).
  - Observed urgency / time pressure in 2 turn(s).
  - Observed account suspension or blocking threat in 1 turn(s).
  - Observed payment request behaviour in 1 turn(s).
  - Observed repeated requests of the same category across multiple turns.
  - Observed escalating pattern: sensitivity of requests increased across turns.
```

### Known Limitations
1. Entity extraction uses regex only — no semantic NLP. Unusual phrasings may be missed.
2. BANK_NAME uses a curated 20-entry dictionary — not exhaustive.
3. Phone extraction may produce false positives on long numeric sequences (e.g., in URLs).
4. No cross-conversation entity correlation (Phase 10+ scope).
5. ML model limitation (from Phase 3) still applies to the initial risk score: India-specific scam patterns (UPI, OTP) may score as LEGITIMATE by the SMS-trained ML model; the indicator engine compensates.

---

## Phase 8 — H.I.V.E. Controlled Engagement Engine

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Implement the H.I.V.E. controlled engagement engine. Sessions in `HIVE_ACTIVE` state can send and receive messages through `POST /hive/message`. The system generates deterministic, rule-based probing responses. `POST /hive/end` transitions the session to `HIVE_ENDED`. No real credentials, OTPs, or payments are ever generated or requested. All demo data is fictional.

### Work Completed
- Created `data/demo/hive_demo_scenario.json` — fictional banking scam scenario (5 turns, all values fabricated: "FakeSecure Bank", "verifyaccount@fakebank", "fakesecure-verify.fictional").
- Created `nodejs/src/hiveEngine.js` — deterministic rule-based response engine (7 strategies, 3 templates each, cycles by interaction count, no external LLM required).
- Updated `nodejs/src/sessionStore.js` — added `HIVE_ENDED` state, conversation fields initialized on HIVE_ACTIVE transition, `addInteraction()`, `endHiveSession()`.
- Updated `nodejs/src/server.js` — `POST /hive/message`, `POST /hive/end`, version 0.8.0.
- Created `nodejs/src/runHiveDemo.js` — end-to-end demo runner (full consent chain → 5-turn engagement → HIVE_ENDED).
- Created `tests/test_hive_engagement.js` — 63-check test suite covering scenarios A–O.
- All regressions still passing.

### State Machine (extended)
```
POST /message (MEDIUM or HIGH risk)
  → USER_DECISION_REQUIRED

     POST /decision ACTIVATE_HIVE
       → HIVE_ACTIVE

          POST /hive/message  (one turn per call)
          POST /hive/end
            → HIVE_ENDED      (terminal — no further engagement)
```

### H.I.V.E. Response Strategies
| Strategy              | Trigger patterns                            |
|---|---|
| otp_deflection        | "otp", "6-digit", "one-time code/password"  |
| credential_deflection | "password", "pin", "cvv", "net banking"     |
| payment_probe         | "transfer", "upi id", "send money", "neft"  |
| suspension_probe      | "suspend", "freeze", "deactivate", "block"  |
| url_probe             | "http://", "www.", "click here", "open link"|
| prize_probe           | "won", "prize", "lottery", "congratulation" |
| neutral_clarification | (fallback — no other pattern matched)       |

All responses are probing questions only. No response provides credentials, OTPs, or payment authorisation.

### Files Created
- `data/demo/hive_demo_scenario.json` — fictional demo scenario (5 turns)
- `nodejs/src/hiveEngine.js` — deterministic rule-based response engine
- `nodejs/src/runHiveDemo.js` — end-to-end demo runner
- `tests/test_hive_engagement.js` — Phase 8 test suite (63/63 passed)

### Files Modified
- `nodejs/src/sessionStore.js` — HIVE_ENDED state, conversation fields, addInteraction(), endHiveSession()
- `nodejs/src/server.js` — POST /hive/message, POST /hive/end, version 0.8.0
- `CLAUDE_HANDOVER.md` — updated to Phase 8 complete
- `README.md` — updated status and startup docs

### Packages / Dependencies Added
None. Phase 8 adds no new npm packages.

### Commands Executed
```bash
# Start R Plumber API (Terminal 1 — project root):
Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'

# Start Node.js server (Terminal 2 — nodejs/):
cd "E:/R PROJECT/nodejs" && npm start

# Run demo:
node nodejs/src/runHiveDemo.js

# Run all tests:
cd "E:/R PROJECT"
Rscript tests/test_risk_engine.R       # Phase 4
Rscript tests/test_api.R               # Phase 5
node tests/test_integration.js         # Phase 6
node tests/test_decision_flow.js       # Phase 7
node tests/test_hive_engagement.js     # Phase 8
```

### Tests Performed

#### Phase 8 H.I.V.E. Engagement Tests (`tests/test_hive_engagement.js`)
- A: Missing session_id → HTTP 400
- B: Missing message field → HTTP 400
- C: Empty/whitespace message → HTTP 400
- D: Unknown session_id → HTTP 404 SESSION_NOT_FOUND
- E: NORMAL state session → HTTP 409 NOT_HIVE_ACTIVE
- F: USER_DECISION_REQUIRED state → HTTP 409 NOT_HIVE_ACTIVE
- G: BLOCKED state → HTTP 409 NOT_HIVE_ACTIVE
- H: OTP message → otp_deflection strategy, probing question, interaction_number=1
- I: Payment message → payment_probe strategy, probing question
- J: URL message → url_probe strategy
- K: Neutral message → neutral_clarification strategy
- L: Multiple turns — interaction_number increments; template cycles on turn 4 (same as turn 1); turns 1/2 differ
- M: POST /hive/end → HIVE_ENDED, conversation_length correct
- N: HIVE_ENDED cannot be ended again (409 ALREADY_ENDED); /hive/message rejected (409 NOT_HIVE_ACTIVE)
- O: Full explicit consent chain — HIGH risk → USER_DECISION_REQUIRED → /hive/message rejected → ACTIVATE_HIVE → HIVE_ACTIVE → engagement → HIVE_ENDED

**Result: 63/63 passed**

#### Regression Tests
- Phase 4: **69/69 passed**
- Phase 5: **55/55 passed**
- Phase 6: **53/53 passed**
- Phase 7: **54/54 passed**

### Actual Demo Output (recorded — not fabricated)

```
ScamTracer AI — H.I.V.E. Controlled Engagement Demo
Scenario: Banking Verification Scam — H.I.V.E. Controlled Engagement Demo

Step 1 — POST /message
Message: "Your FakeSecure Bank account has been flagged for unauthorized access. Share the 6-digit OTP..."
HTTP 200 | State: USER_DECISION_REQUIRED | Risk: HIGH (score: 71/100) | Prediction: SCAM

Step 2 — POST /decision { action: ACTIVATE_HIVE }  (explicit user consent)
HTTP 200 | State: HIVE_ACTIVE

TURN 1 [suspension_threat + impersonation]
SCAMMER: "Dear customer, this is the security team at FakeSecure Bank..."
H.I.V.E. [neutral_clarification]: "I need more information before I can proceed. Could you provide official documentation for this request?"

TURN 2 [otp_request]
SCAMMER: "...please share the 6-digit OTP..."
H.I.V.E. [otp_deflection]: "Can you explain what official system requires this code? My bank usually handles verification through their own application."

TURN 3 [urgency escalation]
SCAMMER: "Your account will be permanently suspended within 30 minutes..."
H.I.V.E. [otp_deflection]: "Before I share any code, can you send me the official case reference number..."

TURN 4 [payment_request]
SCAMMER: "...transfer Rs 1 to UPI ID verifyaccount@fakebank..."
H.I.V.E. [payment_probe]: "Could you provide an official reference number and the registered name of the organization this payment would go to?"

TURN 5 [link_click_request]
SCAMMER: "...click this link: http://fakesecure-verify.fictional/confirm"
H.I.V.E. [url_probe]: "I prefer to navigate to official websites directly. What is the registered company name I should look for?"

Step 4 — POST /hive/end
HTTP 200 | State: HIVE_ENDED | Conversation turns: 5
```

---

## Phase 7 — User Notification and Explicit Decision Flow

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Implement the user-controlled decision layer between scam detection (R) and any subsequent action (Phase 8). When R flags a message as MEDIUM or HIGH risk, Node.js creates a session and presents the user with two explicit choices: BLOCK & PROTECT or ACTIVATE H.I.V.E. Neither choice happens automatically. H.I.V.E. requires explicit user activation.

### Work Completed
- Created `nodejs/src/sessionStore.js` — in-memory session store with state machine and decision threshold logic.
- Implemented `POST /message` in `nodejs/src/server.js` — full intake flow: validate → forward to R → create session → return notification if suspicious.
- Implemented `POST /decision` in `nodejs/src/server.js` — explicit user decision endpoint with full state transition enforcement.
- Refactored shared R-error handler out of both routes (`handleRError()`).
- Bumped server version to 0.7.0.
- Created `tests/test_decision_flow.js` — 54-check test suite covering scenarios A–J plus explicit consent verification.
- All regressions still passing.

### State Machine
```
POST /message (LOW risk)
  → NORMAL                    (no user action needed)

POST /message (MEDIUM or HIGH risk)
  → USER_DECISION_REQUIRED

     POST /decision BLOCK_AND_PROTECT
       → BLOCKED

     POST /decision ACTIVATE_HIVE
       → HIVE_ACTIVE           (starting state for Phase 8)
```

### Decision Policy
- LOW risk → NORMAL (no notification, no user action)
- MEDIUM risk → USER_DECISION_REQUIRED
- HIGH risk → USER_DECISION_REQUIRED
- Source: R's `risk_level` field — no independent Node.js risk calculation

### Files Created
- `nodejs/src/sessionStore.js` — in-memory session state management
- `tests/test_decision_flow.js` — Phase 7 test suite (54/54 passed)

### Files Modified
- `nodejs/src/server.js` — POST /message, POST /decision, refactored error handler, version 0.7.0
- `CLAUDE_HANDOVER.md` — updated to Phase 7 complete
- `README.md` — updated status and startup docs

### Packages / Dependencies Added
None. Node's built-in `crypto` module provides `randomUUID()`.

### Commands Executed
```bash
# Start R Plumber API (Terminal 1 — project root):
Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'

# Start Node.js server (Terminal 2 — nodejs/):
cd "E:/R PROJECT/nodejs" && npm start

# Run all tests:
cd "E:/R PROJECT"
Rscript tests/test_risk_engine.R    # Phase 4
Rscript tests/test_api.R            # Phase 5
node tests/test_integration.js      # Phase 6
node tests/test_decision_flow.js    # Phase 7
```

### Tests Performed

#### Phase 7 Decision Flow Tests (`tests/test_decision_flow.js`)
- Test A: LOW risk → NORMAL, no notification, no H.I.V.E.
- Test B: MEDIUM risk → USER_DECISION_REQUIRED, notification with both actions
- Test C: HIGH risk → USER_DECISION_REQUIRED (NOT HIVE_ACTIVE — consent required)
- Test D: BLOCK_AND_PROTECT → BLOCKED
- Test E: ACTIVATE_HIVE → HIVE_ACTIVE (explicit user decision, session starts in USER_DECISION_REQUIRED)
- Test F: Decision without session_id → HTTP 400
- Test G: Invalid action (DELETE_ACCOUNT) → HTTP 400
- Test H: BLOCK then ACTIVATE_HIVE → HTTP 409 ALREADY_BLOCKED
- Test I: Repeated ACTIVATE_HIVE → HTTP 409 ALREADY_ACTIVE
- Test J: Unknown session_id → HTTP 404 SESSION_NOT_FOUND
- Critical: HIGH risk → USER_DECISION_REQUIRED → ACTIVATE_HIVE → HIVE_ACTIVE (3-step explicit consent verification)
- Input validation: missing field, null, wrong type

**Result: 54/54 passed**

#### Regression Tests
- Phase 4: **69/69 passed**
- Phase 5: **55/55 passed**
- Phase 6: **53/53 passed**

### Actual Manual Test Results (recorded — not fabricated)

#### POST /message — MEDIUM risk (banking scam)
```
HTTP 200
{
  "session_id": "eddc76a7-baa8-4241-aafb-538ff35858ef",
  "status": "USER_DECISION_REQUIRED",
  "risk_assessment": { "risk_level": "MEDIUM", "risk_score": 53, "indicator_score": 40, ... },
  "notification": {
    "title": "Suspicious message detected",
    "message": "This message has been assessed as MEDIUM risk (score: 53/100)...",
    "actions": ["BLOCK_AND_PROTECT", "ACTIVATE_HIVE"]
  }
}
```

#### POST /decision — BLOCK_AND_PROTECT
```
HTTP 200
{ "session_id": "...", "status": "BLOCKED", "action": "BLOCK_AND_PROTECT", "message": "Conversation blocked and protected..." }
```

#### POST /decision on BLOCKED session → ACTIVATE_HIVE
```
HTTP 409
{ "error": true, "code": "ALREADY_BLOCKED", "message": "This session is already blocked. H.I.V.E. cannot be activated on a blocked session." }
```

#### POST /message — HIGH risk (prize scam)
```
HTTP 200
{ "status": "USER_DECISION_REQUIRED", "risk_assessment": { "risk_level": "HIGH", "risk_score": 73 }, ... }
```
Note: status is USER_DECISION_REQUIRED, NOT HIVE_ACTIVE. H.I.V.E. requires explicit user activation.

#### POST /decision — ACTIVATE_HIVE (explicit consent)
```
HTTP 200
{ "status": "HIVE_ACTIVE", "action": "ACTIVATE_HIVE", "message": "H.I.V.E. activated...", "note": "State transition only. Phase 8 not yet implemented." }
```

#### POST /message — LOW risk
```
HTTP 200
{ "status": "NORMAL", "risk_assessment": { "risk_level": "LOW", "risk_score": 8 } }
No notification field present.
```

### Important Technical Decisions

1. **Risk level from R drives the state** — Node.js uses R's `risk_level` to determine session state. No independent Node.js scoring.
2. **In-memory session store** — acceptable for a college demo. Not persistent across server restarts. Documented.
3. **UUID session IDs** — Node.js built-in `crypto.randomUUID()` (Node 14.17+, confirmed with Node 20.18.0).
4. **409 for state conflicts** — HTTP 409 Conflict is the correct code for state transition violations (already blocked, already active).
5. **404 for missing sessions** — HTTP 404 Not Found for unknown session IDs.
6. **HIVE_ACTIVE = state transition only** — no automated replies, scammer engagement, or extraction in Phase 7. Phase 8 note included in response.
7. **`handleRError()` extracted as shared helper** — both `/analyze` and `/message` use the same R-error handling logic.

### Problems Encountered
None. 54/54 tests passed on first run.

### Remaining Problems
1. India-specific scam ML limitation — inherited. Rule-based indicators compensate.
2. In-memory session state — lost on server restart. Demo-level only.

### Next Phase
**Phase 8 — H.I.V.E. Controlled Engagement**: Implement controlled engagement for sessions in HIVE_ACTIVE state. Generate contextually appropriate responses to the scammer, continue recording conversation, trigger intelligence extraction. Requires explicit Phase 8 instruction. H.I.V.E. engagement must remain user-initiated and user-controlled.

---

## Phase 6 — Node.js ↔ R Plumber Integration

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Connect the Node.js communication layer to the existing R Plumber API. Node.js forwards incoming message text to R, receives the full risk assessment JSON, and returns it to the caller. Node.js performs no analytical work — all ML scoring and rule-based indicators remain in R.

### Work Completed
- Implemented `nodejs/src/rApiClient.js` — dedicated R API client module (single canonical source for `R_API_URL`).
- Updated `nodejs/src/server.js` — added `POST /analyze` integration endpoint, enhanced `GET /health` to probe R backend, added logging middleware and input validation.
- Created `tests/test_integration.js` — 53-check end-to-end integration test suite (plain Node.js, no extra dependencies).
- Updated `nodejs/package.json` — added `test` script pointing to `tests/test_integration.js`.
- Manual end-to-end tests recorded (actual responses, not fabricated).
- R unavailable scenario tested with `R_API_URL=http://localhost:9999` — HTTP 503 confirmed.
- Phase 4 regression: 69/69 still passing.
- Phase 5 regression: 55/55 still passing.
- Phase 6 integration: 53/53 passed.

### Files Created
- `nodejs/src/rApiClient.js` — R Plumber API client (analyzeMessage, checkRHealth, R_API_URL)
- `tests/test_integration.js` — Phase 6 integration test suite

### Files Modified
- `nodejs/src/server.js` — full Phase 6 implementation (was placeholder)
- `nodejs/package.json` — added test script
- `CLAUDE_HANDOVER.md` — updated to Phase 6 complete
- `README.md` — updated to Phase 6 complete

### Packages / Dependencies Added
None. `axios` and `express` were already installed from Phase 1.

### Commands Executed
```bash
# Start R Plumber API (Terminal 1 — project root):
cd "E:/R PROJECT"
Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'

# Start Node.js server (Terminal 2 — nodejs/):
cd "E:/R PROJECT/nodejs"
npm start

# Run integration tests (Terminal 3 — project root):
cd "E:/R PROJECT"
node tests/test_integration.js
```

### Tests Performed

#### Phase 6 Integration Tests (`tests/test_integration.js`)
- Test 1: GET /health — Node healthy + R reachable
- Test 2: POST /analyze — normal conversational message (full Node→R→Node flow)
- Test 3: POST /analyze — prize/promotional scam message
- Test 4: POST /analyze — banking scam with OTP + suspension (5 indicators detected)
- Test 5: POST /analyze — OTP credential request
- Test 6: Input validation — missing field, null, wrong type, empty body
- Test 7: All 11 R response fields verified to pass through Node unmodified

**Result: 53/53 passed**

#### Phase 5 Regression (`tests/test_api.R`)
**Result: 55/55 passed** (R Plumber unaffected)

#### Phase 4 Regression (`tests/test_risk_engine.R`)
**Result: 69/69 passed** (R analytics engine unaffected)

### Actual Manual Test Results (recorded — not fabricated)

#### GET /health via Node.js
```
HTTP 200
{
  "node_status": "ok",
  "service": "ScamTracer AI Node.js Communication Layer",
  "version": "0.6.0",
  "r_api_url": "http://localhost:8000",
  "r_api_status": "ok",
  "r_model_loaded": true,
  "r_model_name": "Logistic Regression (Elastic Net)",
  "r_model_f1": 0.7807,
  "r_model_auc": 0.9639
}
```

#### POST /analyze — banking scam (via Node.js, routed to R)
Input: `{"message": "Your bank account will be suspended today. Send the OTP immediately to verify your account."}`
```
HTTP 200
{
  "prediction": "LEGITIMATE",
  "model_probability": 0.2194,
  "ml_score": 13.16,
  "indicator_score": 40,
  "risk_score": 53,
  "risk_level": "MEDIUM",
  "detected_indicators": ["OTP Request", "Account Suspension Threat", "Credential Sharing Request", "Urgent Language", "Banking / Account Language"],
  ...
}
```
Note: prediction=LEGITIMATE because ML model trained on UK/Singapore SMS; composite risk=53 (MEDIUM) because rule-based indicators compensate — documented limitation from Phase 5.

#### POST /analyze — legitimate message (via Node.js, routed to R)
Input: `{"message": "Hey, are we still meeting at the coffee shop at 5 PM? Let me know."}`
```
HTTP 200
{ "prediction": "LEGITIMATE", "risk_level": "LOW", "risk_score": 8, "indicator_score": 0 }
```

#### R unavailable scenario (port 9999)
```
HTTP 503
{ "error": true, "message": "R analytical backend is unavailable. Ensure the R Plumber API is running at http://localhost:9999." }
```

#### Input validation errors (Node.js validates before forwarding to R)
- `{}` → HTTP 400, "Required field 'message' is missing."
- `{"message": null}` → HTTP 400, "Field 'message' must not be null."
- `{"message": 12345}` → HTTP 400, "Field 'message' must be a string. Received type: number."

### Important Technical Decisions

1. **`rApiClient.js` as canonical URL source** — `R_API_URL` defined once in `rApiClient.js`, exported to `server.js`. Not hard-coded in multiple places.
2. **Node.js validates before forwarding** — basic type checks in Node prevent unnecessary R calls for obviously invalid input. R's more detailed validation remains as a second layer.
3. **503 for R unavailability** — HTTP 503 Service Unavailable is the correct code when the upstream analytical service cannot be reached, distinguishing it from 500 (internal Node error) and 400 (bad client input).
4. **All R fields pass through unchanged** — `POST /analyze` returns the full R JSON object without modification, transformation, or recalculation. The `caveat` field (statistical disclaimer from R) is included.
5. **Health endpoint reports both layers** — `GET /health` reports `node_status` (Node.js) and `r_api_status` (R backend) separately. A healthy Node.js with unavailable R reports `r_api_status: unavailable`.
6. **No analytical logic in Node.js** — verified by test: risk_score, model_probability, indicator_score, detected_indicators all originate from R.
7. **Axios timeout 10 seconds** — prevents Node.js from hanging indefinitely if R is slow.

### Problems Encountered

None. Both services started cleanly. All 53 integration checks passed on first run. Phase 4 and Phase 5 regressions unaffected.

### Remaining Problems

1. **India-specific scam ML limitation** — inherited from Phase 5. OTP/KYC/UPI messages get lower ML scores because training data is UK/Singapore SMS. Rule-based indicators compensate (MEDIUM composite risk). Documented.
2. **R_API_URL not validated at startup** — Node.js starts even if R_API_URL is unreachable; error is only reported at request time or at health check. Acceptable for a local demonstration.

### Next Phase
**Phase 7 — User Notification and BLOCK & PROTECT / ACTIVATE H.I.V.E. Choice**
Implement the user decision flow: upon MEDIUM or HIGH risk result, present the user with BLOCK & PROTECT or ACTIVATE H.I.V.E. options via the `/message` endpoint. H.I.V.E. activation must remain off-by-default and require explicit user consent.

---

## Phase 0 — Project Initialization

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Initialize the project documentation and development rules. No application code, dependencies, datasets, or models are created in this phase. The purpose is to establish a shared understanding of the project goals, architecture, and working rules before any implementation begins.

### Work Completed
- Created `PROJECT_RULES.md` — permanent rules, architecture, technology decisions, documentation rules, constraints.
- Created `PROJECT_LOG.md` — this file; chronological project history starting with Phase 0.
- Created `CLAUDE_HANDOVER.md` — current-state snapshot for AI handover.

### Files Created
- `E:\R PROJECT\PROJECT_RULES.md`
- `E:\R PROJECT\PROJECT_LOG.md`
- `E:\R PROJECT\CLAUDE_HANDOVER.md`

### Files Modified
None.

### Packages / Dependencies Added
None.

### Commands Executed
None.

### Tests Performed
- Verified all three documentation files exist in the project root.
- Read back each file to confirm required content is present.

### Test Results
All three files created successfully and contain the required information.

### Project Objective (documented here for record)
ScamTracer AI is a cyber-security and scam-intelligence system based on the H.I.V.E. (Heuristic Intelligence & Virtual Entrapment) architecture.

**H.I.V.E. Workflow:**
```
Incoming Conversation
  → Scam Detection
  → User Notification
  → User chooses:
       1. BLOCK & PROTECT
       2. ACTIVATE H.I.V.E.
  → If H.I.V.E. activated:
       Controlled Engagement → Intelligence Extraction
       → Behaviour Analysis → Entity Correlation → Investigation Report
```

**Key Design Principle:** The user remains in control. The system never automatically engages a scammer. Engagement requires explicit user consent.

### Technology Direction (documented here for record)
- **Primary analytical technology:** R (data cleaning, NLP, ML, risk scoring, graph analysis, Shiny dashboard, Plumber API)
- **Communication/integration layer:** Node.js (WhatsApp interface, passing data to/from R Plumber)
- **Architecture:** WhatsApp → Node.js → R Plumber → R Analytics Engine → R Shiny Dashboard → Investigation Report

### Development Rules (summary)
- Phase-by-phase development, no skipping.
- No fabricated results of any kind.
- User remains in control of H.I.V.E. activation.
- R is the analytical core; Node.js is limited to communication.
- Every phase must be tested before being marked complete.
- All documentation must reflect actual codebase state.

### Important Technical Decisions
- R chosen as primary analytical technology because the project is analytically intensive and R provides a unified ecosystem for NLP, ML, graph analysis, and interactive dashboards.
- Node.js chosen for the communication layer only, keeping a clean separation between integration concerns and analytical concerns.
- H.I.V.E. user-consent model chosen to ensure the tool cannot be misused as an automated engagement bot.
- Documentation-first approach chosen to ensure any AI instance can continue development without losing context.

### Problems Encountered
None.

### Problems Resolved
None.

### Remaining Problems
None.

### Next Phase
**Phase 1 — Project Scaffold and Environment Setup**
Recommended tasks:
1. Define the project folder structure.
2. Initialize the R project (`.Rproj` file or `renv` for reproducibility).
3. Initialize the Node.js project (`package.json`).
4. Document required R packages and install them.
5. Document required Node.js packages.
6. Verify the R and Node.js environments are working correctly.
7. Create placeholder/stub files for the main components (R Plumber API, R Shiny app, Node.js server).
8. Update PROJECT_LOG.md and CLAUDE_HANDOVER.md.

---

## Phase 1 — Project Scaffold and Environment Setup

**Date:** 2026-09-20
**Status:** COMPLETE (with one known issue — see below)

### Objective
Create a clean, reproducible project foundation: directory structure, R project file, renv setup script, Node.js project with dependencies, placeholder source files for all major components, README, and .gitignore. No analytical functionality is implemented in this phase.

### Work Completed
- Created full directory structure matching the intended architecture.
- Created `ScamTracerAI.Rproj` — R project file for RStudio.
- Created `renv_setup.R` — script to initialize renv and install all required R packages (run after R is installed).
- Created `nodejs/package.json` — Node.js project manifest.
- Installed Node.js dependencies: `express` (^4.19.0), `axios` (^1.7.0). 83 packages total, 0 vulnerabilities.
- Created `nodejs/src/server.js` — Node.js communication layer placeholder with `/health` and stub endpoints.
- Created `R/main.R` — R engine entry point placeholder.
- Created `R/api/plumber.R` — R Plumber API placeholder with `/health` stub.
- Created `R/preprocessing/cleaner.R` — data cleaning placeholder.
- Created `R/nlp/text_features.R` — NLP feature engineering placeholder.
- Created `R/models/classifier.R` — ML classifier placeholder.
- Created `R/analysis/risk_scorer.R` — risk scoring placeholder.
- Created `R/network/entity_graph.R` — entity correlation graph placeholder.
- Created `R/utils/helpers.R` — utility functions placeholder.
- Created `dashboard/app.R` — R Shiny dashboard placeholder.
- Created `README.md` — project overview with architecture, tech stack, structure, run instructions (all marked NOT IMPLEMENTED where appropriate).
- Created `.gitignore` — excludes node_modules, renv library, raw data, trained model files, R session files.

### Files Created
```
E:\R PROJECT\ScamTracerAI.Rproj
E:\R PROJECT\renv_setup.R
E:\R PROJECT\README.md
E:\R PROJECT\.gitignore
E:\R PROJECT\R\main.R
E:\R PROJECT\R\api\plumber.R
E:\R PROJECT\R\preprocessing\cleaner.R
E:\R PROJECT\R\nlp\text_features.R
E:\R PROJECT\R\models\classifier.R
E:\R PROJECT\R\analysis\risk_scorer.R
E:\R PROJECT\R\network\entity_graph.R
E:\R PROJECT\R\utils\helpers.R
E:\R PROJECT\dashboard\app.R
E:\R PROJECT\nodejs\package.json
E:\R PROJECT\nodejs\package-lock.json
E:\R PROJECT\nodejs\src\server.js
```

### Directories Created
```
E:\R PROJECT\R\data\
E:\R PROJECT\R\preprocessing\
E:\R PROJECT\R\nlp\
E:\R PROJECT\R\models\
E:\R PROJECT\R\analysis\
E:\R PROJECT\R\network\
E:\R PROJECT\R\utils\
E:\R PROJECT\R\api\
E:\R PROJECT\nodejs\src\
E:\R PROJECT\data\raw\
E:\R PROJECT\data\processed\
E:\R PROJECT\data\demo\
E:\R PROJECT\models\
E:\R PROJECT\dashboard\
E:\R PROJECT\reports\
E:\R PROJECT\tests\
E:\R PROJECT\docs\
```

### Files Modified
- `PROJECT_LOG.md` — this file (Phase 1 entry added)
- `CLAUDE_HANDOVER.md` — updated to reflect Phase 1 state

### Packages / Dependencies Added

**Node.js (installed):**
- `express` ^4.19.0
- `axios` ^1.7.0
- 83 total packages (transitive dependencies), 0 vulnerabilities

**R packages (NOT yet installed — R not present on this machine):**
Documented in `renv_setup.R`. To be installed once R is set up:
- dplyr, tidyr, stringr, tidytext, ggplot2, igraph, ggraph, tidygraph, plumber, shiny

### Commands Executed
```bash
# Directory creation
mkdir -p R/{data,preprocessing,nlp,models,analysis,network,utils,api} nodejs/src data/{raw,processed,demo} models dashboard reports tests docs

# Node.js dependency installation
cd nodejs && npm install

# Node.js server verification
node src/server.js &
curl http://localhost:3000/health
kill %1
```

### Tests Performed
1. Verified directory structure matches the intended architecture (directory listing).
2. Ran `npm install` in `nodejs/` — successful, 0 vulnerabilities.
3. Started Node.js server (`node src/server.js`) and called `GET /health`.
4. Verified R placeholder files exist and contain syntactically valid placeholder R code.
5. Attempted to locate R installation on this machine — see Problems below.

### Test Results
- **Node.js server:** PASS — starts on port 3000, `/health` returns `{"status":"ok","message":"ScamTracer AI Node.js layer — placeholder only, not implemented","r_api_url":"http://localhost:8000"}`.
- **Node.js `POST /message`:** returns 501 as expected (placeholder).
- **Directory structure:** PASS — all directories present as specified.
- **R placeholder files:** PASS — all files syntactically valid placeholder R scripts.
- **R environment:** BLOCKED — R is not installed on this machine (see Problems).

### Important Technical Decisions
1. **`renv` approach deferred:** Since R is not yet installed, `renv.lock` cannot be generated yet. A `renv_setup.R` script documents exactly what to install and how; when R is available, running this script will initialize renv and snapshot the environment.
2. **`express` chosen over raw `http`:** Express is the standard Node.js web framework, well-suited for the API relay role. Minimal dependency footprint for the communication layer.
3. **`axios` included:** Will be needed for the Node.js layer to make HTTP requests to the R Plumber API. Included now to avoid re-visiting `package.json` unnecessarily.
4. **No WhatsApp libraries installed:** Per project rules, WhatsApp integration is deferred to a later phase.
5. **R placeholder files all commented out:** All `library()` calls and `source()` calls in R placeholders are commented out so files do not fail if accidentally sourced before packages are installed.

### Problems Encountered
1. **R is not installed on this machine.**
   - `Rscript --version` returned "command not found".
   - Search of `C:\Program Files\R`, `D:\`, `E:\`, Windows registry — R not found anywhere.
   - R package installation, `renv` initialization, R syntax verification, and Plumber/Shiny stub testing could not be performed.

### Problems Resolved
- None of the R-related problems could be resolved in this phase — they require R to be installed first.

### Remaining Problems
1. **R not installed** — must be installed before Phase 2 (dataset and preprocessing work) can begin.
   - **Action required by user:** Download and install R from https://cran.r-project.org/
   - Recommended version: R 4.4.x (latest stable)
   - After installation: run `renv_setup.R` to initialize the package environment.

### Next Phase
**Phase 2 — Dataset Selection and Preprocessing Pipeline**

Recommended tasks:
1. Confirm R is installed and `renv_setup.R` has been run successfully.
2. Identify a real, publicly available scam/spam SMS or conversation dataset.
3. Document the dataset fully (name, source, URL, license, record count, columns, class distribution, limitations).
4. Load the dataset into R and perform initial exploratory data analysis (EDA).
5. Implement `R/preprocessing/cleaner.R` with real cleaning logic.
6. Document EDA findings and decide on features for the ML pipeline.
7. Update PROJECT_LOG.md and CLAUDE_HANDOVER.md.

---

## Phase 1 Addendum — R Installation and Package Verification

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Verify R installation and confirm all required R packages install and load correctly before beginning Phase 2.

### Work Completed
- R 4.6.1 (2026-06-24, "Happy Hop") installed and confirmed on PATH.
- User R library created at `C:\Users\sathi\AppData\Local\R\win-library\4.6` (system library at `C:\Program Files\R\R-4.6.1\library` is read-only).
- `renv_setup.R` updated to set CRAN mirror (`https://cloud.r-project.org`) before installing renv — required because R has no default mirror configured on this machine.
- `renv` 1.2.4 installed to user library.
- `renv::init(bare = TRUE)` initialized renv for the project.
- 74 packages installed into renv project library in 64 seconds.
- `renv.lock` written to project root.
- All 10 required R packages verified to load without error.

### Files Created
- `E:\R PROJECT\renv.lock` — renv lockfile, records exact package versions for reproducibility.

### Files Modified
- `E:\R PROJECT\renv_setup.R` — added `options(repos = c(CRAN = "https://cloud.r-project.org"))` at top.
- `E:\R PROJECT\PROJECT_LOG.md` — this addendum.
- `E:\R PROJECT\CLAUDE_HANDOVER.md` — updated to reflect R and package status.

### Packages Verified

| Package    | Version | Status  |
|------------|---------|---------|
| dplyr      | 1.2.1   | SUCCESS |
| tidyr      | 1.3.2   | SUCCESS |
| stringr    | 1.5.x   | SUCCESS |
| tidytext   | 0.4.3   | SUCCESS |
| ggplot2    | 4.0.3   | SUCCESS |
| igraph     | 2.3.3   | SUCCESS |
| ggraph     | 2.2.2   | SUCCESS |
| tidygraph  | 1.3.1   | SUCCESS |
| plumber    | 1.3.3   | SUCCESS |
| shiny      | 1.14.0  | SUCCESS |

**Passed: 10 / 10**

### Commands Executed
```bash
# Verify R installation
R --version
Rscript --version

# Create user library directory (system library not writable)
mkdir -p "C:/Users/sathi/AppData/Local/R/win-library/4.6"

# Run renv setup (installs renv + all required packages, writes renv.lock)
cd "E:/R PROJECT" && Rscript renv_setup.R

# Verify all packages load
Rscript verify_packages.R   # (temp file, deleted after verification)
```

### Problems Encountered
1. System R library (`C:\Program Files\R\R-4.6.1\library`) not writable without admin rights — `install.packages("renv")` failed.
2. No CRAN mirror configured — second run of `renv_setup.R` failed with "trying to use CRAN without setting a mirror".

### Problems Resolved
1. User library at `C:\Users\sathi\AppData\Local\R\win-library\4.6` created manually; R automatically uses it as `R_LIBS_USER` was already set in the environment.
2. Added `options(repos = c(CRAN = "https://cloud.r-project.org"))` to `renv_setup.R` before any `install.packages` call.

### Remaining Problems
None. R environment fully operational.

### Next Phase
**Phase 2 — Dataset Selection and Preprocessing Pipeline** (prerequisites now satisfied)

---

## Phase 2 — Dataset Research, Selection, and Initial Preprocessing

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Identify, evaluate, and select a real, publicly available dataset for ScamTracer AI. Download it, perform EDA, implement the data cleaning pipeline, and prepare an initial NLP feature extraction pipeline. Do NOT train a model in this phase.

---

### Part A — Datasets Investigated

The following datasets were researched before making a selection:

#### 1. UCI SMS Spam Collection v.1 (SELECTED)
- **Source:** UCI Machine Learning Repository
- **URL:** https://archive.ics.uci.edu/dataset/228/sms+spam+collection
- **Direct Download:** https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0) — confirmed on UCI page
- **Records:** 5,574 SMS messages
- **Classes:** 2 — `ham` (legitimate), `spam`
- **Distribution:** 4,827 ham (86.6%), 747 spam (13.4%)
- **Format:** Tab-separated text, no header. Two columns: label (ham/spam) and raw message text.
- **Text-based:** Yes
- **ML Suitability:** High — directly usable for binary text classification
- **Limitations:** English-language UK/Singapore origin; no India-specific scam patterns (UPI, KYC, OTP fraud); imbalanced classes (86.6/13.4)
- **Relevance:** Strong — phone numbers appear in 75.6% of spam vs 0.1% of ham; URLs in 14.1% of spam vs 0% of ham; "free" keyword in 22.8% of spam vs 1.2% of ham

#### 2. Enron Email Dataset (NOT SELECTED)
- **Source:** CMU (Carnegie Mellon University)
- **URL:** https://www.cs.cmu.edu/~enron/
- **Records:** ~500,000 emails
- **Classes:** None — no formal ham/spam labels
- **License:** Unclear (no explicit license stated)
- **File size:** 1.7 GB
- **Limitations:** Not labelled; email not SMS; far too large for a laptop-scale project; authenticity concerns noted in 2026
- **Verdict:** Not suitable

#### 3. Kaggle SMS Spam Collection (NOT SELECTED)
- **Source:** Kaggle (user: uciml)
- **Records:** ~5,574 (mirror of the UCI dataset)
- **License:** Varies by Kaggle listing (CC0 or CC BY depending on upload)
- **Limitations:** Kaggle pages are JavaScript-rendered and could not be fully verified; functionally identical to the UCI source which is preferred as the authoritative, citable origin
- **Verdict:** Not used — UCI is the canonical source

#### 4. Other GitHub/Kaggle SMS spam repos
- All repositories found via GitHub topic search (`sms-spam-detection`) referenced the UCI SMS Spam Collection as their data source. No independent India-specific or scam-specific SMS datasets were found with verifiable records, licence, and direct download.

---

### Part B — Selection Rationale

**Selected dataset: UCI SMS Spam Collection v.1**

Reasons:
1. Only dataset with a fully documented, verified, citable source with a direct download URL not requiring authentication.
2. CC BY 4.0 licence — clearly open for research use with attribution.
3. Text-based binary classification — directly applicable to ScamTracer AI's detection task.
4. 5,574 records — manageable on a laptop; sufficient for Naive Bayes, Logistic Regression, SVM, Decision Tree.
5. Clean structure (two columns; no missing values confirmed by EDA).
6. Strong discriminative signals: phone numbers, URLs, currency, keywords — exactly the entities H.I.V.E. needs to extract in Phase 4.
7. Academically well-cited (Almeida & Hidalgo, 2011, ACM DOCENG'11) — important for a college project demonstration.

**Acknowledged limitation:** The dataset is UK/Singapore-origin English SMS; it does not contain India-specific scam patterns (UPI IDs, KYC fraud, OTP fraud, NEFT, IMPS). This is noted in the codebase. The regex-based H.I.V.E. intelligence extraction layer (Phase 4) will handle India-specific entity extraction independently of the ML training data.

---

### Part C — Dataset Acquisition

- **Download URL:** https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip
- **Download date:** 2026-09-20
- **Raw file stored at:** `data/raw/sms+spam+collection.zip` (203,415 bytes)
- **Extracted files:**
  - `data/raw/SMSSpamCollection` (477,907 bytes — original dataset, tab-separated)
  - `data/raw/readme` (5,868 bytes — dataset documentation from UCI)
- **Verification:** File extracted from valid ZIP archive. Original file timestamp 2011-03-15 preserved. Raw file NOT modified at any point.
- **Citation:** Almeida, T. & Hidalgo, J. (2011). *SMS Spam Collection* [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CC84

---

### Part D — EDA Results (from Rscript R/eda_phase2.R against real data)

All results below are from running R against the actual downloaded file. Nothing is fabricated.

| Property | Value |
|---|---|
| Total rows | 5,574 |
| Columns | 2 (label, text) |
| Column types | character, character |
| Missing values | 0 |
| Exact duplicate rows | 403 (7.2%) |
| Unique labels | ham, spam |

**Class distribution (raw):**

| Class | Count | % |
|---|---|---|
| ham | 4,827 | 86.6% |
| spam | 747 | 13.4% |

**Text length by class:**

| Class | Min chars | Max chars | Mean chars | Median chars | Mean words |
|---|---|---|---|---|---|
| ham | 2 | 910 | 71.5 | 52 | 14.3 |
| spam | 13 | 223 | 138.7 | 149 | 23.9 |

Key observation: Spam messages are significantly longer than ham (mean 138.7 vs 71.5 characters). This is itself a useful ML feature.

**Entity presence % by class:**

| Entity | Ham % | Spam % |
|---|---|---|
| Phone number (≥5 digit sequence) | 0.1% | 75.6% |
| Currency symbol (£/$) | 0.4% | 34.7% |
| URL | 0.0% | 14.1% |
| "free" keyword | 1.2% | 22.8% |
| "won/winner/prize/claim" | 0.4% | 22.5% |
| "urgent" | 0.1% | 8.3% |

Key observation: Phone numbers in 75.6% of spam vs 0.1% of ham is an extremely strong discriminating feature — consistent with the H.I.V.E. intelligence extraction approach.

Other observations:
- 18 messages with fewer than 5 characters — all are ham (natural short replies like "Ok", "Yup")
- 6 messages with more than 500 characters — edge cases
- No empty text records found

---

### Part E — Preprocessing (R/preprocessing/cleaner.R)

**Script:** `R/preprocessing/cleaner.R` (fully implemented)
**Input:** `data/raw/SMSSpamCollection`
**Output:** `data/processed/sms_cleaned.csv` (566,433 bytes)

Preprocessing steps applied:
1. Loaded with explicit column names: `label`, `text`.
2. Validated labels — only "ham" and "spam" present.
3. Removed 403 exact duplicate rows.
4. Trimmed leading/trailing whitespace from text.
5. Added binary label column: `spam_label` (1 = spam, 0 = ham).
6. Added derived columns: `char_count`, `word_count`.
7. Added entity-presence flag columns: `has_url`, `has_phone`, `has_currency`, `has_free`, `has_urgent`, `has_prize`.
8. URLs, phone numbers, currency symbols, digit sequences deliberately NOT stripped — preserved for H.I.V.E. intelligence extraction.

**Post-cleaning dataset:**

| Property | Value |
|---|---|
| Rows | 5,171 (after removing 403 duplicates) |
| Columns | 11 |
| ham | 4,518 (87.37%) |
| spam | 653 (12.63%) |

Column list: `label`, `spam_label`, `text`, `char_count`, `word_count`, `has_url`, `has_phone`, `has_currency`, `has_free`, `has_urgent`, `has_prize`

---

### Part F — NLP Feature Preparation (R/nlp/text_features.R)

**Script:** `R/nlp/text_features.R` (fully implemented)
**Input:** `data/processed/sms_cleaned.csv`
**Outputs:**
  - `data/processed/sms_tokens.csv` (519,473 bytes) — long-form tokenised data
  - `data/processed/sms_tfidf.csv` (5,383,861 bytes) — TF-IDF feature matrix (5,171 rows × 510 columns)

Steps:
1. Lowercased text (original text preserved in cleaned CSV).
2. Tokenised into unigrams using `tidytext::unnest_tokens`.
3. Removed standard English stop words — with deliberate exceptions for scam-signal terms: `free`, `win`, `won`, `winner`, `prize`, `claim`, `cash`, `urgent`, `call`, `now`, `credit`, `loan`, `award`, `reward`, `selected`, `guaranteed`, `offer`, `otp`, `upi`, `kyc`, `blocked`, etc.
4. Removed pure-number tokens and single-character tokens.
5. Computed TF-IDF using `tidytext::bind_tf_idf`.
6. Selected top 500 terms by maximum TF-IDF across corpus.
7. Pivoted to wide document × term matrix.
8. Joined baseline numeric features (char_count, word_count, entity flags).

| Property | Value |
|---|---|
| Total tokens before filtering | 80,520 |
| Tokens after stop-word removal | 32,694 |
| Top terms selected | 500 |
| Feature matrix dimensions | 5,171 rows × 510 columns |
| TF-IDF zero-fill | 0 (sparse entries filled) |
| Spam proportion in matrix | 12.63% |

---

### Files Created
```
E:\R PROJECT\data\raw\sms+spam+collection.zip      — downloaded zip archive (203,415 bytes)
E:\R PROJECT\data\raw\SMSSpamCollection             — original tab-separated dataset (477,907 bytes, unmodified)
E:\R PROJECT\data\raw\readme                        — UCI dataset readme (5,868 bytes)
E:\R PROJECT\R\eda_phase2.R                         — EDA script
E:\R PROJECT\data\processed\sms_cleaned.csv         — cleaned dataset (566,433 bytes)
E:\R PROJECT\data\processed\sms_tokens.csv          — tokenised data (519,473 bytes)
E:\R PROJECT\data\processed\sms_tfidf.csv           — TF-IDF feature matrix (5,383,861 bytes)
```

### Files Modified
```
E:\R PROJECT\R\preprocessing\cleaner.R              — implemented (was placeholder)
E:\R PROJECT\R\nlp\text_features.R                  — implemented (was placeholder)
E:\R PROJECT\PROJECT_LOG.md                         — this entry
E:\R PROJECT\CLAUDE_HANDOVER.md                     — updated
```

### Packages Used
- `dplyr` — data manipulation
- `tidyr` — pivot_wider for feature matrix
- `stringr` — text pattern detection
- `tidytext` — tokenisation, stop words, TF-IDF
- `ggplot2` — (used in EDA script for text statistics)

### Commands Executed
```bash
# Download dataset
curl -L -o "data/raw/sms+spam+collection.zip" "https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip"

# Extract
cd data/raw && unzip -n "sms+spam+collection.zip"

# EDA
Rscript R/eda_phase2.R

# Preprocessing
Rscript R/preprocessing/cleaner.R

# NLP features
Rscript R/nlp/text_features.R
```

### Tests Performed
1. Verified dataset ZIP downloaded successfully (203,415 bytes).
2. Verified ZIP extracted correctly (SMSSpamCollection 477,907 bytes + readme 5,868 bytes).
3. Ran EDA script — produced real class distribution, text statistics, entity analysis. No errors.
4. Ran cleaner.R — produced sms_cleaned.csv (5,171 rows × 11 columns). No errors.
5. Ran text_features.R — produced sms_tfidf.csv (5,171 × 510) and sms_tokens.csv. No errors.
6. Verified raw file modification timestamp unchanged (2011-03-15 — original archive date).

### Test Results
- **EDA script:** PASS — 5,574 rows loaded, class distribution matches documented statistics (86.6/13.4)
- **cleaner.R:** PASS — 403 duplicates removed, 5,171 rows in output
- **text_features.R:** PASS — 80,520 tokens, 32,694 after filtering, 510-column feature matrix
- **Raw file integrity:** PASS — modification timestamp unchanged

### Problems Encountered
None. All scripts ran without errors.

### Problems Resolved
None required.

### Remaining Limitations
1. Dataset is English-language UK/Singapore origin — not India-specific.
2. No UPI IDs, KYC fraud patterns, or NEFT/IMPS references in the training data.
3. Class imbalance (87.37/12.63) — Phase 3 must handle this (class weights, SMOTE, or stratified sampling).
4. renv reports "out-of-sync" on script runs — cosmetic warning; does not affect functionality. Will be resolved by running `renv::snapshot()` if needed.

### Why This Dataset Was Selected
The UCI SMS Spam Collection v.1 is the only publicly available, fully documented, CC BY 4.0 licensed, directly downloadable SMS classification dataset with verified record counts, class labels, and a citable academic source. All other candidates either mirrored it or could not be independently verified. For a college project requiring academic rigour and reproducibility, it is the appropriate choice. Its strong entity-based signals (phone numbers, URLs, keywords) align directly with the H.I.V.E. intelligence extraction goals of ScamTracer AI.

### Next Phase
**Phase 3 — ML Model Training and Evaluation**

Recommended tasks:
1. Select ML model based on dataset characteristics: class imbalance (87/13), 510 features, 5,171 rows.
2. Split data into train/test sets (stratified by class).
3. Address class imbalance (class weights or downsampling).
4. Train at least two candidate models (e.g. Naive Bayes and Logistic Regression).
5. Evaluate on held-out test set: accuracy, precision, recall, F1, confusion matrix.
6. Select and save the best model to `models/`.
7. Document model selection rationale, all metrics from real evaluation only.
8. Update PROJECT_LOG.md and CLAUDE_HANDOVER.md.

Do NOT fabricate any model metrics.

---

## Phase 5 — R Plumber API

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Expose the existing R analytics engine (Phase 3 ML model + Phase 4 risk engine) through a REST API using R Plumber. Provide `GET /health` and `POST /analyze` endpoints. No analytical logic in the API layer itself — all analysis is delegated to `analyze_risk()` from `R/analysis/risk_scorer.R`.

---

### Architecture Implemented

```
HTTP Client (Node.js future / curl test)
        ↓
R Plumber API — R/api/plumber.R (port 8000)
        ↓
analyze_risk(message) — R/analysis/risk_scorer.R
  ├── ML model: models/scamtracer_model.rds
  └── Indicators: R/utils/helpers.R
```

R = analytical engine. Plumber = API interface only. Node.js integration planned for Phase 6.

---

### Endpoints

**GET /health**
- Purpose: Liveness check, model-load status
- Does NOT run a prediction (safe to call frequently)
- Returns: status, service, version, r_version, model_loaded, model_name, model_f1, model_auc

**POST /analyze**
- Input: JSON body `{"message": "<text to analyze>"}`
- Calls: `analyze_risk(message)` from R/analysis/risk_scorer.R
- Returns: prediction, model_probability, ml_score, indicator_score, risk_score, risk_level, detected_indicators, explanations, summary_text, model_used, caveat

---

### Input Validation

| Case | HTTP Status | Response |
|---|---|---|
| Valid message string | 200 | Full risk assessment |
| Empty string `""` | 200 | prediction=UNKNOWN, no analysis |
| Missing `message` field | 400 | error=true, message describing issue |
| `null` message | 400 | error=true |
| Wrong type (e.g. number) | 400 | error=true, type info |
| Empty body | 400 | error=true |
| Malformed JSON | 400 | error=true |
| Internal analysis failure | 500 | error=true (internal error, no stack trace) |

---

### Actual Manual Test Results (from running server)

**GET /health:**
```json
{
  "status": "ok",
  "service": "ScamTracer AI R Analytics API",
  "version": "0.5.0",
  "r_version": "4.6.1",
  "model_loaded": true,
  "model_name": "Logistic Regression (Elastic Net)",
  "model_f1": 0.7807,
  "model_auc": 0.9639
}
```

**POST /analyze — "Your bank account will be suspended today. Send the OTP immediately to verify your account."**
```json
{
  "prediction": "LEGITIMATE",
  "model_probability": 0.2194,
  "ml_score": 13.16,
  "indicator_score": 40,
  "risk_score": 53,
  "risk_level": "MEDIUM",
  "detected_indicators": [
    "OTP Request", "Account Suspension Threat", "Credential Sharing Request",
    "Urgent Language", "Banking / Account Language"
  ],
  "explanations": ["...5 explanations..."],
  "model_used": "Logistic Regression (Elastic Net)"
}
```
Note: prediction=LEGITIMATE (ML model trained on UK/Singapore SMS, not India-specific terminology). The rule-based indicators raise the composite risk score to MEDIUM — demonstrating the value of the combined system.

**POST /analyze — "Congratulations! You have WON GBP 900 cash prize. Call FREE on 08002986030..."**
```json
{
  "prediction": "SCAM",
  "model_probability": 1,
  "risk_score": 73,
  "risk_level": "HIGH",
  "detected_indicators": ["Prize / Reward Claim", "Excessive Pressure Tactics", "Phone Number in Message"]
}
```

---

### Start Command

```bash
cd "E:/R PROJECT"
Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'
```

Port: 8000. Swagger docs: http://127.0.0.1:8000/__docs__/

**IMPORTANT**: Use single quotes in bash (not double quotes) to prevent `$run` from being shell-expanded to empty.

---

### Files Created

```
E:\R PROJECT\R\api\plumber.R         — Plumber API (implemented, was placeholder)
E:\R PROJECT\tests\test_api.R        — API test suite (55 checks)
```

### Files Modified

```
E:\R PROJECT\README.md               — Updated with actual status, run commands
E:\R PROJECT\PROJECT_LOG.md          — This entry
E:\R PROJECT\CLAUDE_HANDOVER.md      — Updated to reflect Phase 5 state
```

---

### Commands Executed

```bash
# Start server
Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'

# Manual tests
curl http://127.0.0.1:8000/health
curl -X POST http://127.0.0.1:8000/analyze -H "Content-Type: application/json" -d '{...}'

# Automated tests
Rscript tests/test_api.R
Rscript tests/test_risk_engine.R   # Phase 4 regression
```

---

### Test Results

- **API test suite:** 55/55 checks passed.
- **Phase 4 regression:** 69/69 checks still passing. No regressions.
- **Phase 3 model:** unchanged. All metrics (F1=0.7807, AUC=0.9639) preserved.

---

### Problems Encountered

1. **Bash shell expansion of `$run`**: The command `Rscript -e "pr$run(...)"` with double-quotes caused bash to expand `$run` to empty string, making the call `pr(...)` which failed. Fixed by using single-quoted bash string.

2. **Plumber environment scope**: `source("R/analysis/risk_scorer.R")` without `local =` puts functions in `.GlobalEnv`. Plumber 1.x sources the plumber.R file into its own private router environment, whose parent chain does NOT include `.GlobalEnv`. This meant `analyze_risk()` was invisible to handler closures, causing 500 errors on every `/analyze` request. Fixed by using `source("R/utils/helpers.R", local = environment())` and `source("R/analysis/risk_scorer.R", local = environment())` to place all analytical functions in the same environment as the handler closures.

3. **JSON scalar wrapping**: Plumber's default `toJSON` serializer wraps scalar values in arrays (e.g., `"status":["ok"]`). Fixed by using `#* @serializer json list(auto_unbox = TRUE)` on both endpoints.

4. **Demo suppression**: risk_scorer.R's demo guard `exists(".risk_scorer_sourced_by_test")` didn't find the variable set in plumber.R because plumber.R runs in the router's private env, not .GlobalEnv. Fixed by using `assign(".risk_scorer_sourced_by_test", TRUE, envir = .GlobalEnv)`.

5. **Inline Rscript segfault**: As in Phase 1, large multi-line scripts passed to `Rscript -e "..."` inline caused segfaults. Used temp file approach for debugging.

### Problems Resolved
All resolved above.

### Remaining Limitations

1. **India-specific scam ML scores**: The ML model was trained on UK/Singapore SMS. India-specific scam patterns (SBI/HDFC/UPI/KYC terminology) score as LEGITIMATE by the ML model. The composite risk score (combining ML + indicators) correctly identifies these as MEDIUM risk. This is a documented, expected limitation — not a bug.
2. **Local development API only**: No authentication, no rate limiting, permissive CORS. Not production-ready. Suitable for college project demonstration.
3. **No HTTPS**: HTTP only. Acceptable for local dev.
4. **renv out-of-sync warning**: Cosmetic. Run `renv::snapshot()` to resolve.

---

### Next Phase

**Phase 6 — Node.js Integration**

Recommended tasks:
1. Update `nodejs/src/server.js` to call the R Plumber API (`POST http://localhost:8000/analyze`).
2. Pass conversation text from Node.js to the R API.
3. Present the risk assessment result to the user.
4. Implement the BLOCK & PROTECT / ACTIVATE H.I.V.E. choice flow.
5. Keep H.I.V.E. engagement off-by-default — user must explicitly activate.
6. Update documentation.

---

## Phase 4 — R Analytics and Risk Engine

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Build a transparent, explainable risk scoring system that combines the Phase 3 ML model with an independent rule-based indicator engine. Implement `analyze_risk(message)` as the primary public interface. Verify the system with a 10-category test suite. Keep the H.I.V.E. engagement layer completely separate.

---

### Work Completed

1. **Implemented `R/utils/helpers.R`** — 14 rule-based scam indicators with documented weights, severity levels, regex patterns, and evidence capture. Two public functions: `detect_indicators(text)` and `indicator_summary(indicators)`.

2. **Enhanced `R/analysis/risk_scorer.R`** — Added `analyze_risk(message)` on top of the unchanged `predict_scam()` function. `analyze_risk()` combines ML probability with indicator evidence into a composite 0–100 risk score with a documented formula.

3. **Created `tests/test_risk_engine.R`** — 10-category test suite covering all message types and edge cases (Cases A–J). Verified with 69/69 passing checks.

---

### Risk Score Formula (documented and transparent)

```
ml_score        = spam_probability × 60          range: [0, 60]
indicator_score = min(40, sum(indicator_weights)) range: [0, 40], capped
risk_score      = round(ml_score + indicator_score)  range: [0, 100]
```

**Rationale for 60/40 split:**
- ML model (AUC=0.9639) is the primary evidence source — 60% weight.
- Rule-based indicators are independent supplementary evidence — up to 40%, capped to prevent false HIGH ratings driven purely by heuristics.

**Risk levels:**
- `LOW`    : risk_score < 30
- `MEDIUM` : risk_score 30–59
- `HIGH`   : risk_score ≥ 60

**Important distinction:** `model_probability` is a statistical estimate from the ML model — not a certainty. The `caveat` field in every `analyze_risk()` result explicitly states this.

---

### Indicator Definitions (14 indicators)

| Indicator | Severity | Weight | Rationale |
|---|---|---|---|
| otp_request | HIGH | 15 | Legitimate banks/services never ask for OTPs |
| credential_request | HIGH | 15 | Passwords/PINs never requested by legitimate entities |
| suspension_threat | HIGH | 12 | "Account will be blocked" — classic pressure tactic |
| credential_sharing | HIGH | 12 | Explicitly asking to share OTP/PIN/password |
| transfer_request | MEDIUM | 10 | Direct money transfer request |
| financial_language | MEDIUM | 8 | Payment, invoice, withdrawal language |
| urgent_language | MEDIUM | 6 | Time-pressure words (urgent, immediately, ASAP) |
| banking_language | MEDIUM | 6 | KYC, NEFT, IMPS, RTGS, net banking |
| prize_claim | LOW | 5 | "Congratulations, you have WON" pattern |
| link_click_request | LOW | 5 | URL or "click here" phishing signal |
| excessive_pressure | LOW | 5 | "Last chance", "expires today", "within 24 hours" |
| impersonation_signal | MODERATE | 4 | Claims to be from SBI/RBI/HDFC/government |
| phone_number_present | INFO | 3 | Phone number or 5+ digit sequence |
| upi_pattern | INFO | 3 | UPI ID (handle@bank) or UPI payment reference |

---

### Test Results (actual outputs — no fabrication)

All results are from running `Rscript tests/test_risk_engine.R` against the real Phase 3 model.

| Case | Message Type | ML P(spam) | ML Score | Indicator Score | Risk Score | Risk Level | Prediction |
|---|---|---|---|---|---|---|---|
| A | Normal conversation | 13.5% | 8.1/60 | 0/40 | 8 | LOW | LEGITIMATE |
| B | Promotional spam | 99.6% | 59.7/60 | 5/40 | 65 | HIGH | SCAM |
| C | Banking / KYC scam | 97.3% | 58.4/60 | 27/40 | 85 | HIGH | SCAM |
| D | OTP request | 97.3% | 58.4/60 | 36/40 | 94 | HIGH | SCAM |
| E | Credential/password | 37.7% | 22.6/60 | 37/40 | 60 | HIGH | LEGITIMATE* |
| F | Payment / UPI transfer | 97.0% | 58.2/60 | 28/40 | 86 | HIGH | SCAM |
| G | Account suspension threat | 41.4% | 24.8/60 | 18/40 | 43 | MEDIUM | LEGITIMATE* |
| H | Empty message | N/A | N/A | N/A | N/A | UNKNOWN | UNKNOWN |
| I | NULL input | N/A | N/A | N/A | N/A | ERROR | ERROR |
| J | Very long scam message | 100.0% | 60.0/60 | 40/40 | 100 | HIGH | SCAM |

*Cases E and G: ML model predicted LEGITIMATE (P(spam) < 0.5), but rule-based indicators raised the composite risk score to HIGH/MEDIUM. This demonstrates the value of combining ML evidence with independent indicator analysis — the indicators correctly flagged highly suspicious content that the ML model (trained on UK/Singapore SMS) scored below 0.5.

**Test suite result: 69/69 checks passed.**

---

### `analyze_risk()` Output Structure

```r
list(
  prediction          # "SCAM" or "LEGITIMATE" (based on ML P(spam) >= 0.5)
  model_probability   # P(spam) from ML model [0,1] — statistical estimate
  ml_score            # ML component [0,60]
  indicator_score     # Rule-based component [0,40], capped
  risk_score          # Composite score [0,100]
  risk_level          # "HIGH" / "MEDIUM" / "LOW"
  detected_indicators # character vector — labels of triggered indicators
  indicator_details   # full detect_indicators() output with evidence
  explanations        # one sentence per triggered indicator
  summary_text        # human-readable paragraph for display
  model_used          # ML model name
  caveat              # explicit statistical disclaimer
)
```

---

### Files Created

```
E:\R PROJECT\R\utils\helpers.R              — detect_indicators() + indicator_summary() (implemented)
E:\R PROJECT\tests\test_risk_engine.R       — 10-category test suite
```

### Files Modified

```
E:\R PROJECT\R\analysis\risk_scorer.R       — analyze_risk() added; predict_scam() unchanged
E:\R PROJECT\PROJECT_LOG.md                 — this entry
E:\R PROJECT\CLAUDE_HANDOVER.md             — updated to reflect Phase 4 state
```

---

### Commands Executed

```bash
cd "E:/R PROJECT"
Rscript tests/test_risk_engine.R
```

### Test Results Summary

- **detect_indicators():** PASS — 14 indicators, evidence capture, empty-list edge case.
- **indicator_summary():** PASS — vapply-based (fixes empty-list sum bug), capped_weight ≤ 40.
- **analyze_risk() — 10 cases:** PASS — all expected risk levels returned; edge cases handled gracefully.
- **predict_scam() backward compatibility:** PASS — unchanged interface, all 10 flag fields present.
- **Test suite total: 69/69 checks passed.**

---

### Problems Encountered

1. **`sapply()` returns `list()` on empty input** — when no indicators fire, `sapply(list(), function(x) x$weight)` returns a list, not a numeric vector. `sum()` then throws "invalid 'type' (list) of argument".

### Problems Resolved

1. **Fixed**: Replaced all `sapply()` calls in `indicator_summary()` with `vapply()` specifying the return type (`numeric(1)`, `character(1)`). `vapply()` on an empty list returns a correctly typed zero-length vector, so `sum(numeric(0)) = 0`.

---

### What Phase 4 Does NOT Include (by design)

Per the user's Phase 4 constraints, the following remain not implemented:
- WhatsApp integration
- Node.js integration
- R Plumber API (functional)
- H.I.V.E. engagement logic (requires explicit user consent — not automated)
- Shiny dashboard
- Network/graph analysis (`R/network/entity_graph.R`)
- Intelligence extraction pipeline
- Demo dataset (`data/demo/`)

---

### Next Phase

**Phase 5 — H.I.V.E. Intelligence Extraction and Entity Network Analysis**

Recommended tasks:
1. Implement `R/network/entity_graph.R` — entity correlation graph using igraph; connect entities (phone numbers, UPI IDs, URLs) appearing in the same conversation.
2. Create `data/demo/` — 2–3 clearly labelled fabricated scam conversations for H.I.V.E. demo (separate from training data).
3. Write a demonstration script: detect → extract (detect_indicators) → correlate (entity graph) → report.
4. Optional: implement `R/api/plumber.R` to expose `analyze_risk()` as a REST endpoint.
5. Optional: connect Node.js layer to the Plumber API.
6. Update documentation.

---

## Phase 3 — Scam Classification Model and Evaluation

**Date:** 2026-09-20
**Status:** COMPLETE

### Objective
Build the first real ScamTracer AI scam classification model. Train and compare multiple lightweight, explainable classifiers on the Phase 2 feature matrix. Select the best model based on spam-class F1 score. Save the model and implement a prediction interface. Do NOT fabricate any metric.

---

### Packages Added (Phase 3)
- `e1071` 1.7-17 — Naive Bayes and SVM support
- `glmnet` 5.0 — Regularized Logistic Regression (Elastic Net)
- `pROC` 1.19.1 — ROC curve and AUC computation
- Plus 5 dependencies: foreach, iterators, proxy, RcppEigen, shape
- Installed via `renv::install()`, renv.lock updated.

---

### Input Data Used
- Feature matrix: `data/processed/sms_tfidf.csv`
- Dimensions: 5,171 rows × 510 columns (doc_id + spam_label + 508 feature columns)
- Feature columns: char_count, word_count, has_url, has_phone, has_currency, has_free, has_urgent, has_prize, + 500 TF-IDF terms
- Class distribution: 4,518 ham (87.37%) / 653 spam (12.63%)

---

### Train / Test Split
- Method: Stratified random split (set.seed(42))
- Ratio: 80% train / 20% test
- Train: 4,136 rows (3,614 ham + 522 spam)
- Test:  1,035 rows (904 ham + 131 spam)
- Class imbalance weight applied to spam: 6.92× (= n_ham / n_spam in training set)

---

### Models Trained

#### Model 1 — Naive Bayes (e1071::naiveBayes)
- Gaussian Naive Bayes applied to 508-dimensional feature vector.
- No class weight parameter available in e1071::naiveBayes; priors estimated from training data.
- **Result: Degenerate — predicted ALL 1,035 test messages as spam.**
  - Accuracy: 12.66% | Precision: 12.66% | Recall: 100.0% | F1: 0.2247 | AUC: 0.50
  - Confusion matrix: TP=131, FP=904, TN=0, FN=0
- **Explanation of failure:** Gaussian Naive Bayes is not appropriate for sparse TF-IDF features.
  TF-IDF values are non-Gaussian, near-zero for most terms in most documents.
  The Gaussian likelihood computation on 500 sparse near-zero features drives the posterior
  probability for spam above ham for every document. This is a well-known limitation of
  Gaussian NB when applied to document-term matrices — Multinomial NB would be more appropriate
  but was not available without additional packages. This result is accurate and is left as a
  documented teaching point for the college demonstration.

#### Model 2 — Logistic Regression, Elastic Net (glmnet::cv.glmnet) — SELECTED
- Elastic Net regularization: alpha=0.5 (balanced L1+L2).
- Cross-validation: 5-fold, optimised by AUC.
- Lambda selected by 1 SE rule: 0.005131 (simpler model with comparable performance).
- Class imbalance addressed via `weights` parameter (spam × 6.92).
- **Test set results:**
  - Accuracy:  0.9430
  - Precision: 0.7609  (of predicted spam, 76.1% is truly spam)
  - Recall:    0.8015  (of actual spam, 80.2% correctly caught)
  - F1 Score:  0.7807
  - AUC:       0.9639
  - Confusion matrix: TP=105, FP=33, TN=871, FN=26

#### Model 3 — Decision Tree (rpart)
- rpart with maxdepth=10, cp=0.001.
- Class weights applied via `weights` parameter (spam × 6.92).
- **Test set results:**
  - Accuracy:  0.9246
  - Precision: 0.6550
  - Recall:    0.8550
  - F1 Score:  0.7417
  - AUC:       0.9549
  - Confusion matrix: TP=112, FP=59, TN=845, FN=19

---

### Model Comparison

| Model | Accuracy | Precision | Recall | F1 | AUC |
|---|---|---|---|---|---|
| Naive Bayes | 0.1266 | 0.1266 | 1.0000 | 0.2247 | 0.5000 |
| **Logistic Regression (Elastic Net)** | **0.9430** | **0.7609** | **0.8015** | **0.7807** | **0.9639** |
| Decision Tree (rpart) | 0.9246 | 0.6550 | 0.8550 | 0.7417 | 0.9549 |

Primary selection criterion: **spam-class F1 score** (accuracy alone is misleading given 87/13 imbalance).

---

### Final Model: Logistic Regression (Elastic Net)

**Selection rationale:**
1. Highest F1 (0.7807) and AUC (0.9639) among all three models.
2. Precision 76.1% — most "spam" predictions are genuinely spam; low false-alarm rate.
3. Recall 80.2% — catches 4 out of every 5 actual spam messages.
4. The 26 false negatives (spam predicted as ham) and 33 false positives (ham predicted as spam)
   are both acceptable for a detection+notification system where the user makes the final decision.
5. Regularization (Elastic Net) handles the 508-dimensional sparse feature space gracefully.
6. Interpretable: coefficients for each TF-IDF term explain which words drive the spam prediction.
7. Fast to train and predict — fully laptop-scale.
8. Well-suited for college demonstration: the model can explain "why" a message was flagged.

---

### Prediction Interface

Implemented: `R/analysis/risk_scorer.R`

Function `predict_scam(text)` returns:
- `predicted_class` — "spam" or "ham"
- `spam_probability` — P(spam) in [0, 1] — a statistical estimate, NOT a guarantee of truth
- `risk_level` — "HIGH" / "MEDIUM" / "LOW" (heuristic tier combining ML probability + entity flags)
- `heuristic_flags` — 10 independent binary signals (has_url, has_phone, keyword_free, etc.)
- `explanation` — human-readable summary
- `note` — explicit caveat that the probability is statistical, not guaranteed

**Demo predictions (from actual runs):**

| Input | Prediction | P(spam) | Risk |
|---|---|---|---|
| "URGENT! You have WON a £900 prize! Call 08002986030..." | spam | 100.0% | HIGH |
| "FreeMsg: Txt CLAIM to 87575 for your guaranteed cash prize..." | spam | 69.0% | MEDIUM |
| "Hey, are you coming to the party tonight?" | ham | 8.8% | LOW |
| "Ok, I'll be there at 7. See you soon." | ham | 9.4% | LOW |

---

### Files Created
```
E:\R PROJECT\R\models\classifier.R         — training, evaluation, model selection script (implemented)
E:\R PROJECT\R\analysis\risk_scorer.R      — prediction interface / predict_scam() function (implemented)
E:\R PROJECT\models\scamtracer_model.rds   — saved Logistic Regression model (165 KB)
E:\R PROJECT\models\model_vocab.rds        — saved feature vocabulary (2.7 KB)
E:\R PROJECT\models\model_metadata.rds     — metrics, training config, best_lambda (792 bytes)
E:\R PROJECT\reports\class_distribution.png  — class distribution bar chart
E:\R PROJECT\reports\model_comparison.png    — model metric comparison bar chart
E:\R PROJECT\reports\confusion_matrix.png    — confusion matrix heatmap (selected model)
```

### Files Modified
```
E:\R PROJECT\renv.lock                     — updated with e1071, glmnet, pROC and deps
E:\R PROJECT\PROJECT_LOG.md               — this entry
E:\R PROJECT\CLAUDE_HANDOVER.md           — updated to reflect Phase 3 state
```

---

### Commands Executed
```bash
# Install ML packages
Rscript install_ml_pkgs.R   # (temp file, deleted after use)

# Train models and evaluate
cd "E:/R PROJECT" && Rscript R/models/classifier.R

# Test prediction interface
cd "E:/R PROJECT" && Rscript R/analysis/risk_scorer.R
```

### Tests Performed
1. Ran classifier.R — three models trained and evaluated on real held-out test data.
2. Model comparison printed with real metrics.
3. Best model (glmnet) saved to models/scamtracer_model.rds.
4. Load-back verification: model reloaded from disk and re-predicted 10 test rows.
5. Ran risk_scorer.R — demo predictions on 4 messages (2 spam, 2 ham) all correct.
6. Verified models/ and reports/ directories contain all expected files.

### Test Results
- **classifier.R:** PASS — all three models trained; glmnet selected with F1=0.7807
- **Model save/load:** PASS — loaded model matches training-time predictions
- **risk_scorer.R:** PASS — all 4 demo predictions correctly classified with appropriate confidence
- **Visualisations:** PASS — 3 PNG files saved to reports/

---

### Problems Encountered
1. **Naive Bayes degenerate result** — e1071::naiveBayes with Gaussian assumption on 500 sparse TF-IDF features predicted all messages as spam. AUC=0.50 (random). This is a known incompatibility: Gaussian NB assumes features are normally distributed, but TF-IDF values are sparse, near-zero, and non-Gaussian. Not a bug — an expected limitation documented for educational purposes.

### Problems Resolved
1. Degenerate NB result is not a problem to fix — it illustrates model selection importance. The better models (glmnet, rpart) work correctly. Documented in model comparison table and log.

### Remaining Limitations
1. Naive Bayes gave degenerate results — if NB is needed in future, use Multinomial NB with raw term counts (not TF-IDF), which requires either the `naivebayes` package or a different feature representation.
2. Dataset is English UK/Singapore; India-specific scam patterns not covered by training data.
3. Class imbalance remains (87/13) — handled with class weights; further improvement possible with SMOTE in a future phase.
4. The prediction interface re-tokenises on every call (acceptable for demo; would need caching for production).

---

### Next Phase
**Phase 4 — Intelligence Extraction and H.I.V.E. Entity Analysis**

Recommended tasks:
1. Implement `R/utils/helpers.R` — regex patterns for extracting: phone numbers, UPI IDs, email addresses, URLs, bank names, OTP patterns, suspicious keywords.
2. Implement the entity extraction layer that runs AFTER scam detection.
3. Integrate with `risk_scorer.R` — entity extraction only triggered when scam is detected and user chooses ACTIVATE H.I.V.E.
4. Implement basic graph/network analysis in `R/network/entity_graph.R` — correlate extracted entities across conversations using igraph.
5. Create a minimal demonstration dataset in `data/demo/` with 2–3 fabricated scam conversations showing UPI IDs, phone numbers, URLs — used ONLY for H.I.V.E. demo, NOT mixed with training data.
6. Update PROJECT_LOG.md and CLAUDE_HANDOVER.md.

---
