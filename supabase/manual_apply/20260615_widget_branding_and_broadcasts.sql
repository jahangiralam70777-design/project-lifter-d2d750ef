-- =====================================================================
-- LIVE CHAT WIDGET BRANDING + BROADCAST MESSAGING SYSTEM
-- Idempotent, additive. Apply via Supabase SQL editor.
-- Order: enums -> tables (both) -> grants/RLS -> policies -> realtime.
-- The recipient-visibility policy on `broadcasts` references
-- `broadcast_recipients`, so both tables must exist before any policy
-- is created.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Launcher branding columns on live_chat_settings
-- ---------------------------------------------------------------------
alter table public.live_chat_settings
  add column if not exists button_text   text    not null default 'Live Chat',
  add column if not exists tooltip_text  text    not null default 'Chat with our team',
  add column if not exists icon_name     text    not null default 'message-circle',
  add column if not exists show_label    boolean not null default true,
  add column if not exists show_launcher boolean not null default true;

-- ---------------------------------------------------------------------
-- 1b. Notification schema hardening for per-user fan-out delivery
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_type where typname = 'notification_type' and typnamespace = 'public'::regnamespace) then
    alter type public.notification_type add value if not exists 'broadcast';
  end if;
exception when others then null; end $$;

do $$ begin
  if exists (select 1 from pg_type where typname = 'notification_status' and typnamespace = 'public'::regnamespace) then
    alter type public.notification_status add value if not exists 'unread';
    alter type public.notification_status add value if not exists 'read';
  end if;
exception when others then null; end $$;

alter table public.notifications
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists message text not null default '',
  add column if not exists recipients_count integer not null default 0,
  add column if not exists delivered_count integer not null default 0,
  add column if not exists read_count integer not null default 0,
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at timestamptz,
  add column if not exists source_broadcast_id uuid,
  add column if not exists delivery_group_id uuid;

-- Older installs used text columns with CHECK constraints instead of enums.
-- Drop the old checks so the production fan-out statuses/types are accepted.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications drop constraint if exists notifications_status_check;
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'type' and data_type = 'text'
  ) then
    alter table public.notifications add constraint notifications_type_check
      check (type in ('announcement','push','email','in_app','broadcast'));
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notifications' and column_name = 'status' and data_type = 'text'
  ) then
    alter table public.notifications add constraint notifications_status_check
      check (status in ('draft','scheduled','sent','failed','paused','unread','read'));
  end if;
end $$;

update public.notifications
   set message = body
 where coalesce(message, '') = '' and coalesce(body, '') <> '';

create index if not exists idx_notifications_user_status_created
  on public.notifications(user_id, status, created_at desc);
create unique index if not exists idx_notifications_broadcast_user_once
  on public.notifications(source_broadcast_id, user_id);
create unique index if not exists idx_notifications_group_user_once
  on public.notifications(delivery_group_id, user_id);

grant select, insert, update, delete on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;

drop policy if exists notif_sent_read on public.notifications;
drop policy if exists notifications_select_sent on public.notifications;
drop policy if exists notifications_public_read on public.notifications;
drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select on public.notifications for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

drop policy if exists notif_admin_write on public.notifications;
drop policy if exists notifications_write_admin on public.notifications;
drop policy if exists notifications_admin_all on public.notifications;
create policy notifications_admin_all on public.notifications for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

