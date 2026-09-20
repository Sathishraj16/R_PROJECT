# ScamTracer AI — Phase 9 Test Suite
# Intelligence Extraction + Behaviour Analysis
#
# Tests extract_entities() and analyze_behaviour() directly (no running server needed).
#
# Run: Rscript tests/test_intelligence_behaviour.R
# Must be run from E:/R PROJECT (project root).

cat("════════════════════════════════════════════════════════════════\n")
cat("ScamTracer AI — Phase 9 Test Suite: Intelligence + Behaviour\n")
cat("════════════════════════════════════════════════════════════════\n\n")

setwd("E:/R PROJECT")
suppressPackageStartupMessages(library(stringr))

source("R/analysis/behaviour_analyzer.R")
source("R/analysis/intelligence_extractor.R")

pass_count <- 0L
fail_count <- 0L

.check <- function(label, condition, result_val = NULL) {
  status <- if (isTRUE(condition)) {
    pass_count <<- pass_count + 1L
    "PASS"
  } else {
    fail_count <<- fail_count + 1L
    "FAIL"
  }
  val_str <- if (!is.null(result_val)) paste0(" [", result_val, "]") else ""
  cat(sprintf("  [%s] %s%s\n", status, label, val_str))
}

.entities_of_type <- function(entities, type) {
  Filter(function(e) e$entity_type == type, entities)
}

.behaviours_of_type <- function(behaviours, type) {
  Filter(function(b) b$behaviour == type, behaviours)
}

# ── Shared test conversation ──────────────────────────────────────────────────
# Mirrors the hive_demo_scenario.json demo conversation (INCOMING turns only for
# entity/behaviour tests; OUTGOING turns included in full-conversation tests).

.demo_turns <- list(
  list(direction = "INCOMING", text = "Dear customer, this is the security team at FakeSecure Bank. Your account has flagged suspicious activity. Please verify your identity to prevent suspension.", turn = 1L),
  list(direction = "OUTGOING", text = "I need more information before I can proceed. Could you provide official documentation for this request?", turn = 1L),
  list(direction = "INCOMING", text = "To verify your account, please share the 6-digit OTP that was just sent to your registered mobile number.", turn = 2L),
  list(direction = "OUTGOING", text = "Can you explain what official system requires this code?", turn = 2L),
  list(direction = "INCOMING", text = "Your account will be permanently suspended within 30 minutes if you do not provide the OTP. This is your final warning.", turn = 3L),
  list(direction = "OUTGOING", text = "Before I share any code, can you send me the official case reference number?", turn = 3L),
  list(direction = "INCOMING", text = "To confirm ownership, transfer Rs 1 to UPI ID verifyaccount@fakebank. This amount will be refunded immediately.", turn = 4L),
  list(direction = "OUTGOING", text = "Could you provide an official reference number and registered organisation name?", turn = 4L),
  list(direction = "INCOMING", text = "Please click this link to complete the verification process: http://fakesecure-verify.fictional/confirm", turn = 5L),
  list(direction = "OUTGOING", text = "I prefer to navigate to official websites directly.", turn = 5L)
)

.demo_entities   <- extract_entities(.demo_turns)
.demo_behaviours <- analyze_behaviour(.demo_turns)

# ── Case A: Phone number extraction ─────────────────────────────────────────
cat("\n── Case A: Phone number extraction ──\n")
{
  turns <- list(
    list(direction = "INCOMING", text = "Call our helpline at 9876543210 for immediate assistance.", turn = 1L),
    list(direction = "INCOMING", text = "Alternatively dial +91 98765 43210 to speak with our agent.", turn = 2L)
  )
  ents <- extract_entities(turns)
  phones <- .entities_of_type(ents, "PHONE")
  .check("A1  phone entity extracted", length(phones) >= 1L, length(phones))
  .check("A2  entity_type is PHONE",   length(phones) > 0L && phones[[1]]$entity_type == "PHONE")
  .check("A3  provenance turn recorded", length(phones) > 0L && !is.null(phones[[1]]$turn), phones[[1]]$turn)
  .check("A4  source_text preserved",    length(phones) > 0L && nchar(phones[[1]]$source_text) > 0L)
}

