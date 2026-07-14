import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { initTracking, trackClick, trackPageView, trackSubmit } from "@/lib/tracking";

/**
 * Mounted once at the root. Wires up global click/submit/page-view
 * listeners. Tracking writes are user-scoped via RLS — anonymous events
 * are silently dropped client-side.
 */
export function ActivityTracker() {
  const router = useRouter();

  useEffect(() => {
    const stop = initTracking();

    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      try {
        trackClick(target);
      } catch {
        /* never break user interaction */
      }
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      try {
        trackSubmit(form);
      } catch {
        /* swallow */
      }
    };

    document.addEventListener("click", onClick, { capture: true });
    document.addEventListener("submit", onSubmit, { capture: true });

    // Initial page view + router subscription.
    trackPageView(window.location.pathname, window.location.href);
    const unsub = router.subscribe("onResolved", ({ toLocation }) => {
      trackPageView(toLocation.pathname, toLocation.href);
    });

    return () => {
      stop();
      document.removeEventListener("click", onClick, { capture: true } as EventListenerOptions);
      document.removeEventListener("submit", onSubmit, { capture: true } as EventListenerOptions);
      unsub();
    };
  }, [router]);

  return null;
}
