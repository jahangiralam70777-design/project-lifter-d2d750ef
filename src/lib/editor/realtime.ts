// Phase-3 — Realtime sync for multi-admin editing.
// Subscribes to editor_pages, editor_snapshots, and editor_published_pages
// for a given pageId and invokes callbacks for each event.

import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface EditorRealtimeHandlers {
  onDraftChange?: (row: {
    version_id: string;
    updated_by: string | null;
    updated_at: string;
  }) => void;
  onSnapshotInsert?: (row: {
    version_id: string;
    summary: string | null;
    author_id: string | null;
    created_at: string;
  }) => void;
  onPublished?: (row: {
    version_id: string;
    published_at: string;
    published_by: string | null;
  }) => void;
}

export function subscribeEditorPage(pageId: string, handlers: EditorRealtimeHandlers): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`editor:${pageId}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "editor_pages", filter: `page_id=eq.${pageId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as {
          version_id: string;
          updated_by: string | null;
          updated_at: string;
        };
        if (row) handlers.onDraftChange?.(row);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "editor_snapshots",
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => {
        const row = payload.new as {
          version_id: string;
          summary: string | null;
          author_id: string | null;
          created_at: string;
        };
        if (row) handlers.onSnapshotInsert?.(row);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "editor_published_pages",
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => {
        const row = (payload.new ?? payload.old) as {
          version_id: string;
          published_at: string;
          published_by: string | null;
        };
        if (row) handlers.onPublished?.(row);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
