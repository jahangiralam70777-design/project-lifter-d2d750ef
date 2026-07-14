import { useEffect, useState } from "react";

/**
 * Returns `false` during SSR and the first client render, then `true` after
 * the component has committed on the client. Use this to gate any UI whose
 * output would otherwise differ between the server-rendered HTML and the
 * first client paint (e.g. reads from `localStorage`, zustand selectors
 * mutated by a pre-hydration `<script>`, or user-session-dependent labels).
 *
 * Render a stable, server-safe fallback when this returns `false` so the
 * SSR markup and the first client render match exactly — this prevents
 * React hydration mismatch errors (#418/#423) without changing behavior.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
