import { createFileRoute } from "@tanstack/react-router";
import { StudentAvailable } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/available")({
  component: StudentAvailable,
});
