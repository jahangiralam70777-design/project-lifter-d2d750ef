// Shared Zod schemas + TypeScript types for the Exam Batch **Settings**,
// **Dynamic Content**, **Module Visibility**, **Comment Rules** and
// **Export** surfaces. Fully isolated from other modules.

import { z } from "zod";
import { uuid } from "./types";

// ---------- Settings (module-wide, singleton row) ----------
// Every field is optional so the admin UI can patch a subset. The server
// merges the patch onto the current row and re-persists it.

export const generalSettingsSchema = z.object({
  organizationName: z.string().trim().min(1).max(200).optional(),
  logoUrl: z.string().trim().max(500).optional().nullable(),
  websiteUrl: z.string().trim().max(500).optional().nullable(),
  helpText: z.string().trim().max(4_000).optional().nullable(),
  emptyStateMessage: z.string().trim().max(1_000).optional().nullable(),
  successMessage: z.string().trim().max(1_000).optional().nullable(),
});

export const enrollmentSettingsSchema = z.object({
  enrollmentInstructions: z.string().trim().max(4_000).optional().nullable(),
  pendingInstructions: z.string().trim().max(4_000).optional().nullable(),
  approvalMessage: z.string().trim().max(1_000).optional().nullable(),
  autoApprove: z.boolean().optional(),
  maxSubjectsPerStudent: z.number().int().min(0).max(50).optional(),
});

export const approvalSettingsSchema = z.object({
  requireAdminApproval: z.boolean().optional(),
  notifyOnEnrollment: z.boolean().optional(),
  notifyOnApproval: z.boolean().optional(),
});

export const leaderboardSettingsSchema = z.object({
  studentTopN: z.number().int().min(1).max(500).optional(),
  studentVisibilityHours: z.number().int().min(1).max(24 * 30).optional(),
  adminRetentionDays: z.number().int().min(1).max(365).optional(),
  showPercentage: z.boolean().optional(),
  showTimeUsed: z.boolean().optional(),
});

export const countdownSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  label: z.string().trim().max(120).optional().nullable(),
  sessionText: z.string().trim().max(120).optional().nullable(),
  levelText: z.string().trim().max(120).optional().nullable(),
  targetIso: z.string().datetime().optional().nullable(),
  showOnDashboard: z.boolean().optional(),
});


export const exportSettingsSchema = z.object({
  defaultTopN: z.number().int().min(1).max(10_000).optional(),
  footerText: z.string().trim().max(500).optional().nullable(),
  includeLogo: z.boolean().optional(),
  includeLinks: z.boolean().optional(),
  includeComments: z.boolean().optional(),
});

export const themeSettingsSchema = z.object({
  accentColor: z.string().trim().max(20).optional().nullable(),
  gradientFrom: z.string().trim().max(20).optional().nullable(),
  gradientTo: z.string().trim().max(20).optional().nullable(),
  darkMode: z.enum(["auto", "light", "dark"]).optional(),
});

export const visibilitySettingsSchema = z.object({
  moduleVisible: z.boolean().optional(),
  hiddenReason: z.string().trim().max(500).optional().nullable(),
});

export const contentSettingsSchema = z.object({
  facebookPageUrl: z.string().trim().max(500).optional().nullable(),
  facebookGroupUrl: z.string().trim().max(500).optional().nullable(),
  youtubeChannelUrl: z.string().trim().max(500).optional().nullable(),
  whatsappContact: z.string().trim().max(120).optional().nullable(),
  whatsappButtonText: z.string().trim().max(60).optional().nullable(),
  verificationInstructions: z.string().trim().max(4_000).optional().nullable(),
  pendingTitle: z.string().trim().max(200).optional().nullable(),
  pendingDescription: z.string().trim().max(1_000).optional().nullable(),
  verificationSuccessMessage: z.string().trim().max(500).optional().nullable(),
  verificationHelpText: z.string().trim().max(2_000).optional().nullable(),
  verificationVisible: z.boolean().optional(),
  verificationHiddenMessage: z.string().trim().max(500).optional().nullable(),
});

// Full settings patch — supports partial updates across every sub-group.
export const settingsPatchSchema = z.object({
  general: generalSettingsSchema.optional(),
  enrollment: enrollmentSettingsSchema.optional(),
  approval: approvalSettingsSchema.optional(),
  leaderboard: leaderboardSettingsSchema.optional(),
  countdown: countdownSettingsSchema.optional(),
  export: exportSettingsSchema.optional(),
  theme: themeSettingsSchema.optional(),
  visibility: visibilitySettingsSchema.optional(),
  content: contentSettingsSchema.optional(),
});

export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
export type EnrollmentSettings = z.infer<typeof enrollmentSettingsSchema>;
export type ApprovalSettings = z.infer<typeof approvalSettingsSchema>;
export type LeaderboardSettings = z.infer<typeof leaderboardSettingsSchema>;
export type CountdownSettings = z.infer<typeof countdownSettingsSchema>;
export type ExportSettings = z.infer<typeof exportSettingsSchema>;
export type ThemeSettings = z.infer<typeof themeSettingsSchema>;
export type VisibilitySettings = z.infer<typeof visibilitySettingsSchema>;
export type ContentSettings = z.infer<typeof contentSettingsSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export type ExamBatchSettings = {
  general: Required<GeneralSettings>;
  enrollment: Required<EnrollmentSettings>;
  approval: Required<ApprovalSettings>;
  leaderboard: Required<LeaderboardSettings>;
  countdown: Required<CountdownSettings>;
  export: Required<ExportSettings>;
  theme: Required<ThemeSettings>;
  visibility: Required<VisibilitySettings>;
  content: Required<ContentSettings>;
  updatedAt: string | null;
  updatedBy: string | null;
};

