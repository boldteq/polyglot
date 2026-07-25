// Conduit — Storefront data fetch with a HALLUCINATED field (nonExistentField123 is not on Shop).
// Gate #51 hands this to Shopify's own validator, which rejects it against the real schema.
const SHOP_QUERY = `
  query ShopInfo {
    shop {
      name
      nonExistentField123
    }
  }
`;

fetch('/api/2026-04/graphql.json', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: SHOP_QUERY }),
});
