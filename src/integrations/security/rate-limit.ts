/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Postgres-backed sliding-window rate limiter.
 *
 * Calls the `public.check_rate_limit(key, max, window_seconds)` RPC
 * (SECURITY DEFINER) defined in db_audit/SECURITY_PHASE3_HARDENING.sql.
 * Returns TRUE when the caller is under the limit (and a hit was
 * recorded); FALSE when the limit has been reached.
 *
 * Use {@link enforceRateLimit} from inside a server-fn `.handler()` to
 * throw a structured 429-like error when the limit is exceeded.
 *
 * Keys MUST be scoped — combine the protected action with the caller's
 * identity (user id when authenticated, otherwise the request IP). Example:
 *   `auth:login:ip:203.0.113.5`
 *   `mcq:submit:user:7d3...`
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type RateLimitConfig = {
  max: number;
  windowSeconds: number;
  /**
   * What to do when the limiter RPC itself errors. Defaults to "closed":
   * a broken limiter must not let abuse through silently. Set to "open"
   * for low-risk read endpoints where a brief limiter outage shouldn't
   * lock users out (e.g. blog view counters).
   */
  onError?: "open" | "closed";
};

// Suggested defaults — single source of truth referenced by callers.
// `onError` defaults to "closed" (safe) and is set to "open" only for
// counters where a limiter outage shouldn't break the user experience.
export const RATE_LIMITS = {
  AUTH:        { max: 5,  windowSeconds: 60, onError: "closed" }, //   5 / min
  BLOG_VIEW:   { max: 30, windowSeconds: 60, onError: "open"   }, //  30 / min
  MCQ_SUBMIT:  { max: 60, windowSeconds: 60, onError: "closed" }, //  60 / min
  QUIZ_SUBMIT: { max: 60, windowSeconds: 60, onError: "closed" }, //  60 / min
  MOCK_SUBMIT: { max: 30, windowSeconds: 60, onError: "closed" }, //  30 / min
  BULK_UPLOAD: { max: 5,  windowSeconds: 60, onError: "closed" }, //   5 / min
  ADMIN_WRITE: { max: 30, windowSeconds: 60, onError: "closed" }, //  30 / min
} as const satisfies Record<string, RateLimitConfig>;

export class RateLimitError extends Error {
  readonly status = 429 as const;
  readonly code = "RATE_LIMITED" as const;
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, key: string) {
    super(`Rate limit exceeded for "${key}". Retry in ${retryAfterSeconds}s.`);
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
  /** Structured payload safe to return to clients. */
  toJSON() {
    return {
      error: "rate_limited",
      message: "Too many requests. Please slow down.",
      retry_after_seconds: this.retryAfterSeconds,
      status: this.status,
    };
  }
}

// One-shot warning per missing-RPC outage — avoids spamming logs when the
// migration has not been applied yet on a particular environment.
let warnedMissingRpc = false;

function isMissingRpcError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("could not find the function") ||
    m.includes("function public.check_rate_limit") ||
    m.includes("does not exist") ||
    m.includes("pgrst202")
  );
}

function isProd(): boolean {
  // `process.env.NODE_ENV` is the only reliable signal inside server fns;
  // `import.meta.env.PROD` is reliable in the browser bundle.
  try {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") return true;
  } catch { /* ignore */ }
  try {
    if ((import.meta as { env?: { PROD?: boolean } }).env?.PROD) return true;
  } catch { /* ignore */ }
  return false;
}

/**
 * Check the rate limit and throw {@link RateLimitError} if exceeded.
 *
 * Pass either the authenticated `supabase` from `requireSupabaseAuth`
 * context, or the admin client for anon flows.
 *
 * Failover behavior on RPC error:
 *   - cfg.onError === "open"   → log + allow the request (e.g. view counters)
 *   - cfg.onError === "closed" → log + throw RateLimitError in production,
 *     allow in development so missing migrations don't block local work
 *   - The "function does not exist" case is downgraded to a single warning
 *     so an un-applied migration doesn't flood logs.
 */
export async function enforceRateLimit(
  supabase: SupabaseClient<any>,
  key: string,
  cfg: RateLimitConfig,
): Promise<void> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    _key: key,
    _max_hits: cfg.max,
    _window_seconds: cfg.windowSeconds,
  });

  if (error) {
    const missing = isMissingRpcError(error.message ?? "");
    const policy = cfg.onError ?? "closed";
    const ctx = {
      key,
      message: error.message,
      code: (error as { code?: string }).code,
      missing_rpc: missing,
      policy,
      env: isProd() ? "production" : "development",
      ts: new Date().toISOString(),
    };

    if (missing) {
      if (!warnedMissingRpc) {
        warnedMissingRpc = true;
        console.error(
          "[rate-limit] check_rate_limit RPC is missing — apply " +
            "supabase/manual_apply/20260625_check_rate_limit_rpc.sql to enable limits.",
          ctx,
        );
      }
    } else {
      console.error("[rate-limit] check_rate_limit RPC error", ctx);
    }

    // Fail closed in production for protected actions; fail open in dev or
    // when the caller opts in (read-only counters).
    if (policy === "closed" && isProd() && !missing) {
      throw new RateLimitError(cfg.windowSeconds, key);
    }
    return;
  }

  if (data === false) {
    throw new RateLimitError(cfg.windowSeconds, key);
  }
}

/** Build a stable rate-limit key. */
export function rateLimitKey(action: string, scope: string, id: string): string {
  return `${action}:${scope}:${id}`;
}
