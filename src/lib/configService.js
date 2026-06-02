'use strict';

// Phase 2 — Static→Dynamic refactor
// Single read/write surface for `app_config` + `dispatch_policy` + `pods`
// + `models` + `model_policy`. Backend code MUST go through this module
// instead of touching db.js directly so all writes generate audit rows +
// SSE events automatically.

const db = require('../db');
const fallback = require('./configFallback');

// In-process cache of every config key the app has read since boot. Cleared
// on any write so SSE consumers always see fresh values.
const cache = new Map();
let cacheBootstrapped = false;
let fallbackActive = false;

// SSE subscribers. Each entry = (event, key, value) => void
const subscribers = new Set();

function emit(event, payload) {
  for (const fn of subscribers) {
    try { fn(event, payload); }
    catch (err) { console.error('[configService] subscriber threw:', err.message); }
  }
}

function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function bootstrap() {
  if (cacheBootstrapped) return;
  try {
    const rows = db.getAllConfig();
    for (const r of rows) cache.set(r.key, r.value);
    fallbackActive = false;
  } catch (err) {
    console.error('[configService] bootstrap failed, using fallback constants:', err.message);
    fallbackActive = true;
  }
  cacheBootstrapped = true;
}

// Resolve a "dotted" key (e.g. "health.threshold_healthy") against either
// the live cache or the fallback object. Used by getConfig().
function lookupFallback(dottedKey) {
  const parts = dottedKey.split('.');
  let node = fallback;
  for (const p of parts) {
    if (node && typeof node === 'object' && p in node) node = node[p];
    else return undefined;
  }
  return node;
}

function getConfig(key) {
  bootstrap();
  if (cache.has(key)) return cache.get(key);
  if (fallbackActive) {
    const fb = lookupFallback(key);
    if (fb !== undefined) return fb;
  }
  // Try fresh DB read in case cache missed.
  try {
    const v = db.getConfigValue(key);
    if (v !== undefined) {
      cache.set(key, v);
      return v;
    }
  } catch (err) {
    console.error(`[configService] getConfig("${key}") DB read failed:`, err.message);
  }
  return lookupFallback(key);
}

function getRequired(key) {
  const v = getConfig(key);
  if (v === undefined || v === null) {
    throw new Error(`Required config key "${key}" not set and no fallback available`);
  }
  return v;
}

function setConfig(key, value, { category, description = null, source = 'api' } = {}) {
  if (!category) throw new Error(`setConfig requires a category for key "${key}"`);
  const before = (() => { try { return db.getConfigValue(key); } catch { return undefined; } })();
  db.upsertConfig({ key, value, category, description });
  db.appendConfigAudit({ key, before, after: value, source });
  cache.set(key, value);
  emit('config:update', { key, value, before, source });
}

function getAll(category = null) {
  bootstrap();
  try {
    return db.getAllConfig(category);
  } catch (err) {
    console.error('[configService] getAll failed, returning fallback:', err.message);
    return fallbackFlatten(category);
  }
}

// Flatten fallback object into { key, value, category } rows so it matches
// the DB shape when DB is unreachable.
function fallbackFlatten(filterCategory = null) {
  const out = [];
  for (const [category, group] of Object.entries(fallback)) {
    if (filterCategory && category !== filterCategory) continue;
    for (const [k, v] of Object.entries(group)) {
      out.push({
        key: `${category}.${k}`,
        value: v,
        category,
        description: null,
        updatedAt: null,
      });
    }
  }
  return out;
}

function getAudit({ key = null, limit = 50 } = {}) {
  try { return db.getConfigAudit({ key, limit }); }
  catch (err) {
    console.error('[configService] getAudit failed:', err.message);
    return [];
  }
}

function isFallbackActive() {
  bootstrap();
  return fallbackActive;
}

function invalidateCache() {
  cache.clear();
  cacheBootstrapped = false;
}

