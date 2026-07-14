import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/users")({
  component: () => <Outlet />,
  pendingComponent: AdminUsersPending,
  errorComponent: AdminUsersError,
  notFoundComponent: () => (
    <div className="p-10 text-center text-muted-foreground">User Management section not found.</div>
  ),
  head: () => ({
    meta: [
      { title: "User Management · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Manage students, admins, permissions, subscriptions and platform activity from the CA Aspire BD identity control center.",
      },
      { property: "og:title", content: "User Management · CA Aspire BD Admin" },
      {
        property: "og:description",
        content:
          "User table, profile drawer, role permissions, bulk import and engagement analytics for administrators.",
      },
    ],
  }),
});

function AdminUsersPending() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading User Management…
    </div>
  );
}

function AdminUsersError({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const message = error?.message ?? "User Management hit a temporary error.";
  // Resilience rule: never blank the page on auth / ban-check / permission
  // hiccups. Render a non-blocking warning with retry so the admin can keep
  // working; the underlying middleware already fails-open on RPC errors.
  return (
    <div className="space-y-3 p-4 lg:p-6">
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-sm font-semibold">User Management is running in degraded mode</div>
          <p className="text-xs text-amber-100/80">{message}</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-xl border-amber-400/50 bg-transparent text-amber-100 hover:bg-amber-500/20"
            onClick={async () => {
              reset();
              await router.invalidate();
            }}
          >
            Retry
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-xl text-amber-100 hover:bg-amber-500/20"
            onClick={() => router.navigate({ to: "/admin" })}
          >
            Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
