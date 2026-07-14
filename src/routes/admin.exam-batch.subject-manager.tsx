import { createFileRoute } from "@tanstack/react-router";
import { AdminSubjectManager } from "@/components/exam-batch/admin-subject-manager";

export const Route = createFileRoute("/admin/exam-batch/subject-manager")({
  component: AdminSubjectManager,
});
