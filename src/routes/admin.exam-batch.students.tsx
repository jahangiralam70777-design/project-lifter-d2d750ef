import { createFileRoute } from "@tanstack/react-router";
import { AdminStudents } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/students")({
  component: AdminStudents,
});
