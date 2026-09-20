# ScamTracer AI — NLP Feature Preparation
# Phase 2 implementation.
#
# Input:  data/processed/sms_cleaned.csv
# Output: data/processed/sms_tfidf.csv  (TF-IDF feature matrix)
#         data/processed/sms_tokens.csv (tokenized long-form data, for inspection)
#
# What this script does:
#   1. Load the cleaned dataset.
#   2. Tokenize text into individual words.
#   3. Remove stop words — with deliberate exceptions for scam-relevant terms
#      (e.g. "free", "win", "call", "now", "claim" are kept because they are
#      strong scam signals and would be lost if stripped by a default stop list).
#   4. Compute term frequency (TF) per document.
#   5. Compute TF-IDF across the corpus.
#   6. Add baseline numeric features from cleaner output
#      (char_count, word_count, has_url, has_phone, etc.)
#   7. Save the wide TF-IDF feature matrix for use in Phase 3 (model training).
#
# Run: Rscript R/nlp/text_features.R  (from project root)
# Phase 3 (model training) will source() this script or load its output CSV.

library(dplyr)
library(tidyr)
library(stringr)
library(tidytext)

CLEANED_PATH <- "data/processed/sms_cleaned.csv"
TOKENS_PATH  <- "data/processed/sms_tokens.csv"
TFIDF_PATH   <- "data/processed/sms_tfidf.csv"

message("[text_features] Loading cleaned dataset from: ", CLEANED_PATH)
if (!file.exists(CLEANED_PATH)) {
  stop("[text_features] Cleaned dataset not found. Run R/preprocessing/cleaner.R first.")
}

df <- read.csv(CLEANED_PATH, stringsAsFactors = FALSE)
message("[text_features] Loaded ", nrow(df), " rows.")

# --- Step 1: Add a row ID for pivoting back to wide format ---
df <- df %>% mutate(doc_id = row_number())

# --- Step 2: Lowercase text for NLP (original text preserved in df$text) ---
df <- df %>% mutate(text_lower = tolower(text))

# --- Step 3: Tokenise into unigrams ---
message("[text_features] Tokenising...")
tokens <- df %>%
  select(doc_id, spam_label, text_lower) %>%
  unnest_tokens(word, text_lower)

message("[text_features] Total tokens: ", nrow(tokens))

# --- Step 4: Remove stop words, with domain exceptions ---
# tidytext's stop_words uses the SMART lexicon by default.
# We explicitly KEEP words that are strong scam/spam signals.
scam_keywords_keep <- c(
  "free", "win", "won", "winner", "prize", "claim", "cash", "money",
  "urgent", "call", "now", "immediately", "stop", "cancel",
  "credit", "loan", "award", "reward", "bonus", "selected",
  "guaranteed", "offer", "limited", "expires", "apply",
  "account", "verify", "update", "confirm", "bank", "password",
  "otp", "upi", "kyc", "neft", "imps", "blocked"
)

custom_stop_words <- stop_words %>%
  filter(!word %in% scam_keywords_keep)

tokens_filtered <- tokens %>%
  anti_join(custom_stop_words, by = "word") %>%
  filter(
    !str_detect(word, "^\\d+$"),   # remove pure number tokens
    str_length(word) > 1           # remove single-character tokens
  )

message("[text_features] Tokens after stop-word removal: ", nrow(tokens_filtered))

# --- Step 5: Save long-form token data (useful for inspection and word clouds) ---
write.csv(tokens_filtered, TOKENS_PATH, row.names = FALSE)
message("[text_features] Saved token data to: ", TOKENS_PATH)

# --- Step 6: Compute TF-IDF ---
message("[text_features] Computing TF-IDF...")

tfidf_long <- tokens_filtered %>%
  count(doc_id, word, name = "n") %>%
  bind_tf_idf(word, doc_id, n)

# --- Step 7: Select top N terms by maximum TF-IDF across corpus ---
# We limit to the top 500 terms to keep the feature matrix manageable
# for laptop-scale ML training (Naive Bayes, Logistic Regression, SVM).
# This can be tuned in Phase 3 after model evaluation.
TOP_N_TERMS <- 500

top_terms <- tfidf_long %>%
  group_by(word) %>%
  summarise(max_tfidf = max(tf_idf), .groups = "drop") %>%
  arrange(desc(max_tfidf)) %>%
  slice_head(n = TOP_N_TERMS) %>%
  pull(word)

message("[text_features] Top-", TOP_N_TERMS, " terms selected for feature matrix.")

# --- Step 8: Pivot to wide format (document × term matrix) ---
tfidf_wide <- tfidf_long %>%
  filter(word %in% top_terms) %>%
  select(doc_id, word, tf_idf) %>%
  pivot_wider(
    names_from   = word,
    values_from  = tf_idf,
    values_fill  = 0
  )

# --- Step 9: Join back baseline numeric features ---
baseline_cols <- df %>%
  select(doc_id, spam_label, char_count, word_count,
         has_url, has_phone, has_currency, has_free, has_urgent, has_prize)

feature_matrix <- baseline_cols %>%
  left_join(tfidf_wide, by = "doc_id")

# Fill any remaining NAs in TF-IDF columns with 0 (docs with no top-term matches)
feature_matrix[is.na(feature_matrix)] <- 0

message("[text_features] Feature matrix: ", nrow(feature_matrix), " rows x ", ncol(feature_matrix), " columns.")

# --- Step 10: Save feature matrix ---
write.csv(feature_matrix, TFIDF_PATH, row.names = FALSE)
message("[text_features] Saved TF-IDF feature matrix to: ", TFIDF_PATH)

# --- Step 11: Quick sanity check ---
spam_ratio <- mean(feature_matrix$spam_label)
message("[text_features] Spam proportion in feature matrix: ", round(spam_ratio * 100, 2), "%")

message("[text_features] NLP feature preparation complete.")
