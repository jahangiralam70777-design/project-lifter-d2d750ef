import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";

const BlogManagerFlow = lazy(() =>
  import("@/components/admin/BlogManagerFlow").then((m) => ({ default: m.BlogManagerFlow })),
);

export const Route = createFileRoute("/admin/blog")({
  component: AdminBlogPage,
  head: () => ({
    meta: [
      { title: "Blog Manager · CA Aspire BD Admin" },
      { name: "description", content: "Create, edit and publish blog posts, manage categories and tags." },
    ],
  }),
});

function AdminBlogPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[60vh] w-full" />}>
      <BlogManagerFlow />
    </Suspense>
  );
}
