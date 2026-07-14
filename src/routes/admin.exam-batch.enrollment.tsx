import { createFileRoute } from "@tanstack/react-router";
import { AdminEnrollment } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/enrollment")({
  component: AdminEnrollment,
});
