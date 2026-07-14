// @ts-nocheck
// Student-facing Exam Engine.
// Every request revalidates: student is signed in, approved, enrolled in the
// exam's session, and enrolled in the exam's subject. Every timing decision
// uses **server time only** — the request's `Date.now()`, never a client value.
//
// Race safety: attempt creation and every submit path go through the atomic
// RPCs documented in `exam-engine.README.md`. Client autosaves, refreshes,
// and duplicate manual/auto submits all converge on a single canonical row.

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
  answerSaveSchema,
  attemptIdOnly,
  attemptStartSchema,
  attemptStateSchema,
  type AttemptStateView,
  type ExamAvailability,
  type ExamBatchAttemptRow,
  type ExamBatchExamRow,
  type ExamPublicMeta,
} from "./exam-engine.types";

// ============================================================================
// Shared internal helpers
// ============================================================================

type EnrollmentGuard = {
  enrollmentId: string;
  studentId: number;
};

/**
 * Assert the calling user is approved, has a Student ID, is enrolled in the
 * exam's session AND has that exam's subject. Throws typed errors otherwise.
 * Returns the caller's enrollment id + student id for downstream logging.
 */
async function assertStudentCanAccessExam(
  supabase: any,
  userId: string,
  exam: Pick<ExamBatchExamRow, "id" | "session_id" | "subject_id">,
): Promise<EnrollmentGuard> {
  const { data: enrollment, error: enrErr } = await supabase
    .from("exam_batch_enrollments")
    .select("id,status,student_id")
    .eq("session_id", exam.session_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (enrErr) mapSupabaseError(enrErr, "assertStudentCanAccessExam:load-enrollment");
  if (!enrollment) throw errors.forbidden("You are not enrolled in this exam's session.");
  if (enrollment.status !== "approved" || typeof enrollment.student_id !== "number") {
    throw errors.forbidden("Your enrollment must be approved before you can take this exam.");
  }

  const { data: subj, error: subjErr } = await supabase
    .from("exam_batch_enrollment_subjects")
    .select("subject_id")
    .eq("enrollment_id", enrollment.id)
    .eq("subject_id", exam.subject_id)
    .maybeSingle();
  if (subjErr) mapSupabaseError(subjErr, "assertStudentCanAccessExam:load-subject");
  if (!subj) throw errors.forbidden("You are not enrolled in this exam's subject.");

  return { enrollmentId: enrollment.id, studentId: enrollment.student_id };
}

/**
 * Compute exam availability from server time only.
 * Pure — never reads `Date.now()` twice or trusts client input.
 */
function computeAvailability(exam: ExamBatchExamRow, now: number): ExamAvailability {
  if (exam.force_closed_at) return "closed";
  const start = new Date(exam.window_start).getTime();
  const end = new Date(exam.window_end).getTime();
  const availableFrom = start - exam.available_before_minutes * 60_000;
  const upcomingFrom = start - exam.upcoming_before_minutes * 60_000;

  if (now > end) return "ended";
  if (now >= start) return "live";
  if (now >= availableFrom) return "available";
  if (now >= upcomingFrom) return "announced";
  return "upcoming";
}

function toPublicMeta(exam: ExamBatchExamRow, now: number): ExamPublicMeta {
  return {
    id: exam.id,
    sessionId: exam.session_id,
    title: exam.title,
    subtitle: exam.subtitle,
    level: exam.level,
    subjectId: exam.subject_id,
    chapterId: exam.chapter_id,
    durationMinutes: exam.duration_minutes,
    totalQuestions: exam.total_questions,
    windowStart: exam.window_start,
    windowEnd: exam.window_end,
    availability: computeAvailability(exam, now),
    serverTime: new Date(now).toISOString(),
  };
}

const EXAM_COLUMNS =
  "id,session_id,title,subtitle,level,subject_id,chapter_id,duration_minutes,total_questions,window_start,window_end,available_before_minutes,upcoming_before_minutes,randomize_questions,randomize_options,status,is_published,is_archived,is_hidden,force_closed_at,created_at,updated_at";

// ============================================================================
// Public: list exams a student can see in a session
// ============================================================================

export const listExamBatchExamsForSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId: string }) =>
    z.object({ sessionId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ExamPublicMeta[]> => {
    // Enrollment gate at the session level; hides all exams for pending/rejected users.
    const { data: enrollment, error: enrErr } = await context.supabase
      .from("exam_batch_enrollments")
      .select("id,status,student_id")
      .eq("session_id", data.sessionId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (enrErr) mapSupabaseError(enrErr, "listExamBatchExamsForSession:enrollment");
    if (!enrollment || enrollment.status !== "approved" || typeof enrollment.student_id !== "number") {
      return [];
    }

    // Enrolled subjects for this student.
    const { data: subjRows, error: subjErr } = await context.supabase
      .from("exam_batch_enrollment_subjects")
      .select("subject_id")
      .eq("enrollment_id", enrollment.id);
    if (subjErr) mapSupabaseError(subjErr, "listExamBatchExamsForSession:subjects");
    const subjectIds = (subjRows ?? []).map((r: any) => r.subject_id as string);
    if (subjectIds.length === 0) return [];

    const { data: exams, error: examErr } = await context.supabase
      .from("exam_batch_exams")
      .select(EXAM_COLUMNS)
      .eq("session_id", data.sessionId)
      .eq("is_published", true)
      .eq("is_archived", false)
      .eq("is_hidden", false)
      .eq("status", "active")
      .in("subject_id", subjectIds)
      .order("window_start", { ascending: true });
    if (examErr) mapSupabaseError(examErr, "listExamBatchExamsForSession:exams");

    const now = Date.now();
    let rows: ExamPublicMeta[] = (exams ?? [])
      .map((e: ExamBatchExamRow) => toPublicMeta(e, now))
      .filter((m: ExamPublicMeta) => m.availability !== "upcoming");

    if (rows.length === 0) return rows;

    // Hide exams the student has already submitted (any terminal attempt).
    // Backend guard — the exam-take page and startAttempt RPC also enforce this.
    const examIds = rows.map((r) => r.id);
    const { data: attemptRows, error: attErr } = await context.supabase
      .from("exam_batch_attempts")
      .select("exam_id,status")
      .eq("user_id", context.userId)
      .in("exam_id", examIds)
      .neq("status", "in_progress");
    if (attErr) mapSupabaseError(attErr, "listExamBatchExamsForSession:attempts");
    const submittedExamIds = new Set<string>(
      (attemptRows ?? []).map((r: any) => r.exam_id as string),
    );
    rows = rows.filter((r) => !submittedExamIds.has(r.id));
    if (rows.length === 0) return rows;

    // Enrich with subject name + chapter name + session title so clients don't need extra lookups.
    const subjIds = Array.from(new Set(rows.map((r) => r.subjectId)));
    const chapIds = Array.from(
      new Set(rows.map((r) => r.chapterId).filter((v): v is string => !!v)),
    );
    const [{ data: subjs }, { data: chaps }, { data: sess }] = await Promise.all([
      context.supabase
        .from("exam_batch_subjects")
        .select("id,name")
        .in("id", subjIds),
      chapIds.length
        ? context.supabase
            .from("exam_batch_chapters")
            .select("id,name")
            .in("id", chapIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> } as any),
      context.supabase
        .from("exam_batch_sessions")
        .select("id,title")
        .eq("id", data.sessionId)
        .maybeSingle(),
    ]);
    const subjMap = new Map<string, string>();
    for (const s of subjs ?? []) subjMap.set((s as any).id, (s as any).name);
    const chapMap = new Map<string, string>();
    for (const c of chaps ?? []) chapMap.set((c as any).id, (c as any).name);
    const sessionTitle = (sess as any)?.title ?? null;
    for (const r of rows) {
      r.subjectName = subjMap.get(r.subjectId) ?? null;
      r.chapterName = r.chapterId ? (chapMap.get(r.chapterId) ?? null) : null;
      r.sessionTitle = sessionTitle;
    }
    return rows;

  });



// ============================================================================
// Public: exam meta by id (no questions leaked)
// ============================================================================

export const getExamBatchExamMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { examId: string }) =>
    z.object({ examId: z.string().uuid() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<ExamPublicMeta> => {
    const { data: exam, error } = await context.supabase
      .from("exam_batch_exams")
      .select(EXAM_COLUMNS)
      .eq("id", data.examId)
      .maybeSingle();
    if (error) mapSupabaseError(error, "getExamBatchExamMeta");
    if (!exam) throw errors.notFound("Exam");
    if (exam.is_hidden || exam.is_archived || !exam.is_published || exam.status !== "active") {
      throw errors.forbidden("This exam is not available.");
    }
    await assertStudentCanAccessExam(context.supabase, context.userId, exam);
    return toPublicMeta(exam as ExamBatchExamRow, Date.now());
  });

// ============================================================================
// Start or resume an attempt (atomic, single active attempt per student/exam)
// ============================================================================

export const startOrResumeExamBatchAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => attemptStartSchema.parse(i))
  .handler(async ({ data, context }): Promise<{ attemptId: string; resumed: boolean }> => {
    // Defense against rapid re-clicks and replay.
    await enforceRateLimit(
      context.supabase,
      rateLimitKey("exam_batch:attempt_start", "user", context.userId),
      RATE_LIMITS.ADMIN_WRITE,
    );

    const { data: exam, error } = await context.supabase
      .from("exam_batch_exams")
      .select(EXAM_COLUMNS)
      .eq("id", data.examId)
      .maybeSingle();
    if (error) mapSupabaseError(error, "startOrResumeExamBatchAttempt:load-exam");
    if (!exam) throw errors.notFound("Exam");
    if (exam.is_hidden || exam.is_archived || !exam.is_published || exam.status !== "active") {
      throw errors.forbidden("This exam is not available.");
    }

    // Prevent re-attempts: if a terminal (submitted / auto / timed_out /
    // admin_closed) attempt already exists for this student + exam, refuse.
    // Belt-and-braces alongside the client-side hiding in listExamBatchExamsForSession.
    const { data: prior, error: priorErr } = await context.supabase
      .from("exam_batch_attempts")
      .select("id,status")
      .eq("exam_id", exam.id)
      .eq("user_id", context.userId)
      .neq("status", "in_progress")
      .limit(1)
      .maybeSingle();
    if (priorErr) mapSupabaseError(priorErr, "startOrResumeExamBatchAttempt:prior");
    if (prior) {
      throw errors.forbidden("You have already submitted this exam. Re-attempts are not allowed.");
    }


    const guard = await assertStudentCanAccessExam(context.supabase, context.userId, exam);

    const now = Date.now();
    const availability = computeAvailability(exam as ExamBatchExamRow, now);
    if (availability !== "live") {
      throw errors.invalidState(
        availability === "ended" || availability === "closed"
          ? "This exam is no longer available."
          : "This exam has not started yet.",
      );
    }

    // Atomic: creates in_progress attempt with server-side start / expected finish
    // times and persisted per-question order + option shuffle map, OR returns
    // an existing in-progress row. RPC signature documented in the README.
    const { data: rpc, error: rpcErr } = await context.supabase.rpc(
      "exam_batch_start_or_resume_attempt",
      {
        _exam_id: exam.id,
        _user_id: context.userId,
        _duration_minutes: exam.duration_minutes,
        _randomize_questions: exam.randomize_questions,
        _randomize_options: exam.randomize_options,
      },
    );
    if (rpcErr) mapSupabaseError(rpcErr, "startOrResumeExamBatchAttempt:rpc");
    const row = Array.isArray(rpc) ? rpc[0] : rpc;
    if (!row) throw errors.invalidState("Could not create or resume an attempt.");

    const resumed = !!row.resumed;
    await audit(
      context.supabase,
      context.userId,
      resumed ? "attempt.resume" : "attempt.start",
      "attempt",
      row.attempt_id,
      { examId: exam.id, studentId: guard.studentId },
    );
    return { attemptId: row.attempt_id as string, resumed };
  });

