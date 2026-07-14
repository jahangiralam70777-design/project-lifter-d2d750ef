// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitKey,
} from "@/integrations/security/rate-limit";

function normalizeChoice(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized === "A" || normalized === "B" || normalized === "C" || normalized === "D"
    ? normalized
    : null;
}

// ---- Levels (dynamic, admin-managed) ----
export const listLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("levels")
      .select("code,name,description,color,icon,sort_order,status")
      .in("status", ["published", "archived"])
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((l) => ({
      code: l.code,
      name: l.name,
      description: l.description,
      color: l.color,
      icon: l.icon,
      sort_order: l.sort_order,
      is_locked: l.status === "archived",
    }));
  });

// ---- Subjects ----
const subjectsSchema = z.object({ level: z.string().trim().min(1).max(40).optional() }).partial();

export const listSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof subjectsSchema> | undefined) => subjectsSchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("subjects")
      .select("id,name,slug,description,icon,color,sort_order,level")
      .eq("status", "published")
      .order("sort_order", { ascending: true });
    if (data?.level) q = q.ilike("level", data.level);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ---- Progress: subjects in a level ----
const subjectProgressSchema = z
  .object({ level: z.string().trim().min(1).max(40).optional() })
  .partial();

const PAGE_SIZE = 1000;

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function fetchPublishedMcqRefs(
  supabase: any,
  chapterIds: string[],
): Promise<Array<{ id: string; chapter_id: string }>> {
  const rows: Array<{ id: string; chapter_id: string }> = [];
  for (const chapterChunk of chunkArray(chapterIds, 200)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("mcqs")
        .select("id,chapter_id")
        .in("chapter_id", chapterChunk)
        .eq("status", "published")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as Array<{ id: string; chapter_id: string }>));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

async function fetchPublishedSubjectIds(supabase: any, level?: string | null): Promise<string[]> {
  const rows: Array<{ id: string }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let q = supabase
      .from("subjects")
      .select("id")
      .eq("status", "published")
      .range(from, from + PAGE_SIZE - 1);
    if (level) q = q.ilike("level", level);
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ id: string }>));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows.map((s) => s.id);
}

async function fetchPublishedChapterRefs(
  supabase: any,
  subjectIds: string[],
): Promise<Array<{ id: string; subject_id: string }>> {
  const rows: Array<{ id: string; subject_id: string }> = [];
  for (const subjectChunk of chunkArray(subjectIds, 200)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("chapters")
        .select("id,subject_id")
        .in("subject_id", subjectChunk)
        .eq("status", "published")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...((data ?? []) as Array<{ id: string; subject_id: string }>));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

type PracticeProgressRow = {
  mcq_id: string;
  chapter_id: string;
  subject_id: string;
  chosen_option: "A" | "B" | "C" | "D";
  is_correct: boolean;
};

const PRACTICE_PROGRESS_SQL = `
CREATE TABLE IF NOT EXISTS public.mcq_practice_progress (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mcq_id uuid NOT NULL REFERENCES public.mcqs(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  level text,
  chosen_option public.mcq_option NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  time_spent_ms integer NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mcq_id)
);
GRANT SELECT, INSERT, UPDATE ON public.mcq_practice_progress TO authenticated;
GRANT ALL ON public.mcq_practice_progress TO service_role;
ALTER TABLE public.mcq_practice_progress ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mcq_practice_progress' AND policyname = 'mcq_practice_progress_own_select') THEN
    CREATE POLICY "mcq_practice_progress_own_select" ON public.mcq_practice_progress FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mcq_practice_progress' AND policyname = 'mcq_practice_progress_own_insert') THEN
    CREATE POLICY "mcq_practice_progress_own_insert" ON public.mcq_practice_progress FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'mcq_practice_progress' AND policyname = 'mcq_practice_progress_own_update') THEN
    CREATE POLICY "mcq_practice_progress_own_update" ON public.mcq_practice_progress FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS mcq_practice_progress_user_subject_idx ON public.mcq_practice_progress (user_id, subject_id);
CREATE INDEX IF NOT EXISTS mcq_practice_progress_user_chapter_idx ON public.mcq_practice_progress (user_id, chapter_id);
CREATE INDEX IF NOT EXISTS mcq_practice_progress_updated_at_idx ON public.mcq_practice_progress (updated_at DESC);
INSERT INTO public.mcq_practice_progress (user_id, mcq_id, chapter_id, subject_id, level, chosen_option, is_correct, time_spent_ms, answered_at, updated_at)
SELECT DISTINCT ON (ea.user_id, aa.mcq_id)
  ea.user_id, aa.mcq_id, m.chapter_id, c.subject_id, s.level, aa.chosen_option, aa.is_correct, aa.time_spent_ms,
  COALESCE(ea.completed_at, ea.created_at, now()), COALESCE(ea.completed_at, ea.created_at, now())
FROM public.attempt_answers aa
JOIN public.exam_attempts ea ON ea.id = aa.attempt_id
JOIN public.mcqs m ON m.id = aa.mcq_id
JOIN public.chapters c ON c.id = m.chapter_id
JOIN public.subjects s ON s.id = c.subject_id
WHERE ea.kind = 'mcq_practice'
  AND ea.status = 'completed'
  AND aa.chosen_option IS NOT NULL
  AND m.status = 'published'
  AND c.status = 'published'
  AND s.status = 'published'
ORDER BY ea.user_id, aa.mcq_id, COALESCE(ea.completed_at, ea.created_at, now()) DESC
ON CONFLICT (user_id, mcq_id) DO UPDATE SET
  chapter_id = EXCLUDED.chapter_id,
  subject_id = EXCLUDED.subject_id,
  level = EXCLUDED.level,
  chosen_option = EXCLUDED.chosen_option,
  is_correct = EXCLUDED.is_correct,
  time_spent_ms = EXCLUDED.time_spent_ms,
  answered_at = EXCLUDED.answered_at,
  updated_at = EXCLUDED.updated_at;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mcq_practice_progress;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
    WHEN insufficient_privilege THEN NULL;
  END;
END $$;
`;

let ensuredPracticeProgress = false;

function isMissingPracticeProgressTable(error: unknown) {
  const e = error as { code?: string; message?: string } | null | undefined;
  return e?.code === "42P01" || /mcq_practice_progress|relation .* does not exist/i.test(e?.message ?? "");
}

async function ensurePracticeProgressTable() {
  if (ensuredPracticeProgress) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("_tmp_exec_sql", { sql: PRACTICE_PROGRESS_SQL });
  if (error) throw error;
  ensuredPracticeProgress = true;
}

async function fetchPracticeProgressByField(
  supabase: any,
  userId: string,
  field: "subject_id" | "chapter_id",
  ids: string[],
): Promise<PracticeProgressRow[]> {
  const rows: PracticeProgressRow[] = [];
  for (const idChunk of chunkArray(ids, 200)) {
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("mcq_practice_progress")
        .select("mcq_id,chapter_id,subject_id,chosen_option,is_correct")
        .eq("user_id", userId)
        .in(field, idChunk)
        .range(from, from + PAGE_SIZE - 1);
      if (error) {
        if (isMissingPracticeProgressTable(error)) {
          await ensurePracticeProgressTable();
          return fetchPracticeProgressByField(supabase, userId, field, ids);
        }
        throw error;
      }
      rows.push(...((data ?? []) as PracticeProgressRow[]));
      if (!data || data.length < PAGE_SIZE) break;
    }
  }
  return rows;
}

