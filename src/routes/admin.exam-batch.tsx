import { createFileRoute } from "@tanstack/react-router";
import { ExamBatchLayout } from "@/components/exam-batch/layout";
import { adminExamBatchNav } from "@/components/exam-batch/nav-config";

export const Route = createFileRoute("/admin/exam-batch")({
  component: () => <ExamBatchLayout nav={adminExamBatchNav} />,
  head: () => ({
    meta: [
      { title: "Exam Batch Manager · CA Aspire BD Admin" },
      { name: "description", content: "Manage exam batch sessions, enrollments, students, exams, leaderboards and analytics." },
      { property: "og:title", content: "Exam Batch Manager · CA Aspire BD Admin" },
      { property: "og:description", content: "Premium admin console for exam batch operations." },
    ],
  }),
});
