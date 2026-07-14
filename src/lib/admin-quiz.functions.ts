// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";

import { noInput } from "@/lib/validate";
const statusEnum = z.enum(["draft", "published", "archived"]);
const difficultyEnum = z.enum(["easy", "medium", "hard"]);

// ---------- List quizzes ----------
const listInput = z.object({
  search: z.string().trim().max(200).optional(),
  status: statusEnum.optional(),
  scheduled: z.boolean().optional(),
  level: z.string().trim().max(40).optional(),
  subjectId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  kind: z.enum(["quiz", "mock", "all"]).default("quiz"),
  page: z.number().int().min(1).max(2000).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const adminListQuizzes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listInput>) => listInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("quizzes")
      .select(
        "id,title,description,level,subject_id,chapter_id,kind,status,difficulty,total_questions,duration_seconds,starts_at,ends_at,is_public,created_at,updated_at",
        { count: "exact" },
      )
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (data.kind !== "all") q = q.eq("kind", data.kind);
    if (data.scheduled) {
      q = q.eq("status", "published").gt("starts_at", new Date().toISOString());
    } else if (data.status) {
      q = q.eq("status", data.status);
    }
    if (data.level) q = q.eq("level", data.level);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error, count } = await q;
    if (error) throw error;
    return { rows: rows ?? [], count: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

// ---------- Stats ----------
export const adminQuizStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const twoMonthsAgo = new Date(now.getTime() - 60 * 86400_000).toISOString();
    const nowIso = now.toISOString();

    const [
      total,
      pub,
      draft,
      archived,
      scheduled,
      attempts,
      attemptsThis,
      attemptsPrev,
      totalThisMonth,
      totalPrev,
      pubThisMonth,
      pubPrev,
      draftThisMonth,
      draftPrev,
      recentAttemptsRows,
      avgRows,
      completedThis,
      startedThis,
      activeUsersRows,
      aiGen,
      aiGenPrev,
      inProgressRows,
      latestSubmissionsRows,
    ] = await Promise.all([
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "quiz"),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "published"),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "draft"),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "archived"),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "published")
        .gt("starts_at", nowIso),
      sb.from("exam_attempts").select("id", { count: "exact", head: true }),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthAgo),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", twoMonthsAgo)
        .lt("created_at", monthAgo),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .gte("created_at", monthAgo),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .gte("created_at", twoMonthsAgo)
        .lt("created_at", monthAgo),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "published")
        .gte("updated_at", monthAgo),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "published")
        .gte("updated_at", twoMonthsAgo)
        .lt("updated_at", monthAgo),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "draft")
        .gte("created_at", monthAgo),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "draft")
        .gte("created_at", twoMonthsAgo)
        .lt("created_at", monthAgo),
      sb
        .from("exam_attempts")
        .select("created_at")
        .eq("kind", "quiz")
        .gte("created_at", new Date(now.getTime() - 7 * 86400_000).toISOString())
        .limit(5000),
      sb
        .from("exam_attempts")
        .select("id,user_id,status,score,total_count,created_at,completed_at,duration_seconds")
        .eq("kind", "quiz")
        .gte("created_at", monthAgo)
        .limit(5000),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "completed"),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz"),
      sb
        .from("exam_attempts")
        .select("user_id")
        .eq("kind", "quiz")
        .gte("created_at", new Date(now.getTime() - 86400_000).toISOString())
        .limit(5000),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .ilike("title", "[Auto]%"),
      sb
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .ilike("title", "[Auto]%")
        .gte("created_at", twoMonthsAgo)
        .lt("created_at", monthAgo),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("kind", "quiz")
        .eq("status", "in_progress"),
      sb
        .from("exam_attempts")
        .select("id,user_id,score,total_count,completed_at,duration_seconds")
        .eq("kind", "quiz")
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(5),
    ]);

    const pct = (cur: number, prev: number) => {
      if (!prev) return cur > 0 ? 100 : 0;
      return Math.round(((cur - prev) / prev) * 1000) / 10;
    };

    const dayBuckets: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000);
      dayBuckets[d.toISOString().slice(0, 10)] = 0;
    }
    for (const r of (recentAttemptsRows.data ?? []) as Array<{ created_at: string }>) {
      const k = (r.created_at || "").slice(0, 10);
      if (k in dayBuckets) dayBuckets[k]++;
    }
    const attemptsByDay = Object.entries(dayBuckets).map(([d, c]) => ({ d, c }));

    const dayBuckets30: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400_000);
      dayBuckets30[d.toISOString().slice(0, 10)] = 0;
    }
    let scoreSum = 0;
    let scoreDen = 0;
    let highScore = 0;
    let lowScore: number | null = null;
    let passCount = 0;
    let failCount = 0;
    let durSum = 0;
    let durDen = 0;
    // Per-student aggregation for Avg. Score / Performance Score:
    // average each student's own quiz-score percentages first, then average
    // across students. Only valid, completed attempts are counted; duplicates
    // by attempt id are ignored.
    const perUser = new Map<string, { sum: number; den: number }>();
    const seenAttemptIds = new Set<string>();
    for (const r of (avgRows.data ?? []) as Array<{
      id: string;
      user_id: string | null;
      status: string | null;
      created_at: string;
      completed_at: string | null;
      score: number | null;
      total_count: number | null;
      duration_seconds: number | null;
    }>) {
      const k = (r.created_at || "").slice(0, 10);
      if (k in dayBuckets30) dayBuckets30[k]++;
      // Performance Score / Avg Score: ONLY valid completed quiz attempts.
      const isValid =
        r.status === "completed" &&
        !!r.completed_at &&
        typeof r.score === "number" &&
        typeof r.total_count === "number" &&
        r.total_count > 0 &&
        !!r.user_id &&
        !seenAttemptIds.has(r.id);
      if (isValid) {
        seenAttemptIds.add(r.id);
        const rawPct = ((r.score as number) / (r.total_count as number)) * 100;
        const pctScore = Math.max(0, Math.min(100, rawPct));
        scoreSum += pctScore;
        scoreDen++;
        if (pctScore > highScore) highScore = pctScore;
        if (lowScore === null || pctScore < lowScore) lowScore = pctScore;
        if (pctScore >= 50) passCount++;
        else failCount++;
        if (typeof r.duration_seconds === "number" && r.duration_seconds > 0) {
          durSum += r.duration_seconds;
          durDen++;
        }
        const uid = r.user_id as string;
        const bucket = perUser.get(uid) ?? { sum: 0, den: 0 };
        bucket.sum += pctScore;
        bucket.den++;
        perUser.set(uid, bucket);
      }
    }
    const attemptsTrend30 = Object.entries(dayBuckets30).map(([d, c]) => ({ d, c }));
    // Avg. Score = average of each student's average percentage (out of 100).
    let userAvgSum = 0;
    let userAvgDen = 0;
    for (const { sum, den } of perUser.values()) {
      if (den > 0) {
        userAvgSum += sum / den;
        userAvgDen++;
      }
    }
    const avgScore = userAvgDen ? Math.round((userAvgSum / userAvgDen) * 10) / 10 : 0;
    const passRate = scoreDen ? Math.round((passCount / scoreDen) * 1000) / 10 : 0;
    const failRate = scoreDen ? Math.round((failCount / scoreDen) * 1000) / 10 : 0;
    const highestScore = scoreDen ? Math.round(highScore * 10) / 10 : 0;
    const lowestScore = scoreDen && lowScore !== null ? Math.round(lowScore * 10) / 10 : 0;
    const avgDurationSec = durDen ? Math.round(durSum / durDen) : 0;

    // Completion Rate = completed quiz attempts / total quiz attempts started × 100
    const startedCount = startedThis.count ?? 0;
    const completedCount = completedThis.count ?? 0;
    const completionRate = startedCount
      ? Math.round((completedCount / startedCount) * 1000) / 10
      : 0;
    const activeUsers = new Set(
      ((activeUsersRows.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
    ).size;
    // Performance Score = average of each student's average percentage
    // (out of 100) over valid, completed quiz attempts in the selected window.
    const performanceScore = avgScore;

    const latestSubmissions = (
      (latestSubmissionsRows.data ?? []) as Array<{
        id: string;
        score: number;
        total_count: number;
        completed_at: string;
        duration_seconds: number | null;
      }>
    ).map((r) => ({
      id: r.id,
      score: r.score,
      total: r.total_count,
      pct: r.total_count > 0 ? Math.round((r.score / r.total_count) * 1000) / 10 : 0,
      completed_at: r.completed_at,
      duration_seconds: r.duration_seconds ?? 0,
    }));

    return {
      total: total.count ?? 0,
      published: pub.count ?? 0,
      draft: draft.count ?? 0,
      archived: archived.count ?? 0,
      scheduled: scheduled.count ?? 0,
      attempts: attempts.count ?? 0,
      avgScore,
      completionRate,
      activeUsers,
      performanceScore,
      aiGenerated: aiGen.count ?? 0,
      inProgress: inProgressRows.count ?? 0,
      completedAttempts: completedCount,
      passRate,
      failRate,
      highestScore,
      lowestScore,
      avgDurationSec,
      latestSubmissions,
      deltas: {
        total: pct(totalThisMonth.count ?? 0, totalPrev.count ?? 0),
        published: pct(pubThisMonth.count ?? 0, pubPrev.count ?? 0),
        draft: pct(draftThisMonth.count ?? 0, draftPrev.count ?? 0),
        attempts: pct(attemptsThis.count ?? 0, attemptsPrev.count ?? 0),
        aiGenerated: pct(aiGen.count ?? 0, aiGenPrev.count ?? 0),
      },
      attemptsByDay,
      attemptsTrend30,
    };
  });

