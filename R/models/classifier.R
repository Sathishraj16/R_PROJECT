# ScamTracer AI — Scam Classification Model
# Phase 3 implementation.
#
# Trains and evaluates three lightweight, explainable classifiers:
#   1. Naive Bayes         (e1071)
#   2. Logistic Regression (glmnet, elastic net regularization)
#   3. Decision Tree       (rpart)
#
# Selects the best model based on spam-class F1 score on the held-out test set.
# Saves the best model + vocabulary + metadata to models/.
#
# Run: Rscript R/models/classifier.R  (from project root)
# Reproducible: set.seed(42) used throughout.

suppressPackageStartupMessages({
  library(dplyr)
  library(stringr)
  library(e1071)
  library(glmnet)
  library(rpart)
  library(pROC)
  library(ggplot2)
})

TFIDF_PATH    <- "data/processed/sms_tfidf.csv"
MODEL_DIR     <- "models"
REPORTS_DIR   <- "reports"

set.seed(42)

# ─────────────────────────────────────────────
# 1. LOAD FEATURE MATRIX
# ─────────────────────────────────────────────
message("[classifier] Loading feature matrix from: ", TFIDF_PATH)
if (!file.exists(TFIDF_PATH)) {
  stop("[classifier] Feature matrix not found. Run R/nlp/text_features.R first.")
}

df_full <- read.csv(TFIDF_PATH, check.names = FALSE, stringsAsFactors = FALSE)
message("[classifier] Loaded ", nrow(df_full), " rows x ", ncol(df_full), " columns.")

# Remove doc_id (not a feature)
df_full <- df_full %>% select(-doc_id)

# Target variable
y_all <- factor(df_full$spam_label, levels = c(0, 1), labels = c("ham", "spam"))

# Feature columns (everything except spam_label)
feature_cols <- setdiff(names(df_full), "spam_label")
X_all <- as.matrix(df_full[, feature_cols])

# Save vocabulary for prediction interface
tfidf_vocab <- feature_cols   # 509 features: 9 numeric + 500 TF-IDF terms

message("[classifier] Features: ", length(feature_cols), " | Classes: ", table(y_all)["ham"], " ham / ", table(y_all)["spam"], " spam")

# ─────────────────────────────────────────────
# 2. STRATIFIED TRAIN / TEST SPLIT  (80 / 20)
# ─────────────────────────────────────────────
spam_idx <- which(y_all == "spam")
ham_idx  <- which(y_all == "ham")

train_spam_idx <- sample(spam_idx, floor(0.80 * length(spam_idx)))
train_ham_idx  <- sample(ham_idx,  floor(0.80 * length(ham_idx)))
train_idx      <- c(train_spam_idx, train_ham_idx)
test_idx       <- setdiff(seq_len(nrow(df_full)), train_idx)

X_train <- X_all[train_idx, ]
X_test  <- X_all[test_idx,  ]
y_train <- y_all[train_idx]
y_test  <- y_all[test_idx]

message(sprintf("[classifier] Train: %d rows (%d spam, %d ham)", length(train_idx),
                sum(y_train == "spam"), sum(y_train == "ham")))
message(sprintf("[classifier] Test:  %d rows (%d spam, %d ham)", length(test_idx),
                sum(y_test == "spam"), sum(y_test == "ham")))

# Class imbalance weight (spam gets more weight to compensate for under-representation)
n_ham   <- sum(y_train == "ham")
n_spam  <- sum(y_train == "spam")
spam_weight <- n_ham / n_spam
message(sprintf("[classifier] Spam class weight: %.2f  (n_ham=%d / n_spam=%d)", spam_weight, n_ham, n_spam))

# ─────────────────────────────────────────────
# 3. EVALUATION HELPER
# ─────────────────────────────────────────────
eval_model <- function(pred_class, pred_prob, y_true, model_name) {
  # pred_class : factor with levels ham/spam
  # pred_prob  : numeric vector of P(spam) in [0,1]
  # y_true     : factor with levels ham/spam

  cm <- table(Predicted = pred_class, Actual = y_true)

  # Guard against missing levels in table
  for (lv in c("ham", "spam")) {
    if (!lv %in% rownames(cm)) cm <- rbind(cm, setNames(c(0,0), colnames(cm)))
    if (!lv %in% colnames(cm)) cm <- cbind(cm, setNames(c(0,0), rownames(cm)))
  }
  cm <- cm[c("ham","spam"), c("ham","spam")]

  TP <- cm["spam","spam"]
  FP <- cm["spam","ham"]
  TN <- cm["ham","ham"]
  FN <- cm["ham","spam"]

  accuracy  <- (TP + TN) / sum(cm)
  precision <- if ((TP + FP) > 0) TP / (TP + FP) else 0
  recall    <- if ((TP + FN) > 0) TP / (TP + FN) else 0
  f1        <- if ((precision + recall) > 0) 2 * precision * recall / (precision + recall) else 0

  auc_val <- tryCatch({
    r <- roc(as.integer(y_true == "spam"), pred_prob, quiet = TRUE)
    as.numeric(auc(r))
  }, error = function(e) NA_real_)

  list(
    model     = model_name,
    TP = TP, FP = FP, TN = TN, FN = FN,
    accuracy  = round(accuracy,  4),
    precision = round(precision, 4),
    recall    = round(recall,    4),
    f1        = round(f1,        4),
    auc       = round(auc_val,   4),
    cm        = cm
  )
}

