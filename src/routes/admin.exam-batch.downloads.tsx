import { createFileRoute } from "@tanstack/react-router";
import { AdminDownloads } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/downloads")({
  component: AdminDownloads,
});
