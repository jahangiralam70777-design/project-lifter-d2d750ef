// Admin Routine Manager — READ-ONLY monitoring of student Study Routines.
// Independent module: relies only on `study_routines`, `study_routine_tasks`,
// and `study_routine_settings`. It does not mutate any student data.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };
// Untyped-schema surfaces (RPCs and tables not present in the generated
// `Database` typings). Kept as narrowly-typed local shims so we don't leak
// `any` into the module's public API.
type UntypedRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>;
  from: (table: string) => {
    select: (cols: string) => {
      in: (col: string, vals: string[]) => Promise<{ data: Array<{ id: string; name: string | null }> | null }>;
    };
  };
};

// --------------------------------------------------------------- helpers
/**
 * Single source of truth for admin authorization: the `has_role` SECURITY
 * DEFINER RPC. It runs with the caller's session (RLS-safe) and returns a
 * boolean. Failures are surfaced explicitly — no silent fallback to a table
 * lookup that could mask a broken deployment.
 */
async function assertAdmin(sb: SupabaseClient<Database>, userId: string): Promise<void> {
  const rpc = sb as unknown as UntypedRpc;
  const [adminRes, superRes] = await Promise.all([
    rpc.rpc("has_role", { _user_id: userId, _role: "admin" }),
    rpc.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
  ]);
  if (adminRes.error && superRes.error) {
    throw new Error(
      `Authorization check failed: ${adminRes.error.message ?? superRes.error.message ?? "has_role RPC unavailable"}`,
    );
  }
  if (adminRes.data === true || superRes.data === true) return;
  throw new Error("Forbidden: admin role required");
}


async function loadUserDirectory(userIds: string[]): Promise<Record<string, { email: string | null; name: string | null }>> {
  const out: Record<string, { email: string | null; name: string | null }> = {};
  if (!userIds.length) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Fetch profiles first (best-effort) — may not exist in this environment.
  try {
    const { data } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id,email,display_name,full_name")
      .in("id", userIds);
    for (const p of data ?? []) {
      out[p.id] = {
        email: p.email ?? null,
        name: p.display_name ?? p.full_name ?? null,
      };
    }
  } catch { /* profiles table not available */ }
  // Fill missing with auth admin lookup.
  const missing = userIds.filter((id) => !out[id]?.email);
  for (const id of missing) {
    try {
      const { data } = await (supabaseAdmin as any).auth.admin.getUserById(id);
      const u = data?.user;
      out[id] = {
        email: u?.email ?? out[id]?.email ?? null,
        name:
          out[id]?.name ??
          (u?.user_metadata?.full_name as string | undefined) ??
          (u?.user_metadata?.name as string | undefined) ??
          null,
      };
    } catch { /* ignore */ }
  }
  return out;
}

