// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./site-management.server";

// Lazily resolved inside each handler to keep the service-role client out of
// any client-reachable import graph (see tanstack-supabase-import-graph).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSb(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and dashes");
const statusSchema = z.enum(["draft", "published", "archived"]);

export type SitePage = {
  id: string;
  slug: string;
  title: string;
  is_home: boolean;
  seo_title: string | null;
  seo_description: string | null;
  sort_order: number;
  status: "draft" | "published" | "archived";
  created_at: string;
  updated_at: string;
};

// ---------- LIST ----------
export const adminListPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = await getSb();
    await assertAdmin(context.supabase as any, context.userId);
    const { data, error } = await sb
      .from("site_pages")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { pages: (data ?? []) as SitePage[] };
  });

// ---------- CREATE ----------
export const adminCreatePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        slug: slugSchema,
        title: z.string().min(1).max(120),
        seo_title: z.string().max(160).optional().nullable(),
        seo_description: z.string().max(320).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = await getSb();
    await assertAdmin(context.supabase as any, context.userId);
    const { data: maxRow } = await sb
      .from("site_pages")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.sort_order ?? -1) + 1;
    const { data: row, error } = await sb
      .from("site_pages")
      .insert({
        slug: data.slug,
        title: data.title,
        seo_title: data.seo_title ?? null,
        seo_description: data.seo_description ?? null,
        sort_order: nextOrder,
        status: "draft",
        is_home: false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { page: row as SitePage };
  });

// ---------- UPDATE ----------
export const adminUpdatePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        slug: slugSchema.optional(),
        title: z.string().min(1).max(120).optional(),
        seo_title: z.string().max(160).nullable().optional(),
        seo_description: z.string().max(320).nullable().optional(),
        status: statusSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = await getSb();
    await assertAdmin(context.supabase as any, context.userId);
    const { id, ...patch } = data;
    const { data: row, error } = await sb
      .from("site_pages")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { page: row as SitePage };
  });

// ---------- DELETE ----------
export const adminDeletePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = await getSb();
    await assertAdmin(context.supabase as any, context.userId);
    const { data: row, error: getErr } = await sb
      .from("site_pages")
      .select("is_home")
      .eq("id", data.id)
      .single();
    if (getErr) throw new Error(getErr.message);
    if (row?.is_home)
      throw new Error("Cannot delete the homepage. Set another page as homepage first.");
    const { error } = await sb.from("site_pages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- DUPLICATE ----------
export const adminDuplicatePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = await getSb();
    await assertAdmin(context.supabase as any, context.userId);
    const { data: src, error: getErr } = await sb
      .from("site_pages")
      .select("*")
      .eq("id", data.id)
      .single();
    if (getErr) throw new Error(getErr.message);
    if (!src) throw new Error("Page not found");
    // unique slug
    let candidate = `${src.slug}-copy`;
    let i = 2;
    // try a few times
    while (true) {
      const { data: existing } = await sb
        .from("site_pages")
        .select("id")
        .eq("slug", candidate)
        .maybeSingle();
      if (!existing) break;
      candidate = `${src.slug}-copy-${i++}`;
      if (i > 50) throw new Error("Could not generate unique slug");
    }
    const { data: maxRow } = await sb
      .from("site_pages")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.sort_order ?? -1) + 1;
    const { data: newPage, error } = await sb
      .from("site_pages")
      .insert({
        slug: candidate,
        title: `${src.title} (copy)`,
        seo_title: src.seo_title,
        seo_description: src.seo_description,
        sort_order: nextOrder,
        status: "draft",
        is_home: false,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // copy sections
    const { data: sections } = await sb
      .from("site_page_sections")
      .select("kind,content,sort_order,visible")
      .eq("page_id", src.id);
    if (sections && sections.length) {
      const rows = sections.map((s: any) => ({ ...s, page_id: newPage.id }));
      await sb.from("site_page_sections").insert(rows);
    }
    return { page: newPage as SitePage };
  });

// ---------- SET HOMEPAGE ----------
export const adminSetHomepage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const sb = await getSb();
    await assertAdmin(context.supabase as any, context.userId);
    // clear current
    const { error: clearErr } = await sb
      .from("site_pages")
      .update({ is_home: false })
      .eq("is_home", true);
    if (clearErr) throw new Error(clearErr.message);
    const { error } = await sb
      .from("site_pages")
      .update({ is_home: true, status: "published" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- REORDER ----------
export const adminReorderPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        order: z
          .array(z.object({ id: z.string().uuid(), sort_order: z.number().int().min(0) }))
          .min(1)
          .max(200),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const sb = await getSb();
    await assertAdmin(context.supabase as any, context.userId);
    for (const item of data.order) {
      const { error } = await sb
        .from("site_pages")
        .update({ sort_order: item.sort_order })
        .eq("id", item.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });