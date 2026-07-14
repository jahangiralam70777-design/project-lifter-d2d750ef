// @ts-nocheck
// Student-facing enrollment flow for Exam Batch.
// Only authenticated students may enroll. Every state transition is
// re-validated server-side; the client's view of session state is treated
// as untrusted input.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitKey,
} from "@/integrations/security/rate-limit";
import { audit } from "./audit";
import { errors, mapSupabaseError } from "./errors";
import {
  enrollSchema,
  type ExamBatchAccess,
  type ExamBatchEnrollmentRow,
  type ExamBatchSessionRow,
} from "./types";

const PUBLIC_SESSION_COLUMNS =
  "id,title,subtitle,level,starts_at,registration_deadline,status,registration_open,is_archived,is_hidden,subjects_count,created_at,updated_at";

// ---------- List sessions visible to the current student ----------
export const listAvailableExamBatchSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { level?: string }) =>
    z.object({ level: z.string().trim().min(1).max(40).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<ExamBatchSessionRow[]> => {
    console.log("[exam-batch] listAvailableExamBatchSessions userId=", context.userId, "level=", data.level);
    let q = context.supabase
      .from("exam_batch_sessions")
      .select(PUBLIC_SESSION_COLUMNS)
      .eq("is_hidden", false)
      .eq("is_archived", false)
      .eq("status", "active")
      .order("starts_at", { ascending: true });
    if (data.level) q = q.eq("level", data.level);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "listAvailableExamBatchSessions");
    return (rows ?? []) as ExamBatchSessionRow[];
  });

// ---------- Enroll ----------
// Guest users cannot reach this — requireSupabaseAuth already 401s.
// Rate-limited per user to defeat rapid clicks / duplicate submissions.
export const enrollInExamBatchSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollSchema.parse(i))
  .handler(async ({ data, context }): Promise<ExamBatchEnrollmentRow> => {
    // Rate-limit rapid clicks / duplicate submissions.
    await enforceRateLimit(
      context.supabase,
      rateLimitKey("exam_batch:enroll", "user", context.userId),
      RATE_LIMITS.ADMIN_WRITE,
    );

    // Enrollment + subject links are created atomically inside a
    // SECURITY DEFINER RPC. This eliminates the class of bug where the
    // enrollment row was created but the subject links silently dropped
    // (RLS mismatch), leaving approved students with zero subjects and
    // the "No enrolled subjects" empty state after admin approval.
    const { data: rows, error } = await context.supabase.rpc(
      "exam_batch_enroll_session",
      { _session_id: data.sessionId, _subject_ids: data.subjectIds },
    );
    if (error) {
      const msg = (error as { message?: string }).message ?? "";
      if (msg.includes("already_enrolled")) {
        throw errors.conflict("You are already enrolled in this session.");
      }
      if (msg.includes("session_not_found")) throw errors.notFound("Session");
      if (msg.includes("registration_closed")) {
        throw errors.invalidState("Registration for this session is closed.");
      }
      if (msg.includes("invalid_subjects")) {
        throw errors.invalidState("One or more selected subjects are invalid.");
      }
      if (msg.includes("no_subjects_selected")) {
        throw errors.invalidState("Please select at least one subject.");
      }
      mapSupabaseError(error, "enrollInExamBatchSession:rpc");
    }
    const created = (rows ?? [])[0] as ExamBatchEnrollmentRow | undefined;
    if (!created) throw errors.notFound("Enrollment");

    await audit(context.supabase, context.userId, "enroll", "enrollment", created.id, {
      sessionId: data.sessionId,
      subjectIds: data.subjectIds,
    });

    return created;
  });

// ---------- My enrollment for a session ----------
export const getMyExamBatchEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ExamBatchEnrollmentRow | null> => {
    const { data: row, error } = await context.supabase
      .from("exam_batch_enrollments")
      .select("*")
      .eq("session_id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) mapSupabaseError(error, "getMyExamBatchEnrollment");
    return (row ?? null) as ExamBatchEnrollmentRow | null;
  });