# ── Case B: UPI ID extraction ───────────────────────────────────────────────
cat("\n── Case B: UPI ID extraction ──\n")
{
  upis <- .entities_of_type(.demo_entities, "UPI_ID")
  .check("B1  UPI_ID entity found",    length(upis) >= 1L, length(upis))
  .check("B2  entity_type is UPI_ID",  length(upis) > 0L && upis[[1]]$entity_type == "UPI_ID")
  .check("B3  value contains @fakebank", length(upis) > 0L && grepl("@fakebank", upis[[1]]$value))
  .check("B4  provenance turn is 4",   length(upis) > 0L && upis[[1]]$turn == 4L, upis[[1]]$turn)
}

# ── Case C: URL extraction ───────────────────────────────────────────────────
cat("\n── Case C: URL extraction ──\n")
{
  urls <- .entities_of_type(.demo_entities, "URL")
  .check("C1  URL entity found",       length(urls) >= 1L, length(urls))
  .check("C2  entity_type is URL",     length(urls) > 0L && urls[[1]]$entity_type == "URL")
  .check("C3  URL contains http://",   length(urls) > 0L && grepl("^http://", urls[[1]]$value))
  .check("C4  provenance turn is 5",   length(urls) > 0L && urls[[1]]$turn == 5L, urls[[1]]$turn)
}

# ── Case D: Email address extraction ────────────────────────────────────────
cat("\n── Case D: Email address extraction ──\n")
{
  turns <- list(
    list(direction = "INCOMING", text = "Please reply to support@fakeservice.com for further assistance.", turn = 1L)
  )
  ents   <- extract_entities(turns)
  emails <- .entities_of_type(ents, "EMAIL")
  .check("D1  EMAIL entity found",       length(emails) >= 1L, length(emails))
  .check("D2  entity_type is EMAIL",     length(emails) > 0L && emails[[1]]$entity_type == "EMAIL")
  .check("D3  value matches email",      length(emails) > 0L && grepl("@fakeservice\\.com", emails[[1]]$value))
  .check("D4  not classified as UPI_ID", length(.entities_of_type(ents, "UPI_ID")) == 0L)
}

# ── Case E: Bank name extraction ─────────────────────────────────────────────
cat("\n── Case E: Bank name extraction ──\n")
{
  banks <- .entities_of_type(.demo_entities, "BANK_NAME")
  .check("E1  BANK_NAME entity found",   length(banks) >= 1L, length(banks))
  .check("E2  entity_type is BANK_NAME", length(banks) > 0L && banks[[1]]$entity_type == "BANK_NAME")
  .check("E3  value mentions fakesecure bank",
         length(banks) > 0L && grepl("fakesecure", banks[[1]]$value, ignore.case = TRUE))
  # SBI test
  turns_sbi <- list(
    list(direction = "INCOMING", text = "This is SBI fraud prevention. Your account is at risk.", turn = 1L)
  )
  banks_sbi <- .entities_of_type(extract_entities(turns_sbi), "BANK_NAME")
  .check("E4  SBI detected in bank list", length(banks_sbi) >= 1L)
}

# ── Case F: Transaction / reference ID extraction ────────────────────────────
cat("\n── Case F: Transaction / reference ID extraction ──\n")
{
  turns <- list(
    list(direction = "INCOMING", text = "Your refund reference no TXN8812345 has been processed.", turn = 1L),
    list(direction = "INCOMING", text = "Please quote txn id ABC99887 when calling back.", turn = 2L)
  )
  ents <- extract_entities(turns)
  txns <- .entities_of_type(ents, "TRANSACTION_ID")
  .check("F1  TRANSACTION_ID entity found", length(txns) >= 1L, length(txns))
  .check("F2  entity_type is TRANSACTION_ID", length(txns) > 0L && txns[[1]]$entity_type == "TRANSACTION_ID")
  .check("F3  provenance turn recorded", length(txns) > 0L && !is.null(txns[[1]]$turn))
}

