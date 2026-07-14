// @ts-nocheck
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import DOMPurify from "isomorphic-dompurify";
import { sanitizeJsonLd } from "@/lib/sanitize-html";
import * as BlogService from "@/lib/services/blog.service";
import { useBlogRelated, useBlogAdjacent } from "@/hooks/queries/use-blog";
import { Navbar } from "@/components/landing/Navbar";
import { supabase } from "@/integrations/supabase/client";


export const Route = createFileRoute("/blog/$slug")({
  component: BlogPostPage,
  loader: async ({ params }) => {
    const post = await BlogService.getPost(params.slug);
    return { post };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.post;
    if (!p) {
      return { meta: [{ title: "Post not found — Blog" }] };
    }
    const title = p.seo_title || p.title;
    const desc = p.seo_description || p.excerpt || "Read this article on CA Aspire BD.";
    const og = p.og_image_url || p.cover_image_url || undefined;
    return {
      meta: [
        { title: `${title} — CA Aspire BD Blog` },
        { name: "description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        ...(og ? [{ property: "og:image", content: og }] : []),
        { name: "twitter:card", content: og ? "summary_large_image" : "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        ...(og ? [{ name: "twitter:image", content: og }] : []),
        ...(p.published_at
          ? [{ property: "article:published_time", content: p.published_at }]
          : []),
      ],
      links: [{ rel: "canonical", href: `/blog/${p.slug}` }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: title,
            description: desc,
            image: og ? [og] : undefined,
            datePublished: p.published_at ?? undefined,
            dateModified: p.updated_at ?? p.published_at ?? undefined,
            mainEntityOfPage: { "@type": "WebPage", "@id": `/blog/${p.slug}` },
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "/" },
              { "@type": "ListItem", position: 2, name: "Blog", item: "/blog" },
              { "@type": "ListItem", position: 3, name: title, item: `/blog/${p.slug}` },
            ],
          }),
        },
      ],
    };
  },
  errorComponent: ({ error }) => (
    <div className="p-10 text-center text-red-500">Failed to load post: {error.message}</div>
  ),
  notFoundComponent: () => (
    <div className="p-10 text-center text-muted-foreground">Post not found.</div>
  ),
});

