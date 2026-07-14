// @ts-nocheck
// Admin exam management for Exam Batch.
// Fully isolated from Mock Test / Quiz / MCQ. Every mutation goes through
// assertPermission("manage_content"), applying admin-write rate limits and
// authorization audit alongside our module-level audit.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { audit } from "./audit";
import { errors, mapSupabaseError } from "./errors";
import {
  examCreateSchema,
  examIdOnly,
  examSetBool,
  examSetQuestionsSchema,
  examUpdateSchema,
  type ExamBatchExamRow,
} from "./exam-engine.types";

const EXAM_COLUMNS =
  "id,session_id,title,subtitle,level,subject_id,chapter_id,duration_minutes,total_questions,window_start,window_end,available_before_minutes,upcoming_before_minutes,randomize_questions,randomize_options,status,is_published,is_archived,is_hidden,force_closed_at,created_at,updated_at";

// ---------- List (admin sees everything) ----------
export const adminListExamBatchExams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { sessionId?: string; includeArchived?: boolean }) =>
    z
      .object({
        sessionId: z.string().uuid().optional(),
        includeArchived: z.boolean().default(true),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<ExamBatchExamRow[]> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.list");
    let q = context.supabase
      .from("exam_batch_exams")
      .select(EXAM_COLUMNS)
      .order("window_start", { ascending: false });
    if (data.sessionId) q = q.eq("session_id", data.sessionId);
    if (!data.includeArchived) q = q.eq("is_archived", false);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "adminListExamBatchExams");
    return (rows ?? []) as ExamBatchExamRow[];
  });

// ---------- Create ----------
export const adminCreateExamBatchExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => examCreateSchema.parse(i))
  .handler(async ({ data, context }): Promise<ExamBatchExamRow> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.create");

    if (new Date(data.windowStart).getTime() >= new Date(data.windowEnd).getTime()) {
      throw errors.invalidState("Exam window end must be after window start.");
    }

    // Session must exist and not be archived.
    const { data: session, error: sessErr } = await context.supabase
      .from("exam_batch_sessions")
      .select("id,level,is_archived")
      .eq("id", data.sessionId)
      .maybeSingle();
    if (sessErr) mapSupabaseError(sessErr, "adminCreateExamBatchExam:load-session");
    if (!session) throw errors.notFound("Session");
    if (session.is_archived) throw errors.invalidState("Cannot create an exam in an archived session.");
    if (session.level !== data.level) {
      throw errors.invalidState("Exam level must match the session level.");
    }

    const { data: row, error } = await context.supabase
      .from("exam_batch_exams")
      .insert({
        session_id: data.sessionId,
        title: data.title,
        subtitle: data.subtitle ?? null,
        level: data.level,
        subject_id: data.subjectId,
        chapter_id: data.chapterId ?? null,
        duration_minutes: data.durationMinutes,
        total_questions: data.totalQuestions,
        window_start: data.windowStart,
        window_end: data.windowEnd,
        available_before_minutes: data.availableBefore,
        upcoming_before_minutes: data.upcomingBefore,
        randomize_questions: data.randomizeQuestions,
        randomize_options: data.randomizeOptions,
        status: data.status,
        is_published: data.isPublished,
        is_hidden: data.isHidden,
        is_archived: false,
        created_by: context.userId,
      })
      .select(EXAM_COLUMNS)
      .single();
    if (error) mapSupabaseError(error, "adminCreateExamBatchExam");
    await audit(context.supabase, context.userId, "exam.create", "exam", row!.id, { title: data.title });
    return row as ExamBatchExamRow;
  });

