// Conduit — a VALID Storefront query (shop.name exists on the schema). Gate #51 passes it.
const SHOP_QUERY = `
  query ShopInfo {
    shop {
      name
    }
  }
`;

fetch('/api/2026-04/graphql.json', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: SHOP_QUERY }),
});
