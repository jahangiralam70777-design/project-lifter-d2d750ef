import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageGuard } from "@/components/rbac/PageGuard";

const RoutineManagerFlow = lazy(() =>
  import("@/components/admin/RoutineManagerFlow").then((m) => ({
    default: m.RoutineManagerFlow,
  })),
);

export const Route = createFileRoute("/admin/routine-manager")({
  // The `/admin` parent layout (ssr: false) blocks anonymous visitors and
  // verifies the caller is an admin/moderator via `verifyAdminAccess` before
  // this component is ever rendered. `PageGuard` adds a second, page-scoped
  // RBAC check so a granular role without the `admin.routine-manager` grant
  // cannot see the console — unauthorized users see <AccessDenied/> instead
  // of a client-side `useEffect` redirect that would flash admin chrome.
  component: RoutineManagerPage,
  head: () => ({
    meta: [
      { title: "Routine Manager · CA Aspire BD Admin" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Read-only monitoring of student Study Routines — usage, progress, activity and completion analytics.",
      },
      { property: "og:title", content: "Routine Manager · CA Aspire BD Admin" },
      {
        property: "og:description",
        content:
          "Monitor every student's Study Routine — daily, weekly and monthly progress with realtime insights.",
      },
    ],
  }),
});

function RoutineManagerPage() {
  return (
    <PageGuard pageKey="admin.routine-manager">
      <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
        <RoutineManagerFlow />
      </Suspense>
    </PageGuard>
  );
}
