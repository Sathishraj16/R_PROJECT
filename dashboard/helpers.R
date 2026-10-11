# ScamTracer AI — Dashboard Helpers (Phase 11)
#
# Provides:
#   setup_analytics()           — source all R analytics engines
#   load_demo_data()            — run full analysis on demo scenario, return results
#   format_entity_table()       — convert entity list to data.frame
#   format_behaviour_table()    — convert behaviour list to data.frame
#   format_conversation_table() — convert conversation list to data.frame
#   behaviour_frequency_chart() — ggplot2 bar chart of behaviour counts
#   entity_type_chart()         — ggplot2 bar chart of entity type counts
#   fetch_whatsapp_status()     — GET /whatsapp/status from Node.js server
#   fetch_alerts()              — GET /alerts from Node.js server
#   post_decision()             — POST /alerts/:id/decision to Node.js server
#
# All analytical work is performed by existing R engines (risk_scorer.R,
# intelligence_extractor.R, behaviour_analyzer.R). This file is a bridge
# between the engines and the Shiny UI — no new analytical logic is added.
#
# The fetch_* and post_decision helpers use the `curl` package (in renv.lock).
# They are NULL-safe: if Node.js is not running, they return NULL rather than
# throwing.

suppressPackageStartupMessages({
  library(jsonlite)
  library(ggplot2)
  library(stringr)
  library(curl)
})

# ── Working directory ────────────────────────────────────────────────────────
# Called once during setup to ensure all relative paths resolve correctly.
.find_project_root <- function() {
  candidates <- c(
    normalizePath(getwd(),               mustWork = FALSE),
    normalizePath(file.path(getwd(), ".."), mustWork = FALSE),
    "E:/R PROJECT"
  )
  for (p in candidates) {
    if (file.exists(file.path(p, "models/scamtracer_model.rds"))) {
      return(normalizePath(p, mustWork = FALSE))
    }
  }
  stop("[helpers] Cannot locate project root (no models/scamtracer_model.rds found). ",
       "Run from E:/R PROJECT.")
}

setup_analytics <- function() {
  root <- .find_project_root()
  if (!identical(normalizePath(getwd()), root)) {
    setwd(root)
    message("[dashboard] Working directory: ", root)
  }
  source("R/utils/helpers.R")
  source("R/analysis/risk_scorer.R")
  source("R/analysis/behaviour_analyzer.R")
  source("R/analysis/intelligence_extractor.R")
  invisible(TRUE)
}

# ── H.I.V.E. response logic (R port of hiveEngine.js Phase 8) ────────────────
# Reconstructs the deterministic H.I.V.E. responses for the demo conversation
# without requiring the Node.js server. Same patterns + templates as hiveEngine.js.
.hive_select_strategy <- function(message) {
  if (grepl("\\b(otp|one.time.?(password|code|pin)|verification\\s+code|passcode|6.?digit)\\b",
            message, ignore.case = TRUE, perl = TRUE))
    return("otp_deflection")
  if (grepl("\\b(password|your\\s+pin|login\\s+id|username|debit\\s+card|cvv|card\\s+number|net\\s+banking)\\b",
            message, ignore.case = TRUE, perl = TRUE))
    return("credential_deflection")
  if (grepl("\\b(transfer|send\\s+(money|fund|rs|amount)|pay(ment)?|upi\\s*id|neft|imps|account\\s+number|bank\\s+account)\\b",
            message, ignore.case = TRUE, perl = TRUE))
    return("payment_probe")
  if (grepl("\\b(suspend|block(ed)?|freez(e|ing)|deactivat|clos(ed|e)|terminat)\\b",
            message, ignore.case = TRUE, perl = TRUE))
    return("suspension_probe")
  if (grepl("https?://|www\\.|click\\s+(here|this\\s+link)|open\\s+link|visit\\s+link",
            message, ignore.case = TRUE, perl = TRUE))
    return("url_probe")
  if (grepl("\\b(won|winner|prize|lottery|reward|congratulation|selected\\s+for|lucky)\\b",
            message, ignore.case = TRUE, perl = TRUE))
    return("prize_probe")
  "neutral_clarification"
}

