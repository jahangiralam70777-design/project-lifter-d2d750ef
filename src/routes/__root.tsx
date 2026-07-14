import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  Navigate,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { hasLocalAuthSession, useAppStore } from "@/stores/app-store";
import { useRealtimeInvalidator } from "@/hooks/use-realtime-invalidator";
import { usePrefs } from "@/lib/profile-prefs";
import { ThemeInjector } from "@/components/site/ThemeInjector";
import { SingleSessionGuard } from "@/components/auth/SingleSessionGuard";
import { AccountStatusGuard } from "@/components/auth/AccountStatusGuard";
import { SessionTimeoutGuard } from "@/components/auth/SessionTimeoutGuard";
import { ActivityTracker } from "@/components/tracking/ActivityTracker";
import { RootErrorBoundary } from "@/components/RootErrorBoundary";
import { installGlobalErrorReporter, reportError } from "@/lib/error-reporter";
import { useNavTiming } from "@/lib/nav-timing";
import { SkipToContent } from "@/components/a11y/SkipToContent";
import { LiveRegionProvider } from "@/components/a11y/LiveRegion";
import { ConfirmDialogHost } from "@/components/ui/confirm-imperative";

// Defer always-on floating widgets to a separate chunk that loads after the
// page is interactive. They don't affect first paint and most visitors on
// public pages never see them, so paying for them in the root bundle is waste.
const WhatsAppFloatingButton = lazy(() =>
  import("@/components/site/WhatsAppFloatingButton").then((m) => ({
    default: m.WhatsAppFloatingButton,
  })),
);
const LiveChatWidget = lazy(() =>
  import("@/components/site/LiveChatWidget").then((m) => ({ default: m.LiveChatWidget })),
);
const BroadcastPopup = lazy(() =>
  import("@/components/site/BroadcastPopup").then((m) => ({ default: m.BroadcastPopup })),
);
const HelpCenterFloating = lazy(() =>
  import("@/components/site/HelpCenterFloating").then((m) => ({
    default: m.HelpCenterFloating,
  })),
);


import appCss from "../styles.css?url";

// A-9: silence non-essential console output in production builds. Errors and
// warnings are preserved so reportError + browser DevTools still surface real
// problems; only `console.log/debug/info` are stripped to avoid leaking
// internal state to end users.
if (typeof window !== "undefined" && import.meta.env.PROD) {
  const noop = () => undefined;
  // eslint-disable-next-line no-console
  console.log = noop;
  // eslint-disable-next-line no-console
  console.debug = noop;
  // eslint-disable-next-line no-console
  console.info = noop;
}

