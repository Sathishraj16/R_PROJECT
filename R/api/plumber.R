# ScamTracer AI — R Plumber API
# Phase 5: REST API exposing the Phase 3/4 analytics engine.
# Phase 9: Added POST /investigate for intelligence extraction and behaviour analysis.
#
# Architecture:
#   R = analytical engine (analyze_risk, detect_indicators, ML model,
#                          extract_entities, analyze_behaviour, investigate_session)
#   Plumber = API interface only (no analytical logic here)
#   Node.js = communication/integration layer (Phase 6+)
#
# Endpoints:
#   GET  /health     — liveness and model-load check
#   POST /analyze    — run analyze_risk() and return structured JSON
#   POST /investigate — run investigate_session() on H.I.V.E. conversation data
#
# Start from project root:
#   Rscript -e 'pr <- plumber::plumb("R/api/plumber.R"); pr$run(host="0.0.0.0", port=8000)'
#
# NOTE: Always start from E:/R PROJECT (project root).
# The API uses relative paths (models/, R/analysis/, etc.).

library(plumber)
suppressPackageStartupMessages(library(jsonlite))

# ─────────────────────────────────────────────────────────────────────────────
# Working directory: must be project root for relative paths to work.
# Detect by looking for the model anchor file; navigate up if needed.
# ─────────────────────────────────────────────────────────────────────────────
.locate_project_root <- function() {
  self_path <- tryCatch(
    normalizePath(sys.frame(1)$ofile),
    error = function(e) NA_character_
  )
  candidates <- character(0)
  if (!is.na(self_path)) {
    candidates <- c(candidates, normalizePath(file.path(dirname(self_path), "../..")))
  }
  candidates <- c(candidates, getwd(), "E:/R PROJECT")
  for (path in candidates) {
    if (file.exists(file.path(path, "models/scamtracer_model.rds"))) {
      return(normalizePath(path))
    }
  }
  return(NULL)
}

if (!file.exists("models/scamtracer_model.rds")) {
  .root <- .locate_project_root()
  if (!is.null(.root)) {
    setwd(.root)
    message("[plumber] Working directory: ", getwd())
  }
}

if (!file.exists("models/scamtracer_model.rds")) {
  stop(
    "[plumber] Cannot locate project root. ",
    "Start from E:/R PROJECT:\n",
    "  Rscript -e 'pr <- plumber::plumb(\"R/api/plumber.R\"); pr$run(host=\"0.0.0.0\", port=8000)'"
  )
}

# ─────────────────────────────────────────────────────────────────────────────
# Source analytics engine into THIS environment (the Plumber router env).
#
# IMPORTANT: Plumber sources plumber.R with `local = private$envir`, so this
# file runs in the router's private environment, NOT in .GlobalEnv.
# Handler closures are defined in that same private environment.
# Using `source(..., local = environment())` ensures analyze_risk(),
# detect_indicators(), and related symbols land in the same environment
# as the handler closures, making them visible during request processing.
# ─────────────────────────────────────────────────────────────────────────────
assign(".risk_scorer_sourced_by_test", TRUE, envir = .GlobalEnv)

# 1. Load indicators first
source("R/utils/helpers.R", local = environment())

# 2. Load risk scorer (resets .helpers_loaded to FALSE — correct it below)
source("R/analysis/risk_scorer.R", local = environment())

# 3. Helpers are already loaded above — prevent re-sourcing
.helpers_loaded <- TRUE

# 4. Pre-warm model (load RDS files once at startup, not per request)
.model_load_error <- NULL
tryCatch({
  .load_model()
  message("[plumber] Model pre-loaded: ", .scamtracer_env$metadata$model_name)
}, error = function(e) {
  .model_load_error <<- conditionMessage(e)
  message("[plumber] WARNING — model pre-load failed: ", .model_load_error)
})

.API_VERSION <- "0.9.0"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 9: Source intelligence extraction and behaviour analysis engines.
# These are sourced with local = environment() so their functions are visible
# to the /investigate handler closure (same scoping requirement as the risk
# scorer above).
# ─────────────────────────────────────────────────────────────────────────────
source("R/analysis/behaviour_analyzer.R",     local = environment())
source("R/analysis/intelligence_extractor.R", local = environment())

# ─────────────────────────────────────────────────────────────────────────────
# API metadata
# ─────────────────────────────────────────────────────────────────────────────

#* @apiTitle ScamTracer AI — R Analytics API
#* @apiDescription Phase 5 REST interface for the ScamTracer AI risk engine.
#*   Exposes analyze_risk() from R/analysis/risk_scorer.R.
#*   R is the analytical engine. Plumber is the API interface only.
#*   Node.js integration is planned for Phase 6.

