-- Live Chat role-based send + delete permanent fix.
-- Goal:
--   * Admin, Super Admin, Moderator can send replies.
--   * Admin and Super Admin can permanently delete conversations.
--   * Moderator CANNOT permanently delete conversations.
--   * Student can delete only their own view (handled via user_hidden_at).
-- Idempotent.

begin;

-- ---------------------------------------------------------------------
-- 1. Staff / permission helpers — rebuild to be RPC-callable from
--    authenticated, independent of the live_chat_permissions overrides
--    table, and resilient to enum-cast issues from PostgREST.
-- ---------------------------------------------------------------------
create or replace function public.is_chat_staff(_user_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id
      and role::text in ('admin', 'super_admin', 'moderator')
  )
  or exists (
    select 1 from public.live_chat_permissions
    where user_id = _user_id
  );
$$;

create or replace function public.has_chat_permission(
  _user_id uuid, _permission public.chat_permission_key
) returns boolean
language sql stable security definer set search_path = public
as $$
  select
    -- Admin & Super Admin: full chat permissions
    exists (
      select 1 from public.user_roles
      where user_id = _user_id
        and role::text in ('admin', 'super_admin')
    )
    -- Moderator: view, reply, close only (no delete_message, no manage_settings, no assign)
    or (
      _permission in ('view','reply','close')
      and exists (
        select 1 from public.user_roles
        where user_id = _user_id and role::text = 'moderator'
      )
    )
    -- Explicit per-user override
    or exists (
      select 1 from public.live_chat_permissions
      where user_id = _user_id and permission = _permission
    );
$$;

revoke all on function public.is_chat_staff(uuid) from public, anon;
grant execute on function public.is_chat_staff(uuid) to authenticated, service_role;
revoke all on function public.has_chat_permission(uuid, public.chat_permission_key) from public, anon;
grant execute on function public.has_chat_permission(uuid, public.chat_permission_key) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. RLS for live_chat_messages INSERT — staff insert their own staff
--    messages, owners insert their own user messages.
-- ---------------------------------------------------------------------
drop policy if exists lcm_insert on public.live_chat_messages;
create policy lcm_insert on public.live_chat_messages for insert
  to authenticated
  with check (
    exists (
      select 1 from public.live_chat_conversations c
      where c.id = conversation_id
        and c.is_blocked = false
        and (
          (sender_type = 'user'
            and c.user_id = auth.uid()
            and sender_user_id = auth.uid())
          or (sender_type = 'staff'
            and public.has_chat_permission(auth.uid(), 'reply'::public.chat_permission_key)
            and sender_user_id = auth.uid())
        )
    )
  );

-- ---------------------------------------------------------------------
-- 3. RLS for live_chat_conversations DELETE — admin OR super_admin only.
--    Moderators are explicitly excluded.
-- ---------------------------------------------------------------------
drop policy if exists lcc_delete_super on public.live_chat_conversations;
drop policy if exists lcc_delete_admin on public.live_chat_conversations;
create policy lcc_delete_admin on public.live_chat_conversations for delete
  to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid()
        and role::text in ('admin', 'super_admin')
    )
  );

-- ---------------------------------------------------------------------
-- 4. RLS for live_chat_conversations UPDATE — owners may update their
--    own row (used by student-side soft-hide via user_hidden_at); staff
--    may update any row.
-- ---------------------------------------------------------------------
drop policy if exists lcc_update_user on public.live_chat_conversations;
create policy lcc_update_user on public.live_chat_conversations for update
  to authenticated
  using (user_id = auth.uid() or public.is_chat_staff(auth.uid()))
  with check (user_id = auth.uid() or public.is_chat_staff(auth.uid()));

-- ---------------------------------------------------------------------
-- 5. Trigger — coalesce unread counters so NULL values never break the
--    increment path used by staff/user inserts.
-- ---------------------------------------------------------------------
create or replace function public.tg_lcm_rollup()
returns trigger language plpgsql security definer set search_path = public as $$
declare preview text;
begin
  preview := left(coalesce(new.body, '[attachment]'), 200);
  update public.live_chat_conversations
     set last_message_at      = new.created_at,
         last_message_preview = preview,
         expires_at           = greatest(coalesce(expires_at, new.created_at), new.created_at + interval '30 days'),
         status = case
           when new.sender_type = 'staff' and status in ('new','open') then 'waiting_user'
           when new.sender_type = 'user'  and status in ('waiting_user','resolved','closed') then 'open'
           when status = 'new' then 'open'
           else status
         end,
         unread_for_user  = coalesce(unread_for_user, 0) + case when new.sender_type = 'staff' then 1 else 0 end,
         unread_for_staff = coalesce(unread_for_staff, 0) + case when new.sender_type = 'user' then 1 else 0 end,
         updated_at = now()
   where id = new.conversation_id;
  return new;
end $$;

drop trigger if exists trg_lcm_rollup on public.live_chat_messages;
create trigger trg_lcm_rollup after insert on public.live_chat_messages
  for each row execute function public.tg_lcm_rollup();

commit;

notify pgrst, 'reload schema';
