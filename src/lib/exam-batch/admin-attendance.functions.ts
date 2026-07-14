// @ts-nocheck
// Admin Attendance Enforcement controls for Exam Batch.
//
// Everything is scoped by (user_id, session_id, subject_id).
//
// Operations:
//   - View state / list bans (with filters + pagination)
//   - Manual ban / unban
//   - Reset counter / set counter / adjust counter
//   - Bulk ban / bulk unban / bulk reset
//   - Search + filter (session, subject, banType, minCount, near-limit)
//   - Export ban list (CSV-friendly payload)
//   - Dashboard summary (currently banned, recent bans/unbans, near limit)
//   - Reports (per session, per subject, totals, averages)
//   - Manual sweep of a single exam (missed attendance ledger)
//
// All mutations pass through assertPermission("manage_content"), are
// audited into `exam_batch_audit_log` AND into the immutable
// `exam_batch_attendance_events` trail, and are validated with Zod.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { audit } from "./audit";
import { errors, mapSupabaseError } from "./errors";
import { uuid } from "./types";
import {
  attendanceAdjustCounterSchema,
  attendanceBulkSchema,
  attendanceExportSchema,
  attendanceHistoryFilterSchema,
  attendanceListFilterSchema,
  attendanceManualBanSchema,
  attendanceProcessExamSchema,
  attendanceScope,
  attendanceSetCounterSchema,
  attendanceUnbanSchema,
  DEFAULT_ATTENDANCE_SETTINGS,
  type AttendanceBulkResult,
  type AttendanceDashboardSummary,
  type AttendanceEvent,
  type AttendanceEventKind,
  type AttendanceProcessResult,
  type AttendanceReports,
  type AttendanceReportRow,
  type AttendanceSettings,
  type AttendanceState,
  type AttendanceStateWithProfile,
} from "./attendance.types";

// ---------- Column list ----------

const STATE_COLUMNS =
  "user_id,session_id,subject_id,consecutive_missed_count,last_missed_exam_id,last_missed_at,last_attended_exam_id,last_attended_at,banned,banned_at,banned_reason,banned_by,banned_until,auto_banned,updated_at";

// ---------- Row mappers ----------

function mapState(row: any): AttendanceState {
  return {
    userId: row.user_id,
    sessionId: row.session_id,
    subjectId: row.subject_id,
    consecutiveMissedCount: Number(row.consecutive_missed_count ?? 0),
    lastMissedExamId: row.last_missed_exam_id ?? null,
    lastMissedAt: row.last_missed_at ?? null,
    lastAttendedExamId: row.last_attended_exam_id ?? null,
    lastAttendedAt: row.last_attended_at ?? null,
    banned: !!row.banned,
    bannedAt: row.banned_at ?? null,
    bannedReason: row.banned_reason ?? null,
    bannedBy: row.banned_by ?? null,
    bannedUntil: row.banned_until ?? null,
    autoBanned: !!row.auto_banned,
    updatedAt: row.updated_at ?? null,
  };
}

function emptyState(userId: string, sessionId: string, subjectId: string): AttendanceState {
  return {
    userId,
    sessionId,
    subjectId,
    consecutiveMissedCount: 0,
    lastMissedExamId: null,
    lastMissedAt: null,
    lastAttendedExamId: null,
    lastAttendedAt: null,
    banned: false,
    bannedAt: null,
    bannedReason: null,
    bannedBy: null,
    bannedUntil: null,
    autoBanned: false,
    updatedAt: null,
  };
}

// ---------- Settings ----------

async function readAttendanceSettings(
  supabase: any,
): Promise<Required<AttendanceSettings>> {
  const { data, error } = await supabase
    .from("exam_batch_settings")
    .select("value")
    .eq("id", "singleton")
    .maybeSingle();
  if (error && error.code !== "PGRST116")
    mapSupabaseError(error, "readAttendanceSettings");
  const value = (data as any)?.value ?? {};
  return {
    ...DEFAULT_ATTENDANCE_SETTINGS,
    ...(value.attendance ?? {}),
  } as Required<AttendanceSettings>;
}

// ---------- Scope helpers ----------

async function readState(
  supabase: any,
  userId: string,
  sessionId: string,
  subjectId: string,
): Promise<AttendanceState> {
  const { data, error } = await supabase
    .from("exam_batch_attendance_state")
    .select(STATE_COLUMNS)
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "readAttendanceState");
  return data ? mapState(data) : emptyState(userId, sessionId, subjectId);
}

