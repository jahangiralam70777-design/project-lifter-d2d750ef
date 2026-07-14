import { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Upload,
  Trash2,
  RotateCcw,
  Globe,
  History,
  ImageIcon,
  Loader2,
  Copy,
  Layers,
  Palette,
  MenuSquare,
  Image as ImageIco,
  Monitor,
  Smartphone,
  Tablet,
  Sun,
  Moon,
  ExternalLink,
  RefreshCw,
  Save,
  Rocket,
  Sparkles,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ModulesTab } from "@/components/admin/site-management/ModulesTab";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListSections,
  adminListSettings,
  adminToggleSectionVisibility,
  adminReorderSections,
  adminListVersions,
  adminRestoreVersionToDraft,
  adminListMedia,
  adminCreateMediaUploadUrl,
  adminFinalizeMedia,
  adminUpdateMediaMeta,
  adminDeleteMedia,
} from "@/lib/site-management.functions";
import { SectionEditorByKey } from "./site-management/section-editors";
import { SettingEditorByKey } from "./site-management/setting-editors";
import { PagesPanel } from "./site-management/PagesPanel";
import type { SitePage } from "@/lib/site-pages.functions";

type Json = Record<string, unknown>;
const SECTIONS_KEY = ["admin-sections"] as const;
const SETTINGS_KEY = ["admin-settings"] as const;
const MEDIA_KEY = ["admin-media"] as const;

