import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HiddenModuleGuard } from "@/components/dashboard/HiddenModuleGuard";

const ShortNotesFlow = lazy(() =>
  import("@/components/dashboard/ShortNotesFlow").then((m) => ({ default: m.ShortNotesFlow })),
);

export const Route = createFileRoute("/_student/short-notes")({
  component: ShortNotesPage,
  head: () => ({
    meta: [
      { title: "Smart Short Notes · CA Aspire BD" },
      {
        name: "description",
        content:
          "Quick chapter-wise short notes for fast revision. Search, bookmark, zoom and download as PDF.",
      },
      { property: "og:title", content: "Smart Short Notes · CA Aspire BD" },
      {
        property: "og:description",
        content:
          "Premium glassmorphism reading experience with text/PDF modes, highlights and AI-recommended notes.",
      },
    ],
  }),
});

function ShortNotesPage() {
  return (
    <HiddenModuleGuard moduleKey="short_notes">
      <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
        <ShortNotesFlow />
      </Suspense>
    </HiddenModuleGuard>
  );
}
