// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";

const statusEnum = z.enum(["draft", "published", "archived"]);
const levelCode = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_-]+$/);

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `item-${Date.now()}`
  );
}

async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  selectClause: string,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(selectClause)
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchAllWithQuery<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildQuery: (from: number, to: number) => any,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;

    const batch = (data ?? []) as T[];
    rows.push(...batch);

    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

// ============================================================
// TREE — single fetch to drive the whole Academic Manager UI
// ============================================================
export const adminGetAcademicTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({}).strict().optional().parse(d) ?? {})
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const sb = context.supabase;
    type Mcq = { id: string; chapter_id: string | null; status: string };
    type Qz = {
      id: string;
      subject_id: string | null;
      chapter_id: string | null;
      kind: string | null;
      status: string;
    };
    type QuizQuestion = { quiz_id: string; mcq_id: string };

    const [
      levelsRes,
      subjectsRes,
      chaptersRes,
      mcqs,
      quizzes,
      quizQuestions,
      mcqTotalRes,
      subjectsTotalRes,
      chaptersTotalRes,
      quizTotalRes,
      mockTotalRes,
      notesTotalRes,
      flashCardsTotalRes,
    ] = await Promise.all([
      sb.from("levels").select("*").order("sort_order", { ascending: true }),
      sb
        .from("subjects")
        .select("id,name,slug,level,color,icon,description,status,sort_order,updated_at")
        .order("sort_order", { ascending: true }),
      sb
        .from("chapters")
        .select("id,name,slug,subject_id,description,status,sort_order,updated_at")
        .order("sort_order", { ascending: true }),
      fetchAllRows<Mcq>(sb, "mcqs", "id,chapter_id,status"),
      fetchAllRows<Qz>(sb, "quizzes", "id,subject_id,chapter_id,kind,status"),
      fetchAllRows<QuizQuestion>(sb, "quiz_questions", "quiz_id,mcq_id"),
      sb.from("mcqs").select("id", { count: "exact", head: true }),
      sb.from("subjects").select("id", { count: "exact", head: true }),
      sb.from("chapters").select("id", { count: "exact", head: true }),
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "quiz"),
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "mock"),
      sb.from("short_notes").select("id", { count: "exact", head: true }),
      sb.from("flash_cards").select("id", { count: "exact", head: true }),
    ]);
    if (levelsRes.error) throw levelsRes.error;
    if (subjectsRes.error) throw subjectsRes.error;
    if (chaptersRes.error) throw chaptersRes.error;

    if (mcqTotalRes.error) throw mcqTotalRes.error;
    if (subjectsTotalRes.error) throw subjectsTotalRes.error;
    if (chaptersTotalRes.error) throw chaptersTotalRes.error;
    if (quizTotalRes.error) throw quizTotalRes.error;
    if (mockTotalRes.error) throw mockTotalRes.error;
    if (notesTotalRes.error) throw notesTotalRes.error;
    if (flashCardsTotalRes.error) throw flashCardsTotalRes.error;

    const subjectsData = subjectsRes.data ?? [];
    const chaptersData = chaptersRes.data ?? [];
    const chapterToSubject = new Map(
      chaptersData.map((chapter) => [chapter.id, chapter.subject_id]),
    );

    const mcqByChapter = new Map<string, number>();
    const mcqChapterById = new Map<string, string>();
    for (const m of mcqs) {
      if (!m.chapter_id) continue;
      mcqChapterById.set(m.id, m.chapter_id);
      mcqByChapter.set(m.chapter_id, (mcqByChapter.get(m.chapter_id) ?? 0) + 1);
    }

    const quizLinkedChapters = new Map<string, Set<string>>();
    for (const link of quizQuestions) {
      const chapterId = mcqChapterById.get(link.mcq_id);
      if (!chapterId) continue;
      if (!quizLinkedChapters.has(link.quiz_id))
        quizLinkedChapters.set(link.quiz_id, new Set<string>());
      quizLinkedChapters.get(link.quiz_id)!.add(chapterId);
    }

    const quizByChapter = new Map<string, number>();
    const mockByChapter = new Map<string, number>();
    const quizBySubject = new Map<string, number>();
    const mockBySubject = new Map<string, number>();

    for (const q of quizzes) {
      const chapterIds = new Set<string>();
      if (q.chapter_id) chapterIds.add(q.chapter_id);
      for (const chapterId of quizLinkedChapters.get(q.id) ?? []) chapterIds.add(chapterId);

      const chapterTarget = q.kind === "mock" ? mockByChapter : quizByChapter;
      const subjectTarget = q.kind === "mock" ? mockBySubject : quizBySubject;

      for (const chapterId of chapterIds) {
        chapterTarget.set(chapterId, (chapterTarget.get(chapterId) ?? 0) + 1);
      }

      if (chapterIds.size === 0 && q.subject_id) {
        subjectTarget.set(q.subject_id, (subjectTarget.get(q.subject_id) ?? 0) + 1);
      }
    }

    const derivedMcqTotal = Array.from(mcqByChapter.values()).reduce(
      (sum, value) => sum + value,
      0,
    );
    const actualMcqTotal = mcqTotalRes.count ?? 0;
    const actualSubjects = subjectsTotalRes.count ?? subjectsData.length;
    const actualChapters = chaptersTotalRes.count ?? chaptersData.length;
    const actualQuizzes = quizTotalRes.count ?? 0;
    const actualMocks = mockTotalRes.count ?? 0;
    const actualNotes = notesTotalRes.count ?? 0;
    const actualFlashCards = flashCardsTotalRes.count ?? 0;

    return {
      levels: levelsRes.data ?? [],
      subjects: subjectsData,
      chapters: chaptersData,
      counts: {
        mcqByChapter: Object.fromEntries(mcqByChapter),
        quizByChapter: Object.fromEntries(quizByChapter),
        mockByChapter: Object.fromEntries(mockByChapter),
        quizBySubject: Object.fromEntries(quizBySubject),
        mockBySubject: Object.fromEntries(mockBySubject),
      },
      overview: {
        subjects: actualSubjects,
        chapters: actualChapters,
        mcqs: actualMcqTotal,
        quizzes: actualQuizzes,
        mocks: actualMocks,
        notes: actualNotes,
        flashCards: actualFlashCards,
        totalContent:
          actualMcqTotal +
          actualChapters +
          actualQuizzes +
          actualMocks +
          actualNotes +
          actualFlashCards,
      },
      validation: {
        checkedAt: new Date().toISOString(),
        actual: {
          subjects: actualSubjects,
          chapters: actualChapters,
          mcqs: actualMcqTotal,
          quizzes: actualQuizzes,
          mocks: actualMocks,
          totalContent:
            actualMcqTotal +
            actualChapters +
            actualQuizzes +
            actualMocks +
            actualNotes +
            actualFlashCards,
        },
        derived: {
          subjects: subjectsData.length,
          chapters: chaptersData.length,
          mcqs: derivedMcqTotal,
        },
        mismatches: {
          subjects: actualSubjects - subjectsData.length,
          chapters: actualChapters - chaptersData.length,
          mcqs: actualMcqTotal - derivedMcqTotal,
        },
        orphanLinkedContent: {
          quizzes: quizzes.filter(
            (quiz) =>
              quiz.kind !== "mock" &&
              !(quiz.chapter_id || quiz.subject_id || (quizLinkedChapters.get(quiz.id)?.size ?? 0)),
          ).length,
          mocks: quizzes.filter(
            (quiz) =>
              quiz.kind === "mock" &&
              !(quiz.chapter_id || quiz.subject_id || (quizLinkedChapters.get(quiz.id)?.size ?? 0)),
          ).length,
        },
      },
    };
  });