# ── Case G: OTP request detection ─────────────────────────────────────────────
cat("\n── Case G: OTP request detection ──\n")
{
  otps <- .entities_of_type(.demo_entities, "OTP_REQUEST")
  .check("G1  OTP_REQUEST entity found",        length(otps) >= 1L, length(otps))
  .check("G2  entity_type is OTP_REQUEST",       length(otps) > 0L && otps[[1]]$entity_type == "OTP_REQUEST")
  .check("G3  detected in OTP turn (turn 2+)",  length(otps) > 0L && any(vapply(otps, function(e) e$turn >= 2L, logical(1L))))
  # Explicit OTP message
  turns_otp <- list(
    list(direction = "INCOMING", text = "Share the OTP we sent to your phone immediately.", turn = 1L)
  )
  otp2 <- .entities_of_type(extract_entities(turns_otp), "OTP_REQUEST")
  .check("G4  explicit 'OTP' phrase detected", length(otp2) >= 1L)
}

# ── Case H: Payment request detection ────────────────────────────────────────
cat("\n── Case H: Payment request detection ──\n")
{
  pays <- .entities_of_type(.demo_entities, "PAYMENT_REQUEST")
  .check("H1  PAYMENT_REQUEST entity found",   length(pays) >= 1L, length(pays))
  .check("H2  entity_type is PAYMENT_REQUEST", length(pays) > 0L && pays[[1]]$entity_type == "PAYMENT_REQUEST")
  .check("H3  detected in payment turn (4)",   length(pays) > 0L && any(vapply(pays, function(e) e$turn == 4L, logical(1L))))
  # Transfer message
  turns_pay <- list(
    list(direction = "INCOMING", text = "Please transfer Rs 500 to account 123456789 now.", turn = 1L)
  )
  pay2 <- .entities_of_type(extract_entities(turns_pay), "PAYMENT_REQUEST")
  .check("H4  'transfer' keyword detected", length(pay2) >= 1L)
}

# ── Case I: Credential request detection ─────────────────────────────────────
cat("\n── Case I: Credential request detection ──\n")
{
  turns_cred <- list(
    list(direction = "INCOMING", text = "Please provide your ATM PIN and net banking password to verify.", turn = 1L)
  )
  ents_cred <- extract_entities(turns_cred)
  creds <- .entities_of_type(ents_cred, "CREDENTIAL_REQUEST")
  .check("I1  CREDENTIAL_REQUEST entity found",   length(creds) >= 1L, length(creds))
  .check("I2  entity_type is CREDENTIAL_REQUEST",  length(creds) > 0L && creds[[1]]$entity_type == "CREDENTIAL_REQUEST")
  .check("I3  provenance turn is 1",               length(creds) > 0L && creds[[1]]$turn == 1L)
}

# ── Case J: Urgency detection ─────────────────────────────────────────────────
cat("\n── Case J: Urgency detection ──\n")
{
  urgency <- .behaviours_of_type(.demo_behaviours, "URGENCY")
  .check("J1  URGENCY behaviour found",   length(urgency) >= 1L, length(urgency))
  .check("J2  behaviour is URGENCY",      length(urgency) > 0L && urgency[[1]]$behaviour == "URGENCY")
  .check("J3  severity is HIGH",          length(urgency) > 0L && urgency[[1]]$severity == "HIGH")
  .check("J4  evidence is non-empty",     length(urgency) > 0L && nchar(urgency[[1]]$evidence) > 0L, urgency[[1]]$evidence)
}

# ── Case K: Threat detection ─────────────────────────────────────────────────
cat("\n── Case K: Account suspension / threat detection ──\n")
{
  threats <- .behaviours_of_type(.demo_behaviours, "THREAT")
  .check("K1  THREAT behaviour found",  length(threats) >= 1L, length(threats))
  .check("K2  behaviour is THREAT",     length(threats) > 0L && threats[[1]]$behaviour == "THREAT")
  .check("K3  severity is HIGH",        length(threats) > 0L && threats[[1]]$severity == "HIGH")
  .check("K4  evidence is non-empty",   length(threats) > 0L && nchar(threats[[1]]$evidence) > 0L)
}

