// @ts-nocheck
// Admin Settings / Content / Module Visibility / Comment Rules for Exam Batch.
// All mutations are gated by assertPermission("manage_content") and audited.
// Reads that need to serve unauthenticated / student callers are exposed via
// `public-settings.functions.ts` — this file is admin-only.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { audit } from "./audit";
import { mapSupabaseError } from "./errors";
import {
  DEFAULT_EXAM_BATCH_SETTINGS,
  commentRulesReplaceSchema,
  settingsPatchSchema,
  visibilitySettingsSchema,
  type CommentRule,
  type ExamBatchSettings,
} from "./settings.types";

const SETTINGS_ID = "singleton";

// Deep-merge a partial patch onto the current settings row. Nulls are kept
// as-is so admins can explicitly clear a field (e.g. remove the logo URL).
function mergeSettings(
  current: ExamBatchSettings,
  patch: Record<string, unknown>,
): ExamBatchSettings {
  const next: any = { ...current };
  for (const key of Object.keys(patch)) {
    const val = (patch as any)[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      next[key] = { ...(next[key] ?? {}), ...val };
    } else {
      next[key] = val;
    }
  }
  return next;
}

async function readSettingsRow(supabase: any): Promise<ExamBatchSettings> {
  const { data, error } = await supabase
    .from("exam_batch_settings")
    .select("value,updated_at,updated_by")
    .eq("id", SETTINGS_ID)
    .maybeSingle();
  if (error) mapSupabaseError(error, "readSettingsRow");
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

async function writeSettingsRow(
  supabase: any,
  next: ExamBatchSettings,
  userId: string,
): Promise<ExamBatchSettings> {
  const payload = {
    id: SETTINGS_ID,
    value: {
      general: next.general,
      enrollment: next.enrollment,
      approval: next.approval,
      leaderboard: next.leaderboard,
      countdown: next.countdown,
      export: next.export,
      theme: next.theme,
      visibility: next.visibility,
      content: next.content,
    },
    updated_at: new Date().toISOString(),
    updated_by: userId,
  };
  const { data, error } = await supabase
    .from("exam_batch_settings")
    .upsert(payload, { onConflict: "id" })
    .select("value,updated_at,updated_by")
    .single();
  if (error) mapSupabaseError(error, "writeSettingsRow");
  return {
    ...next,
    updatedAt: (data as any)?.updated_at ?? null,
    updatedBy: (data as any)?.updated_by ?? null,
  };
}

// ---------- Read (admin) ----------
export const adminGetExamBatchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ExamBatchSettings> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.settings.read",
    );
    return readSettingsRow(context.supabase);
  });

// ---------- Update (partial) ----------
export const adminUpdateExamBatchSettings = createServerFn({ method: "POST" })
  .validator((i: unknown) => settingsPatchSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ExamBatchSettings> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.settings.update",
    );
    const current = await readSettingsRow(context.supabase);
    const next = mergeSettings(current, data as Record<string, unknown>);
    const saved = await writeSettingsRow(context.supabase, next, context.userId);
    await audit(context.supabase, context.userId, "settings.update", "settings", SETTINGS_ID, {
      keys: Object.keys(data),
    });
    if (data.content) {
      await audit(context.supabase, context.userId, "content.update", "content", SETTINGS_ID, {
        keys: Object.keys(data.content ?? {}),
      });
    }
    return saved;
  });

// ---------- Module visibility ----------
export const adminSetExamBatchModuleVisibility = createServerFn({ method: "POST" })
  .validator((i: unknown) =>
    z.object({
      visible: z.boolean(),
      reason: z.string().trim().max(500).optional().nullable(),
    }).parse(i),
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ExamBatchSettings> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.visibility.change",
    );
    const current = await readSettingsRow(context.supabase);
    const patch = visibilitySettingsSchema.parse({
      moduleVisible: data.visible,
      hiddenReason: data.visible ? null : (data.reason ?? current.visibility.hiddenReason ?? null),
    });
    const next = mergeSettings(current, { visibility: patch });
    const saved = await writeSettingsRow(context.supabase, next, context.userId);
    await audit(
      context.supabase,
      context.userId,
      "visibility.change",
      "visibility",
      SETTINGS_ID,
      { visible: data.visible, reason: patch.hiddenReason },
    );
    return saved;
  });

// ---------- Comment rules (list) ----------
export const adminListExamBatchCommentRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CommentRule[]> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.comment_rules.list",
    );
    const { data, error } = await context.supabase
      .from("exam_batch_comment_rules")
      .select("id,min_percent,max_percent,label,message,sort_order")
      .order("sort_order", { ascending: true })
      .order("min_percent", { ascending: true });
    if (error) mapSupabaseError(error, "adminListExamBatchCommentRules");
    return (data ?? []).map((r: any) => ({
      id: r.id,
      minPercent: Number(r.min_percent),
      maxPercent: Number(r.max_percent),
      label: r.label,
      message: r.message,
      sortOrder: r.sort_order ?? 0,
    }));
  });

// ---------- Comment rules (replace all) ----------
// Admin submits the full list; the server replaces the table atomically so
// there is no window where the rules are partially applied.
export const adminReplaceExamBatchCommentRules = createServerFn({ method: "POST" })
  .validator((i: unknown) => commentRulesReplaceSchema.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.comment_rules.replace",
    );
    // Best-effort atomic replace: delete + insert. If the DB team ships an
    // RPC named `exam_batch_replace_comment_rules(_rules jsonb)` we prefer it.
    const rpc = await context.supabase.rpc("exam_batch_replace_comment_rules", {
      _rules: data.rules,
    });
    if (rpc.error && rpc.error.code !== "42883" && rpc.error.code !== "PGRST202") {
      mapSupabaseError(rpc.error, "adminReplaceExamBatchCommentRules:rpc");
    }
    if (rpc.error) {
      // Fallback path — best effort, not transactional across the two writes.
      const del = await context.supabase.from("exam_batch_comment_rules").delete().not("id", "is", null);
      if (del.error) mapSupabaseError(del.error, "adminReplaceExamBatchCommentRules:delete");
      if (data.rules.length > 0) {
        const ins = await context.supabase.from("exam_batch_comment_rules").insert(
          data.rules.map((r) => ({
            min_percent: r.minPercent,
            max_percent: r.maxPercent,
            label: r.label,
            message: r.message,
            sort_order: r.sortOrder ?? 0,
          })),
        );
        if (ins.error) mapSupabaseError(ins.error, "adminReplaceExamBatchCommentRules:insert");
      }
    }
    await audit(
      context.supabase,
      context.userId,
      "comment_rules.replace",
      "comment_rules",
      "singleton",
      { count: data.rules.length },
    );
    return { count: data.rules.length };
  });