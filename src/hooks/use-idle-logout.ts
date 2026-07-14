import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

type IdleRole = "admin" | "student";

const ACTIVITY_EVENTS = [
  "mousemove",
  "keydown",
  "click",
  "scroll",
  "touchstart",
] as const;

/**
 * Frontend-only idle auto-logout.
 *
 * - student → 60 minutes of inactivity
 * - admin   → 30 minutes of inactivity
 *
 * Resets on mousemove / keydown / click / scroll / touchstart.
 * On timeout: supabase.auth.signOut() → clear local state → navigate("/login").
 * Supports dynamic role changes; cleans up listeners on unmount.
 */
export function useIdleLogout(role: IdleRole) {
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loggingOutRef = useRef(false);

  useEffect(() => {
    const timeout = role === "admin" ? 30 * 60 * 1000 : 60 * 60 * 1000;

    const logout = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      try {
        await supabase.auth.signOut();
      } catch {
        // ignore — proceed with redirect regardless
      }
      try {
        // Clear any persisted client session state.
        if (typeof window !== "undefined") {
          for (const key of Object.keys(window.localStorage)) {
            if (key.startsWith("sb-") || key.startsWith("supabase.")) {
              window.localStorage.removeItem(key);
            }
          }
          window.sessionStorage.clear();
        }
      } catch {
        // storage may be unavailable (SSR/private mode) — ignore
      }
      navigate({ to: "/login" });
    };

    const reset = () => {
      if (loggingOutRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void logout();
      }, timeout);
    };

    // Start the timer on mount.
    reset();

    const handler = () => reset();
    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, handler, { passive: true });
    }

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, handler);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      loggingOutRef.current = false;
    };
  }, [role, navigate]);
}

export default useIdleLogout;
