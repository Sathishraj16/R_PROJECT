# ScamTracer AI — Claude Handover Document

**Purpose:** This file describes the ACTUAL current state of the project so that a new AI instance can continue development without access to previous conversations. It must always reflect what exists in the codebase right now, not what was planned.

**Last Updated:** 2026-09-20 (Phase 12 Final Integration: terminal logging, richer panel, context safety, 32 new tests)

---

## Project Name
ScamTracer AI

## Project Objective
A cyber-security and scam-intelligence system that:
1. Detects scam conversations via NLP and ML classification.
2. Notifies the user when a scam is detected.
3. Gives the user two choices: BLOCK & PROTECT (safe exit) or ACTIVATE H.I.V.E. (controlled engagement).
4. If H.I.V.E. is activated, conducts controlled engagement, extracts scam intelligence (phone numbers, UPI IDs, URLs, emails, bank names, suspicious keywords, behavioural indicators), correlates entities across conversations via graph analysis, and produces an investigation report.

This is intended as a college project demonstration.

---

## H.I.V.E. Explanation
**H.I.V.E. = Heuristic Intelligence & Virtual Entrapment**

```
Detect → Engage → Extract → Report
```

ScamTracer AI adaptation:
```
Incoming Conversation
  → Scam Detection (R Analytics Engine)  ← IMPLEMENTED (Phase 3)
  → User Notification
  → User chooses:
       1. BLOCK & PROTECT   — end interaction safely
       2. ACTIVATE H.I.V.E. — begin controlled engagement
  → If H.I.V.E. activated:
       Controlled Engagement
         → Intelligence Extraction (entities: phone, UPI, URL, email, bank, keywords)  ← Phase 4
         → Behaviour Analysis  ← Phase 4
         → Entity Correlation (graph/network analysis)  ← Phase 4
         → Investigation Report  ← Phase 5
```

**Critical rule:** The system NEVER automatically engages a scammer. Engagement requires explicit user consent.

---

## Current Architecture

```
WhatsApp / Conversation Input
        ↓
WhatsApp Web (whatsapp-web.js)    [IMPLEMENTED — Phase 11 — detection only]
  nodejs/src/whatsappClient.js
  .wwebjs_auth/ (session files — NOT in Git)
        ↓
Node.js Communication Layer       [IMPLEMENTED — Phase 6/7/8/11]
  nodejs/src/server.js
        ↓
Chrome Extension                  [IMPLEMENTED — Phase 12]
  extension/manifest.json         MV3; content script on WhatsApp Web
  extension/background.js         Service worker — all localhost:3000 fetches
  extension/content.js            Floating alert panel (polls /alerts every 2s; expanded panel with sender/prediction/indicators; context guard)
  extension/styles.css            Panel styles
  extension/popup.html/js         Toolbar popup — status + pending alerts
  nodejs/src/rApiClient.js
  nodejs/src/sessionStore.js
  nodejs/src/hiveEngine.js
  nodejs/src/alertStore.js
        ↓
R Plumber API  (port 8000)        [IMPLEMENTED — Phase 5]
  R/api/plumber.R
        ↓
R Analytics Engine
        ├── Data Processing       [IMPLEMENTED]  R/preprocessing/cleaner.R
        ├── NLP                   [IMPLEMENTED]  R/nlp/text_features.R
        ├── ML Classification     [IMPLEMENTED]  R/models/classifier.R
        ├── Risk Scoring          [IMPLEMENTED]  R/analysis/risk_scorer.R  (predict_scam() + analyze_risk())
        ├── Indicator Engine      [IMPLEMENTED]  R/utils/helpers.R  (detect_indicators() + indicator_summary())
        ├── Behaviour Analysis    [IMPLEMENTED]  R/analysis/behaviour_analyzer.R  (Phase 9)
        ├── Intelligence Extraction [IMPLEMENTED] R/analysis/intelligence_extractor.R  (Phase 9)
        └── Network Analysis      [NOT IMPLEMENTED]  R/network/entity_graph.R
        ↓
R Shiny Dashboard              [IMPLEMENTED — Phase 10/11]
  dashboard/app.R + ui.R + server.R + helpers.R
  (7 tabs; Live Monitor tab polls Node.js API)
        ↓
Investigation View             [IMPLEMENTED — Phase 10/11]
        ↓
Investigation Report              [NOT IMPLEMENTED]
```

---

## Current Technology Stack

| Layer | Technology | Status |
|---|---|---|
| Chrome extension | Chrome MV3 (content.js + service worker) | **IMPLEMENTED** — Phase 12 (floating alert panel on WhatsApp Web; polls /alerts; expanded panel with sender/prediction/indicators; BLOCK & PROTECT / ACTIVATE H.I.V.E. buttons; context-invalidation guard; never sends messages) |
| Messaging interface | WhatsApp (via whatsapp-web.js@1.34.7) | **IMPLEMENTED** — Phase 11 (detection + user notification; QR auth; never sends messages) |
| Communication layer | Node.js v20.18.0 + Express 4.x + Axios | **IMPLEMENTED** — POST /analyze, POST /message, POST /decision, POST /hive/message, POST /hive/end, POST /investigate, GET /whatsapp/status, GET /alerts, GET /alerts/:id, POST /alerts/:id/decision |
| API layer | R Plumber (port 8000) | **IMPLEMENTED** — GET /health, POST /analyze, POST /investigate |
| Data processing | R (dplyr, tidyr, stringr) | IMPLEMENTED — cleaner.R fully operational |
| NLP | R (tidytext) | IMPLEMENTED — text_features.R fully operational |
| ML Classification | R (glmnet) | IMPLEMENTED — Logistic Regression Elastic Net trained and saved |
| Risk scoring | R | IMPLEMENTED — predict_scam() + analyze_risk() in risk_scorer.R |
| Indicator engine | R | IMPLEMENTED — detect_indicators() + indicator_summary() in helpers.R |
| Behaviour analysis | R | **IMPLEMENTED** — analyse_behaviour() in behaviour_analyzer.R (Phase 9) |
| Intelligence extraction | R | **IMPLEMENTED** — extract_entities() + investigate_session() in intelligence_extractor.R (Phase 9) |
| Graph/network analysis | R (igraph, ggraph, tidygraph) | Not implemented — Phase 5 |
| Visualization | R (ggplot2) | IMPLEMENTED — 3 report charts saved to reports/ |
| Dashboard | R Shiny (port 4000) | **IMPLEMENTED** — Phase 10/11 (seven-tab: six investigation tabs + Live Monitor with WhatsApp alert feed and decision buttons) |
| Reporting | R | Not implemented |

