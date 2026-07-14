// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { assertPermission } from "@/lib/admin-permissions";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as publicClient } from "@/integrations/supabase/client";
import {
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitKey,
} from "@/integrations/security/rate-limit";

// ---------- Shared types ----------
export type BlogPostListItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image_url: string | null;
  status: "draft" | "published" | "archived";
  category_id: string | null;
  category_name: string | null;
  category_slug: string | null;
  reading_minutes: number;
  view_count: number;
  published_at: string | null;
  updated_at: string;
  author_name: string | null;
};

export type BlogPostFull = BlogPostListItem & {
  content: string;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  tags: { id: string; slug: string; name: string }[];
};

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------- Public reads ----------

export const listPublishedPosts = createServerFn({ method: "GET" })
  .validator((i: { limit?: number; categorySlug?: string } | undefined) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).default(50),
        categorySlug: z.string().trim().max(80).optional(),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    let q = publicClient
      .from("blog_posts")
      .select(
        "id,slug,title,excerpt,cover_image_url,status,category_id,reading_minutes,view_count,published_at,updated_at",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(data.limit);
    if (data.categorySlug) {
      const { data: cat } = await publicClient
        .from("blog_categories")
        .select("id")
        .eq("slug", data.categorySlug)
        .maybeSingle();
      if (!cat) return [];
      q = q.eq("category_id", cat.id);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if (!rows?.length) return [];
    const catIds = Array.from(new Set(rows.map((r) => r.category_id).filter(Boolean) as string[]));
    const { data: cats } = catIds.length
      ? await publicClient.from("blog_categories").select("id,name,slug").in("id", catIds)
      : { data: [] as Array<{ id: string; name: string; slug: string }> };
    const cmap = new Map((cats ?? []).map((c) => [c.id, c]));
    return rows.map((r) => ({
      ...r,
      category_name: r.category_id ? (cmap.get(r.category_id)?.name ?? null) : null,
      category_slug: r.category_id ? (cmap.get(r.category_id)?.slug ?? null) : null,
      author_name: null,
    })) as BlogPostListItem[];
  });

export const getPublishedPost = createServerFn({ method: "GET" })
  .validator((i: { slug: string }) =>
    z.object({ slug: z.string().trim().min(1).max(160) }).parse(i),
  )
  .handler(async ({ data }) => {
    const { data: post, error } = await publicClient
      .from("blog_posts")
      .select("*")
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) return null;
    const [{ data: cat }, { data: tagLinks }] = await Promise.all([
      post.category_id
        ? publicClient
            .from("blog_categories")
            .select("id,name,slug")
            .eq("id", post.category_id)
            .maybeSingle()
        : Promise.resolve({ data: null as null | { id: string; name: string; slug: string } }),
      publicClient.from("blog_post_tags").select("tag_id").eq("post_id", post.id),
    ]);
    const tagIds = (tagLinks ?? []).map((t) => t.tag_id as string);
    const { data: tags } = tagIds.length
      ? await publicClient.from("blog_tags").select("id,slug,name").in("id", tagIds)
      : { data: [] as Array<{ id: string; slug: string; name: string }> };
    return {
      ...post,
      category_name: cat?.name ?? null,
      category_slug: cat?.slug ?? null,
      author_name: null,
      tags: tags ?? [],
    } as BlogPostFull;
  });

