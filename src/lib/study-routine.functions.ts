// Study Routine — independent module. Uses existing Academic Manager data
// (levels / subjects / chapters) by reference only, and its own two tables:
// public.study_routines and public.study_routine_tasks.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };



// ---------------------------------------------------------------- Shared enums
const routineTypeEnum = z.enum(["daily", "weekly", "monthly", "custom"]);
const taskTypeEnum = z.enum(["study", "mcq", "quiz", "mock", "revision", "custom"]);
const priorityEnum = z.enum(["low", "medium", "high"]);
const statusEnum = z.enum(["pending", "in_progress", "completed"]);

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable().optional();
const nullableText = z.string().trim().max(4000).nullable().optional();

// ---------------------------------------------------------------- List routines
const listRoutinesInput = z
  .object({
    includeArchived: z.boolean().optional(),
  })
  .partial();

export const listStudyRoutines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listRoutinesInput> | undefined) =>
    listRoutinesInput.parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    let q = ctx.supabase
      .from("study_routines")
      .select(
        "id,name,type,level_code,subject_id,chapter_id,is_active,is_archived,created_at,updated_at",
      )
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false });
    if (!data.includeArchived) q = q.eq("is_archived", false);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ---------------------------------------------------------------- Upsert routine
const upsertRoutineInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(160),
  type: routineTypeEnum,
  level_code: z.string().trim().max(40).nullable().optional(),
  subject_id: nullableUuid,
  chapter_id: nullableUuid,
  is_active: z.boolean().optional(),
});

export const upsertStudyRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof upsertRoutineInput>) => upsertRoutineInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    const sb = ctx.supabase;
    const patch = {
      name: data.name,
      type: data.type,
      level_code: data.level_code ?? null,
      subject_id: data.subject_id ?? null,
      chapter_id: data.chapter_id ?? null,
      is_active: data.is_active ?? true,
    };
    if (data.id) {
      const { error } = await sb
        .from("study_routines")
        .update(patch)
        .eq("id", data.id)
        .eq("user_id", ctx.userId);
      if (error) throw error;
      return { ok: true, id: data.id } as const;
    }
    const { data: row, error } = await sb
      .from("study_routines")
      .insert({ ...patch, user_id: ctx.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id as string } as const;
  });

// ---------------------------------------------------------------- Routine ops
const routineIdInput = z.object({ id: uuid });

export const deleteStudyRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof routineIdInput>) => routineIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    const sb = ctx.supabase;
    const { error } = await sb
      .from("study_routines")
      .delete()
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

const setFlagsInput = z.object({
  id: uuid,
  is_active: z.boolean().optional(),
  is_archived: z.boolean().optional(),
});

export const setStudyRoutineFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof setFlagsInput>) => setFlagsInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    const sb = ctx.supabase;
    const patch: Database["public"]["Tables"]["study_routines"]["Update"] = {};
    if (typeof data.is_active === "boolean") patch.is_active = data.is_active;
    if (typeof data.is_archived === "boolean") patch.is_archived = data.is_archived;
    if (!Object.keys(patch).length) return { ok: true } as const;
    const { error } = await sb
      .from("study_routines")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

export const duplicateStudyRoutine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof routineIdInput>) => routineIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    const sb = ctx.supabase;
    const { data: src, error: srcErr } = await sb
      .from("study_routines")
      .select("name,type,level_code,subject_id,chapter_id")
      .eq("id", data.id)
      .eq("user_id", ctx.userId)
      .single();
    if (srcErr) throw srcErr;
    const { data: row, error } = await sb
      .from("study_routines")
      .insert({
        user_id: ctx.userId,
        name: `${src.name} (copy)`,
        type: src.type,
        level_code: src.level_code,
        subject_id: src.subject_id,
        chapter_id: src.chapter_id,
      })
      .select("id")
      .single();
    if (error) throw error;

    // Copy tasks belonging to this routine (reset status to pending).
    // Whitelist every field explicitly — never spread the DB row so
    // system columns (id, user_id, created_at, updated_at) can't leak in.
    const { data: srcTasks } = await sb
      .from("study_routine_tasks")
      .select(
        "level_code,subject_id,chapter_id,title,description,task_type,task_date,start_time,end_time,priority,notes",
      )
      .eq("routine_id", data.id)
      .eq("user_id", ctx.userId);
    if (srcTasks?.length) {
      const clones = srcTasks.map((t) => ({
        user_id: ctx.userId,
        routine_id: row.id,
        level_code: t.level_code ?? null,
        subject_id: t.subject_id ?? null,
        chapter_id: t.chapter_id ?? null,
        title: t.title,
        description: t.description ?? null,
        task_type: t.task_type,
        task_date: t.task_date,
        start_time: t.start_time,
        end_time: t.end_time,
        priority: t.priority,
        notes: t.notes ?? null,
        status: "pending" as const,
        completion: 0,
      }));
      const { error: insErr } = await sb.from("study_routine_tasks").insert(clones);
      if (insErr) throw insErr;
    }
    return { ok: true, id: row.id as string } as const;
  });


