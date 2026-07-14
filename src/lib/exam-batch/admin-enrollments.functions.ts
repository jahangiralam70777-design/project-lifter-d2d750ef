// @ts-nocheck
// Admin enrollment workflow: list / approve / reject / remove and manage the
// subject list attached to an approved enrollment.
//
// STUDENT ID GENERATION
// ---------------------
// Student ID is a SYSTEM-WIDE, sequential, permanent identifier. It is
// assigned exactly once — on the FIRST approval of an enrollment — by the
// atomic Postgres RPC `exam_batch_approve_enrollments(uuid[], uuid)`.
// Because assignment happens inside a single SQL statement using
// `nextval('exam_batch_student_id_seq')`, bulk approvals of 100+ rows are
// guaranteed to be:
//   - unique (sequence semantics)
//   - contiguous (no skipped IDs for approved rows in the same call — Postgres
//     may still gap the sequence on unrelated rollbacks, which is desired)
//   - race-free (nextval holds a per-row lock only for the increment)
//   - double-approval-safe (WHERE status = 'pending' filter)
// Once assigned, `student_id` is NEVER changed. Subject edits, status edits,
// and admin edits do not touch it (see adminAddSubject/RemoveSubject below).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { audit } from "./audit";
import { errors, ExamBatchError, mapSupabaseError } from "./errors";
import {
  adminEnrollmentCountsSchema,
  adminEnrollmentListSchema,
  enrollmentIdOnly,
  enrollmentIdsSchema,
  enrollmentSetStatusSchema,
  enrollmentSubjectMutationSchema,
  enrollmentSubjectsBulkSchema,
  type EnrollmentStatus,
  type ExamBatchEnrollmentEnrichedRow,
  type ExamBatchEnrollmentRow,
} from "./types";

