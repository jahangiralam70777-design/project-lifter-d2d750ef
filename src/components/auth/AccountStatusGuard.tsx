import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/app-store";
import { clearClientAuthStorage, signOut } from "@/lib/auth-client";

/**
 * Real-time account-status enforcement.
 *
 * Logs the user out ONLY when the server emits an explicit, durable signal:
 *   - profiles.deleted_at set, or profiles.status = "suspended" / "deleted"
 *   - a new active row in user_bans, or an existing row that is still active
 *   - account_status_events row with a KNOWN reason (deleted/banned/suspended/missing)
 *   - user_sessions.active_session_id explicitly marked "revoked:..." by admin
 *   - supabase.auth USER_DELETED event
 *   - getUser() returns an explicit user_not_found / "User from sub claim" error
 *
 * It NEVER force-logs-out on:
 *   - session refresh, token refresh, transient network failures
 *   - empty `.maybeSingle()` results (RLS / cold start / projection nulls)
 *   - generic SIGNED_OUT from another tab (we simply follow that other tab to /login)
 *   - INITIAL_SESSION / TOKEN_REFRESHED events
 *   - account_status_events whose `reason` is not in the known set
 *
 * Detection layers:
 *   1. Supabase realtime channels on profiles / user_bans / account_status_events /
 *      user_sessions (admin-revoked marker only)
 *   2. supabase.auth.onAuthStateChange (USER_DELETED hard signal)
 *   3. Conservative on-demand probe — runs on tab focus / route change /
 *      coming online, NOT on a 2-second interval. Requires TWO consecutive
 *      explicit-missing probes before firing logout.
 *   4. Cross-tab BroadcastChannel + storage event sync
 */

const LOGOUT_BROADCAST_KEY = "edumaster.force_logout";
const LOGOUT_CHANNEL = "edumaster-account-status";

type LogoutReason = "deleted" | "banned" | "missing";

const REASON_MESSAGES: Record<LogoutReason, string> = {
  banned: "Your account has been banned by an administrator.",
  deleted: "Your account has been removed by an administrator.",
  missing: "Your session is no longer valid. Please sign in again.",
};

const KNOWN_EVENT_REASONS = new Set(["deleted", "banned", "suspended", "missing"]);