export const listCategories = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient
    .from("blog_categories")
    .select("id,slug,name,description,sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const trackBlogView = createServerFn({ method: "POST" })
  .validator((i: { postId: string; referrer?: string; userAgent?: string }) =>
    z
      .object({
        postId: z.string().uuid(),
        referrer: z.string().max(500).optional(),
        userAgent: z.string().max(500).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    // Rate-limit blog views per post + best-effort caller identity.
    // Public/anon path → key by post id (still bounds total noise per post).
    await enforceRateLimit(
      // publicClient hits the RPC with the anon role, which is sufficient
      // because check_rate_limit is SECURITY DEFINER.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      publicClient as any,
      rateLimitKey("blog:view", "post", data.postId),
      RATE_LIMITS.BLOG_VIEW,
    );
    await publicClient.from("blog_views").insert({
      post_id: data.postId,
      referrer: data.referrer ?? null,
      user_agent: data.userAgent ?? null,
    });
    await publicClient.rpc("blog_increment_view", { _post_id: data.postId });
    return { ok: true };
  });

// ---------- Admin writes ----------

// Unified RBAC: route every admin blog write through the centralized
// permission framework so admin_action_log audit entries are recorded and
// the per-user admin-write rate limit applies. Backed by has_permission()
// which honours super_admin + role_permissions matrix.
async function ensureAdmin(
  supabase: any,
  userId: string,
  action: string = "blog.write",
  metadata?: Record<string, unknown>,
) {
  await assertPermission(supabase, userId, "manage_content", action, metadata);
}

const postInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(160).regex(slugRe, "slug must be lowercase-hyphenated"),
  title: z.string().trim().min(1).max(240),
  excerpt: z.string().trim().max(500).nullable().optional(),
  content: z.string().max(200_000).default(""),
  cover_image_url: z.string().url().max(1000).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  category_id: z.string().uuid().nullable().optional(),
  reading_minutes: z.number().int().min(1).max(120).default(1),
  seo_title: z.string().trim().max(240).nullable().optional(),
  seo_description: z.string().trim().max(320).nullable().optional(),
  og_image_url: z.string().url().max(1000).nullable().optional(),
  published_at: z.string().datetime().nullable().optional(),
  tag_ids: z.array(z.string().uuid()).max(30).default([]),
});

export const adminListPosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("blog_posts")
      .select(
        "id,slug,title,status,category_id,reading_minutes,view_count,published_at,updated_at,created_at",
      )
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminGetPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: post, error } = await context.supabase
      .from("blog_posts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!post) return null;
    const { data: tags } = await context.supabase
      .from("blog_post_tags")
      .select("tag_id")
      .eq("post_id", post.id);
    return { ...post, tag_ids: (tags ?? []).map((t) => t.tag_id as string) };
  });

export const adminUpsertPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => postInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { tag_ids, id, published_at, ...fields } = data;
    const row = {
      ...fields,
      author_id: context.userId,
      published_at:
        fields.status === "published" ? (published_at ?? new Date().toISOString()) : null,
    };
    let postId = id;
    if (postId) {
      const { error } = await context.supabase.from("blog_posts").update(row).eq("id", postId);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await context.supabase
        .from("blog_posts")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      postId = ins.id as string;
    }
    // sync tags
    await context.supabase.from("blog_post_tags").delete().eq("post_id", postId);
    if (tag_ids.length) {
      await context.supabase
        .from("blog_post_tags")
        .insert(tag_ids.map((tid) => ({ post_id: postId!, tag_id: tid })));
    }
    return { id: postId };
  });

export const adminDeletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("blog_posts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const categoryInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(80).regex(slugRe),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(0),
});

export const adminUpsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => categoryInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { id, ...fields } = data;
    if (id) {
      const { error } = await context.supabase.from("blog_categories").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: ins, error } = await context.supabase
      .from("blog_categories")
      .insert(fields)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string };
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("blog_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const tagInput = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().trim().min(1).max(80).regex(slugRe),
  name: z.string().trim().min(1).max(80),
});

export const adminListTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("blog_tags")
      .select("id,slug,name,created_at")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpsertTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => tagInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { id, ...fields } = data;
    if (id) {
      const { error } = await context.supabase.from("blog_tags").update(fields).eq("id", id);
      if (error) throw new Error(error.message);
      return { id };
    }
    const { data: ins, error } = await context.supabase
      .from("blog_tags")
      .insert(fields)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: ins.id as string };
  });

export const adminDeleteTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("blog_tags").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
// ---------- Premium Blog Manager: Overview / Bulk / Analytics ----------

