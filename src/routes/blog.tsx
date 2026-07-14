// @ts-nocheck
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useBlogList, useBlogCategories, useBlogTrending } from "@/hooks/queries/use-blog";
import { Navbar } from "@/components/landing/Navbar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/blog")({
  component: BlogIndex,
  head: () => ({
    meta: [
      { title: "Blog — CA Aspire BD" },
      {
        name: "description",
        content:
          "Articles, study guides, exam tips and announcements from the CA Aspire BD team.",
      },
      { property: "og:title", content: "Blog — CA Aspire BD" },
      {
        property: "og:description",
        content:
          "Articles, study guides, exam tips and announcements from the CA Aspire BD team.",
      },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/blog" }],
  }),
  errorComponent: ({ error }) => (
    <div className="p-10 text-center text-red-500">Failed to load blog: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-10">Blog not found</div>,
});

type SortMode = "latest" | "popular";

function BlogIndex() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const url = typeof window !== "undefined" ? new URL(window.location.href) : null;
  const activeCat = url?.searchParams.get("category") ?? "";
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("latest");

  const { data: posts, isLoading } = useBlogList(activeCat || undefined, 50);
  const { data: categories } = useBlogCategories();
  const { data: trending } = useBlogTrending(5);

  // Realtime sync — admin updates flow to public instantly
  useEffect(() => {
    const ch = supabase
      .channel("blog-public")
      .on("postgres_changes", { event: "*", schema: "public", table: "blog_posts" }, () => {
        qc.invalidateQueries({ queryKey: ["blog"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "blog_categories" }, () => {
        qc.invalidateQueries({ queryKey: ["blog", "categories"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const filtered = useMemo(() => {
    const list = posts ?? [];
    const q = search.trim().toLowerCase();
    const base = q
      ? list.filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            (p.excerpt ?? "").toLowerCase().includes(q) ||
            (p.category_name ?? "").toLowerCase().includes(q),
        )
      : list;
    return sort === "popular"
      ? [...base].sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
      : base;
  }, [posts, search, sort]);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <>
      <Navbar />
      <main className="relative pb-24 pt-28">
        {/* Ambient gradient backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,color-mix(in_oklab,var(--neon-purple)_22%,transparent),transparent_70%)]"
        />

        <div className="mx-auto w-[min(1200px,calc(100%-2rem))]">
          {/* Hero */}
          <header className="mb-10 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-xs uppercase tracking-wider text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--neon-purple)]" />
              CA Aspire Blog
            </span>
            <h1 className="mt-5 font-display text-5xl font-bold tracking-tight sm:text-6xl">
              Stories, study guides &{" "}
              <span className="text-gradient">exam strategy</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Insights from top CA mentors, product updates and step-by-step guides — refreshed
              every week.
            </p>

            {/* Search */}
            <div className="mx-auto mt-8 flex max-w-xl items-center gap-2 rounded-2xl border border-border/60 bg-background/60 p-1.5 backdrop-blur-xl shadow-[0_20px_60px_-30px_var(--neon-purple)]">
              <svg
                viewBox="0 0 24 24"
                className="ml-3 h-5 w-5 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m21 21-4.3-4.3" strokeLinecap="round" />
              </svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search articles, topics, tags…"
                className="flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="rounded-full px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </header>

          {/* Filters */}
          <div className="mb-10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => navigate({ to: "/blog" })}
                className={chip(!activeCat)}
              >
                All
              </button>
              {(categories ?? []).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() =>
                    navigate({ to: "/blog", search: { category: c.slug } as never })
                  }
                  className={chip(activeCat === c.slug)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/60 p-1 backdrop-blur">
              <button
                onClick={() => setSort("latest")}
                className={sortBtn(sort === "latest")}
              >
                Latest
              </button>
              <button
                onClick={() => setSort("popular")}
                className={sortBtn(sort === "popular")}
              >
                Most viewed
              </button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-72 animate-pulse rounded-2xl bg-muted/40" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-border/60 bg-card/40 p-16 text-center text-muted-foreground backdrop-blur">
              {search ? "No results match your search." : "No posts yet. Check back soon."}
            </div>
          ) : (
            <>
              {/* Featured hero card */}
              {featured && !search && (
                <Link
                  to="/blog/$slug"
                  params={{ slug: featured.slug }}
                  className="group mb-12 grid overflow-hidden rounded-3xl border border-border/60 bg-card/50 backdrop-blur transition hover:border-[var(--neon-purple)]/60 hover:shadow-[0_30px_80px_-40px_var(--neon-purple)] lg:grid-cols-2"
                >
                  <div className="relative aspect-[16/10] overflow-hidden lg:aspect-auto">
                    {featured.cover_image_url ? (
                      <img
                        src={featured.cover_image_url}
                        alt={featured.title}
                        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                        loading="eager"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-[var(--neon-purple)]/30 via-[var(--neon-blue)]/20 to-transparent" />
                    )}
                    <span className="absolute left-4 top-4 rounded-full bg-background/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--neon-purple)] backdrop-blur">
                      Featured
                    </span>
                  </div>
                  <div className="flex flex-col justify-center gap-4 p-8 lg:p-12">
                    {featured.category_name && (
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--neon-purple)]">
                        {featured.category_name}
                      </span>
                    )}
                    <h2 className="font-display text-3xl font-bold leading-tight group-hover:text-gradient sm:text-4xl">
                      {featured.title}
                    </h2>
                    {featured.excerpt && (
                      <p className="line-clamp-3 text-muted-foreground">{featured.excerpt}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{featured.reading_minutes} min read</span>
                      <span>•</span>
                      <span>{featured.view_count.toLocaleString()} views</span>
                      {featured.published_at && (
                        <>
                          <span>•</span>
                          <time dateTime={featured.published_at}>
                            {new Date(featured.published_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </time>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              )}

              {/* Layout: posts grid + trending sidebar */}
              <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
                <div className="grid gap-6 sm:grid-cols-2">
                  {(search ? filtered : rest).map((p) => (
                    <Link
                      key={p.id}
                      to="/blog/$slug"
                      params={{ slug: p.slug }}
                      className="group flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur transition hover:-translate-y-1 hover:border-[var(--neon-purple)]/60 hover:shadow-[0_20px_60px_-30px_var(--neon-purple)]"
                    >
                      <div className="relative aspect-video overflow-hidden">
                        {p.cover_image_url ? (
                          <img
                            src={p.cover_image_url}
                            alt={p.title}
                            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="h-full w-full bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-blue)]/20" />
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-3 p-5">
                        {p.category_name && (
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--neon-purple)]">
                            {p.category_name}
                          </span>
                        )}
                        <h3 className="line-clamp-2 text-lg font-bold leading-snug group-hover:text-gradient">
                          {p.title}
                        </h3>
                        {p.excerpt && (
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {p.excerpt}
                          </p>
                        )}
                        <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-muted-foreground">
                          <span>{p.reading_minutes} min</span>
                          <span>•</span>
                          <span>{p.view_count.toLocaleString()} views</span>
                          {p.published_at && (
                            <>
                              <span>•</span>
                              <time dateTime={p.published_at}>
                                {new Date(p.published_at).toLocaleDateString()}
                              </time>
                            </>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Sidebar */}
                <aside className="space-y-6">
                  <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur">
                    <h4 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wider">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--neon-purple)]" />
                      Trending
                    </h4>
                    <ol className="space-y-4">
                      {(trending ?? []).map((t, i) => (
                        <li key={t.id}>
                          <Link
                            to="/blog/$slug"
                            params={{ slug: t.slug }}
                            className="group flex gap-3"
                          >
                            <span className="font-display text-2xl font-bold text-muted-foreground/60 group-hover:text-[var(--neon-purple)]">
                              0{i + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-[var(--neon-purple)]">
                                {t.title}
                              </p>
                              <p className="mt-1 text-[11px] text-muted-foreground">
                                {t.view_count.toLocaleString()} views • {t.reading_minutes} min
                              </p>
                            </div>
                          </Link>
                        </li>
                      ))}
                      {!trending?.length && (
                        <p className="text-sm text-muted-foreground">No data yet.</p>
                      )}
                    </ol>
                  </div>

                  <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-[var(--neon-purple)]/15 to-[var(--neon-blue)]/10 p-6 backdrop-blur">
                    <h4 className="font-display text-lg font-bold">Stay in the loop</h4>
                    <p className="mt-2 text-sm text-muted-foreground">
                      New articles, study tips & exam updates — straight to your inbox.
                    </p>
                    <Link
                      to="/register"
                      className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
                    >
                      Join CA Aspire
                    </Link>
                  </div>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}

function chip(active: boolean) {
  return `rounded-full border px-4 py-1.5 text-sm transition backdrop-blur ${
    active
      ? "border-[var(--neon-purple)]/60 bg-[var(--neon-purple)]/10 text-foreground"
      : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
  }`;
}

function sortBtn(active: boolean) {
  return `rounded-full px-3.5 py-1.5 text-xs font-medium transition ${
    active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
  }`;
}