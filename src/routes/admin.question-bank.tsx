import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const QuestionBankManagerFlow = lazy(() =>
  import("@/components/admin/QuestionBankManagerFlow").then((m) => ({ default: m.QuestionBankManagerFlow })),
);

export const Route = createFileRoute("/admin/question-bank")({
  component: AdminQuestionBankPage,
  head: () => ({
    meta: [
      { title: "Question Bank Manager · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Manage important questions, previous year papers, PDFs and model test resources from the CA Aspire BD admin question bank center.",
      },
      { property: "og:title", content: "Question Bank Manager · CA Aspire BD Admin" },
      {
        property: "og:description",
        content:
          "Resource creator, bulk PDF/DOC import, analytics and publishing controls for the question bank library.",
      },
    ],
  }),
});

function AdminQuestionBankPage() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <QuestionBankManagerFlow />
    </Suspense>;
}