async function upsertState(
  supabase: any,
  next: AttendanceState,
): Promise<AttendanceState> {
  const payload = {
    user_id: next.userId,
    session_id: next.sessionId,
    subject_id: next.subjectId,
    consecutive_missed_count: next.consecutiveMissedCount,
    last_missed_exam_id: next.lastMissedExamId,
    last_missed_at: next.lastMissedAt,
    last_attended_exam_id: next.lastAttendedExamId,
    last_attended_at: next.lastAttendedAt,
    banned: next.banned,
    banned_at: next.bannedAt,
    banned_reason: next.bannedReason,
    banned_by: next.bannedBy,
    banned_until: next.bannedUntil,
    auto_banned: next.autoBanned,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("exam_batch_attendance_state")
    .upsert(payload, { onConflict: "user_id,session_id,subject_id" })
    .select(STATE_COLUMNS)
    .single();
  if (error) mapSupabaseError(error, "upsertAttendanceState");
  return mapState(data);
}

async function insertEvent(
  supabase: any,
  userId: string,
  sessionId: string,
  subjectId: string,
  kind: AttendanceEventKind,
  opts: {
    examId?: string | null;
    previousCount?: number | null;
    newCount?: number | null;
    reason?: string | null;
    actorId?: string | null;
  } = {},
): Promise<void> {
  try {
    const { error } = await supabase.from("exam_batch_attendance_events").insert({
      user_id: userId,
      session_id: sessionId,
      subject_id: subjectId,
      kind,
      exam_id: opts.examId ?? null,
      previous_count: opts.previousCount ?? null,
      new_count: opts.newCount ?? null,
      reason: opts.reason ?? null,
      actor_id: opts.actorId ?? null,
    });
    if (error) {
      console.error("[exam-batch:attendance-event-fail]", {
        kind,
        userId,
        sessionId,
        subjectId,
        message: error.message,
      });
    }
  } catch (err) {
    console.error("[exam-batch:attendance-event-fail]", { kind, userId, err });
  }
}

// ---------- Enrichment helpers ----------

async function enrichStates(
  supabase: any,
  rows: AttendanceState[],
): Promise<AttendanceStateWithProfile[]> {
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.map((r) => r.userId)));
  const sessionIds = Array.from(new Set(rows.map((r) => r.sessionId)));
  const subjectIds = Array.from(new Set(rows.map((r) => r.subjectId)));

  const [profiles, sessions, subjects, enrollments, exams] = await Promise.all([
    userIds.length
      ? supabase
          .rpc("exam_batch_admin_user_contacts", { _ids: userIds })
          .then((r: any) => r.data ?? [], () => [])

      : Promise.resolve([]),

    sessionIds.length
      ? supabase
          .from("exam_batch_sessions")
          .select("id,title,level")
          .in("id", sessionIds)
          .then((r: any) => r.data ?? [], () => [])

      : Promise.resolve([]),
    subjectIds.length
      ? supabase
          .from("exam_batch_subjects")
          .select("id,name")
          .in("id", subjectIds)
          .then((r: any) => r.data ?? [], () => [])

      : Promise.resolve([]),
    userIds.length && sessionIds.length
      ? supabase
          .from("exam_batch_enrollments")
          .select("user_id,session_id,student_id,status")
          .in("user_id", userIds)
          .in("session_id", sessionIds)
          .then((r: any) => r.data ?? [], () => [])
      : Promise.resolve([]),
    sessionIds.length && subjectIds.length
      ? supabase
          .from("exam_batch_exams")
          .select("id,session_id,subject_id,window_end")
          .in("session_id", sessionIds)
          .in("subject_id", subjectIds)
          .eq("is_published", true)
          .eq("is_hidden", false)
          .eq("is_archived", false)
          .eq("status", "active")
          .lte("window_end", new Date().toISOString())
          .then((r: any) => r.data ?? [], () => [])
      : Promise.resolve([]),
  ]);

  const examIds = (exams as any[]).map((e) => e.id as string);
  const attempts =
    examIds.length && userIds.length
      ? await supabase
          .from("exam_batch_attempts")
          .select("exam_id,user_id")
          .in("exam_id", examIds)
          .in("user_id", userIds)
          .then((r: any) => r.data ?? [], () => [])
      : [];

  const profMap = new Map<string, { name: string | null; email: string | null }>();
  for (const p of profiles as any[])
    profMap.set(p.id, { name: p.display_name ?? null, email: p.email ?? null });
  const sessMap = new Map<string, { title: string | null; level: string | null }>();
  for (const s of sessions as any[])
    sessMap.set(s.id, { title: s.title ?? null, level: s.level ?? null });
  const subjMap = new Map<string, string | null>();
  for (const s of subjects as any[]) subjMap.set(s.id, s.name ?? null);
  const sidMap = new Map<string, number>();
  const statusMap = new Map<string, string | null>();
  for (const e of enrollments as any[]) {
    const key = `${e.user_id}::${e.session_id}`;
    if (e.student_id != null) sidMap.set(key, Number(e.student_id));
    statusMap.set(key, e.status ?? null);
  }
  const examMap = new Map<string, string[]>();
  for (const e of exams as any[]) {
    const key = `${e.session_id}::${e.subject_id}`;
    const list = examMap.get(key) ?? [];
    list.push(e.id);
    examMap.set(key, list);
  }
  const examById = new Map<string, { sessionId: string; subjectId: string }>();
  for (const e of exams as any[]) {
    examById.set(e.id, { sessionId: e.session_id, subjectId: e.subject_id });
  }
  const attendedMap = new Map<string, Set<string>>();
  for (const a of attempts as any[]) {
    const exam = examById.get(a.exam_id);
    if (!exam) continue;
    const key = `${a.user_id}::${exam.sessionId}::${exam.subjectId}`;
    const set = attendedMap.get(key) ?? new Set<string>();
    set.add(a.exam_id);
    attendedMap.set(key, set);
  }

  return rows.map((r) => {
    const session = sessMap.get(r.sessionId);
    const enrollmentKey = `${r.userId}::${r.sessionId}`;
    const scopeKey = `${r.sessionId}::${r.subjectId}`;
    const attendedKey = `${r.userId}::${r.sessionId}::${r.subjectId}`;
    const totalExams = examMap.get(scopeKey)?.length ?? 0;
    const attendedExams = attendedMap.get(attendedKey)?.size ?? 0;
    const missedExams = Math.max(0, totalExams - attendedExams);
    return {
      ...r,
      studentName: profMap.get(r.userId)?.name ?? null,
      studentEmail: profMap.get(r.userId)?.email ?? null,
      sessionTitle: session?.title ?? null,
      subjectName: subjMap.get(r.subjectId) ?? null,
      currentSession: session?.title ?? null,
      currentLevel: session?.level ?? null,
      studentId: sidMap.get(enrollmentKey) ?? null,
      approvedStatus: statusMap.get(enrollmentKey) ?? null,
      totalExams,
      attendedExams,
      missedExams,
      attendancePercentage:
        totalExams > 0 ? Math.round((attendedExams / totalExams) * 1000) / 10 : 100,
    };
  });
}

// ---------- Read ----------

export const adminGetExamBatchAttendanceState = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceScope.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceStateWithProfile> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.read",
    );
    const st = await readState(
      context.supabase,
      data.userId,
      data.sessionId,
      data.subjectId,
    );
    const [enriched] = await enrichStates(context.supabase, [st]);
    return enriched;
  });

