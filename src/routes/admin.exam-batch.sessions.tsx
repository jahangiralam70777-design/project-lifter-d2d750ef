import { createFileRoute } from "@tanstack/react-router";
import { AdminSessions } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/sessions")({
  component: AdminSessions,
});
