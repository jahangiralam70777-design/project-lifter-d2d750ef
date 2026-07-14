import { createFileRoute } from "@tanstack/react-router";
import { StudentSessions } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/sessions")({
  component: StudentSessions,
});
