# ScamTracer AI — renv Setup Script
# Run this script ONCE after installing R to initialize reproducible package management.
#
# Prerequisites:
#   - R >= 4.0.0 installed
#   - Internet access
#
# Instructions:
#   1. Open R or RStudio in the project root directory (E:\R PROJECT\)
#   2. Run: source("renv_setup.R")
#   OR from terminal: Rscript renv_setup.R
#
# What this does:
#   - Installs renv (if not already available)
#   - Initializes renv for this project
#   - Installs the required packages listed below
#   - Creates renv.lock for reproducibility
#
# To restore the environment on another machine later:
#   Rscript -e "renv::restore()"

# --- Set CRAN mirror ---
options(repos = c(CRAN = "https://cloud.r-project.org"))

# --- Install renv if not present ---
if (!requireNamespace("renv", quietly = TRUE)) {
  install.packages("renv")
}

# --- Initialize renv ---
renv::init(bare = TRUE)

# --- Required packages for ScamTracer AI ---
required_packages <- c(
  "dplyr",      # data manipulation
  "tidyr",      # data tidying
  "stringr",    # string processing
  "tidytext",   # NLP / text mining
  "ggplot2",    # visualization
  "igraph",     # network/graph analysis
  "ggraph",     # graph visualization
  "tidygraph",  # tidy graph manipulation
  "plumber",    # REST API
  "shiny"       # interactive dashboard
)

# --- Install packages via renv ---
renv::install(required_packages)

# --- Snapshot the environment ---
renv::snapshot()

message("renv setup complete. Run renv::restore() on any new machine to reproduce this environment.")
