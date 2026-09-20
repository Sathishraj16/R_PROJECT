# ScamTracer AI — Phase 10 Test Suite
# Dashboard: file existence, data loading, output structure, rendering
#
# Run: Rscript tests/test_dashboard.R
# Must be run from E:/R PROJECT (project root).
# Does NOT require Node.js or R Plumber to be running.

cat("════════════════════════════════════════════════════════════════\n")
cat("ScamTracer AI — Phase 10 Test Suite: Shiny Dashboard\n")
cat("════════════════════════════════════════════════════════════════\n\n")

setwd("E:/R PROJECT")

pass_count <- 0L
fail_count <- 0L

.check <- function(label, condition, result_val = NULL) {
  status <- if (isTRUE(condition)) {
    pass_count <<- pass_count + 1L; "PASS"
  } else {
    fail_count <<- fail_count + 1L; "FAIL"
  }
  val_str <- if (!is.null(result_val)) paste0(" [", result_val, "]") else ""
  cat(sprintf("  [%s] %s%s\n", status, label, val_str))
}

# ── Case A: Required dashboard files exist ────────────────────────────────────
cat("\n── Case A: Dashboard file existence ──\n")
{
  .check("A1  dashboard/app.R exists",     file.exists("dashboard/app.R"))
  .check("A2  dashboard/ui.R exists",      file.exists("dashboard/ui.R"))
  .check("A3  dashboard/server.R exists",  file.exists("dashboard/server.R"))
  .check("A4  dashboard/helpers.R exists", file.exists("dashboard/helpers.R"))
}

# ── Case B: helpers.R sources without error ───────────────────────────────────
cat("\n── Case B: helpers.R loads cleanly ──\n")
{
  src_ok <- tryCatch({
    suppressPackageStartupMessages(source("dashboard/helpers.R"))
    TRUE
  }, error = function(e) { message("  ERROR: ", conditionMessage(e)); FALSE })
  .check("B1  helpers.R sources without error", isTRUE(src_ok))
  .check("B2  setup_analytics() exists",       exists("setup_analytics", mode = "function"))
  .check("B3  load_demo_data() exists",        exists("load_demo_data",  mode = "function"))
  .check("B4  format_entity_table() exists",   exists("format_entity_table",   mode = "function"))
  .check("B5  format_behaviour_table() exists",exists("format_behaviour_table", mode = "function"))
  .check("B6  behaviour_frequency_chart() exists", exists("behaviour_frequency_chart", mode = "function"))
  .check("B7  entity_type_chart() exists",     exists("entity_type_chart",     mode = "function"))
}

# ── Case C: Analytics engines load ───────────────────────────────────────────
cat("\n── Case C: Analytics engines load via setup_analytics() ──\n")
{
  setup_ok <- tryCatch({
    setup_analytics()
    TRUE
  }, error = function(e) { message("  ERROR: ", conditionMessage(e)); FALSE })
  .check("C1  setup_analytics() completes without error", isTRUE(setup_ok))
  .check("C2  analyze_risk() available",         exists("analyze_risk",         mode = "function"))
  .check("C3  extract_entities() available",     exists("extract_entities",     mode = "function"))
  .check("C4  analyze_behaviour() available",    exists("analyze_behaviour",    mode = "function"))
  .check("C5  investigate_session() available",  exists("investigate_session",  mode = "function"))
}

# ── Case D: Demo data loads and has required structure ────────────────────────
cat("\n── Case D: load_demo_data() structure ──\n")
{
  demo <- tryCatch(load_demo_data(), error = function(e) {
    message("  ERROR: ", conditionMessage(e)); NULL
  })
  .check("D1  load_demo_data() returns non-NULL",    !is.null(demo))
  .check("D2  demo$scenario present",                !is.null(demo) && !is.null(demo$scenario))
  .check("D3  demo$initial_msg non-empty",           !is.null(demo) && nchar(demo$initial_msg) > 0L)
  .check("D4  demo$risk is a list",                  !is.null(demo) && is.list(demo$risk))
  .check("D5  demo$conversation non-empty",          !is.null(demo) && length(demo$conversation) > 0L)
  .check("D6  demo$investigation non-NULL",          !is.null(demo) && !is.null(demo$investigation))
}

