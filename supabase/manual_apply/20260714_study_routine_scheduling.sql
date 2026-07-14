-- Study Routine — scheduling upgrade.
-- Adds full scheduling + task-default fields to study_routines and a
-- uniqueness constraint on generated occurrences in study_routine_tasks.
-- Safe to run multiple times (fully idempotent).

alter table public.study_routines
  add column if not exists description        text,
  add column if not exists task_title         text,
  add column if not exists task_type          text,
  add column if not exists study_target       text,
  add column if not exists estimated_minutes  int,
  add column if not exists priority           text,
  add column if not exists reminder_minutes   int,
  add column if not exists default_status     text,
  add column if not exists due_date           date,
  add column if not exists schedule_mode      text,
  add column if not exists interval_weeks     int  default 1,
  add column if not exists interval_months    int  default 1,
  add column if not exists weekdays           smallint[],
  add column if not exists start_date         date,
  add column if not exists end_date           date,
  add column if not exists anchor_date        date,
  add column if not exists start_time         time,
  add column if not exists end_time           time;

update public.study_routines
   set schedule_mode = coalesce(schedule_mode, type::text)
 where schedule_mode is null;

update public.study_routines
   set anchor_date  = coalesce(anchor_date,  current_date),
       start_date   = coalesce(start_date,   current_date)
 where anchor_date is null or start_date is null;

-- One task per (user, routine, date, title). Prevents duplicate occurrences.
create unique index if not exists study_routine_tasks_occurrence_uniq
  on public.study_routine_tasks (user_id, routine_id, task_date, title)
  where routine_id is not null;

create index if not exists study_routine_tasks_routine_date_idx
  on public.study_routine_tasks (routine_id, task_date);
