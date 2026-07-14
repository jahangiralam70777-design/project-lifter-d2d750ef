import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HiddenModuleGuard } from "@/components/dashboard/HiddenModuleGuard";

const VideoClassesFlow = lazy(() =>
  import("@/components/dashboard/VideoClassesFlow").then((m) => ({ default: m.VideoClassesFlow })),
);

export const Route = createFileRoute("/_student/classes")({
  component: ClassesPage,
  head: () => ({
    meta: [
      { title: "Smart Video Classes · CA Aspire BD" },
      {
        name: "description",
        content:
          "Learn chapter-wise through premium interactive video lessons with playlist, instructor cards and progress tracking.",
      },
      { property: "og:title", content: "Smart Video Classes · CA Aspire BD" },
      {
        property: "og:description",
        content:
          "Cinematic glass player, chapter playlist and AI-recommended classes for fast, focused learning.",
      },
    ],
  }),
});

function ClassesPage() {
  return (
    <HiddenModuleGuard moduleKey="classes">
      <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
        <VideoClassesFlow />
      </Suspense>
    </HiddenModuleGuard>
  );
}
