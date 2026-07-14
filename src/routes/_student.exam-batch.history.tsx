import { createFileRoute } from "@tanstack/react-router";
import { StudentHistory } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/history")({
  component: StudentHistory,
});
