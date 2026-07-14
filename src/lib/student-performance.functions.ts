// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Single source of truth for student performance across all 4 session types
 * (mcq_practice / quiz / mock / custom_exam). Powers the dashboard
 * Performance Center.
 */

const kindEnum = z.enum(["mcq_practice", "quiz", "mock", "custom_exam"]);

function normalizeChoice(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized === "A" || normalized === "B" || normalized === "C" || normalized === "D"
    ? normalized
    : null;
}

const saveSchema = z.object({
  kind: kindEnum,
  quizId: z.string().uuid().nullable().optional(),
  subjectId: z.string().uuid().nullable().optional(),
  chapterId: z.string().uuid().nullable().optional(),
  level: z.string().trim().max(40).nullable().optional(),
  title: z.string().trim().max(200).nullable().optional(),
  durationSeconds: z
    .number()
    .int()
    .min(0)
    .max(60 * 60 * 6),
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
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const saveSessionAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof saveSchema>) => saveSchema.parse(i))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;

    const ids = data.answers.map((a) => a.mcqId);
    let correctMap = new Map<string, string>();
    if (ids.length) {
      const { data: mcqs, error } = await supabase
        .from("mcqs")
        .select("id,correct_option")
        .in("id", ids);
      if (error) throw error;
      correctMap = new Map(
        (mcqs ?? []).map((m) => [m.id, normalizeChoice(m.correct_option) ?? ""]),
      );
    }

    const submittedAnswers = data.answers.filter((a) => a.chosen !== null);
    let correct = 0;
    const rows = submittedAnswers.map((a) => {
      const isCorrect = a.chosen !== null && correctMap.get(a.mcqId) === normalizeChoice(a.chosen);
      if (isCorrect) correct++;
      return {
        mcq_id: a.mcqId,
        chosen_option: a.chosen,
        is_correct: isCorrect,
        time_spent_ms: a.timeMs,
      };
    });

    const total = submittedAnswers.length;
    const score = total === 0 ? 0 : Math.round((correct / total) * 100);

    // Compute attempt_number for this user + (quiz | subject+chapter) bucket
    let attemptNumber = 1;
    if (data.quizId) {
      const { count } = await supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("quiz_id", data.quizId)
        .eq("status", "completed");
      attemptNumber = (count ?? 0) + 1;
    } else if (data.chapterId) {
      const { count } = await supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", data.kind)
        .eq("chapter_id", data.chapterId)
        .eq("status", "completed");
      attemptNumber = (count ?? 0) + 1;
    }

    const { data: attempt, error: ae } = await supabase
      .from("exam_attempts")
      .insert({
        user_id: userId,
        quiz_id: data.quizId ?? null,
        subject_id: data.subjectId ?? null,
        chapter_id: data.chapterId ?? null,
        level: data.level ?? null,
        kind: data.kind,
        title: data.title ?? null,
        attempt_number: attemptNumber,
        status: "completed",
        completed_at: new Date().toISOString(),
        duration_seconds: data.durationSeconds,
        correct_count: correct,
        total_count: total,
        score,
        meta: { ...(data.meta ?? {}), submitted_count: total, presented_count: data.answers.length } as never,
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

    return { attemptId: attempt.id, correct, total, score, attemptNumber };
  });

/* ------------------------------------------------------------------ */
/*  Performance Center snapshot                                        */
/* ------------------------------------------------------------------ */

