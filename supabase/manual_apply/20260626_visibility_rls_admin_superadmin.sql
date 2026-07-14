-- Fix: "new row violates row-level security policy" when admins hide
-- Flash Cards / Short Notes / Qns Bank / Classes sections.
--
-- Root causes:
--  1. flash_card_visibility / short_notes_visibility / question_bank_visibility
--     / video_class_visibility policies only allowed has_role(_,'admin');
--     super_admin was rejected, and FOR ALL relied on USING for WITH CHECK
--     which fails cleanly on INSERT/UPSERT in some plans.
--  2. module_visibility had only a FOR UPDATE policy — the first INSERT
--     from syncModuleHiddenFlag() for a new key always failed RLS.
--
-- This migration:
--   - Drops the old write policies on the four visibility singletons and
--     replaces them with explicit INSERT/UPDATE/DELETE policies that allow
--     both 'admin' and 'super_admin', with WITH CHECK clauses.
--   - Adds an INSERT policy on module_visibility for the same roles, and
--     normalizes the UPDATE policy.
--
-- Safe to re-run.

-- helper: admin-or-super check inline because some envs may not have a
-- combined helper; has_role exists from the user_roles bootstrap.

do $$
declare
  t text;
begin
  foreach t in array array[
    'flash_card_visibility',
    'short_notes_visibility',
    'question_bank_visibility',
    'video_class_visibility'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_write_admin', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_delete', t);

    execute format($f$
      create policy %I on public.%I
        for insert to authenticated
        with check (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'super_admin')
        )
    $f$, t || '_admin_insert', t);

    execute format($f$
      create policy %I on public.%I
        for update to authenticated
        using (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'super_admin')
        )
        with check (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'super_admin')
        )
    $f$, t || '_admin_update', t);

    execute format($f$
      create policy %I on public.%I
        for delete to authenticated
        using (
          public.has_role(auth.uid(), 'admin')
          or public.has_role(auth.uid(), 'super_admin')
        )
    $f$, t || '_admin_delete', t);
  end loop;
end $$;

-- module_visibility: add missing INSERT policy and normalize UPDATE
do $$
begin
  -- Drop legacy policies if present
  begin
    drop policy if exists "admins update module visibility" on public.module_visibility;
  exception when undefined_object then null;
  end;
  begin
    drop policy if exists "admins insert module visibility" on public.module_visibility;
  exception when undefined_object then null;
  end;
end $$;

create policy "admins insert module visibility"
  on public.module_visibility
  for insert to authenticated
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

create policy "admins update module visibility"
  on public.module_visibility
  for update to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or public.has_role(auth.uid(), 'super_admin')
  );

grant insert, update on public.module_visibility to authenticated;
grant insert, update on public.flash_card_visibility to authenticated;
grant insert, update on public.short_notes_visibility to authenticated;
grant insert, update on public.question_bank_visibility to authenticated;
grant insert, update on public.video_class_visibility to authenticated;
