import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const DashContent = lazy(() =>
  import("@/components/dashboard/DashContent").then((m) => ({ default: m.DashContent })),
);

export const Route = createFileRoute("/_student/dashboard")({
  component: DashboardPage,
  head: () => ({
    meta: [
      { title: "Dashboard · CA Aspire BD" },
      {
        name: "description",
        content:
          "Your personalized learning dashboard — MCQs, quizzes, mock tests, analytics and more.",
      },
    ],
  }),
});

function DashboardPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <DashContent />
    </Suspense>
  );
}
