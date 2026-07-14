// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { toast } from "sonner";
import {
  LayoutDashboard,
  FileText,
  FolderTree,
  Tag as TagIcon,
  Image as ImageIcon,
  Search,
  BarChart3,
  Settings as SettingsIcon,
  Plus,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Copy,
  Calendar,
  TrendingUp,
  Sparkles,
  ExternalLink,
  X,
  Save,
  Bold,
  Italic,
  Link2,
  Quote,
  List,
  Heading2,
  Code as CodeIcon,
  Image as ImgInline,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Globe,
  Upload,
  Share2,
  Mail,
  Star,
  Archive,
  Users,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Columns,
  Clock,
  Download,
  PlayCircle,
  History,
  Zap,
} from "lucide-react";
import {
  adminListPosts,
  adminGetPost,
  adminUpsertPost,
  adminDeletePost,
  adminUpsertCategory,
  adminDeleteCategory,
  adminListTags,
  adminUpsertTag,
  adminDeleteTag,
  listCategories,
  adminBlogOverview,
  adminBulkUpdateStatus,
  adminBulkDeletePosts,
  adminBulkAssignCategory,
  adminBulkAssignTags,
  adminDuplicatePost,
  adminBlogAnalytics,
  adminListBlogMedia,
  adminListAuthors,
  adminSeoAudit,
  adminPostPerformance,
  adminRunScheduledPublish,
  adminExportPosts,
} from "@/lib/blog.functions";
import { adminUploadBlogImage } from "@/lib/blog-upload.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useBlogRealtime } from "@/lib/blog/use-blog-realtime";
import { useMutationActionLogger } from "@/lib/blog/use-mutation-action-logger";
import { FunctionInspector } from "@/components/admin/blog/FunctionInspector";
import { confirmDialog } from "@/components/ui/confirm-imperative";

type Section =
  | "overview"
  | "posts"
  | "categories"
  | "tags"
  | "media"
  | "authors"
  | "seo"
  | "audit"
  | "analytics"
  | "settings";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

const NAV: { id: Section; label: string; icon: any; hint: string }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, hint: "Publishing snapshot" },
  { id: "posts", label: "Posts", icon: FileText, hint: "Create & manage" },
  { id: "categories", label: "Categories", icon: FolderTree, hint: "Taxonomy" },
  { id: "tags", label: "Tags", icon: TagIcon, hint: "Topics" },
  { id: "media", label: "Media Library", icon: ImageIcon, hint: "Images" },
  { id: "authors", label: "Authors", icon: Users, hint: "People & stats" },
  { id: "seo", label: "SEO Center", icon: Search, hint: "Discoverability" },
  { id: "audit", label: "SEO Audit", icon: ShieldCheck, hint: "Scan all posts" },
  { id: "analytics", label: "Analytics", icon: BarChart3, hint: "Traffic & growth" },
  { id: "settings", label: "Settings", icon: SettingsIcon, hint: "Defaults" },
];

