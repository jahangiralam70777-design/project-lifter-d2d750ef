-- Broadcast: per-method delivery tracking + skip-duplicates toggle.
-- Apply manually against your Supabase project (Lovable Cloud not connected).
-- Idempotent and backwards compatible: existing rows untouched, new columns
-- nullable / defaulted so all pre-existing broadcasts/recipients keep working.

alter table public.broadcasts
  add column if not exists content_hash    text,
  add column if not exists skip_duplicates boolean not null default false;

create index if not exists idx_broadcasts_content_hash
  on public.broadcasts(content_hash);

alter table public.broadcast_recipients
  add column if not exists methods text[];

create index if not exists idx_br_user_methods
  on public.broadcast_recipients using gin (methods);
