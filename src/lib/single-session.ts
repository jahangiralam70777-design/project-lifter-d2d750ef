/**
 * Single-session enforcement: one account = one active device.
 *
 * On a fresh sign-in we generate a UUID, save it in localStorage, and write it
 * to `user_sessions.active_session_id` via the SECURITY DEFINER RPC. Any other
 * device that was previously signed in for the same user will see the row
 * change (via Postgres Realtime) and immediately sign itself out.
 *
 * Page refreshes do NOT generate a new session id — they re-use the one in
 * localStorage and just validate it against the DB.
 */
import { supabase } from "@/integrations/supabase/client";

const STORAGE_PREFIX = "edumaster.session_id:";

function keyFor(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

export function getLocalSessionId(userId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(keyFor(userId));
  } catch {
    return null;
  }
}

export function clearLocalSessionId(userId?: string) {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      window.localStorage.removeItem(keyFor(userId));
      return;
    }
    // Clear all session ids on hard logout
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith(STORAGE_PREFIX)) window.localStorage.removeItem(k);
    }
  } catch {
    /* noop */
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Claim a brand-new session for the user. Call this on every successful
 * sign-in (NOT on page refresh). Returns the new session id.
 */
export async function claimNewSession(userId: string): Promise<string> {
  const sid = randomId();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("claim_user_session", {
    _session_id: sid,
    _user_agent: ua,
  });
  if (error) {
    console.warn("[single-session] claim failed", error.message);
    throw error;
  }
  try {
    window.localStorage.setItem(keyFor(userId), sid);
  } catch {
    /* noop */
  }
  return sid;
}

/**
 * Compare the locally stored session id against the database. Returns:
 *  - "valid"   — match
 *  - "kicked"  — DB has a different id (another device took over)
 *  - "missing" — no DB row (treat as kicked; user should re-login on this device)
 *  - "unknown" — we couldn't reach the DB (don't kick yet)
 */
export async function validateSessionOnce(
  userId: string,
): Promise<"valid" | "kicked" | "missing" | "unknown"> {
  const local = getLocalSessionId(userId);
  if (!local) return "missing";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from("user_sessions")
    .select("active_session_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[single-session] validate error", error.message);
    return "unknown";
  }
  if (!data) return "missing";
  return (data as { active_session_id: string }).active_session_id === local ? "valid" : "kicked";
}

type GuardHandle = { stop: () => void };

/**
 * Install a live guard that:
 *  1. Subscribes to Realtime changes on the user's session row.
 *  2. Polls every 30s as a fallback (covers offline/online transitions).
 *  3. Re-validates when the tab regains focus or the network comes back.
 *
 * Calls `onKicked()` exactly once when the session is taken over.
 */
export function installSingleSessionGuard(
  userId: string,
  onKicked: (reason: "kicked" | "missing") => void,
): GuardHandle {
  let kicked = false;
  const kick = (reason: "kicked" | "missing") => {
    if (kicked) return;
    kicked = true;
    onKicked(reason);
  };

  const channel = supabase
    .channel(`user-session-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_sessions", filter: `user_id=eq.${userId}` },
      (payload) => {
        const local = getLocalSessionId(userId);
        if (!local) return;
        if (payload.eventType === "DELETE") {
          kick("missing");
          return;
        }
        const next = (payload.new as { active_session_id?: string } | null)?.active_session_id;
        if (next && next !== local) kick("kicked");
      },
    )
    .subscribe();

  const check = async () => {
    const result = await validateSessionOnce(userId);
    if (result === "kicked") kick("kicked");
    else if (result === "missing") kick("missing");
  };

  const interval = window.setInterval(check, 30_000);
  const onFocus = () => void check();
  const onOnline = () => void check();
  window.addEventListener("focus", onFocus);
  window.addEventListener("online", onOnline);

  // Delay the first validation so it can't race the freshly-claimed session
  // id (the DB write needs a moment to be visible to subsequent reads,
  // and Realtime will surface any real takeover within seconds anyway).
  const initialTimer = window.setTimeout(() => void check(), 5_000);

  return {
    stop: () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);

      void supabase.removeChannel(channel);
    },
  };
}
