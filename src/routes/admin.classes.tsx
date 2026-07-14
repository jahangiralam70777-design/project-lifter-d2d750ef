import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const VideoClassesManagerFlow = lazy(() =>
  import("@/components/admin/VideoClassesManagerFlow").then((m) => ({ default: m.VideoClassesManagerFlow })),
);

export const Route = createFileRoute("/admin/classes")({
  component: AdminClassesPage,
  head: () => ({
    meta: [
      { title: "Video Classes Manager · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Upload, organize and manage premium chapter-wise video lessons from the CA Aspire BD admin streaming studio.",
      },
      { property: "og:title", content: "Video Classes Manager · CA Aspire BD Admin" },
      {
        property: "og:description",
        content:
          "Class creator, playlist manager, cinematic player preview and streaming analytics for administrators.",
      },
    ],
  }),
});

function AdminClassesPage() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <VideoClassesManagerFlow />
    </Suspense>;
}
