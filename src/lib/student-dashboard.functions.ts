// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Aggregates everything the student dashboard renders so the UI can stay
 * one query + one realtime invalidator. RLS is respected via the
 * `requireSupabaseAuth` middleware so each call is scoped to the caller.
 */
const snapshotSchema = z
  .object({
    // P3a-Dash-C2: client passes its IANA timezone so the streak is computed
    // in the student's local day boundary, not UTC. Defaults to UTC if the
    // client sends nothing (legacy callers).
    tz: z.string().trim().min(1).max(64).optional(),
  })
  .optional();

export const studentDashboardSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof snapshotSchema>) => snapshotSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tz = data?.tz ?? "UTC";
    // dayKey: YYYY-MM-DD in the requested timezone. Intl handles DST.
    const dayFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const dayKey = (d: Date | string): string => {
      const date = typeof d === "string" ? new Date(d) : d;
      return dayFmt.format(date); // en-CA renders YYYY-MM-DD
    };

    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const weekStartDate = new Date();
    weekStartDate.setHours(0, 0, 0, 0);
    weekStartDate.setDate(weekStartDate.getDate() - ((weekStartDate.getDay() + 6) % 7));
    const weekStart = weekStartDate.toISOString();

    type SubmissionKind = "quiz" | "mock";
    type WeeklySubmissionRow = {
      id: string;
      user_id: string | null;
      kind: string | null;
      status: string | null;
      completed_at: string | null;
      created_at: string | null;
      started_at: string | null;
      quizzes?: { kind: string | null } | Array<{ kind: string | null }> | null;
    };

    const isSubmissionKind = (kind: string | null | undefined): kind is SubmissionKind =>
      kind === "quiz" || kind === "mock";

    const getWeeklySubmissionCounts = async () => {
      const submittedThisWeek = `completed_at.gte.${weekStart},and(completed_at.is.null,created_at.gte.${weekStart})`;
      const buildQuery = (columns: string) =>
        supabase
          .from("exam_attempts")
          .select(columns)
          .eq("user_id", userId)
          .in("status", ["completed", "submitted"])
          .or(submittedThisWeek);

      let result = await buildQuery(
        "id,user_id,kind,status,completed_at,created_at,started_at,quiz_id,quizzes(kind)",
      );

      // Some legacy environments may not expose the embedded quizzes relation
      // through the API cache. The attempts table remains the source of truth;
      // this fallback only drops the legacy classification assist.
      if (result.error) {
        result = await buildQuery(
          "id,user_id,kind,status,completed_at,created_at,started_at,quiz_id",
        );
      }
      if (result.error) throw result.error;

      const counts: Record<SubmissionKind, number> = { quiz: 0, mock: 0 };
      const weekStartMs = weekStartDate.getTime();

      for (const row of (result.data ?? []) as unknown as WeeklySubmissionRow[]) {
        if (row.user_id !== userId) continue;
        if (row.status !== "completed" && row.status !== "submitted") continue;

        const submittedAt = row.completed_at ?? row.created_at ?? row.started_at;
        const submittedAtMs = submittedAt ? Date.parse(submittedAt) : Number.NaN;
        if (!Number.isFinite(submittedAtMs) || submittedAtMs < weekStartMs) continue;

        const quiz = Array.isArray(row.quizzes) ? row.quizzes[0] : row.quizzes;
        const kind = isSubmissionKind(quiz?.kind)
          ? quiz.kind
          : isSubmissionKind(row.kind)
            ? row.kind
            : null;

        if (kind) counts[kind] += 1;
      }

      return counts;
    };

    const [
      mcqCountR,
      mcqWeekR,
      weeklySubmissionCounts,
      notesCountR,
      classesCountR,
      availableMockCountR,
      attemptsR,
      notificationsR,
      upcomingMockR,
      recommendedQuizR,
      subjectsR,
      // P3a-Dash-H1: all-time submission totals (`counts.quizzes` /
      // `counts.mocks`) were previously aliased to the weekly count, so the
      // UI showed "5 Quizzes · +5 this week" forever.
      totalQuizSubmissionsR,
      totalMockSubmissionsR,
    ] = await Promise.all([
      supabase.from("mcqs").select("id", { count: "exact", head: true }).eq("status", "published"),
      supabase
        .from("mcqs")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .gte("created_at", since7),
      getWeeklySubmissionCounts(),
      supabase
        .from("short_notes")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("is_hidden", false),
      supabase
        .from("video_classes")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("is_hidden", false),
      supabase
        .from("quizzes")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .eq("kind", "mock"),
      supabase
        .from("exam_attempts")
        .select(
          "id,kind,quiz_id,subject_id,score,correct_count,total_count,completed_at,started_at,created_at,status",
        )
        .eq("user_id", userId)
        .gte("started_at", since30)
        .order("started_at", { ascending: false })
        .limit(50),
      supabase
        .from("notifications")
        .select("id,title,body,priority,sent_at,created_at,type,user_id")
        .eq("status", "sent")
        // P3a-Dash-C4: notifications must be scoped to this user OR be a
        // platform-wide broadcast (user_id IS NULL). Without this filter
        // the snapshot leaked every user-targeted notification to every
        // student.
        .or(`user_id.is.null,user_id.eq.${userId}`)
        .order("sent_at", { ascending: false, nullsFirst: false })
        .limit(6),
      supabase
        .from("quizzes")
        .select("id,title,total_questions,duration_seconds,starts_at,kind,created_at")
        .eq("status", "published")
        .eq("kind", "mock")
        // P3a-Dash-H4: only surface mocks that have NOT yet started, so the
        // "Upcoming Mock" card never shows an expired test.
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true, nullsFirst: false })
        .limit(1),
      supabase
        .from("quizzes")
        .select(
          "id,title,description,total_questions,duration_seconds,subject_id,created_at,kind,level",
        )
        .eq("status", "published")
        .eq("kind", "quiz")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.from("subjects").select("id,name,color").eq("status", "published"),
      supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "quiz")
        .in("status", ["completed", "submitted"]),
      supabase
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("kind", "mock")
        .in("status", ["completed", "submitted"]),
    ]);

    const attempts = attemptsR.data ?? [];
    const completed = attempts.filter((a) => a.status === "completed");

    // Submitted answers are the only source for solved/correct/wrong math.
    // Skip placeholder unanswered rows and ignore MCQ Practice attempt rows here;
    // Practice progress is counted from mcq_practice_progress for instant updates.
    type SubmittedAnswer = {
      mcq_id: string;
      attempt_id: string | null;
      is_correct: boolean;
      at: string;
      kind: string;
      subject_id: string | null;
    };
    const submittedAnswers: SubmittedAnswer[] = [];
    const completedById = new Map(completed.map((a) => [a.id, a]));
    const nonPracticeAttemptIds = completed
      .filter((a) => a.kind !== "mcq_practice")
      .map((a) => a.id);
    for (let i = 0; i < nonPracticeAttemptIds.length; i += 200) {
      const ids = nonPracticeAttemptIds.slice(i, i + 200);
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
          mcq_id: row.mcq_id,
          attempt_id: attempt.id,
          is_correct: row.is_correct,
          at: attempt.completed_at ?? attempt.started_at ?? attempt.created_at,
          kind: attempt.kind,
          subject_id: attempt.subject_id ?? null,
        });
      }
    }
    const { data: practiceRows, error: practiceError } = await supabase
      .from("mcq_practice_progress")
      .select("mcq_id,is_correct,answered_at,subject_id")
      .eq("user_id", userId)
      .gte("answered_at", since30)
      .limit(50_000);
    if (practiceError) throw practiceError;
    for (const row of practiceRows ?? []) {
      submittedAnswers.push({
        mcq_id: row.mcq_id,
        attempt_id: null,
        is_correct: row.is_correct,
        at: row.answered_at,
        kind: "mcq_practice",
        subject_id: row.subject_id ?? null,
      });
    }

    // Accuracy
    const totals = submittedAnswers.reduce(
      (acc, a) => {
        if (a.is_correct) acc.correct += 1;
        acc.total += 1;
        return acc;
      },
      { correct: 0, total: 0 },
    );
    const accuracy = totals.total > 0 ? Math.round((totals.correct / totals.total) * 1000) / 10 : 0;

    // P3a-Dash-C2: streak day boundaries computed in the student's IANA
    // timezone (Intl.DateTimeFormat handles DST). Includes mcq_practice
    // submissions as activity (a student who only practices MCQs still
    // maintains a streak), not just completed quiz/mock attempts.
    const dayKeys = new Set<string>();
    for (const a of completed) {
      const ts = a.completed_at ?? a.started_at;
      if (ts) dayKeys.add(dayKey(ts));
    }
    for (const a of submittedAnswers) {
      if (a.kind === "mcq_practice" && a.at) dayKeys.add(dayKey(a.at));
    }
    let streak = 0;
    // Step day-by-day in the requested TZ. Compute the "day cursor" by
    // taking now, formatting, and subtracting 24h to step back. DST shifts
    // (23/25-hour days) are safe because we re-format every iteration.
    let cursorMs = Date.now();
    // Allow today to be empty without breaking the streak.
    if (!dayKeys.has(dayKey(new Date(cursorMs)))) {
      cursorMs -= 24 * 60 * 60 * 1000;
    }
    while (dayKeys.has(dayKey(new Date(cursorMs)))) {
      streak += 1;
      cursorMs -= 24 * 60 * 60 * 1000;
    }

    // Weekly bars (Mon..Sun accuracy of attempts that day, 0 if none)
    const today = new Date();
    const bars: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const day = submittedAnswers.filter((a) => a.at.slice(0, 10) === key);
      const t = day.length;
      const c = day.filter((a) => a.is_correct).length;
      bars.push(t ? Math.round((c / t) * 100) : 0);
    }

    // Continue learning: latest unique quizzes the user attempted but didn't finish 100%
    const seen = new Set<string>();
    const continueLearning = completed
      .filter((a) => {
        if (!a.quiz_id || seen.has(a.quiz_id)) return false;
        seen.add(a.quiz_id);
        return (a.score ?? 0) < 100;
      })
      .slice(0, 3);

    // Hydrate continueLearning titles
    let learning: Array<{ id: string; title: string; progress: number }> = [];
    if (continueLearning.length) {
      const ids = continueLearning.map((a) => a.quiz_id!) as string[];
      const { data: quizzesData } = await supabase
        .from("quizzes")
        .select("id,title,subject_id")
        .in("id", ids);
      const map = new Map((quizzesData ?? []).map((q) => [q.id, q]));
      learning = continueLearning.map((a) => ({
        id: a.quiz_id!,
        title: map.get(a.quiz_id!)?.title ?? "Resume session",
        progress: a.score ?? 0,
      }));
    }

    // Recommendations: most recent quizzes user has not attempted
    const attemptedIds = new Set(completed.map((a) => a.quiz_id).filter(Boolean));
    const recommendations = (recommendedQuizR.data ?? [])
      .filter((q) => !attemptedIds.has(q.id))
      .slice(0, 4);

    // Subject performance: group attempts by subject (via quiz lookup)
    const quizSubjectMap = new Map<string, string | null>();
    const allQuizIds = [
      ...new Set([
        ...completed.map((a) => a.quiz_id).filter(Boolean),
        ...(recommendedQuizR.data ?? []).map((q) => q.id),
      ]),
    ] as string[];
    if (allQuizIds.length) {
      const { data: qSubs } = await supabase
        .from("quizzes")
        .select("id,subject_id")
        .in("id", allQuizIds);
      (qSubs ?? []).forEach((q) => quizSubjectMap.set(q.id, q.subject_id ?? null));
    }

    const subjectAgg = new Map<string, { correct: number; total: number }>();
    for (const a of submittedAnswers) {
      const sid = a.subject_id ?? null;
      if (!sid) continue;
      const cur = subjectAgg.get(sid) ?? { correct: 0, total: 0 };
      if (a.is_correct) cur.correct += 1;
      cur.total += 1;
      subjectAgg.set(sid, cur);
    }
    const subjectsList = (subjectsR.data ?? []).map((s) => {
      const agg = subjectAgg.get(s.id);
      const pct = agg && agg.total ? Math.round((agg.correct / agg.total) * 100) : 0;
      return { id: s.id, name: s.name, color: s.color, progress: pct };
    });

    // Recent activity feed (last 6 completed attempts)
    const recentActivity = completed.slice(0, 6).map((a) => ({
      id: a.id,
      quiz_id: a.quiz_id,
      score: a.score ?? 0,
      total: submittedAnswers.filter((x) => x.attempt_id === a.id).length,
      correct: submittedAnswers.filter((x) => x.attempt_id === a.id && x.is_correct).length,
      completed_at: a.completed_at ?? a.started_at,
    }));

    return {
      counts: {
        mcqs: mcqCountR.count ?? 0,
        mcqsThisWeek: mcqWeekR.count ?? 0,
        quizzes: totalQuizSubmissionsR.count ?? 0,
        quizzesThisWeek: weeklySubmissionCounts.quiz,
        mocks: totalMockSubmissionsR.count ?? 0,
        mocksThisWeek: weeklySubmissionCounts.mock,
        availableMocks: availableMockCountR.count ?? 0,
        notes: notesCountR.count ?? 0,
        classes: classesCountR.count ?? 0,
        attempts: completed.length,
      },
      accuracy,
      streak,
      bars,
      subjects: subjectsList,
      learning,
      recommendations,
      notifications: notificationsR.data ?? [],
      upcomingMock: upcomingMockR.data?.[0] ?? null,
      recentActivity,
    };
  });