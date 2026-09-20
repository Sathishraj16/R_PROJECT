pr <- plumber::plumb("R/api/plumber.R")
pr$run(host = "0.0.0.0", port = 8000)
