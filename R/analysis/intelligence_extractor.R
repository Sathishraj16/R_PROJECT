# ScamTracer AI — Intelligence Extraction Engine
# Phase 9
#
# Extracts observable entities from H.I.V.E. conversation turns.
# Every extracted item preserves provenance (source text + turn number).
#
# IMPORTANT:
#   - Only extracts information ACTUALLY PRESENT in the conversation.
#   - Never invents or fabricates intelligence.
#   - Does NOT resolve entities across conversations.
#   - Does NOT claim entity ownership or identity.
#
# Functions:
#   extract_entities(conversation)              — entity extraction
#   investigate_session(session_id, conversation) — full investigation summary
#
# investigate_session() sources behaviour_analyzer.R automatically.
#
# Usage (standalone):
#   source("R/analysis/intelligence_extractor.R")
#   entities <- extract_entities(conversation)
#
# Usage (investigation):
#   source("R/analysis/intelligence_extractor.R")
#   result <- investigate_session("session-uuid", conversation)

suppressPackageStartupMessages(library(stringr))

# ── Entity patterns ───────────────────────────────────────────────────────────

# Indian mobile numbers (10 digits starting 6-9) and common international formats
.E_PAT_PHONE <- paste0(
  "(?:\\+91[[:space:]\\-]?|0091[[:space:]\\-]?|\\b91[[:space:]\\-]?)?",
  "[6-9][0-9]{9}\\b",
  "|\\b[0-9]{5}[[:space:]\\-][0-9]{5}\\b",   # 5+5 digit format
  "|\\+[0-9]{1,3}[[:space:]\\-][0-9]{6,12}\\b"  # generic international
)

# UPI ID pattern (username@bank — no TLD)
.E_PAT_UPI <- "[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+"

# Email: same base pattern but requires a dot + TLD after the domain
.E_PAT_EMAIL <- "[A-Za-z0-9._%+\\-]+@[A-Za-z0-9.\\-]+\\.[A-Za-z]{2,}"

# URLs
.E_PAT_URL <- "https?://[A-Za-z0-9._/\\-?&=%#@+]+"

# Transaction / reference ID — "ref no TXN12345", "txn id A1B2C3"
# The ID token requires at least one digit. This prevents plain English words
# such as "reference", "number", or "identifier" from being matched as IDs
# even when the regex is applied with ignore_case = TRUE.
.E_PAT_TXNID <- paste0(
  "(?:ref(?:erence)?|txn|transaction|ticket)",
  "[[:space:]]?(?:no\\.?|id|number|#)?[[:space:]#:]*",
  "([A-Z0-9]*[0-9][A-Z0-9]{4,19})"
)

# OTP solicitation language
.E_PAT_OTP <- paste0(
  "\\b(?:otp|one[[:space:]\\-]?time[[:space:]](?:password|code|pin)",
  "|6[[:space:]\\-]?digit[[:space:]](?:code|otp|pin|number)",
  "|passcode|verification[[:space:]]code)\\b"
)

# Payment / transfer request language
.E_PAT_PAYMENT <- paste0(
  "\\b(?:transfer|send[[:space:]](?:money|funds?|amount|rs\\.?|inr)",
  "|pay(?:ment)?|neft|imps|upi[[:space:]]id|deposit|deduct|debit)\\b"
)

# Credential / PIN / password request language
.E_PAT_CRED <- paste0(
  "\\b(?:password|your[[:space:]]pin|login[[:space:]](?:id|password)",
  "|cvv|debit[[:space:]]card[[:space:]](?:number|no)|card[[:space:]](?:number|no\\.?|details)",
  "|net[[:space:]]banking[[:space:]](?:id|password)|atm[[:space:]]pin)\\b"
)

# Known bank name fragments (lowercase, for fixed-string matching).
# This is a curated list for academic demonstration only.
# Does NOT claim to be exhaustive.
.KNOWN_BANKS <- c(
  "state bank", "sbi",
  "hdfc bank", "hdfc",
  "icici bank", "icici",
  "axis bank",
  "kotak mahindra", "kotak bank",
  "punjab national", "pnb",
  "bank of baroda",
  "canara bank",
  "union bank",
  "yes bank",
  "idbi bank",
  "rbi", "reserve bank of india",
  "federal bank",
  "indusind bank",
  "bandhan bank",
  "paytm payments bank",
  "airtel payments bank",
  "fakesecure bank"   # fictional — demo only
)

# ── Helpers ───────────────────────────────────────────────────────────────────

.e_extract_all <- function(text, pattern) {
  m <- str_extract_all(text, regex(pattern, ignore_case = TRUE))[[1]]
  m[!is.na(m) & nchar(trimws(m)) > 0L]
}

.e_matches <- function(text, pattern) {
  isTRUE(str_detect(text, regex(pattern, ignore_case = TRUE)))
}

.make_entity <- function(etype, value, source_text, turn_no, direction) {
  list(
    entity_type = etype,
    value       = as.character(value),
    source_text = as.character(source_text),
    turn        = as.integer(turn_no),
    direction   = as.character(direction)
  )
}

