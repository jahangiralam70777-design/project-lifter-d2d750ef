// @ts-nocheck
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";

import { useEffect, useState } from "react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useAppStore, hasLocalAuthSession } from "@/stores/app-store";
import { supabase } from "@/integrations/supabase/client";
import { verifyAdminAccess, type VerifyAdminAccessResult } from "@/lib/admin-verify.functions";
import { useServerFn } from "@tanstack/react-start";
import { useMyAccess, useRbacRealtime } from "@/hooks/use-my-access";
import { pageKeyForPath } from "@/lib/rbac/page-registry";
import { AccessDenied } from "@/components/rbac/PageGuard";
import { AdminRouteBoundary } from "@/components/admin/AdminRouteBoundary";
import { reportError } from "@/lib/error-reporter";
import { withTimeout } from "@/lib/async-timeout";

export const Route = createFileRoute("/admin")({
  // Admin session lives in localStorage (Supabase). SSR-skip + a
  // component-level gate (post-mount) prevents admin chrome from being
  // shown to anonymous visitors AND avoids a hydration mismatch from
  // synchronously redirecting during hydration.
  ssr: false,
  component: AdminLayout,
  head: () => ({
    meta: [
      { title: "Admin Control Center · CA Aspire BD" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Manage students, exams, resources and platform analytics from the premium glassmorphism CA Aspire BD admin dashboard.",
      },
    ],
  }),
});


const ADMIN_VERIFIED_KEY = "admin-verified-at";
const ADMIN_VERIFIED_TTL_MS = 60_000;
const ADMIN_GATE_TIMEOUT_MS = 12_000;

function readRecentVerification(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(ADMIN_VERIFIED_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    return Number.isFinite(ts) && Date.now() - ts < ADMIN_VERIFIED_TTL_MS;
  } catch {
    return false;
  }
}

