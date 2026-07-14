import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const MockTestManagerFlow = lazy(() =>
  import("@/components/admin/MockTestManagerFlow").then((m) => ({ default: m.MockTestManagerFlow })),
);

export const Route = createFileRoute("/admin/mock-test")({
  component: AdminMockTestPage,
  head: () => ({
    meta: [
      { title: "Mock Test Manager · CA Aspire BD Admin" },
      { name: "description", content: "Create, schedule and manage full mock examinations from the premium CA Aspire BD admin control center." },
      { property: "og:title", content: "Mock Test Manager · CA Aspire BD Admin" },
      { property: "og:description", content: "Mock builder, scheduling, leaderboards and analytics for administrators." },
    ],
  }),
});

function AdminMockTestPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <MockTestManagerFlow />
    </Suspense>
  );
}