// ---------- List enrollments (admin, enriched) ----------
// Returns rows joined with the student's profile (name / email), the parent
// session title, the selected subjects and the reviewer's display name so
// the admin UI can render everything without extra round-trips.
export const adminListExamBatchEnrollments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => adminEnrollmentListSchema.parse(i))
  .handler(
    async ({ data, context }): Promise<ExamBatchEnrollmentEnrichedRow[]> => {
      await assertPermission(
        context.supabase,
        context.userId,
        "manage_content",
        "exam_batch.enrollment.list",
      );

      let enrollmentIdFilter: string[] | null = null;
      if (data.subjectId) {
        let sq = context.supabase
          .from("exam_batch_enrollment_subjects")
          .select("enrollment_id")
          .eq("subject_id", data.subjectId);
        if (data.sessionId) {
          const { data: sessRows, error: sessErr } = await context.supabase
            .from("exam_batch_enrollments")
            .select("id")
            .eq("session_id", data.sessionId);
          if (sessErr) mapSupabaseError(sessErr, "adminListExamBatchEnrollments:sessionScope");
          const ids = (sessRows ?? []).map((r: any) => r.id as string);
          sq = sq.in("enrollment_id", ids);
        }
        const { data: rows, error } = await sq;
        if (error) mapSupabaseError(error, "adminListExamBatchEnrollments:subjectFilter");
        enrollmentIdFilter = (rows ?? []).map((r: any) => r.enrollment_id as string);
        if (enrollmentIdFilter.length === 0) return [];
      }

      let q = context.supabase
        .from("exam_batch_enrollments")
        .select("*")
        .order("created_at", { ascending: false })
        .range(data.offset, data.offset + data.limit - 1);
      if (data.sessionId) q = q.eq("session_id", data.sessionId);
      if (data.status) q = q.eq("status", data.status);
      if (enrollmentIdFilter) q = q.in("id", enrollmentIdFilter);
      const { data: rawRows, error } = await q;
      if (error) mapSupabaseError(error, "adminListExamBatchEnrollments");
      const rows = (rawRows ?? []) as ExamBatchEnrollmentRow[];
      if (rows.length === 0) return [];

      const enrollmentIds = rows.map((r) => r.id);
      const userIds = Array.from(
        new Set(
          [
            ...rows.map((r) => r.user_id),
            ...rows.map((r) => r.reviewed_by).filter((v): v is string => !!v),
          ],
        ),
      );
      const sessionIds = Array.from(new Set(rows.map((r) => r.session_id)));

      const [profilesRes, sessionsRes, subjectLinksRes] = await Promise.all([
        userIds.length
          ? context.supabase.rpc("exam_batch_admin_user_contacts", {
              _ids: userIds,
            })
          : Promise.resolve({ data: [], error: null } as any),
        sessionIds.length
          ? context.supabase
              .from("exam_batch_sessions")
              .select("id,title")
              .in("id", sessionIds)
          : Promise.resolve({ data: [], error: null } as any),
        context.supabase
          .from("exam_batch_enrollment_subjects")
          .select("enrollment_id,subject_id,exam_batch_subjects(id,name)")
          .in("enrollment_id", enrollmentIds),
      ]);
      if (profilesRes.error)
        mapSupabaseError(profilesRes.error, "adminListExamBatchEnrollments:profiles");
      if (sessionsRes.error)
        mapSupabaseError(sessionsRes.error, "adminListExamBatchEnrollments:sessions");
      if (subjectLinksRes.error)
        mapSupabaseError(subjectLinksRes.error, "adminListExamBatchEnrollments:subjects");

      const profileMap = new Map<string, { name: string | null; email: string | null }>();
      for (const p of (profilesRes.data ?? []) as any[]) {
        profileMap.set(p.id, {
          name: p.display_name ?? null,
          email: p.email ?? null,
        });
      }
      const sessionMap = new Map<string, string>();
      for (const s of (sessionsRes.data ?? []) as any[]) sessionMap.set(s.id, s.title);
      const subjectsByEnrollment = new Map<
        string,
        { ids: string[]; names: string[] }
      >();
      for (const link of (subjectLinksRes.data ?? []) as any[]) {
        const bucket =
          subjectsByEnrollment.get(link.enrollment_id) ??
          { ids: [], names: [] };
        bucket.ids.push(link.subject_id);
        bucket.names.push(link.exam_batch_subjects?.name ?? link.subjects?.name ?? "");
        subjectsByEnrollment.set(link.enrollment_id, bucket);
      }

      return rows.map((r) => {
        const student = profileMap.get(r.user_id);
        const reviewer = r.reviewed_by ? profileMap.get(r.reviewed_by) : undefined;
        const subj = subjectsByEnrollment.get(r.id) ?? { ids: [], names: [] };
        return {
          ...r,
          student_name: student?.name ?? null,
          student_email: student?.email ?? null,
          session_title: sessionMap.get(r.session_id) ?? null,
          subject_ids: subj.ids,
          subject_names: subj.names,
          reviewer_name: reviewer?.name ?? null,
        };
      });
    },
  );

