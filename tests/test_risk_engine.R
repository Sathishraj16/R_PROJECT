# ScamTracer AI — Risk Engine Test Suite
# Phase 4 verification: tests/test_risk_engine.R
#
# Coverage: 10 message categories (A–J) exercising analyze_risk() and detect_indicators().
#
# Tests are DESCRIPTIVE, not assertive — results are printed with PASS/FAIL notes.
# PASS/FAIL is based on structural correctness and expected direction, NOT on
# specific numeric values (which depend on the trained model and cannot be fabricated).
#
# Run: Rscript tests/test_risk_engine.R
# Must be run from E:/R PROJECT (project root).

cat("════════════════════════════════════════════════════════════════\n")
cat("ScamTracer AI — Risk Engine Test Suite (Phase 4)\n")
cat("════════════════════════════════════════════════════════════════\n\n")

setwd("E:/R PROJECT")
.risk_scorer_sourced_by_test <- TRUE

source("R/utils/helpers.R")
source("R/analysis/risk_scorer.R")

# ─────────────────────────────────────────────
# Test helpers
# ─────────────────────────────────────────────
pass_count <- 0
fail_count <- 0

.check <- function(label, condition, result_val = NULL) {
  status <- if (isTRUE(condition)) {
    pass_count <<- pass_count + 1
    "PASS"
  } else {
    fail_count <<- fail_count + 1
    "FAIL"
  }
  val_str <- if (!is.null(result_val)) paste0(" [", result_val, "]") else ""
  cat(sprintf("  [%s] %s%s\n", status, label, val_str))
}

.run_case <- function(case_id, label, message) {
  cat(sprintf("\n── Case %s: %s ──\n", case_id, label))
  cat(sprintf("   Input: \"%s\"\n", substr(as.character(message), 1, 80)))
  result <- tryCatch(analyze_risk(message), error = function(e) list(error = conditionMessage(e)))
  result
}

.print_result <- function(result) {
  if (!is.null(result$error) && is.null(result$prediction)) {
    cat(sprintf("   ERROR: %s\n", result$error))
    return(invisible(result))
  }
  cat(sprintf("   Prediction     : %s\n",   result$prediction))
  if (!is.na(result$risk_score)) {
    cat(sprintf("   Risk Score     : %d/100 → %s\n", result$risk_score, result$risk_level))
    cat(sprintf("   ML P(spam)     : %.1f%%  |  ML score: %.1f/60  |  Indicator score: %d/40\n",
                result$model_probability * 100, result$ml_score, result$indicator_score))
  }
  if (length(result$detected_indicators) > 0) {
    cat(sprintf("   Indicators     : %s\n", paste(result$detected_indicators, collapse = " | ")))
  } else {
    cat("   Indicators     : none\n")
  }
  invisible(result)
}

# ════════════════════════════════════════════════════════════════
# Case A: Normal conversational message — expect LOW risk
# ════════════════════════════════════════════════════════════════
msg_a <- "Hey, are we meeting at 5 PM today? Let me know if you need directions."
r_a <- .run_case("A", "Normal conversational message", msg_a)
.print_result(r_a)
.check("result is a list",            is.list(r_a))
.check("prediction field present",    !is.null(r_a$prediction))
.check("risk_score field present",    !is.null(r_a$risk_score))
.check("risk_level field present",    !is.null(r_a$risk_level))
.check("caveat field present",        !is.null(r_a$caveat))
.check("model_probability in [0,1]",  !is.na(r_a$model_probability) && r_a$model_probability >= 0 && r_a$model_probability <= 1,
       round(r_a$model_probability, 4))
.check("risk_score in [0,100]",       !is.na(r_a$risk_score) && r_a$risk_score >= 0 && r_a$risk_score <= 100,
       r_a$risk_score)
.check("prediction is LEGITIMATE",    r_a$prediction == "LEGITIMATE", r_a$prediction)
.check("risk_level is LOW",           r_a$risk_level == "LOW", r_a$risk_level)