// ---------- Create / Update / Delete ----------
const quizInput = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(500).nullable().optional(),
  level: z.string().trim().min(1).max(40),
  subject_id: z.string().uuid().nullable().optional(),
  chapter_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["quiz", "mock"]).default("quiz"),
  status: statusEnum.default("draft"),
  difficulty: difficultyEnum.default("medium"),
  total_questions: z.number().int().min(1).max(200).default(10),
  duration_seconds: z
    .number()
    .int()
    .min(30)
    .max(60 * 60 * 6)
    .default(900),
  starts_at: z.string().datetime().nullable().optional(),
  ends_at: z.string().datetime().nullable().optional(),
  is_public: z.boolean().default(true),
  randomize_options: z.boolean().default(false),
  randomize_questions: z.boolean().default(true),
  passing_marks: z.number().int().min(0).max(1000).default(0),
  negative_marking: z.number().min(0).max(10).default(0),
});

export const adminCreateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof quizInput>) => quizInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: row, error } = await context.supabase
      .from("quizzes")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return row;
  });

const updateQuizInput = quizInput.partial().extend({ id: z.string().uuid() });
export const adminUpdateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof updateQuizInput>) => updateQuizInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("quizzes").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase.from("quizzes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetQuizStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; status: z.infer<typeof statusEnum> }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("quizzes")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDuplicateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    const { data: src, error } = await sb.from("quizzes").select("*").eq("id", data.id).single();
    if (error) throw error;
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = src;
    void _id;
    void _c;
    void _u;
    const { data: row, error: ie } = await sb
      .from("quizzes")
      .insert({
        ...rest,
        title: `${rest.title} (Copy)`,
        status: "draft",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (ie) throw ie;
    // copy quiz_questions
    const { data: qqs } = await sb
      .from("quiz_questions")
      .select("mcq_id,position")
      .eq("quiz_id", data.id);
    if (qqs?.length) {
      await sb
        .from("quiz_questions")
        .insert(qqs.map((q: { mcq_id: string; position: number }) => ({ ...q, quiz_id: row.id })));
    }
    return row;
  });

// ---------- Quiz questions ----------
export const adminGetQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { quizId: string }) => z.object({ quizId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: rows, error } = await context.supabase
      .from("quiz_questions")
      .select("id,mcq_id,position")
      .eq("quiz_id", data.quizId)
      .order("position", { ascending: true });
    if (error) throw error;
    return rows ?? [];
  });

