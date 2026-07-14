import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/integrations/supabase/client";
import { clearClientAuthStorage } from "@/lib/auth-client";
import { clearSessionTimers } from "@/lib/session-timeout";
import {
  clearLocalSessionId,
  getLocalSessionId,
  installSingleSessionGuard,
} from "@/lib/single-session";

/**
 * Live single-session enforcement. Mounted once in the root tree.
 *
 * When a different device signs in for the same account (or the row is
 * deleted), this component signs the current device out and surfaces a
 * friendly explanation.
 *
 * CRITICAL: When kicked, we MUST sign out with `scope: "local"`. The default
 * `supabase.auth.signOut()` uses `scope: "global"`, which revokes the user's
 * refresh token on the Auth server. That would immediately invalidate the
 * NEW device's session as well — producing the "both devices logged out"
 * regression. Local scope only clears this device's session.
 */
export function SingleSessionGuard() {
  const user = useAppStore((s) => s.user);
  const navigate = useNavigate();
  const kickedRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    // If there's no local session id yet on this device (e.g. older login
    // pre-dating this feature), don't kick — wait until the next sign-in
    // claims one. The guard still installs so future row changes are caught
    // once a sid exists.
    if (!getLocalSessionId(user.id)) return;
    kickedRef.current = false;

    const handle = installSingleSessionGuard(user.id, async (reason) => {
      // Only react to an explicit takeover by another device. A "missing"
      // result (no DB row, transient read error, Realtime DELETE replay,
      // or row not yet visible right after login) must NOT log the user
      // out — that caused false logouts on navigation/refresh.
      if (reason !== "kicked") return;
      if (kickedRef.current) return;
      kickedRef.current = true;
      clearLocalSessionId(user.id);
      try {
        // LOCAL scope — do NOT revoke the refresh token globally, or the
        // new device that just took over will also be signed out.
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        /* noop */
      }
      try {
        clearSessionTimers();
        clearClientAuthStorage();
      } catch {
        /* noop */
      }
      toast.error(
        "Your account has been signed out because you signed in from another device.",
        { duration: 8000 },
      );
      try {
        navigate({ to: "/login", replace: true });
      } catch {
        if (typeof window !== "undefined") window.location.replace("/login");
      }
    });

    return () => handle.stop();
  }, [user?.id, navigate]);

  return null;
}