// ============================================================
// LEVELS
// ============================================================
const levelInput = z.object({
  code: levelCode,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(0),
  status: statusEnum.default("published"),
});

export const adminCreateLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof levelInput>) => levelInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const { error } = await context.supabase.from("levels").insert(data);
    if (error) throw error;
    return { ok: true };
  });

export const adminUpdateLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { code: string } & Partial<z.infer<typeof levelInput>>) =>
    levelInput.partial().extend({ code: levelCode }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const { code, ...patch } = data;
    const { error } = await context.supabase.from("levels").update(patch).eq("code", code);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { code: string }) => z.object({ code: levelCode }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const { count, error: ce } = await context.supabase
      .from("subjects")
      .select("id", { count: "exact", head: true })
      .eq("level", data.code);
    if (ce) throw ce;
    if ((count ?? 0) > 0)
      throw new Error(`Cannot delete level: ${count} subject(s) still assigned`);
    const { error } = await context.supabase.from("levels").delete().eq("code", data.code);
    if (error) throw error;
    return { ok: true };
  });

// ============================================================
// SUBJECTS
// ============================================================
const subjectInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(80).optional(),
  level: levelCode.default("professional"),
  description: z.string().trim().max(1000).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(0),
  status: statusEnum.default("published"),
});

