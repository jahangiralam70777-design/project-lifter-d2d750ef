import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  MousePointerClick,
  Eye,
  LogIn,
  LogOut,
  Send,
  Server,
  Database,
  ShieldCheck,
  Filter,
  Pause,
  Play,
  Loader2,
  Search,
  Users,
  Sparkles,
  X,
  Globe,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import {
  adminActivityOverview,
  adminTopButtons,
  adminTopPages,
  adminTopModules,
  adminActivityTimeseries,
  adminUserActivity,
  adminActivityFeed,
} from "@/lib/admin-analytics.functions";

const RANGES = [
  { label: "Last 24h", hours: 24, bucket: 60 },
  { label: "Last 7 days", hours: 24 * 7, bucket: 360 },
  { label: "Last 30 days", hours: 24 * 30, bucket: 1440 },
];

const EVENT_TYPES = [
  { v: "all", l: "All events" },
  { v: "click", l: "Clicks" },
  { v: "page_view", l: "Page views" },
  { v: "submit", l: "Form submits" },
  { v: "login", l: "Logins" },
  { v: "logout", l: "Logouts" },
  { v: "crud", l: "CRUD" },
  { v: "admin_action", l: "Admin actions" },
  { v: "api_call", l: "API calls" },
];

const EVENT_COLORS: Record<string, string> = {
  click: "var(--neon-purple)",
  page_view: "var(--neon-blue)",
  submit: "#10b981",
  login: "#22c55e",
  logout: "#f43f5e",
  crud: "#f59e0b",
  admin_action: "#eab308",
  api_call: "#06b6d4",
  navigation: "#a78bfa",
};

const EVENT_ICONS: Record<string, typeof Activity> = {
  click: MousePointerClick,
  page_view: Eye,
  submit: Send,
  login: LogIn,
  logout: LogOut,
  crud: Database,
  admin_action: ShieldCheck,
  api_call: Server,
  navigation: Globe,
};

function fmtTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function timeAgo(s: string): string {
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 1000) return "now";
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

type FeedRow = Awaited<ReturnType<typeof adminActivityFeed>>[number];
type LiveRow = FeedRow & { _live?: boolean };

