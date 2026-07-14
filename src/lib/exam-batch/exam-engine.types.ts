// Shared Zod schemas + TypeScript types for the Exam Batch **Exam Engine**.
// Isolated from Mock Test / Quiz / MCQ Practice.

import { z } from "zod";
import { uuid } from "./types";

// ---------- Enums ----------
export const examStatus = z.enum(["active", "inactive"]);
export type ExamStatus = z.infer<typeof examStatus>;

export const attemptStatus = z.enum([
  "in_progress",
  "submitted",
  "auto_submitted",
  "timed_out",
  "admin_closed",
]);
export type AttemptStatus = z.infer<typeof attemptStatus>;

export const submitReason = z.enum(["manual", "auto", "timeout", "admin"]);
export type SubmitReason = z.infer<typeof submitReason>;

// ---------- Exam CRUD ----------
export const examCreateSchema = z.object({
  sessionId: uuid,
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(200).optional(),
  level: z.string().trim().min(1).max(40),
  subjectId: uuid,
  chapterId: uuid.optional().nullable(),
  durationMinutes: z.number().int().min(1).max(24 * 60),
  totalQuestions: z.number().int().min(1).max(500),
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
  availableBefore: z.number().int().min(0).max(24 * 60).default(15), // minutes
  upcomingBefore: z.number().int().min(0).max(30 * 24 * 60).default(60 * 24), // minutes
  randomizeQuestions: z.boolean().default(true),
  randomizeOptions: z.boolean().default(true),
  status: examStatus.default("active"),
  isPublished: z.boolean().default(false),
  isHidden: z.boolean().default(false),
});

export const examUpdateSchema = examCreateSchema.partial().extend({ id: uuid });
export const examIdOnly = z.object({ id: uuid });
export const examSetBool = z.object({ id: uuid, value: z.boolean() });

// Attach question ids (drawn from an admin-side picker filtered by level+subject+chapter).
export const examSetQuestionsSchema = z.object({
  examId: uuid,
  questionIds: z.array(uuid).min(1).max(500),
});

// ---------- Attempt lifecycle ----------
export const attemptStartSchema = z.object({ examId: uuid });
export const attemptIdOnly = z.object({ attemptId: uuid });
export const attemptStateSchema = z.object({
  attemptId: uuid,
  index: z.number().int().min(0).max(499).optional(),
});

export const answerSaveSchema = z.object({
  attemptId: uuid,
  questionId: uuid,
  // We store the *displayed* option index the student picked. The attempt's
  // per-question option-order map lets the server resolve the true answer at
  // scoring time without exposing the correct index to the client.
  selectedDisplayIndex: z.number().int().min(0).max(15).nullable(),
});

// ---------- Row shapes ----------
export type ExamBatchExamRow = {
  id: string;
  session_id: string;
  title: string;
  subtitle: string | null;
  level: string;
  subject_id: string;
  chapter_id: string | null;
  duration_minutes: number;
  total_questions: number;
  window_start: string;
  window_end: string;
  available_before_minutes: number;
  upcoming_before_minutes: number;
  randomize_questions: boolean;
  randomize_options: boolean;
  status: ExamStatus;
  is_published: boolean;
  is_archived: boolean;
  is_hidden: boolean;
  force_closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ExamBatchAttemptRow = {
  id: string;
  exam_id: string;
  user_id: string;
  status: AttemptStatus;
  started_at: string;
  expected_finish_at: string;
  submitted_at: string | null;
  submit_reason: SubmitReason | null;
  created_at: string;
  updated_at: string;
};

export type ExamAvailability =
  | "upcoming"       // outside upcomingBefore -> hidden entirely
  | "announced"      // inside upcomingBefore but before availableBefore
  | "available"      // inside availableBefore but before windowStart
  | "live"           // windowStart <= now <= windowEnd
  | "ended"          // now > windowEnd
  | "closed";        // force_closed_at is set

export type ExamPublicMeta = {
  id: string;
  sessionId: string;
  title: string;
  subtitle: string | null;
  level: string;
  subjectId: string;
  subjectName?: string | null;
  sessionTitle?: string | null;
  chapterId: string | null;
  chapterName?: string | null;

  durationMinutes: number;
  totalQuestions: number;
  windowStart: string;
  windowEnd: string;
  availability: ExamAvailability;
  serverTime: string; // clients must render countdowns against this, not local clock
};


// The question shape returned to students. `correctIndex` is NEVER included.
export type AttemptQuestionView = {
  index: number;             // display position in this attempt
  questionId: string;
  text: string;
  options: string[];         // already shuffled per this attempt
  selectedDisplayIndex: number | null;
};

export type AttemptStateView = {
  attempt: {
    id: string;
    examId: string;
    status: AttemptStatus;
    startedAt: string;
    expectedFinishAt: string;
    submittedAt: string | null;
    remainingSeconds: number; // clamped >= 0
    serverTime: string;
  };
  question: AttemptQuestionView | null; // null when index out of range
  totalQuestions: number;
};