export const listSubjectProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof subjectProgressSchema> | undefined) =>
    subjectProgressSchema.parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;
    // 1. Subjects in scope
    const subjectIds = await fetchPublishedSubjectIds(supabase, data?.level ?? null);
    if (!subjectIds.length)
      return [] as Array<{ subject_id: string; total: number; completed: number; percent: number }>;
    // 2. Chapters under those subjects
    const chapters = await fetchPublishedChapterRefs(supabase, subjectIds);
    const chapterToSubject = new Map<string, string>();
    chapters.forEach((c) => chapterToSubject.set(c.id, c.subject_id));
    const chapterIds = Array.from(chapterToSubject.keys());
    if (!chapterIds.length) {
      return subjectIds.map((id) => ({ subject_id: id, total: 0, completed: 0, percent: 0 }));
    }
    // 3. Total published MCQs per subject (via every published chapter).
    // Use paginated reads so totals are not capped by PostgREST's default page size.
    const mcqs = await fetchPublishedMcqRefs(supabase, chapterIds);
    const totalsBySubject = new Map<string, number>();
    const mcqToSubject = new Map<string, string>();
    for (const m of mcqs) {
      if (!m.chapter_id) continue;
      const sId = chapterToSubject.get(m.chapter_id);
      if (!sId) continue;
      mcqToSubject.set(m.id, sId);
      totalsBySubject.set(sId, (totalsBySubject.get(sId) ?? 0) + 1);
    }
    // 4. Distinct MCQs the user solved in MCQ Practice only.
    // Do not mix Quiz/Mock/Custom Exam attempt_answers into practice progress.
    const completedBySubject = new Map<string, Set<string>>();
    const progressRows = await fetchPracticeProgressByField(supabase, userId, "subject_id", subjectIds);
    for (const r of progressRows) {
      const sId = mcqToSubject.get(r.mcq_id);
      if (!sId) continue;
      if (!completedBySubject.has(sId)) completedBySubject.set(sId, new Set());
      completedBySubject.get(sId)!.add(r.mcq_id);
    }
    return subjectIds.map((id) => {
      const total = totalsBySubject.get(id) ?? 0;
      const completed = completedBySubject.get(id)?.size ?? 0;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      return { subject_id: id, total, completed, percent };
    });
  });

// ---- Progress: chapters in a subject ----
const chapterProgressSchema = z.object({ subjectId: z.string().uuid() });
const chapterPracticeAnswersSchema = z.object({ chapterId: z.string().uuid() });

