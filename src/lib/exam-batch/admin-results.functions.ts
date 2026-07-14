// @ts-nocheck
// Admin-facing Leaderboard / Analytics / Recalculate surface for Exam Batch.
// Every mutation is gated by assertPermission("manage_content") and audited
// via the module-level audit log. Reads are served from cached snapshots and
// only rebuild on cache miss or explicit recalculation.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { audit } from "./audit";
import { errors, mapSupabaseError } from "./errors";
import {
  analyticsScopeInput,
  leaderboardAdminInput,
  recalcInput,
  type AdminLeaderboardView,
  type AnalyticsView,
  type ExamAnalytics,
  type ExamBatchLeaderboardEntryRow,
  type ExamBatchLeaderboardRow,
  type SubjectPerformance,
} from "./results.types";

const ADMIN_HISTORY_DAYS = 45;

const LEADERBOARD_COLUMNS =
  "exam_id,session_id,status,generated_at,frozen_at,entry_count,version";

const LEADERBOARD_ENTRY_COLUMNS =
  "exam_id,attempt_id,user_id,student_id,rank,marks,max_marks,percentage,correct,wrong,skipped,time_used_seconds,submitted_at";

// ============================================================================
// adminGetExamBatchLeaderboard — full ranking with search + pagination
// ============================================================================

export const adminGetExamBatchLeaderboard = createServerFn({ method: "POST" })
  .validator((i: unknown) => leaderboardAdminInput.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AdminLeaderboardView> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.leaderboard.view",
    );

    const { data: exam, error: exErr } = await context.supabase
      .from("exam_batch_exams")
      .select("id,session_id,title,window_end")
      .eq("id", data.examId)
      .maybeSingle();
    if (exErr) mapSupabaseError(exErr, "adminGetExamBatchLeaderboard:exam");
    if (!exam) throw errors.notFound("Exam");

    const { data: lb, error: lbErr } = await context.supabase
      .from("exam_batch_leaderboards")
      .select(LEADERBOARD_COLUMNS)
      .eq("exam_id", exam.id)
      .maybeSingle();
    if (lbErr) mapSupabaseError(lbErr, "adminGetExamBatchLeaderboard:lb");

    let entries: Array<
      ExamBatchLeaderboardEntryRow & { display_name: string | null; email: string | null }
    > = [];
    let total = 0;

    if (lb && (lb as ExamBatchLeaderboardRow).status === "frozen") {
      // Range query. Search uses `student_id::text ILIKE` via view-side filter;
      // for name/email search we do an in-memory refine after joining profiles.
      const query = context.supabase
        .from("exam_batch_leaderboard_entries")
        .select(LEADERBOARD_ENTRY_COLUMNS, { count: "exact" })
        .eq("exam_id", exam.id)
        .order("rank", { ascending: true })
        .range(data.offset, data.offset + data.limit - 1);
      const { data: rows, count, error: rowErr } = await query;
      if (rowErr) mapSupabaseError(rowErr, "adminGetExamBatchLeaderboard:entries");
      total = count ?? (rows?.length ?? 0);
      const raw = (rows ?? []) as ExamBatchLeaderboardEntryRow[];
      const userIds = Array.from(new Set(raw.map((r) => r.user_id)));
      const profileMap = new Map<string, { display_name: string | null; email: string | null }>();
      if (userIds.length > 0) {
        // Best-effort join. `profiles` only carries display_name; email lives
        // in auth.users which we can't reach from a user-scoped client, so
        // it stays null in the projected shape.
        const { data: profs, error: profsErr } = await context.supabase
          .from("profiles")
          .select("id,display_name")
          .in("id", userIds);
        if (profsErr) {
          console.warn("[exam-batch] leaderboard profile join failed", profsErr);
        }
        for (const p of (profs ?? []) as Array<{
          id: string;
          display_name: string | null;
        }>) {
          profileMap.set(p.id, { display_name: p.display_name, email: null });
        }
      }
      entries = raw.map((r) => ({
        ...r,
        display_name: profileMap.get(r.user_id)?.display_name ?? null,
        email: profileMap.get(r.user_id)?.email ?? null,
      }));

      if (data.search && data.search.trim()) {
        const q = data.search.trim().toLowerCase();
        entries = entries.filter(
          (e) =>
            String(e.student_id).includes(q) ||
            (e.display_name ?? "").toLowerCase().includes(q) ||
            (e.email ?? "").toLowerCase().includes(q),
        );
      }
    }

    await audit(context.supabase, context.userId, "history.view", "leaderboard", exam.id, {
      admin: true,
      offset: data.offset,
      limit: data.limit,
    });

    return {
      exam: {
        id: exam.id as string,
        title: exam.title as string,
        sessionId: exam.session_id as string,
        windowEnd: exam.window_end as string,
        frozenAt: (lb as ExamBatchLeaderboardRow | null)?.frozen_at ?? null,
        status: (lb as ExamBatchLeaderboardRow | null)?.status ?? "pending",
        entryCount: (lb as ExamBatchLeaderboardRow | null)?.entry_count ?? 0,
        version: (lb as ExamBatchLeaderboardRow | null)?.version ?? 0,
      },
      entries,
      total,
      offset: data.offset,
      limit: data.limit,
    };
  });

