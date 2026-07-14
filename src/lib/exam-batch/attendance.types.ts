// Shared Zod schemas + TypeScript types for the Exam Batch **Attendance
// Enforcement** system — Session + Subject scoped.
//
// This system is fully isolated inside the Exam Batch module. A student
// who is "attendance-banned" here remains a fully active website user
// (Auth, Dashboard, MCQ Practice, Quiz, Mock Test, Flash Cards, Question
// Bank, Short Notes, Video Classes, Daily Progress, Profile,
// Notifications). Only Exam Batch routes read this state and refuse
// access.
//
// Every counter, ban and event is keyed by
//   (user_id, session_id, subject_id)
// so a miss streak in one (session, subject) never affects any other
// (session, subject). A new session always starts from zero.

import { z } from "zod";
import { uuid } from "./types";

// ---------- Admin settings (persisted inside exam_batch_settings.value.attendance) ----------

export const attendanceSettingsSchema = z.object({
  // Total missed exam limit per (session,subject) before an auto-ban fires.
  // 0 disables total-miss auto-ban.
  missedExamLimit: z.number().int().min(0).max(500).optional(),
  // Consecutive missed exam limit per (session,subject) before an auto-ban
  // fires. 0 disables auto-ban.
  consecutiveMissLimit: z.number().int().min(0).max(50).optional(),
  // Attendance percentage floor (0-100). Any (user,session,subject) whose
  // attendance drops below this % after an exam ends will be auto-banned
  // if auto-ban is enabled. 0 disables the % rule.
  attendancePercentThreshold: z.number().int().min(0).max(100).optional(),
  // How many days an auto-ban lasts. 0 = permanent.
  autoBanDurationDays: z.number().int().min(0).max(3650).optional(),
  autoBanEnabled: z.boolean().optional(),
  // How many misses before the limit a student is considered "near ban".
  nearBanOffset: z.number().int().min(0).max(20).optional(),
  banTitle: z.string().trim().max(200).optional().nullable(),
  banMessage: z.string().trim().max(4_000).optional().nullable(),
  suggestedAction: z.string().trim().max(1_000).optional().nullable(),
  supportContact: z.string().trim().max(500).optional().nullable(),
  supportRequired: z.boolean().optional(),
});

export type AttendanceSettings = z.infer<typeof attendanceSettingsSchema>;

export const DEFAULT_ATTENDANCE_SETTINGS: Required<{
  [K in keyof AttendanceSettings]: NonNullable<AttendanceSettings[K]>;
}> = {
  missedExamLimit: 10,
  consecutiveMissLimit: 3,
  attendancePercentThreshold: 0,
  autoBanDurationDays: 0,
  autoBanEnabled: true,
  nearBanOffset: 1,
  banTitle: "Exam Batch Access Suspended",
  banMessage:
    "You have missed too many consecutive exams for this subject in this session. According to the Exam Batch rules your Exam Batch access has been temporarily suspended. Please contact us through WhatsApp or Live Chat for assistance.",
  suggestedAction:
    "Please contact support through WhatsApp or Live Chat to review your case and request Exam Batch access restoration.",
  supportContact: "",
  supportRequired: true,
};

// ---------- Scope ----------

export const attendanceScope = z.object({
  userId: uuid,
  sessionId: uuid,
  subjectId: uuid,
});

export type AttendanceScope = z.infer<typeof attendanceScope>;

// ---------- State row (one per user + session + subject) ----------

export interface AttendanceState {
  userId: string;
  sessionId: string;
  subjectId: string;
  consecutiveMissedCount: number;
  lastMissedExamId: string | null;
  lastMissedAt: string | null;
  lastAttendedExamId: string | null;
  lastAttendedAt: string | null;
  banned: boolean;
  bannedAt: string | null;
  bannedReason: string | null;
  bannedBy: string | null;
  bannedUntil: string | null;
  autoBanned: boolean;
  updatedAt: string | null;
}

// ---------- Access decision returned to the UI ----------

export interface ExamBatchBanInfo {
  sessionId: string;
  subjectId: string;
  sessionTitle: string | null;
  subjectName: string | null;
  reason: string;
  consecutiveMissedCount: number;
  limit: number;
  banDate: string;
  bannedUntil: string | null;
  autoBanned: boolean;
  title: string;
  message: string;
  suggestedAction: string;
  supportContact: string;
  whatsappContact: string | null;
  whatsappButtonText: string | null;
  supportRequired: boolean;
}

export interface ExamBatchAccessDecision {
  allowed: boolean;
  reason: "ok" | "banned" | "hidden" | "guest";
  banned: boolean;
  activeBanCount: number;
  ban: ExamBatchBanInfo | null;
  bans: ExamBatchBanInfo[];
  supportRequired: boolean;
  whatsappContact: string | null;
  whatsappButtonText: string | null;
}

// ---------- Admin action inputs ----------

