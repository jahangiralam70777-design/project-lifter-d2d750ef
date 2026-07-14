// @ts-nocheck
// Exam Batch — independent MCQ Manager.
// Uses ONLY public.exam_batch_mcqs. Never reads from or writes to
// public.mcqs (the site's original MCQ Manager).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import {
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitKey,
} from "@/integrations/security/rate-limit";
import { mcqBulkImportItemSchema } from "@/lib/mcq-bulk-schema";
import { fingerprintQuestion } from "@/lib/mcq-parse";
import { audit } from "./audit";
import { mapSupabaseError } from "./errors";

const difficultyEnum = z.enum(["easy", "medium", "hard"]);
const statusEnum = z.enum(["draft", "published", "archived"]);
const questionTypeEnum = z.enum(["mcq", "true_false"]);
const optionStr = z.string().trim().min(1).max(1000);
const optionStrNullable = z.string().trim().max(1000).nullable().optional();
const mcqOptionEnum = z.enum(["A", "B", "C", "D"]);

const mcqBase = z.object({
  chapter_id: z.string().uuid(),
  subject_id: z.string().uuid().optional(),
  level: z.string().trim().max(40).optional(),
  question: z.string().trim().min(3).max(4000),
  question_type: questionTypeEnum.default("mcq"),
  option_a: optionStr,
  option_b: optionStr,
  option_c: optionStrNullable,
  option_d: optionStrNullable,
  correct_option: mcqOptionEnum,
  explanation: z.string().trim().max(4000).nullable().optional(),
  difficulty: difficultyEnum.default("medium"),
  status: statusEnum.default("published"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

function refineMcq<
  T extends {
    question_type?: "mcq" | "true_false";
    option_c?: string | null;
    option_d?: string | null;
    correct_option?: "A" | "B" | "C" | "D";
  },
>(v: T, ctx: z.RefinementCtx) {
  const qt = v.question_type ?? "mcq";
  if (qt === "true_false") {
    if (v.correct_option && !["A", "B"].includes(v.correct_option)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "True/False correct_option must be A or B" });
    }
  } else if (
    v.option_c !== undefined &&
    v.option_d !== undefined &&
    (!v.option_c || !v.option_c.trim() || !v.option_d || !v.option_d.trim())
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MCQ requires all four options" });
  }
}

const mcqCreateInput = mcqBase.superRefine(refineMcq);

// ---------------------------------------------------------------- Helpers
async function resolveChapterContext(sb: any, chapterId: string) {
  const { data: ch, error } = await sb
    .from("exam_batch_chapters")
    .select("id,subject_id, exam_batch_subjects:subject_id(id,level)")
    .eq("id", chapterId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "eb.mcq.chapter_context");
  if (!ch) throw new Error("Chapter not found");
  const subj = (ch as any).exam_batch_subjects ?? {};
  return {
    subject_id: subj?.id ?? (ch as any).subject_id,
    level: subj?.level ?? null,
  };
}

// ---------------------------------------------------------------- List
const listInput = z.object({
  chapterId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  status: statusEnum.optional(),
  difficulty: difficultyEnum.optional(),
  page: z.number().int().min(1).max(2000).default(1),
  pageSize: z.number().int().min(1).max(500).default(20),
});

export const adminListExamBatchMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listInput>) => listInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = context.supabase
      .from("exam_batch_mcqs")
      .select(
        "id,question,option_a,option_b,option_c,option_d,correct_option,explanation,difficulty,status,tags,chapter_id,subject_id,level,updated_at,created_at,sort_order",
        { count: "exact" },
      )
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    if (data.status) q = q.eq("status", data.status);
    if (data.difficulty) q = q.eq("difficulty", data.difficulty);
    if (data.search) q = q.ilike("question", `%${data.search}%`);

    if (data.subjectId && !data.chapterId) q = q.eq("subject_id", data.subjectId);

    const { data: rows, error, count } = await q;
    if (error) mapSupabaseError(error, "eb.mcq.list");

    // Enrich chapter + subject names.
    const chapterIds = Array.from(
      new Set(((rows ?? []) as any[]).map((r) => r.chapter_id).filter(Boolean)),
    );
    const chMap = new Map<string, { name: string; subject: string }>();
    if (chapterIds.length) {
      const { data: chRows } = await context.supabase
        .from("exam_batch_chapters")
        .select("id,name,subject_id, exam_batch_subjects:subject_id(id,name)")
        .in("id", chapterIds);
      for (const c of (chRows ?? []) as any[]) {
        chMap.set(c.id, { name: c.name, subject: c.exam_batch_subjects?.name ?? "" });
      }
    }
    const enriched = ((rows ?? []) as any[]).map((r) => ({
      ...r,
      chapter_name: chMap.get(r.chapter_id)?.name ?? null,
      subject_name: chMap.get(r.chapter_id)?.subject ?? null,
    }));
    return { rows: enriched, count: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

// ---------------------------------------------------------------- Create
export const adminCreateExamBatchMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof mcqCreateInput>) => mcqCreateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const ctx = await resolveChapterContext(context.supabase, data.chapter_id);
    const { data: row, error } = await context.supabase
      .from("exam_batch_mcqs")
      .insert({
        ...data,
        subject_id: data.subject_id ?? ctx.subject_id,
        level: data.level ?? ctx.level,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) mapSupabaseError(error, "eb.mcq.create");
    await audit(context.supabase, context.userId, "mcq.create", "mcq", (row as any).id, {
      chapter_id: data.chapter_id,
    });
    return { ok: true, id: (row as any).id as string } as const;
  });