# ════════════════════════════════════════════════════════════════
# Case B: Promotional/marketing spam — expect MEDIUM or HIGH risk
# ════════════════════════════════════════════════════════════════
msg_b <- "EXCLUSIVE OFFER! Get 50% off all items this weekend only. Free delivery on orders over Rs. 500! Shop now at www.dealsforeveryone.com"
r_b <- .run_case("B", "Promotional / marketing spam", msg_b)
.print_result(r_b)
.check("result is a list",            is.list(r_b))
.check("prediction field present",    !is.null(r_b$prediction))
.check("risk_score in [0,100]",       !is.na(r_b$risk_score) && r_b$risk_score >= 0 && r_b$risk_score <= 100,
       r_b$risk_score)
.check("model_probability in [0,1]",  !is.na(r_b$model_probability) && r_b$model_probability >= 0 && r_b$model_probability <= 1,
       round(r_b$model_probability, 4))
.check("risk_level is MEDIUM or HIGH", r_b$risk_level %in% c("MEDIUM", "HIGH"), r_b$risk_level)

# ════════════════════════════════════════════════════════════════
# Case C: Banking scam — expect HIGH risk
# ════════════════════════════════════════════════════════════════
msg_c <- "Your SBI account has been blocked due to KYC non-compliance. Update your KYC immediately by calling 09876543210 to reactivate your account."
r_c <- .run_case("C", "Banking / KYC scam", msg_c)
.print_result(r_c)
.check("result is a list",            is.list(r_c))
.check("risk_score in [0,100]",       !is.na(r_c$risk_score) && r_c$risk_score >= 0 && r_c$risk_score <= 100,
       r_c$risk_score)
.check("model_probability in [0,1]",  !is.na(r_c$model_probability) && r_c$model_probability >= 0 && r_c$model_probability <= 1,
       round(r_c$model_probability, 4))
.check("suspension_threat detected",  "Account Suspension Threat" %in% r_c$detected_indicators ||
       "Banking / Account Language"   %in% r_c$detected_indicators)
.check("risk_level is HIGH or MEDIUM", r_c$risk_level %in% c("HIGH", "MEDIUM"), r_c$risk_level)

# ════════════════════════════════════════════════════════════════
# Case D: OTP request — expect HIGH risk, otp_request indicator
# ════════════════════════════════════════════════════════════════
msg_d <- "Dear Customer, your SBI account verification OTP is 847392. Please share this OTP with our executive on 09988776655 to complete your KYC."
r_d <- .run_case("D", "OTP request scam", msg_d)
.print_result(r_d)
.check("result is a list",            is.list(r_d))
.check("risk_score in [0,100]",       !is.na(r_d$risk_score) && r_d$risk_score >= 0 && r_d$risk_score <= 100,
       r_d$risk_score)
.check("OTP Request indicator detected", "OTP Request" %in% r_d$detected_indicators,
       paste(r_d$detected_indicators, collapse=", "))
.check("Credential Sharing detected", "Credential Sharing Request" %in% r_d$detected_indicators,
       paste(r_d$detected_indicators, collapse=", "))
.check("risk_level is HIGH or MEDIUM", r_d$risk_level %in% c("HIGH", "MEDIUM"), r_d$risk_level)

# ════════════════════════════════════════════════════════════════
# Case E: Credential/password request — expect HIGH risk
# ════════════════════════════════════════════════════════════════
msg_e <- "This is a security alert from HDFC Bank. Your account has been flagged. Please provide your password and PIN to our security team immediately."
r_e <- .run_case("E", "Credential / password request", msg_e)
.print_result(r_e)
.check("result is a list",            is.list(r_e))
.check("risk_score in [0,100]",       !is.na(r_e$risk_score) && r_e$risk_score >= 0 && r_e$risk_score <= 100,
       r_e$risk_score)
.check("Credential Request detected", "Credential Request" %in% r_e$detected_indicators,
       paste(r_e$detected_indicators, collapse=", "))
.check("risk_level is HIGH or MEDIUM", r_e$risk_level %in% c("HIGH", "MEDIUM"), r_e$risk_level)