export const adminListExamBatchAttendanceStates = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceListFilterSchema.parse(i ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      data,
      context,
    }): Promise<{ rows: AttendanceStateWithProfile[]; total: number }> => {
      await assertPermission(
        context.supabase,
        context.userId,
        "manage_content",
        "exam_batch.attendance.list",
      );
      const settings = await readAttendanceSettings(context.supabase);
      const limit = settings.consecutiveMissLimit;
      const supabase = context.supabase;

      // -------------------------------------------------------------------
      // Build the universe from APPROVED enrollments (× subject links), not
      // from exam_batch_attendance_state. Attendance-state rows only exist
      // after an exam is processed, so a fresh enrollment would otherwise
      // never appear in the admin table.
      // -------------------------------------------------------------------
      let enrQ = supabase
        .from("exam_batch_enrollments")
        .select(
          "id,user_id,session_id,status,removed,exam_batch_enrollment_subjects(subject_id)",
        )
        .eq("status", "approved")
        .eq("removed", false);
      if (data.sessionId) enrQ = enrQ.eq("session_id", data.sessionId);
      if (data.userId) enrQ = enrQ.eq("user_id", data.userId);
      const { data: enrRows, error: enrErr } = await enrQ;
      if (enrErr) mapSupabaseError(enrErr, "adminListExamBatchAttendanceStates:enrollments");

      // Expand to (user, session, subject) tuples.
      type Tuple = { userId: string; sessionId: string; subjectId: string };
      const tuples: Tuple[] = [];
      const seen = new Set<string>();
      for (const e of (enrRows ?? []) as any[]) {
        const links = (e.exam_batch_enrollment_subjects ?? []) as Array<{
          subject_id: string;
        }>;
        for (const l of links) {
          if (data.subjectId && l.subject_id !== data.subjectId) continue;
          const k = `${e.user_id}::${e.session_id}::${l.subject_id}`;
          if (seen.has(k)) continue;
          seen.add(k);
          tuples.push({
            userId: e.user_id,
            sessionId: e.session_id,
            subjectId: l.subject_id,
          });
        }
      }

      // Load ALL attendance-state rows for these tuples (or the whole scope
      // when no filters — capped by tuple set anyway). We fetch by
      // session/subject sets and then key-match, so a single roundtrip is
      // enough even for large sessions.
      const stateMap = new Map<string, AttendanceState>();
      if (tuples.length > 0) {
        const sessionIds = Array.from(new Set(tuples.map((t) => t.sessionId)));
        const subjectIds = Array.from(new Set(tuples.map((t) => t.subjectId)));
        const userIds = Array.from(new Set(tuples.map((t) => t.userId)));
        const { data: stRows, error: stErr } = await supabase
          .from("exam_batch_attendance_state")
          .select(STATE_COLUMNS)
          .in("session_id", sessionIds)
          .in("subject_id", subjectIds)
          .in("user_id", userIds);
        if (stErr) mapSupabaseError(stErr, "adminListExamBatchAttendanceStates:state");
        for (const s of (stRows ?? []).map(mapState)) {
          stateMap.set(`${s.userId}::${s.sessionId}::${s.subjectId}`, s);
        }
      }

      // Merge: enrolled tuple → real state or synthetic empty state.
      let states: AttendanceState[] = tuples.map((t) => {
        const k = `${t.userId}::${t.sessionId}::${t.subjectId}`;
        return (
          stateMap.get(k) ?? emptyState(t.userId, t.sessionId, t.subjectId)
        );
      });

      // Apply status/ban filters on the merged rows.
      if (data.onlyBanned) states = states.filter((s) => s.banned);
      if (data.banType === "auto")
        states = states.filter((s) => s.banned && s.autoBanned);
      if (data.banType === "manual")
        states = states.filter((s) => s.banned && !s.autoBanned);
      if (typeof data.minCount === "number") {
        const min = data.minCount;
        states = states.filter((s) => s.consecutiveMissedCount >= min);
      }
      if (data.onlyNearLimit && limit > 0) {
        const threshold = Math.max(0, limit - Math.max(0, settings.nearBanOffset));
        states = states.filter(
          (s) => !s.banned && s.consecutiveMissedCount >= threshold,
        );
      }

      // Sort: banned first, most-recent ban first, then highest miss count.
      states.sort((a, b) => {
        if (a.banned !== b.banned) return a.banned ? -1 : 1;
        const at = a.bannedAt ? Date.parse(a.bannedAt) : 0;
        const bt = b.bannedAt ? Date.parse(b.bannedAt) : 0;
        if (at !== bt) return bt - at;
        return b.consecutiveMissedCount - a.consecutiveMissedCount;
      });

      // Enrich (adds profile / session / subject / attendance stats).
      let enriched = await enrichStates(supabase, states);

      // Search is applied post-enrichment against student name / email / id.
      if (data.search) {
        const needle = data.search.toLowerCase();
        enriched = enriched.filter(
          (r) =>
            (r.studentName ?? "").toLowerCase().includes(needle) ||
            (r.studentEmail ?? "").toLowerCase().includes(needle) ||
            (r.sessionTitle ?? "").toLowerCase().includes(needle) ||
            (r.subjectName ?? "").toLowerCase().includes(needle) ||
            (r.studentId != null && String(r.studentId).includes(needle)),
        );
      }

      const total = enriched.length;
      const paged = enriched.slice(data.offset, data.offset + data.limit);
      return { rows: paged, total };
    },
  );

// Legacy alias kept for older callers.
export const adminListExamBatchAttendanceBans = createServerFn({ method: "POST" })
  .validator((i: unknown) =>
    attendanceListFilterSchema.partial().parse(i ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceStateWithProfile[]> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.list",
    );
    const filter = attendanceListFilterSchema.parse({
      ...data,
      onlyBanned: true,
      limit: data?.limit ?? 500,
    });
    let q = context.supabase
      .from("exam_batch_attendance_state")
      .select(STATE_COLUMNS)
      .eq("banned", true)
      .order("banned_at", { ascending: false, nullsFirst: false })
      .limit(filter.limit);
    if (filter.sessionId) q = q.eq("session_id", filter.sessionId);
    if (filter.subjectId) q = q.eq("subject_id", filter.subjectId);
    if (filter.userId) q = q.eq("user_id", filter.userId);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "adminListExamBatchAttendanceBans");
    return enrichStates(context.supabase, (rows ?? []).map(mapState));
  });

// ---------- History ----------

