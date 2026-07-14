// Shared Zod schemas + TypeScript types for the Exam Batch backend.
// Kept isolated in `src/lib/exam-batch/`; do not import from Mock Test,
// Quiz, MCQ or other modules — Exam Batch owns its own contract.

import { z } from "zod";

// ---------- Primitives ----------
export const uuid = z.string().uuid();
export const uuidArray = z.array(uuid).min(1).max(500); // cap bulk operations
export const levelCode = z.string().trim().min(1).max(40);
export const shortText = z.string().trim().min(1).max(200);
export const longText = z.string().trim().max(2_000);

export const sessionStatus = z.enum(["active", "inactive"]);
export const enrollmentStatus = z.enum(["pending", "approved", "rejected", "banned"]);

export type SessionStatus = z.infer<typeof sessionStatus>;
export type EnrollmentStatus = z.infer<typeof enrollmentStatus>;

// ---------- Session schemas ----------
export const sessionCreateSchema = z.object({
  title: shortText,
  subtitle: shortText.optional(),
  level: levelCode,
  startsAt: z.string().datetime(),
  registrationDeadline: z.string().datetime().optional().nullable(),
  status: sessionStatus.default("active"),
  registrationOpen: z.boolean().default(true),
  isHidden: z.boolean().default(false),
});

export const sessionUpdateSchema = sessionCreateSchema.partial().extend({
  id: uuid,
});

export const sessionIdOnly = z.object({ id: uuid });
export const sessionSetBool = z.object({ id: uuid, value: z.boolean() });

// ---------- Enrollment schemas ----------
export const enrollSchema = z.object({
  sessionId: uuid,
  subjectIds: z.array(uuid).min(1).max(50),
});

export const enrollmentIdsSchema = z.object({
  enrollmentIds: uuidArray,
  notes: longText.optional(),
});

export const enrollmentIdOnly = z.object({ enrollmentId: uuid });

export const enrollmentSubjectMutationSchema = z.object({
  enrollmentId: uuid,
  subjectId: uuid,
});

export const enrollmentSubjectsBulkSchema = z.object({
  enrollmentId: uuid,
  subjectIds: z.array(uuid).min(1).max(100),
});


// ---------- Filters ----------
export const adminEnrollmentListSchema = z.object({
  sessionId: uuid.optional(),
  subjectId: uuid.optional(),
  status: enrollmentStatus.optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export const adminEnrollmentCountsSchema = z.object({
  sessionId: uuid.optional(),
  subjectId: uuid.optional(),
});

// ---------- Row shapes returned to the client ----------
export type ExamBatchSessionRow = {
  id: string;
  title: string;
  subtitle: string | null;
  level: string;
  starts_at: string;
  registration_deadline: string | null;
  status: SessionStatus;
  registration_open: boolean;
  is_archived: boolean;
  is_hidden: boolean;
  subjects_count: number;
  created_at: string;
  updated_at: string;
};

export type ExamBatchEnrollmentRow = {
  id: string;
  session_id: string;
  user_id: string;
  status: EnrollmentStatus;
  student_id: number | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// Enriched row used by the admin queue / student list — includes profile,
// session and subject info denormalised at query time so the UI can render
// name / email / subjects / session / reviewer without extra fetches.
export type ExamBatchEnrollmentEnrichedRow = ExamBatchEnrollmentRow & {
  student_name: string | null;
  student_email: string | null;
  session_title: string | null;
  subject_ids: string[];
  subject_names: string[];
  reviewer_name: string | null;
};

export const enrollmentSetStatusSchema = z.object({
  enrollmentId: uuid,
  status: enrollmentStatus,
  notes: longText.optional(),
});

// ---------- Access flags returned by the permissions probe ----------
export type ExamBatchAccess = {
  enrolled: boolean;
  status: EnrollmentStatus | null;
  studentId: number | null;
  canAccessDashboard: boolean;
  canTakeExams: boolean;
  canViewLeaderboard: boolean;
  canViewProgress: boolean;
};
