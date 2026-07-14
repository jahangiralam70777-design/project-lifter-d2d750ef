import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * Phase 3: Admin real-time monitoring service.
 *
 * Thin wrapper around Supabase Realtime that gives the admin UI typed callbacks
 * for login and activity inserts, plus shared helpers for device parsing and
 * "active now" computation. All callers MUST invoke the returned unsubscribe
 * function on unmount to avoid leaks / duplicate listeners.
 */

export type LoginEvent = {
  id: string;
  user_id: string;
  login_at: string;
  user_agent: string | null;
  device: string | null;
  browser: string | null;
  ip: string | null;
};

export type ActivityEvent = {
  id: string;
  user_id: string | null;
  event_type: string;
  page_path: string | null;
  element_label: string | null;
  module: string | null;
  created_at: string;
};

export type DeviceType = "Mobile" | "Tablet" | "Desktop";

export function deriveDeviceType(ua: string | null | undefined): DeviceType {
  const s = ua ?? "";
  if (/iPad|Tablet/i.test(s)) return "Tablet";
  if (/Mobile|Android|iPhone/i.test(s)) return "Mobile";
  return "Desktop";
}

function makeChannel<TRow extends Record<string, unknown>>(
  name: string,
  table: "user_login_events" | "activity_events",
  onInsert: (row: TRow) => void,
): () => void {
  const channel: RealtimeChannel = supabase.channel(`admin-rt-${name}-${Date.now()}`);
  channel.on(
    "postgres_changes" as never,
    { event: "INSERT", schema: "public", table },
    (payload: { new: TRow }) => {
      try {
        onInsert(payload.new);
      } catch {
        /* swallow listener errors */
      }
    },
  );
  channel.subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* noop */
    }
  };
}

export function subscribeToLogins(onInsert: (row: LoginEvent) => void): () => void {
  return makeChannel<LoginEvent>("logins", "user_login_events", onInsert);
}

export function subscribeToActivity(onInsert: (row: ActivityEvent) => void): () => void {
  return makeChannel<ActivityEvent>("activity", "activity_events", onInsert);
}

/**
 * "Active now" = unique users seen across logins + activity within the window.
 * Pure helper so it can be unit-tested and reused outside React.
 */
export function computeActiveNow(
  logins: Array<{ user_id: string; login_at: string }>,
  activity: Array<{ user_id: string | null; created_at: string }>,
  windowMs: number = 5 * 60 * 1000,
  nowMs: number = Date.now(),
): number {
  const cutoff = nowMs - windowMs;
  const set = new Set<string>();
  for (const l of logins) {
    if (new Date(l.login_at).getTime() >= cutoff) set.add(l.user_id);
  }
  for (const a of activity) {
    if (!a.user_id) continue;
    if (new Date(a.created_at).getTime() >= cutoff) set.add(a.user_id);
  }
  return set.size;
}

/** Initial backlog: last N logins (admins only via RLS). */
export async function fetchRecentLogins(limit = 25): Promise<LoginEvent[]> {
  const { data, error } = await supabase
    .from("user_login_events")
    .select("id,user_id,login_at,user_agent,device,browser,ip")
    .order("login_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as LoginEvent[];
}

/** Initial backlog: last N activity events. */
export async function fetchRecentActivity(limit = 40): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from("activity_events")
    .select("id,user_id,event_type,page_path,element_label,module,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityEvent[];
}

/** Resolve display names for a batch of user ids in one round-trip. */
export async function fetchDisplayNames(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id,display_name").in("id", unique);
  for (const p of (data ?? []) as Array<{ id: string; display_name: string | null }>) {
    map.set(p.id, p.display_name ?? "Unknown");
  }
  return map;
}