export type BlogOverview = {
  total: number;
  published: number;
  drafts: number;
  scheduled: number;
  archived: number;
  featured: number;
  totalViews: number;
  monthlyViews: number;
  topPost: { id: string; title: string; slug: string; views: number } | null;
};

export const adminBlogOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: posts, error } = await context.supabase
      .from("blog_posts")
      .select("id,title,slug,status,view_count,published_at");
    if (error) throw new Error(error.message);
    const rows = posts ?? [];
    const now = Date.now();
    const scheduled = rows.filter(
      (p: any) =>
        p.status !== "published" && p.published_at && new Date(p.published_at).getTime() > now,
    ).length;
    const sorted = [...rows].sort((a: any, b: any) => (b.view_count ?? 0) - (a.view_count ?? 0));
    const top = sorted[0];
    const featured = Math.min(3, sorted.filter((p: any) => (p.view_count ?? 0) > 0).length);
    const totalViews = rows.reduce((a: number, b: any) => a + (b.view_count ?? 0), 0);
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: monthly } = await context.supabase
      .from("blog_views")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    return {
      total: rows.length,
      published: rows.filter((p: any) => p.status === "published").length,
      drafts: rows.filter((p: any) => p.status === "draft").length,
      scheduled,
      archived: rows.filter((p: any) => p.status === "archived").length,
      featured,
      totalViews,
      monthlyViews: monthly ?? 0,
      topPost: top
        ? { id: top.id, title: top.title, slug: top.slug, views: top.view_count ?? 0 }
        : null,
    } as BlogOverview;
  });

const idsInput = z.object({ ids: z.array(z.string().uuid()).min(1).max(500) });

export const adminBulkUpdateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    idsInput.extend({ status: z.enum(["draft", "published", "archived"]) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const patch: any = { status: data.status };
    if (data.status === "published") patch.published_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("blog_posts")
      .update(patch)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const adminBulkDeletePosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => idsInput.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await context.supabase.from("blog_posts").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const adminBulkAssignCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    idsInput.extend({ category_id: z.string().uuid().nullable() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("blog_posts")
      .update({ category_id: data.category_id })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminBulkAssignTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) =>
    idsInput
      .extend({
        tag_ids: z.array(z.string().uuid()).max(30),
        mode: z.enum(["add", "replace"]).default("add"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    if (data.mode === "replace") {
      await context.supabase.from("blog_post_tags").delete().in("post_id", data.ids);
    }
    if (data.tag_ids.length) {
      const rows: { post_id: string; tag_id: string }[] = [];
      for (const pid of data.ids) for (const tid of data.tag_ids) rows.push({ post_id: pid, tag_id: tid });
      await context.supabase.from("blog_post_tags").upsert(rows, { onConflict: "post_id,tag_id" });
    }
    return { ok: true };
  });

export const adminDuplicatePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: src, error } = await context.supabase
      .from("blog_posts")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!src) throw new Error("Post not found");
    const baseSlug = `${src.slug}-copy`;
    let slug = baseSlug;
    let i = 1;
    // ensure unique
    while (true) {
      const { data: existing } = await context.supabase
        .from("blog_posts")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      i += 1;
      slug = `${baseSlug}-${i}`;
    }
    const insertRow: any = {
      slug,
      title: `${src.title} (Copy)`,
      excerpt: src.excerpt,
      content: src.content,
      cover_image_url: src.cover_image_url,
      status: "draft",
      category_id: src.category_id,
      reading_minutes: src.reading_minutes,
      seo_title: src.seo_title,
      seo_description: src.seo_description,
      og_image_url: src.og_image_url,
      author_id: context.userId,
      published_at: null,
    };
    const { data: ins, error: e2 } = await context.supabase
      .from("blog_posts")
      .insert(insertRow)
      .select("id")
      .single();
    if (e2) throw new Error(e2.message);
    const { data: tagLinks } = await context.supabase
      .from("blog_post_tags")
      .select("tag_id")
      .eq("post_id", data.id);
    if (tagLinks?.length) {
      await context.supabase
        .from("blog_post_tags")
        .insert(tagLinks.map((t: any) => ({ post_id: ins.id, tag_id: t.tag_id })));
    }
    return { id: ins.id as string };
  });

