// @ts-nocheck
// Exam Batch — Subject Progress (student + admin) server functions.
// -----------------------------------------------------------------------------
// Reads ONLY from Exam Batch tables. Subject & Chapter data come strictly
// from `exam_batch_subjects` / `exam_batch_chapters` (Exam Batch Academic
// Manager). Results are always derived from `exam_batch_attempts` +
// `exam_batch_attempt_results`. No demo / fake / placeholder data.
//
// Every function is authenticated. Students are auto-scoped to their own
// approved enrollment; admins gate on `assertPermission("manage_content")`.
//
// All handlers avoid N+1 by loading chapters / exams / attempts / results
// in bulk (`.in(...)`) and joining in-memory.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { validate } from "@/lib/validate";
import { errors, mapSupabaseError } from "./errors";

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

export type ChapterStatus = "completed" | "missed" | "not_conducted";
export type PerformanceTone = "excellent" | "good" | "average" | "needs_work";

export type SubjectOptionDTO = { id: string; name: string };

export type ChapterProgressDTO = {
  id: string;
  name: string;
  latestScore: number | null;
  latestAttemptAt: string | null;
  attemptCount: number;
  highestScore: number | null;
  lowestScore: number | null;
  performance: PerformanceTone | null;
  status: ChapterStatus;
  latestExamId: string | null;
  progress: number | null;
};

export type SubjectAnalyticsDTO = {
  overallProgress: number | null;   // 0..100, avg latest% of completed chapters
  averageScore: number | null;      // alias of overallProgress for the UI
  completedChapters: number;
  missedChapters: number;
  chaptersWithNoExam: number;
  conductedChapters: number;
  remainingChapters: number;
  strongestChapter: { id: string; name: string; percentage: number } | null;
  weakestChapter: { id: string; name: string; percentage: number } | null;
  highestScore: number | null;
  lowestScore: number | null;
  trend: Array<{ chapterId: string; chapterName: string; percentage: number; submittedAt: string }>;
  /** Rolling window (days) used to compute this analytics payload. */
  windowDays: number;
  /** Latest submission timestamp inside the window (ISO), null if none. */
  lastUpdatedAt: string | null;
  /** True when at least one attempt exists inside the window. */
  hasActivityInWindow: boolean;
};

export type SubjectProgressDTO = {
  subject: { id: string; name: string } | null;
  chapters: ChapterProgressDTO[];
  analytics: SubjectAnalyticsDTO;
};

// -----------------------------------------------------------------------------
// Analytics window — Subject Progress dashboards use the last 30 days ONLY.
// Historical rows remain in the database (Exam History uses them). Only these
// analytics reads are scoped to the rolling window.
// -----------------------------------------------------------------------------
export const ANALYTICS_WINDOW_DAYS = 30;