// ============================================================================
// Fetch the state at a specific question index (lazy loading — one at a time)
// ============================================================================

async function loadAttemptOrFail(
  supabase: any,
  userId: string,
  attemptId: string,
): Promise<{ attempt: ExamBatchAttemptRow; exam: ExamBatchExamRow }> {
  const { data: attempt, error } = await supabase
    .from("exam_batch_attempts")
    .select("id,exam_id,user_id,status,started_at,expected_finish_at,submitted_at,submit_reason,created_at,updated_at")
    .eq("id", attemptId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "loadAttemptOrFail:attempt");
  if (!attempt) throw errors.notFound("Attempt");
  if (attempt.user_id !== userId) throw errors.forbidden("This attempt does not belong to you.");

  const { data: exam, error: exErr } = await supabase
    .from("exam_batch_exams")
    .select(EXAM_COLUMNS)
    .eq("id", attempt.exam_id)
    .maybeSingle();
  if (exErr) mapSupabaseError(exErr, "loadAttemptOrFail:exam");
  if (!exam) throw errors.notFound("Exam");
  return { attempt: attempt as ExamBatchAttemptRow, exam: exam as ExamBatchExamRow };
}

/**
 * Auto-submit an in-progress attempt when server time proves it should be over.
 * Idempotent via the atomic submit RPC (first-writer-wins).
 */