export const listChapterProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof chapterProgressSchema>) => chapterProgressSchema.parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;
    const chapters = await fetchPublishedChapterRefs(supabase, [data.subjectId]);
    const chapterIds = chapters.map((c) => c.id);
    if (!chapterIds.length)
      return [] as Array<{
        chapter_id: string;
        total: number;
        completed: number;
        percent: number;
        correct: number;
        accuracy: number;
      }>;
    const mcqs = await fetchPublishedMcqRefs(supabase, chapterIds);
    const totalsByChapter = new Map<string, number>();
    const mcqToChapter = new Map<string, string>();
    for (const m of mcqs) {
      if (!m.chapter_id) continue;
      mcqToChapter.set(m.id, m.chapter_id);
      totalsByChapter.set(m.chapter_id, (totalsByChapter.get(m.chapter_id) ?? 0) + 1);
    }
    const completedByChapter = new Map<string, Set<string>>();
    const correctByChapter = new Map<string, Set<string>>();
    const progressRows = await fetchPracticeProgressByField(supabase, userId, "chapter_id", chapterIds);
    for (const r of progressRows) {
      const cId = mcqToChapter.get(r.mcq_id);
      if (!cId) continue;
      if (!completedByChapter.has(cId)) completedByChapter.set(cId, new Set());
      completedByChapter.get(cId)!.add(r.mcq_id);
      if (r.is_correct) {
        if (!correctByChapter.has(cId)) correctByChapter.set(cId, new Set());
        correctByChapter.get(cId)!.add(r.mcq_id);
      }
    }
    return chapterIds.map((id) => {
      const total = totalsByChapter.get(id) ?? 0;
      const completed = completedByChapter.get(id)?.size ?? 0;
      const correct = correctByChapter.get(id)?.size ?? 0;
      const percent = total ? Math.round((completed / total) * 100) : 0;
      const accuracy = completed ? Math.round((correct / completed) * 100) : 0;
      return { chapter_id: id, total, completed, percent, correct, accuracy };
    });
  });

export const listChapterPracticeAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof chapterPracticeAnswersSchema>) =>
    chapterPracticeAnswersSchema.parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const rows: Array<{
      mcq_id: string;
      chosen_option: string | null;
      time_spent_ms: number | null;
    }> = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error } = await supabase
        .from("mcq_practice_progress")
        .select("mcq_id,chosen_option,time_spent_ms")
        .eq("user_id", userId)
        .eq("chapter_id", data.chapterId)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        if (isMissingPracticeProgressTable(error)) {
          await ensurePracticeProgressTable();
          rows.length = 0;
          from = -PAGE_SIZE;
          continue;
        }
        throw error;
      }

      rows.push(...((page ?? []) as typeof rows));
      if (!page || page.length < PAGE_SIZE) break;
    }

    return rows
      .map((r) => ({
        mcq_id: r.mcq_id,
        chosen_option: normalizeChoice(r.chosen_option),
        time_spent_ms: Math.max(0, Math.min(r.time_spent_ms ?? 0, 60 * 60 * 1000)),
      }))
      .filter((r): r is { mcq_id: string; chosen_option: "A" | "B" | "C" | "D"; time_spent_ms: number } =>
        !!r.chosen_option,
      );
  });

const practiceProgressSchema = z.object({
  level: z.string().trim().max(40).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  chapterId: z.string().uuid().nullable().optional(),
  answers: z
    .array(
      z.object({
        mcqId: z.string().uuid(),
        chosen: z.enum(["A", "B", "C", "D"]).nullable(),
        timeMs: z
          .number()
          .int()
          .min(0)
          .max(60 * 60 * 1000),
      }),
    )
    .max(500),
});