// ============================================================================
// adminListExamBatchLeaderboards — 45-day retention window
// ============================================================================

export const adminListExamBatchLeaderboards = createServerFn({ method: "POST" })
  .validator((i: { sessionId?: string; days?: number }) =>
    z
      .object({
        sessionId: z.string().uuid().optional(),
        days: z.number().int().min(1).max(365).default(ADMIN_HISTORY_DAYS),
      })
      .parse(i ?? {}),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ExamBatchLeaderboardRow[]> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.leaderboard.list",
    );
    const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
    let q = context.supabase
      .from("exam_batch_leaderboards")
      .select(LEADERBOARD_COLUMNS)
      .eq("status", "frozen")
      .gte("frozen_at", since)
      .order("frozen_at", { ascending: false });
    if (data.sessionId) q = q.eq("session_id", data.sessionId);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "adminListExamBatchLeaderboards");
    return (rows ?? []) as ExamBatchLeaderboardRow[];
  });

// ============================================================================
// adminGetExamBatchAnalytics — served from snapshot; rebuild on cache miss
// ============================================================================

function scopeKey(scope: { sessionId?: string; examId?: string }): string {
  if (scope.examId) return `exam:${scope.examId}`;
  if (scope.sessionId) return `session:${scope.sessionId}`;
  return "global";
}

// ============================================================================
// adminGetExamBatchAnalytics — served directly from source tables.
//
// ROOT CAUSE (fixed here): the SQL RPC `exam_batch_generate_analytics`
// persists a snapshot with the shape { scope, id, generated_at, totals: {…} },
// but every consumer types the response as `AnalyticsView` — which requires
// `overall`, `exams[]`, `subjects[]`, `approvalRate`, etc. Reading a cached
// snapshot therefore returned an object where `.overall`, `.exams` and
// `.subjects` were undefined, and the Analytics page crashed on
// `a.overall.trend.length` / `a.exams.length` etc. Bypassing the snapshot
// and computing the real `AnalyticsView` shape from the source tables fixes
// the crash without changing what is measured.
// ============================================================================

function isoDay(iso: string): string {
  // Truncate to yyyy-mm-dd for the daily trend grouping.
  return iso.slice(0, 10);
}

