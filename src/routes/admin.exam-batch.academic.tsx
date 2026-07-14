import { createFileRoute } from "@tanstack/react-router";
import { ExamBatchAcademicManager } from "@/components/exam-batch/admin-academic-manager";
import { PageHeader } from "@/components/exam-batch/kit";
import { FolderTree } from "lucide-react";

function AdminExamBatchAcademic() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Academic management"
        description="Manage the independent Exam Batch academic tree — Levels → Subjects → Chapters. Fully isolated from the site's original Academic Manager."
        icon={FolderTree}
      />
      <ExamBatchAcademicManager />
    </div>
  );
}

export const Route = createFileRoute("/admin/exam-batch/academic")({
  component: AdminExamBatchAcademic,
  head: () => ({
    meta: [
      { title: "Academic Management · Exam Batch" },
      {
        name: "description",
        content:
          "Create, edit and delete the independent Exam Batch academic tree of levels, subjects and chapters.",
      },
    ],
  }),
});

