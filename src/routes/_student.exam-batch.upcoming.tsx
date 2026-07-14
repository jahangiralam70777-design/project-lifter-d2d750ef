import { createFileRoute } from "@tanstack/react-router";
import { StudentUpcoming } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/upcoming")({
  component: StudentUpcoming,
});
