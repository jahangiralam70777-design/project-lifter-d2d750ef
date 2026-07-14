/* Client-side global error reporter.
 *
 * - Captures window.onerror, unhandledrejection, and explicit reports.
 * - Dedupes identical fingerprints in-memory (5s window) and batches inserts.
 * - Never blocks UI: all flushes are queued via setTimeout / requestIdleCallback.
 * - Falls back to console if the backend is unreachable.
 */
import { supabase } from "@/integrations/supabase/client";

export type ErrorSource = "frontend" | "backend" | "db" | "network" | "unknown";
export type ErrorSeverity = "critical" | "high" | "medium" | "low";

export interface ErrorReport {
  source: ErrorSource;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  route?: string;
  userAgent?: string;
  payload?: Record<string, unknown>;
  fingerprint?: string;
}

type Queued = ErrorReport & { fingerprint: string };

const queue: Queued[] = [];
const recent = new Map<string, number>();
const DEDUPE_WINDOW_MS = 5_000;
const FLUSH_MS = 1_500;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let installed = false;

function fp(r: ErrorReport): string {
  if (r.fingerprint) return r.fingerprint;
  const base = `${r.source}|${r.message?.slice(0, 200) ?? ""}|${r.route ?? ""}`;
  // tiny djb2
  let h = 5381;
  for (let i = 0; i < base.length; i++) h = ((h << 5) + h + base.charCodeAt(i)) | 0;
  return `fp_${(h >>> 0).toString(36)}`;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_MS);
}

async function flush() {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  // Use the controlled RPC entry point — works for anon + authenticated.
  for (const r of batch) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc("admin_log_system_error", {
        _source: r.source,
        _severity: r.severity,
        _message: r.message,
        _stack: r.stack ?? null,
        _route: r.route ?? null,
        _user_agent: r.userAgent ?? null,
        _payload: r.payload ?? null,
        _fingerprint: r.fingerprint,
      });
    } catch (err) {
      // Never throw from the reporter.

      console.debug("[error-reporter] flush failed", err);
    }
  }
}

export function reportError(input: ErrorReport): void {
  try {
    const finger = fp(input);
    const now = Date.now();
    const last = recent.get(finger) ?? 0;
    if (now - last < DEDUPE_WINDOW_MS) return;
    recent.set(finger, now);
    // GC: keep map bounded
    if (recent.size > 200) {
      const cutoff = now - DEDUPE_WINDOW_MS;
      for (const [k, t] of recent) if (t < cutoff) recent.delete(k);
    }
    queue.push({
      ...input,
      fingerprint: finger,
      route: input.route ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      userAgent:
        input.userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : undefined),
      message: String(input.message ?? "Unknown error").slice(0, 2000),
      stack: input.stack ? String(input.stack).slice(0, 8000) : undefined,
    });
    scheduleFlush();
  } catch {
    /* never throw from the reporter */
  }
}

/** Install window-level global listeners. Safe to call multiple times. */
export function installGlobalErrorReporter(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    reportError({
      source: "frontend",
      severity: "high",
      message: event.message || event.error?.message || "window.onerror",
      stack: event.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : "Unhandled promise rejection";
    reportError({
      source: "frontend",
      severity: "high",
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}