# ════════════════════════════════════════════════════════════════
# Case F: Payment / money transfer request — expect MEDIUM or HIGH
# ════════════════════════════════════════════════════════════════
msg_f <- "URGENT: Transfer Rs. 5000 to UPI ID help@paytm within 2 hours to avoid legal action against your account number 123456789."
r_f <- .run_case("F", "Payment / money transfer request", msg_f)
.print_result(r_f)
.check("result is a list",            is.list(r_f))
.check("risk_score in [0,100]",       !is.na(r_f$risk_score) && r_f$risk_score >= 0 && r_f$risk_score <= 100,
       r_f$risk_score)
.check("Money Transfer Request detected", "Money Transfer Request" %in% r_f$detected_indicators ||
       "Urgent Language" %in% r_f$detected_indicators,
       paste(r_f$detected_indicators, collapse=", "))
.check("risk_level is HIGH or MEDIUM", r_f$risk_level %in% c("HIGH", "MEDIUM"), r_f$risk_level)

# ════════════════════════════════════════════════════════════════
# Case G: Urgent threat / account suspension — expect HIGH risk
# ════════════════════════════════════════════════════════════════
msg_g <- "ALERT: Your account will be suspended in 24 hours due to suspicious activity. Act now to prevent account freeze. Call immediately: 1800-XXX-XXXX"
r_g <- .run_case("G", "Account suspension threat / urgency", msg_g)
.print_result(r_g)
.check("result is a list",            is.list(r_g))
.check("risk_score in [0,100]",       !is.na(r_g$risk_score) && r_g$risk_score >= 0 && r_g$risk_score <= 100,
       r_g$risk_score)
.check("suspension_threat or urgent detected",
       "Account Suspension Threat" %in% r_g$detected_indicators ||
       "Urgent Language"           %in% r_g$detected_indicators ||
       "Excessive Pressure Tactics" %in% r_g$detected_indicators,
       paste(r_g$detected_indicators, collapse=", "))
.check("risk_level is HIGH or MEDIUM", r_g$risk_level %in% c("HIGH", "MEDIUM"), r_g$risk_level)

# ════════════════════════════════════════════════════════════════
# Case H: Empty message — expect graceful no-error return
# ════════════════════════════════════════════════════════════════
msg_h <- ""
r_h <- .run_case("H", "Empty message (edge case)", msg_h)
cat(sprintf("   Prediction     : %s\n",   r_h$prediction))
cat(sprintf("   Risk Level     : %s\n",   r_h$risk_level))
cat(sprintf("   Summary        : %s\n",   r_h$summary_text))
.check("returns a list (no crash)",   is.list(r_h))
.check("prediction is UNKNOWN",       r_h$prediction == "UNKNOWN", r_h$prediction)
.check("risk_level is UNKNOWN",       r_h$risk_level == "UNKNOWN", r_h$risk_level)
.check("risk_score is NA",            is.na(r_h$risk_score), r_h$risk_score)
.check("no error field",              is.null(r_h$error))

# ════════════════════════════════════════════════════════════════
# Case I: NULL / non-character input — expect error struct, no crash
# ════════════════════════════════════════════════════════════════
cat(sprintf("\n── Case I: NULL input (edge case) ──\n"))
cat("   Input: NULL\n")
r_i <- tryCatch(analyze_risk(NULL), error = function(e) list(error = conditionMessage(e), crashed = TRUE))
cat(sprintf("   prediction: %s  |  error: %s\n",
            if (!is.null(r_i$prediction)) r_i$prediction else "N/A",
            if (!is.null(r_i$error))      r_i$error      else "none"))
.check("returns a list (no crash)",    is.list(r_i))
.check("does NOT have crashed=TRUE",   !isTRUE(r_i$crashed))
.check("prediction is ERROR or has error field",
       isTRUE(r_i$prediction == "ERROR") || !is.null(r_i$error),
       r_i$prediction)