export type BlogAnalytics = {
  totalViews: number;
  monthlyViews: number;
  growthPct: number;
  daily: { date: string; views: number }[];
  topPosts: { id: string; title: string; slug: string; views: number }[];
  trending: { id: string; title: string; slug: string; recent: number }[];
  categoryPerformance: { id: string | null; name: string; posts: number; views: number }[];
  topReferrers: { source: string; views: number }[];
};

export const adminBlogAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const now = Date.now();
    const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const since60 = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [{ data: views30 }, { data: prev30 }, { data: posts }, { data: cats }] =
      await Promise.all([
        context.supabase
          .from("blog_views")
          .select("created_at,post_id,referrer")
          .gte("created_at", since30),
        context.supabase
          .from("blog_views")
          .select("id", { count: "exact" })
          .gte("created_at", since60)
          .lt("created_at", since30),
        context.supabase
          .from("blog_posts")
          .select("id,title,slug,view_count,category_id"),
        context.supabase.from("blog_categories").select("id,name"),
      ]);
    const v30 = views30 ?? [];
    const monthlyViews = v30.length;
    const prevCount = (prev30 ?? []).length;
    const growthPct = prevCount === 0 ? (monthlyViews > 0 ? 100 : 0) : Math.round(((monthlyViews - prevCount) / prevCount) * 100);
    // daily buckets last 30 days
    const buckets = new Map<string, number>();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }
    for (const v of v30) {
      const key = (v.created_at as string).slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const daily = Array.from(buckets.entries()).map(([date, views]) => ({ date, views }));
    const totalViews = (posts ?? []).reduce((a, b: any) => a + (b.view_count ?? 0), 0);
    const topPosts = [...(posts ?? [])]
      .sort((a: any, b: any) => (b.view_count ?? 0) - (a.view_count ?? 0))
      .slice(0, 8)
      .map((p: any) => ({ id: p.id, title: p.title, slug: p.slug, views: p.view_count ?? 0 }));
    // trending: views in last 7d per post
    const recentMap = new Map<string, number>();
    for (const v of v30) {
      if ((v.created_at as string) >= since7) {
        recentMap.set(v.post_id as string, (recentMap.get(v.post_id as string) ?? 0) + 1);
      }
    }
    const postById = new Map((posts ?? []).map((p: any) => [p.id, p]));
    const trending = Array.from(recentMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, recent]) => {
        const p: any = postById.get(id);
        return { id, title: p?.title ?? "—", slug: p?.slug ?? "", recent };
      });
    const catMap = new Map((cats ?? []).map((c: any) => [c.id, c.name]));
    const perfMap = new Map<string, { id: string | null; name: string; posts: number; views: number }>();
    for (const p of posts ?? []) {
      const key = (p as any).category_id ?? "__none__";
      const name = (p as any).category_id ? (catMap.get((p as any).category_id) ?? "—") : "Uncategorized";
      const cur = perfMap.get(key) ?? { id: (p as any).category_id ?? null, name, posts: 0, views: 0 };
      cur.posts += 1;
      cur.views += (p as any).view_count ?? 0;
      perfMap.set(key, cur);
    }
    const categoryPerformance = Array.from(perfMap.values()).sort((a, b) => b.views - a.views);
    const refMap = new Map<string, number>();
    for (const v of v30) {
      let src = (v.referrer as string | null) ?? "Direct";
      try {
        if (src && src !== "Direct") src = new URL(src).hostname.replace(/^www\./, "");
      } catch {
        // keep as-is
      }
      refMap.set(src, (refMap.get(src) ?? 0) + 1);
    }
    const topReferrers = Array.from(refMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([source, views]) => ({ source, views }));
    return {
      totalViews,
      monthlyViews,
      growthPct,
      daily,
      topPosts,
      trending,
      categoryPerformance,
      topReferrers,
    } as BlogAnalytics;
  });