export const adminCreateSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof subjectInput>) => subjectInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const slug = data.slug?.trim() || slugify(data.name);
    const { data: row, error } = await context.supabase
      .from("subjects")
      .insert({ ...data, slug })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const adminUpdateSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string } & Partial<z.infer<typeof subjectInput>>) =>
    subjectInput.partial().extend({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("subjects")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const { count, error: ce } = await context.supabase
      .from("chapters")
      .select("id", { count: "exact", head: true })
      .eq("subject_id", data.id);
    if (ce) throw ce;
    if ((count ?? 0) > 0) throw new Error(`Cannot delete subject: ${count} chapter(s) inside`);
    const { error } = await context.supabase.from("subjects").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminReorderSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { ids: string[] }) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    await Promise.all(
      data.ids.map((id, idx) =>
        context.supabase.from("subjects").update({ sort_order: idx }).eq("id", id),
      ),
    );
    return { ok: true };
  });

// ============================================================
// CHAPTERS
// ============================================================
const chapterInput = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().max(120).optional(),
  subject_id: z.string().uuid(),
  description: z.string().trim().max(2000).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(0),
  status: statusEnum.default("published"),
});

export const adminCreateChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof chapterInput>) => chapterInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const slug = data.slug?.trim() || slugify(data.name);
    const { data: row, error } = await context.supabase
      .from("chapters")
      .insert({ ...data, slug })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const adminUpdateChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string } & Partial<z.infer<typeof chapterInput>>) =>
    chapterInput.partial().extend({ id: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("chapters")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const { count, error: ce } = await context.supabase
      .from("mcqs")
      .select("id", { count: "exact", head: true })
      .eq("chapter_id", data.id);
    if (ce) throw ce;
    if ((count ?? 0) > 0) throw new Error(`Cannot delete chapter: ${count} MCQ(s) inside`);
    const { error } = await context.supabase.from("chapters").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminReorderChapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { ids: string[] }) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    await Promise.all(
      data.ids.map((id, idx) =>
        context.supabase.from("chapters").update({ sort_order: idx }).eq("id", id),
      ),
    );
    return { ok: true };
  });

