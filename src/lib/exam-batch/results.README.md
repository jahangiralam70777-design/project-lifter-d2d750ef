# Result Engine, Ranking, Leaderboard, Progress & Analytics — Backend Contract

The Result Engine is an isolated sub-module of Exam Batch. It reuses only
what the Exam Engine already reuses (`auth.users`, `levels`, `subjects`,
`chapters`, `questions`) plus the Exam Batch tables already documented in
`README.md` and `exam-engine.README.md`. Everything new lives under
`exam_batch_*` — nothing existing is modified.

SQL / migrations are **out of scope for this delivery** (per task rules).
The TypeScript layer targets the contract below and returns a professional
`BACKEND_UNAVAILABLE` error if any required object is missing.

---

## Tables

### `public.exam_batch_attempt_results`

Materialised result row per submitted attempt. Written once by the scoring
RPC and never mutated by clients.

| column | type | notes |
| --- | --- | --- |
| attempt_id | uuid pk | FK → `exam_batch_attempts.id` on delete cascade |
| exam_id | uuid | FK → `exam_batch_exams.id` |
| user_id | uuid | FK → `auth.users.id` |
| student_id | int | copied from `exam_batch_enrollments.student_id` at scoring time |
| correct | int | count of correctly answered questions |
| wrong | int | count of incorrectly answered questions |
| skipped | int | count of unanswered / null-selection questions |
| total_questions | int | equals `correct + wrong + skipped` |
| marks | numeric(10,2) | server-computed: `correct * exam.mark_per_correct - wrong * exam.mark_per_wrong` (defaults: +1 / 0) |
| max_marks | numeric(10,2) | `total_questions * mark_per_correct` |
| percentage | numeric(6,2) | `round(marks / nullif(max_marks,0) * 100, 2)`, clamped 0..100 |
| time_used_seconds | int | `LEAST(submitted_at, expected_finish_at) - started_at` in seconds |
| duration_seconds | int | `exam.duration_minutes * 60` |
| submitted_at | timestamptz | copied from attempt |
| scored_at | timestamptz | `now()` — set on first scoring; **immutable** |

### `public.exam_batch_leaderboards`

One row per exam. Freeze/lifecycle metadata.

| column | type | notes |
| --- | --- | --- |
| exam_id | uuid pk | FK → `exam_batch_exams.id` on delete cascade |
| session_id | uuid | FK → `exam_batch_sessions.id` |
| status | text | `pending` \| `generating` \| `frozen` |
| generated_at | timestamptz | last time entries were rebuilt |
| frozen_at | timestamptz | first time ranking was published (once exam window ended) |
| entry_count | int | denormalised count of `exam_batch_leaderboard_entries` |
| version | int | bumped on every regeneration |

### `public.exam_batch_leaderboard_entries`

The **frozen** ranking. Never recomputed on read.

| column | type | notes |
| --- | --- | --- |
| exam_id | uuid | FK → `exam_batch_leaderboards.exam_id` on delete cascade |
| attempt_id | uuid | FK → `exam_batch_attempts.id` |
| user_id | uuid | FK → `auth.users.id` |
| student_id | int | copied at freeze time; permanent |
| rank | int | 1-based dense rank; deterministic (see rules) |
| marks | numeric(10,2) | copied from `exam_batch_attempt_results` |
| max_marks | numeric(10,2) | copied |
| percentage | numeric(6,2) | copied |
| correct, wrong, skipped | int | copied |
| time_used_seconds | int | copied |
| submitted_at | timestamptz | copied |

Primary key: `(exam_id, attempt_id)`. Unique `(exam_id, rank)`.

Ranking is deterministic and applied in this exact order:

1. `marks` DESC
2. `time_used_seconds` ASC
3. `submitted_at` ASC
4. `student_id` ASC

### `public.exam_batch_progress_summaries`

Cached per-user aggregates. Rebuilt by the recompute RPC — never on read.

| column | type | notes |
| --- | --- | --- |
| user_id | uuid | FK → `auth.users.id` |
| window | text | `daily` \| `weekly` \| `30d` |
| exams_scheduled | int | eligible exams that started inside the window |
| exams_attended | int | attempts started inside the window |
| exams_submitted | int | attempts submitted inside the window |
| avg_marks | numeric(10,2) | |
| avg_percentage | numeric(6,2) | |
| highest_percentage | numeric(6,2) | |
| lowest_percentage | numeric(6,2) | |
| total_correct, total_wrong, total_skipped | int | |
| updated_at | timestamptz | |

Primary key: `(user_id, window)`.

### `public.exam_batch_analytics_snapshots`

Cached analytics payload. One row per scope key.

| column | type | notes |
| --- | --- | --- |
| scope_key | text pk | `session:<uuid>`, `exam:<uuid>`, or `global` |
| payload | jsonb | full analytics view (matches `AnalyticsView`) |
| generated_at | timestamptz | |

---

