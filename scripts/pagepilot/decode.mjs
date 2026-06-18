// PagePilot share-page decoder — dependency-free React Router 7 turbo-stream hydrator.
//
// Bare https://app.pagepilot.ai/share/{id} is an RR7 SPA shell (returns only <title>).
// The clean data path is GET https://app.pagepilot.ai/share/{id}.data → HTTP 200,
// content-type text/x-script: a turbo-stream "single-fetch" payload = a FLAT reference
// graph. Objects encode keys as "_<keyIdx>":valIdx where both indices point back into
// the flat array; this hydrates that graph into normal JSON.
//
// Verified against all 8 pages (Greens/Bloom/Honey/Clarity/Aura/Legacy/Stone/Cotton)
// on 2026-06-15. The page object lives at root["routes/share/index"].data and carries
// { id, name, json_schema:{order, sections}, template_color_preset, ... }.

// turbo-stream v2 negative sentinels (best-effort; structural data never uses these).
const SENTINELS = { '-1': undefined, '-2': undefined, '-3': NaN, '-4': Infinity, '-5': -Infinity, '-6': -0 };
const MAX_DEPTH = 400;

/** Hydrate a turbo-stream flat-reference payload (string) into plain JS. Throws on malformed input. */
export function decodeTurboStream(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('empty payload');
  // The payload can be newline-delimited; the reference graph is the first top-level JSON array.
  let flat = null;
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('[')) continue;
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) { flat = parsed; break; }
    } catch { /* keep scanning */ }
  }
  if (!flat) {
    // Last resort: whole payload is one JSON value.
    const parsed = JSON.parse(raw);
    flat = Array.isArray(parsed) ? parsed : [parsed];
  }

  const cache = new Map(); // idx -> hydrated value (set before recursing → cycle-safe)
  function hydrate(idx, depth) {
    if (typeof idx !== 'number') return idx; // already a literal
    if (idx < 0) return Object.prototype.hasOwnProperty.call(SENTINELS, String(idx)) ? SENTINELS[String(idx)] : null;
    if (depth > MAX_DEPTH) return null;
    if (cache.has(idx)) return cache.get(idx);
    const v = flat[idx];
    if (v === undefined) return null;
    if (Array.isArray(v)) {
      const arr = [];
      cache.set(idx, arr);
      for (const e of v) arr.push(hydrate(e, depth + 1));
      return arr;
    }
    if (v && typeof v === 'object') {
      const obj = {};
      cache.set(idx, obj);
      for (const k of Object.keys(v)) {
        const keyIdx = Number(k.slice(1)); // keys look like "_<keyIdx>"
        const realKey = k.startsWith('_') && !Number.isNaN(keyIdx) ? flat[keyIdx] : k;
        obj[realKey] = hydrate(v[k], depth + 1);
      }
      return obj;
    }
    cache.set(idx, v);
    return v;
  }
  return hydrate(0, 0);
}

/** Locate the share-page object regardless of RR7 route-key drift. Returns null if not found. */
export function extractPage(root) {
  const direct = root?.['routes/share/index']?.data;
  if (direct?.json_schema?.sections) return direct;
  // Fallback: depth-first hunt for any node shaped like a page.
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (node.json_schema?.sections && node.json_schema?.order) return node;
    for (const k of Object.keys(node)) stack.push(node[k]);
  }
  return null;
}

/** Recursively collect a block's type + nested child block types (composition fingerprint). */
function readBlock(id, blocks) {
  const b = blocks?.[id];
  if (!b) return null;
  const childIds = Array.isArray(b.block_order) ? b.block_order : Object.keys(b.blocks || {});
  const children = childIds.map((cid) => readBlock(cid, b.blocks)).filter(Boolean);
  return {
    id,
    type: b.type || 'unknown',
    settings: b.settings && typeof b.settings === 'object' ? b.settings : {},
    children,
  };
}

/** Normalize a decoded page object into the analysis-friendly shape the agents read. */
export function normalizePage(page) {
  const schema = page?.json_schema || {};
  const order = Array.isArray(schema.order) ? schema.order : Object.keys(schema.sections || {});
  const sectionsObj = schema.sections || {};
  let blockCount = 0;
  const countBlocks = (blk) => { if (!blk) return; blockCount += 1; (blk.children || []).forEach(countBlocks); };

  const sections = order.map((sid, i) => {
    const sec = sectionsObj[sid] || {};
    const blockIds = Array.isArray(sec.block_order) ? sec.block_order : Object.keys(sec.blocks || {});
    const blocks = blockIds.map((bid) => readBlock(bid, sec.blocks)).filter(Boolean);
    blocks.forEach(countBlocks);
    return {
      order: i + 1,
      id: sid,
      type: sec.type || 'unknown',
      name: sec.name || '',
      settings: sec.settings && typeof sec.settings === 'object' ? sec.settings : {},
      blocks,
    };
  });

  const preset = page?.template_color_preset || {};
  const colorPreset = {
    name: preset.preset_name || '',
    colors: Array.isArray(preset.preset_colors)
      ? preset.preset_colors.map((c) => ({ slot: c?.slot, value: c?.value })).filter((c) => c.value)
      : [],
  };

  return {
    id: page?.id || '',
    name: page?.name || '',
    sectionCount: sections.length,
    blockCount,
    colorPreset,
    sections,
  };
}
