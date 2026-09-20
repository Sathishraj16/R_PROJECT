# ScamTracer AI — Behaviour Analysis Engine
# Phase 9
#
# Analyses observable scam behaviour patterns in a H.I.V.E. conversation.
# Produces structured, explainable behaviour records with evidence.
#
# IMPORTANT SCOPE LIMITS:
#   - Analyses observable text patterns only.
#   - Does NOT infer psychological characteristics.
#   - Does NOT claim to identify a specific individual.
#   - Does NOT assert that a person is definitely a scammer.
#
# Usage:
#   source("R/analysis/behaviour_analyzer.R")
#   behaviours <- analyze_behaviour(conversation)
#
# The `conversation` argument is a list of turn objects, each with fields:
#   direction : "INCOMING" or "OUTGOING"
#   text      : message text (character)
#   turn      : integer turn number (1-indexed)

suppressPackageStartupMessages(library(stringr))

# ── Behaviour patterns ────────────────────────────────────────────────────────

# Urgency / time pressure language
.B_PAT_URGENCY <- paste0(
  "\\b(?:immediately|urgent(?:ly)?|right now|without delay|today only",
  "|within [0-9]|hurry|expire[sd]?|last chance",
  "|final (?:warning|notice)|do not delay|deadline",
  "|as soon as possible|asap)\\b"
)

# Account suspension / blocking threats
.B_PAT_THREAT <- paste0(
  "\\b(?:suspend(?:ed|ing)?|block(?:ed|ing)?|freeze[sd]?|freezing",
  "|deactivat(?:e[sd]?|ing|ion)|terminat(?:e[sd]?|ing|ion)",
  "|clos(?:ed|ing)|permanently[[:space:]](?:suspend|block|close|deactivat)",
  "|legal action|police|report(?:ed)?)\\b"
)

# Impersonation of an organisation or authority
.B_PAT_IMPERSONATE <- paste0(
  "\\b(?:security[[:space:]]team|fraud[[:space:]](?:team|department)",
  "|verification[[:space:]](?:team|department)",
  "|customer[[:space:]](?:care|support|service)[[:space:]](?:team|department|executive)",
  "|(?:this is|from|calling from|on behalf of|representative of)[[:space:]]",
  "(?:the[[:space:]])?(?:sbi|hdfc|icici|axis|kotak|pnb|rbi|reserve bank",
  "|government|police|telecom|airtel|jio|bsnl|paytm|bank))\\b"
)

# OTP / one-time code solicitation
.B_PAT_OTP <- paste0(
  "\\b(?:otp|one[[:space:]\\-]?time[[:space:]](?:password|code|pin)",
  "|[0-9]?[[:space:]]?6[[:space:]\\-]?digit|passcode",
  "|verification[[:space:]]code)\\b"
)

# Payment / money transfer request
.B_PAT_PAYMENT <- paste0(
  "\\b(?:transfer|send[[:space:]](?:money|funds?|amount|rs\\.?|inr)",
  "|pay(?:ment)?|neft|imps|upi[[:space:]]id|deposit|deduct|debit)\\b"
)

# Credential / password / PIN request
.B_PAT_CREDENTIAL <- paste0(
  "\\b(?:password|your[[:space:]]pin|login[[:space:]](?:id|password)",
  "|cvv|debit[[:space:]]card[[:space:]](?:number|no)|card[[:space:]](?:number|no\\.?|details)",
  "|net[[:space:]]banking[[:space:]](?:id|password)|atm[[:space:]]pin)\\b"
)

# ── Helpers ───────────────────────────────────────────────────────────────────

.b_matches <- function(text, pattern) {
  str_detect(text, regex(pattern, ignore_case = TRUE))
}

.b_evidence <- function(text, pattern, max_chars = 80) {
  m <- str_extract(text, regex(pattern, ignore_case = TRUE))
  if (is.na(m) || is.null(m)) return(substr(trimws(text), 1L, max_chars))
  trimws(m)
}

# ── Escalation rank ───────────────────────────────────────────────────────────
# Assigns an integer severity rank to a turn based on its content.
# Higher rank = more sensitive / intrusive request.
# Used to detect escalation (increasing rank across turns).
#
#   1 = impersonation only
#   2 = urgency
#   3 = threat (account suspension)
#   4 = OTP solicitation
#   5 = credential request
#   6 = payment request

.escalation_rank <- function(text) {
  rank <- 0L
  if (.b_matches(text, .B_PAT_IMPERSONATE))  rank <- max(rank, 1L)
  if (.b_matches(text, .B_PAT_URGENCY))      rank <- max(rank, 2L)
  if (.b_matches(text, .B_PAT_THREAT))       rank <- max(rank, 3L)
  if (.b_matches(text, .B_PAT_OTP))          rank <- max(rank, 4L)
  if (.b_matches(text, .B_PAT_CREDENTIAL))   rank <- max(rank, 5L)
  if (.b_matches(text, .B_PAT_PAYMENT))      rank <- max(rank, 6L)
  rank
}

# ── Main function ─────────────────────────────────────────────────────────────

