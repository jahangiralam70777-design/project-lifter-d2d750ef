// Realtime hook for the Study Routine module enable/disable flag.
// Reads from the public.study_routine_settings singleton and listens for
// changes so the sidebar hides / the route becomes inaccessible instantly.
//
// Lifecycle notes:
// - The channel name MUST be unique per mount. Reusing a static name means
//   that under React StrictMode (or any remount) `supabase.channel(name)`
//   returns the already-subscribed channel object, and calling `.on()` on it
//   throws: "cannot add postgres_changes callbacks for realtime:<name> after
//   subscribe()".
// - All `.on()` listeners are registered BEFORE `.subscribe()`.
// - Realtime failures must never crash the page — we swallow errors and fall
//   back to the last-known / default `enabled = true` value.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useStudyRoutineVisibility(): { enabled: boolean; loading: boolean } {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("study_routine_settings")
          .select("enabled")
          .eq("id", true)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          // Table missing / RLS denied: keep default enabled=true so the
          // module remains visible instead of crashing the page.
          // eslint-disable-next-line no-console
          console.warn("[study-routine-visibility] initial read failed", error);
        } else {
          setEnabled(data?.enabled ?? true);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[study-routine-visibility] initial read threw", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Unique per-mount channel name — prevents "add callbacks after subscribe()"
    // when StrictMode double-invokes the effect or the component remounts.
    const channelName = `study_routine_settings_watch:${Math.random()
      .toString(36)
      .slice(2, 10)}:${Date.now()}`;

    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      const ch = supabase.channel(channelName);
      // Register listeners BEFORE subscribe().
      ch.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "study_routine_settings" },
        (payload: { new?: { enabled?: boolean } }) => {
          const next = payload?.new?.enabled;
          if (typeof next === "boolean" && mountedRef.current) setEnabled(next);
        },
      );
      ch.subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // eslint-disable-next-line no-console
          console.warn("[study-routine-visibility] realtime status", status);
        }
      });
      channel = ch;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[study-routine-visibility] realtime subscribe failed", err);
    }

    return () => {
      cancelled = true;
      mountedRef.current = false;
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  return { enabled, loading };
}
