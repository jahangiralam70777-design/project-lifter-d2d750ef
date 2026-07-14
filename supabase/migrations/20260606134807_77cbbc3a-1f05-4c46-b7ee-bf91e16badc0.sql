do $$ begin
  create type public.content_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.difficulty_level as enum ('easy','medium','hard');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mcq_option as enum ('A','B','C','D');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text, avatar_url text, bio text, level text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_profiles before update on public.profiles for each row execute function public.set_updated_at();
grant select on public.profiles to anon;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_insert_own" on public.profiles for insert with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles for update using (id = auth.uid());

create table if not exists public.avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null, public_url text,
  created_at timestamptz not null default now()
);
grant select, insert, delete on public.avatars to authenticated;
grant all on public.avatars to service_role;
alter table public.avatars enable row level security;
create policy "avatars_own" on public.avatars for all using (user_id = auth.uid());

create table if not exists public.levels (
  code text primary key, name text not null, description text, color text, icon text,
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_levels before update on public.levels for each row execute function public.set_updated_at();
grant select on public.levels to anon, authenticated;
grant all on public.levels to service_role;
alter table public.levels enable row level security;
create policy "levels_select" on public.levels for select using (true);
create policy "levels_write_admin" on public.levels for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null, slug text not null unique,
  level text not null references public.levels(code) on delete restrict,
  description text, color text, icon text,
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_subjects before update on public.subjects for each row execute function public.set_updated_at();
grant select on public.subjects to anon, authenticated;
grant all on public.subjects to service_role;
alter table public.subjects enable row level security;
create policy "subjects_select" on public.subjects for select using (true);
create policy "subjects_write_admin" on public.subjects for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null, slug text not null, description text,
  sort_order integer not null default 0,
  status public.content_status not null default 'published',
  updated_at timestamptz not null default now(),
  unique (subject_id, slug)
);
create trigger set_updated_at_chapters before update on public.chapters for each row execute function public.set_updated_at();
grant select on public.chapters to anon, authenticated;
grant all on public.chapters to service_role;
alter table public.chapters enable row level security;
create policy "chapters_select" on public.chapters for select using (true);
create policy "chapters_write_admin" on public.chapters for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.mcqs (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  question text not null,
  option_a text not null, option_b text not null, option_c text not null, option_d text not null,
  correct_option public.mcq_option not null, explanation text,
  difficulty public.difficulty_level not null default 'medium',
  status public.content_status not null default 'published',
  tags text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mcqs_chapter_id_idx on public.mcqs (chapter_id);
create index if not exists mcqs_status_idx on public.mcqs (status);
create trigger set_updated_at_mcqs before update on public.mcqs for each row execute function public.set_updated_at();
grant select on public.mcqs to authenticated;
grant all on public.mcqs to service_role;
alter table public.mcqs enable row level security;
create policy "mcqs_select_published" on public.mcqs for select using (status = 'published' or public.has_role(auth.uid(), 'admin'));
create policy "mcqs_write_admin" on public.mcqs for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.mcq_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  mcq_id uuid not null references public.mcqs(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  level text, created_at timestamptz not null default now(),
  primary key (user_id, mcq_id)
);
grant select, insert, delete on public.mcq_bookmarks to authenticated;
grant all on public.mcq_bookmarks to service_role;
alter table public.mcq_bookmarks enable row level security;
create policy "mcq_bookmarks_own" on public.mcq_bookmarks for all using (user_id = auth.uid());

create table if not exists public.mcq_wrong_questions (
  user_id uuid not null references auth.users(id) on delete cascade,
  mcq_id uuid not null references public.mcqs(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  level text,
  last_chosen_option public.mcq_option, correct_option public.mcq_option,
  retry_count integer not null default 0,
  mastered boolean not null default false,
  last_wrong_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, mcq_id)
);
grant select, insert, update, delete on public.mcq_wrong_questions to authenticated;
grant all on public.mcq_wrong_questions to service_role;
alter table public.mcq_wrong_questions enable row level security;
create policy "mcq_wrong_questions_own" on public.mcq_wrong_questions for all using (user_id = auth.uid());

create table if not exists public.mcq_delete_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  admin_name text, deleted_count integer not null default 0,
  scope text not null default 'selected',
  level text, subject_id uuid, chapter_id uuid,
  mcq_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);
