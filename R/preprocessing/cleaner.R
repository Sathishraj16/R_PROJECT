# ScamTracer AI — Data Preprocessing Pipeline
# Phase 2 implementation.
#
# Input:  data/raw/SMSSpamCollection  (UCI SMS Spam Collection v.1, tab-separated)
# Output: data/processed/sms_cleaned.csv
#
# Preprocessing decisions:
#   1. Load with explicit column names: label, text.
#   2. Remove exact duplicate rows (403 confirmed via EDA — same text AND label).
#   3. Add binary label: spam_label (1 = spam, 0 = ham).
#   4. Trim leading/trailing whitespace from text.
#   5. Do NOT strip URLs, phone numbers, currency symbols, or digit sequences —
#      these entities are critical for H.I.V.E. intelligence extraction in Phase 4.
#   6. Add derived columns: char_count, word_count — used as ML features.
#   7. Add flag columns for key entity types (for later feature engineering).
#   8. No lowercasing at this stage — case may matter for entity extraction.
#      Lowercasing is applied per-step inside text_features.R for NLP tasks.
#
# Run: Rscript R/preprocessing/cleaner.R  (from project root)

library(dplyr)
library(stringr)

RAW_PATH       <- "data/raw/SMSSpamCollection"
PROCESSED_PATH <- "data/processed/sms_cleaned.csv"

message("[cleaner] Loading raw dataset from: ", RAW_PATH)

if (!file.exists(RAW_PATH)) {
  stop("[cleaner] Raw dataset not found: ", RAW_PATH,
       "\nExpected: data/raw/SMSSpamCollection (from UCI SMS Spam Collection v.1)")
}

# --- Step 1: Load ---
df_raw <- read.delim(
  RAW_PATH,
  header        = FALSE,
  sep           = "\t",
  quote         = "",
  col.names     = c("label", "text"),
  stringsAsFactors = FALSE,
  encoding      = "UTF-8"
)
message("[cleaner] Loaded ", nrow(df_raw), " rows, ", ncol(df_raw), " columns.")

# --- Step 2: Validate labels ---
valid_labels <- c("ham", "spam")
bad_labels   <- df_raw %>% filter(!label %in% valid_labels)
if (nrow(bad_labels) > 0) {
  warning("[cleaner] ", nrow(bad_labels), " rows with unexpected label values. Investigate.")
}

# --- Step 3: Remove exact duplicate rows ---
n_before   <- nrow(df_raw)
df_deduped <- df_raw %>% distinct()
n_removed  <- n_before - nrow(df_deduped)
message("[cleaner] Removed ", n_removed, " exact duplicate rows. Remaining: ", nrow(df_deduped))

# --- Step 4: Trim whitespace ---
df_clean <- df_deduped %>%
  mutate(
    label = str_trim(label),
    text  = str_trim(text)
  )

# --- Step 5: Remove any rows where text is empty after trimming ---
n_before_empty <- nrow(df_clean)
df_clean <- df_clean %>% filter(nchar(text) > 0)
n_empty_removed <- n_before_empty - nrow(df_clean)
if (n_empty_removed > 0) {
  message("[cleaner] Removed ", n_empty_removed, " empty-text rows.")
}

# --- Step 6: Add binary label ---
df_clean <- df_clean %>%
  mutate(spam_label = as.integer(label == "spam"))

# --- Step 7: Add derived text statistics ---
df_clean <- df_clean %>%
  mutate(
    char_count  = nchar(text),
    word_count  = str_count(text, "\\S+")
  )

# --- Step 8: Add entity-presence flag columns (preserved for H.I.V.E.) ---
# These flags mark presence of entities that will be extracted in Phase 4.
# Do NOT strip these from text — flags are supplementary metadata only.
df_clean <- df_clean %>%
  mutate(
    has_url      = as.integer(str_detect(text, "https?://|www\\.")),
    has_phone    = as.integer(str_detect(text, "\\b\\d{7,}\\b")),
    has_currency = as.integer(str_detect(text, "£|\\$|\\bGBP\\b|\\bUSD\\b|\\bINR\\b")),
    has_free     = as.integer(str_detect(tolower(text), "\\bfree\\b")),
    has_urgent   = as.integer(str_detect(tolower(text), "\\burgent\\b")),
    has_prize    = as.integer(str_detect(tolower(text), "\\bwon\\b|\\bwinner\\b|\\bprize\\b|\\bclaim\\b"))
  )

# --- Step 9: Final column order ---
df_clean <- df_clean %>%
  select(label, spam_label, text, char_count, word_count,
         has_url, has_phone, has_currency, has_free, has_urgent, has_prize)

# --- Step 10: Report summary ---
class_dist <- df_clean %>%
  count(label) %>%
  mutate(pct = round(n / sum(n) * 100, 2))

message("[cleaner] Final dataset: ", nrow(df_clean), " rows, ", ncol(df_clean), " columns.")
message("[cleaner] Class distribution after cleaning:")
for (i in seq_len(nrow(class_dist))) {
  message("  ", class_dist$label[i], ": ", class_dist$n[i], " (", class_dist$pct[i], "%)")
}

# --- Step 11: Save processed dataset ---
write.csv(df_clean, PROCESSED_PATH, row.names = FALSE)
message("[cleaner] Saved processed dataset to: ", PROCESSED_PATH)

message("[cleaner] Preprocessing complete.")
