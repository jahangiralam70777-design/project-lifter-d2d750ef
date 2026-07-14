import { createFileRoute } from "@tanstack/react-router";
import { StudentLeaderboard } from "@/components/exam-batch/student-pages";

export const Route = createFileRoute("/_student/exam-batch/leaderboard")({
  component: StudentLeaderboard,
});
