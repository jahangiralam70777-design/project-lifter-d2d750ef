-- Study Routine — reuse the existing user_goals table to store the
-- student's weekly / monthly study-time target (in minutes). Idempotent.

create table if not exists public.user_goals (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  daily_mcqs   int,
  weekly_mcqs  int,
  monthly_mcqs int,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.user_goals
  add column if not exists weekly_study_minutes  int,
  add column if not exists monthly_study_minutes int;

grant select, insert, update, delete on public.user_goals to authenticated;
grant all on public.user_goals to service_role;

alter table public.user_goals enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_goals'
      and policyname = 'user_goals_owner_all'
  ) then
    create policy user_goals_owner_all on public.user_goals
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
