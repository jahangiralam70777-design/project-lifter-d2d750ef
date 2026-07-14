// @ts-nocheck
import { createFileRoute, Outlet, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { DashSidebar } from "@/components/dashboard/DashSidebar";
import { DashTopbar } from "@/components/dashboard/DashTopbar";
import { StudyHeartbeat } from "@/components/tracking/StudyHeartbeat";
import { NoticeBanner } from "@/components/site/NoticeBanner";
import { useAppStore, hasLocalAuthSession } from "@/stores/app-store";
import { supabase } from "@/integrations/supabase/client";
import { reportError } from "@/lib/error-reporter";
import { withTimeout } from "@/lib/async-timeout";

const STUDENT_GUARD_TIMEOUT_MS = 8_000;

export const Route = createFileRoute("/_student")({
  // Supabase session lives in localStorage; SSR cannot read it, so render
  // the protected subtree client-only. Auth gating happens inside the
  // component (post-mount) so the first client paint matches SSR (empty)
  // and we don't produce a hydration mismatch when redirecting
  // unauthenticated visitors to /login.
  ssr: false,
  // Keep the currently-rendered student page mounted during any child
  // route transition (including redirect chains triggered by realtime
  // access changes). Prevents the router from swapping the layout for
  // the global `defaultPendingComponent` mid-transition — which would
  // otherwise briefly blank the screen between old and new routes.
  pendingMs: Number.MAX_SAFE_INTEGER,
  pendingMinMs: 0,
  component: StudentLayout,
  errorComponent: StudentErrorComponent,
});

function StudentErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[student] route error", error);
    reportError({
      source: "frontend",
      severity: "high",
      message: error.message || "Student route failure",
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We hit a problem loading this section. You can try again or head back to your dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

function StudentLayout() {
  const navigate = useNavigate();
  const user = useAppStore((s) => s.user);
  const sessionReady = useAppStore((s) => s.sessionReady);
  const authLoading = useAppStore((s) => s.authLoading);

  // Account-status verification (deleted / suspended / banned). This runs
  // in the background and ONLY navigates on an authoritative negative
  // result. It must not gate the initial render — doing so caused a
  // refresh-time race: the verification could transiently fail (timeout
  // or supabase init race on F5), call goLogin(), and __root's
  // `redirectTo` would then immediately bounce a still-cached `user`
  // back to /dashboard. That bounce was the user-visible "automatic
  // second refresh" with runtime errors. The presence of a persisted
  // Supabase session is already enforced by `redirectTo` in __root, and
  // <AccountStatusGuard /> performs the authoritative server-side
  // account-validity probe with retries.
  useEffect(() => {
    let cancelled = false;
    const here = typeof window !== "undefined" ? window.location.href : "/";
    const goLogin = () =>
      navigate({ to: "/login", search: { redirect: here }, replace: true });

    (async () => {
      if (!hasLocalAuthSession()) {
        goLogin();
        return;
      }
      try {
        const { data: userData, error: userError } = await withTimeout(
          supabase.auth.getUser(),
          STUDENT_GUARD_TIMEOUT_MS,
          "Student session verification timed out",
        );
        if (cancelled) return;
        // Only act on an explicit "no user" reply from Supabase. Transient
        // errors (network blip, timeout) must NOT sign the user out — the
        // authoritative AccountStatusGuard owns that decision.
        if (!userError && !userData.user) {
          await supabase.auth.signOut().catch(() => undefined);
          goLogin();
          return;
        }
        if (userError || !userData.user) return;
        const uid = userData.user.id;
        const [{ data: profile }, { data: banned }] = await withTimeout(
          Promise.all([
            supabase.from("profiles").select("id,deleted_at,status").eq("id", uid).maybeSingle(),
            (supabase as unknown as {
              rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: boolean | null }>;
            }).rpc("is_user_banned", { _user_id: uid }),
          ]),
          STUDENT_GUARD_TIMEOUT_MS,
          "Student account status verification timed out",
        );
        if (cancelled) return;
        if (
          (profile &&
            (profile.deleted_at ||
              ["suspended", "deleted", "banned"].includes(profile.status ?? ""))) ||
          banned === true
        ) {
          await supabase.auth.signOut().catch(() => undefined);
          goLogin();
        }
      } catch (err) {
        if (cancelled) return;
        // Transient verification errors must not bounce the user — log
        // for observability and let the next focus/refresh re-validate.
        reportError({
          source: "frontend",
          severity: "low",
          message: (err as Error)?.message || "Student guard background check failed",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // Background role check: a logged-in non-student bounces out.
  useEffect(() => {
    if (!sessionReady || authLoading || !user) return;
    if (user.role !== "student") {
      const adminLike =
        user.role === "admin" || user.role === "super_admin" || user.role === "moderator";
      navigate({ to: adminLike ? "/admin" : "/login", replace: true });
    }
  }, [sessionReady, authLoading, user, navigate]);

  // Render immediately. `__root.tsx`'s `redirectTo` has already verified a
  // persisted Supabase session exists for student routes; without one the
  // user would never reach this component.

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-hero-glow opacity-60" />
      <div className="pointer-events-none fixed left-10 top-20 -z-10 h-72 w-72 rounded-full bg-[var(--neon-purple)]/20 blur-3xl animate-pulse-glow" />
      <div className="pointer-events-none fixed right-10 bottom-10 -z-10 h-80 w-80 rounded-full bg-[var(--neon-blue)]/20 blur-3xl animate-pulse-glow" />
      <div className="pointer-events-none fixed left-1/2 top-1/3 -z-10 h-64 w-64 rounded-full bg-fuchsia-500/10 blur-3xl animate-pulse-glow" />

      <div className="mx-auto flex max-w-[1500px] gap-4 px-4 py-4 sm:px-6">
        <DashSidebar />
        <div className="pointer-events-auto min-w-0 flex-1 space-y-4">
          <DashTopbar />
          <NoticeBanner />
          <StudyHeartbeat />
          {/* Reserve a stable minimum height for the routed page area so
              short loading skeletons do not collapse the viewport and
              re-introduce vertical layout shift between navigations. */}
          <div className="min-h-[calc(100dvh-9rem)]">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}