# ScamTracer AI — Project Rules

## Project Identity

**Project Name:** ScamTracer AI
**Architecture:** H.I.V.E. — Heuristic Intelligence & Virtual Entrapment
**Purpose:** A cyber-security and scam-intelligence system that detects scam conversations, notifies the user, and (with explicit user consent) engages scammers in a controlled manner to extract actionable intelligence.

---

## H.I.V.E. Architecture

H.I.V.E. stands for **Heuristic Intelligence & Virtual Entrapment**.

### Conceptual Workflow
```
Detect → Engage → Extract → Report
```

### ScamTracer AI Workflow
```
Incoming Conversation
  → Scam Detection
  → User Notification
  → User chooses:
       1. BLOCK & PROTECT   — safely stop the interaction
       2. ACTIVATE H.I.V.E. — controlled engagement and intelligence collection
  → If H.I.V.E. activated:
       Controlled Engagement
         → Intelligence Extraction
         → Behaviour Analysis
         → Entity Correlation
         → Investigation Report
```

### Critical Design Principle: User Remains in Control
The system must NEVER automatically engage a suspicious conversation.
Detection triggers a notification. Engagement requires explicit user choice.

---

## Technology Decisions

### Primary Analytical Technology: R
R is responsible for ALL data science and analytical work:
- Data cleaning and manipulation (dplyr, tidyr, stringr)
- NLP and text processing (tidytext)
- Feature engineering
- Machine learning and classification
- Statistical analysis and risk scoring
- Behavioural analysis and anomaly detection
- Intelligence extraction
- Network and graph analysis (igraph, ggraph, tidygraph)
- Visualization (ggplot2)
- Interactive dashboard (R Shiny)
- API layer (R Plumber)
- Investigation reporting

### Communication/Integration Layer: Node.js
Node.js is limited to:
- Interfacing with the messaging system (WhatsApp or equivalent)
- Passing conversation data to the R Plumber API
- Receiving results and presenting them to the user
- NOT performing any analytical or ML work

### Intended System Architecture
```
WhatsApp / Conversation Input
        ↓
Node.js Communication Layer
        ↓
R Plumber API
        ↓
R Analytics Engine
        ├── Data Processing
        ├── NLP
        ├── ML Classification
        ├── Risk Scoring
        ├── Behaviour Analysis
        ├── Intelligence Extraction
        └── Network Analysis
        ↓
R Shiny Dashboard
        ↓
Investigation Report
```

---

## Intelligence Extraction Targets
The system must attempt to extract from scam conversations:
- Phone numbers
- UPI IDs
- URLs
- Email addresses
- Bank names
- Suspicious keywords
- Timestamps
- Behavioural indicators
- Other relevant scam entities

Extracted entities must be correlated across conversations using network/graph analysis.

---

## Dataset Rules

1. Use only real, publicly available datasets.
2. Never fabricate dataset names, sizes, sources, or statistics.
3. Never fabricate model accuracy, precision, recall, F1 score, or any experimental result.
4. When a dataset is selected, document:
   - Exact dataset name
   - Source and URL
   - License (if available)
   - Number of records
   - Column names
   - Class distribution
   - Relevance to ScamTracer AI
   - Limitations
5. Inspect the dataset before choosing an ML model.

### ML Model Preference
Prefer lightweight and explainable models suitable for a normal laptop:
- Naive Bayes
- Logistic Regression
- SVM
- Decision Tree
- Random Forest (if appropriate after dataset inspection)

Final model selection must be justified by dataset characteristics, not assumed in advance.

---

## Development Principles

1. Build the project phase by phase. Do not skip phases.
2. Every completed phase must be verified and tested before being marked complete.
3. Do not mark a feature complete unless it has been implemented AND tested.
4. Do not fabricate results of any kind.
5. Prefer simple, explainable implementations over unnecessary complexity.
6. Do not rewrite working components without a documented and clear reason.
7. Preserve the H.I.V.E. architecture throughout the project.
8. Keep R as the primary analytical technology.
9. Keep Node.js limited to communication and integration responsibilities only.
10. Keep the project fully reproducible (document all commands, versions, dependencies).
11. Document all important technical decisions in PROJECT_LOG.md.
12. Never silently change the architecture. Any architectural change must be explained and logged.
13. If a requirement is technically difficult or unsafe, explain the limitation clearly before proposing or implementing an alternative.
14. The final project must be suitable for a college project demonstration.

---

## Documentation Rules

### Three Required Files (always present in project root)

| File | Purpose |
|---|---|
| `PROJECT_RULES.md` | Permanent rules, principles, architecture, constraints. This file. |
| `PROJECT_LOG.md` | Chronological phase-by-phase history of all work done. |
| `CLAUDE_HANDOVER.md` | Current state snapshot for AI handover — always reflects actual codebase state. |

### PROJECT_LOG.md — Required Fields per Phase
Each phase entry must include:
- Phase number and name
- Objective
- Work completed
- Files created
- Files modified
- Packages/dependencies added
- Commands executed
- Tests performed
- Test results
- Important technical decisions
- Problems encountered
- Problems resolved
- Remaining problems
- Next phase

### CLAUDE_HANDOVER.md — Required Fields
Must always reflect the ACTUAL current state of the codebase:
- Project name and objective
- H.I.V.E. explanation
- Current architecture
- Current technology stack
- Current phase
- Completed phases
- Current implementation status
- Dataset status
- ML model status
- Important files and their purposes
- Important decisions
- Known issues
- Commands to run the project
- Current next task
- Instructions for the next AI

### Update Cadence
- PROJECT_LOG.md: updated at the end of every completed phase.
- CLAUDE_HANDOVER.md: updated at the end of every completed phase to reflect the latest actual state.
- PROJECT_RULES.md: updated only when a permanent rule or architectural decision changes.

---

## AI Handover Rule

When a new AI/Claude instance begins work on this repository, it must:

1. Read `PROJECT_RULES.md` in full.
2. Read `CLAUDE_HANDOVER.md` in full.
3. Read `PROJECT_LOG.md` in full.
4. Inspect the relevant source files before making any changes.
5. Continue from the current state. Do NOT restart completed phases.
6. Do NOT assume anything that is not documented or visible in the codebase.