async function maybeAutoSubmitByTime(
  supabase: any,
  userId: string,
  attempt: ExamBatchAttemptRow,
  exam: ExamBatchExamRow,
  now: number,
): Promise<ExamBatchAttemptRow> {
  if (attempt.status !== "in_progress") return attempt;
  const expected = new Date(attempt.expected_finish_at).getTime();
  const end = new Date(exam.window_end).getTime();
  const forceClosed = !!exam.force_closed_at;
  const reason: "timeout" | "auto" | "admin" | null =
    forceClosed ? "admin" : now >= expected ? "timeout" : now >= end ? "auto" : null;
  if (!reason) return attempt;

  const { data: rpc, error } = await supabase.rpc("exam_batch_submit_attempt", {
    _attempt_id: attempt.id,
    _user_id: userId,
    _reason: reason,
  });
  if (error) mapSupabaseError(error, "maybeAutoSubmitByTime:rpc");
  const row = Array.isArray(rpc) ? rpc[0] : rpc;
  await audit(
    supabase,
    userId,
    reason === "timeout"
      ? "attempt.submit_timeout"
      : reason === "admin"
        ? "attempt.submit_admin"
        : "attempt.submit_auto",
    "attempt",
    attempt.id,
    { examId: exam.id },
  );
  return (row ?? attempt) as ExamBatchAttemptRow;
}

