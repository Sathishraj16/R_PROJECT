# ScamTracer AI — Risk Scorer / Analytics Engine
# Phase 3 (predict_scam) + Phase 4 (analyze_risk) implementation.
#
# Phase 3 function (unchanged):
#   predict_scam(text) — raw ML prediction interface
#
# Phase 4 function (new):
#   analyze_risk(message) — full risk engine combining ML + rule-based indicators
#
# ─────────────────────────────────────────────────────────────────────────────
# RISK SCORE FORMULA (documented — not arbitrary):
#
#   ml_score        = spam_probability × 60          range: [0, 60]
#   indicator_score = min(40, sum(indicator_weights)) range: [0, 40], capped
#   risk_score      = round(ml_score + indicator_score)  range: [0, 100]
#
# Rationale for 60/40 split:
#   The ML model (AUC=0.9639) is the primary evidence source — it gets 60% weight.
#   Rule-based indicators are independent supplementary evidence — they get up to 40%.
#   Capping the indicator component prevents a message with many weak signals from
#   being rated HIGH purely on heuristics without ML confirmation.
#
# RISK LEVELS (documented thresholds):
#   LOW    : risk_score  < 30  — no strong evidence of scam
#   MEDIUM : risk_score 30–59  — notable signals, warrants caution
#   HIGH   : risk_score >= 60  — strong evidence of scam, recommend alert
#
# IMPORTANT DISTINCTION:
#   spam_probability is the ML model's estimated posterior P(spam).
#   It is a STATISTICAL ESTIMATE, not a certainty.
#   The model was trained on SMS data; it can be wrong on individual messages.
#   risk_score is a model-based composite assessment, not a guaranteed verdict.
#
# ─────────────────────────────────────────────────────────────────────────────
#
# Run:  source("R/analysis/risk_scorer.R")    (from project root)
#       result <- analyze_risk("Your message text here")

suppressPackageStartupMessages({
  library(dplyr)
  library(stringr)
  library(tidytext)
  library(glmnet)
})

MODEL_PATH    <- "models/scamtracer_model.rds"
VOCAB_PATH    <- "models/model_vocab.rds"
METADATA_PATH <- "models/model_metadata.rds"
HELPERS_PATH  <- "R/utils/helpers.R"

# ─────────────────────────────────────────────
# Internal: lazy-load helpers once
# ─────────────────────────────────────────────
.helpers_loaded <- FALSE
.ensure_helpers <- function() {
  if (!.helpers_loaded) {
    if (!file.exists(HELPERS_PATH)) stop("[risk_scorer] helpers.R not found: ", HELPERS_PATH)
    source(HELPERS_PATH)
    .helpers_loaded <<- TRUE
  }
}

# ─────────────────────────────────────────────
# Internal: load model artifacts once
# ─────────────────────────────────────────────
.scamtracer_env <- new.env(parent = emptyenv())

.load_model <- function() {
  if (!exists("model", envir = .scamtracer_env)) {
    if (!file.exists(MODEL_PATH))    stop("[risk_scorer] Model not found: ", MODEL_PATH,
                                          "\nRun R/models/classifier.R first.")
    if (!file.exists(VOCAB_PATH))    stop("[risk_scorer] Vocabulary not found: ", VOCAB_PATH)
    if (!file.exists(METADATA_PATH)) stop("[risk_scorer] Metadata not found: ", METADATA_PATH)

    .scamtracer_env$model    <- readRDS(MODEL_PATH)
    .scamtracer_env$vocab    <- readRDS(VOCAB_PATH)
    .scamtracer_env$metadata <- readRDS(METADATA_PATH)
    message("[risk_scorer] Model loaded: ", .scamtracer_env$metadata$model_name,
            "  (trained ", .scamtracer_env$metadata$training_date, ")")
  }
}

# ─────────────────────────────────────────────
# Internal: scam-aware stop words (mirrors text_features.R)
# ─────────────────────────────────────────────
.scam_keywords_keep <- c(
  "free", "win", "won", "winner", "prize", "claim", "cash", "money",
  "urgent", "call", "now", "immediately", "stop", "cancel",
  "credit", "loan", "award", "reward", "bonus", "selected",
  "guaranteed", "offer", "limited", "expires", "apply",
  "account", "verify", "update", "confirm", "bank", "password",
  "otp", "upi", "kyc", "neft", "imps", "blocked"
)

