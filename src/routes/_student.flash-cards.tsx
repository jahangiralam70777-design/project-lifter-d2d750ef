import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HiddenModuleGuard } from "@/components/dashboard/HiddenModuleGuard";

const FlashCardsFlow = lazy(() =>
  import("@/components/dashboard/FlashCardsFlow").then((m) => ({ default: m.FlashCardsFlow })),
);

export const Route = createFileRoute("/_student/flash-cards")({
  component: FlashCardsPage,
  head: () => ({
    meta: [
      { title: "Smart Flash Cards · CA Aspire BD" },
      {
        name: "description",
        content:
          "Quick revision flash cards for faster learning. Flip cards, bookmark, and track mastery with AI-recommended topics.",
      },
      { property: "og:title", content: "Smart Flash Cards · CA Aspire BD" },
      {
        property: "og:description",
        content:
          "Interactive 3D flash cards with bookmarks, streaks and personalized AI revision picks.",
      },
    ],
  }),
});

function FlashCardsPage() {
  return (
    <HiddenModuleGuard moduleKey="flash_cards">
      <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
        <FlashCardsFlow />
      </Suspense>
    </HiddenModuleGuard>
  );
}
