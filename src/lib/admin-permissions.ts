/* eslint-disable @typescript-eslint/no-explicit-any */
// Server-only RBAC enforcement helper. Single source of truth for "can the
// current user perform <permission>?" — backed by public.has_permission().
// Every check is recorded in public.admin_action_log via a SECURITY DEFINER
// RPC (record_admin_action) so audit entries cannot be forged client-side.
//
// SECURITY: This helper also applies a per-user admin rate limit so a
// compromised admin account or buggy UI cannot hammer privileged endpoints.
// Rate-limit buckets are split so ordinary usage never trips the limiter:
//   • Reads (list / counts / filters / ranking / detail / export / search /
//     get) → generous ADMIN_READ bucket, keyed per action prefix. Realtime
//     invalidations refetching lists never consume the write bucket.
//   • Writes → ADMIN_WRITE bucket keyed per action prefix (e.g. approve vs
//     reject vs remove get their OWN buckets), so a burst of approvals
//     cannot starve reject / remove / bulk actions and vice versa.
// Callers do not need to change — the read vs write classification is
// derived from the `action` string.
import type { RateLimitConfig } from "@/integrations/security/rate-limit";
import {
  enforceRateLimit,
  RATE_LIMITS,
  rateLimitKey,
} from "@/integrations/security/rate-limit";

// Read-shaped action suffixes. Anything else is treated as a write.
const READ_ACTION_FRAGMENTS = new Set([
  "list",
  "count",
  "counts",
  "ranking",
  "filter",
  "filters",
  "detail",
  "details",
  "search",
  "export",
  "download",
  "read",
  "view",
  "get",
  "fetch",
  "load",
  "summary",
  "stats",
  "preview",
  "check",
]);

// Higher budget for reads — realtime invalidations refetch list/counts on
// every write, so this must comfortably outpace ADMIN_WRITE bursts.
const ADMIN_READ: RateLimitConfig = {
  max: 300,
  windowSeconds: 60,
  onError: "closed",
};

function classifyAction(action: string | undefined): {
  kind: "read" | "write";
  bucket: string;
} {
  const a = (action ?? "").trim();
  if (!a) return { kind: "write", bucket: "default" };
  const last = a.split(".").pop()?.toLowerCase() ?? "";
  const isRead = READ_ACTION_FRAGMENTS.has(last);
  return { kind: isRead ? "read" : "write", bucket: a };
}

export async function assertPermission(
  supabase: any,
  userId: string,
  permission: string,
  action?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { data, error } = await supabase.rpc("has_permission", {
    _user_id: userId,
    _permission: permission,
  });

  const allowed = !error && data === true;

  // Best-effort audit log — never block the user-facing operation on a logging
  // failure, but surface the failure in server logs so silent breakage is
  // detectable (L-3).
  try {
    const { error: auditErr } = await supabase.rpc("record_admin_action", {
      _permission: permission,
      _action: action ?? null,
      _allowed: allowed,
      _metadata: metadata ?? null,
    });
    if (auditErr) {
      console.error("[audit-log-fail]", { permission, action, message: auditErr.message });
    }
  } catch (auditErr) {
    console.error("[audit-log-fail]", { permission, action, error: auditErr });
  }

  // FAIL CLOSED: any error from has_permission denies the operation. Never
  // silently downgrade to "allowed" on RPC failure.
  if (error) {
    console.error("[authz-rpc-fail]", { userId, permission, action, code: error.code, message: error.message });
    if (error.code === "PGRST301" || error.code === "PGRST302" || error.code === "PGRST303") {
      throw new Error("Your session has expired. Please sign in again to continue.");
    }
    throw new Error(`Permission check failed: ${error.message}`);
  }
  if (!allowed) {
    try {
      const { data: diag } = await supabase.rpc("debug_permission_check", {
        _user_id: userId,
        _permission: permission,
      });
      console.warn("[authz-denied]", {
        userId,
        permission,
        action,
        diagnostic: Array.isArray(diag) ? diag[0] : diag,
      });
    } catch {
      console.warn("[authz-denied]", { userId, permission, action });
    }
    throw new Error(`Forbidden: missing permission "${permission}"`);
  }

  // Rate-limit AFTER the permission check so an unauthorized caller sees a
  // 403 rather than a 429 (which would leak the endpoint's existence).
  //
  // Key is scoped per action bucket, so bursty admin work on one action
  // (e.g. approving 20 enrollments) never starves the shared budget for
  // other actions (reject, remove, subject.add, session.update, …), and
  // list/counts reads live in their own generous ADMIN_READ bucket so
  // realtime-driven refetches don't consume the write budget.
  const { kind, bucket } = classifyAction(action);
  const cfg = kind === "read" ? ADMIN_READ : RATE_LIMITS.ADMIN_WRITE;
  await enforceRateLimit(
    supabase,
    rateLimitKey(`admin:${permission}:${bucket}`, "user", userId),
    cfg,
  );
}