.HIVE_TEMPLATES <- list(
  otp_deflection        = c(
    "I received a notification, but I need to understand the process first. Why would you need a code from me to verify my own account?",
    "Can you explain what official system requires this code? My bank usually handles verification through their own application.",
    "Before I share any code, can you send me the official case reference number for this verification request?"
  ),
  credential_deflection = c(
    "I am not comfortable sharing account details through this channel. What is the official procedure for this kind of request?",
    "Could you provide the official helpline number so I can call and verify this request independently?",
    "My bank has never asked for that information through a message. Which department is handling this?"
  ),
  payment_probe         = c(
    "Could you provide an official reference number and the registered name of the organization this payment would go to?",
    "I would need written confirmation of this payment requirement before proceeding. Can you send that through official channels?",
    "What is the official account name and registration number of the entity requesting this transfer?"
  ),
  suspension_probe      = c(
    "Can you provide the official reference number for this account issue and the name of your department?",
    "I would like to verify this by calling the official customer care number. Which bank or organization are you from?",
    "What is the official escalation process if I want to dispute this account action?"
  ),
  url_probe             = c(
    "Can you tell me the official name of the organization behind this link before I open it?",
    "I prefer to navigate to official websites directly. What is the registered company name I should look for?",
    "Why would an official organization send a link through this channel rather than their verified domain?"
  ),
  prize_probe           = c(
    "Could you provide the official terms and conditions document for this prize?",
    "What is the name of the registered organization running this programme, and where can I verify it independently?",
    "How did you obtain my contact information for this prize notification?"
  ),
  neutral_clarification = c(
    "I need more information before I can proceed. Could you provide official documentation for this request?",
    "Can you clarify what official process this relates to and provide a reference number?",
    "I would like to verify this through official channels. Could you provide your organization's registered contact details?"
  )
)

.hive_generate_response <- function(message, interaction_count) {
  strategy  <- .hive_select_strategy(message)
  templates <- .HIVE_TEMPLATES[[strategy]]
  response  <- templates[[(interaction_count %% length(templates)) + 1L]]
  list(strategy = strategy, response = response)
}

# ── Demo data loader ──────────────────────────────────────────────────────────

#' Load demo scenario, run analytics, return structured results.
#'
#' This is the single entry point for the dashboard. It:
#'   1. Loads data/demo/hive_demo_scenario.json
#'   2. Runs analyze_risk() on the initial suspicious message
#'   3. Reconstructs the H.I.V.E. conversation (scammer msgs + deterministic responses)
#'   4. Runs investigate_session() on the conversation
#'   5. Returns everything as a named list
#'
#' @return Named list with: scenario, initial_msg, risk, conversation, investigation
load_demo_data <- function() {
  scenario_path <- "data/demo/hive_demo_scenario.json"
  if (!file.exists(scenario_path)) {
    stop("[load_demo_data] Demo scenario not found: ", scenario_path,
         "\nRun from E:/R PROJECT.")
  }
  scenario <- fromJSON(scenario_path, simplifyVector = FALSE)

  # Risk analysis on initial suspicious message
  initial_msg <- scenario$initial_suspicious_message
  risk <- tryCatch(
    analyze_risk(initial_msg),
    error = function(e) {
      warning("[load_demo_data] analyze_risk() failed: ", conditionMessage(e))
      list(prediction = "ERROR", risk_level = "UNKNOWN", risk_score = NA,
           model_probability = NA, ml_score = NA, indicator_score = NA,
           detected_indicators = list(), explanations = list(),
           summary_text = paste("Analysis error:", conditionMessage(e)),
           caveat = "")
    }
  )

  # Reconstruct H.I.V.E. conversation (deterministic — matches hiveEngine.js exactly)
  scammer_msgs <- scenario$scammer_messages
  conversation <- vector("list", length(scammer_msgs) * 2L)
  base_ts      <- as.POSIXct("2026-09-20 10:00:00", tz = "UTC")

  for (i in seq_along(scammer_msgs)) {
    sm       <- scammer_msgs[[i]]
    incoming <- as.character(sm$text)
    hr       <- .hive_generate_response(incoming, i - 1L)  # ic = i-1 (0-indexed before increment)
    turn_ts  <- format(base_ts + i * 30, "%Y-%m-%dT%H:%M:%SZ")

    idx_in  <- (i - 1L) * 2L + 1L
    idx_out <- idx_in + 1L

    conversation[[idx_in]] <- list(
      direction = "INCOMING",
      text      = incoming,
      turn      = as.integer(i),
      timestamp = turn_ts,
      strategy  = NA_character_
    )
    conversation[[idx_out]] <- list(
      direction = "OUTGOING",
      text      = hr$response,
      turn      = as.integer(i),
      timestamp = turn_ts,
      strategy  = hr$strategy
    )
  }

  # Investigation: entity extraction + behaviour analysis via R engines
  investigation <- tryCatch(
    investigate_session("demo-session-001", conversation),
    error = function(e) {
      warning("[load_demo_data] investigate_session() failed: ", conditionMessage(e))
      list(session_id   = "demo-session-001",
           intelligence = list(),
           behaviour    = list(),
           summary      = list(n_turns_analysed = 0L, n_entities = 0L,
                               entity_types = list(), n_behaviours = 0L,
                               behaviour_types = list(), n_suspicious_request_types = 0L,
                               repeated_requests = FALSE, escalation_detected = FALSE,
                               statements = list(paste("Investigation error:", conditionMessage(e)))))
    }
  )

  list(
    scenario      = scenario,
    initial_msg   = initial_msg,
    risk          = risk,
    conversation  = conversation,
    investigation = investigation
  )
}

