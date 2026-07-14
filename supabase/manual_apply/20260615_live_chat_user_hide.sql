-- =====================================================================
-- LIVE CHAT — Student-side soft delete (per-user hide)
-- Adds a user_hidden_at flag so a student can remove a conversation
-- from their own dashboard without affecting admin/staff visibility.
-- Admin queries use the service role and ignore this flag.
-- =====================================================================

alter table public.live_chat_conversations
  add column if not exists user_hidden_at timestamptz;

create index if not exists idx_lcc_user_hidden_at
  on public.live_chat_conversations(user_id, user_hidden_at);