// ---------- Live counts for the enrollment queue (real-time KPIs) ----------
export const adminGetExamBatchEnrollmentCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => adminEnrollmentCountsSchema.parse(i ?? {}))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      total: number;
      pending: number;
      approved: number;
      rejected: number;
      banned: number;
      todayApproved: number;
      weekApproved: number;
    }> => {
      await assertPermission(
        context.supabase,
        context.userId,
        "manage_content",
        "exam_batch.enrollment.list",
      );

      let enrollmentIdFilter: string[] | null = null;
      if (data.subjectId) {
        let sq = context.supabase
          .from("exam_batch_enrollment_subjects")
          .select("enrollment_id")
          .eq("subject_id", data.subjectId);
        if (data.sessionId) {
          const { data: sessRows, error: sessErr } = await context.supabase
            .from("exam_batch_enrollments")
            .select("id")
            .eq("session_id", data.sessionId);
          if (sessErr) mapSupabaseError(sessErr, "adminGetExamBatchEnrollmentCounts:sessionScope");
          const ids = (sessRows ?? []).map((r: any) => r.id as string);
          sq = sq.in("enrollment_id", ids);
        }
        const { data: rows, error } = await sq;
        if (error) mapSupabaseError(error, "adminGetExamBatchEnrollmentCounts:subjectFilter");
        enrollmentIdFilter = (rows ?? []).map((r: any) => r.enrollment_id as string);
        if (enrollmentIdFilter.length === 0)
          return {
            total: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
            banned: 0,
            todayApproved: 0,
            weekApproved: 0,
          };
      }

      const countFor = async (status: EnrollmentStatus | null, sinceISO?: string) => {
        let q = context.supabase
          .from("exam_batch_enrollments")
          .select("id", { count: "exact", head: true });
        if (data.sessionId) q = q.eq("session_id", data.sessionId);
        if (enrollmentIdFilter) q = q.in("id", enrollmentIdFilter);
        if (status) q = q.eq("status", status);
        if (sinceISO) q = q.gte("reviewed_at", sinceISO);
        const { count, error } = await q;
        if (error) mapSupabaseError(error, "adminGetExamBatchEnrollmentCounts:count");
        return Number(count ?? 0);
      };

      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).toISOString();
      const startOfWeek = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();

      const [total, pending, approved, rejected, banned, todayApproved, weekApproved] =
        await Promise.all([
          countFor(null),
          countFor("pending"),
          countFor("approved"),
          countFor("rejected"),
          countFor("banned"),
          countFor("approved", startOfDay),
          countFor("approved", startOfWeek),
        ]);
      return {
        total,
        pending,
        approved,
        rejected,
        banned,
        todayApproved,
        weekApproved,
      };
    },
  );

// ---------- Set enrollment status (any → any transition, admin) ----------
// Uses the SQL RPC exam_batch_set_enrollment_status which:
//   • enforces the manage_content permission
//   • assigns a permanent student_id via the shared sequence the first time
//     an enrollment transitions to 'approved'
//   • preserves the assigned student_id on all other transitions (never
//     recycled, never re-issued).
export const adminSetExamBatchEnrollmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollmentSetStatusSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      `exam_batch.enrollment.set_status.${data.status}`,
    );

    const { data: rows, error } = await context.supabase.rpc(
      "exam_batch_set_enrollment_status",
      {
        _enrollment_id: data.enrollmentId,
        _status: data.status,
        _reviewer: context.userId,
        _notes: data.notes ?? null,
      },
    );
    if (error) mapSupabaseError(error, "adminSetExamBatchEnrollmentStatus");
    const row = (rows ?? [])[0] as
      | { id: string; student_id: number | null; status: EnrollmentStatus }
      | undefined;
    if (!row) throw errors.notFound("Enrollment");

    await audit(
      context.supabase,
      context.userId,
      `set_status.${data.status}`,
      "enrollment",
      row.id,
      { studentId: row.student_id, notes: data.notes ?? null },
    );
    return row;
  });

// ---------- Bulk approve (atomic Student ID assignment) ----------
export const adminApproveExamBatchEnrollments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollmentIdsSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.enrollment.approve",
      { count: data.enrollmentIds.length },
    );

    // Atomic RPC — see module header + README for guarantees.
    const { data: assigned, error } = await context.supabase.rpc(
      "exam_batch_approve_enrollments",
      { _enrollment_ids: data.enrollmentIds, _reviewer: context.userId },
    );
    if (error) mapSupabaseError(error, "adminApproveExamBatchEnrollments");

    const rows = (assigned ?? []) as Array<{ id: string; student_id: number }>;
    // Best-effort audit trail — one entry per approved enrollment + one per
    // Student ID assignment. Never blocks the caller.
    await Promise.all(
      rows.map((r) =>
        Promise.all([
          audit(context.supabase, context.userId, "approve", "enrollment", r.id, {
            studentId: r.student_id,
          }),
          audit(context.supabase, context.userId, "student_id.assign", "student_id", String(r.student_id), {
            enrollmentId: r.id,
          }),
        ]),
      ),
    );

    // Detect requested IDs that were skipped (already approved / rejected /
    // deleted) and surface a partial-success summary — never a silent no-op.
    const approvedIds = new Set(rows.map((r) => r.id));
    const skipped = data.enrollmentIds.filter((id) => !approvedIds.has(id));
    return {
      approved: rows,
      skipped,
      approvedCount: rows.length,
      requestedCount: data.enrollmentIds.length,
    } as const;
  });