# ─────────────────────────────────────────────────────────────────────────────
# CORS filter — permissive for local development
# ─────────────────────────────────────────────────────────────────────────────
#* @filter cors
function(req, res) {
  res$setHeader("Access-Control-Allow-Origin",  "*")
  res$setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  res$setHeader("Access-Control-Allow-Headers", "Content-Type, Accept")
  if (identical(req$REQUEST_METHOD, "OPTIONS")) {
    res$status <- 204
    return(list())
  }
  plumber::forward()
}

# ─────────────────────────────────────────────────────────────────────────────
# GET /health
# ─────────────────────────────────────────────────────────────────────────────
#* Liveness check. Returns API status and whether the ML model is loaded.
#* Does NOT run a prediction — safe to call frequently.
#*
#* @get /health
#* @serializer json list(auto_unbox = TRUE)
function() {
  model_loaded <- exists("model", envir = .scamtracer_env)
  resp <- list(
    status       = "ok",
    service      = "ScamTracer AI R Analytics API",
    version      = .API_VERSION,
    r_version    = paste(R.version$major, R.version$minor, sep = "."),
    model_loaded = model_loaded
  )
  if (model_loaded) {
    meta <- .scamtracer_env$metadata
    resp$model_name <- meta$model_name
    resp$model_f1   <- meta$test_f1
    resp$model_auc  <- meta$test_auc
  } else if (!is.null(.model_load_error)) {
    resp$status        <- "degraded"
    resp$model_warning <- "Model not loaded — analysis will fail."
  }
  resp
}

# ─────────────────────────────────────────────────────────────────────────────
# POST /analyze
# ─────────────────────────────────────────────────────────────────────────────
#* Analyze a message for scam risk.
#*
#* Calls analyze_risk(message) from R/analysis/risk_scorer.R.
#* Returns a structured JSON risk assessment.
#*
#* Request body (JSON):
#*   { "message": "Your bank account will be blocked. Send OTP immediately." }
#*
#* @post /analyze
#* @serializer json list(auto_unbox = TRUE)
function(req, res) {

  # ── Parse body ──────────────────────────────────────────────────────────
  raw_body <- tryCatch(req$postBody, error = function(e) "")
  if (is.null(raw_body) || nchar(trimws(raw_body)) == 0) {
    res$status <- 400
    return(list(error = TRUE,
                message = "Request body is empty. Expected JSON: {\"message\": \"...\"}"))
  }

  body <- tryCatch(
    jsonlite::fromJSON(raw_body, simplifyVector = TRUE),
    error = function(e) NULL
  )
  if (is.null(body)) {
    res$status <- 400
    return(list(error = TRUE, message = "Request body is not valid JSON."))
  }

  # ── Validate message field ───────────────────────────────────────────────
  if (!is.list(body) || !"message" %in% names(body)) {
    res$status <- 400
    return(list(error = TRUE,
                message = "Required field 'message' is missing. Expected: {\"message\": \"...\"}"))
  }

  msg <- body[["message"]]

  if (is.null(msg)) {
    res$status <- 400
    return(list(error = TRUE, message = "Field 'message' must not be null."))
  }

  if (!is.character(msg) || length(msg) != 1) {
    res$status <- 400
    return(list(error = TRUE,
                message = paste0("Field 'message' must be a string. Received type: ",
                                 class(msg)[1], ".")))
  }

  # ── Empty string — return UNKNOWN gracefully (not a 4xx error) ───────────
  # IMPORTANT: use NA_real_ / NA_character_ for missing numeric/string fields,
  # NOT NULL. In R's jsonlite, NULL list elements serialize as {} (empty object)
  # which JavaScript receives as {} instead of null — causing NaN comparisons
  # to silently bypass the risk threshold check and create malformed alerts.
  if (nchar(trimws(msg)) == 0) {
    return(list(
      prediction          = "UNKNOWN",
      model_probability   = NA_real_,
      ml_score            = NA_real_,
      indicator_score     = 0L,
      risk_score          = NA_real_,
      risk_level          = "UNKNOWN",
      detected_indicators = list(),
      explanations        = list(),
      summary_text        = "Empty message — no analysis possible.",
      model_used          = NA_character_,
      caveat              = "No content to analyse."
    ))
  }

  # ── Call analyze_risk() ──────────────────────────────────────────────────
  result <- tryCatch(
    analyze_risk(msg),
    error = function(e) list(.__api_error__ = TRUE, .__msg__ = conditionMessage(e))
  )

  if (isTRUE(result$.__api_error__)) {
    res$status <- 500
    return(list(
      error   = TRUE,
      message = "Internal analysis error. Check that the model files are present and loadable."
    ))
  }

  # ── Build clean API response ─────────────────────────────────────────────
  # indicator_details (complex nested list) excluded; key info in
  # detected_indicators + explanations.
  # as.list() on character vectors ensures JSON arrays even for length-1 vectors.
  list(
    prediction          = result$prediction,
    model_probability   = result$model_probability,
    ml_score            = result$ml_score,
    indicator_score     = result$indicator_score,
    risk_score          = result$risk_score,
    risk_level          = result$risk_level,
    detected_indicators = as.list(result$detected_indicators),
    explanations        = as.list(result$explanations),
    summary_text        = result$summary_text,
    model_used          = result$model_used,
    caveat              = result$caveat
  )
}

