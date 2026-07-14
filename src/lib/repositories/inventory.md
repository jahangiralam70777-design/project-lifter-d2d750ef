# Database Inventory (machine-checkable)

> Generated from the audit pass on 2026-06-12. Update whenever you add a
> new `.from(...)`, `.rpc(...)` or `storage.from(...)` call.

## Tables in active use (51)

`activity_events`, `admin_action_log`, `admin_notes`, `attempt_answers`,
`blog_categories`, `blog_post_tags`, `blog_posts`, `blog_tags`,
`blog_views`, `chapters`, `content_versions`, `editor_actions_log`,
`editor_pages`, `editor_published_pages`, `editor_snapshots`,
`exam_attempts`, `flash_card_visibility`, `flash_cards`,
`homepage_sections`, `levels`, `mcq_bookmarks`, `mcq_delete_audit`,
`mcq_wrong_questions`, `mcqs`, `media_assets`, `module_visibility`,
`notification_reads`, `notifications`, `profiles`,
`question_bank_resources`, `question_bank_visibility`, `quiz_questions`,
`quizzes`, `role_permissions`, `short_notes`, `short_notes_visibility`,
`site_page_sections`, `site_pages`, `site_settings`, `study_sessions`,
`subjects`, `system_error_logs`, `user_bans`, `user_goals`,
`user_login_events`, `user_messages`, `user_roles`, `user_sessions`,
`user_tags`, `video_class_visibility`, `video_classes`.

## RPCs (25)

`admin_activity_overview`, `admin_activity_timeseries`,
`admin_get_db_size`, `admin_get_table_sizes`, `admin_global_search`,
`admin_hard_delete_user`, `admin_list_public_tables`,
`admin_log_system_error`, `admin_restore_user`, `admin_run_select_query`,
`admin_soft_delete_user`, `admin_table_metadata`, `admin_top_buttons`,
`admin_top_modules`, `admin_top_pages`, `admin_top_users`,
`admin_user_activity`, `admin_user_analytics`, `blog_increment_view`,
`claim_user_session`, `editor_publish_page`, `has_permission`,
`has_role`, `is_admin`, `is_user_banned`, `record_admin_action`.

## Storage buckets (3)

- `avatars` — per-user upload, public read of own avatar
- `question-bank` — admin upload, authenticated read
- `short-notes` — admin upload, authenticated read

## Hot paths (smoke test after DB connect)

| Route | Touches |
|---|---|
| `/` | (none — static landing) |
| `/blog` | `blog_posts`, `blog_categories`, `blog_tags` |
| `/blog/$slug` | `blog_posts`, `blog_views` + RPC `blog_increment_view` |
| `/login`, `/signup` | `supabase.auth.*` |
| `/dashboard` | `study_sessions`, `exam_attempts`, `user_goals`, `activity_events` |
| `/mcq-practice` | `mcqs`, `mcq_bookmarks`, `mcq_wrong_questions`, `module_visibility` |
| `/admin` | `admin_top_users`, `admin_top_modules`, `admin_activity_overview`, `admin_activity_timeseries` |
| `/admin/users` | `profiles`, `user_roles`, `user_bans`, `user_sessions` + admin_*_user RPCs |
| `/admin/database` | `admin_list_public_tables`, `admin_table_metadata`, `admin_run_select_query` |
| `/admin/site` | `site_pages`, `site_page_sections`, `homepage_sections`, `site_settings` |
| `/admin/site-editor` | `editor_pages`, `editor_published_pages`, `editor_snapshots` + RPC `editor_publish_page` |

## Tables NOT referenced from client code

These appear in migrations but no `.from(...)` call in `src/` hits them.
They may be (a) accessed only via RPC, or (b) dead. Audit before
relying on them:

- `user_messages`
- `user_tags`
- `media_assets`
- `content_versions`

## Migration checklist (when prod Supabase is connected)

- [ ] Apply all 64 migrations from `/supabase/migrations/`
- [ ] Verify every table above exists with matching columns
- [ ] Verify every RPC above exists with matching signature
- [ ] Verify every storage bucket exists with the documented RLS
- [ ] Smoke test each "Hot paths" route
- [ ] Confirm `admin_run_select_query` is SELECT-only + statement_timeout
- [ ] Confirm `user_roles` has RLS preventing self-INSERT (privilege escalation)
- [ ] Confirm storage RLS on `avatars` is per-user