// ── Dispatch policy (JSON singleton) ──────────────────────────────────────
function getDispatchPolicy() {
  try {
    const stored = db.loadDispatchPolicy();
    if (stored && Object.keys(stored).length > 0) return stored;
  } catch (err) {
    console.error('[configService] dispatch policy read failed:', err.message);
  }
  return fallback.dispatch_policy;
}

function setDispatchPolicy(policy, { source = 'api' } = {}) {
  const before = (() => { try { return db.loadDispatchPolicy(); } catch { return null; } })();
  db.saveDispatchPolicy(policy);
  db.appendConfigAudit({ key: 'dispatch_policy', before, after: policy, source });
  emit('config:update', { key: 'dispatch_policy', value: policy, before, source });
}

// ── Pods ──────────────────────────────────────────────────────────────────
function listPods() {
  try { return db.listPods(); }
  catch (err) {
    console.error('[configService] listPods failed:', err.message);
    return [];
  }
}

function upsertPod(pod, { source = 'api' } = {}) {
  const before = listPods().find((p) => p.id === pod.id) || null;
  db.upsertPod(pod);
  db.appendConfigAudit({ key: `pods.${pod.id}`, before, after: pod, source });
  emit('config:update', { key: `pods.${pod.id}`, value: pod, before, source });
}

function deletePod(id, { source = 'api' } = {}) {
  const before = listPods().find((p) => p.id === id) || null;
  db.deletePod(id);
  db.appendConfigAudit({ key: `pods.${id}`, before, after: null, source });
  emit('config:update', { key: `pods.${id}`, value: null, before, source });
}

// ── Models ────────────────────────────────────────────────────────────────
function listModels() {
  try { return db.listModels(); }
  catch (err) {
    console.error('[configService] listModels failed:', err.message);
    return [];
  }
}

function getModelCostPenalty(modelId) {
  if (!modelId) return 0.5;
  try {
    const exact = db.getModel(modelId);
    if (exact) return exact.cost_penalty;
    const m = String(modelId).toLowerCase();
    const all = listModels();
    const partial = all.find((row) => m.includes(String(row.tier).toLowerCase()) || m.includes(String(row.id).toLowerCase()));
    if (partial) return partial.cost_penalty;
  } catch (err) {
    console.error('[configService] getModelCostPenalty failed:', err.message);
  }
  // Fallback heuristic — mirrors old dispatch.js tierCostPenalty.
  const m = String(modelId).toLowerCase();
  if (m.includes('opus')) return 1.0;
  if (m.includes('haiku')) return 0.05;
  if (m.includes('sonnet')) return 0.3; // allowed: name-substring heuristic
  return 0.5;
}

function upsertModel(model, { source = 'api' } = {}) {
  const before = (() => { try { return db.getModel(model.id); } catch { return null; } })();
  db.upsertModel(model);
  db.appendConfigAudit({ key: `models.${model.id}`, before, after: model, source });
  emit('config:update', { key: `models.${model.id}`, value: model, before, source });
}

// ── Model policy ──────────────────────────────────────────────────────────
function listModelPolicy() {
  try { return db.listModelPolicy(); }
  catch (err) {
    console.error('[configService] listModelPolicy failed:', err.message);
    return [];
  }
}

function replaceModelPolicy(rows, { source = 'api' } = {}) {
  const before = listModelPolicy();
  db.clearModelPolicy();
  for (const r of rows) db.insertModelPolicy(r);
  db.appendConfigAudit({ key: 'model_policy', before, after: rows, source });
  emit('config:update', { key: 'model_policy', value: rows, before, source });
}

module.exports = {
  getConfig,
  getRequired,
  setConfig,
  getAll,
  getAudit,
  subscribe,
  isFallbackActive,
  invalidateCache,
  // dispatch policy
  getDispatchPolicy,
  setDispatchPolicy,
  // pods
  listPods,
  upsertPod,
  deletePod,
  // models
  listModels,
  getModelCostPenalty,
  upsertModel,
  // model policy
  listModelPolicy,
  replaceModelPolicy,
};
