# ScamTracer AI — Dashboard UI (Phase 11)
# Seven-section investigation dashboard. Tabs 1–6 show the H.I.V.E. demo analysis.
# Tab 7 (Live Monitor) polls the Node.js server for live WhatsApp alerts.
# No shinydashboard / DT dependencies — only packages already in renv.lock.

ui <- navbarPage(
  title = "ScamTracer AI",
  id    = "navbar",

  # ── Global styles ────────────────────────────────────────────────────────────
  header = tags$head(tags$style(HTML("
    body {
      background-color: #f0f3f6;
      font-family: 'Segoe UI', Arial, sans-serif;
    }
    .navbar { background-color: #2c3e50 !important; border: none; }
    .navbar .navbar-brand,
    .navbar-default .navbar-brand { color: #ecf0f1 !important; font-weight: 700; font-size: 20px; }
    .navbar-default .navbar-nav > li > a { color: #bdc3c7 !important; font-weight: 600; }
    .navbar-default .navbar-nav > li.active > a { color: #ffffff !important; background-color: #1a252f !important; }
    .section-card {
      background: #ffffff;
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      padding: 20px 24px;
      margin-bottom: 20px;
    }
    .metric-box {
      border-radius: 8px;
      padding: 18px 16px;
      text-align: center;
      color: white;
      margin-bottom: 14px;
    }
    .metric-box .metric-value { font-size: 36px; font-weight: 700; line-height: 1.1; }
    .metric-box .metric-label { font-size: 13px; opacity: 0.88; margin-top: 4px; }
    .risk-badge {
      display: inline-block;
      padding: 6px 18px;
      border-radius: 20px;
      font-size: 16px;
      font-weight: 700;
      color: white;
    }
    .indicator-chip {
      display: inline-block;
      background-color: #2980b9;
      color: white;
      border-radius: 12px;
      padding: 3px 10px;
      margin: 3px 2px;
      font-size: 12px;
    }
    .conv-row {
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 8px;
    }
    .conv-incoming {
      background-color: #fadbd8;
      border-left: 4px solid #e74c3c;
    }
    .conv-outgoing {
      background-color: #d6eaf8;
      border-left: 4px solid #2980b9;
    }
    .conv-turn  { font-size: 11px; font-weight: 700; color: #7f8c8d; margin-bottom: 3px; }
    .conv-dir   { font-size: 12px; font-weight: 700; margin-bottom: 4px; }
    .conv-text  { font-size: 14px; color: #2c3e50; line-height: 1.5; }
    .summary-stmt {
      background: #eaf4fb;
      border-left: 3px solid #3498db;
      padding: 8px 14px;
      margin-bottom: 8px;
      border-radius: 0 4px 4px 0;
      font-size: 14px;
      color: #1a5276;
    }
    .section-title { font-size: 17px; font-weight: 700; color: #2c3e50; margin-bottom: 14px; }
    .disclaimer {
      background: #fdfefe;
      border: 1px solid #d5d8dc;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 12px;
      color: #7f8c8d;
      margin-top: 16px;
    }
    table.dataTable { font-size: 13px; }
    th { background: #2c3e50 !important; color: white !important; font-weight: 600; }
    td { vertical-align: top !important; }
    .alert-card {
      background: #fff;
      border-radius: 8px;
      border-left: 5px solid #e74c3c;
      box-shadow: 0 2px 6px rgba(0,0,0,0.08);
      padding: 16px 20px;
      margin-bottom: 14px;
    }
    .alert-card-low { border-left-color: #f39c12; }
    .alert-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .alert-card-sender { font-weight: 700; font-size: 14px; color: #2c3e50; }
    .alert-card-score { font-size: 18px; font-weight: 700; }
    .alert-card-msg { font-size: 13px; color: #555; margin-bottom: 10px; word-break: break-word; }
    .alert-card-meta { font-size: 11px; color: #999; margin-top: 6px; }
    .alert-card-decided { border-left-color: #27ae60; opacity: 0.75; }
    .wh-status-dot {
      display: inline-block;
      width: 12px; height: 12px;
      border-radius: 50%;
      margin-right: 6px;
    }
    .dot-green { background: #27ae60; }
    .dot-red   { background: #e74c3c; }
    .dot-grey  { background: #95a5a6; }
  "))),

  # ── Tab 1: Overview / Risk ───────────────────────────────────────────────────
  tabPanel("Overview / Risk",
    div(style = "padding: 20px;",
      fluidRow(
        column(12,
          div(class = "section-card",
            tags$h4("Initial Suspicious Message",
                    style = "color:#7f8c8d; font-size:13px; margin-bottom:6px;"),
            uiOutput("overview_message_box")
          )
        )
      ),
      fluidRow(
        column(3, div(class = "metric-box", style = "background-color: #2c3e50;",
          div(class = "metric-value", uiOutput("risk_score_val")),
          div(class = "metric-label", "Risk Score (0–100)")
        )),
        column(3, div(class = "metric-box", style = "background-color: #2980b9;",
          div(class = "metric-value", uiOutput("ml_prob_val")),
          div(class = "metric-label", "Model Probability")
        )),
        column(3, div(class = "metric-box", style = "background-color: #8e44ad;",
          div(class = "metric-value", uiOutput("ml_score_val")),
          div(class = "metric-label", "ML Score (max 60)")
        )),
        column(3, div(class = "metric-box", style = "background-color: #16a085;",
          div(class = "metric-value", uiOutput("ind_score_val")),
          div(class = "metric-label", "Indicator Score (max 40)")
        ))
      ),
      fluidRow(
        column(6,
          div(class = "section-card",
            div(class = "section-title", "Risk Assessment"),
            fluidRow(
              column(6, strong("Risk Level:"), br(), uiOutput("risk_level_badge")),
              column(6, strong("ML Prediction:"), br(), uiOutput("ml_prediction_badge"))
            ),
            hr(),
            strong("Model Caveat:"),
            uiOutput("model_caveat")
          )
        ),
        column(6,
          div(class = "section-card",
            div(class = "section-title",
                icon("exclamation-triangle"), " Detected Indicators"),
            uiOutput("indicator_chips"),
            hr(),
            uiOutput("indicator_explanations")
          )
        )
      )
    )
  ),

  # ── Tab 2: H.I.V.E. Status ───────────────────────────────────────────────────
  tabPanel("H.I.V.E. Status",
    div(style = "padding: 20px;",
      fluidRow(
        column(6,
          div(class = "section-card",
            div(class = "section-title", "H.I.V.E. Session State"),
            uiOutput("hive_state_display"),
            hr(),
            tableOutput("hive_metadata_table")
          )
        ),
        column(6,
          div(class = "section-card",
            div(class = "section-title", "Engagement Statistics"),
            fluidRow(
              column(6, div(class = "metric-box", style = "background-color: #1abc9c;",
                div(class = "metric-value", uiOutput("hive_turns_val")),
                div(class = "metric-label", "Engagement Turns")
              )),
              column(6, div(class = "metric-box", style = "background-color: #e67e22;",
                div(class = "metric-value", uiOutput("hive_msg_count_val")),
                div(class = "metric-label", "Total Messages")
              ))
            ),
            div(style = "background:#eafaf1; border-left:3px solid #27ae60; padding:10px 14px;
                         border-radius:0 4px 4px 0; font-size:13px; color:#1e8449; margin-top:12px;",
              tags$strong("Consent Principle:"), " H.I.V.E. was activated only after ",
              "explicit user confirmation. No automated engagement occurred."
            )
          )
        )
      )
    )
  ),

  # ── Tab 3: Conversation ──────────────────────────────────────────────────────
  tabPanel("Conversation",
    div(style = "padding: 20px;",
      div(class = "section-card",
        div(class = "section-title", "H.I.V.E. Controlled Engagement Conversation"),
        p(style = "font-size:13px; color:#7f8c8d; margin-bottom:16px;",
          "INCOMING = suspected scammer messages. OUTGOING = H.I.V.E. controlled probing responses.",
          "No sensitive information (OTPs, passwords, credentials) was provided at any point."),
        uiOutput("conversation_display")
      )
    )
  ),

  # ── Tab 4: Intelligence ──────────────────────────────────────────────────────
  tabPanel("Intelligence",
    div(style = "padding: 20px;",
      fluidRow(
        column(8,
          div(class = "section-card",
            div(class = "section-title", "Extracted Entities"),
            fluidRow(
              column(4,
                selectInput("entity_filter", "Filter by Type:",
                            choices = c("All"),
                            selected = "All",
                            width = "100%")
              ),
              column(8,
                uiOutput("entity_count_summary")
              )
            ),
            tableOutput("entity_table")
          )
        ),
        column(4,
          div(class = "section-card",
            div(class = "section-title", "Entity Type Distribution"),
            plotOutput("entity_chart", height = "300px")
          )
        )
      ),
      fluidRow(
        column(12,
          div(class = "disclaimer",
            tags$strong("Scope Limit:"),
            " Entities are extracted only from the conversation text above.",
            " No entity is fabricated. Entity co-occurrence does NOT prove that",
            " multiple entities belong to the same individual. This tool does",
            " NOT perform identity resolution or cross-session correlation."
          )
        )
      )
    )
  ),

  # ── Tab 5: Behaviour Analysis ────────────────────────────────────────────────
  tabPanel("Behaviour Analysis",
    div(style = "padding: 20px;",
      fluidRow(
        column(7,
          div(class = "section-card",
            div(class = "section-title", "Behaviour Records"),
            tableOutput("behaviour_table")
          )
        ),
        column(5,
          div(class = "section-card",
            div(class = "section-title", "Behaviour Frequency"),
            plotOutput("behaviour_chart", height = "320px")
          )
        )
      ),
      fluidRow(
        column(12,
          div(class = "section-card",
            div(class = "section-title", "Pattern Alerts"),
            uiOutput("behaviour_alerts")
          )
        )
      ),
      fluidRow(
        column(12,
          div(class = "disclaimer",
            tags$strong("Scope Limit:"),
            " Behaviour analysis identifies observable text patterns only.",
            " It does NOT infer psychological characteristics, assert criminal intent,",
            " or identify any specific individual."
          )
        )
      )
    )
  ),

  # ── Tab 6: Investigation Summary ─────────────────────────────────────────────
  tabPanel(
    title = "Investigation Summary",
    div(style = "padding: 20px;",
      fluidRow(
        column(8,
          div(class = "section-card",
            div(class = "section-title", "Factual Statements"),
            p(style = "font-size:13px; color:#7f8c8d;",
              "All statements are based solely on observable patterns in the recorded conversation."),
            uiOutput("summary_statements")
          )
        ),
        column(4,
          div(class = "section-card",
            div(class = "section-title", "Summary Counts"),
            tableOutput("summary_counts_table"),
            br(),
            uiOutput("escalation_alert"),
            uiOutput("repeated_alert")
          )
        )
      ),
      fluidRow(
        column(12,
          div(class = "section-card",
            div(class = "section-title", "System Information"),
            uiOutput("system_info_table")
          )
        )
      ),
      fluidRow(
        column(12,
          div(class = "disclaimer",
            tags$strong("Project Disclaimer:"),
            " ScamTracer AI is a college project prototype. All demonstration data is fictional.",
            " The system demonstrates AI-assisted scam detection, user-controlled H.I.V.E.",
            " engagement, intelligence extraction, and behaviour analysis.",
            " It does NOT guarantee scam prevention, perform real-world identity discovery,",
            " or provide production-ready WhatsApp integration.",
            " Risk scores are statistical estimates from a model trained on historical SMS data.",
            " They are not certainties."
          )
        )
      )
    )
  ),

  # ── Tab 7: Live Monitor ──────────────────────────────────────────────────────
  tabPanel(
    title = "Live Monitor",
    div(style = "padding: 20px;",
      fluidRow(
        column(12,
          div(class = "section-card",
            fluidRow(
              column(4,
                div(class = "section-title", "WhatsApp Monitor Status"),
                uiOutput("wh_status_display")
              ),
              column(8,
                fluidRow(
                  column(4, div(class = "metric-box", style = "background-color: #2c3e50;",
                    div(class = "metric-value", uiOutput("wh_total_analysed")),
                    div(class = "metric-label", "Messages Analysed")
                  )),
                  column(4, div(class = "metric-box", style = "background-color: #c0392b;",
                    div(class = "metric-value", uiOutput("wh_total_suspicious")),
                    div(class = "metric-label", "Suspicious Detected")
                  )),
                  column(4, div(class = "metric-box", style = "background-color: #e67e22;",
                    div(class = "metric-value", uiOutput("wh_pending_decisions")),
                    div(class = "metric-label", "Awaiting Decision")
                  ))
                )
              )
            )
          )
        )
      ),
      fluidRow(
        column(12,
          div(class = "section-card",
            div(class = "section-title", "Suspicious Message Alerts"),
            p(style = "font-size:13px; color:#7f8c8d;",
              "Real-time alerts from live WhatsApp monitoring.",
              " Each alert awaits YOUR decision before any action is taken.",
              " H.I.V.E. is never activated automatically."),
            uiOutput("alert_cards")
          )
        )
      ),
      fluidRow(
        column(12,
          div(class = "disclaimer",
            tags$strong("Safety Notice:"),
            " This dashboard DETECTS suspicious messages and NOTIFIES you. It does NOT",
            " automatically reply to senders, send OTPs, share credentials, or activate",
            " H.I.V.E. without your explicit consent. The Node.js server must be running",
            " at http://localhost:3000 for live monitoring. If the server is unavailable,",
            " the alert feed will show 'Not connected'."
          )
        )
      )
    )
  )
)