export const recordMcqPracticeProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof practiceProgressSchema>) =>
    practiceProgressSchema.parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const answered = data.answers.filter((a) => a.chosen !== null);
    if (!answered.length)
      return {
        recorded: 0,
        reveals: [] as Array<{ id: string; correct_option: string; explanation: string | null }>,
      };

    const ids = Array.from(new Set(answered.map((a) => a.mcqId)));
    const { data: mcqRows, error: mcqError } = await supabase
      .from("mcqs")
      .select("id,chapter_id,correct_option,explanation,status")
      .in("id", ids)
      .eq("status", "published");
    if (mcqError) throw mcqError;

    const chapterIds = Array.from(
      new Set(((mcqRows ?? []) as Array<{ chapter_id: string }>).map((m) => m.chapter_id)),
    );
    const { data: chapterRows, error: chapterError } = chapterIds.length
      ? await supabase
          .from("chapters")
          .select("id,subject_id,subjects!inner(level)")
          .in("id", chapterIds)
          .eq("status", "published")
          .eq("subjects.status", "published")
      : { data: [], error: null };
    if (chapterError) throw chapterError;

    const chapterMeta = new Map(
      ((chapterRows ?? []) as Array<{
        id: string;
        subject_id: string;
        subjects?: { level?: string } | Array<{ level?: string }> | null;
      }>).map((c) => {
        const subject = Array.isArray(c.subjects) ? c.subjects[0] : c.subjects;
        return [c.id, { subjectId: c.subject_id, level: subject?.level ?? data.level ?? null }];
      }),
    );
    const mcqMap = new Map(
      ((mcqRows ?? []) as Array<{
        id: string;
        chapter_id: string;
        correct_option: string;
      }>).map((m) => [m.id, m]),
    );

    type PracticeRow = {
      user_id: string;
      mcq_id: string;
      chapter_id: string;
      subject_id: string;
      level: string | null;
      chosen_option: "A" | "B" | "C" | "D";
      is_correct: boolean;
      time_spent_ms: number;
    };
    const nowIso = new Date().toISOString();
    const rows: PracticeRow[] = answered.flatMap((a) => {
      const mcq = mcqMap.get(a.mcqId);
      if (!mcq) return [];
      const meta = chapterMeta.get(mcq.chapter_id);
      if (!meta) return [];
      const chosen = a.chosen!;
      return [
        {
          user_id: userId,
          mcq_id: a.mcqId,
          chapter_id: mcq.chapter_id,
          subject_id: meta.subjectId,
          level: meta.level,
          chosen_option: chosen,
          is_correct: normalizeChoice(mcq.correct_option) === normalizeChoice(chosen),
          time_spent_ms: Math.min(a.timeMs, 60 * 60 * 1000),
        },
      ];
    });

    if (!rows.length) return { recorded: 0 };

    // Use the atomic RPC so re-submissions of the same MCQ increment
    // `attempt_count` (one row per (user, MCQ), but every submission is
    // counted toward "MCQs Solved"). Fall back to the legacy upsert when
    // the RPC is missing on older deployments.
    let rpcMissing = false;
    let recorded = 0;
    for (const r of rows) {
      const { error } = await supabase.rpc("record_mcq_practice_answer", {
        p_mcq_id: r.mcq_id,
        p_chapter_id: r.chapter_id,
        p_subject_id: r.subject_id,
        p_level: r.level,
        p_chosen_option: r.chosen_option,
        p_is_correct: r.is_correct,
        p_time_spent_ms: r.time_spent_ms,
      });
      if (error) {
        const code = (error as { code?: string }).code;
        const msg = (error as { message?: string }).message ?? "";
        if (code === "42883" || /record_mcq_practice_answer|function .* does not exist/i.test(msg)) {
          rpcMissing = true;
          break;
        }
        if (isMissingPracticeProgressTable(error)) {
          await ensurePracticeProgressTable();
          rpcMissing = true;
          break;
        }
        throw error;
      }
      recorded += 1;
    }

    if (rpcMissing) {
      const fallback = rows.map((r) => ({
        ...r,
        answered_at: nowIso,
        updated_at: nowIso,
      }));
      const { error } = await supabase
        .from("mcq_practice_progress")
        .upsert(fallback, { onConflict: "user_id,mcq_id" });
      if (error) {
        if (isMissingPracticeProgressTable(error)) {
          await ensurePracticeProgressTable();
          const { error: retryError } = await supabase
            .from("mcq_practice_progress")
            .upsert(fallback, { onConflict: "user_id,mcq_id" });
          if (retryError) throw retryError;
        } else {
          throw error;
        }
      }
      recorded = rows.length;
    }

    // P3a-McQ-C1: piggyback reveal data for the just-submitted MCQs so the
    // client can render correct/wrong + explanation WITHOUT pre-fetching the
    // answer key via listMcqs. The student already answered, so leaking
    // correct_option back is intentional and scoped to these IDs only.
    const reveals = ((mcqRows ?? []) as Array<{
      id: string;
      correct_option: string;
      explanation: string | null;
    }>).map((m) => ({
      id: m.id,
      correct_option: m.correct_option,
      explanation: m.explanation ?? null,
    }));
    return { recorded, reveals };
  });

// ---- Chapters ----
const chaptersSchema = z.object({ subjectId: z.string().uuid() });

export const listChapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof chaptersSchema>) => chaptersSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("chapters")
      .select("id,name,slug,description,sort_order,subject_id")
      .eq("subject_id", data.subjectId)
      .eq("status", "published")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

// ---- MCQs by chapter ----
const mcqsSchema = z
  .object({
    chapterId: z.string().uuid().nullable().optional(),
    subjectId: z.string().uuid().nullable().optional(),
    level: z.string().trim().max(40).nullable().optional(),
    limit: z.number().int().min(1).max(2000).optional(),
  })
  .refine((v) => v.chapterId || v.subjectId || v.level, {
    message: "Provide chapterId, subjectId or level",
  });

export const listMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof mcqsSchema>) => mcqsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    let chapterIds: string[] | null = null;
    if (!data.chapterId) {
      // "All Chapters" mode — gather chapter ids for the subject/level.
      let cq = sb
        .from("chapters")
        .select("id,subject_id,subjects!inner(level)")
        .eq("status", "published");
      if (data.subjectId) cq = cq.eq("subject_id", data.subjectId);
      if (data.level) cq = cq.ilike("subjects.level", data.level);
      const { data: cRows, error: cErr } = await cq;
      if (cErr) throw cErr;
      chapterIds = (cRows ?? []).map((c) => c.id);
      if (!chapterIds.length) return [];
    }
    const maxRows = data.limit ?? 2000;
    const rows: Array<{
      id: string;
      question: string;
      option_a: string;
      option_b: string;
      option_c: string;
      option_d: string;
      correct_option: string | null;
      explanation: string | null;
      tags: string[] | null;
    }> = [];
    for (let from = 0; rows.length < maxRows; from += PAGE_SIZE) {
      const to = Math.min(from + PAGE_SIZE - 1, maxRows - 1);
      let q = sb
        .from("mcqs")
        // P3a-McQ-C1: NEVER project correct_option/explanation in the
        // pre-submission list. They are revealed per-MCQ via
        // recordMcqPracticeProgress (on submit) or revealMcqAnswers
        // (for review/wrong-questions rehydration, gated by attempt evidence).
        .select("id,question,option_a,option_b,option_c,option_d,tags")
        .eq("status", "published")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
      else if (chapterIds) q = q.in("chapter_id", chapterIds);
      const { data: page, error } = await q;
      if (error) throw error;
      rows.push(
        ...((page ?? []).map((r) => ({
          ...r,
          correct_option: null as string | null,
          explanation: null as string | null,
        }))),
      );
      if (!page || page.length < to - from + 1) break;
    }
    return rows;
  });

