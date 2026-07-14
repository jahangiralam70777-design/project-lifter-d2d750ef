# Exam Engine — Backend Contract

The Exam Engine is an isolated sub-module of Exam Batch. It reuses only:

- `auth.users`
- `levels`, `subjects`, `chapters` (read-only)
- `questions` (read-only, filtered by `level` / `subject_id` / `chapter_id`)
- `exam_batch_sessions`, `exam_batch_enrollments`, `exam_batch_enrollment_subjects`
  (already documented in `README.md`)

Everything else lives under `exam_batch_*`.

SQL/migrations are out-of-scope for the code delivery (per task rules).
The TypeScript layer targets the following database contract and returns a
professional `BACKEND_UNAVAILABLE` error if any required object is missing.

---

## Tables

### `public.exam_batch_exams`

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | `gen_random_uuid()` |
| session_id | uuid | FK -> `exam_batch_sessions.id` on delete cascade |
| title | text | required |
| subtitle | text | nullable |
| level | text | must equal session.level |
| subject_id | uuid | FK -> `subjects.id` |
| chapter_id | uuid | nullable; FK -> `chapters.id` |
| duration_minutes | int | 1..1440 |
| total_questions | int | expected count; must equal linked question count on publish |
| window_start | timestamptz | inclusive |
| window_end | timestamptz | exclusive; strictly > window_start |
| available_before_minutes | int | default 15 |
| upcoming_before_minutes | int | default 1440 (24h) |
| randomize_questions | bool | default true |
| randomize_options | bool | default true |
| status | text | `active` \| `inactive` |
| is_published | bool | default false |
| is_archived | bool | default false |
| is_hidden | bool | default false |
| force_closed_at | timestamptz | nullable; when set, exam auto-closes all in-progress attempts |
| created_by | uuid | FK -> `auth.users.id` |
| created_at, updated_at | timestamptz | defaults `now()` |

### `public.exam_batch_exam_questions`

| column | type | notes |
| --- | --- | --- |
| exam_id | uuid | FK -> `exam_batch_exams.id` on delete cascade |
| question_id | uuid | FK -> `questions.id` |
| position | int | canonical (unshuffled) order |

Primary key: `(exam_id, question_id)`.

### `public.exam_batch_attempts`

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | `gen_random_uuid()` |
| exam_id | uuid | FK -> `exam_batch_exams.id` |
| user_id | uuid | FK -> `auth.users.id` |
| status | text | `in_progress` \| `submitted` \| `auto_submitted` \| `timed_out` \| `admin_closed` |
| started_at | timestamptz | server time on creation |
| expected_finish_at | timestamptz | `started_at + duration_minutes`; **not** recomputed on resume |
| submitted_at | timestamptz | nullable |
| submit_reason | text | `manual` \| `auto` \| `timeout` \| `admin` (nullable) |
| created_at, updated_at | timestamptz | defaults `now()` |

Constraints:

- `unique (exam_id, user_id) where status = 'in_progress'` — enforces exactly
  one active attempt per student per exam at the database level; belt-and-braces
  even if the RPC path is bypassed.
- Post-submit rows are immutable — no update policy targets a non-in-progress row.

### `public.exam_batch_attempt_question_order`

| column | type | notes |
| --- | --- | --- |
| attempt_id | uuid | FK -> `exam_batch_attempts.id` on delete cascade |
| position | int | 0-based display index for this attempt |
| question_id | uuid | FK -> `questions.id` |
| option_order | int[] | mapping display index → source option index |

Primary key: `(attempt_id, position)`; unique `(attempt_id, question_id)`.

Persisting order per attempt is what makes randomization safe: every request
after the attempt begins uses the same order and the same option shuffle, so
answer mapping is stable across refreshes / reconnects / browser crashes.

### `public.exam_batch_attempt_answers`

| column | type | notes |
| --- | --- | --- |
| attempt_id | uuid | FK -> `exam_batch_attempts.id` on delete cascade |
| question_id | uuid | FK -> `questions.id` |
| selected_display_index | int | nullable — index into the attempt's shuffled options |
| updated_at | timestamptz | default `now()` |

Primary key: `(attempt_id, question_id)`.

Row-level policy MUST refuse writes when the parent attempt is not
`in_progress` — defence in depth against a client racing a submit.

---

## Required RPCs

All are `security definer, set search_path = public`, and are invoked
**only** from server code after Exam Engine's own validation has passed.

### `exam_batch_start_or_resume_attempt`

```sql
create or replace function public.exam_batch_start_or_resume_attempt(
  _exam_id uuid,
  _user_id uuid,
  _duration_minutes int,
  _randomize_questions boolean,
  _randomize_options boolean
) returns table (attempt_id uuid, resumed boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_existing uuid;
  v_attempt  uuid;
begin
  -- Serialize concurrent starts for this (exam, user) pair.
  perform pg_advisory_xact_lock(hashtext('exam_batch:start:' || _exam_id::text || ':' || _user_id::text));

  select id into v_existing
    from exam_batch_attempts
   where exam_id = _exam_id and user_id = _user_id and status = 'in_progress'
   limit 1;
  if v_existing is not null then
    return query select v_existing, true;
    return;
  end if;

  insert into exam_batch_attempts(exam_id, user_id, status, started_at, expected_finish_at)
  values (_exam_id, _user_id, 'in_progress', now(), now() + make_interval(mins => _duration_minutes))
  returning id into v_attempt;

  -- Materialise question order (randomised or canonical).
  insert into exam_batch_attempt_question_order(attempt_id, position, question_id, option_order)
  select
    v_attempt,
    row_number() over (
      order by case when _randomize_questions then random() else eq.position end
    ) - 1 as position,
    eq.question_id,
    -- option_order length is derived from the question's options length.
    (
      select case when _randomize_options
        then (
          select array_agg(i order by random())
          from generate_series(0, coalesce(jsonb_array_length(q.options), 0) - 1) i
        )
        else (
          select array_agg(i order by i)
          from generate_series(0, coalesce(jsonb_array_length(q.options), 0) - 1) i
        )
      end
      from questions q where q.id = eq.question_id
    )
  from exam_batch_exam_questions eq
  where eq.exam_id = _exam_id;

  return query select v_attempt, false;
end
$$;
```

