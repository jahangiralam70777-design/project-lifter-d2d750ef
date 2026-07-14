import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const DatabaseManagerFlow = lazy(() =>
  import("@/components/admin/DatabaseManagerFlow").then((m) => ({ default: m.DatabaseManagerFlow })),
);

export const Route = createFileRoute("/admin/database")({
  component: DatabaseManagerPage,
  head: () => ({
    meta: [
      { title: "Database Manager · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Real-time database analytics, storage breakdown by table, daily growth trends and system health for CA Aspire BD admins.",
      },
    ],
  }),
});

function DatabaseManagerPage() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <DatabaseManagerFlow />
    </Suspense>;
}
