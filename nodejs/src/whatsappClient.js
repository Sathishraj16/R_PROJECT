// ScamTracer AI — WhatsApp Monitor (Phase 11)
//
// Wraps whatsapp-web.js in an EventEmitter so that server.js can listen for
// incoming messages and QR-code events without tight coupling to the library.
//
// Events emitted:
//   'qr'      (qrString)   — new QR code; display to user for phone scan
//   'ready'   ()           — client authenticated and connected
//   'message' (msgObj)     — incoming message { id, from, body, timestamp }
//   'error'   (err)        — connection or auth error
//
// Design:
//   - The WhatsApp Client constructor is injectable via the factory parameter
//     so that tests can pass a mock without a real phone connection.
//   - WHATSAPP_ENABLED env var (default true) disables the real client in tests.
//     When false, `start()` is a no-op and no events fire from the real client.
//   - When WHATSAPP_ENABLED=false, the monitor still emits events if called
//     directly (for test simulation), but it never instantiates a real Client.
//
// SAFETY CONSTRAINTS:
//   - This module only LISTENS. It never sends WhatsApp messages.
//   - H.I.V.E. is never activated automatically from incoming messages.
//   - Explicit user consent via POST /alerts/:id/decision is required for any action.

const { EventEmitter } = require('events');

const WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED !== 'false';

/**
 * Normalize a raw whatsapp-web.js message object into plain primitives.
 *
 * Rules:
 *   - id:        msg.id._serialized (string) or null — never store the full msg.id object
 *   - from:      msg.from as string or null
 *   - body:      msg.body as string or '' (never undefined/object)
 *   - timestamp: ISO string derived from msg.timestamp (seconds) or Date.now()
 *
 * @param  {object} msg - raw message from whatsapp-web.js
 * @returns {{ id: string|null, from: string|null, body: string, timestamp: string }}
 */
function normalizeWhatsAppMessage(msg) {
  // Extract serialized ID — whatsapp-web.js provides msg.id as a MessageId object.
  // _serialized is the canonical string form (e.g. "false_12345@c.us_ABCD...").
  // Newer versions may expose it differently; fall back to null rather than storing
  // the whole object.
  let msgId = null;
  if (msg && msg.id) {
    if (typeof msg.id === 'string') {
      msgId = msg.id;
    } else if (typeof msg.id._serialized === 'string' && msg.id._serialized) {
      msgId = msg.id._serialized;
    }
    // If neither branch matches, msgId stays null — deduplication is disabled for this message
  }

  return {
    id:        msgId,
    from:      typeof msg.from === 'string' ? msg.from : null,
    body:      typeof msg.body === 'string' ? msg.body : '',
    timestamp: typeof msg.timestamp === 'number'
      ? new Date(msg.timestamp * 1000).toISOString()
      : new Date().toISOString()
  };
}

class WhatsAppMonitor extends EventEmitter {
  /**
   * @param {Function|null} clientFactory
   *   Factory that returns a whatsapp-web.js Client instance.
   *   When null and WHATSAPP_ENABLED=true, the real LocalAuth client is used.
   *   When null and WHATSAPP_ENABLED=false, no client is created (test/dev mode).
   */
  constructor(clientFactory = null) {
    super();
    this._client     = null;
    this._factory    = clientFactory;
    this._isReady    = false;
    this._enabled    = WHATSAPP_ENABLED;
  }

  /**
   * Start the WhatsApp monitor.
   * If WHATSAPP_ENABLED=false and no factory is provided, this is a no-op.
   * Returns a promise that resolves once initialise() completes (non-blocking
   * for QR display — the 'ready' event fires later when the user scans).
   */
  start() {
    if (!this._enabled && !this._factory) {
      console.log('[whatsapp] WHATSAPP_ENABLED=false — monitor in test/development mode. No real client started.');
      return Promise.resolve();
    }

    let client;
    if (this._factory) {
      client = this._factory();
    } else {
      // Real client — only reached when WHATSAPP_ENABLED=true
      const { Client, LocalAuth } = require('whatsapp-web.js');
      client = new Client({
        authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
        puppeteer: {
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        }
      });
    }

    this._client = client;

    client.on('qr', (qr) => {
      console.log('[whatsapp] QR code received — scan with WhatsApp on your phone:');
      try {
        const qrcode = require('qrcode-terminal');
        qrcode.generate(qr, { small: true });
      } catch (_) {
        console.log('[whatsapp] QR (raw):', qr);
      }
      this.emit('qr', qr);
    });

    client.on('ready', () => {
      this._isReady = true;
      console.log('[whatsapp] Client is ready — monitoring incoming messages.');
      this.emit('ready');
    });

    client.on('message', (msg) => {
      if (!msg.fromMe) {
        const normalized = normalizeWhatsAppMessage(msg);
        if (!normalized.body.trim()) {
          // Skip non-text messages (images, stickers, reactions, status updates) —
          // empty body produces NULL values from R that serialize as {} (not null),
          // which bypass the risk threshold check and create malformed alerts.
          console.log('[whatsapp] Skipping empty/non-text message from', normalized.from || '(unknown)');
          return;
        }
        this.emit('message', normalized);
      }
    });

    client.on('disconnected', (reason) => {
      this._isReady = false;
      console.warn('[whatsapp] Client disconnected:', reason);
      this.emit('error', new Error(`WhatsApp client disconnected: ${reason}`));
    });

    client.on('auth_failure', (msg) => {
      this._isReady = false;
      console.error('[whatsapp] Authentication failure:', msg);
      this.emit('error', new Error(`WhatsApp auth failure: ${msg}`));
    });

    return client.initialize().catch((err) => {
      console.error('[whatsapp] Initialisation error:', err.message);
      this.emit('error', err);
    });
  }

  /** Whether the client has authenticated and is connected. */
  get isReady() {
    return this._isReady;
  }

  /** Whether the WhatsApp integration is enabled. */
  get isEnabled() {
    return this._enabled;
  }

  /** Force the ready state — used by test mocks after emitting 'ready'. */
  _setReady(value) {
    this._isReady = value;
  }
}

module.exports = { WhatsAppMonitor, normalizeWhatsAppMessage };
