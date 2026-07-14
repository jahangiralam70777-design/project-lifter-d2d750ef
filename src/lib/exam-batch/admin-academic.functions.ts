// @ts-nocheck
// Exam Batch — independent Academic Manager (Levels / Subjects / Chapters).
// Uses ONLY public.exam_batch_* tables. Does not read from or write to
// public.levels / public.subjects / public.chapters (the site's original
// Academic Manager) so the two systems stay fully isolated.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { noInput } from "@/lib/validate";
import { audit } from "./audit";
import { mapSupabaseError } from "./errors";

const statusEnum = z.enum(["draft", "published", "archived"]);
const slug = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, digits, or dashes");

// ------------------------------------------------------------------ Levels
export const adminListExamBatchLevels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data, error } = await context.supabase
      .from("exam_batch_levels")
      .select("code,name,description,color,icon,sort_order,status,updated_at")
      .order("sort_order", { ascending: true });
    if (error) mapSupabaseError(error, "eb.academic.levels.list");
    return data ?? [];
  });

const levelInput = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_-]+$/),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(24).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(0),
  status: statusEnum.default("published"),
});

export const adminUpsertExamBatchLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof levelInput>) => levelInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("exam_batch_levels")
      .upsert(data, { onConflict: "code" });
    if (error) mapSupabaseError(error, "eb.academic.levels.upsert");
    await audit(context.supabase, context.userId, "academic.level.upsert", "level", data.code, {
      status: data.status,
    });
    return { ok: true } as const;
  });

export const adminDeleteExamBatchLevel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { code: string }) => z.object({ code: z.string().min(1) }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("exam_batch_levels")
      .delete()
      .eq("code", data.code);
    if (error) mapSupabaseError(error, "eb.academic.levels.delete");
    await audit(context.supabase, context.userId, "academic.level.delete", "level", data.code, {});
    return { ok: true } as const;
  });

// ---------------------------------------------------------------- Subjects
export const adminListExamBatchSubjects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { level?: string | null } | undefined) =>
    z
      .object({ level: z.string().trim().max(40).nullable().optional() })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    let q = context.supabase
      .from("exam_batch_subjects")
      .select("id,name,slug,level,description,color,icon,sort_order,status,updated_at")
      .order("sort_order", { ascending: true });
    if (data.level) q = q.eq("level", data.level);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "eb.academic.subjects.list");
    return rows ?? [];
  });

const subjectInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  slug,
  level: z.string().trim().min(1).max(40),
  description: z.string().trim().max(500).nullable().optional(),
  color: z.string().trim().max(24).nullable().optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(0),
  status: statusEnum.default("published"),
});

export const adminUpsertExamBatchSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof subjectInput>) => subjectInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { id, ...patch } = data;
    if (id) {
      const { error } = await context.supabase
        .from("exam_batch_subjects")
        .update(patch)
        .eq("id", id);
      if (error) mapSupabaseError(error, "eb.academic.subjects.update");
      await audit(context.supabase, context.userId, "academic.subject.update", "subject", id, patch);
      return { ok: true, id } as const;
    }
    const { data: row, error } = await context.supabase
      .from("exam_batch_subjects")
      .insert(patch)
      .select("id")
      .single();
    if (error) mapSupabaseError(error, "eb.academic.subjects.insert");
    await audit(
      context.supabase,
      context.userId,
      "academic.subject.create",
      "subject",
      (row as any).id,
      patch,
    );
    return { ok: true, id: (row as any).id as string } as const;
  });

export const adminDeleteExamBatchSubject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("exam_batch_subjects")
      .delete()
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "eb.academic.subjects.delete");
    await audit(context.supabase, context.userId, "academic.subject.delete", "subject", data.id, {});
    return { ok: true } as const;
  });

// ---------------------------------------------------------------- Chapters
export const adminListExamBatchChapters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: { subjectId?: string | null; level?: string | null } | undefined) =>
      z
        .object({
          subjectId: z.string().uuid().nullable().optional(),
          level: z.string().trim().max(40).nullable().optional(),
        })
        .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const sb = context.supabase;
    let subjectIds: string[] | null = null;
    if (data.subjectId) subjectIds = [data.subjectId];
    else if (data.level) {
      const { data: subs, error } = await sb
        .from("exam_batch_subjects")
        .select("id")
        .eq("level", data.level);
      if (error) mapSupabaseError(error, "eb.academic.chapters.subjects");
      subjectIds = (subs ?? []).map((s: { id: string }) => s.id);
      if (!subjectIds.length) return [];
    }
    let q = sb
      .from("exam_batch_chapters")
      .select("id,subject_id,name,slug,description,sort_order,status,updated_at")
      .order("sort_order", { ascending: true });
    if (subjectIds) q = q.in("subject_id", subjectIds);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "eb.academic.chapters.list");
    return rows ?? [];
  });

const chapterInput = z.object({
  id: z.string().uuid().optional(),
  subject_id: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  slug,
  description: z.string().trim().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(0),
  status: statusEnum.default("published"),
});

export const adminUpsertExamBatchChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof chapterInput>) => chapterInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { id, ...patch } = data;
    if (id) {
      const { error } = await context.supabase
        .from("exam_batch_chapters")
        .update(patch)
        .eq("id", id);
      if (error) mapSupabaseError(error, "eb.academic.chapters.update");
      await audit(context.supabase, context.userId, "academic.chapter.update", "chapter", id, patch);
      return { ok: true, id } as const;
    }
    const { data: row, error } = await context.supabase
      .from("exam_batch_chapters")
      .insert(patch)
      .select("id")
      .single();
    if (error) mapSupabaseError(error, "eb.academic.chapters.insert");
    await audit(
      context.supabase,
      context.userId,
      "academic.chapter.create",
      "chapter",
      (row as any).id,
      patch,
    );
    return { ok: true, id: (row as any).id as string } as const;
  });

export const adminDeleteExamBatchChapter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("exam_batch_chapters")
      .delete()
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "eb.academic.chapters.delete");
    await audit(context.supabase, context.userId, "academic.chapter.delete", "chapter", data.id, {});
    return { ok: true } as const;
  });