type AttemptRow = {
  id: string;
  kind: string;
  status: string;
  quiz_id: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  level: string | null;
  title: string | null;
  score: number;
  correct_count: number;
  total_count: number;
  duration_seconds: number;
  attempt_number: number;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

export const studentPerformanceCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const [attemptsR, subjectsR, chaptersR, quizzesR] = await Promise.all([
      supabase
        .from("exam_attempts")
        .select(
          "id,kind,status,quiz_id,subject_id,chapter_id,level,title,score,correct_count,total_count,duration_seconds,attempt_number,started_at,completed_at,created_at",
        )
        .eq("user_id", userId)
        .gte("created_at", since90)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.from("subjects").select("id,name,color").eq("status", "published"),
      supabase.from("chapters").select("id,name,subject_id").eq("status", "published"),
      supabase.from("quizzes").select("id,title,kind,subject_id,chapter_id,total_questions"),
    ]);

    const attempts = (attemptsR.data ?? []) as AttemptRow[];
    const subjects = subjectsR.data ?? [];
    const chapters = chaptersR.data ?? [];
    const quizzes = quizzesR.data ?? [];

    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const chapterMap = new Map(chapters.map((c) => [c.id, c]));
    const quizMap = new Map(quizzes.map((q) => [q.id, q]));

    // resolve subject/chapter from quiz when missing
    const enrich = (a: AttemptRow) => {
      const q = a.quiz_id ? quizMap.get(a.quiz_id) : null;
      const subjectId = a.subject_id ?? q?.subject_id ?? null;
      const chapterId = a.chapter_id ?? q?.chapter_id ?? null;
      return {
        ...a,
        subjectId,
        chapterId,
        subjectName: subjectId ? (subjectMap.get(subjectId)?.name ?? null) : null,
        chapterName: chapterId ? (chapterMap.get(chapterId)?.name ?? null) : null,
        quizTitle: q?.title ?? a.title ?? null,
      };
    };
    const enriched = attempts.map(enrich);

    const completed = enriched.filter((a) => a.status === "completed");
    const inProgress = enriched.filter((a) => a.status === "in_progress");

    type SubmittedAnswer = {
      attempt_id: string | null;
      mcq_id: string;
      is_correct: boolean;
      at: string;
      kind: string;
      subjectId: string | null;
      chapterId: string | null;
    };
    const submittedAnswers: SubmittedAnswer[] = [];
    const completedById = new Map(completed.map((a) => [a.id, a]));
    const nonPracticeIds = completed.filter((a) => a.kind !== "mcq_practice").map((a) => a.id);
    for (let i = 0; i < nonPracticeIds.length; i += 200) {
      const ids = nonPracticeIds.slice(i, i + 200);
      if (!ids.length) continue;
      const { data: ans, error } = await supabase
        .from("attempt_answers")
        .select("attempt_id,mcq_id,is_correct,chosen_option")
        .in("attempt_id", ids)
        .not("chosen_option", "is", null);
      if (error) throw error;
      for (const row of ans ?? []) {
        const attempt = completedById.get(row.attempt_id);
        if (!attempt) continue;
        submittedAnswers.push({
          attempt_id: attempt.id,
          mcq_id: row.mcq_id,
          is_correct: row.is_correct,
          at: attempt.completed_at ?? attempt.created_at,
          kind: attempt.kind,
          subjectId: attempt.subjectId,
          chapterId: attempt.chapterId,
        });
      }
    }
    const { data: practiceRows, error: practiceError } = await supabase
      .from("mcq_practice_progress")
      .select("mcq_id,is_correct,answered_at,subject_id,chapter_id,attempt_count")
      .eq("user_id", userId)
      .gte("answered_at", since90)
      .limit(50_000);
    if (practiceError) throw practiceError;
    let practiceExtraSubmissions = 0;
    for (const row of practiceRows ?? []) {
      submittedAnswers.push({
        attempt_id: null,
        mcq_id: row.mcq_id,
        is_correct: row.is_correct,
        at: row.answered_at,
        kind: "mcq_practice",
        subjectId: row.subject_id ?? null,
        chapterId: row.chapter_id ?? null,
      });
      const ac = (row as { attempt_count?: number | null }).attempt_count;
      if (typeof ac === "number" && ac > 1) practiceExtraSubmissions += ac - 1;
    }

    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const inRange = (iso: string | null, from: Date) =>
      !!iso && new Date(iso).getTime() >= from.getTime();

    const countByKind = (list: typeof enriched, kind: string, from?: Date) =>
      list.filter(
        (a) => a.kind === kind && (!from || inRange(a.completed_at ?? a.created_at, from)),
      ).length;

    const kinds = ["mcq_practice", "quiz", "mock", "custom_exam"] as const;
    const summary = kinds.map((k) => ({
      kind: k,
      total: countByKind(completed, k),
      today: countByKind(completed, k, startOfToday),
      week: countByKind(completed, k, startOfWeek),
      month: countByKind(completed, k, startOfMonth),
    }));

    // Accuracy trend (last 14 days)
    const trend: { label: string; date: string; accuracy: number; attempts: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const day = submittedAnswers.filter((a) => {
        const t = new Date(a.at).getTime();
        return t >= d.getTime() && t < next.getTime();
      });
      const t = day.length;
      const c = day.filter((a) => a.is_correct).length;
      trend.push({
        label: d.toLocaleDateString("en", { weekday: "short" }),
        date: d.toISOString().slice(0, 10),
        accuracy: t ? Math.round((c / t) * 100) : 0,
        attempts: day.length,
      });
    }

    // Subject performance
    const subjAgg = new Map<string, { correct: number; total: number; attempts: number }>();
    for (const a of submittedAnswers) {
      if (!a.subjectId) continue;
      const s = subjAgg.get(a.subjectId) ?? { correct: 0, total: 0, attempts: 0 };
      if (a.is_correct) s.correct += 1;
      s.total += 1;
      s.attempts += 1;
      subjAgg.set(a.subjectId, s);
    }
    const subjectPerformance = Array.from(subjAgg.entries())
      .map(([id, v]) => ({
        id,
        name: subjectMap.get(id)?.name ?? "Unknown",
        color: subjectMap.get(id)?.color ?? null,
        accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
        attempts: v.attempts,
      }))
      .sort((a, b) => b.accuracy - a.accuracy);

    const strongestSubject = subjectPerformance[0] ?? null;
    const weakestSubject = subjectPerformance.length ? [...subjectPerformance].reverse()[0] : null;

    // Weak chapters (lowest accuracy, min 1 attempt)
    const chapAgg = new Map<string, { correct: number; total: number; attempts: number }>();
    for (const a of submittedAnswers) {
      if (!a.chapterId) continue;
      const s = chapAgg.get(a.chapterId) ?? { correct: 0, total: 0, attempts: 0 };
      if (a.is_correct) s.correct += 1;
      s.total += 1;
      s.attempts += 1;
      chapAgg.set(a.chapterId, s);
    }
    const weakChapters = Array.from(chapAgg.entries())
      .map(([id, v]) => ({
        id,
        name: chapterMap.get(id)?.name ?? "Unknown",
        subjectName: chapterMap.get(id)?.subject_id
          ? (subjectMap.get(chapterMap.get(id)!.subject_id)?.name ?? null)
          : null,
        accuracy: v.total ? Math.round((v.correct / v.total) * 100) : 0,
        attempts: v.attempts,
      }))
      .filter((c) => c.attempts > 0)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    // Recent activity (last 12 completed)
    const recent = completed.slice(0, 12).map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.quizTitle ?? a.chapterName ?? a.subjectName ?? "Session",
      subjectName: a.subjectName,
      chapterName: a.chapterName,
      score: a.score,
      correct: submittedAnswers.filter((x) => x.attempt_id === a.id && x.is_correct).length,
      total: submittedAnswers.filter((x) => x.attempt_id === a.id).length,
      duration: a.duration_seconds,
      attemptNumber: a.attempt_number,
      completedAt: a.completed_at ?? a.created_at,
    }));

    // Retry / improvement tracking: group by quiz_id or chapter+kind
    const groupKey = (a: (typeof enriched)[number]) =>
      a.quiz_id ? `q:${a.quiz_id}` : a.chapterId ? `${a.kind}:c:${a.chapterId}` : null;
    const groups = new Map<
      string,
      { key: string; title: string; kind: string; attempts: typeof enriched }
    >();
    for (const a of completed) {
      const k = groupKey(a);
      if (!k) continue;
      const g = groups.get(k) ?? {
        key: k,
        title: a.quizTitle ?? a.chapterName ?? "Session",
        kind: a.kind,
        attempts: [] as typeof enriched,
      };
      g.attempts.push(a);
      groups.set(k, g);
    }
    const improvements = Array.from(groups.values())
      .filter((g) => g.attempts.length >= 2)
      .map((g) => {
        const sorted = [...g.attempts].sort(
          (a, b) =>
            new Date(a.completed_at ?? a.created_at).getTime() -
            new Date(b.completed_at ?? b.created_at).getTime(),
        );
        const first = sorted[0].score ?? 0;
        const last = sorted[sorted.length - 1].score ?? 0;
        return {
          key: g.key,
          title: g.title,
          kind: g.kind,
          attempts: sorted.length,
          firstScore: first,
          latestScore: last,
          delta: last - first,
        };
      })
      .sort((a, b) => b.delta - a.delta)
      .slice(0, 6);

    // Totals
    const totalAnswered = submittedAnswers.length;
    const totalCorrect = submittedAnswers.filter((a) => a.is_correct).length;
    const totalDuration = completed.reduce((s, a) => s + (a.duration_seconds ?? 0), 0);
    const overallAccuracy = totalAnswered
      ? Math.round((totalCorrect / totalAnswered) * 1000) / 10
      : 0;
    const avgCompletionSec = completed.length ? Math.round(totalDuration / completed.length) : 0;

    // Current calendar month MCQ solved progress (used by Settings → Monthly Progress)
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const daysInMonth = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth() + 1,
      0,
    ).getDate();
    const mcqSolvedThisMonth = submittedAnswers.filter(
      (a) => new Date(a.at).getTime() >= monthStart.getTime(),
    ).length;
    const dayElapsed = Math.min(daysInMonth, new Date().getDate());
    const monthlyTarget = Math.max(30, dayElapsed * 10); // soft target: 10 MCQs/day
    const monthlyProgressPct = Math.min(
      100,
      monthlyTarget ? Math.round((mcqSolvedThisMonth / monthlyTarget) * 100) : 0,
    );

    // Improvement % = (last7 accuracy − previous7 accuracy)
    const last7 = trend.slice(-7);
    const prev7 = trend.slice(0, 7);
    const avg = (arr: typeof trend) => {
      const valid = arr.filter((d) => d.attempts > 0);
      return valid.length
        ? Math.round(valid.reduce((s, d) => s + d.accuracy, 0) / valid.length)
        : 0;
    };
    const improvementPct = avg(last7) - avg(prev7);

    // Continue learning (in-progress + recent unfinished quizzes)
    const continueLearning = inProgress.slice(0, 4).map((a) => ({
      id: a.id,
      kind: a.kind,
      title: a.quizTitle ?? a.chapterName ?? "Session",
      quizId: a.quiz_id,
      chapterId: a.chapterId,
      startedAt: a.started_at,
    }));

    return {
      summary,
      recent,
      improvements,
      weakChapters,
      subjectPerformance,
      strongestSubject,
      weakestSubject,
      trend,
      continueLearning,
      totals: {
        attempts: completed.length,
        inProgress: inProgress.length,
        accuracy: overallAccuracy,
        avgCompletionSec,
        improvementPct,
        answered: totalAnswered + practiceExtraSubmissions,
        correct: totalCorrect,
        durationSeconds: totalDuration,
        mcqSolvedThisMonth,
        monthlyTarget,
        monthlyProgressPct,
      },
    };
  });