export function SiteManagementFlow() {
  return (
    <div className="space-y-4">
      <header className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-primary/15 via-background to-background p-5 shadow-card-soft sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cta-gradient text-white shadow-glow">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80">
                Visual Website Builder
              </p>
              <h1 className="font-display mt-0.5 text-2xl font-bold sm:text-3xl">
                Site Management
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Build pages, edit sections, manage media & theme — all visually. Live preview shows
                your real published site.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1 rounded-full border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live publishing
            </Badge>
            <Button asChild size="sm" variant="outline" className="gap-1.5 rounded-full">
              <a href="/" target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> Open site
              </a>
            </Button>
          </div>
        </div>
      </header>

      <Tabs defaultValue="sections" className="space-y-4">
        <TabsList className="glass flex w-full flex-wrap gap-1 rounded-2xl p-1">
          <TabsTrigger value="sections" className="flex-1 gap-1">
            <Layers className="h-3.5 w-3.5" />
            Pages & Sections
          </TabsTrigger>
          <TabsTrigger value="theme" className="flex-1 gap-1">
            <Palette className="h-3.5 w-3.5" />
            Theme
          </TabsTrigger>
          <TabsTrigger value="navigation" className="flex-1 gap-1">
            <MenuSquare className="h-3.5 w-3.5" />
            Nav & Footer
          </TabsTrigger>
          <TabsTrigger value="modules" className="flex-1 gap-1">
            <Eye className="h-3.5 w-3.5" />
            Modules
          </TabsTrigger>
          <TabsTrigger value="media" className="flex-1 gap-1">
            <ImageIco className="h-3.5 w-3.5" />
            Media
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-1">
            <History className="h-3.5 w-3.5" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sections">
          <SectionsTab />
        </TabsContent>
        <TabsContent value="theme">
          <ThemeTab />
        </TabsContent>
        <TabsContent value="navigation">
          <NavigationTab />
        </TabsContent>
        <TabsContent value="modules">
          <ModulesTab />
        </TabsContent>
        <TabsContent value="media">
          <MediaTab />
        </TabsContent>
        <TabsContent value="history">
          <HistoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================
// SECTIONS TAB
// ============================================================

type SectionRow = {
  id: string;
  section_key: string;
  position: number;
  visible: boolean;
  published_content: Json;
  draft_content: Json;
  updated_at: string;
  published_at: string | null;
};

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  stats: "Stats",
  features: "Features",
  testimonials: "Testimonials",
  faq: "FAQ",
  cta: "Call to action",
};

function SectionsTab() {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: SECTIONS_KEY,
    queryFn: () => adminListSections(),
    staleTime: 10_000,
  });

  const sections = (data?.sections ?? []) as SectionRow[];
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<SitePage | null>(null);
  const active = sections.find((s) => s.section_key === activeKey) ?? sections[0];

  useEffect(() => {
    if (!activeKey && sections[0]) setActiveKey(sections[0].section_key);
  }, [activeKey, sections]);

  const toggle = useMutation({
    mutationFn: (v: { sectionKey: string; visible: boolean }) =>
      adminToggleSectionVisibility({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SECTIONS_KEY }),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorder = useMutation({
    mutationFn: (order: { sectionKey: string; position: number }[]) =>
      adminReorderSections({ data: { order } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SECTIONS_KEY });
      toast.success("Order updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = (key: string, dir: -1 | 1) => {
    const idx = sections.findIndex((s) => s.section_key === key);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= sections.length) return;
    const next = [...sections];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    reorder.mutate(next.map((s, i) => ({ sectionKey: s.section_key, position: i })));
  };

  const isHomePage = !activePage || activePage.slug === "home" || activePage.is_home;
  const previewSlug = activePage?.slug ?? "";
  const previewPath = activePage?.is_home || !previewSlug ? "/" : `/${previewSlug}`;

  if (isLoading) return <LoadingPanel label="Loading sections…" />;
  if (isError) return <ErrorPanel error={error as Error} onRetry={refetch} />;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px,260px,minmax(0,1fr)]">
      {/* PAGES */}
      <PagesPanel activePageId={activePage?.id ?? null} onActivate={setActivePage} />

      {/* SECTIONS LIST */}
      <aside className="glass shadow-card-soft flex flex-col gap-2 rounded-2xl p-3">
        <div className="flex items-center justify-between px-1 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Sections
          </p>
          <Badge variant="outline" className="h-5 text-[10px]">
            {sections.length}
          </Badge>
        </div>
        {!isHomePage ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Section editor for custom pages coming soon. Use the Pages panel to edit SEO and status.
          </div>
        ) : (
          <ul className="space-y-1">
            {sections.map((s, i) => {
              const isActive = active?.section_key === s.section_key;
              const dirty = JSON.stringify(s.draft_content) !== JSON.stringify(s.published_content);
              const label = SECTION_LABELS[s.section_key] ?? s.section_key;
              return (
                <li
                  key={s.id}
                  className={`group flex items-center gap-1 rounded-xl px-2 py-1.5 text-sm transition ${
                    isActive ? "bg-cta-gradient text-white shadow-glow" : "hover:bg-muted/60"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                      isActive ? "bg-white/20 text-white" : "bg-primary/10 text-primary"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <button
                    className="flex-1 truncate text-left"
                    onClick={() => setActiveKey(s.section_key)}
                  >
                    <span className="truncate font-medium capitalize">{label}</span>
                    {dirty && (
                      <span
                        className={`ml-2 text-[10px] ${isActive ? "text-white/90" : "text-amber-500"}`}
                      >
                        • draft
                      </span>
                    )}
                    {!s.visible && (
                      <span
                        className={`ml-1 text-[10px] ${isActive ? "text-white/80" : "text-muted-foreground"}`}
                      >
                        (hidden)
                      </span>
                    )}
                  </button>
                  <div className="flex opacity-0 transition group-hover:opacity-100">
                    <button
                      className={`rounded p-1 ${isActive ? "hover:bg-white/20" : "hover:bg-background"} disabled:opacity-30`}
                      onClick={() => move(s.section_key, -1)}
                      disabled={i === 0 || reorder.isPending}
                      title="Move up"
                    >
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button
                      className={`rounded p-1 ${isActive ? "hover:bg-white/20" : "hover:bg-background"} disabled:opacity-30`}
                      onClick={() => move(s.section_key, 1)}
                      disabled={i === sections.length - 1 || reorder.isPending}
                      title="Move down"
                    >
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    className={`rounded p-1 ${isActive ? "hover:bg-white/20" : "hover:bg-background"}`}
                    onClick={() =>
                      toggle.mutate({
                        sectionKey: s.section_key,
                        visible: !s.visible,
                      })
                    }
                    disabled={toggle.isPending}
                    title={s.visible ? "Hide" : "Show"}
                  >
                    {s.visible ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-2 rounded-xl bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          Click a section to edit. Reorder with ↑ ↓ • Toggle visibility with the eye icon.
        </div>
      </aside>

      {/* EDITOR + LIVE PREVIEW */}
      <div className="space-y-4">
        {/* Editing-page banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-gradient-to-r from-primary/10 via-card to-card px-4 py-3 shadow-card-soft">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Editing page
            </p>
            <h2 className="font-display truncate text-lg font-bold">
              {activePage?.title ?? "Home"}
              {(activePage?.is_home || !activePage) && (
                <span className="ml-2 align-middle text-[10px] font-semibold uppercase tracking-wider text-primary">
                  homepage
                </span>
              )}
            </h2>
            <p className="truncate text-xs text-muted-foreground">{previewPath}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`gap-1 rounded-full text-[11px] capitalize ${
                (activePage?.status ?? "published") === "published"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                  : ""
              }`}
            >
              {activePage?.status ?? "published"}
            </Badge>
            <Button size="sm" variant="outline" className="gap-1.5 rounded-full" disabled>
              <Save className="h-3.5 w-3.5" /> Save Draft
            </Button>
            <Button size="sm" className="gap-1.5 rounded-full bg-cta-gradient shadow-glow" disabled>
              <Rocket className="h-3.5 w-3.5" /> Publish
            </Button>
          </div>
        </div>

        {isHomePage ? (
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <div className="space-y-3">
              {active && (
                <>
                  <SectionFloatingToolbar
                    section={active}
                    index={sections.findIndex((s) => s.section_key === active.section_key)}
                    total={sections.length}
                    onMove={(dir) => move(active.section_key, dir)}
                    onToggleVisible={() =>
                      toggle.mutate({
                        sectionKey: active.section_key,
                        visible: !active.visible,
                      })
                    }
                    busy={toggle.isPending || reorder.isPending}
                  />
                  <SectionEditorByKey section={active} />
                </>
              )}
            </div>
            <LivePreviewFrame path={previewPath} title={activePage?.title ?? "Home"} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr,1fr]">
            <div className="glass shadow-card-soft rounded-2xl p-8 text-center">
              <p className="font-display text-base font-semibold">
                Section editor for custom pages — coming next
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                You can already create, rename, duplicate, reorder and set this page's SEO. Adding
                sections to non-homepage pages ships in the next update.
              </p>
            </div>
            <LivePreviewFrame path={previewPath} title={activePage?.title ?? "Page"} />
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// FLOATING SECTION TOOLBAR — appears above the active section editor
// ============================================================
function SectionFloatingToolbar({
  section,
  index,
  total,
  onMove,
  onToggleVisible,
  busy,
}: {
  section: SectionRow;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
  onToggleVisible: () => void;
  busy: boolean;
}) {
  const label = SECTION_LABELS[section.section_key] ?? section.section_key;
  const dirty = JSON.stringify(section.draft_content) !== JSON.stringify(section.published_content);

  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card/95 px-3 py-2 shadow-card-soft backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-cta-gradient text-[10px] font-bold text-white shadow-glow">
          {index + 1}
        </span>
        <span className="font-display text-sm font-semibold capitalize">{label}</span>
        {dirty && (
          <Badge
            variant="outline"
            className="h-5 gap-1 rounded-full border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            unsaved draft
          </Badge>
        )}
        {!section.visible && (
          <Badge variant="outline" className="h-5 rounded-full text-[10px]">
            hidden
          </Badge>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 rounded-full p-0"
          onClick={() => onMove(-1)}
          disabled={index <= 0 || busy}
          title="Move up"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 rounded-full p-0"
          onClick={() => onMove(1)}
          disabled={index >= total - 1 || busy}
          title="Move down"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 rounded-full px-2 text-xs"
          onClick={onToggleVisible}
          disabled={busy}
          title={section.visible ? "Hide section" : "Show section"}
        >
          {section.visible ? (
            <>
              <Eye className="h-3.5 w-3.5" /> Visible
            </>
          ) : (
            <>
              <EyeOff className="h-3.5 w-3.5" /> Hidden
            </>
          )}
        </Button>
        <a
          href={`/#${section.section_key}`}
          target="_blank"
          rel="noreferrer"
          className="ml-1 flex h-7 items-center gap-1 rounded-full border border-border/60 bg-background/50 px-2 text-xs text-muted-foreground hover:text-foreground"
          title="Open this section on the live site"
        >
          <ExternalLink className="h-3 w-3" /> View live
        </a>
      </div>
    </div>
  );
}

// ============================================================
// LIVE PREVIEW — renders the REAL site in an iframe (no mock data)
// ============================================================
function LivePreviewFrame({ path, title }: { path: string; title: string }) {
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [nonce, setNonce] = useState(0);
  const [flash, setFlash] = useState(false);
  const qc = useQueryClient();

  // Instant refresh: bump nonce whenever any admin-content cache updates.
  useEffect(() => {
    const cache = qc.getQueryCache();
    const unsub = cache.subscribe((evt) => {
      if (evt.type !== "updated") return;
      const key = evt.query.queryKey?.[0];
      if (
        key === "admin-sections" ||
        key === "admin-settings" ||
        key === "site-content" ||
        key === "site-settings"
      ) {
        setNonce((n) => n + 1);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 600);
      }
    });
    return () => unsub();
  }, [qc]);

  // ⌘/  cycles device; Esc resets to desktop.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "/") {
        e.preventDefault();
        setDevice((d) => (d === "desktop" ? "tablet" : d === "tablet" ? "mobile" : "desktop"));
      } else if (e.key === "Escape") {
        setDevice("desktop");
      } else if (mod && e.key.toLowerCase() === "s") {
        // Drafts auto-save on field blur in the editor; just suppress the browser dialog.
        e.preventDefault();
        toast.info("Drafts save automatically when you click Save in the editor");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const src = `${path}${path.includes("?") ? "&" : "?"}site-preview=1&__preview=1&__theme=${theme}&__nonce=${nonce}`;

  const widths: Record<typeof device, string> = {
    desktop: "100%",
    tablet: "768px",
    mobile: "390px",
  };

  return (
    <div className="glass shadow-card-soft flex flex-col gap-3 rounded-2xl p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Live preview
          </p>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded-full border border-border/60 bg-background/50 p-0.5">
            {(["desktop", "tablet", "mobile"] as const).map((d) => {
              const Icon = d === "desktop" ? Monitor : d === "tablet" ? Tablet : Smartphone;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={`flex h-6 w-7 items-center justify-center rounded-full transition ${
                    device === d
                      ? "bg-cta-gradient text-white shadow-glow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={d}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
          <div className="flex rounded-full border border-border/60 bg-background/50 p-0.5">
            {(["light", "dark"] as const).map((t) => {
              const Icon = t === "light" ? Sun : Moon;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTheme(t)}
                  className={`flex h-6 w-7 items-center justify-center rounded-full transition ${
                    theme === t
                      ? "bg-cta-gradient text-white shadow-glow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  title={`${t} theme preview`}
                >
                  <Icon className="h-3 w-3" />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            className="flex h-6 w-7 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
            title="Refresh preview"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            className="flex h-6 w-7 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground hover:text-foreground"
            title="Open in new tab"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/30">
        <div className="flex items-center gap-2 border-b border-border/60 bg-background/60 px-3 py-1.5 text-[11px] text-muted-foreground">
          <Globe className="h-3 w-3" />
          <span className="truncate font-mono">{path}</span>
        </div>
        <div className="relative flex justify-center bg-muted/20 p-2">
          <iframe
            key={`${device}-${theme}-${nonce}`}
            title={`Preview: ${title}`}
            src={src}
            className="h-[640px] w-full rounded-lg border border-border/60 bg-background shadow-inner transition-all"
            style={{ maxWidth: widths[device] }}
          />
          <div
            className={`pointer-events-none absolute inset-2 rounded-lg ring-2 ring-primary/60 transition-opacity duration-500 ${
              flash ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      </div>
      <p className="px-1 text-[11px] text-muted-foreground">
        Preview reflects the real published site. Saving a draft refreshes it automatically. Press{" "}
        <kbd className="rounded border border-border/60 bg-muted px-1">⌘ /</kbd> to switch device.
      </p>
    </div>
  );
}

// ============================================================
// THEME / NAVIGATION tabs (settings-backed)
// ============================================================

type SettingRow = {
  key: string;
  published_value: Json;
  draft_value: Json;
  updated_at: string;
  published_at: string | null;
};

function useSettingsQuery() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => adminListSettings(),
    staleTime: 10_000,
  });
}

function ThemeTab() {
  const { data, isLoading, isError, error, refetch } = useSettingsQuery();
  if (isLoading) return <LoadingPanel label="Loading theme…" />;
  if (isError) return <ErrorPanel error={error as Error} onRetry={refetch} />;
  const row = (data?.settings as SettingRow[]).find((s) => s.key === "theme");
  if (!row) return <EmptySetting label="theme" />;
  return <SettingEditorByKey row={row} />;
}

function NavigationTab() {
  const { data, isLoading, isError, error, refetch } = useSettingsQuery();
  if (isLoading) return <LoadingPanel label="Loading navigation…" />;
  if (isError) return <ErrorPanel error={error as Error} onRetry={refetch} />;
  const rows = (data?.settings as SettingRow[]) ?? [];
  const navbar = rows.find((s) => s.key === "navbar");
  const footer = rows.find((s) => s.key === "footer");
  const contact = rows.find((s) => s.key === "contact");
  return (
    <div className="space-y-4">
      {navbar ? <SettingEditorByKey row={navbar} /> : <EmptySetting label="navbar" />}
      {footer ? <SettingEditorByKey row={footer} /> : <EmptySetting label="footer" />}
      {contact ? <SettingEditorByKey row={contact} /> : <EmptySetting label="contact" />}
    </div>
  );
}

function EmptySetting({ label }: { label: string }) {
  return (
    <div className="glass shadow-card-soft rounded-2xl p-6 text-sm text-muted-foreground">
      No <code>{label}</code> settings row exists. Ask an admin to seed it from the database.
    </div>
  );
}

// ============================================================
// MEDIA TAB (gallery)
// ============================================================

type MediaItem = {
  id: string;
  bucket: string;
  path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  alt_text: string | null;
  tags: string[];
  created_at: string;
  publicUrl: string;
};

function MediaTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...MEDIA_KEY, { search }],
    queryFn: () => adminListMedia({ data: { search: search || undefined, page: 1, pageSize: 60 } }),
    staleTime: 10_000,
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const finalize = useMutation({
    mutationFn: (input: Parameters<typeof adminFinalizeMedia>[0]["data"]) =>
      adminFinalizeMedia({ data: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MEDIA_KEY });
    },
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f.size > 20 * 1024 * 1024) {
          toast.error(`${f.name} exceeds 20MB`);
          continue;
        }
        let width: number | undefined;
        let height: number | undefined;
        if (f.type.startsWith("image/")) {
          try {
            const bmp = await createImageBitmap(f);
            width = bmp.width;
            height = bmp.height;
            bmp.close();
          } catch {
            /* ignore */
          }
        }
        const { path, token } = await adminCreateMediaUploadUrl({
          data: {
            fileName: f.name.replace(/[^a-zA-Z0-9._-]+/g, "-"),
            mimeType: f.type || "application/octet-stream",
            sizeBytes: f.size,
          },
        });
        const { error: upErr } = await supabase.storage
          .from("site-media")
          .uploadToSignedUrl(path, token, f, {
            contentType: f.type || undefined,
            upsert: false,
          });
        if (upErr) throw new Error(upErr.message);
        await finalize.mutateAsync({
          path,
          fileName: f.name,
          mimeType: f.type || "application/octet-stream",
          sizeBytes: f.size,
          width,
          height,
          tags: [],
        });
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }
      toast.success("Uploaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const items = (data?.items ?? []) as MediaItem[];

  return (
    <div className="space-y-3">
      <div className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <Input
          placeholder="Search filename…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          {uploading && (
            <span className="text-xs text-muted-foreground">Uploading… {progress}%</span>
          )}
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <Upload className="mr-1 h-3.5 w-3.5" /> Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="image/*,video/*,application/pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>

      {isLoading && <LoadingPanel label="Loading media…" />}
      {isError && <ErrorPanel error={error as Error} onRetry={refetch} />}

      {!isLoading && !isError && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
              No media yet. Upload your first file.
            </div>
          )}
          {items.map((m) => (
            <MediaCard key={m.id} item={m} />
          ))}
        </div>
      )}
    </div>
  );
}

function MediaCard({ item }: { item: MediaItem }) {
  const qc = useQueryClient();
  const [alt, setAlt] = useState(item.alt_text ?? "");
  const [tags, setTags] = useState((item.tags ?? []).join(", "));

  const save = useMutation({
    mutationFn: () =>
      adminUpdateMediaMeta({
        data: {
          id: item.id,
          altText: alt || undefined,
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 20),
        },
      }),
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: MEDIA_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => adminDeleteMedia({ data: { id: item.id } }),
    onSuccess: () => {
      toast.success("Deleted");
      qc.invalidateQueries({ queryKey: MEDIA_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isImage = item.mime_type.startsWith("image/");

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(item.publicUrl);
      toast.success("URL copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="glass shadow-card-soft flex flex-col gap-2 rounded-2xl p-2">
      <div className="aspect-square overflow-hidden rounded-xl bg-muted">
        {isImage ? (
          <img
            src={item.publicUrl}
            alt={alt || item.file_name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
            {item.mime_type}
          </div>
        )}
      </div>
      <p className="truncate text-[11px] font-medium" title={item.file_name}>
        {item.file_name}
      </p>
      <Input
        value={alt}
        onChange={(e) => setAlt(e.target.value)}
        placeholder="Alt text"
        className="h-7 text-xs"
      />
      <Input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="tags, comma, separated"
        className="h-7 text-xs"
      />
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 flex-1 text-xs"
          onClick={() => save.mutate()}
          disabled={save.isPending}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={copyUrl}
          title="Copy URL"
        >
          <Copy className="h-3 w-3" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="destructive" className="h-7 text-xs">
              <Trash2 className="h-3 w-3" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this file?</AlertDialogTitle>
              <AlertDialogDescription>
                Removes from storage and the media library. References in sections/theme will break
                if not updated.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => del.mutate()}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ============================================================
// HISTORY TAB
// ============================================================

function HistoryTab() {
  const sectionsQ = useQuery({ queryKey: SECTIONS_KEY, queryFn: () => adminListSections() });
  const settingsQ = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => adminListSettings() });

  const targets = useMemo(() => {
    const out: { kind: "section" | "setting"; key: string; label: string }[] = [];
    for (const s of (sectionsQ.data?.sections ?? []) as SectionRow[]) {
      out.push({
        kind: "section",
        key: s.section_key,
        label: SECTION_LABELS[s.section_key] ?? s.section_key,
      });
    }
    for (const s of (settingsQ.data?.settings ?? []) as SettingRow[]) {
      out.push({ kind: "setting", key: s.key, label: s.key });
    }
    return out;
  }, [sectionsQ.data, settingsQ.data]);

  const [selected, setSelected] = useState<{ kind: "section" | "setting"; key: string } | null>(
    null,
  );
  useEffect(() => {
    if (!selected && targets[0]) setSelected({ kind: targets[0].kind, key: targets[0].key });
  }, [selected, targets]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px,1fr]">
      <aside className="glass shadow-card-soft rounded-2xl p-3">
        <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Targets
        </p>
        <ul className="space-y-1">
          {targets.map((t) => {
            const active = selected?.kind === t.kind && selected.key === t.key;
            return (
              <li key={`${t.kind}:${t.key}`}>
                <button
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm capitalize ${
                    active ? "bg-cta-gradient text-white shadow-glow" : "hover:bg-muted"
                  }`}
                  onClick={() => setSelected({ kind: t.kind, key: t.key })}
                >
                  <span className="text-[10px] uppercase opacity-70">{t.kind}</span>
                  <div>{t.label}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
      <div>
        {selected ? <VersionList target={selected} /> : <LoadingPanel label="Pick a target…" />}
      </div>
    </div>
  );
}

function VersionList({ target }: { target: { kind: "section" | "setting"; key: string } }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["admin-versions", target.kind, target.key],
    queryFn: () =>
      adminListVersions({ data: { targetKind: target.kind, targetKey: target.key, limit: 50 } }),
    staleTime: 10_000,
  });

  const restore = useMutation({
    mutationFn: (versionId: string) => adminRestoreVersionToDraft({ data: { versionId } }),
    onSuccess: () => {
      toast.success("Restored to draft — review and publish to apply");
      qc.invalidateQueries({ queryKey: SECTIONS_KEY });
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <LoadingPanel label="Loading history…" />;
  if (isError) return <ErrorPanel error={error as Error} onRetry={refetch} />;

  const versions = (data?.versions ?? []) as Array<{
    id: string;
    created_at: string;
    label: string | null;
    snapshot: Json;
  }>;

  return (
    <div className="glass shadow-card-soft space-y-3 rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-display text-lg font-semibold capitalize">
          {target.key.replace(/_/g, " ")} versions
        </h3>
      </div>
      {versions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No published versions yet. Publish a change to create the first snapshot.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {versions.map((v, idx) => (
            <VersionCard
              key={v.id}
              version={v}
              isLatest={idx === 0}
              onRestore={() => restore.mutate(v.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VersionCard({
  version,
  isLatest,
  onRestore,
}: {
  version: { id: string; created_at: string; label: string | null; snapshot: Json };
  isLatest: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/40 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{new Date(version.created_at).toLocaleString()}</p>
          {version.label && <p className="text-xs text-muted-foreground">{version.label}</p>}
        </div>
        {isLatest && (
          <Badge variant="secondary" className="text-[10px]">
            Current live
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="text-xs">
              Preview
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Snapshot from {new Date(version.created_at).toLocaleString()}
              </DialogTitle>
            </DialogHeader>
            <SnapshotPreview snapshot={version.snapshot} />
          </DialogContent>
        </Dialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" className="text-xs">
              <RotateCcw className="mr-1 h-3 w-3" /> Restore as draft
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restore this version?</AlertDialogTitle>
              <AlertDialogDescription>
                The snapshot becomes your current draft. Your live content is unchanged until you
                open the editor and publish.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRestore}>Restore to draft</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function SnapshotPreview({ snapshot }: { snapshot: Json }) {
  // Render a friendly preview: walk top-level keys, show strings inline and arrays as counts.
  const entries = Object.entries(snapshot ?? {});
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Empty snapshot.</p>;
  }
  return (
    <div className="max-h-[60vh] space-y-3 overflow-y-auto">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded-lg border border-border bg-card/30 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {k}
          </p>
          {Array.isArray(v) ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {v.length} item{v.length === 1 ? "" : "s"}
              </p>
              <ul className="ml-4 list-disc text-sm">
                {(v as unknown[]).slice(0, 6).map((it, i) => (
                  <li key={i} className="truncate">
                    {typeof it === "object" && it
                      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (it as any).title ||
                        (it as any).label ||
                        (it as any).question ||
                        (it as any).name ||
                        JSON.stringify(it).slice(0, 80)
                      : String(it)}
                  </li>
                ))}
                {v.length > 6 && (
                  <li className="text-xs text-muted-foreground">…and {v.length - 6} more</li>
                )}
              </ul>
            </div>
          ) : typeof v === "object" && v ? (
            <pre className="overflow-x-auto rounded bg-muted/40 p-2 text-[11px]">
              {JSON.stringify(v, null, 2)}
            </pre>
          ) : (
            <p className="text-sm">{String(v ?? "—")}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// SHARED
// ============================================================

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="glass shadow-card-soft flex items-center gap-2 rounded-2xl p-4 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </div>
  );
}

function ErrorPanel({ error, onRetry }: { error: Error; onRetry: () => void }) {
  // Non-blocking warning — UI shell stays visible, user can retry. We
  // intentionally do NOT render a full "Something went wrong" screen here so a
  // single failing query never takes down the whole Site Management page.
  return (
    <div className="glass shadow-card-soft space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
      <p className="font-medium text-amber-700 dark:text-amber-300">
        This panel couldn't load. Other tools are still available.
      </p>
      <p className="text-xs text-muted-foreground">
        {error?.message || "Temporary backend issue."}
      </p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
