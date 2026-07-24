// Shared "does this rule make a checkable Shopify-platform claim, and is it cited?" predicate.
//
// D1 (2026-07-24): a rule that names a concrete Shopify mechanism (a schema key/setting, a Liquid
// object/filter/tag, a metafield/metaobject, a route) is a CHECKABLE claim and MUST carry a real
// shopify.dev / help.shopify.com citation — model-recall is the measured reason authored themes drifted
// off Shopify spec. Pure design/UX/CRO/copy rules are EXEMPT (there is no shopify.dev page for "16px body").
//
// Single source of truth so the DISTRIBUTE guard (swt-distribute rejects an uncited new mechanism rule)
// and the AUDIT (check-rule-provenance reports/enforces the backlog) can never drift apart — the same
// class the gate-owner drift test protects.

export const SHOPIFY_SIGNAL = new RegExp([
  // schema authoring
  'visible_if', 'enabled_on', 'disabled_on', 'max_blocks', '\\bpresets?\\b', '\\blimit\\b',
  'settings_schema', 'block\\.settings', 'section\\.settings', 'color_scheme', 'text_alignment',
  'image_picker', 'link_list', 'inline_richtext', '\\brichtext\\b', 'range setting', 'select setting',
  // liquid objects/filters/tags
  'content_for', 'shopify_attributes', 'paginate', 'placeholder_svg_tag', 'image_url', 'image_tag',
  '\\| money\\b', '\\| t\\b', 'metafield', 'metaobject', 'linklists', 'routes\\.', 'cart\\.', 'product\\.',
  'collection\\.', 'request\\.', '{%-? *schema', '{%-? *render', '{%-? *section', '{%-? *style',
].join('|'), 'i');

export const CITATION = /shopify\.dev|help\.shopify\.com/i;

// True iff `body` asserts a Shopify mechanism but carries NO verified citation — the thing to reject/flag.
export function assertsUncitedMechanism(body) {
  const s = String(body || '');
  return SHOPIFY_SIGNAL.test(s) && !CITATION.test(s);
}
