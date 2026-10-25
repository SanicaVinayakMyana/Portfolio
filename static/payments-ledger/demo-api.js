'use strict';

// In-browser stand-in for the Payments Ledger HTTP API, so the real dashboard (app.js, unchanged)
// can run on a static host. It follows the Java service's rules: double-entry journals that net to
// zero per currency, FX routed through per-currency pools with HALF_EVEN rounding, exactly-once
// POSTs keyed by Idempotency-Key, and the same JSON shapes, status codes and error codes.
// State lives in memory, so a page reload starts a fresh ledger.
(() => {
  const SCALE = { EUR: 2, USD: 2, GBP: 2, PLN: 2, INR: 2, JPY: 0 };
  const SUPPORTED = Object.keys(SCALE);
  const SUPPORTED_TEXT = '[' + SUPPORTED.join(', ') + ']';
  // Reference rates against EUR, in hundredths (1.08 USD per EUR -> 108), as in StaticFxRateProvider.
  const UNITS_PER_EUR = { EUR: 100n, USD: 108n, GBP: 85n, PLN: 430n, INR: 9050n, JPY: 16200n };
  const RATE_SCALE = 8;
  const MAX_AMOUNT_MINOR = 1000000000n; // whole units; compared after scaling below
  const MAX_KEY_LENGTH = 128;
  const MAX_PAGE_SIZE = 200;
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  class LedgerError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  const validation = message => new LedgerError(400, 'VALIDATION_ERROR', message);
  const notFound = message => new LedgerError(404, 'NOT_FOUND', message);

  // ---------- Exact decimal helpers (BigInt minor units) ----------

  const pow10 = n => 10n ** BigInt(n);

  /** a / b rounded HALF_EVEN, for positive a and b. */
  function divHalfEven(a, b) {
    const q = a / b;
    const twiceR = (a % b) * 2n;
    if (twiceR > b || (twiceR === b && q % 2n === 1n)) return q + 1n;
    return q;
  }

  function format(minor, scale) {
    const negative = minor < 0n;
    const digits = (negative ? -minor : minor).toString().padStart(scale + 1, '0');
    const whole = scale ? digits.slice(0, -scale) : digits;
    return (negative ? '-' : '') + whole + (scale ? '.' + digits.slice(-scale) : '');
  }

  /** Parses a JSON amount (string or number) exactly, like Jackson reading a BigDecimal. */
  function parseDecimal(raw) {
    if (raw === undefined || raw === null) return null;
    const text = String(raw).trim();
    const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text);
    if (!match) throw validation('Malformed request body: cannot parse amount "' + text + '"');
    const fraction = (match[3] || '').replace(/0+$/, '');
    return { negative: match[1] === '-', digits: BigInt(match[2] + fraction), scale: fraction.length };
  }

  function requirePositiveAmount(raw, currency) {
    const amount = parseDecimal(raw);
    if (amount === null) throw validation('amount is required');
    if (amount.digits === 0n || amount.negative) throw validation('amount must be positive');
    const scale = SCALE[currency];
    if (amount.scale > scale) {
      throw validation('amount has more than ' + scale + ' decimal places for ' + currency);
    }
    const minor = amount.digits * pow10(scale - amount.scale);
    if (minor > MAX_AMOUNT_MINOR * pow10(scale)) throw validation('amount must not exceed 1000000000');
    return minor;
  }

  function requireSupported(code) {
    if (!SUPPORTED.includes(code)) {
      throw validation('Unsupported currency: ' + code + '. Supported: ' + SUPPORTED_TEXT);
    }
    return code;
  }

  /** Rate scaled by 10^8, exactly as StaticFxRateProvider computes it. */
  function rate8(from, to) {
    requireSupported(from);
    requireSupported(to);
    if (from === to) return pow10(RATE_SCALE);
    return divHalfEven(UNITS_PER_EUR[to] * pow10(RATE_SCALE), UNITS_PER_EUR[from]);
  }

  // ---------- Ledger state ----------

  const accounts = new Map();     // id -> { id, ownerId, currency, kind, balance (minor), createdAt, seq }
  const transactions = [];        // in insertion order
  const entries = [];             // in insertion order
  const idempotencyKeys = new Map(); // key -> { requestHash, status, body }
  let seq = 0;

  const now = () => new Date().toISOString();
  const newId = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

  const systemId = (kind, currency) => {
    const index = (kind === 'EXTERNAL' ? 0 : 1) * SUPPORTED.length + SUPPORTED.indexOf(currency);
    return '00000000-0000-3000-8000-' + (index + 1).toString(16).padStart(12, '0');
  };

  for (const currency of SUPPORTED) {
    for (const kind of ['EXTERNAL', 'FX_POOL']) {
      const id = systemId(kind, currency);
      accounts.set(id, { id, ownerId: 'system', currency, kind, balance: 0n, createdAt: now(), seq: ++seq });
    }
  }

  const journalBalance = id => entries.filter(e => e.accountId === id).reduce((sum, e) => sum + e.amount, 0n);

  const accountJson = a => ({
    id: a.id,
    ownerId: a.ownerId,
    currency: a.currency,
    kind: a.kind,
    balance: format(a.kind === 'USER' ? a.balance : journalBalance(a.id), SCALE[a.currency]),
    createdAt: a.createdAt,
  });

  const entryJson = e => ({
    id: e.id,
    transactionId: e.transactionId,
    accountId: e.accountId,
    amount: format(e.amount, SCALE[e.currency]),
    currency: e.currency,
    createdAt: e.createdAt,
  });

  const transactionJson = tx => ({
    id: tx.id,
    type: tx.type,
    sourceAccountId: tx.sourceAccountId,
    destinationAccountId: tx.destinationAccountId,
    sourceAmount: format(tx.sourceAmount, SCALE[tx.sourceCurrency]),
    sourceCurrency: tx.sourceCurrency,
    destinationAmount: format(tx.destinationAmount, SCALE[tx.destinationCurrency]),
    destinationCurrency: tx.destinationCurrency,
    fxRate: format(tx.rate, RATE_SCALE),
    createdAt: tx.createdAt,
    entries: entries.filter(e => e.transactionId === tx.id).map(entryJson),
  });

  function getAccount(id) {
    const account = accounts.get(id);
    if (!account) throw notFound('Account ' + id + ' not found');
    return account;
  }

  function requireUuid(value, name) {
    if (value === undefined || value === null) throw validation(name + ' is required');
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      throw validation('Malformed request body: ' + name + ' must be a UUID');
    }
    return value.toLowerCase();
  }

  function userAccount(id) {
    const account = getAccount(id);
    if (account.kind !== 'USER') throw validation('Account ' + id + ' is a system account');
    return account;
  }

  function write(tx, lines) {
    const net = new Map();
    for (const line of lines) net.set(line.currency, (net.get(line.currency) ?? 0n) + line.amount);
    for (const [currency, sum] of net) {
      if (sum !== 0n) throw new LedgerError(500, 'INTERNAL_ERROR', 'Unbalanced ' + currency + ' entries');
    }
    transactions.push(tx);
    lines.forEach((line, i) => entries.push({
      id: newId(), transactionId: tx.id, lineNo: i + 1, accountId: line.accountId,
      amount: line.amount, currency: line.currency, createdAt: tx.createdAt, seq: ++seq,
    }));
  }

  function deposit(body) {
    const accountId = requireUuid(body.accountId, 'accountId');
    const account = userAccount(accountId);
    const currency = account.currency;
    const amount = requirePositiveAmount(body.amount, currency);
    const external = systemId('EXTERNAL', currency);
    const tx = {
      id: newId(), type: 'DEPOSIT', sourceAccountId: external, destinationAccountId: accountId,
      sourceAmount: amount, sourceCurrency: currency, destinationAmount: amount, destinationCurrency: currency,
      rate: rate8(currency, currency), createdAt: now(),
    };
    write(tx, [
      { accountId: external, amount: -amount, currency },
      { accountId, amount, currency },
    ]);
    account.balance += amount;
    return tx;
  }

  function transfer(body) {
    const fromId = requireUuid(body.fromAccountId, 'fromAccountId');
    const toId = requireUuid(body.toAccountId, 'toAccountId');
    if (fromId === toId) throw validation('Source and destination accounts must differ');
    const from = userAccount(fromId);
    const to = userAccount(toId);
    const amount = requirePositiveAmount(body.amount, from.currency);
    if (from.balance < amount) {
      throw new LedgerError(422, 'INSUFFICIENT_FUNDS', 'Account ' + fromId + ' has insufficient funds');
    }
    const rate = rate8(from.currency, to.currency);
    const cross = from.currency !== to.currency;
    const converted = cross
      ? divHalfEven(amount * rate * pow10(SCALE[to.currency]), pow10(SCALE[from.currency] + RATE_SCALE))
      : amount;
    if (converted <= 0n) {
      throw validation('Amount is too small to convert from ' + from.currency + ' to ' + to.currency);
    }
    const tx = {
      id: newId(), type: 'TRANSFER', sourceAccountId: fromId, destinationAccountId: toId,
      sourceAmount: amount, sourceCurrency: from.currency, destinationAmount: converted,
      destinationCurrency: to.currency, rate, createdAt: now(),
    };
    const lines = [{ accountId: fromId, amount: -amount, currency: from.currency }];
    if (cross) {
      lines.push({ accountId: systemId('FX_POOL', from.currency), amount, currency: from.currency });
      lines.push({ accountId: systemId('FX_POOL', to.currency), amount: -converted, currency: to.currency });
    }
    lines.push({ accountId: toId, amount: converted, currency: to.currency });
    write(tx, lines);
    from.balance -= amount;
    to.balance += converted;
    return tx;
  }

  function reconcile() {
    const net = new Map();
    for (const e of entries) net.set(e.currency, (net.get(e.currency) ?? 0n) + e.amount);
    const netByCurrency = {};
    for (const currency of [...net.keys()].sort()) netByCurrency[currency] = format(net.get(currency), SCALE[currency]);
    const mismatchedAccounts = [...accounts.values()]
      .filter(a => a.kind === 'USER' && a.balance !== journalBalance(a.id))
      .map(a => a.id);
    const balanced = [...net.values()].every(sum => sum === 0n) && mismatchedAccounts.length === 0;
    return { balanced, netByCurrency, mismatchedAccounts };
  }

  /** Exactly-once execution: a key replays its stored response; the same key with a different request is rejected. */
  function idempotent(headers, requestHash, action) {
    const key = headers.get('Idempotency-Key');
    if (!key || !key.trim() || key.length > MAX_KEY_LENGTH) {
      throw validation('Idempotency-Key header is required (1-' + MAX_KEY_LENGTH + ' characters)');
    }
    const stored = idempotencyKeys.get(key);
    if (stored) {
      if (stored.requestHash !== requestHash) {
        throw new LedgerError(422, 'IDEMPOTENCY_KEY_REUSED',
          "Idempotency-Key '" + key + "' was already used with a different request");
      }
      return { status: stored.status, body: stored.body, replayed: true };
    }
    // A failed action throws before the key is stored, like the rolled-back database transaction.
    const body = JSON.stringify(transactionJson(action()));
    idempotencyKeys.set(key, { requestHash, status: 201, body });
    return { status: 201, body, replayed: false };
  }

  /** The request as the server would hash it: method, path and the parsed (normalised) body. */
  function requestHash(path, body, fields) {
    const normalised = fields.map(field => {
      const value = body[field];
      if (field === 'amount') {
        const amount = parseDecimal(value);
        return amount ? format(amount.digits, amount.scale) : null;
      }
      return typeof value === 'string' ? value.toLowerCase() : value ?? null;
    });
    return 'POST ' + path + '\n' + JSON.stringify(normalised);
  }

  function pageSize(params) {
    const raw = params.get('limit');
    if (raw === null) return 50;
    if (!/^-?\d+$/.test(raw)) throw validation('limit must be an integer');
    const limit = Number(raw);
    if (limit < 1 || limit > MAX_PAGE_SIZE) throw validation('limit must be between 1 and ' + MAX_PAGE_SIZE);
    return limit;
  }

  function pathUuid(value, name) {
    if (!UUID_RE.test(value)) throw validation(name + ' must be a UUID');
    return value.toLowerCase();
  }

  function readBody(text) {
    if (!text) throw validation('Request body is required');
    try {
      const value = JSON.parse(text);
      if (value === null || typeof value !== 'object') throw new Error('not an object');
      return value;
    } catch (error) {
      throw validation('Malformed request body: ' + error.message);
    }
  }

  // ---------- Routing ----------

  function handle(method, url, headers, text) {
    const path = url.pathname;
    const params = url.searchParams;
    let match;

    if (method === 'GET' && path === '/health') return { status: 200, json: { status: 'UP' } };

    if (path === '/accounts' && method === 'GET') {
      const list = [...accounts.values()].filter(a => a.kind === 'USER').sort((a, b) => b.seq - a.seq);
      return { status: 200, json: list.slice(0, pageSize(params)).map(accountJson) };
    }
    if (path === '/accounts' && method === 'POST') {
      const body = readBody(text);
      const ownerId = body.ownerId;
      if (typeof ownerId !== 'string' || !ownerId.trim() || ownerId.length > 64) {
        throw validation('ownerId must be 1-64 characters');
      }
      const currency = requireSupported(body.currency);
      const account = { id: newId(), ownerId, currency, kind: 'USER', balance: 0n, createdAt: now(), seq: ++seq };
      accounts.set(account.id, account);
      return { status: 201, json: accountJson(account) };
    }
    if ((match = /^\/accounts\/([^/]+)\/entries$/.exec(path)) && method === 'GET') {
      const id = pathUuid(match[1], 'id');
      getAccount(id);
      const list = entries.filter(e => e.accountId === id).sort((a, b) => b.seq - a.seq);
      return { status: 200, json: list.slice(0, pageSize(params)).map(entryJson) };
    }
    if ((match = /^\/accounts\/([^/]+)$/.exec(path)) && method === 'GET') {
      return { status: 200, json: accountJson(getAccount(pathUuid(match[1], 'id'))) };
    }
    if (path === '/deposits' && method === 'POST') {
      const body = readBody(text);
      return idempotent(headers, requestHash(path, body, ['accountId', 'amount']), () => deposit(body));
    }
    if (path === '/transfers' && method === 'POST') {
      const body = readBody(text);
      return idempotent(headers, requestHash(path, body, ['fromAccountId', 'toAccountId', 'amount']),
        () => transfer(body));
    }
    if (path === '/transactions' && method === 'GET') {
      const list = transactions.slice().reverse().slice(0, pageSize(params));
      return { status: 200, json: list.map(transactionJson) };
    }
    if ((match = /^\/transactions\/([^/]+)$/.exec(path)) && method === 'GET') {
      const id = pathUuid(match[1], 'id');
      const tx = transactions.find(t => t.id === id);
      if (!tx) throw notFound('Transaction ' + id + ' not found');
      return { status: 200, json: transactionJson(tx) };
    }
    if (path === '/fx/rate' && method === 'GET') {
      const from = params.get('from');
      const to = params.get('to');
      return { status: 200, json: { from: String(from), to: String(to), rate: format(rate8(from, to), RATE_SCALE) } };
    }
    if (path === '/admin/reconciliation' && method === 'GET') return { status: 200, json: reconcile() };

    return null; // not an API route
  }

  const API_PATH = /^\/(health|accounts|deposits|transfers|transactions|fx|admin)(\/|$)/;
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
    if (url.origin !== window.location.origin || !API_PATH.test(url.pathname)) return realFetch(input, init);

    const method = (init.method || 'GET').toUpperCase();
    const headers = new Headers(init.headers || {});
    // A short, realistic delay so loading states and the retry demo feel like a real network call.
    await new Promise(resolve => setTimeout(resolve, 60 + Math.random() * 80));

    let result;
    try {
      result = handle(method, url, headers, init.body);
      if (result === null) {
        result = { status: 404, json: { error: 'NOT_FOUND', message: 'Endpoint ' + method + ' ' + url.pathname + ' not found' } };
      }
    } catch (error) {
      const status = error instanceof LedgerError ? error.status : 500;
      const code = error instanceof LedgerError ? error.code : 'INTERNAL_ERROR';
      result = { status, json: { error: code, message: error instanceof LedgerError ? error.message : 'Unexpected error' } };
    }

    const responseHeaders = { 'Content-Type': 'application/json' };
    if ('replayed' in result) responseHeaders['Idempotent-Replayed'] = String(result.replayed);
    const body = result.body !== undefined ? result.body : JSON.stringify(result.json);
    return new Response(body, { status: result.status, headers: responseHeaders });
  };
})();
