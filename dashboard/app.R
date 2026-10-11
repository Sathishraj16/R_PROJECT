# ScamTracer AI — Investigation Dashboard (Phase 10)
#
# Launch from E:/R PROJECT:
#   Rscript -e 'shiny::runApp("dashboard", port=4000, launch.browser=FALSE)'
#
# Or with auto-open:
#   Rscript -e 'shiny::runApp("dashboard", port=4000)'
#
# Prerequisites:
#   1. R packages installed (renv::restore())
#   2. Model files present in models/  (run R/models/classifier.R if absent)
#   3. Demo scenario at data/demo/hive_demo_scenario.json (included in repo)
#   NOTE: R Plumber and Node.js do NOT need to be running for the dashboard.
#         The dashboard calls R analytics functions directly.

library(shiny)

# ── Working directory: must be project root for all relative paths ────────────
local({
  candidates <- c(
    normalizePath(getwd(),                  mustWork = FALSE),
    normalizePath(file.path(getwd(), ".."), mustWork = FALSE),
    "E:/R PROJECT"
  )
  for (p in candidates) {
    anchor <- file.path(normalizePath(p, mustWork = FALSE), "models/scamtracer_model.rds")
    if (file.exists(anchor)) {
      setwd(normalizePath(p, mustWork = FALSE))
      message("[app] Project root: ", getwd())
      break
    }
  }
})

# ── Source dashboard components ────────────────────────────────────────────────
source("dashboard/helpers.R")

# Source analytics engines before defining UI/server
# (ui.R/server.R reference helper functions from helpers.R)
tryCatch(
  setup_analytics(),
  error = function(e) {
    message("[app] WARNING — analytics setup failed: ", conditionMessage(e),
            "\nDashboard will load but analysis outputs may be empty.")
  }
)

source("dashboard/ui.R")
source("dashboard/server.R")

# ── Launch ────────────────────────────────────────────────────────────────────
# Ensure completed sessions directory exists (Node.js writes here; dashboard reads it)
dir.create("data/completed_sessions", recursive = TRUE, showWarnings = FALSE)

shinyApp(ui = ui, server = server)
