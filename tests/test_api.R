# ScamTracer AI — Plumber API Test Suite
# Phase 5 verification: tests/test_api.R
#
# Requires: Plumber API server running on port 8000.
# Start the server first (from project root):
#   Rscript -e "pr <- plumber::plumb('R/api/plumber.R'); pr$run(host='0.0.0.0', port=8000)"
#
# Then run this test (from project root):
#   Rscript tests/test_api.R
#
# Tests:
#   1. GET /health — HTTP 200, valid JSON, model_loaded = TRUE
#   2. POST /analyze — valid scam message — HTTP 200, HIGH risk
#   3. POST /analyze — normal message — HTTP 200, LOW risk
#   4. POST /analyze — empty string — HTTP 200, UNKNOWN
#   5. POST /analyze — missing message field — HTTP 400
#   6. POST /analyze — null message — HTTP 400
#   7. POST /analyze — wrong type (number) — HTTP 400
#   8. POST /analyze — empty body — HTTP 400
#   9. API survives multiple bad requests (does not crash)
#  10. Response structure matches expected schema

suppressPackageStartupMessages(library(curl))
suppressPackageStartupMessages(library(jsonlite))

BASE_URL <- "http://127.0.0.1:8000"

# ─────────────────────────────────────────────────────────────────────────────
# Test helpers
# ─────────────────────────────────────────────────────────────────────────────
pass_count <- 0L
fail_count <- 0L

.check <- function(label, condition, detail = NULL) {
  status <- if (isTRUE(condition)) {
    pass_count <<- pass_count + 1L; "PASS"
  } else {
    fail_count <<- fail_count + 1L; "FAIL"
  }
  detail_str <- if (!is.null(detail)) paste0(" [", detail, "]") else ""
  cat(sprintf("  [%s] %s%s\n", status, label, detail_str))
}

.http_get <- function(path) {
  h    <- new_handle()
  resp <- tryCatch(
    curl_fetch_memory(paste0(BASE_URL, path), handle = h),
    error = function(e) list(status_code = 0L, content = chartr("x","x",""), error = conditionMessage(e))
  )
  body <- if (is.raw(resp$content)) rawToChar(resp$content) else ""
  list(
    status  = resp$status_code,
    body    = body,
    parsed  = tryCatch(fromJSON(body, simplifyVector = FALSE), error = function(e) NULL)
  )
}

.http_post <- function(path, json_body) {
  h <- new_handle()
  handle_setopt(h, post = TRUE, postfields = json_body)
  handle_setheaders(h, "Content-Type" = "application/json", "Accept" = "application/json")
  resp <- tryCatch(
    curl_fetch_memory(paste0(BASE_URL, path), handle = h),
    error = function(e) list(status_code = 0L, content = raw(0), error = conditionMessage(e))
  )
  body <- if (length(resp$content) > 0 && is.raw(resp$content)) rawToChar(resp$content) else ""
  list(
    status  = resp$status_code,
    body    = body,
    parsed  = tryCatch(fromJSON(body, simplifyVector = FALSE), error = function(e) NULL)
  )
}

# ─────────────────────────────────────────────────────────────────────────────
# Check server is reachable before running tests
# ─────────────────────────────────────────────────────────────────────────────
cat("════════════════════════════════════════════════════════════════\n")
cat("ScamTracer AI — Plumber API Test Suite (Phase 5)\n")
cat(sprintf("Target: %s\n", BASE_URL))
cat("════════════════════════════════════════════════════════════════\n\n")

.ping <- .http_get("/health")
if (.ping$status == 0L) {
  cat("ERROR: Cannot connect to API server at", BASE_URL, "\n")
  cat("Start the server first:\n")
  cat("  cd \"E:/R PROJECT\"\n")
  cat("  Rscript -e \"pr <- plumber::plumb('R/api/plumber.R'); pr$run(host='0.0.0.0', port=8000)\"\n")
  quit(status = 1)
}
cat(sprintf("Server reachable (HTTP %d). Running tests...\n\n", .ping$status))

# ─────────────────────────────────────────────────────────────────────────────
# Test 1: GET /health
# ─────────────────────────────────────────────────────────────────────────────
cat("── Test 1: GET /health ──\n")
r1 <- .http_get("/health")
cat(sprintf("   HTTP status : %d\n",    r1$status))
cat(sprintf("   Body excerpt: %s\n",    substr(r1$body, 1, 120)))
.check("HTTP 200",                     r1$status == 200L, r1$status)
.check("Body is valid JSON",           !is.null(r1$parsed))
.check("status field = 'ok'",          identical(r1$parsed$status, "ok"), r1$parsed$status)
.check("service field present",        !is.null(r1$parsed$service))
.check("r_version field present",      !is.null(r1$parsed$r_version))
.check("model_loaded = TRUE",          isTRUE(r1$parsed$model_loaded), r1$parsed$model_loaded)

