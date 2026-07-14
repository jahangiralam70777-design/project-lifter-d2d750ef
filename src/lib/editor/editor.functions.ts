// @ts-nocheck
// Phase-3 — Editor Engine server functions.
// Thin RPC layer over editor_pages / editor_snapshots / editor_actions_log /
// editor_published_pages. All access is admin-gated by RLS (is_editor_admin()).
//
// Isolated from Phase-1 site_settings/homepage_sections — the live target is
// editor_published_pages, which the public site can read independently.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PageState, Snapshot, AuditEntry } from "@/lib/editor/types";
import type { Json } from "@/integrations/supabase/types";

const PAGE_ID = (v: unknown): string => {
  if (typeof v !== "string" || !v.trim()) throw new Error("invalid page_id");
  if (v.length > 128) throw new Error("page_id too long");
  return v;
};

const STATE = (v: unknown): PageState => {
  if (!v || typeof v !== "object") throw new Error("invalid state");
  const s = v as PageState;
  if (
    typeof s.pageId !== "string" ||
    typeof s.versionId !== "string" ||
    !Array.isArray(s.sections)
  ) {
    throw new Error("invalid state shape");
  }
  return s;
};

// ---------- Draft ----------

export const fetchDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pageId: string }) => ({ pageId: PAGE_ID(input.pageId) }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("editor_pages")
      .select("page_id, version_id, parent_version_id, draft_state, updated_at, updated_by")
      .eq("page_id", data.pageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { pageId: string; expectedVersion: string | null; state: PageState }) => ({
      pageId: PAGE_ID(input.pageId),
      expectedVersion: input.expectedVersion ?? null,
      state: STATE(input.state),
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Conflict check: only when the row already exists with a different version.
    const { data: existing } = await supabase
      .from("editor_pages")
      .select("version_id")
      .eq("page_id", data.pageId)
      .maybeSingle();
    if (existing && data.expectedVersion && existing.version_id !== data.expectedVersion) {
      return { conflict: true as const, serverVersion: existing.version_id };
    }
    const row = {
      page_id: data.pageId,
      version_id: data.state.versionId,
      parent_version_id: data.expectedVersion,
      draft_state: data.state as unknown as Json,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("editor_pages").upsert(row, { onConflict: "page_id" });
    if (error) throw new Error(error.message);
    await supabase.from("editor_actions_log").insert({
      page_id: data.pageId,
      version_id: data.state.versionId,
      author_id: userId,
      action_type: "save_draft",
      payload: { updatedAt: data.state.meta.updatedAt },
    });
    return { conflict: false as const, serverVersion: data.state.versionId };
  });

// ---------- Snapshots ----------

export const listSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pageId: string; limit?: number }) => ({
    pageId: PAGE_ID(input.pageId),
    limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("editor_snapshots")
      .select("version_id, page_id, parent_version_id, snapshot, summary, author_id, created_at")
      .eq("page_id", data.pageId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as any[];
  });

export const createSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      pageId: string;
      state: PageState;
      summary?: string;
      parentVersionId?: string | null;
    }) => ({
      pageId: PAGE_ID(input.pageId),
      state: STATE(input.state),
      summary: input.summary?.slice(0, 500) ?? null,
      parentVersionId: input.parentVersionId ?? null,
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("editor_snapshots").insert({
      version_id: data.state.versionId,
      page_id: data.pageId,
      parent_version_id: data.parentVersionId,
      snapshot: data.state as unknown as Json,
      summary: data.summary,
      author_id: userId,
    });
    if (error) throw new Error(error.message);
    await supabase.from("editor_actions_log").insert({
      page_id: data.pageId,
      version_id: data.state.versionId,
      author_id: userId,
      action_type: "create_snapshot",
      payload: { summary: data.summary },
    });
    return { versionId: data.state.versionId };
  });

// ---------- Publish (atomic via RPC) ----------

export const publishPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      pageId: string;
      expectedVersion: string | null;
      state: PageState;
      summary?: string;
    }) => ({
      pageId: PAGE_ID(input.pageId),
      expectedVersion: input.expectedVersion ?? null,
      state: STATE(input.state),
      summary: input.summary?.slice(0, 500) ?? null,
    }),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const newVersion = globalThis.crypto?.randomUUID?.() ?? data.state.versionId;
    const { data: published, error } = await supabase.rpc("editor_publish_page", {
      _page_id: data.pageId,
      _expected_version: data.expectedVersion ?? "",
      _new_version: newVersion,
      _state: data.state as unknown as Json,
      _summary: data.summary ?? undefined,
    });
    if (error) {
      if (error.message?.includes("version_conflict")) {
        return { conflict: true as const, message: error.message };
      }
      throw new Error(error.message);
    }
    return { conflict: false as const, published };
  });

export const fetchPublished = createServerFn({ method: "POST" })
  .validator((input: { pageId: string }) => ({ pageId: PAGE_ID(input.pageId) }))
  .handler(async ({ data }) => {
    // Public read — uses the anon-readable RLS policy on editor_published_pages.
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: row, error } = await supabase
      .from("editor_published_pages")
      .select("page_id, version_id, published_state, published_at")
      .eq("page_id", data.pageId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? null;
  });

// ---------- Audit ----------

export const listAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { pageId: string; limit?: number }) => ({
    pageId: PAGE_ID(input.pageId),
    limit: Math.min(Math.max(input.limit ?? 100, 1), 500),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("editor_actions_log")
      .select("id, page_id, version_id, author_id, action_type, payload, created_at")
      .eq("page_id", data.pageId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as any[];
  });

// Re-export types so consumers have a single import surface.
export type { PageState, Snapshot, AuditEntry };