export const getExamBatchAttemptState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => attemptStateSchema.parse(i))
  .handler(async ({ data, context }): Promise<AttemptStateView> => {
    const { attempt: rawAttempt, exam } = await loadAttemptOrFail(
      context.supabase,
      context.userId,
      data.attemptId,
    );
    const now = Date.now();
    const attempt = await maybeAutoSubmitByTime(context.supabase, context.userId, rawAttempt, exam, now);

    // Load ordered questions for this attempt (server-persisted order per attempt).
    // We fetch the ONE question at `index` (default 0) — never bulk-return questions.
    const idx = data.index ?? 0;
    const { data: orderRow, error: orderErr } = await context.supabase
      .from("exam_batch_attempt_question_order")
      .select("question_id,option_order")
      .eq("attempt_id", attempt.id)
      .eq("position", idx)
      .maybeSingle();
    if (orderErr) mapSupabaseError(orderErr, "getExamBatchAttemptState:order");

    const { count, error: cntErr } = await context.supabase
      .from("exam_batch_attempt_question_order")
      .select("question_id", { count: "exact", head: true })
      .eq("attempt_id", attempt.id);
    if (cntErr) mapSupabaseError(cntErr, "getExamBatchAttemptState:count");
    const totalQuestions = count ?? 0;

    let question: AttemptStateView["question"] = null;
    if (orderRow) {
      const { data: q, error: qErr } = await context.supabase
        .from("exam_batch_mcqs")
        .select("id,question,option_a,option_b,option_c,option_d")
        .eq("id", orderRow.question_id)
        .maybeSingle();
      if (qErr) mapSupabaseError(qErr, "getExamBatchAttemptState:question");
      if (q) {
        // Apply per-attempt option order. `option_order` is an int[] mapping
        // display index → source index. This never reveals which option is correct.
        const rawOpts = [
          (q as any).option_a,
          (q as any).option_b,
          (q as any).option_c,
          (q as any).option_d,
        ].filter((x) => typeof x === "string") as string[];
        const optionOrder: number[] = Array.isArray(orderRow.option_order)
          ? (orderRow.option_order as number[])
          : rawOpts.map((_, i) => i);
        const shuffled = optionOrder
          .map((srcIdx) => rawOpts[srcIdx])
          .filter((x) => typeof x === "string") as string[];

        const { data: ansRow, error: ansErr } = await context.supabase
          .from("exam_batch_attempt_answers")
          .select("selected_display_index")
          .eq("attempt_id", attempt.id)
          .eq("question_id", (q as any).id)
          .maybeSingle();
        if (ansErr) mapSupabaseError(ansErr, "getExamBatchAttemptState:answer");

        question = {
          index: idx,
          questionId: (q as any).id as string,
          text: ((q as any).question as string) ?? "",
          options: shuffled,
          selectedDisplayIndex:
            typeof ansRow?.selected_display_index === "number" ? ansRow.selected_display_index : null,
        };
      }
    }

    const expected = new Date(attempt.expected_finish_at).getTime();
    const remainingSeconds = Math.max(0, Math.floor((expected - now) / 1000));

    return {
      attempt: {
        id: attempt.id,
        examId: attempt.exam_id,
        status: attempt.status,
        startedAt: attempt.started_at,
        expectedFinishAt: attempt.expected_finish_at,
        submittedAt: attempt.submitted_at,
        remainingSeconds,
        serverTime: new Date(now).toISOString(),
      },
      question,
      totalQuestions,
    };
  });

