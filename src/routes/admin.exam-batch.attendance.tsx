import { createFileRoute } from "@tanstack/react-router";
import { AdminAttendanceBanManagement } from "@/components/exam-batch/admin-attendance-page";

export const Route = createFileRoute("/admin/exam-batch/attendance")({
  component: AdminAttendanceBanManagement,
  head: () => ({
    meta: [
      { title: "Attendance & Ban Management · Exam Batch" },
      {
        name: "description",
        content:
          "Automatically and manually banned students, ban history and auto-ban configuration for the Exam Batch module.",
      },
    ],
  }),
});
