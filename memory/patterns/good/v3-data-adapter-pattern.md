# v3 Data Adapter Pattern

**Owner:** dato (primary) + arya (architecture)
**Source:** v3 Production Design System §7
**Adopted:** 2026-04-30 — Mock + Supabase + Shopify Storefront + REST/GraphQL default

---

## Adapter contract

Components don't know where data comes from. They declare needs; adapters wire them up.

```ts
interface DataQuery {
  resource:  string;             // 'users.list' | 'transactions.recent' | 'metrics.revenue'
  params?:   Record<string, any>;
  cache?:    { ttl_seconds: number };
}

interface DataAdapter {
  type:    'mock' | 'rest' | 'graphql' | 'supabase' | 'shopify_storefront' | 'firebase';
  baseUrl?: string;
  schemas: Record<string, JSONSchema>;
  resolve(query: DataQuery): Promise<any>;
}
```

---

## Default adapter registry (Boldteq scaffolds)

```ts
const ADAPTERS = {
  mock:               new MockAdapter({ generator: DATA_TEMPLATES }),         // dev mode, always
  supabase:           new SupabaseAdapter({ url: env.SUPABASE_URL, key: env.SUPABASE_KEY }),
  shopify_storefront: new ShopifyStorefrontAdapter({ shop: env.SHOPIFY_DOMAIN, token: env.STOREFRONT_TOKEN }),
  rest:               new RESTAdapter({ baseUrl: env.API_URL }),
  graphql:            new GraphQLAdapter({ endpoint: env.GRAPHQL_URL }),
};
```

Every Boldteq scaffold ships these 5 adapters. Mock is dev default; production swaps to Supabase (Stack A) or Shopify Storefront (Stack B/C) on env vars.

---

## Component data contract (MANDATORY)

Every data-driven component declares:

```ts
{
  id: 'KPICard',
  data_contract: {
    label:  { type: 'string' },
    value:  { type: 'string' },
    delta:  { type: 'object', shape: { direction: 'up|down', value: 'string', period: 'string' } }
  },
  default_resource: 'metrics.kpi',
}
```

figma-synth blocks publish without `data_contract`. Pure-presentational components exempt; data-driven required.

---

## Renderer wiring

```jsx
function RevenueKPI() {
  const { data, loading, error } = useData({ resource: 'metrics.revenue' });

  if (loading) return <KPICard.Skeleton />;
  if (error)   return <KPICard.Error retry={() => refetch()} />;
  if (!data)   return <KPICard.Empty />;

  return <KPICard label={data.label} value={data.value} delta={data.delta} />;
}
```

Skeleton/Error/Empty states are mandatory per data-driven component.

---

## useData hook

```ts
function useData<T>(query: DataQuery): DataResult<T> {
  const adapter = ADAPTERS[currentEnvironment().adapter];
  return useSWR([query], () => adapter.resolve(query), { fallbackData: query.cache?.fallback });
}
```

SWR / TanStack Query for cache + revalidation.

---

## Mock-to-real migration CLI

```bash
$ design-agent migrate-data --from mock --to supabase \
    --schemas src/tokens/schemas.json \
    --map config/data-mapping.json
```

Generates `data-mapping.json` scaffold from component contracts. Migrates one resource at a time.

```json
{
  "users.list":          { "table": "users",        "select": "id, name, email, role" },
  "metrics.revenue":     { "rpc": "get_revenue_kpi", "args": { "period": "30d" } },
  "transactions.recent": { "table": "transactions", "select": "*", "order": "created_at.desc", "limit": 50 }
}
```

Components do NOT change. Only adapter binding moves from `mock` to `supabase`.

---

## Schema → component suggestion

When real data source connected, dato auto-suggests components based on schema shape:

```ts
function suggestComponents(schema: TableSchema): ComponentSuggestion[] {
  const suggestions: ComponentSuggestion[] = [];

  if (hasNumericColumn(schema) && hasTimestampColumn(schema))
    suggestions.push({ component: 'LineChart', confidence: 0.9 });

  if (rowCountEstimate(schema) > 50)
    suggestions.push({ component: 'DataTable', confidence: 0.95, props: { virtualize: true } });

  if (schema.columns.includes('status') && distinctValues(schema, 'status') <= 5)
    suggestions.push({ component: 'StatusFilter', confidence: 0.8 });

  return suggestions;
}
```

Surfaced in control panel. Designer accepts → elio composes into project.

---

## Shopify Storefront adapter (ecom-specific)

```ts
class ShopifyStorefrontAdapter implements DataAdapter {
  resources = {
    'product.detail':       { query: PRODUCT_QUERY, fragment: 'Product' },
    'product.card':         { fragment: 'ProductCard' },
    'collection.products':  { query: COLLECTION_QUERY },
    'cart':                 { query: CART_QUERY },
    'customer.orders':      { query: CUSTOMER_ORDERS_QUERY, requires: 'customerAccount' },
  };

  async resolve(query: DataQuery): Promise<any> {
    const def = this.resources[query.resource];
    return this.client.query(def.query, query.params);
  }
}
```

Wraps Hydrogen storefront client. Hides GraphQL details from components.

---

## Cross-references

- Mandatory data_contract in component artifact: `v3-component-system-spec.md`
- Schema-driven suggestions in control panel: `v3-control-panel-spec.md`
- Hydrogen storefront queries: `~/.claude/memory/stacks/shopify/storefront/hydrogen-react-router-7.md`
- Supabase Stack A patterns: `~/.claude/memory/stacks/saas-nextjs-supabase-railway.md`
