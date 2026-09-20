# ScamTracer AI — Rule-Based Scam Indicator Engine
# Phase 4 implementation.
#
# Provides detect_indicators(text) — transparent, regex-based scam signal detection.
#
# Each indicator has:
#   - name         : machine-readable identifier
#   - label        : human-readable name for display
#   - detected     : TRUE/FALSE
#   - evidence     : the actual matched text fragment (never fabricated)
#   - severity     : "HIGH" / "MEDIUM" / "LOW" / "INFO"
#   - weight       : numeric contribution to risk score (documented below)
#   - explanation  : one sentence for faculty/user display
#
# INDICATOR WEIGHTS AND RATIONALE:
#
#   Weight 15 — HIGH severity (legitimate systems never do this):
#     otp_request          — Banks/services never ask for OTPs
#     credential_request   — Passwords/PINs are never requested by legitimate entities
#
#   Weight 12 — HIGH severity (strong social engineering):
#     suspension_threat    — "Your account will be blocked/suspended" is a classic pressure tactic
#     credential_sharing   — Explicitly asking to share OTP/password/PIN with a third party
#
#   Weight 10 — MEDIUM severity (direct financial harm potential):
#     transfer_request     — Asks to send money / transfer funds
#
#   Weight 8 — MEDIUM severity (financial context):
#     financial_language   — Monetary amounts, payment, deposit language
#
#   Weight 6 — MODERATE severity (context-dependent):
#     urgent_language      — Urgency/time-pressure wording
#     banking_language     — KYC, NEFT, IMPS, account freeze terminology
#
#   Weight 5 — LOW severity (common opener/pattern):
#     prize_claim          — Classic lottery / prize scam opener
#     link_click_request   — Phishing signal (click here, open link)
#     excessive_pressure   — "Hurry", "last chance", "expires"
#
#   Weight 4 — MODERATE informational:
#     impersonation_signal — Claims to be bank, RBI, government, telecom
#
#   Weight 3 — INFO (context-dependent, not inherently suspicious):
#     phone_number_present — Contact number in message
#     upi_pattern          — UPI ID or explicit UPI mention
#
# IMPORTANT: Indicator detection does not guarantee the message is a scam.
# Legitimate messages may occasionally contain words matching these patterns.
# The risk engine combines indicators with ML model probability to produce
# a composite assessment — not a definitive verdict.
#
# Source: source("R/utils/helpers.R")
# Then call: detect_indicators("Your message text here")

library(stringr)

# ─────────────────────────────────────────────
# INDICATOR DEFINITIONS
# Each entry: list(name, label, pattern, severity, weight, explanation_template)
# ─────────────────────────────────────────────

