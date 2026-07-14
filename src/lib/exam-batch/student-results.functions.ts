// @ts-nocheck
// Student-facing Result / Leaderboard / Progress / History surface for
// Exam Batch. Every request revalidates ownership server-side; nothing here
// trusts the client to identify which student is asking. Rank and position
// are gated behind the exam window ending (server time only).
//
// Caching contract:
//   - Result scoring is materialised in `exam_batch_attempt_results` via the
//     idempotent `exam_batch_score_attempt` RPC. Repeat reads never rescore.
//   - Leaderboard is served from `exam_batch_leaderboard_entries` (frozen).
//     First read after the exam window ends triggers a one-shot freeze via
//     the idempotent `exam_batch_generate_leaderboard` RPC.
//   - Progress is served from `exam_batch_progress_summaries`. Cache miss
//     falls back to the recompute RPC; hits are returned as-is.
//
// Nothing in this file writes to student-owned rows directly — every mutation
// goes through the atomic RPCs documented in `results.README.md`.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { audit } from "./audit";
import { errors, mapSupabaseError } from "./errors";
import {
  attemptIdInput,
  examIdInput,
  historyInput,
  progressWindowInput,
  type AdminLeaderboardView,
  type ExamBatchAttemptResultRow,
  type ExamBatchLeaderboardEntryRow,
  type ExamBatchLeaderboardRow,
  type ProgressSummary,
  type ResultVisibility,
  type StudentHistoryItem,
  type StudentLeaderboardView,
} from "./results.types";

const STUDENT_LEADERBOARD_TOP = 20;
const STUDENT_VISIBILITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days from publish (frozen_at)

const RESULT_COLUMNS =
  "attempt_id,exam_id,user_id,student_id,correct,wrong,skipped,total_questions,marks,max_marks,percentage,time_used_seconds,duration_seconds,submitted_at,scored_at";

const LEADERBOARD_COLUMNS =
  "exam_id,session_id,status,generated_at,frozen_at,entry_count,version";

const LEADERBOARD_ENTRY_COLUMNS =
  "exam_id,attempt_id,user_id,student_id,rank,marks,max_marks,percentage,correct,wrong,skipped,time_used_seconds,submitted_at";

// ============================================================================
// Ownership guards — every function asserts server-side
// ============================================================================

