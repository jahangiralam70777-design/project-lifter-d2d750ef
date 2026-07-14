import { createFileRoute } from "@tanstack/react-router";
import { StudentHome } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/")({
  component: StudentHome,
});