# ── Main extraction function ──────────────────────────────────────────────────

#' Extract intelligence entities from a conversation.
#'
#' @param conversation A list of turns. Each turn must have:
#'   direction : "INCOMING" or "OUTGOING"
#'   text      : message text
#'   turn      : integer turn number (1-indexed)
#'
#' @return A list of entity records. Each entity is a named list:
#'   entity_type : PHONE | UPI_ID | URL | EMAIL | BANK_NAME |
#'                 TRANSACTION_ID | OTP_REQUEST | PAYMENT_REQUEST |
#'                 CREDENTIAL_REQUEST
#'   value       : extracted value or short evidence phrase
#'   source_text : full message text the entity was found in
#'   turn        : turn number
#'   direction   : INCOMING or OUTGOING
#'
#' SAFETY GUARANTEE:
#'   This function extracts only what is present in the conversation text.
#'   It never fabricates entities.
extract_entities <- function(conversation) {
  if (length(conversation) == 0L) return(list())

  entities <- list()

  for (i in seq_along(conversation)) {
    t       <- conversation[[i]]
    text    <- if (!is.null(t$text)) as.character(t$text) else NA_character_
    turn_no <- if (!is.null(t$turn) && !is.na(t$turn)) as.integer(t$turn) else as.integer(i)
    dir     <- if (!is.null(t$direction)) as.character(t$direction) else "UNKNOWN"

    if (is.na(text) || nchar(trimws(text)) == 0L) next

    # ── Phone numbers ────────────────────────────────────────────────────────
    phones <- .e_extract_all(text, .E_PAT_PHONE)
    for (p in phones) {
      clean <- gsub("[[:space:]\\-\\+]", "", p)
      # Require at least 7 digits to reduce false positives
      if (nchar(clean) >= 7L) {
        entities <- c(entities, list(.make_entity("PHONE", trimws(p), text, turn_no, dir)))
      }
    }

    # ── UPI IDs vs email addresses ───────────────────────────────────────────
    # Extract everything matching the base UPI/email pattern
    upi_cands <- .e_extract_all(text, .E_PAT_UPI)
    for (u in upi_cands) {
      # Strip trailing sentence punctuation that the regex may have captured
      u_clean <- str_remove(u, "[.,:;!?]+$")
      # If it matches the full email pattern (has TLD), classify as EMAIL
      is_email <- str_detect(u_clean, regex(.E_PAT_EMAIL, ignore_case = TRUE))
      if (isTRUE(is_email)) {
        entities <- c(entities, list(.make_entity("EMAIL", u_clean, text, turn_no, dir)))
      } else {
        entities <- c(entities, list(.make_entity("UPI_ID", u_clean, text, turn_no, dir)))
      }
    }

    # ── URLs ─────────────────────────────────────────────────────────────────
    urls <- .e_extract_all(text, .E_PAT_URL)
    for (url in urls) {
      entities <- c(entities, list(.make_entity("URL", url, text, turn_no, dir)))
    }

    # ── Bank names ───────────────────────────────────────────────────────────
    text_lower <- tolower(text)
    for (bank in .KNOWN_BANKS) {
      if (grepl(bank, text_lower, fixed = TRUE)) {
        entities <- c(entities, list(.make_entity("BANK_NAME", bank, text, turn_no, dir)))
        break  # record at most one bank mention per turn
      }
    }

    # ── Transaction / reference IDs ──────────────────────────────────────────
    txn_matches <- str_extract_all(text, regex(.E_PAT_TXNID, ignore_case = TRUE))[[1]]
    for (tid in txn_matches) {
      entities <- c(entities, list(.make_entity("TRANSACTION_ID", trimws(tid), text, turn_no, dir)))
    }

    # ── OTP request ──────────────────────────────────────────────────────────
    if (.e_matches(text, .E_PAT_OTP)) {
      ev <- str_extract(text, regex(.E_PAT_OTP, ignore_case = TRUE))
      entities <- c(entities, list(.make_entity(
        "OTP_REQUEST",
        paste0("OTP solicitation: \"", trimws(ev), "\""),
        text, turn_no, dir
      )))
    }

    # ── Payment request ──────────────────────────────────────────────────────
    if (.e_matches(text, .E_PAT_PAYMENT)) {
      ev <- str_extract(text, regex(.E_PAT_PAYMENT, ignore_case = TRUE))
      entities <- c(entities, list(.make_entity(
        "PAYMENT_REQUEST",
        paste0("Payment request: \"", trimws(ev), "\""),
        text, turn_no, dir
      )))
    }

    # ── Credential request ───────────────────────────────────────────────────
    if (.e_matches(text, .E_PAT_CRED)) {
      ev <- str_extract(text, regex(.E_PAT_CRED, ignore_case = TRUE))
      entities <- c(entities, list(.make_entity(
        "CREDENTIAL_REQUEST",
        paste0("Credential request: \"", trimws(ev), "\""),
        text, turn_no, dir
      )))
    }
  }

  entities
}