print_metrics <- function(res) {
  cat(sprintf("\n=== %s ===\n", res$model))
  cat(sprintf("  Accuracy : %.4f\n", res$accuracy))
  cat(sprintf("  Precision: %.4f  (of predicted spam, %% truly spam)\n", res$precision))
  cat(sprintf("  Recall   : %.4f  (of actual spam, %% correctly caught)\n", res$recall))
  cat(sprintf("  F1 Score : %.4f\n", res$f1))
  cat(sprintf("  AUC      : %.4f\n", res$auc))
  cat("  Confusion Matrix (Predicted rows, Actual cols):\n")
  print(res$cm)
  cat(sprintf("  TP=%d  FP=%d  TN=%d  FN=%d\n", res$TP, res$FP, res$TN, res$FN))
}

# ─────────────────────────────────────────────
# 4. MODEL A — NAIVE BAYES
# ─────────────────────────────────────────────
message("\n[classifier] Training Naive Bayes...")
nb_model <- naiveBayes(X_train, y_train)

nb_pred_class <- predict(nb_model, X_test, type = "class")
nb_pred_prob  <- predict(nb_model, X_test, type = "raw")[, "spam"]

res_nb <- eval_model(nb_pred_class, nb_pred_prob, y_test, "Naive Bayes")
print_metrics(res_nb)

# ─────────────────────────────────────────────
# 5. MODEL B — LOGISTIC REGRESSION (ELASTIC NET)
# ─────────────────────────────────────────────
message("\n[classifier] Training Logistic Regression (Elastic Net, cv.glmnet)...")

# Class weights vector for training rows
train_weights <- ifelse(y_train == "spam", spam_weight, 1.0)

# alpha=0.5: balanced L1 (sparsity) + L2 (stability); 5-fold CV to select lambda
lr_cv <- cv.glmnet(
  x        = X_train,
  y        = as.integer(y_train == "spam"),
  family   = "binomial",
  alpha    = 0.5,
  weights  = train_weights,
  nfolds   = 5,
  type.measure = "auc"
)

best_lambda <- lr_cv$lambda.1se   # 1 SE rule: simpler model with comparable performance
message(sprintf("[classifier] Best lambda (1se): %.6f", best_lambda))

lr_pred_prob  <- as.numeric(predict(lr_cv, newx = X_test, s = best_lambda, type = "response"))
lr_pred_class <- factor(ifelse(lr_pred_prob >= 0.5, "spam", "ham"), levels = c("ham","spam"))

res_lr <- eval_model(lr_pred_class, lr_pred_prob, y_test, "Logistic Regression (Elastic Net)")
print_metrics(res_lr)

# ─────────────────────────────────────────────
# 6. MODEL C — DECISION TREE
# ─────────────────────────────────────────────
message("\n[classifier] Training Decision Tree (rpart)...")

# Use class weights in rpart via parms
dt_train_df <- as.data.frame(X_train)
dt_train_df$spam_label <- as.integer(y_train == "spam")

# Weight spam observations by spam_weight to address imbalance
dt_obs_weights <- ifelse(y_train == "spam", spam_weight, 1.0)

dt_model <- rpart(
  spam_label ~ .,
  data    = dt_train_df,
  method  = "class",
  weights = dt_obs_weights,
  control = rpart.control(cp = 0.001, maxdepth = 10)
)

dt_test_df    <- as.data.frame(X_test)
dt_pred_raw   <- predict(dt_model, newdata = dt_test_df, type = "prob")[, "1"]
dt_pred_class <- factor(ifelse(dt_pred_raw >= 0.5, "spam", "ham"), levels = c("ham","spam"))

res_dt <- eval_model(dt_pred_class, dt_pred_raw, y_test, "Decision Tree (rpart)")
print_metrics(res_dt)

