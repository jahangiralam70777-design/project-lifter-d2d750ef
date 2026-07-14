// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { noInput } from "@/lib/validate";

export type DatabaseManagerStats = {
  users: {
    total: number;
    students: number;
    admins: number;
    active7d: number;
    new7d: number;
    new30d: number;
  };
  content: {
    mcqs: number;
    quizzes: number;
    mockTests: number;
    flashCards: number;
    shortNotes: number;
    questionBank: number;
    videos: number;
    examAttempts: number;
  };
  mcqBySubject: Array<{ name: string; count: number; color: string | null }>;
  mcqByChapter: Array<{ name: string; subject: string; count: number }>;
  storage: {
    dbSizeBytes: number;
    tables: Array<{ table: string; sizeBytes: number; rows: number }>;
    // logical capacity ceiling used for the progress bar (8 GB default — typical free tier).
    capacityBytes: number;
  };
  growthDaily: Array<{ date: string; users: number; mcqs: number; attempts: number }>;
  systemHealth: {
    status: "healthy" | "warning" | "critical";
    notes: string[];
  };
  mostActiveModule: { name: string; value: number };
  peakHour: { hour: number; attempts: number } | null;
  generatedAt: string;
};

const DEFAULT_CAPACITY = 8 * 1024 * 1024 * 1024; // 8 GB

type QueryResultLike = {
  error?: { message?: string | null } | null;
};

function throwIfAnyQueryFailed(results: Array<[string, QueryResultLike]>) {
  const failures = results
    .filter(([, result]) => result?.error)
    .map(([label, result]) => ({ label, message: result.error?.message ?? "Unknown error" }));

  if (failures.length === 0) return;

  console.error("[admin-db] stats query failures", failures);
  throw new Error(
    `Database manager cannot read the connected database: ${failures
      .map((failure) => `${failure.label}: ${failure.message}`)
      .join("; ")}. This usually means the connected Lovable Cloud project is missing migrations/RPCs, is pointed at the wrong environment, or the admin permission seed was not applied.`,
  );
}

