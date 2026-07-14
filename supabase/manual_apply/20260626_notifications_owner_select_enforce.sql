-- Fix: Admin broadcasts written to `notifications` (status='unread',
-- type='broadcast') were invisible to the recipient student because the
-- legacy `notifications_select_sent` SELECT policy gates on
-- `status = 'sent'`. The corrected `notifications_owner_select` policy
-- already exists in `20260615_widget_branding_and_broadcasts.sql`, but
-- `manual_apply/` files are not run by the migration runner — if the
-- 20260615 file was never applied, students get zero broadcast rows.
--
-- This migration is idempotent and force-applies the owner-select policy
-- regardless of prior state.

-- Drop every legacy SELECT policy that gated on status='sent'.
drop policy if exists notifications_select_sent on public.notifications;
drop policy if exists "notifications_select_sent" on public.notifications;

-- Re-create the owner-select policy (drop-then-create for idempotency).
drop policy if exists notifications_owner_select on public.notifications;
create policy notifications_owner_select on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

-- Owner update (mark-read) and insert via service role only.
drop policy if exists notifications_owner_update on public.notifications;
create policy notifications_owner_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

-- Same owner-select coverage for broadcast_recipients so the inbox JOIN
-- works for the recipient student.
drop policy if exists br_select_self on public.broadcast_recipients;
create policy br_select_self on public.broadcast_recipients
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

drop policy if exists br_update_self on public.broadcast_recipients;
create policy br_update_self on public.broadcast_recipients
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, update on public.broadcast_recipients to authenticated;
grant all on public.broadcast_recipients to service_role;

-- And the broadcasts row itself: recipients can SELECT visible broadcasts
-- where a matching recipients row exists.
drop policy if exists broadcasts_select_recipient on public.broadcasts;
create policy broadcasts_select_recipient on public.broadcasts
  for select to authenticated
  using (
    visible = true
    and exists (
      select 1 from public.broadcast_recipients r
      where r.broadcast_id = broadcasts.id and r.user_id = auth.uid()
    )
    or public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

grant select on public.broadcasts to authenticated;
grant all on public.broadcasts to service_role;
