// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "./site-management.server";

import { noInput } from "@/lib/validate";
// Generated DB types lag behind site-management migrations until regenerated.
// Use loosely-typed aliases for table access; column names are validated by
// Postgres at runtime and by the linter in CI.
// The service-role client is lazily resolved inside each handler so that this
// file is safe to appear in client-reachable import graphs (Vite splits the
// handler bodies into a server-only chunk).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAdmin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPublicReadClient(): Promise<any> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return getAdmin();
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing public Supabase configuration");
  return createClient(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (x: unknown) => x as any;

// SECURITY: Bucket allow-list. Never trust bucket names pulled from DB rows
// directly — an attacker who can write to media_assets.bucket could otherwise
// pivot to arbitrary buckets (e.g. private "documents" via a public read).
// Every storage.from(...) call below funnels through assertApprovedBucket().
const ALLOWED_BUCKETS = new Set(["site-media", "blog", "avatars", "documents"]);
function assertApprovedBucket(bucket: unknown): string {
  if (typeof bucket !== "string" || !ALLOWED_BUCKETS.has(bucket)) {
    throw new Error(`Forbidden: bucket "${String(bucket)}" is not approved`);
  }
  return bucket;
}

// ---------- Types & schemas ----------

const jsonSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);

const sectionKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_-]+$/);
const settingKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_-]+$/);

// =============================================================
// PUBLIC READS — used by landing/site to render published content
// These bypass RLS via supabaseAdmin but ONLY return *published* columns.
// =============================================================

export const publicGetHomepageContent = createServerFn({ method: "GET" })
  .validator(noInput)
  .handler(async () => {
  try {
    const supabaseAdmin = await getPublicReadClient();
    // Use the server-only admin client (bypasses RLS, no localStorage/window
    // access). The previous implementation dynamically imported the BROWSER
    // client which intermittently 500'd on the Worker SSR cold-start because
    // its auth/realtime init touches browser globals.
    const { data, error } = await supabaseAdmin
      .from("homepage_sections")
      .select("section_key,position,visible,published_content,published_at")
      .eq("visible", true)
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      sections: (data ?? []).map((s: any) => ({
        key: s.section_key,
        position: s.position,
        content: s.published_content ?? {},
        publishedAt: s.published_at,
      })),
    };
  } catch (e) {
    // Public landing content must never blank the page on a transient read error.
    console.warn("publicGetHomepageContent failed; using bundled fallback:", e);
    return { sections: [] as Array<Record<string, unknown>> };
  }
});

export const publicGetSiteSettings = createServerFn({ method: "GET" })
  .validator(noInput)
  .handler(async () => {
  try {
    const supabaseAdmin = await getPublicReadClient();
    // M-3 fix: this fn uses the admin client (bypasses RLS), so we must
    // explicitly filter out unpublished settings — otherwise draft-only
    // keys leak to anonymous visitors.
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("key,published_value,published_at")
      .not("published_at", "is", null);
    if (error) throw new Error(error.message);
    const map: Record<string, any> = {};
    for (const row of data ?? []) map[row.key] = row.published_value ?? {};
    return { settings: map };
  } catch (e) {
    console.warn("publicGetSiteSettings failed; using bundled fallback:", e);
    return { settings: {} as Record<string, any> };
  }
});


// =============================================================
// ADMIN — SECTIONS
// =============================================================

export const adminListSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("homepage_sections")
      .select(
        "id,section_key,position,visible,published_content,draft_content,updated_at,published_at",
      )
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    return { sections: data ?? [] };
  });

const updateDraftInput = z.object({
  sectionKey: sectionKeySchema,
  draftContent: jsonSchema,
});

export const adminUpdateSectionDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof updateDraftInput>) => updateDraftInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { error } = await (context.supabase as any)
      .from("homepage_sections")
      .update({
        draft_content: data.draftContent as object,
        updated_by: context.userId,
      })
      .eq("section_key", data.sectionKey);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const publishSectionInput = z.object({
  sectionKey: sectionKeySchema,
  label: z.string().trim().max(120).optional(),
});

export const adminPublishSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof publishSectionInput>) => publishSectionInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);

    // Read draft
    const { data: row, error: readErr } = await (context.supabase as any)
      .from("homepage_sections")
      .select("section_key,draft_content,position,visible")
      .eq("section_key", data.sectionKey)
      .single();
    if (readErr) throw new Error(readErr.message);

    const now = new Date().toISOString();

    // Promote draft -> published
    const { error: updErr } = await (context.supabase as any)
      .from("homepage_sections")
      .update({
        published_content: row.draft_content,
        published_at: now,
        updated_by: context.userId,
      })
      .eq("section_key", data.sectionKey);
    if (updErr) throw new Error(updErr.message);

    // Snapshot
    // Audit snapshot via service-role (see note in adminPublishSetting):
    // content_versions RLS is scoped to has_role('admin') only.
    const admin = await getAdmin();
    const { error: verErr } = await admin.from("content_versions").insert({
      target_kind: "section",
      target_key: data.sectionKey,
      snapshot: {
        content: row.draft_content,
        position: row.position,
        visible: row.visible,
      },
      label: data.label ?? null,
      created_by: context.userId,
    });

    if (verErr) throw new Error(verErr.message);

    return { ok: true as const, publishedAt: now };
  });

