import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const NotificationManagerFlow = lazy(() =>
  import("@/components/admin/NotificationManagerFlow").then((m) => ({ default: m.NotificationManagerFlow })),
);

export const Route = createFileRoute("/admin/notifications")({
  component: AdminNotificationsPage,
  head: () => ({
    meta: [
      { title: "Notification Manager · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Create, schedule and manage announcements, alerts and system notifications across push, email and in-app channels.",
      },
      { property: "og:title", content: "Notification Manager · CA Aspire BD Admin" },
      {
        property: "og:description",
        content:
          "Premium glass admin UI for crafting notifications, scheduling broadcasts and tracking delivery analytics.",
      },
    ],
  }),
});

function AdminNotificationsPage() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <NotificationManagerFlow />
    </Suspense>;
}