export const adminGetExamBatchAttendanceHistory = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceHistoryFilterSchema.parse(i ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceEvent[]> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.history",
    );
    let q = context.supabase
      .from("exam_batch_attendance_events")
      .select(
        "id,user_id,session_id,subject_id,kind,exam_id,previous_count,new_count,reason,actor_id,created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.userId) q = q.eq("user_id", data.userId);
    if (data.sessionId) q = q.eq("session_id", data.sessionId);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.kind) q = q.eq("kind", data.kind);
    if (data.cursor) q = q.lt("created_at", data.cursor);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "adminGetExamBatchAttendanceHistory");
    return (rows ?? []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      sessionId: r.session_id ?? null,
      subjectId: r.subject_id ?? null,
      kind: r.kind,
      examId: r.exam_id ?? null,
      previousCount: r.previous_count ?? null,
      newCount: r.new_count ?? null,
      reason: r.reason ?? null,
      actorId: r.actor_id ?? null,
      createdAt: r.created_at,
    }));
  });

// ---------- Ban history ledger ----------

async function insertBanHistory(
  supabase: any,
  actorId: string,
  scope: { userId: string; sessionId: string; subjectId: string },
  action: "ban" | "unban",
  reason: string | null,
): Promise<void> {
  // Mirrors the SQL RPC path (exam_batch_attendance_manual_ban/unban) so the
  // TypeScript manual flow produces the same historical record. ban_type is
  // always 'manual' here — the auto engine writes 'auto' rows itself.
  const { error } = await supabase.from("exam_batch_ban_history").insert({
    user_id: scope.userId,
    session_id: scope.sessionId,
    subject_id: scope.subjectId,
    ban_type: "manual",
    action,
    reason: reason ?? null,
    actor_id: actorId,
  });
  if (error) mapSupabaseError(error, "insertBanHistory");
}

// ---------- Manual ban ----------

async function performManualBan(
  supabase: any,
  actorId: string,
  scope: {
    userId: string;
    sessionId: string;
    subjectId: string;
    reason: string;
    durationDays?: number | null;
    bannedUntil?: string | null;
  },
): Promise<AttendanceState> {
  const current = await readState(
    supabase,
    scope.userId,
    scope.sessionId,
    scope.subjectId,
  );
  if (current.banned)
    throw errors.conflict("Student is already banned for this session + subject.");
  const now = new Date();
  // bannedUntil wins over durationDays; both null = permanent.
  let until: string | null = null;
  if (scope.bannedUntil) {
    until = scope.bannedUntil;
  } else if (scope.durationDays && scope.durationDays > 0) {
    until = new Date(now.getTime() + scope.durationDays * 86_400_000).toISOString();
  }
  const next: AttendanceState = {
    ...current,
    banned: true,
    bannedAt: now.toISOString(),
    bannedReason: scope.reason,
    bannedBy: actorId,
    bannedUntil: until,
    autoBanned: false,
  };
  const saved = await upsertState(supabase, next);
  await insertEvent(supabase, scope.userId, scope.sessionId, scope.subjectId, "manual_ban", {
    previousCount: current.consecutiveMissedCount,
    newCount: current.consecutiveMissedCount,
    reason: scope.reason,
    actorId,
  });
  await audit(supabase, actorId, "attendance.manual_ban", "attendance", scope.userId, {
    sessionId: scope.sessionId,
    subjectId: scope.subjectId,
    reason: scope.reason,
    bannedUntil: until,
  });
  await insertBanHistory(supabase, actorId, scope, "ban", scope.reason);
  return saved;
}

export const adminManualBanExamBatchAttendance = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceManualBanSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceState> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.ban",
    );
    return performManualBan(context.supabase, context.userId, data);
  });

// ---------- Manual unban ----------

async function performUnban(
  supabase: any,
  actorId: string,
  scope: {
    userId: string;
    sessionId: string;
    subjectId: string;
    reason?: string | null;
    resetCounter: boolean;
  },
): Promise<AttendanceState> {
  const current = await readState(
    supabase,
    scope.userId,
    scope.sessionId,
    scope.subjectId,
  );
  if (!current.banned) throw errors.conflict("Student is not currently banned.");
  const next: AttendanceState = {
    ...current,
    banned: false,
    bannedAt: null,
    bannedReason: null,
    bannedBy: null,
    bannedUntil: null,
    autoBanned: false,
    consecutiveMissedCount: scope.resetCounter ? 0 : current.consecutiveMissedCount,
  };
  const saved = await upsertState(supabase, next);
  await insertEvent(
    supabase,
    scope.userId,
    scope.sessionId,
    scope.subjectId,
    "manual_unban",
    {
      previousCount: current.consecutiveMissedCount,
      newCount: next.consecutiveMissedCount,
      reason: scope.reason ?? null,
      actorId,
    },
  );
  await audit(supabase, actorId, "attendance.manual_unban", "attendance", scope.userId, {
    sessionId: scope.sessionId,
    subjectId: scope.subjectId,
    reason: scope.reason ?? null,
    resetCounter: scope.resetCounter,
  });
  await insertBanHistory(supabase, actorId, scope, "unban", scope.reason ?? null);
  return saved;
}

export const adminUnbanExamBatchAttendance = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceUnbanSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceState> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.unban",
    );
    return performUnban(context.supabase, context.userId, data);
  });

// ---------- Counter: set absolute value ----------

export const adminSetExamBatchAttendanceCounter = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceSetCounterSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceState> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.counter_set",
    );
    const current = await readState(
      context.supabase,
      data.userId,
      data.sessionId,
      data.subjectId,
    );
    const next: AttendanceState = {
      ...current,
      consecutiveMissedCount: data.value,
    };
    const saved = await upsertState(context.supabase, next);
    const kind: AttendanceEventKind =
      data.value === 0 ? "counter.reset" : "counter.set";
    await insertEvent(
      context.supabase,
      data.userId,
      data.sessionId,
      data.subjectId,
      kind,
      {
        previousCount: current.consecutiveMissedCount,
        newCount: data.value,
        reason: data.reason ?? null,
        actorId: context.userId,
      },
    );
    await audit(
      context.supabase,
      context.userId,
      kind === "counter.reset"
        ? "attendance.counter_reset"
        : "attendance.counter_set",
      "attendance",
      data.userId,
      {
        sessionId: data.sessionId,
        subjectId: data.subjectId,
        previous: current.consecutiveMissedCount,
        next: data.value,
        reason: data.reason ?? null,
      },
    );
    return saved;
  });

