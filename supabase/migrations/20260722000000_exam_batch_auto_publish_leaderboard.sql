-- =============================================================================
-- Exam Batch — automatic leaderboard publishing
-- =============================================================================
-- Root cause fix: `exam_batch_generate_leaderboard` was only ever called by
-- (a) a student loading the leaderboard page after `window_end`, and
-- (b) admin's manual "Recalculate" button. As a result:
--   • A scheduled `window_end` with no student visit left the leaderboard in
--     the `pending` state forever.
--   • `adminForceCloseExamBatchExam` closed attempts but never froze the
--     board (fixed on the server-fn side in this same change).
--
-- This migration establishes a single source of truth for automatic freezing
-- inside the database itself, so no client refresh is ever required:
--
--   1) AFTER-UPDATE trigger on `exam_batch_attempts` — when an attempt lands
--      in a terminal status AND the exam window has already ended (or the
--      exam was force-closed), publish the leaderboard right there in the
--      same transaction. Handles the "last student submits at 23:59:59" edge
--      case and the "admin force-closes mid-exam" flow.
--
--   2) AFTER-UPDATE trigger on `exam_batch_exams` — when `force_closed_at`
--      transitions from NULL → NOT NULL, publish immediately.
--
--   3) `exam_batch_freeze_ended_leaderboards()` — an idempotent sweep function
--      + pg_cron schedule (every minute) that freezes any exam whose window
--      has ended without a frozen leaderboard yet. Covers the "0 students
--      participated" and "no one opens the app after window_end" scenarios.
--
-- Every path funnels into the existing `exam_batch_generate_leaderboard` RPC,
-- which already holds a transactional advisory lock, so duplicate freezes are
-- impossible even under simultaneous submissions.
-- =============================================================================

set search_path = public;

-- 1) Trigger on exam_batch_attempts ------------------------------------------
create or replace function public.exam_batch_attempt_after_terminal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_end     timestamptz;
  v_force_closed   timestamptz;
  v_status         text;
begin
  -- Only fire when the row transitions INTO a terminal state.
  if new.status not in ('submitted','auto_submitted','timed_out','admin_closed') then
    return new;
  end if;
  if old.status = new.status then
    return new;
  end if;

  select e.window_end, e.force_closed_at
    into v_window_end, v_force_closed
  from public.exam_batch_exams e
  where e.id = new.exam_id;

  if v_window_end is null then
    return new;
  end if;

  -- Freeze only when the exam is actually over. Mid-exam submissions must
  -- not freeze the board — other students may still be in progress.
  if now() < v_window_end and v_force_closed is null then
    return new;
  end if;

  -- Skip work if already frozen.
  select lb.status into v_status
  from public.exam_batch_leaderboards lb
  where lb.exam_id = new.exam_id;
  if v_status = 'frozen' then
    return new;
  end if;

  perform public.exam_batch_generate_leaderboard(new.exam_id, true);
  return new;
exception when others then
  -- Never break attempt writes because of a leaderboard hiccup — the sweep
  -- (below) will pick it up within a minute.
  raise warning 'exam_batch_attempt_after_terminal failed for exam %: %',
    new.exam_id, sqlerrm;
  return new;
end
$$;

drop trigger if exists trg_exam_batch_attempt_after_terminal
  on public.exam_batch_attempts;
create trigger trg_exam_batch_attempt_after_terminal
after update of status on public.exam_batch_attempts
for each row
execute function public.exam_batch_attempt_after_terminal();

-- 2) Trigger on exam_batch_exams (force-close) --------------------------------
create or replace function public.exam_batch_exam_after_force_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if new.force_closed_at is null then
    return new;
  end if;
  if old.force_closed_at is not null then
    return new;
  end if;

  select lb.status into v_status
  from public.exam_batch_leaderboards lb
  where lb.exam_id = new.id;
  if v_status = 'frozen' then
    return new;
  end if;

  perform public.exam_batch_generate_leaderboard(new.id, true);
  return new;
exception when others then
  raise warning 'exam_batch_exam_after_force_close failed for exam %: %',
    new.id, sqlerrm;
  return new;
end
$$;

drop trigger if exists trg_exam_batch_exam_after_force_close
  on public.exam_batch_exams;
create trigger trg_exam_batch_exam_after_force_close
after update of force_closed_at on public.exam_batch_exams
for each row
execute function public.exam_batch_exam_after_force_close();

-- 3) Sweep function -----------------------------------------------------------
-- Freezes every exam whose window ended (or was force-closed) without a
-- frozen leaderboard yet. Safe to run repeatedly — the generate RPC is
-- guarded by an advisory lock and short-circuits when nothing changed.
create or replace function public.exam_batch_freeze_ended_leaderboards()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_done int := 0;
begin
  for r in
    select e.id
    from public.exam_batch_exams e
    left join public.exam_batch_leaderboards lb on lb.exam_id = e.id
    where (e.window_end <= now() or e.force_closed_at is not null)
      and coalesce(lb.status, 'pending') <> 'frozen'
    order by e.window_end asc
    limit 500
  loop
    begin
      perform public.exam_batch_generate_leaderboard(r.id, true);
      v_done := v_done + 1;
    exception when others then
      raise warning 'freeze sweep skipped exam %: %', r.id, sqlerrm;
    end;
  end loop;
  return v_done;
end
$$;

revoke execute on function public.exam_batch_freeze_ended_leaderboards() from public, anon, authenticated;
grant  execute on function public.exam_batch_freeze_ended_leaderboards() to service_role;

-- 4) pg_cron schedule (optional; guarded) -------------------------------------
-- If pg_cron is installed, run the sweep every minute. This is the safety
-- net for "0 students participated" and "no one visits after window_end".
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Remove any previous schedule with the same name so this migration is
    -- idempotent on re-run.
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'exam_batch_freeze_ended_leaderboards';

    perform cron.schedule(
      'exam_batch_freeze_ended_leaderboards',
      '* * * * *',
      $cron$select public.exam_batch_freeze_ended_leaderboards();$cron$
    );
  end if;
end
$$;
