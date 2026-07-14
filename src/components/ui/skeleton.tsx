import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

const SKELETON_TIMEOUT_MS = 12_000;

function isLargeLoadingSurface(className?: string) {
  if (!className) return false;
  return /h-\[60vh\]|h-72|h-64|min-h|w-full/.test(className);
}

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const [timedOut, setTimedOut] = useState(false);
  const largeSurface = useMemo(() => isLargeLoadingSurface(className), [className]);

  useEffect(() => {
    if (!largeSurface) return;
    const id = setTimeout(() => setTimedOut(true), SKELETON_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [largeSurface]);

  if (timedOut && largeSurface) {
    return (
      <div
        role="alert"
        className={cn(
          "flex items-center justify-center rounded-md border border-border bg-card p-6 text-center",
          className,
        )}
        {...props}
      >
        <div className="max-w-sm">
          <p className="text-sm font-medium text-foreground">Loading timed out</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Retry the page instead of waiting on a stuck loading state.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex min-h-9 items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />;
}

export { Skeleton };
