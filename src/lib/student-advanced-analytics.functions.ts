// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Advanced analytics for the redesigned student dashboard:
 * - daily/weekly/monthly study time (from study_sessions)
 * - per-subject and per-chapter accuracy (from attempt_answers join mcqs)
 * - weak/strong topics, performance by quiz kind
 * - smart insights (data-derived sentences)
 * - 30-day heatmap of activity
 */
export const studentAdvancedAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const meta = (claims as { user_metadata?: Record<string, unknown> })?.user_metadata ?? {};
    const dailyGoal = Math.max(1, Math.min(5000, Number(meta.daily_mcq_goal) || 50));
    const weeklyGoal = Math.max(1, Math.min(50000, Number(meta.weekly_mcq_goal) || 350));

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const since7 = new Date(now.getTime() - 7 * 86400_000);
    const since30 = new Date(now.getTime() - 30 * 86400_000);
    const since90 = new Date(now.getTime() - 90 * 86400_000);

    const [sessionsR, attemptsR, subjectsR, chaptersR] = await Promise.all([
      supabase
        .from("study_sessions")
        .select("module,duration_seconds,started_at,last_heartbeat_at")
        .eq("user_id", userId)
        .gte("started_at", since30.toISOString()),
      supabase
        .from("exam_attempts")
        .select(
          "id,quiz_id,subject_id,chapter_id,kind,score,correct_count,total_count,duration_seconds,started_at,completed_at,status",
        )
        .eq("user_id", userId)
        .gte("started_at", since90.toISOString())
        .order("started_at", { ascending: false })
        .limit(500),
      supabase.from("subjects").select("id,name,color"),
      supabase.from("chapters").select("id,name,subject_id"),
    ]);

    const sessions = sessionsR.data ?? [];
    const attempts = (attemptsR.data ?? []).filter((a) => a.status === "completed");
    const subjects = subjectsR.data ?? [];
    const chapters = chaptersR.data ?? [];

    // Submitted MCQ answers are the only source for solved/correct/wrong math.
    // Skip rows with chosen_option = NULL; those are unsubmitted/skipped questions.
    type SubmittedAnswer = {
      attempt_id: string | null;
      mcq_id: string;
      is_correct: boolean;
      at: string;
      kind: string;
      subject_id: string | null;
      chapter_id: string | null;
    };
    const attemptById = new Map(attempts.map((a) => [a.id, a]));
    const submittedAnswers: SubmittedAnswer[] = [];
    const nonPracticeIds = attempts.filter((a) => a.kind !== "mcq_practice").map((a) => a.id);
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
        const attempt = attemptById.get(row.attempt_id);
        if (!attempt) continue;
        submittedAnswers.push({
          attempt_id: attempt.id,
          mcq_id: row.mcq_id,
          is_correct: row.is_correct,
          at: attempt.completed_at ?? attempt.started_at,
          kind: attempt.kind,
          subject_id: attempt.subject_id ?? null,
          chapter_id: attempt.chapter_id ?? null,
        });
      }
    }
    const { data: practiceRows, error: practiceError } = await supabase
      .from("mcq_practice_progress")
      .select("mcq_id,is_correct,answered_at,subject_id,chapter_id")
      .eq("user_id", userId)
      .gte("answered_at", since90.toISOString())
      .limit(50_000);
    if (practiceError) throw practiceError;
    for (const row of practiceRows ?? []) {
      submittedAnswers.push({
        attempt_id: null,
        mcq_id: row.mcq_id,
        is_correct: row.is_correct,
        at: row.answered_at,
        kind: "mcq_practice",
        subject_id: row.subject_id ?? null,
        chapter_id: row.chapter_id ?? null,
      });
    }

    const mcqIds = Array.from(new Set(submittedAnswers.map((a) => a.mcq_id)));
    const mcqChapter = new Map<string, string | null>();
    for (let i = 0; i < mcqIds.length; i += 500) {
      const ids = mcqIds.slice(i, i + 500);
      if (!ids.length) continue;
      const { data: rows, error } = await supabase
        .from("mcqs")
        .select("id,chapter_id")
        .in("id", ids);
      if (error) throw error;
      for (const r of rows ?? []) mcqChapter.set(r.id, r.chapter_id ?? null);
    }

    // ---- Study time ----
    const sumWhere = (pred: (d: string) => boolean) =>
      sessions.reduce((s, x) => (pred(x.started_at) ? s + (x.duration_seconds ?? 0) : s), 0);
    const studyTime = {
      today: sumWhere((d) => new Date(d) >= dayStart),
      week: sumWhere((d) => new Date(d) >= since7),
      month: sumWhere((d) => new Date(d) >= since30),
    };

    // 7-day study minutes series
    const studyDaily: Array<{ date: string; minutes: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 1);
      const secs = sessions.reduce((s, x) => {
        const t = new Date(x.started_at);
        return t >= d && t < next ? s + (x.duration_seconds ?? 0) : s;
      }, 0);
      studyDaily.push({ date: d.toISOString().slice(0, 10), minutes: Math.round(secs / 60) });
    }

    // ---- Totals ----
    const totals = submittedAnswers.reduce(
      (a, x) => {
        a.total += 1;
        if (x.is_correct) a.correct += 1;
        return a;
      },
      { total: 0, correct: 0 },
    );
    const wrong = Math.max(0, totals.total - totals.correct);
    const accuracy = totals.total > 0 ? Math.round((totals.correct / totals.total) * 1000) / 10 : 0;

    // Weekly prev vs this week (for improvement %)
    const thisWeekAttempts = attempts.filter((a) => new Date(a.started_at) >= since7);
    const thisWeekAnswers = submittedAnswers.filter((a) => new Date(a.at) >= since7);
    const prevWeekAnswers = submittedAnswers.filter((a) => {
      const t = new Date(a.at);
      return t >= new Date(now.getTime() - 14 * 86400_000) && t < since7;
    });
    const sumAcc = (xs: SubmittedAnswer[]) => {
      const t = xs.length;
      const c = xs.filter((x) => x.is_correct).length;
      return t > 0 ? (c / t) * 100 : 0;
    };
    const thisWeekAcc = sumAcc(thisWeekAnswers);
    const prevWeekAcc = sumAcc(prevWeekAnswers);
    const weeklyChange = Math.round((thisWeekAcc - prevWeekAcc) * 10) / 10;

    // ---- Per kind performance ----
    const byKind: Record<string, { attempts: number; accuracy: number }> = {};
    for (const k of ["mock", "quiz", "mcq_practice"] as const) {
      const subset = submittedAnswers.filter((a) => (a.kind ?? "mcq_practice") === k);
      byKind[k] = {
        attempts: subset.length,
        accuracy: Math.round(sumAcc(subset) * 10) / 10,
      };
    }

    // ---- Subject / Chapter accuracy from answers ----
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const chapterMap = new Map(chapters.map((c) => [c.id, c]));

    type Agg = { correct: number; total: number };
    const subjAgg = new Map<string, Agg>();
    const chapAgg = new Map<string, Agg>();
    for (const ans of submittedAnswers.filter((a) => new Date(a.at) >= since30)) {
      const cid = ans.chapter_id ?? mcqChapter.get(ans.mcq_id) ?? null;
      const sid = ans.subject_id ?? (cid ? chapterMap.get(cid)?.subject_id ?? null : null);
      if (sid) {
        const cur = subjAgg.get(sid) ?? { correct: 0, total: 0 };
        cur.total += 1;
        if (ans.is_correct) cur.correct += 1;
        subjAgg.set(sid, cur);
      }
      if (cid) {
        const cur = chapAgg.get(cid) ?? { correct: 0, total: 0 };
        cur.total += 1;
        if (ans.is_correct) cur.correct += 1;
        chapAgg.set(cid, cur);
      }
    }

    const subjectAccuracy = Array.from(subjAgg.entries())
      .map(([id, v]) => ({
        id,
        name: subjectMap.get(id)?.name ?? "Subject",
        color: subjectMap.get(id)?.color ?? null,
        accuracy: v.total ? Math.round((v.correct / v.total) * 1000) / 10 : 0,
        attempts: v.total,
      }))
      .sort((a, b) => b.accuracy - a.accuracy);

    // Strong / Weak Topics AND Chapter-wise Accuracy — computed ONLY from
    // MCQ Practice submissions (excludes quiz/mock/exam). One row per chapter
    // the student has actually practiced (>= 1 submitted answer).
    const practiceChapAgg = new Map<string, Agg>();
    for (const ans of submittedAnswers) {
      if (ans.kind !== "mcq_practice") continue;
      const cid = ans.chapter_id ?? mcqChapter.get(ans.mcq_id) ?? null;
      if (!cid) continue;
      const cur = practiceChapAgg.get(cid) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (ans.is_correct) cur.correct += 1;
      practiceChapAgg.set(cid, cur);
    }
    const practiceChapters = Array.from(practiceChapAgg.entries())
      .filter(([, v]) => v.total >= 1)
      .map(([id, v]) => ({
        id,
        name: chapterMap.get(id)?.name ?? "Chapter",
        subject: subjectMap.get(chapterMap.get(id)?.subject_id ?? "")?.name ?? null,
        accuracy: Math.round((v.correct / v.total) * 1000) / 10,
        attempts: v.total,
        wrong: Math.max(0, v.total - v.correct),
      }));
    const chapterAccuracy = [...practiceChapters].sort(
      (a, b) => b.attempts - a.attempts || b.accuracy - a.accuracy,
    );
    const strongTopics = [...practiceChapters]
      .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts)
      .slice(0, 4);
    const weakTopics = [...practiceChapters]
      .sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)
      .slice(0, 4);

    // ---- 30-day heatmap ----
    const heatmap: Array<{ date: string; count: number }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      const c = attempts.filter(
        (a) => (a.completed_at ?? a.started_at ?? "").slice(0, 10) === key,
      ).length;
      heatmap.push({ date: key, count: c });
    }

    // ---- Streak ----
    const days = new Set(attempts.map((a) => (a.completed_at ?? a.started_at).slice(0, 10)));
    let streak = 0;
    const cursor = new Date(now);
    cursor.setUTCHours(0, 0, 0, 0);
    if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (days.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    // Longest streak in last 90 days
    const sortedDays = Array.from(days).sort();
    let longest = 0,
      run = 0;
    let prev: Date | null = null;
    for (const d of sortedDays) {
      const cur = new Date(d);
      if (prev && cur.getTime() - prev.getTime() === 86400_000) run++;
      else run = 1;
      if (run > longest) longest = run;
      prev = cur;
    }

    // ---- Insights ----
    const insights: Array<{ kind: "up" | "down" | "info" | "goal"; text: string }> = [];
    if (weeklyChange > 2)
      insights.push({
        kind: "up",
        text: `Accuracy is up ${weeklyChange}% vs last week — keep going!`,
      });
    if (weeklyChange < -2)
      insights.push({
        kind: "down",
        text: `Accuracy dropped ${Math.abs(weeklyChange)}% vs last week. Review your wrong answers.`,
      });
    if (subjectAccuracy[0])
      insights.push({
        kind: "info",
        text: `You are strongest in ${subjectAccuracy[0].name} (${subjectAccuracy[0].accuracy}%).`,
      });
    const worstSubj = [...subjectAccuracy].reverse()[0];
    if (worstSubj && worstSubj.id !== subjectAccuracy[0]?.id) {
      insights.push({
        kind: "down",
        text: `${worstSubj.name} needs work — only ${worstSubj.accuracy}% accuracy.`,
      });
    }
    if (weakTopics[0])
      insights.push({
        kind: "down",
        text: `${weakTopics[0].name} completion is below average (${weakTopics[0].accuracy}%).`,
      });
    const answeredThisWeek = thisWeekAnswers.length;
    if (answeredThisWeek < weeklyGoal) {
      insights.push({
        kind: "goal",
        text: `Answer ${weeklyGoal - answeredThisWeek} more MCQs to hit your weekly goal.`,
      });
    } else {
      insights.push({ kind: "up", text: `Weekly goal hit — ${answeredThisWeek} MCQs answered!` });
    }
    if (streak >= 3)
      insights.push({ kind: "up", text: `You're on a ${streak}-day learning streak.` });

    // ---- MCQ counts (real, derived from completed attempts) ----
    const inRange = (iso: string, from: Date, to?: Date) => {
      const t = new Date(iso).getTime();
      return t >= from.getTime() && (!to || t < to.getTime());
    };
    const mcqsToday = submittedAnswers.filter((a) => inRange(a.at, dayStart)).length;
    const mcqsWeek = thisWeekAnswers.length;
    const mcqsMonth = submittedAnswers.filter((a) => new Date(a.at) >= since30).length;

    // Daily MCQ series (last 7 days, count of questions answered per day)
    const mcqDaily: Array<{ date: string; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCDate(d.getUTCDate() - i);
      const next = new Date(d);
      next.setUTCDate(next.getUTCDate() + 1);
      const c = submittedAnswers.filter((a) => {
        const t = new Date(a.at);
        return t >= d && t < next;
      }).length;
      mcqDaily.push({ date: d.toISOString().slice(0, 10), count: c });
    }

    const goals = {
      daily: {
        solved: mcqsToday,
        target: dailyGoal,
        percent: Math.min(100, Math.round((mcqsToday / dailyGoal) * 100)),
      },
      weekly: {
        solved: mcqsWeek,
        target: weeklyGoal,
        percent: Math.min(100, Math.round((mcqsWeek / weeklyGoal) * 100)),
      },
    };

    // Answers Split (Correct / Wrong) restricted to last 7 and 30 days.
    // Uses the submitted-answer timestamp (`at`) so older data is excluded.
    const splitFor = (from: Date) => {
      const subset = submittedAnswers.filter((a) => new Date(a.at) >= from);
      const correct = subset.filter((a) => a.is_correct).length;
      const wrong = Math.max(0, subset.length - correct);
      return { correct, wrong, total: subset.length };
    };
    const answersSplit = { week: splitFor(since7), month: splitFor(since30) };

    return {
      mcqCounts: { today: mcqsToday, week: mcqsWeek, month: mcqsMonth, daily: mcqDaily },
      totals: {
        answered: totals.total,
        correct: totals.correct,
        wrong,
        accuracy,
        attempts: attempts.length,
        weeklyChange,
      },
      answersSplit,
      byKind,
      subjectAccuracy: subjectAccuracy.slice(0, 8),
      chapterAccuracy,
      strongTopics,
      weakTopics,
      heatmap,
      streak: { current: streak, longest },
      insights: insights.slice(0, 6),
      goals,
    };
  });

export const updateStudentMcqGoals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { dailyMcqGoal: number; weeklyMcqGoal: number }) => ({
    dailyMcqGoal: Math.max(1, Math.min(5000, Math.round(Number(d.dailyMcqGoal) || 0))),
    weeklyMcqGoal: Math.max(1, Math.min(50000, Math.round(Number(d.weeklyMcqGoal) || 0))),
  }))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.auth.updateUser({
      data: {
        daily_mcq_goal: data.dailyMcqGoal,
        weekly_mcq_goal: data.weeklyMcqGoal,
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true, dailyMcqGoal: data.dailyMcqGoal, weeklyMcqGoal: data.weeklyMcqGoal };
  });