import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useModuleVisibility, type ModuleKey } from "@/hooks/use-module-visibility";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Wraps a student page and redirects to /dashboard when the corresponding
 * module is hidden by an admin. While visibility loads, keep content hidden
 * so direct URL access never flashes a disabled feature.
 */
export function HiddenModuleGuard({
  moduleKey,
  children,
}: {
  moduleKey: ModuleKey;
  children: React.ReactNode;
}) {
  const { isHidden, isLoading } = useModuleVisibility();
  const navigate = useNavigate();
  const hidden = !isLoading && isHidden(moduleKey);

  useEffect(() => {
    if (hidden) navigate({ to: "/dashboard", replace: true });
  }, [hidden, navigate]);

  if (isLoading) {
    return <Skeleton className="h-[60vh] w-full rounded-3xl" />;
  }

  if (hidden) {
    return (
      <div className="glass shadow-card-soft mx-auto mt-10 max-w-md rounded-2xl p-6 text-center">
        <p className="font-display text-lg font-semibold">Feature Unavailable</p>
        <p className="mt-1 text-sm text-muted-foreground">
          This module has been disabled by your administrator.
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