function BlogPostPage() {
  const { post } = Route.useLoaderData();
  const qc = useQueryClient();
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  // SECURITY: sanitize HTML to strip <script>, inline handlers, javascript: URLs, etc.
  const sanitizedContent = useMemo(
    () =>
      DOMPurify.sanitize(post?.content ?? "", {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form"],
        FORBID_ATTR: ["style", "onerror", "onload", "onclick"],
      }),
    [post?.content],
  );


  // Track view
  useEffect(() => {
    if (!post?.id) return;
    BlogService.trackView(
      post.id,
      typeof document !== "undefined" ? document.referrer.slice(0, 500) : undefined,
      typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : undefined,
    ).catch(() => {});
  }, [post?.id]);

  // Reading progress
  useEffect(() => {
    const onScroll = () => {
      const h = document.documentElement;
      const total = h.scrollHeight - h.clientHeight;
      setProgress(total > 0 ? Math.min(100, (h.scrollTop / total) * 100) : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Realtime: if admin edits or deletes this post, refresh
  useEffect(() => {
    if (!post?.id) return;
    const ch = supabase
      .channel(`blog-post-${post.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "blog_posts", filter: `id=eq.${post.id}` },
        () => {
          qc.invalidateQueries();
          // Refresh route loader data
          if (typeof window !== "undefined") window.location.reload();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [post?.id, qc]);

  const { data: related } = useBlogRelated(post?.id, post?.category_id ?? null, 3);
  const { data: adjacent } = useBlogAdjacent(post?.published_at ?? null);

  if (!post) {
    return (
      <>
        <Navbar />
        <main className="mx-auto w-[min(800px,calc(100%-2rem))] px-2 pb-24 pt-32 text-center">
          <h1 className="text-3xl font-bold">Post not found</h1>
          <p className="mt-3 text-muted-foreground">
            That article may have been removed.{" "}
            <Link to="/blog" className="text-[var(--neon-purple)] hover:underline">
              Back to Blog
            </Link>
          </p>
        </main>
      </>
    );
  }

  const url =
    typeof window !== "undefined" ? window.location.href : `https://example.com/blog/${post.slug}`;
  const share = (network: "twitter" | "facebook" | "linkedin") => {
    const u = encodeURIComponent(url);
    const t = encodeURIComponent(post.title);
    const links: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    };
    window.open(links[network], "_blank", "noopener,noreferrer,width=600,height=600");
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const articleLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.cover_image_url ?? undefined,
    datePublished: post.published_at ?? undefined,
    dateModified: post.updated_at,
    mainEntityOfPage: { "@type": "WebPage", "@id": `/blog/${post.slug}` },
  };

  return (
    <>
      <Navbar />
      {/* Reading progress bar */}
      <div className="fixed inset-x-0 top-0 z-50 h-1 bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      <main className="relative pb-24 pt-24">
        {/* Hero */}
        <div className="relative">
          {post.cover_image_url && (
            <div className="absolute inset-x-0 top-0 h-[480px] overflow-hidden">
              <img
                src={post.cover_image_url}
                alt=""
                aria-hidden
                className="h-full w-full object-cover opacity-25 blur-2xl"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
            </div>
          )}
          <div className="relative mx-auto w-[min(820px,calc(100%-2rem))]">
            <Link
              to="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back to Blog
            </Link>
            {post.category_name && (
              <span className="mt-6 inline-block rounded-full bg-[var(--neon-purple)]/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--neon-purple)]">
                {post.category_name}
              </span>
            )}
            <h1 className="mt-4 font-display text-4xl font-bold leading-tight sm:text-5xl">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mt-5 text-lg text-muted-foreground">{post.excerpt}</p>
            )}
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>{post.reading_minutes} min read</span>
              {post.published_at && (
                <>
                  <span>•</span>
                  <time dateTime={post.published_at}>
                    {new Date(post.published_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </>
              )}
              <span>•</span>
              <span>{post.view_count.toLocaleString()} views</span>
            </div>

            {post.cover_image_url && (
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="mt-10 aspect-video w-full rounded-3xl object-cover shadow-[0_30px_80px_-40px_var(--neon-purple)]"
              />
            )}
          </div>
        </div>

        {/* Content + share rail */}
        <div className="mx-auto mt-12 grid w-[min(1100px,calc(100%-2rem))] gap-10 lg:grid-cols-[80px_1fr]">
          {/* Share rail */}
          <aside className="hidden lg:block">
            <div className="sticky top-28 flex flex-col items-center gap-2">
              <span className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Share
              </span>
              <ShareBtn label="Twitter" onClick={() => share("twitter")}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M18.244 2H21l-6.55 7.49L22 22h-6.84l-4.77-6.23L4.8 22H2l7.01-8.01L2 2h6.91l4.31 5.7L18.244 2Zm-2.4 18.4h1.86L7.27 3.5H5.3l10.544 16.9Z" />
                </svg>
              </ShareBtn>
              <ShareBtn label="LinkedIn" onClick={() => share("linkedin")}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.06 3.77-2.06 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.29-.02-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21h-4V9Z" />
                </svg>
              </ShareBtn>
              <ShareBtn label="Facebook" onClick={() => share("facebook")}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                  <path d="M13 22v-8h3l1-4h-4V7.5c0-1.16.39-2 2-2h2V2.2A28 28 0 0 0 14.2 2C11.4 2 9.5 3.66 9.5 6.7V10H6v4h3.5v8H13Z" />
                </svg>
              </ShareBtn>
              <ShareBtn label={copied ? "Copied!" : "Copy link"} onClick={copyLink}>
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                </svg>
              </ShareBtn>
            </div>
          </aside>

          <article>
            <div
              className="prose prose-lg max-w-none dark:prose-invert prose-headings:font-display prose-headings:tracking-tight prose-a:text-[var(--neon-purple)] prose-img:rounded-2xl"
              // SECURITY: sanitize admin-authored HTML before rendering (defense in depth on top of RLS).
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />


            {/* Mobile share */}
            <div className="mt-10 flex flex-wrap items-center gap-2 lg:hidden">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Share:
              </span>
              <button onClick={() => share("twitter")} className={mShare}>Twitter</button>
              <button onClick={() => share("linkedin")} className={mShare}>LinkedIn</button>
              <button onClick={() => share("facebook")} className={mShare}>Facebook</button>
              <button onClick={copyLink} className={mShare}>
                {copied ? "Copied!" : "Copy link"}
              </button>
            </div>

            {post.tags.length > 0 && (
              <div className="mt-10 flex flex-wrap gap-2">
                {post.tags.map((t) => (
                  <span
                    key={t.id}
                    className="rounded-full border border-border/60 bg-card/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
                  >
                    #{t.name}
                  </span>
                ))}
              </div>
            )}

            {/* Newsletter CTA */}
            <div className="mt-16 overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-[var(--neon-purple)]/15 via-background to-[var(--neon-blue)]/10 p-8 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-6">
                <div className="max-w-md">
                  <h3 className="font-display text-2xl font-bold">
                    Keep learning with CA Aspire BD
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Join thousands of students preparing smarter — daily MCQs, mock tests,
                    short notes and more.
                  </p>
                </div>
                <Link
                  to="/register"
                  className="rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:opacity-90"
                >
                  Create free account
                </Link>
              </div>
            </div>

            {/* Prev / Next */}
            {(adjacent?.prev || adjacent?.next) && (
              <div className="mt-12 grid gap-4 sm:grid-cols-2">
                {adjacent?.prev ? (
                  <Link
                    to="/blog/$slug"
                    params={{ slug: adjacent.prev.slug }}
                    className="group rounded-2xl border border-border/60 bg-card/40 p-5 backdrop-blur transition hover:border-[var(--neon-purple)]/60"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      ← Previous
                    </span>
                    <p className="mt-2 line-clamp-2 font-semibold group-hover:text-[var(--neon-purple)]">
                      {adjacent.prev.title}
                    </p>
                  </Link>
                ) : (
                  <div />
                )}
                {adjacent?.next && (
                  <Link
                    to="/blog/$slug"
                    params={{ slug: adjacent.next.slug }}
                    className="group rounded-2xl border border-border/60 bg-card/40 p-5 text-right backdrop-blur transition hover:border-[var(--neon-purple)]/60"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Next →
                    </span>
                    <p className="mt-2 line-clamp-2 font-semibold group-hover:text-[var(--neon-purple)]">
                      {adjacent.next.title}
                    </p>
                  </Link>
                )}
              </div>
            )}

            {/* Related */}
            {related && related.length > 0 && (
              <section className="mt-16">
                <h3 className="mb-6 font-display text-2xl font-bold">Related reads</h3>
                <div className="grid gap-5 sm:grid-cols-3">
                  {related.map((r: any) => (
                    <Link
                      key={r.id}
                      to="/blog/$slug"
                      params={{ slug: r.slug }}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/50 backdrop-blur transition hover:-translate-y-1 hover:border-[var(--neon-purple)]/60"
                    >
                      {r.cover_image_url ? (
                        <img
                          src={r.cover_image_url}
                          alt={r.title}
                          loading="lazy"
                          className="aspect-video w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="aspect-video w-full bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-blue)]/20" />
                      )}
                      <div className="flex flex-1 flex-col gap-2 p-4">
                        <p className="line-clamp-2 text-sm font-semibold group-hover:text-gradient">
                          {r.title}
                        </p>
                        <span className="mt-auto text-[11px] text-muted-foreground">
                          {r.reading_minutes} min • {(r.view_count ?? 0).toLocaleString()} views
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </article>
        </div>

        <script
          type="application/ld+json"
          // SECURITY: sanitizeJsonLd escapes </script and U+2028/2029 so
          // attacker-controlled fields (title/description) can't break out.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: sanitizeJsonLd(articleLd) }}
        />

      </main>
    </>
  );
}

const mShare =
  "rounded-full border border-border/60 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur hover:text-foreground";

function ShareBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-card/60 text-muted-foreground backdrop-blur transition hover:-translate-y-0.5 hover:border-[var(--neon-purple)]/60 hover:text-[var(--neon-purple)]"
    >
      {children}
    </button>
  );
}