export function BlogManagerFlow() {
  const [section, setSection] = useState<Section>("overview");
  useBlogRealtime();
  useMutationActionLogger();

  return (
    <div className="space-y-6">
      {import.meta.env.DEV && <FunctionInspector />}
      <header className="overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-background via-background to-muted/40 p-6 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Premium Control Center
            </div>
            <h1 className="mt-1 font-display text-3xl font-bold tracking-tight">Blog Manager</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              A complete publishing platform — write, schedule, optimize, and measure. Everything for
              your blog lives here.
            </p>
          </div>
          <a
            href="/blog"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            View public blog
          </a>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="lg:sticky lg:top-4 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto rounded-2xl border border-border/60 bg-background/40 p-2 backdrop-blur lg:flex-col lg:gap-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = section === n.id;
              return (
                <li key={n.id} className="shrink-0 lg:shrink">
                  <button
                    type="button"
                    onClick={() => setSection(n.id)}
                    className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                      active
                        ? "bg-gradient-to-r from-primary/15 to-primary/5 text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                        active
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/60 bg-background/60"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="hidden flex-col leading-tight lg:flex">
                      <span className="font-medium">{n.label}</span>
                      <span className="text-[10px] text-muted-foreground/80">{n.hint}</span>
                    </span>
                    <span className="lg:hidden">{n.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          {section === "overview" && <OverviewSection onJump={setSection} />}
          {section === "posts" && <PostsSection />}
          {section === "categories" && <CategoriesPanel />}
          {section === "tags" && <TagsPanel />}
          {section === "media" && <MediaLibrarySection />}
          {section === "authors" && <AuthorsSection />}
          {section === "seo" && <SeoCenterSection />}
          {section === "audit" && <SeoAuditSection />}
          {section === "analytics" && <AnalyticsSection />}
          {section === "settings" && <SettingsSection />}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Shared primitives -------------------- */

function GlassCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-border/60 bg-background/40 p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: any;
  tone?: "default" | "emerald" | "amber" | "violet" | "rose" | "sky";
}) {
  const tones: Record<string, string> = {
    default: "from-primary/15 to-primary/0 text-primary",
    emerald: "from-emerald-500/20 to-emerald-500/0 text-emerald-500",
    amber: "from-amber-500/20 to-amber-500/0 text-amber-500",
    violet: "from-violet-500/20 to-violet-500/0 text-violet-500",
    rose: "from-rose-500/20 to-rose-500/0 text-rose-500",
    sky: "from-sky-500/20 to-sky-500/0 text-sky-500",
  };
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-background/40 p-5 backdrop-blur transition hover:border-primary/40 hover:shadow-lg">
      <div className={`pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br opacity-60 blur-2xl ${tones[tone].split(" ").slice(0, 2).join(" ")}`} />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20";

/* -------------------- Overview -------------------- */

function OverviewSection({ onJump }: { onJump: (s: Section) => void }) {
  const fn = useServerFn(adminBlogOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-blog-overview"],
    queryFn: () => fn(),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <StatCard label="Total Posts" value={isLoading ? "—" : data?.total ?? 0} icon={FileText} />
        <StatCard
          label="Published"
          value={isLoading ? "—" : data?.published ?? 0}
          icon={Globe}
          tone="emerald"
        />
        <StatCard label="Drafts" value={isLoading ? "—" : data?.drafts ?? 0} icon={Edit3} tone="amber" />
        <StatCard
          label="Scheduled"
          value={isLoading ? "—" : data?.scheduled ?? 0}
          icon={Calendar}
          tone="violet"
        />
        <StatCard
          label="Featured"
          value={isLoading ? "—" : data?.featured ?? 0}
          icon={Star}
          tone="rose"
          hint="Top performers"
        />
        <StatCard
          label="Total Views"
          value={isLoading ? "—" : fmtNum(data?.totalViews ?? 0)}
          icon={Eye}
          tone="sky"
        />
        <StatCard
          label="Monthly Views"
          value={isLoading ? "—" : fmtNum(data?.monthlyViews ?? 0)}
          icon={TrendingUp}
          tone="emerald"
          hint="Last 30 days"
        />
        <StatCard
          label="Archived"
          value={isLoading ? "—" : data?.archived ?? 0}
          icon={Archive}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Top Performing Post
              </p>
              <h3 className="mt-1 font-display text-lg font-semibold">
                {data?.topPost?.title ?? "No views yet"}
              </h3>
            </div>
            {data?.topPost && (
              <a
                href={`/blog/${data.topPost.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-1.5 text-xs hover:bg-muted"
              >
                <ExternalLink className="h-3 w-3" /> Open
              </a>
            )}
          </div>
          {data?.topPost && (
            <div className="mt-4 flex items-baseline gap-2">
              <span className="font-display text-4xl font-bold text-primary">
                {fmtNum(data.topPost.views)}
              </span>
              <span className="text-xs text-muted-foreground">total views</span>
            </div>
          )}
        </GlassCard>

        <GlassCard>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Quick actions
          </p>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => onJump("posts")}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 text-sm transition hover:border-primary/40"
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" /> Write a new post
              </span>
              <span className="text-xs text-muted-foreground">⌘N</span>
            </button>
            <button
              type="button"
              onClick={() => onJump("categories")}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 text-sm transition hover:border-primary/40"
            >
              <span className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-violet-500" /> Manage categories
              </span>
            </button>
            <button
              type="button"
              onClick={() => onJump("analytics")}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-background/60 px-3 py-2.5 text-sm transition hover:border-primary/40"
            >
              <span className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-500" /> View analytics
              </span>
            </button>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

/* -------------------- Posts (with bulk + editor) -------------------- */

function PostsSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListPosts);
  const delFn = useServerFn(adminDeletePost);
  const catsFn = useServerFn(listCategories);
  const tagsFn = useServerFn(adminListTags);
  const dupFn = useServerFn(adminDuplicatePost);
  const bulkStatusFn = useServerFn(adminBulkUpdateStatus);
  const bulkDelFn = useServerFn(adminBulkDeletePosts);
  const bulkCatFn = useServerFn(adminBulkAssignCategory);
  const bulkTagFn = useServerFn(adminBulkAssignTags);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["admin-blog-posts"],
    queryFn: () => listFn(),
  });
  const { data: categories } = useQuery({
    queryKey: ["blog-categories"],
    queryFn: () => catsFn(),
  });
  const { data: tags } = useQuery({ queryKey: ["admin-blog-tags"], queryFn: () => tagsFn() });

  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [perfId, setPerfId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "published" | "archived">("all");
  const [bulkOpen, setBulkOpen] = useState(false);

  const runSchedFn = useServerFn(adminRunScheduledPublish);
  const exportFn = useServerFn(adminExportPosts);

  const catMap = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    const ql = q.toLowerCase().trim();
    return (posts ?? []).filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (ql && !p.title.toLowerCase().includes(ql) && !p.slug.toLowerCase().includes(ql))
        return false;
      return true;
    });
  }, [posts, q, statusFilter]);

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  }

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin-blog-posts"] });
    qc.invalidateQueries({ queryKey: ["admin-blog-overview"] });
    qc.invalidateQueries({ queryKey: ["admin-blog-analytics"] });
  }

  const deleteM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Post deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dupM = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Post duplicated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkRun = async (kind: "publish" | "unpublish" | "archive" | "delete") => {
    if (!selected.size) return;
    const ids = Array.from(selected);
    try {
      if (kind === "delete") {
        const ok = await confirmDialog({
          title: `Delete ${ids.length} post${ids.length === 1 ? "" : "s"}?`,
          description: "This cannot be undone.",
          variant: "destructive",
          confirmLabel: "Delete",
        });
        if (!ok) return;
        await bulkDelFn({ data: { ids } });
      } else {
        const status = kind === "publish" ? "published" : kind === "unpublish" ? "draft" : "archived";
        await bulkStatusFn({ data: { ids, status } });
      }
      toast.success(`Bulk ${kind} done`);
      setSelected(new Set());
      invalidate();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <GlassCard className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search posts by title or slug…"
            className={inputClass + " pl-9"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className={inputClass + " w-auto"}
        >
          <option value="all">All statuses</option>
          <option value="published">Published</option>
          <option value="draft">Drafts</option>
          <option value="archived">Archived</option>
        </select>
        <button
          type="button"
          onClick={async () => {
            try {
              const r = await runSchedFn();
              toast.success(r.count ? `Published ${r.count} scheduled post${r.count === 1 ? "" : "s"}` : "No scheduled posts due");
              invalidate();
            } catch (e: any) { toast.error(e.message); }
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-xs font-medium text-violet-500 hover:bg-violet-500/20"
          title="Publish any posts scheduled in the past"
        >
          <PlayCircle className="h-3.5 w-3.5" /> Run scheduled
        </button>
        <button
          type="button"
          onClick={async () => {
            try {
              const data = await exportFn({ data: {} });
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `blog-export-${new Date().toISOString().slice(0,10)}.json`;
              a.click(); URL.revokeObjectURL(url);
              toast.success(`Exported ${data.count} posts`);
            } catch (e: any) { toast.error(e.message); }
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-xs font-medium hover:bg-muted"
        >
          <Download className="h-3.5 w-3.5" /> Export
        </button>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:shadow-primary/40"
        >
          <Plus className="h-4 w-4" /> New Post
        </button>
      </GlassCard>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 backdrop-blur">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => bulkRun("publish")}
              className="rounded-lg border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-500 hover:bg-emerald-500/20"
            >
              Bulk Publish
            </button>
            <button
              type="button"
              onClick={() => bulkRun("unpublish")}
              className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/20"
            >
              Bulk Unpublish
            </button>
            <button
              type="button"
              onClick={() => bulkRun("archive")}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Bulk Archive
            </button>
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Assign category / tags…
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const data = await exportFn({ data: { ids: Array.from(selected) } });
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url; a.download = `blog-export-${data.count}.json`;
                  a.click(); URL.revokeObjectURL(url);
                  toast.success(`Exported ${data.count} posts`);
                } catch (e: any) { toast.error(e.message); }
              }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
            >
              Bulk Export
            </button>
            <button
              type="button"
              onClick={() => bulkRun("delete")}
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
            >
              Bulk Delete
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-background/40 backdrop-blur">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
              </th>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Views</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  Loading posts…
                </td>
              </tr>
            ) : !filtered.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No posts match your filters.
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const isScheduled =
                  p.status !== "published" &&
                  p.published_at &&
                  new Date(p.published_at).getTime() > Date.now();
                return (
                  <tr key={p.id} className="border-t border-border/40 transition hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={(e) => {
                          setSelected((s) => {
                            const next = new Set(s);
                            if (e.target.checked) next.add(p.id);
                            else next.delete(p.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{p.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">/{p.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={p.status as any} scheduled={!!isScheduled} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {p.category_id ? (catMap.get(p.category_id) ?? "—") : "—"}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {fmtNum(p.view_count ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <IconBtn label="Performance" onClick={() => setPerfId(p.id)}>
                          <BarChart3 className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn label="Preview" href={`/blog/${p.slug}`}>
                          <Eye className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn label="Edit" onClick={() => setEditing(p.id)}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn label="Duplicate" onClick={() => dupM.mutate(p.id)}>
                          <Copy className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn
                          label="Delete"
                          tone="danger"
                          onClick={() => {
                            void (async () => { if (await confirmDialog({ title: `Delete "${p.title}"?`, variant: "destructive", confirmLabel: "Delete" })) deleteM.mutate(p.id); })();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {perfId && <PostPerfDrawer postId={perfId} onClose={() => setPerfId(null)} />}

      {editing && (
        <PostEditorModal
          postId={editing}
          onClose={() => setEditing(null)}
          categories={categories ?? []}
          tags={tags ?? []}
          onSaved={() => invalidate()}
        />
      )}
      {bulkOpen && (
        <BulkAssignModal
          ids={Array.from(selected)}
          categories={categories ?? []}
          tags={tags ?? []}
          onClose={() => setBulkOpen(false)}
          onDone={() => {
            setBulkOpen(false);
            setSelected(new Set());
            invalidate();
          }}
          assignCategory={(category_id) =>
            bulkCatFn({ data: { ids: Array.from(selected), category_id } })
          }
          assignTags={(tag_ids, mode) =>
            bulkTagFn({ data: { ids: Array.from(selected), tag_ids, mode } })
          }
        />
      )}
    </div>
  );
}

function StatusPill({
  status,
  scheduled,
}: {
  status: "draft" | "published" | "archived";
  scheduled?: boolean;
}) {
  if (scheduled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-500">
        <Calendar className="h-3 w-3" /> Scheduled
      </span>
    );
  }
  const map: Record<string, string> = {
    published: "bg-emerald-500/15 text-emerald-500",
    draft: "bg-amber-500/15 text-amber-500",
    archived: "bg-zinc-500/15 text-zinc-500",
  };
  const Icon = status === "published" ? Eye : status === "archived" ? Archive : EyeOff;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status]}`}
    >
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function IconBtn({
  children,
  onClick,
  href,
  label,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  label: string;
  tone?: "default" | "danger";
}) {
  const cls = `rounded-lg border p-1.5 transition ${
    tone === "danger"
      ? "border-destructive/40 text-destructive hover:bg-destructive/10"
      : "border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;
  if (href)
    return (
      <a aria-label={label} title={label} href={href} target="_blank" rel="noreferrer" className={cls}>
        {children}
      </a>
    );
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/* -------------------- Post Editor (premium) -------------------- */

type EditorForm = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  cover_image_url: string;
  status: "draft" | "published" | "archived";
  category_id: string;
  reading_minutes: number;
  seo_title: string;
  seo_description: string;
  og_image_url: string;
  tag_ids: string[];
  published_at: string;
};

const EMPTY_FORM: EditorForm = {
  id: undefined,
  slug: "",
  title: "",
  excerpt: "",
  content: "",
  cover_image_url: "",
  status: "draft",
  category_id: "",
  reading_minutes: 3,
  seo_title: "",
  seo_description: "",
  og_image_url: "",
  tag_ids: [],
  published_at: "",
};

function PostEditorModal({
  postId,
  onClose,
  onSaved,
  categories,
  tags,
}: {
  postId: string | "new";
  onClose: () => void;
  onSaved: () => void;
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
}) {
  const getFn = useServerFn(adminGetPost);
  const upsertFn = useServerFn(adminUpsertPost);
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [tab, setTab] = useState<"write" | "preview" | "seo">("write");
  const [autoSavedAt, setAutoSavedAt] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [split, setSplit] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [revisions, setRevisions] = useState<{ at: string; title: string; content: string }[]>([]);
  const dirtyRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contentImgInputRef = useRef<HTMLInputElement | null>(null);
  const contentUploader = useBlogImageUpload();

  useEffect(() => {
    if (postId === "new") {
      setForm(EMPTY_FORM);
      return;
    }
    getFn({ data: { id: postId } }).then((p: any) => {
      if (!p) return;
      setForm({
        id: p.id,
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt ?? "",
        content: p.content ?? "",
        cover_image_url: p.cover_image_url ?? "",
        status: (p.status as any) ?? "draft",
        category_id: p.category_id ?? "",
        reading_minutes: p.reading_minutes ?? 3,
        seo_title: p.seo_title ?? "",
        seo_description: p.seo_description ?? "",
        og_image_url: p.og_image_url ?? "",
        tag_ids: p.tag_ids ?? [],
        published_at: p.published_at ?? "",
      });
    });
  }, [postId, getFn]);

  // word count / reading time
  const wordCount = useMemo(
    () => (form.content.replace(/<[^>]+>/g, " ").match(/\b\w+\b/g) ?? []).length,
    [form.content],
  );
  useEffect(() => {
    const mins = Math.max(1, Math.round(wordCount / 220));
    setForm((f) => (f.reading_minutes === mins ? f : { ...f, reading_minutes: mins }));
  }, [wordCount]);

  const saveM = useMutation({
    mutationFn: async (silent?: boolean) =>
      upsertFn({
        data: {
          id: form.id,
          slug: form.slug || slugify(form.title),
          title: form.title,
          excerpt: form.excerpt || null,
          content: form.content,
          cover_image_url: form.cover_image_url || null,
          status: form.status,
          category_id: form.category_id || null,
          reading_minutes: Number(form.reading_minutes) || 1,
          seo_title: form.seo_title || null,
          seo_description: form.seo_description || null,
          og_image_url: form.og_image_url || null,
          tag_ids: form.tag_ids,
          published_at: form.published_at ? new Date(form.published_at).toISOString() : null,
        },
      }).then((r) => ({ r, silent })),
    onSuccess: ({ r, silent }) => {
      dirtyRef.current = false;
      setAutoSavedAt(new Date().toLocaleTimeString());
      if (!silent) {
        toast.success("Post saved");
        onSaved();
        onClose();
      } else {
        if (!form.id && (r as any)?.id) setForm((f) => ({ ...f, id: (r as any).id }));
        onSaved();
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // autosave drafts every 25s when dirty (single interval, stable across form edits)
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);
  useEffect(() => {
    const t = setInterval(() => {
      if (dirtyRef.current && formRef.current.title.trim()) {
        saveM.mutate(true as any);
      }
    }, 25_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setF = <K extends keyof EditorForm>(k: K, v: EditorForm[K]) => {
    dirtyRef.current = true;
    setForm((f) => ({ ...f, [k]: v }));
  };

  // Local revisions: snapshot every 90s when dirty (single interval)
  const revisionKey = useMemo(() => `blog-revisions-${form.id ?? "new"}`, [form.id]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(revisionKey);
      if (raw) setRevisions(JSON.parse(raw));
    } catch {}
  }, [revisionKey]);
  const revisionKeyRef = useRef(revisionKey);
  useEffect(() => { revisionKeyRef.current = revisionKey; }, [revisionKey]);
  useEffect(() => {
    const t = setInterval(() => {
      if (!dirtyRef.current || !formRef.current.title.trim()) return;
      setRevisions((prev) => {
        const next = [
          { at: new Date().toISOString(), title: formRef.current.title, content: formRef.current.content },
          ...prev,
        ].slice(0, 20);
        try { localStorage.setItem(revisionKeyRef.current, JSON.stringify(next)); } catch {}
        return next;
      });
    }, 90_000);
    return () => clearInterval(t);
  }, []);


  // Readability: simple Flesch reading ease (clamped)
  const readability = useMemo(() => {
    const text = (form.content ?? "").replace(/[#>*_`\[\]()!-]/g, " ");
    const sentences = Math.max(1, (text.match(/[.!?]+/g) ?? []).length);
    const words = (text.match(/\b\w+\b/g) ?? []).length;
    if (!words) return { score: 0, grade: "—" };
    const syllables = (text.toLowerCase().match(/[aeiouy]+/g) ?? []).length || words;
    const fre = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);
    const score = Math.max(0, Math.min(100, Math.round(fre)));
    const grade = score >= 70 ? "Easy" : score >= 50 ? "Fair" : score >= 30 ? "Difficult" : "Very hard";
    return { score, grade };
  }, [form.content]);

  // SEO score
  const seoScore = useMemo(() => {
    let s = 0;
    const t = (form.seo_title || form.title).trim();
    if (t.length >= 30 && t.length <= 65) s += 25;
    else if (t.length > 0) s += 12;
    const d = (form.seo_description || form.excerpt).trim();
    if (d.length >= 70 && d.length <= 160) s += 25;
    else if (d.length > 0) s += 10;
    if (form.slug && /^[a-z0-9-]+$/.test(form.slug)) s += 15;
    if (form.cover_image_url || form.og_image_url) s += 15;
    if (wordCount >= 300) s += 20;
    else if (wordCount >= 120) s += 10;
    return Math.min(100, s);
  }, [form, wordCount]);

  // toolbar — insert markdown/html snippet at caret
  function wrap(before: string, after = before, placeholder = "") {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const sel = form.content.slice(start, end) || placeholder;
    const next = form.content.slice(0, start) + before + sel + after + form.content.slice(end);
    setF("content", next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  }

  async function uploadAndInsertImage(file: File | null | undefined) {
    if (!file) return;
    const url = await contentUploader.upload(file);
    if (url) {
      const alt = file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 80) || "image";
      wrap(`\n![${alt}](${url})\n`, "");
    }
  }


  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center overflow-y-auto bg-background/80 p-0 backdrop-blur-md sm:p-4">
      <div className={`my-0 flex w-full flex-col overflow-hidden rounded-none border border-border/60 bg-card shadow-2xl sm:my-4 sm:rounded-2xl ${fullscreen ? "max-w-none sm:my-0 sm:rounded-none" : "max-w-6xl"}`}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-lg font-bold">
              {form.id ? "Edit Post" : "New Post"}
            </h2>
            <div className="hidden text-xs text-muted-foreground sm:flex sm:items-center sm:gap-3">
              <span>{wordCount.toLocaleString()} words</span>
              <span>·</span>
              <span>{form.reading_minutes} min read</span>
              <span>·</span>
              <span title="Flesch Reading Ease">Readability {readability.score} ({readability.grade})</span>
              {autoSavedAt && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1 text-emerald-500"><CheckCircle2 className="h-3 w-3" /> Auto-saved {autoSavedAt}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden rounded-xl border border-border/60 bg-background/40 p-1 sm:flex">
              {(["write", "preview", "seo"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium capitalize transition ${
                    tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setSplit((s) => !s)} title="Toggle split preview" className={`hidden sm:inline-flex rounded-lg border border-border/60 p-2 hover:text-foreground ${split ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>
              <Columns className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setRevisionsOpen(true)} title="Revision history" className="hidden rounded-lg border border-border/60 p-2 text-muted-foreground hover:text-foreground sm:inline-flex">
              <History className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => setFullscreen((f) => !f)} title="Fullscreen" className="hidden rounded-lg border border-border/60 p-2 text-muted-foreground hover:text-foreground sm:inline-flex">
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid flex-1 gap-0 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col overflow-y-auto p-5">
            {tab === "write" && (
              <div className="space-y-4">
                <input
                  className="w-full bg-transparent font-display text-3xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/50"
                  placeholder="Post title…"
                  value={form.title}
                  onChange={(e) => {
                    const v = e.target.value;
                    setF("title", v);
                    if (!form.id || !form.slug) setF("slug", slugify(v));
                  }}
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>/blog/</span>
                  <input
                    className="flex-1 rounded border border-dashed border-border/60 bg-transparent px-2 py-1 font-mono text-xs outline-none focus:border-primary/60"
                    value={form.slug}
                    onChange={(e) => setF("slug", slugify(e.target.value))}
                    placeholder="auto-generated-from-title"
                  />
                  <button
                    type="button"
                    onClick={() => setF("slug", slugify(form.title))}
                    className="rounded border border-border/60 px-2 py-1 hover:bg-muted"
                  >
                    Regenerate
                  </button>
                </div>

                <textarea
                  className="w-full resize-none rounded-xl border border-border/60 bg-background/60 px-3 py-2 text-sm italic text-muted-foreground outline-none focus:border-primary/60"
                  placeholder="Short excerpt — shown in lists & previews"
                  rows={2}
                  value={form.excerpt}
                  onChange={(e) => setF("excerpt", e.target.value)}
                />

                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-background/40 p-1.5">
                  <TBtn onClick={() => wrap("## ", "", "Heading")} label="Heading">
                    <Heading2 className="h-3.5 w-3.5" />
                  </TBtn>
                  <TBtn onClick={() => wrap("**", "**", "bold")} label="Bold">
                    <Bold className="h-3.5 w-3.5" />
                  </TBtn>
                  <TBtn onClick={() => wrap("*", "*", "italic")} label="Italic">
                    <Italic className="h-3.5 w-3.5" />
                  </TBtn>
                  <TBtn onClick={() => wrap("> ", "", "quote")} label="Quote">
                    <Quote className="h-3.5 w-3.5" />
                  </TBtn>
                  <TBtn onClick={() => wrap("- ", "", "item")} label="List">
                    <List className="h-3.5 w-3.5" />
                  </TBtn>
                  <TBtn onClick={() => wrap("[", "](https://)", "link text")} label="Link">
                    <Link2 className="h-3.5 w-3.5" />
                  </TBtn>
                  <TBtn onClick={() => wrap("`", "`", "code")} label="Code">
                    <CodeIcon className="h-3.5 w-3.5" />
                  </TBtn>
                  <TBtn
                    onClick={() => contentImgInputRef.current?.click()}
                    label={contentUploader.uploading ? "Uploading…" : "Upload image"}
                  >
                    <Upload className="h-3.5 w-3.5" />
                  </TBtn>
                  <TBtn
                    onClick={() => {
                      const url = prompt("Image URL");
                      if (url) wrap(`![alt](${url})`, "");
                    }}
                    label="Image from URL"
                  >
                    <ImgInline className="h-3.5 w-3.5" />
                  </TBtn>
                  <TBtn
                    onClick={() => wrap("\n| Col 1 | Col 2 |\n|---|---|\n| a | b |\n", "", "")}
                    label="Table"
                  >
                    <span className="text-[10px] font-bold">TBL</span>
                  </TBtn>
                  <div className="ml-auto">
                    <button
                      type="button"
                      onClick={() => setSlashOpen((o) => !o)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                      title="Slash commands"
                    >
                      <Zap className="h-3 w-3" /> /
                    </button>
                  </div>
                </div>

                {slashOpen && (
                  <div className="rounded-xl border border-border/60 bg-background/80 p-2 backdrop-blur">
                    <p className="px-2 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">Insert</p>
                    {([
                      ["Heading", () => wrap("\n## ", "", "Heading")],
                      ["Subheading", () => wrap("\n### ", "", "Subheading")],
                      ["Quote", () => wrap("\n> ", "", "Quote")],
                      ["Bulleted list", () => wrap("\n- ", "", "Item")],
                      ["Numbered list", () => wrap("\n1. ", "", "Item")],
                      ["Upload image", () => contentImgInputRef.current?.click()],
                      ["Image from URL", () => { const u = prompt("Image URL"); if (u) wrap(`\n![alt](${u})\n`, ""); }],
                      ["Code block", () => wrap("\n```\n", "\n```\n", "code")],
                      ["Table", () => wrap("\n| Col 1 | Col 2 |\n|---|---|\n| a | b |\n", "", "")],
                      ["Divider", () => wrap("\n---\n", "", "")],
                    ] as const).map(([label, fn]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => { fn(); setSlashOpen(false); }}
                        className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        / {label}
                      </button>
                    ))}
                  </div>
                )}

                <input
                  ref={contentImgInputRef}
                  type="file"
                  accept={ACCEPTED_IMAGE_TYPES.join(",")}
                  className="hidden"
                  onChange={(e) => {
                    void uploadAndInsertImage(e.target.files?.[0]);
                    e.currentTarget.value = "";
                  }}
                />
                {contentUploader.uploading && (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-1.5 text-[11px] text-primary">
                    <Upload className="h-3 w-3 animate-pulse" />
                    Uploading image… {contentUploader.progress}%
                    <div className="ml-2 h-1 flex-1 overflow-hidden rounded-full bg-primary/20">
                      <div className="h-full bg-primary transition-all" style={{ width: `${contentUploader.progress}%` }} />
                    </div>
                  </div>
                )}
                <div className={split ? "grid gap-3 lg:grid-cols-2" : ""}>
                  <textarea
                    ref={textareaRef}
                    className="min-h-[420px] w-full rounded-xl border border-border/60 bg-background/60 px-4 py-3 font-mono text-sm leading-relaxed outline-none focus:border-primary/60"
                    placeholder="Write your post in Markdown or HTML…"
                    value={form.content}
                    onChange={(e) => setF("content", e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "/" && e.currentTarget.selectionStart === 0) setSlashOpen(true);
                      if (e.key === "Escape") setSlashOpen(false);
                    }}
                    onPaste={(e) => {
                      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
                        i.type.startsWith("image/"),
                      );
                      if (item) {
                        const file = item.getAsFile();
                        if (file) {
                          e.preventDefault();
                          void uploadAndInsertImage(file);
                        }
                      }
                    }}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes("Files")) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      const file = e.dataTransfer.files?.[0];
                      if (file && file.type.startsWith("image/")) {
                        e.preventDefault();
                        void uploadAndInsertImage(file);
                      }
                    }}
                  />
                  {split && (
                    <article className="prose prose-invert prose-sm max-w-none rounded-xl border border-border/60 bg-background/40 p-4">
                      <h1 className="font-display text-2xl font-bold">{form.title || "Untitled"}</h1>
                      {form.excerpt && <p className="text-muted-foreground">{form.excerpt}</p>}
                      <hr className="my-3 border-border/60" />
                      <div className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownish(form.content)) }} />
                    </article>
                  )}
                </div>
              </div>
            )}

            {tab === "preview" && (
              <article className="prose prose-invert prose-sm max-w-none">
                {form.cover_image_url && (
                  <img
                    src={form.cover_image_url}
                    alt=""
                    className="mb-6 max-h-72 w-full rounded-xl object-cover"
                  />
                )}
                <h1 className="font-display text-3xl font-bold">{form.title || "Untitled"}</h1>
                {form.excerpt && (
                  <p className="text-muted-foreground">{form.excerpt}</p>
                )}
                <hr className="my-4 border-border/60" />
                <div
                  className="whitespace-pre-wrap text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(markdownish(form.content)) }}
                />
              </article>
            )}

            {tab === "seo" && (
              <div className="space-y-4">
                <SeoScorePanel score={seoScore} form={form} wordCount={wordCount} />
                <Field label="SEO Title" hint="50–65 characters recommended">
                  <input
                    className={inputClass}
                    value={form.seo_title}
                    onChange={(e) => setF("seo_title", e.target.value)}
                    placeholder={form.title}
                  />
                </Field>
                <Field label="Meta Description" hint="120–160 characters recommended">
                  <textarea
                    className={inputClass + " min-h-[80px]"}
                    value={form.seo_description}
                    onChange={(e) => setF("seo_description", e.target.value)}
                    placeholder={form.excerpt}
                  />
                </Field>
                <Field label="Open Graph Image URL">
                  <input
                    className={inputClass}
                    value={form.og_image_url}
                    onChange={(e) => setF("og_image_url", e.target.value)}
                    placeholder={form.cover_image_url || "https://…"}
                  />
                </Field>
                <SerpPreview form={form} />
              </div>
            )}
          </div>

          {/* Right rail */}
          <aside className="flex flex-col gap-4 border-t border-border/60 bg-muted/20 p-5 lg:border-l lg:border-t-0">
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Publish
              </p>
              <div className="space-y-2">
                <select
                  value={form.status}
                  onChange={(e) => setF("status", e.target.value as any)}
                  className={inputClass}
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
                <Field label="Schedule (optional)">
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={
                      form.published_at
                        ? new Date(form.published_at).toISOString().slice(0, 16)
                        : ""
                    }
                    onChange={(e) =>
                      setF("published_at", e.target.value ? new Date(e.target.value).toISOString() : "")
                    }
                  />
                </Field>
              </div>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Featured Image
              </p>
              {form.cover_image_url ? (
                <div className="group relative overflow-hidden rounded-xl border border-border/60">
                  <img src={form.cover_image_url} alt="" className="h-32 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setF("cover_image_url", "")}
                    className="absolute right-2 top-2 rounded-lg bg-background/80 p-1.5 text-xs opacity-0 transition group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <DropZone onUrl={(u) => setF("cover_image_url", u)} />
              )}
              <input
                className={inputClass + " mt-2"}
                placeholder="Or paste image URL"
                value={form.cover_image_url}
                onChange={(e) => setF("cover_image_url", e.target.value)}
              />
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Category
              </p>
              <select
                value={form.category_id}
                onChange={(e) => setF("category_id", e.target.value)}
                className={inputClass}
              >
                <option value="">— None —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Tags
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => {
                  const on = form.tag_ids.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        setF(
                          "tag_ids",
                          on ? form.tag_ids.filter((x) => x !== t.id) : [...form.tag_ids, t.id],
                        )
                      }
                      className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                        on
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      #{t.name}
                    </button>
                  );
                })}
                {!tags.length && (
                  <span className="text-xs text-muted-foreground">No tags yet.</span>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>SEO Score</span>
                <span className="font-bold text-foreground">{seoScore}/100</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full transition-all ${
                    seoScore >= 75
                      ? "bg-emerald-500"
                      : seoScore >= 45
                        ? "bg-amber-500"
                        : "bg-rose-500"
                  }`}
                  style={{ width: `${seoScore}%` }}
                />
              </div>
            </div>
            <div className="mt-auto flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-border/60 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveM.isPending || !form.title.trim()}
                onClick={() => saveM.mutate(false as any)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-primary/80 px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {saveM.isPending ? "Saving…" : form.status === "published" ? "Publish" : "Save"}
              </button>
            </div>
          </aside>
        </div>
      </div>
      <Dialog open={revisionsOpen} onOpenChange={setRevisionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">Revision history</DialogTitle>
            <DialogDescription className="text-xs">
              Automatic local snapshots taken every 90s while editing. Up to 20 kept per post.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-[60vh] space-y-1.5 overflow-y-auto">
            {revisions.length === 0 && <li className="rounded-lg border border-dashed border-border/60 p-4 text-center text-sm text-muted-foreground">No revisions yet.</li>}
            {revisions.map((r, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.title || "Untitled"}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(r.at).toLocaleString()} · {(r.content?.length ?? 0).toLocaleString()} chars</div>
                </div>
                <button type="button" onClick={() => { void (async () => { if (await confirmDialog({ title: "Restore this revision?", description: "Current draft will be replaced.", confirmLabel: "Restore", variant: "destructive" })) { setF("content", r.content); setF("title", r.title); setRevisionsOpen(false); toast.success("Revision restored"); } })(); }} className="rounded-lg border border-border/60 px-2 py-1 text-xs hover:bg-muted">Restore</button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TBtn({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

// Shared upload helper — uploads to Supabase Storage via server fn, returns public URL.
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function useBlogImageUpload() {
  const upload = useServerFn(adminUploadBlogImage);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  async function run(file: File): Promise<string | null> {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type.toLowerCase())) {
      toast.error("Unsupported file", { description: "Use JPG, PNG, WEBP or GIF." });
      return null;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error("File too large", { description: "Maximum size is 8MB." });
      return null;
    }
    setUploading(true);
    setProgress(10);
    try {
      const base64 = await fileToBase64(file);
      setProgress(55);
      const res = await upload({
        data: { filename: file.name, contentType: file.type, base64 },
      });
      setProgress(100);
      toast.success("Image uploaded");
      return res.url;
    } catch (e: any) {
      toast.error("Upload failed", { description: e?.message ?? "Try again" });
      return null;
    } finally {
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 400);
    }
  }
  return { upload: run, uploading, progress };
}

function DropZone({ onUrl }: { onUrl: (url: string) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { upload, uploading, progress } = useBlogImageUpload();

  async function handleFile(file: File | undefined | null) {
    if (!file) return;
    const url = await upload(file);
    if (url) onUrl(url);
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        role="button"
        tabIndex={0}
        aria-busy={uploading}
        className={`flex h-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center text-xs transition ${
          dragOver
            ? "border-primary/60 bg-primary/10 text-primary"
            : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
        } ${uploading ? "pointer-events-none opacity-70" : ""}`}
      >
        <Upload className="h-5 w-5" />
        <div className="font-medium">
          {uploading ? "Uploading…" : "Click or drop image to upload"}
        </div>
        <div className="text-[10px] opacity-70">JPG · PNG · WEBP · GIF · up to 8MB</div>
        {uploading && (
          <div className="mt-1 h-1 w-2/3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}


// very light markdown → HTML for preview
function markdownish(src: string) {
  if (!src) return "";
  let html = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "</p><p>");
  return `<p>${html}</p>`;
}

function SerpPreview({ form }: { form: EditorForm }) {
  const title = form.seo_title || form.title || "Post title";
  const desc = form.seo_description || form.excerpt || "Your meta description will appear here.";
  const slug = form.slug || "post-slug";
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-4">
      <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Google preview
      </p>
      <div className="font-sans">
        <div className="text-xs text-emerald-500">yourdomain.com › blog › {slug}</div>
        <div className="text-base text-sky-500 hover:underline">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{desc}</div>
      </div>
    </div>
  );
}

function SeoScorePanel({
  score,
  form,
  wordCount,
}: {
  score: number;
  form: EditorForm;
  wordCount: number;
}) {
  const checks = [
    {
      ok: (form.seo_title || form.title).length >= 30 && (form.seo_title || form.title).length <= 65,
      label: "SEO title length (30–65 chars)",
    },
    {
      ok:
        (form.seo_description || form.excerpt).length >= 70 &&
        (form.seo_description || form.excerpt).length <= 160,
      label: "Meta description length (70–160 chars)",
    },
    { ok: /^[a-z0-9-]+$/.test(form.slug || ""), label: "Slug is URL-friendly" },
    { ok: !!(form.cover_image_url || form.og_image_url), label: "Featured / OG image" },
    { ok: wordCount >= 300, label: "Body content ≥ 300 words" },
  ];
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">SEO Health</h4>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
            score >= 75
              ? "bg-emerald-500/15 text-emerald-500"
              : score >= 45
                ? "bg-amber-500/15 text-amber-500"
                : "bg-rose-500/15 text-rose-500"
          }`}
        >
          {score}/100
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2">
            {c.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertCircle className="h-4 w-4 text-amber-500" />
            )}
            <span className={c.ok ? "text-foreground" : "text-muted-foreground"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------- Bulk modal -------------------- */

function BulkAssignModal({
  ids,
  categories,
  tags,
  onClose,
  onDone,
  assignCategory,
  assignTags,
}: {
  ids: string[];
  categories: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
  assignCategory: (id: string | null) => Promise<unknown>;
  assignTags: (ids: string[], mode: "add" | "replace") => Promise<unknown>;
}) {
  const [cat, setCat] = useState<string>("");
  const [pickedTags, setPickedTags] = useState<string[]>([]);
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-card p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Bulk assign</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Apply to <strong className="text-foreground">{ids.length}</strong> selected posts.
        </p>
        <div className="space-y-4">
          <Field label="Category">
            <select className={inputClass} value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">— keep current —</option>
              <option value="__none__">Set to: no category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/60 bg-background/60 p-2">
              {tags.map((t) => {
                const on = pickedTags.includes(t.id);
                return (
                  <button
                    type="button"
                    key={t.id}
                    onClick={() =>
                      setPickedTags((p) =>
                        on ? p.filter((x) => x !== t.id) : [...p, t.id],
                      )
                    }
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      on
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/60 text-muted-foreground"
                    }`}
                  >
                    #{t.name}
                  </button>
                );
              })}
              {!tags.length && <span className="text-xs text-muted-foreground">No tags.</span>}
            </div>
          </Field>
          <Field label="Tag mode">
            <div className="flex gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={mode === "add"}
                  onChange={() => setMode("add")}
                  className="accent-primary"
                />
                Add to existing
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={mode === "replace"}
                  onChange={() => setMode("replace")}
                  className="accent-primary"
                />
                Replace
              </label>
            </div>
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border/60 px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || (!cat && pickedTags.length === 0)}
            onClick={async () => {
              setBusy(true);
              try {
                if (cat) await assignCategory(cat === "__none__" ? null : cat);
                if (pickedTags.length || mode === "replace") await assignTags(pickedTags, mode);
                toast.success("Bulk update applied");
                onDone();
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-60"
          >
            {busy ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Categories / Tags (polished) -------------------- */

function CategoriesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listCategories);
  const upsertFn = useServerFn(adminUpsertCategory);
  const delFn = useServerFn(adminDeleteCategory);
  const { data: cats } = useQuery({ queryKey: ["blog-categories"], queryFn: () => listFn() });
  const [form, setForm] = useState({
    id: undefined as string | undefined,
    slug: "",
    name: "",
    description: "",
    sort_order: 0,
  });
  const saveM = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: form.id,
          slug: form.slug || slugify(form.name),
          name: form.name,
          description: form.description || null,
          sort_order: Number(form.sort_order) || 0,
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setForm({ id: undefined, slug: "", name: "", description: "", sort_order: 0 });
      qc.invalidateQueries({ queryKey: ["blog-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["blog-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_340px]">
      <GlassCard>
        <h3 className="mb-3 font-display text-lg font-bold">Categories</h3>
        <ul className="space-y-2">
          {(cats ?? []).map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-4 py-3 transition hover:border-primary/40"
            >
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">/{c.slug}</p>
              </div>
              <div className="flex gap-1.5">
                <IconBtn
                  label="Edit"
                  onClick={() =>
                    setForm({
                      id: c.id,
                      slug: c.slug,
                      name: c.name,
                      description: c.description ?? "",
                      sort_order: c.sort_order ?? 0,
                    })
                  }
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  label="Delete"
                  tone="danger"
                  onClick={() => { void (async () => { if (await confirmDialog({ title: `Delete "${c.name}"?`, variant: "destructive", confirmLabel: "Delete" })) delM.mutate(c.id); })(); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </li>
          ))}
          {!cats?.length && (
            <li className="rounded-xl border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
              No categories yet.
            </li>
          )}
        </ul>
      </GlassCard>
      <GlassCard>
        <h3 className="mb-3 font-display text-lg font-bold">
          {form.id ? "Edit category" : "New category"}
        </h3>
        <div className="space-y-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Slug">
            <input
              className={inputClass}
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
              placeholder={slugify(form.name)}
            />
          </Field>
          <Field label="Description">
            <textarea
              className={inputClass + " min-h-[80px]"}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </Field>
          <Field label="Sort order">
            <input
              className={inputClass}
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            {form.id && (
              <button
                type="button"
                onClick={() =>
                  setForm({ id: undefined, slug: "", name: "", description: "", sort_order: 0 })
                }
                className="rounded-xl border border-border/60 px-3 py-2 text-sm"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={!form.name.trim() || saveM.isPending}
              onClick={() => saveM.mutate()}
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              {form.id ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

function TagsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListTags);
  const upsertFn = useServerFn(adminUpsertTag);
  const delFn = useServerFn(adminDeleteTag);
  const { data: tags } = useQuery({ queryKey: ["admin-blog-tags"], queryFn: () => listFn() });
  const [form, setForm] = useState({
    id: undefined as string | undefined,
    slug: "",
    name: "",
  });
  const saveM = useMutation({
    mutationFn: () =>
      upsertFn({
        data: { id: form.id, slug: form.slug || slugify(form.name), name: form.name },
      }),
    onSuccess: () => {
      toast.success("Saved");
      setForm({ id: undefined, slug: "", name: "" });
      qc.invalidateQueries({ queryKey: ["admin-blog-tags"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["admin-blog-tags"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <GlassCard>
        <h3 className="mb-3 font-display text-lg font-bold">Tags</h3>
        <ul className="flex flex-wrap gap-2">
          {(tags ?? []).map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-sm transition hover:border-primary/40"
            >
              <span>#{t.name}</span>
              <button
                type="button"
                onClick={() => setForm({ id: t.id, slug: t.slug, name: t.name })}
                className="text-muted-foreground hover:text-foreground"
              >
                <Edit3 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => { void (async () => { if (await confirmDialog({ title: `Delete tag "${t.name}"?`, variant: "destructive", confirmLabel: "Delete" })) delM.mutate(t.id); })(); }}
                className="text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
          {!tags?.length && <p className="text-sm text-muted-foreground">No tags yet.</p>}
        </ul>
      </GlassCard>
      <GlassCard>
        <h3 className="mb-3 font-display text-lg font-bold">
          {form.id ? "Edit tag" : "New tag"}
        </h3>
        <div className="space-y-3">
          <Field label="Name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </Field>
          <Field label="Slug">
            <input
              className={inputClass}
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
              placeholder={slugify(form.name)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            {form.id && (
              <button
                type="button"
                onClick={() => setForm({ id: undefined, slug: "", name: "" })}
                className="rounded-xl border border-border/60 px-3 py-2 text-sm"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={!form.name.trim() || saveM.isPending}
              onClick={() => saveM.mutate()}
              className="rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-60"
            >
              {form.id ? "Save" : "Create"}
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}

/* -------------------- Media Library -------------------- */

function MediaLibrarySection() {
  const fn = useServerFn(adminListBlogMedia);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-blog-media"],
    queryFn: () => fn(),
  });
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => (data ?? []).filter((m) => m.url.toLowerCase().includes(q.toLowerCase())),
    [data, q],
  );
  return (
    <div className="space-y-4">
      <GlassCard className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={inputClass + " pl-9"}
            placeholder="Search images by URL…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-xl border border-border/60 px-3 py-2 text-xs hover:bg-muted"
        >
          Refresh
        </button>
        <div className="text-xs text-muted-foreground">
          Drop images into the post editor's featured image to add them here.
        </div>
      </GlassCard>
      {isLoading ? (
        <div className="rounded-2xl border border-border/60 p-10 text-center text-sm text-muted-foreground">
          Loading media…
        </div>
      ) : !filtered.length ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          No images attached to posts yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((m) => (
            <div
              key={m.url}
              className="group relative overflow-hidden rounded-2xl border border-border/60 bg-background/40"
            >
              <div className="aspect-[4/3] w-full overflow-hidden bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt=""
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              </div>
              <div className="p-3">
                <p className="truncate text-xs text-muted-foreground" title={m.url}>
                  {m.url.split("/").pop()}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Used in {m.usedIn}</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(m.url);
                      toast.success("URL copied");
                    }}
                    className="rounded border border-border/60 px-1.5 py-0.5 hover:bg-muted"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------- SEO Center -------------------- */

function SeoCenterSection() {
  const listFn = useServerFn(adminListPosts);
  const getFn = useServerFn(adminGetPost);
  const { data: posts } = useQuery({ queryKey: ["admin-blog-posts"], queryFn: () => listFn() });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: post } = useQuery({
    queryKey: ["admin-blog-seo", selectedId],
    queryFn: () => (selectedId ? getFn({ data: { id: selectedId } }) : Promise.resolve(null)),
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (!selectedId && posts?.length) setSelectedId(posts[0].id);
  }, [posts, selectedId]);

  const wordCount = post
    ? (((post as any).content ?? "").replace(/<[^>]+>/g, " ").match(/\b\w+\b/g) ?? []).length
    : 0;

  const form: EditorForm | null = post
    ? {
        id: (post as any).id,
        slug: (post as any).slug,
        title: (post as any).title,
        excerpt: (post as any).excerpt ?? "",
        content: (post as any).content ?? "",
        cover_image_url: (post as any).cover_image_url ?? "",
        status: (post as any).status as any,
        category_id: (post as any).category_id ?? "",
        reading_minutes: (post as any).reading_minutes ?? 1,
        seo_title: (post as any).seo_title ?? "",
        seo_description: (post as any).seo_description ?? "",
        og_image_url: (post as any).og_image_url ?? "",
        tag_ids: (post as any).tag_ids ?? [],
        published_at: (post as any).published_at ?? "",
      }
    : null;

  const score = form
    ? (() => {
        let s = 0;
        const t = (form.seo_title || form.title).trim();
        if (t.length >= 30 && t.length <= 65) s += 25;
        else if (t.length > 0) s += 12;
        const d = (form.seo_description || form.excerpt).trim();
        if (d.length >= 70 && d.length <= 160) s += 25;
        else if (d.length > 0) s += 10;
        if (form.slug && /^[a-z0-9-]+$/.test(form.slug)) s += 15;
        if (form.cover_image_url || form.og_image_url) s += 15;
        if (wordCount >= 300) s += 20;
        else if (wordCount >= 120) s += 10;
        return Math.min(100, s);
      })()
    : 0;

  const jsonLd = form
    ? {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: form.seo_title || form.title,
        description: form.seo_description || form.excerpt || undefined,
        image: form.og_image_url || form.cover_image_url || undefined,
        mainEntityOfPage: `/blog/${form.slug}`,
        datePublished: form.published_at || undefined,
      }
    : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <GlassCard>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Posts
        </h3>
        <ul className="space-y-1">
          {(posts ?? []).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
                  selectedId === p.id
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span className="truncate">{p.title}</span>
              </button>
            </li>
          ))}
          {!posts?.length && <p className="px-3 text-sm text-muted-foreground">No posts.</p>}
        </ul>
      </GlassCard>
      <div className="space-y-4">
        {!form ? (
          <GlassCard>
            <p className="text-sm text-muted-foreground">Select a post to inspect SEO.</p>
          </GlassCard>
        ) : (
          <>
            <SeoScorePanel score={score} form={form} wordCount={wordCount} />
            <div className="grid gap-4 md:grid-cols-2">
              <GlassCard>
                <h4 className="mb-3 font-semibold">Open Graph</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">og:title</span>
                    <span className="truncate text-right">{form.seo_title || form.title}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">og:description</span>
                    <span className="line-clamp-2 text-right">
                      {form.seo_description || form.excerpt || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">og:image</span>
                    <span className="truncate text-right">
                      {form.og_image_url || form.cover_image_url || "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-muted-foreground">canonical</span>
                    <span className="truncate text-right">/blog/{form.slug}</span>
                  </div>
                </div>
              </GlassCard>
              <GlassCard>
                <h4 className="mb-3 font-semibold">Twitter Card</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">card</span><span>summary_large_image</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">title</span><span className="truncate text-right">{form.seo_title || form.title}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">description</span><span className="line-clamp-2 text-right">{form.seo_description || form.excerpt || "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">image</span><span className="truncate text-right">{form.og_image_url || form.cover_image_url || "—"}</span></div>
                </div>
              </GlassCard>
            </div>
            <GlassCard>
              <h4 className="mb-3 font-semibold">JSON-LD preview</h4>
              <pre className="overflow-x-auto rounded-xl bg-background/60 p-4 text-xs text-muted-foreground">
{JSON.stringify(jsonLd, null, 2)}
              </pre>
            </GlassCard>
            <SerpPreview form={form} />
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------- Analytics -------------------- */

function AnalyticsSection() {
  const fn = useServerFn(adminBlogAnalytics);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-blog-analytics"],
    queryFn: () => fn(),
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Views"
          value={isLoading ? "—" : fmtNum(data?.totalViews ?? 0)}
          icon={Eye}
          tone="sky"
        />
        <StatCard
          label="Monthly Views"
          value={isLoading ? "—" : fmtNum(data?.monthlyViews ?? 0)}
          icon={TrendingUp}
          tone="emerald"
        />
        <StatCard
          label="Monthly Growth"
          value={isLoading ? "—" : `${(data?.growthPct ?? 0) > 0 ? "+" : ""}${data?.growthPct ?? 0}%`}
          icon={TrendingUp}
          tone={(data?.growthPct ?? 0) >= 0 ? "emerald" : "rose"}
          hint="vs previous 30 days"
        />
        <StatCard
          label="Top Posts"
          value={isLoading ? "—" : data?.topPosts.length ?? 0}
          icon={Star}
          tone="amber"
        />
      </div>

      <GlassCard>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Reading trends (30 days)</h3>
          <span className="text-xs text-muted-foreground">Daily views</span>
        </div>
        <SparkChart data={data?.daily ?? []} />
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <h3 className="mb-3 font-display text-lg font-bold">Most viewed</h3>
          <ul className="space-y-2">
            {(data?.topPosts ?? []).map((p, i) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="truncate text-xs text-muted-foreground">/blog/{p.slug}</p>
                </div>
                <span className="tabular-nums text-sm font-bold">{fmtNum(p.views)}</span>
              </li>
            ))}
            {!data?.topPosts.length && (
              <p className="text-sm text-muted-foreground">No view data yet.</p>
            )}
          </ul>
        </GlassCard>
        <GlassCard>
          <h3 className="mb-3 font-display text-lg font-bold">Trending (7 days)</h3>
          <ul className="space-y-2">
            {(data?.trending ?? []).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="truncate text-xs text-muted-foreground">/blog/{p.slug}</p>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-500">
                  <TrendingUp className="h-3 w-3" />
                  {p.recent}
                </span>
              </li>
            ))}
            {!data?.trending.length && (
              <p className="text-sm text-muted-foreground">No trending posts.</p>
            )}
          </ul>
        </GlassCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <h3 className="mb-3 font-display text-lg font-bold">Category performance</h3>
          <ul className="space-y-2">
            {(data?.categoryPerformance ?? []).map((c) => {
              const max = Math.max(...(data?.categoryPerformance ?? []).map((x) => x.views), 1);
              const pct = Math.round((c.views / max) * 100);
              return (
                <li key={c.name} className="rounded-xl border border-border/60 bg-background/40 p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.posts} posts · {fmtNum(c.views)} views
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-gradient-to-r from-primary to-primary/60"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </GlassCard>
        <GlassCard>
          <h3 className="mb-3 font-display text-lg font-bold">Traffic sources</h3>
          <ul className="space-y-2">
            {(data?.topReferrers ?? []).map((r) => (
              <li
                key={r.source}
                className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 p-3 text-sm"
              >
                <span className="truncate">{r.source}</span>
                <span className="tabular-nums font-bold">{fmtNum(r.views)}</span>
              </li>
            ))}
            {!data?.topReferrers.length && (
              <p className="text-sm text-muted-foreground">No referrer data yet.</p>
            )}
          </ul>
        </GlassCard>
      </div>
    </div>
  );
}

function SparkChart({ data }: { data: { date: string; views: number }[] }) {
  const max = Math.max(...data.map((d) => d.views), 1);
  const w = 800;
  const h = 160;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((d, i) => `${i * step},${h - (d.views / max) * (h - 10) - 5}`).join(" ");
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-40 w-full">
        <defs>
          <linearGradient id="sparkArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.4" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g className="text-primary">
          <polyline points={`0,${h} ${pts} ${w},${h}`} fill="url(#sparkArea)" stroke="none" />
          <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
        </g>
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

/* -------------------- Settings (local prefs) -------------------- */

type BlogSettings = {
  homepageHeadline: string;
  homepageSubheadline: string;
  postsPerPage: number;
  featuredCount: number;
  newsletterEnabled: boolean;
  newsletterHeadline: string;
  newsletterCTA: string;
  relatedEnabled: boolean;
  relatedCount: number;
  defaultSeoTitleSuffix: string;
  defaultMetaDescription: string;
  shareTwitter: boolean;
  shareFacebook: boolean;
  shareLinkedin: boolean;
  shareCopy: boolean;
};

const DEFAULT_SETTINGS: BlogSettings = {
  homepageHeadline: "Insights from our team",
  homepageSubheadline: "Articles, guides, and product news.",
  postsPerPage: 12,
  featuredCount: 3,
  newsletterEnabled: true,
  newsletterHeadline: "Get new posts in your inbox",
  newsletterCTA: "Subscribe",
  relatedEnabled: true,
  relatedCount: 3,
  defaultSeoTitleSuffix: " · Blog",
  defaultMetaDescription: "",
  shareTwitter: true,
  shareFacebook: true,
  shareLinkedin: true,
  shareCopy: true,
};

const SETTINGS_KEY = "blog-manager-settings-v1";

function SettingsSection() {
  const [settings, setSettings] = useState<BlogSettings>(DEFAULT_SETTINGS);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
  }, []);

  const set = <K extends keyof BlogSettings>(k: K, v: BlogSettings[K]) => {
    setSettings((s) => ({ ...s, [k]: v }));
    setDirty(true);
  };

  function save() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    setDirty(false);
    toast.success("Settings saved");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <LayoutDashboard className="h-4 w-4 text-primary" /> Blog homepage
          </h3>
          <div className="space-y-3">
            <Field label="Headline">
              <input
                className={inputClass}
                value={settings.homepageHeadline}
                onChange={(e) => set("homepageHeadline", e.target.value)}
              />
            </Field>
            <Field label="Subheadline">
              <input
                className={inputClass}
                value={settings.homepageSubheadline}
                onChange={(e) => set("homepageSubheadline", e.target.value)}
              />
            </Field>
            <Field label="Posts per page">
              <input
                type="number"
                min={1}
                max={48}
                className={inputClass}
                value={settings.postsPerPage}
                onChange={(e) => set("postsPerPage", Number(e.target.value))}
              />
            </Field>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Star className="h-4 w-4 text-amber-500" /> Featured section
          </h3>
          <div className="space-y-3">
            <Field label="Featured posts count">
              <input
                type="number"
                min={0}
                max={12}
                className={inputClass}
                value={settings.featuredCount}
                onChange={(e) => set("featuredCount", Number(e.target.value))}
              />
            </Field>
            <p className="text-xs text-muted-foreground">
              The top {settings.featuredCount} most-viewed posts are highlighted on the blog homepage.
            </p>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Mail className="h-4 w-4 text-violet-500" /> Newsletter
          </h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.newsletterEnabled}
                onChange={(e) => set("newsletterEnabled", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Show newsletter signup on blog
            </label>
            <Field label="Headline">
              <input
                className={inputClass}
                value={settings.newsletterHeadline}
                onChange={(e) => set("newsletterHeadline", e.target.value)}
              />
            </Field>
            <Field label="Button label">
              <input
                className={inputClass}
                value={settings.newsletterCTA}
                onChange={(e) => set("newsletterCTA", e.target.value)}
              />
            </Field>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <FileText className="h-4 w-4 text-emerald-500" /> Related posts
          </h3>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={settings.relatedEnabled}
                onChange={(e) => set("relatedEnabled", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Show related posts under each article
            </label>
            <Field label="Related posts to show">
              <input
                type="number"
                min={0}
                max={6}
                className={inputClass}
                value={settings.relatedCount}
                onChange={(e) => set("relatedCount", Number(e.target.value))}
              />
            </Field>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Search className="h-4 w-4 text-sky-500" /> SEO defaults
          </h3>
          <div className="space-y-3">
            <Field label="Title suffix">
              <input
                className={inputClass}
                value={settings.defaultSeoTitleSuffix}
                onChange={(e) => set("defaultSeoTitleSuffix", e.target.value)}
              />
            </Field>
            <Field label="Default meta description">
              <textarea
                className={inputClass + " min-h-[72px]"}
                value={settings.defaultMetaDescription}
                onChange={(e) => set("defaultMetaDescription", e.target.value)}
              />
            </Field>
          </div>
        </GlassCard>
        <GlassCard>
          <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Share2 className="h-4 w-4 text-rose-500" /> Social sharing
          </h3>
          <div className="space-y-2 text-sm">
            {(
              [
                ["shareTwitter", "Twitter / X"],
                ["shareFacebook", "Facebook"],
                ["shareLinkedin", "LinkedIn"],
                ["shareCopy", "Copy link"],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings[k]}
                  onChange={(e) => set(k, e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                {label}
              </label>
            ))}
          </div>
        </GlassCard>
      </div>
      <div className="sticky bottom-2 flex justify-end">
        <button
          type="button"
          disabled={!dirty}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 disabled:opacity-60"
        >
          <Save className="h-4 w-4" /> Save settings
        </button>
      </div>
    </div>
  );
}

/* -------------------- Phase 2: Authors -------------------- */

function AuthorsSection() {
  const fn = useServerFn(adminListAuthors);
  const { data, isLoading } = useQuery({ queryKey: ["admin-blog-authors"], queryFn: () => fn() });
  return (
    <div className="space-y-4">
      <GlassCard>
        <h3 className="font-display text-lg font-bold">Authors</h3>
        <p className="text-xs text-muted-foreground">Per-author publishing stats. Pulled from blog post ownership.</p>
      </GlassCard>
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-border/60 bg-muted/30" />
          ))}
        </div>
      ) : !data?.length ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">
          No authors yet. Create a post to see contributors here.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((a) => (
            <div key={a.author_id} className="group rounded-2xl border border-border/60 bg-background/40 p-5 backdrop-blur transition hover:border-primary/40 hover:shadow-lg">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/40 to-primary/10 font-display text-lg font-bold text-primary">
                  {(a.name || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{a.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{a.email ?? `id ${a.author_id.slice(0, 8)}…`}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Stat label="Posts" value={a.posts} />
                <Stat label="Published" value={a.published} tone="emerald" />
                <Stat label="Drafts" value={a.drafts} tone="amber" />
              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs">
                <span className="text-muted-foreground inline-flex items-center gap-1"><Eye className="h-3 w-3" /> Total views</span>
                <span className="font-bold">{fmtNum(a.totalViews)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs">
                <span className="text-muted-foreground inline-flex items-center gap-1"><Clock className="h-3 w-3" /> Last published</span>
                <span className="text-muted-foreground">{a.lastPublishedAt ? new Date(a.lastPublishedAt).toLocaleDateString() : "—"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "emerald" | "amber" }) {
  const toneCls = tone === "emerald" ? "text-emerald-500" : tone === "amber" ? "text-amber-500" : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-2">
      <p className={`font-display text-xl font-bold tabular-nums ${toneCls}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

/* -------------------- Phase 2: SEO Audit -------------------- */

function SeoAuditSection() {
  const fn = useServerFn(adminSeoAudit);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-blog-audit"],
    queryFn: () => fn(),
  });
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "info">("all");
  const issues = (data?.issues ?? []).filter((i) => filter === "all" || i.severity === filter);
  const grouped = useMemo(() => {
    const m = new Map<string, typeof issues>();
    for (const i of issues) {
      const arr = m.get(i.postId) ?? [];
      arr.push(i);
      m.set(i.postId, arr);
    }
    return Array.from(m.entries());
  }, [issues]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Posts scanned" value={isLoading ? "—" : data?.totalPosts ?? 0} icon={FileText} />
        <StatCard label="Errors" value={isLoading ? "—" : data?.summary.error ?? 0} icon={AlertCircle} tone="rose" />
        <StatCard label="Warnings" value={isLoading ? "—" : data?.summary.warning ?? 0} icon={AlertTriangle} tone="amber" />
        <StatCard label="Info" value={isLoading ? "—" : data?.summary.info ?? 0} icon={Info} tone="sky" />
      </div>
      <GlassCard className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Filter</span>
        {(["all", "error", "warning", "info"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium capitalize transition ${
              filter === s ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-border/60 px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" /> {isFetching ? "Scanning…" : "Re-scan"}
        </button>
      </GlassCard>
      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl border border-border/60 bg-muted/30" />
          ))}
        </div>
      ) : !grouped.length ? (
        <div className="rounded-2xl border border-dashed border-border/60 p-12 text-center text-sm text-muted-foreground">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
          No issues for this filter. Nicely done.
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([postId, postIssues]) => (
            <GlassCard key={postId}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{postIssues[0].title}</p>
                  <p className="truncate text-xs text-muted-foreground">/blog/{postIssues[0].slug}</p>
                </div>
                <a href={`/blog/${postIssues[0].slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] hover:bg-muted">
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
              </div>
              <ul className="mt-3 space-y-1.5">
                {postIssues.map((i, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    {i.severity === "error" ? (
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                    ) : i.severity === "warning" ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                    )}
                    <div>
                      <span className="font-medium">{i.message}</span>
                      <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">{i.category}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------- Phase 2: Post Performance Drawer -------------------- */

function PostPerfDrawer({ postId, onClose }: { postId: string; onClose: () => void }) {
  const fn = useServerFn(adminPostPerformance);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-blog-perf", postId],
    queryFn: () => fn({ data: { id: postId } }),
  });
  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex w-full max-w-md flex-col overflow-y-auto p-5">
        <SheetHeader className="mb-4 text-left">
          <SheetDescription className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Performance
          </SheetDescription>
          <SheetTitle className="truncate font-display text-lg font-bold">
            {data?.title ?? "Loading…"}
          </SheetTitle>
        </SheetHeader>
        {isLoading || !data ? (
          <div className="space-y-3">
            <div className="h-20 animate-pulse rounded-xl bg-muted/30" />
            <div className="h-40 animate-pulse rounded-xl bg-muted/30" />
            <div className="h-20 animate-pulse rounded-xl bg-muted/30" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Total views" value={data.totalViews} />
              <Stat label="Last 30d" value={data.last30} tone="emerald" />
              <Stat label="Last 7d" value={data.last7} tone="emerald" />
              <Stat label="Growth" value={data.growthPct} tone={data.growthPct >= 0 ? "emerald" : "amber"} />
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">30-day trend</p>
              <SparkChart data={data.daily} />
            </div>
            <div className="rounded-xl border border-border/60 bg-background/40 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last viewed</span>
                <span>{data.lastViewAt ? new Date(data.lastViewAt).toLocaleString() : "—"}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Days since last view</span>
                <span className={data.daysSinceLastView != null && data.daysSinceLastView > 14 ? "text-amber-500" : ""}>
                  {data.daysSinceLastView ?? "—"}
                </span>
              </div>
              {data.daysSinceLastView != null && data.daysSinceLastView > 30 && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-500">
                  <AlertTriangle className="h-3 w-3" /> Content decay detected
                </div>
              )}
            </div>
            <a href={`/blog/${data.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/60 px-3 py-2 text-sm hover:bg-muted">
              <ExternalLink className="h-3.5 w-3.5" /> Open public page
            </a>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}