// --------------------------------------------------------------- stats
export const adminRoutineStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const sb = ctx.supabase;
    await assertAdmin(sb, ctx.userId);

    const [routinesRes, tasksRes] = await Promise.all([
      sb.from("study_routines").select("id,user_id,type,level_code,subject_id,chapter_id,is_archived,created_at,updated_at"),
      sb
        .from("study_routine_tasks")
        .select(
          "id,user_id,status,completion,task_date,start_time,end_time,task_type,level_code,subject_id,chapter_id,created_at,updated_at",
        ),
    ]);
    const routines: any[] = routinesRes.data ?? [];
    const tasks: any[] = tasksRes.data ?? [];

    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const todayISO = startOfDay.toISOString().slice(0, 10);

    const minuteFor = (t: any) => {
      const [h1, m1] = String(t.start_time ?? "00:00").split(":").map(Number);
      const [h2, m2] = String(t.end_time ?? "00:00").split(":").map(Number);
      const mins = h2 * 60 + m2 - (h1 * 60 + m1);
      return mins > 0 ? mins : 0;
    };
    // completed → full duration; in_progress → duration * completion% (fallback 50%)
    const doneMinuteFor = (t: any) => {
      const dur = minuteFor(t);
      if (t.status === "completed") return dur;
      if (t.status === "in_progress") {
        const pct = typeof t.completion === "number" && t.completion > 0 ? t.completion : 50;
        return Math.round((dur * Math.min(100, Math.max(0, pct))) / 100);
      }
      return 0;
    };

    const studentIds = new Set<string>();
    // Active = student with real activity (task marked in_progress/completed) in window.
    // Bulk `updated_at` bumps from routine expansion do NOT count.
    const activeToday = new Set<string>();
    const activeWeek = new Set<string>();
    const activeMonth = new Set<string>();
    for (const r of routines) studentIds.add(r.user_id);
    for (const t of tasks) {
      studentIds.add(t.user_id);
      const hasProgress = t.status === "completed" || t.status === "in_progress";
      if (!hasProgress) continue;
      const updated = new Date(t.updated_at ?? t.created_at);
      if (updated >= startOfDay) activeToday.add(t.user_id);
      if (updated >= startOfWeek) activeWeek.add(t.user_id);
      if (updated >= startOfMonth) activeMonth.add(t.user_id);
    }

    const completed = tasks.filter((t) => t.status === "completed").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const pending = tasks.length - completed - inProgress;
    const completionRate = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
    const avgCompletion = tasks.length
      ? Math.round(tasks.reduce((s, t) => s + (t.completion ?? 0), 0) / tasks.length)
      : 0;

    const totalPlannedMinutes = tasks.reduce((s, t) => s + minuteFor(t), 0);
    const totalCompletedMinutes = tasks.reduce((s, t) => s + doneMinuteFor(t), 0);

    const todayTasks = tasks.filter((t) => t.task_date === todayISO);
    const todayPlannedTasks = todayTasks.length;
    const todayCompletedTasks = todayTasks.filter((t) => t.status === "completed").length;
    const todayInProgressTasks = todayTasks.filter((t) => t.status === "in_progress").length;
    const todayPlannedMinutes = todayTasks.reduce((s, t) => s + minuteFor(t), 0);
    const todayCompletedMinutes = todayTasks.reduce((s, t) => s + doneMinuteFor(t), 0);

    const distinctDays = new Set(tasks.map((t) => t.task_date)).size || 1;
    const avgDailyMinutes = Math.round(totalCompletedMinutes / distinctDays);
    const avgDailyTasks = Math.round((tasks.length / distinctDays) * 10) / 10;

    // Frequency maps
    const bump = (m: Map<string, number>, k?: string | null) => {
      if (!k) return;
      m.set(k, (m.get(k) ?? 0) + 1);
    };
    const subjCount = new Map<string, number>();
    const chapCount = new Map<string, number>();
    const typeCount = new Map<string, number>();
    for (const t of tasks) {
      bump(subjCount, t.subject_id);
      bump(chapCount, t.chapter_id);
    }
    for (const r of routines) bump(typeCount, r.type);

    const pickTop = (m: Map<string, number>) => {
      let best: [string, number] | null = null;
      for (const [k, v] of m) if (!best || v > best[1]) best = [k, v];
      return best;
    };
    const topSubj = pickTop(subjCount);
    const topChap = pickTop(chapCount);
    const topType = pickTop(typeCount);

    // Resolve subject/chapter names
    const subjIds = topSubj ? [topSubj[0]] : [];
    const chapIds = topChap ? [topChap[0]] : [];
    const [subjRes, chapRes] = await Promise.all([
      subjIds.length
        ? (sb as unknown as UntypedRpc).from("subjects").select("id,name").in("id", subjIds)
        : Promise.resolve({ data: [] as any[] }),
      chapIds.length
        ? (sb as unknown as UntypedRpc).from("chapters").select("id,name").in("id", chapIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const subjName = (subjRes.data ?? [])[0]?.name ?? null;
    const chapName = (chapRes.data ?? [])[0]?.name ?? null;

    // Most / least active students (by completed tasks)
    const perUser = new Map<string, { completed: number; total: number }>();
    for (const t of tasks) {
      const v = perUser.get(t.user_id) ?? { completed: 0, total: 0 };
      v.total += 1;
      if (t.status === "completed") v.completed += 1;
      perUser.set(t.user_id, v);
    }
    const ranked = [...perUser.entries()].sort((a, b) => b[1].completed - a[1].completed);
    const topUserIds = ranked.slice(0, 5).map(([u]) => u);
    const bottomUserIds = ranked.slice(-5).map(([u]) => u);
    const dir = await loadUserDirectory([...new Set([...topUserIds, ...bottomUserIds])]);
    const nameOf = (uid: string) =>
      dir[uid]?.name ?? dir[uid]?.email ?? uid.slice(0, 8);
    const mostActiveStudents = ranked.slice(0, 5).map(([uid, v]) => ({
      userId: uid,
      name: nameOf(uid),
      completed: v.completed,
      total: v.total,
    }));
    const leastActiveStudents = ranked
      .slice()
      .reverse()
      .slice(0, 5)
      .map(([uid, v]) => ({
        userId: uid,
        name: nameOf(uid),
        completed: v.completed,
        total: v.total,
      }));

    return {
      totalStudents: studentIds.size,
      activeToday: activeToday.size,
      activeWeek: activeWeek.size,
      activeMonth: activeMonth.size,
      totalRoutines: routines.length,
      totalTasks: tasks.length,
      completedTasks: completed,
      inProgressTasks: inProgress,
      pendingTasks: pending,
      completionRate,
      avgCompletion,
      avgDailyMinutes,
      avgDailyTasks,
      totalPlannedMinutes,
      totalCompletedMinutes,
      todayPlannedTasks,
      todayCompletedTasks,
      todayInProgressTasks,
      todayPlannedMinutes,
      todayCompletedMinutes,
      mostUsedSubject: topSubj
        ? { id: topSubj[0], name: subjName ?? topSubj[0].slice(0, 6), count: topSubj[1] }
        : null,
      mostUsedChapter: topChap
        ? { id: topChap[0], name: chapName ?? topChap[0].slice(0, 6), count: topChap[1] }
        : null,
      mostUsedRoutineType: topType ? { type: topType[0], count: topType[1] } : null,
      mostActiveStudents,
      leastActiveStudents,
    };
  });


// --------------------------------------------------------------- students table
const listInput = z
  .object({
    search: z.string().trim().max(120).optional(),
    levelCode: z.string().trim().max(40).optional(),
    subjectId: z.string().uuid().optional(),
    chapterId: z.string().uuid().optional(),
    routineType: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
    status: z.enum(["all", "active", "inactive"]).default("all"),
    sortBy: z.enum(["last_active", "completion", "tasks", "created"]).default("last_active"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(5).max(100).default(20),
  })
  .partial()
  .transform((v) => ({
    search: v.search ?? "",
    levelCode: v.levelCode ?? "",
    subjectId: v.subjectId ?? "",
    chapterId: v.chapterId ?? "",
    routineType: v.routineType ?? "",
    status: v.status ?? "all",
    sortBy: v.sortBy ?? "last_active",
    sortDir: v.sortDir ?? "desc",
    page: v.page ?? 1,
    pageSize: v.pageSize ?? 20,
  }));

export const adminRoutineStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) => listInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const sb = ctx.supabase as any;
    await assertAdmin(sb, ctx.userId);

    // Fast path: call the SQL RPC which performs aggregation, filtering,
    // sorting and pagination server-side. This scales to hundreds of
    // thousands of rows since only ONE page ever crosses the wire.
    const { data: rpcRows, error: rpcErr } = await sb.rpc(
      "admin_routine_students",
      {
        p_search: data.search || "",
        p_level_code: data.levelCode || "",
        p_subject_id: data.subjectId || null,
        p_chapter_id: data.chapterId || null,
        p_routine_type: data.routineType || null,
        p_status: data.status,
        p_sort_by: data.sortBy,
        p_sort_dir: data.sortDir,
        p_page: data.page,
        p_page_size: data.pageSize,
      },
    );

    if (rpcErr) {
      // Bubble up so the UI can retry; do not silently fall back to a
      // full-table in-memory scan (that is the failure mode this change fixes).
      throw new Error(rpcErr.message || "Failed to load admin routine students");
    }

    const rows = (rpcRows ?? []) as Array<any>;
    const total = Number(rows[0]?.total_count ?? 0);

    // Fetch identity for the paginated user_ids only (small, bounded set).
    const pageUserIds = rows.map((r) => r.user_id as string);
    const missingIdentityIds = rows
      .filter((r) => !r.email && !r.name)
      .map((r) => r.user_id as string);
    const identityFallback = missingIdentityIds.length
      ? await loadUserDirectory(missingIdentityIds)
      : {};

    return {
      rows: rows.map((r) => {
        const fallback = identityFallback[r.user_id] ?? { email: null, name: null };
        const email = r.email ?? fallback.email ?? null;
        const name = r.name ?? fallback.name ?? email ?? String(r.user_id).slice(0, 8);
        return {
          userId: r.user_id as string,
          name,
          email,
          routineCount: Number(r.routine_count ?? 0),
          totalTasks: Number(r.total_tasks ?? 0),
          completed: Number(r.completed ?? 0),
          pending: Number(r.pending ?? 0),
          studyMinutes: Number(r.study_minutes ?? 0),
          lastActive: r.last_active ?? null,
          createdAt: r.created_at ?? null,
          levelCode: r.level_code ?? null,
          subjectId: r.subject_id ?? null,
          chapterId: r.chapter_id ?? null,
          routineType: r.routine_type ?? null,
          completion: Number(r.completion ?? 0),
        };
      }),
      total,
      page: data.page,
      pageSize: data.pageSize,
    };
  });