.INDICATORS <- list(

  otp_request = list(
    name        = "otp_request",
    label       = "OTP Request",
    pattern     = "(?i)\\botp\\b|one[- ]time (password|code|pin)|verification code|auth(entication)? code|security code|\\bverification pin\\b",
    severity    = "HIGH",
    weight      = 15,
    template    = "Message requests a one-time password or verification code — legitimate banks and services never ask for OTPs."
  ),

  credential_request = list(
    name        = "credential_request",
    label       = "Credential Request",
    pattern     = "(?i)\\b(your |enter |provide |send |share )?password\\b|\\b(your |enter |provide |send |share )?pin\\b|login (detail|credential)|\\bcredential\\b|\\bpasscode\\b",
    severity    = "HIGH",
    weight      = 15,
    template    = "Message requests a password, PIN or login credentials — legitimate entities never ask for these."
  ),

  suspension_threat = list(
    name        = "suspension_threat",
    label       = "Account Suspension Threat",
    pattern     = "(?i)(account|service|wallet|card|number|sim|access|subscription).{0,30}(suspend|block|deactivat|disabl|restrict|freez|clos|terminat|expir)|((suspend|block|deactivat|disabl|restrict|freez|terminat).{0,30}(account|service|wallet|card|number|sim|access))",
    severity    = "HIGH",
    weight      = 12,
    template    = "Message threatens account suspension, blocking or deactivation — a common social engineering pressure tactic."
  ),

  credential_sharing = list(
    name        = "credential_sharing",
    label       = "Credential Sharing Request",
    pattern     = "(?i)(share|send|provide|give|tell|submit|enter|forward).{0,20}(otp|password|pin|code|detail|credential|cvv)",
    severity    = "HIGH",
    weight      = 12,
    template    = "Message explicitly asks the recipient to share an OTP, password, PIN or personal code."
  ),

  transfer_request = list(
    name        = "transfer_request",
    label       = "Money Transfer Request",
    pattern     = "(?i)(send|transfer|pay|deposit|remit|wire).{0,25}(money|amount|₹|rs\\.|rupee|fund|cash|sum|balance)|(money|amount|fund|cash).{0,25}(send|transfer|pay|deposit)",
    severity    = "MEDIUM",
    weight      = 10,
    template    = "Message requests a money transfer or payment."
  ),

  financial_language = list(
    name        = "financial_language",
    label       = "Financial / Payment Language",
    pattern     = "(?i)\\b(payment|paid|invoice|billing|charge|fee|refund|cashback|withdraw|withdrawal|transaction|₹|rs\\.|inr|£|\\$)\\b",
    severity    = "MEDIUM",
    weight      = 8,
    template    = "Message contains financial or payment-related language."
  ),

  urgent_language = list(
    name        = "urgent_language",
    label       = "Urgent Language",
    pattern     = "(?i)\\b(urgent|urgently|immediately|asap|right now|act now|do not delay|without delay|instant|at once)\\b",
    severity    = "MEDIUM",
    weight      = 6,
    template    = "Message uses urgent or time-pressure language to prompt immediate action."
  ),

  banking_language = list(
    name        = "banking_language",
    label       = "Banking / Account Language",
    pattern     = "(?i)\\b(kyc|neft|imps|rtgs|ifsc|net.?banking|mobile.?banking|bank account|savings account|current account|account number|account holder|debit card|credit card)\\b",
    severity    = "MEDIUM",
    weight      = 6,
    template    = "Message contains banking or financial account terminology (KYC, NEFT, IMPS, etc.)."
  ),

  prize_claim = list(
    name        = "prize_claim",
    label       = "Prize / Reward Claim",
    pattern     = "(?i)\\b(won|winner|winning|prize|reward|lottery|lucky draw|jackpot|lucky winner|congratulation|selected|eligible for|cash prize|gift card|voucher)\\b",
    severity    = "LOW",
    weight      = 5,
    template    = "Message claims the recipient has won a prize, reward, or lottery — a classic scam pattern."
  ),

  link_click_request = list(
    name        = "link_click_request",
    label       = "Link / URL in Message",
    pattern     = "(?i)(click|tap|visit|open|follow|go to).{0,20}(link|here|url|website|page|below|above)|https?://|www\\.",
    severity    = "LOW",
    weight      = 5,
    template    = "Message contains a URL or asks the recipient to click a link — potential phishing signal."
  ),

  excessive_pressure = list(
    name        = "excessive_pressure",
    label       = "Excessive Pressure Tactics",
    pattern     = "(?i)\\b(last chance|limited (time|offer)|offer expire|expires (today|soon|tonight|now)|hurry|don.t (wait|delay|miss)|time.sensitive|within (24|48|12|6|2|1) hour|today only|ends tonight)\\b",
    severity    = "LOW",
    weight      = 5,
    template    = "Message uses time-limited or high-pressure tactics to force a hasty decision."
  ),

  impersonation_signal = list(
    name        = "impersonation_signal",
    label       = "Impersonation Signal",
    pattern     = "(?i)(this is|we are|message from|on behalf of|from).{0,30}(bank|rbi|reserve bank|government|govt|income tax|it department|police|cbi|telecom|bsnl|airtel|vodafone|jio|vi|sbi|hdfc|icici|axis|pnb|kotak|idbi|canara|union bank|yes bank|paytm|gpay|phonepe|bhim|npci)",
    severity    = "MEDIUM",
    weight      = 4,
    template    = "Message appears to impersonate a bank, government body, telecom provider, or payment service."
  ),

  phone_number_present = list(
    name        = "phone_number_present",
    label       = "Phone Number in Message",
    pattern     = "(?i)(\\+?91[- ]?)?[6-9]\\d{9}|\\b\\d{5,}\\b",
    severity    = "INFO",
    weight      = 3,
    template    = "Message contains a phone number or long digit sequence — contact numbers are common in scam messages."
  ),

  upi_pattern = list(
    name        = "upi_pattern",
    label       = "UPI ID / Payment Reference",
    pattern     = "(?i)\\bupi\\b|[a-zA-Z0-9._-]{3,}@[a-zA-Z]{3,}|\\bpay\\s*(id|now|here)\\b",
    severity    = "INFO",
    weight      = 3,
    template    = "Message contains a UPI ID or UPI payment reference."
  )
)

# ─────────────────────────────────────────────
# PUBLIC: detect_indicators(text)
# Returns a list: one entry per indicator
# ─────────────────────────────────────────────
detect_indicators <- function(text) {
  if (!is.character(text) || length(text) != 1) {
    stop("[detect_indicators] 'text' must be a single character string.")
  }

  results <- lapply(.INDICATORS, function(ind) {
    match_obj <- regexpr(ind$pattern, text, perl = TRUE)
    detected  <- match_obj > 0

    evidence <- if (detected) {
      raw <- regmatches(text, match_obj)
      if (length(raw) > 0 && nchar(raw) > 0) substr(raw, 1, 80) else "(matched)"
    } else {
      NA_character_
    }

    list(
      name        = ind$name,
      label       = ind$label,
      detected    = detected,
      evidence    = evidence,
      severity    = ind$severity,
      weight      = ind$weight,
      explanation = if (detected) ind$template else NA_character_
    )
  })

  results
}

# ─────────────────────────────────────────────
# PUBLIC: indicator_summary(indicators)
# Takes output of detect_indicators(), returns compact summary
# ─────────────────────────────────────────────
indicator_summary <- function(indicators) {
  detected_list <- Filter(function(x) isTRUE(x$detected), indicators)

  total_weight    <- sum(vapply(detected_list, function(x) x$weight,      numeric(1)))
  detected_names  <-     vapply(detected_list, function(x) x$name,        character(1))
  detected_labels <-     vapply(detected_list, function(x) x$label,       character(1))
  explanations    <-     vapply(detected_list, function(x) x$explanation,  character(1))
  severities      <-     vapply(detected_list, function(x) x$severity,    character(1))

  list(
    n_detected      = length(detected_list),
    total_weight    = total_weight,
    capped_weight   = min(40, total_weight),
    detected_names  = detected_names,
    detected_labels = detected_labels,
    explanations    = explanations,
    severities      = severities
  )
}

message("[helpers] Scam indicator engine loaded. Call detect_indicators(text) to analyse a message.")