export type BlogMediaItem = { url: string; usedIn: number; lastUsed: string };

export const adminListBlogMedia = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("blog_posts")
      .select("cover_image_url,og_image_url,updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    const map = new Map<string, BlogMediaItem>();
    for (const row of data ?? []) {
      for (const u of [row.cover_image_url, row.og_image_url] as (string | null)[]) {
        if (!u) continue;
        const cur = map.get(u);
        if (cur) {
          cur.usedIn += 1;
        } else {
          map.set(u, { url: u, usedIn: 1, lastUsed: row.updated_at as string });
        }
      }
    }
    return Array.from(map.values());
  });

// ---------- Phase 2: Authors, SEO Audit, Per-Post Performance, Scheduled Publish, Export ----------

export type BlogAuthorStat = {
  author_id: string;
  name: string;
  email: string | null;
  posts: number;
  published: number;
  drafts: number;
  totalViews: number;
  lastPublishedAt: string | null;
};

export const adminListAuthors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: posts, error } = await context.supabase
      .from("blog_posts")
      .select("author_id,status,view_count,published_at");
    if (error) throw new Error(error.message);
    const grouped = new Map<string, BlogAuthorStat>();
    for (const p of posts ?? []) {
      const aid = (p as any).author_id as string | null;
      if (!aid) continue;
      const cur = grouped.get(aid) ?? {
        author_id: aid,
        name: "Author",
        email: null,
        posts: 0,
        published: 0,
        drafts: 0,
        totalViews: 0,
        lastPublishedAt: null,
      };
      cur.posts += 1;
      if ((p as any).status === "published") cur.published += 1;
      if ((p as any).status === "draft") cur.drafts += 1;
      cur.totalViews += (p as any).view_count ?? 0;
      const pa = (p as any).published_at as string | null;
      if (pa && (!cur.lastPublishedAt || pa > cur.lastPublishedAt)) cur.lastPublishedAt = pa;
      grouped.set(aid, cur);
    }
    const ids = Array.from(grouped.keys());
    if (ids.length) {
      const { data: profiles } = await context.supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", ids);
      for (const p of profiles ?? []) {
        const g = grouped.get((p as any).id);
        if (g) g.name = (p as any).display_name || g.name;
      }
    }
    return Array.from(grouped.values()).sort((a, b) => b.totalViews - a.totalViews);
  });

export type BlogAuditIssue = {
  postId: string;
  slug: string;
  title: string;
  severity: "error" | "warning" | "info";
  category: "metadata" | "slug" | "content" | "image" | "schema";
  message: string;
};