// ---------- Update ----------
export const adminUpdateExamBatchExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => examUpdateSchema.parse(i))
  .handler(async ({ data, context }): Promise<ExamBatchExamRow> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.update");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const map: Record<string, string> = {
      title: "title",
      subtitle: "subtitle",
      level: "level",
      subjectId: "subject_id",
      chapterId: "chapter_id",
      durationMinutes: "duration_minutes",
      totalQuestions: "total_questions",
      windowStart: "window_start",
      windowEnd: "window_end",
      availableBefore: "available_before_minutes",
      upcomingBefore: "upcoming_before_minutes",
      randomizeQuestions: "randomize_questions",
      randomizeOptions: "randomize_options",
      status: "status",
      isPublished: "is_published",
      isHidden: "is_hidden",
    };
    for (const [k, col] of Object.entries(map)) {
      const v = (data as Record<string, unknown>)[k];
      if (v !== undefined) patch[col] = v === null ? null : v;
    }

    if (patch.window_start && patch.window_end) {
      if (new Date(patch.window_start as string).getTime() >= new Date(patch.window_end as string).getTime()) {
        throw errors.invalidState("Exam window end must be after window start.");
      }
    }

    const { data: row, error } = await context.supabase
      .from("exam_batch_exams")
      .update(patch)
      .eq("id", data.id)
      .select(EXAM_COLUMNS)
      .single();
    if (error) mapSupabaseError(error, "adminUpdateExamBatchExam");
    if (!row) throw errors.notFound("Exam");
    await audit(context.supabase, context.userId, "exam.update", "exam", data.id, { patch });
    return row as ExamBatchExamRow;
  });

// ---------- Delete ----------
export const adminDeleteExamBatchExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => examIdOnly.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.delete");
    // Guard: refuse to delete an exam that already has attempts, to preserve integrity.
    const { count, error: cntErr } = await context.supabase
      .from("exam_batch_attempts")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", data.id);
    if (cntErr) mapSupabaseError(cntErr, "adminDeleteExamBatchExam:count-attempts");
    if ((count ?? 0) > 0) {
      throw errors.invalidState("Exam has attempts and cannot be deleted; archive it instead.");
    }
    const { error } = await context.supabase.from("exam_batch_exams").delete().eq("id", data.id);
    if (error) mapSupabaseError(error, "adminDeleteExamBatchExam");
    await audit(context.supabase, context.userId, "exam.delete", "exam", data.id);
    return { ok: true } as const;
  });

// ---------- Publish / Unpublish ----------
export const adminSetExamBatchExamPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => examSetBool.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.publish");

    if (data.value) {
      // Only allow publish once question set is attached.
      const { count, error: cntErr } = await context.supabase
        .from("exam_batch_exam_questions")
        .select("question_id", { count: "exact", head: true })
        .eq("exam_id", data.id);
      if (cntErr) mapSupabaseError(cntErr, "adminSetExamBatchExamPublished:questions-count");
      if (!count || count === 0) {
        throw errors.invalidState("Attach questions before publishing.");
      }
    }

    const { error } = await context.supabase
      .from("exam_batch_exams")
      .update({ is_published: data.value, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "adminSetExamBatchExamPublished");
    await audit(context.supabase, context.userId, "exam.publish", "exam", data.id, { published: data.value });
    return { ok: true } as const;
  });

// ---------- Archive / Hide ----------
export const adminSetExamBatchExamArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => examSetBool.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.archive");
    const { error } = await context.supabase
      .from("exam_batch_exams")
      .update({ is_archived: data.value, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "adminSetExamBatchExamArchived");
    await audit(context.supabase, context.userId, "exam.archive", "exam", data.id, { archived: data.value });
    return { ok: true } as const;
  });

export const adminSetExamBatchExamHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => examSetBool.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.hide");
    const { error } = await context.supabase
      .from("exam_batch_exams")
      .update({ is_hidden: data.value, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "adminSetExamBatchExamHidden");
    await audit(context.supabase, context.userId, "exam.hide", "exam", data.id, { hidden: data.value });
    return { ok: true } as const;
  });

// ---------- Force close (auto-submits every in-progress attempt via RPC) ----------
export const adminForceCloseExamBatchExam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => examIdOnly.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.force_close");

    // 1) Mark exam as force-closed.
    const nowIso = new Date().toISOString();
    const { error: updErr } = await context.supabase
      .from("exam_batch_exams")
      .update({ force_closed_at: nowIso, updated_at: nowIso })
      .eq("id", data.id);
    if (updErr) mapSupabaseError(updErr, "adminForceCloseExamBatchExam");

    // 2) Auto-submit any in-progress attempts through the atomic RPC (idempotent).
    const { error: rpcErr } = await context.supabase.rpc("exam_batch_close_exam_attempts", {
      _exam_id: data.id,
      _reason: "admin",
    });
    if (rpcErr) mapSupabaseError(rpcErr, "adminForceCloseExamBatchExam:rpc");

    // 3) Immediately publish the leaderboard. Force=true bypasses the
    //    "window has not ended" guard so admin force-close truly ends
    //    the exam without waiting for the scheduled end time. The RPC
    //    is idempotent and holds an advisory lock, so concurrent freezes
    //    are safe.
    const { error: lbErr } = await context.supabase.rpc(
      "exam_batch_generate_leaderboard",
      { _exam_id: data.id, _force: true },
    );
    if (lbErr) mapSupabaseError(lbErr, "adminForceCloseExamBatchExam:leaderboard");

    await audit(context.supabase, context.userId, "exam.force_close", "exam", data.id);
    await audit(context.supabase, context.userId, "leaderboard.publish", "leaderboard", data.id, {
      trigger: "force_close",
    });
    return { ok: true } as const;
  });