function AdminGate({ children }: { children: React.ReactNode }) {
  const user = useAppStore((s) => s.user);
  const sessionReady = useAppStore((s) => s.sessionReady);
  const authLoading = useAppStore((s) => s.authLoading);
  const refreshAuth = useAppStore((s) => s.refreshAuth);
  const navigate = useNavigate();
  const verifyAdmin = useServerFn(verifyAdminAccess);
  // Optimistically trust a recent verification from /admin/login so the
  // dashboard paints immediately. Background re-verification still runs.
  const [verified, setVerified] = useState<boolean>(() => readRecentVerification());
  const [gateTimedOut, setGateTimedOut] = useState(false);

  useEffect(() => {
    if (!user && hasLocalAuthSession()) void refreshAuth({ force: true });
  }, [refreshAuth, user]);

  useEffect(() => {
    if (verified) return;
    setGateTimedOut(false);
    const id = window.setTimeout(() => {
      setGateTimedOut(true);
      reportError({
        source: "frontend",
        severity: "medium",
        message: "Admin gate timed out before verification completed",
        route: window.location.pathname,
        payload: { hasUser: Boolean(user), authLoading, sessionReady, ts: new Date().toISOString() },
      });
    }, ADMIN_GATE_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [verified]);

  useEffect(() => {
    let cancelled = false;
    if (!sessionReady) return;
    (async () => {
      setGateTimedOut(false);
      let checkedUserId = user?.id ?? null;
      try {
        const [userCheck, result] = await Promise.all([
          withTimeout(
            supabase.auth.getUser(),
            ADMIN_GATE_TIMEOUT_MS,
            "Admin auth user check timed out",
          ),
          withTimeout(
            verifyAdmin(),
            ADMIN_GATE_TIMEOUT_MS,
            "Admin role verification timed out",
          ) as Promise<VerifyAdminAccessResult>,
        ]);
        if (cancelled) return;
        const { data: userData, error: userErr } = userCheck;
        if (userErr || !userData.user) {
          navigate({ to: "/admin/login", replace: true });
          return;
        }
        checkedUserId = userData.user.id;
        console.info("[admin-route] session user", {
          id: userData.user.id,
          email: userData.user.email,
          appMetadata: userData.user.app_metadata,
          userMetadata: userData.user.user_metadata,
        });
        if (result?.degraded) {
          console.warn("[admin-route] admin verification degraded", {
            userId: userData.user.id,
            reason: result.reason,
          });
          reportError({
            source: "frontend",
            severity: "medium",
            message: "Admin verification degraded during navigation",
            route: window.location.pathname,
            payload: {
              userId: userData.user.id,
              role: user?.role ?? null,
              reason: result.reason ?? null,
              ts: new Date().toISOString(),
            },
          });
          const localAdmin =
            user?.role === "admin" || user?.role === "super_admin" || user?.role === "moderator";
          if (localAdmin) {
            setVerified(true);
          } else {
            navigate({ to: "/admin/login", replace: true });
          }
          return;
        }
        if (!result?.isAdmin && !result?.isModerator) {
          console.warn("[admin-route] verifyAdmin returned non-admin", {
            userId: userData.user.id,
            sources: result?.sources,
          });
          navigate({ to: "/admin/login", replace: true });
          return;
        }
        console.info("[admin-route] admin verified", { userId: userData.user.id, role: result.role });
        try {
          window.sessionStorage.setItem(ADMIN_VERIFIED_KEY, String(Date.now()));
        } catch {
          /* ignore storage errors */
        }
        setVerified(true);
      } catch (error) {
        if (cancelled) return;
        console.warn("[admin-route] admin verification request failed", {
          userId: checkedUserId,
          error: error instanceof Error ? error.message : String(error),
        });
        reportError({
          source: "frontend",
          severity: "medium",
          message: "Admin verification request failed during navigation",
          route: window.location.pathname,
          stack: error instanceof Error ? error.stack : undefined,
          payload: {
            userId: checkedUserId,
            role: user?.role ?? null,
            error: error instanceof Error ? error.message : String(error),
            ts: new Date().toISOString(),
          },
        });
        const localAdmin =
          user?.role === "admin" || user?.role === "super_admin" || user?.role === "moderator";
        if (localAdmin) {
          setVerified(true);
        } else {
          navigate({ to: "/admin/login", replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, sessionReady, user?.id, navigate, verifyAdmin]);

  if (!verified && gateTimedOut) {
    return (
      <div role="alert" className="flex min-h-[60dvh] flex-1 items-center justify-center px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Admin access check timed out</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We couldn't finish verifying this session. Try again or sign in again.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => {
                setGateTimedOut(false);
                void refreshAuth({ force: true });
              }}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/admin/login", replace: true })}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!verified) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex min-h-[60dvh] flex-1 items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <span
            aria-hidden
            className="h-9 w-9 animate-spin rounded-full border-2 border-[var(--neon-purple)]/30 border-t-[var(--neon-purple)]"
          />
          <p className="text-sm font-medium tracking-wide">Loading admin dashboard…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function AdminLayout() {
  const path = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Deferred anon-visitor redirect. Avoids hydration mismatch from a
  // synchronous beforeLoad redirect.
  useEffect(() => {
    if (!mounted) return;
    if (path === "/admin/login") return;
    if (!hasLocalAuthSession()) {
      navigate({ to: "/admin/login", replace: true });
    }
  }, [mounted, path, navigate]);

  // First client paint matches SSR (empty).
  if (!mounted) return null;

  // The admin login page lives at /admin/login but must be publicly reachable
  // (no sidebar, no gate) so unauthenticated admins can sign in.
  if (path === "/admin/login") {
    return (
      <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-hero-glow opacity-60" />
        <Outlet />
      </div>
    );
  }

  // Anonymous visitor: the effect above is navigating to /admin/login.
  // Render null in the meantime so we don't flash admin chrome.
  if (!hasLocalAuthSession()) return null;

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-hero-glow opacity-60" />
      <div className="pointer-events-none fixed left-10 top-20 -z-10 h-72 w-72 rounded-full bg-[var(--neon-purple)]/20 blur-3xl animate-pulse-glow" />
      <div className="pointer-events-none fixed right-10 bottom-10 -z-10 h-80 w-80 rounded-full bg-[var(--neon-blue)]/20 blur-3xl animate-pulse-glow" />
      <div className="pointer-events-none fixed left-1/2 top-1/3 -z-10 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl animate-pulse-glow" />


      <div className="mx-auto flex max-w-[1600px] gap-4 px-4 py-4 sm:px-6">
        <AdminGate>
          <AdminShell path={path} />
        </AdminGate>
      </div>
    </div>
  );
}

function AdminShell({ path }: { path: string }) {
  const user = useAppStore((s) => s.user);
  const access = useMyAccess();
  useRbacRealtime(access.userId || null);
  const pageKey = pageKeyForPath(path);
  // super_admin/admin → bypass; otherwise check the live page set.
  // If the RBAC lookup itself failed (e.g. RPC missing on the DB), fail
  // OPEN — the surrounding <AdminGate/> has already verified the caller
  // is an admin via verifyAdminAccess, so blocking every page would just
  // brick the panel for legitimate admins. The page still renders its
  // own server-side checks on writes.
  const allowed =
    access.loading ||
    access.failed ||
    access.isSuperAdmin ||
    access.isAdmin ||
    !pageKey ||
    access.pages.has(pageKey);
  return (
    <>
      <AdminSidebar />
      <div className="pointer-events-auto min-w-0 flex-1 space-y-4">
        <AdminRouteBoundary resetKey={path} userId={user?.id} userRole={user?.role}>
          {allowed ? <Outlet /> : <AccessDenied pageKey={pageKey ?? undefined} />}
        </AdminRouteBoundary>
      </div>
    </>
  );
}