// P3a-McQ-C1: post-submission reveal. Returns correct_option + explanation
// ONLY for MCQs the caller has demonstrably attempted (mcq_practice_progress
// row OR attempt_answers row). Prevents enumeration of answer-keys for
// quizzes the user hasn't taken. Used by:
//   * McqFlow review screen (after batch finalize)
//   * WrongQuestionsFlow (user already attempted these by definition)
//   * Resume-progress rehydration
const revealMcqsSchema = z.object({
  mcqIds: z.array(z.string().uuid()).min(1).max(500),
});

export const revealMcqAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof revealMcqsSchema>) => revealMcqsSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Evidence the caller has actually answered each MCQ.
    const [practiceR, attemptR] = await Promise.all([
      supabase
        .from("mcq_practice_progress")
        .select("mcq_id")
        .eq("user_id", userId)
        .in("mcq_id", data.mcqIds),
      supabase
        .from("attempt_answers")
        .select("mcq_id,exam_attempts!inner(user_id)")
        .eq("exam_attempts.user_id", userId)
        .in("mcq_id", data.mcqIds),
    ]);
    const allowed = new Set<string>();
    for (const r of practiceR.data ?? []) allowed.add(r.mcq_id);
    for (const r of attemptR.data ?? []) allowed.add(r.mcq_id);
    if (!allowed.size) return [] as Array<{ id: string; correct_option: string; explanation: string | null }>;
    const { data: mcqs, error } = await supabase
      .from("mcqs")
      .select("id,correct_option,explanation")
      .in("id", Array.from(allowed));
    if (error) throw error;
    return (mcqs ?? []) as Array<{ id: string; correct_option: string; explanation: string | null }>;
  });

// ---- Quizzes ----
const listQuizzesSchema = z
  .object({
    level: z.string().trim().max(40).optional(),
    subjectId: z.string().uuid().nullable().optional(),
    chapterId: z.string().uuid().nullable().optional(),
    kind: z.enum(["quiz", "mock"]).default("quiz"),
  })
  .partial();

export const listQuizzes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listQuizzesSchema> | undefined) =>
    listQuizzesSchema.parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const kind = data.kind ?? "quiz";
    let q = context.supabase
      .from("quizzes")
      .select(
        "id,title,description,total_questions,duration_seconds,passing_marks,negative_marking,subject_id,chapter_id,level,kind,starts_at,ends_at,created_at,subjects(name),chapters(name)",
      )
      .eq("status", "published")
      .eq("kind", kind)
      .order("created_at", { ascending: false });
    if (data.level) q = q.eq("level", data.level);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    const { data: rows, error } = await q;
    if (error) throw error;
    const quizIds = (rows ?? []).map((r) => r.id);
    if (!quizIds.length) return [];
    // Only surface quizzes that have at least one assigned question
    const { data: qq, error: qqErr } = await context.supabase
      .from("quiz_questions")
      .select("quiz_id")
      .in("quiz_id", quizIds);
    if (qqErr) throw qqErr;
    const counts = new Map<string, number>();
    for (const r of qq ?? []) {
      counts.set(r.quiz_id, (counts.get(r.quiz_id) ?? 0) + 1);
    }
    return (rows ?? [])
      .filter((r) => (counts.get(r.id) ?? 0) > 0)
      .map((r) => ({ ...r, mcq_count: counts.get(r.id) ?? 0 }));
  });

const quizSchema = z.object({ quizId: z.string().uuid() });

export const getQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof quizSchema>) => quizSchema.parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const [quizRes, qqRes] = await Promise.all([
      supabase
        .from("quizzes")
        .select(
          "id,title,description,total_questions,duration_seconds,subject_id,chapter_id",
        )
        .eq("id", data.quizId)
        .single(),
      supabase
        .from("quiz_questions")
        // SECURITY: do NOT expose correct_option or explanation here.
        // They are revealed post-submission via revealAnswers(attemptId).
        .select(
          "position,mcq:mcqs(id,question,option_a,option_b,option_c,option_d)",
        )
        .eq("quiz_id", data.quizId)
        .order("position", { ascending: true }),
    ]);
    if (quizRes.error) throw quizRes.error;
    if (qqRes.error) throw qqRes.error;

    const questions = (qqRes.data ?? [])
      .map((r) => {
        const mcq = (r as unknown as { mcq: Record<string, unknown> | null }).mcq;
        return mcq ? { position: r.position, ...mcq } : null;
      })
      .filter(Boolean);
    return { quiz: quizRes.data, questions };
  });

// ---- Attempts ----
const submitSchema = z.object({
  quizId: z.string().uuid(),
  durationSeconds: z
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 4),
  answers: z
    .array(
      z.object({
        mcqId: z.string().uuid(),
        chosen: z.enum(["A", "B", "C", "D"]).nullable(),
        timeMs: z
          .number()
          .int()
          .min(0)
          .max(60 * 60 * 1000),
      }),
    )
    .max(200),
});

