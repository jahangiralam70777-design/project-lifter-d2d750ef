-- =====================================================================
-- LIVE CHAT SYSTEM — Phase 1: Database & Security Foundation
-- =====================================================================
-- Tables: live_chat_conversations, live_chat_messages, live_chat_assignments,
--         live_chat_notes, live_chat_settings, live_chat_permissions,
--         live_chat_notifications
-- Storage bucket: chat-attachments (private)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type public.chat_conversation_status as enum
    ('new','open','pending','waiting_user','resolved','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.chat_conversation_priority as enum
    ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.chat_message_sender as enum ('user','staff','system');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.chat_permission_key as enum
    ('view','reply','assign','delete_message','close','manage_settings');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 2. updated_at trigger helper (re-uses existing if present)
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 3. Conversations
-- ---------------------------------------------------------------------
create table if not exists public.live_chat_conversations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  guest_token     text,                       -- opaque token for guests
  guest_name      text,
  guest_email     text,
  subject         text,
  status          public.chat_conversation_status not null default 'new',
  priority        public.chat_conversation_priority not null default 'normal',
  assigned_to     uuid references auth.users(id) on delete set null,
  is_blocked      boolean not null default false,
  unread_for_user  integer not null default 0,
  unread_for_staff integer not null default 0,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  user_last_seen_at  timestamptz,
  staff_last_seen_at timestamptz,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint live_chat_conversations_party_chk
    check (user_id is not null or (guest_token is not null and guest_email is not null))
);

create index if not exists idx_lcc_user_id        on public.live_chat_conversations(user_id);
create index if not exists idx_lcc_guest_token    on public.live_chat_conversations(guest_token);
create index if not exists idx_lcc_assigned_to    on public.live_chat_conversations(assigned_to);
create index if not exists idx_lcc_status         on public.live_chat_conversations(status);
create index if not exists idx_lcc_last_message_at on public.live_chat_conversations(last_message_at desc);

drop trigger if exists trg_lcc_updated_at on public.live_chat_conversations;
create trigger trg_lcc_updated_at before update on public.live_chat_conversations
  for each row execute function public.tg_set_updated_at();

grant select, insert, update on public.live_chat_conversations to authenticated;
grant all on public.live_chat_conversations to service_role;
alter table public.live_chat_conversations enable row level security;

-- ---------------------------------------------------------------------
-- 4. Messages
-- ---------------------------------------------------------------------
create table if not exists public.live_chat_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.live_chat_conversations(id) on delete cascade,
  sender_type      public.chat_message_sender not null,
  sender_user_id   uuid references auth.users(id) on delete set null,
  body             text,
  attachments      jsonb not null default '[]'::jsonb,  -- [{path,name,type,size}]
  delivered_at     timestamptz,
  read_at          timestamptz,
  is_deleted       boolean not null default false,
  created_at       timestamptz not null default now()
);

create index if not exists idx_lcm_conv_created
  on public.live_chat_messages(conversation_id, created_at desc);
create index if not exists idx_lcm_sender_user on public.live_chat_messages(sender_user_id);

grant select, insert, update on public.live_chat_messages to authenticated;
grant all on public.live_chat_messages to service_role;
alter table public.live_chat_messages enable row level security;