---

## Current Phase
**Phase 12 — Chrome Extension UI** — COMPLETE

---

## Completed Phases

### Phase 0 — Project Initialization (COMPLETE)
- Created PROJECT_RULES.md, PROJECT_LOG.md, CLAUDE_HANDOVER.md.

### Phase 1 — Project Scaffold and Environment Setup (COMPLETE)
- Full directory structure, all placeholder R/Node.js files, Node.js server functional.
- R 4.6.1 installed. All 10 required R packages verified.

### Phase 2 — Dataset Research, Selection, and Initial Preprocessing (COMPLETE)
- UCI SMS Spam Collection v.1 selected (CC BY 4.0, 5,574 records).
- Raw data in data/raw/. Cleaned data: 5,171 rows in data/processed/sms_cleaned.csv.
- TF-IDF feature matrix: 5,171 × 510 in data/processed/sms_tfidf.csv.
- cleaner.R and text_features.R fully implemented and tested.

### Phase 3 — Scam Classification Model and Evaluation (COMPLETE)
- Installed e1071 1.7-17, glmnet 5.0, pROC 1.19.1 via renv.
- Trained 3 models: Naive Bayes, Logistic Regression (Elastic Net), Decision Tree.
- Selected: **Logistic Regression (Elastic Net)** — highest F1 (0.7807) and AUC (0.9639).
- Saved model artifacts to models/.
- Implemented predict_scam() prediction interface in risk_scorer.R.
- Generated 3 visualisation PNGs in reports/.

### Phase 4 — R Analytics and Risk Engine (COMPLETE)
- Implemented `R/utils/helpers.R` — 14 rule-based scam indicators with documented weights and regex patterns.
- Implemented `detect_indicators(text)` — runs all 14 patterns, returns evidence + explanation per indicator.
- Implemented `indicator_summary(indicators)` — compact summary with capped indicator score (max 40).
- Enhanced `R/analysis/risk_scorer.R` — added `analyze_risk(message)` combining ML + indicators into a 0–100 composite risk score.
- Risk score formula: `risk_score = round(spam_probability × 60 + min(40, sum(indicator_weights)))`.
- Risk levels: LOW (<30), MEDIUM (30–59), HIGH (≥60).
- Created `tests/test_risk_engine.R` — 10-category test suite (Cases A–J). **Result: 69/69 passed.**
- Bug fixed: `indicator_summary()` used `vapply()` instead of `sapply()` to handle empty indicator lists.

### Phase 5 — R Plumber API (COMPLETE)
- Implemented `R/api/plumber.R` — two endpoints: `GET /health` and `POST /analyze`.
- API exposes `analyze_risk()` as a REST service. No analytical logic in the API layer.
- `POST /analyze` validates input (missing field, null, wrong type, empty, malformed JSON) and returns appropriate HTTP status codes.
- `GET /health` returns model name, F1, AUC, and load status.
- CORS filter for development (all origins permitted).
- `auto_unbox = TRUE` on serializer — clean JSON without array-wrapping scalars.
- Environment scoping fix: both analytics files sourced with `local = environment()` to make `analyze_risk()` and `detect_indicators()` visible to Plumber handler closures.
- Created `tests/test_api.R` — 10-test API test suite using the `curl` R package. **Result: 55/55 passed.**
- Phase 4 regression: still **69/69 passed** after Phase 5 work.

### Phase 6 — Node.js ↔ R Plumber Integration (COMPLETE)
- Implemented `nodejs/src/rApiClient.js` — R Plumber API client module. Single canonical source for `R_API_URL` (env var, default `http://localhost:8000`). Functions: `analyzeMessage()`, `checkRHealth()`.
- Implemented `nodejs/src/server.js` (was placeholder) — `POST /analyze` forwards to R and returns actual R result; `GET /health` reports Node.js status AND probes R backend separately; input validation (missing field, null, wrong type); structured error handling with correct HTTP codes (400 validation, 503 R unavailable, 502 R error).
- Logging middleware — logs request method, path, and R response details (no sensitive content logged).
- `R_API_URL` configurable via environment variable — not hard-coded in multiple places.
- Created `tests/test_integration.js` — 53-check end-to-end integration test suite (plain Node.js, no extra deps). **Result: 53/53 passed.**
- R unavailable scenario verified: HTTP 503 with `error: true` and informative message.
- Phase 5 regression: still **55/55 passed** after Phase 6 work.
- Phase 4 regression: still **69/69 passed** after Phase 6 work.

### Phase 7 — User Notification and Explicit Decision Flow (COMPLETE)
- Created `nodejs/src/sessionStore.js` — in-memory session store with state machine. Demo-only (not persistent).
- Implemented `POST /message` — validate → R analysis → session creation → conditional notification for MEDIUM/HIGH risk.
- Implemented `POST /decision` — explicit user choice: BLOCK_AND_PROTECT or ACTIVATE_HIVE.
- State machine: NORMAL | USER_DECISION_REQUIRED | BLOCKED | HIVE_ACTIVE.
- Decision policy: LOW → NORMAL; MEDIUM/HIGH → USER_DECISION_REQUIRED. Threshold uses R's `risk_level`.
- HIGH risk does NOT automatically produce HIVE_ACTIVE — explicitly verified in tests and in code.
- State transitions enforced: BLOCKED + ACTIVATE_HIVE → 409 ALREADY_BLOCKED; repeated activation → 409 ALREADY_ACTIVE; NORMAL + any decision → 409 NO_DECISION_REQUIRED; unknown session → 404.
- Refactored shared `handleRError()` helper — used by both `/analyze` and `/message`.
- Created `tests/test_decision_flow.js` — 54-check test suite (scenarios A–J + explicit consent verification). **Result: 54/54 passed.**
- All regressions: Phase 4 69/69, Phase 5 55/55, Phase 6 53/53.