# ── Table formatters ──────────────────────────────────────────────────────────

format_entity_table <- function(entities, filter_type = "All") {
  if (length(entities) == 0L) {
    return(data.frame(Type = character(0), Value = character(0),
                      Turn = integer(0), Direction = character(0),
                      Source = character(0), stringsAsFactors = FALSE))
  }
  df <- do.call(rbind, lapply(entities, function(e) {
    data.frame(
      Type      = as.character(e$entity_type),
      Value     = as.character(e$value),
      Turn      = as.integer(e$turn),
      Direction = as.character(e$direction),
      Source    = paste0(substr(as.character(e$source_text), 1L, 70L),
                         if (nchar(e$source_text) > 70L) "..." else ""),
      stringsAsFactors = FALSE
    )
  }))
  if (!is.null(filter_type) && filter_type != "All") {
    df <- df[df$Type == filter_type, , drop = FALSE]
  }
  df[order(df$Turn, df$Type), , drop = FALSE]
}

format_behaviour_table <- function(behaviours) {
  if (length(behaviours) == 0L) {
    return(data.frame(Behaviour = character(0), Severity = character(0),
                      Turn = integer(0), Evidence = character(0), stringsAsFactors = FALSE))
  }
  df <- do.call(rbind, lapply(behaviours, function(b) {
    data.frame(
      Behaviour = as.character(b$behaviour),
      Severity  = as.character(b$severity),
      Turn      = as.integer(b$turn),
      Evidence  = paste0(substr(as.character(b$evidence), 1L, 80L),
                         if (nchar(b$evidence) > 80L) "..." else ""),
      stringsAsFactors = FALSE
    )
  }))
  df[order(df$Turn, df$Behaviour), , drop = FALSE]
}

format_conversation_table <- function(conversation) {
  if (length(conversation) == 0L) {
    return(data.frame(Turn = integer(0), Direction = character(0),
                      Message = character(0), stringsAsFactors = FALSE))
  }
  do.call(rbind, lapply(conversation, function(m) {
    data.frame(
      Turn      = as.integer(m$turn),
      Direction = as.character(m$direction),
      Message   = as.character(m$text),
      stringsAsFactors = FALSE
    )
  }))
}

# ── Chart builders ────────────────────────────────────────────────────────────