-- ---------------------------------------------------------------------
-- 5. Assignments history
-- ---------------------------------------------------------------------
create table if not exists public.live_chat_assignments (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.live_chat_conversations(id) on delete cascade,
  assigned_to      uuid references auth.users(id) on delete set null,
  assigned_by      uuid references auth.users(id) on delete set null,
  reason           text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_lca_conv on public.live_chat_assignments(conversation_id);
grant select, insert on public.live_chat_assignments to authenticated;
grant all on public.live_chat_assignments to service_role;
alter table public.live_chat_assignments enable row level security;

-- ---------------------------------------------------------------------
-- 6. Internal staff notes (never visible to users)
-- ---------------------------------------------------------------------
create table if not exists public.live_chat_notes (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.live_chat_conversations(id) on delete cascade,
  author_id        uuid not null references auth.users(id) on delete set null,
  body             text not null,
  created_at       timestamptz not null default now()
);
create index if not exists idx_lcn_conv on public.live_chat_notes(conversation_id, created_at desc);
grant select, insert, update, delete on public.live_chat_notes to authenticated;
grant all on public.live_chat_notes to service_role;
alter table public.live_chat_notes enable row level security;

-- ---------------------------------------------------------------------
-- 7. Settings (singleton row)
-- ---------------------------------------------------------------------
create table if not exists public.live_chat_settings (
  id                       integer primary key default 1,
  enabled                  boolean not null default true,
  position                 text not null default 'bottom-right'
    check (position in ('bottom-right','bottom-left')),
  theme_color              text not null default '#3b82f6',
  welcome_message          text not null default 'Hi! How can we help today?',
  offline_message          text not null default 'We''re offline right now — leave a message and we''ll reply by email.',
  business_hours           jsonb not null default '{}'::jsonb,
  auto_assignment_enabled  boolean not null default false,
  email_notifications      boolean not null default true,
  sound_notifications      boolean not null default true,
  attachment_max_mb        integer not null default 10,
  attachment_allowed_types text[] not null default
    array['image/png','image/jpeg','image/webp','image/gif','application/pdf'],
  rate_limit_per_minute    integer not null default 20,
  updated_at               timestamptz not null default now(),
  constraint live_chat_settings_singleton check (id = 1)
);

insert into public.live_chat_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_lcs_updated_at on public.live_chat_settings;
create trigger trg_lcs_updated_at before update on public.live_chat_settings
  for each row execute function public.tg_set_updated_at();

grant select on public.live_chat_settings to anon, authenticated;
grant all on public.live_chat_settings to service_role;
alter table public.live_chat_settings enable row level security;

-- ---------------------------------------------------------------------
-- 8. Moderator permissions
-- ---------------------------------------------------------------------
create table if not exists public.live_chat_permissions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  permission  public.chat_permission_key not null,
  granted_by  uuid references auth.users(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, permission)
);
grant select on public.live_chat_permissions to authenticated;
grant all on public.live_chat_permissions to service_role;
alter table public.live_chat_permissions enable row level security;