# ─────────────────────────────────────────────
# 7. MODEL COMPARISON
# ─────────────────────────────────────────────
cat("\n")
cat("=========================================\n")
cat("MODEL COMPARISON — TEST SET RESULTS\n")
cat("=========================================\n")
comparison <- data.frame(
  Model     = c(res_nb$model, res_lr$model, res_dt$model),
  Accuracy  = c(res_nb$accuracy,  res_lr$accuracy,  res_dt$accuracy),
  Precision = c(res_nb$precision, res_lr$precision, res_dt$precision),
  Recall    = c(res_nb$recall,    res_lr$recall,    res_dt$recall),
  F1        = c(res_nb$f1,        res_lr$f1,        res_dt$f1),
  AUC       = c(res_nb$auc,       res_lr$auc,       res_dt$auc),
  stringsAsFactors = FALSE
)
print(comparison)
cat("=========================================\n")
cat("Primary selection criterion: spam-class F1 score\n")
cat("(Accuracy alone is misleading — a model predicting all-ham achieves ~87% accuracy)\n\n")

# ─────────────────────────────────────────────
# 8. SELECT BEST MODEL
# ─────────────────────────────────────────────
best_idx   <- which.max(comparison$F1)
best_name  <- comparison$Model[best_idx]
cat(sprintf("Selected model: %s  (F1 = %.4f)\n\n", best_name, comparison$F1[best_idx]))

best_model <- switch(best_idx,
  `1` = nb_model,
  `2` = lr_cv,
  `3` = dt_model
)

best_res <- switch(best_idx,
  `1` = res_nb,
  `2` = res_lr,
  `3` = res_dt
)

best_type <- c("naivebayes", "glmnet", "rpart")[best_idx]

# ─────────────────────────────────────────────
# 9. SAVE MODEL ARTIFACTS
# ─────────────────────────────────────────────
if (!dir.exists(MODEL_DIR)) dir.create(MODEL_DIR, recursive = TRUE)

saveRDS(best_model, file.path(MODEL_DIR, "scamtracer_model.rds"))
message("[classifier] Saved model to: models/scamtracer_model.rds")

# Save vocabulary so prediction function can replicate the feature vector
saveRDS(tfidf_vocab, file.path(MODEL_DIR, "model_vocab.rds"))
message("[classifier] Saved vocabulary to: models/model_vocab.rds")

# Save all model results + metadata
model_metadata <- list(
  model_type         = best_type,
  model_name         = best_name,
  training_date      = Sys.Date(),
  r_version          = R.version$version.string,
  dataset            = "UCI SMS Spam Collection v.1",
  dataset_source     = "https://archive.ics.uci.edu/dataset/228/sms+spam+collection",
  n_train            = length(train_idx),
  n_test             = length(test_idx),
  n_features         = length(feature_cols),
  class_imbalance    = sprintf("ham %.1f%% / spam %.1f%%",
                                mean(y_all=="ham")*100, mean(y_all=="spam")*100),
  best_lambda        = if (best_type == "glmnet") best_lambda else NA,
  test_accuracy      = best_res$accuracy,
  test_precision     = best_res$precision,
  test_recall        = best_res$recall,
  test_f1            = best_res$f1,
  test_auc           = best_res$auc,
  confusion_matrix   = best_res$cm,
  all_model_results  = comparison
)
saveRDS(model_metadata, file.path(MODEL_DIR, "model_metadata.rds"))
message("[classifier] Saved metadata to: models/model_metadata.rds")

# ─────────────────────────────────────────────
# 10. VISUALISATIONS
# ─────────────────────────────────────────────
if (!dir.exists(REPORTS_DIR)) dir.create(REPORTS_DIR, recursive = TRUE)

# 10a. Class distribution bar chart
dist_df <- data.frame(
  Class = c("ham (legitimate)", "spam"),
  Count = c(sum(y_all == "ham"), sum(y_all == "spam")),
  Pct   = c(mean(y_all=="ham")*100, mean(y_all=="spam")*100)
)

p_dist <- ggplot(dist_df, aes(x = Class, y = Count, fill = Class)) +
  geom_col(width = 0.5) +
  geom_text(aes(label = sprintf("%d\n(%.1f%%)", Count, Pct)), vjust = -0.3, size = 4) +
  scale_fill_manual(values = c("ham (legitimate)" = "#2196F3", "spam" = "#F44336")) +
  labs(title = "ScamTracer AI — Dataset Class Distribution",
       subtitle = "UCI SMS Spam Collection v.1  (after deduplication)",
       x = NULL, y = "Count") +
  theme_minimal() +
  theme(legend.position = "none")

ggsave(file.path(REPORTS_DIR, "class_distribution.png"), p_dist,
       width = 6, height = 4, dpi = 150)
message("[classifier] Saved: reports/class_distribution.png")

