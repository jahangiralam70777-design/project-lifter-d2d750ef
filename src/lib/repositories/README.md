# Repository Layer

Centralized data-access boundary. Routes → hooks → **repositories** → Supabase.

## Why

When the production Supabase database is connected, every query, RPC and
storage call must work without ad-hoc rewrites in components. This folder
is the single source of truth for that boundary.

## Layers

```
routes/*.tsx
  └─ components/**Flow.tsx
       └─ hooks/use-*           (UI-bound caching via TanStack Query)
            └─ services         (business logic; pure functions)
                 └─ repositories (this folder; SQL/RPC/storage I/O)
                      └─ @/integrations/supabase/client(.server)
```

## Rules

1. **Repositories are the ONLY place that calls** `supabase.from(...)`,
   `supabase.rpc(...)`, or `supabase.storage.from(...)`.
2. Each repository file owns ONE table (or one tightly-coupled aggregate).
3. Every repository exports typed functions that return plain DTOs — no
   Supabase types leak past this boundary.
4. Server-side repositories live in `*.server.ts` files; client-safe ones
   in `*.ts`. Mixed-runtime repositories MUST be `.functions.ts` (TSS
   `createServerFn`).
5. Names are stable contracts: when the DB connects, only the *bodies* of
   these functions change — never their shapes.

## Inventory (expected tables / RPCs)

See `./inventory.md` for the full machine-checkable mapping of every table,
RPC, and storage bucket used by the app today. Treat that file as the
source of truth for migration planning.

## Migration plan (when the prod DB is connected)

1. Run the existing 64 SQL migrations from `/supabase/migrations/` against
   the new project.
2. Verify every entry in `inventory.md` resolves against the new schema.
3. Switch `.env` to the new project URL + publishable key.
4. Run a smoke test of the routes listed in `inventory.md` → "Hot paths".
5. No application code should need to change.
