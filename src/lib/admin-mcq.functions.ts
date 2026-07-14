// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { enforceRateLimit, RATE_LIMITS, rateLimitKey } from "@/integrations/security/rate-limit";
import { mcqBulkImportItemSchema } from "@/lib/mcq-bulk-schema";
import { fingerprintQuestion } from "@/lib/mcq-parse";
import { noInput } from "@/lib/validate";

// ---------- Shared schemas ----------
const optionStr = z.string().trim().min(1).max(1000);
const optionStrNullable = z.string().trim().max(1000).nullable().optional();
const mcqOptionEnum = z.enum(["A", "B", "C", "D"]);
const questionTypeEnum = z.enum(["mcq", "true_false"]);
const difficultyEnum = z.enum(["easy", "medium", "hard"]);
const statusEnum = z.enum(["draft", "published", "archived"]);

// Base object — keep as a plain ZodObject so we can call .partial() / .omit().
const mcqInputBase = z.object({
  chapter_id: z.string().uuid(),
  question: z.string().trim().min(3).max(4000),
  question_type: questionTypeEnum.default("mcq"),
  option_a: optionStr,
  option_b: optionStr,
  option_c: optionStrNullable,
  option_d: optionStrNullable,
  correct_option: mcqOptionEnum,
  explanation: z.string().trim().max(4000).nullable().optional(),
  difficulty: difficultyEnum.default("medium"),
  status: statusEnum.default("published"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

function refineMcq<
  T extends {
    question_type?: "mcq" | "true_false";
    option_c?: string | null;
    option_d?: string | null;
    correct_option?: "A" | "B" | "C" | "D";
  },
>(v: T, ctx: z.RefinementCtx) {
  const qt = v.question_type ?? "mcq";
  if (qt === "true_false") {
    if (v.correct_option && !["A", "B"].includes(v.correct_option)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "True/False correct_option must be A or B",
      });
    }
  } else if (
    v.option_c !== undefined &&
    v.option_d !== undefined &&
    (!v.option_c || !v.option_c.trim() || !v.option_d || !v.option_d.trim())
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ requires all four options" });
  }
}

const mcqInputSchema = mcqInputBase.superRefine(refineMcq);

// ---------- Helpers ----------

// ---------- Subjects (admin view: all statuses) ----------
export const adminListSubjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({}).strict().optional().parse(d) ?? {})
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data, error } = await context.supabase
      .from("subjects")
      .select("id,name,slug,level,description,icon,color,sort_order,status")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

// ---------- Dashboard analytics (read-only, additive) ----------
export type McqDashboardStats = {
  totalMcqs: number;
  publishedMcqs: number;
  draftMcqs: number;
  archivedMcqs: number;
  totalChapters: number;
  totalSubjects: number;
  totalQuizzes: number;
  totalMocks: number;
  questionsToday: number;
  questionsTodayDelta: number;
  attempted30d: number;
  attempted30dDelta: number;
  avgDifficultyScore: number;
  avgDifficultyLabel: "Easy" | "Medium" | "Hard" | "—";
  totalsTrend30d: number[];
  publishedTrend30d: number[];
  draftTrend30d: number[];
  difficultyTrend30d: number[];
  attemptedTrend30d: number[];
  statusBreakdown: { published: number; draft: number; archived: number; review: number };
  lastSyncAt: string | null;
  recentActivity: {
    id: string;
    kind: "mcq" | "quiz" | "mock" | "chapter" | "subject";
    title: string;
    status: string | null;
    created_at: string;
  }[];
};

