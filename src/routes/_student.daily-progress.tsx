import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { studentDailyProgress } from "@/lib/student-daily-progress.functions";

const DailyProgressCenter = lazy(() =>
  import("@/components/dashboard/DailyProgressCenter").then((m) => ({
    default: m.DailyProgressCenter,
  })),
);

// Kick off the heavy aggregate fetch in parallel with the lazy component
// chunk download. By the time React mounts <DailyProgressCenter />, the
// useQuery({ queryKey: ["student-daily-progress"] }) call inside it hits a
// warm cache (matching key + staleTime: 15s) and renders without waiting
// for the round-trip. Without this, navigation -> chunk download ->
// component mount -> fetch is a serial waterfall on hard refresh.
export const Route = createFileRoute("/_student/daily-progress")({
  component: DailyProgressPage,
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery({
      queryKey: ["student-daily-progress"],
      queryFn: () => studentDailyProgress(),
      staleTime: 60_000,
    });
  },
  head: () => ({
    meta: [
      { title: "Daily Progress · CA Aspire BD" },
      {
        name: "description",
        content:
          "Track daily, weekly and monthly study progress across subjects and chapters with live analytics.",
      },
    ],
  }),
});

function DailyProgressPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <DailyProgressCenter />
    </Suspense>
  );
}
