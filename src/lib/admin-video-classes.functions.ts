// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { sanitizeSearchTerm } from "@/lib/admin-search-sanitize";
import { syncModuleHiddenFlag } from "@/lib/module-visibility.functions";
import { noInput } from "@/lib/validate";

const statusEnum = z.enum(["draft", "published", "archived"]);
const kindEnum = z.enum(["youtube", "playlist", "upload"]);

const selectCols =
  "id,title,description,level,subject_id,chapter_id,instructor,kind,youtube_url,youtube_video_id,youtube_playlist_id,thumbnail_url,duration_seconds,playlist_key,position,tags,status,is_hidden,is_featured,scheduled_at,view_count,created_at,updated_at";

// ---------- YouTube parsing helpers ----------
export function parseYouTube(url: string): {
  videoId: string | null;
  playlistId: string | null;
  thumb: string | null;
} {
  try {
    const u = new URL(url);
    let videoId: string | null = null;
    let playlistId: string | null = null;
    if (u.hostname.includes("youtu.be")) {
      videoId = u.pathname.replace("/", "") || null;
    } else if (u.hostname.includes("youtube.com")) {
      videoId = u.searchParams.get("v");
      playlistId = u.searchParams.get("list");
      if (!videoId && u.pathname.startsWith("/embed/")) videoId = u.pathname.split("/")[2] ?? null;
      if (!videoId && u.pathname.startsWith("/shorts/")) videoId = u.pathname.split("/")[2] ?? null;
    }
    const thumb = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
    return { videoId, playlistId, thumb };
  } catch {
    return { videoId: null, playlistId: null, thumb: null };
  }
}

// ---------- ADMIN LIST ----------
export const adminListVideoClasses = createServerFn({ method: "POST" })
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
          pageSize: z.number().int().min(1).max(100).default(50),
        })
        .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = context.supabase
      .from("video_classes")
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
      if (term) q = q.or(`title.ilike.%${term}%,instructor.ilike.%${term}%`);
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
    .from("video_class_visibility")
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

export const getVideoClassVisibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content", "video_classes.read_visibility");
    return loadVisibility(context.supabase);
  });

const visInput = z.object({
  section_hidden: z.boolean(),
  hidden_levels: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  hidden_subject_ids: z.array(z.string().uuid()).max(500).default([]),
  hidden_chapter_ids: z.array(z.string().uuid()).max(2000).default([]),
});

export const adminSetVideoClassVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof visInput>) => visInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const updatedAt = new Date().toISOString();
    const { error } = await context.supabase
      .from("video_class_visibility")
      .upsert({ id: 1, ...data, updated_at: updatedAt });
    if (error) throw error;
    await syncModuleHiddenFlag(context.supabase, "classes", data.section_hidden, updatedAt);
    return { ok: true };
  });

// ---------- STUDENT LIST ----------
export const listPublicVideoClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (i: {
      subjectId?: string;
      chapterId?: string;
      level?: string;
      playlistKey?: string;
      limit?: number;
    }) =>
      z
        .object({
          subjectId: z.string().uuid().optional(),
          chapterId: z.string().uuid().optional(),
          level: z.string().trim().max(40).optional(),
          playlistKey: z.string().trim().max(120).optional(),
          limit: z.number().int().min(1).max(500).default(200),
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
      .from("video_classes")
      .select(selectCols)
      .eq("status", "published")
      .eq("is_hidden", false)
      .order("position", { ascending: true })
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (data.subjectId) q = q.eq("subject_id", data.subjectId);
    if (data.chapterId) q = q.eq("chapter_id", data.chapterId);
    if (data.level) q = q.eq("level", data.level);
    if (data.playlistKey) q = q.eq("playlist_key", data.playlistKey);
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
const vcInput = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).nullable().optional(),
  level: z.string().trim().min(1).max(40).default("professional"),
  subject_id: z.string().uuid().nullable().optional(),
  chapter_id: z.string().uuid().nullable().optional(),
  instructor: z.string().trim().max(160).nullable().optional(),
  kind: kindEnum.default("youtube"),
  youtube_url: z.string().url().max(1000).nullable().optional(),
  thumbnail_url: z.string().url().max(1000).nullable().optional(),
  duration_seconds: z.number().int().min(0).max(86400).default(0),
  playlist_key: z.string().trim().max(120).nullable().optional(),
  position: z.number().int().min(0).max(10000).default(0),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  status: statusEnum.default("draft"),
  is_hidden: z.boolean().default(false),
  is_featured: z.boolean().default(false),
  scheduled_at: z.string().datetime().nullable().optional(),
});

