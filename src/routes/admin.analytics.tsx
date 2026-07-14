import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const AnalyticsReportsFlow = lazy(() =>
  import("@/components/admin/AnalyticsReportsFlow").then((m) => ({ default: m.AnalyticsReportsFlow })),
);

export const Route = createFileRoute("/admin/analytics")({
  component: AdminAnalyticsPage,
  head: () => ({
    meta: [
      { title: "Analytics & Reports · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Track student performance, engagement and platform growth with advanced analytics, AI insights and exportable reports.",
      },
      { property: "og:title", content: "Analytics & Reports · CA Aspire BD Admin" },
      {
        property: "og:description",
        content:
          "KPI grid, growth charts, subject performance donut, exam heatmaps, live performance feed and report generator.",
      },
    ],
  }),
});

function AdminAnalyticsPage() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <AnalyticsReportsFlow />
    </Suspense>;
}