### Phase 8 — H.I.V.E. Controlled Engagement Engine (COMPLETE)
- Created `nodejs/src/hiveEngine.js` — deterministic rule-based response engine. 7 strategies (otp_deflection, credential_deflection, payment_probe, suspension_probe, url_probe, prize_probe, neutral_clarification). 3 templates per strategy, cycling by interaction count. No external LLM. No real credentials ever generated.
- Updated `nodejs/src/sessionStore.js` — added `HIVE_ENDED` state; conversation fields initialised when `applyDecision()` produces HIVE_ACTIVE; added `addInteraction()` and `endHiveSession()`.
- Updated `nodejs/src/server.js` — `POST /hive/message` (one engagement turn per call) and `POST /hive/end` (HIVE_ACTIVE → HIVE_ENDED). Version 0.8.0.
- Created `data/demo/hive_demo_scenario.json` — fictional banking scam demo (5 turns). All values fabricated: "FakeSecure Bank", "verifyaccount@fakebank" (fictional UPI), "fakesecure-verify.fictional" (fictional URL). Disclaimer embedded.
- Created `nodejs/src/runHiveDemo.js` — end-to-end demo runner (full consent chain → 5-turn engagement → HIVE_ENDED). Runs live against localhost:3000.
- Created `tests/test_hive_engagement.js` — 63-check test suite (scenarios A–O, including explicit consent chain O). **Result: 63/63 passed.**
- All regressions: Phase 4 69/69, Phase 5 55/55, Phase 6 53/53, Phase 7 54/54.

### Phase 12 Hotfix — WhatsApp Alert Pipeline Bug Fix (COMPLETE)
- Root cause 1: `R/api/plumber.R` used `NULL` for numeric fields in empty-message early return → jsonlite serializes NULL as `{}` → JavaScript's `{} < 60 = false` bypassed threshold → malformed alerts
- Root cause 2: `whatsappClient.js` stored full `msg.id` object when `_serialized` was undefined
- Root cause 3: Non-text WhatsApp messages (stickers, reactions) with empty `msg.body` were not filtered
- Fixed in: `plumber.R` (NA_real_ not NULL), `whatsappClient.js` (normalizeWhatsAppMessage + empty body skip), `riskResultValidator.js` (new: validateRiskResult), `server.js` (validation guards), `alertStore.js` (createAlert guard + resetAlerts)
- Added `POST /test/reset-alerts` (TEST_MODE only) to clear the 11 malformed historical alerts
- New file: `nodejs/src/riskResultValidator.js` — `validateRiskResult(riskResult, messageText)`
- 15 new unit tests in `tests/test_whatsapp.js` Case D: normalization (D1–D7) + validation (D8–D15)
- Test results: 63/63 (full suite with integration), 55/55 R API, all baselines unchanged

### Phase 12 Final Integration (COMPLETE)
- `nodejs/src/analysisLogger.js` (NEW): Pure `formatAnalysisLog(from, body, riskResult, threshold)` function. Formats the operator terminal analysis block; reads values from R — never recalculates. Exported for unit testing.
- `nodejs/src/server.js`: Imports `formatAnalysisLog`; calls it in `processIncomingWhatsAppMessage` after R validation — prints the full block (with ALERT TRIGGERED / NO ALERT decision) for every incoming text message.
- `extension/content.js`: Fixed `alert.message_text` → `alert.message` (was causing "(message text unavailable)"). Expanded `renderPanel()` to show sender, risk level/score/prediction meta row, full message (200-char truncation), detected indicators as a bullet list. Added `_contextValid` flag + `safeSendMessage()` wrapper for Chrome extension-context invalidation safety.
- `extension/popup.js`: Fixed `a.message_text` → `a.message` (was showing "Alert ID: xxx" for every pending alert in popup).
- `extension/styles.css`: Added `.scamtracer-meta`, `.scamtracer-sender`, `.scamtracer-indicators`, `.scamtracer-indicator`, `.scamtracer-indicator-none`.
- `tests/test_whatsapp.js`: Added Case E — E1–E10 unit tests for `analysisLogger.js`; E11–E15 integration tests (skip unless `RUN_INTEGRATION=true`).
- `tests/test_extension.js`: Added F1–F17 — field fix verification (F1/F2), `escapeHtml` tests (F3–F6), panel field rendering (F7–F11), context guard (F12/F13), `shouldShowAlert` edge cases (F14/F15), `riskBadgeClass` (F16), message types (F17).
- **Test results: test_extension.js 35/35 passed; test_whatsapp.js 54/54 passed (unit). All baselines unchanged.**

### Phase 12 — Chrome Extension UI (COMPLETE)
- Created `extension/` directory with MV3 Chrome extension.
- `manifest.json`: content script on `https://web.whatsapp.com/*`, background service worker, `host_permissions` for `http://localhost:3000/*`, popup action.
- `background.js`: service worker handling `FETCH_ALERTS`, `FETCH_STATUS`, `POST_DECISION` messages; all HTTP to localhost goes through here.
- `content.js`: polls `GET /alerts` every 2 seconds; `shouldShowAlert()` checks `status === USER_DECISION_REQUIRED AND risk_score >= 60`; deduplicates by `alert_id`; renders floating panel; handles BLOCK & PROTECT / ACTIVATE H.I.V.E. decisions.
- `styles.css`: fixed top-right panel, colour-coded by risk level, slide-in animation.
- `popup.html`/`popup.js`: toolbar popup showing connection status, WhatsApp state, threshold, pending alert count + previews.
- `extension/README.md`: 10-step Windows manual test instructions.
- `tests/test_extension.js`: 18 checks — files (E1), manifest (E2), threshold logic 59/60/86/BLOCKED/dedup (E3), no WhatsApp API calls (E4), optional backend endpoint checks (E5). **Result: 18/18 passed.**