export const submitAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof submitSchema>) => submitSchema.parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;

    // Per-user rate limit on quiz/mcq/mock submissions (anti-spam).
    await enforceRateLimit(
      supabase,
      rateLimitKey("quiz:submit", "user", userId),
      RATE_LIMITS.QUIZ_SUBMIT,
    );



    // Resolve correct answers + quiz meta server-side; never trust client.
    const ids = data.answers.map((a) => a.mcqId);
    let correctMap = new Map<string, string>();
    if (ids.length) {
      const { data: mcqs, error: me } = await supabase
        .from("mcqs")
        .select("id,correct_option")
        .in("id", ids);
      if (me) throw me;
      correctMap = new Map((mcqs ?? []).map((m) => [m.id, m.correct_option]));
    }

    // Load quiz so the attempt row is fully categorized (analytics + per-kind
    // performance need kind/subject/chapter/level/title). negative_marking is
    // applied below so mock-test scores reflect the penalty configured by
    // the admin (H-1 fix).
    const { data: quizMeta } = await supabase
      .from("quizzes")
      .select(
        "id,title,subject_id,chapter_id,level,kind,negative_marking,total_questions,duration_seconds,max_attempts",
      )
      .eq("id", data.quizId)
      .maybeSingle();

    // P3a-Q-H3: server-authoritative max-attempts cap. NULL or <=0 means
    // unlimited (default, backward compatible). Count only finalized
    // attempts so an in-flight resume doesn't burn the cap.
    const maxAttempts = quizMeta && typeof (quizMeta as { max_attempts?: number | null }).max_attempts === "number"
      ? (quizMeta as { max_attempts: number | null }).max_attempts
      : null;
    if (maxAttempts && maxAttempts > 0) {
      const { count: prior, error: cErr } = await supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("quiz_id", data.quizId)
        .in("status", ["completed", "submitted"]);
      if (cErr) throw cErr;
      if ((prior ?? 0) >= maxAttempts) {
        throw new Error(
          `Attempt limit reached: this assessment allows at most ${maxAttempts} submission${maxAttempts === 1 ? "" : "s"}.`,
        );
      }
    }

    const submittedAnswers = data.answers.filter((a) => a.chosen !== null);
    let correct = 0;
    let wrong = 0;
    const rows = submittedAnswers.map((a) => {
      const isCorrect = a.chosen !== null && correctMap.get(a.mcqId) === a.chosen;
      if (isCorrect) correct++;
      else if (a.chosen !== null) wrong++;
      return {
        mcq_id: a.mcqId,
        chosen_option: a.chosen,
        is_correct: isCorrect,
        time_spent_ms: a.timeMs,
      };
    });

    // P3a-Q-C2: denominator MUST be the full question count (cheat-proofs
    // "skip everything but the easy 3" exploit). Fall back to delivered
    // answer count only if quizMeta lacks total_questions.
    const totalQuestions =
      (typeof quizMeta?.total_questions === "number" && quizMeta.total_questions > 0
        ? quizMeta.total_questions
        : null) ?? data.answers.length;
    const total = submittedAnswers.length;
    // H-1: apply per-quiz negative marking. `negative_marking` is the fractional
    // penalty per wrong answer (e.g. 0.25 = -25% of one mark). Clamp at 0 so
    // a heavily-penalised attempt never reports a negative percentage.
    const negFactor = Number(quizMeta?.negative_marking ?? 0) || 0;
    const rawCorrect = Math.max(0, correct - wrong * negFactor);
    const score =
      totalQuestions === 0
        ? 0
        : Math.max(0, Math.round((rawCorrect / totalQuestions) * 100));

    // P3a-Q-H1: clamp duration to the quiz's configured window so the
    // leaderboard (sorted by ASC duration_seconds) cannot be gamed by a
    // client sending durationSeconds: 1.
    const maxDuration =
      typeof quizMeta?.duration_seconds === "number" && quizMeta.duration_seconds > 0
        ? quizMeta.duration_seconds
        : data.durationSeconds;
    const clampedDuration = Math.min(data.durationSeconds, maxDuration);
    const attemptKind = (quizMeta?.kind === "mock" ? "mock" : "quiz") as "quiz" | "mock";


    // attempt_number per quiz for this user
    let attemptNumber = 1;
    {
      const { count } = await supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("quiz_id", data.quizId)
        .eq("status", "completed");
      attemptNumber = (count ?? 0) + 1;
    }

    const { data: attempt, error: ae } = await supabase
      .from("exam_attempts")
      .insert({
        user_id: userId,
        quiz_id: data.quizId,
        kind: attemptKind,
        subject_id: quizMeta?.subject_id ?? null,
        chapter_id: quizMeta?.chapter_id ?? null,
        level: quizMeta?.level ?? null,
        title: quizMeta?.title ?? null,
        attempt_number: attemptNumber,
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_seconds: clampedDuration,
        correct_count: correct,
        total_count: totalQuestions,
        score,
      })
      .select("id")
      .single();
    if (ae) throw ae;

    if (rows.length) {
      const { error: ie } = await supabase
        .from("attempt_answers")
        .insert(rows.map((r) => ({ ...r, attempt_id: attempt.id })));
      if (ie) throw ie;
    }

    // Mirror outcomes into mcq_wrong_questions so Wrong Questions / Mastery
    // track quiz attempts too (not only MCQ Practice).
    try {
      const correctById = new Map(
        data.answers.map((a) => [a.mcqId, correctMap.get(a.mcqId) ?? null]),
      );
      const affected = data.answers.filter((a) => a.chosen !== null);
      if (affected.length) {
        const wrongIds = affected
          .filter((a) => correctById.get(a.mcqId) !== a.chosen)
          .map((a) => a.mcqId);
        const correctIds = affected
          .filter((a) => correctById.get(a.mcqId) === a.chosen)
          .map((a) => a.mcqId);
        const allIds = [...wrongIds, ...correctIds];
        const { data: existing } = await supabase
          .from("mcq_wrong_questions")
          .select("mcq_id,retry_count,mastered")
          .eq("user_id", userId)
          .in("mcq_id", allIds);
        const existMap = new Map(
          (existing ?? []).map((r: { mcq_id: string; retry_count: number; mastered: boolean }) => [
            r.mcq_id,
            r,
          ]),
        );
        const nowIso = new Date().toISOString();
        for (const a of affected) {
          const isWrong = correctById.get(a.mcqId) !== a.chosen;
          if (!isWrong) continue;
          const prev = existMap.get(a.mcqId);
          const nextRetry = prev ? (prev.retry_count ?? 0) + 1 : 0;
          await supabase.from("mcq_wrong_questions").upsert(
            {
              user_id: userId,
              mcq_id: a.mcqId,
              chapter_id: quizMeta?.chapter_id ?? null,
              subject_id: quizMeta?.subject_id ?? null,
              level: quizMeta?.level ?? null,
              last_chosen_option: a.chosen,
              correct_option: (correctById.get(a.mcqId) as "A" | "B" | "C" | "D" | null) ?? null,
              retry_count: nextRetry,
              mastered: false,
              last_wrong_at: nowIso,
            },
            { onConflict: "user_id,mcq_id" },
          );
        }
        const masterIds = correctIds.filter(
          (id) => existMap.has(id) && !existMap.get(id)!.mastered,
        );
        if (masterIds.length) {
          await supabase
            .from("mcq_wrong_questions")
            .update({ mastered: true })
            .eq("user_id", userId)
            .in("mcq_id", masterIds);
        }
      }
    } catch {
      /* non-fatal — analytics shouldn't block the attempt */
    }

    return { attemptId: attempt.id, correct, wrong, total, score };
  });

