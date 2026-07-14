import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboard } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/")({
  component: AdminDashboard,
});
