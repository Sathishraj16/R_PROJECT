# ScamTracer AI

A cyber-security and scam-intelligence system based on the **H.I.V.E.** architecture.

> **Project Status: Phase 11 Complete — Full pipeline implemented: Detect → Engage → Extract → Dashboard → Live WhatsApp Monitor.**

---

## What is ScamTracer AI?

ScamTracer AI detects scam conversations, notifies the user, and — with explicit user consent — engages scammers in a controlled manner to extract actionable intelligence for investigation.

The system is designed so that **the user is always in control**. Detection triggers a notification. Engagement of a scammer never happens automatically.

---

## What is H.I.V.E.?

**H.I.V.E. = Heuristic Intelligence & Virtual Entrapment**

### Conceptual workflow
```
Detect → Engage → Extract → Report
```

### ScamTracer AI workflow
```
Incoming Conversation
  → Scam Detection
  → User Notification
  → User chooses:
       1. BLOCK & PROTECT    — safely stop the interaction
       2. ACTIVATE H.I.V.E.  — begin controlled engagement

  → If H.I.V.E. activated:
       Controlled Engagement
         → Intelligence Extraction
             (phone numbers, UPI IDs, URLs, emails, bank names,
              suspicious keywords, behavioural indicators)
         → Behaviour Analysis
         → Entity Correlation (network/graph analysis)
         → Investigation Report
```

---

## Architecture

```
WhatsApp / Conversation Input
        ↓
Node.js Communication Layer
        ↓
R Plumber API  (port 8000)
        ↓
R Analytics Engine
        ├── Data Processing    (dplyr, tidyr, stringr)
        ├── NLP                (tidytext)
        ├── ML Classification  [model TBD after dataset inspection]
        ├── Risk Scoring
        ├── Behaviour Analysis
        ├── Intelligence Extraction
        └── Network Analysis   (igraph, ggraph, tidygraph)
        ↓
R Shiny Dashboard
        ↓
Investigation Report
```

---

## Technology Stack

| Layer | Technology | Status |
|---|---|---|
| Messaging interface | WhatsApp (via whatsapp-web.js) | **IMPLEMENTED** — Phase 11 (detection + alerts; QR auth) |
| Communication layer | Node.js + Express + Axios | **IMPLEMENTED** — Phase 6/7/8/9/11 |
| API layer | R Plumber (port 8000) | **IMPLEMENTED** — Phase 5/9 |
| Data processing | R (dplyr, tidyr, stringr) | **IMPLEMENTED** — Phase 2 |
| NLP | R (tidytext, TF-IDF) | **IMPLEMENTED** — Phase 2 |
| ML Classification | R (glmnet Elastic Net) | **IMPLEMENTED** — Phase 3 |
| Risk scoring | R — analyze_risk() | **IMPLEMENTED** — Phase 4 |
| Rule-based indicators | R — detect_indicators() | **IMPLEMENTED** — Phase 4 |
| Behaviour analysis | R — analyze_behaviour() | **IMPLEMENTED** — Phase 9 |
| Intelligence extraction | R — extract_entities() + investigate_session() | **IMPLEMENTED** — Phase 9 |
| Network/graph analysis | R (igraph, ggraph, tidygraph) | Not implemented |
| Visualization | R (ggplot2) | IMPLEMENTED — Phase 3 (reports/) |
| Dashboard | R Shiny (port 4000) | **IMPLEMENTED** — Phase 10/11 (seven-section dashboard + Live Monitor tab) |
| Reporting | R | Not implemented |

---

## Project Structure

```
ScamTracer AI/
│
├── PROJECT_RULES.md          — permanent project rules and architecture
├── PROJECT_LOG.md            — chronological phase-by-phase history
├── CLAUDE_HANDOVER.md        — current-state snapshot for AI handover
├── README.md                 — this file
├── ScamTracerAI.Rproj        — R project file (open in RStudio)
├── renv_setup.R              — run once to set up R packages via renv
│
├── R/
│   ├── main.R                — R engine entry point (placeholder)
│   ├── api/
│   │   └── plumber.R         — R Plumber API definition (placeholder)
│   ├── preprocessing/
│   │   └── cleaner.R         — data cleaning and normalization (placeholder)
│   ├── nlp/
│   │   └── text_features.R   — NLP feature engineering (placeholder)
│   ├── models/
│   │   └── classifier.R      — ML scam classifier (placeholder)
│   ├── analysis/
│   │   └── risk_scorer.R     — risk scoring and behaviour analysis (placeholder)
│   ├── network/
│   │   └── entity_graph.R    — entity correlation graph (placeholder)
│   └── utils/
│       └── helpers.R         — utility functions (placeholder)
│
├── nodejs/
│   ├── package.json          — Node.js project manifest
│   └── src/
│       └── server.js         — Node.js communication layer (placeholder)
│
├── data/
│   ├── raw/                  — original downloaded datasets (not yet selected)
│   ├── processed/            — cleaned and feature-engineered data
│   └── demo/                 — sample data for demonstration
│
├── models/                   — serialized trained ML model files
├── dashboard/
│   └── app.R                 — R Shiny dashboard (placeholder)
├── reports/                  — generated investigation reports
├── tests/                    — test scripts
└── docs/                     — additional documentation
```