behaviour_frequency_chart <- function(behaviours) {
  if (length(behaviours) == 0L) {
    return(
      ggplot() +
        annotate("text", x = 0.5, y = 0.5, label = "No behaviour data available",
                 size = 5, color = "#7f8c8d") +
        theme_void()
    )
  }

  df     <- format_behaviour_table(behaviours)
  counts <- as.data.frame(table(Behaviour = df$Behaviour), stringsAsFactors = FALSE)
  counts <- counts[order(counts$Freq), ]

  colour_map <- c(
    URGENCY            = "#e67e22",
    THREAT             = "#c0392b",
    IMPERSONATION      = "#8e44ad",
    OTP_SOLICITATION   = "#e74c3c",
    PAYMENT_REQUEST    = "#d35400",
    CREDENTIAL_REQUEST = "#922b21",
    REPEATED_REQUEST   = "#f39c12",
    ESCALATION         = "#6c3483"
  )

  ggplot(counts, aes(x = reorder(Behaviour, Freq), y = Freq,
                     fill = Behaviour)) +
    geom_col(show.legend = FALSE, width = 0.65) +
    coord_flip() +
    scale_fill_manual(values = colour_map, na.value = "#95a5a6") +
    labs(title = "Observed Behaviour Frequency",
         x     = NULL,
         y     = "Occurrences") +
    theme_minimal(base_size = 13) +
    theme(
      plot.title       = element_text(face = "bold", color = "#2c3e50", size = 14),
      axis.text        = element_text(size = 11, color = "#2c3e50"),
      panel.grid.major.y = element_blank()
    )
}

entity_type_chart <- function(entities) {
  if (length(entities) == 0L) {
    return(
      ggplot() +
        annotate("text", x = 0.5, y = 0.5, label = "No entity data available",
                 size = 5, color = "#7f8c8d") +
        theme_void()
    )
  }

  df    <- format_entity_table(entities)
  counts <- as.data.frame(table(Type = df$Type), stringsAsFactors = FALSE)
  counts <- counts[order(counts$Freq), ]

  ggplot(counts, aes(x = reorder(Type, Freq), y = Freq, fill = Freq)) +
    geom_col(show.legend = FALSE, width = 0.65) +
    coord_flip() +
    scale_fill_gradient(low = "#5dade2", high = "#1a5276") +
    labs(title = "Extracted Entity Types",
         x     = NULL,
         y     = "Count") +
    theme_minimal(base_size = 13) +
    theme(
      plot.title         = element_text(face = "bold", color = "#2c3e50", size = 14),
      axis.text          = element_text(size = 11, color = "#2c3e50"),
      panel.grid.major.y = element_blank()
    )
}

# ── Risk level badge colour ───────────────────────────────────────────────────
risk_colour <- function(level) {
  switch(toupper(level),
    HIGH    = "#e74c3c",
    MEDIUM  = "#f39c12",
    LOW     = "#27ae60",
    UNKNOWN = "#95a5a6",
    "#95a5a6"
  )
}

# ── Node.js API client helpers (Phase 11) ────────────────────────────────────
# These communicate with the Node.js server at the given base URL.
# All return NULL on any connection error (server not running is normal in demo).

#' GET /whatsapp/status — returns list or NULL
fetch_whatsapp_status <- function(node_url = "http://localhost:3000") {
  tryCatch({
    h      <- new_handle(timeout = 2L)
    result <- curl_fetch_memory(paste0(node_url, "/whatsapp/status"), handle = h)
    if (result$status_code != 200L) return(NULL)
    fromJSON(rawToChar(result$content), simplifyVector = TRUE)
  }, error = function(e) NULL)
}

#' GET /alerts — returns list of alert objects or NULL
fetch_alerts <- function(node_url = "http://localhost:3000") {
  tryCatch({
    h      <- new_handle(timeout = 2L)
    result <- curl_fetch_memory(paste0(node_url, "/alerts"), handle = h)
    if (result$status_code != 200L) return(NULL)
    parsed <- fromJSON(rawToChar(result$content), simplifyVector = FALSE)
    if (!is.null(parsed$alerts)) parsed$alerts else list()
  }, error = function(e) NULL)
}

#' POST /alerts/:id/decision — send BLOCK_AND_PROTECT or ACTIVATE_HIVE
#' Returns the decision response or a list(error=TRUE, message=...) on failure.
post_decision <- function(alert_id, action, node_url = "http://localhost:3000") {
  tryCatch({
    body <- toJSON(list(action = action), auto_unbox = TRUE)
    h    <- new_handle(timeout = 5L)
    handle_setopt(h, copypostfields = body)
    handle_setheaders(h, "Content-Type" = "application/json")
    result <- curl_fetch_memory(
      paste0(node_url, "/alerts/", alert_id, "/decision"),
      handle = h
    )
    parsed <- fromJSON(rawToChar(result$content), simplifyVector = FALSE)
    if (result$status_code != 200L) {
      return(list(error = TRUE,
                  message = if (!is.null(parsed$message)) parsed$message
                            else paste("HTTP", result$status_code)))
    }
    parsed
  }, error = function(e) list(error = TRUE, message = conditionMessage(e)))
}