/* ------------------------------------------------------------------ */
/*  Full attempt history (paginated) + detail                          */
/* ------------------------------------------------------------------ */

const historySchema = z.object({
  kind: kindEnum.optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const listAttemptHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof historySchema>) => historySchema.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("exam_attempts")
      .select(
        "id,kind,status,quiz_id,subject_id,chapter_id,level,title,score,correct_count,total_count,duration_seconds,attempt_number,started_at,completed_at,created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.kind) q = q.eq("kind", data.kind);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/* ------------------------------------------------------------------ */
/*  Subject + Chapter completion tracker                               */
/* ------------------------------------------------------------------ */

export const studentCompletionTracker = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("level")
      .eq("id", userId)
      .maybeSingle();
    const level = profile?.level ?? "professional";

    const [subjectsR, quizzesR] = await Promise.all([
      supabase
        .from("subjects")
        .select("id,name,color,sort_order")
        .eq("status", "published")
        .eq("level", level)
        .order("sort_order", { ascending: true }),
      supabase.from("quizzes").select("id,chapter_id,subject_id,kind").eq("status", "published"),
    ]);

    const subjects = subjectsR.data ?? [];
    const quizzes = quizzesR.data ?? [];
    const subjectIds = subjects.map((s) => s.id);

    type SubjectRow = {
      id: string;
      name: string;
      color: string | null;
      mcqsTotal: number;
      mcqsDone: number;
      completionPct: number;
      accuracy: number;
      quizzes: number;
      mocks: number;
      customExams: number;
      chaptersTotal: number;
      chaptersDone: number;
      chaptersInProgress: number;
      pendingChapters: number;
    };
    type ChapterRow = {
      id: string;
      name: string;
      subjectId: string;
      subjectName: string;
      mcqsTotal: number;
      mcqsDone: number;
      completionPct: number;
      accuracy: number;
      attempts: number;
      status: "completed" | "in_progress" | "not_started";
    };
    type Rec = {
      chapterId: string;
      subjectId: string;
      subjectName: string;
      title: string;
      reason: string;
    };

    if (!subjectIds.length) {
      return {
        level,
        subjects: [] as SubjectRow[],
        chapters: [] as ChapterRow[],
        recommendations: [] as Rec[],
        overall: { completionPct: 0, chaptersDone: 0, chaptersTotal: 0 },
      };
    }

    const { data: chapters } = await supabase
      .from("chapters")
      .select("id,name,subject_id,sort_order")
      .in("subject_id", subjectIds)
      .eq("status", "published")
      .order("sort_order", { ascending: true });
    const chs = chapters ?? [];
    const chapterIds = chs.map((c) => c.id);

    const mcqsRes = chapterIds.length
      ? await supabase
          .from("mcqs")
          .select("id,chapter_id")
          .in("chapter_id", chapterIds)
          .eq("status", "published")
      : { data: [] as { id: string; chapter_id: string }[] };
    const mcqs = mcqsRes.data ?? [];

    const mcqById = new Map<string, string>();
    const mcqsByChapter = new Map<string, number>();
    for (const m of mcqs) {
      if (!m.chapter_id) continue;
      mcqById.set(m.id, m.chapter_id);
      mcqsByChapter.set(m.chapter_id, (mcqsByChapter.get(m.chapter_id) ?? 0) + 1);
    }

    const { data: attempts } = await supabase
      .from("exam_attempts")
      .select("id,kind,chapter_id,subject_id,quiz_id,score,status")
      .eq("user_id", userId)
      .eq("status", "completed")
      .limit(10000);

    const quizMap = new Map(quizzes.map((q) => [q.id, q]));
    const attemptIds = (attempts ?? []).map((a) => a.id);

    const answersRes = attemptIds.length
      ? await supabase
          .from("attempt_answers")
          .select("mcq_id,is_correct,attempt_id,chosen_option")
          .in("attempt_id", attemptIds)
          .not("chosen_option", "is", null)
      : { data: [] as { mcq_id: string; is_correct: boolean; attempt_id: string }[] };
    const answers = answersRes.data ?? [];

    const answeredByChapter = new Map<string, Set<string>>();
    const accByChapter = new Map<string, { correct: number; total: number }>();
    for (const a of answers) {
      const ch = mcqById.get(a.mcq_id);
      if (!ch) continue;
      if (!answeredByChapter.has(ch)) answeredByChapter.set(ch, new Set());
      answeredByChapter.get(ch)!.add(a.mcq_id);
      const acc = accByChapter.get(ch) ?? { correct: 0, total: 0 };
      acc.total += 1;
      if (a.is_correct) acc.correct += 1;
      accByChapter.set(ch, acc);
    }

    const sessionsByChapter = new Map<string, number>();
    const subjKindCounts = new Map<string, { quiz: number; mock: number; custom_exam: number }>();
    for (const a of attempts ?? []) {
      const q = a.quiz_id ? quizMap.get(a.quiz_id) : null;
      const ch = a.chapter_id ?? q?.chapter_id ?? null;
      const subj = a.subject_id ?? q?.subject_id ?? null;
      if (ch) sessionsByChapter.set(ch, (sessionsByChapter.get(ch) ?? 0) + 1);
      if (subj) {
        const s = subjKindCounts.get(subj) ?? { quiz: 0, mock: 0, custom_exam: 0 };
        if (a.kind === "quiz") s.quiz += 1;
        else if (a.kind === "mock") s.mock += 1;
        else if (a.kind === "custom_exam") s.custom_exam += 1;
        subjKindCounts.set(subj, s);
      }
    }

    const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

    const chapterRows: ChapterRow[] = chs.map((c) => {
      const total = mcqsByChapter.get(c.id) ?? 0;
      const done = answeredByChapter.get(c.id)?.size ?? 0;
      const acc = accByChapter.get(c.id);
      const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
      const status: ChapterRow["status"] =
        total === 0
          ? "not_started"
          : pct >= 95
            ? "completed"
            : pct > 0
              ? "in_progress"
              : "not_started";
      return {
        id: c.id,
        name: c.name,
        subjectId: c.subject_id,
        subjectName: subjectNameById.get(c.subject_id) ?? "—",
        mcqsTotal: total,
        mcqsDone: done,
        completionPct: pct,
        accuracy: acc && acc.total ? Math.round((acc.correct / acc.total) * 100) : 0,
        attempts: sessionsByChapter.get(c.id) ?? 0,
        status,
      };
    });

    const subjectRows: SubjectRow[] = subjects.map((s) => {
      const sub = chapterRows.filter((c) => c.subjectId === s.id);
      const mcqsTotal = sub.reduce((sum, c) => sum + c.mcqsTotal, 0);
      const mcqsDone = sub.reduce((sum, c) => sum + c.mcqsDone, 0);
      const accNum = sub.reduce((sum, c) => sum + (accByChapter.get(c.id)?.correct ?? 0), 0);
      const accDen = sub.reduce((sum, c) => sum + (accByChapter.get(c.id)?.total ?? 0), 0);
      const k = subjKindCounts.get(s.id) ?? { quiz: 0, mock: 0, custom_exam: 0 };
      const chaptersDone = sub.filter((c) => c.status === "completed").length;
      const chaptersInProgress = sub.filter((c) => c.status === "in_progress").length;
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        mcqsTotal,
        mcqsDone,
        completionPct: mcqsTotal ? Math.round((mcqsDone / mcqsTotal) * 100) : 0,
        accuracy: accDen ? Math.round((accNum / accDen) * 100) : 0,
        quizzes: k.quiz,
        mocks: k.mock,
        customExams: k.custom_exam,
        chaptersTotal: sub.length,
        chaptersDone,
        chaptersInProgress,
        pendingChapters: sub.length - chaptersDone,
      };
    });

    const weak = chapterRows
      .filter((c) => c.attempts > 0 && c.accuracy < 60 && c.mcqsTotal > 0)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 3)
      .map<Rec>((c) => ({
        chapterId: c.id,
        subjectId: c.subjectId,
        subjectName: c.subjectName,
        title: c.name,
        reason: `Low accuracy (${c.accuracy}%) — revise this chapter`,
      }));
    const fresh = chapterRows
      .filter((c) => c.status === "not_started" && c.mcqsTotal > 0)
      .slice(0, 3)
      .map<Rec>((c) => ({
        chapterId: c.id,
        subjectId: c.subjectId,
        subjectName: c.subjectName,
        title: c.name,
        reason: `Untouched · ${c.mcqsTotal} MCQs ready`,
      }));
    const recommendations = [...weak, ...fresh].slice(0, 5);

    const overallTotal = chapterRows.reduce((s, c) => s + c.mcqsTotal, 0);
    const overallDone = chapterRows.reduce((s, c) => s + c.mcqsDone, 0);

    return {
      level,
      subjects: subjectRows,
      chapters: chapterRows,
      recommendations,
      overall: {
        completionPct: overallTotal ? Math.round((overallDone / overallTotal) * 100) : 0,
        chaptersDone: chapterRows.filter((c) => c.status === "completed").length,
        chaptersTotal: chapterRows.length,
      },
    };
  });