### Phase 11 — Live WhatsApp QR Integration + Real-Time Scam Alerts (COMPLETE)
- Installed `whatsapp-web.js@1.34.7` + `qrcode-terminal@0.12.0`.
- Created `nodejs/src/alertStore.js` — in-memory alert store, UUID IDs, deduplication by WhatsApp message ID, `ALERT_STATES` enum, `getStats()`.
- Created `nodejs/src/whatsappClient.js` — `WhatsAppMonitor` EventEmitter; injectable client factory; `WHATSAPP_ENABLED=false` for tests; never sends messages.
- Updated `nodejs/src/server.js` — `processIncomingWhatsAppMessage()`, `SCAMTRACER_RISK_THRESHOLD` (default 60), four new alert endpoints, test simulation endpoint, WhatsApp monitor startup.
- Updated `dashboard/ui.R` — added seventh tab: Live Monitor (status display, metrics, alert cards, action buttons).
- Updated `dashboard/server.R` — `reactivePoll()` for `/whatsapp/status` and `/alerts`, alert card rendering, decision button handlers.
- Updated `dashboard/helpers.R` — added `fetch_whatsapp_status()`, `fetch_alerts()`, `post_decision()` using `httr`.
- Updated `.gitignore` — added `.wwebjs_auth/` and `.wwebjs_cache/`.
- Created `tests/test_whatsapp.js` — 28 unit checks (A1–A20 alertStore, B1–B9 WhatsAppMonitor) + 19 integration checks (C1–C19). **Unit result: 28/28 passed.**
- All regressions: 53+54+63 = 170/170 Node.js tests still passing.

### Phase 10 — R Shiny Dashboard + Complete End-to-End Showcase (COMPLETE)
- Created `dashboard/helpers.R` — `setup_analytics()` (sources all R engines), `load_demo_data()` (runs full analysis pipeline using existing R functions directly — no Node.js required for dashboard), R port of hiveEngine.js strategy logic, table formatters, ggplot2 chart builders.
- Created `dashboard/ui.R` — six-tab `navbarPage`: Overview/Risk, H.I.V.E. Status, Conversation, Intelligence, Behaviour Analysis, Investigation Summary. Custom CSS. No new package dependencies.
- Created `dashboard/server.R` — drives all six tabs; uses `renderTable` (shiny built-in) for tables, `renderPlot` (ggplot2) for charts, `renderUI` for styled elements.
- Replaced `dashboard/app.R` placeholder — full implementation with working directory bootstrap, analytics setup, UI/server assembly.
- Updated `nodejs/src/runHiveDemo.js` — added Step 5: calls `POST /investigate`, prints investigation results, saves `data/demo/demo_session_output.json`.
- Created `tests/test_dashboard.R` — 83-check test suite (Cases A–M) covering files, analytics loading, data structure, risk info, conversation safety, entities, behaviours, summary, formatters, charts, Shiny object validity, edge cases. **Result: 83/83 passed.**
- All regressions: Phase 4 69/69, Phase 9 79/79.
- **End-to-end validation:** `load_demo_data()` confirmed risk_score=71, risk_level=HIGH, prediction=SCAM, 7 entities, 10 behaviour records, escalation=TRUE, repeated_requests=TRUE — all from actual R function calls.

### Phase 9 — Intelligence Extraction + Behaviour Analysis (COMPLETE)
- Created `R/analysis/intelligence_extractor.R` — `extract_entities(conversation)` extracts PHONE, UPI_ID, EMAIL, URL, BANK_NAME, TRANSACTION_ID, OTP_REQUEST, PAYMENT_REQUEST, CREDENTIAL_REQUEST entities with full provenance (source text + turn number + direction). `investigate_session(session_id, conversation)` orchestrates full investigation and returns structured summary with factual statements. Digit-required TRANSACTION_ID pattern prevents false positives on English words. UPI vs email disambiguation via TLD check. Trailing punctuation strip on UPI candidates.
- Created `R/analysis/behaviour_analyzer.R` — `analyze_behaviour(conversation)` analyses INCOMING turns only; detects URGENCY, THREAT, IMPERSONATION, OTP_SOLICITATION, PAYMENT_REQUEST, CREDENTIAL_REQUEST; adds REPEATED_REQUEST for any category spanning ≥2 distinct turns; adds ESCALATION if later turns have higher rank than first. Escalation rank system: 1=impersonation, 2=urgency, 3=threat, 4=OTP, 5=credential, 6=payment. NULL text guard (`is.null(t$text)` → `NA_character_`).
- Updated `R/api/plumber.R` — added `POST /investigate` endpoint; sources both Phase 9 files with `local = environment()`; uses `fromJSON(raw_body, simplifyVector = FALSE)` to preserve conversation as list-of-lists. Version bumped 0.8.0 → 0.9.0.
- Updated `nodejs/src/rApiClient.js` — added `investigateConversation(sessionId, conversation)` function; updated exports.
- Updated `nodejs/src/server.js` — added `POST /investigate` route; validates session state (HIVE_ACTIVE or HIVE_ENDED); maps conversation with turn numbers; forwards to R. Version bumped 0.8.0 → 0.9.0.
- Created `tests/test_intelligence_behaviour.R` — 79-check test suite (Cases A–S); 9 entity types tested; 8 behaviour types tested; edge cases: empty conversation, null text, whitespace, no-fabrication guarantee. **Result: 79/79 passed.**
- Updated `PROJECT_LOG.md` — Phase 9 entry with full entity/behaviour tables, demo investigation output, known limitations.
- All regressions: Phase 4 69/69, Phase 5 55/55, Phase 6 53/53, Phase 7 54/54, Phase 8 63/63.
- **Safety guarantees enforced:** Only extracts entities present in conversation text. Never fabricates intelligence. All demo identities fictional ("FakeSecure Bank", "verifyaccount@fakebank", "fakesecure-verify.fictional"). Statements use cautious factual language ("Observed…"), never "this person is a scammer".

