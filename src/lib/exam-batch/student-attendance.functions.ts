// @ts-nocheck
// Student-facing Attendance Enforcement surface for Exam Batch.
//
// All counters, bans and events are scoped by
//   (user_id, session_id, subject_id)
// so a miss streak in one (session, subject) never affects any other
// (session, subject). A brand-new session always starts from zero.
//
// This module owns:
//   1. `getExamBatchAccessState`      — UI reads this before rendering any
//      Exam Batch page. Returns `{ allowed:false, reason:"banned", … }`
//      when ANY (session,subject) ban is active on the student.
//   2. `assertExamBatchNotBanned`     — server-side gate used by every
//      other Exam Batch server function. One line at the top of every
//      handler.
//   3. `getExamBatchAttendanceSummary` — cheap read for nav badges / warnings.
//   4. `resetAttendanceOnParticipation` — Exam Engine calls this the first
//      time a student creates an attempt row. Any started attempt breaks
//      the streak for that (session,subject) and resets its counter to 0.
//
// The website account (Auth, Dashboard, MCQ Practice, Quiz, Mock Test,
// Flash Cards, Question Bank, Short Notes, Video Classes, Daily Progress,
// Profile, Notifications) is intentionally NOT read from these tables —
// bans here scope to the Exam Batch module only.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit } from "./audit";
import { errors, ExamBatchError, mapSupabaseError } from "./errors";
import {
  DEFAULT_ATTENDANCE_SETTINGS,
  type AttendanceSettings,
  type ExamBatchAccessDecision,
  type ExamBatchBanInfo,
} from "./attendance.types";

const STATE_COLUMNS =
  "user_id,session_id,subject_id,consecutive_missed_count,last_missed_exam_id,last_missed_at,last_attended_exam_id,last_attended_at,banned,banned_at,banned_reason,banned_by,banned_until,auto_banned,updated_at";

// ---------- Settings + visibility ----------

async function readSettingsRow(supabase: any): Promise<any> {
  const { data, error } = await supabase
    .from("exam_batch_settings")
    .select("value")
    .eq("id", "singleton")
    .maybeSingle();
  if (error && error.code !== "PGRST116" && error.code !== "42P01") {
    mapSupabaseError(error, "attendance:readSettings");
  }
  return (data as any)?.value ?? {};
}

async function readAttendanceSettings(
  supabase: any,
): Promise<Required<AttendanceSettings>> {
  const value = await readSettingsRow(supabase);
  return {
    ...DEFAULT_ATTENDANCE_SETTINGS,
    ...(value.attendance ?? {}),
  } as Required<AttendanceSettings>;
}

async function readModuleVisible(supabase: any): Promise<boolean> {
  const value = await readSettingsRow(supabase);
  return value.visibility?.moduleVisible !== false;
}

// ---------- Own bans / states ----------

interface OwnStateRow {
  userId: string;
  sessionId: string;
  subjectId: string;
  consecutiveMissedCount: number;
  banned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  bannedUntil: string | null;
  autoBanned: boolean;
}

async function readOwnStates(supabase: any, userId: string): Promise<OwnStateRow[]> {
  // Best-effort: sweep expired bans for this user so the UI reflects the
  // ban-until deadline without waiting for an admin action.
  try {
    await supabase.rpc("exam_batch_attendance_expire_bans", { _user_id: userId });
  } catch {
    /* RPC may not exist yet — falls through to raw read. */
  }
  const { data, error } = await supabase
    .from("exam_batch_attendance_state")
    .select(STATE_COLUMNS)
    .eq("user_id", userId);
  if (error) {
    if (error.code === "42P01") return []; // feature not provisioned
    mapSupabaseError(error, "attendance:readOwnStates");
  }
  const now = Date.now();
  return (data ?? [])
    .map((r: any) => ({
      userId: r.user_id,
      sessionId: r.session_id,
      subjectId: r.subject_id,
      consecutiveMissedCount: Number(r.consecutive_missed_count ?? 0),
      banned: !!r.banned,
      bannedAt: r.banned_at ?? null,
      bannedReason: r.banned_reason ?? null,
      bannedUntil: r.banned_until ?? null,
      autoBanned: !!r.auto_banned,
    }))
    .map((r: OwnStateRow) => {
      // Client-side fallback expiry: if RPC did not run, still treat an
      // expired scheduled ban as inactive so the student is not blocked.
      if (r.banned && r.bannedUntil && new Date(r.bannedUntil).getTime() <= now) {
        return { ...r, banned: false };
      }
      return r;
    });
}

async function resolveScopeLabels(
  supabase: any,
  sessionIds: string[],
  subjectIds: string[],
): Promise<{
  sessions: Map<string, string | null>;
  subjects: Map<string, string | null>;
}> {
  const sessions = new Map<string, string | null>();
  const subjects = new Map<string, string | null>();
  if (sessionIds.length > 0) {
    const { data } = await supabase
      .from("exam_batch_sessions")
      .select("id,title")
      .in("id", Array.from(new Set(sessionIds)));
    for (const r of (data ?? []) as any[]) sessions.set(r.id, r.title ?? null);
  }
  if (subjectIds.length > 0) {
    const { data } = await supabase
      .from("exam_batch_subjects")
      .select("id,name")
      .in("id", Array.from(new Set(subjectIds)));
    for (const r of (data ?? []) as any[]) subjects.set(r.id, r.name ?? null);
  }
  return { sessions, subjects };
}

