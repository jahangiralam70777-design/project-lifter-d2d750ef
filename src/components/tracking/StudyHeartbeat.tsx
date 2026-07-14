import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { pingStudySession } from "@/lib/study-tracker.functions";

/**
 * Heartbeats a study session every 60s while the tab is visible.
 * Mounted once inside the authenticated student layout.
 */
export function StudyHeartbeat() {
  const ping = useServerFn(pingStudySession);
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const lastBeat = useRef<number>(0);

  useEffect(() => {
    let cancelled = false;
    const moduleKey = (pathname || "/").replace(/^\/+/, "").split("/")[0] || "dashboard";

    const tick = async (delta: number) => {
      if (cancelled) return;
      if (document.visibilityState !== "visible") return;
      try {
        await ping({
          data: { module: moduleKey, delta_seconds: Math.min(120, Math.max(0, delta)) },
        });
      } catch {
        /* silently swallow — analytics is best-effort */
      }
    };

    // initial beat after 20s on the page
    const seed = window.setTimeout(() => {
      lastBeat.current = Date.now();
      void tick(20);
    }, 20_000);
    const interval = window.setInterval(() => {
      const now = Date.now();
      const delta = lastBeat.current ? Math.round((now - lastBeat.current) / 1000) : 60;
      lastBeat.current = now;
      void tick(delta);
    }, 60_000);

    const onVis = () => {
      if (document.visibilityState === "visible") lastBeat.current = Date.now();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      window.clearTimeout(seed);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pathname, ping]);

  return null;
}
