// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { z } from "zod";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type SystemErrorRow = {
  id: string;
  source: "frontend" | "backend" | "db" | "network" | "unknown";
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  stack: string | null;
  route: string | null;
  user_id: string | null;
  user_agent: string | null;
  payload: JsonValue | null;
  fingerprint: string;
  occurrence_count: number;
  last_seen_at: string;
  resolved: boolean;
  resolved_at: string | null;
  created_at: string;
};

const listInput = z.object({
  page: z.number().int().min(0).max(2000).default(0),
  pageSize: z.number().int().min(1).max(100).default(50),
  source: z.enum(["frontend", "backend", "db", "network", "unknown"]).optional(),
  severity: z.enum(["critical", "high", "medium", "low"]).optional(),
  route: z.string().max(500).optional(),
  resolved: z.boolean().optional(),
  q: z.string().max(200).optional(),
});

// Errors that have NOT recurred within this window are treated as stale and
// auto-resolved before any health query is computed. This guarantees that
// previously-fixed problems disappear from the panel without manual cleanup,
// so System Health always reflects the CURRENT real state — never historical
// noise. Window is intentionally short (30 minutes); a real ongoing problem
// will keep updating `last_seen_at` via the error logger and stay open.
const STALE_RESOLVE_WINDOW_MS = 30 * 60 * 1000;

async function autoResolveStaleErrors(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_RESOLVE_WINDOW_MS).toISOString();
    await sb
      .from("system_error_logs")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("resolved", false)
      .lt("last_seen_at", cutoff);
  } catch {
    /* best-effort; never block the health read on cleanup */
  }
}

export const adminListSystemErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => listInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_system");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabaseAdmin;
    await autoResolveStaleErrors(sb);
    const from = data.page * data.pageSize;
    const to = from + data.pageSize - 1;
    let q = sb
      .from("system_error_logs")
      .select("*", { count: "exact" })
      .order("last_seen_at", { ascending: false });
    if (data.source) q = q.eq("source", data.source);
    if (data.severity) q = q.eq("severity", data.severity);
    if (data.route) q = q.eq("route", data.route);
    if (typeof data.resolved === "boolean") q = q.eq("resolved", data.resolved);
    if (data.q && data.q.trim()) q = q.ilike("message", `%${data.q.trim()}%`);
    const res = await q.range(from, to);
    if (res.error) throw new Error(res.error.message);
    return {
      rows: (res.data ?? []) as SystemErrorRow[],
      total: res.count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const adminSystemHealthSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_system");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabaseAdmin;
    // Auto-resolve any previously-recorded errors that have not recurred
    // recently — they reflect already-fixed issues and must not show as
    // active. This keeps the panel honest: only real, currently-occurring
    // problems remain "open".
    await autoResolveStaleErrors(sb);
    const [allOpen, crit24, top] = await Promise.all([
      sb
        .from("system_error_logs")
        .select("id", { count: "exact", head: true })
        .eq("resolved", false),
      sb
        .from("system_error_logs")
        .select("id", { count: "exact", head: true })
        .eq("severity", "critical")
        .gte("last_seen_at", since24),
      sb
        .from("system_error_logs")
        .select("route, occurrence_count")
        .eq("resolved", false)
        .order("occurrence_count", { ascending: false })
        .limit(50),
    ]);
    const firstError = allOpen.error ?? crit24.error ?? top.error;
    if (firstError) throw new Error(firstError.message);
    const byRoute = new Map<string, number>();
    for (const r of (top.data ?? []) as Array<{ route: string | null; occurrence_count: number }>) {
      const k = r.route ?? "(unknown)";
      byRoute.set(k, (byRoute.get(k) ?? 0) + Number(r.occurrence_count ?? 1));
    }
    const topRoutes = Array.from(byRoute.entries())
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    return {
      openErrors: allOpen.count ?? 0,
      critical24h: crit24.count ?? 0,
      status:
        (crit24.count ?? 0) > 5 ? "degraded" : (allOpen.count ?? 0) > 0 ? "warning" : "healthy",
      topRoutes,
    } as {
      openErrors: number;
      critical24h: number;
      status: "healthy" | "warning" | "degraded";
      topRoutes: { route: string; count: number }[];
    };
  });

export const adminResolveSystemError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) =>
    z.object({ id: z.string().uuid(), resolved: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_system",
      "system_health.resolve",
      { id: data.id, resolved: data.resolved },
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabaseAdmin as any)
      .from("system_error_logs")
      .update({
        resolved: data.resolved,
        resolved_at: data.resolved ? new Date().toISOString() : null,
      })
      .eq("id", data.id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (!updated?.id) throw new Error("System issue was not found or could not be updated");
    return { ok: true };
  });