function buildBanInfo(
  row: OwnStateRow,
  settings: Required<AttendanceSettings>,
  sessions: Map<string, string | null>,
  subjects: Map<string, string | null>,
  whatsappContact: string | null,
  whatsappButtonText: string | null,
): ExamBatchBanInfo {
  return {
    sessionId: row.sessionId,
    subjectId: row.subjectId,
    sessionTitle: sessions.get(row.sessionId) ?? null,
    subjectName: subjects.get(row.subjectId) ?? null,
    reason: row.bannedReason ?? "Consecutive missed exams",
    consecutiveMissedCount: row.consecutiveMissedCount,
    limit: settings.consecutiveMissLimit,
    banDate: row.bannedAt ?? "",
    bannedUntil: row.bannedUntil ?? null,
    autoBanned: row.autoBanned,
    title: settings.banTitle ?? DEFAULT_ATTENDANCE_SETTINGS.banTitle,
    message: settings.banMessage ?? DEFAULT_ATTENDANCE_SETTINGS.banMessage,
    suggestedAction:
      settings.suggestedAction ?? DEFAULT_ATTENDANCE_SETTINGS.suggestedAction,
    supportContact:
      settings.supportContact ?? DEFAULT_ATTENDANCE_SETTINGS.supportContact,
    whatsappContact,
    whatsappButtonText,
    supportRequired: settings.supportRequired,
  };
}

function emptyDecision(
  reason: ExamBatchAccessDecision["reason"],
  whatsappContact: string | null = null,
  whatsappButtonText: string | null = null,
): ExamBatchAccessDecision {
  return {
    allowed: reason === "ok",
    reason,
    banned: false,
    activeBanCount: 0,
    ban: null,
    bans: [],
    supportRequired: false,
    whatsappContact,
    whatsappButtonText,
  };
}

// ---------- Public: access decision ----------

export const getExamBatchAccessState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExamBatchAccessDecision> => {
    const rawSettings = await readSettingsRow(context.supabase);
    const visible = rawSettings.visibility?.moduleVisible !== false;
    const whatsappContact = rawSettings.content?.whatsappContact ?? null;
    const whatsappButtonText = rawSettings.content?.whatsappButtonText ?? null;
    if (!visible) {
      return {
        ...emptyDecision("hidden", whatsappContact, whatsappButtonText),
        allowed: false,
      };
    }

    const [rows, settings] = await Promise.all([
      readOwnStates(context.supabase, context.userId),
      readAttendanceSettings(context.supabase),
    ]);

    const bannedRows = rows
      .filter((r) => r.banned)
      .sort((a, b) => (b.bannedAt ?? "").localeCompare(a.bannedAt ?? ""));

    if (bannedRows.length === 0)
      return emptyDecision("ok", whatsappContact, whatsappButtonText);

    const { sessions, subjects } = await resolveScopeLabels(
      context.supabase,
      bannedRows.map((r) => r.sessionId),
      bannedRows.map((r) => r.subjectId),
    );

    const bans = bannedRows.map((r) =>
      buildBanInfo(r, settings, sessions, subjects, whatsappContact, whatsappButtonText),
    );

    return {
      allowed: false,
      reason: "banned",
      banned: true,
      activeBanCount: bans.length,
      ban: bans[0] ?? null,
      bans,
      supportRequired: settings.supportRequired,
      whatsappContact,
      whatsappButtonText,
    };
  });

// ---------- Cheap summary (nav / dashboard warning badges) ----------

export const getExamBatchAttendanceSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({
      context,
    }): Promise<{
      banned: boolean;
      activeBanCount: number;
      nearLimitCount: number;
      limit: number;
    }> => {
      const [rows, settings] = await Promise.all([
        readOwnStates(context.supabase, context.userId),
        readAttendanceSettings(context.supabase),
      ]);
      const limit = settings.consecutiveMissLimit;
      const nearBanThreshold = Math.max(
        0,
        limit - Math.max(0, settings.nearBanOffset),
      );
      const active = rows.filter((r) => r.banned);
      const near = rows.filter(
        (r) => !r.banned && limit > 0 && r.consecutiveMissedCount >= nearBanThreshold,
      );
      return {
        banned: active.length > 0,
        activeBanCount: active.length,
        nearLimitCount: near.length,
        limit,
      };
    },
  );

// ---------- Server-side gate ----------
// Every Exam Batch server function that a banned student must not reach
// should `await assertExamBatchNotBanned(supabase, userId)` at the top of
// the handler. Throws a typed ExamBatchError("ATTENDANCE_BANNED") — the
// UI catches it and renders the ban page.
//
// The gate blocks the WHOLE Exam Batch module if the student has ANY
// active (session,subject) ban, per spec. Individual per-(session,subject)
// checks are also exported below for the exam engine to reject taking
// a specific exam even when only that (session,subject) is banned.

