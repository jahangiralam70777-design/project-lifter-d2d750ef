import { createFileRoute } from "@tanstack/react-router";
import { AdminVerificationFullPreview } from "@/components/exam-batch/admin-verification-content";

export const Route = createFileRoute("/admin/exam-batch/verification-preview")({
  component: AdminVerificationFullPreview,
});