-- ---------------------------------------------------------------------
-- 2. Broadcast enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.broadcast_priority as enum ('normal','important','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.broadcast_status as enum ('draft','sent','hidden','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.broadcast_target_kind as enum
    ('all_students','active_users','new_users','class','batch','course','users');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 3. Broadcasts table (NO policies yet — recipients table not created)
-- ---------------------------------------------------------------------
create table if not exists public.broadcasts (
  id                uuid primary key default gen_random_uuid(),
  subject           text not null,
  body              text not null,
  priority          public.broadcast_priority not null default 'normal',
  delivery_methods  text[] not null default array['inbox'],
  target_kind       public.broadcast_target_kind not null,
  target_filter     jsonb not null default '{}'::jsonb,
  status            public.broadcast_status not null default 'sent',
  visible           boolean not null default true,
  pinned            boolean not null default false,
  recipient_count   integer not null default 0,
  created_by        uuid references auth.users(id) on delete set null,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_broadcasts_created on public.broadcasts(created_at desc);
create index if not exists idx_broadcasts_status on public.broadcasts(status);

drop trigger if exists trg_broadcasts_updated on public.broadcasts;
create trigger trg_broadcasts_updated before update on public.broadcasts
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.broadcasts to authenticated;
grant all on public.broadcasts to service_role;
alter table public.broadcasts enable row level security;

-- ---------------------------------------------------------------------
-- 4. Broadcast recipients (per-user delivery state)
-- ---------------------------------------------------------------------
create table if not exists public.broadcast_recipients (
  id            uuid primary key default gen_random_uuid(),
  broadcast_id  uuid not null references public.broadcasts(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  delivered_at  timestamptz not null default now(),
  read_at       timestamptz,
  hidden_at     timestamptz,
  unique (broadcast_id, user_id)
);
create index if not exists idx_br_user_unread on public.broadcast_recipients(user_id, read_at);
create index if not exists idx_br_broadcast on public.broadcast_recipients(broadcast_id);

grant select, insert, update on public.broadcast_recipients to authenticated;
grant all on public.broadcast_recipients to service_role;
alter table public.broadcast_recipients enable row level security;

-- ---------------------------------------------------------------------
-- 5. Policies for broadcasts (now safe — recipients table exists)
-- ---------------------------------------------------------------------
drop policy if exists broadcasts_select_admin on public.broadcasts;
create policy broadcasts_select_admin on public.broadcasts for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

drop policy if exists broadcasts_select_recipient on public.broadcasts;
create policy broadcasts_select_recipient on public.broadcasts for select to authenticated
  using (visible = true and exists (
    select 1 from public.broadcast_recipients r
    where r.broadcast_id = broadcasts.id and r.user_id = auth.uid()
  ));

drop policy if exists broadcasts_insert_admin on public.broadcasts;
create policy broadcasts_insert_admin on public.broadcasts for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

drop policy if exists broadcasts_update_admin on public.broadcasts;
create policy broadcasts_update_admin on public.broadcasts for update to authenticated
  using (public.has_role(auth.uid(),'super_admin')
         or (public.has_role(auth.uid(),'admin') and created_by = auth.uid()));

drop policy if exists broadcasts_delete_super on public.broadcasts;
create policy broadcasts_delete_super on public.broadcasts for delete to authenticated
  using (public.has_role(auth.uid(),'super_admin'));

-- ---------------------------------------------------------------------
-- 6. Policies for broadcast_recipients
-- ---------------------------------------------------------------------
drop policy if exists br_select_self on public.broadcast_recipients;
create policy br_select_self on public.broadcast_recipients for select to authenticated
  using (user_id = auth.uid()
         or public.has_role(auth.uid(),'admin')
         or public.has_role(auth.uid(),'super_admin'));

drop policy if exists br_update_self on public.broadcast_recipients;
create policy br_update_self on public.broadcast_recipients for update to authenticated
  using (user_id = auth.uid()
         or public.has_role(auth.uid(),'admin')
         or public.has_role(auth.uid(),'super_admin'));

drop policy if exists br_insert_admin on public.broadcast_recipients;
create policy br_insert_admin on public.broadcast_recipients for insert to authenticated
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

-- ---------------------------------------------------------------------
-- 7. Templates
-- ---------------------------------------------------------------------
create table if not exists public.broadcast_templates (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  subject           text not null,
  body              text not null,
  priority          public.broadcast_priority not null default 'normal',
  delivery_methods  text[] not null default array['inbox'],
  target_kind       public.broadcast_target_kind,
  target_filter     jsonb not null default '{}'::jsonb,
  archived          boolean not null default false,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_bt_archived on public.broadcast_templates(archived);

drop trigger if exists trg_bt_updated on public.broadcast_templates;
create trigger trg_bt_updated before update on public.broadcast_templates
  for each row execute function public.tg_set_updated_at();

grant select, insert, update, delete on public.broadcast_templates to authenticated;
grant all on public.broadcast_templates to service_role;
alter table public.broadcast_templates enable row level security;

drop policy if exists bt_select on public.broadcast_templates;
create policy bt_select on public.broadcast_templates for select to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

drop policy if exists bt_write on public.broadcast_templates;
create policy bt_write on public.broadcast_templates for all to authenticated
  using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'))
  with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'super_admin'));

-- ---------------------------------------------------------------------
-- 8. Realtime publication (broadcasts + downstream delivery channels)
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.broadcasts;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.broadcast_recipients;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.notification_reads;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.live_chat_messages;
exception when duplicate_object then null; when others then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.live_chat_conversations;
exception when duplicate_object then null; when others then null; end $$;

alter table public.broadcasts             replica identity full;
alter table public.broadcast_recipients   replica identity full;

-- ---------------------------------------------------------------------
-- 9. Helpful unique index for "Admin Broadcasts" conversation lookup
--    (non-unique safety index; the server picks the existing row)
-- ---------------------------------------------------------------------
create index if not exists idx_lcc_user_subject
  on public.live_chat_conversations(user_id, subject);

