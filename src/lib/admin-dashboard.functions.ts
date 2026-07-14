// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";

export type RecentUpload = {
  id: string;
  title: string;
  kind: "mcq" | "note" | "flash" | "video" | "qbank" | "quiz";
  created_at: string;
  status: string;
};

export type RecentNotification = {
  id: string;
  title: string;
  status: string;
  audience: string;
  created_at: string;
  sent_at: string | null;
};

export type AdminDashboardSnapshot = {
  counters: {
    activeStudents: number;
    totalStudents: number;
    liveExams: number;
    pendingDrafts: number;
    recentUploads24h: number;
    scheduledNotifications: number;
  };
  recentUploads: RecentUpload[];
  recentNotifications: RecentNotification[];
};

export const adminDashboardSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    if (d !== undefined && d !== null && !(typeof d === "object" && Object.keys(d).length === 0)) {
      throw new Error("adminDashboardSnapshot accepts no input");
    }
    return {};
  })
  .handler(async ({ context }): Promise<AdminDashboardSnapshot> => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const sb = context.supabase;
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      profilesActive,
      profilesTotal,
      liveExams,
      mcqDrafts,
      noteDrafts,
      flashDrafts,
      videoDrafts,
      qbankDrafts,
      quizDrafts,
      scheduledNotif,
      recentMcqs,
      recentNotes,
      recentFlash,
      recentVideos,
      recentQbank,
      recentQuiz,
      recentNotifs,
    ] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "active"),
      sb.from("profiles").select("id", { count: "exact", head: true }),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress"),
      sb.from("mcqs").select("id", { count: "exact", head: true }).eq("status", "draft"),
      sb.from("short_notes").select("id", { count: "exact", head: true }).eq("status", "draft"),
      sb.from("flash_cards").select("id", { count: "exact", head: true }).eq("status", "draft"),
      sb.from("video_classes").select("id", { count: "exact", head: true }).eq("status", "draft"),
      sb
        .from("question_bank_resources")
        .select("id", { count: "exact", head: true })
        .eq("status", "draft"),
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("status", "draft"),
      sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled"),
      sb
        .from("mcqs")
        .select("id,question,created_at,status")
        .order("created_at", { ascending: false })
        .limit(5),
      sb
        .from("short_notes")
        .select("id,title,created_at,status")
        .order("created_at", { ascending: false })
        .limit(5),
      sb
        .from("flash_cards")
        .select("id,front,created_at,status")
        .order("created_at", { ascending: false })
        .limit(5),
      sb
        .from("video_classes")
        .select("id,title,created_at,status")
        .order("created_at", { ascending: false })
        .limit(5),
      sb
        .from("question_bank_resources")
        .select("id,title,created_at,status")
        .order("created_at", { ascending: false })
        .limit(5),
      sb
        .from("quizzes")
        .select("id,title,created_at,status")
        .order("created_at", { ascending: false })
        .limit(5),
      sb
        .from("notifications")
        .select("id,title,status,audience,created_at,sent_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const pendingDrafts =
      (mcqDrafts.count ?? 0) +
      (noteDrafts.count ?? 0) +
      (flashDrafts.count ?? 0) +
      (videoDrafts.count ?? 0) +
      (qbankDrafts.count ?? 0) +
      (quizDrafts.count ?? 0);

    const ups: RecentUpload[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(recentMcqs.data ?? []).map((r: any) => ({
        id: r.id,
        title: r.question?.slice(0, 80) ?? "MCQ",
        kind: "mcq" as const,
        created_at: r.created_at,
        status: r.status,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(recentNotes.data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        kind: "note" as const,
        created_at: r.created_at,
        status: r.status,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(recentFlash.data ?? []).map((r: any) => ({
        id: r.id,
        title: r.front?.slice(0, 80) ?? "Flash card",
        kind: "flash" as const,
        created_at: r.created_at,
        status: r.status,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(recentVideos.data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        kind: "video" as const,
        created_at: r.created_at,
        status: r.status,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(recentQbank.data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        kind: "qbank" as const,
        created_at: r.created_at,
        status: r.status,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(recentQuiz.data ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        kind: "quiz" as const,
        created_at: r.created_at,
        status: r.status,
      })),
    ]
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 10);

    const recentUploads24h = ups.filter((u) => u.created_at >= dayAgo).length;

    return {
      counters: {
        activeStudents: profilesActive.count ?? 0,
        totalStudents: profilesTotal.count ?? 0,
        liveExams: liveExams.count ?? 0,
        pendingDrafts,
        recentUploads24h,
        scheduledNotifications: scheduledNotif.count ?? 0,
      },
      recentUploads: ups,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentNotifications: (recentNotifs.data ?? []) as any,
    };
  });

/* ===================== Premium Control Center ===================== */

export type ModuleStat = {
  key: "mcq_practice" | "quiz" | "mock_test" | "flash_cards";
  label: string;
  enabled: boolean;
  attempts_total: number;
  attempts_24h: number;
  active_users_24h: number;
  last_used_at: string | null;
  top_chapter: string | null;
};

export type SeriesPoint = { date: string; value: number };
export type ModuleUsagePoint = {
  date: string;
  mcq_practice: number;
  quiz: number;
  mock_test: number;
  flash_cards: number;
};

export type AdminControlCenter = {
  users: {
    total_students: number;
    total_admins: number;
    active_now: number;
    active_24h: number;
    active_7d: number;
    active_30d: number;
    lifetime_active: number;
    total_logins: number;
    avg_session_seconds: number;
  };
  traffic: {
    page_views_24h: number;
    clicks_24h: number;
    submits_24h: number;
    total_events_24h: number;
    sessions_24h: number;
    api_errors_24h: number;
  };
  modules: ModuleStat[];
  growth_series: SeriesPoint[];
  login_series: SeriesPoint[];
  module_usage_series: ModuleUsagePoint[];
  top_users: {
    id: string;
    display_name: string | null;
    total_login_count: number;
    total_usage_seconds: number;
    last_login_at: string | null;
  }[];
  top_features: { module: string; event_count: number; unique_users: number }[];
  recent_activity: {
    id: string;
    event_type: string;
    element_label: string | null;
    page_path: string | null;
    module: string | null;
    user_id: string | null;
    user_name: string | null;
    created_at: string;
  }[];
};

function bucketByDay(rows: { ts: string }[], days: number): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  const map = new Map<string, number>();
  for (const r of rows) {
    const d = new Date(r.ts);
    const key = d.toISOString().slice(0, 10);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, value: map.get(key) ?? 0 });
  }
  return out;
}

export const adminControlCenter = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminControlCenter> => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const sb = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [
      userAnalyticsRpc,
      activityOverviewRpc,
      topModulesRpc,
      topUsersRpc,
      profilesTotal,
      adminRoles,
      moduleVis,
      attemptsAll,
      attempts24h,
      flashEvents24h,
      flashEventsAll,
      profilesNew,
      loginsRecent,
      eventsLast7d,
      recentEvents,
    ] = await Promise.all([
      sb.rpc("admin_user_analytics"),
      sb.rpc("admin_activity_overview", { _range_hours: 24 }),
      sb.rpc("admin_top_modules", { _range_hours: 168, _limit: 5 }),
      sb.rpc("admin_top_users", { _order: "most", _limit: 5 }),
      sb.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
      supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]),
      sb.from("module_visibility").select("key,label,hidden"),
      sb.from("exam_attempts").select("kind, chapter_id, completed_at, created_at, user_id"),
      sb.from("exam_attempts").select("kind, user_id, created_at").gte("created_at", dayAgo),
      sb
        .from("activity_events")
        .select("user_id, created_at")
        .eq("module", "flash_cards")
        .gte("created_at", dayAgo),
      sb.from("activity_events").select("created_at").eq("module", "flash_cards"),
      sb.from("profiles").select("created_at").gte("created_at", monthAgo),
      sb.from("user_login_events").select("login_at").gte("login_at", monthAgo),
      sb
        .from("activity_events")
        .select("module, created_at")
        .gte("created_at", weekAgo)
        .not("module", "is", null),
      sb
        .from("activity_events")
        .select("id, event_type, element_label, page_path, module, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(15),
    ]);

    const ua = (userAnalyticsRpc.data ?? {}) as Record<string, number>;
    const ao = (activityOverviewRpc.data ?? {}) as Record<string, number>;

    // Module aggregates from exam_attempts.
    // exam_attempts.kind values are 'mcq_practice' | 'quiz' | 'mock' | 'custom_exam';
    // module-visibility key is 'mock_test'. Map between them at query time.
    const kindForModule = (mod: string) => (mod === "mock_test" ? "mock" : mod);

    const attemptsByKind = (kind: string) =>
      (attemptsAll.data ?? []).filter((a: any) => a.kind === kindForModule(kind));

    const attempts24hByKind = (kind: string) =>
      (attempts24h.data ?? []).filter((a: any) => a.kind === kindForModule(kind));

    // Top chapter lookup
    const chapterIds = Array.from(
      new Set(
        (attemptsAll.data ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((a: any) => a.chapter_id)
          .filter((c: string | null): c is string => !!c),
      ),
    );
    let chapterNames = new Map<string, string>();
    if (chapterIds.length > 0) {
      const { data: chRows } = await sb.from("chapters").select("id,name").in("id", chapterIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chapterNames = new Map((chRows ?? []).map((c: any) => [c.id, c.name]));
    }
    const topChapterFor = (kind: string): string | null => {
      const counts = new Map<string, number>();
      for (const a of attemptsByKind(kind)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cid = (a as any).chapter_id;
        if (!cid) continue;
        counts.set(cid, (counts.get(cid) ?? 0) + 1);
      }
      let topId: string | null = null;
      let max = 0;
      counts.forEach((v, k) => {
        if (v > max) {
          max = v;
          topId = k;
        }
      });
      return topId ? (chapterNames.get(topId) ?? null) : null;
    };
    const lastUsedFor = (kind: string): string | null => {
      const rows = attemptsByKind(kind);
      if (rows.length === 0) return null;

      return (
        rows
          .map((r: any) => r.completed_at ?? r.created_at)
          .sort()
          .slice(-1)[0] ?? null
      );
    };

    const visMap = new Map<string, { hidden: boolean; label: string }>(
      ((moduleVis.data ?? []) as any[]).map((m) => [m.key, { hidden: m.hidden, label: m.label }]),
    );

    const buildModule = (key: ModuleStat["key"], fallbackLabel: string): ModuleStat => {
      const vis = visMap.get(key);
      if (key === "flash_cards") {
        const last =
          (flashEventsAll.data ?? [])
            .map((r: { created_at: string }) => r.created_at)
            .sort()
            .slice(-1)[0] ?? null;
        return {
          key,
          label: vis?.label ?? fallbackLabel,
          enabled: !(vis?.hidden ?? false),
          attempts_total: flashEventsAll.data?.length ?? 0,
          attempts_24h: flashEvents24h.data?.length ?? 0,
          active_users_24h: new Set(
            (flashEvents24h.data ?? [])
              .map((r: { user_id: string | null }) => r.user_id)
              .filter(Boolean),
          ).size,
          last_used_at: last,
          top_chapter: null,
        };
      }
      return {
        key,
        label: vis?.label ?? fallbackLabel,
        enabled: !(vis?.hidden ?? false),
        attempts_total: attemptsByKind(key).length,
        attempts_24h: attempts24hByKind(key).length,

        active_users_24h: new Set(
          attempts24hByKind(key)
            .map((a: any) => a.user_id)
            .filter(Boolean),
        ).size,
        last_used_at: lastUsedFor(key),
        top_chapter: topChapterFor(key),
      };
    };

    const modules: ModuleStat[] = [
      buildModule("mcq_practice", "MCQ Practice"),
      buildModule("quiz", "Quiz System"),
      buildModule("mock_test", "Custom Exam"),
      buildModule("flash_cards", "Flash Cards"),
    ];

    // Series
    const growth_series = bucketByDay(
      (profilesNew.data ?? []).map((r: { created_at: string }) => ({ ts: r.created_at })),
      30,
    );
    const login_series = bucketByDay(
      (loginsRecent.data ?? []).map((r: { login_at: string }) => ({ ts: r.login_at })),
      30,
    );

    // Module usage stacked, 7 days
    const usageMap = new Map<string, ModuleUsagePoint>();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      usageMap.set(key, { date: key, mcq_practice: 0, quiz: 0, mock_test: 0, flash_cards: 0 });
    }
    for (const row of (eventsLast7d.data ?? []) as { module: string; created_at: string }[]) {
      const key = new Date(row.created_at).toISOString().slice(0, 10);
      const bucket = usageMap.get(key);
      if (!bucket) continue;
      const m = row.module;
      if (m === "mcq_practice" || m === "quiz" || m === "mock_test" || m === "flash_cards") {
        bucket[m] += 1;
      }
    }
    const module_usage_series = Array.from(usageMap.values());

    // Recent activity — resolve display names
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recRows = (recentEvents.data ?? []) as any[];
    const userIds = Array.from(new Set(recRows.map((r) => r.user_id).filter(Boolean)));
    let nameMap = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id, display_name")
        .in("id", userIds);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
    }

    return {
      users: {
        total_students: profilesTotal.count ?? 0,
        total_admins: new Set(
          ((adminRoles.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
        ).size,
        active_now: Number(ao.active_now ?? 0),
        active_24h: Number(ua.active_24h ?? 0),
        active_7d: Number(ua.active_7d ?? 0),
        active_30d: Number(ua.active_30d ?? 0),
        lifetime_active: Number(ua.lifetime_active ?? 0),
        total_logins: Number(ua.total_logins ?? 0),
        avg_session_seconds: Number(ua.avg_session_seconds ?? 0),
      },
      traffic: {
        page_views_24h: Number(ao.total_page_views ?? 0),
        clicks_24h: Number(ao.total_clicks ?? 0),
        submits_24h: Number(ao.total_submits ?? 0),
        total_events_24h: Number(ao.total_events ?? 0),
        sessions_24h: Number(ao.unique_users_24h ?? 0),
        api_errors_24h: Number(ao.api_errors ?? 0),
      },
      modules,
      growth_series,
      login_series,
      module_usage_series,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      top_users: ((topUsersRpc.data ?? []) as any[]).map((u) => ({
        id: u.user_id,
        display_name: u.display_name,
        total_login_count: u.total_login_count,
        total_usage_seconds: Number(u.total_usage_seconds ?? 0),
        last_login_at: u.last_login_at,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      top_features: ((topModulesRpc.data ?? []) as any[]).map((m) => ({
        module: m.module,
        event_count: Number(m.event_count ?? 0),
        unique_users: Number(m.unique_users ?? 0),
      })),
      recent_activity: recRows.map((r) => ({
        id: r.id,
        event_type: r.event_type,
        element_label: r.element_label,
        page_path: r.page_path,
        module: r.module,
        user_id: r.user_id,
        user_name: r.user_id ? (nameMap.get(r.user_id) ?? null) : null,
        created_at: r.created_at,
      })),
    };
  });

/* ===================== Premium Overview (reference dashboard) ===================== */

export type PremiumKpi = {
  active_students: number;
  active_students_delta_pct: number;
  live_exams: number;
  live_exams_delta_pct: number;
  tests_completed: number;
  tests_completed_delta_pct: number;
  questions_in_bank: number;
  questions_in_bank_delta_pct: number;
  active_sessions: number;
  active_sessions_delta_pct: number;
  new_registrations: number;
  new_registrations_delta_pct: number;
};

export type DeviceBreakdown = { name: string; pct: number; count: number };
export type BrowserBreakdown = { name: string; pct: number; count: number };
export type SubjectPerf = { id: string; name: string; accuracy: number; attempts: number };
export type EngagementPoint = { date: string; dau: number };
export type SystemHealthItem = {
  key: string;
  label: string;
  status: "healthy" | "warning" | "down";
  detail: string;
};

export type AdminPremiumOverview = {
  kpi: PremiumKpi;
  platform_overview: { date: string; value: number }[]; // 30 days students activity
  platform_overview_total: number;
  platform_overview_delta_pct: number;
  devices: DeviceBreakdown[];
  browsers: BrowserBreakdown[];
  top_subjects: SubjectPerf[];
  exam_participation: { invited: number; joined: number; rate_pct: number };
  engagement: { dau_today: number; delta_pct: number; series: EngagementPoint[] };
  system: {
    uptime_pct: number;
    server_time_iso: string;
    health: SystemHealthItem[];
    api_errors_24h: number;
  };
};

function parseBrowser(ua: string | null): string {
  if (!ua) return "Other";
  // Order matters: Samsung Internet / Edge / Opera UAs all also contain
  // "Chrome/" because they are Chromium-based. Detect the specific brand
  // before falling through to a generic Chrome match.
  if (/SamsungBrowser\//i.test(ua)) return "Samsung Internet";
  if (/Edg(?:e|A|iOS)?\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua) || /Opera/i.test(ua) || /OPiOS\//i.test(ua) || /OPT\//i.test(ua))
    return "Opera";
  if (/Firefox\//i.test(ua) || /FxiOS\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) || /CriOS\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Other";
}

// Largest-remainder rounding so percentages always total exactly 100
// when there is at least one record. Each entry's `pct` is rounded to
// 1 decimal place; remaining 0.1% units are distributed to the items
// with the largest fractional remainders.
function distributePercents<T extends { count: number }>(
  items: T[],
  total: number,
): Array<T & { pct: number }> {
  if (total <= 0) return items.map((it) => ({ ...it, pct: 0 }));
  const scaled = items.map((it) => {
    const exact = (it.count / total) * 1000; // tenths of a percent
    const base = Math.floor(exact);
    return { it, base, rem: exact - base };
  });
  let assigned = scaled.reduce((s, x) => s + x.base, 0);
  let leftover = 1000 - assigned;
  const order = [...scaled].sort((a, b) => b.rem - a.rem || b.it.count - a.it.count);
  for (const entry of order) {
    if (leftover <= 0) break;
    entry.base += 1;
    leftover -= 1;
  }
  return scaled.map(({ it, base }) => ({ ...it, pct: Math.round(base) / 10 }));
}

function pctChange(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export type PremiumOverviewInput = {
  period_days?: 7 | 30 | 90;
  participation_scope?: "all" | "month";
};

export const adminPremiumOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d?: PremiumOverviewInput) => ({
    period_days: (d?.period_days === 7 || d?.period_days === 90 ? d.period_days : 30) as
      | 7
      | 30
      | 90,
    participation_scope: (d?.participation_scope === "month" ? "month" : "all") as "all" | "month",
  }))
  .handler(async ({ data, context }): Promise<AdminPremiumOverview> => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const sb = context.supabase;
    const now = new Date();
    const periodDays = data.period_days;
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const twoDayAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeekAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyDayAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const fourteenDayAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const periodStartIso = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000).toISOString();
    const prevPeriodStartIso = new Date(
      now.getTime() - periodDays * 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const monthStartIso = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const participationFromIso =
      data.participation_scope === "month" ? monthStartIso : new Date(0).toISOString();

    const [
      profilesTotal,
      activeStudents7d,
      activeStudentsPrev7d,
      liveExamsNow,
      liveExamsPrev,
      testsCompleted7d,
      testsCompletedPrev7d,
      questionsInBank,
      questionsInBankPrev,
      activeSessions24h,
      activeSessionsPrev24h,
      newRegs7d,
      newRegsPrev7d,
      platformEvents30d,
      platformEventsPrev30d,
      platformAttemptsCurr,
      platformAttemptsPrev,
      platformLoginsCurr,
      platformLoginsPrev,
      deviceRows,
      uaRows,
      attemptsForSubjects,
      subjectsRows,
      examParticipationRows,
      dau14d,
      dauToday,
      dauYesterday,
      errors24h,
      latestEvent,
    ] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb
        .from("activity_events")
        .select("user_id")
        .gte("created_at", weekAgo)
        .not("user_id", "is", null),
      sb
        .from("activity_events")
        .select("user_id")
        .gte("created_at", twoWeekAgo)
        .lt("created_at", weekAgo)
        .not("user_id", "is", null),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress"),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress")
        .lt("created_at", dayAgo),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("completed_at", weekAgo),
      sb
        .from("exam_attempts")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("completed_at", twoWeekAgo)
        .lt("completed_at", weekAgo),
      sb.from("mcqs").select("id", { count: "exact", head: true }).eq("status", "published"),
      sb
        .from("mcqs")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .lt("created_at", weekAgo),
      sb
        .from("activity_events")
        .select("user_id")
        .gte("created_at", dayAgo)
        .not("user_id", "is", null),
      sb
        .from("activity_events")
        .select("user_id")
        .gte("created_at", twoDayAgo)
        .lt("created_at", dayAgo)
        .not("user_id", "is", null),
      sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", weekAgo),
      sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", twoWeekAgo)
        .lt("created_at", weekAgo),
      sb
        .from("activity_events")
        .select("created_at, user_id")
        .gte("created_at", periodStartIso)
        .not("user_id", "is", null)
        .limit(50000),
      sb
        .from("activity_events")
        .select("created_at, user_id")
        .gte("created_at", prevPeriodStartIso)
        .lt("created_at", periodStartIso)
        .not("user_id", "is", null)
        .limit(50000),
      sb
        .from("exam_attempts")
        .select("created_at, user_id")
        .gte("created_at", periodStartIso)
        .not("user_id", "is", null)
        .limit(50000),
      sb
        .from("exam_attempts")
        .select("created_at, user_id")
        .gte("created_at", prevPeriodStartIso)
        .lt("created_at", periodStartIso)
        .not("user_id", "is", null)
        .limit(50000),
      sb
        .from("user_login_events")
        .select("login_at, user_id")
        .gte("login_at", periodStartIso)
        .not("user_id", "is", null)
        .limit(50000),
      sb
        .from("user_login_events")
        .select("login_at, user_id")
        .gte("login_at", prevPeriodStartIso)
        .lt("login_at", periodStartIso)
        .not("user_id", "is", null)
        .limit(50000),
      sb
        .from("activity_events")
        .select("user_id, device, created_at")
        .gte("created_at", thirtyDayAgo)
        .not("user_id", "is", null)
        .not("device", "is", null)
        .order("created_at", { ascending: false })
        .limit(20000),
      sb
        .from("activity_events")
        .select("user_id, user_agent, created_at")
        .gte("created_at", thirtyDayAgo)
        .not("user_id", "is", null)
        .not("user_agent", "is", null)
        .order("created_at", { ascending: false })
        .limit(20000),
      sb
        .from("exam_attempts")
        .select("subject_id, correct_count, total_count")
        .eq("status", "completed")
        .not("subject_id", "is", null)
        .limit(20000),
      sb.from("subjects").select("id, name, level"),
      sb
        .from("exam_attempts")
        .select("user_id, kind")
        .in("kind", ["quiz", "mock", "custom_exam"])
        .not("user_id", "is", null)
        .gte("created_at", participationFromIso)
        .limit(50000),
      sb
        .from("activity_events")
        .select("created_at, user_id")
        .gte("created_at", fourteenDayAgo)
        .not("user_id", "is", null),
      sb
        .from("activity_events")
        .select("user_id")
        .gte("created_at", dayAgo)
        .not("user_id", "is", null),
      sb
        .from("activity_events")
        .select("user_id")
        .gte("created_at", twoDayAgo)
        .lt("created_at", dayAgo)
        .not("user_id", "is", null),
      sb
        .from("activity_events")
        .select("id", { count: "exact", head: true })
        .eq("event_type", "api_call")
        .gte("created_at", dayAgo),
      sb
        .from("activity_events")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    // mcq_practice_progress has owner-only RLS; admin client required for cross-user reads.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [practiceCurr, practicePrev, practiceForSubjects] = await Promise.all([
      supabaseAdmin
        .from("mcq_practice_progress")
        .select("user_id, answered_at")
        .gte("answered_at", periodStartIso)
        .not("user_id", "is", null)
        .limit(50000),
      supabaseAdmin
        .from("mcq_practice_progress")
        .select("user_id, answered_at")
        .gte("answered_at", prevPeriodStartIso)
        .lt("answered_at", periodStartIso)
        .not("user_id", "is", null)
        .limit(50000),
      supabaseAdmin
        .from("mcq_practice_progress")
        .select("subject_id, is_correct")
        .not("subject_id", "is", null)
        .limit(50000),
    ]);

    // ---- KPI calc ----
    const uniq = (rows: { user_id: string | null }[] | null) =>
      new Set((rows ?? []).map((r) => r.user_id).filter(Boolean)).size;

    const activeCurr = uniq((activeStudents7d.data ?? []) as { user_id: string | null }[]);
    const activePrev = uniq((activeStudentsPrev7d.data ?? []) as { user_id: string | null }[]);
    const sessCurr = uniq((activeSessions24h.data ?? []) as { user_id: string | null }[]);
    const sessPrev = uniq((activeSessionsPrev24h.data ?? []) as { user_id: string | null }[]);

    const kpi: PremiumKpi = {
      active_students: activeCurr,
      active_students_delta_pct: pctChange(activeCurr, activePrev),
      live_exams: liveExamsNow.count ?? 0,
      live_exams_delta_pct: pctChange(liveExamsNow.count ?? 0, liveExamsPrev.count ?? 0),
      tests_completed: testsCompleted7d.count ?? 0,
      tests_completed_delta_pct: pctChange(
        testsCompleted7d.count ?? 0,
        testsCompletedPrev7d.count ?? 0,
      ),
      questions_in_bank: questionsInBank.count ?? 0,
      questions_in_bank_delta_pct: pctChange(
        questionsInBank.count ?? 0,
        questionsInBankPrev.count ?? 0,
      ),
      active_sessions: sessCurr,
      active_sessions_delta_pct: pctChange(sessCurr, sessPrev),
      new_registrations: newRegs7d.count ?? 0,
      new_registrations_delta_pct: pctChange(newRegs7d.count ?? 0, newRegsPrev7d.count ?? 0),
    };

    // ---- Platform overview (unique active students per day + period total) ----
    // Union all real student activity signals so the chart and total reflect any
    // tracked interaction (page/event, exam attempt, MCQ practice answer, login).
    type StampedUser = { ts: string; user_id: string | null };
    const periodActivity: StampedUser[] = [
      ...((platformEvents30d.data ?? []) as { created_at: string; user_id: string | null }[]).map(
        (r) => ({ ts: r.created_at, user_id: r.user_id }),
      ),
      ...((platformAttemptsCurr.data ?? []) as { created_at: string; user_id: string | null }[]).map(
        (r) => ({ ts: r.created_at, user_id: r.user_id }),
      ),
      ...((platformLoginsCurr.data ?? []) as { login_at: string; user_id: string | null }[]).map(
        (r) => ({ ts: r.login_at, user_id: r.user_id }),
      ),
      ...((practiceCurr.data ?? []) as { answered_at: string; user_id: string | null }[]).map(
        (r) => ({ ts: r.answered_at, user_id: r.user_id }),
      ),
    ];
    const prevPeriodActivity: StampedUser[] = [
      ...((platformEventsPrev30d.data ?? []) as { created_at: string; user_id: string | null }[]).map(
        (r) => ({ ts: r.created_at, user_id: r.user_id }),
      ),
      ...((platformAttemptsPrev.data ?? []) as { created_at: string; user_id: string | null }[]).map(
        (r) => ({ ts: r.created_at, user_id: r.user_id }),
      ),
      ...((platformLoginsPrev.data ?? []) as { login_at: string; user_id: string | null }[]).map(
        (r) => ({ ts: r.login_at, user_id: r.user_id }),
      ),
      ...((practicePrev.data ?? []) as { answered_at: string; user_id: string | null }[]).map(
        (r) => ({ ts: r.answered_at, user_id: r.user_id }),
      ),
    ];

    const dailyUsers = new Map<string, Set<string>>();
    const periodUserSet = new Set<string>();
    for (const r of periodActivity) {
      if (!r.user_id) continue;
      const key = new Date(r.ts).toISOString().slice(0, 10);
      if (!dailyUsers.has(key)) dailyUsers.set(key, new Set());
      dailyUsers.get(key)!.add(r.user_id);
      periodUserSet.add(r.user_id);
    }
    const platform_overview: { date: string; value: number }[] = [];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      platform_overview.push({ date: key, value: dailyUsers.get(key)?.size ?? 0 });
    }
    // Total = unique students active in the period (not sum of daily DAU).
    const platform_overview_total = periodUserSet.size;
    const prevUserSet = new Set<string>();
    for (const r of prevPeriodActivity) {
      if (r.user_id) prevUserSet.add(r.user_id);
    }
    const platform_overview_delta_pct = pctChange(platform_overview_total, prevUserSet.size);

    // ---- Devices (per-user latest device, percentage of unique users) ----
    const userDevice = new Map<string, string>();
    for (const r of (deviceRows.data ?? []) as {
      user_id: string | null;
      device: string | null;
    }[]) {
      if (!r.user_id || userDevice.has(r.user_id)) continue;
      const k = (r.device ?? "").toLowerCase();
      const norm =
        k === "mobile" ? "Mobile" : k === "desktop" ? "Desktop" : k === "tablet" ? "Tablet" : "Other";
      userDevice.set(r.user_id, norm);
    }
    const devCounts = new Map<string, number>();
    for (const norm of userDevice.values()) {
      devCounts.set(norm, (devCounts.get(norm) ?? 0) + 1);
    }
    const devTotal = Array.from(devCounts.values()).reduce((s, v) => s + v, 0);
    const devicesRaw = (["Mobile", "Desktop", "Tablet", "Other"] as const)
      .map((name) => ({ name, count: devCounts.get(name) ?? 0 }))
      .filter((d) => d.count > 0);
    const devices: DeviceBreakdown[] = distributePercents(devicesRaw, devTotal);

    // ---- Browsers (per-user latest browser, percentage of unique users) ----
    const userBrowser = new Map<string, string>();
    for (const r of (uaRows.data ?? []) as {
      user_id: string | null;
      user_agent: string | null;
    }[]) {
      if (!r.user_id || userBrowser.has(r.user_id)) continue;
      userBrowser.set(r.user_id, parseBrowser(r.user_agent));
    }
    const brCounts = new Map<string, number>();
    for (const name of userBrowser.values()) {
      brCounts.set(name, (brCounts.get(name) ?? 0) + 1);
    }
    const brTotal = Array.from(brCounts.values()).reduce((s, v) => s + v, 0);
    const browserOrder = [
      "Chrome",
      "Edge",
      "Safari",
      "Firefox",
      "Opera",
      "Samsung Internet",
      "Other",
    ] as const;
    const browsersRaw = browserOrder
      .map((name) => ({ name, count: brCounts.get(name) ?? 0 }))
      .filter((b) => b.count > 0);
    const browsers: BrowserBreakdown[] = distributePercents(browsersRaw, brTotal).sort(
      (a, b) => b.count - a.count,
    );


    // ---- Top subjects (overall student accuracy across all attempt sources) ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subjs = (subjectsRows.data ?? []) as any[];
    const subjAgg = new Map<string, { correct: number; total: number; attempts: number }>();
    for (const a of (attemptsForSubjects.data ?? []) as {
      subject_id: string;
      correct_count: number | null;
      total_count: number | null;
    }[]) {
      const sid = a.subject_id;
      if (!sid) continue;
      const cur = subjAgg.get(sid) ?? { correct: 0, total: 0, attempts: 0 };
      cur.correct += Number(a.correct_count ?? 0);
      cur.total += Number(a.total_count ?? 0);
      cur.attempts += 1;
      subjAgg.set(sid, cur);
    }
    for (const a of (practiceForSubjects.data ?? []) as {
      subject_id: string | null;
      is_correct: boolean | null;
    }[]) {
      const sid = a.subject_id;
      if (!sid) continue;
      const cur = subjAgg.get(sid) ?? { correct: 0, total: 0, attempts: 0 };
      cur.total += 1;
      if (a.is_correct) cur.correct += 1;
      cur.attempts += 1;
      subjAgg.set(sid, cur);
    }
    const subjNameMap = new Map<string, string>(subjs.map((s) => [s.id, s.name]));
    const top_subjects: SubjectPerf[] = Array.from(subjAgg.entries())
      .map(([id, v]) => ({
        id,
        name: subjNameMap.get(id) ?? "Subject",
        accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
        attempts: v.attempts,
      }))
      .filter((s) => s.attempts > 0)
      .sort((a, b) => b.accuracy - a.accuracy || b.attempts - a.attempts)
      .slice(0, 5);

    // ---- Exam participation (unique students who attempted any real exam) ----
    const examUserSet = new Set<string>();
    for (const r of (examParticipationRows.data ?? []) as {
      user_id: string | null;
      kind: string;
    }[]) {
      if (r.user_id) examUserSet.add(r.user_id);
    }
    const invited = profilesTotal.count ?? 0;
    const joined = examUserSet.size;
    const rate_pct = invited > 0 ? Math.round((joined / invited) * 100) : 0;

    // ---- Engagement (DAU last 14 days) ----
    const dauMap = new Map<string, Set<string>>();
    for (const r of (dau14d.data ?? []) as { created_at: string; user_id: string | null }[]) {
      if (!r.user_id) continue;
      const k = new Date(r.created_at).toISOString().slice(0, 10);
      if (!dauMap.has(k)) dauMap.set(k, new Set());
      dauMap.get(k)!.add(r.user_id);
    }
    const series: EngagementPoint[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      series.push({ date: key, dau: dauMap.get(key)?.size ?? 0 });
    }
    const dauTodayN = uniq((dauToday.data ?? []) as { user_id: string | null }[]);
    const dauYestN = uniq((dauYesterday.data ?? []) as { user_id: string | null }[]);

    // ---- System health ----
    const errors = errors24h.count ?? 0;
    const totalEvents24h = (activeSessions24h.data ?? []).length || 1;
    const uptime_pct = Math.max(
      0,
      Math.min(100, 100 - (errors / Math.max(totalEvents24h, 1)) * 100),
    );
    const lastEventIso = (latestEvent.data?.[0]?.created_at as string | undefined) ?? null;
    const dbStale = lastEventIso ? Date.now() - +new Date(lastEventIso) > 10 * 60 * 1000 : true;

    const health: SystemHealthItem[] = [
      {
        key: "server",
        label: "Server Status",
        status: "healthy",
        detail: "All servers are running normally",
      },
      {
        key: "db",
        label: "Database",
        status: dbStale ? "warning" : "healthy",
        detail: dbStale ? "No recent events" : "Database performance is optimal",
      },
      {
        key: "storage",
        label: "Storage Usage",
        status: "healthy",
        detail: `${profilesTotal.count ?? 0} profiles tracked`,
      },
      {
        key: "api",
        label: "API Response Time",
        status: errors > 50 ? "warning" : "healthy",
        detail: errors > 0 ? `${errors} API errors in last 24h` : "No API errors detected",
      },
    ];

    return {
      kpi,
      platform_overview,
      platform_overview_total,
      platform_overview_delta_pct,
      devices,
      browsers,
      top_subjects,
      exam_participation: { invited, joined, rate_pct },
      engagement: { dau_today: dauTodayN, delta_pct: pctChange(dauTodayN, dauYestN), series },
      system: {
        uptime_pct: Math.round(uptime_pct * 100) / 100,
        server_time_iso: now.toISOString(),
        health,
        api_errors_24h: errors,
      },
    };
  });

