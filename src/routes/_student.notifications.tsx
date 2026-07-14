import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const NotificationsFlow = lazy(() =>
  import("@/components/dashboard/NotificationsFlow").then((m) => ({
    default: m.NotificationsFlow,
  })),
);

export const Route = createFileRoute("/_student/notifications")({
  component: NotificationsPage,
  head: () => ({
    meta: [
      { title: "Notifications Center · CA Aspire BD" },
      {
        name: "description",
        content:
          "Stay updated with exams, announcements, results and learning activities in your premium glass notifications center.",
      },
      { property: "og:title", content: "Notifications Center · CA Aspire BD" },
      {
        property: "og:description",
        content:
          "Glassmorphism notifications hub with filters, activity timeline, pinned alerts and quick actions.",
      },
    ],
  }),
});

function NotificationsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <NotificationsFlow />
    </Suspense>
  );
}
