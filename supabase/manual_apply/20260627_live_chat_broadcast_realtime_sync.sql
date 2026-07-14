-- Live Chat broadcast realtime sync — idempotent safety migration.
-- Ensures broadcast-created chat conversations/messages are visible to the
-- owning student, are published through Realtime, and keep unread counters in
-- sync without relying on client refreshes.

begin;

-- Owner/staff read access required for student-side widget queries and
-- Realtime authorization checks.
grant select, insert, update on public.live_chat_conversations to authenticated;
grant select, insert, update on public.live_chat_messages to authenticated;
grant all on public.live_chat_conversations to service_role;
grant all on public.live_chat_messages to service_role;
grant select, update on public.broadcast_recipients to authenticated;
grant all on public.broadcast_recipients to service_role;

-- Columns used by the imported chat UI and broadcast fan-out. These are safe
-- to re-run and cover projects where only the v1 live-chat migration applied.
alter table public.live_chat_conversations
  add column if not exists title text,
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists user_hidden_at timestamptz;

alter table public.live_chat_messages
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

drop policy if exists lcc_select on public.live_chat_conversations;
create policy lcc_select on public.live_chat_conversations for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_chat_staff(auth.uid())
  );

drop policy if exists lcm_select on public.live_chat_messages;
create policy lcm_select on public.live_chat_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.live_chat_conversations c
      where c.id = conversation_id
        and (c.user_id = auth.uid() or public.is_chat_staff(auth.uid()))
    )
  );

drop policy if exists br_select_self on public.broadcast_recipients;
create policy br_select_self on public.broadcast_recipients for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

-- Keep conversation list ordering, preview text, and unread badges correct
-- for service-role broadcast inserts and normal staff replies alike.
create or replace function public.tg_lcm_rollup()
returns trigger language plpgsql security definer set search_path = public as $$
declare preview text;
begin
  preview := left(coalesce(new.body, '[attachment]'), 200);
  update public.live_chat_conversations
     set last_message_at      = new.created_at,
         last_message_preview = preview,
         expires_at           = case
           when exists (
             select 1 from information_schema.columns
             where table_schema = 'public'
               and table_name = 'live_chat_conversations'
               and column_name = 'expires_at'
           ) then greatest(expires_at, new.created_at + interval '30 days')
           else expires_at
         end,
         status = case
           when new.sender_type = 'staff' and status in ('new','open') then 'waiting_user'
           when new.sender_type = 'user'  and status in ('waiting_user','resolved','closed') then 'open'
           when status = 'new' then 'open'
           else status
         end,
         unread_for_user  = case when new.sender_type = 'staff'
                                 then unread_for_user + 1 else unread_for_user end,
         unread_for_staff = case when new.sender_type = 'user'
                                 then unread_for_staff + 1 else unread_for_staff end,
         updated_at = now()
   where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_lcm_rollup on public.live_chat_messages;
create trigger trg_lcm_rollup after insert on public.live_chat_messages
  for each row execute function public.tg_lcm_rollup();

create index if not exists idx_lcc_user_lastmsg
  on public.live_chat_conversations(user_id, last_message_at desc);
create index if not exists idx_lcm_conv_created
  on public.live_chat_messages(conversation_id, created_at desc);

alter table public.live_chat_conversations replica identity full;
alter table public.live_chat_messages replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.live_chat_conversations;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.live_chat_messages;
exception when duplicate_object then null; when undefined_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.broadcast_recipients;
exception when duplicate_object then null; when undefined_object then null; end $$;

alter table public.broadcast_recipients replica identity full;

commit;

notify pgrst, 'reload schema';