/**
 * Blog query hooks — TanStack Query bindings over the blog service layer.
 *
 * Routes/components import `blogQueries` (queryOptions factories) for use
 * with `ensureQueryData` in loaders or `useSuspenseQuery` in components,
 * and the convenience `useXyz` hooks for `useQuery`-style consumption.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import * as BlogService from "@/lib/services/blog.service";

export const blogQueries = {
  list: (categorySlug: string | undefined, limit = 50) =>
    queryOptions({
      queryKey: ["blog", "list", categorySlug ?? "", limit] as const,
      queryFn: () => BlogService.listPosts({ categorySlug, limit }),
    }),
  categories: () =>
    queryOptions({
      queryKey: ["blog", "categories"] as const,
      queryFn: () => BlogService.listCategories(),
    }),
  trending: (limit = 5) =>
    queryOptions({
      queryKey: ["blog", "trending", limit] as const,
      queryFn: () => BlogService.listTrending(limit),
    }),
  post: (slug: string) =>
    queryOptions({
      queryKey: ["blog", "post", slug] as const,
      queryFn: () => BlogService.getPost(slug),
    }),
  related: (postId: string | undefined, categoryId: string | null, limit = 4) =>
    queryOptions({
      queryKey: ["blog", "related", postId ?? "", categoryId ?? "", limit] as const,
      queryFn: () =>
        postId ? BlogService.listRelated(postId, categoryId, limit) : Promise.resolve([]),
      enabled: !!postId,
    }),
  adjacent: (publishedAt: string | null) =>
    queryOptions({
      queryKey: ["blog", "adjacent", publishedAt ?? ""] as const,
      queryFn: () => BlogService.getAdjacent(publishedAt),
    }),
};

export const useBlogList = (categorySlug?: string, limit = 50) =>
  useQuery(blogQueries.list(categorySlug, limit));
export const useBlogCategories = () => useQuery(blogQueries.categories());
export const useBlogTrending = (limit = 5) => useQuery(blogQueries.trending(limit));
export const useBlogPost = (slug: string) => useQuery(blogQueries.post(slug));
export const useBlogRelated = (postId: string | undefined, categoryId: string | null, limit = 4) =>
  useQuery(blogQueries.related(postId, categoryId, limit));
export const useBlogAdjacent = (publishedAt: string | null) =>
  useQuery(blogQueries.adjacent(publishedAt));
