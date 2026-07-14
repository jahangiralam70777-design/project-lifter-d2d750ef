# Exam Batch — Attendance Enforcement (DB contract)

> No SQL is created by the app. This file documents the tables, columns,
> constraints and RPCs the backend code in `attendance.*` expects. The
> feature is **fully isolated** inside the Exam Batch module — no existing
> table is modified.
>
> **Scope model (v2)**: every counter, ban and event is keyed by
> `(user_id, session_id, subject_id)`. A miss streak in one
> `(session, subject)` never affects any other `(session, subject)`.
> A brand-new session always starts from zero.

## Tables

### `exam_batch_attendance_state`
One row per `(student, session, subject)`. Missing row ≡ default state
(count 0, not banned).

| column                    | type        | notes                                                    |
|---------------------------|-------------|----------------------------------------------------------|
| `user_id`                 | uuid        | references `auth.users.id`                               |
| `session_id`              | uuid        | references `exam_batch_sessions.id`                      |
| `subject_id`              | uuid        | references `subjects.id`                                 |
| `consecutive_missed_count`| int         | default 0, `>= 0`                                        |
| `last_missed_exam_id`     | uuid        | last exam that incremented the counter, nullable         |
| `last_missed_at`          | timestamptz | nullable                                                 |
| `last_attended_exam_id`   | uuid        | last exam whose attempt reset the counter, nullable      |
| `last_attended_at`        | timestamptz | nullable                                                 |
| `banned`                  | boolean     | default false                                            |
| `banned_at`               | timestamptz | nullable                                                 |
| `banned_reason`           | text        | nullable                                                 |
| `banned_by`               | uuid        | admin actor id, nullable (null ⇒ auto-ban system)        |
| `auto_banned`             | boolean     | true if the ban was applied by the auto-ban routine      |
| `updated_at`              | timestamptz | default `now()`                                          |
| **PRIMARY KEY**           |             | `(user_id, session_id, subject_id)`                      |

Indexes recommended:
- `(user_id)` — lookup for the module gate.
- `(session_id, subject_id)` — admin filters + dashboard.
- `(banned) where banned = true` — currently-banned list.
- `(consecutive_missed_count)` — near-limit dashboard.

RLS: student can `SELECT` its own rows; admin (`manage_content`) can select
all. All writes go through server functions.

### `exam_batch_attendance_processed`
Idempotency ledger so re-running the missed-exam sweep never double-counts.

| column        | type        | notes                                              |
|---------------|-------------|----------------------------------------------------|
| `user_id`     | uuid        |                                                    |
| `session_id`  | uuid        |                                                    |
| `subject_id`  | uuid        |                                                    |
| `exam_id`     | uuid        |                                                    |
| `processed_at`| timestamptz | default `now()`                                    |
| **PRIMARY KEY**|            | `(user_id, session_id, subject_id, exam_id)`       |

The unique key is the dedupe — insert-on-conflict is how the sweep asserts
"first-time processing" atomically.

### `exam_batch_attendance_events`
Immutable audit trail for the ban engine (in addition to
`exam_batch_audit_log`).

| column          | type        | notes                                                    |
|-----------------|-------------|----------------------------------------------------------|
| `id`            | uuid PK     | default `gen_random_uuid()`                              |
| `user_id`       | uuid        | student the event applies to                             |
| `session_id`    | uuid        | nullable for legacy rows; new events always set it       |
| `subject_id`    | uuid        | nullable for legacy rows; new events always set it       |
| `kind`          | text        | `missed`, `attended`, `counter.increment`, `counter.decrement`, `counter.set`, `counter.reset`, `auto_ban`, `manual_ban`, `manual_unban` |
| `exam_id`       | uuid        | nullable — the exam that triggered the event             |
| `previous_count`| int         | nullable                                                 |
| `new_count`     | int         | nullable                                                 |
| `reason`        | text        | nullable                                                 |
| `actor_id`      | uuid        | admin that performed the action, null for auto/system    |
| `created_at`    | timestamptz | default `now()`                                          |

RLS: admin `SELECT`; students may SELECT their own rows if the UI wants to
show the reason breakdown.

## Settings

Attendance settings live inside the existing `exam_batch_settings`
singleton row under the JSONB key `attendance`:

```jsonc
{
  "attendance": {
    "consecutiveMissLimit": 3,
    "autoBanEnabled": true,
    "nearBanOffset": 1,
    "banTitle": "Exam Batch Access Suspended",
    "banMessage": "…",
    "suggestedAction": "…",
    "supportContact": "",
    "supportRequired": true
  }
}
```