function NotFoundComponent() {
  return (
    <main id="main-content" className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p aria-hidden="true" className="text-7xl font-bold text-muted-foreground/40">
          404
        </p>
        <h1 className="mt-4 text-2xl font-semibold text-foreground">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  // Capture route-level render failures into the system error log.
  useEffect(() => {
    reportError({
      source: "frontend",
      severity: "critical",
      message: error.message || "Route render failure",
      stack: error.stack,
    });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CA Aspire BD — Professional ICAB & Chartered Accountancy Learning Platform" },
      {
        name: "description",
        content:
          "CA Aspire BD — Professional CA learning platform for ICAB students with MCQ practice, mock tests, quizzes, flash cards, notes, analytics and performance tracking across Financial Accounting, Audit, Taxation and Business Law.",
      },
      {
        name: "keywords",
        content:
          "CA Aspire BD, ICAB, Chartered Accountancy, CA exam preparation, CA MCQ practice, CA mock test, Financial Accounting, Audit, Taxation, Business Law, Financial Reporting, Management Accounting, CA Bangladesh",
      },
      { name: "author", content: "CA Aspire BD" },
      {
        property: "og:title",
        content: "CA Aspire BD — ICAB & Chartered Accountancy Learning Platform",
      },
      {
        property: "og:description",
        content:
          "Professional CA learning platform for ICAB students — MCQ practice, mock tests, flash cards, notes & analytics.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
    scripts: [
      {
        children: AUTH_CALLBACK_RESCUE_SCRIPT,
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CA Aspire BD",
          url: "/",
          description:
            "Professional CA learning platform for ICAB students — MCQ practice, mock tests, flash cards, notes and analytics.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "CA Aspire BD",
          url: "/",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

const AUTH_CALLBACK_RESCUE_SCRIPT = `(function(){try{var l=window.location;var p=l.pathname;var s=new URLSearchParams(l.search||'');var h=l.hash||'';if(p==='/email-verified'||p==='/auth/confirm'||p==='/auth/callback'||p==='/reset-password'||p==='/forgot-password')return;var has=s.has('code')||s.has('token_hash')||s.has('token')||s.has('error')||s.has('error_description')||h.indexOf('access_token=')>-1||h.indexOf('refresh_token=')>-1||h.indexOf('type=signup')>-1||h.indexOf('type=magiclink')>-1||h.indexOf('type=invite')>-1||h.indexOf('error=')>-1||h.indexOf('error_description=')>-1;if(has){try{sessionStorage.setItem('caaspire.auth_callback_rescue',JSON.stringify({path:p,searchKeys:Array.from(s.keys()),hasHash:!!h,ts:Date.now()}));}catch(e){}l.replace('/email-verified'+(l.search||'')+h);}}catch(e){}})();`;

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeInjector />
        <LiveRegionProvider>
          <SkipToContent />
          <RootInner />
        </LiveRegionProvider>
        <Toaster position="top-right" richColors closeButton />
      </QueryClientProvider>
    </RootErrorBoundary>
  );
}

const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/register",
  "/admin/login",
  "/forgot-password",
  "/reset-password",
  "/email-verified",
];
const STUDENT_ROUTES = [
  "/dashboard",
  "/mcq-practice",
  "/quiz",
  "/custom-exam",
  "/mock-test",
  "/flash-cards",
  "/short-notes",
  "/qns-bank",
  "/classes",
  "/daily-progress",
  "/notifications",
  "/profile",
  "/bookmarks",
  "/wrong-questions",
];

function RootInner() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { hydrate, user, authVersion } = useAppStore();
  const hydrated = useAppStore((s) => s.hydrated);
  useNavTiming(user ? { id: user.id, role: user.role } : undefined);
  const lastAuthVersion = useRef(authVersion);
  // Render-time reads of `window.location` cause hydration mismatches
  // (React #418): SSR returns false, the client's first render reads the
  // live URL, the two outputs diverge, and the divergence flows into the
  // `redirectTo` guard below. Initialise to `false` on both SSR and the
  // first client render, then update post-mount.
  const [isSitePreviewFrame, setIsSitePreviewFrame] = useState(false);
  useEffect(() => {
    try {
      setIsSitePreviewFrame(
        new URLSearchParams(window.location.search).get("site-preview") === "1",
      );
    } catch {
      /* ignore */
    }
  }, []);

  // Apply user prefs (accent color, font size) to <html> on every mount.
  usePrefs();

  // Must be inside QueryClientProvider — uses useQueryClient internally.
  useRealtimeInvalidator(Boolean(user));

  useEffect(() => {
    if (isSitePreviewFrame) return;
    hydrate();
  }, [hydrate, isSitePreviewFrame]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = import.meta.env.VITE_SUPABASE_URL || "";
      const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
      const host = url ? new URL(url).host : null;
      console.log("[app] backend config", {
        supabaseConfigured: Boolean(url && key),
        projectHost: host,
        publishableKeyPrefix: key ? `${key.slice(0, 12)}…` : null,
        path: window.location.pathname,
      });
    } catch (error) {
      console.warn("[app] backend config check failed", error);
    }
  }, []);

  // Install window-level error + unhandled-rejection reporters once.
  useEffect(() => {
    installGlobalErrorReporter();
  }, []);

  // Catch-all: if Supabase redirects back to Site URL (typically "/") with
  // auth tokens on the URL (?code=, ?token_hash=, or #access_token=...),
  // forward to /email-verified so the canonical handler exchanges the token
  // and renders the success UI. Without this the user lands on the homepage
  // (or worse, the raw GoTrue JSON `{}` response) with tokens silently
  // dropped.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = window.location.pathname;
    if (p === "/email-verified" || p === "/auth/confirm" || p === "/auth/callback") return;
    if (p === "/reset-password" || p === "/forgot-password") return;
    const s = new URLSearchParams(window.location.search);
    const h = window.location.hash || "";
    const hasAuthToken =
      s.has("code") ||
      s.has("token_hash") ||
      s.has("token") ||
      s.has("error") ||
      s.has("error_description") ||
      h.includes("access_token=") ||
      h.includes("refresh_token=") ||
      h.includes("type=signup") ||
      h.includes("type=magiclink") ||
      h.includes("type=invite") ||
      h.includes("error=") ||
      h.includes("error_description=");
    if (hasAuthToken) {
      // Recovery (password-reset) tokens must go to /reset-password, NOT
      // /email-verified — otherwise we exchange the code into a normal
      // session and the user lands on the site without ever being asked
      // for a new password.
      const isRecovery =
        s.get("type") === "recovery" ||
        h.includes("type=recovery");
      const dest = isRecovery ? "/reset-password" : "/email-verified";
      console.warn("[auth-callback-rescue] forwarding callback", {
        fromPath: p,
        dest,
        searchKeys: Array.from(s.keys()),
        hasHash: Boolean(h),
      });
      window.location.replace(`${dest}${window.location.search}${h}`);
    }
  }, []);

  useEffect(() => {
    if (authVersion === lastAuthVersion.current) return;
    lastAuthVersion.current = authVersion;
    console.debug("[auth] global refresh", { authVersion, hasUser: !!user });
    if (!user) {
      void queryClient.cancelQueries().finally(() => queryClient.clear());
    } else {
      queryClient.invalidateQueries({ refetchType: "active" });
    }
  }, [authVersion, queryClient, user]);

  const path = location.pathname;
  const isPasswordRecoveryRoute = path === "/reset-password";
  // /admin/login is a PUBLIC admin sign-in page — it must not be treated as a
  // protected admin route (otherwise unauthenticated visitors get bounced).
  const isAdminLogin = path === "/admin/login";
  const isAdminRoute = !isAdminLogin && (path === "/admin" || path.startsWith("/admin/"));
  const isStudentRoute = STUDENT_ROUTES.includes(path);

  const hasPersistedSession = useMemo(() => {
    // SSR: localStorage is unavailable; defer until hydration so SSR and
    // first client render agree (prevents React #418).
    if (!hydrated) return false;
    return hasLocalAuthSession();
  }, [hydrated, path, user]);

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return null;
    if (!hydrated && !isSitePreviewFrame) return null;
    // Password-recovery links intentionally establish a temporary Supabase
    // session BEFORE the user chooses a new password. Treat /reset-password as
    // a special public recovery route: never auto-forward a signed-in user from
    // here to /dashboard. That redirect was the path that skipped the Create
    // New Password screen in production.
    if (isPasswordRecoveryRoute) return null;
    if (user && AUTH_ROUTES.includes(path)) {
      // Never bounce a signed-in user off /admin/login to /dashboard —
      // that's the source of the "admin menu → /dashboard" loop when the
      // store still holds a stale default role of "student" while the
      // real role is being resolved. Only auto-forward confirmed admins;
      // everyone else stays put on the admin sign-in page.
      if (path === "/admin/login") {
        return user.role === "admin" || user.role === "super_admin" || user.role === "moderator" ? "/admin" : null;
      }
      return user.role === "admin" || user.role === "super_admin" || user.role === "moderator" ? "/admin" : "/dashboard";
    }
    if (!hasPersistedSession && isAdminRoute) return "/admin/login";
    if (!hasPersistedSession && isStudentRoute) return "/login";
    return null;
  }, [
    path,
    user,
    isAdminRoute,
    isStudentRoute,
    hasPersistedSession,
    isPasswordRecoveryRoute,
    hydrated,
    isSitePreviewFrame,
  ]);

  if (redirectTo) return <Navigate to={redirectTo as never} replace />;
  return (
    <Suspense fallback={<RootLoadingFallback />}>
      <SingleSessionGuard />
      <AccountStatusGuard />
      <SessionTimeoutGuard />
      <ActivityTracker />
      <Outlet />
      <ConfirmDialogHost />
      <DeferredWidgets userRole={user?.role} />
    </Suspense>
  );
}

function RootLoadingFallback() {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setTimedOut(true), 12_000);
    return () => window.clearTimeout(id);
  }, []);

  if (timedOut) {
    return (
      <main id="main-content" className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">This page is taking too long</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Refresh the page or return home to continue.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Refresh
            </button>
            <Link
              to="/"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Go home
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      role="status"
      aria-live="polite"
      className="flex min-h-dvh items-center justify-center bg-background px-4"
    >
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
      />
      <span className="sr-only">Loading…</span>
    </main>
  );
}

// Mount floating widgets only after the page is idle / interactive so they
// never delay first paint or block the route content from rendering.
function DeferredWidgets({ userRole }: { userRole?: string | null }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 2500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setReady(true), 1500);
    return () => window.clearTimeout(t);
  }, []);

  if (!ready) return null;
  const isStudent = userRole === "student";
  return (
    <Suspense fallback={null}>
      <WhatsAppFloatingButton />
      <HelpCenterFloating />
      {isStudent ? <LiveChatWidget /> : null}
      {isStudent ? <BroadcastPopup /> : null}
    </Suspense>

  );
}