// Safe subset returned to unauthenticated / student callers.
export type PublicExamBatchSettings = {
  moduleVisible: boolean;
  hiddenReason: string | null;
  organization: {
    name: string;
    logoUrl: string | null;
    websiteUrl: string | null;
  };
  content: ContentSettings;
  messages: {
    enrollmentInstructions: string | null;
    pendingInstructions: string | null;
    approvalMessage: string | null;
    successMessage: string | null;
    emptyStateMessage: string | null;
    helpText: string | null;
  };
  countdown: CountdownSettings;
  theme: ThemeSettings;
  leaderboard: {
    studentTopN: number;
    studentVisibilityHours: number;
    showPercentage: boolean;
    showTimeUsed: boolean;
  };
};

export const DEFAULT_EXAM_BATCH_SETTINGS: ExamBatchSettings = {
  general: {
    organizationName: "Exam Batch",
    logoUrl: null,
    websiteUrl: null,
    helpText: null,
    emptyStateMessage: null,
    successMessage: null,
  },
  enrollment: {
    enrollmentInstructions: null,
    pendingInstructions: null,
    approvalMessage: null,
    autoApprove: false,
    maxSubjectsPerStudent: 10,
  },
  approval: {
    requireAdminApproval: true,
    notifyOnEnrollment: true,
    notifyOnApproval: true,
  },
  leaderboard: {
    studentTopN: 20,
    studentVisibilityHours: 24,
    adminRetentionDays: 45,
    showPercentage: true,
    showTimeUsed: true,
  },
  countdown: {
    enabled: false,
    label: null,
    sessionText: null,
    levelText: null,
    targetIso: null,
    showOnDashboard: false,
  },

  export: {
    defaultTopN: 100,
    footerText: null,
    includeLogo: true,
    includeLinks: true,
    includeComments: true,
  },
  theme: {
    accentColor: null,
    gradientFrom: null,
    gradientTo: null,
    darkMode: "auto",
  },
  visibility: {
    moduleVisible: true,
    hiddenReason: null,
  },
  content: {
    facebookPageUrl: null,
    facebookGroupUrl: null,
    youtubeChannelUrl: null,
    whatsappContact: null,
    whatsappButtonText: null,
    verificationInstructions: null,
    pendingTitle: null,
    pendingDescription: null,
    verificationSuccessMessage: null,
    verificationHelpText: null,
    verificationVisible: true,
    verificationHiddenMessage: null,
  },
  updatedAt: null,
  updatedBy: null,
};

// ---------- Comment rules ----------
export const commentRuleSchema = z
  .object({
    id: uuid.optional(),
    minPercent: z.number().min(0).max(100),
    maxPercent: z.number().min(0).max(100),
    label: z.string().trim().min(1).max(60),
    message: z.string().trim().min(1).max(400),
    sortOrder: z.number().int().min(0).max(1000).default(0),
  })
  .refine((v) => v.maxPercent >= v.minPercent, {
    message: "maxPercent must be ≥ minPercent",
    path: ["maxPercent"],
  });

export const commentRulesReplaceSchema = z.object({
  rules: z.array(commentRuleSchema).max(50),
});

export type CommentRule = z.infer<typeof commentRuleSchema>;

// ---------- Export inputs ----------
export const exportLeaderboardInput = z.object({
  examId: uuid,
  format: z.enum(["pdf", "txt"]),
  scope: z.enum(["top_n", "full"]).default("top_n"),
  topN: z.number().int().min(1).max(10_000).default(100),
  subjectId: uuid.optional(),
  sessionId: uuid.optional(),
  includeComments: z.boolean().optional(),
  themeColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{6})$/, "themeColor must be a #RRGGBB hex string")
    .optional(),
});

export type ExportLeaderboardInput = z.infer<typeof exportLeaderboardInput>;

export type ExportArtifact = {
  filename: string;
  mimeType: string;
  contentBase64: string;
  byteLength: number;
  rowCount: number;
};

// ---------- Download history ----------
export const downloadHistoryInput = z.object({
  offset: z.number().int().min(0).max(1_000_000).default(0),
  limit: z.number().int().min(1).max(200).default(50),
  actorId: uuid.optional(),
  examId: uuid.optional(),
});

// Log a demo (client-generated) PDF into the download history so admins
// see every artifact regardless of source.
export const logDemoDownloadInput = z.object({
  sessionId: uuid.optional(),
  subjectId: uuid.optional(),
  examId: uuid.optional(),
  themeColor: z
    .string()
    .trim()
    .regex(/^#([0-9a-fA-F]{6})$/)
    .optional(),
  rowCount: z.number().int().min(0).max(10_000).default(10),
  byteLength: z.number().int().min(0).max(50_000_000).default(0),
});

export type DownloadHistoryRow = {
  id: string;
  actor_id: string | null;
  export_type: string;
  format: string;
  exam_id: string | null;
  session_id: string | null;
  subject_id: string | null;
  filters: Record<string, string | number | boolean | null> | null;
  row_count: number | null;
  byte_length: number | null;
  created_at: string;
};