// ---------- Attach question set ----------
// Validates every question belongs to the exam's level+subject (and chapter,
// if the exam is chapter-scoped) before writing. Overwrites the existing set.
export const adminSetExamBatchExamQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => examSetQuestionsSchema.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.set_questions");

    // Refuse when attempts already exist — question set changes would invalidate them.
    const { count: attemptCount, error: cntErr } = await context.supabase
      .from("exam_batch_attempts")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", data.examId);
    if (cntErr) mapSupabaseError(cntErr, "adminSetExamBatchExamQuestions:count-attempts");
    if ((attemptCount ?? 0) > 0) {
      throw errors.invalidState("Question set cannot be changed after attempts exist.");
    }

    const { data: exam, error: exErr } = await context.supabase
      .from("exam_batch_exams")
      .select("id,level,subject_id,chapter_id")
      .eq("id", data.examId)
      .maybeSingle();
    if (exErr) mapSupabaseError(exErr, "adminSetExamBatchExamQuestions:load-exam");
    if (!exam) throw errors.notFound("Exam");

    // Dedupe question ids while preserving order.
    const uniqueIds = Array.from(new Set(data.questionIds));

    const { data: qs, error: qErr } = await context.supabase
      .from("exam_batch_mcqs")
      .select("id,level,subject_id,chapter_id")
      .in("id", uniqueIds);
    if (qErr) mapSupabaseError(qErr, "adminSetExamBatchExamQuestions:validate-questions");
    if (!qs || qs.length !== uniqueIds.length) {
      throw errors.invalidState("One or more selected questions are invalid.");
    }
    for (const q of qs as any[]) {
      if (q.level !== exam.level) throw errors.invalidState("A question does not belong to this exam's level.");
      if (q.subject_id !== exam.subject_id) {
        throw errors.invalidState("A question does not belong to this exam's subject.");
      }
      if (exam.chapter_id && q.chapter_id !== exam.chapter_id) {
        throw errors.invalidState("A question does not belong to this exam's chapter.");
      }
    }

    // Replace the set inside a single logical step.
    const { error: delErr } = await context.supabase
      .from("exam_batch_exam_questions")
      .delete()
      .eq("exam_id", data.examId);
    if (delErr) mapSupabaseError(delErr, "adminSetExamBatchExamQuestions:clear");

    const rows = uniqueIds.map((qid, idx) => ({
      exam_id: data.examId,
      question_id: qid,
      position: idx,
    }));
    const { error: insErr } = await context.supabase.from("exam_batch_exam_questions").insert(rows);
    if (insErr) mapSupabaseError(insErr, "adminSetExamBatchExamQuestions:insert");

    await audit(context.supabase, context.userId, "exam.set_questions", "exam", data.examId, {
      count: uniqueIds.length,
    });
    return { ok: true, count: uniqueIds.length } as const;
  });

// ---------- List attached question IDs (for admin editor) ----------
export const adminListExamBatchExamQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => examIdOnly.parse(i))
  .handler(async ({ data, context }): Promise<string[]> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.exam.list_questions");
    const { data: rows, error } = await context.supabase
      .from("exam_batch_exam_questions")
      .select("question_id,position")
      .eq("exam_id", data.id)
      .order("position", { ascending: true });
    if (error) mapSupabaseError(error, "adminListExamBatchExamQuestions");
    return ((rows ?? []) as Array<{ question_id: string }>).map((r) => r.question_id);
  });