// ============================================================
// ANALYTICS — drives the premium dashboard widgets
// ============================================================
export const adminAcademicAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { rangeDays?: number } | undefined) => ({
    rangeDays: Math.max(1, Math.min(365, Math.floor(input?.rangeDays ?? 30))),
  }))
  .handler(async ({ context, data }) => {
    await assertPermission(context.supabase, context.userId, "edit_academic_structure");
    const sb = context.supabase;
    const now = Date.now();
    const rangeDays = data.rangeDays;
    const since = new Date(now - rangeDays * 24 * 3600 * 1000).toISOString();

    const [events, recentRes, notesRes, flashRes, lastRes] = await Promise.all([
      fetchAllWithQuery<Ev>((from, to) =>
        sb
          .from("activity_events")
          .select("module, target_kind, target_id, user_id, created_at")
          .gte("created_at", since)
          .range(from, to),
      ),
      sb
        .from("activity_events")
        .select(
          "id, event_type, element_label, module, target_kind, target_id, user_id, created_at",
        )
        .in("module", ["academic", "mcq", "quiz", "mock", "flash_cards", "short_notes"])
        .order("created_at", { ascending: false })
        .limit(8),
      sb.from("short_notes").select("id", { count: "exact", head: true }),
      sb.from("flash_cards").select("id", { count: "exact", head: true }),
      sb
        .from("activity_events")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    type Ev = {
      module: string | null;
      target_kind: string | null;
      target_id: string | null;
      user_id: string | null;
      created_at: string;
    };

    const subjViews = new Map<string, number>();
    const subjUsers = new Map<string, Set<string>>();
    const subjAttempts = new Map<string, number>();
    const chapViews = new Map<string, number>();
    const chapUsers = new Map<string, Set<string>>();
    const chapAttempts = new Map<string, number>();
    const dayBuckets = new Map<string, { views: number; users: Set<string>; attempts: number }>();
    let totalViews = 0;
    let totalAttempts = 0;
    const allUsers = new Set<string>();

    for (const e of events) {
      const day = e.created_at.slice(0, 10);
      if (!dayBuckets.has(day)) dayBuckets.set(day, { views: 0, users: new Set(), attempts: 0 });
      const bucket = dayBuckets.get(day)!;
      if (e.user_id) {
        allUsers.add(e.user_id);
        bucket.users.add(e.user_id);
      }

      const isAttempt = e.module === "mcq" || e.module === "quiz" || e.module === "mock";
      if (isAttempt) {
        totalAttempts += 1;
        bucket.attempts += 1;
      } else {
        totalViews += 1;
        bucket.views += 1;
      }

      if (e.target_kind === "subject" && e.target_id) {
        subjViews.set(e.target_id, (subjViews.get(e.target_id) ?? 0) + 1);
        if (e.user_id) {
          if (!subjUsers.has(e.target_id)) subjUsers.set(e.target_id, new Set());
          subjUsers.get(e.target_id)!.add(e.user_id);
        }
        if (isAttempt) subjAttempts.set(e.target_id, (subjAttempts.get(e.target_id) ?? 0) + 1);
      }
      if (e.target_kind === "chapter" && e.target_id) {
        chapViews.set(e.target_id, (chapViews.get(e.target_id) ?? 0) + 1);
        if (e.user_id) {
          if (!chapUsers.has(e.target_id)) chapUsers.set(e.target_id, new Set());
          chapUsers.get(e.target_id)!.add(e.user_id);
        }
        if (isAttempt) chapAttempts.set(e.target_id, (chapAttempts.get(e.target_id) ?? 0) + 1);
      }
    }

    // Build dense day series for the selected range
    const series: { day: string; views: number; attempts: number; users: number }[] = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(now - i * 24 * 3600 * 1000).toISOString().slice(0, 10);
      const b = dayBuckets.get(d);
      series.push({
        day: d,
        views: b?.views ?? 0,
        attempts: b?.attempts ?? 0,
        users: b?.users.size ?? 0,
      });
    }

    const subjects: Record<string, { views: number; uniqueUsers: number; attempts: number }> = {};
    for (const [k, v] of subjViews)
      subjects[k] = {
        views: v,
        uniqueUsers: subjUsers.get(k)?.size ?? 0,
        attempts: subjAttempts.get(k) ?? 0,
      };
    const chapters: Record<string, { views: number; uniqueUsers: number; attempts: number }> = {};
    for (const [k, v] of chapViews)
      chapters[k] = {
        views: v,
        uniqueUsers: chapUsers.get(k)?.size ?? 0,
        attempts: chapAttempts.get(k) ?? 0,
      };

    return {
      totals: {
        views: totalViews,
        attempts: totalAttempts,
        uniqueUsers: allUsers.size,
        notes: notesRes.count ?? 0,
        flashCards: flashRes.count ?? 0,
      },
      perSubject: subjects,
      perChapter: chapters,
      series,
      recent: recentRes.data ?? [],
      health: {
        lastEventAt: (lastRes.data?.[0]?.created_at as string | undefined) ?? null,
      },
      rangeDays,
    };
  });