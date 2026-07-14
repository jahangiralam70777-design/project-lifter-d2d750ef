import { createFileRoute } from "@tanstack/react-router";
import { AdminAnalytics } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/analytics")({
  component: AdminAnalytics,
});
