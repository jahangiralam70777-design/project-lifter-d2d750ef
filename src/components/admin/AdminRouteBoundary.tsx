import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { reportError } from "@/lib/error-reporter";

interface State {
  error: Error | null;
}

/**
 * Per-admin-route error + suspense boundary.
 *
 * Catches crashes from a single admin page so they don't take down the
 * sidebar / shell, and renders an inline retry card instead of the
 * full-screen RootErrorBoundary. The `resetKey` (typically the current
 * pathname) resets the boundary automatically on navigation so a fix on
 * one page is visible when the user moves to another.
 */
class AdminRouteErrorBoundary extends Component<
  { children: ReactNode; resetKey: string; userId?: string; userRole?: string | null },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError({
      source: "frontend",
      severity: "high",
      message: error.message || "Admin route render crash",
      stack: error.stack,
      payload: {
        route: this.props.resetKey,
        userId: this.props.userId ?? null,
        role: this.props.userRole ?? null,
        ts: new Date().toISOString(),
        componentStack: info.componentStack?.slice(0, 4000) ?? null,
      },
    });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="glass shadow-card-soft mx-auto my-10 max-w-lg rounded-3xl p-8 text-center"
      >
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          This page hit a snag
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {this.state.error.message || "An unexpected error occurred while loading this section."}
        </p>
        <button
          onClick={this.reset}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    );
  }
}

function PageFallback() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 12_000);
    return () => clearTimeout(id);
  }, []);

  if (timedOut) {
    return (
      <div role="alert" className="glass shadow-card-soft mx-auto my-10 max-w-lg rounded-3xl p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
          This admin page took too long to load
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The loading step timed out instead of leaving the page on an infinite spinner.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex min-h-[40dvh] items-center justify-center"
    >
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--neon-purple)]/30 border-t-[var(--neon-purple)]"
      />
    </div>
  );
}

export function AdminRouteBoundary({
  resetKey,
  userId,
  userRole,
  children,
}: {
  resetKey: string;
  userId?: string;
  userRole?: string | null;
  children: ReactNode;
}) {
  return (
    <AdminRouteErrorBoundary resetKey={resetKey} userId={userId} userRole={userRole}>
      <Suspense fallback={<PageFallback />}>{children}</Suspense>
    </AdminRouteErrorBoundary>
  );
}