export const adminMcqDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }): Promise<McqDashboardStats> => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setUTCHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setUTCDate(startOfYesterday.getUTCDate() - 1);
    const thirtyDayAgo = new Date(now.getTime() - 30 * 86400000);
    const sixtyDayAgo = new Date(now.getTime() - 60 * 86400000);

    const [
      mcqTotal,
      mcqPublished,
      mcqDraft,
      mcqArchived,
      chaptersTotal,
      subjectsTotal,
      quizTotal,
      mockTotal,
      mcqsToday,
      mcqsYesterday,
      mcqsLast30d,
      attempts30d,
      attemptsPrev30d,
      difficultyRows,
      lastUpdated,
      recentMcqs,
      recentQuizzes,
      recentMocks,
      recentChapters,
      recentSubjects,
    ] = await Promise.all([
      sb.from("mcqs").select("id", { count: "exact", head: true }),
      sb.from("mcqs").select("id", { count: "exact", head: true }).eq("status", "published"),
      sb.from("mcqs").select("id", { count: "exact", head: true }).eq("status", "draft"),
      sb.from("mcqs").select("id", { count: "exact", head: true }).eq("status", "archived"),
      sb.from("chapters").select("id", { count: "exact", head: true }),
      sb.from("subjects").select("id", { count: "exact", head: true }),
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "quiz"),
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "mock"),
      sb
        .from("mcqs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfToday.toISOString()),
      sb
        .from("mcqs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfYesterday.toISOString())
        .lt("created_at", startOfToday.toISOString()),
      sb
        .from("mcqs")
        .select("created_at,status,difficulty")
        .gte("created_at", thirtyDayAgo.toISOString())
        .limit(20000),
      sb
        .from("activity_events")
        .select("created_at")
        .eq("target_kind", "mcq")
        .gte("created_at", thirtyDayAgo.toISOString())
        .limit(20000),
      sb
        .from("activity_events")
        .select("id", { count: "exact", head: true })
        .eq("target_kind", "mcq")
        .gte("created_at", sixtyDayAgo.toISOString())
        .lt("created_at", thirtyDayAgo.toISOString()),
      sb.from("mcqs").select("difficulty").limit(50000),
      sb.from("mcqs").select("updated_at").order("updated_at", { ascending: false }).limit(1),
      sb
        .from("mcqs")
        .select("id,question,status,created_at")
        .order("created_at", { ascending: false })
        .limit(6),
      sb
        .from("quizzes")
        .select("id,title,status,created_at")
        .eq("kind", "quiz")
        .order("created_at", { ascending: false })
        .limit(4),
      sb
        .from("quizzes")
        .select("id,title,status,created_at")
        .eq("kind", "mock")
        .order("created_at", { ascending: false })
        .limit(4),
      sb
        .from("chapters")
        .select("id,name,status,updated_at")
        .order("updated_at", { ascending: false })
        .limit(4),
      sb
        .from("subjects")
        .select("id,name,status,updated_at")
        .order("updated_at", { ascending: false })
        .limit(4),
    ]);

    const totalsTrend30d = new Array(30).fill(0) as number[];
    const publishedTrend30d = new Array(30).fill(0) as number[];
    const draftTrend30d = new Array(30).fill(0) as number[];
    const difficultyDayScore = new Array(30).fill(0) as number[];
    const difficultyDayCount = new Array(30).fill(0) as number[];
    const startBucket = new Date(startOfToday);
    startBucket.setUTCDate(startBucket.getUTCDate() - 29);
    const dayIdx = (iso: string) => {
      const d = new Date(iso);
      d.setUTCHours(0, 0, 0, 0);
      const i = Math.floor((d.getTime() - startBucket.getTime()) / 86400000);
      return i >= 0 && i < 30 ? i : -1;
    };
    const diffScore = (d: string) => (d === "easy" ? 1 : d === "hard" ? 3 : 2);
    for (const r of (mcqsLast30d.data ?? []) as {
      created_at: string;
      status: string;
      difficulty: string;
    }[]) {
      const i = dayIdx(r.created_at);
      if (i < 0) continue;
      totalsTrend30d[i] += 1;
      if (r.status === "published") publishedTrend30d[i] += 1;
      if (r.status === "draft") draftTrend30d[i] += 1;
      difficultyDayScore[i] += diffScore(r.difficulty);
      difficultyDayCount[i] += 1;
    }
    const attemptedTrend30d = new Array(30).fill(0) as number[];
    for (const r of (attempts30d.data ?? []) as { created_at: string }[]) {
      const i = dayIdx(r.created_at);
      if (i < 0) continue;
      attemptedTrend30d[i] += 1;
    }
    const difficultyTrend30d = difficultyDayScore.map((s, i) =>
      difficultyDayCount[i] ? s / difficultyDayCount[i] : 0,
    );

    const allDiff = (difficultyRows.data ?? []) as { difficulty: string }[];
    const avgDifficultyScore = allDiff.length
      ? allDiff.reduce((acc, r) => acc + diffScore(r.difficulty), 0) / allDiff.length
      : 0;
    const avgDifficultyLabel: McqDashboardStats["avgDifficultyLabel"] = !allDiff.length
      ? "—"
      : avgDifficultyScore < 1.66
        ? "Easy"
        : avgDifficultyScore < 2.34
          ? "Medium"
          : "Hard";

    const attempted30dCount = (attempts30d.data ?? []).length;

    const activity: McqDashboardStats["recentActivity"] = [
      ...(recentMcqs.data ?? []).map(
        (r: { id: string; question: string; status: string; created_at: string }) => ({
          id: r.id,
          kind: "mcq" as const,
          title: r.question?.slice(0, 90) ?? "MCQ",
          status: r.status,
          created_at: r.created_at,
        }),
      ),
      ...(recentQuizzes.data ?? []).map(
        (r: { id: string; title: string; status: string; created_at: string }) => ({
          id: r.id,
          kind: "quiz" as const,
          title: r.title ?? "Quiz",
          status: r.status,
          created_at: r.created_at,
        }),
      ),
      ...(recentMocks.data ?? []).map(
        (r: { id: string; title: string; status: string; created_at: string }) => ({
          id: r.id,
          kind: "mock" as const,
          title: r.title ?? "Mock test",
          status: r.status,
          created_at: r.created_at,
        }),
      ),
      ...(recentChapters.data ?? []).map(
        (r: { id: string; name: string; status: string; updated_at: string }) => ({
          id: r.id,
          kind: "chapter" as const,
          title: r.name ?? "Chapter",
          status: r.status,
          created_at: r.updated_at,
        }),
      ),
      ...(recentSubjects.data ?? []).map(
        (r: { id: string; name: string; status: string; updated_at: string }) => ({
          id: r.id,
          kind: "subject" as const,
          title: r.name ?? "Subject",
          status: r.status,
          created_at: r.updated_at,
        }),
      ),
    ]
      .filter((a) => !!a.created_at)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 12);

    return {
      totalMcqs: mcqTotal.count ?? 0,
      publishedMcqs: mcqPublished.count ?? 0,
      draftMcqs: mcqDraft.count ?? 0,
      archivedMcqs: mcqArchived.count ?? 0,
      totalChapters: chaptersTotal.count ?? 0,
      totalSubjects: subjectsTotal.count ?? 0,
      totalQuizzes: quizTotal.count ?? 0,
      totalMocks: mockTotal.count ?? 0,
      questionsToday: mcqsToday.count ?? 0,
      questionsTodayDelta: (mcqsToday.count ?? 0) - (mcqsYesterday.count ?? 0),
      attempted30d: attempted30dCount,
      attempted30dDelta: attempted30dCount - (attemptsPrev30d.count ?? 0),
      avgDifficultyScore,
      avgDifficultyLabel,
      totalsTrend30d,
      publishedTrend30d,
      draftTrend30d,
      difficultyTrend30d,
      attemptedTrend30d,
      statusBreakdown: {
        published: mcqPublished.count ?? 0,
        draft: mcqDraft.count ?? 0,
        archived: mcqArchived.count ?? 0,
        review: 0,
      },
      lastSyncAt: (lastUpdated.data?.[0]?.updated_at as string | undefined) ?? null,
      recentActivity: activity,
    };
  });

