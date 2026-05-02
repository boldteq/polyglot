# Core: GraphQL API Patterns

> Source: shopify.dev/docs/api/usage/limits + shopify.dev/docs/api/usage/bulk-operations
> Last extracted: 2026-04-04

## Rate Limits & Cost Model

**Model:** Query cost-based (not request count-based)

**Cost calculation:**
- Each field has a cost value
- Total query cost = sum of all field costs
- Costs scale based on complexity and pagination limits
- DIFFERENT FROM REST API (REST uses request count)

**Debug endpoint costs:**
```bash
# Include this header to get detailed cost breakdown
Shopify-GraphQL-Cost-Debug: 1
```

**Limits:**
- **Standard:** 4 cost units per second (50 cost units per 12 seconds)
- **Burst:** Temporary spikes allowed, then throttled
- **Max single query:** Varies by API version (typically 100–2000 cost units)

**Cost breakdown example:**
```graphql
# This query might cost:
# - products query: 10 cost
# - first(50): +5 cost
# - productType: +1 cost per node
# - images: +2 cost per product
# Total: ~150 cost for 50 products with images
query {
  products(first: 50) {
    edges {
      node {
        id
        title
        productType
        images(first: 5) {
          edges { node { src } }
        }
      }
    }
  }
}
```

## Bulk Operations (RECOMMENDED for Large Datasets)

**Key advantage:** Bulk operations bypass normal rate limits and max cost limits.

**Characteristics:**
- No max cost limit on query execution
- Not subject to rate limiting
- Support up to 5 concurrent bulk operations per shop (API v2026-01+)
- Only polling/cancel requests count as normal API calls (low cost)
- Asynchronous processing
- Results available via webhook or polling

**Use bulk when:**
- Fetching/modifying > 100 items
- Complex queries on large datasets
- Batch operations needed

**Avoid single queries when:**
- Processing thousands of records
- Performance is critical
- Cost efficiency matters

**Bulk operation pattern:**
```graphql
# 1. Create bulk operation
mutation {
  bulkOperationRunQuery(query: """
    query {
      products {
        edges {
          node {
            id
            title
            handle
            productType
          }
        }
      }
    }
  """) {
    bulkOperation {
      id
      status  # CREATED -> RUNNING -> COMPLETED/FAILED
      createdAt
    }
  }
}

# 2. Poll for status (cheap: ~1 cost per poll)
query {
  node(id: "gid://shopify/BulkOperation/123") {
    ... on BulkOperation {
      status
      objectCount
      fileSize
      url          # Download JSONL results when COMPLETED
      errors {
        message
        code
      }
    }
  }
}

# 3. Parse results (JSONL format — one JSON object per line)
# Example result:
# {"id": "gid://shopify/Product/1", "title": "Product 1"}
# {"id": "gid://shopify/Product/2", "title": "Product 2"}
```

**Concurrent bulk operations (API v2026-01+):**
- Max: 5 bulk query operations per shop
- Enables processing multiple large datasets simultaneously

## Query Best Practices

### 1. Specify Fields Explicitly

```graphql
# ✅ GOOD: Only fetch needed fields
query {
  products(first: 10) {
    edges {
      node {
        id
        title
      }
    }
  }
}

# ❌ BAD: Fetching entire fragment (costs more)
query {
  products(first: 10) {
    edges {
      node {
        ... AllProductFields
      }
    }
  }
}
```

### 2. Cursor-Based Pagination

```graphql
# ✅ Use cursor pagination with first/after
query {
  products(first: 50, after: "cursor123") {
    pageInfo { hasNextPage, endCursor }
    edges { node { id } }
  }
}
```

### 3. Use Bulk for Large Operations

```graphql
# ✅ Bulk operation for 1000s of items
mutation {
  bulkOperationRunQuery(query: """
    query { products { edges { node { id, title } } } }
  """) { bulkOperation { id } }
}

# ❌ NOT RECOMMENDED: Pagination loop for 1000s of items
# (costs much more, slower)
```

### 4. Batch Updates When Possible

```graphql
# ✅ Use bulk mutation for bulk updates
mutation {
  bulkOperationRunMutation(query: """
    mutation {
      productUpdate(input: { id: $id, title: $title }) {
        product { id }
      }
    }
  """) { bulkOperation { id } }
}

# ❌ NOT RECOMMENDED: Individual update mutations
# (much slower, costs more)
```

## REST to GraphQL Migration

**GraphQL advantages:**
- Single request fetches exactly needed data
- No overfetching
- Strong typing
- Calculated cost model
- Bulk operations for large datasets

**Migration pattern:**
```
REST: GET /products.json?fields=id,title,handle
→ Must fetch all fields on REST, high cost

GraphQL: query { products { id, title, handle } }
→ Fetch only needed fields, lower cost
```

**When to use GraphQL:**
- Always preferred (most efficient)
- Explicitly recommended for new apps
- REST API deprecated on slow timeline (still available but not recommended)

## Handling Rate Limits

**Identify rate limit errors:**
```json
{
  "errors": [{
    "message": "Throttled",
    "extensions": {
      "code": "THROTTLED"
    }
  }]
}
```

**Retry strategy:**
```typescript
async function makeGraphQLCall(query: string, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://shop.myshopify.com/graphql.json', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Shopify-GraphQL-Cost-Debug': '1',
        },
        body: JSON.stringify({ query }),
      });

      const result = await response.json();

      // Check for throttle error
      if (result.errors?.some(e => e.extensions?.code === 'THROTTLED')) {
        if (attempt === retries) throw new Error('Rate limit exceeded');

        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return result;
    } catch (error) {
      if (attempt === retries) throw error;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

## Cost Optimization Checklist

- [ ] Use bulk operations for > 100 items
- [ ] Explicitly select only needed fields
- [ ] Use cursor pagination, not offset
- [ ] Batch mutations where possible
- [ ] Monitor costs with `Shopify-GraphQL-Cost-Debug` header
- [ ] Cache results to avoid repeated queries
- [ ] Use webhooks instead of polling when possible
