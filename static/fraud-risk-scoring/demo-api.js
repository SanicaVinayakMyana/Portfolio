'use strict';

// In-browser stand-in for the fraud-risk-service HTTP API, so its real dashboard (app.js, unchanged) runs on a
// static host. It is a port of the Java service: the in-memory velocity store, the same features, the rules from
// rules.json, the DecisionMaker and ShadowMonitor, DemoTraffic and TrafficSimulator (with Java's Random, seed 7),
// and the trained Isolation Forest itself: the 200 trees are read from the service's ONNX model and evaluated here
// exactly as the ONNX graph does. Latencies are measured in this browser. Reloading starts a fresh service.
(() => {
  const BASE = '/fraud-risk-scoring/';

  // ---------- Configuration (Config.java defaults, DEMO_MODE=true) ----------

  const POLICY = { reviewThreshold: 50, blockThreshold: 80, mlWeight: 40, mlReasonThreshold: 0.5 };
  const DEMO = { seed: 7, customers: 200, normalIntervalMs: 400, attackIntervalMs: 25000 };
  const STORE_CAPACITY = 5000;
  const MAX_PAGE = 500;

  const MODEL_METADATA = {
    version: 'iforest-20261025-5c446fb5',
    inputName: 'features',
    scoreOutput: 'scores',
    features: ['log_amount_usd', 'tx_count_60s', 'tx_count_1h', 'log_amount_sum_1h_usd', 'distinct_counterparties_1h',
      'new_device', 'new_country', 'amount_zscore', 'log_seconds_since_last_tx', 'hour_sin', 'hour_cos'],
    center: 0.0,
    scale: 0.027419438337177568,
    metrics: {
      rocAuc: 0.9994, prAuc: 0.9355, recallAt1PctFpr: 0.9911, recallAt5PctFpr: 1.0, trainRows: 201719,
      testRows: 50392, testFraudRate: 0.00671,
      flaggedShareByScenario: { ACCOUNT_TAKEOVER: 1.0, AMOUNT_SPIKE: 1.0, CARD_TESTING: 0.9876, MULE_FAN_OUT: 0.9384, NORMAL: 0.0036 },
      onnxMaxAbsError: 2.3147230293618648e-07, onnxSingleRowMicros: 17.6,
    },
  };

  // rules.json from the service, unchanged.
  const RULES_JSON = {
    version: '2026-10-25.1',
    rules: [
      { id: 'VELOCITY_60S', description: 'More than 5 transactions on the account in 60 seconds', reasonCode: 'VELOCITY_60S', points: 45, mode: 'ENFORCE',
        when: { field: 'txCount60s', op: '>', value: 5 } },
      { id: 'CARD_TESTING', description: 'Burst of small card payments, typical of testing stolen card numbers', reasonCode: 'CARD_TESTING', points: 60, action: 'BLOCK', mode: 'ENFORCE',
        when: { all: [{ field: 'channel', in: ['CARD'] }, { field: 'txCount60s', op: '>=', value: 8 }, { field: 'amountUsd', op: '<', value: 10 }] } },
      { id: 'VELOCITY_1H', description: 'More than 30 transactions on the account in an hour', reasonCode: 'VELOCITY_1H', points: 35, mode: 'ENFORCE',
        when: { field: 'txCount1h', op: '>', value: 30 } },
      { id: 'NEW_DEVICE_HIGH_AMOUNT', description: 'First payment from this device and amount of at least 1,000 USD', reasonCode: 'NEW_DEVICE_HIGH_AMOUNT', points: 55, mode: 'ENFORCE',
        when: { all: [{ field: 'newDevice', op: '==', value: true }, { field: 'amountUsd', op: '>=', value: 1000 }] } },
      { id: 'NEW_COUNTRY_HIGH_AMOUNT', description: 'First payment from this country and amount of at least 500 USD', reasonCode: 'NEW_COUNTRY_HIGH_AMOUNT', points: 40, mode: 'ENFORCE',
        when: { all: [{ field: 'newCountry', op: '==', value: true }, { field: 'amountUsd', op: '>=', value: 500 }] } },
      { id: 'AMOUNT_SPIKE', description: "Amount far above the account's usual spend", reasonCode: 'AMOUNT_SPIKE', points: 30, mode: 'ENFORCE',
        when: { all: [{ field: 'amountZScore', op: '>', value: 6 }, { field: 'amountUsd', op: '>=', value: 250 }] } },
      { id: 'MULE_FAN_OUT', description: 'Money sent to 8 or more different counterparties within an hour', reasonCode: 'MULE_FAN_OUT', points: 45, mode: 'ENFORCE',
        when: { all: [{ field: 'channel', in: ['TRANSFER'] }, { field: 'distinctCounterparties1h', op: '>=', value: 8 }] } },
      { id: 'HARD_AMOUNT_LIMIT', description: 'Single payment above 25,000 USD', reasonCode: 'HARD_AMOUNT_LIMIT', points: 100, action: 'BLOCK', mode: 'ENFORCE',
        when: { field: 'amountUsd', op: '>', value: 25000 } },
      { id: 'FIRST_TX_HIGH_AMOUNT', description: "Account's very first payment is at least 2,000 USD", reasonCode: 'FIRST_TX_HIGH_AMOUNT', points: 50, mode: 'SHADOW',
        when: { all: [{ field: 'priorTxCount', op: '==', value: 0 }, { field: 'amountUsd', op: '>=', value: 2000 }] } },
      { id: 'RAPID_REPEAT', description: 'Less than 3 seconds since the previous payment on the account', reasonCode: 'RAPID_REPEAT', points: 25, mode: 'SHADOW',
        when: { all: [{ field: 'secondsSinceLastTx', op: '>=', value: 0 }, { field: 'secondsSinceLastTx', op: '<', value: 3 }] } },
      { id: 'NIGHT_NEW_DEVICE', description: 'Payment between 01:00 and 05:00 UTC from a new device', reasonCode: 'NIGHT_NEW_DEVICE', points: 30, mode: 'SHADOW',
        when: { all: [{ field: 'newDevice', op: '==', value: true }, { field: 'hourOfDay', op: '>=', value: 1 }, { field: 'hourOfDay', op: '<', value: 5 }] } },
    ],
  };

  const DECISIONS = ['ALLOW', 'REVIEW', 'BLOCK'];
  const maxDecision = (a, b) => (DECISIONS.indexOf(a) >= DECISIONS.indexOf(b) ? a : b);

  class ValidationError extends Error {}

  // ---------- java.util.Random (so seed 7 gives the service's demo customers) ----------

  const MULT = 0x5DEECE66Dn;
  const MASK = (1n << 48n) - 1n;

  class JavaRandom {
    constructor(seed) {
      this.seed = (BigInt(seed) ^ MULT) & MASK;
      this.nextNextGaussian = null;
    }
    next(bits) {
      this.seed = (this.seed * MULT + 0xBn) & MASK;
      return Number(this.seed >> BigInt(48 - bits)) | 0;
    }
    nextInt(bound) {
      if ((bound & -bound) === bound) {
        return Number((BigInt(bound) * BigInt(this.next(31))) >> 31n);
      }
      let bits;
      let val;
      do {
        bits = this.next(31);
        val = bits % bound;
      } while (((bits - val + (bound - 1)) | 0) < 0);
      return val;
    }
    nextDouble() {
      return (this.next(26) * 134217728 + this.next(27)) / 9007199254740992;
    }
    nextLong() {
      return BigInt.asIntN(64, (BigInt(this.next(32)) << 32n) + BigInt(this.next(32)));
    }
    nextGaussian() {
      if (this.nextNextGaussian !== null) {
        const value = this.nextNextGaussian;
        this.nextNextGaussian = null;
        return value;
      }
      let v1;
      let v2;
      let s;
      do {
        v1 = 2 * this.nextDouble() - 1;
        v2 = 2 * this.nextDouble() - 1;
        s = v1 * v1 + v2 * v2;
      } while (s >= 1 || s === 0);
      const multiplier = Math.sqrt((-2 * Math.log(s)) / s);
      this.nextNextGaussian = v2 * multiplier;
      return v1 * multiplier;
    }
  }

  const newUuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

  // ---------- Money ----------

  const USD_PER_UNIT = { USD: 1.0, EUR: 1.08, GBP: 1.27, INR: 0.012, JPY: 0.0067, CAD: 0.73, AUD: 0.66, CHF: 1.13 };

  /** BigDecimal.valueOf(value).setScale(2, HALF_EVEN), returned as a number. */
  function roundHalfEven2(value) {
    const scaled = value * 100;
    const floor = Math.floor(scaled);
    const diff = scaled - floor;
    const EPS = 1e-9;
    let result;
    if (Math.abs(diff - 0.5) < EPS) result = floor % 2 === 0 ? floor : floor + 1;
    else result = Math.round(scaled);
    return result / 100;
  }

  // ---------- Velocity store (InMemoryVelocityStore) ----------

  const HOUR_MS = 3600000;
  const MINUTE_MS = 60000;

  class AccountState {
    constructor() {
      this.recent = [];
      this.counterparties = new Map();
      this.devices = new Set();
      this.countries = new Set();
      this.n = 0;
      this.mean = 0;
      this.m2 = 0;
      this.last = null;
    }
    record(event) {
      const now = event.timestamp;
      const amount = event.amountUsd;
      const hourAgo = now - HOUR_MS;
      const minuteAgo = now - MINUTE_MS;
      this.recent = this.recent.filter(tx => tx.ts > hourAgo);
      for (const [key, ts] of this.counterparties) if (ts <= hourAgo) this.counterparties.delete(key);
      const priorN = this.n;
      const priorMean = this.mean;
      const priorM2 = this.m2;
      const priorLast = this.last;
      const duplicate = this.recent.some(tx => tx.id === event.transactionId);
      let newDevice = false;
      let newCountry = false;
      if (!duplicate) {
        if (event.deviceId) {
          newDevice = this.n > 0 && !this.devices.has(event.deviceId);
          this.devices.add(event.deviceId);
        }
        if (event.country) {
          newCountry = this.n > 0 && !this.countries.has(event.country);
          this.countries.add(event.country);
        }
        this.recent.push({ id: event.transactionId, ts: now, amountUsd: amount });
        if (event.counterpartyId) {
          this.counterparties.set(event.counterpartyId, Math.max(this.counterparties.get(event.counterpartyId) ?? -Infinity, now));
        }
        this.n++;
        const delta = amount - this.mean;
        this.mean += delta / this.n;
        this.m2 += delta * (amount - this.mean);
        this.last = this.last === null ? now : Math.max(this.last, now);
      }
      let count60 = 0;
      let count1h = 0;
      let sum = 0;
      for (const tx of this.recent) {
        if (tx.ts > minuteAgo) count60++;
        if (tx.ts > hourAgo) {
          count1h++;
          sum += tx.amountUsd;
        }
      }
      let distinct = 0;
      for (const ts of this.counterparties.values()) if (ts > hourAgo) distinct++;
      const std = priorN >= 2 ? Math.sqrt(priorM2 / (priorN - 1)) : 0;
      const since = priorLast === null ? -1 : Math.max(0, now - priorLast) / 1000;
      return { txCount60s: count60, txCount1h: count1h, amountSum1hUsd: sum, distinctCounterparties1h: distinct,
        newDevice, newCountry, priorTxCount: priorN, priorMeanUsd: priorMean, priorStdUsd: std, secondsSinceLastTx: since };
    }
  }

  const accounts = new Map();
  function recordVelocity(event) {
    if (!accounts.has(event.accountId)) accounts.set(event.accountId, new AccountState());
    return accounts.get(event.accountId).record(event);
  }

  // ---------- Features ----------

  const MIN_HISTORY_FOR_ZSCORE = 5;
  const NO_PREVIOUS_TX_SECONDS = 30 * 86400;

  function features(event, v) {
    const amount = event.amountUsd;
    let z = 0;
    if (v.priorTxCount >= MIN_HISTORY_FOR_ZSCORE) {
      const spread = Math.max(v.priorStdUsd, Math.max(1.0, v.priorMeanUsd * 0.1));
      z = Math.max(-20, Math.min(20, (amount - v.priorMeanUsd) / spread));
    }
    return {
      amountUsd: amount, txCount60s: v.txCount60s, txCount1h: v.txCount1h, amountSum1hUsd: v.amountSum1hUsd,
      distinctCounterparties1h: v.distinctCounterparties1h, newDevice: v.newDevice, newCountry: v.newCountry,
      priorTxCount: v.priorTxCount, amountZScore: z, secondsSinceLastTx: v.secondsSinceLastTx,
      hourOfDay: new Date(event.timestamp).getUTCHours(),
    };
  }

  function modelInput(f) {
    const seconds = f.secondsSinceLastTx < 0 ? NO_PREVIOUS_TX_SECONDS : Math.min(f.secondsSinceLastTx, NO_PREVIOUS_TX_SECONDS);
    const angle = (2 * Math.PI * f.hourOfDay) / 24.0;
    return [Math.log1p(f.amountUsd), f.txCount60s, f.txCount1h, Math.log1p(f.amountSum1hUsd), f.distinctCounterparties1h,
      f.newDevice ? 1 : 0, f.newCountry ? 1 : 0, f.amountZScore, Math.log1p(seconds), Math.sin(angle), Math.cos(angle)]
      .map(Math.fround); // the service passes a float[] to ONNX Runtime
  }

  function featureMap(f) {
    return {
      amountUsd: f.amountUsd, txCount60s: f.txCount60s, txCount1h: f.txCount1h, amountSum1hUsd: f.amountSum1hUsd,
      distinctCounterparties1h: f.distinctCounterparties1h, newDevice: f.newDevice ? 1 : 0, newCountry: f.newCountry ? 1 : 0,
      priorTxCount: f.priorTxCount, amountZScore: f.amountZScore, secondsSinceLastTx: f.secondsSinceLastTx, hourOfDay: f.hourOfDay,
    };
  }

  // ---------- Isolation Forest (the service's ONNX graph, evaluated in JS) ----------

  let forest = null; // { trees: [[feature[], threshold[], left[], right[], weight[]], ...], constants }

  /** TreeEnsembleRegressor (BRANCH_LEQ, SUM) -> Div -> Neg -> Pow(2, x) -> Neg -> Sub(offset): decision_function. */
  function rawScore(input) {
    let pathSum = 0;
    for (const [feature, threshold, left, right, weight] of forest.trees) {
      let node = 0;
      while (feature[node] !== -1) {
        node = input[feature[node]] <= threshold[node] ? left[node] : right[node];
      }
      pathSum += weight[node];
    }
    const f = Math.fround;
    const { denominator, two, offset } = forest.constants;
    const normalised = f(f(pathSum) / denominator);
    const anomaly = f(Math.pow(two, -normalised));
    return f(-anomaly - offset);
  }

  const calibrate = raw => 1.0 / (1.0 + Math.exp((raw - MODEL_METADATA.center) / MODEL_METADATA.scale));

  // ---------- Rules ----------

  const NUMERIC_FIELDS = new Set(['amountUsd', 'txCount60s', 'txCount1h', 'amountSum1hUsd', 'distinctCounterparties1h',
    'newDevice', 'newCountry', 'priorTxCount', 'amountZScore', 'secondsSinceLastTx', 'hourOfDay', 'mlScore']);
  const TEXT_FIELDS = new Set(['channel', 'country', 'currency']);

  function parseCondition(node) {
    if (node.all) return { type: 'all', conditions: node.all.map(parseCondition) };
    if (node.any) return { type: 'any', conditions: node.any.map(parseCondition) };
    if (node.not) return { type: 'not', condition: parseCondition(node.not) };
    if (node.in) {
      if (!TEXT_FIELDS.has(node.field)) throw new Error('in needs a text field');
      return { type: 'in', field: node.field, values: new Set(node.in.map(String)) };
    }
    if (!NUMERIC_FIELDS.has(node.field)) throw new Error('Unknown field ' + node.field);
    const value = typeof node.value === 'boolean' ? (node.value ? 1 : 0) : Number(node.value);
    return { type: 'compare', field: node.field, op: node.op || '==', value };
  }

  function testCondition(c, ctx) {
    switch (c.type) {
      case 'all': return c.conditions.every(x => testCondition(x, ctx));
      case 'any': return c.conditions.some(x => testCondition(x, ctx));
      case 'not': return !testCondition(c.condition, ctx);
      case 'in': {
        const actual = ctx.texts[c.field];
        return actual != null && c.values.has(actual);
      }
      default: {
        const actual = ctx.numbers[c.field];
        switch (c.op) {
          case '>': return actual > c.value;
          case '>=': return actual >= c.value;
          case '<': return actual < c.value;
          case '<=': return actual <= c.value;
          case '==': return actual === c.value;
          case '!=': return actual !== c.value;
          default: throw new Error('Unknown operator ' + c.op);
        }
      }
    }
  }

  function conditionFields(c, into = []) {
    if (c.type === 'all' || c.type === 'any') c.conditions.forEach(x => conditionFields(x, into));
    else if (c.type === 'not') conditionFields(c.condition, into);
    else if (!into.includes(c.field)) into.push(c.field);
    return into;
  }

  function describe(ctx, field) {
    if (field in ctx.texts) return field + '=' + ctx.texts[field];
    const value = ctx.numbers[field];
    return Number.isInteger(value) && Math.abs(value) < 1e15 ? field + '=' + value : field + '=' + value.toFixed(2);
  }

  let ruleSet = {
    version: RULES_JSON.version,
    rules: RULES_JSON.rules.map(r => ({
      id: r.id, description: r.description, reasonCode: r.reasonCode || r.id, points: r.points || 0,
      action: r.action || null, mode: r.mode || 'ENFORCE', when: parseCondition(r.when),
    })),
  };

  function evaluateRules(set, ctx) {
    const enforced = [];
    const shadow = [];
    for (const rule of set.rules) {
      if (rule.mode === 'DISABLED' || !testCondition(rule.when, ctx)) continue;
      const evidence = conditionFields(rule.when).map(f => describe(ctx, f)).join(', ');
      const hit = { rule, reason: { code: rule.reasonCode, points: rule.points, detail: rule.description + ' (' + evidence + ')' } };
      (rule.mode === 'ENFORCE' ? enforced : shadow).push(hit);
    }
    return { enforced, shadow };
  }

  function nextVersion(version) {
    const marker = version.lastIndexOf('-r');
    if (marker > 0) {
      const n = Number(version.slice(marker + 2));
      if (Number.isInteger(n)) return version.slice(0, marker) + '-r' + (n + 1);
    }
    return version + '-r1';
  }

  function setRuleMode(id, mode) {
    if (!ruleSet.rules.some(r => r.id === id)) throw new ValidationError('Unknown rule ' + id);
    ruleSet = { version: nextVersion(ruleSet.version), rules: ruleSet.rules.map(r => (r.id === id ? { ...r, mode } : r)) };
    return ruleSet.rules.find(r => r.id === id);
  }

  const ruleView = r => ({ id: r.id, description: r.description, reasonCode: r.reasonCode, points: r.points,
    action: r.action, mode: r.mode, fields: conditionFields(r.when) });

  // ---------- DecisionMaker ----------

  function decide(mlScore, hits) {
    const reasons = [];
    let floor = 'ALLOW';
    let points = 0;
    if (mlScore >= POLICY.mlReasonThreshold) {
      const mlPoints = Math.round(POLICY.mlWeight * mlScore);
      points += mlPoints;
      reasons.push({ code: 'ML_ANOMALY', points: mlPoints, detail: 'Isolation Forest anomaly score ' + mlScore.toFixed(2) });
    }
    const rank = h => DECISIONS.indexOf(h.rule.action || 'ALLOW');
    const ordered = hits.slice().sort((a, b) => rank(b) - rank(a) || b.rule.points - a.rule.points);
    const ruleReasons = [];
    for (const hit of ordered) {
      points += hit.rule.points;
      ruleReasons.push(hit.reason);
      if (hit.rule.action) floor = maxDecision(floor, hit.rule.action);
    }
    const score = Math.min(100, points);
    const byScore = score >= POLICY.blockThreshold ? 'BLOCK' : score >= POLICY.reviewThreshold ? 'REVIEW' : 'ALLOW';
    const decision = maxDecision(byScore, floor);
    const forcing = r => ordered.some(h => h.reason === r && h.rule.action);
    const all = ruleReasons.concat(reasons);
    all.sort((a, b) => (forcing(a) === forcing(b) ? b.points - a.points : forcing(a) ? -1 : 1));
    if (all.length === 0) {
      all.push({ code: 'LOW_RISK', points: 0, detail: 'No rule matched and the transaction looks typical for the account' });
    }
    return { decision, score, reasons: all };
  }

  // ---------- ShadowMonitor ----------

  const shadowStats = { evaluated: 0, divergent: 0, byRule: new Map() };

  function recordShadow(mlScore, enforced, live, shadowHits, shadowDecision) {
    shadowStats.evaluated++;
    if (shadowHits.length === 0) return;
    if (shadowDecision !== live) shadowStats.divergent++;
    for (const hit of shadowHits) {
      const alone = decide(mlScore, enforced.concat([hit])).decision;
      if (!shadowStats.byRule.has(hit.rule.id)) shadowStats.byRule.set(hit.rule.id, { hits: 0, changes: new Map() });
      const stats = shadowStats.byRule.get(hit.rule.id);
      stats.hits++;
      if (alone !== live) {
        const key = live + '->' + alone;
        stats.changes.set(key, (stats.changes.get(key) || 0) + 1);
      }
    }
  }

  function shadowReport() {
    const total = shadowStats.evaluated;
    const rules = [...shadowStats.byRule.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([ruleId, s]) => {
      const changes = {};
      [...s.changes.keys()].sort().forEach(k => { changes[k] = s.changes.get(k); });
      const changed = Object.values(changes).reduce((x, y) => x + y, 0);
      return { ruleId, hits: s.hits, hitRate: total === 0 ? 0 : s.hits / total, wouldChangeDecision: changed, changes };
    });
    return { evaluated: total, divergentDecisions: shadowStats.divergent, rules };
  }

  // ---------- RiskEngine + DecisionService + store ----------

  const store = new Map(); // insertion order = decision order

  function score(event) {
    const start = performance.now();
    const snapshot = recordVelocity(event);
    const f = features(event, snapshot);
    const mlScore = calibrate(rawScore(modelInput(f)));
    const set = ruleSet;
    const ctx = { numbers: { ...featureMap(f), mlScore }, texts: { channel: event.channel, country: event.country, currency: event.currency } };
    const evaluation = evaluateRules(set, ctx);
    const live = decide(mlScore, evaluation.enforced);
    let shadow = null;
    if (evaluation.shadow.length > 0) {
      const would = decide(mlScore, evaluation.enforced.concat(evaluation.shadow));
      shadow = { decision: would.decision, score: would.score, reasons: would.reasons };
    }
    recordShadow(mlScore, evaluation.enforced, live.decision, evaluation.shadow, shadow ? shadow.decision : live.decision);
    return {
      transactionId: event.transactionId, accountId: event.accountId, decision: live.decision, score: live.score,
      reasons: live.reasons, mlScore: Math.round(mlScore * 10000) / 10000, shadow, degraded: false,
      modelVersion: MODEL_METADATA.version, rulesVersion: set.version,
      latencyMicros: Math.max(0, Math.round((performance.now() - start) * 1000)), decidedAt: new Date().toISOString(),
    };
  }

  function validate(event) {
    const text = (v, name) => {
      if (typeof v !== 'string' || !v.trim() || v.length > 128) throw new ValidationError(name + ' must be 1-128 characters');
    };
    text(event.transactionId, 'transactionId');
    text(event.accountId, 'accountId');
    if (!(Number(event.amount) > 0)) throw new ValidationError('amount must be positive');
    if (!(event.currency in USD_PER_UNIT)) throw new ValidationError('currency must be one of USD, EUR, GBP, INR, JPY, CAD, AUD, CHF');
    if (!['CARD', 'TRANSFER', 'DEPOSIT', 'WITHDRAWAL'].includes(event.channel)) throw new ValidationError('channel is required');
    if (!Number.isFinite(event.timestamp)) throw new ValidationError('timestamp is required');
    if (event.country != null && !/^[A-Z]{2}$/.test(event.country)) throw new ValidationError('country must be an ISO 3166-1 alpha-2 code');
  }

  function decideEvent(event) {
    validate(event);
    if (store.has(event.transactionId)) return store.get(event.transactionId);
    const decision = score(event);
    store.set(decision.transactionId, decision);
    if (store.size > STORE_CAPACITY) store.delete(store.keys().next().value);
    return decision;
  }

  function recent(limit) {
    const all = [...store.values()];
    return all.slice(Math.max(0, all.length - limit)).reverse();
  }

  // ---------- TrafficSimulator + DemoTraffic ----------

  const CURRENCIES = ['USD', 'USD', 'EUR', 'EUR', 'GBP', 'INR'];
  const HOME = ['US', 'US', 'DE', 'FR', 'GB', 'IN'];
  const ELSEWHERE = ['BR', 'NG', 'RU', 'VN', 'UA', 'PH', 'RO', 'ID', 'MX', 'TR'];
  const TRAVEL = ['ES', 'IT', 'NL', 'CA', 'JP', 'AE', 'SG', 'PT'];
  const ATTACKS = ['CARD_TESTING', 'ACCOUNT_TAKEOVER', 'MULE_FAN_OUT', 'AMOUNT_SPIKE'];

  const simRandom = new JavaRandom(DEMO.seed);
  const demoRandom = new JavaRandom(DEMO.seed);
  const id = prefix => prefix + '-' + (simRandom.nextLong() & 0xffffffffffn).toString(16);
  const pick = values => values[simRandom.nextInt(values.length)];

  function newProfile(accountId) {
    const home = simRandom.nextInt(CURRENCIES.length);
    const p = {
      accountId, currency: CURRENCIES[home], homeCountry: HOME[home],
      medianUsd: Math.exp(2.8 + simRandom.nextGaussian() * 0.7),
      perDay: 2 + simRandom.nextDouble() * 8,
      cardShare: 0.5 + simRandom.nextDouble() * 0.4,
      devices: [], payees: [], merchants: [],
    };
    p.devices.push(id('dev'));
    if (simRandom.nextDouble() < 0.4) p.devices.push(id('dev'));
    for (let i = 0, n = 4 + simRandom.nextInt(8); i < n; i++) p.payees.push(id('acct'));
    for (let i = 0, n = 6 + simRandom.nextInt(10); i < n; i++) p.merchants.push('m-' + simRandom.nextInt(500));
    return p;
  }

  function makeEvent(p, counterparty, usd, channel, device, country, at) {
    const local = Math.max(0.01, roundHalfEven2(usd / USD_PER_UNIT[p.currency]));
    return { transactionId: newUuid(), accountId: p.accountId, counterpartyId: counterparty, amount: local,
      amountUsd: local * USD_PER_UNIT[p.currency], currency: p.currency, channel, deviceId: device, country, timestamp: at };
  }

  function normalEvent(p, at) {
    const card = simRandom.nextDouble() < p.cardShare;
    let usd = p.medianUsd * Math.exp(simRandom.nextGaussian() * 0.6);
    if (simRandom.nextDouble() < 0.02) usd *= 4 + simRandom.nextDouble() * 4;
    let device = pick(p.devices);
    if (simRandom.nextDouble() < 0.02) {
      device = id('dev');
      p.devices.push(device);
    }
    const country = simRandom.nextDouble() < 0.02 ? TRAVEL[simRandom.nextInt(TRAVEL.length)] : p.homeCountry;
    const counterparty = card ? pick(p.merchants) : pick(p.payees);
    return makeEvent(p, counterparty, usd, card ? 'CARD' : 'TRANSFER', device, country, at);
  }

  function attackEvents(scenario, p, at) {
    const events = [];
    if (scenario === 'CARD_TESTING') {
      const device = id('dev');
      const country = ELSEWHERE[simRandom.nextInt(ELSEWHERE.length)];
      let t = at;
      for (let i = 0, n = 8 + simRandom.nextInt(13); i < n; i++) {
        events.push(makeEvent(p, 'm-' + simRandom.nextInt(5000), 0.5 + simRandom.nextDouble() * 4.5, 'CARD', device, country, t));
        t += 1500 + simRandom.nextInt(4000);
      }
    } else if (scenario === 'ACCOUNT_TAKEOVER') {
      const device = id('dev');
      const country = ELSEWHERE[simRandom.nextInt(ELSEWHERE.length)];
      let t = at;
      for (let i = 0, n = 1 + simRandom.nextInt(3); i < n; i++) {
        const usd = Math.max(1200, p.medianUsd * (25 + simRandom.nextDouble() * 40));
        events.push(makeEvent(p, id('acct'), usd, 'TRANSFER', device, country, t));
        t += (60 + simRandom.nextInt(600)) * 1000;
      }
    } else if (scenario === 'MULE_FAN_OUT') {
      const device = pick(p.devices);
      let t = at;
      for (let i = 0, n = 10 + simRandom.nextInt(6); i < n; i++) {
        events.push(makeEvent(p, id('acct'), 150 + simRandom.nextDouble() * 700, 'TRANSFER', device, p.homeCountry, t));
        t += (30 + simRandom.nextInt(200)) * 1000;
      }
    } else if (scenario === 'AMOUNT_SPIKE') {
      events.push(makeEvent(p, id('acct'), Math.max(900, p.medianUsd * (40 + simRandom.nextDouble() * 60)), 'TRANSFER',
        pick(p.devices), p.homeCountry, at));
    }
    return events;
  }

  const profiles = [];
  const safely = action => {
    try {
      action();
    } catch (error) {
      console.warn('Demo traffic event failed:', error.message); // eslint-disable-line no-console
    }
  };

  function startDemo() {
    const now = Date.now();
    for (let i = 0; i < DEMO.customers; i++) {
      const profile = newProfile('demo-' + String(i).padStart(4, '0'));
      profiles.push(profile);
      // A day of history fed straight into the velocity store, not scored.
      for (let k = 0; k < 8; k++) {
        const at = now - (3600 + demoRandom.nextInt(86400)) * 1000;
        recordVelocity(normalEvent(profile, at));
      }
    }
    setInterval(() => safely(() => decideEvent(normalEvent(profiles[demoRandom.nextInt(profiles.length)], Date.now()))),
      DEMO.normalIntervalMs);
    setInterval(() => attack(ATTACKS[demoRandom.nextInt(ATTACKS.length)]), DEMO.attackIntervalMs);
  }

  /** Plays an attack in real time at 4x speed, as DemoTraffic does. Returns the account attacked. */
  function attack(scenario) {
    const victim = profiles[demoRandom.nextInt(profiles.length)];
    const start = Date.now();
    for (const event of attackEvents(scenario, victim, start)) {
      const delay = Math.min(event.timestamp - start, 20000);
      setTimeout(() => safely(() => decideEvent(event)), Math.max(0, delay / 4));
    }
    return victim.accountId;
  }

  // ---------- HTTP routing ----------

  class HttpError extends Error {
    constructor(status, code, message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }

  function limit(params) {
    const raw = params.get('limit');
    if (raw === null) return 50;
    if (!/^-?\d+$/.test(raw)) throw new ValidationError('limit must be an integer');
    const n = Number(raw);
    if (n < 1 || n > MAX_PAGE) throw new ValidationError('limit must be between 1 and ' + MAX_PAGE);
    return n;
  }

  function readJson(body) {
    try {
      return body ? JSON.parse(body) : null;
    } catch (error) {
      throw new ValidationError('Body is not valid JSON: ' + error.message);
    }
  }

  function handle(method, url, body) {
    const path = url.pathname;
    let match;
    if (method === 'GET' && path === '/health') return { status: 200, json: { status: 'UP', model: MODEL_METADATA.version, rules: ruleSet.version } };
    if (method === 'GET' && path === '/v1/decisions') return { status: 200, json: recent(limit(url.searchParams)) };
    if (method === 'GET' && (match = /^\/v1\/decisions\/(.+)$/.exec(path))) {
      const txId = decodeURIComponent(match[1]);
      if (!store.has(txId)) throw new HttpError(404, 'NOT_FOUND', 'No decision for transaction ' + txId);
      return { status: 200, json: store.get(txId) };
    }
    if (method === 'GET' && path === '/v1/rules') return { status: 200, json: { version: ruleSet.version, rules: ruleSet.rules.map(ruleView) } };
    if (method === 'PUT' && (match = /^\/v1\/rules\/([^/]+)\/mode$/.exec(path))) {
      const request = readJson(body);
      if (!request || !request.mode) throw new ValidationError('mode is required');
      if (!['ENFORCE', 'SHADOW', 'DISABLED'].includes(request.mode)) throw new ValidationError('mode must be one of ENFORCE, SHADOW, DISABLED');
      return { status: 200, json: ruleView(setRuleMode(decodeURIComponent(match[1]), request.mode)) };
    }
    if (method === 'GET' && path === '/v1/shadow/report') return { status: 200, json: shadowReport() };
    if (method === 'GET' && path === '/v1/model') return { status: 200, json: MODEL_METADATA };
    if (method === 'GET' && path === '/v1/demo') return { status: 200, json: { enabled: true } };
    if (method === 'POST' && (match = /^\/v1\/demo\/attacks\/([^/]+)$/.exec(path))) {
      const scenario = decodeURIComponent(match[1]).toUpperCase().replace(/-/g, '_');
      if (scenario === 'NORMAL') throw new ValidationError('NORMAL is not an attack');
      if (!ATTACKS.includes(scenario)) throw new ValidationError('scenario must be one of card-testing, account-takeover, mule-fan-out, amount-spike');
      return { status: 202, json: { scenario, accountId: attack(scenario) } };
    }
    if (method === 'POST' && path === '/v1/score') {
      const e = readJson(body);
      if (!e) throw new ValidationError('Body is required');
      const timestamp = Date.parse(e.timestamp);
      const amount = Number(e.amount);
      const event = { ...e, amount, timestamp, amountUsd: (e.currency in USD_PER_UNIT) ? amount * USD_PER_UNIT[e.currency] : NaN };
      return { status: 200, json: decideEvent(event) };
    }
    return null;
  }

  // ---------- fetch shim ----------

  const API_PATH = /^\/(health|v1)(\/|$)/;
  const realFetch = window.fetch.bind(window);
  const ready = realFetch(BASE + 'iforest.json')
    .then(response => {
      if (!response.ok) throw new Error('Model failed to load (' + response.status + ')');
      return response.json();
    })
    .then(model => {
      forest = model;
      startDemo();
    });

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.origin);
    if (url.origin !== window.location.origin || !API_PATH.test(url.pathname)) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    let result;
    try {
      await ready;
      result = handle(method, url, init.body);
      if (result === null) throw new HttpError(404, 'NOT_FOUND', 'Endpoint ' + method + ' ' + url.pathname + ' not found');
    } catch (error) {
      if (error instanceof ValidationError) result = { status: 400, json: { error: 'VALIDATION_FAILED', message: error.message } };
      else if (error instanceof HttpError) result = { status: error.status, json: { error: error.code, message: error.message } };
      else result = { status: 500, json: { error: 'INTERNAL_ERROR', message: 'Unexpected error' } };
    }
    return new Response(JSON.stringify(result.json), { status: result.status, headers: { 'Content-Type': 'application/json' } });
  };
})();