# ── Case L: Impersonation detection ──────────────────────────────────────────
cat("\n── Case L: Impersonation detection ──\n")
{
  impers <- .behaviours_of_type(.demo_behaviours, "IMPERSONATION")
  .check("L1  IMPERSONATION behaviour found",  length(impers) >= 1L, length(impers))
  .check("L2  behaviour is IMPERSONATION",     length(impers) > 0L && impers[[1]]$behaviour == "IMPERSONATION")
  .check("L3  severity is HIGH",               length(impers) > 0L && impers[[1]]$severity == "HIGH")
  # Explicit impersonation test
  turns_imp <- list(
    list(direction = "INCOMING", text = "This is the fraud team calling from SBI regarding your account.", turn = 1L)
  )
  impers2 <- .behaviours_of_type(analyze_behaviour(turns_imp), "IMPERSONATION")
  .check("L4  'fraud team from SBI' triggers IMPERSONATION", length(impers2) >= 1L)
}

# ── Case M: Repeated request detection ───────────────────────────────────────
cat("\n── Case M: Repeated request detection ──\n")
{
  repeated <- .behaviours_of_type(.demo_behaviours, "REPEATED_REQUEST")
  .check("M1  REPEATED_REQUEST behaviour found",  length(repeated) >= 1L, length(repeated))
  .check("M2  behaviour is REPEATED_REQUEST",     length(repeated) > 0L && repeated[[1]]$behaviour == "REPEATED_REQUEST")
  .check("M3  severity is MEDIUM",                length(repeated) > 0L && repeated[[1]]$severity == "MEDIUM")
  # Verify OTP appears in repeated list
  otp_repeated <- Filter(function(b) b$behaviour == "REPEATED_REQUEST" && grepl("otp", tolower(b$description)), .demo_behaviours)
  .check("M4  OTP specifically flagged as repeated", length(otp_repeated) >= 1L)
}

# ── Case N: Escalation detection ─────────────────────────────────────────────
cat("\n── Case N: Escalation detection ──\n")
{
  escalation <- .behaviours_of_type(.demo_behaviours, "ESCALATION")
  .check("N1  ESCALATION behaviour found",   length(escalation) >= 1L, length(escalation))
  .check("N2  behaviour is ESCALATION",      length(escalation) > 0L && escalation[[1]]$behaviour == "ESCALATION")
  .check("N3  severity is HIGH",             length(escalation) > 0L && escalation[[1]]$severity == "HIGH")
  .check("N4  evidence mentions rank increase", length(escalation) > 0L && grepl("rank", escalation[[1]]$evidence, ignore.case = TRUE))
}

# ── Case O: Empty conversation handling ──────────────────────────────────────
cat("\n── Case O: Empty conversation handling ──\n")
{
  empty_ents <- extract_entities(list())
  empty_behs <- analyze_behaviour(list())
  .check("O1  extract_entities(empty) returns list",  is.list(empty_ents))
  .check("O2  extract_entities(empty) length is 0",   length(empty_ents) == 0L, length(empty_ents))
  .check("O3  analyze_behaviour(empty) returns list", is.list(empty_behs))
  .check("O4  analyze_behaviour(empty) length is 0",  length(empty_behs) == 0L, length(empty_behs))
}

# ── Case P: Missing / null text handling ─────────────────────────────────────
cat("\n── Case P: Missing / null text handling ──\n")
{
  turns_null <- list(
    list(direction = "INCOMING", text = NULL,  turn = 1L),
    list(direction = "INCOMING", text = "   ", turn = 2L),
    list(direction = "INCOMING", text = "Please share your OTP.", turn = 3L)
  )
  ents_p <- extract_entities(turns_null)
  behs_p <- analyze_behaviour(turns_null)
  .check("P1  null text turn skipped — no crash",     is.list(ents_p))
  .check("P2  whitespace text turn skipped — no crash", is.list(behs_p))
  .check("P3  valid turn still extracted",             length(.entities_of_type(ents_p, "OTP_REQUEST")) >= 1L)
}

