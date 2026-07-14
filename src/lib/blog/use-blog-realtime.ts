import { useEffect } from "react";
import { useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { startAction } from "./action-log";

// Debounced invalidator keyed by serialized queryKey — coalesces bursts of
// realtime events into a single refetch per key.
function makeDebouncedInvalidator(qc: QueryClient, delay = 200) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return (key: QueryKey) => {
    const k = JSON.stringify(key);
    const existing = timers.get(k);
    if (existing) clearTimeout(existing);
    timers.set(
      k,
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: key, refetchType: "active" });
        timers.delete(k);
      }, delay)
    );
  };
}

type Table =
  | "blog_posts"
  | "blog_categories"
  | "blog_tags"
  | "blog_post_tags"
  | "blog_post_views";

const INVALIDATIONS: Record<Table, QueryKey[]> = {
  blog_posts: [
    ["admin-blog-posts"],
    ["admin-blog-overview"],
    ["admin-blog-analytics"],
    ["admin-blog-media"],
    ["admin-blog-seo-audit"],
    ["admin-blog-authors"],
  ],
  blog_categories: [["admin-blog-categories"], ["blog-categories"], ["admin-blog-overview"]],
  blog_tags: [["admin-blog-tags"], ["admin-blog-overview"]],
  blog_post_tags: [["admin-blog-posts"], ["admin-blog-tags"]],
  blog_post_views: [["admin-blog-analytics"], ["admin-blog-overview"]],
};

/**
 * Mounts Supabase Realtime + cross-tab BroadcastChannel listeners that keep
 * the Blog Manager's TanStack Query cache in sync with backend changes.
 *
 * Call once at the top of `<BlogManagerFlow />`.
 */
export function useBlogRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const invalidate = makeDebouncedInvalidator(qc);
    const fanout = (table: Table, event: string) => {
      INVALIDATIONS[table].forEach(invalidate);
      startAction({ fn: `realtime:${table}.${event}`, file: "use-blog-realtime" }).done();
    };

    // ----- Supabase Realtime channels -----
    const tables: Table[] = [
      "blog_posts",
      "blog_categories",
      "blog_tags",
      "blog_post_tags",
      "blog_post_views",
    ];

    const channels = tables.map((table) => {
      const ch = supabase
        .channel(`blog-rt-${table}`)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on(
          "postgres_changes" as never,
          { event: "*", schema: "public", table },
          (payload: { eventType: string }) => fanout(table, payload.eventType ?? "*")
        )
        .subscribe();
      return ch;
    });

    // ----- Cross-tab BroadcastChannel -----
    let bc: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      bc = new BroadcastChannel("blog-mutations");
      bc.onmessage = (e: MessageEvent<{ table?: Table; event?: string }>) => {
        const t = e.data?.table;
        if (t && t in INVALIDATIONS) fanout(t, e.data?.event ?? "broadcast");
      };
    }

    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
      bc?.close();
    };
  }, [qc]);
}

/** Broadcast a local mutation to other tabs of the same admin. */
export function broadcastBlogChange(table: Table, event: string) {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const bc = new BroadcastChannel("blog-mutations");
    bc.postMessage({ table, event });
    bc.close();
  } catch {
    /* ignore */
  }
}
