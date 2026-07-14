import { createFileRoute } from "@tanstack/react-router";
import { AdminSubjectProgressManager } from "@/components/exam-batch/admin-subject-progress-manager";

export const Route = createFileRoute("/admin/exam-batch/subject-progress")({
  component: AdminSubjectProgressManager,
  head: () => ({
    meta: [
      { title: "Subject Progress Manager · Exam Batch Admin" },
      {
        name: "description",
        content:
          "Monitor chapter-level progress, performance and rankings across every student in the exam batch.",
      },
      { property: "og:title", content: "Subject Progress Manager · Exam Batch Admin" },
      {
        property: "og:description",
        content: "Chapter-level progress, rankings and analytics for the exam batch.",
      },
    ],
  }),
});