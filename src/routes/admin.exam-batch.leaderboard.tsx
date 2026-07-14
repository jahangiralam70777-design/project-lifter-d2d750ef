import { createFileRoute } from "@tanstack/react-router";
import { AdminLeaderboard } from "@/components/exam-batch/admin-pages";

export const Route = createFileRoute("/admin/exam-batch/leaderboard")({
  component: AdminLeaderboard,
});