// ---------- Counter: adjust delta ----------

export const adminAdjustExamBatchAttendanceCounter = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceAdjustCounterSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceState> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.counter_adjust",
    );
    const current = await readState(
      context.supabase,
      data.userId,
      data.sessionId,
      data.subjectId,
    );
    const raw = current.consecutiveMissedCount + data.delta;
    const clamped = Math.max(0, Math.min(1_000, raw));
    const next: AttendanceState = { ...current, consecutiveMissedCount: clamped };
    const saved = await upsertState(context.supabase, next);
    const kind: AttendanceEventKind =
      data.delta > 0 ? "counter.increment" : "counter.decrement";
    await insertEvent(
      context.supabase,
      data.userId,
      data.sessionId,
      data.subjectId,
      kind,
      {
        previousCount: current.consecutiveMissedCount,
        newCount: clamped,
        reason: data.reason ?? null,
        actorId: context.userId,
      },
    );
    await audit(
      context.supabase,
      context.userId,
      data.delta > 0
        ? "attendance.counter_increment"
        : "attendance.counter_decrement",
      "attendance",
      data.userId,
      {
        sessionId: data.sessionId,
        subjectId: data.subjectId,
        previous: current.consecutiveMissedCount,
        next: clamped,
        delta: data.delta,
      },
    );
    return saved;
  });

// ---------- Bulk ops ----------

async function runBulk<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
): Promise<AttendanceBulkResult> {
  const result: AttendanceBulkResult = {
    requested: items.length,
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  // Sequential to keep audit trail readable and avoid Postgres row locks.
  for (const item of items) {
    try {
      await fn(item);
      result.processed += 1;
    } catch (err: any) {
      const anyItem = item as any;
      const message = err?.message ?? "Unknown error";
      if (err?.code === "CONFLICT") {
        result.skipped += 1;
      } else {
        result.failed += 1;
      }
      result.errors.push({
        userId: anyItem.userId,
        sessionId: anyItem.sessionId,
        subjectId: anyItem.subjectId,
        message,
      });
    }
  }
  return result;
}

export const adminBulkBanExamBatchAttendance = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceBulkSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceBulkResult> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.bulk_ban",
    );
    const reason = (data.reason ?? "Bulk manual ban").trim() || "Bulk manual ban";
    const out = await runBulk(data.items, (item) =>
      performManualBan(context.supabase, context.userId, {
        userId: item.userId,
        sessionId: item.sessionId,
        subjectId: item.subjectId,
        reason,
      }).then(() => undefined),
    );
    await audit(
      context.supabase,
      context.userId,
      "attendance.manual_ban",
      "attendance",
      context.userId,
      { bulk: true, ...out },
    );
    return out;
  });

export const adminBulkUnbanExamBatchAttendance = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceBulkSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceBulkResult> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.bulk_unban",
    );
    const out = await runBulk(data.items, (item) =>
      performUnban(context.supabase, context.userId, {
        userId: item.userId,
        sessionId: item.sessionId,
        subjectId: item.subjectId,
        reason: data.reason ?? null,
        resetCounter: data.resetCounter,
      }).then(() => undefined),
    );
    await audit(
      context.supabase,
      context.userId,
      "attendance.manual_unban",
      "attendance",
      context.userId,
      { bulk: true, ...out },
    );
    return out;
  });

export const adminBulkResetExamBatchAttendance = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceBulkSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceBulkResult> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.bulk_reset",
    );
    const out = await runBulk(data.items, async (item) => {
      const current = await readState(
        context.supabase,
        item.userId,
        item.sessionId,
        item.subjectId,
      );
      if (current.consecutiveMissedCount === 0) return;
      const next: AttendanceState = { ...current, consecutiveMissedCount: 0 };
      await upsertState(context.supabase, next);
      await insertEvent(
        context.supabase,
        item.userId,
        item.sessionId,
        item.subjectId,
        "counter.reset",
        {
          previousCount: current.consecutiveMissedCount,
          newCount: 0,
          reason: data.reason ?? "Bulk reset",
          actorId: context.userId,
        },
      );
    });
    await audit(
      context.supabase,
      context.userId,
      "attendance.counter_reset",
      "attendance",
      context.userId,
      { bulk: true, ...out },
    );
    return out;
  });

// ---------- Export ----------

export const adminExportExamBatchAttendance = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceExportSchema.parse(i ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      generatedAt: string;
      rows: AttendanceStateWithProfile[];
      total: number;
    }> => {
      await assertPermission(
        context.supabase,
        context.userId,
        "manage_content",
        "exam_batch.attendance.export",
      );
      const settings = await readAttendanceSettings(context.supabase);
      const limit = settings.consecutiveMissLimit;

      let q = context.supabase
        .from("exam_batch_attendance_state")
        .select(STATE_COLUMNS)
        .order("banned", { ascending: false })
        .order("banned_at", { ascending: false, nullsFirst: false })
        .order("consecutive_missed_count", { ascending: false })
        .limit(data.limit);

      if (data.sessionId) q = q.eq("session_id", data.sessionId);
      if (data.subjectId) q = q.eq("subject_id", data.subjectId);
      if (data.userId) q = q.eq("user_id", data.userId);
      if (data.onlyBanned) q = q.eq("banned", true);
      if (data.banType === "auto") q = q.eq("banned", true).eq("auto_banned", true);
      if (data.banType === "manual")
        q = q.eq("banned", true).eq("auto_banned", false);
      if (typeof data.minCount === "number")
        q = q.gte("consecutive_missed_count", data.minCount);
      if (data.onlyNearLimit && limit > 0) {
        const threshold = Math.max(0, limit - Math.max(0, settings.nearBanOffset));
        q = q.gte("consecutive_missed_count", threshold).eq("banned", false);
      }

      const { data: rows, error } = await q;
      if (error) mapSupabaseError(error, "adminExportExamBatchAttendance");
      const enriched = await enrichStates(
        context.supabase,
        (rows ?? []).map(mapState),
      );
      const filtered = data.search
        ? enriched.filter((r) => {
            const needle = data.search!.toLowerCase();
            return (
              (r.studentName ?? "").toLowerCase().includes(needle) ||
              (r.studentEmail ?? "").toLowerCase().includes(needle) ||
              r.userId.toLowerCase().includes(needle)
            );
          })
        : enriched;

      await audit(
        context.supabase,
        context.userId,
        "export.generate",
        "attendance",
        context.userId,
        { count: filtered.length, filters: data },
      );
      return {
        generatedAt: new Date().toISOString(),
        rows: filtered,
        total: filtered.length,
      };
    },
  );

