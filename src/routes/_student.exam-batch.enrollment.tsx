import { createFileRoute } from "@tanstack/react-router";
import { StudentEnrollment } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/enrollment")({
  component: StudentEnrollment,
});