export function LiveTrackingPanel() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(adminActivityOverview);
  const topButtonsFn = useServerFn(adminTopButtons);
  const topPagesFn = useServerFn(adminTopPages);
  const topModulesFn = useServerFn(adminTopModules);
  const timeseriesFn = useServerFn(adminActivityTimeseries);
  const feedFn = useServerFn(adminActivityFeed);
  const userActivityFn = useServerFn(adminUserActivity);

  const [rangeIdx, setRangeIdx] = useState(0);
  const [eventType, setEventType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState(false);
  const [viewing, setViewing] = useState<FeedRow | null>(null);

  const range = RANGES[rangeIdx];

  const overview = useQuery({
    queryKey: ["track-overview", range.hours],
    queryFn: () => overviewFn({ data: { rangeHours: range.hours } }),
    refetchInterval: 10_000,
  });

  const topButtons = useQuery({
    queryKey: ["track-top-buttons", range.hours],
    queryFn: () => topButtonsFn({ data: { rangeHours: range.hours, limit: 10 } }),
    refetchInterval: 30_000,
  });
  const topPages = useQuery({
    queryKey: ["track-top-pages", range.hours],
    queryFn: () => topPagesFn({ data: { rangeHours: range.hours, limit: 10 } }),
    refetchInterval: 30_000,
  });
  const topModules = useQuery({
    queryKey: ["track-top-modules", range.hours],
    queryFn: () => topModulesFn({ data: { rangeHours: range.hours, limit: 10 } }),
    refetchInterval: 30_000,
  });
  const timeseries = useQuery({
    queryKey: ["track-timeseries", range.hours, range.bucket],
    queryFn: () => timeseriesFn({ data: { rangeHours: range.hours, bucketMinutes: range.bucket } }),
    refetchInterval: 30_000,
  });
  const feed = useQuery({
    queryKey: ["track-feed", range.hours, eventType, search],
    queryFn: () =>
      feedFn({
        data: {
          rangeHours: range.hours,
          eventType: eventType === "all" ? undefined : eventType,
          search: search.trim() || undefined,
          limit: 100,
        },
      }),
    refetchInterval: 15_000,
  });

  // Live realtime prepend
  const [live, setLive] = useState<LiveRow[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const ch = supabase
      .channel(`activity-live-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_events" },
        (payload) => {
          if (pausedRef.current) return;
          const row = payload.new as Record<string, unknown>;
          if (eventType !== "all" && row.event_type !== eventType) return;
          const live: LiveRow = {
            id: String(row.id),
            user_id: (row.user_id as string) ?? null,
            event_type: String(row.event_type),
            page_path: (row.page_path as string) ?? null,
            element_id: (row.element_id as string) ?? null,
            element_label: (row.element_label as string) ?? null,
            module: (row.module as string) ?? null,
            target_kind: (row.target_kind as string) ?? null,
            target_id: (row.target_id as string) ?? null,
            metadata: (row.metadata ?? {}) as never,
            created_at: String(row.created_at),
            user_name: "…",
            user_avatar: null,
            target_name: null,
            _live: true,
          };
          setLive((prev) => [live, ...prev].slice(0, 60));
          // Light invalidations so counters refresh
          qc.invalidateQueries({ queryKey: ["track-overview"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, eventType]);

  const combinedFeed = useMemo<LiveRow[]>(() => {
    const base = (feed.data ?? []) as LiveRow[];
    const liveIds = new Set(live.map((l) => l.id));
    const merged = [...live, ...base.filter((b) => !liveIds.has(b.id))];
    return merged.slice(0, 100);
  }, [live, feed.data]);

  const o = overview.data ?? ({} as Record<string, number>);
  const stats = [
    { l: "Active now", v: o.active_now ?? 0, sub: "last 5 min", i: Activity, c: "#22c55e" },
    {
      l: "Users (24h)",
      v: o.unique_users_24h ?? 0,
      sub: "unique",
      i: Users,
      c: "var(--neon-purple)",
    },
    {
      l: "Total events",
      v: o.total_events ?? 0,
      sub: range.label.toLowerCase(),
      i: Sparkles,
      c: "var(--neon-blue)",
    },
    {
      l: "Clicks",
      v: o.total_clicks ?? 0,
      sub: "button clicks",
      i: MousePointerClick,
      c: "#f97316",
    },
    { l: "Page views", v: o.total_page_views ?? 0, sub: "navigations", i: Eye, c: "#06b6d4" },
    { l: "API errors", v: o.api_errors ?? 0, sub: "failed calls", i: Server, c: "#ef4444" },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1.5">
            <Badge className="border-0 bg-emerald-500/20 text-emerald-300">
              <Activity className="mr-1 h-3 w-3 animate-pulse" /> Live Tracking
            </Badge>
            <h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              Full-Site <span className="text-gradient">Activity Monitor</span>
            </h2>
            <p className="max-w-2xl text-xs text-muted-foreground">
              Real-time stream of every page view, click, form submit, login, CRUD and admin action
              across the platform.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(rangeIdx)} onValueChange={(v) => setRangeIdx(Number(v))}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r, i) => (
                  <SelectItem key={r.label} value={String(i)}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="border-white/15"
              onClick={() => qc.invalidateQueries({ queryKey: ["track-overview"] })}
              data-track="tracking.refresh"
              data-track-module="admin/analytics"
            >
              {overview.isFetching ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}{" "}
              Refresh
            </Button>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.l}
            className="glass shadow-card-soft relative overflow-hidden rounded-2xl p-4"
          >
            <div
              className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl"
              style={{ background: `${s.c}33` }}
            />
            <div className="flex items-center justify-between">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-background/40"
                style={{ boxShadow: `0 0 12px ${s.c}55` }}
              >
                <s.i className="h-4 w-4" style={{ color: s.c }} />
              </div>
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/30 text-[10px] text-emerald-400"
              >
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> live
              </Badge>
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-wider text-muted-foreground">{s.l}</p>
            <p className="font-display text-2xl font-bold tracking-tight">{s.v.toLocaleString()}</p>
            <p className="text-[10px] text-muted-foreground">{s.sub}</p>
          </div>
        ))}
      </section>

      {/* Chart + breakdown */}
      <div className="grid gap-3 lg:grid-cols-3">
        <section className="glass shadow-card-soft rounded-2xl p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Events over time
              </p>
              <p className="font-display text-base font-bold">
                {range.label} · bucket{" "}
                {range.bucket >= 60 ? `${range.bucket / 60}h` : `${range.bucket}m`}
              </p>
            </div>
          </div>
          <TimeseriesChart data={timeseries.data ?? []} />
        </section>
        <section className="glass shadow-card-soft rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Event breakdown
          </p>
          <p className="font-display text-base font-bold">By type</p>
          <EventBreakdown data={timeseries.data ?? []} />
        </section>
      </div>

      {/* Leaderboards */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Leaderboard
          title="Top buttons"
          icon={MousePointerClick}
          loading={topButtons.isLoading}
          rows={(topButtons.data ?? []).map((r) => ({
            primary: r.element_label || r.element_id,
            secondary: r.page_path,
            value: r.click_count,
          }))}
        />
        <Leaderboard
          title="Top pages"
          icon={Eye}
          loading={topPages.isLoading}
          rows={(topPages.data ?? []).map((r) => ({
            primary: r.page_path,
            secondary: `${r.unique_users.toLocaleString()} users`,
            value: r.view_count,
          }))}
        />
        <Leaderboard
          title="Top modules"
          icon={Layers}
          loading={topModules.isLoading}
          rows={(topModules.data ?? []).map((r) => ({
            primary: r.module,
            secondary: `${r.unique_users.toLocaleString()} users`,
            value: r.event_count,
          }))}
        />
      </div>

      {/* Filters */}
      <section className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={eventType} onValueChange={setEventType}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((t) => (
              <SelectItem key={t.v} value={t.v}>
                {t.l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search label, page, id…"
            className="h-9 w-60 pl-8"
          />
        </div>
        <Button
          size="sm"
          variant={paused ? "default" : "outline"}
          className="ml-auto"
          onClick={() => setPaused((p) => !p)}
          data-track={paused ? "tracking.resume" : "tracking.pause"}
        >
          {paused ? (
            <>
              <Play className="mr-1.5 h-3.5 w-3.5" /> Resume
            </>
          ) : (
            <>
              <Pause className="mr-1.5 h-3.5 w-3.5" /> Pause
            </>
          )}
        </Button>
      </section>

      {/* Live feed */}
      <section className="glass shadow-card-soft rounded-2xl">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Real-time activity
            </p>
            <p className="font-display text-base font-bold">
              Live feed {paused && <span className="text-amber-400">· paused</span>}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {combinedFeed.length} events
          </Badge>
        </div>
        <div className="max-h-[520px] overflow-y-auto font-mono text-[11px]">
          {feed.isLoading && combinedFeed.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading activity…
            </div>
          ) : combinedFeed.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              No events match the filters.
            </div>
          ) : (
            combinedFeed.map((row) => {
              const Icon = EVENT_ICONS[row.event_type] ?? Activity;
              const color = EVENT_COLORS[row.event_type] ?? "var(--neon-purple)";
              return (
                <button
                  key={row.id}
                  onClick={() => setViewing(row)}
                  data-track="tracking.feed.row"
                  className="flex w-full items-center gap-3 border-b border-border/20 px-4 py-2 text-left transition hover:bg-white/5"
                >
                  <span className="w-20 shrink-0 text-muted-foreground">
                    {fmtTime(row.created_at)}
                  </span>
                  <span
                    className="flex w-32 shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px]"
                    style={{ borderColor: `${color}66`, color }}
                  >
                    <Icon className="h-3 w-3" /> {row.event_type}
                  </span>
                  <span className="w-32 shrink-0 truncate text-foreground/90">{row.user_name}</span>
                  <span className="flex-1 truncate text-muted-foreground">
                    <span className="text-foreground/80">
                      {row.element_label ?? row.target_kind ?? row.event_type}
                    </span>
                    {row.page_path && (
                      <span className="ml-2 text-muted-foreground">{row.page_path}</span>
                    )}
                  </span>
                  {row._live && (
                    <Badge className="ml-2 border-0 bg-emerald-500/20 text-[10px] text-emerald-300">
                      new
                    </Badge>
                  )}
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Details sheet */}
      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Event details
            </SheetTitle>
          </SheetHeader>
          {viewing && <EventDetails row={viewing} userActivityFn={userActivityFn} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ------------------------------ Subcomponents ----------------------------- */

function Leaderboard({
  title,
  icon: Icon,
  rows,
  loading,
}: {
  title: string;
  icon: typeof Activity;
  rows: Array<{ primary: string; secondary: string; value: number }>;
  loading: boolean;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="glass shadow-card-soft rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-background/40">
          <Icon className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
        </div>
        <p className="font-display text-sm font-bold">{title}</p>
      </div>
      {loading ? (
        <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={`${r.primary}-${i}`} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{r.primary || "(unknown)"}</span>
                <span className="shrink-0 font-mono text-foreground/80">
                  {r.value.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-background/40">
                <div
                  className="h-full rounded-full bg-cta-gradient"
                  style={{ width: `${(r.value / max) * 100}%` }}
                />
              </div>
              <p className="truncate text-[10px] text-muted-foreground">{r.secondary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TimeseriesChart({
  data,
}: {
  data: Array<{ bucket: string; event_type: string; event_count: number }>;
}) {
  // Aggregate per bucket (sum across types)
  const buckets = new Map<string, number>();
  for (const r of data) buckets.set(r.bucket, (buckets.get(r.bucket) ?? 0) + Number(r.event_count));
  const sorted = Array.from(buckets.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const values = sorted.map(([, v]) => v);
  const max = Math.max(1, ...values);
  const points = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${100 - (v / max) * 90}`)
    .join(" ");
  return (
    <>
      <svg viewBox="0 0 100 100" className="h-56 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="lt-area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--neon-blue)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--neon-blue)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 40, 60, 80].map((y) => (
          <line
            key={y}
            x1="0"
            x2="100"
            y1={y}
            y2={y}
            stroke="currentColor"
            strokeOpacity="0.06"
            strokeWidth="0.3"
          />
        ))}
        {values.length > 0 && (
          <>
            <polygon points={`0,100 ${points} 100,100`} fill="url(#lt-area)" />
            <polyline points={points} fill="none" stroke="var(--neon-blue)" strokeWidth="0.8" />
          </>
        )}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{sorted[0] ? new Date(sorted[0][0]).toLocaleString() : "—"}</span>
        <span>{sorted.at(-1) ? new Date(sorted.at(-1)![0]).toLocaleString() : "—"}</span>
      </div>
    </>
  );
}