-- ---------------------------------------------------------------------
-- 9. Notifications (admin/staff inbox alerts)
-- ---------------------------------------------------------------------
create table if not exists public.live_chat_notifications (
  id               uuid primary key default gen_random_uuid(),
  recipient_id     uuid not null references auth.users(id) on delete cascade,
  conversation_id  uuid not null references public.live_chat_conversations(id) on delete cascade,
  kind             text not null,  -- 'new_conversation' | 'new_message' | 'assigned'
  payload          jsonb not null default '{}'::jsonb,
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index if not exists idx_lcnoti_recipient
  on public.live_chat_notifications(recipient_id, created_at desc);
grant select, update on public.live_chat_notifications to authenticated;
grant all on public.live_chat_notifications to service_role;
alter table public.live_chat_notifications enable row level security;

-- ---------------------------------------------------------------------
-- 10. Helper functions (SECURITY DEFINER, search_path locked)
-- ---------------------------------------------------------------------
create or replace function public.has_chat_permission(
  _user_id uuid, _permission public.chat_permission_key
) returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.has_role(_user_id, 'admin')
    or exists (
      select 1 from public.live_chat_permissions
      where user_id = _user_id and permission = _permission
    );
$$;

create or replace function public.is_chat_staff(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    public.has_role(_user_id, 'admin')
    or exists (select 1 from public.live_chat_permissions where user_id = _user_id);
$$;

-- Resolves the active guest token for a request (from request header)
create or replace function public.current_guest_token()
returns text
language sql stable
as $$
  select nullif(current_setting('request.headers', true)::json ->> 'x-guest-token', '');
$$;

-- ---------------------------------------------------------------------
-- 11. RLS Policies
-- ---------------------------------------------------------------------

-- live_chat_settings: anyone can read (widget needs it); only admins write
drop policy if exists lcs_read on public.live_chat_settings;
create policy lcs_read on public.live_chat_settings for select
  to anon, authenticated using (true);

drop policy if exists lcs_write on public.live_chat_settings;
create policy lcs_write on public.live_chat_settings for all
  to authenticated
  using (public.has_chat_permission(auth.uid(), 'manage_settings'))
  with check (public.has_chat_permission(auth.uid(), 'manage_settings'));

-- live_chat_conversations
drop policy if exists lcc_select on public.live_chat_conversations;
create policy lcc_select on public.live_chat_conversations for select
  to authenticated
  using (
    user_id = auth.uid()
    or public.is_chat_staff(auth.uid())
  );

drop policy if exists lcc_insert_user on public.live_chat_conversations;
create policy lcc_insert_user on public.live_chat_conversations for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists lcc_update_user on public.live_chat_conversations;
create policy lcc_update_user on public.live_chat_conversations for update
  to authenticated
  using (user_id = auth.uid() or public.is_chat_staff(auth.uid()))
  with check (user_id = auth.uid() or public.is_chat_staff(auth.uid()));

-- live_chat_messages
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
          (sender_type = 'user'  and c.user_id = auth.uid())
          or (sender_type = 'staff' and public.has_chat_permission(auth.uid(), 'reply'))
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

-- live_chat_assignments — staff only
drop policy if exists lca_select on public.live_chat_assignments;
create policy lca_select on public.live_chat_assignments for select
  to authenticated using (public.is_chat_staff(auth.uid()));

drop policy if exists lca_insert on public.live_chat_assignments;
create policy lca_insert on public.live_chat_assignments for insert
  to authenticated with check (public.has_chat_permission(auth.uid(), 'assign'));

-- live_chat_notes — staff only
drop policy if exists lcn_select on public.live_chat_notes;
create policy lcn_select on public.live_chat_notes for select
  to authenticated using (public.is_chat_staff(auth.uid()));

drop policy if exists lcn_insert on public.live_chat_notes;
create policy lcn_insert on public.live_chat_notes for insert
  to authenticated with check (public.is_chat_staff(auth.uid()) and author_id = auth.uid());

drop policy if exists lcn_modify on public.live_chat_notes;
create policy lcn_modify on public.live_chat_notes for update
  to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists lcn_delete on public.live_chat_notes;
create policy lcn_delete on public.live_chat_notes for delete
  to authenticated using (author_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- live_chat_permissions — admin manages, users can read own
drop policy if exists lcp_select on public.live_chat_permissions;
create policy lcp_select on public.live_chat_permissions for select
  to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists lcp_write on public.live_chat_permissions;
create policy lcp_write on public.live_chat_permissions for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- live_chat_notifications — recipient or service role
drop policy if exists lcnoti_select on public.live_chat_notifications;
create policy lcnoti_select on public.live_chat_notifications for select
  to authenticated using (recipient_id = auth.uid());

drop policy if exists lcnoti_update on public.live_chat_notifications;
create policy lcnoti_update on public.live_chat_notifications for update
  to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ---------------------------------------------------------------------
-- 12. Conversation rollup trigger (last_message_at + unread counters)
-- ---------------------------------------------------------------------
create or replace function public.tg_lcm_rollup()
returns trigger language plpgsql security definer set search_path = public as $$
declare preview text;
begin
  preview := left(coalesce(new.body, '[attachment]'), 200);
  update public.live_chat_conversations
     set last_message_at      = new.created_at,
         last_message_preview = preview,
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

-- ---------------------------------------------------------------------
-- 13. Realtime publication + REPLICA IDENTITY FULL
-- ---------------------------------------------------------------------
alter table public.live_chat_conversations  replica identity full;
alter table public.live_chat_messages       replica identity full;
alter table public.live_chat_notes          replica identity full;
alter table public.live_chat_settings       replica identity full;
alter table public.live_chat_notifications  replica identity full;

do $$ begin
  alter publication supabase_realtime add table public.live_chat_conversations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_chat_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_chat_notes;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_chat_settings;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.live_chat_notifications;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 14. Storage bucket policies (bucket created via storage tool separately)
-- ---------------------------------------------------------------------
-- Bucket: chat-attachments (private)
-- Path convention: <conversation_id>/<uuid>-<filename>
do $$ begin
  -- Read: conversation participants and staff
  if not exists (select 1 from pg_policies where policyname = 'chat_attach_read') then
    create policy chat_attach_read on storage.objects for select to authenticated
    using (
      bucket_id = 'chat-attachments'
      and exists (
        select 1 from public.live_chat_conversations c
        where c.id::text = split_part(name, '/', 1)
          and (c.user_id = auth.uid() or public.is_chat_staff(auth.uid()))
      )
    );
  end if;

  if not exists (select 1 from pg_policies where policyname = 'chat_attach_write') then
    create policy chat_attach_write on storage.objects for insert to authenticated
    with check (
      bucket_id = 'chat-attachments'
      and exists (
        select 1 from public.live_chat_conversations c
        where c.id::text = split_part(name, '/', 1)
          and (c.user_id = auth.uid() or public.has_chat_permission(auth.uid(), 'reply'))
      )
    );
  end if;
end $$;

-- =====================================================================
-- DONE — Phase 1
-- =====================================================================
