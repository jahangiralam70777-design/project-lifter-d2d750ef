import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const QuizFlow = lazy(() =>
  import("@/components/dashboard/QuizFlow").then((m) => ({ default: m.QuizFlow })),
);

export const Route = createFileRoute("/_student/quiz")({
  component: QuizPage,
  head: () => ({
    meta: [
      { title: "Quiz · CA Aspire BD" },
      {
        name: "description",
        content: "Timer-based 10 MCQ quizzes with instant scoring, accuracy and review.",
      },
    ],
  }),
});

function QuizPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <QuizFlow />
    </Suspense>
  );
}