/* ===================== Notifications badge ===================== */

export type AdminNotificationsBadge = {
  unread: number;
  scheduled: number;
  recent: { id: string; title: string; status: string; created_at: string }[];
};

export const adminNotificationsBadge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminNotificationsBadge> => {
    await assertPermission(context.supabase, context.userId, "view_analytics");
    const sb = context.supabase;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [sentRecent, scheduled, latest] = await Promise.all([
      sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .gte("sent_at", sevenDaysAgo),
      sb
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled"),
      sb
        .from("notifications")
        .select("id,title,status,created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
    return {
      unread: sentRecent.count ?? 0,
      scheduled: scheduled.count ?? 0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recent: ((latest.data ?? []) as any[]).map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        created_at: r.created_at,
      })),
    };
  });

// ============================================================
// Student Engagement series (Daily / Weekly / Monthly)
// Bucketed unique active users (DAU/WAU/MAU) computed from real
// activity_events rows (login, page_view, submit, crud, etc.) plus
// exam_attempts so MCQ practice / quiz / mock / custom exam counts even
// if the page_view tracker missed it. Returns a plain DTO consumed by
// StudentEngagementCard.
// ============================================================
export type EngagementRange = "daily" | "weekly" | "monthly";

function bucketStart(d: Date, range: EngagementRange): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  if (range === "daily") return x;
  if (range === "weekly") {
    // ISO-ish week starting Monday
    const dow = (x.getUTCDay() + 6) % 7; // 0 = Mon
    x.setUTCDate(x.getUTCDate() - dow);
    return x;
  }
  // monthly
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
}