export const adminGetExamBatchAnalytics = createServerFn({ method: "POST" })
  .validator((i: unknown) => analyticsScopeInput.parse(i ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<AnalyticsView> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.analytics.view",
    );

    const sessionId = data.sessionId ?? null;
    const examId = data.examId ?? null;

    // ---- Exams in scope ----
    let examQ = context.supabase
      .from("exam_batch_exams")
      .select("id,title,session_id,subject_id,window_start,window_end");
    if (examId) examQ = examQ.eq("id", examId);
    else if (sessionId) examQ = examQ.eq("session_id", sessionId);
    const { data: exams, error: examErr } = await examQ;
    if (examErr) mapSupabaseError(examErr, "adminGetExamBatchAnalytics:exams");
    const examRows =
      (exams ?? []) as Array<{
        id: string;
        title: string;
        session_id: string;
        subject_id: string;
        window_start: string;
        window_end: string;
      }>;
    const examIds = examRows.map((e) => e.id);

    // ---- Enrollment totals (approval funnel) ----
    let enrollBase = context.supabase
      .from("exam_batch_enrollments")
      .select("status", { count: "exact", head: true });
    if (sessionId) enrollBase = enrollBase.eq("session_id", sessionId);
    const countEnrollments = async (status: "pending" | "approved" | null) => {
      let q = context.supabase
        .from("exam_batch_enrollments")
        .select("id", { count: "exact", head: true });
      if (sessionId) q = q.eq("session_id", sessionId);
      if (status) q = q.eq("status", status);
      const { count, error } = await q;
      if (error) mapSupabaseError(error, "adminGetExamBatchAnalytics:enrollCount");
      return Number(count ?? 0);
    };
    const [eligibleStudents, approvedStudents, pendingStudents] = await Promise.all([
      countEnrollments(null),
      countEnrollments("approved"),
      countEnrollments("pending"),
    ]);
    const approvalRate = eligibleStudents
      ? Math.round((approvedStudents / eligibleStudents) * 1000) / 10
      : 0;

    // ---- Attempts + Results for the exams in scope ----
    let attempts: Array<{ id: string; exam_id: string; status: string; submitted_at: string | null }> = [];
    let results: Array<{
      exam_id: string;
      percentage: number;
      marks: number;
      time_used_seconds: number;
      submitted_at: string | null;
    }> = [];
    if (examIds.length > 0) {
      const [aRes, rRes] = await Promise.all([
        context.supabase
          .from("exam_batch_attempts")
          .select("id,exam_id,status,submitted_at")
          .in("exam_id", examIds),
        context.supabase
          .from("exam_batch_attempt_results")
          .select("exam_id,percentage,marks,time_used_seconds,submitted_at")
          .in("exam_id", examIds),
      ]);
      if (aRes.error) mapSupabaseError(aRes.error, "adminGetExamBatchAnalytics:attempts");
      if (rRes.error) mapSupabaseError(rRes.error, "adminGetExamBatchAnalytics:results");
      attempts = (aRes.data ?? []) as typeof attempts;
      results = (rRes.data ?? []) as typeof results;
    }

    // ---- Per-exam aggregation ----
    const perExam = new Map<string, ExamAnalytics>();
    for (const exam of examRows) {
      const eResults = results.filter((r) => r.exam_id === exam.id);
      const eAttempts = attempts.filter((a) => a.exam_id === exam.id);
      const submitted = eAttempts.filter((a) =>
        ["submitted", "auto_submitted", "timed_out", "admin_closed"].includes(a.status),
      ).length;
      const pcts = eResults.map((r) => Number(r.percentage) || 0);
      const times = eResults.map((r) => Number(r.time_used_seconds) || 0);
      perExam.set(exam.id, {
        examId: exam.id,
        title: exam.title,
        windowStart: exam.window_start,
        windowEnd: exam.window_end,
        participation: eligibleStudents ? eAttempts.length / eligibleStudents : 0,
        completion: eAttempts.length ? submitted / eAttempts.length : 0,
        averagePercentage: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0,
        highestPercentage: pcts.length ? Math.max(...pcts) : 0,
        lowestPercentage: pcts.length ? Math.min(...pcts) : 0,
        averageTimeSeconds: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
        totalAttempts: eAttempts.length,
        totalSubmitted: submitted,
        eligibleStudents,
      });
    }
    const examsView = Array.from(perExam.values()).sort(
      (a, b) => b.totalAttempts - a.totalAttempts,
    );

    // ---- Per-subject aggregation ----
    const bySubject = new Map<
      string,
      { totalAttempts: number; percentages: number[]; examIds: Set<string> }
    >();
    for (const exam of examRows) {
      const bucket = bySubject.get(exam.subject_id) ?? {
        totalAttempts: 0,
        percentages: [],
        examIds: new Set<string>(),
      };
      const eAttempts = attempts.filter((a) => a.exam_id === exam.id);
      const eResults = results.filter((r) => r.exam_id === exam.id);
      bucket.totalAttempts += eAttempts.length;
      for (const r of eResults) bucket.percentages.push(Number(r.percentage) || 0);
      bucket.examIds.add(exam.id);
      bySubject.set(exam.subject_id, bucket);
    }
    const subjectsView: SubjectPerformance[] = Array.from(bySubject.entries())
      .map(([subjectId, b]) => ({
        subjectId,
        examCount: b.examIds.size,
        totalAttempts: b.totalAttempts,
        averagePercentage: b.percentages.length
          ? b.percentages.reduce((a, c) => a + c, 0) / b.percentages.length
          : 0,
        highestPercentage: b.percentages.length ? Math.max(...b.percentages) : 0,
      }))
      .sort((a, b) => b.totalAttempts - a.totalAttempts);

    // ---- Overall + trend ----
    const overallPcts = results.map((r) => Number(r.percentage) || 0);
    const submittedAttempts = attempts.filter((a) =>
      ["submitted", "auto_submitted", "timed_out", "admin_closed"].includes(a.status),
    ).length;
    const trendBucket = new Map<string, { total: number; sum: number }>();
    for (const r of results) {
      if (!r.submitted_at) continue;
      const day = isoDay(r.submitted_at);
      const b = trendBucket.get(day) ?? { total: 0, sum: 0 };
      b.total += 1;
      b.sum += Number(r.percentage) || 0;
      trendBucket.set(day, b);
    }
    const trend = Array.from(trendBucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, b]) => ({
        date,
        averagePercentage: b.total ? b.sum / b.total : 0,
        attempts: b.total,
      }));

    return {
      scope: { sessionId, examId },
      approvalRate,
      eligibleStudents,
      approvedStudents,
      pendingStudents,
      overall: {
        exams: examRows.length,
        attempts: attempts.length,
        submitted: submittedAttempts,
        averagePercentage: overallPcts.length
          ? overallPcts.reduce((a, b) => a + b, 0) / overallPcts.length
          : 0,
        trend,
      },
      exams: examsView,
      subjects: subjectsView,
      generatedAt: new Date().toISOString(),
    };
  });