// ---------- Dashboard ----------

export const adminGetExamBatchAttendanceDashboard = createServerFn({ method: "POST" })
  .validator((i: unknown) =>
    z
      .object({
        sessionId: uuid.optional(),
        subjectId: uuid.optional(),
        recentLimit: z.number().int().min(1).max(50).default(10),
      })
      .parse(i ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceDashboardSummary> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.dashboard",
    );
    const settings = await readAttendanceSettings(context.supabase);
    const limit = settings.consecutiveMissLimit;
    const nearThreshold = Math.max(0, limit - Math.max(0, settings.nearBanOffset));
    const now = Date.now();
    const day = 24 * 60 * 60 * 1_000;
    const sevenDaysAgo = new Date(now - 7 * day).toISOString();
    const thirtyDaysAgo = new Date(now - 30 * day).toISOString();

    const scopeFilter = (q: any) => {
      if (data.sessionId) q = q.eq("session_id", data.sessionId);
      if (data.subjectId) q = q.eq("subject_id", data.subjectId);
      return q;
    };

    // Currently banned + type breakdown.
    const bannedQ = scopeFilter(
      context.supabase
        .from("exam_batch_attendance_state")
        .select(STATE_COLUMNS)
        .eq("banned", true)
        .order("banned_at", { ascending: false, nullsFirst: false })
        .limit(Math.max(data.recentLimit, 200)),
    );
    const { data: bannedRows, error: bannedErr } = await bannedQ;
    if (bannedErr) mapSupabaseError(bannedErr, "dashboard:banned");
    const banned = (bannedRows ?? []).map(mapState);

    // Near-limit (not banned, count within offset of limit).
    let nearRows: AttendanceState[] = [];
    if (limit > 0) {
      const nearQ = scopeFilter(
        context.supabase
          .from("exam_batch_attendance_state")
          .select(STATE_COLUMNS)
          .eq("banned", false)
          .gte("consecutive_missed_count", nearThreshold)
          .lt("consecutive_missed_count", limit)
          .order("consecutive_missed_count", { ascending: false })
          .limit(data.recentLimit),
      );
      const { data: rows, error } = await nearQ;
      if (error) mapSupabaseError(error, "dashboard:near");
      nearRows = (rows ?? []).map(mapState);
    }

    // Recent unbans — via events.
    let unbanQ = context.supabase
      .from("exam_batch_attendance_events")
      .select("user_id,session_id,subject_id,created_at,reason")
      .eq("kind", "manual_unban")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false })
      .limit(data.recentLimit);
    if (data.sessionId) unbanQ = unbanQ.eq("session_id", data.sessionId);
    if (data.subjectId) unbanQ = unbanQ.eq("subject_id", data.subjectId);
    const { data: unbanRows, error: unbanErr } = await unbanQ;
    if (unbanErr && unbanErr.code !== "42P01")
      mapSupabaseError(unbanErr, "dashboard:unbans");

    // Materialise the un-banned scopes as states.
    let recentUnbans: AttendanceState[] = [];
    if ((unbanRows ?? []).length > 0) {
      const keys = (unbanRows as any[]).map((r) => ({
        userId: r.user_id,
        sessionId: r.session_id,
        subjectId: r.subject_id,
      }));
      const settle = await Promise.all(
        keys.map((k) =>
          readState(context.supabase, k.userId, k.sessionId, k.subjectId).catch(
            () => emptyState(k.userId, k.sessionId, k.subjectId),
          ),
        ),
      );
      recentUnbans = settle;
    }

    const bannedLast7d = banned.filter(
      (b) => (b.bannedAt ?? "") >= sevenDaysAgo,
    ).length;
    const unbannedLast7d = (unbanRows ?? []).filter(
      (r: any) => (r.created_at ?? "") >= sevenDaysAgo,
    ).length;
    const recoveredLast30d = (unbanRows ?? []).length;

    const [enrichedBans, enrichedNear, enrichedUnbans] = await Promise.all([
      enrichStates(context.supabase, banned.slice(0, data.recentLimit)),
      enrichStates(context.supabase, nearRows),
      enrichStates(context.supabase, recentUnbans),
    ]);

    return {
      limit,
      autoBanEnabled: settings.autoBanEnabled,
      nearBanOffset: settings.nearBanOffset,
      currentlyBanned: banned.length,
      autoBans: banned.filter((b) => b.autoBanned).length,
      manualBans: banned.filter((b) => !b.autoBanned).length,
      nearLimit: nearRows.length,
      bannedLast7d,
      unbannedLast7d,
      recoveredLast30d,
      recentBans: enrichedBans,
      recentUnbans: enrichedUnbans,
      nearLimitStudents: enrichedNear,
    };
  });

// ---------- Reports ----------

