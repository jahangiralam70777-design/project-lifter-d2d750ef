import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HiddenModuleGuard } from "@/components/dashboard/HiddenModuleGuard";

const MockTestFlow = lazy(() =>
  import("@/components/dashboard/MockTestFlow").then((m) => ({ default: m.MockTestFlow })),
);

export const Route = createFileRoute("/_student/mock-test")({
  component: MockTestPage,
  head: () => ({
    meta: [
      { title: "Mock Test Arena · CA Aspire BD" },
      { name: "description", content: "Attempt full-length mock exams created by admins. Compete on the global leaderboard with real-time analytics." },
      { property: "og:title", content: "Mock Test Arena · CA Aspire BD" },
      { property: "og:description", content: "Premium CBT mock test platform with leaderboards and detailed analytics." },
    ],
  }),
});

function MockTestPage() {
  return (
    <HiddenModuleGuard moduleKey="mock_test">
      <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
        <MockTestFlow />
      </Suspense>
    </HiddenModuleGuard>
  );
}
