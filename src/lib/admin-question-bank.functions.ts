// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { sanitizeSearchTerm } from "@/lib/admin-search-sanitize";
import { syncModuleHiddenFlag } from "@/lib/module-visibility.functions";
import { noInput } from "@/lib/validate";

const statusEnum = z.enum(["draft", "published", "archived"]);
const kindEnum = z.enum(["text", "pdf", "doc"]);
const typeEnum = z.enum(["important", "pyq", "model", "notes", "text"]);

const cols =
  "id,title,summary,level,subject_id,chapter_id,kind,resource_type,body,file_url,file_name,file_size_bytes,question_count,tags,status,is_hidden,scheduled_at,view_count,download_count,created_at,updated_at";

// ---------- ADMIN LIST ----------
export const adminListQuestionBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: {
      search?: string;
      level?: string;
      subjectId?: string;
      chapterId?: string;
      kind?: "text" | "pdf" | "doc" | "all";
      resourceType?: "important" | "pyq" | "model" | "notes" | "text" | "all";
      status?: "draft" | "published" | "archived" | "hidden" | "all";
      page?: number;
      pageSize?: number;
    }) =>
      z
        .object({
          search: z.string().trim().max(200).optional(),
          level: z.string().trim().max(40).optional(),
          subjectId: z.string().uuid().optional(),
          chapterId: z.string().uuid().optional(),
          kind: z.enum(["text", "pdf", "doc", "all"]).default("all"),
          resourceType: z
            .enum(["important", "pyq", "model", "notes", "text", "all"])
            .default("all"),
          status: z.enum(["draft", "published", "archived", "hidden", "all"]).default("all"),
          page: z.number().int().min(1).max(2000).default(1),
          pageSize: z.number().int().min(1).max(100).default(20),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("question_bank_resources")
      .select(cols, { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (data.level) q = q.eq("level", data.level);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    if (data.kind && data.kind !== "all") q = q.eq("kind", data.kind);
    if (data.resourceType && data.resourceType !== "all")
      q = q.eq("resource_type", data.resourceType);
    if (data.status === "hidden") q = q.eq("is_hidden", true);
    else if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const term = sanitizeSearchTerm(data.search);
      if (term) q = q.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw error;
    return { rows: rows ?? [], count: count ?? 0 };
  });

// ---------- VISIBILITY ----------
type Visibility = {
  section_hidden: boolean;
  hidden_levels: string[];
  hidden_subject_ids: string[];
  hidden_chapter_ids: string[];
};

async function loadVisibility(supabase: unknown): Promise<Visibility> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("question_bank_visibility")
    .select("section_hidden,hidden_levels,hidden_subject_ids,hidden_chapter_ids")
    .eq("id", 1)
    .maybeSingle();
  return {
    section_hidden: !!data?.section_hidden,
    hidden_levels: data?.hidden_levels ?? [],
    hidden_subject_ids: data?.hidden_subject_ids ?? [],
    hidden_chapter_ids: data?.hidden_chapter_ids ?? [],
  };
}

export const getQuestionBankVisibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "qb.read_visibility");
    return loadVisibility(context.supabase);
  });

const visInput = z.object({
  section_hidden: z.boolean(),
  hidden_levels: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  hidden_subject_ids: z.array(z.string().uuid()).max(500).default([]),
  hidden_chapter_ids: z.array(z.string().uuid()).max(2000).default([]),
});

export const adminSetQuestionBankVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof visInput>) => visInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const updatedAt = new Date().toISOString();
    const { error } = await context.supabase
      .from("question_bank_visibility")
      .upsert({ id: 1, ...data, updated_at: updatedAt });
    if (error) throw error;
    await syncModuleHiddenFlag(context.supabase, "qns_bank", data.section_hidden, updatedAt);
    return { ok: true };
  });

// ---------- STUDENT LIST ----------
export const listPublicQuestionBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { subjectId?: string; chapterId?: string; level?: string; limit?: number }) =>
    z
      .object({
        subjectId: z.string().uuid().optional(),
        chapterId: z.string().uuid().optional(),
        level: z.string().trim().max(40).optional(),
        limit: z.number().int().min(1).max(500).default(120),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const vis = await loadVisibility(context.supabase);
    if (vis.section_hidden) return { hidden: true as const, rows: [] };
    if (data.level && vis.hidden_levels.includes(data.level)) return { hidden: false, rows: [] };
    if (data.subjectId && vis.hidden_subject_ids.includes(data.subjectId))
      return { hidden: false, rows: [] };
    if (data.chapterId && vis.hidden_chapter_ids.includes(data.chapterId))
      return { hidden: false, rows: [] };

    let q = context.supabase
      .from("question_bank_resources")
      .select(cols)
      .eq("status", "published")
      .eq("is_hidden", false)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    if (data.level) q = q.eq("level", data.level);
    if (vis.hidden_levels.length)
      q = q.not("level", "in", `(${vis.hidden_levels.map((l) => `"${l}"`).join(",")})`);
    if (vis.hidden_subject_ids.length)
      q = q.not("subject_id", "in", `(${vis.hidden_subject_ids.join(",")})`);
    if (vis.hidden_chapter_ids.length)
      q = q.not("chapter_id", "in", `(${vis.hidden_chapter_ids.join(",")})`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return { hidden: false as const, rows: rows ?? [] };
  });

// ---------- MUTATIONS ----------
const qbInput = z.object({
  title: z.string().trim().min(1).max(300),
  summary: z.string().trim().max(1000).nullable().optional(),
  level: z.string().trim().min(1).max(40).default("professional"),
  subject_id: z.string().uuid().nullable().optional(),
  chapter_id: z.string().uuid().nullable().optional(),
  kind: kindEnum.default("text"),
  resource_type: typeEnum.default("important"),
  body: z.string().max(100_000).nullable().optional(),
  file_url: z.string().url().max(1000).nullable().optional(),
  file_name: z.string().max(300).nullable().optional(),
  file_size_bytes: z.number().int().min(0).max(200_000_000).nullable().optional(),
  question_count: z.number().int().min(0).max(10_000).default(0),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  status: statusEnum.default("draft"),
  is_hidden: z.boolean().default(false),
  scheduled_at: z.string().datetime().nullable().optional(),
});

export const adminCreateQuestionBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof qbInput>) => qbInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: row, error } = await context.supabase
      .from("question_bank_resources")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

const qbUpdate = qbInput.partial().extend({ id: z.string().uuid() });
export const adminUpdateQuestionBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof qbUpdate>) => qbUpdate.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("question_bank_resources")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteQuestionBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("question_bank_resources")
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetQuestionBankStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; status: z.infer<typeof statusEnum> }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("question_bank_resources")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetQuestionBankHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; is_hidden: boolean }) =>
    z.object({ id: z.string().uuid(), is_hidden: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("question_bank_resources")
      .update({ is_hidden: data.is_hidden, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDuplicateQuestionBank = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: src, error: se } = await context.supabase
      .from("question_bank_resources")
      .select(cols)
      .eq("id", data.id)
      .single();
    if (se) throw se;

    const {
      id: _i,
      created_at: _c,
      updated_at: _u,
      view_count: _v,
      download_count: _d,
      ...rest
    } = src as Record<string, unknown>;
    const payload = {
      ...(rest as Record<string, unknown>),
      status: "draft",
      created_by: context.userId,
      title: `${(src as { title: string }).title} (copy)`,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from("question_bank_resources").insert(payload as any);
    if (error) throw error;
    return { ok: true };
  });