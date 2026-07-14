import { createFileRoute } from "@tanstack/react-router";
import { AdminVerificationContent } from "@/components/exam-batch/admin-verification-content";

export const Route = createFileRoute("/admin/exam-batch/verification-content")({
  component: AdminVerificationContent,
});