---

## Environment Requirements

### R
- **Required:** R >= 4.0.0
- **Status: R NOT YET INSTALLED on this machine** — must be installed before running R components
- Download: https://cran.r-project.org/

Required R packages (installed via `renv_setup.R` after R is available):
`dplyr`, `tidyr`, `stringr`, `tidytext`, `ggplot2`, `igraph`, `ggraph`, `tidygraph`, `plumber`, `shiny`

### Node.js
- **Required:** Node.js >= 18.0.0, npm >= 9.0.0
- **Detected:** Node.js v20.18.0, npm 10.8.2

---

## How to Run

### Step 1 — Install R packages (first time only)
```r
# From the project root in R or RStudio:
source("renv_setup.R")
# OR to restore the snapshotted environment:
renv::restore()
```

### Step 2 — Run the analytics pipeline (Phases 2–3, if retraining)
```bash
cd "E:/R PROJECT"
Rscript R/preprocessing/cleaner.R    # produces data/processed/sms_cleaned.csv
Rscript R/nlp/text_features.R        # produces data/processed/sms_tfidf.csv
Rscript R/models/classifier.R        # trains and saves models/*.rds
```

### Step 3 — Start the R Plumber API (Terminal 1 — always from project root)
```bash
cd "E:/R PROJECT"
Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'
# API available at http://localhost:8000
# Swagger docs at http://localhost:8000/__docs__/
```

### Step 4 — Start the Node.js communication layer (Terminal 2)
```bash
cd "E:/R PROJECT/nodejs"
npm start
# Server will run at http://localhost:3000
# Optional: R_API_URL=http://localhost:8000 npm start
```

### Step 5 — Test the full integration (Phase 6)
```bash
# Health check — reports both Node.js and R backend status:
curl http://localhost:3000/health

# Phase 7 — intake flow with session + notification:
curl -X POST http://localhost:3000/message \
  -H "Content-Type: application/json" \
  -d '{"message": "Your bank account will be suspended. Send the OTP immediately."}'
# Returns: session_id + status: USER_DECISION_REQUIRED + notification

# Phase 7 — user decision:
curl -X POST http://localhost:3000/decision \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<id from above>", "action": "ACTIVATE_HIVE"}'

# Phase 8 — H.I.V.E. engagement turn (session must be HIVE_ACTIVE):
curl -X POST http://localhost:3000/hive/message \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<id from above>", "message": "Share the 6-digit OTP immediately."}'

# Phase 8 — end H.I.V.E. session:
curl -X POST http://localhost:3000/hive/end \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<id from above>"}'

# Phase 8 — run the full demo (both services must be running):
node nodejs/src/runHiveDemo.js

# Phase 9 — investigate a completed H.I.V.E. session (HIVE_ENDED or HIVE_ACTIVE):
curl -X POST http://localhost:3000/investigate \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<id from above>"}'
# Returns: { session_id, intelligence (entities), behaviour (patterns), summary (statements) }

# Phase 6 — raw R result (no session):
curl -X POST http://localhost:3000/analyze \
  -H "Content-Type: application/json" \
  -d '{"message": "Your bank account will be suspended. Send the OTP immediately."}'

# Direct R API (Phase 5 — bypass Node.js):
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{"message": "Your account will be suspended. Send OTP immediately."}'
```