# ─────────────────────────────────────────────────────────────────────────────
# Test 2: POST /analyze — scam message (prize scam, high ML + indicator score)
# Using an English-corpus message that the ML model trained on UK/Singapore SMS
# recognises as spam. India-specific messages may get lower ML scores because
# the training data is UK/Singapore origin (documented limitation).
# ─────────────────────────────────────────────────────────────────────────────
cat("\n── Test 2: POST /analyze — scam message (prize + urgency) ──\n")
scam_msg  <- '{"message": "Congratulations! You have WON a guaranteed cash prize of GBP 900. Call 08002986030 FREE NOW to claim your reward! Hurry, offer expires today."}'
r2 <- .http_post("/analyze", scam_msg)
cat(sprintf("   HTTP status : %d\n", r2$status))
cat(sprintf("   prediction  : %s\n", r2$parsed$prediction))
cat(sprintf("   risk_score  : %s\n", r2$parsed$risk_score))
cat(sprintf("   risk_level  : %s\n", r2$parsed$risk_level))
.check("HTTP 200",                     r2$status == 200L, r2$status)
.check("Body is valid JSON",           !is.null(r2$parsed))
.check("prediction is SCAM",           identical(r2$parsed$prediction, "SCAM"), r2$parsed$prediction)
.check("risk_level is HIGH or MEDIUM", r2$parsed$risk_level %in% c("HIGH", "MEDIUM"), r2$parsed$risk_level)
.check("risk_score in [0,100]",        is.numeric(r2$parsed$risk_score) &&
       r2$parsed$risk_score >= 0 && r2$parsed$risk_score <= 100,
       r2$parsed$risk_score)
.check("model_probability in [0,1]",   is.numeric(r2$parsed$model_probability) &&
       r2$parsed$model_probability >= 0 && r2$parsed$model_probability <= 1,
       round(r2$parsed$model_probability, 4))
.check("detected_indicators is array",  is.list(r2$parsed$detected_indicators))
.check("explanations is array",         is.list(r2$parsed$explanations))
.check("caveat field present",          !is.null(r2$parsed$caveat))
.check("model_used field present",      !is.null(r2$parsed$model_used))

# ─────────────────────────────────────────────────────────────────────────────
# Test 3: POST /analyze — normal message — expect LEGITIMATE, LOW
# ─────────────────────────────────────────────────────────────────────────────
cat("\n── Test 3: POST /analyze — normal conversational message ──\n")
ham_msg <- '{"message": "Hey, are we still meeting at the coffee shop at 5 PM? Let me know."}'
r3 <- .http_post("/analyze", ham_msg)
cat(sprintf("   HTTP status : %d\n", r3$status))
cat(sprintf("   prediction  : %s\n", r3$parsed$prediction))
cat(sprintf("   risk_score  : %s\n", r3$parsed$risk_score))
cat(sprintf("   risk_level  : %s\n", r3$parsed$risk_level))
.check("HTTP 200",                     r3$status == 200L, r3$status)
.check("Body is valid JSON",           !is.null(r3$parsed))
.check("prediction is LEGITIMATE",     identical(r3$parsed$prediction, "LEGITIMATE"), r3$parsed$prediction)
.check("risk_level is LOW",            identical(r3$parsed$risk_level, "LOW"), r3$parsed$risk_level)
.check("risk_score in [0,100]",        is.numeric(r3$parsed$risk_score) &&
       r3$parsed$risk_score >= 0 && r3$parsed$risk_score <= 100,
       r3$parsed$risk_score)
.check("model_probability in [0,1]",   is.numeric(r3$parsed$model_probability) &&
       r3$parsed$model_probability >= 0 && r3$parsed$model_probability <= 1,
       round(r3$parsed$model_probability, 4))

# ─────────────────────────────────────────────────────────────────────────────
# Test 4: POST /analyze — empty string — expect HTTP 200, UNKNOWN
# ─────────────────────────────────────────────────────────────────────────────
cat("\n── Test 4: POST /analyze — empty string ──\n")
r4 <- .http_post("/analyze", '{"message": ""}')
cat(sprintf("   HTTP status : %d\n", r4$status))
cat(sprintf("   prediction  : %s\n", r4$parsed$prediction))
cat(sprintf("   risk_level  : %s\n", r4$parsed$risk_level))
.check("HTTP 200",                     r4$status == 200L, r4$status)
.check("Body is valid JSON",           !is.null(r4$parsed))
.check("prediction is UNKNOWN",        identical(r4$parsed$prediction, "UNKNOWN"), r4$parsed$prediction)
.check("risk_level is UNKNOWN",        identical(r4$parsed$risk_level, "UNKNOWN"), r4$parsed$risk_level)