const toggleVisibilityInput = z.object({
  sectionKey: sectionKeySchema,
  visible: z.boolean(),
});

export const adminToggleSectionVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof toggleVisibilityInput>) => toggleVisibilityInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { error } = await (context.supabase as any)
      .from("homepage_sections")
      .update({ visible: data.visible, updated_by: context.userId })
      .eq("section_key", data.sectionKey);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const reorderInput = z.object({
  order: z
    .array(z.object({ sectionKey: sectionKeySchema, position: z.number().int().min(0).max(999) }))
    .min(1)
    .max(50),
});

export const adminReorderSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof reorderInput>) => reorderInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    // Sequential updates — list is small
    for (const item of data.order) {
      const { error } = await (context.supabase as any)
        .from("homepage_sections")
        .update({ position: item.position, updated_by: context.userId })
        .eq("section_key", item.sectionKey);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

// =============================================================
// ADMIN — SETTINGS (theme, navbar, footer, contact)
// =============================================================

export const adminListSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { data, error } = await (context.supabase as any)
      .from("site_settings")
      .select("key,published_value,draft_value,updated_at,published_at");
    if (error) throw new Error(error.message);
    return { settings: data ?? [] };
  });

const updateSettingInput = z.object({
  key: settingKeySchema,
  draftValue: jsonSchema,
});

export const adminUpdateSettingDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof updateSettingInput>) => updateSettingInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    // Upsert so admin can introduce new keys safely
    const { error } = await (context.supabase as any).from("site_settings").upsert(
      {
        key: data.key,
        draft_value: data.draftValue as object,
        updated_by: context.userId,
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const publishSettingInput = z.object({
  key: settingKeySchema,
  label: z.string().trim().max(120).optional(),
});

export const adminPublishSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof publishSettingInput>) => publishSettingInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { data: row, error: readErr } = await (context.supabase as any)
      .from("site_settings")
      .select("key,draft_value")
      .eq("key", data.key)
      .single();
    if (readErr) throw new Error(readErr.message);

    const now = new Date().toISOString();
    const { error: updErr } = await (context.supabase as any)
      .from("site_settings")
      .update({
        published_value: row.draft_value,
        published_at: now,
        updated_by: context.userId,
      })
      .eq("key", data.key);
    if (updErr) throw new Error(updErr.message);

    // Audit snapshot. Authorization is already enforced above via
    // assertAdmin (manage_system). The content_versions RLS policy is scoped
    // to has_role(auth.uid(),'admin') which excludes other privileged roles
    // (e.g. super_admin) and causes "new row violates row-level security
    // policy for table content_versions". Use the service-role client for
    // this server-side audit insert only — never the upstream user write.
    const admin = await getAdmin();
    const { error: verErr } = await admin.from("content_versions").insert({
      target_kind: "setting",
      target_key: data.key,
      snapshot: { value: row.draft_value },
      label: data.label ?? null,
      created_by: context.userId,
    });

    if (verErr) throw new Error(verErr.message);
    return { ok: true as const, publishedAt: now };
  });

// =============================================================
// ADMIN — VERSION HISTORY
// =============================================================

const listVersionsInput = z.object({
  targetKind: z.enum(["section", "setting"]),
  targetKey: z.string().min(1).max(64),
  limit: z.number().int().min(1).max(100).default(30),
});

export const adminListVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listVersionsInput>) => listVersionsInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { data: rows, error } = await (context.supabase as any)
      .from("content_versions")
      .select("id,target_kind,target_key,snapshot,label,created_by,created_at")
      .eq("target_kind", data.targetKind)
      .eq("target_key", data.targetKey)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { versions: rows ?? [] };
  });

const restoreVersionInput = z.object({ versionId: z.string().uuid() });

// Restore writes into DRAFT, never directly publishes — admin must publish.
export const adminRestoreVersionToDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof restoreVersionInput>) => restoreVersionInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const { data: ver, error: readErr } = await (context.supabase as any)
      .from("content_versions")
      .select("target_kind,target_key,snapshot")
      .eq("id", data.versionId)
      .single();
    if (readErr) throw new Error(readErr.message);

    const snap = (ver.snapshot ?? {}) as Record<string, unknown>;

    if (ver.target_kind === "section") {
      const { error } = await (context.supabase as any)
        .from("homepage_sections")
        .update({
          draft_content: (snap as any).content ?? {},
          updated_by: context.userId,
        })
        .eq("section_key", ver.target_key);
      if (error) throw new Error(error.message);
    } else if (ver.target_kind === "setting") {
      const { error } = await (context.supabase as any)
        .from("site_settings")
        .update({
          draft_value: (snap as any).value ?? {},
          updated_by: context.userId,
        })
        .eq("key", ver.target_key);
      if (error) throw new Error(error.message);
    } else {
      throw new Error("Unknown target_kind");
    }
    return { ok: true as const };
  });

