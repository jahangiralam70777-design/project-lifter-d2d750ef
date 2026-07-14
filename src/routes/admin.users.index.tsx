import { createFileRoute } from "@tanstack/react-router";
import { UserManagementFlow } from "@/components/admin/UserManagementFlow";
import { UserManagementSafeBoundary } from "@/components/admin/UserManagementSafeBoundary";

export const Route = createFileRoute("/admin/users/")({
  component: () => (
    <UserManagementSafeBoundary>
      <UserManagementFlow />
    </UserManagementSafeBoundary>
  ),
});