async function loadOwnAttempt(supabase: any, userId: string, attemptId: string) {
  const { data, error } = await supabase
    .from("exam_batch_attempts")
    .select("id,exam_id,user_id,status,started_at,expected_finish_at,submitted_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "loadOwnAttempt");
  if (!data) throw errors.notFound("Attempt");
  if (data.user_id !== userId) throw errors.forbidden("This attempt does not belong to you.");
  return data as {
    id: string;
    exam_id: string;
    user_id: string;
    status: string;
    started_at: string;
    expected_finish_at: string;
    submitted_at: string | null;
  };
}

async function loadExamMeta(supabase: any, examId: string) {
  const { data, error } = await supabase
    .from("exam_batch_exams")
    .select("id,session_id,title,subject_id,window_start,window_end,duration_minutes,force_closed_at")
    .eq("id", examId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "loadExamMeta");
  if (!data) throw errors.notFound("Exam");
  return data as {
    id: string;
    session_id: string;
    title: string;
    subject_id: string;
    window_start: string;
    window_end: string;
    duration_minutes: number;
    force_closed_at: string | null;
  };
}

async function assertEnrolledInExam(
  supabase: any,
  userId: string,
  exam: { id: string; session_id: string; subject_id: string },
) {
  const { data: enrollment, error } = await supabase
    .from("exam_batch_enrollments")
    .select("id,status,student_id")
    .eq("session_id", exam.session_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "assertEnrolledInExam:enrollment");
  if (!enrollment || enrollment.status !== "approved" || typeof enrollment.student_id !== "number") {
    throw errors.forbidden("Your enrollment is not approved for this session.");
  }
  const { data: subj, error: subjErr } = await supabase
    .from("exam_batch_enrollment_subjects")
    .select("subject_id")
    .eq("enrollment_id", enrollment.id)
    .eq("subject_id", exam.subject_id)
    .maybeSingle();
  if (subjErr) mapSupabaseError(subjErr, "assertEnrolledInExam:subject");
  if (!subj) throw errors.forbidden("You are not enrolled in this exam's subject.");
  return { enrollmentId: enrollment.id as string, studentId: enrollment.student_id as number };
}

// ============================================================================
// getExamBatchAttemptResult — student's own result (marks/correct/wrong/…)
// ============================================================================

export const getExamBatchAttemptResult = createServerFn({ method: "POST" })
  .validator((i: unknown) => attemptIdInput.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ResultVisibility> => {
    const attempt = await loadOwnAttempt(context.supabase, context.userId, data.attemptId);
    if (attempt.status === "in_progress") {
      throw errors.invalidState("This attempt has not been submitted yet.");
    }

    // Idempotent score — first call materialises the row; later calls no-op.
    let result: ExamBatchAttemptResultRow | null = null;
    {
      const { data: existing, error } = await context.supabase
        .from("exam_batch_attempt_results")
        .select(RESULT_COLUMNS)
        .eq("attempt_id", attempt.id)
        .maybeSingle();
      if (error) mapSupabaseError(error, "getExamBatchAttemptResult:load");
      result = existing as ExamBatchAttemptResultRow | null;
    }
    if (!result) {
      const { data: rpc, error } = await context.supabase.rpc("exam_batch_score_attempt", {
        _attempt_id: attempt.id,
      });
      if (error) mapSupabaseError(error, "getExamBatchAttemptResult:score");
      const row = Array.isArray(rpc) ? rpc[0] : rpc;
      if (!row) throw errors.invalidState("Could not compute the result for this attempt.");
      result = row as ExamBatchAttemptResultRow;
    }

    const exam = await loadExamMeta(context.supabase, result.exam_id);

    // Rank/position becomes visible once the exam window closes — either
    // naturally at `window_end` or immediately after an admin force-close.
    let rankVisible = false;
    let rank: number | null = null;
    let entryCount: number | null = null;
    const now = Date.now();
    const windowEnded =
      now >= new Date(exam.window_end).getTime() || !!exam.force_closed_at;
    if (windowEnded) {
      // Trigger an idempotent freeze so the first viewer after the window
      // ends immediately gets an authoritative ranking, not a null rank.
      await ensureFrozen(context.supabase, context.userId, exam.id, {
        forceClosedAt: exam.force_closed_at,
        windowEnd: exam.window_end,
      });
      const { data: entry, error: entryErr } = await context.supabase
        .from("exam_batch_leaderboard_entries")
        .select("rank")
        .eq("exam_id", exam.id)
        .eq("attempt_id", attempt.id)
        .maybeSingle();
      if (entryErr) mapSupabaseError(entryErr, "getExamBatchAttemptResult:rank");
      if (entry) {
        rankVisible = true;
        rank = entry.rank as number;
        const { data: lb, error: lbErr } = await context.supabase
          .from("exam_batch_leaderboards")
          .select("entry_count")
          .eq("exam_id", exam.id)
          .maybeSingle();
        if (lbErr) mapSupabaseError(lbErr, "getExamBatchAttemptResult:lb");
        entryCount = (lb?.entry_count as number | undefined) ?? null;
      }
    }

    return {
      marks: Number(result.marks),
      maxMarks: Number(result.max_marks),
      correct: result.correct,
      wrong: result.wrong,
      skipped: result.skipped,
      totalQuestions: result.total_questions,
      percentage: Number(result.percentage),
      timeUsedSeconds: result.time_used_seconds,
      durationSeconds: result.duration_seconds,
      submittedAt: result.submitted_at,
      rankVisible,
      rank,
      entryCount,
    };
  });

// ============================================================================
// getExamBatchStudentLeaderboard — top 20 + own position, 24h visibility
// ============================================================================

async function ensureFrozen(
  supabase: any,
  userId: string,
  examId: string,
  opts: { forceClosedAt: string | null; windowEnd: string },
): Promise<ExamBatchLeaderboardRow | null> {
  const { data: lb, error } = await supabase
    .from("exam_batch_leaderboards")
    .select(LEADERBOARD_COLUMNS)
    .eq("exam_id", examId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "ensureFrozen:load");
  if (lb && lb.status === "frozen") return lb as ExamBatchLeaderboardRow;

  // Force=true when the admin has already force-closed the exam, so the
  // freeze bypasses the "window not yet ended" refusal inside the RPC.
  const shouldForce =
    !!opts.forceClosedAt || Date.now() >= new Date(opts.windowEnd).getTime();
  const { data: rpc, error: rpcErr } = await supabase.rpc(
    "exam_batch_generate_leaderboard",
    { _exam_id: examId, _force: shouldForce },
  );
  if (rpcErr) mapSupabaseError(rpcErr, "ensureFrozen:rpc");
  const row = Array.isArray(rpc) ? rpc[0] : rpc;
  if (row) {
    await audit(supabase, userId, "leaderboard.publish", "leaderboard", examId, {
      version: (row as any).version,
      trigger: opts.forceClosedAt ? "force_close_read" : "window_end_read",
    });
    return row as ExamBatchLeaderboardRow;
  }
  return lb ?? null;
}

export const getExamBatchStudentLeaderboard = createServerFn({ method: "POST" })
  .validator((i: unknown) => examIdInput.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<StudentLeaderboardView> => {
    const exam = await loadExamMeta(context.supabase, data.examId);
    const guard = await assertEnrolledInExam(context.supabase, context.userId, exam);

    const now = Date.now();
    const windowEnd = new Date(exam.window_end).getTime();
    const windowEnded = now >= windowEnd || !!exam.force_closed_at;

    let lb: ExamBatchLeaderboardRow | null = null;
    if (windowEnded) {
      lb = await ensureFrozen(context.supabase, context.userId, exam.id, {
        forceClosedAt: exam.force_closed_at,
        windowEnd: exam.window_end,
      });
    } else {
      const { data: raw, error } = await context.supabase
        .from("exam_batch_leaderboards")
        .select(LEADERBOARD_COLUMNS)
        .eq("exam_id", exam.id)
        .maybeSingle();
      if (error) mapSupabaseError(error, "getExamBatchStudentLeaderboard:lb");
      lb = raw as ExamBatchLeaderboardRow | null;
    }

    const frozenAt = lb?.frozen_at ?? null;
    const visibleUntil = frozenAt
      ? new Date(new Date(frozenAt).getTime() + STUDENT_VISIBILITY_MS).toISOString()
      : null;
    const isVisibleToStudent =
      lb?.status === "frozen" &&
      !!frozenAt &&
      now <= new Date(frozenAt).getTime() + STUDENT_VISIBILITY_MS;

    if (!isVisibleToStudent) {
      await audit(context.supabase, context.userId, "history.view", "leaderboard", exam.id, {
        gated: true,
        reason: lb ? "outside_visibility_window" : "window_not_ended",
      });
      return {
        exam: {
          id: exam.id,
          title: exam.title,
          windowEnd: exam.window_end,
          frozenAt,
          status: lb?.status ?? "pending",
          visibleUntil,
          isVisibleToStudent: false,
          entryCount: lb?.entry_count ?? 0,
        },
        top: [],
        self: null,
      };
    }

    const { data: topRows, error: topErr } = await context.supabase
      .from("exam_batch_leaderboard_entries")
      .select(LEADERBOARD_ENTRY_COLUMNS)
      .eq("exam_id", exam.id)
      .order("rank", { ascending: true })
      .limit(STUDENT_LEADERBOARD_TOP);
    if (topErr) mapSupabaseError(topErr, "getExamBatchStudentLeaderboard:top");

    const { data: selfRow, error: selfErr } = await context.supabase
      .from("exam_batch_leaderboard_entries")
      .select(LEADERBOARD_ENTRY_COLUMNS)
      .eq("exam_id", exam.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (selfErr) mapSupabaseError(selfErr, "getExamBatchStudentLeaderboard:self");

    const top = (topRows ?? []).map((r: ExamBatchLeaderboardEntryRow) => ({
      rank: r.rank,
      studentId: r.student_id,
      marks: Number(r.marks),
      maxMarks: Number(r.max_marks),
      percentage: Number(r.percentage),
      correct: r.correct,
      wrong: r.wrong,
      skipped: r.skipped,
      timeUsedSeconds: r.time_used_seconds,
      isSelf: r.student_id === guard.studentId,
    }));

    const self = selfRow
      ? {
          rank: (selfRow as ExamBatchLeaderboardEntryRow).rank,
          studentId: (selfRow as ExamBatchLeaderboardEntryRow).student_id,
          marks: Number((selfRow as ExamBatchLeaderboardEntryRow).marks),
          maxMarks: Number((selfRow as ExamBatchLeaderboardEntryRow).max_marks),
          percentage: Number((selfRow as ExamBatchLeaderboardEntryRow).percentage),
          correct: (selfRow as ExamBatchLeaderboardEntryRow).correct,
          wrong: (selfRow as ExamBatchLeaderboardEntryRow).wrong,
          skipped: (selfRow as ExamBatchLeaderboardEntryRow).skipped,
          timeUsedSeconds: (selfRow as ExamBatchLeaderboardEntryRow).time_used_seconds,
        }
      : null;

    await audit(context.supabase, context.userId, "history.view", "leaderboard", exam.id, {
      selfRank: self?.rank ?? null,
    });

    return {
      exam: {
        id: exam.id,
        title: exam.title,
        windowEnd: exam.window_end,
        frozenAt,
        status: lb?.status ?? "frozen",
        visibleUntil,
        isVisibleToStudent: true,
        entryCount: lb?.entry_count ?? top.length,
      },
      top,
      self,
    };
  });

// ============================================================================
// getExamBatchStudentHistory — enrolled-subjects only, paginated
// ============================================================================

export const getExamBatchStudentHistory = createServerFn({ method: "POST" })
  .validator((i: unknown) => historyInput.parse(i ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ data, context }): Promise<{ items: StudentHistoryItem[]; total: number }> => {
      // 1. Approved enrollments for this student, optionally filtered to a session.
      let enrQuery = context.supabase
        .from("exam_batch_enrollments")
        .select("id,session_id,student_id,status")
        .eq("user_id", context.userId)
        .eq("status", "approved");
      if (data.sessionId) enrQuery = enrQuery.eq("session_id", data.sessionId);
      const { data: enrollments, error: enrErr } = await enrQuery;
      if (enrErr) mapSupabaseError(enrErr, "history:enrollments");
      const rows = (enrollments ?? []) as Array<{ id: string; session_id: string }>;
      if (rows.length === 0) return { items: [], total: 0 };

      const enrollmentIds = rows.map((r) => r.id);
      const sessionIds = Array.from(new Set(rows.map((r) => r.session_id)));

      // 2. Subjects the student is enrolled in (per enrollment).
      const { data: subjRows, error: subjErr } = await context.supabase
        .from("exam_batch_enrollment_subjects")
        .select("enrollment_id,subject_id")
        .in("enrollment_id", enrollmentIds);
      if (subjErr) mapSupabaseError(subjErr, "history:subjects");
      const subjectIds = Array.from(
        new Set((subjRows ?? []).map((r: any) => r.subject_id as string)),
      );
      const filteredSubjectIds = data.subjectId
        ? subjectIds.filter((s) => s === data.subjectId)
        : subjectIds;
      if (filteredSubjectIds.length === 0) return { items: [], total: 0 };

      // 3. Exams for those (session, subject) pairs, ordered by window_start desc.
      let examQuery = context.supabase
        .from("exam_batch_exams")
        .select(
          "id,session_id,title,subject_id,level,window_start,window_end,duration_minutes,is_published,is_hidden,is_archived,status",
        )
        .in("session_id", sessionIds)
        .in("subject_id", filteredSubjectIds)
        .eq("is_published", true)
        .eq("is_hidden", false)
        .eq("is_archived", false)
        .eq("status", "active")
        .order("window_start", { ascending: false });
      if (data.examId) examQuery = examQuery.eq("id", data.examId);
      if (data.chapterId) examQuery = examQuery.eq("chapter_id", data.chapterId);

      const { data: examRows, error: examErr } = await examQuery;
      if (examErr) mapSupabaseError(examErr, "history:exams");
      const allExams = (examRows ?? []) as Array<{
        id: string;
        session_id: string;
        title: string;
        subject_id: string;
        level: string | null;
        window_start: string;
        window_end: string;
        duration_minutes: number;
      }>;
      const total = allExams.length;
      const page = allExams.slice(data.offset, data.offset + data.limit);
      if (page.length === 0) return { items: [], total };

      const pageExamIds = page.map((e) => e.id);

      // 3b. Enrich with subject names + session titles.
      const pageSubjectIds = Array.from(new Set(page.map((e) => e.subject_id)));
      const pageSessionIds = Array.from(new Set(page.map((e) => e.session_id)));
      const [{ data: subjMetaRows }, { data: sessMetaRows }] = await Promise.all([
        context.supabase
          .from("exam_batch_subjects")
          .select("id,name")
          .in("id", pageSubjectIds),
        context.supabase
          .from("exam_batch_sessions")
          .select("id,title")
          .in("id", pageSessionIds),
      ]);
      const subjNameById = new Map<string, string>();
      for (const s of (subjMetaRows ?? []) as Array<{ id: string; name: string }>) {
        subjNameById.set(s.id, s.name);
      }
      const sessionTitleById = new Map<string, string>();
      for (const s of (sessMetaRows ?? []) as Array<{ id: string; title: string }>) {
        sessionTitleById.set(s.id, s.title);
      }


      // 4. Attempts (own) + results in one round trip each.
      const { data: attemptRows, error: attErr } = await context.supabase
        .from("exam_batch_attempts")
        .select("id,exam_id,status,started_at,submitted_at")
        .eq("user_id", context.userId)
        .in("exam_id", pageExamIds);
      if (attErr) mapSupabaseError(attErr, "history:attempts");
      const attemptsByExam = new Map<string, { id: string; status: string }>();
      for (const a of (attemptRows ?? []) as Array<{ id: string; exam_id: string; status: string }>) {
        attemptsByExam.set(a.exam_id, { id: a.id, status: a.status });
      }
      const attemptIds = Array.from(attemptsByExam.values()).map((a) => a.id);

      let resultsByAttempt = new Map<string, ExamBatchAttemptResultRow>();
      if (attemptIds.length > 0) {
        const { data: resRows, error: resErr } = await context.supabase
          .from("exam_batch_attempt_results")
          .select(RESULT_COLUMNS)
          .in("attempt_id", attemptIds);
        if (resErr) mapSupabaseError(resErr, "history:results");
        for (const r of (resRows ?? []) as ExamBatchAttemptResultRow[]) {
          resultsByAttempt.set(r.attempt_id, r);
        }
      }

      // 5. For exams whose window ended, load leaderboard entries (own) in one query.
      const now = Date.now();
      const endedExamIds = page
        .filter((e) => now >= new Date(e.window_end).getTime())
        .map((e) => e.id);
      const rankByExam = new Map<string, { rank: number; entryCount: number }>();
      if (endedExamIds.length > 0) {
        const { data: entRows, error: entErr } = await context.supabase
          .from("exam_batch_leaderboard_entries")
          .select("exam_id,rank")
          .in("exam_id", endedExamIds)
          .eq("user_id", context.userId);
        if (entErr) mapSupabaseError(entErr, "history:entries");
        const { data: lbRows, error: lbErr } = await context.supabase
          .from("exam_batch_leaderboards")
          .select("exam_id,entry_count,frozen_at,status")
          .in("exam_id", endedExamIds);
        if (lbErr) mapSupabaseError(lbErr, "history:lb");
        const counts = new Map<string, number>();
        const visibleExamIds = new Set<string>();
        const nowMs = Date.now();
        for (const l of (lbRows ?? []) as Array<{ exam_id: string; entry_count: number; frozen_at: string | null; status: string }>) {
          counts.set(l.exam_id, l.entry_count);
          // 7-day retention: rank/leaderboard row disappears from history
          // exactly 7 days after the frozen_at (publish) timestamp.
          if (
            l.status === "frozen" &&
            l.frozen_at &&
            nowMs <= new Date(l.frozen_at).getTime() + STUDENT_VISIBILITY_MS
          ) {
            visibleExamIds.add(l.exam_id);
          }
        }
        for (const e of (entRows ?? []) as Array<{ exam_id: string; rank: number }>) {
          if (!visibleExamIds.has(e.exam_id)) continue;
          rankByExam.set(e.exam_id, { rank: e.rank, entryCount: counts.get(e.exam_id) ?? 0 });
        }
      }

      const items: StudentHistoryItem[] = page.map((exam) => {
        const attempt = attemptsByExam.get(exam.id);
        const result = attempt ? resultsByAttempt.get(attempt.id) : undefined;
        const ended = now >= new Date(exam.window_end).getTime();
        const rankInfo = ended ? rankByExam.get(exam.id) : undefined;

        let resultView: ResultVisibility | null = null;
        if (result) {
          resultView = {
            marks: Number(result.marks),
            maxMarks: Number(result.max_marks),
            correct: result.correct,
            wrong: result.wrong,
            skipped: result.skipped,
            totalQuestions: result.total_questions,
            percentage: Number(result.percentage),
            timeUsedSeconds: result.time_used_seconds,
            durationSeconds: result.duration_seconds,
            submittedAt: result.submitted_at,
            rankVisible: !!rankInfo,
            rank: rankInfo?.rank ?? null,
            entryCount: rankInfo?.entryCount ?? null,
          };
        }

        let status: StudentHistoryItem["status"] = "missed";
        if (attempt) {
          status = attempt.status === "in_progress" ? "in_progress" : "attended";
        }

        return {
          attemptId: attempt?.id ?? null,
          examId: exam.id,
          sessionId: exam.session_id,
          title: exam.title,
          subjectId: exam.subject_id,
          subjectName: subjNameById.get(exam.subject_id) ?? null,
          sessionTitle: sessionTitleById.get(exam.session_id) ?? null,
          level: exam.level ?? null,
          durationMinutes: exam.duration_minutes,
          windowStart: exam.window_start,
          windowEnd: exam.window_end,
          status,
          result: resultView,
        };
      });

      return { items, total };
    },
  );

// ============================================================================
// getExamBatchStudentProgress — cached summary; on-demand recompute fallback
// ============================================================================

function emptySummary(window: "daily" | "weekly" | "30d"): ProgressSummary {
  return {
    window,
    examsScheduled: 0,
    examsAttended: 0,
    attendanceRate: 0,
    completionRate: 0,
    averageMarks: 0,
    averagePercentage: 0,
    highestPercentage: 0,
    lowestPercentage: 0,
    accuracy: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalSkipped: 0,
    totalAttempted: 0,
    timeSpentSeconds: 0,
    bestRank: null,
    trend: [],
    updatedAt: new Date(0).toISOString(),
  };
}

function toSummary(row: any): Omit<ProgressSummary, "timeSpentSeconds" | "bestRank" | "trend" | "totalAttempted"> {
  const scheduled = Number(row.exams_scheduled ?? 0);
  const attended = Number(row.exams_attended ?? 0);
  const submitted = Number(row.exams_submitted ?? 0);
  const correct = Number(row.total_correct ?? 0);
  const wrong = Number(row.total_wrong ?? 0);
  const skipped = Number(row.total_skipped ?? 0);
  const answered = correct + wrong;
  return {
    window: row.time_window as ProgressSummary["window"],
    examsScheduled: scheduled,
    examsAttended: attended,
    attendanceRate: scheduled === 0 ? 0 : Math.round((attended / scheduled) * 10000) / 100,
    completionRate: attended === 0 ? 0 : Math.round((submitted / attended) * 10000) / 100,
    averageMarks: Number(row.avg_marks ?? 0),
    averagePercentage: Number(row.avg_percentage ?? 0),
    highestPercentage: Number(row.highest_percentage ?? 0),
    lowestPercentage: Number(row.lowest_percentage ?? 0),
    accuracy: answered === 0 ? 0 : Math.round((correct / answered) * 10000) / 100,
    totalCorrect: correct,
    totalWrong: wrong,
    totalSkipped: skipped,
    updatedAt: (row.updated_at as string) ?? new Date().toISOString(),
  };
}

// Server-side computation of Time Spent, Best Rank, Total Attempted and Trend
// straight from result + leaderboard tables. Keeps Progress Center consistent
// with Result Page and Leaderboard (same source of truth: exam_batch_attempt_results
// + exam_batch_leaderboard_entries).
async function loadExtras(
  supabase: any,
  userId: string,
  window: "daily" | "weekly" | "30d",
): Promise<{
  timeSpentSeconds: number;
  bestRank: number | null;
  totalAttempted: number;
  totalConfiguredQuestions: number;
  trend: Array<{ submittedAt: string; percentage: number }>;
}> {
  const days = window === "daily" ? 1 : window === "weekly" ? 7 : 30;
  const from = new Date(Date.now() - days * 24 * 3600e3).toISOString();

  const { data: rows } = await supabase
    .from("exam_batch_attempt_results")
    .select("time_used_seconds,correct,wrong,total_questions,percentage,submitted_at")
    .eq("user_id", userId)
    .gte("scored_at", from)
    .order("submitted_at", { ascending: false })
    .limit(500);
  const list = (rows ?? []) as Array<{
    time_used_seconds: number;
    correct: number;
    wrong: number;
    total_questions: number;
    percentage: number;
    submitted_at: string;
  }>;

  const timeSpentSeconds = list.reduce((a, r) => a + (r.time_used_seconds ?? 0), 0);
  const totalAttempted = list.reduce((a, r) => a + (r.correct ?? 0) + (r.wrong ?? 0), 0);
  const totalConfiguredQuestions = list.reduce((a, r) => a + (r.total_questions ?? 0), 0);
  const trend = list
    .slice(0, 12)
    .reverse()
    .map((r) => ({ submittedAt: r.submitted_at, percentage: Number(r.percentage) }));

  const { data: ranks } = await supabase
    .from("exam_batch_leaderboard_entries")
    .select("rank,submitted_at")
    .eq("user_id", userId)
    .gte("submitted_at", from)
    .order("rank", { ascending: true })
    .limit(1);
  const bestRank =
    ranks && ranks.length > 0 ? Number((ranks[0] as any).rank) : null;

  return { timeSpentSeconds, bestRank, totalAttempted, totalConfiguredQuestions, trend };
}

export const getExamBatchStudentProgress = createServerFn({ method: "POST" })
  .validator((i: unknown) => progressWindowInput.parse(i ?? {}))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ProgressSummary> => {
    const { data: cached, error } = await context.supabase
      .from("exam_batch_progress_summaries")
      .select(
        "user_id,time_window,exams_scheduled,exams_attended,exams_submitted,avg_marks,avg_percentage,highest_percentage,lowest_percentage,total_correct,total_wrong,total_skipped,updated_at",
      )
      .eq("user_id", context.userId)
      .eq("time_window", data.window)
      .maybeSingle();
    if (error) mapSupabaseError(error, "getExamBatchStudentProgress:load");

    let base = cached ? toSummary(cached) : null;

    if (!base) {
      try {
        await context.supabase.rpc("exam_batch_recompute_progress", { _user_id: context.userId });
        await audit(context.supabase, context.userId, "progress.update", "progress", context.userId, {
          window: data.window,
          trigger: "cache_miss",
        });
      } catch (err) {
        console.error("[exam-batch] progress recompute (student fallback) failed", err);
      }
      const { data: refreshed } = await context.supabase
        .from("exam_batch_progress_summaries")
        .select(
          "user_id,time_window,exams_scheduled,exams_attended,exams_submitted,avg_marks,avg_percentage,highest_percentage,lowest_percentage,total_correct,total_wrong,total_skipped,updated_at",
        )
        .eq("user_id", context.userId)
        .eq("time_window", data.window)
        .maybeSingle();
      base = refreshed ? toSummary(refreshed) : null;
    }

    const extras = await loadExtras(context.supabase, context.userId, data.window);

    // Completion% = completed questions ÷ total exam questions (aggregate
    // across the window). Answered = correct + wrong. Uses the same source
    // (exam_batch_attempt_results) as the Result Page and Leaderboard so
    // values stay consistent.
    const answered = extras.totalAttempted;
    const configured = extras.totalConfiguredQuestions;
    const completionRate =
      configured > 0 ? Math.round((answered / configured) * 10000) / 100 : 0;

    if (!base) {
      return { ...emptySummary(data.window), ...extras, completionRate };
    }
    return { ...base, ...extras, completionRate };
  });

// Re-export types so consumers can `import { ResultVisibility } from ".../index"`.
export type {
  AdminLeaderboardView,
  ExamBatchLeaderboardEntryRow,
  ExamBatchLeaderboardRow,
  ProgressSummary,
  ResultVisibility,
  StudentHistoryItem,
  StudentLeaderboardView,
};