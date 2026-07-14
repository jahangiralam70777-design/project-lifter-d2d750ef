import { createFileRoute, useRouter } from "@tanstack/react-router";
import { SiteManagementFlow } from "@/components/admin/SiteManagementFlow";
import { Button } from "@/components/ui/button";

function SiteRouteError({ error, reset }: { error: Error; reset: () => void }) {
  // Self-healing fallback: never show a full-page crash for this admin
  // surface. Render a non-blocking warning + Retry that re-runs the route.
  const router = useRouter();
  console.warn("[admin/site] route error captured, rendering soft fallback", error);
  return (
    <div className="space-y-4 p-6">
      <div className="glass shadow-card-soft space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
        <p className="font-medium text-amber-700 dark:text-amber-300">
          Site Management hit a temporary issue. The page is still open — you can retry.
        </p>
        <p className="text-xs text-muted-foreground">
          {error?.message || "Unknown error."}
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              reset();
              router.invalidate();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/site")({
  component: SiteManagementFlow,
  errorComponent: SiteRouteError,
  head: () => ({
    meta: [
      { title: "Site Management · CA Aspire BD Admin" },
      {
        name: "description",
        content:
          "Manage CA Aspire BD website pages, homepage sections, theme settings, media, and publishing history.",
      },
    ],
  }),
});
