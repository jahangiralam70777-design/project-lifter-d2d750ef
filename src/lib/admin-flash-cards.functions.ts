// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { sanitizeSearchTerm } from "@/lib/admin-search-sanitize";
import { syncModuleHiddenFlag } from "@/lib/module-visibility.functions";

import { noInput } from "@/lib/validate";
const statusEnum = z.enum(["draft", "published", "archived"]);
const cardTypeEnum = z.enum(["concept", "formula", "diagram", "timeline", "definition", "other"]);

const selectCols =
  "id,subject_id,chapter_id,level,front,back,formula,image_url,card_type,tags,status,is_hidden,scheduled_at,view_count,created_at,updated_at";

// ---------- LIST (admin) ----------
export const adminListFlashCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: {
      search?: string;
      level?: string;
      subjectId?: string;
      chapterId?: string;
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
      .from("flash_cards")
      .select(selectCols, { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(from, to);
    if (data.level) q = q.eq("level", data.level);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    if (data.status === "hidden") q = q.eq("is_hidden", true);
    else if (data.status && data.status !== "all") q = q.eq("status", data.status);
    if (data.search) {
      const term = sanitizeSearchTerm(data.search);
      if (term) q = q.or(`front.ilike.%${term}%,back.ilike.%${term}%`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw error;
    return { rows: rows ?? [], count: count ?? 0 };
  });

// ---------- VISIBILITY (singleton) ----------
type Visibility = {
  section_hidden: boolean;
  hidden_levels: string[];
  hidden_subject_ids: string[];
  hidden_chapter_ids: string[];
};

async function loadVisibility(supabase: unknown): Promise<Visibility> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("flash_card_visibility")
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

export const getFlashCardVisibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "flash_cards.read_visibility");
    return loadVisibility(context.supabase);
  });

const visibilityInput = z.object({
  section_hidden: z.boolean(),
  hidden_levels: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  hidden_subject_ids: z.array(z.string().uuid()).max(500).default([]),
  hidden_chapter_ids: z.array(z.string().uuid()).max(2000).default([]),
});

export const adminSetFlashCardVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof visibilityInput>) => visibilityInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const updatedAt = new Date().toISOString();
    const { error } = await context.supabase
      .from("flash_card_visibility")
      .upsert({ id: 1, ...data, updated_at: updatedAt });
    if (error) throw error;
    await syncModuleHiddenFlag(context.supabase, "flash_cards", data.section_hidden, updatedAt);
    return { ok: true };
  });

// ---------- LIST (student) ----------
export const listPublicFlashCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { subjectId?: string; chapterId?: string; level?: string; limit?: number }) =>
    z
      .object({
        subjectId: z.string().uuid().optional(),
        chapterId: z.string().uuid().optional(),
        level: z.string().trim().max(40).optional(),
        limit: z.number().int().min(1).max(200).default(60),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const vis = await loadVisibility(context.supabase);
    if (vis.section_hidden) return [];
    if (data.level && vis.hidden_levels.includes(data.level)) return [];
    if (data.subjectId && vis.hidden_subject_ids.includes(data.subjectId)) return [];
    if (data.chapterId && vis.hidden_chapter_ids.includes(data.chapterId)) return [];

    let q = context.supabase
      .from("flash_cards")
      .select(selectCols)
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
    return rows ?? [];
  });

// ---------- MUTATIONS ----------
const fcInput = z.object({
  subject_id: z.string().uuid().nullable().optional(),
  chapter_id: z.string().uuid().nullable().optional(),
  level: z.string().trim().min(1).max(40).default("professional"),
  front: z.string().trim().min(1).max(500),
  back: z.string().trim().min(1).max(4000),
  formula: z.string().trim().max(1000).nullable().optional(),
  image_url: z.string().trim().max(1000).nullable().optional(),
  card_type: cardTypeEnum.default("concept"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  status: statusEnum.default("draft"),
  is_hidden: z.boolean().default(false),
  scheduled_at: z.string().datetime().nullable().optional(),
});

export const adminCreateFlashCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof fcInput>) => fcInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: row, error } = await context.supabase
      .from("flash_cards")
      .insert({ ...data, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

const fcUpdate = fcInput.partial().extend({ id: z.string().uuid() });
export const adminUpdateFlashCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof fcUpdate>) => fcUpdate.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { id, ...patch } = data;
    const { error } = await context.supabase
      .from("flash_cards")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteFlashCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase.from("flash_cards").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetFlashCardStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; status: z.infer<typeof statusEnum> }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("flash_cards")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetFlashCardHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; is_hidden: boolean }) =>
    z.object({ id: z.string().uuid(), is_hidden: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("flash_cards")
      .update({ is_hidden: data.is_hidden, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDuplicateFlashCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: src, error: se } = await context.supabase
      .from("flash_cards")
      .select(selectCols)
      .eq("id", data.id)
      .single();
    if (se) throw se;

    const {
      id: _i,
      created_at: _c,
      updated_at: _u,
      view_count: _v,
      ...rest
    } = src as Record<string, unknown>;
    const payload = {
      ...(rest as Record<string, unknown>),
      status: "draft",
      created_by: context.userId,
      front: `${(src as { front: string }).front} (copy)`,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from("flash_cards").insert(payload as any);
    if (error) throw error;
    return { ok: true };
  });

export const adminBulkImportFlashCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { cards: z.infer<typeof fcInput>[] }) =>
    z.object({ cards: z.array(fcInput).min(1).max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const payload = data.cards.map((c) => ({ ...c, created_by: context.userId }));
    const { error, count } = await context.supabase
      .from("flash_cards")
      .insert(payload, { count: "exact" });
    if (error) throw error;
    return { count: count ?? data.cards.length };
  });