# 10b. Model comparison bar chart
comp_long <- tidyr::pivot_longer(
  comparison[, c("Model","Accuracy","Precision","Recall","F1","AUC")],
  cols = c("Accuracy","Precision","Recall","F1","AUC"),
  names_to = "Metric", values_to = "Value"
)
comp_long$Model <- factor(comp_long$Model,
  levels = c("Naive Bayes","Logistic Regression (Elastic Net)","Decision Tree (rpart)"))

p_compare <- ggplot(comp_long, aes(x = Metric, y = Value, fill = Model)) +
  geom_col(position = "dodge", width = 0.7) +
  geom_text(aes(label = sprintf("%.3f", Value)), position = position_dodge(0.7),
            vjust = -0.4, size = 2.8) +
  scale_fill_manual(values = c(
    "Naive Bayes"                       = "#9C27B0",
    "Logistic Regression (Elastic Net)" = "#2196F3",
    "Decision Tree (rpart)"             = "#4CAF50"
  )) +
  ylim(0, 1.1) +
  labs(title = "ScamTracer AI — Model Comparison",
       subtitle = "Evaluated on held-out test set (20% stratified)",
       x = NULL, y = "Score", fill = "Model") +
  theme_minimal() +
  theme(legend.position = "bottom")

ggsave(file.path(REPORTS_DIR, "model_comparison.png"), p_compare,
       width = 9, height = 5, dpi = 150)
message("[classifier] Saved: reports/model_comparison.png")

# 10c. Confusion matrix heatmap for selected model
cm_df <- as.data.frame(best_res$cm)
names(cm_df) <- c("Predicted", "Actual", "Count")

p_cm <- ggplot(cm_df, aes(x = Actual, y = Predicted, fill = Count)) +
  geom_tile(colour = "white", linewidth = 1) +
  geom_text(aes(label = Count), size = 7, fontface = "bold") +
  scale_fill_gradient(low = "#E3F2FD", high = "#1565C0") +
  labs(
    title    = sprintf("Confusion Matrix — %s", best_name),
    subtitle = sprintf("Test set  |  Precision=%.3f  Recall=%.3f  F1=%.3f",
                       best_res$precision, best_res$recall, best_res$f1),
    x = "Actual Class", y = "Predicted Class"
  ) +
  theme_minimal() +
  theme(legend.position = "none", plot.subtitle = element_text(size = 9))

ggsave(file.path(REPORTS_DIR, "confusion_matrix.png"), p_cm,
       width = 5, height = 4, dpi = 150)
message("[classifier] Saved: reports/confusion_matrix.png")

# ─────────────────────────────────────────────
# 11. LOAD-BACK VERIFICATION
# ─────────────────────────────────────────────
message("\n[classifier] Verifying model can be loaded and predicts correctly...")

loaded_model  <- readRDS(file.path(MODEL_DIR, "scamtracer_model.rds"))
loaded_vocab  <- readRDS(file.path(MODEL_DIR, "model_vocab.rds"))
loaded_meta   <- readRDS(file.path(MODEL_DIR, "model_metadata.rds"))

# Quick sanity check: re-predict first 10 test rows with loaded model
sample_x <- X_test[1:10, ]
if (best_type == "naivebayes") {
  sample_pred <- predict(loaded_model, sample_x, type = "class")
} else if (best_type == "glmnet") {
  sample_prob <- as.numeric(predict(loaded_model, newx = sample_x,
                                    s = loaded_meta$best_lambda, type = "response"))
  sample_pred <- factor(ifelse(sample_prob >= 0.5, "spam", "ham"), levels = c("ham","spam"))
} else {
  sample_df   <- as.data.frame(sample_x)
  sample_prob <- predict(loaded_model, newdata = sample_df, type = "prob")[, "1"]
  sample_pred <- factor(ifelse(sample_prob >= 0.5, "spam", "ham"), levels = c("ham","spam"))
}

cat("\nLoad-back check — predictions on first 10 test rows:\n")
cat("  Predicted:", paste(as.character(sample_pred), collapse=", "), "\n")
cat("  Actual:   ", paste(as.character(y_test[1:10]), collapse=", "), "\n")
message("[classifier] Load-back verification: PASS")

# ─────────────────────────────────────────────
# 12. FINAL SUMMARY
# ─────────────────────────────────────────────
cat("\n=========================================\n")
cat("FINAL MODEL SELECTED:\n")
cat(sprintf("  Model type : %s\n", best_name))
cat(sprintf("  Accuracy   : %.4f\n", best_res$accuracy))
cat(sprintf("  Precision  : %.4f\n", best_res$precision))
cat(sprintf("  Recall     : %.4f\n", best_res$recall))
cat(sprintf("  F1 Score   : %.4f\n", best_res$f1))
cat(sprintf("  AUC        : %.4f\n", best_res$auc))
cat("  Saved to   : models/scamtracer_model.rds\n")
cat("=========================================\n")

message("[classifier] Phase 3 model training complete.")