function bucketKey(d: Date, range: EngagementRange): string {
  const b = bucketStart(d, range);
  if (range === "monthly") return `${b.getUTCFullYear()}-${String(b.getUTCMonth() + 1).padStart(2, "0")}`;
  return b.toISOString().slice(0, 10);
}

export const adminEngagementSeries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d?: { range?: EngagementRange }) => ({
    range: (d?.range === "daily" || d?.range === "monthly" ? d.range : "weekly") as EngagementRange,
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ range: EngagementRange; series: EngagementPoint[] }> => {
      await assertPermission(context.supabase, context.userId, "view_analytics");
      const sb = context.supabase;
      const range = data.range;
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      // Bucket count by range
      const bucketCount = range === "daily" ? 14 : range === "weekly" ? 7 : 12;
      // Window start = first bucket start
      const firstBucket = (() => {
        if (range === "daily") {
          const d = new Date(today);
          d.setUTCDate(d.getUTCDate() - (bucketCount - 1));
          return d;
        }
        if (range === "weekly") {
          const d = bucketStart(today, "weekly");
          d.setUTCDate(d.getUTCDate() - 7 * (bucketCount - 1));
          return d;
        }
        const d = bucketStart(today, "monthly");
        return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - (bucketCount - 1), 1));
      })();
      const sinceIso = firstBucket.toISOString();
      const [activity, attempts] = await Promise.all([
        sb
          .from("activity_events")
          .select("created_at, user_id")
          .gte("created_at", sinceIso)
          .not("user_id", "is", null)
          .limit(50000),
        sb
          .from("exam_attempts")
          .select("created_at, user_id")
          .gte("created_at", sinceIso)
          .not("user_id", "is", null)
          .limit(50000),
      ]);
      const buckets = new Map<string, Set<string>>();
      const push = (rows: Array<{ created_at: string; user_id: string | null }> | null) => {
        for (const r of rows ?? []) {
          if (!r.user_id) continue;
          const key = bucketKey(new Date(r.created_at), range);
          if (!buckets.has(key)) buckets.set(key, new Set());
          buckets.get(key)!.add(r.user_id);
        }
      };
      push(activity.data as Array<{ created_at: string; user_id: string | null }> | null);
      push(attempts.data as Array<{ created_at: string; user_id: string | null }> | null);

      const series: EngagementPoint[] = [];
      for (let i = 0; i < bucketCount; i++) {
        let key: string;
        if (range === "daily") {
          const d = new Date(firstBucket);
          d.setUTCDate(d.getUTCDate() + i);
          key = d.toISOString().slice(0, 10);
        } else if (range === "weekly") {
          const d = new Date(firstBucket);
          d.setUTCDate(d.getUTCDate() + 7 * i);
          key = d.toISOString().slice(0, 10);
        } else {
          const d = new Date(
            Date.UTC(firstBucket.getUTCFullYear(), firstBucket.getUTCMonth() + i, 1),
          );
          key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        }
        series.push({ date: key, dau: buckets.get(key)?.size ?? 0 });
      }
      return { range, series };
    },
  );