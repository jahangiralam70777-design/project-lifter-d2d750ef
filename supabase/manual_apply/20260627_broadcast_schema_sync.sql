-- Broadcast schema sync — consolidated, idempotent.
-- Run this in the Supabase SQL editor (or psql) connected to your project.
-- It ensures every column the app reads/writes exists on `broadcasts` and
-- `broadcast_recipients`, backfills legacy rows, and forces PostgREST to
-- reload its schema cache so the Data API stops returning
-- "Could not find the 'skip_duplicates' column ... in the schema cache".
--
-- Safe to re-run. No data loss. No breaking changes.

begin;

-- 1. broadcasts: skip_duplicates, content_hash, campaign_id ---------------

alter table public.broadcasts
  add column if not exists skip_duplicates boolean not null default false,
  add column if not exists content_hash    text,
  add column if not exists campaign_id     uuid;

-- Backfill campaign_id for legacy rows so each historical broadcast is its
-- own (first) send; then lock the column down with default + not null.
update public.broadcasts
   set campaign_id = id
 where campaign_id is null;

alter table public.broadcasts
  alter column campaign_id set default gen_random_uuid(),
  alter column campaign_id set not null;

create index if not exists idx_broadcasts_skip_duplicates
  on public.broadcasts(skip_duplicates);
create index if not exists idx_broadcasts_content_hash
  on public.broadcasts(content_hash);
create index if not exists idx_broadcasts_campaign_id
  on public.broadcasts(campaign_id);

-- 2. broadcast_recipients: per-method delivery tracking -------------------

alter table public.broadcast_recipients
  add column if not exists methods text[];

create index if not exists idx_br_user_methods
  on public.broadcast_recipients using gin (methods);
create index if not exists idx_br_user_id
  on public.broadcast_recipients(user_id);

commit;

-- 3. Force PostgREST to reload schema cache so the new columns are visible
--    to the Data API immediately (no project restart required).
notify pgrst, 'reload schema';
