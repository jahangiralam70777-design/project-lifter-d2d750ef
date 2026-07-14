import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { z } from "zod";
import { ExamInterfaceSkeleton } from "@/components/exam-batch/exam-interface-skeleton";

const searchSchema = z.object({
  examId: z.string().uuid().optional(),
  attemptId: z.string().uuid().optional(),
});

// Lazy-load the heavy exam-interface module. The skeleton lives in a tiny
// standalone file so it can be shown instantly (as pendingComponent AND as
// the Suspense fallback) while this chunk downloads — no white flash.
const ExamInterface = lazy(() =>
  import("@/components/exam-batch/exam-interface").then((m) => ({ default: m.ExamInterface })),
);

function ExamInterfaceRoute() {
  return (
    <Suspense fallback={<ExamInterfaceSkeleton />}>
      <ExamInterface />
    </Suspense>
  );
}

export const Route = createFileRoute("/_student/exam-batch-take")({
  validateSearch: (search) => searchSchema.parse(search),
  component: ExamInterfaceRoute,
  // Render the exam skeleton for ANY pending state — route-chunk download,
  // navigation transition, refresh — so the user never sees a blank pane
  // between clicking "Start Exam" and the interface mounting.
  pendingComponent: ExamInterfaceSkeleton,
  pendingMs: 0,
  pendingMinMs: 0,
  head: () => ({
    meta: [
      { title: "Exam in Progress · CA Aspire BD" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content: "Take your Exam Batch exam with a distraction-free, secure interface.",
      },
    ],
  }),
});