# ── Case E: Risk information is present ──────────────────────────────────────
cat("\n── Case E: Risk information ──\n")
{
  risk <- if (!is.null(demo)) demo$risk else list()
  .check("E1  risk_score present and numeric",  !is.null(risk$risk_score)   && is.numeric(risk$risk_score))
  .check("E2  risk_level present",              !is.null(risk$risk_level)   && nchar(risk$risk_level) > 0L,
         risk$risk_level)
  .check("E3  prediction present",              !is.null(risk$prediction)   && nchar(risk$prediction) > 0L,
         risk$prediction)
  .check("E4  model_probability in [0,1]",      !is.null(risk$model_probability) &&
           risk$model_probability >= 0 && risk$model_probability <= 1)
  .check("E5  risk_score in valid range [0,100]",
         !is.null(risk$risk_score) && risk$risk_score >= 0 && risk$risk_score <= 100,
         risk$risk_score)
}

# ── Case F: H.I.V.E. conversation is present and correct ─────────────────────
cat("\n── Case F: Conversation structure ──\n")
{
  convo <- if (!is.null(demo)) demo$conversation else list()
  .check("F1  conversation has 10 messages (5 turns × 2)", length(convo) == 10L, length(convo))
  .check("F2  first message is INCOMING",
         length(convo) > 0L && identical(convo[[1]]$direction, "INCOMING"))
  .check("F3  second message is OUTGOING",
         length(convo) > 1L && identical(convo[[2]]$direction, "OUTGOING"))
  .check("F4  all messages have non-empty text",
         all(vapply(convo, function(m) nchar(trimws(m$text)) > 0L, logical(1L))))
  .check("F5  all turns have turn number",
         all(vapply(convo, function(m) !is.null(m$turn) && !is.na(m$turn), logical(1L))))
  # Verify H.I.V.E. response does not contain OTPs, passwords, credentials
  outgoing_texts <- paste(
    vapply(Filter(function(m) m$direction == "OUTGOING", convo), function(m) m$text, character(1L)),
    collapse = " "
  )
  .check("F6  OUTGOING responses contain no OTP values (digit strings)",
         !grepl("\\b\\d{6}\\b", outgoing_texts))
  .check("F7  OUTGOING responses contain no password tokens",
         !grepl("my password is|pin is|otp is \\d", outgoing_texts, ignore.case = TRUE))
}

# ── Case G: Intelligence entities from Phase 9 ────────────────────────────────
cat("\n── Case G: Intelligence entities ──\n")
{
  inv      <- if (!is.null(demo)) demo$investigation else list()
  entities <- if (!is.null(inv$intelligence)) inv$intelligence else list()
  .check("G1  intelligence entities non-empty",    length(entities) > 0L, length(entities))
  .check("G2  n_entities matches actual count",
         !is.null(inv$summary) && inv$summary$n_entities == length(entities))

  # UPI_ID should be found (verifyaccount@fakebank)
  upis <- Filter(function(e) e$entity_type == "UPI_ID", entities)
  .check("G3  UPI_ID entity found",                length(upis) >= 1L, length(upis))
  .check("G4  UPI_ID value contains @fakebank",
         length(upis) > 0L && grepl("@fakebank", upis[[1]]$value))

  # URL should be found (http://fakesecure-verify.fictional/confirm)
  urls <- Filter(function(e) e$entity_type == "URL", entities)
  .check("G5  URL entity found",                   length(urls) >= 1L)
  .check("G6  URL starts with http",
         length(urls) > 0L && grepl("^http", urls[[1]]$value))

  # OTP_REQUEST should be detected
  otps <- Filter(function(e) e$entity_type == "OTP_REQUEST", entities)
  .check("G7  OTP_REQUEST entity found",           length(otps) >= 1L)

  # PAYMENT_REQUEST should be detected
  pays <- Filter(function(e) e$entity_type == "PAYMENT_REQUEST", entities)
  .check("G8  PAYMENT_REQUEST entity found",       length(pays) >= 1L)

  # All entities must have provenance fields
  .check("G9  all entities have entity_type, value, source_text, turn, direction",
         all(vapply(entities, function(e) {
           !is.null(e$entity_type) && !is.null(e$value) &&
           !is.null(e$source_text) && !is.null(e$turn) && !is.null(e$direction)
         }, logical(1L))))
}