// ---------- Permissions probe (single source of truth for the UI) ----------
// The UI must call this before showing Dashboard / Exam / Leaderboard /
// Progress. Access is granted ONLY when status = 'approved' AND a Student ID
// has been assigned. Pending, rejected, and un-enrolled users get read-only
// access to the Pending screen (or nothing).
export const getExamBatchAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ExamBatchAccess> => {
    console.log("[exam-batch] getExamBatchAccess userId=", context.userId, "sessionId=", data.sessionId);
    const { data: row, error } = await context.supabase
      .from("exam_batch_enrollments")
      .select("status,student_id")
      .eq("session_id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) mapSupabaseError(error, "getExamBatchAccess");

    if (!row) {
      return {
        enrolled: false,
        status: null,
        studentId: null,
        canAccessDashboard: false,
        canTakeExams: false,
        canViewLeaderboard: false,
        canViewProgress: false,
      };
    }

    const approved = row.status === "approved" && typeof row.student_id === "number";
    return {
      enrolled: true,
      status: row.status,
      studentId: row.student_id ?? null,
      canAccessDashboard: approved,
      canTakeExams: approved,
      canViewLeaderboard: approved,
      canViewProgress: approved,
    };
  });

// ---------- All my enrollments (any status) ----------
// Used by the student flow to detect which session the current user is
// enrolled in without asking the browser to remember it. The `state.sessionId`
// localStorage cache is only a fallback: if a user clears their storage,
// this query recovers "where am I in the flow" from the backend.
export const listMyExamBatchEnrollments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(() => ({}))
  .handler(async ({ context }): Promise<ExamBatchEnrollmentRow[]> => {
    console.log("[exam-batch] listMyExamBatchEnrollments userId=", context.userId);
    const { data, error } = await context.supabase
      .from("exam_batch_enrollments")
      .select(
        "id,session_id,user_id,status,student_id,reviewed_by,reviewed_at,notes,created_at,updated_at",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) mapSupabaseError(error, "listMyExamBatchEnrollments");
    return (data ?? []) as ExamBatchEnrollmentRow[];
  });

// ---------- Subjects the student can pick for a session ----------
// Priority order:
//   1) Admin-configured `exam_batch_session_subjects` (per-session whitelist).
//   2) Fallback: every published subject at the session's level.
// Returns a stable UI shape — id/name/description/icon/sort_order — so the
// picker never has to reach into the raw table.
export const listExamBatchSessionSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      Array<{
        id: string;
        name: string;
        description: string | null;
        icon: string | null;
        sort_order: number;
      }>
    > => {
      const { data: linked, error: linkErr } = await context.supabase
        .from("exam_batch_session_subjects")
        .select(
          "sort_order, subjects:subject_id(id,name,description,icon,sort_order)",
        )
        .eq("session_id", data.sessionId)
        .order("sort_order", { ascending: true });
      if (linkErr) mapSupabaseError(linkErr, "listExamBatchSessionSubjects:linked");

      if (linked && linked.length > 0) {
        return linked
          .map((r: any) => r.subjects)
          .filter(Boolean)
          .map((s: any) => ({
            id: s.id,
            name: s.name,
            description: s.description ?? null,
            icon: s.icon ?? null,
            sort_order: s.sort_order ?? 0,
          }));
      }

      // Fallback: no per-session list configured — show subjects at the level.
      const { data: sess, error: sessErr } = await context.supabase
        .from("exam_batch_sessions")
        .select("level")
        .eq("id", data.sessionId)
        .maybeSingle();
      if (sessErr) mapSupabaseError(sessErr, "listExamBatchSessionSubjects:session");
      if (!sess) return [];

      const { data: subs, error: subErr } = await context.supabase
        .from("exam_batch_subjects")
        .select("id,name,description,icon,sort_order,status,level")
        .eq("level", sess.level)
        .eq("status", "published")
        .order("sort_order", { ascending: true });
      if (subErr) mapSupabaseError(subErr, "listExamBatchSessionSubjects:subjects");

      return (subs ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description ?? null,
        icon: s.icon ?? null,
        sort_order: s.sort_order ?? 0,
      }));
    },
  );