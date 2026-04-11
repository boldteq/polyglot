---
name: AI App Stack Knowledge (Stack C)
description: Accumulated patterns for building AI-powered products with Next.js, Supabase, and Vercel AI SDK
type: reference
stack: ai-nextjs-supabase
---

## Stack
Next.js 14+ (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase + Vercel AI SDK + Anthropic/OpenAI SDK + Dodo Payments + Vercel

## Projects Built On This Stack
*(None shipped yet — patterns derived from industry standards and Vercel AI SDK docs)*

## Critical Patterns

### AI SDK Integration
- Use `@ai-sdk/anthropic` or `@ai-sdk/openai` as the provider
- `streamText()` for streaming chat responses — always stream, never block
- `generateText()` only for background/batch operations (not user-facing)
- `generateObject()` with Zod schema for structured output extraction
- Always set `maxTokens` to prevent runaway costs

### Streaming Architecture
```typescript
// app/api/chat/route.ts
import { streamText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

export async function POST(req: Request) {
  const { messages } = await req.json()

  const result = streamText({
    model: anthropic('claude-sonnet-4-5-20250514'),
    messages,
    maxTokens: 4096,
    system: 'System prompt here...',
  })

  return result.toDataStreamResponse()
}
```

```typescript
// Client-side with useChat
'use client'
import { useChat } from 'ai/react'

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat()
  // Render messages with streaming indicator
}
```

### Rate Limiting (Critical for AI Apps)
```typescript
// Upstash Redis rate limiter
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 req/min
  analytics: true,
})

// In API route — check before calling AI
const { success, limit, remaining } = await ratelimit.limit(userId)
if (!success) {
  return new Response('Rate limit exceeded', { status: 429 })
}
```

### Token Usage Tracking
```sql
-- ai_usage table
id, user_id, org_id, model, input_tokens, output_tokens,
total_tokens, cost_usd, endpoint, created_at

-- Aggregate per billing period for metered billing
SELECT user_id, SUM(total_tokens) as period_tokens, SUM(cost_usd) as period_cost
FROM ai_usage
WHERE created_at BETWEEN billing_period_start AND billing_period_end
GROUP BY user_id
```

### Prompt Management
- Store system prompts in database or config — not hardcoded in route handlers
- Version prompts: track which prompt version produced which output
- A/B test prompts by tracking output quality metrics per version
- Never expose system prompts to the client

### Tool Use / Function Calling
```typescript
const result = streamText({
  model: anthropic('claude-sonnet-4-5-20250514'),
  messages,
  tools: {
    searchDatabase: {
      description: 'Search the product database',
      parameters: z.object({
        query: z.string(),
        category: z.enum(['electronics', 'clothing', 'food']),
      }),
      execute: async ({ query, category }) => {
        return await db.products.search(query, category)
      },
    },
  },
  maxSteps: 5, // Allow multi-step tool use
})
```

### Error Handling for AI
```typescript
try {
  const result = await streamText({ ... })
  return result.toDataStreamResponse()
} catch (error) {
  if (error.status === 429) {
    // Provider rate limit — queue and retry with exponential backoff
    return new Response('AI service busy, please retry', { status: 503 })
  }
  if (error.status === 400) {
    // Bad request — likely prompt too long, truncate context
    return new Response('Request too large', { status: 400 })
  }
  // Log to monitoring, return generic error
  console.error('AI error:', error)
  return new Response('AI service unavailable', { status: 500 })
}
```

## AI UX Patterns

### Chat Interface
- Streaming text appears character-by-character (not chunk-by-chunk)
- Typing indicator while model processes (before first token)
- Stop generation button during streaming
- Copy/regenerate buttons on each response
- Message history with search
- Conversation threads/branching for power users

### Non-Chat AI Features
- Processing indicator with estimated time for batch operations
- Inline suggestions (like Notion AI) — appear contextually, not in a chat
- AI-generated content clearly labeled but not in an annoying way
- Edit/refine flow: generate → review → modify → accept
- Undo AI actions easily

### Loading States for AI
- Skeleton + "Thinking..." for <3 seconds
- Progress steps for longer operations ("Analyzing... Generating... Refining...")
- Estimated time remaining for batch operations
- Cancel button always available

## Cost Management

### Per-Request Cost Tracking
- Log every AI API call with model, tokens, and calculated cost
- Dashboard showing daily/weekly/monthly AI spend
- Alerts at 50%, 80%, 100% of budget thresholds
- Auto-disable non-critical AI features if budget exceeded

### Model Selection Strategy
```
User-facing chat → Claude Sonnet (balanced quality/speed/cost)
Background processing → Claude Haiku (fast, cheap)
Complex reasoning → Claude Opus (best quality, higher cost)
Simple classification → Claude Haiku
Embeddings → text-embedding-3-small (OpenAI)
```

### Caching Strategy
- Cache identical prompts + identical context → same response (TTL 1 hour)
- Semantic cache for similar queries (embedding similarity > 0.95)
- Cache structured outputs aggressively (classification, extraction)
- Never cache personalized responses

## Common Gotchas
- Vercel serverless function timeout: 10s on Hobby, 60s on Pro — long AI calls need streaming or background jobs
- Edge functions can't use Node.js-specific APIs — use Edge-compatible AI SDK
- Supabase RLS still applies — AI-generated queries must respect user's data scope
- Token limits: always count tokens before sending (use `tiktoken` or provider's tokenizer)
- Prompt injection: validate and sanitize user input before including in prompts
- Model versioning: pin model versions in production, test new versions in staging

## Deployment (Vercel)
- `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — never `NEXT_PUBLIC_` prefixed
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` for rate limiting
- Use Vercel Edge Functions for streaming responses (lower latency)
- Set function `maxDuration` in route config for long-running AI calls
- Monitor Vercel function invocations — AI routes will be your highest volume

---

*(Updated by trainer agent — add learnings via `/train`)*