# ── Case Q: No fabricated entities ───────────────────────────────────────────
cat("\n── Case Q: No fabricated entities ──\n")
{
  # A benign message with no indicators
  turns_benign <- list(
    list(direction = "INCOMING", text = "Hello, how are you doing today? Let's meet tomorrow.", turn = 1L)
  )
  ents_q <- extract_entities(turns_benign)
  behs_q <- analyze_behaviour(turns_benign)
  .check("Q1  benign message: 0 OTP_REQUEST entities",        length(.entities_of_type(ents_q, "OTP_REQUEST")) == 0L)
  .check("Q2  benign message: 0 PAYMENT_REQUEST entities",    length(.entities_of_type(ents_q, "PAYMENT_REQUEST")) == 0L)
  .check("Q3  benign message: 0 CREDENTIAL_REQUEST entities", length(.entities_of_type(ents_q, "CREDENTIAL_REQUEST")) == 0L)
  .check("Q4  benign message: 0 URGENCY behaviours",          length(.behaviours_of_type(behs_q, "URGENCY")) == 0L)
  .check("Q5  benign message: 0 THREAT behaviours",           length(.behaviours_of_type(behs_q, "THREAT")) == 0L)
}

# ── Case R: Provenance / source turn preserved ────────────────────────────────
cat("\n── Case R: Provenance / source turn preserved ──\n")
{
  # Every entity must have entity_type, value, source_text, turn, direction
  all_valid <- all(vapply(.demo_entities, function(e) {
    !is.null(e$entity_type)  && nchar(e$entity_type) > 0L &&
    !is.null(e$value)        && nchar(e$value) > 0L &&
    !is.null(e$source_text)  && nchar(e$source_text) > 0L &&
    !is.null(e$turn)         && is.integer(e$turn) &&
    !is.null(e$direction)    && nchar(e$direction) > 0L
  }, logical(1L)))
  .check("R1  all entities have required provenance fields", all_valid)

  # All behaviour records must have behaviour, description, evidence, turn, severity
  all_beh_valid <- all(vapply(.demo_behaviours, function(b) {
    !is.null(b$behaviour)    && nchar(b$behaviour) > 0L &&
    !is.null(b$description)  && nchar(b$description) > 0L &&
    !is.null(b$evidence)     && nchar(b$evidence) > 0L &&
    !is.null(b$turn)         && is.integer(b$turn) &&
    !is.null(b$severity)     && nchar(b$severity) > 0L
  }, logical(1L)))
  .check("R2  all behaviour records have required fields", all_beh_valid)

  # Entities extracted from turn N must have turn == N
  url_ent <- .entities_of_type(.demo_entities, "URL")
  .check("R3  URL entity turn matches source (turn 5)", length(url_ent) > 0L && url_ent[[1]]$turn == 5L)

  upi_ent <- .entities_of_type(.demo_entities, "UPI_ID")
  .check("R4  UPI entity turn matches source (turn 4)", length(upi_ent) > 0L && upi_ent[[1]]$turn == 4L)
}

# ── investigate_session() integration test ────────────────────────────────────
cat("\n── Full investigation (investigate_session) ──\n")
{
  inv <- investigate_session("test-session-001", .demo_turns)
  .check("S1  session_id preserved", inv$session_id == "test-session-001")
  .check("S2  intelligence is list", is.list(inv$intelligence))
  .check("S3  behaviour is list",    is.list(inv$behaviour))
  .check("S4  summary present",      is.list(inv$summary))
  .check("S5  n_entities > 0",       inv$summary$n_entities > 0L, inv$summary$n_entities)
  .check("S6  n_behaviours > 0",     inv$summary$n_behaviours > 0L, inv$summary$n_behaviours)
  .check("S7  statements present",   length(inv$summary$statements) > 0L)
  .check("S8  repeated_requests TRUE", isTRUE(inv$summary$repeated_requests))
  .check("S9  escalation_detected TRUE", isTRUE(inv$summary$escalation_detected))
  cat("\n  Sample statements from investigation:\n")
  for (stmt in head(inv$summary$statements, 5L)) {
    cat(sprintf("    - %s\n", stmt))
  }
}

# ── Results ───────────────────────────────────────────────────────────────────
cat("\n════════════════════════════════════════════════════════════════\n")
cat(sprintf("PHASE 9 TEST SUMMARY: %d / %d passed  (%d failed)\n",
            pass_count, pass_count + fail_count, fail_count))
cat("════════════════════════════════════════════════════════════════\n")

if (fail_count > 0L) {
  cat("SOME CHECKS FAILED.\n")
  quit(status = 1L)
} else {
  cat("ALL CHECKS PASSED.\n")
  quit(status = 0L)
}
