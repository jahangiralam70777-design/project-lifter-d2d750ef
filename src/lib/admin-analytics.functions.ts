// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { sanitizeSearchTerm } from "@/lib/admin-search-sanitize";

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

const filtersInput = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    level: z.string().trim().max(40).optional(),
    subjectId: z.string().uuid().optional(),
  })
  .partial();

function defaultRange(input: z.infer<typeof filtersInput>) {
  const to = input.to ? new Date(input.to) : new Date();
  const from = input.from
    ? new Date(input.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

export const adminAnalyticsOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof filtersInput>) => filtersInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    // Cross-user analytics needs to bypass owner-only RLS (profiles, exam_attempts,
    // mcq_practice_progress). Permission gate above already enforces admin access.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin;
    const { from, to } = defaultRange(data);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const sevenAgo = new Date(now.getTime() - 7 * dayMs);
    const thirtyAgo = new Date(now.getTime() - 30 * dayMs);
    const prev7Start = new Date(now.getTime() - 14 * dayMs);
    const prev30Start = new Date(now.getTime() - 60 * dayMs);

    // KPIs in parallel
    const [
      profilesTotal,
      profilesActive,
      newProfiles,
      attemptsAll,
      attemptsCompleted,
      mcqsCount,
      notesCount,
      videosCount,
      flashCount,
      qbCount,
      quizCount,
      mockCount,
      profilesAll,
      dauAttempts,
      wau7,
      wauPrev7,
      mau30,
      mauPrev30,
      recentAttempts,
      bookmarksCount,
      wrongCount,
    ] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }),
      sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
      sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fromIso)
        .lte("created_at", toIso),
      sb
        .from("exam_attempts")
        .select(
          "id,correct_count,total_count,duration_seconds,user_id,quiz_id,kind,subject_id,chapter_id,level,created_at,title",
        )
        .eq("status", "completed")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .limit(5000),
      sb.from("mcqs").select("id", { count: "exact", head: true }),
      sb.from("short_notes").select("id,download_count,view_count", { count: "exact" }).limit(2000),
      sb.from("video_classes").select("id,view_count", { count: "exact" }).limit(2000),
      sb.from("flash_cards").select("id,view_count", { count: "exact" }).limit(2000),
      sb
        .from("question_bank_resources")
        .select("id,download_count,view_count", { count: "exact" })
        .limit(2000),
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "quiz"),
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "mock"),
      sb.from("profiles").select("id,level"),
      sb
        .from("exam_attempts")
        .select("user_id,created_at")
        .gte("created_at", todayStart.toISOString())
        .limit(5000),
      sb
        .from("exam_attempts")
        .select("user_id")
        .gte("created_at", sevenAgo.toISOString())
        .limit(10000),
      sb
        .from("exam_attempts")
        .select("user_id")
        .gte("created_at", prev7Start.toISOString())
        .lt("created_at", sevenAgo.toISOString())
        .limit(10000),
      sb
        .from("exam_attempts")
        .select("user_id")
        .gte("created_at", thirtyAgo.toISOString())
        .limit(20000),
      sb
        .from("exam_attempts")
        .select("user_id")
        .gte("created_at", prev30Start.toISOString())
        .lt("created_at", thirtyAgo.toISOString())
        .limit(20000),
      sb
        .from("exam_attempts")
        .select("id,user_id,kind,score,correct_count,total_count,created_at,title,status")
        .order("created_at", { ascending: false })
        .limit(15),
      sb.from("mcq_bookmarks").select("id", { count: "exact", head: true }),
      sb.from("mcq_wrong_questions").select("id", { count: "exact", head: true }),
    ]);

    // ---- MCQs Solved (last 30 days, all students) ----
    // Two real sources, no overlap:
    //   (a) mcq_practice_progress  → one row per answered practice MCQ
    //   (b) exam_attempts.completed (kind in quiz/mock/custom_exam) → total_count = MCQs submitted
    const [practiceLast30, examsLast30ForMcqs] = await Promise.all([
      sb
        .from("mcq_practice_progress")
        .select("id", { count: "exact", head: true })
        .gte("answered_at", thirtyAgo.toISOString()),
      sb
        .from("exam_attempts")
        .select("total_count")
        .eq("status", "completed")
        .in("kind", ["quiz", "mock", "custom_exam"])
        .gte("created_at", thirtyAgo.toISOString())
        .limit(50000),
    ]);
    const examMcqs30 = ((examsLast30ForMcqs.data ?? []) as Array<{ total_count: number | null }>)
      .reduce((s, r) => s + (r.total_count ?? 0), 0);
    const mcqsSolved30d = (practiceLast30.count ?? 0) + examMcqs30;

    // ---- Subject performance: include MCQ practice rows (subject + is_correct) ----
    const { data: practiceSubjects } = await sb
      .from("mcq_practice_progress")
      .select("subject_id, is_correct")
      .not("subject_id", "is", null)
      .limit(50000);

    // ---- Exam Participation: unique students per day (last 14d, real exams only) ----
    const { data: participationRows } = await sb
      .from("exam_attempts")
      .select("user_id, created_at")
      .in("kind", ["quiz", "mock", "custom_exam"])
      .gte("created_at", new Date(now.getTime() - 14 * dayMs).toISOString())
      .limit(20000);

    const completed = (attemptsCompleted.data ?? []) as Array<{
      correct_count: number;
      total_count: number;
      duration_seconds: number;
      user_id: string;
      quiz_id: string;
      kind: string;
      subject_id: string | null;
      chapter_id: string | null;
      level: string | null;
      created_at: string;
      title: string | null;
    }>;
    const totalAnswered = completed.reduce((s, a) => s + (a.total_count ?? 0), 0);
    const totalCorrect = completed.reduce((s, a) => s + (a.correct_count ?? 0), 0);
    const accuracy = totalAnswered > 0 ? (totalCorrect / totalAnswered) * 100 : 0;
    const totalDuration = completed.reduce((s, a) => s + (a.duration_seconds ?? 0), 0);
    const uniqueLearners = new Set(completed.map((a) => a.user_id)).size;
    const avgEngagementSec = uniqueLearners > 0 ? totalDuration / uniqueLearners : 0;

    const mcqsSolved = totalAnswered;
    const mockAttempts = completed.filter((a) => a.kind === "mock").length;
    const quizAttempts = completed.filter((a) => a.kind === "quiz").length;

    const noteDownloads = (notesCount.data ?? []).reduce(
      (s, n: { download_count?: number }) => s + (n.download_count ?? 0),
      0,
    );
    const qbDownloads = (qbCount.data ?? []).reduce(
      (s, n: { download_count?: number }) => s + (n.download_count ?? 0),
      0,
    );
    const videoViews = (videosCount.data ?? []).reduce(
      (s, n: { view_count?: number }) => s + (n.view_count ?? 0),
      0,
    );
    const flashViews = (flashCount.data ?? []).reduce(
      (s, n: { view_count?: number }) => s + (n.view_count ?? 0),
      0,
    );
    const noteViews = (notesCount.data ?? []).reduce(
      (s, n: { view_count?: number }) => s + (n.view_count ?? 0),
      0,
    );

    // DAU/WAU/MAU
    const dau = new Set(
      ((dauAttempts.data ?? []) as Array<{ user_id: string }>).map((a) => a.user_id),
    ).size;
    const wau = new Set(((wau7.data ?? []) as Array<{ user_id: string }>).map((a) => a.user_id))
      .size;
    const wauPrev = new Set(
      ((wauPrev7.data ?? []) as Array<{ user_id: string }>).map((a) => a.user_id),
    ).size;
    const mau = new Set(((mau30.data ?? []) as Array<{ user_id: string }>).map((a) => a.user_id))
      .size;
    const mauPrev = new Set(
      ((mauPrev30.data ?? []) as Array<{ user_id: string }>).map((a) => a.user_id),
    ).size;
    const wauGrowth =
      wauPrev > 0 ? Math.round(((wau - wauPrev) / wauPrev) * 1000) / 10 : wau > 0 ? 100 : 0;
    const mauGrowth =
      mauPrev > 0 ? Math.round(((mau - mauPrev) / mauPrev) * 1000) / 10 : mau > 0 ? 100 : 0;

    // Level-wise (from profiles & attempts)
    const levelProfileCounts = new Map<string, number>();
    for (const p of (profilesAll.data ?? []) as Array<{ level: string | null }>) {
      const k = p.level || "unknown";
      levelProfileCounts.set(k, (levelProfileCounts.get(k) ?? 0) + 1);
    }
    const levelStatsMap = new Map<
      string,
      { users: number; attempts: number; correct: number; total: number }
    >();
    for (const [k, v] of levelProfileCounts)
      levelStatsMap.set(k, { users: v, attempts: 0, correct: 0, total: 0 });
    for (const a of completed) {
      const k = a.level || "unknown";
      const s = levelStatsMap.get(k) ?? { users: 0, attempts: 0, correct: 0, total: 0 };
      s.attempts += 1;
      s.correct += a.correct_count ?? 0;
      s.total += a.total_count ?? 0;
      levelStatsMap.set(k, s);
    }
    const levelStats = Array.from(levelStatsMap.entries())
      .map(([level, s]) => ({
        level,
        users: s.users,
        attempts: s.attempts,
        accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
      }))
      .sort((a, b) => b.users - a.users);

    // Growth: registrations over last 12 months
    const months: { label: string; key: string; start: Date; end: Date }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      months.push({
        label: d.toLocaleString("en", { month: "short" }),
        key: `${d.getFullYear()}-${d.getMonth()}`,
        start: d,
        end: next,
      });
    }
    const { data: regs } = await sb
      .from("profiles")
      .select("created_at")
      .gte("created_at", months[0].start.toISOString());
    const growth = months.map((m) => ({
      label: m.label,
      registrations: (regs ?? []).filter((r: { created_at: string }) => {
        const t = new Date(r.created_at).getTime();
        return t >= m.start.getTime() && t < m.end.getTime();
      }).length,
    }));

    // Attempts per day (last 14 days)
    const days: { label: string; start: Date; end: Date; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      days.push({
        label: d.toLocaleDateString("en", { weekday: "short" }),
        start: d,
        end: next,
        count: 0,
      });
    }
    // Unique students per day from real exam attempts (quiz/mock/custom_exam).
    const partByDay = new Map<number, Set<string>>();
    for (const r of (participationRows ?? []) as Array<{ user_id: string; created_at: string }>) {
      const t = new Date(r.created_at).getTime();
      const d = days.find((d) => t >= d.start.getTime() && t < d.end.getTime());
      if (!d) continue;
      const key = d.start.getTime();
      const set = partByDay.get(key) ?? new Set<string>();
      if (r.user_id) set.add(r.user_id);
      partByDay.set(key, set);
    }
    for (const d of days) d.count = partByDay.get(d.start.getTime())?.size ?? 0;

    // Subject & chapter join
    const { data: subjects } = await sb
      .from("subjects")
      .select("id,name,color")
      .order("sort_order");
    const { data: chaptersData } = await sb.from("chapters").select("id,name,subject_id");
    const { data: quizzes } = await sb.from("quizzes").select("id,subject_id,chapter_id");
    const quizSubj = new Map<string, string>();
    const quizChap = new Map<string, string>();
    for (const q of (quizzes ?? []) as Array<{
      id: string;
      subject_id: string | null;
      chapter_id: string | null;
    }>) {
      if (q.subject_id) quizSubj.set(q.id, q.subject_id);
      if (q.chapter_id) quizChap.set(q.id, q.chapter_id);
    }

    // Subject performance: aggregate completed exam attempts + MCQ practice rows.
    const subjStats = new Map<string, { correct: number; total: number; attempts: number }>();
    for (const a of completed) {
      const sid = a.subject_id || quizSubj.get(a.quiz_id);
      if (!sid) continue;
      const s = subjStats.get(sid) ?? { correct: 0, total: 0, attempts: 0 };
      s.correct += a.correct_count ?? 0;
      s.total += a.total_count ?? 0;
      s.attempts += 1;
      subjStats.set(sid, s);
    }
    for (const p of (practiceSubjects ?? []) as Array<{
      subject_id: string;
      is_correct: boolean | null;
    }>) {
      const s = subjStats.get(p.subject_id) ?? { correct: 0, total: 0, attempts: 0 };
      s.total += 1;
      if (p.is_correct) s.correct += 1;
      subjStats.set(p.subject_id, s);
    }
    const subjectPerformance = (subjects ?? []).map(
      (s: { id: string; name: string; color: string | null }) => {
        const st = subjStats.get(s.id);
        const accPct = st && st.total > 0 ? (st.correct / st.total) * 100 : 0;
        return {
          id: s.id,
          name: s.name,
          color: s.color,
          accuracy: Math.round(accPct),
          attempts: st?.attempts ?? 0,
        };
      },
    );

    // Chapter engagement (top 8 by attempts)
    const chapStats = new Map<string, { correct: number; total: number; attempts: number }>();
    for (const a of completed) {
      const cid = a.chapter_id || quizChap.get(a.quiz_id);
      if (!cid) continue;
      const s = chapStats.get(cid) ?? { correct: 0, total: 0, attempts: 0 };
      s.correct += a.correct_count ?? 0;
      s.total += a.total_count ?? 0;
      s.attempts += 1;
      chapStats.set(cid, s);
    }
    const chapterEngagement = Array.from(chapStats.entries())
      .map(([cid, s]) => {
        const ch = (chaptersData ?? []).find((c: { id: string }) => c.id === cid);
        const subj = ch
          ? (subjects ?? []).find((sb: { id: string }) => sb.id === ch.subject_id)
          : null;
        return {
          id: cid,
          name: ch?.name ?? "Unknown chapter",
          subject: subj?.name ?? "",
          attempts: s.attempts,
          accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
        };
      })
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 8);

    // Most used sections (by interaction volume)
    const sections = [
      { key: "MCQ Practice", value: mcqsSolved },
      { key: "Quizzes", value: quizAttempts },
      { key: "Mock Tests", value: mockAttempts },
      { key: "Short Notes", value: noteViews + noteDownloads },
      { key: "Video Classes", value: videoViews },
      { key: "Flash Cards", value: flashViews },
      { key: "Question Bank", value: qbDownloads },
      { key: "Bookmarks", value: bookmarksCount.count ?? 0 },
    ].sort((a, b) => b.value - a.value);

    // Top students
    const studentMap = new Map<string, { correct: number; total: number; attempts: number }>();
    for (const a of completed) {
      const s = studentMap.get(a.user_id) ?? { correct: 0, total: 0, attempts: 0 };
      s.correct += a.correct_count ?? 0;
      s.total += a.total_count ?? 0;
      s.attempts += 1;
      studentMap.set(a.user_id, s);
    }
    const topIds = Array.from(studentMap.entries())
      .sort((a, b) => b[1].correct - a[1].correct)
      .slice(0, 8)
      .map(([id]) => id);
    const { data: topProfiles } = topIds.length
      ? await sb.from("profiles").select("id,display_name,avatar_url,level").in("id", topIds)
      : {
          data: [] as Array<{
            id: string;
            display_name: string;
            avatar_url: string | null;
            level: string;
          }>,
        };
    const topStudents = topIds.map((id) => {
      const p = (topProfiles ?? []).find((x: { id: string }) => x.id === id);
      const s = studentMap.get(id)!;
      return {
        id,
        name: p?.display_name ?? "Unknown",
        level: p?.level ?? "—",
        accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0,
        attempts: s.attempts,
        score: s.correct,
      };
    });

    // Recent activity feed: enrich with display names
    const recent = (recentAttempts.data ?? []) as Array<{
      id: string;
      user_id: string;
      kind: string;
      score: number;
      correct_count: number;
      total_count: number;
      created_at: string;
      title: string | null;
      status: string;
    }>;
    const recentIds = Array.from(new Set(recent.map((r) => r.user_id)));
    const { data: recentProfiles } = recentIds.length
      ? await sb.from("profiles").select("id,display_name,level").in("id", recentIds)
      : { data: [] as Array<{ id: string; display_name: string; level: string }> };
    const recentActivity = recent.map((r) => {
      const p = (recentProfiles ?? []).find((x: { id: string }) => x.id === r.user_id);
      return {
        id: r.id,
        name: p?.display_name ?? "Unknown",
        level: p?.level ?? "—",
        kind: r.kind,
        title:
          r.title ??
          (r.kind === "mock" ? "Mock test" : r.kind === "quiz" ? "Quiz attempt" : "Practice"),
        accuracy: r.total_count > 0 ? Math.round((r.correct_count / r.total_count) * 100) : 0,
        status: r.status,
        at: r.created_at,
      };
    });

    // Live (last 5 min)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const [liveAttempts, recentAttempters] = await Promise.all([
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .gte("created_at", fiveMinAgo),
      sb.from("exam_attempts").select("user_id").gte("created_at", fiveMinAgo).limit(500),
    ]);
    const liveUsers = new Set(
      ((recentAttempters.data ?? []) as Array<{ user_id: string }>).map((a) => a.user_id),
    ).size;

    return {
      range: { from: fromIso, to: toIso },
      kpis: {
        totalUsers: profilesTotal.count ?? 0,
        activeUsers: profilesActive.count ?? 0,
        newUsers: newProfiles.count ?? 0,
        attempts: attemptsAll.count ?? 0,
        mcqsSolved: mcqsSolved30d,
        mockAttempts,
        quizAttempts,
        accuracy: Math.round(accuracy * 10) / 10,
        avgEngagementSec: Math.round(avgEngagementSec),
        downloads: noteDownloads + qbDownloads,
        contentItems:
          (mcqsCount.count ?? 0) +
          (notesCount.count ?? 0) +
          (videosCount.count ?? 0) +
          (flashCount.count ?? 0) +
          (quizCount.count ?? 0) +
          (mockCount.count ?? 0),
        dau,
        wau,
        mau,
        wauGrowth,
        mauGrowth,
        bookmarks: bookmarksCount.count ?? 0,
        wrongQuestions: wrongCount.count ?? 0,
      },
      growth,
      participation: days.map((d) => ({ label: d.label, value: d.count })),
      subjectPerformance,
      chapterEngagement,
      levelStats,
      mostUsedSections: sections,
      resources: { noteDownloads, qbDownloads, videoViews, flashViews, noteViews },
      topStudents,
      recentActivity,
      live: { attempts5m: liveAttempts.count ?? 0, users5m: liveUsers },
    };
  });

