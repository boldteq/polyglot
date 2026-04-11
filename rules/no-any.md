Never use the TypeScript `any` type. No exceptions.

Alternatives:
- Use specific types or interfaces
- Use generics for flexible typing
- Use `unknown` with type guards for truly unknown data
- Use `Parameters<typeof fn>[0]` to infer parameter types

Also forbidden: `as any`, `@ts-ignore`, `@ts-expect-error` (unless the comment explains exactly why and when it will be fixed).