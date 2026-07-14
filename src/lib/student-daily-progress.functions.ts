// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Daily Progress Center — student-facing realtime aggregate.
 * Pulls today / week / month metrics, weekly bars, activity heatmap,
 * smart insights, wrong/bookmark stats, plus subject and chapter aggregates
 * (counts, completion %, accuracy, study minutes, last activity).
 */
export const studentDailyProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const startOfPrevWeek = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const since60 = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    const since365 = new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString();

    const PAGE = 1000;
    void since60;

    // Paginated readers — capped + resilient. Previously these could request
    // up to 100 sequential pages each (200k+ rows total) which routinely
    // blew past Cloudflare Worker CPU/subrequest limits, causing the entire
    // endpoint to 500 with "Couldn't load progress". We now:
    //  - select the minimum columns,
    //  - cap iteration depth aggressively,
    //  - swallow per-page errors so partial data still renders.
    const safePage = async <T>(
      fetcher: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
      maxRows: number,
    ): Promise<T[]> => {
      const out: T[] = [];
      for (let from = 0; from < maxRows; from += PAGE) {
        try {
          const { data, error } = await fetcher(from);
          if (error) {
            console.error("[daily-progress] page error", error);
            break;
          }
          const rows = (data ?? []) as T[];
          out.push(...rows);
          if (rows.length < PAGE) break;
        } catch (err) {
          console.error("[daily-progress] page exception", err);
          break;
        }
      }
      return out;
    };

    // mcqs: only chapter_id is needed for per-chapter totals, but we keep the
    // real id so mcqToChapter lookups still work for answers that lack a
    // chapter_id of their own. Payload is just two short columns per row.
    const fetchAllMcqs = () =>
      safePage<{ id: string; chapter_id: string | null }>(
        (from) =>
          supabase
            .from("mcqs")
            .select("id,chapter_id")
            .eq("status", "published")
            .not("chapter_id", "is", null)
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1),
        60_000,
      );

    type PracticeProgressRow = {
      mcq_id: string;
      is_correct: boolean;
      answered_at: string;
      subject_id: string | null;
      chapter_id: string | null;
      attempt_count: number | null;
    };
    // ROOT CAUSE FIX (Daily Progress "everything shows 0"):
    // `attempt_count` was added by
    // supabase/manual_apply/20260629_mcq_practice_attempt_count.sql.
    // If that manual migration has not been applied to the connected DB,
    // selecting the column makes PostgREST reject the entire SELECT with
    // "column mcq_practice_progress.attempt_count does not exist". safePage
    // swallowed the error and returned [], leaving practice answers empty —
    // and since practice is the primary source of MCQ activity for most
    // students, every Daily Progress widget rendered 0. The Dashboard was
    // unaffected because student-dashboard.functions.ts never selects
    // attempt_count. Probe once and fall back to a schema-safe column list
    // if the column is missing.
    const probe = await supabase
      .from("mcq_practice_progress")
      .select("attempt_count")
      .eq("user_id", userId)
      .limit(1);
    const hasAttemptCount = !probe.error;
    if (probe.error) {
      console.warn(
        "[daily-progress] mcq_practice_progress.attempt_count missing; falling back",
        probe.error,
      );
    }
    const practiceCols = hasAttemptCount
      ? "mcq_id,is_correct,answered_at,subject_id,chapter_id,attempt_count"
      : "mcq_id,is_correct,answered_at,subject_id,chapter_id";
    const fetchPracticeProgress = () =>
      safePage<PracticeProgressRow>(
        (from) =>
          supabase
            .from("mcq_practice_progress")
            .select(practiceCols)
            .eq("user_id", userId)
            .order("answered_at", { ascending: false })
            .range(from, from + PAGE - 1) as unknown as PromiseLike<{
            data: PracticeProgressRow[] | null;
            error: unknown;
          }>,
        30_000,
      );

    type AttemptAnswerRow = {
      mcq_id: string;
      is_correct: boolean;
      chosen_option: string | null;
      attempt_id: string;
      exam_attempts:
        | {
            kind: string;
            subject_id: string | null;
            chapter_id: string | null;
            created_at: string;
            completed_at: string | null;
          }
        | Array<{
            kind: string;
            subject_id: string | null;
            chapter_id: string | null;
            created_at: string;
            completed_at: string | null;
          }>
        | null;
    };
    const fetchNonPracticeAnswers = () =>
      safePage<AttemptAnswerRow>(
        (from) =>
          supabase
            .from("attempt_answers")
            .select(
              "mcq_id,is_correct,chosen_option,attempt_id,exam_attempts!inner(kind,subject_id,chapter_id,created_at,completed_at,user_id,status)",
            )
            .eq("exam_attempts.user_id", userId)
            .eq("exam_attempts.status", "completed")
            .neq("exam_attempts.kind", "mcq_practice")
            .not("chosen_option", "is", null)
            .order("attempt_id", { ascending: false })
            .range(from, from + PAGE - 1) as unknown as PromiseLike<{
            data: AttemptAnswerRow[] | null;
            error: unknown;
          }>,
        30_000,
      );

    // Run every independent read in parallel: 6 base reads + 3 paginated
    // readers + the recent-practice timeline read. Previously the paginated
    // readers ran sequentially AFTER the base Promise.all, which was the
    // main wall-clock bottleneck on F5.
    // Resilient parallel fetch — if any single query fails (RLS, timeout,
    // transient 5xx) the page still renders with whatever loaded instead of
    // showing "Couldn't load progress" for the entire dashboard.
    const settled = await Promise.allSettled([
      supabase
        .from("exam_attempts")
        .select(
          "id,kind,status,subject_id,chapter_id,quiz_id,level,score,correct_count,total_count,duration_seconds,started_at,completed_at,created_at,title",
        )
        .eq("user_id", userId)
        .gte("created_at", since365)
        .order("created_at", { ascending: false })
        .limit(4000),
      supabase.from("subjects").select("id,name,color,level").eq("status", "published"),
      supabase.from("chapters").select("id,name,subject_id").eq("status", "published"),
      supabase
        .from("mcq_wrong_questions")
        .select("id,mastered,retry_count,subject_id,chapter_id,last_wrong_at")
        .eq("user_id", userId),
      supabase
        .from("mcq_bookmarks")
        .select("id,subject_id,chapter_id,created_at")
        .eq("user_id", userId),
      supabase.from("profiles").select("level").eq("id", userId).maybeSingle(),
      fetchAllMcqs(),
      fetchPracticeProgress(),
      fetchNonPracticeAnswers(),
    ]);

    const pick = <T>(idx: number, fallback: T): T => {
      const r = settled[idx];
      if (r.status === "fulfilled") return r.value as unknown as T;
      console.error(`[daily-progress] read ${idx} failed`, r.reason);
      return fallback;
    };

    const attemptsR = pick<{ data: unknown[] | null }>(0, { data: [] });
    const subjectsR = pick<{ data: unknown[] | null }>(1, { data: [] });
    const chaptersR = pick<{ data: unknown[] | null }>(2, { data: [] });
    const wrongR = pick<{ data: unknown[] | null }>(3, { data: [] });
    const bookmarksR = pick<{ data: unknown[] | null }>(4, { data: [] });
    const profileR = pick<{ data: unknown | null }>(5, { data: null });
    const allMcqs = pick<Array<{ id: string; chapter_id: string | null }>>(6, []);
    const practiceProgressRows = pick<
      Array<{
        mcq_id: string;
        is_correct: boolean;
        answered_at: string;
        subject_id: string | null;
        chapter_id: string | null;
        attempt_count: number | null;
      }>
    >(7, []);
    const nonPracticeAnswerRows = pick<
      Array<{
        mcq_id: string;
        is_correct: boolean;
        chosen_option: string | null;
        attempt_id: string;
        exam_attempts: unknown;
      }>
    >(8, []) as unknown as AttemptAnswerRow[];

    const attempts = (attemptsR.data ?? []) as Array<{
      id: string;
      kind: string;
      status: string;
      subject_id: string | null;
      chapter_id: string | null;
      quiz_id: string | null;
      level: string | null;
      score: number | null;
      correct_count: number | null;
      total_count: number | null;
      duration_seconds: number;
      started_at: string | null;
      completed_at: string | null;
      created_at: string;
      title: string | null;
    }>;
    const subjects = (subjectsR.data ?? []) as Array<{
      id: string;
      name: string;
      color: string | null;
      level: string | null;
    }>;
    const chapters = (chaptersR.data ?? []) as Array<{
      id: string;
      name: string;
      subject_id: string | null;
    }>;
    const wrong = (wrongR.data ?? []) as Array<{
      id: string;
      mastered: boolean | null;
      retry_count: number | null;
      subject_id: string | null;
      chapter_id: string | null;
      last_wrong_at: string | null;
    }>;
    const bookmarks = (bookmarksR.data ?? []) as Array<{
      id: string;
      subject_id: string | null;
      chapter_id: string | null;
      created_at: string;
    }>;
    const userLevel = (profileR.data as { level?: string } | null)?.level ?? "professional";

    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const chapterMap = new Map(chapters.map((c) => [c.id, c]));
    const chapterToSubject = new Map(chapters.map((c) => [c.id, c.subject_id ?? null]));

    // Total MCQs per chapter
    const mcqsByChapter = new Map<string, number>();
    const mcqToChapter = new Map<string, string>();
    for (const m of allMcqs) {
      if (!m.chapter_id) continue;
      mcqToChapter.set(m.id, m.chapter_id);
      mcqsByChapter.set(m.chapter_id, (mcqsByChapter.get(m.chapter_id) ?? 0) + 1);
    }

    // ---- Submitted answers (single source of truth for MCQ statistics) ----
    // `attempt_answers` can contain placeholder rows with chosen_option = NULL
    // for skipped/unanswered questions. Those rows are NOT submitted answers.
    // MCQ Practice is counted from mcq_practice_progress so per-question practice
    // updates are visible immediately, before a batch exam_attempt is finalized.
    // Do not apply a date cutoff here: range-specific widgets filter the
    // canonical answer list below, while the main "MCQs Solved" total and
    // Subject Breakdown are all-time progress values.
    type SubmittedAnswer = {
      mcq_id: string;
      is_correct: boolean;
      at: string;
      kind: "mcq_practice" | "quiz" | "mock" | "custom_exam" | string;
      subject_id: string | null;
      chapter_id: string | null;
    };
    // Extra (re-submission) practice answers beyond the unique row count.
    // Used to grow the "MCQs Solved" total without inflating unique completion.
    const practiceExtraSubmissions = practiceProgressRows.reduce(
      (s, r) => s + Math.max(0, (r.attempt_count ?? 1) - 1),
      0,
    );

    const answerTime = (iso: string) => new Date(iso).getTime();

    const answers: SubmittedAnswer[] = [
      ...practiceProgressRows.map((r) => ({
        mcq_id: r.mcq_id,
        is_correct: r.is_correct,
        at: r.answered_at,
        kind: "mcq_practice",
        subject_id:
          r.subject_id ?? (r.chapter_id ? (chapterToSubject.get(r.chapter_id) ?? null) : null),
        chapter_id: r.chapter_id ?? mcqToChapter.get(r.mcq_id) ?? null,
      })),
    ];
    for (const row of nonPracticeAnswerRows) {
      const ea = Array.isArray(row.exam_attempts) ? row.exam_attempts[0] : row.exam_attempts;
      if (!ea || !row.chosen_option) continue;
      const chapterId = ea.chapter_id ?? mcqToChapter.get(row.mcq_id) ?? null;
      const subjectId =
        ea.subject_id ?? (chapterId ? (chapterToSubject.get(chapterId) ?? null) : null);
      answers.push({
        mcq_id: row.mcq_id,
        is_correct: row.is_correct,
        at: ea.completed_at ?? ea.created_at,
        kind: ea.kind,
        subject_id: subjectId,
        chapter_id: chapterId,
      });
    }
    answers.sort((a, b) => answerTime(b.at) - answerTime(a.at));

    const completed = attempts.filter((a) => a.status === "completed");
    // Build per-attempt correct/total from the non-practice answer rows we
    // already loaded above — same source, no extra round-trips. The previous
    // implementation re-fetched the same answers in N/200 sequential chunks.
    const submittedByAttempt = new Map<string, { correct: number; total: number }>();
    for (const row of nonPracticeAnswerRows) {
      if (!row.attempt_id || !row.chosen_option) continue;
      const current = submittedByAttempt.get(row.attempt_id) ?? { correct: 0, total: 0 };
      current.total += 1;
      if (row.is_correct) current.correct += 1;
      submittedByAttempt.set(row.attempt_id, current);
    }
    const ts = (a: (typeof attempts)[number]) => new Date(a.completed_at ?? a.created_at).getTime();
    const inRange = (a: (typeof attempts)[number], from: Date) => ts(a) >= from.getTime();

    const sumBy = (list: typeof attempts, pick: (a: (typeof attempts)[number]) => number) =>
      list.reduce((s, a) => s + (pick(a) ?? 0), 0);

    const todayList = completed.filter((a) => inRange(a, startOfToday));
    const weekList = completed.filter((a) => inRange(a, startOfWeek));
    const monthList = completed.filter((a) => inRange(a, startOfMonth));

    const countKind = (list: typeof attempts, kind: string) =>
      list.filter((a) => a.kind === kind).length;

    // ---- Answer-based slicing (only submitted MCQs) ----
    // Every MCQ statistic (count, correct, wrong, accuracy, trend, goal)
    // is derived from attempt_answers rows. Unanswered MCQs never contribute.
    const answerTs = (a: SubmittedAnswer) => answerTime(a.at);
    const ansInRange = (a: SubmittedAnswer, from: Date) => answerTs(a) >= from.getTime();
    const todayAns = answers.filter((a) => ansInRange(a, startOfToday));
    const weekAns = answers.filter((a) => ansInRange(a, startOfWeek));
    const prevWeekAns = answers.filter(
      (a) => ansInRange(a, startOfPrevWeek) && !ansInRange(a, startOfWeek),
    );
    const monthAns = answers.filter((a) => ansInRange(a, startOfMonth));
    const correctOf = (list: SubmittedAnswer[]) => list.filter((a) => a.is_correct).length;
    const wrongOf = (list: SubmittedAnswer[]) => list.length - correctOf(list);
    const accOf = (list: SubmittedAnswer[]) =>
      list.length ? Math.round((correctOf(list) / list.length) * 100) : 0;

    // Weekly bars (last 7 days accuracy %) — from submitted answers
    const weeklyBars: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const dayAns = answers.filter((a) => {
        const t = answerTs(a);
        return t >= d.getTime() && t < next.getTime();
      });
      weeklyBars.push(accOf(dayAns));
    }

    // Streak
    const daySet = new Set<string>();
    for (const a of completed) {
      const d = new Date(ts(a));
      d.setHours(0, 0, 0, 0);
      daySet.add(d.toISOString().slice(0, 10));
    }
    let streak = 0;
    {
      const cursor = new Date(startOfToday);
      while (daySet.has(cursor.toISOString().slice(0, 10))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    // Best (longest) streak across the available window
    let bestStreak = 0;
    {
      const sortedDays = Array.from(daySet).sort();
      let run = 0;
      let prev: number | null = null;
      for (const ds of sortedDays) {
        const t = new Date(ds + "T00:00:00").getTime();
        if (prev !== null && t - prev === 86400000) run += 1;
        else run = 1;
        prev = t;
        if (run > bestStreak) bestStreak = run;
      }
    }

    // 30-day heatmap
    const heatmap: { date: string; label: string; count: number; minutes: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const day = completed.filter((a) => {
        const t = ts(a);
        return t >= d.getTime() && t < next.getTime();
      });
      heatmap.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("en", { day: "numeric" }),
        count: day.length,
        minutes: Math.round(sumBy(day, (a) => a.duration_seconds) / 60),
      });
    }

    // Timeline — real recent activity, newest first. Merges completed
    // exam_attempts (quiz / mock / custom exam) with grouped MCQ practice
    // sessions, since MCQ practice does not create exam_attempts rows.
    const attemptEntries = completed
      .filter((a) => a.kind !== "mcq_practice")
      .map((a) => {
        const subjName = a.subject_id ? (subjectMap.get(a.subject_id)?.name ?? null) : null;
        const chapName = a.chapter_id ? (chapterMap.get(a.chapter_id)?.name ?? null) : null;
        const kindLabel =
          a.kind === "quiz"
            ? "Quiz"
            : a.kind === "mock"
              ? "Mock test"
              : a.kind === "custom_exam"
                ? "Custom exam"
                : "MCQ practice";
        return {
          id: a.id,
          kind: a.kind,
          title: a.title ?? chapName ?? subjName ?? kindLabel,
          kindLabel,
          score: a.score,
          correct: submittedByAttempt.get(a.id)?.correct ?? 0,
          total: submittedByAttempt.get(a.id)?.total ?? 0,
          duration: a.duration_seconds,
          subjectId: a.subject_id ?? null,
          chapterId: a.chapter_id ?? null,
          subjectName: subjName,
          chapterName: chapName,
          at: a.completed_at ?? a.created_at,
        };
      });

    // Group recent MCQ practice answers per (chapter, calendar day).
    // Reuses the already-fetched `practiceProgressRows` (ordered by
    // answered_at desc) — no extra round-trip.
    type PAgg = {
      chapterId: string | null;
      subjectId: string | null;
      day: string;
      correct: number;
      total: number;
      latest: string;
    };
    const pMap = new Map<string, PAgg>();
    for (const r of practiceProgressRows.slice(0, 500)) {
      const at = r.answered_at;
      if (!at) continue;
      const day = new Date(at).toISOString().slice(0, 10);
      const key = `${r.chapter_id ?? "none"}|${day}`;
      const cur =
        pMap.get(key) ??
        ({
          chapterId: r.chapter_id ?? null,
          subjectId: r.subject_id ?? null,
          day,
          correct: 0,
          total: 0,
          latest: at,
        } as PAgg);
      cur.total += 1;
      if (r.is_correct) cur.correct += 1;
      if (new Date(at) > new Date(cur.latest)) cur.latest = at;
      pMap.set(key, cur);
    }

    const practiceEntries = Array.from(pMap.values()).map((p) => {
      const chapName = p.chapterId ? (chapterMap.get(p.chapterId)?.name ?? null) : null;
      const subjName = p.subjectId ? (subjectMap.get(p.subjectId)?.name ?? null) : null;
      return {
        id: `practice:${p.chapterId ?? "none"}:${p.day}`,
        kind: "mcq_practice" as const,
        title: chapName ?? subjName ?? "MCQ Practice",
        kindLabel: "MCQ practice",
        score: p.total ? Math.round((p.correct / p.total) * 100) : 0,
        correct: p.correct,
        total: p.total,
        duration: 0,
        subjectId: p.subjectId,
        chapterId: p.chapterId,
        subjectName: subjName,
        chapterName: chapName,
        at: p.latest,
      };
    });

    const timeline = [...attemptEntries, ...practiceEntries]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 12);

    // ---- CHAPTER aggregates ----
    type ChapterAgg = {
      id: string;
      name: string;
      subjectId: string | null;
      subjectName: string | null;
      subjectColor: string | null;
      totalMcqs: number;
      mcqsSolved: number;
      correct: number;
      totalAnswered: number;
      accuracy: number;
      completionPct: number;
      bookmarks: number;
      wrong: number;
      studyMinutes: number;
      quizCompleted: number;
      mockCompleted: number;
      lastAt: string | null;
      practiceSolved: number;
      practiceCompletionPct: number;
    };

    const solvedByChapter = new Map<string, Set<string>>();
    const correctByChapter = new Map<string, number>();
    const answeredByChapter = new Map<string, number>();
    // MCQ Practice-only maps (drive Subject Breakdown)
    const practiceSolvedByChapter = new Map<string, Set<string>>();
    for (const ans of answers) {
      const cid = ans.chapter_id ?? mcqToChapter.get(ans.mcq_id) ?? null;
      if (!cid) continue;
      let set = solvedByChapter.get(cid);
      if (!set) {
        set = new Set();
        solvedByChapter.set(cid, set);
      }
      set.add(ans.mcq_id);
      answeredByChapter.set(cid, (answeredByChapter.get(cid) ?? 0) + 1);
      if (ans.is_correct) correctByChapter.set(cid, (correctByChapter.get(cid) ?? 0) + 1);
      if (ans.kind === "mcq_practice") {
        let pset = practiceSolvedByChapter.get(cid);
        if (!pset) {
          pset = new Set();
          practiceSolvedByChapter.set(cid, pset);
        }
        pset.add(ans.mcq_id);
      }
    }

    const studyByChapter = new Map<string, number>();
    const lastByChapter = new Map<string, number>();
    const quizDoneByChapter = new Map<string, number>();
    const mockDoneByChapter = new Map<string, number>();
    for (const a of completed) {
      if (!a.chapter_id) continue;
      studyByChapter.set(
        a.chapter_id,
        (studyByChapter.get(a.chapter_id) ?? 0) + (a.duration_seconds ?? 0),
      );
      lastByChapter.set(a.chapter_id, Math.max(lastByChapter.get(a.chapter_id) ?? 0, ts(a)));
      if (a.kind === "quiz")
        quizDoneByChapter.set(a.chapter_id, (quizDoneByChapter.get(a.chapter_id) ?? 0) + 1);
      if (a.kind === "mock")
        mockDoneByChapter.set(a.chapter_id, (mockDoneByChapter.get(a.chapter_id) ?? 0) + 1);
    }

    const bookmarksByChapter = new Map<string, number>();
    for (const b of bookmarks) {
      if (!b.chapter_id) continue;
      bookmarksByChapter.set(b.chapter_id, (bookmarksByChapter.get(b.chapter_id) ?? 0) + 1);
    }
    const wrongByChapter = new Map<string, number>();
    for (const w of wrong) {
      if (w.mastered || !w.chapter_id) continue;
      wrongByChapter.set(w.chapter_id, (wrongByChapter.get(w.chapter_id) ?? 0) + 1);
    }

    const chapterAgg: ChapterAgg[] = chapters.map((c) => {
      const subj = c.subject_id ? subjectMap.get(c.subject_id) : null;
      const totalMcqs = mcqsByChapter.get(c.id) ?? 0;
      const mcqsSolved = solvedByChapter.get(c.id)?.size ?? 0;
      const correct = correctByChapter.get(c.id) ?? 0;
      const totalAnswered = answeredByChapter.get(c.id) ?? 0;
      const lastAt = lastByChapter.get(c.id);
      return {
        id: c.id,
        name: c.name,
        subjectId: c.subject_id ?? null,
        subjectName: subj?.name ?? null,
        subjectColor: subj?.color ?? null,
        totalMcqs,
        mcqsSolved,
        correct,
        totalAnswered,
        accuracy: totalAnswered ? Math.round((correct / totalAnswered) * 100) : 0,
        completionPct: totalMcqs ? Math.min(100, Math.round((mcqsSolved / totalMcqs) * 100)) : 0,
        bookmarks: bookmarksByChapter.get(c.id) ?? 0,
        wrong: wrongByChapter.get(c.id) ?? 0,
        studyMinutes: Math.round((studyByChapter.get(c.id) ?? 0) / 60),
        quizCompleted: quizDoneByChapter.get(c.id) ?? 0,
        mockCompleted: mockDoneByChapter.get(c.id) ?? 0,
        lastAt: lastAt ? new Date(lastAt).toISOString() : null,
        practiceSolved: practiceSolvedByChapter.get(c.id)?.size ?? 0,
        practiceCompletionPct: totalMcqs
          ? Math.min(
              100,
              Math.round(((practiceSolvedByChapter.get(c.id)?.size ?? 0) / totalMcqs) * 100),
            )
          : 0,
      };
    });

    // ---- SUBJECT aggregates ----
    type SubjectAgg = {
      id: string;
      name: string;
      color: string | null;
      level: string;
      totalChapters: number;
      completedChapters: number;
      completionPct: number;
      avgScore: number;
      weakChapters: number;
      pendingMcqs: number;
      attempts: number;
      lastAt: string | null;
      inactiveDays: number | null;
      // MCQ Practice-only fields (drive Subject Breakdown)
      practiceSolved: number;
      practiceTotal: number;
      practiceCompletionPct: number;
      practiceAttempted: boolean;
    };

    const subjectAgg: SubjectAgg[] = subjects.map((s) => {
      const ch = chapterAgg.filter((c) => c.subjectId === s.id);
      const total = ch.length;
      const completed = ch.filter((c) => c.completionPct >= 80).length;
      const weak = ch.filter((c) => c.totalAnswered >= 5 && c.accuracy < 50).length;
      const pending = ch.reduce((sum, c) => sum + Math.max(0, c.totalMcqs - c.mcqsSolved), 0);
      const subjAttemptList = monthList.filter((a) => a.subject_id === s.id);
      const last = ch.reduce(
        (m, c) => (c.lastAt && new Date(c.lastAt).getTime() > m ? new Date(c.lastAt).getTime() : m),
        0,
      );
      const totalAnsweredAll = ch.reduce((sum, c) => sum + c.totalAnswered, 0);
      const correctAll = ch.reduce((sum, c) => sum + c.correct, 0);
      const practiceSolved = ch.reduce((sum, c) => sum + c.practiceSolved, 0);
      const practiceTotal = ch.reduce((sum, c) => sum + c.totalMcqs, 0);
      return {
        id: s.id,
        name: s.name,
        color: s.color ?? null,
        level: s.level ?? "professional",
        totalChapters: total,
        completedChapters: completed,
        completionPct: total ? Math.round((completed / total) * 100) : 0,
        avgScore: totalAnsweredAll ? Math.round((correctAll / totalAnsweredAll) * 100) : 0,
        weakChapters: weak,
        pendingMcqs: pending,
        attempts: subjAttemptList.length,
        lastAt: last ? new Date(last).toISOString() : null,
        inactiveDays: last ? Math.floor((now - last) / 86400000) : null,
        practiceSolved,
        practiceTotal,
        practiceCompletionPct: practiceTotal
          ? Math.min(100, Math.round((practiceSolved / practiceTotal) * 100))
          : 0,
        practiceAttempted: practiceSolved > 0,
      };
    });

    const sortedBySkill = [...subjectAgg]
      .filter((s) => s.attempts > 0 || s.completedChapters > 0)
      .sort((a, b) => b.avgScore - a.avgScore);
    const strongest = sortedBySkill[0] ?? null;
    const weakest = sortedBySkill.length ? sortedBySkill[sortedBySkill.length - 1] : null;
    const inactive = subjectAgg
      .filter((s) => s.inactiveDays !== null && s.inactiveDays >= 7)
      .slice(0, 3);

    // Wrong/bookmark top
    const wrongUnresolved = wrong.filter((w) => !w.mastered).length;
    const wrongResolved = wrong.filter((w) => w.mastered).length;
    const wrongRetries = wrong.reduce((s, w) => s + (w.retry_count ?? 0), 0);
    const wrongBySubject = new Map<string, number>();
    for (const w of wrong) {
      if (w.mastered || !w.subject_id) continue;
      wrongBySubject.set(w.subject_id, (wrongBySubject.get(w.subject_id) ?? 0) + 1);
    }
    const wrongTopSubjects = Array.from(wrongBySubject.entries())
      .map(([id, count]) => ({
        id,
        name: subjectMap.get(id)?.name ?? "Unknown",
        color: subjectMap.get(id)?.color ?? null,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    const bookmarksBySubject = new Map<string, number>();
    for (const b of bookmarks) {
      if (!b.subject_id) continue;
      bookmarksBySubject.set(b.subject_id, (bookmarksBySubject.get(b.subject_id) ?? 0) + 1);
    }
    const bookmarksTopSubjects = Array.from(bookmarksBySubject.entries())
      .map(([id, count]) => ({
        id,
        name: subjectMap.get(id)?.name ?? "Unknown",
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);

    // Available levels for filter
    const levels = Array.from(new Set(subjects.map((s) => s.level ?? "professional")));

    // ---- 90-day trend series (charts) ----
    const series: {
      date: string;
      label: string;
      attempts: number;
      mcqs: number;
      correct: number;
      total: number;
      minutes: number;
      accuracy: number;
    }[] = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const dayAttempts = completed.filter((a) => {
        const t = ts(a);
        return t >= d.getTime() && t < next.getTime();
      });
      const dayAns = answers.filter((a) => {
        const t = answerTs(a);
        return t >= d.getTime() && t < next.getTime();
      });
      const total = dayAns.length;
      const correct = correctOf(dayAns);
      series.push({
        date: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
        attempts: dayAttempts.length,
        // Submitted MCQs across MCQ Practice, Quiz, Mock, and Custom Exam.
        mcqs: total,
        correct,
        total,
        minutes: Math.round(sumBy(dayAttempts, (a) => a.duration_seconds) / 60),
        accuracy: total ? Math.round((correct / total) * 100) : 0,
      });
    }

    // ---- 365-day GitHub-style heatmap ----
    const dayBucket = new Map<string, { count: number; minutes: number; mcqs: number }>();
    for (const a of completed) {
      const key = new Date(ts(a)).toISOString().slice(0, 10);
      const b = dayBucket.get(key) ?? { count: 0, minutes: 0, mcqs: 0 };
      b.count += 1;
      b.minutes += Math.round((a.duration_seconds ?? 0) / 60);
      dayBucket.set(key, b);
    }
    // Submitted-MCQ count per day (all sources) overlays the heatmap.
    for (const a of answers) {
      const key = new Date(answerTs(a)).toISOString().slice(0, 10);
      const b = dayBucket.get(key) ?? { count: 0, minutes: 0, mcqs: 0 };
      b.mcqs += 1;
      dayBucket.set(key, b);
    }

    const yearHeatmap: { date: string; count: number; minutes: number; mcqs: number }[] = [];
    for (let i = 364; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const b = dayBucket.get(key) ?? { count: 0, minutes: 0, mcqs: 0 };
      yearHeatmap.push({ date: key, count: b.count, minutes: b.minutes, mcqs: b.mcqs });
    }

    // ---- Most productive weekday ----
    const weekdayMinutes = [0, 0, 0, 0, 0, 0, 0]; // Sun..Sat
    const weekdayCount = [0, 0, 0, 0, 0, 0, 0];
    for (const a of monthList) {
      const wd = new Date(ts(a)).getDay();
      weekdayMinutes[wd] += Math.round((a.duration_seconds ?? 0) / 60);
      weekdayCount[wd] += 1;
    }
    const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let productiveIdx = -1;
    let productiveMax = 0;
    for (let i = 0; i < 7; i++) {
      if (weekdayCount[i] > productiveMax) {
        productiveMax = weekdayCount[i];
        productiveIdx = i;
      }
    }
    const productiveDay = productiveIdx >= 0 ? WD[productiveIdx] : null;

    // ---- Study time trend (last 7d vs prior 7d minutes) ----
    const last7 = series.slice(-7).reduce((s, d) => s + d.minutes, 0);
    const prev7 = series.slice(-14, -7).reduce((s, d) => s + d.minutes, 0);
    const studyDelta = last7 - prev7;

    // ---- Subject accuracy improvement (recent vs older within month) ----
    // Uses submitted answers per subject only.
    let mostImproved: { name: string; delta: number } | null = null;
    for (const s of subjects) {
      const list = monthAns.filter((a) => a.subject_id === s.id);
      if (list.length < 4) continue;
      const mid = Math.floor(list.length / 2);
      const older = list.slice(mid); // older half (list is newest-first)
      const recent = list.slice(0, mid);
      const delta = accOf(recent) - accOf(older);
      if (!mostImproved || delta > mostImproved.delta) mostImproved = { name: s.name, delta };
    }

    // ---- Global totals (only submitted MCQs) ----
    const totalAnswered = answers.length;
    const totalCorrect = correctOf(answers);
    const prevWeekAttempts = attempts.filter(
      (a) => a.status === "completed" && inRange(a, startOfPrevWeek) && !inRange(a, startOfWeek),
    );
    const totals = {
      attempts: completed.length,
      correct: totalCorrect,
      wrong: Math.max(0, totalAnswered - totalCorrect),
      answered: totalAnswered,
      accuracy: accOf(answers),
      avgScore: completed.length
        ? Math.round(sumBy(completed, (a) => a.score ?? 0) / completed.length)
        : 0,
      studyMinutes: Math.round(sumBy(completed, (a) => a.duration_seconds) / 60),
      // Total MCQs submitted across MCQ Practice, Quiz, Mock, and Custom Exam.
      // Practice re-submissions of the same MCQ each count as one solved
      // answer (added via attempt_count), while unique completion progress
      // (chapter / subject percentages) still uses distinct MCQ ids.
      mcqs: totalAnswered + practiceExtraSubmissions,
      mcqPractice: countKind(completed, "mcq_practice"),
      quizzes: countKind(completed, "quiz"),
      mocks: countKind(completed, "mock"),
      customExams: countKind(completed, "custom_exam"),
      chaptersCompleted: chapterAgg.filter((c) => c.completionPct >= 80).length,
      subjectsCovered: subjectAgg.filter((s) => s.attempts > 0 || s.completedChapters > 0).length,
    };

    return {
      userLevel,
      levels,
      today: {
        // Submitted MCQs today (all four sources).
        mcqs: todayAns.length,
        mcqPractice: countKind(todayList, "mcq_practice"),
        quizzes: countKind(todayList, "quiz"),
        mocks: countKind(todayList, "mock"),
        customExams: countKind(todayList, "custom_exam"),
        attempts: todayList.length,
        studyMinutes: Math.round(sumBy(todayList, (a) => a.duration_seconds) / 60),
        accuracy: accOf(todayAns),
        chaptersTouched: new Set(todayList.map((a) => a.chapter_id).filter(Boolean)).size,
        streak,
        bestStreak,
        correct: correctOf(todayAns),
        wrong: wrongOf(todayAns),
      },
      week: {
        attempts: weekList.length,
        // Submitted MCQs this week (all four sources).
        mcqs: weekAns.length,
        correct: correctOf(weekAns),
        wrong: wrongOf(weekAns),
        mcqPractice: countKind(weekList, "mcq_practice"),
        quizzes: countKind(weekList, "quiz"),
        mocks: countKind(weekList, "mock"),
        studyMinutes: Math.round(sumBy(weekList, (a) => a.duration_seconds) / 60),
        accuracy: accOf(weekAns),
        deltaAccuracy: accOf(weekAns) - accOf(prevWeekAns),
        deltaAttempts: weekList.length - prevWeekAttempts.length,
        bars: weeklyBars,
      },
      month: {
        attempts: monthList.length,
        mcqs: monthAns.length,
        correct: correctOf(monthAns),
        wrong: wrongOf(monthAns),
        mcqPractice: countKind(monthList, "mcq_practice"),
        quizzes: countKind(monthList, "quiz"),
        mocks: countKind(monthList, "mock"),
        accuracy: accOf(monthAns),
        studyMinutes: Math.round(sumBy(monthList, (a) => a.duration_seconds) / 60),
        activeDays: new Set(monthList.map((a) => new Date(ts(a)).toISOString().slice(0, 10))).size,
      },
      totals,
      series,
      yearHeatmap,
      heatmap,
      timeline,
      subjects: subjectAgg,
      chapters: chapterAgg,
      insights: { strongest, weakest, inactive, productiveDay, studyDelta, mostImproved },
      wrongQuestions: {
        unresolved: wrongUnresolved,
        resolved: wrongResolved,
        retries: wrongRetries,
        topSubjects: wrongTopSubjects,
      },
      bookmarks: {
        total: bookmarks.length,
        topSubjects: bookmarksTopSubjects,
      },
    };
  });