// ============================================================================
// adminRecalculateExamBatch — manual leaderboard / analytics / progress rebuild
// ============================================================================

export const adminRecalculateExamBatch = createServerFn({ method: "POST" })
  .validator((i: unknown) => recalcInput.parse(i ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ data, context }): Promise<{
      leaderboard: boolean;
      analytics: boolean;
      progress: boolean;
    }> => {
      await assertPermission(
        context.supabase,
        context.userId,
        "manage_content",
        "exam_batch.recalculate",
      );

      let leaderboard = false;
      let analytics = false;
      let progress = false;

      const doLeaderboard = data.scope === "all" || data.scope === "leaderboard";
      const doAnalytics = data.scope === "all" || data.scope === "analytics";
      const doProgress = data.scope === "all" || data.scope === "progress";

      // Leaderboard: force-freeze the requested exam, or every ended exam in the session.
      if (doLeaderboard) {
        const examIds: string[] = [];
        if (data.examId) {
          examIds.push(data.examId);
        } else if (data.sessionId) {
          const { data: exams, error } = await context.supabase
            .from("exam_batch_exams")
            .select("id,window_end")
            .eq("session_id", data.sessionId);
          if (error) mapSupabaseError(error, "adminRecalculate:exams");
          const now = Date.now();
          for (const e of (exams ?? []) as Array<{ id: string; window_end: string }>) {
            if (now >= new Date(e.window_end).getTime()) examIds.push(e.id);
          }
        }
        for (const id of examIds) {
          const { error } = await context.supabase.rpc("exam_batch_generate_leaderboard", {
            _exam_id: id,
            _force: true,
          });
          if (error) mapSupabaseError(error, "adminRecalculate:leaderboard");
          await audit(context.supabase, context.userId, "leaderboard.recalculate", "leaderboard", id, {
            forced: true,
          });
        }
        leaderboard = examIds.length > 0;
      }

      // Analytics: rebuild the snapshot for the requested scope.
      if (doAnalytics) {
        const key = scopeKey({ sessionId: data.sessionId, examId: data.examId });
        const { error } = await context.supabase.rpc("exam_batch_generate_analytics", {
          _scope_key: key,
        });
        if (error) mapSupabaseError(error, "adminRecalculate:analytics");
        await audit(context.supabase, context.userId, "analytics.generate", "analytics", key, {
          forced: true,
        });
        analytics = true;
      }

      // Progress: rebuild summaries for every approved enrollee in the scope.
      if (doProgress) {
        let q = context.supabase
          .from("exam_batch_enrollments")
          .select("user_id")
          .eq("status", "approved");
        if (data.sessionId) q = q.eq("session_id", data.sessionId);
        const { data: rows, error } = await q;
        if (error) mapSupabaseError(error, "adminRecalculate:enrollments");
        const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id as string)));
        // Batch to avoid unbounded work per request; cap at 500 users per call.
        const batch = userIds.slice(0, 500);
        await Promise.all(
          batch.map(async (uid) => {
            const { error: rpcErr } = await context.supabase.rpc(
              "exam_batch_recompute_progress",
              { _user_id: uid },
            );
            if (rpcErr) {
              console.error("[exam-batch] progress recompute failed", { uid, message: rpcErr.message });
            }
          }),
        );
        await audit(
          context.supabase,
          context.userId,
          "progress.update",
          "progress",
          data.sessionId ?? data.examId ?? "global",
          { count: batch.length, forced: true },
        );
        progress = batch.length > 0;
      }

      return { leaderboard, analytics, progress };
    },
  );

