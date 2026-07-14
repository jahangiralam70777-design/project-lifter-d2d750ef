// @ts-nocheck
// Admin session management for Exam Batch.
// Uses createServerFn + requireSupabaseAuth. Every mutation runs through
// assertPermission("manage_content"), which also applies the admin-write
// rate limit and writes an authorization audit entry.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { audit } from "./audit";
import { errors, mapSupabaseError } from "./errors";
import {
  sessionCreateSchema,
  sessionIdOnly,
  sessionSetBool,
  sessionUpdateSchema,
  type ExamBatchSessionRow,
} from "./types";

const SESSION_COLUMNS =
  "id,title,subtitle,level,starts_at,registration_deadline,status,registration_open,is_archived,is_hidden,subjects_count,created_at,updated_at";

// ---------- List (admin sees everything, including hidden/archived) ----------
export const adminListExamBatchSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { includeArchived?: boolean }) =>
    z.object({ includeArchived: z.boolean().default(true) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }): Promise<ExamBatchSessionRow[]> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.session.list");
    let q = context.supabase
      .from("exam_batch_sessions")
      .select(SESSION_COLUMNS)
      .order("starts_at", { ascending: false });
    if (!data.includeArchived) q = q.eq("is_archived", false);
    const { data: rows, error } = await q;
    if (error) mapSupabaseError(error, "adminListExamBatchSessions");
    return (rows ?? []) as ExamBatchSessionRow[];
  });

// ---------- Create ----------
export const adminCreateExamBatchSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => sessionCreateSchema.parse(i))
  .handler(async ({ data, context }): Promise<ExamBatchSessionRow> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.session.create");
    const { data: row, error } = await context.supabase
      .from("exam_batch_sessions")
      .insert({
        title: data.title,
        subtitle: data.subtitle ?? null,
        level: data.level,
        starts_at: data.startsAt,
        registration_deadline: data.registrationDeadline ?? null,
        status: data.status,
        registration_open: data.registrationOpen,
        is_hidden: data.isHidden,
        is_archived: false,
        created_by: context.userId,
      })
      .select(SESSION_COLUMNS)
      .single();
    if (error) mapSupabaseError(error, "adminCreateExamBatchSession");
    await audit(context.supabase, context.userId, "session.create", "session", row!.id, { title: data.title });
    return row as ExamBatchSessionRow;
  });

// ---------- Update ----------
export const adminUpdateExamBatchSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => sessionUpdateSchema.parse(i))
  .handler(async ({ data, context }): Promise<ExamBatchSessionRow> => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.session.update");
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.title !== undefined) patch.title = data.title;
    if (data.subtitle !== undefined) patch.subtitle = data.subtitle ?? null;
    if (data.level !== undefined) patch.level = data.level;
    if (data.startsAt !== undefined) patch.starts_at = data.startsAt;
    if (data.registrationDeadline !== undefined) patch.registration_deadline = data.registrationDeadline ?? null;
    if (data.status !== undefined) patch.status = data.status;
    if (data.registrationOpen !== undefined) patch.registration_open = data.registrationOpen;
    if (data.isHidden !== undefined) patch.is_hidden = data.isHidden;

    const { data: row, error } = await context.supabase
      .from("exam_batch_sessions")
      .update(patch)
      .eq("id", data.id)
      .select(SESSION_COLUMNS)
      .single();
    if (error) mapSupabaseError(error, "adminUpdateExamBatchSession");
    if (!row) throw errors.notFound("Session");
    await audit(context.supabase, context.userId, "session.update", "session", data.id, { patch });
    return row as ExamBatchSessionRow;
  });

// ---------- Delete ----------
export const adminDeleteExamBatchSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => sessionIdOnly.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.session.delete");
    const { error } = await context.supabase.from("exam_batch_sessions").delete().eq("id", data.id);
    if (error) mapSupabaseError(error, "adminDeleteExamBatchSession");
    await audit(context.supabase, context.userId, "session.delete", "session", data.id);
    return { ok: true } as const;
  });

// ---------- Archive / Unarchive ----------
export const adminSetExamBatchSessionArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => sessionSetBool.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.session.archive");
    const { error } = await context.supabase
      .from("exam_batch_sessions")
      .update({ is_archived: data.value, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "adminSetExamBatchSessionArchived");
    await audit(context.supabase, context.userId, "session.archive", "session", data.id, { archived: data.value });
    return { ok: true } as const;
  });

// ---------- Hide / Unhide ----------
export const adminSetExamBatchSessionHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => sessionSetBool.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.session.hide");
    const { error } = await context.supabase
      .from("exam_batch_sessions")
      .update({ is_hidden: data.value, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "adminSetExamBatchSessionHidden");
    await audit(context.supabase, context.userId, "session.hide", "session", data.id, { hidden: data.value });
    return { ok: true } as const;
  });

// ---------- Active / Inactive ----------
export const adminSetExamBatchSessionActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => sessionSetBool.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.session.set_active");
    const { error } = await context.supabase
      .from("exam_batch_sessions")
      .update({ status: data.value ? "active" : "inactive", updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "adminSetExamBatchSessionActive");
    await audit(context.supabase, context.userId, "session.set_active", "session", data.id, { active: data.value });
    return { ok: true } as const;
  });

// ---------- Registration open / closed ----------
export const adminSetExamBatchRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => sessionSetBool.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "exam_batch.session.set_registration");
    const { error } = await context.supabase
      .from("exam_batch_sessions")
      .update({ registration_open: data.value, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) mapSupabaseError(error, "adminSetExamBatchRegistration");
    await audit(context.supabase, context.userId, "session.set_registration", "session", data.id, {
      open: data.value,
    });
    return { ok: true } as const;
  });