export function AccountStatusGuard() {
  const user = useAppStore((s) => s.user);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routerLocation = useRouterState({ select: (s) => s.location.pathname });
  const kickedRef = useRef(false);

  useEffect(() => {
    if (!user?.id) {
      kickedRef.current = false;
      return;
    }
    const uid = user.id;
    let stopped = false;

    let bc: BroadcastChannel | null = null;

    const broadcast = (reason: LogoutReason) => {
      try {
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            LOGOUT_BROADCAST_KEY,
            JSON.stringify({ uid, reason, ts: Date.now() }),
          );
        }
      } catch {
        /* ignore quota errors */
      }
      try {
        bc?.postMessage({ uid, reason });
      } catch {
        /* ignore */
      }
    };

    const forceLogout = async (reason: LogoutReason, fromBroadcast = false) => {
      if (kickedRef.current || stopped) return;
      kickedRef.current = true;
      console.warn(
        `[AccountStatusGuard] force logout uid=${uid} reason=${reason} broadcast=${fromBroadcast}`,
      );
      if (!fromBroadcast) broadcast(reason);
      await queryClient.cancelQueries().catch(() => undefined);
      queryClient.clear();
      try {
        await signOut();
      } catch (e) {
        console.warn("[AccountStatusGuard] signOut failed", e);
      }
      clearClientAuthStorage({ all: true });
      useAppStore.setState((state) => ({
        user: null,
        sessionReady: true,
        authLoading: false,
        authError: null,
        authVersion: Math.max(state.authVersion + 1, Date.now()),
        quizRuntime: { active: false, score: 0, answered: 0 },
      }));
      toast.error(REASON_MESSAGES[reason], { duration: 8000 });
      try {
        navigate({ to: "/login", replace: true });
      } catch {
        if (typeof window !== "undefined") window.location.replace("/login");
      }
    };

    // --- Cross-tab sync ---
    try {
      bc = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(LOGOUT_CHANNEL) : null;
    } catch {
      bc = null;
    }
    if (bc) {
      bc.onmessage = (evt) => {
        const data = evt.data as { uid?: string; reason?: LogoutReason } | null;
        if (data?.uid === uid && data.reason) void forceLogout(data.reason, true);
      };
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOGOUT_BROADCAST_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as { uid?: string; reason?: LogoutReason };
        if (parsed.uid === uid && parsed.reason) void forceLogout(parsed.reason, true);
      } catch {
        /* ignore */
      }
    };
    if (typeof window !== "undefined") window.addEventListener("storage", onStorage);

    // --- Supabase auth state listener ---
    // Only USER_DELETED is a hard "the auth row is gone" signal. SIGNED_OUT
    // can fire on legitimate token-clear paths (manual logout from another
    // tab, idle logout) and must NOT produce the "removed by administrator"
    // toast or force a duplicate sign-out. We just navigate quietly.
    const { data: authSub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        if (kickedRef.current) return;
        kickedRef.current = true;
        try {
          navigate({ to: "/login", replace: true });
        } catch {
          if (typeof window !== "undefined") window.location.replace("/login");
        }
      } else if ((event as string) === "USER_DELETED") {
        void forceLogout("deleted");
      }
    });

    // --- Realtime DB triggers ---
    const channel = supabase
      .channel(`account-status-${uid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        (payload) => {
          const next = payload.new as { deleted_at?: string | null; status?: string | null } | null;
          if (!next) return;
          if (next.deleted_at) void forceLogout("deleted");
          else if (next.status === "suspended") void forceLogout("banned");
          else if (next.status === "deleted") void forceLogout("deleted");
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "profiles", filter: `id=eq.${uid}` },
        () => void forceLogout("deleted"),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_bans", filter: `user_id=eq.${uid}` },
        () => void forceLogout("banned"),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_bans", filter: `user_id=eq.${uid}` },
        (payload) => {
          const next = payload.new as { lifted_at?: string | null; ends_at?: string | null } | null;
          if (
            !next?.lifted_at &&
            (!next?.ends_at || new Date(next.ends_at).getTime() > Date.now())
          ) {
            void forceLogout("banned");
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "account_status_events",
          filter: `user_id=eq.${uid}`,
        },
        (payload) => {
          const reason = (payload.new as { reason?: string | null } | null)?.reason ?? "";
          // Only fire on KNOWN reasons. Unknown reasons MUST NOT default to
          // "deleted" — that was the source of the bogus
          // "removed by administrator" message on benign events.
          if (!KNOWN_EVENT_REASONS.has(reason)) return;
          if (reason === "banned" || reason === "suspended") void forceLogout("banned");
          else if (reason === "deleted") void forceLogout("deleted");
          else if (reason === "missing") void forceLogout("missing");
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "user_sessions", filter: `user_id=eq.${uid}` },
        (payload) => {
          const sid =
            (payload.new as { active_session_id?: string | null } | null)?.active_session_id ?? "";
          // Single-session replacement (a new login on another device writes
          // a plain session ID, NOT a "revoked:" marker) is handled by
          // SingleSessionGuard with its own messaging. Only react here to
          // the explicit admin-set "revoked:" marker, so we never mislabel
          // a normal device switch as "account removed".
          if (sid.startsWith("revoked:banned") || sid.startsWith("revoked:suspended")) {
            void forceLogout("banned");
          } else if (
            sid.startsWith("revoked:deleted") ||
            sid.startsWith("revoked:missing") ||
            sid === "revoked"
          ) {
            void forceLogout("deleted");
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "user_sessions", filter: `user_id=eq.${uid}` },
        () => {
          // Deleting the row is NOT a deletion signal on its own — admins
          // sometimes clear session bookkeeping. Skip.
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log(`[AccountStatusGuard] realtime subscribed uid=${uid}`);
        }
      });

    // --- Conservative on-demand probe ---
    // Runs only on focus / online / visibilitychange / route change /
    // a single initial check. NO periodic interval. Requires two
    // consecutive explicit-missing observations before firing logout.
    let probeInFlight = false;
    let missingProfileStreak = 0;
    let missingUserStreak = 0;
    const probe = async () => {
      if (stopped || kickedRef.current || probeInFlight) return;
      probeInFlight = true;
      try {
        const { data, error } = await supabase.auth.getUser();
        if (error || !data?.user) {
          const code = (error as { code?: string } | null)?.code ?? "";
          const msg = (error?.message ?? "").toLowerCase();
          const explicitMissing =
            code === "user_not_found" ||
            msg.includes("user_not_found") ||
            msg.includes("user from sub claim");
          if (!explicitMissing) {
            // Transient (network blip, 5xx, refresh-token race). DO NOT log out.
            return;
          }
          missingUserStreak += 1;
          if (missingUserStreak >= 2) {
            void forceLogout("deleted");
          }
          return;
        }
        missingUserStreak = 0;

        const profileResp = await supabase
          .from("profiles")
          .select("id,deleted_at,status")
          .eq("id", uid)
          .maybeSingle();
        const prof = profileResp.data as
          | { deleted_at: string | null; status: string | null }
          | null;
        const profErr = profileResp.error as { code?: string; message?: string } | null;
        if (!prof) {
          const profErrCode = profErr?.code ?? "";
          const profErrMsg = (profErr?.message ?? "").toLowerCase();
          const explicitMissing = profErrCode === "PGRST116" || profErrMsg.includes("not found");
          if (explicitMissing) {
            missingProfileStreak += 1;
          } else {
            // Could be RLS denial mid-recovery, transient network, etc.
            // Reset, do not log out.
            missingProfileStreak = 0;
          }
          if (missingProfileStreak >= 3) {
            void forceLogout("deleted");
          }
          return;
        }
        missingProfileStreak = 0;
        if (prof.deleted_at) {
          void forceLogout("deleted");
          return;
        }
        if (prof.status === "suspended") {
          void forceLogout("banned");
          return;
        }
        if (prof.status === "deleted") {
          void forceLogout("deleted");
          return;
        }
        const { data: banned } = await (
          supabase as unknown as {
            rpc: (
              n: string,
              a: Record<string, unknown>,
            ) => Promise<{ data: boolean | null; error: unknown }>;
          }
        ).rpc("is_user_banned", { _user_id: uid });
        if (banned === true) void forceLogout("banned");
      } catch {
        /* transient — do not log out */
      } finally {
        probeInFlight = false;
      }
    };

    const onFocus = () => void probe();
    const onOnline = () => void probe();
    const onVisible = () => {
      if (document.visibilityState === "visible") void probe();
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const initial = window.setTimeout(() => void probe(), 1500);

    return () => {
      stopped = true;
      window.clearTimeout(initial);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      try {
        bc?.close();
      } catch {
        /* ignore */
      }
      try {
        authSub.subscription.unsubscribe();
      } catch {
        /* ignore */
      }
      void supabase.removeChannel(channel);
    };
  }, [user?.id, navigate, queryClient]);

  // Probe on route change — but ONLY warn the user when getUser() returns an
  // explicit "user gone" error. Network failures, 5xx, refresh races stay silent.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error || !data?.user) {
          const code = (error as { code?: string } | null)?.code ?? "";
          const msg = (error?.message ?? "").toLowerCase();
          const explicitMissing =
            code === "user_not_found" ||
            msg.includes("user_not_found") ||
            msg.includes("user from sub claim");
          if (!explicitMissing) return;
          try {
            await signOut();
          } catch {
            /* noop */
          }
          toast.error("Your session is no longer valid. Please sign in again.", {
            duration: 8000,
          });
          try {
            navigate({ to: "/login", replace: true });
          } catch {
            window.location.replace("/login");
          }
        }
      } catch {
        /* network blip */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routerLocation, user?.id, navigate]);

  return null;
}
