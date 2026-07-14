import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { reportError } from "@/lib/error-reporter";

export type NavSample = {
  from: string;
  to: string;
  /** ms from navigation start to router "onResolved" (route + loaders ready). */
  resolveMs: number;
  /** ms from navigation start to next paint frame after resolution. */
  paintMs: number;
};

declare global {
  interface Window {
    __navTimings?: NavSample[];
    __navTimingSummary?: () => {
      count: number;
      avgMs: number;
      worst: NavSample | null;
      over300: NavSample[];
    };
  }
}

export function useNavTiming(user?: { id?: string; role?: string | null }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.__navTimings) window.__navTimings = [];

    let startedAt = 0;
    let fromHref = window.location.pathname + window.location.search;
    let toHref = "";
    let watchdog: number | null = null;

    const clearWatchdog = () => {
      if (watchdog) window.clearTimeout(watchdog);
      watchdog = null;
    };

    const unsubStart = router.subscribe("onBeforeNavigate", (e: any) => {
      clearWatchdog();
      startedAt = performance.now();
      fromHref = e?.fromLocation?.href ?? fromHref;
      toHref = e?.toLocation?.href ?? "";
      if (toHref.startsWith("/admin")) {
        const navStart = startedAt;
        watchdog = window.setTimeout(() => {
          const elapsedMs = +(performance.now() - navStart).toFixed(1);
          reportError({
            source: "frontend",
            severity: "medium",
            message: "Admin route navigation stalled",
            route: fromHref,
            payload: {
              from: fromHref,
              to: toHref,
              actual: window.location.pathname + window.location.search,
              elapsedMs,
              userId: user?.id ?? null,
              role: user?.role ?? null,
              ts: new Date().toISOString(),
            },
          });
          console.warn("[admin-nav] route navigation stalled", {
            from: fromHref,
            to: toHref,
            actual: window.location.pathname + window.location.search,
            elapsedMs,
            role: user?.role ?? null,
            ts: new Date().toISOString(),
          });
        }, 5000);
      }
    });

    const unsubResolved = router.subscribe("onResolved", (e: any) => {
      clearWatchdog();
      if (!startedAt) return;
      const resolveMs = performance.now() - startedAt;
      const resolvedToHref = e?.toLocation?.href ?? window.location.pathname;
      const navStart = startedAt;
      startedAt = 0;
      requestAnimationFrame(() => {
        const paintMs = performance.now() - navStart;
        const sample: NavSample = {
          from: fromHref,
          to: resolvedToHref,
          resolveMs: +resolveMs.toFixed(1),
          paintMs: +paintMs.toFixed(1),
        };
        window.__navTimings!.push(sample);
        // eslint-disable-next-line no-console
        console.info(
          `[nav-timing] ${sample.from} → ${sample.to} | resolve=${sample.resolveMs}ms paint=${sample.paintMs}ms`,
        );
        fromHref = resolvedToHref;
      });
    });

    window.__navTimingSummary = () => {
      const samples = window.__navTimings ?? [];
      const count = samples.length;
      const avgMs = count
        ? +(samples.reduce((s, x) => s + x.paintMs, 0) / count).toFixed(1)
        : 0;
      const worst = count
        ? samples.reduce((a, b) => (a.paintMs > b.paintMs ? a : b))
        : null;
      const over300 = samples.filter((s) => s.paintMs > 300);
      return { count, avgMs, worst, over300 };
    };

    return () => {
      clearWatchdog();
      unsubStart();
      unsubResolved();
    };
  }, [router, user?.id, user?.role]);
}
