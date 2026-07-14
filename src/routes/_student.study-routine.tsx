import { createFileRoute, Navigate } from "@tanstack/react-router";
import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudyRoutineVisibility } from "@/hooks/use-study-routine-visibility";
import { reportError } from "@/lib/error-reporter";

const StudyRoutineFlow = lazy(() =>
  import("@/components/dashboard/StudyRoutineFlow")
    .then((m) => ({ default: m.StudyRoutineFlow }))
    .catch((err) => {
      // Chunk-load failure: return a small module that renders an inline error
      // instead of white-screening the route.
      // eslint-disable-next-line no-console
      console.error("[StudyRoutine] failed to load flow chunk", err);
      return {
        default: function StudyRoutineChunkError() {
          return (
            <RoutineErrorCard
              title="This page failed to load"
              message="Could not download the Study Routine module. Please refresh the page."
              onRetry={() => window.location.reload()}
            />
          );
        },
      };
    }),
);

export const Route = createFileRoute("/_student/study-routine")({
  component: StudyRoutinePage,
  errorComponent: RouteErrorFallback,
  head: () => ({
    meta: [
      { title: "Study Routine · CA Aspire BD" },
      {
        name: "description",
        content:
          "Plan smart, study consistently and achieve more with daily, weekly, monthly and custom study routines.",
      },
      { property: "og:title", content: "Study Routine · CA Aspire BD" },
      {
        property: "og:description",
        content:
          "Create routines, track tasks and visualize your study calendar in one premium planner.",
      },
    ],
  }),
});

function StudyRoutinePage() {
  const { enabled, loading } = useStudyRoutineVisibility();
  if (loading) return <Skeleton className="h-[60vh] w-full rounded-3xl" />;
  if (!enabled) return <Navigate to="/dashboard" replace />;
  return (
    <StudyRoutineBoundary>
      <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
        <StudyRoutineFlow />
      </Suspense>
    </StudyRoutineBoundary>
  );
}

function RouteErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <RoutineErrorCard
      title="Study Routine hit an error"
      message={error?.message || "An unexpected error occurred."}
      onRetry={reset}
    />
  );
}

function RoutineErrorCard({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <div role="alert" className="mx-auto my-10 max-w-lg rounded-3xl border bg-card p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground break-words">{message}</p>
      <Button onClick={onRetry} className="mt-6">
        <RotateCw className="mr-2 h-4 w-4" /> Try again
      </Button>
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
  key: number;
}

class StudyRoutineBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null, key: 0 };

  static getDerivedStateFromError(error: Error): Partial<BoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Report but never let the error bubble up — the whole point of this
    // boundary is to prevent a white screen for the Study Routine module.
    try {
      reportError({
        source: "frontend",
        severity: "high",
        message: error.message || "Study Routine render crash",
        stack: error.stack,
        payload: {
          route: "/study-routine",
          componentStack: info.componentStack?.slice(0, 4000) ?? null,
        },
      });
    } catch {
      // ignore reporter failures
    }
    // eslint-disable-next-line no-console
    console.error("[StudyRoutine] recovered from render error", error);
  }

  reset = () => this.setState((s) => ({ error: null, key: s.key + 1 }));

  render() {
    if (this.state.error) {
      return (
        <RoutineErrorCard
          title="Study Routine hit a snag"
          message={
            this.state.error.message ||
            "Something went wrong while loading your routines. Please try again."
          }
          onRetry={this.reset}
        />
      );
    }
    return <div key={this.state.key}>{this.props.children}</div>;
  }
}