# ─────────────────────────────────────────────
# Internal: build feature vector (mirrors text_features.R + cleaner.R)
# ─────────────────────────────────────────────
.build_features <- function(text, vocab) {
  text_lower  <- tolower(text)
  char_count  <- nchar(text)
  word_count  <- str_count(text, "\\S+")
  has_url     <- as.integer(str_detect(text, "https?://|www\\."))
  has_phone   <- as.integer(str_detect(text, "\\b\\d{7,}\\b"))
  has_currency <- as.integer(str_detect(text, "£|\\$|\\bGBP\\b|\\bUSD\\b|\\bINR\\b"))
  has_free    <- as.integer(str_detect(text_lower, "\\bfree\\b"))
  has_urgent  <- as.integer(str_detect(text_lower, "\\burgent\\b"))
  has_prize   <- as.integer(str_detect(text_lower, "\\bwon\\b|\\bwinner\\b|\\bprize\\b|\\bclaim\\b"))

  tokens_df <- data.frame(doc_id = 1L, text_lower = text_lower, stringsAsFactors = FALSE)
  tokens <- tryCatch(
    tidytext::unnest_tokens(tokens_df, word, text_lower),
    error = function(e) data.frame(doc_id = integer(), word = character())
  )

  custom_sw <- tidytext::stop_words %>%
    dplyr::filter(!word %in% .scam_keywords_keep)

  tokens_filtered <- tokens %>%
    dplyr::anti_join(custom_sw, by = "word") %>%
    dplyr::filter(!str_detect(word, "^\\d+$"), str_length(word) > 1)

  if (nrow(tokens_filtered) > 0) {
    tf <- tokens_filtered %>%
      dplyr::count(word, name = "n") %>%
      dplyr::mutate(tf = n / sum(n))
  } else {
    tf <- data.frame(word = character(), tf = numeric())
  }

  tfidf_cols <- vocab[10:length(vocab)]
  tfidf_vec  <- setNames(rep(0, length(tfidf_cols)), tfidf_cols)
  matched    <- intersect(tf$word, tfidf_cols)
  if (length(matched) > 0) {
    tf_matched <- tf %>% dplyr::filter(word %in% matched)
    tfidf_vec[tf_matched$word] <- tf_matched$tf
  }

  numeric_part <- c(
    char_count   = char_count,
    word_count   = word_count,
    has_url      = has_url,
    has_phone    = has_phone,
    has_currency = has_currency,
    has_free     = has_free,
    has_urgent   = has_urgent,
    has_prize    = has_prize
  )

  fv <- c(numeric_part, tfidf_vec)
  fv_ordered <- fv[vocab]
  fv_ordered[is.na(fv_ordered)] <- 0
  matrix(fv_ordered, nrow = 1, dimnames = list(NULL, vocab))
}

# ─────────────────────────────────────────────
# Internal: basic heuristic flags (Phase 3 — unchanged)
# ─────────────────────────────────────────────
.heuristic_flags <- function(text) {
  tl <- tolower(text)
  list(
    has_url        = str_detect(text, "https?://|www\\."),
    has_phone      = str_detect(text, "\\b\\d{7,}\\b"),
    has_currency   = str_detect(text, "£|\\$|\\bGBP\\b|\\bUSD\\b|\\bINR\\b"),
    keyword_free   = str_detect(tl, "\\bfree\\b"),
    keyword_urgent = str_detect(tl, "\\burgent\\b"),
    keyword_prize  = str_detect(tl, "\\bwon\\b|\\bwinner\\b|\\bprize\\b|\\bclaim\\b|\\baward\\b"),
    keyword_verify = str_detect(tl, "\\bverify\\b|\\bconfirm\\b|\\bupdate\\b"),
    keyword_otp    = str_detect(tl, "\\botp\\b|\\bone.time\\b"),
    keyword_upi    = str_detect(tl, "\\bupi\\b|\\bneft\\b|\\bimps\\b"),
    very_long      = nchar(text) > 130
  )
}