export const adminSetQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { quizId: string; mcqIds: string[] }) =>
    z
      .object({
        quizId: z.string().uuid(),
        mcqIds: z.array(z.string().uuid()).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    // Verify the target quiz exists before mutating quiz_questions, otherwise a
    // crafted UUID silently no-ops the delete but inserts orphaned rows.
    const { data: quizRow, error: quizErr } = await sb
      .from("quizzes")
      .select("id")
      .eq("id", data.quizId)
      .maybeSingle();
    if (quizErr) throw quizErr;
    if (!quizRow) throw new Error("Quiz not found");
    await sb.from("quiz_questions").delete().eq("quiz_id", data.quizId);
    if (data.mcqIds.length) {
      const rows = data.mcqIds.map((mcq_id, i) => ({ quiz_id: data.quizId, mcq_id, position: i }));
      const { error } = await sb.from("quiz_questions").insert(rows);
      if (error) throw error;
    }
    await sb.from("quizzes").update({ total_questions: data.mcqIds.length }).eq("id", data.quizId);
    return { ok: true, count: data.mcqIds.length };
  });

// ---------- Auto-generate quizzes from existing MCQ pool ----------
function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const autoGenInput = z
  .object({
    level: z.string().trim().max(40).nullable().optional(),
    subjectId: z.string().uuid().nullable().optional(),
    chapterId: z.string().uuid().nullable().optional(),
    chapterIds: z.array(z.string().uuid()).max(500).optional(),
    questionCount: z.number().int().min(1).max(200).default(10),
    durationMinutes: z.number().int().min(1).max(360).default(15),
    overwrite: z.boolean().default(true),
    publish: z.boolean().default(true),
    randomizeOptions: z.boolean().default(true),
  })
  .refine(
    (v) => !!(v.chapterId || (v.chapterIds && v.chapterIds.length > 0) || v.subjectId || v.level),
    {
      message: "A level, subject, or chapter scope is required",
    },
  );

