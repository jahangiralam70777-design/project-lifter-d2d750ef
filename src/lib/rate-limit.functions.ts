/**
 * Unauthenticated rate-limit gate for auth endpoints
 * (login / signup / password reset).
 *
 * The Supabase client SDK calls supabase.auth.* directly from the browser,
 * so we cannot intercept those calls in a server fn. Instead the login /
 * signup / reset UI calls `checkAuthRateLimit({ data: { action } })` BEFORE
 * invoking the SDK; if the gate throws, the UI surfaces a "too many
 * attempts" error and skips the SDK call entirely.
 *
 * Keyed by client IP (best available signal pre-auth).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestIP, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitKey,
  RateLimitError,
} from "@/integrations/security/rate-limit";

const input = z.object({
  action: z.enum(["login", "signup", "password_reset"]),
});

export const checkAuthRateLimit = createServerFn({ method: "POST" })
  .validator((i: z.infer<typeof input>) => input.parse(i))
  .handler(async ({ data }) => {
    // Resolve a best-effort identifier: real IP first, then forwarded
    // header, finally fall back to a static label so the gate still
    // engages globally rather than per-caller.
    // A-6: trust Cloudflare's verified client IP header first; only fall back
    // to other signals when not behind Cloudflare. `x-forwarded-for` is
    // user-supplied and easily spoofed by callers bypassing the edge.
    const ip =
      getRequestHeader("cf-connecting-ip") ??
      getRequestIP({ xForwardedFor: false }) ??
      "unknown";

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = rateLimitKey(`auth:${data.action}`, "ip", ip);

    try {
      await enforceRateLimit(supabaseAdmin, key, RATE_LIMITS.AUTH);
      return { ok: true as const };
    } catch (e) {
      if (e instanceof RateLimitError) {
        // Server fn errors surface as the .message string on the client.
        // Embed structured JSON so the UI can render retry guidance.
        throw new Error(JSON.stringify(e.toJSON()));
      }
      throw e;
    }
  });
