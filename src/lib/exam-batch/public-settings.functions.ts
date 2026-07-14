// @ts-nocheck
// Public / student-facing settings reads for Exam Batch. Only returns the
// fields the UI needs to render nav, hero, empty states, help text and the
// countdown widget. Nothing here is a mutation; nothing requires admin.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapSupabaseError } from "./errors";
import {
  DEFAULT_EXAM_BATCH_SETTINGS,
  type CommentRule,
  type ExamBatchSettings,
  type PublicExamBatchSettings,
} from "./settings.types";

async function readSettingsRow(supabase: any): Promise<ExamBatchSettings> {
  const { data, error } = await supabase
    .from("exam_batch_settings")
    .select("value,updated_at,updated_by")
    .eq("id", "singleton")
    .maybeSingle();
  if (error) mapSupabaseError(error, "readSettingsRow(public)");
  if (!data) return { ...DEFAULT_EXAM_BATCH_SETTINGS };
  const value = (data as any).value ?? {};
  return {
    ...DEFAULT_EXAM_BATCH_SETTINGS,
    ...value,
    general: { ...DEFAULT_EXAM_BATCH_SETTINGS.general, ...(value.general ?? {}) },
    enrollment: { ...DEFAULT_EXAM_BATCH_SETTINGS.enrollment, ...(value.enrollment ?? {}) },
    approval: { ...DEFAULT_EXAM_BATCH_SETTINGS.approval, ...(value.approval ?? {}) },
    leaderboard: { ...DEFAULT_EXAM_BATCH_SETTINGS.leaderboard, ...(value.leaderboard ?? {}) },
    countdown: { ...DEFAULT_EXAM_BATCH_SETTINGS.countdown, ...(value.countdown ?? {}) },
    export: { ...DEFAULT_EXAM_BATCH_SETTINGS.export, ...(value.export ?? {}) },
    theme: { ...DEFAULT_EXAM_BATCH_SETTINGS.theme, ...(value.theme ?? {}) },
    visibility: { ...DEFAULT_EXAM_BATCH_SETTINGS.visibility, ...(value.visibility ?? {}) },
    content: { ...DEFAULT_EXAM_BATCH_SETTINGS.content, ...(value.content ?? {}) },
    updatedAt: (data as any).updated_at ?? null,
    updatedBy: (data as any).updated_by ?? null,
  };
}

function toPublicSettings(s: ExamBatchSettings): PublicExamBatchSettings {
  return {
    moduleVisible: s.visibility.moduleVisible !== false,
    hiddenReason: s.visibility.hiddenReason ?? null,
    organization: {
      name: s.general.organizationName ?? "Exam Batch",
      logoUrl: s.general.logoUrl ?? null,
      websiteUrl: s.general.websiteUrl ?? null,
    },
    content: s.content,
    messages: {
      enrollmentInstructions: s.enrollment.enrollmentInstructions ?? null,
      pendingInstructions: s.enrollment.pendingInstructions ?? null,
      approvalMessage: s.enrollment.approvalMessage ?? null,
      successMessage: s.general.successMessage ?? null,
      emptyStateMessage: s.general.emptyStateMessage ?? null,
      helpText: s.general.helpText ?? null,
    },
    countdown: s.countdown,
    theme: s.theme,
    leaderboard: {
      studentTopN: s.leaderboard.studentTopN,
      studentVisibilityHours: s.leaderboard.studentVisibilityHours,
      showPercentage: s.leaderboard.showPercentage,
      showTimeUsed: s.leaderboard.showTimeUsed,
    },
  };
}

// Public reader — authenticated users only (no anonymous access). Nothing
// admin-sensitive (autoApprove, retention, etc.) is exposed here.
export const getExamBatchPublicSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PublicExamBatchSettings> => {
    const settings = await readSettingsRow(context.supabase);
    return toPublicSettings(settings);
  });

// Convenience helper used by server functions to enforce module visibility.
export async function assertExamBatchModuleVisible(supabase: any): Promise<void> {
  const settings = await readSettingsRow(supabase);
  if (settings.visibility.moduleVisible === false) {
    const err: any = new Error(
      settings.visibility.hiddenReason ?? "Exam Batch is currently unavailable.",
    );
    err.code = "FORBIDDEN";
    throw err;
  }
}

// Public comment rules — used by the UI to preview which comment a student
// would receive at a given percentage. Never returns admin metadata.
export const getExamBatchCommentRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommentRule[]> => {
    const { data, error } = await context.supabase
      .from("exam_batch_comment_rules")
      .select("id,min_percent,max_percent,label,message,sort_order")
      .order("sort_order", { ascending: true })
      .order("min_percent", { ascending: true });
    if (error) mapSupabaseError(error, "getExamBatchCommentRules");
    return (data ?? []).map((r: any) => ({
      id: r.id,
      minPercent: Number(r.min_percent),
      maxPercent: Number(r.max_percent),
      label: r.label,
      message: r.message,
      sortOrder: r.sort_order ?? 0,
    }));
  });