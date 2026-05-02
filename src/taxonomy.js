'use strict';

// Taxonomy: dynamic squads + tag definitions.
// Single source of truth = JSON files in ~/.claude/org/.
// Reads cached for perf; writes invalidate cache + emit SSE.

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = os.homedir();
const ORG_DIR = path.join(HOME, '.claude', 'org');
const SQUADS_PATH = path.join(ORG_DIR, 'squads.json');
const TAGS_PATH = path.join(ORG_DIR, 'tag-taxonomy.json');
const TIERS_PATH = path.join(ORG_DIR, 'tiers.json');

let _squadsCache = null;
let _tagsCache = null;
let _tiersCache = null;

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    console.warn(`[taxonomy] failed to read ${filePath}: ${err.message}`);
    return fallback;
  }
}

function atomicWrite(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}

function loadSquads() {
  if (_squadsCache) return _squadsCache;
  const raw = readJson(SQUADS_PATH, { version: 1, squads: {} });
  _squadsCache = raw;
  return raw;
}

function loadTags() {
  if (_tagsCache) return _tagsCache;
  const raw = readJson(TAGS_PATH, { version: 1, categories: {} });
  _tagsCache = raw;
  return raw;
}

function loadTiers() {
  if (_tiersCache) return _tiersCache;
  const raw = readJson(TIERS_PATH, { version: 1, tiers: {} });
  _tiersCache = raw;
  return raw;
}

function invalidate() {
  _squadsCache = null;
  _tagsCache = null;
  _tiersCache = null;
}

function listSquads() {
  const data = loadSquads();
  return Object.values(data.squads || {});
}

function listTagCategories() {
  const data = loadTags();
  return data.categories || {};
}

function listTiers() {
  const data = loadTiers();
  return Object.values(data.tiers || {}).sort((a, b) => (a.order || 99) - (b.order || 99));
}

function getTaxonomy() {
  return {
    squads: listSquads(),
    categories: listTagCategories(),
    tiers: listTiers(),
  };
}

// ── Squads ─────────────────────────────────────────────────────────────────

function addSquad(squad) {
  if (!squad?.id || typeof squad.id !== 'string') throw new Error('Squad id required');
  if (!squad.label) throw new Error('Squad label required');
  if (squad.label.length > 80) throw new Error('Squad label must be ≤80 chars');
  if (squad.description && squad.description.length > 500) throw new Error('Squad description must be ≤500 chars');
  const id = squad.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!id) throw new Error('Invalid squad id');
  const data = readJson(SQUADS_PATH, { version: 1, squads: {} });
  data.squads = data.squads || {};
  if (data.squads[id]) throw new Error(`Squad "${id}" already exists`);
  data.squads[id] = {
    id,
    label: squad.label.trim(),
    description: (squad.description || '').trim(),
    color: squad.color || '#6b7280',
    emoji: squad.emoji || '⚙️',
    members: Array.isArray(squad.members) ? squad.members : [],
  };
  data.updatedAt = new Date().toISOString();
  atomicWrite(SQUADS_PATH, data);
  invalidate();
  return data.squads[id];
}

function updateSquad(id, patch) {
  const data = readJson(SQUADS_PATH, { version: 1, squads: {} });
  if (!data.squads?.[id]) throw new Error(`Squad "${id}" not found`);
  const allowed = ['label', 'description', 'color', 'emoji', 'members'];
  const next = { ...data.squads[id] };
  for (const k of allowed) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }
  data.squads[id] = next;
  data.updatedAt = new Date().toISOString();
  atomicWrite(SQUADS_PATH, data);
  invalidate();
  return next;
}

function deleteSquad(id, agentList = []) {
  const data = readJson(SQUADS_PATH, { version: 1, squads: {} });
  if (!data.squads?.[id]) throw new Error(`Squad "${id}" not found`);
  const inUse = agentList.filter(a => a.squad === id);
  if (inUse.length > 0) {
    const ids = inUse.map(a => a.id).join(', ');
    throw new Error(`Cannot delete: ${inUse.length} agent(s) still in this squad (${ids})`);
  }
  delete data.squads[id];
  data.updatedAt = new Date().toISOString();
  atomicWrite(SQUADS_PATH, data);
  invalidate();
  return { ok: true, deleted: id };
}

// ── Tags ───────────────────────────────────────────────────────────────────

function addTag(category, tag, info = {}) {
  if (!category || !tag) throw new Error('Category and tag required');
  const tagId = tag.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!tagId) throw new Error('Invalid tag id');
  const data = readJson(TAGS_PATH, { version: 1, categories: {} });
  data.categories = data.categories || {};
  if (!data.categories[category]) {
    throw new Error(`Category "${category}" does not exist. Existing: ${Object.keys(data.categories).join(', ')}`);
  }
  data.categories[category].tags = data.categories[category].tags || {};
  if (data.categories[category].tags[tagId]) {
    throw new Error(`Tag "${tagId}" already exists in "${category}"`);
  }
  data.categories[category].tags[tagId] = {
    label: info.label || tagId,
    description: info.description || '',
  };
  data.updatedAt = new Date().toISOString();
  atomicWrite(TAGS_PATH, data);
  invalidate();
  return { category, tag: tagId, info: data.categories[category].tags[tagId] };
}

function updateTag(category, tag, patch) {
  const data = readJson(TAGS_PATH, { version: 1, categories: {} });
  if (!data.categories?.[category]?.tags?.[tag]) {
    throw new Error(`Tag "${tag}" not found in "${category}"`);
  }
  const allowed = ['label', 'description'];
  const next = { ...data.categories[category].tags[tag] };
  for (const k of allowed) {
    if (patch[k] !== undefined) next[k] = patch[k];
  }
  data.categories[category].tags[tag] = next;
  data.updatedAt = new Date().toISOString();
  atomicWrite(TAGS_PATH, data);
  invalidate();
  return { category, tag, info: next };
}

