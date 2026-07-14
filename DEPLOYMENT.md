# Render Deployment Guide

This project is a **TanStack Start (SSR)** app. On Render it runs as a single
Node web service — the server renders every route, so there is **no SPA
"404 after refresh" problem**: deep links, direct URL access, browser
back/forward, and refresh all work because every URL is handled by the Node
server (verified: `/`, `/login`, `/admin/login`, `/privacy`, `/dashboard`
return 200; unknown URLs return a proper 404 page).

## Commands

| Setting        | Value                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Build command  | `export NODE_OPTIONS=--max-old-space-size=4096 && npm install --include=dev && npm run build:node`     |
| Start command  | `npm run start` (`node .output/server/index.mjs`) |
| Health check   | `/`                                   |
| Node version   | 22.x                                  |

> **Why `--include=dev`?** Render sets `NODE_ENV=production` during builds,
> which makes a plain `npm install` skip `devDependencies`. The build toolchain
> (`vite`, `nitro`, `@lovable.dev/vite-tanstack-config`) lives in
> `devDependencies`, so without this flag the build fails with
> `sh: 1: vite: not found`. Runtime needs none of these — `npm run start` only
> runs `node .output/server/index.mjs`.

> **Why `NODE_OPTIONS=--max-old-space-size=4096`?** The Vite/Rollup production
> build of this app (200+ route chunks, charts, PDF/XLSX libraries) peaks above
> Node's default V8 heap cap, which aborts the Render build with
> `FATAL ERROR: JavaScript heap out of memory`. The flag raises the heap cap
> for the **build step only** — it is deliberately not a service env var, so
> the runtime server keeps Node's defaults. The Vite config also disables
> build sourcemaps and the gzip-size report pass to lower peak build memory.


`npm run build:node` sets `NITRO_PRESET=node-server`, which makes the build
target a standalone Node server (`.output/server/index.mjs` + static assets in
`.output/public`). Inside the Lovable sandbox the build always targets the
Lovable/Cloudflare runtime; the Node preset is honored automatically on any
external CI such as Render.

## Required environment variables (set in Render dashboard)

| Variable                    | Purpose                                              | Secret? |
| --------------------------- | ---------------------------------------------------- | ------- |
| `SUPABASE_URL`              | Backend URL used by server functions                 | No      |
| `SUPABASE_PUBLISHABLE_KEY`  | Public (anon) API key — RLS still applies            | No      |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin key for privileged server functions            | **Yes** |
| `NODE_VERSION`              | `22.12.0`                                            | No      |

Build-time client variables (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`) are committed in
`.env` — these are public values by design (the anon key is protected by
Row-Level Security).

> **Important:** If the backend is Lovable Cloud, the service-role key and
> database password are managed by Lovable and are not exportable. To run the
> full admin panel on Render you need your own Supabase project (free tier
> works): create it, run the migrations in `supabase/migrations/`, and use its
> keys. Alternatively, keep hosting on Lovable (Publish button), where all
> keys are wired automatically.

## Deploy steps

1. Push this repo to GitHub (Lovable → GitHub integration).
2. On Render: **New → Blueprint**, pick the repo — `render.yaml` is detected.
3. Fill in the three Supabase env vars when prompted.
4. Deploy. The health check on `/` confirms the server is live.

## Security notes

- All admin routes are guarded server-side: every admin RPC/server function
  re-checks the `admin` role via `has_role()` (SECURITY DEFINER) — client
  checks are cosmetic only.
- RLS is enabled on all public tables; user data is scoped to `auth.uid()`.
- No secrets are committed: only the publishable anon key lives in `.env`.
- Demo accounts are compiled out of production builds (`import.meta.env.DEV`
  guard) and all demo seed/cleanup scripts have been removed.
