import { createFileRoute } from "@tanstack/react-router";
import { AdminSettings } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/settings")({
  component: AdminSettings,
});