# ─────────────────────────────────────────────
# PUBLIC: predict_scam() — Phase 3 function, UNCHANGED
# ─────────────────────────────────────────────
predict_scam <- function(text) {
  if (!is.character(text) || length(text) != 1 || nchar(trimws(text)) == 0) {
    stop("[predict_scam] 'text' must be a single non-empty character string.")
  }

  .load_model()
  meta  <- .scamtracer_env$metadata
  model <- .scamtracer_env$model
  vocab <- .scamtracer_env$vocab

  fv         <- .build_features(text, vocab)
  spam_prob  <- as.numeric(predict(model, newx = fv, s = meta$best_lambda, type = "response"))
  pred_class <- if (spam_prob >= 0.5) "spam" else "ham"

  flags   <- .heuristic_flags(text)
  n_flags <- sum(unlist(flags))

  risk_level <- if (spam_prob >= 0.75 || (spam_prob >= 0.5 && n_flags >= 2)) {
    "HIGH"
  } else if (spam_prob >= 0.35 || n_flags >= 2) {
    "MEDIUM"
  } else {
    "LOW"
  }

  flag_names  <- names(which(unlist(flags)))
  explanation <- sprintf(
    "ML model predicts: %s (estimated P(spam)=%.1f%%). Risk level: %s. Heuristic signals detected: %s.",
    toupper(pred_class), spam_prob * 100, risk_level,
    if (length(flag_names) > 0) paste(flag_names, collapse = ", ") else "none"
  )

  list(
    predicted_class  = pred_class,
    spam_probability = round(spam_prob, 4),
    risk_level       = risk_level,
    heuristic_flags  = flags,
    explanation      = explanation,
    model_used       = meta$model_name,
    note             = "spam_probability is a statistical estimate, not a certainty. The model can be wrong."
  )
}

# ─────────────────────────────────────────────
# PUBLIC: analyze_risk() — Phase 4 full risk engine
#
# Returns a structured list:
#   $prediction         — "SCAM" or "LEGITIMATE"
#   $model_probability  — P(spam) from ML model [0,1]
#   $ml_score           — ML component of risk score [0,60]
#   $indicator_score    — Rule-based component [0,40]
#   $risk_score         — Composite score [0,100]
#   $risk_level         — "HIGH" / "MEDIUM" / "LOW"
#   $detected_indicators— character vector of indicator labels
#   $indicator_details  — full indicator results from detect_indicators()
#   $explanations       — character vector, one sentence per detected indicator
#   $summary_text       — single human-readable paragraph for display
#   $model_used         — name of the ML model
#   $caveat             — explicit disclaimer about statistical nature
# ─────────────────────────────────────────────
analyze_risk <- function(message) {

  # --- Input validation ---
  if (is.null(message) || !is.character(message)) {
    return(list(
      prediction        = "ERROR",
      risk_score        = NA,
      risk_level        = "UNKNOWN",
      caveat            = "Input must be a character string.",
      error             = "Invalid input: message must be a non-NULL character string."
    ))
  }
  if (length(message) != 1) {
    return(list(
      prediction = "ERROR",
      risk_score = NA,
      risk_level = "UNKNOWN",
      caveat     = "Input must be a single character string, not a vector.",
      error      = "Invalid input: length must be 1."
    ))
  }
  if (nchar(trimws(message)) == 0) {
    return(list(
      prediction        = "UNKNOWN",
      model_probability = NA,
      ml_score          = NA,
      indicator_score   = 0,
      risk_score        = NA,
      risk_level        = "UNKNOWN",
      detected_indicators = character(0),
      indicator_details   = list(),
      explanations        = character(0),
      summary_text      = "Empty message — no analysis possible.",
      model_used        = "N/A",
      caveat            = "No content to analyse."
    ))
  }

  # --- Step 1: ML prediction ---
  .load_model()
  meta  <- .scamtracer_env$metadata
  model <- .scamtracer_env$model
  vocab <- .scamtracer_env$vocab

  fv        <- .build_features(message, vocab)
  spam_prob <- as.numeric(predict(model, newx = fv, s = meta$best_lambda, type = "response"))

  ml_score <- round(spam_prob * 60, 2)

  # --- Step 2: Rule-based indicators ---
  .ensure_helpers()
  indicators    <- detect_indicators(message)
  ind_summary   <- indicator_summary(indicators)

  indicator_score <- ind_summary$capped_weight

  # --- Step 3: Composite risk score ---
  risk_score <- min(100, round(ml_score + indicator_score))

  # --- Step 4: Risk level from composite score ---
  risk_level <- if (risk_score >= 60) {
    "HIGH"
  } else if (risk_score >= 30) {
    "MEDIUM"
  } else {
    "LOW"
  }

  # --- Step 5: Prediction label ---
  prediction <- if (spam_prob >= 0.5) "SCAM" else "LEGITIMATE"

  # --- Step 6: Explanations ---
  explanations <- if (length(ind_summary$explanations) > 0) {
    unname(ind_summary$explanations)
  } else {
    character(0)
  }

  detected_labels <- if (length(ind_summary$detected_labels) > 0) {
    unname(ind_summary$detected_labels)
  } else {
    character(0)
  }

  # --- Step 7: Human-readable summary paragraph ---
  indicator_text <- if (length(detected_labels) > 0) {
    paste0("Rule-based indicators detected (", length(detected_labels), "): ",
           paste(detected_labels, collapse = ", "), ".")
  } else {
    "No rule-based indicators detected."
  }

  summary_text <- paste0(
    "Model-based risk assessment: ", prediction, ". ",
    "ML model estimated P(spam) = ", round(spam_prob * 100, 1), "% ",
    "(ML score: ", ml_score, "/60). ",
    "Indicator score: ", indicator_score, "/40. ",
    "Composite risk score: ", risk_score, "/100 → ", risk_level, " risk. ",
    indicator_text
  )

  list(
    prediction          = prediction,
    model_probability   = round(spam_prob, 4),
    ml_score            = ml_score,
    indicator_score     = indicator_score,
    risk_score          = risk_score,
    risk_level          = risk_level,
    detected_indicators = detected_labels,
    indicator_details   = indicators,
    explanations        = explanations,
    summary_text        = summary_text,
    model_used          = meta$model_name,
    caveat              = paste0(
      "model_probability is the ML model's estimated posterior P(spam) — a statistical estimate, ",
      "not a certainty. The model was trained on SMS data and may not generalise to all message types. ",
      "risk_score combines ML evidence (60%) and rule-based indicators (40%). ",
      "This assessment is advisory only."
    )
  )
}