/* ===========================================================
 * Live activity tracking (admin-only)
 * =========================================================== */

const rangeInput = z.object({
  rangeHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .optional(),
  limit: z.number().int().min(1).max(100).optional(),
  bucketMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
});

export const adminActivityOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { rangeHours?: number }) => rangeInput.partial().parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const hours = data.rangeHours ?? 24;
    const { data: row, error } = await context.supabase.rpc("admin_activity_overview", {
      _range_hours: hours,
    });
    if (error) throw error;
    return row as Record<string, number>;
  });

export const adminTopButtons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { rangeHours?: number; limit?: number }) => rangeInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const { data: rows, error } = await context.supabase.rpc("admin_top_buttons", {
      _range_hours: data.rangeHours ?? 24,
      _limit: data.limit ?? 10,
    });
    if (error) throw error;
    return (rows ?? []) as Array<{
      element_id: string;
      element_label: string;
      page_path: string;
      click_count: number;
    }>;
  });

export const adminTopPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { rangeHours?: number; limit?: number }) => rangeInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const { data: rows, error } = await context.supabase.rpc("admin_top_pages", {
      _range_hours: data.rangeHours ?? 24,
      _limit: data.limit ?? 10,
    });
    if (error) throw error;
    return (rows ?? []) as Array<{ page_path: string; view_count: number; unique_users: number }>;
  });

