// Shared Zod schemas + TypeScript types for the Exam Batch **Result Engine**,
// Ranking, Leaderboard, Progress and Analytics surfaces. Fully isolated from
// Mock Test / Quiz / MCQ Practice / Daily Progress.

import { z } from "zod";
import { uuid } from "./types";

// ---------- Input schemas ----------
export const attemptIdInput = z.object({ attemptId: uuid });
export const examIdInput = z.object({ examId: uuid });
export const sessionScopeInput = z.object({ sessionId: uuid.optional() });

export const leaderboardStudentInput = z.object({ examId: uuid });
export const leaderboardAdminInput = z.object({
  examId: uuid,
  search: z.string().trim().max(120).optional(),
  offset: z.number().int().min(0).max(1_000_000).default(0),
  limit: z.number().int().min(1).max(1000).default(200),
});

export const historyInput = z.object({
  sessionId: uuid.optional(),
  subjectId: uuid.optional(),
  chapterId: uuid.optional(),
  examId: uuid.optional(),
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(100).default(25),
});


export const progressWindowInput = z.object({
  window: z.enum(["daily", "weekly", "30d"]).default("30d"),
});

export const analyticsScopeInput = z.object({
  sessionId: uuid.optional(),
  examId: uuid.optional(),
});

export const recalcInput = z.object({
  examId: uuid.optional(),
  sessionId: uuid.optional(),
  scope: z.enum(["leaderboard", "analytics", "progress", "all"]).default("all"),
});

// ---------- Row shapes ----------
export type ExamBatchAttemptResultRow = {
  attempt_id: string;
  exam_id: string;
  user_id: string;
  student_id: number | null;
  correct: number;
  wrong: number;
  skipped: number;
  total_questions: number;
  marks: number;
  max_marks: number;
  percentage: number; // 0..100, 2 dp
  time_used_seconds: number;
  duration_seconds: number;
  submitted_at: string;
  scored_at: string;
};

export type ExamBatchLeaderboardRow = {
  exam_id: string;
  session_id: string;
  status: "pending" | "generating" | "frozen";
  generated_at: string | null;
  frozen_at: string | null;
  entry_count: number;
  version: number;
};

export type ExamBatchLeaderboardEntryRow = {
  exam_id: string;
  attempt_id: string;
  user_id: string;
  student_id: number;
  rank: number;
  marks: number;
  max_marks: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  time_used_seconds: number;
  submitted_at: string;
};

// ---------- View shapes returned to clients ----------
export type ResultVisibility = {
  marks: number;
  maxMarks: number;
  correct: number;
  wrong: number;
  skipped: number;
  totalQuestions: number;
  percentage: number;
  timeUsedSeconds: number;
  durationSeconds: number;
  submittedAt: string;
  // Rank/position are gated by the exam window ending.
  rankVisible: boolean;
  rank: number | null;
  entryCount: number | null;
};

export type StudentLeaderboardView = {
  exam: {
    id: string;
    title: string;
    windowEnd: string;
    frozenAt: string | null;
    status: ExamBatchLeaderboardRow["status"];
    visibleUntil: string | null; // frozenAt + 24h
    isVisibleToStudent: boolean;
    entryCount: number;
  };
  top: Array<{
    rank: number;
    studentId: number;
    marks: number;
    maxMarks: number;
    percentage: number;
    correct: number;
    wrong: number;
    skipped: number;
    timeUsedSeconds: number;
    isSelf: boolean;
  }>;
  self: {
    rank: number;
    studentId: number;
    marks: number;
    maxMarks: number;
    percentage: number;
    correct: number;
    wrong: number;
    skipped: number;
    timeUsedSeconds: number;
  } | null;
};

export type AdminLeaderboardView = {
  exam: {
    id: string;
    title: string;
    sessionId: string;
    windowEnd: string;
    frozenAt: string | null;
    status: ExamBatchLeaderboardRow["status"];
    entryCount: number;
    version: number;
  };
  entries: Array<
    ExamBatchLeaderboardEntryRow & { display_name: string | null; email: string | null }
  >;
  total: number;
  offset: number;
  limit: number;
};

export type ProgressSummary = {
  window: "daily" | "weekly" | "30d";
  examsScheduled: number;
  examsAttended: number;
  attendanceRate: number; // 0..100
  completionRate: number; // 0..100 — submitted / attended
  averageMarks: number;
  averagePercentage: number;
  highestPercentage: number;
  lowestPercentage: number;
  accuracy: number; // correct / answered * 100
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  totalAttempted: number; // correct + wrong (answered questions)
  timeSpentSeconds: number;
  bestRank: number | null;
  trend: Array<{ submittedAt: string; percentage: number }>; // most recent 12
  updatedAt: string;
};

export type ExamAnalytics = {
  examId: string;
  title: string;
  windowStart: string;
  windowEnd: string;
  participation: number; // attempts started / eligible enrollments
  completion: number; // submitted / started
  averagePercentage: number;
  highestPercentage: number;
  lowestPercentage: number;
  averageTimeSeconds: number;
  totalAttempts: number;
  totalSubmitted: number;
  eligibleStudents: number;
};

export type SubjectPerformance = {
  subjectId: string;
  examCount: number;
  averagePercentage: number;
  highestPercentage: number;
  totalAttempts: number;
};

export type AnalyticsView = {
  scope: { sessionId: string | null; examId: string | null };
  approvalRate: number;
  eligibleStudents: number;
  approvedStudents: number;
  pendingStudents: number;
  overall: {
    exams: number;
    attempts: number;
    submitted: number;
    averagePercentage: number;
    trend: Array<{ date: string; averagePercentage: number; attempts: number }>;
  };
  exams: ExamAnalytics[];
  subjects: SubjectPerformance[];
  generatedAt: string;
};

export type StudentHistoryItem = {
  attemptId: string | null;
  examId: string;
  sessionId: string;
  title: string;
  subjectId: string;
  subjectName: string | null;
  sessionTitle: string | null;
  level: string | null;
  durationMinutes: number;
  windowStart: string;
  windowEnd: string;
  status: "attended" | "missed" | "in_progress";
  result: ResultVisibility | null;
};
