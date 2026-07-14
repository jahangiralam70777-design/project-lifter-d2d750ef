import { createFileRoute } from "@tanstack/react-router";
import { AdminCountdown } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/countdown")({
  component: AdminCountdown,
});
