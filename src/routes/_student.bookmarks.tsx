import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const BookmarksFlow = lazy(() =>
  import("@/components/dashboard/BookmarksFlow").then((m) => ({ default: m.BookmarksFlow })),
);

export const Route = createFileRoute("/_student/bookmarks")({
  component: BookmarksPage,
  head: () => ({
    meta: [{ title: "Bookmarks · CA Aspire BD" }],
  }),
});

function BookmarksPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full rounded-3xl" />}>
      <BookmarksFlow />
    </Suspense>
  );
}