// ---------- Bulk reject ----------
export const adminRejectExamBatchEnrollments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollmentIdsSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.enrollment.reject",
      { count: data.enrollmentIds.length },
    );

    // Only touch pending rows — do NOT downgrade an already-approved student.
    const { data: rows, error } = await context.supabase
      .from("exam_batch_enrollments")
      .update({
        status: "rejected",
        notes: data.notes ?? null,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .in("id", data.enrollmentIds)
      .eq("status", "pending")
      .select("id");
    if (error) mapSupabaseError(error, "adminRejectExamBatchEnrollments");

    const rejected = (rows ?? []).map((r: any) => r.id as string);
    await Promise.all(
      rejected.map((id) =>
        audit(context.supabase, context.userId, "reject", "enrollment", id, { notes: data.notes ?? null }),
      ),
    );
    const skipped = data.enrollmentIds.filter((id) => !rejected.includes(id));
    return { rejected, skipped, rejectedCount: rejected.length } as const;
  });

// ---------- Remove enrollment (hard delete) ----------
// Explicitly hard-delete — admin's choice. Student ID is NEVER recycled: the
// sequence has already advanced. Subject links cascade on delete.
export const adminRemoveExamBatchEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollmentIdOnly.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.enrollment.remove",
    );
    const { error } = await context.supabase
      .from("exam_batch_enrollments")
      .delete()
      .eq("id", data.enrollmentId);
    if (error) mapSupabaseError(error, "adminRemoveExamBatchEnrollment");
    await audit(context.supabase, context.userId, "remove", "enrollment", data.enrollmentId);
    return { ok: true } as const;
  });

// ---------- Add / Remove subjects on an approved enrollment ----------
// CRITICAL: Neither of these touches `student_id`. A student always keeps
// ONE ID for the lifetime of the enrollment, regardless of subject churn.

async function loadEnrollmentForSubjectMutation(
  supabase: any,
  enrollmentId: string,
): Promise<{ id: string; status: string; session_id: string }> {
  const { data: row, error } = await supabase
    .from("exam_batch_enrollments")
    .select("id,status,session_id")
    .eq("id", enrollmentId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "loadEnrollmentForSubjectMutation");
  if (!row) throw errors.notFound("Enrollment");
  if (row.status !== "approved") {
    throw errors.invalidState("Subjects can only be edited on approved enrollments.");
  }
  return row;
}

export const adminAddExamBatchSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollmentSubjectMutationSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.subject.add",
    );

    const enrollment = await loadEnrollmentForSubjectMutation(context.supabase, data.enrollmentId);

    // Subject must belong to this session's level.
    const [sessRes, subjRes] = await Promise.all([
      context.supabase.from("exam_batch_sessions").select("level").eq("id", enrollment.session_id).single(),
      context.supabase.from("exam_batch_subjects").select("id,level").eq("id", data.subjectId).maybeSingle(),
    ]);
    if (sessRes.error) mapSupabaseError(sessRes.error, "adminAddExamBatchSubject:session-level");
    if (subjRes.error) mapSupabaseError(subjRes.error, "adminAddExamBatchSubject:subject");
    if (!subjRes.data) throw errors.notFound("Subject");
    if (subjRes.data.level !== sessRes.data!.level) {
      throw errors.invalidState("Subject does not belong to this session's level.");
    }

    const { error } = await context.supabase.from("exam_batch_enrollment_subjects").insert({
      enrollment_id: data.enrollmentId,
      subject_id: data.subjectId,
      added_by: context.userId,
    });
    if (error) {
      // 23505 → unique violation → subject already attached.
      if ((error as { code?: string }).code === "23505") {
        throw new ExamBatchError("CONFLICT", "This subject is already attached to the enrollment.");
      }
      mapSupabaseError(error, "adminAddExamBatchSubject:insert");
    }
    await audit(context.supabase, context.userId, "subject.add", "subject", data.subjectId, {
      enrollmentId: data.enrollmentId,
    });
    return { ok: true } as const;
  });