// ---------------------------------------------------------------- Tasks — list
const listTasksInput = z
  .object({
    routineId: uuid.optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .partial();

export const listStudyRoutineTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listTasksInput> | undefined) =>
    listTasksInput.parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    let q = ctx.supabase
      .from("study_routine_tasks")
      .select(
        "id,routine_id,level_code,subject_id,chapter_id,title,description,task_type,task_date,start_time,end_time,priority,status,completion,notes,created_at,updated_at",
      )
      .eq("user_id", ctx.userId)
      .order("task_date", { ascending: true })
      .order("start_time", { ascending: true });
    if (data.routineId) q = q.eq("routine_id", data.routineId);
    if (data.from) q = q.gte("task_date", data.from);
    if (data.to) q = q.lte("task_date", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

// ---------------------------------------------------------------- Tasks — upsert
const taskInput = z.object({
  id: uuid.optional(),
  routine_id: nullableUuid,
  level_code: z.string().trim().max(40).nullable().optional(),
  subject_id: nullableUuid,
  chapter_id: nullableUuid,
  title: z.string().trim().min(1).max(200),
  description: nullableText,
  task_type: taskTypeEnum.default("study"),
  task_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  priority: priorityEnum.default("medium"),
  status: statusEnum.default("pending"),
  completion: z.number().int().min(0).max(100).default(0),
  notes: nullableText,
});

export const upsertStudyRoutineTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof taskInput>) => taskInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    const sb = ctx.supabase;
    const { id, ...rest } = data;
    const patch = {
      ...rest,
      description: rest.description ?? null,
      notes: rest.notes ?? null,
      level_code: rest.level_code ?? null,
      subject_id: rest.subject_id ?? null,
      chapter_id: rest.chapter_id ?? null,
      routine_id: rest.routine_id ?? null,
    };
    if (id) {
      const { error } = await sb
        .from("study_routine_tasks")
        .update(patch)
        .eq("id", id)
        .eq("user_id", ctx.userId);
      if (error) throw error;
      return { ok: true, id } as const;
    }
    const { data: row, error } = await sb
      .from("study_routine_tasks")
      .insert({ ...patch, user_id: ctx.userId } as Database["public"]["Tables"]["study_routine_tasks"]["Insert"])
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id as string } as const;
  });

// ---------------------------------------------------------------- Task ops
const taskIdInput = z.object({ id: uuid });

export const deleteStudyRoutineTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof taskIdInput>) => taskIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    const sb = ctx.supabase;
    const { error } = await sb
      .from("study_routine_tasks")
      .delete()
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

const setStatusInput = z.object({
  id: uuid,
  status: statusEnum,
  completion: z.number().int().min(0).max(100).optional(),
});

export const setStudyRoutineTaskStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof setStatusInput>) => setStatusInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    const sb = ctx.supabase;
    const patch: Database["public"]["Tables"]["study_routine_tasks"]["Update"] = { status: data.status };
    if (typeof data.completion === "number") patch.completion = data.completion;
    else if (data.status === "completed") patch.completion = 100;
    else if (data.status === "pending") patch.completion = 0;
    const { error } = await sb
      .from("study_routine_tasks")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", ctx.userId);
    if (error) throw error;
    return { ok: true } as const;
  });