function windowCutoffISO(now: Date = new Date()): string {
  return new Date(now.getTime() - ANALYTICS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function tone(pct: number | null): PerformanceTone | null {
  if (pct == null) return null;
  if (pct >= 85) return "excellent";
  if (pct >= 70) return "good";
  if (pct >= 50) return "average";
  return "needs_work";
}

function emptyAnalytics(): SubjectAnalyticsDTO {
  return {
    overallProgress: null,
    averageScore: null,
    completedChapters: 0,
    missedChapters: 0,
    chaptersWithNoExam: 0,
    conductedChapters: 0,
    remainingChapters: 0,
    strongestChapter: null,
    weakestChapter: null,
    highestScore: null,
    lowestScore: null,
    trend: [],
    windowDays: ANALYTICS_WINDOW_DAYS,
    lastUpdatedAt: null,
    hasActivityInWindow: false,
  };
}

type ExamRow = {
  id: string;
  chapter_id: string | null;
  window_start: string;
  window_end: string;
  force_closed_at: string | null;
  created_at: string;
};
type AttemptRow = { id: string; exam_id: string; status: string; submitted_at: string | null };
type ResultRow = {
  attempt_id: string;
  exam_id: string;
  percentage: number | string;
  submitted_at: string | null;
};

/**
 * Compute per-chapter progress + subject analytics for ONE student and ONE
 * subject. All data is passed in — this function has no I/O so it can be
 * unit-reviewed in isolation and reused by both student & admin surfaces.
 *
 * Rules:
 *  - Latest chapter exam = exam with the greatest (window_start, created_at)
 *    tuple among the exams tagged with that chapter_id.
 *  - status = completed  → user has ANY attempt for the latest exam
 *  - status = missed     → latest exam window has ended and user never attempted
 *  - status = not_conducted → no exam exists for the chapter, OR the latest
 *                             exam is still open/upcoming and user hasn't
 *                             attempted (business rules only expose 3 states).
 */
export function computeSubjectProgress(input: {
  chapters: Array<{ id: string; name: string }>;
  exams: ExamRow[];
  attempts: AttemptRow[];
  results: ResultRow[];
  now?: Date;
}): { chapters: ChapterProgressDTO[]; analytics: SubjectAnalyticsDTO } {
  const now = (input.now ?? new Date()).getTime();

  // exam_id → chapter_id (skip exams without a chapter — they are subject-wide)
  const chapterExams = new Map<string, ExamRow[]>();
  for (const e of input.exams) {
    if (!e.chapter_id) continue;
    const list = chapterExams.get(e.chapter_id) ?? [];
    list.push(e);
    chapterExams.set(e.chapter_id, list);
  }
  for (const list of chapterExams.values()) {
    list.sort((a, b) => {
      const ta = new Date(a.window_start).getTime();
      const tb = new Date(b.window_start).getTime();
      if (ta !== tb) return tb - ta;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }

  const attemptsByExam = new Map<string, AttemptRow[]>();
  for (const a of input.attempts) {
    const list = attemptsByExam.get(a.exam_id) ?? [];
    list.push(a);
    attemptsByExam.set(a.exam_id, list);
  }
  const resultByAttempt = new Map<string, ResultRow>();
  for (const r of input.results) resultByAttempt.set(r.attempt_id, r);

  const chapters: ChapterProgressDTO[] = input.chapters.map((c) => {
    const exams = chapterExams.get(c.id) ?? [];
    if (exams.length === 0) {
      return {
        id: c.id,
        name: c.name,
        latestScore: null,
        latestAttemptAt: null,
        attemptCount: 0,
        highestScore: null,
        lowestScore: null,
        performance: null,
        status: "not_conducted",
        latestExamId: null,
        progress: null,
      };
    }
    const latest = exams[0];
    const latestEnded =
      !!latest.force_closed_at || now >= new Date(latest.window_end).getTime();
    const latestAttempts = attemptsByExam.get(latest.id) ?? [];

    // Aggregate ALL attempts across ALL exams for this chapter to derive
    // attemptCount / highest / lowest.
    let attemptCount = 0;
    let highest: number | null = null;
    let lowest: number | null = null;
    for (const ex of exams) {
      const atts = attemptsByExam.get(ex.id) ?? [];
      for (const at of atts) {
        attemptCount += 1;
        const r = resultByAttempt.get(at.id);
        if (!r) continue;
        const pct = Number(r.percentage);
        if (!Number.isFinite(pct)) continue;
        highest = highest == null ? pct : Math.max(highest, pct);
        lowest = lowest == null ? pct : Math.min(lowest, pct);
      }
    }

    // Latest-exam view drives the visible score + status.
    let latestScore: number | null = null;
    let latestAttemptAt: string | null = null;
    let status: ChapterStatus;
    if (latestAttempts.length > 0) {
      status = "completed";
      // Pick the latest-attempted attempt on the latest exam.
      const sorted = [...latestAttempts].sort((a, b) => {
        const ta = new Date(a.submitted_at ?? 0).getTime();
        const tb = new Date(b.submitted_at ?? 0).getTime();
        return tb - ta;
      });
      const pick = sorted.find((a) => resultByAttempt.get(a.id)) ?? sorted[0];
      const r = resultByAttempt.get(pick.id);
      if (r) {
        latestScore = Number(r.percentage);
        latestAttemptAt = r.submitted_at ?? pick.submitted_at ?? null;
      } else {
        latestAttemptAt = pick.submitted_at;
      }
    } else if (latestEnded) {
      status = "missed";
    } else {
      status = "not_conducted";
    }

    return {
      id: c.id,
      name: c.name,
      latestScore,
      latestAttemptAt,
      attemptCount,
      highestScore: highest,
      lowestScore: lowest,
      performance: tone(latestScore),
      status,
      latestExamId: latest.id,
      progress: latestScore,
    };
  });

  // Analytics
  const completed = chapters.filter((c) => c.status === "completed");
  const missed = chapters.filter((c) => c.status === "missed");
  const noExam = chapters.filter((c) => c.latestExamId === null);
  const conducted = chapters.filter((c) => {
    if (!c.latestExamId) return false;
    const list = chapterExams.get(c.id) ?? [];
    if (list.length === 0) return false;
    const first = list[0];
    return !!first.force_closed_at || now >= new Date(first.window_end).getTime();
  });

  const withScore = completed.filter((c): c is ChapterProgressDTO & { latestScore: number } => c.latestScore != null);
  const overall = withScore.length
    ? Math.round((withScore.reduce((s, c) => s + c.latestScore, 0) / withScore.length) * 100) / 100
    : null;

  let strongest: SubjectAnalyticsDTO["strongestChapter"] = null;
  let weakest: SubjectAnalyticsDTO["weakestChapter"] = null;
  for (const c of withScore) {
    if (!strongest || c.latestScore > strongest.percentage) {
      strongest = { id: c.id, name: c.name, percentage: c.latestScore };
    }
    if (!weakest || c.latestScore < weakest.percentage) {
      weakest = { id: c.id, name: c.name, percentage: c.latestScore };
    }
  }

  let highest: number | null = null;
  let lowest: number | null = null;
  for (const c of chapters) {
    if (c.highestScore != null) highest = highest == null ? c.highestScore : Math.max(highest, c.highestScore);
    if (c.lowestScore != null) lowest = lowest == null ? c.lowestScore : Math.min(lowest, c.lowestScore);
  }

  const trend = withScore
    .filter((c) => !!c.latestAttemptAt)
    .map((c) => ({
      chapterId: c.id,
      chapterName: c.name,
      percentage: c.latestScore,
      submittedAt: c.latestAttemptAt as string,
    }))
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  return {
    chapters,
    analytics: {
      overallProgress: overall,
      averageScore: overall,
      completedChapters: completed.length,
      missedChapters: missed.length,
      chaptersWithNoExam: noExam.length,
      conductedChapters: conducted.length,
      remainingChapters: chapters.length - conducted.length,
      strongestChapter: strongest,
      weakestChapter: weakest,
      highestScore: highest,
      lowestScore: lowest,
      trend,
      windowDays: ANALYTICS_WINDOW_DAYS,
      lastUpdatedAt: (() => {
        let latest: number | null = null;
        for (const r of input.results) {
          const t = r.submitted_at ? new Date(r.submitted_at).getTime() : NaN;
          if (Number.isFinite(t)) latest = latest == null ? t : Math.max(latest, t);
        }
        return latest == null ? null : new Date(latest).toISOString();
      })(),
      hasActivityInWindow: input.attempts.length > 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared DB loaders
// ---------------------------------------------------------------------------

async function loadChaptersForSubject(sb: any, subjectId: string) {
  const { data, error } = await sb
    .from("exam_batch_chapters")
    .select("id,name,sort_order,subject_id,status")
    .eq("subject_id", subjectId)
    .eq("status", "published")
    .order("sort_order", { ascending: true });
  if (error) mapSupabaseError(error, "subject-progress:chapters");
  return (data ?? []) as Array<{ id: string; name: string; sort_order: number }>;
}

async function loadExamsForSubject(
  sb: any,
  sessionId: string,
  subjectId: string,
  chapterIds: string[],
) {
  if (chapterIds.length === 0) return [] as ExamRow[];
  const { data, error } = await sb
    .from("exam_batch_exams")
    .select("id,chapter_id,window_start,window_end,force_closed_at,created_at")
    .eq("session_id", sessionId)
    .eq("subject_id", subjectId)
    .in("chapter_id", chapterIds)
    .eq("is_published", true)
    .eq("is_hidden", false)
    .eq("is_archived", false)
    .eq("status", "active");
  if (error) mapSupabaseError(error, "subject-progress:exams");
  return (data ?? []) as ExamRow[];
}

async function loadAttemptsAndResults(
  sb: any,
  userId: string,
  examIds: string[],
) {
  if (examIds.length === 0) return { attempts: [] as AttemptRow[], results: [] as ResultRow[] };
  const cutoff = windowCutoffISO();
  const { data: attemptsRaw, error: aErr } = await sb
    .from("exam_batch_attempts")
    .select("id,exam_id,status,submitted_at,user_id")
    .eq("user_id", userId)
    .in("exam_id", examIds)
    .gte("submitted_at", cutoff);
  if (aErr) mapSupabaseError(aErr, "subject-progress:attempts");
  const attempts = (attemptsRaw ?? []) as AttemptRow[];
  if (attempts.length === 0) return { attempts, results: [] as ResultRow[] };
  const { data: resultsRaw, error: rErr } = await sb
    .from("exam_batch_attempt_results")
    .select("attempt_id,exam_id,percentage,submitted_at")
    .in("attempt_id", attempts.map((a) => a.id));
  if (rErr) mapSupabaseError(rErr, "subject-progress:results");
  return { attempts, results: (resultsRaw ?? []) as ResultRow[] };
}

/** Return the current student's approved enrollment for a session (or the
 * most recently approved one when no sessionId is passed). Enforces that
 * the student is `approved` — never trusts client-supplied identity. */
async function loadApprovedEnrollment(
  sb: any,
  userId: string,
  sessionId?: string,
): Promise<{ id: string; session_id: string; student_id: number | null }> {
  let q = sb
    .from("exam_batch_enrollments")
    .select("id,session_id,student_id,status,updated_at")
    .eq("user_id", userId)
    .eq("status", "approved");
  if (sessionId) q = q.eq("session_id", sessionId);
  q = q.order("updated_at", { ascending: false }).limit(1);
  const { data, error } = await q.maybeSingle();
  if (error) mapSupabaseError(error, "subject-progress:enrollment");
  if (!data) throw errors.forbidden("Your enrollment is not approved for this session.");
  return data as { id: string; session_id: string; student_id: number | null };
}

async function assertSubjectEnrolled(sb: any, enrollmentId: string, subjectId: string) {
  const { data, error } = await sb
    .from("exam_batch_enrollment_subjects")
    .select("subject_id")
    .eq("enrollment_id", enrollmentId)
    .eq("subject_id", subjectId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "subject-progress:enrollment-subject");
  if (!data) throw errors.forbidden("You are not enrolled in this subject.");
}

// ---------------------------------------------------------------------------
// STUDENT — subject list
// ---------------------------------------------------------------------------

const studentSubjectsInput = z.object({
  sessionId: z.string().uuid().optional(),
});

export const getExamBatchStudentSubjectList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate(studentSubjectsInput))
  .handler(async ({ data, context }): Promise<SubjectOptionDTO[]> => {
    const sb = context.supabase;
    const enr = await loadApprovedEnrollment(sb, context.userId, data.sessionId);

    const { data: links, error } = await sb
      .from("exam_batch_enrollment_subjects")
      .select("subject_id")
      .eq("enrollment_id", enr.id);
    if (error) mapSupabaseError(error, "subject-progress:student-subjects");
    const ids = Array.from(new Set((links ?? []).map((r: any) => r.subject_id as string)));
    if (ids.length === 0) return [];

    const { data: subjects, error: sErr } = await sb
      .from("exam_batch_subjects")
      .select("id,name,sort_order,status")
      .in("id", ids)
      .order("sort_order", { ascending: true });
    if (sErr) mapSupabaseError(sErr, "subject-progress:student-subject-names");
    return (subjects ?? [])
      .filter((r: any) => r.status === "published")
      .map((r: any) => ({ id: r.id as string, name: r.name as string }));
  });

// ---------------------------------------------------------------------------
// STUDENT — subject progress detail
// ---------------------------------------------------------------------------

const studentProgressInput = z.object({
  subjectId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

export const getExamBatchStudentSubjectProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate(studentProgressInput))
  .handler(async ({ data, context }): Promise<SubjectProgressDTO> => {
    const sb = context.supabase;
    const enr = await loadApprovedEnrollment(sb, context.userId, data.sessionId);
    await assertSubjectEnrolled(sb, enr.id, data.subjectId);

    const [{ data: subject, error: subjErr }, chapters] = await Promise.all([
      sb.from("exam_batch_subjects").select("id,name").eq("id", data.subjectId).maybeSingle(),
      loadChaptersForSubject(sb, data.subjectId),
    ]);
    if (subjErr) mapSupabaseError(subjErr, "subject-progress:subject");
    if (!subject) throw errors.notFound("Subject");

    const exams = await loadExamsForSubject(sb, enr.session_id, data.subjectId, chapters.map((c) => c.id));
    const { attempts, results } = await loadAttemptsAndResults(
      sb,
      context.userId,
      exams.map((e) => e.id),
    );

    const { chapters: chapterProgress, analytics } = computeSubjectProgress({
      chapters,
      exams,
      attempts,
      results,
    });

    return {
      subject: { id: subject.id as string, name: subject.name as string },
      chapters: chapterProgress,
      analytics,
    };
  });

// ---------------------------------------------------------------------------
// ADMIN — filters (sessions / subjects / chapters)
// ---------------------------------------------------------------------------

const adminFiltersInput = z.object({
  sessionId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
});

export type AdminProgressFilters = {
  sessions: Array<{ id: string; title: string }>;
  subjects: SubjectOptionDTO[];
  chapters: Array<{ id: string; name: string; subjectId: string }>;
};

export const adminGetExamBatchSubjectProgressFilters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate(adminFiltersInput))
  .handler(async ({ data, context }): Promise<AdminProgressFilters> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.subject_progress.filters");
    const sb = context.supabase;

    const [sessRes, subjRes] = await Promise.all([
      sb
        .from("exam_batch_sessions")
        .select("id,title,starts_at,status")
        .order("starts_at", { ascending: false })
        .limit(200),
      sb
        .from("exam_batch_subjects")
        .select("id,name,sort_order,status")
        .eq("status", "published")
        .order("sort_order", { ascending: true }),
    ]);
    if (sessRes.error) mapSupabaseError(sessRes.error, "subject-progress:admin-sessions");
    if (subjRes.error) mapSupabaseError(subjRes.error, "subject-progress:admin-subjects");

    let chaptersRaw: any[] = [];
    if (data.subjectId) {
      const { data: chs, error } = await sb
        .from("exam_batch_chapters")
        .select("id,name,subject_id,sort_order,status")
        .eq("subject_id", data.subjectId)
        .eq("status", "published")
        .order("sort_order", { ascending: true });
      if (error) mapSupabaseError(error, "subject-progress:admin-chapters");
      chaptersRaw = chs ?? [];
    }

    return {
      sessions: (sessRes.data ?? []).map((s: any) => ({ id: s.id, title: s.title })),
      subjects: (subjRes.data ?? []).map((s: any) => ({ id: s.id, name: s.name })),
      chapters: chaptersRaw.map((c) => ({ id: c.id, name: c.name, subjectId: c.subject_id })),
    };
  });

// ---------------------------------------------------------------------------
// ADMIN — ranking
// ---------------------------------------------------------------------------

const adminRankingInput = z.object({
  sessionId: z.string().uuid(),
  subjectId: z.string().uuid().optional(),
  chapterId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.number().int().min(1).max(500).default(200),
  offset: z.number().int().min(0).max(100_000).default(0),
});

export type AdminRankingRow = {
  enrollmentId: string;
  userId: string;
  studentId: number | null;
  studentName: string | null;
  studentEmail: string | null;
  subjectId: string | null;
  subjectName: string | null;
  overallProgress: number | null;
  averageScore: number | null;
  completedChapters: number;
  missedChapters: number;
  chaptersNotConducted: number;
  highestScore: number | null;
  lowestScore: number | null;
  totalChapters: number;
};

export type AdminRankingResult = {
  rows: AdminRankingRow[];
  total: number;
  chapterAggregates: AdminChapterAggregate[];
  lastActivityAt: string | null;
  windowDays: number;
};

export type AdminChapterAggregate = {
  chapterId: string;
  chapterName: string;
  subjectId: string;
  subjectName: string | null;
  completed: number;
  missed: number;
  avgScore: number | null;
  studentCount: number;
};

export type AdminRankingExtras = {
  chapterAggregates: AdminChapterAggregate[];
  lastActivityAt: string | null;
};

export const adminListExamBatchSubjectProgressRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate(adminRankingInput))
  .handler(async ({ data, context }): Promise<AdminRankingResult> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.subject_progress.ranking");
    const sb = context.supabase;

    // 1. Enrolled approved students in the session (optionally filtered by subject).
    let enrIds: string[] | null = null;
    if (data.subjectId) {
      const { data: links, error } = await sb
        .from("exam_batch_enrollment_subjects")
        .select("enrollment_id")
        .eq("subject_id", data.subjectId);
      if (error) mapSupabaseError(error, "subject-progress:admin-enrollment-links");
      enrIds = Array.from(new Set((links ?? []).map((r: any) => r.enrollment_id as string)));
      if (enrIds.length === 0) return { rows: [], total: 0 };
    }

    let eq = sb
      .from("exam_batch_enrollments")
      .select("id,user_id,student_id,session_id,status")
      .eq("session_id", data.sessionId)
      .eq("status", "approved");
    if (enrIds) eq = eq.in("id", enrIds);
    const { data: enrollments, error: eErr } = await eq;
    if (eErr) mapSupabaseError(eErr, "subject-progress:admin-enrollments");
    const enrList = (enrollments ?? []) as Array<{
      id: string; user_id: string; student_id: number | null; session_id: string;
    }>;
    if (enrList.length === 0) return { rows: [], total: 0 };

    // 2. Determine target subjects (per enrollment).
    let targetSubjectIds: string[] = [];
    let enrollmentSubjectMap = new Map<string, string[]>();
    if (data.subjectId) {
      targetSubjectIds = [data.subjectId];
      for (const e of enrList) enrollmentSubjectMap.set(e.id, [data.subjectId]);
    } else {
      const { data: links, error } = await sb
        .from("exam_batch_enrollment_subjects")
        .select("enrollment_id,subject_id")
        .in("enrollment_id", enrList.map((e) => e.id));
      if (error) mapSupabaseError(error, "subject-progress:admin-links");
      for (const l of (links ?? []) as Array<{ enrollment_id: string; subject_id: string }>) {
        const bucket = enrollmentSubjectMap.get(l.enrollment_id) ?? [];
        bucket.push(l.subject_id);
        enrollmentSubjectMap.set(l.enrollment_id, bucket);
      }
      targetSubjectIds = Array.from(new Set(
        Array.from(enrollmentSubjectMap.values()).flat(),
      ));
      if (targetSubjectIds.length === 0) return { rows: [], total: 0 };
    }

    // 3. Subjects + chapters in one pass.
    const [subjRes, chaptersRes] = await Promise.all([
      sb.from("exam_batch_subjects").select("id,name").in("id", targetSubjectIds),
      sb
        .from("exam_batch_chapters")
        .select("id,subject_id,name,sort_order,status")
        .in("subject_id", targetSubjectIds)
        .eq("status", "published")
        .order("sort_order", { ascending: true }),
    ]);
    if (subjRes.error) mapSupabaseError(subjRes.error, "subject-progress:admin-subject-names");
    if (chaptersRes.error) mapSupabaseError(chaptersRes.error, "subject-progress:admin-chapters");

    const subjNameById = new Map<string, string>();
    for (const s of (subjRes.data ?? []) as any[]) subjNameById.set(s.id, s.name);
    const chaptersBySubject = new Map<string, Array<{ id: string; name: string }>>();
    for (const c of (chaptersRes.data ?? []) as any[]) {
      const bucket = chaptersBySubject.get(c.subject_id) ?? [];
      bucket.push({ id: c.id, name: c.name });
      chaptersBySubject.set(c.subject_id, bucket);
    }

    // 4. Exams in the session for the target subjects (optionally chapter-filtered).
    let examQ = sb
      .from("exam_batch_exams")
      .select("id,subject_id,chapter_id,window_start,window_end,force_closed_at,created_at")
      .eq("session_id", data.sessionId)
      .in("subject_id", targetSubjectIds)
      .eq("is_published", true)
      .eq("is_hidden", false)
      .eq("is_archived", false)
      .eq("status", "active");
    if (data.chapterId) examQ = examQ.eq("chapter_id", data.chapterId);
    const { data: examRows, error: examErr } = await examQ;
    if (examErr) mapSupabaseError(examErr, "subject-progress:admin-exams");
    const allExams = (examRows ?? []) as Array<ExamRow & { subject_id: string }>;
    const examsBySubject = new Map<string, ExamRow[]>();
    for (const e of allExams) {
      const bucket = examsBySubject.get(e.subject_id) ?? [];
      bucket.push(e);
      examsBySubject.set(e.subject_id, bucket);
    }
    const allExamIds = allExams.map((e) => e.id);

    // 5. All attempts + results for those exams across all enrolled students.
    const userIds = enrList.map((e) => e.user_id);
    let attempts: AttemptRow[] = [];
    let results: ResultRow[] = [];
    if (allExamIds.length > 0 && userIds.length > 0) {
      const cutoff = windowCutoffISO();
      const { data: attRaw, error: aErr } = await sb
        .from("exam_batch_attempts")
        .select("id,exam_id,user_id,status,submitted_at")
        .in("exam_id", allExamIds)
        .in("user_id", userIds)
        .gte("submitted_at", cutoff);
      if (aErr) mapSupabaseError(aErr, "subject-progress:admin-attempts");
      attempts = (attRaw ?? []) as any[];
      if (attempts.length > 0) {
        const { data: rRaw, error: rErr } = await sb
          .from("exam_batch_attempt_results")
          .select("attempt_id,exam_id,user_id,percentage,submitted_at")
          .in("attempt_id", attempts.map((a) => a.id));
        if (rErr) mapSupabaseError(rErr, "subject-progress:admin-results");
        results = (rRaw ?? []) as any[];
      }
    }
    const attemptsByUser = new Map<string, AttemptRow[]>();
    for (const a of attempts as Array<AttemptRow & { user_id: string }>) {
      const bucket = attemptsByUser.get(a.user_id) ?? [];
      bucket.push(a);
      attemptsByUser.set(a.user_id, bucket);
    }
    const resultsByUser = new Map<string, ResultRow[]>();
    for (const r of results as Array<ResultRow & { user_id: string }>) {
      const bucket = resultsByUser.get(r.user_id) ?? [];
      bucket.push(r);
      resultsByUser.set(r.user_id, bucket);
    }

    // Chapter-level batch aggregates (across all students in the ranking).
    // Built while we compute per-student progress so no extra queries.
    const chapterAggMap = new Map<string, {
      chapterId: string; chapterName: string; subjectId: string;
      completed: number; missed: number; scoreSum: number; scoreCount: number; studentIds: Set<string>;
    }>();
    let lastActivityTs: number | null = null;

    // 6. Compute per-student per-subject aggregate. When subjectId is set,
    //    each row corresponds to that subject. Otherwise we aggregate the
    //    student's OVERALL progress across every subject they are enrolled
    //    in (mean of subject overalls) so the ranking table can render.
    const rows: AdminRankingRow[] = enrList.map((e) => {
      const subjectIds = enrollmentSubjectMap.get(e.id) ?? [];
      const userAttempts = attemptsByUser.get(e.user_id) ?? [];
      const userResults = resultsByUser.get(e.user_id) ?? [];

      const perSubject = subjectIds.map((sid) => {
        const chs = chaptersBySubject.get(sid) ?? [];
        const exs = examsBySubject.get(sid) ?? [];
        const examIdSet = new Set(exs.map((x) => x.id));
        const filteredAtt = userAttempts.filter((a) => examIdSet.has(a.exam_id));
        const filteredRes = userResults.filter((r) => examIdSet.has(r.exam_id));
        const progress = computeSubjectProgress({
          chapters: chs,
          exams: exs,
          attempts: filteredAtt,
          results: filteredRes,
        });
        // Fold per-chapter contribution into the batch aggregate.
        for (const ch of progress.chapters) {
          const agg = chapterAggMap.get(ch.id) ?? {
            chapterId: ch.id,
            chapterName: ch.name,
            subjectId: sid,
            completed: 0,
            missed: 0,
            scoreSum: 0,
            scoreCount: 0,
            studentIds: new Set<string>(),
          };
          agg.studentIds.add(e.user_id);
          if (ch.status === "completed") agg.completed += 1;
          if (ch.status === "missed") agg.missed += 1;
          if (typeof ch.latestScore === "number") {
            agg.scoreSum += ch.latestScore;
            agg.scoreCount += 1;
          }
          chapterAggMap.set(ch.id, agg);
        }
        if (progress.analytics.lastUpdatedAt) {
          const t = new Date(progress.analytics.lastUpdatedAt).getTime();
          if (Number.isFinite(t)) lastActivityTs = lastActivityTs == null ? t : Math.max(lastActivityTs, t);
        }
        return progress;
      });

      const totalChapters = perSubject.reduce((s, x) => s + x.chapters.length, 0);
      const completedChapters = perSubject.reduce((s, x) => s + x.analytics.completedChapters, 0);
      const missedChapters = perSubject.reduce((s, x) => s + x.analytics.missedChapters, 0);
      const chaptersNotConducted = perSubject.reduce((s, x) => s + x.analytics.chaptersWithNoExam, 0);

      // Overall = mean of subject overall progresses (subjects w/o completions skipped)
      const overalls = perSubject
        .map((x) => x.analytics.overallProgress)
        .filter((v): v is number => typeof v === "number");
      const overall = overalls.length
        ? Math.round((overalls.reduce((s, v) => s + v, 0) / overalls.length) * 100) / 100
        : null;

      let highest: number | null = null;
      let lowest: number | null = null;
      for (const p of perSubject) {
        if (p.analytics.highestScore != null)
          highest = highest == null ? p.analytics.highestScore : Math.max(highest, p.analytics.highestScore);
        if (p.analytics.lowestScore != null)
          lowest = lowest == null ? p.analytics.lowestScore : Math.min(lowest, p.analytics.lowestScore);
      }

      return {
        enrollmentId: e.id,
        userId: e.user_id,
        studentId: e.student_id,
        studentName: null,
        studentEmail: null,
        subjectId: data.subjectId ?? null,
        subjectName: data.subjectId ? subjNameById.get(data.subjectId) ?? null : null,
        overallProgress: overall,
        averageScore: overall,
        completedChapters,
        missedChapters,
        chaptersNotConducted,
        highestScore: highest,
        lowestScore: lowest,
        totalChapters,
      };
    });

    // 7. Enrich with student profile info (name / email) via existing RPC.
    const { data: profileRows, error: pErr } = await context.supabase.rpc(
      "exam_batch_admin_user_contacts",
      { _ids: userIds },
    );
    if (pErr) mapSupabaseError(pErr, "subject-progress:admin-profiles");
    const profileMap = new Map<string, { name: string | null; email: string | null }>();
    for (const p of (profileRows ?? []) as any[]) {
      profileMap.set(p.id, { name: p.name ?? null, email: p.email ?? null });
    }
    for (const r of rows) {
      const p = profileMap.get(r.userId);
      r.studentName = p?.name ?? null;
      r.studentEmail = p?.email ?? null;
    }

    // 8. Optional search filter (name / email / student_id).
    let filtered = rows;
    if (data.search) {
      const q = data.search.toLowerCase();
      filtered = rows.filter((r) =>
        (r.studentName?.toLowerCase().includes(q) ?? false) ||
        (r.studentEmail?.toLowerCase().includes(q) ?? false) ||
        (r.studentId != null && String(r.studentId).includes(q)),
      );
    }

    // 9. Rank by overallProgress DESC (nulls last), then studentName ASC.
    filtered.sort((a, b) => {
      const av = a.overallProgress;
      const bv = b.overallProgress;
      if (av == null && bv == null)
        return (a.studentName ?? "").localeCompare(b.studentName ?? "");
      if (av == null) return 1;
      if (bv == null) return -1;
      if (bv !== av) return bv - av;
      return (a.studentName ?? "").localeCompare(b.studentName ?? "");
    });

    const total = filtered.length;
    const page = filtered.slice(data.offset, data.offset + data.limit);

    const chapterAggregates: AdminChapterAggregate[] = Array.from(chapterAggMap.values()).map((a) => ({
      chapterId: a.chapterId,
      chapterName: a.chapterName,
      subjectId: a.subjectId,
      subjectName: subjNameById.get(a.subjectId) ?? null,
      completed: a.completed,
      missed: a.missed,
      avgScore: a.scoreCount > 0 ? Math.round((a.scoreSum / a.scoreCount) * 100) / 100 : null,
      studentCount: a.studentIds.size,
    }));

    return {
      rows: page,
      total,
      chapterAggregates,
      lastActivityAt: lastActivityTs == null ? null : new Date(lastActivityTs).toISOString(),
      windowDays: ANALYTICS_WINDOW_DAYS,
    };
  });

// ---------------------------------------------------------------------------
// ADMIN — single-student subject progress (details drawer)
// ---------------------------------------------------------------------------

const adminStudentProgressInput = z.object({
  enrollmentId: z.string().uuid(),
  subjectId: z.string().uuid(),
});

export const adminGetExamBatchStudentSubjectProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validate(adminStudentProgressInput))
  .handler(async ({ data, context }): Promise<SubjectProgressDTO & {
    student: { userId: string; studentId: number | null; name: string | null; email: string | null };
  }> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.subject_progress.detail");
    const sb = context.supabase;

    const { data: enr, error: eErr } = await sb
      .from("exam_batch_enrollments")
      .select("id,user_id,student_id,session_id,status")
      .eq("id", data.enrollmentId)
      .maybeSingle();
    if (eErr) mapSupabaseError(eErr, "subject-progress:admin-detail-enrollment");
    if (!enr) throw errors.notFound("Enrollment");

    // subject must be in this enrollment's selected subjects
    const { data: link, error: lErr } = await sb
      .from("exam_batch_enrollment_subjects")
      .select("subject_id")
      .eq("enrollment_id", enr.id)
      .eq("subject_id", data.subjectId)
      .maybeSingle();
    if (lErr) mapSupabaseError(lErr, "subject-progress:admin-detail-link");
    if (!link) throw errors.invalidState("Student is not enrolled in this subject.");

    const [{ data: subject, error: sErr }, chapters] = await Promise.all([
      sb.from("exam_batch_subjects").select("id,name").eq("id", data.subjectId).maybeSingle(),
      loadChaptersForSubject(sb, data.subjectId),
    ]);
    if (sErr) mapSupabaseError(sErr, "subject-progress:admin-detail-subject");
    if (!subject) throw errors.notFound("Subject");

    const exams = await loadExamsForSubject(sb, enr.session_id as string, data.subjectId, chapters.map((c) => c.id));
    const { attempts, results } = await loadAttemptsAndResults(
      sb,
      enr.user_id as string,
      exams.map((e) => e.id),
    );
    const { chapters: chapterProgress, analytics } = computeSubjectProgress({
      chapters,
      exams,
      attempts,
      results,
    });

    // Student profile (name/email)
    const { data: profileRows, error: pErr } = await context.supabase.rpc(
      "exam_batch_admin_user_contacts",
      { _ids: [enr.user_id] },
    );
    if (pErr) mapSupabaseError(pErr, "subject-progress:admin-detail-profile");
    const profile = (profileRows ?? [])[0] as { name?: string | null; email?: string | null } | undefined;

    return {
      subject: { id: subject.id as string, name: subject.name as string },
      chapters: chapterProgress,
      analytics,
      student: {
        userId: enr.user_id as string,
        studentId: (enr.student_id as number | null) ?? null,
        name: profile?.name ?? null,
        email: profile?.email ?? null,
      },
    };
  });

// Empty analytics helper exported for the UI shell so it can render the ring
// while loading without inventing values.
export const EMPTY_SUBJECT_ANALYTICS: SubjectAnalyticsDTO = emptyAnalytics();