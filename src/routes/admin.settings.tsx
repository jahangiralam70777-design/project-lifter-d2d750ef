import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const AdminSettingsFlow = lazy(() =>
  import("@/components/admin/AdminSettingsFlow").then((m) => ({ default: m.AdminSettingsFlow })),
);

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettingsPage,
  head: () => ({
    meta: [
      { title: "Platform Settings · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Manage platform appearance, permissions, integrations, modules and system controls from a unified admin command center.",
      },
      { property: "og:title", content: "Platform Settings · CA Aspire BD Admin" },
      {
        property: "og:description",
        content:
          "General, appearance, security, modules, payments, email, storage and integrations — plus backups, system health and security activity.",
      },
    ],
  }),
});

function AdminSettingsPage() {
  return <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <AdminSettingsFlow />
    </Suspense>;
}