function EventBreakdown({
  data,
}: {
  data: Array<{ bucket: string; event_type: string; event_count: number }>;
}) {
  const totals = new Map<string, number>();
  for (const r of data)
    totals.set(r.event_type, (totals.get(r.event_type) ?? 0) + Number(r.event_count));
  const rows = Array.from(totals.entries()).sort((a, b) => b[1] - a[1]);
  const sum = rows.reduce((s, [, v]) => s + v, 0) || 1;
  if (rows.length === 0)
    return <p className="py-10 text-center text-xs text-muted-foreground">No events.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {rows.map(([type, count]) => {
        const color = EVENT_COLORS[type] ?? "var(--neon-purple)";
        const pct = Math.round((count / sum) * 1000) / 10;
        return (
          <li key={type} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="capitalize">{type.replace(/_/g, " ")}</span>
              <span className="font-mono text-muted-foreground">
                {count.toLocaleString()} · {pct}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-background/40">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: color }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function EventDetails({
  row,
  userActivityFn,
}: {
  row: LiveRow;
  userActivityFn: ReturnType<typeof useServerFn<typeof adminUserActivity>>;
}) {
  const userQ = useQuery({
    queryKey: ["user-activity", row.user_id],
    queryFn: () =>
      row.user_id
        ? userActivityFn({ data: { userId: row.user_id, limit: 20 } })
        : Promise.resolve([] as Awaited<ReturnType<typeof userActivityFn>>),
    enabled: !!row.user_id,
  });
  const Icon = EVENT_ICONS[row.event_type] ?? Activity;
  const color = EVENT_COLORS[row.event_type] ?? "var(--neon-purple)";
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
        <div className="mb-2 flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px]"
            style={{ borderColor: `${color}66`, color }}
          >
            <Icon className="h-3 w-3" /> {row.event_type}
          </span>
          <span className="text-xs text-muted-foreground">
            {timeAgo(row.created_at)} · {fmtTime(row.created_at)}
          </span>
        </div>
        <p className="font-display text-base font-bold">
          {row.element_label ?? row.target_kind ?? row.event_type}
        </p>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <dt className="text-muted-foreground">User</dt>
          <dd>{row.user_name}</dd>
          <dt className="text-muted-foreground">Page</dt>
          <dd className="truncate">{row.page_path ?? "—"}</dd>
          <dt className="text-muted-foreground">Module</dt>
          <dd>{row.module ?? "—"}</dd>
          <dt className="text-muted-foreground">Element id</dt>
          <dd className="font-mono">{row.element_id ?? "—"}</dd>
          {row.target_kind && (
            <>
              <dt className="text-muted-foreground">Target</dt>
              <dd className="truncate">
                {row.target_kind}
                {row.target_name
                  ? ` · ${row.target_name}`
                  : row.target_id
                    ? " · Not Assigned"
                    : ""}
              </dd>
            </>
          )}
        </dl>
        {row.metadata && Object.keys(row.metadata).length > 0 && (
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-background/60 p-2 text-[10px]">
            {JSON.stringify(row.metadata, null, 2)}
          </pre>
        )}
      </div>

      <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Recent activity by this user
        </p>
        {!row.user_id ? (
          <p className="text-xs text-muted-foreground">Anonymous event.</p>
        ) : userQ.isLoading ? (
          <div className="flex items-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            Loading…
          </div>
        ) : (userQ.data ?? []).length === 0 ? (
          <p className="text-xs text-muted-foreground">No other recent events.</p>
        ) : (
          <ul className="space-y-1 font-mono text-[11px]">
            {(userQ.data ?? []).map((e) => {
              const c = EVENT_COLORS[e.event_type] ?? "var(--neon-purple)";
              return (
                <li key={e.id} className="flex items-center gap-2 truncate">
                  <span className="w-16 shrink-0 text-muted-foreground">
                    {fmtTime(e.created_at)}
                  </span>
                  <span className="w-24 shrink-0 truncate" style={{ color: c }}>
                    {e.event_type}
                  </span>
                  <span className="truncate">{e.element_label ?? e.page_path ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Unused exports for the linter — keep X import alive (used elsewhere in file)
export const _icons = { X };