# ── Case H: Behaviour records from Phase 9 ───────────────────────────────────
cat("\n── Case H: Behaviour records ──\n")
{
  inv        <- if (!is.null(demo)) demo$investigation else list()
  behaviours <- if (!is.null(inv$behaviour)) inv$behaviour else list()
  .check("H1  behaviour records non-empty",        length(behaviours) > 0L, length(behaviours))
  .check("H2  n_behaviours matches actual count",
         !is.null(inv$summary) && inv$summary$n_behaviours == length(behaviours))

  types <- vapply(behaviours, function(b) b$behaviour, character(1L))
  .check("H3  URGENCY detected",         "URGENCY"       %in% types)
  .check("H4  THREAT detected",          "THREAT"        %in% types)
  .check("H5  IMPERSONATION detected",   "IMPERSONATION" %in% types)
  .check("H6  ESCALATION detected",      "ESCALATION"    %in% types)
  .check("H7  REPEATED_REQUEST detected","REPEATED_REQUEST" %in% types)

  .check("H8  all behaviour records have required fields",
         all(vapply(behaviours, function(b) {
           !is.null(b$behaviour) && !is.null(b$severity) &&
           !is.null(b$evidence) && !is.null(b$turn)
         }, logical(1L))))
}

# ── Case I: Investigation summary is present ──────────────────────────────────
cat("\n── Case I: Investigation summary ──\n")
{
  inv  <- if (!is.null(demo)) demo$investigation else list()
  smry <- if (!is.null(inv$summary)) inv$summary else list()
  .check("I1  summary present",                    !is.null(smry))
  .check("I2  statements non-empty",               length(smry$statements) > 0L)
  .check("I3  escalation_detected is TRUE",        isTRUE(smry$escalation_detected))
  .check("I4  repeated_requests is TRUE",          isTRUE(smry$repeated_requests))
  .check("I5  n_turns_analysed is 5",              !is.null(smry$n_turns_analysed) && smry$n_turns_analysed == 5L,
         smry$n_turns_analysed)
  stmts <- unlist(smry$statements)
  .check("I6  no statement says 'this is a scammer'",
         !any(grepl("this is a scammer|definitely a scammer", stmts, ignore.case = TRUE)))
  .check("I7  statements use cautious 'Observed' language",
         any(grepl("^Observed", stmts)))
  cat("\n  Sample statements:\n")
  for (stmt in head(stmts, 4L)) cat(sprintf("    - %s\n", stmt))
}

# ── Case J: Table formatters work correctly ───────────────────────────────────
cat("\n── Case J: Table formatters ──\n")
{
  inv      <- if (!is.null(demo)) demo$investigation else list()
  entities <- if (!is.null(inv$intelligence)) inv$intelligence else list()
  beh      <- if (!is.null(inv$behaviour))    inv$behaviour    else list()

  df_ent <- format_entity_table(entities, "All")
  .check("J1  format_entity_table returns data.frame",    is.data.frame(df_ent))
  .check("J2  entity data.frame has Type column",         "Type" %in% names(df_ent))
  .check("J3  entity data.frame non-empty",               nrow(df_ent) > 0L, nrow(df_ent))

  df_ent_filtered <- format_entity_table(entities, "UPI_ID")
  .check("J4  entity filter by UPI_ID works",             nrow(df_ent_filtered) >= 1L)

  df_beh <- format_behaviour_table(beh)
  .check("J5  format_behaviour_table returns data.frame", is.data.frame(df_beh))
  .check("J6  behaviour data.frame has Behaviour column", "Behaviour" %in% names(df_beh))
  .check("J7  behaviour data.frame non-empty",            nrow(df_beh) > 0L, nrow(df_beh))

  df_conv <- format_conversation_table(demo$conversation)
  .check("J8  format_conversation_table returns data.frame", is.data.frame(df_conv))
  .check("J9  conversation data.frame has 10 rows",           nrow(df_conv) == 10L, nrow(df_conv))
}