export const adminRemoveExamBatchSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollmentSubjectMutationSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.subject.remove",
    );

    await loadEnrollmentForSubjectMutation(context.supabase, data.enrollmentId);

    const { error } = await context.supabase
      .from("exam_batch_enrollment_subjects")
      .delete()
      .eq("enrollment_id", data.enrollmentId)
      .eq("subject_id", data.subjectId);
    if (error) mapSupabaseError(error, "adminRemoveExamBatchSubject");
    await audit(context.supabase, context.userId, "subject.remove", "subject", data.subjectId, {
      enrollmentId: data.enrollmentId,
    });
    return { ok: true } as const;
  });

// ---------- Bulk add / remove subjects on an approved enrollment ----------
// Used by the Subject Manager admin page. Both operations validate that
// every candidate subject belongs to the enrollment's session level and
// swallow "already attached" (23505) / no-op deletes so partial states
// converge to the intended set without failing the whole request.

export const adminAddExamBatchSubjectsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollmentSubjectsBulkSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.subject.add",
    );

    const enrollment = await loadEnrollmentForSubjectMutation(
      context.supabase,
      data.enrollmentId,
    );

    const [sessRes, subjRes] = await Promise.all([
      context.supabase
        .from("exam_batch_sessions")
        .select("level")
        .eq("id", enrollment.session_id)
        .single(),
      context.supabase
        .from("exam_batch_subjects")
        .select("id,level")
        .in("id", data.subjectIds),
    ]);
    if (sessRes.error) mapSupabaseError(sessRes.error, "adminAddExamBatchSubjectsBulk:session");
    if (subjRes.error) mapSupabaseError(subjRes.error, "adminAddExamBatchSubjectsBulk:subjects");
    const level = sessRes.data!.level;
    const validSubjects = ((subjRes.data ?? []) as { id: string; level: string }[])
      .filter((s) => s.level === level)
      .map((s) => s.id);
    if (validSubjects.length === 0) {
      throw errors.invalidState("No selected subjects match this session's level.");
    }

    const rows = validSubjects.map((subject_id) => ({
      enrollment_id: data.enrollmentId,
      subject_id,
      added_by: context.userId,
    }));
    // onConflict on the (enrollment_id, subject_id) unique index → idempotent.
    const { error } = await context.supabase
      .from("exam_batch_enrollment_subjects")
      .upsert(rows, { onConflict: "enrollment_id,subject_id", ignoreDuplicates: true });
    if (error) mapSupabaseError(error, "adminAddExamBatchSubjectsBulk:insert");

    await audit(
      context.supabase,
      context.userId,
      "subject.add.bulk",
      "enrollment",
      data.enrollmentId,
      { subjectIds: validSubjects },
    );
    return { ok: true, added: validSubjects.length } as const;
  });

export const adminRemoveExamBatchSubjectsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => enrollmentSubjectsBulkSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.subject.remove",
    );

    await loadEnrollmentForSubjectMutation(context.supabase, data.enrollmentId);

    const { error } = await context.supabase
      .from("exam_batch_enrollment_subjects")
      .delete()
      .eq("enrollment_id", data.enrollmentId)
      .in("subject_id", data.subjectIds);
    if (error) mapSupabaseError(error, "adminRemoveExamBatchSubjectsBulk");

    await audit(
      context.supabase,
      context.userId,
      "subject.remove.bulk",
      "enrollment",
      data.enrollmentId,
      { subjectIds: data.subjectIds },
    );
    return { ok: true, removed: data.subjectIds.length } as const;
  });