grant select, insert on public.mcq_delete_audit to authenticated;
grant all on public.mcq_delete_audit to service_role;
alter table public.mcq_delete_audit enable row level security;
create policy "mcq_delete_audit_admin" on public.mcq_delete_audit for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, level text not null,
  subject_id uuid references public.subjects(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  kind text not null default 'quiz' check (kind in ('quiz','mock')),
  status public.content_status not null default 'draft',
  difficulty public.difficulty_level not null default 'medium',
  total_questions integer not null default 10,
  duration_seconds integer not null default 900,
  starts_at timestamptz, ends_at timestamptz,
  is_public boolean not null default true,
  randomize_options boolean not null default false,
  randomize_questions boolean not null default true,
  passing_marks integer not null default 0,
  negative_marking numeric(4,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_quizzes before update on public.quizzes for each row execute function public.set_updated_at();
grant select on public.quizzes to authenticated;
grant all on public.quizzes to service_role;
alter table public.quizzes enable row level security;
create policy "quizzes_select" on public.quizzes for select using (is_public = true or public.has_role(auth.uid(), 'admin'));
create policy "quizzes_write_admin" on public.quizzes for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  mcq_id uuid not null references public.mcqs(id) on delete cascade,
  position integer not null default 0,
  unique (quiz_id, mcq_id)
);
create index if not exists quiz_questions_quiz_id_idx on public.quiz_questions (quiz_id);
grant select on public.quiz_questions to authenticated;
grant all on public.quiz_questions to service_role;
alter table public.quiz_questions enable row level security;
create policy "quiz_questions_select" on public.quiz_questions for select using (true);
create policy "quiz_questions_write_admin" on public.quiz_questions for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  level text, mcq_ids uuid[] not null default '{}',
  status text not null default 'pending_review' check (status in ('pending_review','ready','in_progress','submitted','expired','rejected')),
  duration_seconds integer not null default 600,
  question_count integer not null default 0,
  started_at timestamptz, submitted_at timestamptz,
  answers jsonb not null default '{}',
  score integer, correct_count integer, wrong_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_quiz_sessions before update on public.quiz_sessions for each row execute function public.set_updated_at();
grant select, insert, update on public.quiz_sessions to authenticated;
grant all on public.quiz_sessions to service_role;
alter table public.quiz_sessions enable row level security;
create policy "quiz_sessions_own" on public.quiz_sessions for all using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quiz_id uuid references public.quizzes(id) on delete set null,
  subject_id uuid references public.subjects(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  level text,
  kind text not null check (kind in ('mcq_practice','quiz','mock','custom_exam')),
  title text, attempt_number integer not null default 1,
  status text not null default 'completed' check (status in ('in_progress','completed','abandoned')),
  started_at timestamptz not null default now(), completed_at timestamptz,
  duration_seconds integer not null default 0,
  correct_count integer not null default 0,
  total_count integer not null default 0,
  score integer not null default 0,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists exam_attempts_user_id_idx on public.exam_attempts (user_id);
create index if not exists exam_attempts_created_at_idx on public.exam_attempts (created_at);
grant select, insert on public.exam_attempts to authenticated;
grant all on public.exam_attempts to service_role;
alter table public.exam_attempts enable row level security;
create policy "exam_attempts_own_select" on public.exam_attempts for select using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));
create policy "exam_attempts_own_insert" on public.exam_attempts for insert with check (user_id = auth.uid());

create table if not exists public.attempt_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.exam_attempts(id) on delete cascade,
  mcq_id uuid not null references public.mcqs(id) on delete cascade,
  chosen_option public.mcq_option,
  is_correct boolean not null default false,
  time_spent_ms integer not null default 0
);
create index if not exists attempt_answers_attempt_id_idx on public.attempt_answers (attempt_id);
grant select, insert on public.attempt_answers to authenticated;
grant all on public.attempt_answers to service_role;
alter table public.attempt_answers enable row level security;
create policy "attempt_answers_own" on public.attempt_answers for select using (
  exists (select 1 from public.exam_attempts a where a.id = attempt_id and (a.user_id = auth.uid() or public.has_role(auth.uid(), 'admin')))
);
create policy "attempt_answers_insert_own" on public.attempt_answers for insert with check (
  exists (select 1 from public.exam_attempts a where a.id = attempt_id and a.user_id = auth.uid())
);