# ════════════════════════════════════════════════════════════════
# Case J: Very long message (>500 chars) — check no crash, score in range
# ════════════════════════════════════════════════════════════════
msg_j <- paste0(
  "Dear valued customer, we are writing to inform you that your account with us has been flagged ",
  "for unusual activity as part of our routine security check. Our records indicate that your KYC ",
  "documentation has not been updated since the account was opened. According to RBI guidelines, all ",
  "account holders must complete their KYC verification before 31st March or their accounts will be ",
  "permanently suspended. To complete the process, you must share your account number, date of birth, ",
  "registered mobile number, password, and a one-time OTP that will be sent to your phone. Please call ",
  "our customer care team on 1800-XXX-XXXX immediately and share the OTP when prompted. Failure to ",
  "comply within 24 hours will result in account freeze and possible legal action under Section 66A. ",
  "This is your final notice."
)
r_j <- .run_case("J", "Very long message (>500 chars)", msg_j)
.print_result(r_j)
.check("result is a list",            is.list(r_j))
.check("no crash on long input",      !isTRUE(r_j$crashed))
.check("risk_score in [0,100]",       !is.na(r_j$risk_score) && r_j$risk_score >= 0 && r_j$risk_score <= 100,
       r_j$risk_score)
.check("model_probability in [0,1]",  !is.na(r_j$model_probability) && r_j$model_probability >= 0 && r_j$model_probability <= 1,
       round(r_j$model_probability, 4))
.check("multiple high-weight indicators detected", length(r_j$detected_indicators) >= 3,
       paste(length(r_j$detected_indicators), "indicators"))
.check("risk_level is HIGH or MEDIUM", r_j$risk_level %in% c("HIGH", "MEDIUM"), r_j$risk_level)

# ════════════════════════════════════════════════════════════════
# UNIT TEST: detect_indicators() standalone
# ════════════════════════════════════════════════════════════════
cat("\n── Unit Test: detect_indicators() standalone ──\n")
ind_test <- detect_indicators("Please share your OTP and password with our agent immediately.")
.check("detect_indicators returns a list",       is.list(ind_test))
.check("has 14 indicator entries",               length(ind_test) == 14,  length(ind_test))
.check("otp_request detected",                   isTRUE(ind_test$otp_request$detected))
.check("credential_request detected",            isTRUE(ind_test$credential_request$detected))
.check("credential_sharing detected",            isTRUE(ind_test$credential_sharing$detected))
.check("urgent_language detected",               isTRUE(ind_test$urgent_language$detected))
.check("evidence field populated",               !is.na(ind_test$otp_request$evidence) && nchar(ind_test$otp_request$evidence) > 0,
       ind_test$otp_request$evidence)

# indicator_summary()
sum_test <- indicator_summary(ind_test)
.check("indicator_summary returns a list",       is.list(sum_test))
.check("n_detected >= 3",                        sum_test$n_detected >= 3, sum_test$n_detected)
.check("capped_weight <= 40",                    sum_test$capped_weight <= 40, sum_test$capped_weight)
.check("total_weight >= capped_weight",          sum_test$total_weight >= sum_test$capped_weight)

# ════════════════════════════════════════════════════════════════
# UNIT TEST: predict_scam() backward compatibility (Phase 3)
# ════════════════════════════════════════════════════════════════
cat("\n── Unit Test: predict_scam() backward compatibility ──\n")
ps <- predict_scam("URGENT! You have WON a prize! Call now to claim your FREE cash reward!")
.check("predict_scam returns a list",                is.list(ps))
.check("predicted_class field present",              !is.null(ps$predicted_class))
.check("spam_probability in [0,1]",                  ps$spam_probability >= 0 && ps$spam_probability <= 1,
       ps$spam_probability)
.check("risk_level field present",                   !is.null(ps$risk_level))
.check("heuristic_flags is a list",                  is.list(ps$heuristic_flags))
.check("has 10 heuristic flags",                     length(ps$heuristic_flags) == 10, length(ps$heuristic_flags))
.check("note field contains 'statistical estimate'", grepl("statistical estimate", ps$note, ignore.case=TRUE))
.check("model_used field present",                   !is.null(ps$model_used))

# ════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════
total <- pass_count + fail_count
cat("\n════════════════════════════════════════════════════════════════\n")
cat(sprintf("TEST SUMMARY: %d / %d passed  (%d failed)\n", pass_count, total, fail_count))
cat("════════════════════════════════════════════════════════════════\n")
if (fail_count == 0) {
  cat("All tests passed.\n")
} else {
  cat("Some tests failed — review output above.\n")
}