export const adminAutoGenerateQuizzes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof autoGenInput>) => autoGenInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;

    let chapterIds: string[] = [];
    if (data.chapterIds && data.chapterIds.length > 0) {
      chapterIds = Array.from(new Set(data.chapterIds));
    } else if (data.chapterId) {
      chapterIds = [data.chapterId];
    } else if (data.subjectId) {
      const { data: ch, error } = await sb
        .from("chapters")
        .select("id")
        .eq("subject_id", data.subjectId);
      if (error) throw error;
      chapterIds = (ch ?? []).map((c: { id: string }) => c.id);
    } else if (data.level) {
      const { data: subs, error: se } = await sb
        .from("subjects")
        .select("id")
        .eq("level", data.level);
      if (se) throw se;
      const sIds = (subs ?? []).map((s: { id: string }) => s.id);
      if (sIds.length === 0) return { created: 0, updated: 0, skipped: 0, results: [] };
      const { data: ch, error } = await sb.from("chapters").select("id").in("subject_id", sIds);
      if (error) throw error;
      chapterIds = (ch ?? []).map((c: { id: string }) => c.id);
    }
    if (chapterIds.length === 0) return { created: 0, updated: 0, skipped: 0, results: [] };

    const { data: chRows, error: cErr } = await sb
      .from("chapters")
      .select("id,name,subject_id")
      .in("id", chapterIds);
    if (cErr) throw cErr;
    const subjectIds = Array.from(
      new Set((chRows ?? []).map((c: { subject_id: string }) => c.subject_id)),
    );
    const subjResp = subjectIds.length
      ? await sb.from("subjects").select("id,level,name").in("id", subjectIds)
      : { data: [] as Array<{ id: string; level: string; name: string }> };
    const subjMap = new Map(
      ((subjResp.data ?? []) as Array<{ id: string; level: string; name: string }>).map((s) => [
        s.id,
        s,
      ]),
    );

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const results: Array<{
      chapterId: string;
      chapter: string;
      status: "created" | "updated" | "skipped";
      reason?: string;
      quizId?: string;
      picked?: number;
    }> = [];

    for (const ch of (chRows ?? []) as Array<{ id: string; name: string; subject_id: string }>) {
      const subj = subjMap.get(ch.subject_id);
      const level = subj?.level ?? data.level ?? "professional";

      const { data: pool, error: pErr } = await sb
        .from("mcqs")
        .select("id")
        .eq("chapter_id", ch.id)
        .eq("status", "published");
      if (pErr) throw pErr;
      const ids = (pool ?? []).map((m: { id: string }) => m.id);
      if (ids.length < 1) {
        skipped++;
        results.push({ chapterId: ch.id, chapter: ch.name, status: "skipped", reason: "no MCQs" });
        continue;
      }
      const target = Math.min(data.questionCount, ids.length);
      const picked = shuffleInPlace([...ids]).slice(0, target);

      const title = `[Auto] ${ch.name}`;
      const { data: existing } = await sb
        .from("quizzes")
        .select("id")
        .eq("chapter_id", ch.id)
        .eq("kind", "quiz")
        .ilike("title", "[Auto] %")
        .limit(1);

      const quizPayload = {
        title,
        description: `Auto-generated quiz from ${ch.name}.`,
        level,
        subject_id: ch.subject_id,
        chapter_id: ch.id,
        kind: "quiz" as const,
        status: (data.publish ? "published" : "draft") as "published" | "draft",
        difficulty: "medium" as const,
        total_questions: target,
        duration_seconds: data.durationMinutes * 60,
        is_public: true,
        randomize_questions: true,
        randomize_options: data.randomizeOptions,
        passing_marks: 0,
        negative_marking: 0,
      };

      let quizId: string;
      if (existing && existing.length > 0 && data.overwrite) {
        quizId = (existing[0] as { id: string }).id;
        const { error: uErr } = await sb.from("quizzes").update(quizPayload).eq("id", quizId);
        if (uErr) throw uErr;
        updated++;
        results.push({
          chapterId: ch.id,
          chapter: ch.name,
          status: "updated",
          quizId,
          picked: target,
        });
      } else if (existing && existing.length > 0 && !data.overwrite) {
        skipped++;
        results.push({
          chapterId: ch.id,
          chapter: ch.name,
          status: "skipped",
          reason: "auto quiz exists",
          quizId: (existing[0] as { id: string }).id,
        });
        continue;
      } else {
        const { data: ins, error: iErr } = await sb
          .from("quizzes")
          .insert({ ...quizPayload, created_by: context.userId })
          .select("id")
          .single();
        if (iErr) throw iErr;
        quizId = (ins as { id: string }).id;
        created++;
        results.push({
          chapterId: ch.id,
          chapter: ch.name,
          status: "created",
          quizId,
          picked: target,
        });
      }

      await sb.from("quiz_questions").delete().eq("quiz_id", quizId);
      const rows = picked.map((mcq_id, i) => ({ quiz_id: quizId, mcq_id, position: i }));
      if (rows.length) {
        const { error: qErr } = await sb.from("quiz_questions").insert(rows);
        if (qErr) throw qErr;
      }
    }

    return { created, updated, skipped, results };
  });

// ---------- Regenerate a single quiz with fresh random MCQs from its chapter ----------
const regenInput = z.object({
  quizId: z.string().uuid(),
  questionCount: z.number().int().min(1).max(200).optional(),
});
export const adminRegenerateQuizQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof regenInput>) => regenInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    const { data: quiz, error: qErr } = await sb
      .from("quizzes")
      .select("id,chapter_id,total_questions")
      .eq("id", data.quizId)
      .single();
    if (qErr) throw qErr;
    if (!quiz?.chapter_id) throw new Error("Quiz has no chapter scope to regenerate from");
    const target = data.questionCount ?? quiz.total_questions ?? 10;

    const { data: pool, error: pErr } = await sb
      .from("mcqs")
      .select("id")
      .eq("chapter_id", quiz.chapter_id)
      .eq("status", "published");
    if (pErr) throw pErr;
    const ids = (pool ?? []).map((m: { id: string }) => m.id);
    if (ids.length === 0) throw new Error("No published MCQs available in this chapter");

    const picked = shuffleInPlace([...ids]).slice(0, Math.min(target, ids.length));
    await sb.from("quiz_questions").delete().eq("quiz_id", data.quizId);
    const rows = picked.map((mcq_id, i) => ({ quiz_id: data.quizId, mcq_id, position: i }));
    const { error: iErr } = await sb.from("quiz_questions").insert(rows);
    if (iErr) throw iErr;
    await sb.from("quizzes").update({ total_questions: picked.length }).eq("id", data.quizId);
    return { ok: true, picked: picked.length };
  });

