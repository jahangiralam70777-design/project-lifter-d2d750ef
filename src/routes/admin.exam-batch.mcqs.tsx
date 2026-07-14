import { createFileRoute } from "@tanstack/react-router";
import { AdminExamBatchMcqs } from "@/components/exam-batch/admin-mcqs-page";

export const Route = createFileRoute("/admin/exam-batch/mcqs")({
  component: AdminExamBatchMcqs,
});