// Exam Batch — Settings, Content, Visibility, Comment Rules, Export DB contract
//
// This file documents the tables / RPCs the Exam Batch module reads and writes
// for the FINAL backend phase. **Do not create migrations from Lovable — the
// database team owns the schema.** These names are the contract; the server
// functions in this folder call them exactly as documented below.
//
// Every table listed here is namespaced with `exam_batch_` and is isolated
// from Mock Test / Quiz / MCQ Practice / Academic Manager / Daily Progress.
//
// ---------------------------------------------------------------------------
// 1) `exam_batch_settings` — singleton row (id = 'singleton') that stores the
//    full, dynamic module configuration as a JSONB `value` column plus
//    `updated_at`, `updated_by`. Server functions read/write JSONB; there is
//    no per-key schema so admins can add new sub-fields without migrations.
//
//    Columns (recommended):
//      id            text  primary key  default 'singleton'   -- always one row
//      value         jsonb not null     default '{}'::jsonb
//      updated_at    timestamptz        default now()
//      updated_by    uuid  references auth.users(id)
//
//    Grants:
//      grant select, insert, update on public.exam_batch_settings to authenticated;
//      grant all on public.exam_batch_settings to service_role;
//
//    RLS:
//      - anon: no access.
//      - authenticated: SELECT allowed for all (needed to serve public content);
//        INSERT/UPDATE restricted to admins with `has_permission(auth.uid(),
//        'manage_content')`.
//
// 2) `exam_batch_comment_rules` — admin-managed percentage bands used to
//    generate export comments.
//      id           uuid   primary key default gen_random_uuid()
//      min_percent  numeric(5,2) not null check (min_percent between 0 and 100)
//      max_percent  numeric(5,2) not null check (max_percent between 0 and 100 and max_percent >= min_percent)
//      label        text   not null
//      message      text   not null
//      sort_order   int    not null default 0
//      created_at   timestamptz default now()
//      updated_at   timestamptz default now()
//
//    Grants:
//      grant select on public.exam_batch_comment_rules to authenticated;
//      grant all on public.exam_batch_comment_rules to service_role;
//
//    RLS:
//      - SELECT for authenticated.
//      - INSERT/UPDATE/DELETE restricted to `manage_content`.
//
// 3) `exam_batch_download_history` — audit trail for every export.
//      id            uuid  primary key default gen_random_uuid()
//      actor_id      uuid  references auth.users(id)
//      export_type   text  not null    -- 'leaderboard'
//      format        text  not null    -- 'pdf' | 'txt'
//      exam_id       uuid  null
//      session_id    uuid  null
//      subject_id    uuid  null
//      filters       jsonb null
//      row_count     int   null
//      byte_length   int   null
//      created_at    timestamptz default now()
//
//    Grants:
//      grant select, insert on public.exam_batch_download_history to authenticated;
//      grant all on public.exam_batch_download_history to service_role;
//
//    RLS:
//      - INSERT allowed to `manage_content`.
//      - SELECT allowed to `manage_content`.
//
// ---------------------------------------------------------------------------
// Module visibility contract
// ---------------------------------------------------------------------------
// The single source of truth for whether the module is available to students
// is `exam_batch_settings.value -> 'visibility' -> 'moduleVisible'`. When the
// admin flips this to `false`:
//   - the public settings endpoint returns `moduleVisible: false` so the
//     student navigation removes the entry immediately (no restart required);
//   - every student-facing server function should short-circuit with
//     `ExamBatchError('FORBIDDEN', ...)` if visibility is off — the export /
//     admin surfaces stay reachable so operators can continue to work.
//
// ---------------------------------------------------------------------------
// Export contract
// ---------------------------------------------------------------------------
// - Exports are **always** served from `exam_batch_leaderboards` +
//   `exam_batch_leaderboard_entries` (the frozen tables written by the Result
//   Engine). Never read live attempts.
// - Rows are paginated in chunks (default 500) to avoid loading 10k+ rows in
//   memory. PDF is built page-by-page with pdf-lib; TXT is streamed as a
//   single Uint8Array assembled from chunk buffers.
// - Every export writes a row into `exam_batch_download_history` before
//   returning the artifact.