---

## ML Model Status

**Selected model:** Logistic Regression (Elastic Net)

| Metric | Value |
|---|---|
| Algorithm | glmnet cv.glmnet, alpha=0.5, lambda.1se=0.005131 |
| Training set | 4,136 rows (stratified 80%) |
| Test set | 1,035 rows (stratified 20%) |
| Accuracy | 0.9430 |
| Precision (spam) | 0.7609 |
| Recall (spam) | 0.8015 |
| F1 Score (spam) | 0.7807 |
| AUC | 0.9639 |
| TP | 105 | 
| FP | 33 |
| TN | 871 |
| FN | 26 |
| Saved to | models/scamtracer_model.rds |
| Vocabulary | models/model_vocab.rds |
| Metadata | models/model_metadata.rds |

**All metrics are from actual model evaluation on the held-out test set. Nothing is fabricated.**

**Model selection rationale:** Best F1 among 3 candidates. Precision 76.1% keeps false alarms low. Recall 80.2% catches most spam. AUC 0.9639 shows strong discrimination. Regularization handles 508-dimensional sparse features. Interpretable via coefficients.

**Naive Bayes note:** Gave degenerate all-spam predictions (AUC=0.50). This is expected: Gaussian NB is incompatible with sparse TF-IDF features. Documented as a teaching point.

---

## Dataset Status

**Selected dataset:** UCI SMS Spam Collection v.1

| Property | Value |
|---|---|
| Source | UCI Machine Learning Repository |
| License | CC BY 4.0 |
| Raw file | data/raw/SMSSpamCollection (477,907 bytes, unmodified) |
| Records after dedup | 5,171 |
| ham | 4,518 (87.37%) |
| spam | 653 (12.63%) |
| Citation | Almeida & Hidalgo (2011), DOI: 10.24432/C5CC84 |

---

## Analytics Interface (Phase 4)

### `analyze_risk(message)` — Primary interface (Phase 4)

```r
source("R/analysis/risk_scorer.R")
result <- analyze_risk("Your SBI account is blocked. Share OTP immediately.")
# result$prediction         → "SCAM"
# result$model_probability  → 0.9728
# result$ml_score           → 58.4   (ML component, max 60)
# result$indicator_score    → 36     (rule-based component, max 40)
# result$risk_score         → 94     (composite 0–100)
# result$risk_level         → "HIGH"
# result$detected_indicators → c("OTP Request", "Credential Sharing Request", ...)
# result$explanations        → character vector of plain-English explanations
# result$caveat              → statistical disclaimer
```

**Risk score formula:** `round(spam_probability × 60 + min(40, sum(indicator_weights)))`
- 60/40 split: ML evidence (primary) + rule-based indicators (supplementary, capped)
- LOW < 30, MEDIUM 30–59, HIGH ≥ 60

### `predict_scam(text)` — Phase 3 interface (unchanged, backward compatible)

```r
source("R/analysis/risk_scorer.R")
result <- predict_scam("URGENT! You have WON a £900 prize! Call 08002986030 NOW!")
# result$predicted_class  → "spam"
# result$spam_probability → 1.0  (statistical estimate, not a certainty)
# result$risk_level       → "HIGH"
# result$heuristic_flags  → list of 10 entity/keyword signals
# result$explanation      → human-readable summary
```

### `detect_indicators(text)` — Indicator engine (Phase 4)

```r
source("R/utils/helpers.R")
indicators <- detect_indicators("Please share your OTP immediately.")
summary    <- indicator_summary(indicators)
# summary$n_detected      → number of triggered indicators
# summary$capped_weight   → min(40, total_weight) — for risk score
# summary$detected_labels → human-readable indicator labels
# summary$explanations    → one sentence per triggered indicator
```

---

## Current Implementation Status

### Working and Tested
- `R/preprocessing/cleaner.R` — reads raw data, cleans, deduplicates, saves sms_cleaned.csv.
- `R/nlp/text_features.R` — tokenises, TF-IDF, saves sms_tfidf.csv (510 columns).
- `R/models/classifier.R` — trains 3 models, evaluates, saves best model artifacts.
- `R/analysis/risk_scorer.R` — predict_scam() (Phase 3) + analyze_risk() (Phase 4) fully implemented and tested.
- `R/utils/helpers.R` — detect_indicators() and indicator_summary() fully implemented (Phase 4).
- `R/api/plumber.R` — GET /health + POST /analyze REST API (Phase 5). Port 8000.
- `nodejs/src/rApiClient.js` — R Plumber API client (Phase 6). analyzeMessage(), checkRHealth(), R_API_URL.
- `nodejs/src/sessionStore.js` — in-memory session state machine (Phase 7/8). createSession(), applyDecision(), addInteraction(), endHiveSession(), STATES (including HIVE_ENDED).
- `nodejs/src/hiveEngine.js` — deterministic rule-based H.I.V.E. response engine (Phase 8). generateResponse(), selectStrategy(), 7 strategies × 3 templates.
- `nodejs/src/alertStore.js` — in-memory alert store with deduplication, ALERT_STATES enum (Phase 11).
- `nodejs/src/whatsappClient.js` — WhatsAppMonitor EventEmitter, injectable factory, WHATSAPP_ENABLED guard (Phase 11).
- `nodejs/src/server.js` — POST /analyze + /message + /decision + /hive/message + /hive/end + /investigate + GET /health + GET /whatsapp/status + GET /alerts + GET /alerts/:id + POST /alerts/:id/decision (Phase 6/7/8/9/11). Port 3000.
- `nodejs/src/runHiveDemo.js` — end-to-end H.I.V.E. demo runner (Phase 8).
- `data/demo/hive_demo_scenario.json` — fictional 5-turn banking scam scenario (Phase 8).
- `R/analysis/intelligence_extractor.R` — extract_entities() + investigate_session() — entity extraction and investigation orchestrator (Phase 9).
- `R/analysis/behaviour_analyzer.R` — analyze_behaviour() — scam behaviour pattern detection (Phase 9).
- `tests/test_risk_engine.R` — Phase 4 test suite; 69/69 checks passed.
- `tests/test_api.R` — Phase 5 API test suite; 55/55 checks passed.
- `tests/test_integration.js` — Phase 6 integration test suite; 53/53 checks passed.
- `tests/test_decision_flow.js` — Phase 7 decision flow test suite; 54/54 checks passed.
- `tests/test_hive_engagement.js` — Phase 8 H.I.V.E. engagement test suite; 63/63 checks passed.
- `tests/test_intelligence_behaviour.R` — Phase 9 intelligence + behaviour test suite; 79/79 checks passed.
- `dashboard/app.R` — Shiny dashboard entry point — `shiny::runApp("dashboard", port=4000)` (Phase 10).
- `dashboard/helpers.R` — data bridge: setup_analytics(), load_demo_data(), formatters, charts + fetch_whatsapp_status(), fetch_alerts(), post_decision() (Phase 10/11).
- `dashboard/ui.R` — seven-tab navbarPage UI — Overview/Risk, H.I.V.E. Status, Conversation, Intelligence, Behaviour, Summary, Live Monitor (Phase 10/11).
- `dashboard/server.R` — server logic for all seven dashboard sections; reactivePoll for live alerts (Phase 10/11).
- `tests/test_dashboard.R` — Phase 10 dashboard test suite; 83/83 checks passed.
- `tests/test_whatsapp.js` — Phase 11 WhatsApp test suite; 28/28 unit checks passed.
- `R/eda_phase2.R` — EDA script against real data.

