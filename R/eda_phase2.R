# ScamTracer AI — Phase 2 EDA Script
# Purpose: Initial exploratory data analysis of the UCI SMS Spam Collection.
# Run from project root: Rscript R/eda_phase2.R
# Output: prints to console; saves summary to docs/eda_summary.txt

library(dplyr)
library(tidyr)
library(stringr)
library(ggplot2)

cat("=== ScamTracer AI — Phase 2 EDA ===\n\n")

# --- Load dataset ---
raw_path <- "data/raw/SMSSpamCollection"
if (!file.exists(raw_path)) stop("Raw dataset not found at: ", raw_path)

df <- read.delim(
  raw_path,
  header = FALSE,
  sep = "\t",
  quote = "",
  col.names = c("label", "text"),
  stringsAsFactors = FALSE,
  encoding = "UTF-8"
)

cat("--- 1. Basic Structure ---\n")
cat("Rows:   ", nrow(df), "\n")
cat("Columns:", ncol(df), "\n")
cat("Column names:", paste(names(df), collapse = ", "), "\n")
cat("Column types:", paste(sapply(df, class), collapse = ", "), "\n\n")

cat("--- 2. Class Distribution ---\n")
class_dist <- df %>%
  count(label) %>%
  mutate(pct = round(n / sum(n) * 100, 2))
print(class_dist)
cat("\n")

cat("--- 3. Missing Values ---\n")
na_label <- sum(is.na(df$label) | df$label == "")
na_text  <- sum(is.na(df$text)  | df$text  == "")
cat("Missing/empty label:", na_label, "\n")
cat("Missing/empty text: ", na_text,  "\n\n")

cat("--- 4. Duplicate Records ---\n")
n_dupes <- sum(duplicated(df))
cat("Exact duplicate rows:", n_dupes, "\n")
text_dupes <- sum(duplicated(df$text))
cat("Duplicate text values (same message, any label):", text_dupes, "\n\n")

cat("--- 5. Text Length Statistics ---\n")
df <- df %>%
  mutate(
    char_count  = nchar(text),
    word_count  = str_count(text, "\\S+")
  )

len_stats <- df %>%
  group_by(label) %>%
  summarise(
    n           = n(),
    min_chars   = min(char_count),
    max_chars   = max(char_count),
    mean_chars  = round(mean(char_count), 1),
    median_chars= median(char_count),
    min_words   = min(word_count),
    max_words   = max(word_count),
    mean_words  = round(mean(word_count), 1),
    .groups     = "drop"
  )
print(as.data.frame(len_stats))
cat("\n")

cat("--- 6. Very Short Messages (< 5 chars) ---\n")
short_msgs <- df %>% filter(char_count < 5)
cat("Count:", nrow(short_msgs), "\n")
if (nrow(short_msgs) > 0) print(short_msgs)
cat("\n")

cat("--- 7. Very Long Messages (> 500 chars) ---\n")
long_msgs <- df %>% filter(char_count > 500)
cat("Count:", nrow(long_msgs), "\n\n")

cat("--- 8. Label Value Check ---\n")
unique_labels <- unique(df$label)
cat("Unique label values:", paste(unique_labels, collapse = ", "), "\n\n")

cat("--- 9. Sample Messages by Class ---\n")
cat("== HAM (3 samples) ==\n")
set.seed(42)
ham_sample <- df %>% filter(label == "ham") %>% slice_sample(n = 3)
for (i in seq_len(nrow(ham_sample))) {
  cat(sprintf("  [%d] %s\n", i, substr(ham_sample$text[i], 1, 120)))
}
cat("\n== SPAM (3 samples) ==\n")
spam_sample <- df %>% filter(label == "spam") %>% slice_sample(n = 3)
for (i in seq_len(nrow(spam_sample))) {
  cat(sprintf("  [%d] %s\n", i, substr(spam_sample$text[i], 1, 120)))
}
cat("\n")

cat("--- 10. Special Entity Presence (regex preview) ---\n")
df <- df %>%
  mutate(
    has_url        = str_detect(text, "https?://|www\\.|http"),
    has_phone      = str_detect(text, "\\b\\d{5,}\\b"),
    has_currency   = str_detect(text, "£|\\$|\\bGBP\\b|\\bUSD\\b"),
    has_free       = str_detect(tolower(text), "\\bfree\\b"),
    has_urgent     = str_detect(tolower(text), "\\burgent\\b|\\burgen\\b"),
    has_prize      = str_detect(tolower(text), "\\bwon\\b|\\bwinner\\b|\\bprize\\b|\\bclaim\\b")
  )

entity_summary <- df %>%
  group_by(label) %>%
  summarise(
    url_pct     = round(mean(has_url)      * 100, 1),
    phone_pct   = round(mean(has_phone)    * 100, 1),
    currency_pct= round(mean(has_currency) * 100, 1),
    free_pct    = round(mean(has_free)     * 100, 1),
    urgent_pct  = round(mean(has_urgent)   * 100, 1),
    prize_pct   = round(mean(has_prize)    * 100, 1),
    .groups     = "drop"
  )
cat("% of messages containing entity type, by class:\n")
print(as.data.frame(entity_summary))
cat("\n")

cat("=== EDA COMPLETE ===\n")