export const listMyAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("exam_attempts")
      .select(
        "id,quiz_id,status,score,correct_count,total_count,duration_seconds,started_at,completed_at",
      )
      .eq("user_id", context.userId)
      .order("started_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data ?? [];
  });

// Post-submission answer reveal. Returns correct_option + explanation ONLY
// for MCQs that belong to a completed attempt owned by the caller. This is
// the secure replacement for embedding correct_option in pre-submission
// reads such as getQuiz/listMcqs — future UI refactors should swap to this.
const revealSchema = z.object({ attemptId: z.string().uuid() });

export const revealAnswers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof revealSchema>) => revealSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Ownership + completion check — RLS already scopes to auth.uid(),
    // but we double-check status here so an in-progress attempt cannot leak
    // answers via this endpoint.
    const { data: attempt, error: ae } = await supabase
      .from("exam_attempts")
      .select("id,user_id,status")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (ae) throw ae;
    if (!attempt || attempt.user_id !== userId) {
      throw new Error("Attempt not found");
    }
    if (attempt.status !== "completed") {
      throw new Error("Attempt not yet submitted");
    }
    const { data: rows, error: re } = await supabase
      .from("attempt_answers")
      .select("mcq_id,chosen_option,is_correct,mcq:mcqs(correct_option,explanation)")
      .eq("attempt_id", data.attemptId);
    if (re) throw re;
    return (rows ?? []).map((r) => {
      const m = (r as unknown as { mcq: { correct_option: string; explanation: string | null } | null }).mcq;
      return {
        mcq_id: r.mcq_id,
        chosen_option: r.chosen_option,
        is_correct: r.is_correct,
        correct_option: m?.correct_option ?? null,
        explanation: m?.explanation ?? null,
      };
    });
  });

// ===== Custom Exam (server-authoritative) =====
//
// generateCustomExam returns randomized MCQs WITHOUT correct_option /
// explanation so the client cannot inspect answers before submission.
// submitCustomExamAttempt scores server-side and persists an exam_attempts
// row with kind='custom'. revealAnswers(attemptId) is then used for review.

const customGenSchema = z.object({
  chapterIds: z.array(z.string().uuid()).min(1).max(50),
  count: z.number().int().min(1).max(200),
  randomize: z.boolean().default(true),
  level: z.string().trim().max(40).optional(),
  subjectId: z.string().uuid().optional(),
});

export const generateCustomExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof customGenSchema>) => customGenSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("mcqs")
      // SECURITY: no correct_option, no explanation
      .select("id,chapter_id,question,option_a,option_b,option_c,option_d")
      .eq("status", "published")
      .in("chapter_id", data.chapterIds);
    if (error) throw error;
    let pool = (rows ?? []) as Array<{
      id: string;
      chapter_id: string;
      question: string;
      option_a: string;
      option_b: string;
      option_c: string;
      option_d: string;
    }>;
    if (data.randomize) {
      // Fisher-Yates server-side
      for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
    }
    return pool.slice(0, Math.min(data.count, pool.length));
  });

