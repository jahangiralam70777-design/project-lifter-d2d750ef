import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const CustomExamFlow = lazy(() =>
  import("@/components/dashboard/CustomExamFlow").then((m) => ({ default: m.CustomExamFlow })),
);

export const Route = createFileRoute("/_student/custom-exam")({
  component: CustomExamPage,
  head: () => ({
    meta: [
      { title: "Custom Exam · CA Aspire BD" },
      {
        name: "description",
        content: "Build a custom exam: choose level, subject, chapters, MCQ count and duration.",
      },
    ],
  }),
});

function CustomExamPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <CustomExamFlow />
    </Suspense>
  );
}
