-- =====================================================================
-- LIVE CHAT v2 — Multi-conversation, retention, RBAC delete, history
-- Idempotent additions on top of 20260615_live_chat_system.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Retention / soft-delete / archive columns
-- ---------------------------------------------------------------------
alter table public.live_chat_conversations
  add column if not exists title           text,
  add column if not exists expires_at      timestamptz not null default (now() + interval '30 days'),
  add column if not exists archived_at     timestamptz,
  add column if not exists deleted_at      timestamptz,
  add column if not exists deleted_by      uuid references auth.users(id) on delete set null;

alter table public.live_chat_messages
  add column if not exists expires_at      timestamptz not null default (now() + interval '30 days'),
  add column if not exists deleted_at      timestamptz,
  add column if not exists deleted_by      uuid references auth.users(id) on delete set null;

create index if not exists idx_lcc_expires_at on public.live_chat_conversations(expires_at);
create index if not exists idx_lcm_expires_at on public.live_chat_messages(expires_at);
create index if not exists idx_lcc_user_lastmsg on public.live_chat_conversations(user_id, last_message_at desc);

-- ---------------------------------------------------------------------
-- 2. Assignment history table
-- ---------------------------------------------------------------------
create table if not exists public.live_chat_assignment_history (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.live_chat_conversations(id) on delete cascade,
  assigned_to     uuid references auth.users(id) on delete set null,
  assigned_by     uuid references auth.users(id) on delete set null,
  previous_assignee uuid references auth.users(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_lcah_conv on public.live_chat_assignment_history(conversation_id, created_at desc);
grant select, insert on public.live_chat_assignment_history to authenticated;
grant all on public.live_chat_assignment_history to service_role;
alter table public.live_chat_assignment_history enable row level security;

drop policy if exists lcah_select on public.live_chat_assignment_history;
create policy lcah_select on public.live_chat_assignment_history for select
  to authenticated using (public.is_chat_staff(auth.uid()));

drop policy if exists lcah_insert on public.live_chat_assignment_history;
create policy lcah_insert on public.live_chat_assignment_history for insert
  to authenticated with check (public.has_role(auth.uid(), 'super_admin'));

-- ---------------------------------------------------------------------
-- 3. Update helpers to include 'super_admin' role
-- ---------------------------------------------------------------------
create or replace function public.is_chat_staff(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.has_role(_user_id, 'super_admin')
    or public.has_role(_user_id, 'admin')
    or public.has_role(_user_id, 'moderator')
    or exists (select 1 from public.live_chat_permissions where user_id = _user_id);
$$;

create or replace function public.has_chat_permission(
  _user_id uuid, _permission public.chat_permission_key
) returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.has_role(_user_id, 'super_admin')
    or public.has_role(_user_id, 'admin')
    or (
      _permission in ('view','reply','close')
      and public.has_role(_user_id, 'moderator')
    )
    or exists (
      select 1 from public.live_chat_permissions
      where user_id = _user_id and permission = _permission
    );
$$;

-- ---------------------------------------------------------------------
-- 4. DELETE policies — super_admin only
-- ---------------------------------------------------------------------
drop policy if exists lcc_delete_super on public.live_chat_conversations;
create policy lcc_delete_super on public.live_chat_conversations for delete
  to authenticated using (public.has_role(auth.uid(), 'super_admin'));

drop policy if exists lcm_delete_super on public.live_chat_messages;
create policy lcm_delete_super on public.live_chat_messages for delete
  to authenticated using (public.has_role(auth.uid(), 'super_admin'));

grant delete on public.live_chat_conversations to authenticated;
grant delete on public.live_chat_messages to authenticated;

-- ---------------------------------------------------------------------
-- 5. Bump expires_at on every new message (active threads never expire mid-convo)
-- ---------------------------------------------------------------------
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
         unread_for_user  = case when new.sender_type = 'staff'
                                 then unread_for_user + 1 else unread_for_user end,
         unread_for_staff = case when new.sender_type = 'user'
                                 then unread_for_staff + 1 else unread_for_staff end,
         updated_at = now()
   where id = new.conversation_id;

  -- Also refresh message's own expires_at against the conversation's
  update public.live_chat_messages
     set expires_at = new.created_at + interval '30 days'
   where id = new.id;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 6. Retention cleanup function (delete >30d) — callable by service_role / cron
-- ---------------------------------------------------------------------
create or replace function public.live_chat_cleanup_expired()
returns table(deleted_conversations integer, deleted_messages integer, deleted_attachments integer)
language plpgsql security definer set search_path = public, storage as $$
declare
  v_msgs int := 0;
  v_convs int := 0;
  v_files int := 0;
  v_paths text[];
begin
  -- Collect attachment paths to remove from storage
  select coalesce(array_agg(att->>'path'), '{}')
    into v_paths
  from public.live_chat_messages m,
       lateral jsonb_array_elements(coalesce(m.attachments, '[]'::jsonb)) att
  where m.expires_at < now()
    and att ? 'path';

  -- Delete storage objects (bucket chat-attachments)
  if array_length(v_paths, 1) > 0 then
    delete from storage.objects
     where bucket_id = 'chat-attachments'
       and name = any(v_paths);
    get diagnostics v_files = row_count;
  end if;

  -- Delete expired messages
  delete from public.live_chat_messages where expires_at < now();
  get diagnostics v_msgs = row_count;

  -- Delete expired conversations (cascades to messages, notes, assignments, history, notifications)
  delete from public.live_chat_conversations where expires_at < now();
  get diagnostics v_convs = row_count;

  return query select v_convs, v_msgs, v_files;
end $$;

revoke all on function public.live_chat_cleanup_expired() from public;
grant execute on function public.live_chat_cleanup_expired() to service_role;

-- ---------------------------------------------------------------------
-- 7. Schedule cron job (best-effort: requires pg_cron extension)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('live_chat_cleanup_hourly')
      where exists (select 1 from cron.job where jobname = 'live_chat_cleanup_hourly');
    perform cron.schedule(
      'live_chat_cleanup_hourly',
      '17 * * * *',
      $cron$select public.live_chat_cleanup_expired();$cron$
    );
  end if;
exception when others then
  -- Cron not available; cleanup can be invoked from the public HTTP endpoint.
  null;
end $$;

-- ---------------------------------------------------------------------
-- 8. Realtime publication for assignment history
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.live_chat_assignment_history;
exception when duplicate_object then null;
when others then null;
end $$;

alter table public.live_chat_assignment_history replica identity full;