### Step 6 — Run all automated tests
```bash
cd "E:/R PROJECT"
Rscript tests/test_risk_engine.R      # Phase 4: 69/69 (R only)
Rscript tests/test_api.R              # Phase 5: 55/55 (R running)
node tests/test_integration.js        # Phase 6: 53/53 (both services running)
node tests/test_decision_flow.js      # Phase 7: 54/54 (both services running)
node tests/test_hive_engagement.js    # Phase 8: 63/63 (both services running)
Rscript tests/test_intelligence_behaviour.R  # Phase 9: 79/79 (standalone — no server needed)
Rscript tests/test_dashboard.R               # Phase 10: 83/83 (standalone — no server needed)
node tests/test_whatsapp.js                  # Phase 11: 28/28 unit tests (no server needed)
# Integration tests (C1–C19) — requires both servers running:
SCAMTRACER_TEST_MODE=true WHATSAPP_ENABLED=false PORT=3001 node nodejs/src/server.js &
RUN_INTEGRATION=true TEST_PORT=3001 node tests/test_whatsapp.js
```

### Step 7 — (Optional) Enable live WhatsApp monitoring
```bash
# Default: WHATSAPP_ENABLED=true — real client starts when npm start runs.
# On first run, a QR code appears in the terminal — scan with WhatsApp on your phone.
# Authentication session is saved to .wwebjs_auth/ (not committed to Git).
#
# To disable (development/demo mode):
WHATSAPP_ENABLED=false npm start
#
# Environment variables:
#   SCAMTRACER_RISK_THRESHOLD  — alert threshold (default 60, range 0–100)
#   WHATSAPP_ENABLED           — false to skip real client (default true)
#   SCAMTRACER_TEST_MODE       — true to enable POST /test/simulate-whatsapp
#
# New endpoints (once Node.js is running):
curl http://localhost:3000/whatsapp/status
curl http://localhost:3000/alerts
curl -X POST http://localhost:3000/alerts/<alert_id>/decision \
  -H "Content-Type: application/json" \
  -d '{"action": "BLOCK_AND_PROTECT"}'
```

### Step 8 — Launch the Shiny investigation dashboard (Terminal 3 — no server needed)
```bash
cd "E:/R PROJECT"
Rscript -e 'shiny::runApp("dashboard", port=4000, launch.browser=FALSE)'
# Then open: http://localhost:4000
#
# The dashboard calls R analytics functions directly.
# Node.js and R Plumber do NOT need to be running for the dashboard.
# It loads the demo scenario, runs analyze_risk() and investigate_session(),
# and displays the full investigation across six sections.
```

---

## Complete Demo Workflow

This is the full end-to-end showcase narrative. Steps 1–4 use the demo runner. Step 5 launches the dashboard.

**Terminal 1 — Start R Plumber API:**
```bash
cd "E:/R PROJECT"
Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'
```

**Terminal 2 — Start Node.js:**
```bash
cd "E:/R PROJECT/nodejs"
npm start
```

**Terminal 3 — Run full demo (then launch dashboard):**
```bash
cd "E:/R PROJECT"
node nodejs/src/runHiveDemo.js
# Demonstrates:
#   Step 1:  Fictional scam message submitted to POST /message
#   Step 2:  R analyzes it → risk_level=HIGH
#   Step 3:  Session created → USER_DECISION_REQUIRED
#   Step 4:  User explicitly activates H.I.V.E. → HIVE_ACTIVE
#   Step 5:  5-turn H.I.V.E. controlled engagement
#   Step 6:  H.I.V.E. session ended → HIVE_ENDED
#   Step 7:  POST /investigate → R extracts entities + behaviour
#   Step 8:  Results saved to data/demo/demo_session_output.json

# Then launch dashboard (Node.js can remain running or not):
Rscript -e 'shiny::runApp("dashboard", port=4000)'
# Open: http://localhost:4000
# Dashboard shows the complete investigation — risk, conversation, entities,
# behaviours, investigation summary.
```

---

## Dataset

**Selected:** UCI SMS Spam Collection v.1
- Source: UCI Machine Learning Repository
- License: CC BY 4.0
- 5,171 messages after deduplication (87.4% ham, 12.6% spam)
- Citation: Almeida & Hidalgo (2011), DOI: 10.24432/C5CC84

---

## ML Model

**Logistic Regression (Elastic Net)** trained on 4,136 messages:
| Metric | Value |
|---|---|
| Accuracy | 0.9430 |
| Precision (spam) | 0.7609 |
| Recall (spam) | 0.8015 |
| F1 Score (spam) | 0.7807 |
| AUC | 0.9639 |

All metrics from held-out test set. Nothing fabricated.

---

## College Project Note

This project is intended as a college project demonstration of the H.I.V.E. concept using R as the primary analytical engine. All models will be lightweight and explainable (Naive Bayes, Logistic Regression, SVM, or Decision Tree).