// ---------- Levels (admin view) ----------
export const adminListLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data, error } = await context.supabase
      .from("levels")
      .select("code,name,color,icon,sort_order,status")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

const subjectInput = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(500).nullable().optional(),
  status: statusEnum.default("published"),
  sort_order: z.number().int().min(0).max(9999).default(0),
});

export const adminCreateSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof subjectInput>) => subjectInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: row, error } = await context.supabase
      .from("subjects")
      .insert(data)
      .select("id,name,slug,status,sort_order")
      .single();
    if (error) throw error;
    return row;
  });

// ---------- Chapters ----------
export const adminListChapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { subjectId: string }) => z.object({ subjectId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: rows, error } = await context.supabase
      .from("chapters")
      .select("id,name,slug,description,sort_order,status,subject_id,updated_at")
      .eq("subject_id", data.subjectId)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

// List ALL chapters across subjects (optionally filtered by level/subject).
// Used by Quiz Generator → Select Source multi-picker so newly added/updated
// chapters always appear immediately.
export const adminListAllChapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { level?: string | null; subjectId?: string | null } | undefined) =>
    z
      .object({
        level: z.string().trim().max(40).nullable().optional(),
        subjectId: z.string().uuid().nullable().optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    let subjectIds: string[] | null = null;
    if (data.subjectId) {
      subjectIds = [data.subjectId];
    } else if (data.level) {
      const { data: subs, error: se } = await sb
        .from("subjects")
        .select("id")
        .eq("level", data.level);
      if (se) throw se;
      subjectIds = (subs ?? []).map((s: { id: string }) => s.id);
      if (subjectIds.length === 0) return [];
    }
    let q = sb
      .from("chapters")
      .select("id,name,subject_id,status,sort_order,updated_at")
      .order("updated_at", { ascending: false });
    if (subjectIds) q = q.in("subject_id", subjectIds);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

const chapterInput = z.object({
  subject_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().trim().max(500).nullable().optional(),
  status: statusEnum.default("published"),
  sort_order: z.number().int().min(0).max(9999).default(0),
});

export const adminCreateChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof chapterInput>) => chapterInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: row, error } = await context.supabase
      .from("chapters")
      .insert(data)
      .select("id,name,slug,status,sort_order,subject_id")
      .single();
    if (error) throw error;
    return row;
  });

