# ScamTracer AI — Dashboard Server (Phase 11)
# Loads demo data once on startup, drives all seven dashboard sections.
# Tab 7 (Live Monitor) polls the Node.js server for WhatsApp alerts every 2s.

server <- function(input, output, session) {

  # ── Load and cache demo data ─────────────────────────────────────────────────
  demo <- local({
    d <- tryCatch(
      load_demo_data(),
      error = function(e) {
        message("[server] FATAL: load_demo_data() failed — ", conditionMessage(e))
        NULL
      }
    )
    d
  })

  # Shortcut accessors (NULL-safe)
  .risk  <- function() if (!is.null(demo)) demo$risk         else list()
  .inv   <- function() if (!is.null(demo)) demo$investigation else list()
  .convo <- function() if (!is.null(demo)) demo$conversation  else list()
  .smry  <- function() {
    inv <- .inv()
    if (!is.null(inv$summary)) inv$summary else list()
  }

  # ── Tab 1: Overview / Risk ───────────────────────────────────────────────────

  output$overview_message_box <- renderUI({
    msg <- if (!is.null(demo)) demo$initial_msg else "Demo data not loaded."
    div(style = "background:#f8f9fa; border-left:4px solid #e74c3c; padding:12px 16px;
                 border-radius:0 6px 6px 0; font-size:14px; color:#2c3e50;",
        tags$em('"', msg, '"'))
  })

  output$risk_score_val <- renderUI({
    r <- .risk()
    val <- if (!is.null(r$risk_score) && !is.na(r$risk_score)) r$risk_score else "?"
    span(as.character(val))
  })

  output$ml_prob_val <- renderUI({
    r <- .risk()
    val <- if (!is.null(r$model_probability) && !is.na(r$model_probability))
             sprintf("%.3f", r$model_probability) else "?"
    span(val)
  })

  output$ml_score_val <- renderUI({
    r <- .risk()
    val <- if (!is.null(r$ml_score) && !is.na(r$ml_score))
             sprintf("%.1f", r$ml_score) else "?"
    span(val)
  })

  output$ind_score_val <- renderUI({
    r <- .risk()
    val <- if (!is.null(r$indicator_score) && !is.na(r$indicator_score))
             as.character(r$indicator_score) else "?"
    span(val)
  })

  output$risk_level_badge <- renderUI({
    r     <- .risk()
    level <- if (!is.null(r$risk_level)) r$risk_level else "UNKNOWN"
    col   <- risk_colour(level)
    span(class = "risk-badge", style = paste0("background-color:", col, ";"), level)
  })

  output$ml_prediction_badge <- renderUI({
    r    <- .risk()
    pred <- if (!is.null(r$prediction)) r$prediction else "UNKNOWN"
    col  <- if (identical(pred, "SCAM")) "#e74c3c" else
            if (identical(pred, "LEGITIMATE")) "#27ae60" else "#95a5a6"
    span(class = "risk-badge", style = paste0("background-color:", col, ";"), pred)
  })

  output$model_caveat <- renderUI({
    r <- .risk()
    caveat <- if (!is.null(r$caveat) && nchar(r$caveat) > 0L) r$caveat
              else "Model probability is a statistical estimate, not a certainty."
    p(style = "font-size:13px; color:#7f8c8d; font-style:italic;", caveat)
  })

  output$indicator_chips <- renderUI({
    r    <- .risk()
    inds <- if (!is.null(r$detected_indicators)) unlist(r$detected_indicators) else character(0)
    if (length(inds) == 0L) return(p("No indicators detected.", style = "color:#7f8c8d;"))
    chips <- lapply(inds, function(i) span(class = "indicator-chip", i))
    do.call(tagList, chips)
  })

  output$indicator_explanations <- renderUI({
    r    <- .risk()
    exps <- if (!is.null(r$explanations)) unlist(r$explanations) else character(0)
    if (length(exps) == 0L) return(NULL)
    items <- lapply(exps, function(e) tags$li(style = "font-size:13px; margin-bottom:4px;", e))
    tags$ul(style = "padding-left:16px;", do.call(tagList, items))
  })

  # ── Tab 2: H.I.V.E. Status ───────────────────────────────────────────────────

  output$hive_state_display <- renderUI({
    state <- "HIVE_ENDED"
    col   <- "#1abc9c"
    tagList(
      div(style = "text-align:center; margin:12px 0;",
          span(class = "risk-badge", style = paste0("background-color:", col,
               "; font-size:18px; padding:10px 30px;"), state)
      )
    )
  })

  output$hive_metadata_table <- renderTable({
    convo <- .convo()
    n_turns <- if (length(convo) > 0L) max(vapply(convo, function(m) as.integer(m$turn), integer(1L))) else 0L
    data.frame(
      Property = c("Session ID", "Decision", "State", "Scenario"),
      Value    = c("demo-session-001",
                   "ACTIVATE_HIVE (explicit user consent)",
                   "HIVE_ENDED",
                   if (!is.null(demo)) demo$scenario$scenario_name else "N/A"),
      stringsAsFactors = FALSE
    )
  }, striped = TRUE, hover = TRUE, spacing = "s", width = "100%", align = "ll")

  output$hive_turns_val <- renderUI({
    convo <- .convo()
    n_turns <- if (length(convo) > 0L) {
      max(vapply(convo, function(m) as.integer(m$turn), integer(1L)))
    } else 0L
    span(as.character(n_turns))
  })

  output$hive_msg_count_val <- renderUI({
    span(as.character(length(.convo())))
  })

  # ── Tab 3: Conversation ──────────────────────────────────────────────────────

  output$conversation_display <- renderUI({
    convo <- .convo()
    if (length(convo) == 0L) return(p("No conversation data.", style = "color:#7f8c8d;"))

    rows <- lapply(convo, function(m) {
      dir    <- as.character(m$direction)
      is_inc <- identical(dir, "INCOMING")
      css    <- if (is_inc) "conv-row conv-incoming" else "conv-row conv-outgoing"
      label  <- if (is_inc) "SCAMMER (INCOMING)" else "H.I.V.E. (OUTGOING)"
      col    <- if (is_inc) "#e74c3c" else "#2980b9"

      div(class = css,
        div(class = "conv-turn", paste0("Turn ", m$turn)),
        div(class = "conv-dir", style = paste0("color:", col, ";"), label),
        div(class = "conv-text", as.character(m$text))
      )
    })
    do.call(tagList, rows)
  })

  # ── Tab 4: Intelligence ──────────────────────────────────────────────────────

  observe({
    entities <- if (!is.null(.inv()$intelligence)) .inv()$intelligence else list()
    if (length(entities) > 0L) {
      types <- c("All", sort(unique(vapply(entities, function(e) as.character(e$entity_type), character(1L)))))
      updateSelectInput(session, "entity_filter", choices = types, selected = "All")
    }
  })

  output$entity_count_summary <- renderUI({
    entities <- if (!is.null(.inv()$intelligence)) .inv()$intelligence else list()
    n        <- length(entities)
    smry     <- .smry()
    n_types  <- if (!is.null(smry$n_suspicious_request_types)) smry$n_suspicious_request_types else 0L
    div(style = "padding-top:6px;",
        p(style = "margin:0; font-size:14px;",
          strong(n), " total entities extracted across ",
          strong(length(unlist(smry$entity_types))), " category types. ",
          strong(n_types), " suspicious request type(s) detected."))
  })

  output$entity_table <- renderTable({
    entities <- if (!is.null(.inv()$intelligence)) .inv()$intelligence else list()
    format_entity_table(entities, filter_type = input$entity_filter)
  }, striped = TRUE, hover = TRUE, spacing = "s", width = "100%", align = "llrlll")

  output$entity_chart <- renderPlot({
    entities <- if (!is.null(.inv()$intelligence)) .inv()$intelligence else list()
    entity_type_chart(entities)
  }, bg = "white")

  # ── Tab 5: Behaviour Analysis ────────────────────────────────────────────────

  output$behaviour_table <- renderTable({
    beh <- if (!is.null(.inv()$behaviour)) .inv()$behaviour else list()
    format_behaviour_table(beh)
  }, striped = TRUE, hover = TRUE, spacing = "s", width = "100%", align = "llrl")

  output$behaviour_chart <- renderPlot({
    beh <- if (!is.null(.inv()$behaviour)) .inv()$behaviour else list()
    behaviour_frequency_chart(beh)
  }, bg = "white")

  output$behaviour_alerts <- renderUI({
    smry <- .smry()
    alerts <- tagList()

    if (isTRUE(smry$escalation_detected)) {
      alerts <- tagList(alerts,
        div(style = "background:#fdedec; border-left:4px solid #e74c3c; padding:10px 14px;
                     border-radius:0 4px 4px 0; margin-bottom:10px; font-size:13px;",
            tags$strong(style = "color:#c0392b;", "ESCALATION DETECTED:"),
            " Sensitivity of requests increased across turns. The pattern progressed from ",
            "account-related claims toward more intrusive requests (OTP, payment, credentials).")
      )
    }

    if (isTRUE(smry$repeated_requests)) {
      alerts <- tagList(alerts,
        div(style = "background:#fef9e7; border-left:4px solid #f39c12; padding:10px 14px;
                     border-radius:0 4px 4px 0; margin-bottom:10px; font-size:13px;",
            tags$strong(style = "color:#d68910;", "REPEATED REQUESTS:"),
            " The same request category (e.g., OTP solicitation) was made in multiple turns.")
      )
    }

    if (length(alerts) == 0L) {
      div(p(style = "color:#7f8c8d;", "No pattern alerts detected."))
    } else alerts
  })

  # ── Tab 6: Investigation Summary ─────────────────────────────────────────────

  output$summary_statements <- renderUI({
    smry  <- .smry()
    stmts <- if (!is.null(smry$statements)) unlist(smry$statements) else character(0L)
    if (length(stmts) == 0L) return(p("No summary statements generated.", style = "color:#7f8c8d;"))
    items <- lapply(stmts, function(s) div(class = "summary-stmt", s))
    do.call(tagList, items)
  })

  output$summary_counts_table <- renderTable({
    smry <- .smry()
    data.frame(
      Metric = c("Turns analysed",
                 "Entities extracted",
                 "Behaviour records",
                 "Suspicious request types",
                 "Repeated requests",
                 "Escalation detected"),
      Value  = c(
        as.character(if (!is.null(smry$n_turns_analysed)) smry$n_turns_analysed else "?"),
        as.character(if (!is.null(smry$n_entities))        smry$n_entities        else "?"),
        as.character(if (!is.null(smry$n_behaviours))      smry$n_behaviours      else "?"),
        as.character(if (!is.null(smry$n_suspicious_request_types)) smry$n_suspicious_request_types else "?"),
        if (isTRUE(smry$repeated_requests)) "Yes" else "No",
        if (isTRUE(smry$escalation_detected)) "Yes" else "No"
      ),
      stringsAsFactors = FALSE
    )
  }, striped = TRUE, spacing = "s", width = "100%", align = "lr", colnames = FALSE)

  output$escalation_alert <- renderUI({
    if (isTRUE(.smry()$escalation_detected)) {
      div(style = "background:#fdedec; border-radius:6px; padding:8px 12px;
                   font-size:13px; color:#922b21; margin-bottom:8px;",
          tags$strong("Escalation: "), "Detected")
    }
  })

  output$repeated_alert <- renderUI({
    if (isTRUE(.smry()$repeated_requests)) {
      div(style = "background:#fef9e7; border-radius:6px; padding:8px 12px;
                   font-size:13px; color:#7d6608; margin-bottom:8px;",
          tags$strong("Repeated Requests: "), "Detected")
    }
  })

  output$system_info_table <- renderTable({
    r <- .risk()
    data.frame(
      Component  = c("Dashboard", "Analytical Engine",
                     "Communication Layer", "API Layer",
                     "ML Model", "Demo Session"),
      Version    = c("Phase 11 (ScamTracer AI)",
                     "R 4.6.1 — risk_scorer.R + intelligence_extractor.R + behaviour_analyzer.R",
                     "Node.js v20.18.0 + Express (Phase 6–11)",
                     "R Plumber 1.x (port 8000)",
                     if (!is.null(r) && !is.null(r$model_used)) r$model_used
                     else "Logistic Regression Elastic Net (glmnet)",
                     "demo-session-001 (fictional scenario — HIVE_ENDED)"),
      stringsAsFactors = FALSE
    )
  }, striped = TRUE, spacing = "s", width = "100%", align = "ll")

  # ── Tab 7: Live Monitor ──────────────────────────────────────────────────────

  # Node.js API base URL for live polling
  .node_url <- function() Sys.getenv("NODE_URL", unset = "http://localhost:3000")

  # Poll /whatsapp/status every 2 seconds — returns NULL if Node.js is not running
  wh_status_data <- reactivePoll(
    intervalMillis = 2000,
    session        = session,
    checkFunc      = function() {
      tryCatch({
        r <- fetch_whatsapp_status(.node_url())
        if (is.null(r)) as.numeric(Sys.time())
        else paste0(r$connected, r$total_analysed, r$total_suspicious, r$pending_decisions)
      }, error = function(e) as.numeric(Sys.time()))
    },
    valueFunc = function() {
      tryCatch(fetch_whatsapp_status(.node_url()), error = function(e) NULL)
    }
  )

  # Poll /alerts every 2 seconds
  alerts_data <- reactivePoll(
    intervalMillis = 2000,
    session        = session,
    checkFunc      = function() {
      tryCatch({
        a <- fetch_alerts(.node_url())
        if (is.null(a)) as.numeric(Sys.time())
        else length(a)
      }, error = function(e) as.numeric(Sys.time()))
    },
    valueFunc = function() {
      tryCatch(fetch_alerts(.node_url()), error = function(e) NULL)
    }
  )

  output$wh_status_display <- renderUI({
    st <- wh_status_data()
    if (is.null(st)) {
      tagList(
        div(
          span(class = "wh-status-dot dot-grey"),
          strong("Not connected"),
          style = "font-size:14px; color:#7f8c8d; margin-bottom:6px;"
        ),
        p(style = "font-size:12px; color:#aaa;",
          "Node.js server not running at ", .node_url(),
          ". Start with: cd nodejs && npm start")
      )
    } else if (isTRUE(st$connected)) {
      tagList(
        div(
          span(class = "wh-status-dot dot-green"),
          strong("WhatsApp Connected"),
          style = "font-size:14px; color:#27ae60; margin-bottom:6px;"
        ),
        p(style = "font-size:12px; color:#666;",
          "Risk threshold: ", st$risk_threshold, "/100",
          " | Node.js reachable at ", .node_url())
      )
    } else {
      tagList(
        div(
          span(class = "wh-status-dot dot-red"),
          strong("WhatsApp Not Connected"),
          style = "font-size:14px; color:#e74c3c; margin-bottom:6px;"
        ),
        p(style = "font-size:12px; color:#666;",
          "Node.js running at ", .node_url(),
          " but WhatsApp client not authenticated. Scan QR code in the terminal.")
      )
    }
  })

  output$wh_total_analysed <- renderUI({
    st <- wh_status_data()
    span(if (!is.null(st)) as.character(st$total_analysed) else "—")
  })

  output$wh_total_suspicious <- renderUI({
    st <- wh_status_data()
    span(if (!is.null(st)) as.character(st$total_suspicious) else "—")
  })

  output$wh_pending_decisions <- renderUI({
    st <- wh_status_data()
    span(if (!is.null(st)) as.character(st$pending_decisions) else "—")
  })

  output$alert_cards <- renderUI({
    alerts <- alerts_data()
    if (is.null(alerts)) {
      return(div(style = "color:#7f8c8d; font-size:13px; padding:10px 0;",
                 "Node.js server is not reachable. Start it to see live alerts."))
    }
    if (length(alerts) == 0L) {
      return(div(style = "color:#7f8c8d; font-size:13px; padding:10px 0;",
                 "No suspicious messages detected yet. The monitor is listening."))
    }

    cards <- lapply(seq_along(alerts), function(i) {
      a         <- alerts[[i]]
      decided   <- !identical(a$status, "USER_DECISION_REQUIRED")
      card_cls  <- paste0("alert-card", if (decided) " alert-card-decided" else "")
      score_col <- if (!is.null(a$risk_score) && a$risk_score >= 80) "#e74c3c"
                   else if (!is.null(a$risk_score) && a$risk_score >= 60) "#e67e22"
                   else "#f39c12"

      action_btns <- if (!decided) {
        tagList(
          actionButton(
            inputId = paste0("btn_block_", a$alert_id),
            label   = "BLOCK & PROTECT",
            style   = "background:#e74c3c; color:white; border:none; border-radius:4px;
                       padding:6px 14px; font-size:12px; font-weight:600; margin-right:8px;
                       cursor:pointer;"
          ),
          actionButton(
            inputId = paste0("btn_hive_", a$alert_id),
            label   = "ACTIVATE H.I.V.E.",
            style   = "background:#2980b9; color:white; border:none; border-radius:4px;
                       padding:6px 14px; font-size:12px; font-weight:600; cursor:pointer;"
          )
        )
      } else {
        div(style = "font-size:12px; color:#27ae60; font-weight:600;",
            paste0("Decision: ", a$decision, " at ", a$decided_at))
      }

      div(class = card_cls,
        div(class = "alert-card-header",
          div(class = "alert-card-sender",
              paste0("From: ", if (!is.null(a$sender)) a$sender else "unknown")),
          div(class = "alert-card-score", style = paste0("color:", score_col, ";"),
              paste0("Risk: ", if (!is.null(a$risk_score)) a$risk_score else "?",
                     "/100 (", if (!is.null(a$risk_level)) a$risk_level else "?", ")"))
        ),
        div(class = "alert-card-msg",
            paste0('"',
                   if (!is.null(a$message)) substr(a$message, 1L, 200L) else "",
                   if (!is.null(a$message) && nchar(a$message) > 200L) "..." else "",
                   '"')),
        action_btns,
        div(class = "alert-card-meta",
            paste0("Alert ID: ", a$alert_id,
                   " | Status: ", a$status,
                   " | ", a$created_at))
      )
    })
    do.call(tagList, cards)
  })

  # Observe button clicks for each alert — dynamically wired via IDs
  observe({
    alerts <- alerts_data()
    if (is.null(alerts)) return()
    for (a in alerts) {
      if (!identical(a$status, "USER_DECISION_REQUIRED")) next
      local({
        local_alert_id <- a$alert_id
        block_id <- paste0("btn_block_", local_alert_id)
        hive_id  <- paste0("btn_hive_",  local_alert_id)

        observeEvent(input[[block_id]], {
          result <- tryCatch(
            post_decision(local_alert_id, "BLOCK_AND_PROTECT", .node_url()),
            error = function(e) {
              list(error = TRUE, message = conditionMessage(e))
            }
          )
          if (isTRUE(result$error)) {
            showNotification(paste("Error:", result$message), type = "error")
          } else {
            showNotification(
              paste("Alert blocked and protected. Session", result$session_id, "is now BLOCKED."),
              type = "message", duration = 5
            )
          }
        }, ignoreInit = TRUE, once = TRUE)

        observeEvent(input[[hive_id]], {
          result <- tryCatch(
            post_decision(local_alert_id, "ACTIVATE_HIVE", .node_url()),
            error = function(e) {
              list(error = TRUE, message = conditionMessage(e))
            }
          )
          if (isTRUE(result$error)) {
            showNotification(paste("Error:", result$message), type = "error")
          } else {
            showNotification(
              paste0("H.I.V.E. activated for session ", result$session_id,
                     ". Use POST /hive/message to begin controlled investigation."),
              type = "message", duration = 8
            )
          }
        }, ignoreInit = TRUE, once = TRUE)
      })
    }
  })
}