export async function assertExamBatchNotBanned(
  supabase: any,
  userId: string,
): Promise<void> {
  const rows = await readOwnStates(supabase, userId);
  if (rows.some((r) => r.banned)) {
    throw new ExamBatchError(
      "ATTENDANCE_BANNED",
      "Your Exam Batch access is currently suspended.",
    );
  }
}

export async function assertScopeNotBanned(
  supabase: any,
  userId: string,
  sessionId: string,
  subjectId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("exam_batch_attendance_state")
    .select("banned")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01") return;
    mapSupabaseError(error, "attendance:assertScopeNotBanned");
  }
  if (data && (data as any).banned) {
    throw new ExamBatchError(
      "ATTENDANCE_BANNED",
      "Your Exam Batch access is suspended for this subject in this session.",
    );
  }
}

// ---------- Streak reset on participation ----------
// Called by the Exam Engine the first time a user creates an attempt row
// for an exam. Any started attempt — manual submit, auto submit, timeout
// submit, or a resumed session — breaks the missed streak for that
// (session,subject) and resets its counter to zero.
//
// Idempotent: calling this repeatedly for the same (user,exam) is safe.
// Never bans, never unbans, only touches the counter.

export async function resetAttendanceOnParticipation(
  supabase: any,
  userId: string,
  examId: string,
): Promise<void> {
  // Try atomic RPC first — accepts examId, derives session/subject internally.
  const rpc = await supabase.rpc(
    "exam_batch_attendance_reset_on_participation",
    { _user_id: userId, _exam_id: examId },
  );
  if (!rpc.error) return;
  if (rpc.error.code !== "42883" && rpc.error.code !== "PGRST202") {
    console.error("[exam-batch:attendance-reset-rpc]", rpc.error);
  }

  // JS fallback.
  try {
    const { data: exam, error: examErr } = await supabase
      .from("exam_batch_exams")
      .select("id,session_id,subject_id")
      .eq("id", examId)
      .maybeSingle();
    if (examErr) {
      if (examErr.code === "42P01") return;
      console.error("[exam-batch:attendance-reset-exam]", examErr);
      return;
    }
    if (!exam) return;
    const sessionId = (exam as any).session_id;
    const subjectId = (exam as any).subject_id;
    if (!sessionId || !subjectId) return;

    const { data: current, error } = await supabase
      .from("exam_batch_attendance_state")
      .select("consecutive_missed_count")
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("subject_id", subjectId)
      .maybeSingle();
    if (error) {
      if (error.code === "42P01") return;
      console.error("[exam-batch:attendance-reset-read]", error);
      return;
    }
    const prev = Number((current as any)?.consecutive_missed_count ?? 0);
    const now = new Date().toISOString();

    const { error: upErr } = await supabase
      .from("exam_batch_attendance_state")
      .upsert(
        {
          user_id: userId,
          session_id: sessionId,
          subject_id: subjectId,
          consecutive_missed_count: 0,
          last_attended_exam_id: examId,
          last_attended_at: now,
          updated_at: now,
        },
        { onConflict: "user_id,session_id,subject_id" },
      );
    if (upErr) {
      console.error("[exam-batch:attendance-reset-write]", upErr);
      return;
    }

    // Best-effort event log — record BOTH attended and reset for the trail.
    try {
      await supabase.from("exam_batch_attendance_events").insert([
        {
          user_id: userId,
          session_id: sessionId,
          subject_id: subjectId,
          kind: "attended",
          exam_id: examId,
          previous_count: prev,
          new_count: 0,
          reason: "attempt.started",
          actor_id: null,
        },
        ...(prev > 0
          ? [
              {
                user_id: userId,
                session_id: sessionId,
                subject_id: subjectId,
                kind: "counter.reset",
                exam_id: examId,
                previous_count: prev,
                new_count: 0,
                reason: "attempt.started",
                actor_id: null,
              },
            ]
          : []),
      ]);
    } catch (e) {
      console.error("[exam-batch:attendance-reset-event]", e);
    }
    await audit(
      supabase,
      userId,
      "attendance.counter_reset",
      "attendance",
      userId,
      { examId, sessionId, subjectId, previous: prev, trigger: "attempt.started" },
    );
  } catch (e) {
    console.error("[exam-batch:attendance-reset-fallback]", e);
  }
}

// Re-export the typed error code so UI consumers can pattern-match.
export const ATTENDANCE_BANNED_CODE = "ATTENDANCE_BANNED";

// Boolean-only variant callable from client code that doesn't need the full
// decision payload (e.g. nav badge).
export const isExamBatchAttendanceBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ banned: boolean }> => {
    const rows = await readOwnStates(context.supabase, context.userId);
    return { banned: rows.some((r) => r.banned) };
  });

// Suppress unused-import warning if the file evolves.
void errors;