import { createFileRoute } from "@tanstack/react-router";
import { StudentProgress } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/progress")({
  component: StudentProgress,
});