export const adminGetExamBatchAttendanceReports = createServerFn({ method: "POST" })
  .validator((i: unknown) =>
    z
      .object({
        sessionId: uuid.optional(),
        subjectId: uuid.optional(),
      })
      .parse(i ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceReports> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.reports",
    );

    let q = context.supabase
      .from("exam_batch_attendance_state")
      .select(STATE_COLUMNS)
      .limit(10_000);
    if (data.sessionId) q = q.eq("session_id", data.sessionId);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "adminGetExamBatchAttendanceReports");

    const states = (rows ?? []).map(mapState);
    const sessions = Array.from(new Set(states.map((s) => s.sessionId)));
    const subjects = Array.from(new Set(states.map((s) => s.subjectId)));

    const [sessionRows, subjectRows, recoveredEvents] = await Promise.all([
      sessions.length
        ? context.supabase
            .from("exam_batch_sessions")
            .select("id,title")
            .in("id", sessions)
            .then((r: any) => r.data ?? [], () => [])
  
        : Promise.resolve([]),
      subjects.length
        ? context.supabase
            .from("exam_batch_subjects")
            .select("id,name")
            .in("id", subjects)
            .then((r: any) => r.data ?? [], () => [])
  
        : Promise.resolve([]),
      context.supabase
        .from("exam_batch_attendance_events")
        .select("user_id", { count: "exact", head: true })
        .eq("kind", "manual_unban")
        .then((r: any) => r.count ?? 0, () => 0)
,
    ]);

    const sessMap = new Map<string, string | null>();
    for (const s of sessionRows as any[]) sessMap.set(s.id, s.title ?? null);
    const subjMap = new Map<string, string | null>();
    for (const s of subjectRows as any[]) subjMap.set(s.id, s.name ?? null);

    function aggregate(keyFn: (s: AttendanceState) => string): AttendanceReportRow[] {
      const buckets = new Map<string, AttendanceState[]>();
      for (const s of states) {
        const k = keyFn(s);
        const arr = buckets.get(k) ?? [];
        arr.push(s);
        buckets.set(k, arr);
      }
      const out: AttendanceReportRow[] = [];
      for (const [, group] of buckets) {
        const first = group[0]!;
        const total = group.length;
        const banned = group.filter((g) => g.banned).length;
        const auto = group.filter((g) => g.banned && g.autoBanned).length;
        const manual = banned - auto;
        const counts = group.map((g) => g.consecutiveMissedCount);
        const avg =
          counts.length > 0
            ? counts.reduce((a, b) => a + b, 0) / counts.length
            : 0;
        const max = counts.reduce((a, b) => Math.max(a, b), 0);
        out.push({
          sessionId: first.sessionId,
          sessionTitle: sessMap.get(first.sessionId) ?? null,
          subjectId: first.subjectId,
          subjectName: subjMap.get(first.subjectId) ?? null,
          totalStudents: total,
          totalBanned: banned,
          autoBanned: auto,
          manualBanned: manual,
          averageMissed: Number(avg.toFixed(2)),
          maxMissed: max,
        });
      }
      return out.sort((a, b) => b.totalBanned - a.totalBanned);
    }

    const perScope = aggregate((s) => `${s.sessionId}:${s.subjectId}`);
    const bySession = aggregate((s) => s.sessionId);
    const bySubject = aggregate((s) => s.subjectId);

    const totalBanned = states.filter((s) => s.banned).length;
    const totalAuto = states.filter((s) => s.banned && s.autoBanned).length;
    const totalManual = totalBanned - totalAuto;
    const totalAvg =
      states.length > 0
        ? states.reduce((a, s) => a + s.consecutiveMissedCount, 0) / states.length
        : 0;

    return {
      bySession,
      bySubject,
      totals: {
        banned: totalBanned,
        autoBans: totalAuto,
        manualBans: totalManual,
        recovered: Number(recoveredEvents ?? 0),
        averageMissed: Number(totalAvg.toFixed(2)),
        trackedScopes: perScope.length,
      },
    };
  });

// ---------- Manual sweep: process one exam for missed attendance ----------

export const adminProcessExamBatchMissedAttendance = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceProcessExamSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AttendanceProcessResult> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.process",
    );
    const result = await processMissedExam(
      context.supabase,
      data.examId,
      context.userId,
    );
    await audit(
      context.supabase,
      context.userId,
      "attendance.process_exam",
      "attendance",
      data.examId,
      { ...result },
    );
    return result;
  });

// ---------- Shared sweep implementation ----------
// Exported so a cron-style server route can call it without going through
// the admin permission gate — the caller MUST re-establish its own auth.