# ─────────────────────────────────────────────
# When sourced directly (not in test context), run demos
# ─────────────────────────────────────────────
if (!interactive() && !exists(".risk_scorer_sourced_by_test")) {
  message("[risk_scorer] Running analyze_risk() demo predictions...\n")

  demo_cases <- list(
    normal_message = "Hey, are we meeting at 5 PM today?",
    banking_scam   = "Your SBI account has been blocked due to KYC non-compliance. Share your OTP immediately to reactivate.",
    otp_request    = "Dear customer, your account verification OTP is 847392. Please share this code with our executive.",
    payment_scam   = "URGENT: Transfer Rs. 5000 to UPI ID help@paytm within 2 hours or your account will be suspended.",
    prize_scam     = "Congratulations! You have WON a guaranteed cash prize of £900. Call 08002986030 FREE NOW to claim!"
  )

  for (nm in names(demo_cases)) {
    msg <- demo_cases[[nm]]
    cat(sprintf("\n══════════════════════════════════════\n"))
    cat(sprintf("Case: %s\n", nm))
    cat(sprintf("Input: %s\n", substr(msg, 1, 100)))
    cat("──────────────────────────────────────\n")
    result <- analyze_risk(msg)
    cat(sprintf("Prediction       : %s\n",   result$prediction))
    cat(sprintf("Model P(spam)    : %.1f%%\n", result$model_probability * 100))
    cat(sprintf("ML Score         : %.1f / 60\n", result$ml_score))
    cat(sprintf("Indicator Score  : %d / 40\n",   result$indicator_score))
    cat(sprintf("Risk Score       : %d / 100\n",  result$risk_score))
    cat(sprintf("Risk Level       : %s\n",         result$risk_level))
    if (length(result$detected_indicators) > 0) {
      cat(sprintf("Indicators       : %s\n", paste(result$detected_indicators, collapse = " | ")))
    } else {
      cat("Indicators       : none\n")
    }
    cat(sprintf("Caveat           : (see result$caveat)\n"))
  }
  message("\n[risk_scorer] Demo complete.")
}
