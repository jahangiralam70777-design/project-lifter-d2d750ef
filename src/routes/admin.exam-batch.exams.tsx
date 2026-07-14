import { createFileRoute } from "@tanstack/react-router";
import { AdminExams } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/exams")({
  component: AdminExams,
});