create table if not exists public.flash_cards (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid references public.subjects(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  level text not null default 'professional',
  front text not null, back text not null, formula text, image_url text,
  card_type text not null default 'concept' check (card_type in ('concept','formula','diagram','timeline','definition','other')),
  tags text[] not null default '{}',
  status public.content_status not null default 'draft',
  is_hidden boolean not null default false,
  scheduled_at timestamptz, view_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_flash_cards before update on public.flash_cards for each row execute function public.set_updated_at();
grant select on public.flash_cards to authenticated;
grant all on public.flash_cards to service_role;
alter table public.flash_cards enable row level security;
create policy "flash_cards_select" on public.flash_cards for select using ((status = 'published' and is_hidden = false) or public.has_role(auth.uid(), 'admin'));
create policy "flash_cards_write_admin" on public.flash_cards for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.flash_card_visibility (
  id integer primary key default 1,
  section_hidden boolean not null default false,
  hidden_levels text[] not null default '{}',
  hidden_subject_ids uuid[] not null default '{}',
  hidden_chapter_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint flash_card_visibility_singleton check (id = 1)
);
create trigger set_updated_at_flash_card_visibility before update on public.flash_card_visibility for each row execute function public.set_updated_at();
insert into public.flash_card_visibility (id) values (1) on conflict do nothing;
grant select on public.flash_card_visibility to anon, authenticated;
grant all on public.flash_card_visibility to service_role;
alter table public.flash_card_visibility enable row level security;
create policy "flash_card_visibility_select" on public.flash_card_visibility for select using (true);
create policy "flash_card_visibility_write_admin" on public.flash_card_visibility for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.short_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null, summary text, level text not null default 'professional',
  subject_id uuid references public.subjects(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  kind text not null default 'text' check (kind in ('text','pdf','doc')),
  body text, file_url text, file_name text, file_size_bytes bigint,
  tags text[] not null default '{}',
  status public.content_status not null default 'draft',
  is_hidden boolean not null default false,
  scheduled_at timestamptz,
  view_count integer not null default 0,
  download_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_short_notes before update on public.short_notes for each row execute function public.set_updated_at();
grant select on public.short_notes to authenticated;
grant all on public.short_notes to service_role;
alter table public.short_notes enable row level security;
create policy "short_notes_select" on public.short_notes for select using ((status = 'published' and is_hidden = false) or public.has_role(auth.uid(), 'admin'));
create policy "short_notes_write_admin" on public.short_notes for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.short_notes_visibility (
  id integer primary key default 1,
  section_hidden boolean not null default false,
  hidden_levels text[] not null default '{}',
  hidden_subject_ids uuid[] not null default '{}',
  hidden_chapter_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint short_notes_visibility_singleton check (id = 1)
);
create trigger set_updated_at_short_notes_visibility before update on public.short_notes_visibility for each row execute function public.set_updated_at();
insert into public.short_notes_visibility (id) values (1) on conflict do nothing;
grant select on public.short_notes_visibility to anon, authenticated;
grant all on public.short_notes_visibility to service_role;
alter table public.short_notes_visibility enable row level security;
create policy "short_notes_visibility_select" on public.short_notes_visibility for select using (true);
create policy "short_notes_visibility_write_admin" on public.short_notes_visibility for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.question_bank_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null, summary text, level text not null default 'professional',
  subject_id uuid references public.subjects(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  kind text not null default 'text' check (kind in ('text','pdf','doc')),
  resource_type text not null default 'important' check (resource_type in ('important','pyq','model','notes','text')),
  body text, file_url text, file_name text, file_size_bytes bigint,
  question_count integer not null default 0,
  tags text[] not null default '{}',
  status public.content_status not null default 'draft',
  is_hidden boolean not null default false,
  scheduled_at timestamptz,
  view_count integer not null default 0,
  download_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_question_bank_resources before update on public.question_bank_resources for each row execute function public.set_updated_at();
grant select on public.question_bank_resources to authenticated;
grant all on public.question_bank_resources to service_role;
alter table public.question_bank_resources enable row level security;
create policy "question_bank_resources_select" on public.question_bank_resources for select using ((status = 'published' and is_hidden = false) or public.has_role(auth.uid(), 'admin'));
create policy "question_bank_resources_write_admin" on public.question_bank_resources for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.question_bank_visibility (
  id integer primary key default 1,
  section_hidden boolean not null default false,
  hidden_levels text[] not null default '{}',
  hidden_subject_ids uuid[] not null default '{}',
  hidden_chapter_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint question_bank_visibility_singleton check (id = 1)
);
create trigger set_updated_at_question_bank_visibility before update on public.question_bank_visibility for each row execute function public.set_updated_at();
insert into public.question_bank_visibility (id) values (1) on conflict do nothing;
grant select on public.question_bank_visibility to anon, authenticated;
grant all on public.question_bank_visibility to service_role;
alter table public.question_bank_visibility enable row level security;
create policy "question_bank_visibility_select" on public.question_bank_visibility for select using (true);
create policy "question_bank_visibility_write_admin" on public.question_bank_visibility for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.video_classes (
  id uuid primary key default gen_random_uuid(),
  title text not null, description text, level text not null default 'professional',
  subject_id uuid references public.subjects(id) on delete set null,
  chapter_id uuid references public.chapters(id) on delete set null,
  instructor text,
  kind text not null default 'youtube' check (kind in ('youtube','playlist','upload')),
  youtube_url text, youtube_video_id text, youtube_playlist_id text,
  thumbnail_url text, duration_seconds integer not null default 0,
  playlist_key text, position integer not null default 0,
  tags text[] not null default '{}',
  status public.content_status not null default 'draft',
  is_hidden boolean not null default false,
  is_featured boolean not null default false,
  scheduled_at timestamptz,
  view_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_video_classes before update on public.video_classes for each row execute function public.set_updated_at();
grant select on public.video_classes to authenticated;
grant all on public.video_classes to service_role;
alter table public.video_classes enable row level security;
create policy "video_classes_select" on public.video_classes for select using ((status = 'published' and is_hidden = false) or public.has_role(auth.uid(), 'admin'));
create policy "video_classes_write_admin" on public.video_classes for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.video_class_visibility (
  id integer primary key default 1,
  section_hidden boolean not null default false,
  hidden_levels text[] not null default '{}',
  hidden_subject_ids uuid[] not null default '{}',
  hidden_chapter_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  constraint video_class_visibility_singleton check (id = 1)
);
create trigger set_updated_at_video_class_visibility before update on public.video_class_visibility for each row execute function public.set_updated_at();
insert into public.video_class_visibility (id) values (1) on conflict do nothing;
grant select on public.video_class_visibility to anon, authenticated;
grant all on public.video_class_visibility to service_role;
alter table public.video_class_visibility enable row level security;
create policy "video_class_visibility_select" on public.video_class_visibility for select using (true);
create policy "video_class_visibility_write_admin" on public.video_class_visibility for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null default '', link text,
  type text not null default 'in_app' check (type in ('announcement','push','email','in_app')),
  priority text not null default 'medium' check (priority in ('low','medium','high','critical')),
  audience text not null default 'all' check (audience in ('all','level','subject','role','users')),
  audience_level text, audience_subject_id uuid,
  audience_role text check (audience_role in ('admin','moderator','student')),
  audience_user_ids uuid[] not null default '{}',
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','sent','failed','paused')),
  sent_at timestamptz, delivered_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger set_updated_at_notifications before update on public.notifications for each row execute function public.set_updated_at();
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "notifications_select_sent" on public.notifications for select using (status = 'sent' or public.has_role(auth.uid(), 'admin'));
create policy "notifications_write_admin" on public.notifications for all using (public.has_role(auth.uid(), 'admin'));

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
grant select, insert on public.notification_reads to authenticated;
grant all on public.notification_reads to service_role;
alter table public.notification_reads enable row level security;
create policy "notification_reads_own" on public.notification_reads for all using (user_id = auth.uid());