export const attendanceManualBanSchema = attendanceScope.extend({
  reason: z.string().trim().min(1).max(1_000),
  // 0 / null / undefined = permanent ban. When both are supplied,
  // `bannedUntil` wins so the admin can pick a custom future date.
  durationDays: z.number().int().min(0).max(3650).optional().nullable(),
  bannedUntil: z.string().datetime().optional().nullable(),
});

export const attendanceUnbanSchema = attendanceScope.extend({
  reason: z.string().trim().max(1_000).optional().nullable(),
  resetCounter: z.boolean().default(true),
});

export const attendanceSetCounterSchema = attendanceScope.extend({
  value: z.number().int().min(0).max(1_000),
  reason: z.string().trim().max(1_000).optional().nullable(),
});

export const attendanceAdjustCounterSchema = attendanceScope.extend({
  delta: z
    .number()
    .int()
    .min(-1_000)
    .max(1_000)
    .refine((v) => v !== 0, { message: "delta must be non-zero" }),
  reason: z.string().trim().max(1_000).optional().nullable(),
});

export const attendanceProcessExamSchema = z.object({
  examId: uuid,
});

export const attendanceHistoryFilterSchema = z.object({
  userId: uuid.optional(),
  sessionId: uuid.optional(),
  subjectId: uuid.optional(),
  kind: z
    .enum([
      "missed",
      "attended",
      "counter.increment",
      "counter.decrement",
      "counter.set",
      "counter.reset",
      "auto_ban",
      "manual_ban",
      "manual_unban",
    ])
    .optional(),
  limit: z.number().int().min(1).max(500).default(100),
  cursor: z.string().datetime().optional(),
});

export const attendanceListFilterSchema = z.object({
  sessionId: uuid.optional(),
  subjectId: uuid.optional(),
  userId: uuid.optional(),
  onlyBanned: z.boolean().default(false),
  onlyNearLimit: z.boolean().default(false),
  attendanceStatus: z.enum(["any", "good", "warning", "poor"]).default("any"),
  minCount: z.number().int().min(0).max(1_000).optional(),
  banType: z.enum(["auto", "manual", "any"]).default("any"),
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(1_000).default(100),
  offset: z.number().int().min(0).max(100_000).default(0),
});

export const attendanceBulkSchema = z.object({
  items: z
    .array(attendanceScope)
    .min(1)
    .max(500),
  reason: z.string().trim().max(1_000).optional().nullable(),
  resetCounter: z.boolean().default(true),
});

export const attendanceExportSchema = attendanceListFilterSchema.extend({
  // Cap export payloads to keep the RPC snappy.
  limit: z.number().int().min(1).max(10_000).default(5_000),
});

// ---------- Event / history row ----------

export type AttendanceEventKind =
  | "missed"
  | "attended"
  | "counter.increment"
  | "counter.decrement"
  | "counter.set"
  | "counter.reset"
  | "auto_ban"
  | "manual_ban"
  | "manual_unban";

export interface AttendanceEvent {
  id: string;
  userId: string;
  sessionId: string | null;
  subjectId: string | null;
  kind: AttendanceEventKind;
  examId: string | null;
  previousCount: number | null;
  newCount: number | null;
  reason: string | null;
  actorId: string | null;
  createdAt: string;
}

// ---------- Admin dashboard / reports ----------

export interface AttendanceStateWithProfile extends AttendanceState {
  sessionTitle: string | null;
  subjectName: string | null;
  currentSession: string | null;
  currentLevel: string | null;
  studentName: string | null;
  studentEmail: string | null;
  studentId: number | null;
  approvedStatus: string | null;
  totalExams: number;
  attendedExams: number;
  missedExams: number;
  attendancePercentage: number;
}

export interface AttendanceDashboardSummary {
  limit: number;
  autoBanEnabled: boolean;
  nearBanOffset: number;
  currentlyBanned: number;
  autoBans: number;
  manualBans: number;
  nearLimit: number;
  bannedLast7d: number;
  unbannedLast7d: number;
  recoveredLast30d: number;
  recentBans: AttendanceStateWithProfile[];
  recentUnbans: AttendanceStateWithProfile[];
  nearLimitStudents: AttendanceStateWithProfile[];
}

export interface AttendanceReportRow {
  sessionId: string;
  sessionTitle: string | null;
  subjectId: string;
  subjectName: string | null;
  totalStudents: number;
  totalBanned: number;
  autoBanned: number;
  manualBanned: number;
  averageMissed: number;
  maxMissed: number;
}

export interface AttendanceReports {
  bySession: AttendanceReportRow[];
  bySubject: AttendanceReportRow[];
  totals: {
    banned: number;
    autoBans: number;
    manualBans: number;
    recovered: number;
    averageMissed: number;
    trackedScopes: number;
  };
}

export interface AttendanceBulkResult {
  requested: number;
  processed: number;
  skipped: number;
  failed: number;
  errors: Array<{ userId: string; sessionId: string; subjectId: string; message: string }>;
}

export interface AttendanceProcessResult {
  processed: number;
  autoBanned: number;
  reset: number;
}