## Required RPCs

All are `security definer, set search_path = public`, called **only** from
server code after this module's own authorization has passed.

### `exam_batch_score_attempt(_attempt_id uuid)`

Idempotent scoring. Reads the attempt, its question order, its answers, and
the source questions. Computes correct/wrong/skipped using the per-attempt
`option_order` map, upserts a row in `exam_batch_attempt_results`, and
returns that row.

Rules:

- Refuses to score if the attempt is still `in_progress`.
- Uses server time (`now()`) never client input.
- On re-score (admin recalc), preserves `scored_at` and updates all other
  columns in place.
- `time_used_seconds = LEAST(submitted_at, expected_finish_at) - started_at`.
- Marks scheme: `mark_per_correct` and `mark_per_wrong` are read from
  `exam_batch_exams` if present; otherwise defaults `+1 / 0`.

### `exam_batch_generate_leaderboard(_exam_id uuid, _force boolean default false)`

Idempotent leaderboard freeze.

Behaviour:

- Refuses (returns `pending`) if `now() < exam.window_end` unless `_force = true`.
- Scores every submitted / auto-submitted / timed-out / admin-closed
  attempt that has not been scored yet.
- Truncates `exam_batch_leaderboard_entries` for the exam and inserts one
  row per scored attempt, ranked deterministically (see table).
- Upserts `exam_batch_leaderboards` with `status = 'frozen'`,
  `generated_at = now()`, `frozen_at = coalesce(frozen_at, now())`,
  bumps `version`, sets `entry_count`.
- Returns `exam_batch_leaderboards` row.

### `exam_batch_recompute_progress(_user_id uuid)`

Rebuilds all three `exam_batch_progress_summaries` rows for the user from
`exam_batch_attempt_results` + eligible exams for the user's approved
enrollments. Never blocks — safe to call in the background.

### `exam_batch_generate_analytics(_scope_key text)`

Rebuilds the analytics snapshot for the scope. `_scope_key` is
`session:<uuid>`, `exam:<uuid>` or `global`. Aggregates from
`exam_batch_attempt_results` and enrollment tables, writes the payload
into `exam_batch_analytics_snapshots`, and returns the payload.

### Grants

```sql
grant execute on function public.exam_batch_score_attempt(uuid) to authenticated;
grant execute on function public.exam_batch_generate_leaderboard(uuid, boolean) to authenticated;
grant execute on function public.exam_batch_recompute_progress(uuid) to authenticated;
grant execute on function public.exam_batch_generate_analytics(text) to authenticated;
```

---

## RLS Contract (summary)

- `exam_batch_attempt_results` — SELECT own row (`user_id = auth.uid()`),
  admin full access via `has_permission(auth.uid(), 'manage_content')`. **No
  client writes.**
- `exam_batch_leaderboards` — SELECT `TO authenticated`; admin CRUD via
  `has_permission`.
- `exam_batch_leaderboard_entries` — SELECT own row (`user_id = auth.uid()`)
  **always**, plus top-N by any authenticated user only after the exam window
  ends and within 24h of `frozen_at`; admin full access. The TypeScript
  layer additionally enforces the "top 20 + own row" contract server-side.
- `exam_batch_progress_summaries` — SELECT own row; admin full access.
- `exam_batch_analytics_snapshots` — admin-only SELECT/INSERT/UPDATE.

The TypeScript layer **always** enforces every rule server-side; RLS is
defence-in-depth, not the primary gate.

---

## Server function surface

| function | who | notes |
| --- | --- | --- |
| `getExamBatchAttemptResult` | student | idempotently scores on-demand; returns marks/correct/wrong/skipped/percentage/time; rank hidden until window ends |
| `getExamBatchStudentLeaderboard` | student | triggers freeze once `now >= window_end`; returns top 20 + own row; enforces 24h visibility |
| `getExamBatchStudentHistory` | student | filtered by enrolled subjects; supports subject filter and pagination |
| `getExamBatchStudentProgress` | student | reads cached summary; falls back to on-demand recompute |
| `adminGetExamBatchLeaderboard` | admin | full ranking with search + pagination; joined display name / email |
| `adminGetExamBatchAnalytics` | admin | reads cached snapshot; rebuilds on cache miss |
| `adminRecalculateExamBatch` | admin | manual recompute — scope: `leaderboard` / `analytics` / `progress` / `all` |
| `adminListExamBatchLeaderboards` | admin | previous leaderboards within 45-day retention window |

All timing decisions read **server time only** (`Date.now()` inside the
handler and `now()` inside RPCs). Client clocks are never trusted.

Performance:

- Leaderboards are frozen once and served from `exam_batch_leaderboard_entries`
  — no re-ranking on read.
- Progress and Analytics are served from their cached rows; recompute only
  runs via the recompute RPCs (admin action or first-read fallback).
- Student list endpoints paginate and never return more than 20 leaderboard
  rows per call.
