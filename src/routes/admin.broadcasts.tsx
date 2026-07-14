import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const BroadcastManager = lazy(() =>
  import("@/components/admin/BroadcastManager").then((m) => ({ default: m.BroadcastManager })),
);

export const Route = createFileRoute("/admin/broadcasts")({
  component: BroadcastsPage,
});

function BroadcastsPage() {
  return <Suspense fallback={<BroadcastRouteFallback />}>
      <BroadcastManager />
    </Suspense>;
}

function BroadcastRouteFallback() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 12_000);
    return () => clearTimeout(id);
  }, []);

  if (timedOut) {
    return (
      <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">Broadcast Messages did not finish loading</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The route chunk timed out instead of leaving the page on an infinite spinner.
        </p>
        <Button type="button" variant="outline" className="mt-5" onClick={() => window.location.reload()}>
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-border bg-card p-8" role="status" aria-live="polite">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