// ---------- MCQs ----------
const listInput = z.object({
  chapterId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  status: statusEnum.optional(),
  difficulty: difficultyEnum.optional(),
  page: z.number().int().min(1).max(2000).default(1),
  pageSize: z.number().int().min(1).max(500).default(20),
});

export const adminListMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listInput>) => listInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = context.supabase
      .from("mcqs")
      .select(
        "id,question,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty,status,tags,chapter_id,updated_at,created_at,sort_order",
        { count: "exact" },
      )
      // Preserve bulk-import source order. NULL sort_order rows (legacy) fall
      // back to created_at so historical data keeps its previous sequence.
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    if (data.status) q = q.eq("status", data.status);
    if (data.difficulty) q = q.eq("difficulty", data.difficulty);
    if (data.search) q = q.ilike("question", `%${data.search}%`);

    // subjectId filter requires a join — do a 2-step
    if (data.subjectId && !data.chapterId) {
      const { data: chRows, error: ce } = await context.supabase
        .from("chapters")
        .select("id")
        .eq("subject_id", data.subjectId);
      if (ce) throw ce;
      const ids = (chRows ?? []).map((c) => c.id);
      if (ids.length === 0) return { rows: [], count: 0, page: data.page, pageSize: data.pageSize };
      q = q.in("chapter_id", ids);
    }

    const { data: rows, error, count } = await q;
    if (error) throw error;
    const baseRows = (rows ?? []) as Array<
      Record<string, unknown> & { id: string; chapter_id: string }
    >;

    // Enrich: chapter & subject names, attempt counts from activity_events.
    const chapterIds = Array.from(new Set(baseRows.map((r) => r.chapter_id).filter(Boolean)));
    const mcqIds = baseRows.map((r) => r.id);
    const [chRes, attRes] = await Promise.all([
      chapterIds.length
        ? context.supabase
            .from("chapters")
            .select("id,name,subject_id,subjects(id,name)")
            .in("id", chapterIds)
        : Promise.resolve({ data: [] as unknown[] }),
      mcqIds.length
        ? context.supabase
            .from("activity_events")
            .select("target_id")
            .eq("target_kind", "mcq")
            .in("target_id", mcqIds)
            .limit(50000)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);
    type ChRow = {
      id: string;
      name: string;
      subject_id: string;
      subjects: { id: string; name: string } | { id: string; name: string }[] | null;
    };
    const chMap = new Map<string, { name: string; subject: string }>();
    for (const c of (chRes.data ?? []) as ChRow[]) {
      const sub = Array.isArray(c.subjects) ? c.subjects[0] : c.subjects;
      chMap.set(c.id, { name: c.name, subject: sub?.name ?? "" });
    }
    const attMap = new Map<string, number>();
    for (const a of (attRes.data ?? []) as { target_id: string }[]) {
      if (!a.target_id) continue;
      attMap.set(a.target_id, (attMap.get(a.target_id) ?? 0) + 1);
    }
    const enriched = baseRows.map((r) => {
      const out = r as unknown as Record<string, unknown>;
      out.chapter_name = chMap.get(r.chapter_id)?.name ?? null;
      out.subject_name = chMap.get(r.chapter_id)?.subject ?? null;
      out.attempts = attMap.get(r.id) ?? 0;
      return out;
    }) as unknown as Array<{
      id: string;
      question: string;
      option_a: string;
      option_b: string;
      option_c: string;
      option_d: string;
      correct_option: string;
      explanation: string | null;
      difficulty: "easy" | "medium" | "hard";
      status: "draft" | "published" | "archived";
      tags: string[];
      chapter_id: string;
      updated_at: string;
      chapter_name: string | null;
      subject_name: string | null;
      attempts: number;
    }>;
    return { rows: enriched, count: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

export const adminCreateMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof mcqInputSchema>) => mcqInputSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: row, error } = await context.supabase
      .from("mcqs")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