export const duplicateStudyRoutineTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof taskIdInput>) => taskIdInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as { supabase: SupabaseClient<Database>; userId: string };
    const sb = ctx.supabase;
    const { data: src, error: srcErr } = await sb
      .from("study_routine_tasks")
      .select(
        "routine_id,level_code,subject_id,chapter_id,title,description,task_type,task_date,start_time,end_time,priority,notes",
      )
      .eq("id", data.id)
      .eq("user_id", ctx.userId)
      .single();
    if (srcErr) throw srcErr;
    // Whitelist every field — never spread the raw DB row.
    const clone = {
      user_id: ctx.userId,
      routine_id: src.routine_id ?? null,
      level_code: src.level_code ?? null,
      subject_id: src.subject_id ?? null,
      chapter_id: src.chapter_id ?? null,
      title: `${src.title} (copy)`,
      description: src.description ?? null,
      task_type: src.task_type,
      task_date: src.task_date,
      start_time: src.start_time,
      end_time: src.end_time,
      priority: src.priority,
      notes: src.notes ?? null,
      status: "pending" as const,
      completion: 0,
    };
    const { data: row, error } = await sb
      .from("study_routine_tasks")
      .insert(clone)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: row.id as string } as const;
  });


// ---------------------------------------------------------------- Types
export type StudyRoutineRow = {
  id: string;
  name: string;
  type: "daily" | "weekly" | "monthly" | "custom";
  level_code: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  description?: string | null;
  task_title?: string | null;
  task_type?: string | null;
  study_target?: string | null;
  estimated_minutes?: number | null;
  priority?: string | null;
  reminder_minutes?: number | null;
  default_status?: string | null;
  due_date?: string | null;
  schedule_mode?: string | null;
  interval_weeks?: number | null;
  interval_months?: number | null;
  weekdays?: number[] | null;
  start_date?: string | null;
  end_date?: string | null;
  anchor_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export type StudyRoutineTaskRow = {
  id: string;
  routine_id: string | null;
  level_code: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  title: string;
  description: string | null;
  task_type: "study" | "mcq" | "quiz" | "mock" | "revision" | "custom";
  task_date: string;
  start_time: string;
  end_time: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in_progress" | "completed";
  completion: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ============================================================================
// Unified "Create Routine" — saves the routine with all scheduling fields and
// materializes matching occurrences into study_routine_tasks so existing
// filters/calendar/analytics work unchanged. Re-saving wipes future *pending*
// occurrences and re-materializes them so schedule edits stay in sync; a
// unique partial index (user_id, routine_id, task_date, title) guards
// against duplicates even under races.
// ============================================================================

const scheduleModeEnum = z.enum([
  "daily",
  "weekly",
  "monthly",
  "date_range",
  "weekdays",
]);
const studyTargetEnum = z.enum(["mcq", "reading", "time", "custom"]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const saveRoutineInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  level_code: z.string().trim().max(40).nullable().optional(),
  subject_id: nullableUuid,
  chapter_id: nullableUuid,
  task_type: taskTypeEnum.default("study"),
  study_target: studyTargetEnum.default("time"),
  estimated_minutes: z.number().int().min(5).max(24 * 60).default(60),
  priority: priorityEnum.default("medium"),
  default_status: statusEnum.default("pending"),
  due_date: isoDate.nullable().optional(),
  schedule_mode: scheduleModeEnum,
  interval_weeks: z.number().int().min(1).max(52).default(1),
  interval_months: z.number().int().min(1).max(24).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  start_date: isoDate,
  end_date: isoDate.nullable().optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).default("09:00"),
  is_active: z.boolean().optional(),
});

type SaveRoutineInput = z.infer<typeof saveRoutineInput>;

function scheduleModeToLegacyType(m: SaveRoutineInput["schedule_mode"]) {
  switch (m) {
    case "daily":
      return "daily" as const;
    case "weekly":
      return "weekly" as const;
    case "monthly":
      return "monthly" as const;
    default:
      return "custom" as const;
  }
}