### Placeholder Only (file exists, no real logic)
- `R/main.R` — R engine entry point
- `R/network/entity_graph.R` — entity correlation graph

### Not Implemented
- Entity correlation / graph analysis (`R/network/entity_graph.R`)
- Live investigation integration in Shiny dashboard (tabs 1–6 always show fixed demo scenario; Live Monitor tab polls live Node.js data)

---

## Important Files and Their Purposes

| File | Purpose |
|---|---|
| `PROJECT_RULES.md` | Permanent rules, architecture, constraints. Read first. |
| `PROJECT_LOG.md` | Chronological phase history. |
| `CLAUDE_HANDOVER.md` | This file. Current-state snapshot. |
| `renv_setup.R` | Run once to set up R packages (already done). |
| `renv.lock` | Exact package versions including e1071, glmnet, pROC. |
| `R/eda_phase2.R` | Phase 2 EDA script. |
| `R/preprocessing/cleaner.R` | Data cleaning pipeline. |
| `R/nlp/text_features.R` | TF-IDF feature extraction. |
| `R/models/classifier.R` | Model training and evaluation. |
| `R/analysis/risk_scorer.R` | predict_scam() (Phase 3) + analyze_risk() (Phase 4) — composite risk scoring. |
| `R/utils/helpers.R` | detect_indicators() + indicator_summary() — 14 rule-based scam indicators (Phase 4). |
| `tests/test_risk_engine.R` | 10-category test suite for analyze_risk() — 69/69 passed (Phase 4). |
| `R/network/entity_graph.R` | Placeholder — entity graph (not yet implemented). |
| `R/api/plumber.R` | REST API — GET /health + POST /analyze (Phase 5, port 8000). |
| `tests/test_api.R` | 10-test API test suite using curl R package — 55/55 passed (Phase 5). |
| `nodejs/src/rApiClient.js` | R Plumber API client — analyzeMessage(), checkRHealth(), investigateConversation(), R_API_URL (Phase 6/9). |
| `nodejs/src/sessionStore.js` | In-memory session state machine — createSession(), applyDecision(), addInteraction(), endHiveSession(), STATES (Phase 7/8). |
| `nodejs/src/hiveEngine.js` | Deterministic rule-based H.I.V.E. response engine — generateResponse(), selectStrategy() (Phase 8). |
| `nodejs/src/alertStore.js` | In-memory alert store — createAlert(), getAlert(), getAllAlerts(), ALERT_STATES (Phase 11). |
| `nodejs/src/whatsappClient.js` | WhatsAppMonitor EventEmitter — injectable factory, WHATSAPP_ENABLED guard (Phase 11). |
| `nodejs/src/server.js` | Node.js server — all REST endpoints including Phase 11 alert + WhatsApp status endpoints (port 3000). |
| `nodejs/src/runHiveDemo.js` | End-to-end H.I.V.E. demo runner (Phase 8). |
| `data/demo/hive_demo_scenario.json` | Fictional banking scam demo scenario, 5 turns (Phase 8). |
| `R/analysis/intelligence_extractor.R` | Entity extraction engine — extract_entities() + investigate_session() (Phase 9). |
| `R/analysis/behaviour_analyzer.R` | Behaviour pattern detection engine — analyze_behaviour() (Phase 9). |
| `tests/test_integration.js` | End-to-end integration test suite — 53/53 passed (Phase 6). |
| `tests/test_decision_flow.js` | Decision flow test suite — 54/54 passed (Phase 7). |
| `tests/test_hive_engagement.js` | H.I.V.E. engagement test suite — 63/63 passed (Phase 8). |
| `tests/test_intelligence_behaviour.R` | Intelligence + behaviour test suite — 79/79 passed (Phase 9). |
| `dashboard/app.R` | Placeholder — Shiny dashboard. |
| `data/raw/SMSSpamCollection` | Original dataset. Do NOT modify. |
| `data/processed/sms_cleaned.csv` | Cleaned dataset (5,171 × 11). |
| `data/processed/sms_tfidf.csv` | TF-IDF feature matrix (5,171 × 510). |
| `data/processed/sms_tokens.csv` | Long-form token data. |
| `models/scamtracer_model.rds` | Trained glmnet model (165 KB). |
| `models/model_vocab.rds` | Feature vocabulary (508 terms). |
| `models/model_metadata.rds` | Training config, metrics, lambda. |
| `reports/class_distribution.png` | Class distribution bar chart. |
| `reports/model_comparison.png` | Model comparison chart (3 models). |
| `reports/confusion_matrix.png` | Confusion matrix heatmap (selected model). |