# ─────────────────────────────────────────────────────────────────────────────
# Test 5: POST /analyze — missing message field — expect HTTP 400
# ─────────────────────────────────────────────────────────────────────────────
cat("\n── Test 5: POST /analyze — missing 'message' field ──\n")
r5 <- .http_post("/analyze", '{}')
cat(sprintf("   HTTP status : %d\n", r5$status))
cat(sprintf("   error msg   : %s\n", r5$parsed$message))
.check("HTTP 400",                     r5$status == 400L, r5$status)
.check("Body is valid JSON",           !is.null(r5$parsed))
.check("error = TRUE",                 isTRUE(r5$parsed$error), r5$parsed$error)
.check("message field present",        !is.null(r5$parsed$message))

# ─────────────────────────────────────────────────────────────────────────────
# Test 6: POST /analyze — null message — expect HTTP 400
# ─────────────────────────────────────────────────────────────────────────────
cat("\n── Test 6: POST /analyze — null message value ──\n")
r6 <- .http_post("/analyze", '{"message": null}')
cat(sprintf("   HTTP status : %d\n", r6$status))
cat(sprintf("   error msg   : %s\n", r6$parsed$message))
.check("HTTP 400",                     r6$status == 400L, r6$status)
.check("Body is valid JSON",           !is.null(r6$parsed))
.check("error = TRUE",                 isTRUE(r6$parsed$error), r6$parsed$error)

# ─────────────────────────────────────────────────────────────────────────────
# Test 7: POST /analyze — wrong type (number) — expect HTTP 400
# ─────────────────────────────────────────────────────────────────────────────
cat("\n── Test 7: POST /analyze — message is a number ──\n")
r7 <- .http_post("/analyze", '{"message": 12345}')
cat(sprintf("   HTTP status : %d\n", r7$status))
cat(sprintf("   error msg   : %s\n", r7$parsed$message))
.check("HTTP 400",                     r7$status == 400L, r7$status)
.check("Body is valid JSON",           !is.null(r7$parsed))
.check("error = TRUE",                 isTRUE(r7$parsed$error), r7$parsed$error)

# ─────────────────────────────────────────────────────────────────────────────
# Test 8: POST /analyze — empty body — expect HTTP 400
# ─────────────────────────────────────────────────────────────────────────────
cat("\n── Test 8: POST /analyze — empty body ──\n")
r8 <- .http_post("/analyze", "")
cat(sprintf("   HTTP status : %d\n", r8$status))
.check("HTTP 400",                     r8$status == 400L, r8$status)
.check("Body is valid JSON",           !is.null(r8$parsed))
.check("error = TRUE",                 isTRUE(r8$parsed$error), r8$parsed$error)

# ─────────────────────────────────────────────────────────────────────────────
# Test 9: API survives multiple bad requests (call /health again — must still work)
# ─────────────────────────────────────────────────────────────────────────────
cat("\n── Test 9: API stability — /health after bad requests ──\n")
r9 <- .http_get("/health")
cat(sprintf("   HTTP status : %d\n", r9$status))
cat(sprintf("   status field: %s\n", r9$parsed$status))
.check("HTTP 200 after bad requests",  r9$status == 200L, r9$status)
.check("status still 'ok'",            identical(r9$parsed$status, "ok"))
.check("model still loaded",           isTRUE(r9$parsed$model_loaded))

# ─────────────────────────────────────────────────────────────────────────────
# Test 10: Response schema completeness
# ─────────────────────────────────────────────────────────────────────────────
cat("\n── Test 10: Full response schema check ──\n")
schema_test_msg <- '{"message": "URGENT: Your account will be suspended. Transfer Rs 5000 to UPI ID help@paytm immediately."}'
r10 <- .http_post("/analyze", schema_test_msg)
cat(sprintf("   HTTP status  : %d\n",  r10$status))
cat(sprintf("   risk_score   : %s\n",  r10$parsed$risk_score))
cat(sprintf("   risk_level   : %s\n",  r10$parsed$risk_level))
cat(sprintf("   # indicators : %d\n",  length(r10$parsed$detected_indicators)))
required_fields <- c("prediction", "model_probability", "ml_score", "indicator_score",
                     "risk_score", "risk_level", "detected_indicators", "explanations",
                     "summary_text", "model_used", "caveat")
for (field in required_fields) {
  .check(paste0("field '", field, "' present"), field %in% names(r10$parsed), field)
}
.check("risk_score in [0,100]",
       is.numeric(r10$parsed$risk_score) &&
       r10$parsed$risk_score >= 0 && r10$parsed$risk_score <= 100,
       r10$parsed$risk_score)
.check("risk_level is HIGH or MEDIUM", r10$parsed$risk_level %in% c("HIGH", "MEDIUM"), r10$parsed$risk_level)

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
total <- pass_count + fail_count
cat("\n════════════════════════════════════════════════════════════════\n")
cat(sprintf("API TEST SUMMARY: %d / %d passed  (%d failed)\n", pass_count, total, fail_count))
cat("════════════════════════════════════════════════════════════════\n")
if (fail_count == 0L) {
  cat("All API tests passed.\n")
} else {
  cat("Some API tests failed — review output above.\n")
  quit(status = 1)
}
