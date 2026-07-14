# Exam Batch — Backend Contract

This module implements the server-side layer for the Exam Batch feature.
It is intentionally **isolated** from Mock Test, Quiz, MCQ Practice, Daily
Progress, Notifications, Auth, and Academic Manager. It reuses only:

- Existing authenticated users (`auth.users`)
- Existing `levels`, `subjects`, `chapters` tables (read-only)

Everything else lives under the `exam_batch_*` namespace.

The TypeScript layer (`*.functions.ts`) is production-ready and type-safe.
It expects the following database contract to exist. SQL/migrations are
out-of-scope for this task and must be provisioned separately; the
functions surface a professional error if a required object is missing.

---

## Tables

### `public.exam_batch_sessions`

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | `gen_random_uuid()` |
| title | text | required |
| subtitle | text | nullable |
| level | text | FK -> `levels.code` |
| starts_at | timestamptz | required |
| registration_deadline | timestamptz | nullable |
| status | text | `active` \| `inactive` (default `active`) |
| registration_open | boolean | default `true` |
| is_archived | boolean | default `false` |
| is_hidden | boolean | default `false` |
| subjects_count | int | derived / cached, default 0 |
| created_by | uuid | FK -> `auth.users.id` |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()` |

### `public.exam_batch_enrollments`

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | `gen_random_uuid()` |
| session_id | uuid | FK -> `exam_batch_sessions.id` on delete cascade |
| user_id | uuid | FK -> `auth.users.id` |
| status | text | `pending` \| `approved` \| `rejected` (default `pending`) |
| student_id | int | **NULL until approved**; unique when non-null |
| reviewed_by | uuid | nullable |
| reviewed_at | timestamptz | nullable |
| notes | text | nullable |
| created_at | timestamptz | default `now()` |
| updated_at | timestamptz | default `now()` |

Constraints:

- `unique (session_id, user_id)` — prevents duplicate enrollment.
- `unique (student_id) where student_id is not null` — global uniqueness.
- `check (status in ('pending','approved','rejected'))`.

### `public.exam_batch_enrollment_subjects`

| column | type | notes |
| --- | --- | --- |
| enrollment_id | uuid | FK -> `exam_batch_enrollments.id` on delete cascade |
| subject_id | uuid | FK -> `subjects.id` |
| added_by | uuid | FK -> `auth.users.id` |
| added_at | timestamptz | default `now()` |

Primary key: `(enrollment_id, subject_id)`.

### `public.exam_batch_audit_log`

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | default `gen_random_uuid()` |
| actor_id | uuid | nullable (system events) |
| action | text | e.g. `enroll`, `approve`, `reject`, `subject.add`, `subject.remove`, `student_id.assign`, `session.create`, `session.update`, `session.archive`, `session.hide`, `session.set_active`, `session.set_registration` |
| entity | text | `session` \| `enrollment` \| `subject` \| `student_id` |
| entity_id | text | id of the entity (uuid or serial int as text) |
| metadata | jsonb | payload |
| created_at | timestamptz | default `now()` |

---

## Sequence

```sql
create sequence if not exists public.exam_batch_student_id_seq
  start with 1001 increment by 1 minvalue 1001 no cycle;
```

The sequence is the single source of Student IDs for the whole Exam Batch
system (NOT per-subject, NOT per-level). IDs are permanent — Student ID is
never regenerated, never reused, never reassigned on status/subject edits.

---

## Atomic Approval RPC (required)

Bulk approval MUST be atomic per row to satisfy: no duplicate IDs, no race
conditions, no skipped IDs, no double approval.

```sql
create or replace function public.exam_batch_approve_enrollments(
  _enrollment_ids uuid[],
  _reviewer uuid
) returns table (id uuid, student_id int)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.exam_batch_enrollments e
     set status      = 'approved',
         student_id  = coalesce(e.student_id, nextval('public.exam_batch_student_id_seq')::int),
         reviewed_by = _reviewer,
         reviewed_at = now(),
         updated_at  = now()
   where e.id = any(_enrollment_ids)
     and e.status = 'pending'
  returning e.id, e.student_id;
end
$$;
```

- `coalesce(..., nextval(...))` means an already-approved row keeps its ID
  (idempotent). Only rows in `pending` are touched (`where status = 'pending'`),
  eliminating double approval.
- `nextval` is transactional and lock-free — safe under concurrent bulk calls.

Corresponding RLS/GRANT (contract only):

```sql
grant execute on function public.exam_batch_approve_enrollments(uuid[], uuid) to authenticated;
```

The function is called only from server code after `assertPermission(...,
'manage_content')` passes.

---

## RLS Contract (summary)

- `exam_batch_sessions`: SELECT `TO authenticated` for non-hidden,
  non-archived rows; full CRUD via `has_permission(auth.uid(),
  'manage_content')` policy for admins.
- `exam_batch_enrollments`: SELECT own row `TO authenticated using (user_id
  = auth.uid())`; INSERT own row with `status='pending'` and
  `student_id is null`. Admins (via `has_permission`) can select/update/
  delete all rows.
- `exam_batch_enrollment_subjects`: SELECT via joined enrollment ownership;
  admin-only writes.
- `exam_batch_audit_log`: append-only; SELECT admin-only.

The TypeScript layer **also** enforces every rule server-side — RLS is
defence-in-depth, not the primary gate.
