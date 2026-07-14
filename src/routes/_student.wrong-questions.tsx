import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const WrongQuestionsFlow = lazy(() =>
  import("@/components/dashboard/WrongQuestionsFlow").then((m) => ({
    default: m.WrongQuestionsFlow,
  })),
);

export const Route = createFileRoute("/_student/wrong-questions")({
  component: WrongQuestionsPage,
  head: () => ({
    meta: [{ title: "Wrong Answers · CA Aspire BD" }],
  }),
});

function WrongQuestionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <WrongQuestionsFlow />
    </Suspense>
  );
}