// ---------- Bulk actions ----------
const bulkInput = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["publish", "unpublish", "archive", "delete", "duplicate"]),
});
export const adminBulkQuizAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof bulkInput>) => bulkInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    if (data.action === "delete") {
      const { error } = await sb.from("quizzes").delete().in("id", data.ids);
      if (error) throw error;
      return { ok: true, count: data.ids.length };
    }
    if (data.action === "publish" || data.action === "unpublish" || data.action === "archive") {
      const status =
        data.action === "publish"
          ? "published"
          : data.action === "unpublish"
            ? "draft"
            : "archived";
      const { error } = await sb.from("quizzes").update({ status }).in("id", data.ids);
      if (error) throw error;
      return { ok: true, count: data.ids.length };
    }
    // duplicate
    let count = 0;
    for (const id of data.ids) {
      const { data: src, error } = await sb.from("quizzes").select("*").eq("id", id).single();
      if (error) continue;
      const { id: _id, created_at: _c, updated_at: _u, ...rest } = src;
      void _id;
      void _c;
      void _u;
      const { data: row } = await sb
        .from("quizzes")
        .insert({
          ...rest,
          title: `${rest.title} (Copy)`,
          status: "draft",
          created_by: context.userId,
        })
        .select("id")
        .single();
      if (!row) continue;
      const { data: qqs } = await sb
        .from("quiz_questions")
        .select("mcq_id,position")
        .eq("quiz_id", id);
      if (qqs?.length) {
        await sb
          .from("quiz_questions")
          .insert(
            qqs.map((q: { mcq_id: string; position: number }) => ({ ...q, quiz_id: row.id })),
          );
      }
      count++;
    }
    return { ok: true, count };
  });

// ---------- Export quizzes ----------
const exportInput = z.object({
  ids: z.array(z.string().uuid()).max(2000).optional(),
  format: z.enum(["csv", "json"]).default("csv"),
});
export const adminExportQuizzes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof exportInput>) => exportInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    let q = context.supabase
      .from("quizzes")
      .select(
        "id,title,description,level,status,difficulty,total_questions,duration_seconds,starts_at,ends_at,created_at,updated_at",
      )
      .eq("kind", "quiz")
      .order("updated_at", { ascending: false })
      .limit(2000);
    if (data.ids?.length) q = q.in("id", data.ids);
    const { data: rows, error } = await q;
    if (error) throw error;
    const list = (rows ?? []) as Array<Record<string, unknown>>;
    if (data.format === "json")
      return {
        content: JSON.stringify(list, null, 2),
        filename: `quizzes-${Date.now()}.json`,
        mime: "application/json",
      };
    const headers = [
      "id",
      "title",
      "description",
      "level",
      "status",
      "difficulty",
      "total_questions",
      "duration_seconds",
      "starts_at",
      "ends_at",
      "created_at",
      "updated_at",
    ];
    const esc = (v: unknown) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const csv = [
      headers.join(","),
      ...list.map((r) => headers.map((h) => esc(r[h])).join(",")),
    ].join("\n");
    return { content: csv, filename: `quizzes-${Date.now()}.csv`, mime: "text/csv" };
  });

// ============================================================
// KPI CARD DETAILS — drives the click-through dialogs
// ============================================================
const cardMetric = z.enum([
  "total",
  "published",
  "draft",
  "scheduled",
  "archived",
  "attempts",
  "completion_rate",
  "avg_score",
  "active_users",
  "performance_score",
  "ai_generated",
]);

type QuizLite = {
  id: string;
  title: string;
  status: string;
  level: string | null;
  subject_id: string | null;
  total_questions: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};
