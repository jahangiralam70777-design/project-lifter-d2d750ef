import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const SiteEditorV2Flow = lazy(() =>
  import("@/components/admin/site-editor-v2/SiteEditorV2Flow").then((m) => ({ default: m.SiteEditorV2Flow })),
);

export const Route = createFileRoute("/admin/site-editor")({
  component: SiteEditorV2Page,
  head: () => ({
    meta: [
      { title: "Advanced Editor (Phase 2) · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Webflow-style draft editor with undo/redo, snapshot version history and diff viewer. Isolated from production Site Management.",
      },
    ],
  }),
});

function SiteEditorV2Page() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <SiteEditorV2Flow />
    </Suspense>;
}