// ---------------------------------------------------------------- Update
const mcqUpdateInput = mcqBase
  .partial()
  .extend({ id: z.string().uuid() })
  .superRefine(refineMcq);

export const adminUpdateExamBatchMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof mcqUpdateInput>) => mcqUpdateInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { id, chapter_id, ...patch } = data;
    if (chapter_id) {
      const ctx = await resolveChapterContext(context.supabase, chapter_id);
      Object.assign(patch, {
        chapter_id,
        subject_id: patch.subject_id ?? ctx.subject_id,
        level: patch.level ?? ctx.level,
      });
    }
    const { error } = await context.supabase
      .from("exam_batch_mcqs")
      .update(patch)
      .eq("id", id);
    if (error) mapSupabaseError(error, "eb.mcq.update");
    await audit(context.supabase, context.userId, "mcq.update", "mcq", id, {});
    return { ok: true } as const;
  });

// ---------------------------------------------------------------- Delete
export const adminDeleteExamBatchMcq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("exam_batch_mcqs")
      .delete()
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "eb.mcq.delete");
    await audit(context.supabase, context.userId, "mcq.delete", "mcq", data.id, {});
    return { ok: true } as const;
  });

// ---------------------------------------------------------------- Set status
export const adminSetExamBatchMcqStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; status: z.infer<typeof statusEnum> }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("exam_batch_mcqs")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "eb.mcq.setStatus");
    return { ok: true } as const;
  });

// ---------------------------------------------------------------- Bulk import
const bulkInput = z.object({
  chapter_id: z.string().uuid(),
  defaults: z
    .object({
      difficulty: difficultyEnum.optional(),
      status: statusEnum.optional(),
    })
    .optional(),
  items: z.array(mcqBulkImportItemSchema).min(1).max(500),
});

export const adminBulkImportExamBatchMcqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof bulkInput>) => bulkInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    await enforceRateLimit(
      context.supabase,
      rateLimitKey("admin:eb_bulk_upload", "user", context.userId),
      RATE_LIMITS.BULK_UPLOAD,
    );
    const ctx = await resolveChapterContext(context.supabase, data.chapter_id);

    // Duplicate detection scoped to THIS chapter — mirrors the original bulk
    // upload behaviour so the UI keeps identical semantics.
    const existingFingerprints = new Set<string>();
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: existing, error } = await context.supabase
        .from("exam_batch_mcqs")
        .select("question,option_a,option_b,option_c,option_d")
        .eq("chapter_id", data.chapter_id)
        .range(from, from + pageSize - 1);
      if (error) mapSupabaseError(error, "eb.mcq.bulk.dedupe");
      for (const row of existing ?? []) {
        const fp = fingerprintQuestion(row as any);
        if (fp) existingFingerprints.add(fp);
      }
      if (!existing || existing.length < pageSize) break;
    }

    const failed: Array<{ sourceIndex: number; reason: string }> = [];
    const accepted: typeof data.items = [];
    for (let i = 0; i < data.items.length; i += 1) {
      const item = data.items[i];
      const fp = fingerprintQuestion(item);
      if (fp && existingFingerprints.has(fp)) {
        failed.push({ sourceIndex: item.sourceIndex ?? i + 1, reason: "Duplicate Question" });
        continue;
      }
      if (fp) existingFingerprints.add(fp);
      accepted.push(item);
    }

    if (accepted.length === 0) return { inserted: 0, failed };

    const { data: maxRow } = await context.supabase
      .from("exam_batch_mcqs")
      .select("sort_order")
      .eq("chapter_id", data.chapter_id)
      .order("sort_order", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const base = Number((maxRow as { sort_order: number | null } | null)?.sort_order ?? 0);

    const rows = accepted.map(({ sourceIndex: _srcIx, ...it }, i) => ({
      ...it,
      chapter_id: data.chapter_id,
      subject_id: ctx.subject_id,
      level: ctx.level,
      difficulty: it.difficulty ?? data.defaults?.difficulty ?? "medium",
      status: it.status ?? data.defaults?.status ?? "published",
      sort_order: base + i + 1,
      created_by: context.userId,
    }));
    const { error, count } = await context.supabase
      .from("exam_batch_mcqs")
      .insert(rows, { count: "exact" });
    if (error) mapSupabaseError(error, "eb.mcq.bulk.insert");
    await audit(context.supabase, context.userId, "mcq.bulk_import", "mcq", data.chapter_id, {
      inserted: count ?? rows.length,
      failed: failed.length,
    });
    return { inserted: count ?? rows.length, failed };
  });