type AttemptRow = {
  id: string;
  user_id: string;
  quiz_id: string | null;
  title: string | null;
  score: number;
  total_count: number;
  correct_count: number;
  duration_seconds: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export const adminQuizCardDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { metric: z.infer<typeof cardMetric>; search?: string; limit?: number }) =>
    z
      .object({
        metric: cardMetric,
        search: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    const limit = data.limit ?? 100;
    const search = data.search?.trim() || "";
    const nowIso = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

    const baseQuizSelect =
      "id,title,status,level,subject_id,total_questions,starts_at,ends_at,created_at,updated_at";
    const buildQuizQuery = () => {
      let q = sb
        .from("quizzes")
        .select(baseQuizSelect)
        .eq("kind", "quiz")
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (search) q = q.ilike("title", `%${search}%`);
      return q;
    };

    // ---------- Quiz list metrics ----------
    if (
      ["total", "published", "draft", "scheduled", "archived", "ai_generated"].includes(data.metric)
    ) {
      let q = buildQuizQuery();
      if (data.metric === "published") q = q.eq("status", "published");
      else if (data.metric === "draft") q = q.eq("status", "draft");
      else if (data.metric === "archived") q = q.eq("status", "archived");
      else if (data.metric === "scheduled") q = q.eq("status", "published").gt("starts_at", nowIso);
      else if (data.metric === "ai_generated") q = q.ilike("title", "[Auto]%");
      const { data: rows, error } = await q;
      if (error) throw error;
      const quizzes = (rows ?? []) as QuizLite[];
      const ids = quizzes.map((r) => r.id);
      // attempts/avg per quiz
      const attemptsAgg: Record<string, { attempts: number; scoreSum: number; scoreDen: number }> =
        {};
      if (ids.length) {
        const { data: at } = await sb
          .from("exam_attempts")
          .select("quiz_id,score,total_count")
          .in("quiz_id", ids)
          .limit(5000);
        for (const a of (at ?? []) as Array<{
          quiz_id: string;
          score: number;
          total_count: number;
        }>) {
          const b = attemptsAgg[a.quiz_id] ?? { attempts: 0, scoreSum: 0, scoreDen: 0 };
          b.attempts += 1;
          if (a.total_count > 0) {
            b.scoreSum += (a.score / a.total_count) * 100;
            b.scoreDen += 1;
          }
          attemptsAgg[a.quiz_id] = b;
        }
      }
      const subjectIds = Array.from(
        new Set(quizzes.map((q) => q.subject_id).filter(Boolean) as string[]),
      );
      const subjectMap: Record<string, string> = {};
      if (subjectIds.length) {
        const { data: subs } = await sb.from("subjects").select("id,name").in("id", subjectIds);
        for (const s of (subs ?? []) as Array<{ id: string; name: string }>)
          subjectMap[s.id] = s.name;
      }
      // status breakdown across the entire dataset (not just current page)
      const [tot, pub, drf, arc, sch, ai] = await Promise.all([
        sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "quiz"),
        sb
          .from("quizzes")
          .select("id", { count: "exact", head: true })
          .eq("kind", "quiz")
          .eq("status", "published"),
        sb
          .from("quizzes")
          .select("id", { count: "exact", head: true })
          .eq("kind", "quiz")
          .eq("status", "draft"),
        sb
          .from("quizzes")
          .select("id", { count: "exact", head: true })
          .eq("kind", "quiz")
          .eq("status", "archived"),
        sb
          .from("quizzes")
          .select("id", { count: "exact", head: true })
          .eq("kind", "quiz")
          .eq("status", "published")
          .gt("starts_at", nowIso),
        sb
          .from("quizzes")
          .select("id", { count: "exact", head: true })
          .eq("kind", "quiz")
          .ilike("title", "[Auto]%"),
      ]);
      return {
        kind: "quiz_list" as const,
        metric: data.metric,
        rows: quizzes.map((q) => {
          const a = attemptsAgg[q.id];
          return {
            ...q,
            subject_name: q.subject_id ? (subjectMap[q.subject_id] ?? null) : null,
            attempts: a?.attempts ?? 0,
            avg_score: a && a.scoreDen ? Math.round((a.scoreSum / a.scoreDen) * 10) / 10 : 0,
          };
        }),
        breakdown: {
          total: tot.count ?? 0,
          published: pub.count ?? 0,
          draft: drf.count ?? 0,
          archived: arc.count ?? 0,
          scheduled: sch.count ?? 0,
          ai_generated: ai.count ?? 0,
        },
      };
    }

    // ---------- Attempts ----------
    if (data.metric === "attempts") {
      const { data: at, error } = await sb
        .from("exam_attempts")
        .select(
          "id,user_id,quiz_id,title,score,total_count,correct_count,duration_seconds,status,started_at,completed_at,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      const rows = (at ?? []) as AttemptRow[];
      const uids = Array.from(new Set(rows.map((r) => r.user_id)));
      const profMap: Record<string, string> = {};
      if (uids.length) {
        const { data: ps } = await sb.from("profiles").select("id,display_name").in("id", uids);
        for (const p of (ps ?? []) as Array<{ id: string; display_name: string | null }>) {
          profMap[p.id] = p.display_name ?? p.id.slice(0, 8);
        }
      }
      return {
        kind: "attempts" as const,
        metric: data.metric,
        rows: rows.map((r) => ({
          ...r,
          student: profMap[r.user_id] ?? r.user_id.slice(0, 8),
          accuracy:
            r.total_count > 0 ? Math.round((r.correct_count / r.total_count) * 1000) / 10 : 0,
        })),
      };
    }

    // ---------- Completion rate ----------
    if (data.metric === "completion_rate") {
      const { data: at } = await sb
        .from("exam_attempts")
        .select("subject_id,status,created_at,completed_at")
        .gte("created_at", monthAgo)
        .limit(5000);
      const all = (at ?? []) as Array<{
        subject_id: string | null;
        status: string;
        created_at: string;
        completed_at: string | null;
      }>;
      const byDay: Record<string, { started: number; completed: number }> = {};
      for (let i = 29; i >= 0; i--) {
        const k = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
        byDay[k] = { started: 0, completed: 0 };
      }
      const bySubject: Record<string, { started: number; completed: number }> = {};
      for (const a of all) {
        const k = a.created_at.slice(0, 10);
        if (byDay[k]) {
          byDay[k].started += 1;
          if (a.completed_at) byDay[k].completed += 1;
        }
        if (a.subject_id) {
          const b = bySubject[a.subject_id] ?? { started: 0, completed: 0 };
          b.started += 1;
          if (a.completed_at) b.completed += 1;
          bySubject[a.subject_id] = b;
        }
      }
      const sids = Object.keys(bySubject);
      const sMap: Record<string, string> = {};
      if (sids.length) {
        const { data: subs } = await sb.from("subjects").select("id,name").in("id", sids);
        for (const s of (subs ?? []) as Array<{ id: string; name: string }>) sMap[s.id] = s.name;
      }
      const totalStarted = all.length;
      const totalCompleted = all.filter((a) => a.completed_at).length;
      return {
        kind: "completion" as const,
        metric: data.metric,
        series: Object.entries(byDay).map(([d, v]) => ({
          d,
          started: v.started,
          completed: v.completed,
          rate: v.started ? Math.round((v.completed / v.started) * 1000) / 10 : 0,
        })),
        bySubject: Object.entries(bySubject)
          .map(([id, v]) => ({
            subject_id: id,
            subject_name: sMap[id] ?? "Unknown",
            started: v.started,
            completed: v.completed,
            rate: v.started ? Math.round((v.completed / v.started) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.started - a.started)
          .slice(0, 12),
        totals: {
          started: totalStarted,
          completed: totalCompleted,
          abandoned: totalStarted - totalCompleted,
          rate: totalStarted ? Math.round((totalCompleted / totalStarted) * 1000) / 10 : 0,
        },
      };
    }

    // ---------- Avg score ----------
    if (data.metric === "avg_score") {
      const { data: at } = await sb
        .from("exam_attempts")
        .select("quiz_id,subject_id,score,total_count,created_at,title")
        .gte("created_at", monthAgo)
        .limit(5000);
      const rows = (at ?? []) as Array<{
        quiz_id: string | null;
        subject_id: string | null;
        score: number;
        total_count: number;
        title: string | null;
      }>;
      const buckets = [0, 0, 0, 0, 0]; // 0-20, 20-40, 40-60, 60-80, 80-100
      let high = 0,
        low = 100,
        sum = 0,
        den = 0;
      const perQuiz: Record<string, { sum: number; den: number; title: string }> = {};
      const perSub: Record<string, { sum: number; den: number }> = {};
      for (const r of rows) {
        if (r.total_count <= 0) continue;
        const pct = (r.score / r.total_count) * 100;
        const idx = Math.min(4, Math.floor(pct / 20));
        buckets[idx] += 1;
        if (pct > high) high = pct;
        if (pct < low) low = pct;
        sum += pct;
        den += 1;
        if (r.quiz_id) {
          const b = perQuiz[r.quiz_id] ?? { sum: 0, den: 0, title: r.title ?? "Quiz" };
          b.sum += pct;
          b.den += 1;
          perQuiz[r.quiz_id] = b;
        }
        if (r.subject_id) {
          const b = perSub[r.subject_id] ?? { sum: 0, den: 0 };
          b.sum += pct;
          b.den += 1;
          perSub[r.subject_id] = b;
        }
      }
      const sids = Object.keys(perSub);
      const sMap: Record<string, string> = {};
      if (sids.length) {
        const { data: subs } = await sb.from("subjects").select("id,name").in("id", sids);
        for (const s of (subs ?? []) as Array<{ id: string; name: string }>) sMap[s.id] = s.name;
      }
      return {
        kind: "scores" as const,
        metric: data.metric,
        distribution: [
          { label: "0–20%", count: buckets[0] },
          { label: "20–40%", count: buckets[1] },
          { label: "40–60%", count: buckets[2] },
          { label: "60–80%", count: buckets[3] },
          { label: "80–100%", count: buckets[4] },
        ],
        highest: Math.round(high * 10) / 10,
        lowest: den ? Math.round(low * 10) / 10 : 0,
        average: den ? Math.round((sum / den) * 10) / 10 : 0,
        byQuiz: Object.entries(perQuiz)
          .map(([id, v]) => ({
            quiz_id: id,
            title: v.title,
            avg: Math.round((v.sum / v.den) * 10) / 10,
            attempts: v.den,
          }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 12),
        bySubject: Object.entries(perSub)
          .map(([id, v]) => ({
            subject_id: id,
            subject_name: sMap[id] ?? "Unknown",
            avg: Math.round((v.sum / v.den) * 10) / 10,
            attempts: v.den,
          }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 12),
      };
    }

    // ---------- Active users (24h) ----------
    if (data.metric === "active_users") {
      const { data: at } = await sb
        .from("exam_attempts")
        .select("user_id,created_at,title,score,total_count")
        .gte("created_at", dayAgo)
        .order("created_at", { ascending: false })
        .limit(5000);
      const events = (at ?? []) as Array<{
        user_id: string;
        created_at: string;
        title: string | null;
        score: number;
        total_count: number;
      }>;
      const map: Record<string, { last: string; activity: number; lastQuiz: string | null }> = {};
      for (const e of events) {
        const b = map[e.user_id] ?? { last: e.created_at, activity: 0, lastQuiz: e.title };
        b.activity += 1;
        if (e.created_at > b.last) {
          b.last = e.created_at;
          b.lastQuiz = e.title;
        }
        map[e.user_id] = b;
      }
      const uids = Object.keys(map);
      const pMap: Record<string, { name: string; email: string | null }> = {};
      if (uids.length) {
        const { data: ps } = await sb.from("profiles").select("id,display_name").in("id", uids);
        for (const p of (ps ?? []) as Array<{ id: string; display_name: string | null }>) {
          pMap[p.id] = { name: p.display_name ?? p.id.slice(0, 8), email: null };
        }
      }
      // device from latest login event
      const dMap: Record<string, { device: string | null; browser: string | null }> = {};
      if (uids.length) {
        const { data: le } = await sb
          .from("user_login_events")
          .select("user_id,device,browser,login_at")
          .in("user_id", uids)
          .order("login_at", { ascending: false })
          .limit(2000);
        for (const e of (le ?? []) as Array<{
          user_id: string;
          device: string | null;
          browser: string | null;
        }>) {
          if (!dMap[e.user_id]) dMap[e.user_id] = { device: e.device, browser: e.browser };
        }
      }
      return {
        kind: "active_users" as const,
        metric: data.metric,
        rows: uids
          .map((id) => ({
            user_id: id,
            name: pMap[id]?.name ?? id.slice(0, 8),
            email: pMap[id]?.email ?? null,
            last_seen: map[id].last,
            activity_count: map[id].activity,
            last_quiz: map[id].lastQuiz,
            device: dMap[id]?.device ?? null,
            browser: dMap[id]?.browser ?? null,
          }))
          .sort((a, b) => b.last_seen.localeCompare(a.last_seen)),
        total: uids.length,
      };
    }

    // ---------- Performance score ----------
    if (data.metric === "performance_score") {
      const { data: at } = await sb
        .from("exam_attempts")
        .select("user_id,subject_id,chapter_id,score,total_count,completed_at,created_at")
        .gte("created_at", monthAgo)
        .limit(5000);
      const rows = (at ?? []) as Array<{
        user_id: string;
        subject_id: string | null;
        chapter_id: string | null;
        score: number;
        total_count: number;
        completed_at: string | null;
      }>;
      const perUser: Record<
        string,
        { sum: number; den: number; attempts: number; completed: number }
      > = {};
      const perSub: Record<string, { sum: number; den: number }> = {};
      const perChap: Record<string, { sum: number; den: number }> = {};
      for (const r of rows) {
        if (r.total_count <= 0) continue;
        const pct = (r.score / r.total_count) * 100;
        const u = perUser[r.user_id] ?? { sum: 0, den: 0, attempts: 0, completed: 0 };
        u.sum += pct;
        u.den += 1;
        u.attempts += 1;
        if (r.completed_at) u.completed += 1;
        perUser[r.user_id] = u;
        if (r.subject_id) {
          const b = perSub[r.subject_id] ?? { sum: 0, den: 0 };
          b.sum += pct;
          b.den += 1;
          perSub[r.subject_id] = b;
        }
        if (r.chapter_id) {
          const b = perChap[r.chapter_id] ?? { sum: 0, den: 0 };
          b.sum += pct;
          b.den += 1;
          perChap[r.chapter_id] = b;
        }
      }
      const uids = Object.keys(perUser);
      const pMap: Record<string, string> = {};
      if (uids.length) {
        const { data: ps } = await sb.from("profiles").select("id,display_name").in("id", uids);
        for (const p of (ps ?? []) as Array<{ id: string; display_name: string | null }>) {
          pMap[p.id] = p.display_name ?? p.id.slice(0, 8);
        }
      }
      const sids = Object.keys(perSub);
      const sMap: Record<string, string> = {};
      if (sids.length) {
        const { data: subs } = await sb.from("subjects").select("id,name").in("id", sids);
        for (const s of (subs ?? []) as Array<{ id: string; name: string }>) sMap[s.id] = s.name;
      }
      const cids = Object.keys(perChap);
      const cMap: Record<string, string> = {};
      if (cids.length) {
        const { data: chs } = await sb.from("chapters").select("id,name").in("id", cids);
        for (const c of (chs ?? []) as Array<{ id: string; name: string }>) cMap[c.id] = c.name;
      }
      const users = uids
        .map((id) => ({
          user_id: id,
          name: pMap[id] ?? id.slice(0, 8),
          avg: Math.round((perUser[id].sum / perUser[id].den) * 10) / 10,
          attempts: perUser[id].attempts,
        }))
        .sort((a, b) => b.avg - a.avg);
      return {
        kind: "performance" as const,
        metric: data.metric,
        top: users.slice(0, 10),
        weak: users
          .filter((u) => u.attempts >= 2)
          .slice(-10)
          .reverse(),
        bySubject: sids
          .map((id) => ({
            subject_id: id,
            subject_name: sMap[id] ?? "Unknown",
            avg: Math.round((perSub[id].sum / perSub[id].den) * 10) / 10,
            attempts: perSub[id].den,
          }))
          .sort((a, b) => b.avg - a.avg),
        byChapter: cids
          .map((id) => ({
            chapter_id: id,
            chapter_name: cMap[id] ?? "Unknown",
            avg: Math.round((perChap[id].sum / perChap[id].den) * 10) / 10,
            attempts: perChap[id].den,
          }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 12),
      };
    }

    throw new Error("Unknown metric");
  });