const customSubmitSchema = z.object({
  durationSeconds: z.number().int().min(0).max(60 * 60 * 4),
  level: z.string().trim().max(40).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  // The list of chapter ids the exam was scoped to (for analytics rollup).
  chapterIds: z.array(z.string().uuid()).max(50).optional(),
  // negative_marking factor (0..1). Default 0 — Custom Exam has no penalty
  // unless an admin extends this contract later.
  negativeMarking: z.number().min(0).max(1).optional(),
  answers: z
    .array(
      z.object({
        mcqId: z.string().uuid(),
        chosen: z.enum(["A", "B", "C", "D"]).nullable(),
        timeMs: z.number().int().min(0).max(60 * 60 * 1000).default(0),
      }),
    )
    .min(1)
    .max(200),
});

export const submitCustomExamAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof customSubmitSchema>) => customSubmitSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ids = data.answers.map((a) => a.mcqId);
    const { data: mcqs, error: me } = await supabase
      .from("mcqs")
      .select("id,correct_option,chapter_id")
      .in("id", ids);
    if (me) throw me;
    const correctMap = new Map<string, string>(
      (mcqs ?? []).map((m) => [m.id, m.correct_option as string]),
    );

    const submittedAnswers = data.answers.filter((a) => a.chosen !== null);
    let correct = 0;
    let wrong = 0;
    const rows = submittedAnswers.map((a) => {
      const isCorrect = a.chosen !== null && correctMap.get(a.mcqId) === a.chosen;
      if (isCorrect) correct++;
      else if (a.chosen !== null) wrong++;
      return {
        mcq_id: a.mcqId,
        chosen_option: a.chosen,
        is_correct: isCorrect,
        time_spent_ms: a.timeMs ?? 0,
      };
    });

    const total = submittedAnswers.length;
    const negFactor = data.negativeMarking ?? 0;
    const rawCorrect = Math.max(0, correct - wrong * negFactor);
    const score = total === 0 ? 0 : Math.max(0, Math.round((rawCorrect / total) * 100));

    // Attempt number among custom exams
    let attemptNumber = 1;
    {
      const { count } = await supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "custom_exam")
        .eq("status", "completed");
      attemptNumber = (count ?? 0) + 1;
    }

    const { data: attempt, error: ae } = await supabase
      .from("exam_attempts")
      .insert({
        user_id: userId,
        quiz_id: null,
        kind: "custom_exam",
        subject_id: data.subjectId ?? null,
        chapter_id:
          data.chapterIds && data.chapterIds.length === 1 ? data.chapterIds[0] : null,
        level: data.level ?? null,
        title: "Custom Exam",
        attempt_number: attemptNumber,
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_seconds: data.durationSeconds,
        correct_count: correct,
        total_count: total,
        score,
        meta: { chapter_ids: data.chapterIds ?? [], wrong, submitted_count: total, presented_count: data.answers.length },
      })
      .select("id")
      .single();
    if (ae) throw ae;

    if (rows.length) {
      const { error: ie } = await supabase
        .from("attempt_answers")
        .insert(rows.map((r) => ({ ...r, attempt_id: attempt.id })));
      if (ie) throw ie;
    }

    // Mirror wrong answers into mcq_wrong_questions for the Review/Mastery
    // flows (non-fatal — never blocks the submit).
    try {
      const affected = data.answers.filter((a) => a.chosen !== null);
      const wrongIds = affected
        .filter((a) => correctMap.get(a.mcqId) !== a.chosen)
        .map((a) => a.mcqId);
      const correctIds = affected
        .filter((a) => correctMap.get(a.mcqId) === a.chosen)
        .map((a) => a.mcqId);
      const allIds = [...wrongIds, ...correctIds];
      if (allIds.length) {
        const { data: existing } = await supabase
          .from("mcq_wrong_questions")
          .select("mcq_id,retry_count,mastered")
          .eq("user_id", userId)
          .in("mcq_id", allIds);
        const existMap = new Map(
          (existing ?? []).map(
            (r: { mcq_id: string; retry_count: number; mastered: boolean }) => [r.mcq_id, r],
          ),
        );
        const nowIso = new Date().toISOString();
        const mcqMeta = new Map(
          (mcqs ?? []).map((m) => [m.id as string, m as { id: string; chapter_id: string | null }]),
        );
        for (const a of affected) {
          const isWrong = correctMap.get(a.mcqId) !== a.chosen;
          if (!isWrong) continue;
          const prev = existMap.get(a.mcqId);
          const meta = mcqMeta.get(a.mcqId);
          await supabase.from("mcq_wrong_questions").upsert(
            {
              user_id: userId,
              mcq_id: a.mcqId,
              chapter_id: meta?.chapter_id ?? null,
              subject_id: data.subjectId ?? null,
              level: data.level ?? null,
              last_chosen_option: a.chosen,
              correct_option: (correctMap.get(a.mcqId) as "A" | "B" | "C" | "D" | null) ?? null,
              retry_count: prev ? (prev.retry_count ?? 0) + 1 : 0,
              mastered: false,
              last_wrong_at: nowIso,
            },
            { onConflict: "user_id,mcq_id" },
          );
        }
        const masterIds = correctIds.filter(
          (id) => existMap.has(id) && !existMap.get(id)!.mastered,
        );
        if (masterIds.length) {
          await supabase
            .from("mcq_wrong_questions")
            .update({ mastered: true })
            .eq("user_id", userId)
            .in("mcq_id", masterIds);
        }
      }
    } catch {
      /* non-fatal */
    }

    return {
      attemptId: attempt.id as string,
      correct,
      wrong,
      total,
      score,
      skipped: Math.max(0, data.answers.length - total),
    };
  });