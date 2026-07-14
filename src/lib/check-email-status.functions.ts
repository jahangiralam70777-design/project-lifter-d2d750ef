import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

/**
 * Public, unauthenticated probe used by the signup form to decide whether an
 * "already registered" error should surface a ban message or the regular
 * "please sign in / reset password" message.
 *
 * Intentionally minimal — it returns only `{ banned }`. Existence info is
 * already exposed by Supabase's own signup error, so we don't widen surface.
 */
// In-memory IP rate limiter (per-worker isolate). 5 requests / 10 minutes.
// Defense-in-depth against enumeration; not a substitute for WAF rate limits.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, number[]>();

function getClientIp(): string {
  try {
    const ip = getRequestIP({ xForwardedFor: true });
    if (ip) return ip;
  } catch {
    // ignore
  }
  try {
    const xff = getRequestHeader("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
  } catch {
    // ignore
  }
  return "unknown";
}

function checkAndRecordIp(ip: string): boolean {
  const now = Date.now();
  const arr = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (arr.length >= RATE_LIMIT_MAX) {
    ipHits.set(ip, arr);
    return false;
  }
  arr.push(now);
  ipHits.set(ip, arr);
  // GC: cap map size
  if (ipHits.size > 5000) {
    const cutoff = now - RATE_LIMIT_WINDOW_MS;
    for (const [k, v] of ipHits) {
      const kept = v.filter((t) => t > cutoff);
      if (kept.length === 0) ipHits.delete(k);
      else ipHits.set(k, kept);
    }
  }
  return true;
}

export const checkEmailBanStatus = createServerFn({ method: "POST" })
  .validator((i: { email: string }) =>
    z.object({ email: z.string().trim().email().max(254) }).parse(i),
  )
  .handler(async ({ data }) => {
    // IP rate limit — fail closed with a generic response to prevent
    // brute-force enumeration of registered emails.
    const ip = getClientIp();
    if (!checkAndRecordIp(ip)) {
      return { banned: false } as const;
    }
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Hard scan cap to bound work per request — prevents DoS via the
      // unauthenticated endpoint. Early-exit on first match.
      const perPage = 1000;
      const maxPages = 5;
      const needle = data.email.toLowerCase();
      let matchId: string | null = null;
      for (let page = 1; page <= maxPages; page++) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: list } = await (supabaseAdmin.auth.admin as any).listUsers({
          page,
          perPage,
        });
        const users: Array<{ id: string; email?: string | null; banned_until?: string | null }> =
          list?.users ?? [];
        let found = false;
        for (const u of users) {
          if ((u.email ?? "").toLowerCase() === needle) {
            matchId = u.id;
            found = true;
            // Native auth ban check
            if (u.banned_until && new Date(u.banned_until).getTime() > Date.now()) {
              return { banned: true } as const;
            }
            break;
          }
        }
        if (found || matchId || users.length < perPage) break;
      }
      if (!matchId) return { banned: false } as const;
      // App-level ban check
      const { data: row } = await supabaseAdmin
        .from("user_bans")
        .select("id,ban_until,status")
        .eq("user_id", matchId)
        .eq("status", "active")
        .maybeSingle();
      if (!row) return { banned: false } as const;
      if (!row.ban_until) return { banned: true } as const;
      return { banned: new Date(row.ban_until).getTime() > Date.now() } as const;
    } catch {
      return { banned: false } as const;
    }
  });