const updateInput = mcqInputBase
  .partial()
  .extend({
    id: z.string().uuid(),
  })
  .superRefine(refineMcq);
export const adminUpdateMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof updateInput>) => updateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("mcqs").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase.from("mcqs").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Bulk delete (selected ids) ----------
const bulkDeleteInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(5000),
  level: z.string().trim().max(40).nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  chapterId: z.string().uuid().nullable().optional(),
});
export const adminBulkDeleteMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof bulkDeleteInput>) => bulkDeleteInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const ids = data.ids;
    const chunkSize = 500;
    let deleted = 0;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const { error, count } = await context.supabase
        .from("mcqs")
        .delete({ count: "exact" })
        .in("id", slice);
      if (error) throw error;
      deleted += count ?? slice.length;
    }
    try {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("display_name")
        .eq("id", context.userId)
        .maybeSingle();
      await (
        context.supabase as unknown as {
          from: (t: string) => { insert: (v: unknown) => Promise<unknown> };
        }
      )
        .from("mcq_delete_audit")
        .insert({
          admin_id: context.userId,
          admin_name: prof?.display_name ?? null,
          deleted_count: deleted,
          scope: "selected",
          level: data.level ?? null,
          subject_id: data.subjectId ?? null,
          chapter_id: data.chapterId ?? null,
          mcq_ids: ids,
        });
    } catch {
      /* non-fatal */
    }
    return { deleted };
  });

// ---------- Delete all matching current scope ----------
const deleteAllInput = z
  .object({
    level: z.string().trim().max(40).nullable().optional(),
    subjectId: z.string().uuid().nullable().optional(),
    chapterId: z.string().uuid().nullable().optional(),
    confirm: z.literal("DELETE"),
  })
  .refine((v) => !!(v.chapterId || v.subjectId || v.level), {
    message: "A level, subject, or chapter scope is required",
  });
