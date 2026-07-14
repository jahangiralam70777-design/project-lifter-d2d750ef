import { createFileRoute } from "@tanstack/react-router";
import { StudentPending } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/pending")({
  component: StudentPending,
});