function deriveYouTubeFields(payload: z.infer<typeof vcInput>) {
  if (!payload.youtube_url) return {};
  const parsed = parseYouTube(payload.youtube_url);
  return {
    youtube_video_id: parsed.videoId,
    youtube_playlist_id: parsed.playlistId,
    thumbnail_url: payload.thumbnail_url ?? parsed.thumb ?? null,
  };
}

export const adminCreateVideoClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof vcInput>) => vcInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const derived = deriveYouTubeFields(data);
    const { data: row, error } = await context.supabase
      .from("video_classes")
      .insert({ ...data, ...derived, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

const vcUpdate = vcInput.partial().extend({ id: z.string().uuid() });
export const adminUpdateVideoClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof vcUpdate>) => vcUpdate.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { id, ...patch } = data;
    const extra: Record<string, unknown> = {};
    if (patch.youtube_url) {
      const parsed = parseYouTube(patch.youtube_url);
      extra.youtube_video_id = parsed.videoId;
      extra.youtube_playlist_id = parsed.playlistId;
      if (!patch.thumbnail_url) extra.thumbnail_url = parsed.thumb;
    }
    const { error } = await context.supabase
      .from("video_classes")
      .update({ ...patch, ...extra, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDeleteVideoClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase.from("video_classes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetVideoClassStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; status: z.infer<typeof statusEnum> }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("video_classes")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminSetVideoClassHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; is_hidden: boolean }) =>
    z.object({ id: z.string().uuid(), is_hidden: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { error } = await context.supabase
      .from("video_classes")
      .update({ is_hidden: data.is_hidden, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const adminDuplicateVideoClass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const { data: src, error: se } = await context.supabase
      .from("video_classes")
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
      title: `${(src as { title: string }).title} (copy)`,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await context.supabase.from("video_classes").insert(payload as any);
    if (error) throw error;
    return { ok: true };
  });

// ---------- BULK PLAYLIST IMPORT ----------
const bulkInput = z.object({
  playlist_key: z.string().trim().min(1).max(120),
  level: z.string().trim().min(1).max(40).default("professional"),
  subject_id: z.string().uuid().nullable().optional(),
  chapter_id: z.string().uuid().nullable().optional(),
  status: statusEnum.default("draft"),
  urls: z.array(z.string().url().max(1000)).min(1).max(200),
});
export const adminBulkImportVideoClasses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof bulkInput>) => bulkInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_content");
    const rows = data.urls.map((u, i) => {
      const parsed = parseYouTube(u);
      return {
        title: parsed.videoId ? `Lesson ${i + 1}` : u.slice(0, 60),
        level: data.level,
        subject_id: data.subject_id ?? null,
        chapter_id: data.chapter_id ?? null,
        kind: "youtube" as const,
        youtube_url: u,
        youtube_video_id: parsed.videoId,
        youtube_playlist_id: parsed.playlistId,
        thumbnail_url: parsed.thumb,
        playlist_key: data.playlist_key,
        position: i,
        status: data.status,
        created_by: context.userId,
      };
    });
    const { error } = await context.supabase.from("video_classes").insert(rows);
    if (error) throw error;
    return { ok: true, inserted: rows.length };
  });