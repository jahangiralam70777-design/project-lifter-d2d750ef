import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const LiveChatManager = lazy(() =>
  import("@/components/admin/LiveChatManager").then((m) => ({ default: m.LiveChatManager })),
);

export const Route = createFileRoute("/admin/live-chat")({
  component: LiveChatPage,
});

function LiveChatPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Live Chat Manager</h1>
        <p className="text-sm text-muted-foreground">
          Support Center · Real-time conversations with students
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <LiveChatManager />
    </Suspense>
    </div>
  );
}