export const adminSeoAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: posts, error } = await context.supabase
      .from("blog_posts")
      .select(
        "id,slug,title,excerpt,content,seo_title,seo_description,cover_image_url,og_image_url,status,published_at",
      );
    if (error) throw new Error(error.message);
    const rows = posts ?? [];
    const issues: BlogAuditIssue[] = [];
    const slugCounts = new Map<string, number>();
    for (const p of rows) slugCounts.set((p as any).slug, (slugCounts.get((p as any).slug) ?? 0) + 1);

    for (const p of rows as any[]) {
      const isPublished = p.status === "published";
      const sev = (s: "error" | "warning" | "info") => (isPublished ? s : "info");
      const push = (severity: BlogAuditIssue["severity"], category: BlogAuditIssue["category"], message: string) =>
        issues.push({ postId: p.id, slug: p.slug, title: p.title, severity, category, message });

      const t = (p.seo_title || p.title || "").trim();
      if (!t) push("error", "metadata", "Missing title");
      else if (t.length < 30) push(sev("warning"), "metadata", `Title too short (${t.length} chars; ideal 30–65)`);
      else if (t.length > 65) push(sev("warning"), "metadata", `Title too long (${t.length} chars; ideal 30–65)`);

      const d = (p.seo_description || p.excerpt || "").trim();
      if (!d) push(sev("warning"), "metadata", "Missing meta description / excerpt");
      else if (d.length < 70) push(sev("info"), "metadata", `Meta description short (${d.length}/70+)`);
      else if (d.length > 160) push(sev("info"), "metadata", `Meta description long (${d.length}; ideal ≤160)`);

      if (!p.slug || !/^[a-z0-9-]+$/.test(p.slug)) push("error", "slug", "Slug is not URL-friendly");
      if ((slugCounts.get(p.slug) ?? 0) > 1) push("error", "slug", "Duplicate slug across posts");

      if (!p.cover_image_url && !p.og_image_url)
        push(sev("warning"), "image", "No featured / OG image set");

      const wc = (p.content ?? "").replace(/<[^>]+>/g, " ").match(/\b\w+\b/g)?.length ?? 0;
      if (isPublished && wc < 120) push("warning", "content", `Very thin content (${wc} words)`);
      else if (isPublished && wc < 300) push("info", "content", `Short content (${wc} words; aim 300+)`);

      // simple internal link check
      const linkMatches = Array.from((p.content ?? "").matchAll(/\]\(([^)\s]+)\)/g)).map((m: any) => m[1] as string);
      const broken = linkMatches.filter((u) => u.startsWith("(") || u.endsWith(")") || u === "https://" || u === "http://");
      if (broken.length) push("warning", "content", `${broken.length} suspicious / placeholder link(s)`);

      // schema requirements: headline + image for BlogPosting
      if (isPublished && !(p.cover_image_url || p.og_image_url))
        push("info", "schema", "JSON-LD BlogPosting missing image");
      if (isPublished && !p.published_at)
        push("warning", "schema", "Published post has no publication date");
    }

    const summary = {
      error: issues.filter((i) => i.severity === "error").length,
      warning: issues.filter((i) => i.severity === "warning").length,
      info: issues.filter((i) => i.severity === "info").length,
    };
    return { issues, summary, totalPosts: rows.length };
  });

export type BlogPostPerf = {
  id: string;
  title: string;
  slug: string;
  totalViews: number;
  daily: { date: string; views: number }[];
  last7: number;
  last30: number;
  prev30: number;
  growthPct: number;
  lastViewAt: string | null;
  daysSinceLastView: number | null;
};

export const adminPostPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { data: post } = await context.supabase
      .from("blog_posts")
      .select("id,title,slug,view_count")
      .eq("id", data.id)
      .maybeSingle();
    if (!post) throw new Error("Post not found");
    const now = Date.now();
    const since60 = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    const { data: views } = await context.supabase
      .from("blog_views")
      .select("created_at")
      .eq("post_id", data.id)
      .gte("created_at", since60)
      .order("created_at", { ascending: false });
    const v = views ?? [];
    const since30Ms = now - 30 * 24 * 60 * 60 * 1000;
    const since7Ms = now - 7 * 24 * 60 * 60 * 1000;
    let last7 = 0,
      last30 = 0,
      prev30 = 0;
    for (const r of v) {
      const t = new Date((r as any).created_at).getTime();
      if (t >= since30Ms) {
        last30 += 1;
        if (t >= since7Ms) last7 += 1;
      } else prev30 += 1;
    }
    const buckets = new Map<string, number>();
    for (let i = 29; i >= 0; i--)
      buckets.set(new Date(now - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), 0);
    for (const r of v) {
      const key = ((r as any).created_at as string).slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const daily = Array.from(buckets.entries()).map(([date, views]) => ({ date, views }));
    const lastViewAt = v[0] ? ((v[0] as any).created_at as string) : null;
    const daysSinceLastView = lastViewAt
      ? Math.floor((now - new Date(lastViewAt).getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const growthPct = prev30 === 0 ? (last30 > 0 ? 100 : 0) : Math.round(((last30 - prev30) / prev30) * 100);
    return {
      id: (post as any).id,
      title: (post as any).title,
      slug: (post as any).slug,
      totalViews: (post as any).view_count ?? 0,
      daily,
      last7,
      last30,
      prev30,
      growthPct,
      lastViewAt,
      daysSinceLastView,
    } as BlogPostPerf;
  });

export const adminRunScheduledPublish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const nowIso = new Date().toISOString();
    const { data: due, error } = await context.supabase
      .from("blog_posts")
      .select("id")
      .neq("status", "published")
      .not("published_at", "is", null)
      .lte("published_at", nowIso);
    if (error) throw new Error(error.message);
    const ids = (due ?? []).map((r: any) => r.id);
    if (!ids.length) return { ok: true, count: 0 };
    const { error: e2 } = await context.supabase
      .from("blog_posts")
      .update({ status: "published" })
      .in("id", ids);
    if (e2) throw new Error(e2.message);
    return { ok: true, count: ids.length };
  });

