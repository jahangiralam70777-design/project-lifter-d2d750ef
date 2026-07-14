import { createFileRoute } from "@tanstack/react-router";
import { StudentSubjects } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/subjects")({
  component: StudentSubjects,
});