export const adminGetDatabaseStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }): Promise<DatabaseManagerStats> => {
    await assertPermission(context.supabase, context.userId, "manage_system");
    const sb = context.supabase;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    console.log("[admin-db] stats request", { userId: context.userId });
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const sevenAgo = new Date(now.getTime() - 7 * day).toISOString();
    const thirtyAgo = new Date(now.getTime() - 30 * day).toISOString();

    const [
      profilesTotal,
      adminRoles,
      newProfiles7d,
      newProfiles30d,
      activeUsers7d,
      mcqsCount,
      quizCount,
      mockCount,
      flashCount,
      notesCount,
      qbCount,
      videosCount,
      attemptsCount,
      mcqsForSubj,
      subjects,
      chapters,
      tableSizesRes,
      dbSizeRes,
      attemptsRecent,
      mcqsRecent,
      profilesRecent,
    ] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]),
      sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", sevenAgo),
      sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", thirtyAgo),
      sb.from("exam_attempts").select("user_id").gte("created_at", sevenAgo).limit(20000),
      sb.from("mcqs").select("id", { count: "exact", head: true }),
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "quiz"),
      sb.from("quizzes").select("id", { count: "exact", head: true }).eq("kind", "mock"),
      sb.from("flash_cards").select("id", { count: "exact", head: true }),
      sb.from("short_notes").select("id", { count: "exact", head: true }),
      sb.from("question_bank_resources").select("id", { count: "exact", head: true }),
      sb.from("video_classes").select("id", { count: "exact", head: true }),
      sb.from("exam_attempts").select("id", { count: "exact", head: true }),
      sb.from("mcqs").select("chapter_id").limit(20000),
      sb.from("subjects").select("id,name,color"),
      sb.from("chapters").select("id,name,subject_id"),
      // These storage RPCs read database metadata. Call the backend-only variants
      // with the authenticated user's id so the admin check does not depend on
      // PostgREST preserving auth.uid() inside SECURITY DEFINER metadata reads.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin as any).rpc("admin_get_table_sizes_for_user", { _user_id: context.userId }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabaseAdmin as any).rpc("admin_get_db_size_for_user", { _user_id: context.userId }),
      sb.from("exam_attempts").select("created_at").gte("created_at", thirtyAgo).limit(20000),
      sb.from("mcqs").select("created_at").gte("created_at", thirtyAgo).limit(20000),
      sb.from("profiles").select("created_at").gte("created_at", thirtyAgo).limit(20000),
    ]);

    throwIfAnyQueryFailed([
      ["profiles.total", profilesTotal],
      ["user_roles.admins", adminRoles],
      ["profiles.new7d", newProfiles7d],
      ["profiles.new30d", newProfiles30d],
      ["exam_attempts.active7d", activeUsers7d],
      ["mcqs.count", mcqsCount],
      ["quizzes.quizCount", quizCount],
      ["quizzes.mockCount", mockCount],
      ["flash_cards.count", flashCount],
      ["short_notes.count", notesCount],
      ["question_bank_resources.count", qbCount],
      ["video_classes.count", videosCount],
      ["exam_attempts.count", attemptsCount],
      ["mcqs.chapterMap", mcqsForSubj],
      ["subjects.list", subjects],
      ["chapters.list", chapters],
      ["admin_get_table_sizes", tableSizesRes],
      ["admin_get_db_size", dbSizeRes],
      ["exam_attempts.recent", attemptsRecent],
      ["mcqs.recent", mcqsRecent],
      ["profiles.recent", profilesRecent],
    ]);

    const adminCount = new Set(
      ((adminRoles.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
    ).size;
    const totalUsers = profilesTotal.count ?? 0;
    const students = Math.max(0, totalUsers - adminCount);
    const active7d = new Set(
      ((activeUsers7d.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id),
    ).size;

    // MCQ by subject / chapter
    const subjMap = new Map<string, { name: string; color: string | null }>(
      ((subjects.data ?? []) as Array<{ id: string; name: string; color: string | null }>).map(
        (s) => [s.id, { name: s.name, color: s.color }],
      ),
    );
    const chapMap = new Map<string, { name: string; subject_id: string }>(
      ((chapters.data ?? []) as Array<{ id: string; name: string; subject_id: string }>).map(
        (c) => [c.id, { name: c.name, subject_id: c.subject_id }],
      ),
    );
    const mcqRows = (mcqsForSubj.data ?? []) as unknown as Array<{ chapter_id: string | null }>;
    const bySubj = new Map<string, number>();
    const byChap = new Map<string, number>();
    for (const m of mcqRows) {
      if (!m.chapter_id) continue;
      byChap.set(m.chapter_id, (byChap.get(m.chapter_id) ?? 0) + 1);
      const ch = chapMap.get(m.chapter_id);
      if (ch?.subject_id) bySubj.set(ch.subject_id, (bySubj.get(ch.subject_id) ?? 0) + 1);
    }
    const mcqBySubject = Array.from(bySubj.entries())
      .map(([sid, count]) => ({
        name: subjMap.get(sid)?.name ?? "Unknown",
        count,
        color: subjMap.get(sid)?.color ?? null,
      }))
      .sort((a, b) => b.count - a.count);
    const mcqByChapter = Array.from(byChap.entries())
      .map(([cid, count]) => {
        const ch = chapMap.get(cid);
        return {
          name: ch?.name ?? "Unknown",
          subject: ch ? (subjMap.get(ch.subject_id)?.name ?? "") : "",
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    // Storage
    const tableRows = (
      (tableSizesRes.data ?? []) as Array<{
        table_name: string;
        size_bytes: number;
        row_estimate: number;
      }>
    ).map((r) => ({
      table: r.table_name,
      sizeBytes: Number(r.size_bytes),
      rows: Number(r.row_estimate),
    }));
    const dbSizeBytes = Number(dbSizeRes.data ?? 0);

    // Daily growth (30 days)
    const days: Array<{
      date: string;
      start: number;
      end: number;
      users: number;
      mcqs: number;
      attempts: number;
    }> = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      days.push({
        date: d.toISOString().slice(0, 10),
        start: d.getTime(),
        end: next.getTime(),
        users: 0,
        mcqs: 0,
        attempts: 0,
      });
    }
    const bucket = (ts: string, key: "users" | "mcqs" | "attempts") => {
      const t = new Date(ts).getTime();
      for (const d of days) {
        if (t >= d.start && t < d.end) {
          d[key] += 1;
          return;
        }
      }
    };
    for (const r of (profilesRecent.data ?? []) as Array<{ created_at: string }>)
      bucket(r.created_at, "users");
    for (const r of (mcqsRecent.data ?? []) as Array<{ created_at: string }>)
      bucket(r.created_at, "mcqs");
    for (const r of (attemptsRecent.data ?? []) as Array<{ created_at: string }>)
      bucket(r.created_at, "attempts");
    const growthDaily = days.map(({ date, users, mcqs, attempts }) => ({
      date,
      users,
      mcqs,
      attempts,
    }));

    // Peak hour (from last-7d attempts data we already have)
    const hourCounts = new Array(24).fill(0) as number[];
    for (const r of (attemptsRecent.data ?? []) as Array<{ created_at: string }>) {
      const t = new Date(r.created_at);
      if (now.getTime() - t.getTime() < 7 * day) hourCounts[t.getHours()] += 1;
    }
    const peakHourIdx = hourCounts.reduce((best, v, i) => (v > hourCounts[best] ? i : best), 0);
    const peakHour =
      hourCounts[peakHourIdx] > 0 ? { hour: peakHourIdx, attempts: hourCounts[peakHourIdx] } : null;

    // Most active module
    const moduleVals: Array<[string, number]> = [
      ["MCQs", mcqsCount.count ?? 0],
      ["Quizzes", quizCount.count ?? 0],
      ["Mock Tests", mockCount.count ?? 0],
      ["Flash Cards", flashCount.count ?? 0],
      ["Short Notes", notesCount.count ?? 0],
      ["Videos", videosCount.count ?? 0],
      ["Question Bank", qbCount.count ?? 0],
      ["Exam Attempts", attemptsCount.count ?? 0],
    ];
    moduleVals.sort((a, b) => b[1] - a[1]);
    const mostActiveModule = { name: moduleVals[0][0], value: moduleVals[0][1] };

    // Health
    const usagePct = (dbSizeBytes / DEFAULT_CAPACITY) * 100;
    const notes: string[] = [];
    let status: "healthy" | "warning" | "critical" = "healthy";
    if (usagePct >= 90) {
      status = "critical";
      notes.push(`Database usage is ${usagePct.toFixed(1)}% of the 8 GB ceiling.`);
    } else if (usagePct >= 70) {
      status = "warning";
      notes.push(`Database usage is ${usagePct.toFixed(1)}% — consider archiving old data.`);
    } else {
      notes.push(`Database usage healthy at ${usagePct.toFixed(1)}%.`);
    }
    if (active7d === 0) notes.push("No active users in the last 7 days.");

    console.log("[admin-db] stats response", {
      totalUsers,
      adminCount,
      mcqs: mcqsCount.count ?? 0,
      examAttempts: attemptsCount.count ?? 0,
      tableCount: tableRows.length,
      dbSizeBytes,
    });

    return {
      users: {
        total: totalUsers,
        students,
        admins: adminCount,
        active7d,
        new7d: newProfiles7d.count ?? 0,
        new30d: newProfiles30d.count ?? 0,
      },
      content: {
        mcqs: mcqsCount.count ?? 0,
        quizzes: quizCount.count ?? 0,
        mockTests: mockCount.count ?? 0,
        flashCards: flashCount.count ?? 0,
        shortNotes: notesCount.count ?? 0,
        questionBank: qbCount.count ?? 0,
        videos: videosCount.count ?? 0,
        examAttempts: attemptsCount.count ?? 0,
      },
      mcqBySubject,
      mcqByChapter,
      storage: {
        dbSizeBytes,
        tables: tableRows,
        capacityBytes: DEFAULT_CAPACITY,
      },
      growthDaily,
      systemHealth: { status, notes },
      mostActiveModule,
      peakHour,
      generatedAt: new Date().toISOString(),
    };
  });