### `exam_batch_submit_attempt`

```sql
create or replace function public.exam_batch_submit_attempt(
  _attempt_id uuid,
  _user_id uuid,
  _reason text
) returns table (id uuid, status text, submitted_at timestamptz, submit_reason text)
language plpgsql security definer set search_path = public
as $$
declare
  v_status text;
begin
  case _reason
    when 'manual'  then v_status := 'submitted';
    when 'auto'    then v_status := 'auto_submitted';
    when 'timeout' then v_status := 'timed_out';
    when 'admin'   then v_status := 'admin_closed';
    else raise exception 'invalid submit reason %', _reason;
  end case;

  return query
  update exam_batch_attempts a
     set status        = v_status,
         submitted_at  = coalesce(a.submitted_at, now()),
         submit_reason = coalesce(a.submit_reason, _reason),
         updated_at    = now()
   where a.id = _attempt_id
     and a.user_id = _user_id
     and a.status = 'in_progress'    -- first submit wins; later calls are no-ops
  returning a.id, a.status, a.submitted_at, a.submit_reason;
end
$$;
```

Idempotency: subsequent calls (e.g. auto-submit racing manual submit)
UPDATE zero rows and return an empty set; the server-fn layer treats that
as "already submitted" and returns a stable success shape to the client.

### `exam_batch_close_exam_attempts`

Called by admin force-close. Auto-submits every in-progress attempt for the
exam using the reason label `admin`.

```sql
create or replace function public.exam_batch_close_exam_attempts(
  _exam_id uuid,
  _reason text default 'admin'
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  update exam_batch_attempts a
     set status = 'admin_closed',
         submitted_at = coalesce(a.submitted_at, now()),
         submit_reason = coalesce(a.submit_reason, _reason),
         updated_at = now()
   where a.exam_id = _exam_id and a.status = 'in_progress';
  get diagnostics v_count = row_count;
  return v_count;
end
$$;
```

### Grants

```sql
grant execute on function public.exam_batch_start_or_resume_attempt(uuid, uuid, int, boolean, boolean) to authenticated;
grant execute on function public.exam_batch_submit_attempt(uuid, uuid, text) to authenticated;
grant execute on function public.exam_batch_close_exam_attempts(uuid, text) to authenticated;
```

---

## RLS Contract (summary)

- `exam_batch_exams` — SELECT `TO authenticated` when `is_published AND NOT is_hidden AND NOT is_archived AND status='active'`; admin CRUD via `has_permission(auth.uid(), 'manage_content')`.
- `exam_batch_exam_questions` — SELECT is server-only (functions read via service context). Admin writes via `has_permission`.
- `exam_batch_attempts` — SELECT/UPDATE own row (`user_id = auth.uid()`), admin full access. UPDATE policy MUST require `status = 'in_progress'` on the OLD row.
- `exam_batch_attempt_question_order` — SELECT own via joined attempt; no client writes.
- `exam_batch_attempt_answers` — SELECT/UPSERT own via joined attempt AND parent attempt `status = 'in_progress'`.

The TypeScript layer **also** enforces every rule server-side; RLS is
defence-in-depth, not the primary gate.

---

## Server function surface

| function | who | notes |
| --- | --- | --- |
| `adminListExamBatchExams` | admin | includes hidden/archived |
| `adminCreateExamBatchExam` | admin | validates session + level match, window ordering |
| `adminUpdateExamBatchExam` | admin | patch-style, revalidates window ordering |
| `adminDeleteExamBatchExam` | admin | refuses if attempts exist (archive instead) |
| `adminSetExamBatchExamPublished` | admin | requires attached question set |
| `adminSetExamBatchExamArchived` | admin | soft state |
| `adminSetExamBatchExamHidden` | admin | soft state |
| `adminForceCloseExamBatchExam` | admin | sets `force_closed_at` + RPC-closes all in-progress attempts |
| `adminSetExamBatchExamQuestions` | admin | refuses if any attempts exist; validates level/subject/chapter of every question |
| `listExamBatchExamsForSession` | student | hides `upcoming` (outside upcomingBefore); filters by enrolled subjects; enrollment must be approved |
| `getExamBatchExamMeta` | student | no questions; server time returned |
| `startOrResumeExamBatchAttempt` | student | atomic; only when `live` |
| `getExamBatchAttemptState` | student | lazy — one question per call; auto-submits if time is up |
| `saveExamBatchAnswer` | student | rejects when locked; validates option range against the attempt's own shuffle |
| `submitExamBatchAttempt` | student | idempotent — first valid submit wins |
| `getExamBatchAttemptStatus` | student | lightweight poll; performs auto-submit-by-time |

All timing decisions read **server time only** (`Date.now()` inside the
handler). Client clocks are never trusted.