export const adminTopModules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { rangeHours?: number; limit?: number }) => rangeInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const { data: rows, error } = await context.supabase.rpc("admin_top_modules", {
      _range_hours: data.rangeHours ?? 24,
      _limit: data.limit ?? 10,
    });
    if (error) throw error;
    return (rows ?? []) as Array<{ module: string; event_count: number; unique_users: number }>;
  });

export const adminActivityTimeseries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { rangeHours?: number; bucketMinutes?: number }) => rangeInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const { data: rows, error } = await context.supabase.rpc("admin_activity_timeseries", {
      _range_hours: data.rangeHours ?? 24,
      _bucket_minutes: data.bucketMinutes ?? 60,
    });
    if (error) throw error;
    return (rows ?? []) as Array<{ bucket: string; event_type: string; event_count: number }>;
  });

export const adminUserActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { userId: string; limit?: number }) =>
    z
      .object({ userId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const { data: rows, error } = await context.supabase.rpc("admin_user_activity", {
      _user_id: data.userId,
      _limit: data.limit ?? 50,
    });
    if (error) throw error;
    return (rows ?? []) as unknown as Array<{
      id: string;
      user_id: string;
      event_type: string;
      page_path: string | null;
      element_label: string | null;
      module: string | null;
      metadata: Json;
      created_at: string;
    }>;
  });

const feedInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  eventType: z.string().max(40).optional(),
  userId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  rangeHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 365)
    .optional(),
});

export const adminActivityFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof feedInput>) => feedInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const sb = context.supabase;
    const hours = data.rangeHours ?? 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    let q = sb
      .from("activity_events")
      .select(
        "id,user_id,event_type,page_path,element_id,element_label,module,target_kind,target_id,metadata,created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.eventType) q = q.eq("event_type", data.eventType);
    if (data.userId) q = q.eq("user_id", data.userId);
    if (data.search) {
      const term = sanitizeSearchTerm(data.search);
      if (term)
        q = q.or(
          `element_label.ilike.%${term}%,page_path.ilike.%${term}%,element_id.ilike.%${term}%`,
        );
    }
    const { data: rows, error } = await q;
    if (error) throw error;

    const rowsAny = (rows ?? []) as unknown as Array<{
      id: string;
      user_id: string | null;
      event_type: string;
      page_path: string | null;
      element_id: string | null;
      element_label: string | null;
      module: string | null;
      target_kind: string | null;
      target_id: string | null;
      metadata: Json;
      created_at: string;
    }>;
    const userIds = Array.from(new Set(rowsAny.map((r) => r.user_id).filter(Boolean) as string[]));
    const { data: profiles } = userIds.length
      ? await sb.from("profiles").select("id,display_name,avatar_url").in("id", userIds)
      : {
          data: [] as Array<{ id: string; display_name: string | null; avatar_url: string | null }>,
        };
    const pmap = new Map(
      (profiles ?? []).map(
        (p: { id: string; display_name: string | null; avatar_url: string | null }) => [p.id, p],
      ),
    );

    // Resolve target_id -> human-readable name, grouped by target_kind.
    const idsByKind = new Map<string, Set<string>>();
    for (const r of rowsAny) {
      if (!r.target_kind || !r.target_id) continue;
      const k = r.target_kind.toLowerCase();
      if (!idsByKind.has(k)) idsByKind.set(k, new Set());
      idsByKind.get(k)!.add(r.target_id);
    }
    const targetName = new Map<string, string>(); // key = `${kind}:${id}`
    const fetchKind = async (
      kind: string,
      table: string,
      nameCol: string,
    ) => {
      const ids = Array.from(idsByKind.get(kind) ?? []);
      if (!ids.length) return;
      const { data: rows } = await (sb as unknown as {
        from: (t: string) => {
          select: (cols: string) => {
            in: (col: string, vals: string[]) => Promise<{ data: Array<Record<string, unknown>> | null }>;
          };
        };
      }).from(table).select(`id,${nameCol}`).in("id", ids);
      for (const row of (rows ?? []) as Array<Record<string, unknown>>) {
        const id = row.id as string;
        const nm = (row[nameCol] as string | null) ?? null;
        if (id && nm) targetName.set(`${kind}:${id}`, nm);
      }
    };
    await Promise.all([
      fetchKind("subject", "subjects", "name"),
      fetchKind("chapter", "chapters", "name"),
      fetchKind("quiz", "quizzes", "title"),
      fetchKind("mock", "quizzes", "title"),
      fetchKind("video", "video_classes", "title"),
      fetchKind("video_class", "video_classes", "title"),
      fetchKind("short_note", "short_notes", "title"),
      fetchKind("flash_card", "flash_cards", "front"),
    ]);

    return rowsAny.map((r) => {
      const kind = r.target_kind?.toLowerCase() ?? null;
      const tname =
        kind && r.target_id ? (targetName.get(`${kind}:${r.target_id}`) ?? null) : null;
      return {
        ...r,
        user_name: r.user_id ? (pmap.get(r.user_id)?.display_name ?? "Unknown") : "Anonymous",
        user_avatar: r.user_id ? (pmap.get(r.user_id)?.avatar_url ?? null) : null,
        target_name: tname ?? (r.target_id ? "Deleted Record" : null),
      };
    });
  });