export const adminDeleteAllMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof deleteAllInput>) => deleteAllInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");

    let chapterIds: string[] = [];
    if (data.chapterId) {
      chapterIds = [data.chapterId];
    } else if (data.subjectId) {
      const { data: ch, error } = await context.supabase
        .from("chapters")
        .select("id")
        .eq("subject_id", data.subjectId);
      if (error) throw error;
      chapterIds = (ch ?? []).map((c) => c.id);
    } else if (data.level) {
      const { data: subs, error: se } = await context.supabase
        .from("subjects")
        .select("id")
        .eq("level", data.level);
      if (se) throw se;
      const sIds = (subs ?? []).map((s) => s.id);
      if (sIds.length === 0) return { deleted: 0 };
      const { data: ch, error } = await context.supabase
        .from("chapters")
        .select("id")
        .in("subject_id", sIds);
      if (error) throw error;
      chapterIds = (ch ?? []).map((c) => c.id);
    }
    if (chapterIds.length === 0) return { deleted: 0 };

    let deleted = 0;
    const chunkSize = 200;
    for (let i = 0; i < chapterIds.length; i += chunkSize) {
      const slice = chapterIds.slice(i, i + chunkSize);
      const { error, count } = await context.supabase
        .from("mcqs")
        .delete({ count: "exact" })
        .in("chapter_id", slice);
      if (error) throw error;
      deleted += count ?? 0;
    }
    try {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("display_name")
        .eq("id", context.userId)
        .maybeSingle();
      await (
        context.supabase as unknown as {
          from: (t: string) => { insert: (v: unknown) => Promise<unknown> };
        }
      )
        .from("mcq_delete_audit")
        .insert({
          admin_id: context.userId,
          admin_name: prof?.display_name ?? null,
          deleted_count: deleted,
          scope: "all",
          level: data.level ?? null,
          subject_id: data.subjectId ?? null,
          chapter_id: data.chapterId ?? null,
          mcq_ids: [],
        });
    } catch {
      /* non-fatal */
    }
    return { deleted };
  });

export const adminSetMcqStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; status: z.infer<typeof statusEnum> }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("mcqs")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------- Bulk import ----------
const bulkInput = z.object({
  chapter_id: z.string().uuid(),
  defaults: z
    .object({
      difficulty: difficultyEnum.optional(),
      status: statusEnum.optional(),
    })
    .optional(),
  items: z.array(mcqBulkImportItemSchema).min(1).max(500),
});

export const adminBulkImportMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof bulkInput>) => bulkInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    await enforceRateLimit(
      context.supabase,
      rateLimitKey("admin:bulk_upload", "user", context.userId),
      RATE_LIMITS.BULK_UPLOAD,
    );
    const existingFingerprints = new Set<string>();
    const existingPageSize = 1000;
    for (let from = 0; ; from += existingPageSize) {
      const { data: existingRows, error: existingError } = await context.supabase
        .from("mcqs")
        .select("question,option_a,option_b,option_c,option_d")
        .eq("chapter_id", data.chapter_id)
        .range(from, from + existingPageSize - 1);
      if (existingError) throw existingError;
      for (const row of existingRows ?? []) {
        const fp = fingerprintQuestion(row);
        if (fp) existingFingerprints.add(fp);
      }
      if (!existingRows || existingRows.length < existingPageSize) break;
    }

    const failed: Array<{ sourceIndex: number; reason: string }> = [];
    const accepted = [] as typeof data.items;
    for (let i = 0; i < data.items.length; i += 1) {
      const item = data.items[i];
      const fp = fingerprintQuestion(item);
      if (fp && existingFingerprints.has(fp)) {
        failed.push({ sourceIndex: item.sourceIndex ?? i + 1, reason: "Duplicate Question" });
        continue;
      }
      if (fp) existingFingerprints.add(fp);
      accepted.push(item);
    }

    if (accepted.length === 0) return { inserted: 0, failed };

    // Continue sort_order from the chapter's current max so multiple bulk
    // imports stack in chronological order without ever reshuffling earlier
    // rows. Within this batch, items keep the exact order received from the
    // parser/dialog (which is the original source order).
    const { data: maxRow } = await context.supabase
      .from("mcqs")
      .select("sort_order")
      .eq("chapter_id", data.chapter_id)
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const base = Number((maxRow as { sort_order: number | null } | null)?.sort_order ?? 0);
    const rows = accepted.map(({ sourceIndex: _sourceIndex, ...it }, i) => ({
      ...it,
      chapter_id: data.chapter_id,
      difficulty: it.difficulty ?? data.defaults?.difficulty ?? "medium",
      status: it.status ?? data.defaults?.status ?? "published",
      sort_order: base + i + 1,
      created_by: context.userId,
    }));
    const { error, count } = await context.supabase.from("mcqs").insert(rows, { count: "exact" });
    if (error) throw error;
    return { inserted: count ?? rows.length, failed };
  });