// =============================================================
// MEDIA LIBRARY
// =============================================================

const listMediaInput = z.object({
  search: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(64).optional(),
  page: z.number().int().min(1).max(2000).default(1),
  pageSize: z.number().int().min(1).max(100).default(40),
});

export const adminListMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listMediaInput>) => listMediaInput.parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdmin();
    await assertAdmin(context.supabase as any, context.userId);
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = (context.supabase as any)
      .from("media_assets")
      .select(
        "id,bucket,path,file_name,mime_type,size_bytes,width,height,alt_text,tags,created_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);
    if (data.search) q = q.ilike("file_name", `%${data.search}%`);
    if (data.tag) q = q.contains("tags", [data.tag]);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    // Compute public URL for each
    const items = (rows ?? []).map((r: any) => {
      const { data: pub } = (supabaseAdmin as any).storage
        .from(assertApprovedBucket(r.bucket))
        .getPublicUrl(r.path);
      return { ...r, publicUrl: pub.publicUrl };
    });
    return { items, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

const createUploadInput = z.object({
  fileName: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[a-zA-Z0-9._-]+$/),
  mimeType: z
    .string()
    .min(1)
    .max(120)
    .regex(/^(image|video|audio|application)\/[a-zA-Z0-9.+_-]+$/),
  sizeBytes: z
    .number()
    .int()
    .min(1)
    .max(20 * 1024 * 1024), // 20MB cap
});

// Returns a SIGNED upload URL — client uploads directly, then calls finalize.
export const adminCreateMediaUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof createUploadInput>) => createUploadInput.parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdmin();
    await assertAdmin(context.supabase as any, context.userId);
    const ext = data.fileName.includes(".")
      ? data.fileName.slice(data.fileName.lastIndexOf("."))
      : "";
    const base = data.fileName
      .slice(0, data.fileName.length - ext.length)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .slice(0, 60);
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `uploads/${stamp}-${rand}-${base}${ext}`;

    const { data: signed, error } = await (supabaseAdmin as any).storage
      .from("site-media")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);

    return {
      path,
      token: signed.token,
      signedUrl: signed.signedUrl,
      bucket: "site-media" as const,
    };
  });

const finalizeMediaInput = z.object({
  path: z.string().min(1).max(300),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z
    .number()
    .int()
    .min(0)
    .max(40 * 1024 * 1024),
  width: z.number().int().min(0).max(20000).optional(),
  height: z.number().int().min(0).max(20000).optional(),
  altText: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
});

export const adminFinalizeMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof finalizeMediaInput>) => finalizeMediaInput.parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdmin();
    await assertAdmin(context.supabase as any, context.userId);
    const { data: row, error } = await (context.supabase as any)
      .from("media_assets")
      .insert({
        bucket: "site-media",
        path: data.path,
        file_name: data.fileName,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        width: data.width ?? null,
        height: data.height ?? null,
        alt_text: data.altText ?? null,
        tags: data.tags,
        uploaded_by: context.userId,
      })
      .select("id,bucket,path")
      .single();
    if (error) throw new Error(error.message);

    const { data: pub } = (supabaseAdmin as any).storage
      .from(assertApprovedBucket(row.bucket))
      .getPublicUrl(row.path);
    return { id: row.id, publicUrl: pub.publicUrl, path: row.path };
  });

const updateMediaMetaInput = z.object({
  id: z.string().uuid(),
  altText: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
});

export const adminUpdateMediaMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof updateMediaMetaInput>) => updateMediaMetaInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as any, context.userId);
    const patch: Record<string, any> = {};
    if (data.altText !== undefined) patch.alt_text = data.altText;
    if (data.tags !== undefined) patch.tags = data.tags;
    const { error } = await (context.supabase as any)
      .from("media_assets")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

const deleteMediaInput = z.object({ id: z.string().uuid() });

export const adminDeleteMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof deleteMediaInput>) => deleteMediaInput.parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdmin();
    await assertAdmin(context.supabase as any, context.userId);
    const { data: row, error: readErr } = await (context.supabase as any)
      .from("media_assets")
      .select("bucket,path")
      .eq("id", data.id)
      .single();
    if (readErr) throw new Error(readErr.message);
    // Use admin storage client for delete (RLS on storage.objects is admin-only).
    const { error: storErr } = await (supabaseAdmin as any).storage
      .from(assertApprovedBucket(row.bucket))
      .remove([row.path]);
    if (storErr) throw new Error(storErr.message);
    const { error: delErr } = await (context.supabase as any)
      .from("media_assets")
      .delete()
      .eq("id", data.id);
    if (delErr) throw new Error(delErr.message);
    return { ok: true as const };
  });