// ============================================================================
// adminDeleteExamBatchLeaderboard — remove a single leaderboard + entries
// (entries cascade via FK ON DELETE CASCADE). Attempts / results / exams /
// sessions / subjects are NOT touched.
// ============================================================================

export const adminDeleteExamBatchLeaderboard = createServerFn({ method: "POST" })
  .validator((i: unknown) => z.object({ examId: z.string().uuid() }).parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.leaderboard.delete",
    );

    const { data: existing, error: getErr } = await context.supabase
      .from("exam_batch_leaderboards")
      .select("exam_id,session_id,entry_count,version,status")
      .eq("exam_id", data.examId)
      .maybeSingle();
    if (getErr) mapSupabaseError(getErr, "adminDeleteExamBatchLeaderboard:get");
    if (!existing) throw errors.notFound("Leaderboard");

    const { error: delErr } = await context.supabase
      .from("exam_batch_leaderboards")
      .delete()
      .eq("exam_id", data.examId);
    if (delErr) mapSupabaseError(delErr, "adminDeleteExamBatchLeaderboard");

    await audit(
      context.supabase,
      context.userId,
      "leaderboard.delete",
      "leaderboard",
      data.examId,
      {
        sessionId: (existing as any).session_id,
        entryCount: (existing as any).entry_count,
        version: (existing as any).version,
        status: (existing as any).status,
      },
    );

    return { ok: true as const, examId: data.examId };
  });