// ============================================================================
// Autosave an answer (idempotent upsert; never mutates locked attempts)
// ============================================================================

export const saveExamBatchAnswer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => answerSaveSchema.parse(i))
  .handler(async ({ data, context }) => {
    // Rapid-click / replay throttle at the user level.
    await enforceRateLimit(
      context.supabase,
      rateLimitKey("exam_batch:answer_save", "user", context.userId),
      RATE_LIMITS.ADMIN_WRITE,
    );

    const { attempt, exam } = await loadAttemptOrFail(
      context.supabase,
      context.userId,
      data.attemptId,
    );
    if (attempt.status !== "in_progress") throw errors.invalidState("This attempt is already submitted.");

    const now = Date.now();
    const expected = new Date(attempt.expected_finish_at).getTime();
    const end = new Date(exam.window_end).getTime();
    if (exam.force_closed_at || now >= expected || now >= end) {
      // Trigger the atomic auto-submit and reject the write.
      await maybeAutoSubmitByTime(context.supabase, context.userId, attempt, exam, now);
      throw errors.invalidState("Time is up. Your attempt has been auto-submitted.");
    }

    // Validate the target question actually belongs to this attempt's order,
    // and the selected index is within its option set.
    const { data: orderRow, error: orderErr } = await context.supabase
      .from("exam_batch_attempt_question_order")
      .select("option_order")
      .eq("attempt_id", attempt.id)
      .eq("question_id", data.questionId)
      .maybeSingle();
    if (orderErr) mapSupabaseError(orderErr, "saveExamBatchAnswer:order");
    if (!orderRow) throw errors.invalidState("Question is not part of this attempt.");
    const optCount = Array.isArray(orderRow.option_order) ? orderRow.option_order.length : 0;
    if (
      data.selectedDisplayIndex !== null &&
      (data.selectedDisplayIndex < 0 || data.selectedDisplayIndex >= optCount)
    ) {
      throw errors.invalidState("Selected option is out of range.");
    }

    // Detect change vs previous value for audit differentiation.
    const { data: prev, error: prevErr } = await context.supabase
      .from("exam_batch_attempt_answers")
      .select("selected_display_index")
      .eq("attempt_id", attempt.id)
      .eq("question_id", data.questionId)
      .maybeSingle();
    if (prevErr) mapSupabaseError(prevErr, "saveExamBatchAnswer:prev");

    const { error: upErr } = await context.supabase
      .from("exam_batch_attempt_answers")
      .upsert(
        {
          attempt_id: attempt.id,
          question_id: data.questionId,
          selected_display_index: data.selectedDisplayIndex,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "attempt_id,question_id" },
      );
    if (upErr) mapSupabaseError(upErr, "saveExamBatchAnswer:upsert");

    const changed =
      prev && typeof prev.selected_display_index === "number"
        ? prev.selected_display_index !== data.selectedDisplayIndex
        : data.selectedDisplayIndex !== null;
    await audit(
      context.supabase,
      context.userId,
      changed ? "attempt.answer_change" : "attempt.answer_save",
      "attempt",
      attempt.id,
      { questionId: data.questionId },
    );
    return { ok: true, remainingSeconds: Math.max(0, Math.floor((expected - now) / 1000)) } as const;
  });