function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}
function addMonthsISO(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}
function weekdayOf(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function endTimeFromDuration(start: string, minutes: number) {
  const [hh, mm] = start.split(":").map(Number);
  const total = hh * 60 + mm + Math.max(5, minutes);
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

// Bangladesh Standard Time is UTC+6 with no DST. Anchoring "today" to BST
// keeps occurrence generation aligned with the user's local calendar even
// when the server runs in UTC.
const BD_OFFSET_MIN = 6 * 60;
function todayInBD(): string {
  const now = new Date();
  const shifted = new Date(now.getTime() + BD_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function expandOccurrenceDates(
  input: Pick<
    SaveRoutineInput,
    | "schedule_mode"
    | "interval_weeks"
    | "interval_months"
    | "weekdays"
    | "start_date"
    | "end_date"
    | "due_date"
  >,
  horizonDays = 90,
): string[] {
  const today = todayInBD();
  const startBound = input.start_date > today ? input.start_date : today;
  let horizon = addDaysISO(today, horizonDays);
  if (input.due_date && input.due_date < horizon) horizon = input.due_date;
  if (input.end_date && input.end_date < horizon) horizon = input.end_date;
  if (horizon < startBound) return [];


  const dates: string[] = [];
  if (input.schedule_mode === "daily") {
    for (let d = startBound; d <= horizon; d = addDaysISO(d, 1)) dates.push(d);
  } else if (input.schedule_mode === "weekly") {
    const step = 7 * Math.max(1, input.interval_weeks);
    let d = input.start_date;
    while (d < startBound) d = addDaysISO(d, step);
    for (; d <= horizon; d = addDaysISO(d, step)) dates.push(d);
  } else if (input.schedule_mode === "monthly") {
    const step = Math.max(1, input.interval_months);
    let d = input.start_date;
    while (d < startBound) d = addMonthsISO(d, step);
    for (; d <= horizon; d = addMonthsISO(d, step)) dates.push(d);
  } else if (input.schedule_mode === "date_range") {
    const end = input.end_date && input.end_date < horizon ? input.end_date : horizon;
    for (let d = startBound; d <= end; d = addDaysISO(d, 1)) dates.push(d);
  } else if (input.schedule_mode === "weekdays") {
    const set = new Set(input.weekdays ?? []);
    if (set.size === 0) return [];
    for (let d = startBound; d <= horizon; d = addDaysISO(d, 1)) {
      if (set.has(weekdayOf(d))) dates.push(d);
    }
  }
  return dates;
}

export const saveStudyRoutineWithSchedule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: SaveRoutineInput) => saveRoutineInput.parse(i))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as Ctx;
    const sb = ctx.supabase;

    const legacyType = scheduleModeToLegacyType(data.schedule_mode);
    const start =
      data.start_time.length >= 5 ? data.start_time.slice(0, 5) : data.start_time;
    const end = endTimeFromDuration(start, data.estimated_minutes);

    const routinePatch = {
      name: data.name,
      type: legacyType,
      level_code: data.level_code ?? null,
      subject_id: data.subject_id ?? null,
      chapter_id: data.chapter_id ?? null,
      is_active: data.is_active ?? true,
      description: data.description ?? null,
      task_title: data.name,
      task_type: data.task_type,
      study_target: data.study_target,
      estimated_minutes: data.estimated_minutes,
      priority: data.priority,
      reminder_minutes: null,
      default_status: data.default_status,
      due_date: data.due_date ?? null,
      schedule_mode: data.schedule_mode,
      interval_weeks: data.interval_weeks,
      interval_months: data.interval_months,
      weekdays: data.weekdays ?? [],
      start_date: data.start_date,
      end_date: data.end_date ?? null,
      anchor_date: data.start_date,
      start_time: start,
      end_time: end,
    };

    let routineId = data.id ?? null;
    if (routineId) {
      const { error } = await sb
        .from("study_routines")
        .update(routinePatch as never)
        .eq("id", routineId)
        .eq("user_id", ctx.userId);
      if (error) throw error;
    } else {
      const { data: row, error } = await sb
        .from("study_routines")
        .insert({ ...routinePatch, user_id: ctx.userId } as never)
        .select("id")
        .single();
      if (error) throw error;
      routineId = (row as { id: string }).id;
    }

    const todayIso = todayInBD();
    // Wipe future pending occurrences so re-saves stay in sync without
    // touching completed / in-progress history.
    await sb
      .from("study_routine_tasks")
      .delete()
      .eq("user_id", ctx.userId)
      .eq("routine_id", routineId)
      .eq("status", "pending")
      .gte("task_date", todayIso);

    const dates = expandOccurrenceDates(data);
    if (dates.length) {
      const rows = dates.map((d) => ({
        user_id: ctx.userId,
        routine_id: routineId!,
        level_code: data.level_code ?? null,
        subject_id: data.subject_id ?? null,
        chapter_id: data.chapter_id ?? null,
        title: data.name,
        description: data.description ?? null,
        task_type: data.task_type,
        task_date: d,
        start_time: start,
        end_time: end,
        priority: data.priority,
        status: data.default_status,
        completion: 0,
        notes: null,
      }));
      const { error } = await sb
        .from("study_routine_tasks")
        .upsert(rows as never, {
          onConflict: "user_id,routine_id,task_date,title",
          ignoreDuplicates: true,
        });
      if (error) throw error;
    }

    return { ok: true, id: routineId!, occurrences: dates.length } as const;
  });