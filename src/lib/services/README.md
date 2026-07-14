# Services Layer

The **service** layer sits between hooks and repositories. Its job is to:

1. Compose multiple repository calls when a UI flow needs more than one.
2. Normalize data shapes / coerce nulls / sort / trim.
3. Provide stable types so swapping the underlying repository (e.g. switching
   from `*.functions.ts` server fns to direct Supabase reads, or to a REST
   client) requires zero changes at the hook layer.

Services never call `supabase.from(...)` directly. They go through
`src/lib/repositories/index.ts`. When the production database is connected,
only repository implementations change — services and hooks are untouched.

## Layering

```
Route (src/routes/*)
  └─ Hook (src/hooks/queries/*)        ← TanStack Query queryOptions + useXyz()
       └─ Service (src/lib/services/*) ← composition / shape normalization
            └─ Repository (src/lib/repositories/index.ts) ← data access
                 └─ *.functions.ts (createServerFn) → Supabase
```

Reference adoption: `src/routes/blog.tsx`, `src/routes/blog.$slug.tsx`.
