import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HiddenModuleGuard } from "@/components/dashboard/HiddenModuleGuard";

const QuestionBankFlow = lazy(() =>
  import("@/components/dashboard/QuestionBankFlow").then((m) => ({
    default: m.QuestionBankFlow,
  })),
);

export const Route = createFileRoute("/_student/qns-bank")({
  component: QnsBankPage,
  head: () => ({
    meta: [
      { title: "Smart Question Bank · CA Aspire BD" },
      {
        name: "description",
        content:
          "Chapter-wise important questions, PDFs, previous-year questions and model test papers — all in one premium viewer.",
      },
      { property: "og:title", content: "Smart Question Bank · CA Aspire BD" },
      {
        property: "og:description",
        content:
          "Premium glassmorphism resource viewer with PDF/text modes, highlights and AI recommendations.",
      },
    ],
  }),
});

function QnsBankPage() {
  return (
    <HiddenModuleGuard moduleKey="qns_bank">
      <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
        <QuestionBankFlow />
      </Suspense>
    </HiddenModuleGuard>
  );
}