# ─────────────────────────────────────────────────────────────────────────────
# POST /investigate
# ─────────────────────────────────────────────────────────────────────────────
#* Run intelligence extraction and behaviour analysis on H.I.V.E. conversation data.
#*
#* Calls investigate_session() from R/analysis/intelligence_extractor.R.
#* Returns extracted entities + behaviour records + investigation summary.
#*
#* SCOPE: This endpoint analyses a supplied conversation array.
#* It does NOT access session state or the Node.js session store.
#* It performs only content analysis on the provided messages.
#*
#* Request body (JSON):
#*   {
#*     "session_id": "...",
#*     "conversation": [
#*       { "direction": "INCOMING", "text": "...", "turn": 1 },
#*       { "direction": "OUTGOING", "text": "...", "turn": 1 },
#*       ...
#*     ]
#*   }
#*
#* @post /investigate
#* @serializer json list(auto_unbox = TRUE)
function(req, res) {

  # ── Parse body ──────────────────────────────────────────────────────────
  raw_body <- tryCatch(req$postBody, error = function(e) "")
  if (is.null(raw_body) || nchar(trimws(raw_body)) == 0L) {
    res$status <- 400L
    return(list(error = TRUE, message = "Request body is empty."))
  }

  body <- tryCatch(
    jsonlite::fromJSON(raw_body, simplifyVector = FALSE),
    error = function(e) NULL
  )
  if (is.null(body)) {
    res$status <- 400L
    return(list(error = TRUE, message = "Request body is not valid JSON."))
  }

  # ── Validate session_id ──────────────────────────────────────────────────
  if (!is.list(body) || !"session_id" %in% names(body)) {
    res$status <- 400L
    return(list(error = TRUE, message = "Required field 'session_id' is missing."))
  }
  sid <- body[["session_id"]]
  if (is.null(sid) || !is.character(sid) || nchar(trimws(sid)) == 0L) {
    res$status <- 400L
    return(list(error = TRUE, message = "Field 'session_id' must be a non-empty string."))
  }

  # ── Validate conversation ────────────────────────────────────────────────
  if (!"conversation" %in% names(body)) {
    res$status <- 400L
    return(list(error = TRUE, message = "Required field 'conversation' is missing."))
  }
  convo <- body[["conversation"]]
  if (!is.list(convo)) {
    res$status <- 400L
    return(list(error = TRUE, message = "Field 'conversation' must be a JSON array of turn objects."))
  }

  # ── Run investigation ────────────────────────────────────────────────────
  inv <- tryCatch(
    investigate_session(sid, convo),
    error = function(e) list(.__inv_error__ = TRUE, .__msg__ = conditionMessage(e))
  )

  if (isTRUE(inv$.__inv_error__)) {
    res$status <- 500L
    return(list(
      error   = TRUE,
      message = paste0("Investigation error: ", inv$.__msg__)
    ))
  }

  # ── Serialise ────────────────────────────────────────────────────────────
  # intelligence and behaviour are lists of named lists → JSON arrays of objects.
  # summary scalars are already typed correctly.
  list(
    session_id   = inv$session_id,
    intelligence = inv$intelligence,
    behaviour    = inv$behaviour,
    summary      = list(
      n_turns_analysed             = inv$summary$n_turns_analysed,
      n_entities                   = inv$summary$n_entities,
      entity_types                 = as.list(inv$summary$entity_types),
      n_behaviours                 = inv$summary$n_behaviours,
      behaviour_types              = as.list(inv$summary$behaviour_types),
      n_suspicious_request_types   = inv$summary$n_suspicious_request_types,
      repeated_requests            = inv$summary$repeated_requests,
      escalation_detected          = inv$summary$escalation_detected,
      statements                   = inv$summary$statements
    )
  )
}