// ============================================================================
// Manual submit (idempotent via the atomic submit RPC — first submit wins)
// ============================================================================

export const submitExamBatchAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => attemptIdOnly.parse(i))
  .handler(async ({ data, context }) => {
    await enforceRateLimit(
      context.supabase,
      rateLimitKey("exam_batch:submit", "user", context.userId),
      RATE_LIMITS.ADMIN_WRITE,
    );

    const { attempt, exam } = await loadAttemptOrFail(
      context.supabase,
      context.userId,
      data.attemptId,
    );

    // Already-submitted attempts: return the row without an error — the UI
    // shows the completed state; double-submit clicks converge safely.
    if (attempt.status !== "in_progress") {
      return { ok: true, alreadySubmitted: true, status: attempt.status } as const;
    }

    const now = Date.now();
    const expected = new Date(attempt.expected_finish_at).getTime();
    const end = new Date(exam.window_end).getTime();
    const reason: "manual" | "auto" | "timeout" | "admin" =
      exam.force_closed_at ? "admin" : now >= expected ? "timeout" : now >= end ? "auto" : "manual";

    const { data: rpc, error } = await context.supabase.rpc("exam_batch_submit_attempt", {
      _attempt_id: attempt.id,
      _user_id: context.userId,
      _reason: reason,
    });
    if (error) mapSupabaseError(error, "submitExamBatchAttempt:rpc");
    const row = Array.isArray(rpc) ? rpc[0] : rpc;
    if (!row) throw errors.invalidState("Submit failed.");

    // Publish the leaderboard immediately when this submission has actually
    // ended the exam — either because the admin already force-closed it, or
    // the exam window has now elapsed. This is a client-safe fallback that
    // complements the AFTER-UPDATE trigger on exam_batch_attempts (SQL) and
    // the every-minute sweep. `exam_batch_generate_leaderboard` is
    // idempotent (advisory lock inside the RPC), so calling it here in
    // parallel with the DB trigger is safe. Fire-and-forget; a leaderboard
    // hiccup must not fail the submit itself — the sweep will pick it up.
    const windowEnded = !!exam.force_closed_at || now >= end;
    if (windowEnded) {
      void context.supabase
        .rpc("exam_batch_generate_leaderboard", { _exam_id: attempt.exam_id, _force: true })
        .then(({ error: lbErr }) => {
          if (lbErr) {
            // eslint-disable-next-line no-console
            console.warn("[submitExamBatchAttempt] leaderboard publish deferred:", lbErr.message);
          }
        });
    }

    await audit(
      context.supabase,
      context.userId,
      reason === "manual"
        ? "attempt.submit_manual"
        : reason === "timeout"
          ? "attempt.submit_timeout"
          : reason === "admin"
            ? "attempt.submit_admin"
            : "attempt.submit_auto",
      "attempt",
      attempt.id,
      { examId: attempt.exam_id },
    );
    return { ok: true, alreadySubmitted: false, status: (row.status ?? "submitted") as string } as const;

  });

// ============================================================================
// Lightweight status poll (timer + lock state, no question payload)
// ============================================================================

export const getExamBatchAttemptStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => attemptIdOnly.parse(i))
  .handler(async ({ data, context }) => {
    const { attempt: rawAttempt, exam } = await loadAttemptOrFail(
      context.supabase,
      context.userId,
      data.attemptId,
    );
    const now = Date.now();
    const attempt = await maybeAutoSubmitByTime(context.supabase, context.userId, rawAttempt, exam, now);
    const expected = new Date(attempt.expected_finish_at).getTime();
    return {
      status: attempt.status,
      submittedAt: attempt.submitted_at,
      submitReason: attempt.submit_reason,
      remainingSeconds: Math.max(0, Math.floor((expected - now) / 1000)),
      serverTime: new Date(now).toISOString(),
    } as const;
  });