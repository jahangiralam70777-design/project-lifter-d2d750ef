import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const AcademicStructureManager = lazy(() =>
  import("@/components/admin/AcademicStructureManager").then((m) => ({ default: m.AcademicStructureManager })),
);

export const Route = createFileRoute("/admin/academic-manager")({
  component: AcademicManagerPage,
  head: () => ({
    meta: [
      { title: "Academic Manager · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Centralized Level, Subject and Chapter management — the single source of truth for the CA Aspire BD academic hierarchy.",
      },
      { property: "og:title", content: "Academic Manager · CA Aspire BD Admin" },
      {
        property: "og:description",
        content:
          "Manage levels, subjects, chapters and connected content from one enterprise-grade hierarchy console.",
      },
    ],
  }),
});

function AcademicManagerPage() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <AcademicStructureManager />
    </Suspense>;
}