# ── Case K: Chart renderers produce ggplot objects ────────────────────────────
cat("\n── Case K: Chart renderers ──\n")
{
  inv      <- if (!is.null(demo)) demo$investigation else list()
  entities <- if (!is.null(inv$intelligence)) inv$intelligence else list()
  beh      <- if (!is.null(inv$behaviour))    inv$behaviour    else list()

  suppressPackageStartupMessages(library(ggplot2))

  p_beh <- tryCatch(behaviour_frequency_chart(beh),  error = function(e) NULL)
  .check("K1  behaviour_frequency_chart() returns ggplot",
         !is.null(p_beh) && inherits(p_beh, "gg"))

  p_ent <- tryCatch(entity_type_chart(entities),      error = function(e) NULL)
  .check("K2  entity_type_chart() returns ggplot",
         !is.null(p_ent) && inherits(p_ent, "gg"))

  # Empty data does not crash
  p_empty_beh <- tryCatch(behaviour_frequency_chart(list()), error = function(e) NULL)
  .check("K3  behaviour_frequency_chart(empty) returns ggplot (no crash)",
         !is.null(p_empty_beh) && inherits(p_empty_beh, "gg"))

  p_empty_ent <- tryCatch(entity_type_chart(list()),  error = function(e) NULL)
  .check("K4  entity_type_chart(empty) returns ggplot (no crash)",
         !is.null(p_empty_ent) && inherits(p_empty_ent, "gg"))
}

# ── Case L: UI and server objects are valid Shiny objects ─────────────────────
cat("\n── Case L: Shiny app.R sources correctly ──\n")
{
  suppressPackageStartupMessages(library(shiny))

  ui_ok <- tryCatch({
    source("dashboard/ui.R")
    exists("ui") && !is.null(ui)
  }, error = function(e) { message("  ERROR in ui.R: ", conditionMessage(e)); FALSE })
  .check("L1  ui.R sources and defines 'ui'", isTRUE(ui_ok))
  .check("L2  ui is a valid Shiny UI object",
         isTRUE(ui_ok) && inherits(ui, c("shiny.tag", "shiny.tag.list", "shiny.tagList", "html")))

  srv_ok <- tryCatch({
    source("dashboard/server.R")
    exists("server") && is.function(server)
  }, error = function(e) { message("  ERROR in server.R: ", conditionMessage(e)); FALSE })
  .check("L3  server.R sources and defines 'server'", isTRUE(srv_ok))
  .check("L4  server is a function",                   isTRUE(srv_ok))

  app_ok <- tryCatch({
    app <- shinyApp(ui = ui, server = server)
    inherits(app, "shiny.appobj")
  }, error = function(e) { message("  ERROR creating shinyApp: ", conditionMessage(e)); FALSE })
  .check("L5  shinyApp(ui, server) creates valid app object", isTRUE(app_ok))
}

# ── Case M: Empty/missing data does not crash helpers ─────────────────────────
cat("\n── Case M: Graceful handling of edge cases ──\n")
{
  .check("M1  format_entity_table(empty) returns 0-row data.frame",
         {df <- format_entity_table(list()); is.data.frame(df) && nrow(df) == 0L})

  .check("M2  format_behaviour_table(empty) returns 0-row data.frame",
         {df <- format_behaviour_table(list()); is.data.frame(df) && nrow(df) == 0L})

  .check("M3  format_conversation_table(empty) returns 0-row data.frame",
         {df <- format_conversation_table(list()); is.data.frame(df) && nrow(df) == 0L})

  .check("M4  risk_colour('HIGH') returns red hex",
         grepl("^#[0-9a-fA-F]{6}$", risk_colour("HIGH")))

  .check("M5  risk_colour('UNKNOWN') returns hex",
         grepl("^#[0-9a-fA-F]{6}$", risk_colour("UNKNOWN")))

  .check("M6  .hive_select_strategy works for OTP message",
         identical(.hive_select_strategy("please share the 6-digit OTP"), "otp_deflection"))

  .check("M7  .hive_select_strategy works for URL message",
         identical(.hive_select_strategy("click http://fake.url/confirm"), "url_probe"))
}

# ── Results ───────────────────────────────────────────────────────────────────
cat("\n════════════════════════════════════════════════════════════════\n")
cat(sprintf("PHASE 10 TEST SUMMARY: %d / %d passed  (%d failed)\n",
            pass_count, pass_count + fail_count, fail_count))
cat("════════════════════════════════════════════════════════════════\n")

if (fail_count > 0L) {
  cat("SOME CHECKS FAILED.\n")
  quit(status = 1L)
} else {
  cat("ALL CHECKS PASSED.\n")
  quit(status = 0L)
}
