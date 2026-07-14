-- Broadcast: persistent campaign identity for reliable duplicate detection.
--
-- Replaces content-hash-based duplicate detection. Two different broadcasts
-- may legitimately share the same subject/body, so identity is tracked by a
-- `campaign_id` (UUID) that is stable across re-sends of the same broadcast.
--
-- Backwards compatible:
--   * `campaign_id` is nullable with a default of gen_random_uuid(), so any
--     legacy row that did not have one will receive its own unique id on
--     write. Existing rows are backfilled to `campaign_id = id` so the
--     original broadcast is treated as its own (first) send.
--   * Old `content_hash` / `skip_duplicates` columns are kept untouched.
--   * `broadcast_recipients.methods` from the previous migration is reused.
--
-- Idempotent.

alter table public.broadcasts
  add column if not exists campaign_id uuid;

update public.broadcasts
   set campaign_id = id
 where campaign_id is null;

alter table public.broadcasts
  alter column campaign_id set default gen_random_uuid(),
  alter column campaign_id set not null;

create index if not exists idx_broadcasts_campaign_id
  on public.broadcasts(campaign_id);

-- Recipient lookup by (broadcast_id, user_id) is already unique. Add a
-- supporting index on user_id to speed the per-user dedupe scan.
create index if not exists idx_br_user_id
  on public.broadcast_recipients(user_id);