---

## Important Decisions

1. **R as primary analytical technology** — all analytical work in R.
2. **Node.js limited to communication/integration** only.
3. **User-consent model for H.I.V.E.** — system never engages automatically.
4. **UCI SMS Spam Collection v.1** — selected and documented dataset.
5. **403 duplicates removed** from preprocessing.
6. **Entity tokens preserved** — URLs, phone numbers, currency NOT stripped; needed for H.I.V.E.
7. **Scam keywords kept** in stop-word removal (free, win, urgent, otp, upi, etc.).
8. **Logistic Regression (Elastic Net) selected** — best F1 and AUC among 3 models.
9. **lambda.1se** used for glmnet — prefers simpler model, reduces overfitting.
10. **spam_probability explicitly noted as statistical estimate** — not guaranteed truth.
11. **Naive Bayes degenerate result documented** — Gaussian NB incompatible with sparse TF-IDF.
12. **60/40 ML-to-indicator split** — ML is primary evidence (60%); indicators are supplementary capped at 40%.
13. **risk_score thresholds** — LOW <30, MEDIUM 30–59, HIGH ≥60 (documented, not arbitrary).
14. **vapply over sapply** — indicator_summary() uses vapply to handle empty indicator lists safely.
15. **UPI vs email disambiguation** — same base pattern matches both; emails classified by requiring TLD (`\.[A-Za-z]{2,}$`); UPI IDs (no TLD) classified separately. No double-counting.
16. **Digit-required TRANSACTION_ID pattern** — `[A-Z0-9]*[0-9][A-Z0-9]{4,19}` requires at least one digit; prevents matching plain English words as IDs when `ignore_case = TRUE`.
17. **NULL text guard in R list processing** — `as.character(NULL)` returns `character(0)`, not `NA`. Guard: `if (!is.null(t$text)) as.character(t$text) else NA_character_`.
18. **`simplifyVector = FALSE` in Plumber /investigate** — preserves conversation as list-of-lists rather than coercing to data frame.
19. **Cautious statement language** — investigation summary uses "Observed…" phrasing, never asserts identity of a scammer.
20. **`investigate_session` sources `behaviour_analyzer.R` conditionally** — checks `exists("analyze_behaviour")` before sourcing, preventing double-source when called from Plumber.

---

## Known Issues

1. **renv out-of-sync warning** — cosmetic. Run `renv::snapshot()` to resolve.
2. **Naive Bayes incompatible with TF-IDF** — documented. If NB is needed, use Multinomial NB with raw term counts.
3. **English-only training data** — India-specific scam patterns (UPI, KYC, OTP) not in training corpus. The regex-based H.I.V.E. extraction layer (Phase 4) handles these independently.
4. **Prediction interface re-tokenises on every call** — acceptable for demo; would need caching for a production service.
5. **ML model undertrained on India-specific patterns** — model trained on UK/Singapore SMS corpus. OTP/UPI/KYC language may score LEGITIMATE by ML; rule-based indicator engine and Phase 9 regex patterns compensate independently.

---

## Commands to Run the Project

### Full pipeline (in order)
```bash
cd "E:/R PROJECT"
Rscript R/preprocessing/cleaner.R    # produces data/processed/sms_cleaned.csv
Rscript R/nlp/text_features.R        # produces data/processed/sms_tfidf.csv
Rscript R/models/classifier.R        # trains models, saves models/*.rds
Rscript R/analysis/risk_scorer.R     # demo predictions
```

### Predict on a new message (interactively in R)
```r
setwd("E:/R PROJECT")
source("R/analysis/risk_scorer.R")
predict_scam("Your KYC is expired. Share OTP to avoid account block.")
```

### Restore R environment on a new machine
```r
renv::restore()
```

### Start R Plumber API (Terminal 1 — always from project root)
```bash
cd "E:/R PROJECT"
Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'
```

### Start Node.js server (Terminal 2)
```bash
cd "E:/R PROJECT/nodejs"
npm start
# Optional: set a different R API URL
R_API_URL=http://localhost:8000 npm start
```

### Test the integration
```bash
# Health check (Node + R):
curl http://localhost:3000/health

# Full intake flow (Phase 7):
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Your bank account will be suspended. Send OTP immediately."}'
# → Returns session_id + status: USER_DECISION_REQUIRED + notification

# User decision (Phase 7):
curl -X POST http://localhost:3000/decision \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<id from above>", "action": "BLOCK_AND_PROTECT"}'
# or action: "ACTIVATE_HIVE"

# Raw R result (Phase 6, no session):
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"message": "Your bank account will be suspended. Send OTP immediately."}'

# Run all test suites (all services must be running):
cd "E:/R PROJECT"
Rscript tests/test_risk_engine.R      # Phase 4: 69/69
Rscript tests/test_api.R              # Phase 5: 55/55 (R running)
node tests/test_integration.js        # Phase 6: 53/53 (both running)
node tests/test_decision_flow.js      # Phase 7: 54/54 (both running)
node tests/test_hive_engagement.js    # Phase 8: 63/63 (both running)
Rscript tests/test_intelligence_behaviour.R  # Phase 9: 79/79 (standalone, no server needed)
Rscript tests/test_dashboard.R               # Phase 10: 83/83 (standalone, no server needed)
node tests/test_whatsapp.js                  # Phase 11: 28/28 unit tests (no server needed)
# Phase 11 integration (requires Node.js on port 3001 with TEST_MODE):
SCAMTRACER_TEST_MODE=true WHATSAPP_ENABLED=false PORT=3001 node nodejs/src/server.js &
RUN_INTEGRATION=true TEST_PORT=3001 node tests/test_whatsapp.js
```

### Launch Shiny dashboard (Terminal 3 — no server needed)
```bash
cd "E:/R PROJECT"
Rscript -e 'shiny::runApp("dashboard", port=4000, launch.browser=FALSE)'
# Open browser at: http://localhost:4000
# Dashboard loads demo scenario and runs analysis automatically — no Node.js required.
```