export async function processMissedExam(
  supabase: any,
  examId: string,
  actorId: string | null,
): Promise<AttendanceProcessResult> {
  // Try the atomic RPC first (session+subject aware).
  const rpc = await supabase.rpc("exam_batch_attendance_process_exam", {
    _exam_id: examId,
  });
  if (!rpc.error) {
    const rows: any[] = Array.isArray(rpc.data) ? rpc.data : [];
    const first = rows[0] ?? {};
    return {
      processed: Number(first.processed ?? rows.length ?? rpc.data ?? 0),
      autoBanned: Number(first.auto_banned ?? 0),
      reset: Number(first.reset ?? 0),
    };
  }
  if (rpc.error.code !== "42883" && rpc.error.code !== "PGRST202") {
    mapSupabaseError(rpc.error, "processMissedExam:rpc");
  }

  // ----- JS fallback -----
  // 1. Load exam + verify eligibility (published, window ended, not hidden/archived/cancelled).
  const { data: exam, error: examErr } = await supabase
    .from("exam_batch_exams")
    .select("id,subject_id,session_id,status,is_hidden,is_archived,ends_at")
    .eq("id", examId)
    .maybeSingle();
  if (examErr) mapSupabaseError(examErr, "processMissedExam:exam");
  if (!exam) throw errors.notFound("Exam");
  if (exam.is_hidden || exam.is_archived) return { processed: 0, autoBanned: 0, reset: 0 };
  if (exam.status === "cancelled" || exam.status === "draft")
    return { processed: 0, autoBanned: 0, reset: 0 };
  if (!exam.ends_at || new Date(exam.ends_at).getTime() > Date.now()) {
    return { processed: 0, autoBanned: 0, reset: 0 };
  }
  const sessionId: string = exam.session_id;
  const subjectId: string = exam.subject_id;

  // 2. Approved, non-removed enrollments for this subject/session.
  const { data: enrolls, error: enrErr } = await supabase
    .from("exam_batch_enrollments")
    .select("user_id")
    .eq("session_id", sessionId)
    .eq("subject_id", subjectId)
    .eq("status", "approved")
    .neq("removed", true);
  if (enrErr) mapSupabaseError(enrErr, "processMissedExam:enrollments");
  const candidates: string[] = (enrolls ?? []).map((r: any) => r.user_id);
  if (candidates.length === 0) return { processed: 0, autoBanned: 0, reset: 0 };

  // 3. Filter out anyone who has ANY attempt row for this exam.
  const { data: started, error: attErr } = await supabase
    .from("exam_batch_attempts")
    .select("user_id")
    .eq("exam_id", examId)
    .in("user_id", candidates);
  if (attErr) mapSupabaseError(attErr, "processMissedExam:attempts");
  const startedSet = new Set<string>((started ?? []).map((r: any) => r.user_id));
  const missing = candidates.filter((u) => !startedSet.has(u));
  if (missing.length === 0) return { processed: 0, autoBanned: 0, reset: 0 };

  const settings = await readAttendanceSettings(supabase);
  const limit = settings.consecutiveMissLimit;
  const autoBanEnabled = settings.autoBanEnabled && limit > 0;
  const now = new Date().toISOString();

  let processedCount = 0;
  let autoBannedCount = 0;

  // 4. Per-student, per-(session,subject): insert into processed ledger;
  //    if new, bump counter for THAT scope only. Idempotent via unique key.
  for (const userId of missing) {
    const ledger = await supabase
      .from("exam_batch_attendance_processed")
      .insert({
        user_id: userId,
        session_id: sessionId,
        subject_id: subjectId,
        exam_id: examId,
      })
      .select("user_id")
      .maybeSingle();
    if (ledger.error) {
      if (ledger.error.code === "23505") continue; // already processed
      if (ledger.error.code === "42P01")
        mapSupabaseError(ledger.error, "processMissedExam:ledger");
      console.error("[exam-batch:attendance] ledger insert failed", ledger.error);
      continue;
    }

    const prev = await readState(supabase, userId, sessionId, subjectId);
    const nextCount = prev.consecutiveMissedCount + 1;
    const shouldAutoBan = autoBanEnabled && !prev.banned && nextCount >= limit;
    const autoBanUntil =
      shouldAutoBan && settings.autoBanDurationDays > 0
        ? new Date(Date.now() + settings.autoBanDurationDays * 86_400_000).toISOString()
        : null;
    const next: AttendanceState = {
      ...prev,
      consecutiveMissedCount: nextCount,
      lastMissedExamId: examId,
      lastMissedAt: now,
      banned: shouldAutoBan ? true : prev.banned,
      bannedAt: shouldAutoBan ? now : prev.bannedAt,
      bannedReason: shouldAutoBan
        ? "Auto-ban: consecutive missed exams"
        : prev.bannedReason,
      bannedBy: shouldAutoBan ? null : prev.bannedBy,
      bannedUntil: shouldAutoBan ? autoBanUntil : prev.bannedUntil,
      autoBanned: shouldAutoBan ? true : prev.autoBanned,
    };
    await upsertState(supabase, next);
    await insertEvent(supabase, userId, sessionId, subjectId, "missed", {
      examId,
      previousCount: prev.consecutiveMissedCount,
      newCount: nextCount,
      actorId,
    });
    processedCount += 1;
    if (shouldAutoBan) {
      autoBannedCount += 1;
      await insertEvent(supabase, userId, sessionId, subjectId, "auto_ban", {
        examId,
        previousCount: prev.consecutiveMissedCount,
        newCount: nextCount,
        reason: "consecutive missed exams",
        actorId: null,
      });
    }
  }

  return { processed: processedCount, autoBanned: autoBannedCount, reset: 0 };
}


// ---------- Attendance settings updater ----------
// The core settings module (admin-settings.functions.ts) does not accept
// `attendance` in its patch schema; auto-ban configuration lives inside
// `exam_batch_settings.value.attendance`. This dedicated updater merges the
// requested keys and returns the effective config, so admins can tune the
// consecutive-miss threshold, near-limit offset and ban messaging from the
// Attendance & Ban Management page without touching unrelated settings.

const attendanceSettingsPatchSchema = z
  .object({
    consecutiveMissLimit: z.number().int().min(0).max(50).optional(),
    missedExamLimit: z.number().int().min(0).max(500).optional(),
    attendancePercentThreshold: z.number().int().min(0).max(100).optional(),
    autoBanDurationDays: z.number().int().min(0).max(3650).optional(),
    autoBanEnabled: z.boolean().optional(),
    nearBanOffset: z.number().int().min(0).max(20).optional(),
    banTitle: z.string().trim().max(200).optional(),
    banMessage: z.string().trim().max(4_000).optional(),
    suggestedAction: z.string().trim().max(1_000).optional(),
    supportContact: z.string().trim().max(500).optional(),
    supportRequired: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "No attendance settings provided.",
  });

export const adminUpdateExamBatchAttendanceSettings = createServerFn({ method: "POST" })
  .validator((i: unknown) => attendanceSettingsPatchSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<Required<AttendanceSettings>> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.settings",
    );

    // Read the current singleton row; fall back to an empty object.
    const { data: row, error: readErr } = await context.supabase
      .from("exam_batch_settings")
      .select("value")
      .eq("id", "singleton")
      .maybeSingle();
    if (readErr && readErr.code !== "PGRST116")
      mapSupabaseError(readErr, "adminUpdateExamBatchAttendanceSettings:read");

    const existingValue: Record<string, any> = ((row as any)?.value ?? {}) as Record<string, any>;
    const existingAttendance: Record<string, any> = (existingValue.attendance ?? {}) as Record<
      string,
      any
    >;
    const nextAttendance = { ...existingAttendance, ...data };
    const nextValue = { ...existingValue, attendance: nextAttendance };

    const { error: upErr } = await context.supabase
      .from("exam_batch_settings")
      .upsert(
        { id: "singleton", value: nextValue, updated_by: context.userId },
        { onConflict: "id" },
      );
    if (upErr) mapSupabaseError(upErr, "adminUpdateExamBatchAttendanceSettings:upsert");

    await audit(
      context.supabase,
      context.userId,
      "attendance.settings.update",
      "settings",
      "singleton",
      { keys: Object.keys(data) },
    );

    return {
      ...DEFAULT_ATTENDANCE_SETTINGS,
      ...nextAttendance,
    } as Required<AttendanceSettings>;
  });

export const adminGetExamBatchAttendanceSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Required<AttendanceSettings>> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.attendance.settings",
    );
    return readAttendanceSettings(context.supabase);
  });