# ── Investigation summary ─────────────────────────────────────────────────────

#' Run a full intelligence investigation on a H.I.V.E. session conversation.
#'
#' Sources R/analysis/behaviour_analyzer.R automatically if not already loaded.
#'
#' @param session_id Character. The session identifier (for provenance only).
#' @param conversation A list of turns (see extract_entities for format).
#'
#' @return A named list with fields:
#'   session_id   : character
#'   intelligence : list of entity records
#'   behaviour    : list of behaviour records
#'   summary      : named list with factual statements and counts
#'
#' The summary statements use cautious, factual language:
#'   "Observed OTP solicitation" — not "this person is a scammer".
investigate_session <- function(session_id, conversation) {
  if (!exists("analyze_behaviour", mode = "function")) {
    ba_path <- "R/analysis/behaviour_analyzer.R"
    if (!file.exists(ba_path)) stop("[investigate_session] behaviour_analyzer.R not found: ", ba_path)
    source(ba_path, local = environment())
  }

  entities   <- extract_entities(conversation)
  behaviours <- analyze_behaviour(conversation)

  # Compute derived counts
  entity_types    <- if (length(entities) > 0L)   unique(vapply(entities,   function(e) e$entity_type, character(1L))) else character(0L)
  behaviour_types <- if (length(behaviours) > 0L) unique(vapply(behaviours, function(b) b$behaviour,   character(1L))) else character(0L)

  n_incoming <- sum(vapply(conversation, function(t) {
    !is.null(t$direction) && identical(as.character(t$direction), "INCOMING")
  }, logical(1L)))

  has_repeated   <- "REPEATED_REQUEST" %in% behaviour_types
  has_escalation <- "ESCALATION"       %in% behaviour_types

  n_suspicious_req <- sum(entity_types %in% c("OTP_REQUEST", "PAYMENT_REQUEST", "CREDENTIAL_REQUEST"))

  # Build factual summary statements
  statements <- character(0L)

  # Entity-based statements
  for (et in entity_types) {
    n <- sum(vapply(entities, function(e) e$entity_type == et, logical(1L)))
    stmt <- switch(et,
      PHONE              = paste0("Observed ", n, " phone number(s)."),
      UPI_ID             = paste0("Observed ", n, " UPI ID(s)."),
      URL                = paste0("Observed ", n, " URL(s)."),
      EMAIL              = paste0("Observed ", n, " email address(es)."),
      BANK_NAME          = paste0("Observed ", n, " bank name mention(s)."),
      TRANSACTION_ID     = paste0("Observed ", n, " transaction / reference ID(s)."),
      OTP_REQUEST        = paste0("Observed OTP solicitation in ", n, " turn(s)."),
      PAYMENT_REQUEST    = paste0("Observed payment / transfer request in ", n, " turn(s)."),
      CREDENTIAL_REQUEST = paste0("Observed credential / PIN request in ", n, " turn(s)."),
      paste0("Observed ", et, " (", n, " instance(s)).")
    )
    statements <- c(statements, stmt)
  }

  # Behaviour-based statements (exclude meta-behaviours handled separately)
  for (bt in setdiff(behaviour_types, c("REPEATED_REQUEST", "ESCALATION"))) {
    n <- sum(vapply(behaviours, function(b) b$behaviour == bt, logical(1L)))
    stmt <- switch(bt,
      URGENCY            = paste0("Observed urgency / time pressure in ", n, " turn(s)."),
      THREAT             = paste0("Observed account suspension or blocking threat in ", n, " turn(s)."),
      IMPERSONATION      = "Observed impersonation of an organisation or authority.",
      OTP_SOLICITATION   = paste0("Observed OTP solicitation behaviour in ", n, " turn(s)."),
      PAYMENT_REQUEST    = paste0("Observed payment request behaviour in ", n, " turn(s)."),
      CREDENTIAL_REQUEST = paste0("Observed credential request behaviour in ", n, " turn(s)."),
      paste0("Observed ", gsub("_", " ", tolower(bt)), " behaviour.")
    )
    statements <- c(statements, stmt)
  }

  if (has_repeated)   statements <- c(statements, "Observed repeated requests of the same category across multiple turns.")
  if (has_escalation) statements <- c(statements, "Observed escalating pattern: sensitivity of requests increased across turns.")

  if (length(statements) == 0L) {
    statements <- "No significant intelligence indicators observed in this conversation."
  }

  list(
    session_id   = as.character(session_id),
    intelligence = entities,
    behaviour    = behaviours,
    summary      = list(
      n_turns_analysed     = as.integer(n_incoming),
      n_entities           = as.integer(length(entities)),
      entity_types         = entity_types,
      n_behaviours         = as.integer(length(behaviours)),
      behaviour_types      = behaviour_types,
      n_suspicious_request_types = as.integer(n_suspicious_req),
      repeated_requests    = isTRUE(has_repeated),
      escalation_detected  = isTRUE(has_escalation),
      statements           = as.list(statements)
    )
  )
}
