# ScamTracer AI — Chrome Extension

Real-time scam detection alerts for WhatsApp Web, powered by H.I.V.E.

## Manual Test Instructions (Windows)

### Prerequisites

- Google Chrome installed
- Node.js server built and working (Phase 11 complete)
- R Plumber API working (Phase 11 complete)

---

### Step 1 — Start the R Plumber API

Open a terminal in `E:\R PROJECT` and run:

```
Rscript R/api/plumber.R
```

The API starts on **port 8000**. Leave this terminal open.

---

### Step 2 — Start the Node.js server

Open a second terminal in `E:\R PROJECT\nodejs` and run:

```
node src/server.js
```

The server starts on **port 3000**. Leave this terminal open.

---

### Step 3 — Load the extension in Chrome

1. Open Chrome and go to: `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Navigate to `E:\R PROJECT\extension` and click **Select Folder**
5. The **ScamTracer AI** extension appears in your extensions list

---

### Step 4 — Open WhatsApp Web

1. Go to `https://web.whatsapp.com` in Chrome
2. Scan the QR code with your phone to log in

---

### Step 5 — Send a test message to yourself

From your phone, send a high-risk message to the WhatsApp number connected to the web session. Example:

> URGENT: Your account has been suspended. Visit http://securebank-verify.com/login to restore access or lose your funds permanently.

---

### Step 6 — Verify the floating alert appears

Within 2 seconds of receiving the message, a red floating panel should appear in the **top-right corner** of WhatsApp Web showing:
- The risk level badge (e.g. HIGH — 81/100)
- A preview of the suspicious message
- Two buttons: **Block & Protect** and **Activate H.I.V.E.**

---

### Step 7 — Test Block & Protect

Click the **Block & Protect** button. The panel should disappear immediately.

---

### Step 8 — Test Activate H.I.V.E.

Send another high-risk message. When the alert panel appears, click **Activate H.I.V.E.** The panel should disappear.

---

### Step 9 — Test the popup

Click the ScamTracer AI icon in the Chrome toolbar. The popup should show:
- **Connected** status (green)
- WhatsApp enabled/disabled
- Risk threshold (60)
- Pending alerts count
- A preview of any pending alerts

---

### Step 10 — Verify low-risk messages are ignored

Send a normal message (e.g. "Hi, how are you?"). No alert panel should appear.

---

## Architecture Notes

- The content script (`content.js`) runs on `https://web.whatsapp.com/*`
- All HTTP requests go through `background.js` (service worker), which can reach `http://localhost:3000`
- The extension **never** sends messages to WhatsApp contacts
- The extension **never** activates H.I.V.E. automatically — explicit user click required
- Alerts are deduplicated: each `alert_id` is shown at most once per browser session

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome extension manifest (MV3) |
| `background.js` | Service worker — all Node.js API calls |
| `content.js`    | WhatsApp Web floating panel + polling |
| `styles.css`    | Floating panel styles |
| `popup.html`    | Extension toolbar popup (HTML) |
| `popup.js`      | Extension toolbar popup (logic) |
