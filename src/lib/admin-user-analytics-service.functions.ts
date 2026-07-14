// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";

const rangeEnum = z.enum(["24h", "7d", "30d", "lifetime"]);
const metricEnum = z.enum(["active", "usage", "devices", "heatmap"]);

const input = z
  .object({
    metric: metricEnum,
    range: rangeEnum.default("7d"),
  })
  .partial({ range: true });

function rangeWindow(range: z.infer<typeof rangeEnum>) {
  const now = Date.now();
  if (range === "24h")
    return { sinceMs: now - 24 * 3600_000, bucketMs: 3600_000, bucketLabel: "hour" as const };
  if (range === "7d")
    return { sinceMs: now - 7 * 86_400_000, bucketMs: 86_400_000, bucketLabel: "day" as const };
  if (range === "30d")
    return { sinceMs: now - 30 * 86_400_000, bucketMs: 86_400_000, bucketLabel: "day" as const };
  // lifetime — last 12 weeks bucketed by week
  return { sinceMs: now - 84 * 86_400_000, bucketMs: 7 * 86_400_000, bucketLabel: "week" as const };
}

function deviceOf(ua: string | null | undefined) {
  const s = ua ?? "";
  if (/iPad|Tablet/i.test(s)) return "Tablet";
  if (/Mobile|Android|iPhone/i.test(s)) return "Mobile";
  return "Desktop";
}

/**
 * Unified analytics drilldown for admin user metric cards.
 * Returns a shape keyed by metric so the UI renders chart + summary from a single call.
 */
export const adminUserAnalyticsMetric = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof input>) => input.parse(i ?? { metric: "active" }))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users");
    const sb = context.supabase;
    const range = data.range ?? "7d";
    const { sinceMs, bucketMs, bucketLabel } = rangeWindow(range);
    const sinceIso = new Date(sinceMs).toISOString();

    if (data.metric === "active" || data.metric === "usage") {
      const { data: rows, error } = await sb
        .from("user_login_events")
        .select("user_id,login_at,duration_seconds")
        .gte("login_at", sinceIso)
        .order("login_at", { ascending: true })
        .limit(50_000);
      if (error) throw error;

      const nowMs = Date.now();
      const buckets = Math.max(1, Math.ceil((nowMs - sinceMs) / bucketMs));
      const series: Array<{
        label: string;
        t: string;
        activeUsers: number;
        logins: number;
        usageSeconds: number;
      }> = [];
      const usersByBucket: Set<string>[] = Array.from({ length: buckets }, () => new Set());
      const loginsByBucket = new Array(buckets).fill(0);
      const usageByBucket = new Array(buckets).fill(0);

      for (const r of (rows ?? []) as Array<{
        user_id: string;
        login_at: string;
        duration_seconds: number | null;
      }>) {
        const t = new Date(r.login_at).getTime();
        const idx = Math.min(buckets - 1, Math.max(0, Math.floor((t - sinceMs) / bucketMs)));
        usersByBucket[idx].add(r.user_id);
        loginsByBucket[idx] += 1;
        usageByBucket[idx] += r.duration_seconds ?? 0;
      }

      for (let i = 0; i < buckets; i++) {
        const t = new Date(sinceMs + i * bucketMs);
        const label =
          bucketLabel === "hour"
            ? t.toLocaleTimeString(undefined, { hour: "2-digit" })
            : bucketLabel === "day"
              ? t.toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : `Wk ${t.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
        series.push({
          label,
          t: t.toISOString(),
          activeUsers: usersByBucket[i].size,
          logins: loginsByBucket[i],
          usageSeconds: usageByBucket[i],
        });
      }

      const uniqueUsers = new Set((rows ?? []).map((r) => r.user_id)).size;
      const totalLogins = (rows ?? []).length;
      const totalUsage = usageByBucket.reduce((a, b) => a + b, 0);
      return {
        metric: data.metric,
        range,
        series,
        summary: {
          uniqueUsers,
          totalLogins,
          totalUsageSeconds: totalUsage,
          avgUsagePerUser: uniqueUsers > 0 ? Math.round(totalUsage / uniqueUsers) : 0,
        },
      };
    }

    if (data.metric === "devices") {
      const { data: rows, error } = await sb
        .from("user_login_events")
        .select("user_id,user_agent,device,login_at")
        .gte("login_at", sinceIso)
        .limit(20_000);
      if (error) throw error;
      const counts = new Map<string, { count: number; users: Set<string> }>();
      for (const r of (rows ?? []) as Array<{
        user_id: string;
        user_agent: string | null;
        device: string | null;
      }>) {
        const label =
          r.device && /mobile|tablet|desktop/i.test(r.device)
            ? r.device[0].toUpperCase() + r.device.slice(1).toLowerCase()
            : deviceOf(r.user_agent);
        const cur = counts.get(label) ?? { count: 0, users: new Set<string>() };
        cur.count += 1;
        cur.users.add(r.user_id);
        counts.set(label, cur);
      }
      const total = (rows ?? []).length;
      const breakdown = [...counts.entries()]
        .map(([label, v]) => ({
          label,
          count: v.count,
          uniqueUsers: v.users.size,
          percent: total > 0 ? Math.round((v.count / total) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.count - a.count);
      return { metric: "devices" as const, range, breakdown, totalLogins: total };
    }

    // heatmap: days x 24 hours
    const days = range === "24h" ? 1 : range === "30d" ? 30 : range === "lifetime" ? 30 : 7;
    const startMs = Date.now() - days * 86_400_000;
    const { data: rows, error } = await sb
      .from("user_login_events")
      .select("login_at")
      .gte("login_at", new Date(startMs).toISOString())
      .limit(50_000);
    if (error) throw error;
    const cells: number[] = Array(days * 24).fill(0);
    for (const r of (rows ?? []) as Array<{ login_at: string }>) {
      const t = new Date(r.login_at);
      const day = Math.floor((t.getTime() - startMs) / 86_400_000);
      if (day < 0 || day >= days) continue;
      cells[day * 24 + t.getHours()] += 1;
    }
    const max = Math.max(1, ...cells);
    return {
      metric: "heatmap" as const,
      range,
      days,
      hours: 24,
      cells,
      max,
      total: (rows ?? []).length,
    };
  });