#' Analyse observable scam behaviour patterns in a conversation.
#'
#' Only INCOMING turns (scammer messages) are analysed.
#'
#' @param conversation A list of turn objects. Each turn must have:
#'   direction : "INCOMING" or "OUTGOING"
#'   text      : message text
#'   turn      : integer turn number
#'
#' @return A list of behaviour records. Each record is a named list:
#'   behaviour   : character — behaviour type (URGENCY, THREAT, IMPERSONATION,
#'                 OTP_SOLICITATION, PAYMENT_REQUEST, CREDENTIAL_REQUEST,
#'                 REPEATED_REQUEST, ESCALATION)
#'   description : character — human-readable label
#'   evidence    : character — text fragment that triggered the detection
#'   turn        : integer — first turn where this was observed
#'   severity    : character — HIGH / MEDIUM
analyze_behaviour <- function(conversation) {
  if (length(conversation) == 0) return(list())

  # Work with INCOMING turns only (scammer messages)
  incoming <- Filter(function(t) {
    !is.null(t$direction) && identical(as.character(t$direction), "INCOMING")
  }, conversation)

  if (length(incoming) == 0) return(list())

  behaviours    <- list()
  # Tracks which turns each behaviour category appeared in (for repeated-request detection)
  category_turns <- list()

  for (i in seq_along(incoming)) {
    t       <- incoming[[i]]
    text    <- if (!is.null(t$text)) as.character(t$text) else NA_character_
    turn_no <- if (!is.null(t$turn) && !is.na(t$turn)) as.integer(t$turn) else as.integer(i)

    if (is.na(text) || nchar(trimws(text)) == 0L) next

    .record <- function(btype, desc, pat) {
      ev <- .b_evidence(text, pat)
      behaviours <<- c(behaviours, list(list(
        behaviour   = btype,
        description = desc,
        evidence    = ev,
        turn        = turn_no,
        severity    = "HIGH"
      )))
      category_turns[[btype]] <<- c(category_turns[[btype]], turn_no)
    }

    if (.b_matches(text, .B_PAT_URGENCY))     .record("URGENCY",            "Urgency / time pressure",                          .B_PAT_URGENCY)
    if (.b_matches(text, .B_PAT_THREAT))      .record("THREAT",             "Account suspension / blocking threat",              .B_PAT_THREAT)
    if (.b_matches(text, .B_PAT_IMPERSONATE)) .record("IMPERSONATION",      "Impersonation of organisation or authority",        .B_PAT_IMPERSONATE)
    if (.b_matches(text, .B_PAT_OTP))         .record("OTP_SOLICITATION",   "OTP / one-time code solicitation",                 .B_PAT_OTP)
    if (.b_matches(text, .B_PAT_PAYMENT))     .record("PAYMENT_REQUEST",    "Payment or fund transfer request",                  .B_PAT_PAYMENT)
    if (.b_matches(text, .B_PAT_CREDENTIAL))  .record("CREDENTIAL_REQUEST", "Password / PIN / credential request",               .B_PAT_CREDENTIAL)
  }

  # ── Repeated requests ──────────────────────────────────────────────────────
  for (cat in unique(names(category_turns))) {
    turns_for_cat <- unique(category_turns[[cat]])
    if (length(turns_for_cat) >= 2L) {
      behaviours <- c(behaviours, list(list(
        behaviour   = "REPEATED_REQUEST",
        description = paste0(
          "Repeated ", tolower(gsub("_", " ", cat)),
          " in turns: ", paste(sort(turns_for_cat), collapse = ", ")
        ),
        evidence    = paste0("Category '", cat, "' observed in turns: ",
                             paste(sort(turns_for_cat), collapse = ", ")),
        turn        = min(turns_for_cat),
        severity    = "MEDIUM"
      )))
    }
  }

  # ── Escalation ────────────────────────────────────────────────────────────
  # Collect (turn, rank) for all incoming turns with rank > 0
  ranked <- Filter(Negate(is.null), lapply(incoming, function(t) {
    text    <- if (!is.null(t$text)) as.character(t$text) else NA_character_
    turn_no <- if (!is.null(t$turn) && !is.na(t$turn)) as.integer(t$turn) else NA_integer_
    if (is.na(text) || nchar(trimws(text)) == 0L) return(NULL)
    r <- .escalation_rank(text)
    if (r > 0L) list(turn = turn_no, rank = r) else NULL
  }))

  if (length(ranked) >= 2L) {
    ranks      <- vapply(ranked, function(x) x$rank, integer(1L))
    first_rank <- ranks[1L]
    max_later  <- max(ranks[-1L])
    if (max_later > first_rank) {
      first_turn <- ranked[[1L]]$turn
      last_turn  <- ranked[[length(ranked)]]$turn
      behaviours <- c(behaviours, list(list(
        behaviour   = "ESCALATION",
        description = paste0("Escalating pattern from turn ", first_turn, " to turn ", last_turn),
        evidence    = paste0(
          "Sensitivity rank increased from ", first_rank,
          " to ", max_later,
          " across ", length(ranked), " turns"
        ),
        turn        = first_rank,   # using rank in turn field intentionally for escalation
        severity    = "HIGH"
      )))
      # Fix: use first turn number for the escalation record
      behaviours[[length(behaviours)]]$turn <- first_turn
    }
  }

  behaviours
}