`consecutiveMissLimit = 0` OR `autoBanEnabled = false` disables auto-banning.
`nearBanOffset` controls when the "near limit" warning appears
(warn when `count >= limit - nearBanOffset`, default 1).
The limit is always read at process time — never cached.

## Missed-exam definition (per session + subject)

A student counts as `MISSED` for one exam **only if all of the following
hold at the moment the sweep runs**:

1. The student has an `approved`, non-`removed` enrollment for the exam's
   `(session_id, subject_id)`.
2. The exam is `published`, not `hidden`, not `archived`, not `cancelled`.
3. The exam window has **completely ended** (server clock > `ends_at`).
4. There is no `exam_batch_attempts` row for `(user_id, exam_id)` in
   **any** state — never started ⇒ missed. Any started attempt
   (`in_progress`, `submitted`, `auto_submitted`, `timeout_submitted`)
   breaks the streak for THAT `(session, subject)` and resets its counter
   to zero.
5. `(user_id, session_id, subject_id, exam_id)` is not already present in
   `exam_batch_attendance_processed`.

Removed students (`removed = true`) are excluded.

## Required RPCs

### `exam_batch_attendance_process_exam(_exam_id uuid) returns table(processed int, auto_banned int, reset int)`

Atomic sweep for one exam. Recommended body:

```sql
-- 1. Guard: exam exists, published, not hidden/archived/cancelled, window ended.
--    Extract exam.session_id / exam.subject_id.
-- 2. Insert into exam_batch_attendance_processed for each eligible
--    (user_id, session_id, subject_id, exam_id) ON CONFLICT DO NOTHING
--    RETURNING user_id.
-- 3. For each RETURNING user_id, upsert exam_batch_attendance_state on
--    (user_id, session_id, subject_id) incrementing
--    consecutive_missed_count and setting last_missed_*.
-- 4. If new count >= settings.consecutiveMissLimit AND autoBanEnabled AND
--    NOT banned, set banned=true, banned_at=now(), auto_banned=true,
--    banned_reason='Auto-ban: consecutive missed exams'.
-- 5. Insert one exam_batch_attendance_events row per user (kind='missed'),
--    including session_id + subject_id.
-- 6. If auto-ban fired, insert another events row (kind='auto_ban').
-- Return (processed, auto_banned, reset) totals.
```

The service code will fall back to a **best-effort** JavaScript implementation
using the tables directly if this RPC is not deployed. The RPC is strongly
preferred for race-safety.

### `exam_batch_attendance_reset_on_participation(_user_id uuid, _exam_id uuid) returns void`

Called by the Exam Engine the first time a user creates an attempt row
for an exam. Derives `(session_id, subject_id)` from the exam, then:
- Upserts `exam_batch_attendance_state` on `(user_id, session_id,
  subject_id)` with `consecutive_missed_count = 0`,
  `last_attended_exam_id = _exam_id`, `last_attended_at = now()`.
- Inserts an `exam_batch_attendance_events` row with `kind='attended'`.
- Inserts a second row with `kind='counter.reset'` iff the previous
  counter was > 0.

Idempotent. If missing, the service layer performs the equivalent update
directly.

## Ban semantics

- `banned=true` for ANY `(user_id, session_id, subject_id)` ⇒ the
  student-facing gate `getExamBatchAccessState` returns
  `{ allowed:false, reason:"banned", bans:[…] }` for the WHOLE Exam Batch
  module. All Exam Batch server functions call `assertExamBatchNotBanned`.
- The website account (Auth, Dashboard, MCQ Practice, Quiz, Mock Test,
  Flash Cards, Question Bank, Short Notes, Video Classes, Daily Progress,
  Profile, Notifications) is **outside** the Exam Batch module and MUST
  NOT read these tables.
- Auto-unban is **never** performed. Only an admin call to
  `adminUnbanExamBatchAttendance` clears the ban for a given
  `(user, session, subject)`.
- Manually resetting the counter to 0 does **not** clear the ban — the
  admin must call unban explicitly.
- Unban optionally resets the counter (`resetCounter=true` by default)
  so the recovered student starts fresh in that `(session, subject)`.

## Performance

Every write goes through the primary key `(user_id, session_id,
subject_id)` — no full-table scans. The processed ledger's composite
unique key is the sole source of idempotency; the JS fallback and the
recommended RPC both rely on `ON CONFLICT DO NOTHING` so parallel sweeps
of the same exam never double-count.

Bulk admin operations are validated at 500 items per call and executed
sequentially to keep audit output readable and avoid row-lock storms.
Reports and exports are capped at 10,000 rows per call.