// Cascade delete — clears squad from every agent that uses it, then deletes
// the squad. Caller passes orgModule so we can bulk-update agents safely.
function cascadeDeleteSquad(id, orgModule) {
  const data = readJson(SQUADS_PATH, { version: 1, squads: {} });
  if (!data.squads?.[id]) throw new Error(`Squad "${id}" not found`);
  const agents = orgModule.listAgentRecords();
  const affected = agents.filter(a => a.squad === id);
  for (const a of affected) {
    try { orgModule.upsertAgent(a.id, { squad: null }); } catch (err) {
      console.warn(`[taxonomy] cascade clear squad failed for ${a.id}: ${err.message}`);
    }
  }
  // Now safe to delete (agentList empty so the in-use guard passes)
  return { ...deleteSquad(id, []), cascaded: affected.length };
}

// Cascade delete — strips the tag from every agent's tag-array in this
// category, then deletes the tag from the taxonomy.
function cascadeDeleteTag(category, tag, orgModule) {
  const data = readJson(TAGS_PATH, { version: 1, categories: {} });
  if (!data.categories?.[category]?.tags?.[tag]) {
    throw new Error(`Tag "${tag}" not found in "${category}"`);
  }
  const agents = orgModule.listAgentRecords();
  const affected = agents.filter(a => (a.tags?.[category] || []).includes(tag));
  for (const a of affected) {
    try {
      const nextTags = { ...(a.tags || {}) };
      nextTags[category] = (nextTags[category] || []).filter(t => t !== tag);
      orgModule.upsertAgent(a.id, { tags: nextTags });
    } catch (err) {
      console.warn(`[taxonomy] cascade clear tag failed for ${a.id}: ${err.message}`);
    }
  }
  return { ...deleteTag(category, tag, []), cascaded: affected.length };
}

function deleteTag(category, tag, agentList = []) {
  const data = readJson(TAGS_PATH, { version: 1, categories: {} });
  if (!data.categories?.[category]?.tags?.[tag]) {
    throw new Error(`Tag "${tag}" not found in "${category}"`);
  }
  const inUse = agentList.filter(a => (a.tags?.[category] || []).includes(tag));
  if (inUse.length > 0) {
    const ids = inUse.slice(0, 5).map(a => a.id).join(', ');
    throw new Error(`Cannot delete: ${inUse.length} agent(s) still tagged (${ids}${inUse.length > 5 ? '...' : ''})`);
  }
  delete data.categories[category].tags[tag];
  data.updatedAt = new Date().toISOString();
  atomicWrite(TAGS_PATH, data);
  invalidate();
  return { ok: true, deleted: { category, tag } };
}

// ── Tiers ──────────────────────────────────────────────────────────────────

function addTier(tier) {
  if (!tier?.id) throw new Error('Tier id required');
  if (!tier.label) throw new Error('Tier label required');
  if (tier.label.length > 80) throw new Error('Tier label must be ≤80 chars');
  if (tier.description && tier.description.length > 500) throw new Error('Tier description must be ≤500 chars');
  const id = tier.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!id) throw new Error('Invalid tier id');
  const data = readJson(TIERS_PATH, { version: 1, tiers: {} });
  data.tiers = data.tiers || {};
  if (data.tiers[id]) throw new Error(`Tier "${id}" already exists`);
  const maxOrder = Math.max(0, ...Object.values(data.tiers).map(t => t.order || 0));
  data.tiers[id] = {
    id,
    label: tier.label.trim(),
    description: (tier.description || '').trim(),
    color: tier.color || '#6b7280',
    icon: tier.icon || 'Cpu',
    order: tier.order ?? maxOrder + 1,
  };
  data.updatedAt = new Date().toISOString();
  atomicWrite(TIERS_PATH, data);
  invalidate();
  return data.tiers[id];
}

function updateTier(id, patch) {
  const data = readJson(TIERS_PATH, { version: 1, tiers: {} });
  if (!data.tiers?.[id]) throw new Error(`Tier "${id}" not found`);
  const allowed = ['label', 'description', 'color', 'icon', 'order'];
  const next = { ...data.tiers[id] };
  for (const k of allowed) if (patch[k] !== undefined) next[k] = patch[k];
  data.tiers[id] = next;
  data.updatedAt = new Date().toISOString();
  atomicWrite(TIERS_PATH, data);
  invalidate();
  return next;
}

function deleteTier(id, agentList = []) {
  const data = readJson(TIERS_PATH, { version: 1, tiers: {} });
  if (!data.tiers?.[id]) throw new Error(`Tier "${id}" not found`);
  const inUse = agentList.filter(a => a.tier === id);
  if (inUse.length > 0) {
    const ids = inUse.slice(0, 5).map(a => a.id).join(', ');
    throw new Error(`Cannot delete: ${inUse.length} agent(s) on this tier (${ids}${inUse.length > 5 ? '...' : ''})`);
  }
  delete data.tiers[id];
  data.updatedAt = new Date().toISOString();
  atomicWrite(TIERS_PATH, data);
  invalidate();
  return { ok: true, deleted: id };
}

module.exports = {
  loadSquads,
  loadTags,
  loadTiers,
  listSquads,
  listTagCategories,
  listTiers,
  getTaxonomy,
  addSquad,
  updateSquad,
  deleteSquad,
  cascadeDeleteSquad,
  addTag,
  updateTag,
  addTier,
  updateTier,
  deleteTier,
  deleteTag,
  cascadeDeleteTag,
  invalidate,
};
