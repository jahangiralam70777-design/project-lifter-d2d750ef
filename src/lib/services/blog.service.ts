/**
 * Blog service.
 *
 * Composes blog repository calls for public-facing routes. Hooks and
 * routes consume these — never `@/lib/blog.functions` directly — so the
 * underlying data source can change without touching the UI.
 */
import { Blog } from "@/lib/repositories";

export type BlogListItem = Awaited<ReturnType<typeof Blog.listPublishedPosts>>[number];
export type BlogTrendingItem = Awaited<ReturnType<typeof Blog.listTrendingPosts>>[number];
export type BlogRelatedItem = Awaited<ReturnType<typeof Blog.listRelatedPosts>>[number];
export type BlogPost = NonNullable<Awaited<ReturnType<typeof Blog.getPublishedPost>>>;
export type BlogCategory = Awaited<ReturnType<typeof Blog.listCategories>>[number];

export interface ListPostsArgs {
  limit?: number;
  categorySlug?: string;
}

export async function listPosts({ limit = 50, categorySlug }: ListPostsArgs = {}): Promise<BlogListItem[]> {
  return Blog.listPublishedPosts({ data: { limit, categorySlug: categorySlug || undefined } });
}

export async function listCategories(): Promise<BlogCategory[]> {
  return Blog.listCategories();
}

export async function listTrending(limit = 5): Promise<BlogTrendingItem[]> {
  return Blog.listTrendingPosts({ data: { limit } });
}

export async function getPost(slug: string): Promise<BlogPost | null> {
  return Blog.getPublishedPost({ data: { slug } });
}

export async function listRelated(postId: string, categoryId: string | null = null, limit = 4): Promise<BlogRelatedItem[]> {
  return Blog.listRelatedPosts({ data: { postId, categoryId, limit } });
}

export async function getAdjacent(publishedAt: string | null) {
  return Blog.getAdjacentPosts({ data: { publishedAt } });
}

export async function trackView(postId: string, referrer?: string, userAgent?: string) {
  return Blog.trackBlogView({ data: { postId, referrer, userAgent } });
}
