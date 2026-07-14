import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { McqPremiumShell } from "@/components/dashboard/mcq/McqPremiumShell";

const McqFlow = lazy(() =>
  import("@/components/dashboard/McqFlow").then((m) => ({ default: m.McqFlow })),
);

export const Route = createFileRoute("/_student/mcq-practice")({
  component: McqPage,
  head: () => ({
    meta: [
      { title: "MCQ Practice · CA Aspire BD" },
      { name: "description", content: "Level → Subject → Chapter MCQ practice with instant explanations and live analytics." },
    ],
  }),
});

function McqPage() {
  return (
    <McqPremiumShell>
      <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
        <McqFlow />
      </Suspense>
    </McqPremiumShell>
  );
}