# ── Completed investigation file helpers ──────────────────────────────────────

#' Return a named character vector: session_id → display label.
#' Reads filenames from data/completed_sessions/.
#' Returns an empty named character vector if no files exist.
load_live_investigations <- function(dir = "data/completed_sessions") {
  if (!dir.exists(dir)) return(setNames(character(0), character(0)))
  files <- list.files(dir, pattern = "\\.json$", full.names = FALSE)
  if (length(files) == 0L) return(setNames(character(0), character(0)))
  ids    <- sub("\\.json$", "", files)
  labels <- paste0("Live session: ", substr(ids, 1L, 8L), "…")
  setNames(ids, labels)
}

#' Load a completed investigation JSON file and map it to the same
#' list structure returned by load_demo_data() so existing render functions
#' work unchanged.
#'
#' @param session_id  Character. The session UUID.
#' @param dir         Directory containing JSON snapshots.
#' @return Named list with: scenario, initial_msg, risk, conversation, investigation
#' @throws If the file does not exist or cannot be parsed.
load_completed_investigation <- function(session_id,
                                         dir = "data/completed_sessions") {
  file_path <- file.path(dir, paste0(session_id, ".json"))
  if (!file.exists(file_path))
    stop("[load_completed_investigation] File not found: ", file_path)

  raw <- tryCatch(
    fromJSON(file_path, simplifyVector = FALSE),
    error = function(e)
      stop("[load_completed_investigation] JSON parse error: ", conditionMessage(e))
  )

  # ── Map risk fields (from alert snapshot) ──
  risk <- list(
    prediction          = raw$prediction          %||% "UNKNOWN",
    model_probability   = raw$model_probability   %||% NA_real_,
    ml_score            = raw$ml_score            %||% NA_real_,
    indicator_score     = raw$indicator_score     %||% NA_integer_,
    risk_score          = raw$risk_score          %||% NA_real_,
    risk_level          = raw$risk_level          %||% "UNKNOWN",
    detected_indicators = raw$detected_indicators %||% list(),
    explanations        = raw$explanations        %||% list(),
    summary_text        = "",
    model_used          = NA_character_,
    caveat              = "Live investigation — original risk assessment from R."
  )

  # ── Map intelligence (from session.intelligence R result) ──
  intel_raw <- raw$intelligence %||% list()
  investigation <- list(
    session_id   = raw$session_id,
    intelligence = intel_raw$intelligence %||% list(),
    behaviour    = intel_raw$behaviour    %||% list(),
    summary      = list(
      n_turns_analysed           = intel_raw$summary$n_turns_analysed           %||% 0L,
      n_entities                 = intel_raw$summary$n_entities                 %||% 0L,
      entity_types               = intel_raw$summary$entity_types               %||% list(),
      n_behaviours               = intel_raw$summary$n_behaviours               %||% 0L,
      behaviour_types            = intel_raw$summary$behaviour_types            %||% list(),
      n_suspicious_request_types = intel_raw$summary$n_suspicious_request_types %||% 0L,
      repeated_requests          = isTRUE(intel_raw$summary$repeated_requests),
      escalation_detected        = isTRUE(intel_raw$summary$escalation_detected),
      statements                 = intel_raw$summary$statements                 %||% list()
    )
  )

  list(
    scenario = list(
      scenario_name = paste0("Live session (", substr(raw$session_id, 1L, 8L), "…)")
    ),
    initial_msg   = raw$initial_message %||% "",
    risk          = risk,
    conversation  = raw$conversation    %||% list(),
    investigation = investigation,
    # Extra live-only fields used by Tab 6 report panel
    session_id    = raw$session_id,
    sender        = raw$sender          %||% "unknown",
    interaction_count = raw$interaction_count %||% 0L,
    stop_reason   = raw$stop_reason     %||% NULL,
    completed_at  = raw$completed_at    %||% NULL
  )
}

# NULL-coalescing operator (R does not have one built-in)
`%||%` <- function(x, y) if (!is.null(x)) x else y