// --------------------------------------------------------------- detail
const detailInput = z.object({ userId: z.string().uuid() });

export const adminRoutineStudentDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) => detailInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const sb = ctx.supabase;
    await assertAdmin(sb, ctx.userId);
    const [routinesRes, tasksRes] = await Promise.all([
      sb
        .from("study_routines")
        .select(
          "id,name,type,level_code,subject_id,chapter_id,is_active,is_archived,created_at,updated_at",
        )
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false }),
      sb
        .from("study_routine_tasks")
        .select(
          "id,routine_id,level_code,subject_id,chapter_id,title,description,task_type,task_date,start_time,end_time,priority,status,completion,notes,created_at,updated_at",
        )
        .eq("user_id", data.userId)
        .order("task_date", { ascending: true })
        .order("start_time", { ascending: true }),
    ]);
    const dir = await loadUserDirectory([data.userId]);
    return {
      user: {
        id: data.userId,
        email: dir[data.userId]?.email ?? null,
        name: dir[data.userId]?.name ?? null,
      },
      routines: routinesRes.data ?? [],
      tasks: tasksRes.data ?? [],
    };
  });

// --------------------------------------------------------------- analytics
export const adminRoutineAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    const sb = ctx.supabase;
    await assertAdmin(sb, ctx.userId);
    const [tasksRes, routinesRes] = await Promise.all([
      sb
        .from("study_routine_tasks")
        .select(
          "user_id,status,completion,task_date,start_time,end_time,task_type,level_code,subject_id,chapter_id,updated_at,created_at",
        ),
      sb
        .from("study_routines")
        .select("id,user_id,type,level_code,created_at"),
    ]);
    const tasks: any[] = tasksRes.data ?? [];
    const routines: any[] = routinesRes.data ?? [];

    const daily: Record<string, { completed: number; total: number; plannedMinutes: number; completedMinutes: number; activeUsers: Set<string> }> = {};
    const weekly: Record<string, { completed: number; total: number; plannedMinutes: number; completedMinutes: number; activeUsers: Set<string> }> = {};
    const monthly: Record<string, { completed: number; total: number; plannedMinutes: number; completedMinutes: number; activeUsers: Set<string> }> = {};
    const perUser: Record<string, { completed: number; total: number; minutes: number }> = {};

    const subjectDist = new Map<string, number>();
    const chapterDist = new Map<string, number>();
    const levelDist = new Map<string, number>();
    const typeDist = new Map<string, number>();
    const routineTypeDist = new Map<string, number>();
    // Heatmap 7 dow × 24 hour
    const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

    const minutesFor = (t: any) => {
      const [h1, m1] = String(t.start_time ?? "00:00").split(":").map(Number);
      const [h2, m2] = String(t.end_time ?? "00:00").split(":").map(Number);
      const mins = h2 * 60 + m2 - (h1 * 60 + m1);
      return mins > 0 ? mins : 0;
    };
    // completed → full duration; in_progress → duration * completion% (fallback 50%)
    const doneMinutesFor = (t: any) => {
      const dur = minutesFor(t);
      if (t.status === "completed") return dur;
      if (t.status === "in_progress") {
        const pct = typeof t.completion === "number" && t.completion > 0 ? t.completion : 50;
        return Math.round((dur * Math.min(100, Math.max(0, pct))) / 100);
      }
      return 0;
    };
    const emptyBucket = () => ({ completed: 0, total: 0, plannedMinutes: 0, completedMinutes: 0, activeUsers: new Set<string>() });

    for (const t of tasks) {
      const d = t.task_date as string;
      const dt = new Date(d);
      const first = new Date(dt); first.setDate(dt.getDate() - dt.getDay());
      const wk = first.toISOString().slice(0, 10);
      const mo = d.slice(0, 7);
      const planned = minutesFor(t);
      const done = doneMinutesFor(t);
      const isDone = t.status === "completed";
      const hasProgress = isDone || t.status === "in_progress";

      daily[d] = daily[d] ?? emptyBucket();
      daily[d].total += 1;
      daily[d].plannedMinutes += planned;
      daily[d].completedMinutes += done;
      if (isDone) daily[d].completed += 1;
      if (hasProgress) daily[d].activeUsers.add(t.user_id);

      weekly[wk] = weekly[wk] ?? emptyBucket();
      weekly[wk].total += 1;
      weekly[wk].plannedMinutes += planned;
      weekly[wk].completedMinutes += done;
      if (isDone) weekly[wk].completed += 1;
      if (hasProgress) weekly[wk].activeUsers.add(t.user_id);

      monthly[mo] = monthly[mo] ?? emptyBucket();
      monthly[mo].total += 1;
      monthly[mo].plannedMinutes += planned;
      monthly[mo].completedMinutes += done;
      if (isDone) monthly[mo].completed += 1;
      if (hasProgress) monthly[mo].activeUsers.add(t.user_id);

      perUser[t.user_id] = perUser[t.user_id] ?? { completed: 0, total: 0, minutes: 0 };
      perUser[t.user_id].total += 1;
      if (isDone) {
        perUser[t.user_id].completed += 1;
        perUser[t.user_id].minutes += planned;
      }

      if (t.subject_id) subjectDist.set(t.subject_id, (subjectDist.get(t.subject_id) ?? 0) + 1);
      if (t.chapter_id) chapterDist.set(t.chapter_id, (chapterDist.get(t.chapter_id) ?? 0) + 1);
      if (t.level_code) levelDist.set(t.level_code, (levelDist.get(t.level_code) ?? 0) + 1);
      if (t.task_type) typeDist.set(t.task_type, (typeDist.get(t.task_type) ?? 0) + 1);

      // Heatmap uses the completion timestamp for done tasks only.
      if (isDone) {
        const activityAt = new Date(t.updated_at ?? t.created_at ?? d);
        heat[activityAt.getDay()][activityAt.getHours()] += 1;
      }
    }
    for (const r of routines) {
      if (r.type) routineTypeDist.set(r.type, (routineTypeDist.get(r.type) ?? 0) + 1);
    }

    // Serialize buckets: convert Set → count, add hour metrics + completion %.
    const asSeries = (b: Record<string, ReturnType<typeof emptyBucket>>) =>
      Object.entries(b)
        .sort(([a], [c]) => (a < c ? -1 : 1))
        .map(([k, v]) => ({
          key: k,
          completed: v.completed,
          total: v.total,
          plannedMinutes: v.plannedMinutes,
          completedMinutes: v.completedMinutes,
          plannedHours: +(v.plannedMinutes / 60).toFixed(2),
          completedHours: +(v.completedMinutes / 60).toFixed(2),
          activeUsers: v.activeUsers.size,
          pct: v.total ? Math.round((v.completed / v.total) * 100) : 0,
        }));

    // Cumulative growth: students (first task/routine seen) and routines
    const firstSeen: Record<string, string> = {};
    for (const r of routines) {
      const d = String(r.created_at).slice(0, 10);
      if (!firstSeen[r.user_id] || d < firstSeen[r.user_id]) firstSeen[r.user_id] = d;
    }
    for (const t of tasks) {
      const d = String(t.created_at ?? t.task_date).slice(0, 10);
      if (!firstSeen[t.user_id] || d < firstSeen[t.user_id]) firstSeen[t.user_id] = d;
    }
    const studentGrowthMap: Record<string, number> = {};
    for (const d of Object.values(firstSeen)) studentGrowthMap[d] = (studentGrowthMap[d] ?? 0) + 1;
    const studentGrowth: { key: string; new: number; total: number }[] = [];
    let sRun = 0;
    for (const k of Object.keys(studentGrowthMap).sort()) {
      sRun += studentGrowthMap[k];
      studentGrowth.push({ key: k, new: studentGrowthMap[k], total: sRun });
    }
    const routineGrowthMap: Record<string, number> = {};
    for (const r of routines) {
      const d = String(r.created_at).slice(0, 10);
      routineGrowthMap[d] = (routineGrowthMap[d] ?? 0) + 1;
    }
    const routineGrowth: { key: string; new: number; total: number }[] = [];
    let rRun = 0;
    for (const k of Object.keys(routineGrowthMap).sort()) {
      rRun += routineGrowthMap[k];
      routineGrowth.push({ key: k, new: routineGrowthMap[k], total: rRun });
    }

    // Resolve names for distributions
    const subjIds = [...subjectDist.keys()];
    const chapIds = [...chapterDist.keys()];
    const [subjRes, chapRes] = await Promise.all([
      subjIds.length
        ? (sb as unknown as UntypedRpc).from("subjects").select("id,name").in("id", subjIds)
        : Promise.resolve({ data: [] as any[] }),
      chapIds.length
        ? (sb as unknown as UntypedRpc).from("chapters").select("id,name").in("id", chapIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const subjNameMap = Object.fromEntries((subjRes.data ?? []).map((s: any) => [s.id, s.name]));
    const chapNameMap = Object.fromEntries((chapRes.data ?? []).map((c: any) => [c.id, c.name]));

    const distToArr = (m: Map<string, number>, nameMap?: Record<string, string>) =>
      [...m.entries()]
        .map(([id, count]) => ({ id, name: nameMap?.[id] ?? id, count }))
        .sort((a, b) => b.count - a.count);

    const directory = await loadUserDirectory(Object.keys(perUser));
    const ranked = Object.entries(perUser)
      .map(([uid, v]) => ({
        userId: uid,
        name: directory[uid]?.name ?? directory[uid]?.email ?? uid.slice(0, 8),
        completed: v.completed,
        total: v.total,
        minutes: v.minutes,
        completion: v.total ? Math.round((v.completed / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.completed - a.completed);

    return {
      daily: asSeries(daily).slice(-30),
      weekly: asSeries(weekly).slice(-12),
      monthly: asSeries(monthly).slice(-12),
      studentGrowth: studentGrowth.slice(-30),
      routineGrowth: routineGrowth.slice(-30),
      subjectDistribution: distToArr(subjectDist, subjNameMap).slice(0, 10),
      chapterDistribution: distToArr(chapterDist, chapNameMap).slice(0, 10),
      levelDistribution: distToArr(levelDist).slice(0, 10),
      taskTypeDistribution: distToArr(typeDist).slice(0, 10),
      routineTypeDistribution: distToArr(routineTypeDist).slice(0, 10),
      heatmap: heat,
      top10: ranked.slice(0, 10),
      lowest10: ranked.slice().reverse().slice(0, 10),
      mostActive: ranked.slice(0, 5),
      leastActive: ranked.slice(-5).reverse(),
      totalCompleted: tasks.filter((t: any) => t.status === "completed").length,
      totalPending: tasks.filter((t: any) => t.status !== "completed").length,
      totalPlannedMinutes: tasks.reduce((s, t) => s + minutesFor(t), 0),
      totalStudyMinutes: tasks.reduce((s, t) => s + doneMinutesFor(t), 0),
    };
  });


// --------------------------------------------------------------- module toggle
export const getStudyRoutineModuleEnabled = createServerFn({ method: "GET" }).handler(
  async () => {
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const url = process.env.SUPABASE_URL!;
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data } = await (sb as any)
      .from("study_routine_settings")
      .select("enabled")
      .eq("id", true)
      .maybeSingle();
    return { enabled: data?.enabled ?? true };
  },
);

export const setStudyRoutineModuleEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) => z.object({ enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    await assertAdmin(ctx.supabase, ctx.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("study_routine_settings")
      .upsert({ id: true, enabled: data.enabled, updated_at: new Date().toISOString(), updated_by: ctx.userId });
    if (error) throw error;
    return { ok: true, enabled: data.enabled };
  });