### Investigate a completed H.I.V.E. session
```bash
# (after running the demo to get a session_id with HIVE_ENDED state)
curl -X POST http://localhost:3000/investigate \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<session_id_from_demo>"}'
# → Returns { session_id, intelligence, behaviour, summary { statements, ... } }
```

---

## Current Next Task
**Phase 11 is complete. The full H.I.V.E. pipeline plus live WhatsApp detection is implemented.**

**The project is complete through Phase 11 — no further phases should be started unless the user explicitly specifies.**

The complete pipeline is:
```
Live WhatsApp message (Phase 11)
  → WhatsAppMonitor intercepts (whatsapp-web.js)
  → processIncomingWhatsAppMessage() in server.js
  → R risk analysis (POST /analyze → R Plumber)
  → If risk_score ≥ SCAMTRACER_RISK_THRESHOLD (default 60):
      Alert created → User notification → USER_DECISION_REQUIRED
      → User decides via POST /alerts/:id/decision:
          BLOCK_AND_PROTECT → BLOCKED
          ACTIVATE_HIVE     → HIVE_ACTIVE → H.I.V.E. engagement
  → Manual conversation (POST /message → Phase 7):
      → User decision → H.I.V.E. activation
      → Controlled engagement → H.I.V.E. end → /investigate (Phase 9)
      → Shiny dashboard visualization (Phase 10/11, 7 tabs)
```

What remains deliberately not implemented: entity correlation graph (`R/network/entity_graph.R`), live investigation integration in dashboard tabs 1–6 (they always show the fixed demo scenario).

---

## Instructions for the Next AI

1. Read `PROJECT_RULES.md` completely.
2. Read this file completely.
3. Read `PROJECT_LOG.md` completely.
4. Inspect relevant source files before modifying them.
5. **Phases 1–11 are complete. This is the final implementation phase. Do NOT start another phase unless the user explicitly requests it.**
6. Do NOT re-train the model or re-run EDA unless something is broken.
7. Start R Plumber from project root: `Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'`
8. Start Node.js from `nodejs/`: `npm start`
9. The trained model is at `models/scamtracer_model.rds`. Access via `analyze_risk()` or `POST http://localhost:8000/analyze`.
10. H.I.V.E. conversation history is stored in `session.conversation[]` in `sessionStore.js`. Each record has direction (INCOMING/OUTGOING), text, timestamp, strategy.
11. Node.js calls R via `nodejs/src/rApiClient.js` — do NOT duplicate analytical logic in Node.js.
12. Do NOT fabricate dataset names, statistics, or model metrics — ever.
13. Do NOT silently change the architecture.
14. Keep R as the analytical core. Keep Node.js as communication layer only.
15. The user must always control H.I.V.E. activation — never automatic, never triggered by risk score alone.
16. After completing any phase, update both `PROJECT_LOG.md` and `CLAUDE_HANDOVER.md`.
17. The renv "out-of-sync" warning on script startup is cosmetic. Run `renv::snapshot()` to resolve if needed.
18. When sourcing R files in Plumber context, use `source(..., local = environment())` to ensure functions are visible to handler closures.
19. Use single-quoted bash strings when running Rscript with `$` signs: `Rscript -e 'pr$run(...)'`
20. Phase 9 R files (`intelligence_extractor.R`, `behaviour_analyzer.R`) are sourced in `R/api/plumber.R` with `local = environment()`. The `/investigate` endpoint validates `session_id` and `conversation`, calls `investigate_session()`, and returns structured JSON.
21. `investigate_session()` in `intelligence_extractor.R` conditionally sources `behaviour_analyzer.R` — safe to call standalone or from Plumber.
22. The Phase 9 test suite (`tests/test_intelligence_behaviour.R`) runs standalone — no server required. Run: `Rscript tests/test_intelligence_behaviour.R` from project root.
23. The Phase 10 test suite (`tests/test_dashboard.R`) runs standalone — no server required. Run: `Rscript tests/test_dashboard.R` from project root.
24. The Shiny dashboard launches with `Rscript -e 'shiny::runApp("dashboard", port=4000)'` from project root. It does NOT require Node.js or R Plumber — it calls R analytics functions directly.
25. The dashboard's `helpers.R` includes an R port of hiveEngine.js strategy logic (`.hive_select_strategy`, `.hive_generate_response`) used to reconstruct the deterministic H.I.V.E. conversation for the demo without needing Node.js.
26. Phase 11 adds `alertStore.js` (in-memory, not persistent — cleared on restart) and `whatsappClient.js` (EventEmitter wrapping `whatsapp-web.js`). The server imports and wires both.
27. `WHATSAPP_ENABLED=false` prevents real WhatsApp client startup. `SCAMTRACER_TEST_MODE=true` enables `POST /test/simulate-whatsapp` for automated integration tests. Both are env vars.
28. `SCAMTRACER_RISK_THRESHOLD` (default 60) is the minimum `risk_score` from R that triggers alert creation. Below threshold messages are silently recorded in `total_analysed` only.
29. WhatsApp session files are in `.wwebjs_auth/` and `.wwebjs_cache/` — both in `.gitignore`. Never commit these.
30. The Live Monitor tab (tab 7) in the Shiny dashboard polls `GET /whatsapp/status` and `GET /alerts` every 2 seconds using `reactivePoll()`. It requires Node.js to be running; if not, it shows "Not connected" gracefully.
31. `post_decision()` in `helpers.R` uses `httr::POST` (already in renv.lock). If the `httr` package is not loaded, call `suppressPackageStartupMessages(library(httr))` first.
32. The 19 integration tests (C1–C19) in `test_whatsapp.js` are SKIPPED by default. To run them: start Node.js with `SCAMTRACER_TEST_MODE=true WHATSAPP_ENABLED=false PORT=3001`, then run with `RUN_INTEGRATION=true TEST_PORT=3001 node tests/test_whatsapp.js`.
