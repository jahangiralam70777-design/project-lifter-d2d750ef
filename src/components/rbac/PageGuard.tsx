import { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { useMyAccess } from "@/hooks/use-my-access";
import { pageForKey } from "@/lib/rbac/page-registry";
import { Button } from "@/components/ui/button";

export function PageGuard({ pageKey, children }: { pageKey: string; children: ReactNode }) {
  const access = useMyAccess();
  if (access.loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span
          aria-hidden
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--neon-purple)]/30 border-t-[var(--neon-purple)]"
        />
      </div>
    );
  }
  // If the RBAC lookup itself failed, do not brick the admin route. The parent
  // /admin gate has already verified the user as an admin; page-level server
  // functions still enforce permissions for sensitive mutations.
  if (access.failed) {
    console.warn("[rbac] PageGuard running in degraded mode", { pageKey });
    return <>{children}</>;
  }
  if (access.isSuperAdmin || access.isAdmin || access.pages.has(pageKey)) {
    return <>{children}</>;
  }
  return <AccessDenied pageKey={pageKey} />;
}

export function AccessDenied({ pageKey }: { pageKey?: string }) {
  const page = pageKey ? pageForKey(pageKey) : undefined;
  return (
    <div className="glass shadow-card-soft mx-auto mt-12 flex max-w-xl flex-col items-center gap-4 rounded-3xl p-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
        <ShieldAlert className="h-7 w-7" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Access denied</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        You don't have permission to view{" "}
        <span className="font-medium text-foreground">{page?.label ?? "this page"}</span>. Contact a
        Super Admin if you believe this is a mistake.
      </p>
      <Button asChild variant="outline">
        <Link to="/admin">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
        </Link>
      </Button>
    </div>
  );
}