export const adminExportPosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { ids?: string[] } | undefined) =>
    z.object({ ids: z.array(z.string().uuid()).max(500).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    let q = context.supabase.from("blog_posts").select("*");
    if (data.ids?.length) q = q.in("id", data.ids);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { exportedAt: new Date().toISOString(), count: rows?.length ?? 0, posts: rows ?? [] };
  });

// ---------- Public extras (premium blog UX) ----------

export const listTrendingPosts = createServerFn({ method: "GET" })
  .validator((i: { limit?: number } | undefined) =>
    z.object({ limit: z.number().int().min(1).max(20).default(5) }).parse(i ?? {}),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await publicClient
      .from("blog_posts")
      .select(
        "id,slug,title,excerpt,cover_image_url,category_id,reading_minutes,view_count,published_at,updated_at",
      )
      .eq("status", "published")
      .order("view_count", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listRelatedPosts = createServerFn({ method: "GET" })
  .validator((i: { postId: string; categoryId?: string | null; limit?: number }) =>
    z
      .object({
        postId: z.string().uuid(),
        categoryId: z.string().uuid().nullable().optional(),
        limit: z.number().int().min(1).max(10).default(3),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    let q = publicClient
      .from("blog_posts")
      .select("id,slug,title,excerpt,cover_image_url,reading_minutes,published_at,view_count")
      .eq("status", "published")
      .neq("id", data.postId)
      .order("published_at", { ascending: false })
      .limit(data.limit);
    if (data.categoryId) q = q.eq("category_id", data.categoryId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    if ((rows?.length ?? 0) >= data.limit || !data.categoryId) return rows ?? [];
    // Top up with any latest posts if not enough in category
    const have = new Set((rows ?? []).map((r: any) => r.id));
    const need = data.limit - (rows?.length ?? 0);
    const { data: extra } = await publicClient
      .from("blog_posts")
      .select("id,slug,title,excerpt,cover_image_url,reading_minutes,published_at,view_count")
      .eq("status", "published")
      .neq("id", data.postId)
      .order("published_at", { ascending: false })
      .limit(need + 5);
    return [...(rows ?? []), ...((extra ?? []).filter((r: any) => !have.has(r.id)).slice(0, need))];
  });

export const getAdjacentPosts = createServerFn({ method: "GET" })
  .validator((i: { publishedAt: string | null }) =>
    z.object({ publishedAt: z.string().nullable() }).parse(i),
  )
  .handler(async ({ data }) => {
    if (!data.publishedAt) return { prev: null, next: null };
    const [{ data: prev }, { data: next }] = await Promise.all([
      publicClient
        .from("blog_posts")
        .select("slug,title")
        .eq("status", "published")
        .lt("published_at", data.publishedAt)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      publicClient
        .from("blog_posts")
        .select("slug,title")
        .eq("status", "published")
        .gt("published_at", data.publishedAt)
        .order("published_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    return { prev: prev ?? null, next: next ?? null };
  });