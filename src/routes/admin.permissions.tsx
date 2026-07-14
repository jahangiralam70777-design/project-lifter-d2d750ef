import { createFileRoute } from "@tanstack/react-router";
import { PermissionsMatrixFlow } from "@/components/admin/permissions/PermissionsMatrixFlow";
import { PageGuard } from "@/components/rbac/PageGuard";

export const Route = createFileRoute("/admin/permissions")({
  component: () => (
    <PageGuard pageKey="admin.permissions">
      <PermissionsMatrixFlow />
    </PageGuard>
  ),
  head: () => ({
    meta: [
      { title: "Roles & Permissions · CA Aspire BD Admin" },
      { name: "description", content: "Real-time RBAC matrix: manage roles, permissions, page access and audit history." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});