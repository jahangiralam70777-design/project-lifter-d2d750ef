-- Live Chat + Broadcast read/delete permanent sync.
-- Idempotent safety migration for:
-- 1) live chat message insert/read RLS and realtime visibility
-- 2) student-side soft delete + admin hard delete permissions
-- 3) broadcast read state syncing with notifications and notification_reads

begin;

alter table public.live_chat_conversations
  add column if not exists title text,
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists user_hidden_at timestamptz;

alter table public.live_chat_messages
  add column if not exists expires_at timestamptz not null default (now() + interval '30 days'),
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

alter table public.notifications
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists read_at timestamptz,
  add column if not exists source_broadcast_id uuid,
  add column if not exists delivery_group_id uuid;

grant select, insert, update, delete on public.live_chat_conversations to authenticated;
grant select, insert, update, delete on public.live_chat_messages to authenticated;
grant all on public.live_chat_conversations to service_role;
grant all on public.live_chat_messages to service_role;
grant select, update on public.broadcast_recipients to authenticated;
grant all on public.broadcast_recipients to service_role;
grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;
grant select, insert, update on public.notification_reads to authenticated;
grant all on public.notification_reads to service_role;

alter table public.live_chat_conversations enable row level security;
alter table public.live_chat_messages enable row level security;
alter table public.broadcast_recipients enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

drop policy if exists lcc_select on public.live_chat_conversations;
create policy lcc_select on public.live_chat_conversations for select
  to authenticated
  using (user_id = auth.uid() or public.is_chat_staff(auth.uid()));

drop policy if exists lcc_insert_user on public.live_chat_conversations;
create policy lcc_insert_user on public.live_chat_conversations for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists lcc_update_user on public.live_chat_conversations;
create policy lcc_update_user on public.live_chat_conversations for update
  to authenticated
  using (user_id = auth.uid() or public.is_chat_staff(auth.uid()))
  with check (user_id = auth.uid() or public.is_chat_staff(auth.uid()));

drop policy if exists lcc_delete_super on public.live_chat_conversations;
drop policy if exists lcc_delete_admin on public.live_chat_conversations;
create policy lcc_delete_admin on public.live_chat_conversations for delete
  to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'));

drop policy if exists lcm_select on public.live_chat_messages;
create policy lcm_select on public.live_chat_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.live_chat_conversations c
      where c.id = conversation_id
        and (c.user_id = auth.uid() or public.is_chat_staff(auth.uid()))
    )
  );

drop policy if exists lcm_insert on public.live_chat_messages;
create policy lcm_insert on public.live_chat_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.live_chat_conversations c
      where c.id = conversation_id
        and c.is_blocked = false
        and (
          (sender_type = 'user' and c.user_id = auth.uid() and sender_user_id = auth.uid())
          or (sender_type = 'staff' and public.has_chat_permission(auth.uid(), 'reply') and sender_user_id = auth.uid())
        )
    )
  );

drop policy if exists lcm_update on public.live_chat_messages;
create policy lcm_update on public.live_chat_messages for update
  to authenticated
  using (
    public.has_chat_permission(auth.uid(), 'delete_message')
    or exists (
      select 1 from public.live_chat_conversations c
      where c.id = conversation_id and c.user_id = auth.uid()
    )
  )
  with check (true);

drop policy if exists br_select_self on public.broadcast_recipients;
create policy br_select_self on public.broadcast_recipients for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

drop policy if exists br_update_self on public.broadcast_recipients;
create policy br_update_self on public.broadcast_recipients for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  )
  with check (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select on public.notifications for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications for update
  to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  )
  with check (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

drop policy if exists notification_reads_own on public.notification_reads;
drop policy if exists nr_self on public.notification_reads;
drop policy if exists "notification_reads_own" on public.notification_reads;
drop policy if exists "nr_self" on public.notification_reads;
create policy notification_reads_own on public.notification_reads for all
  to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'super_admin'))
  with check (user_id = auth.uid());

create or replace function public.tg_lcm_rollup()
returns trigger language plpgsql security definer set search_path = public as $$
declare preview text;
begin
  preview := left(coalesce(new.body, '[attachment]'), 200);
  update public.live_chat_conversations
     set last_message_at      = new.created_at,
         last_message_preview = preview,
         expires_at           = greatest(expires_at, new.created_at + interval '30 days'),
         status = case
           when new.sender_type = 'staff' and status in ('new','open') then 'waiting_user'
           when new.sender_type = 'user'  and status in ('waiting_user','resolved','closed') then 'open'
           when status = 'new' then 'open'
           else status
         end,
         unread_for_user  = greatest(0, unread_for_user + case when new.sender_type = 'staff' then 1 else 0 end),
         unread_for_staff = greatest(0, unread_for_staff + case when new.sender_type = 'user' then 1 else 0 end),
         updated_at = now()
   where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_lcm_rollup on public.live_chat_messages;
create trigger trg_lcm_rollup after insert on public.live_chat_messages
  for each row execute function public.tg_lcm_rollup();

create index if not exists idx_lcc_user_hidden_at on public.live_chat_conversations(user_id, user_hidden_at);
create index if not exists idx_lcc_user_lastmsg on public.live_chat_conversations(user_id, last_message_at desc);
create index if not exists idx_lcm_conv_created on public.live_chat_messages(conversation_id, created_at desc);
create index if not exists idx_br_user_unread on public.broadcast_recipients(user_id, read_at);
create index if not exists idx_notifications_broadcast_user_once on public.notifications(source_broadcast_id, user_id);

alter table public.live_chat_conversations replica identity full;
alter table public.live_chat_messages replica identity full;
alter table public.broadcast_recipients replica identity full;
alter table public.notifications replica identity full;
alter table public.notification_reads replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.live_chat_conversations;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_chat_messages;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.broadcast_recipients;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notification_reads;
exception when duplicate_object then null; when undefined_object then null; end $$;

commit;

notify pgrst, 'reload schema';