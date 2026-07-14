import { createFileRoute } from "@tanstack/react-router";
import { StudentDashboard } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/dashboard")({
  component: StudentDashboard,
});
