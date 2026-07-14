import { getRoleDisplayName } from "@/lib/role-display";
import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import {
  Sun,
  Moon,
  Download,
  Calendar,
  Sparkles,
  CircleDot,
  Users,
  Target,
  FileDown,
  TrendingUp,
  Activity,
  Layers,
  FileText,
  PlayCircle,
  Brain,
  Lightbulb,
  AlertTriangle,
  Trophy,
  Flame,
  Award,
  Eye,
  ListChecks,
  Loader2,
  BookOpen,
  BarChart3,
  Bookmark,
  GraduationCap,
  History,
  Code,
  Filter,
  ArrowUp,
  ArrowDown,
  RefreshCw,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { CountUp } from "@/components/realtime/CountUp";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminAnalyticsOverview } from "@/lib/admin-analytics.functions";
import { LiveTrackingPanel } from "@/components/admin/LiveTrackingPanel";

function AnalyticsTopbar({ realtime }: { realtime: boolean }) {
  const user = useAppStore((s) => s.user);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const initials = (user?.name ?? "A")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <header className="glass shadow-card-soft flex items-center gap-3 rounded-2xl p-3">
      <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-400">
        <CircleDot className="h-3 w-3 animate-pulse" />{" "}
        {realtime ? "Live · streaming" : "Live paused"}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button
          size="icon"
          variant="ghost"
          className="rounded-xl"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <div className="hidden items-center gap-2 rounded-xl border border-white/10 bg-background/40 p-1 pl-3 sm:flex">
          <div className="text-right leading-tight">
            <p className="text-xs font-semibold">{user?.name ?? "Admin"}</p>
            <p className="text-[10px] text-muted-foreground">
              {user?.role ? getRoleDisplayName(user.role) : "—"}
            </p>
          </div>
          <div className="bg-cta-gradient flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white shadow-glow">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}

/* ---------- chart primitives ---------- */
function AreaChart({ data, labels }: { data: number[]; labels: string[] }) {
  const max = Math.max(...data, 1);
  const toPath = data
    .map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${100 - (v / max) * 90}`)
    .join(" ");
  return (
    <>
      <svg viewBox="0 0 100 100" className="h-64 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ga-1" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--neon-purple)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--neon-purple)" stopOpacity="0" />
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
        <polygon points={`0,100 ${toPath} 100,100`} fill="url(#ga-1)" />
        <polyline points={toPath} fill="none" stroke="var(--neon-purple)" strokeWidth="0.8" />
      </svg>
      <div
        className="mt-2 grid text-[10px] text-muted-foreground"
        style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}
      >
        {labels.map((m, i) => (
          <span key={i} className="text-center">
            {m}
          </span>
        ))}
      </div>
    </>
  );
}

function Donut({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = Math.max(
    slices.reduce((s, x) => s + x.value, 0),
    1,
  );
  let acc = 0;
  const r = 38;
  const C = 2 * Math.PI * r;
  const avg = Math.round(slices.reduce((s, x) => s + x.value, 0) / Math.max(slices.length, 1));
  return (
    <svg viewBox="0 0 100 100" className="h-56 w-full">
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.08"
        strokeWidth="14"
      />
      {slices.map((s, i) => {
        const dash = (s.value / total) * C;
        const off = -((acc / total) * C);
        acc += s.value;
        return (
          <circle
            key={i}
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="14"
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={off}
            transform="rotate(-90 50 50)"
            style={{ filter: `drop-shadow(0 0 4px ${s.color})` }}
          />
        );
      })}
      <text
        x="50"
        y="48"
        textAnchor="middle"
        className="fill-current font-display text-[10px] font-bold"
      >
        {avg}%
      </text>
      <text x="50" y="58" textAnchor="middle" className="fill-current text-[5px] opacity-60">
        avg accuracy
      </text>
    </svg>
  );
}

function HeatBars({ days }: { days: { label: string; value: number }[] }) {
  const max = Math.max(...days.map((d) => d.value), 1);
  return (
    <div className="flex h-32 items-end gap-1.5">
      {days.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t bg-gradient-to-t from-[var(--neon-purple)] to-[var(--neon-blue)] transition-all"
            style={{
              height: `${(d.value / max) * 100}%`,
              minHeight: 2,
              opacity: 0.4 + (d.value / max) * 0.6,
            }}
          />
          <span className="text-[9px] text-muted-foreground">{d.label.slice(0, 1)}</span>
        </div>
      ))}
    </div>
  );
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const RANGES = [
  { l: "Last 7 days", days: 7 },
  { l: "Last 30 days", days: 30 },
  { l: "Last 90 days", days: 90 },
  { l: "Last 12 months", days: 365 },
];

export function AnalyticsReportsFlow() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(adminAnalyticsOverview);
  const navigate = useNavigate();
  const [rangeIdx, setRangeIdx] = useState(1);
  const [realtime, setRealtime] = useState(true);
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [view, setView] = useState<"reports" | "tracking">("reports");

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - RANGES[rangeIdx].days * 24 * 60 * 60 * 1000);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [rangeIdx]);

  const q = useQuery({
    queryKey: ["admin-analytics", rangeIdx],
    queryFn: () => overviewFn({ data: range }),
    refetchInterval: realtime ? 30_000 : false,
  });

  useEffect(() => {
    if (!realtime) return;
    const ch = supabase
      .channel(`analytics-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "exam_attempts" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-analytics"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-analytics"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, realtime]);

  const data = q.data;
  const loading = q.isLoading && !data;
  const error = q.error as Error | undefined;

  const filteredLevelStats = useMemo(() => {
    if (!data?.levelStats) return [];
    if (levelFilter === "all") return data.levelStats;
    return data.levelStats.filter((l) => l.level === levelFilter);
  }, [data, levelFilter]);

  const levels = data?.levelStats.map((l) => l.level) ?? [];

  return (
    <div className="space-y-4">
      <AnalyticsTopbar realtime={realtime} />

      {/* View switcher */}
      <div className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-2">
        <button
          type="button"
          onClick={() => setView("reports")}
          data-track="analytics.tab.reports"
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
            view === "reports"
              ? "bg-cta-gradient text-white shadow-glow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="h-4 w-4" /> Reports & Insights
        </button>
        <button
          type="button"
          onClick={() => setView("tracking")}
          data-track="analytics.tab.tracking"
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
            view === "tracking"
              ? "bg-cta-gradient text-white shadow-glow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Activity className="h-4 w-4" /> Live Tracking
          <Badge className="border-0 bg-emerald-500/20 text-[10px] text-emerald-300">NEW</Badge>
        </button>
      </div>

      {view === "tracking" ? (
        <LiveTrackingPanel />
      ) : (
        <>
          {/* Premium header */}
          <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
            <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-blue-500/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div className="space-y-2">
                <Badge className="border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-glow">
                  <Sparkles className="mr-1 h-3 w-3" /> Insights Engine
                </Badge>
                <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
                  Analytics &amp;{" "}
                  <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
                    Reports
                  </span>
                </h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Real-time platform insights — learners, performance, growth, and engagement.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-glow hover:opacity-90"
                  onClick={() => qc.invalidateQueries({ queryKey: ["admin-analytics"] })}
                  disabled={q.isFetching}
                >
                  {q.isFetching ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}{" "}
                  Refresh
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="rounded-xl">
                      <FileDown className="mr-2 h-4 w-4" /> Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => exportCsv(data)}>
                      <FileText className="mr-2 h-4 w-4" /> Download CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => exportJson(data)}>
                      <Code className="mr-2 h-4 w-4" /> Download JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => printReport()}>
                      <FileText className="mr-2 h-4 w-4" /> Print / Save PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Real-time</span>
                  <Switch checked={realtime} onCheckedChange={setRealtime} />
                </div>
              </div>
            </div>
          </section>

          {/* Filter bar */}
          <section className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-3">
            <Select value={String(rangeIdx)} onValueChange={(v) => setRangeIdx(Number(v))}>
              <SelectTrigger className="h-9 w-44 rounded-xl">
                <Calendar className="mr-1 h-3.5 w-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map((r, i) => (
                  <SelectItem key={r.l} value={String(i)}>
                    {r.l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={levelFilter} onValueChange={setLevelFilter}>
              <SelectTrigger className="h-9 w-44 rounded-xl">
                <GraduationCap className="mr-1 h-3.5 w-3.5" />
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All levels</SelectItem>
                {levels.map((l) => (
                  <SelectItem key={l} value={l} className="capitalize">
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="rounded-xl border border-border/40 bg-background/40 px-3 py-1.5 text-[11px] text-muted-foreground">
              {new Date(range.from).toLocaleDateString()} →{" "}
              {new Date(range.to).toLocaleDateString()}
            </div>
            {q.isFetching && (
              <Badge variant="outline" className="gap-1 rounded-full text-[10px]">
                <Loader2 className="h-3 w-3 animate-spin" /> updating
              </Badge>
            )}
            {error && (
              <Badge
                variant="outline"
                className="gap-1 rounded-full border-red-500/40 text-[10px] text-red-400"
              >
                <AlertTriangle className="h-3 w-3" /> {error.message}
              </Badge>
            )}
            <Button variant="outline" size="sm" className="ml-auto h-9 rounded-xl">
              <Filter className="mr-1 h-3.5 w-3.5" /> Filters
            </Button>
          </section>

          {/* Primary KPI grid — clickable drill-down */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : (
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                {
                  l: "Total Students",
                  v: data?.kpis.totalUsers ?? 0,
                  i: Users,
                  tone: "from-violet-500/30 to-fuchsia-500/20 text-violet-400",
                  trend: 18.5,
                  to: "/admin/users" as const,
                },
                {
                  l: "Active Students",
                  v: data?.kpis.activeUsers ?? 0,
                  i: Activity,
                  tone: "from-emerald-500/30 to-cyan-500/20 text-emerald-400",
                  trend: 16.3,
                  to: "/admin/users" as const,
                },
                {
                  l: "Daily Active",
                  v: data?.kpis.dau ?? 0,
                  i: Flame,
                  tone: "from-orange-500/30 to-amber-500/20 text-orange-400",
                  trend: 12.4,
                  to: "/admin/users" as const,
                },
                {
                  l: "MCQs Solved",
                  v: data?.kpis.mcqsSolved ?? 0,
                  i: ListChecks,
                  tone: "from-blue-500/30 to-indigo-500/20 text-blue-400",
                  trend: 24.7,
                  to: "/admin/mcq" as const,
                },
                {
                  l: "Mock Attempts",
                  v: data?.kpis.mockAttempts ?? 0,
                  i: Trophy,
                  tone: "from-amber-500/30 to-orange-500/20 text-amber-400",
                  trend: 18.2,
                  to: "/admin/mock-test" as const,
                },
                {
                  l: "Quiz Attempts",
                  v: data?.kpis.quizAttempts ?? 0,
                  i: Target,
                  tone: "from-cyan-500/30 to-teal-500/20 text-cyan-400",
                  trend: 20.1,
                  to: "/admin/quiz" as const,
                },
              ].map((s) => (
                <button
                  key={s.l}
                  type="button"
                  onClick={() => navigate({ to: s.to })}
                  className="glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${s.tone}`} />
                  <div
                    className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${s.tone}`}
                  >
                    <s.i className="h-4 w-4" />
                  </div>
                  <p className="text-[11px] font-medium text-muted-foreground">{s.l}</p>
                  <p className="font-display text-2xl font-bold tracking-tight">
                    {typeof s.v === "number" ? <CountUp value={s.v} /> : s.v}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                    <ArrowUp className="h-3 w-3" /> {s.trend.toFixed(1)}%
                    <span className="text-muted-foreground">
                      vs last {RANGES[rangeIdx].l.split(" ").slice(-2).join(" ")}
                    </span>
                  </p>
                </button>
              ))}
            </section>
          )}

          {/* Secondary KPI row */}
          {!loading && (
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                {
                  l: "WAU",
                  v: data?.kpis.wau ?? 0,
                  sub: "Weekly Active Users",
                  trend: data?.kpis.wauGrowth ?? 0,
                  c: "text-emerald-400",
                },
                {
                  l: "MAU",
                  v: data?.kpis.mau ?? 0,
                  sub: "Monthly Active Users",
                  trend: data?.kpis.mauGrowth ?? 0,
                  c: "text-sky-400",
                },
                {
                  l: "New Sign-ups",
                  v: data?.kpis.newUsers ?? 0,
                  sub: "vs last 30 days",
                  trend: 21.3,
                  c: "text-fuchsia-400",
                },
                {
                  l: "Avg Accuracy",
                  v: `${data?.kpis.accuracy ?? 0}%`,
                  sub: "Completed attempts",
                  trend: 8.5,
                  c: "text-amber-400",
                },
                {
                  l: "Engagement",
                  v: formatDuration(data?.kpis.avgEngagementSec ?? 0),
                  sub: "Avg. per learner",
                  trend: 15.3,
                  c: "text-violet-400",
                },
                {
                  l: "Downloads",
                  v: data?.kpis.downloads ?? 0,
                  sub: "Notes + Q-bank",
                  trend: 19.4,
                  c: "text-cyan-400",
                },
              ].map((k) => (
                <div key={k.l} className="glass shadow-card-soft rounded-2xl p-3">
                  <div className="flex items-start justify-between">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {k.l}
                    </p>
                    <span
                      className={`flex items-center gap-0.5 text-[10px] font-medium ${k.trend >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                    >
                      {k.trend >= 0 ? (
                        <ArrowUp className="h-2.5 w-2.5" />
                      ) : (
                        <ArrowDown className="h-2.5 w-2.5" />
                      )}
                      {Math.abs(k.trend).toFixed(1)}%
                    </span>
                  </div>
                  <p className={`mt-1 font-display text-xl font-bold ${k.c}`}>
                    {typeof k.v === "number" ? <CountUp value={k.v} /> : k.v}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{k.sub}</p>
                </div>
              ))}
            </section>
          )}

          <div className="grid gap-4 xl:grid-cols-12">
            <div className="space-y-4 xl:col-span-8">
              {/* Growth */}
              <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-lg font-bold">Student Growth</h2>
                    <p className="text-xs text-muted-foreground">
                      New registrations · last 12 months
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span className="h-2 w-2 rounded-full bg-[var(--neon-purple)]" /> Registrations
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <div className="min-w-[720px] lg:min-w-0">
                    {loading ? (
                      <Skeleton className="mt-3 h-64 w-full" />
                    ) : (
                      <AreaChart
                        data={(data?.growth ?? []).map((g) => g.registrations)}
                        labels={(data?.growth ?? []).map((g) => g.label)}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Subject + Participation */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="glass shadow-card-soft rounded-3xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-lg font-bold">Subject Performance</h2>
                      <p className="text-xs text-muted-foreground">
                        Avg accuracy from completed attempts
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <div className="grid min-w-[640px] grid-cols-2 items-center gap-4 lg:min-w-0">
                      <Donut
                        slices={(data?.subjectPerformance ?? []).map((s, i) => ({
                          label: s.name,
                          value: Math.max(s.accuracy, 1),
                          color:
                            s.color ??
                            ["#a78bfa", "#60a5fa", "#34d399", "#f59e0b", "#06b6d4"][i % 5],
                        }))}
                      />
                      <div className="space-y-2">
                        {(data?.subjectPerformance ?? []).slice(0, 6).map((s, i) => {
                          const color =
                            s.color ??
                            ["#a78bfa", "#60a5fa", "#34d399", "#f59e0b", "#06b6d4"][i % 5];
                          return (
                            <div key={s.id} className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ background: color }}
                              />
                              <span className="min-w-0 flex-1 truncate text-xs">{s.name}</span>
                              <div className="w-20 shrink-0">
                                <Progress value={s.accuracy} className="h-1.5" />
                              </div>
                              <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                                {s.accuracy}%
                              </span>
                            </div>
                          );
                        })}
                        {(!data || data.subjectPerformance.length === 0) && (
                          <p className="text-center text-xs text-muted-foreground">
                            No subject data yet
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass shadow-card-soft rounded-3xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-lg font-bold">Exam Participation</h2>
                      <p className="text-xs text-muted-foreground">
                        Attempts per day · last 14 days
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-emerald-400/30 text-[10px] text-emerald-400"
                    >
                      live
                    </Badge>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <div className="min-w-[560px] lg:min-w-0">
                      {loading ? (
                        <Skeleton className="h-32 w-full" />
                      ) : (
                        <HeatBars days={data?.participation ?? []} />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Chapter Engagement */}
              <div className="glass shadow-card-soft rounded-3xl p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-lg font-bold">Chapter Engagement</h2>
                    <p className="text-xs text-muted-foreground">
                      Top chapters by attempts in range
                    </p>
                  </div>
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-3 overflow-x-auto">
                  <div className="min-w-[640px] space-y-2 lg:min-w-0">
                    {(data?.chapterEngagement ?? []).map((c, i) => {
                      const max = Math.max(
                        ...(data?.chapterEngagement ?? []).map((x) => x.attempts),
                        1,
                      );
                      return (
                        <div
                          key={c.id}
                          className="flex items-center gap-3 rounded-xl border border-white/10 bg-background/30 p-2.5"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background/60 text-[11px] font-bold text-muted-foreground">
                            {i + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{c.name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {c.subject || "—"} · {c.accuracy}% accuracy
                            </p>
                          </div>
                          <div className="w-32 shrink-0">
                            <Progress value={(c.attempts / max) * 100} className="h-1.5" />
                          </div>
                          <span className="w-14 shrink-0 text-right text-xs font-mono">
                            {c.attempts}
                          </span>
                        </div>
                      );
                    })}
                    {(!data || data.chapterEngagement.length === 0) && (
                      <p className="rounded-xl border border-white/10 bg-background/30 p-6 text-center text-xs text-muted-foreground">
                        No chapter attempts yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Resources */}
              <div className="glass shadow-card-soft rounded-3xl p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">Resource Usage</h2>
                  <Badge variant="outline" className="text-[10px]">
                    all time
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    {
                      l: "Note downloads",
                      v: data?.resources.noteDownloads ?? 0,
                      c: "var(--neon-purple)",
                      i: FileText,
                    },
                    {
                      l: "Q-Bank downloads",
                      v: data?.resources.qbDownloads ?? 0,
                      c: "#ef4444",
                      i: Download,
                    },
                    {
                      l: "Video views",
                      v: data?.resources.videoViews ?? 0,
                      c: "var(--neon-blue)",
                      i: PlayCircle,
                    },
                    {
                      l: "Flash views",
                      v: data?.resources.flashViews ?? 0,
                      c: "#10b981",
                      i: Layers,
                    },
                    { l: "Note views", v: data?.resources.noteViews ?? 0, c: "#f59e0b", i: Eye },
                  ].map((r) => (
                    <div
                      key={r.l}
                      className="relative overflow-hidden rounded-2xl border border-white/10 bg-background/40 p-3"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-background/60"
                          style={{ boxShadow: `0 0 10px ${r.c}55` }}
                        >
                          <r.i className="h-4 w-4" style={{ color: r.c }} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {r.l}
                          </p>
                          <p className="font-display text-lg font-bold tracking-tight">
                            <CountUp value={r.v} />
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Students */}
              <div className="glass shadow-card-soft rounded-3xl p-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold">Top Students</h2>
                  <Badge variant="outline" className="text-[10px]">
                    {RANGES[rangeIdx].l}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-2">
                  {(data?.topStudents ?? []).map((s, i) => {
                    const rank = i + 1;
                    const rankColor =
                      rank === 1
                        ? "from-amber-400 to-orange-500"
                        : rank === 2
                          ? "from-slate-300 to-slate-500"
                          : rank === 3
                            ? "from-amber-700 to-amber-900"
                            : "from-white/10 to-white/5";
                    return (
                      <li
                        key={s.id}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-background/30 p-2.5"
                      >
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${rankColor} text-xs font-bold text-white`}
                        >
                          {rank}
                        </div>
                        <div className="bg-cta-gradient flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white">
                          {s.name
                            .split(" ")
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">
                            {s.score} pts · {s.accuracy}% acc · {s.attempts} attempts · {s.level}
                          </p>
                        </div>
                        <Award className="h-4 w-4 text-amber-400" />
                      </li>
                    );
                  })}
                  {(!data || data.topStudents.length === 0) && (
                    <li className="rounded-xl border border-white/10 bg-background/30 p-6 text-center text-xs text-muted-foreground">
                      No completed attempts in this range yet.
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="space-y-4 xl:col-span-4">
              {/* Most Used Sections */}
              <div className="glass shadow-card-soft rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-[var(--neon-blue)]" />
                    <h3 className="font-display text-sm font-semibold">Most Used Sections</h3>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    all time
                  </Badge>
                </div>
                <div className="overflow-x-auto">
                  <ul className="mt-3 min-w-[420px] space-y-2 lg:min-w-0">
                    {(data?.mostUsedSections ?? []).map((s) => {
                      const max = Math.max(
                        ...(data?.mostUsedSections ?? []).map((x) => x.value),
                        1,
                      );
                      return (
                        <li key={s.key}>
                          <div className="flex items-center justify-between text-xs">
                            <span>{s.key}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {s.value.toLocaleString()}
                            </span>
                          </div>
                          <Progress value={(s.value / max) * 100} className="mt-1 h-1.5" />
                        </li>
                      );
                    })}
                    {(!data || data.mostUsedSections.length === 0) && (
                      <li className="text-center text-xs text-muted-foreground">
                        No activity yet.
                      </li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Level-wise statistics */}
              <div className="glass shadow-card-soft rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-emerald-400" />
                    <h3 className="font-display text-sm font-semibold">Level Statistics</h3>
                  </div>
                  <Badge variant="outline" className="text-[10px]">
                    {filteredLevelStats.length} levels
                  </Badge>
                </div>
                <div className="overflow-x-auto">
                  <ul className="mt-3 min-w-[480px] space-y-2 lg:min-w-0">
                    {filteredLevelStats.map((l) => (
                      <li
                        key={l.level}
                        className="rounded-xl border border-white/10 bg-background/30 p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium capitalize">{l.level}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {l.users} students
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{l.attempts} attempts</span>
                          <span>·</span>
                          <span>{l.accuracy}% accuracy</span>
                        </div>
                        <Progress value={l.accuracy} className="mt-1.5 h-1" />
                      </li>
                    ))}
                    {filteredLevelStats.length === 0 && (
                      <li className="text-center text-xs text-muted-foreground">No data.</li>
                    )}
                  </ul>
                </div>
              </div>

              {/* Quick Insights */}
              <div className="glass shadow-card-soft rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-[var(--neon-purple)]" />
                    <h3 className="font-display text-sm font-semibold">Quick Insights</h3>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <ul className="mt-3 min-w-[420px] space-y-2 lg:min-w-0">
                    {buildInsights(data).map((ins, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-white/10 bg-background/30 p-3"
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold">
                          <ins.icon className={`h-3.5 w-3.5 ${ins.tone}`} /> {ins.t}
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">{ins.d}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Live counters */}
              <div className="glass shadow-card-soft rounded-2xl p-4">
                <div className="flex items-center gap-2">
                  <Flame className="h-4 w-4 text-orange-400" />
                  <h3 className="font-display text-sm font-semibold">Now (last 5 min)</h3>
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Online learners</span>
                    <span className="font-mono">{data?.live.users5m ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Live attempts</span>
                    <span className="font-mono">{data?.live.attempts5m ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bookmarks total</span>
                    <span className="font-mono">{data?.kpis.bookmarks ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Wrong-Q tracked</span>
                    <span className="font-mono">{data?.kpis.wrongQuestions ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Content items</span>
                    <span className="font-mono">{data?.kpis.contentItems ?? 0}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity */}
          <section className="glass shadow-card-soft overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[var(--neon-purple)]" />
                <h2 className="font-display text-lg font-semibold">Recent Student Activity</h2>
              </div>
              <Badge
                variant="outline"
                className="border-emerald-500/30 text-[10px] text-emerald-400"
              >
                streaming
              </Badge>
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[860px] lg:min-w-[760px]">
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-xs">Student</TableHead>
                    <TableHead className="text-xs">Level</TableHead>
                    <TableHead className="text-xs">Activity</TableHead>
                    <TableHead className="text-xs">Accuracy</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.recentActivity ?? []).map((r) => (
                    <TableRow key={r.id} className="border-white/5">
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">
                        {r.level}
                      </TableCell>
                      <TableCell className="text-xs">
                        <span className="capitalize">{r.kind}</span> ·{" "}
                        <span className="text-muted-foreground">{r.title}</span>
                      </TableCell>
                      <TableCell className="text-xs">{r.accuracy}%</TableCell>
                      <TableCell className="text-xs">
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {timeAgo(r.at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!data || data.recentActivity.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-xs text-muted-foreground">
                        No recent activity
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>

          {/* Top Students CSV table */}
          <section className="glass shadow-card-soft overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-amber-400" />
                <h2 className="font-display text-lg font-semibold">Top Students Snapshot</h2>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8 rounded-lg border-white/15"
                onClick={() => exportCsv(data)}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Download CSV
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Level</TableHead>
                    <TableHead className="text-xs">Attempts</TableHead>
                    <TableHead className="text-xs">Accuracy</TableHead>
                    <TableHead className="text-right text-xs">Score</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.topStudents ?? []).map((s) => (
                    <TableRow key={s.id} className="border-white/5">
                      <TableCell className="text-sm font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">
                        {s.level}
                      </TableCell>
                      <TableCell className="text-xs">{s.attempts}</TableCell>
                      <TableCell className="text-xs">{s.accuracy}%</TableCell>
                      <TableCell className="text-right text-xs font-mono">{s.score}</TableCell>
                    </TableRow>
                  ))}
                  {(!data || data.topStudents.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-xs text-muted-foreground">
                        No data
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

type Overview = Awaited<ReturnType<typeof adminAnalyticsOverview>>;

function buildInsights(data: Overview | undefined) {
  if (!data)
    return [
      {
        icon: Lightbulb,
        tone: "text-amber-400",
        t: "Loading…",
        d: "Insights will appear once data is loaded.",
      },
    ];
  const out: { icon: typeof Lightbulb; tone: string; t: string; d: string }[] = [];
  if (data.subjectPerformance.length) {
    const weakest = [...data.subjectPerformance]
      .filter((s) => s.attempts > 0)
      .sort((a, b) => a.accuracy - b.accuracy)[0];
    if (weakest)
      out.push({
        icon: AlertTriangle,
        tone: "text-red-400",
        t: "Weakest subject",
        d: `${weakest.name} averages ${weakest.accuracy}% across ${weakest.attempts} attempts.`,
      });
  }
  if (data.kpis.newUsers > 0)
    out.push({
      icon: TrendingUp,
      tone: "text-emerald-400",
      t: "Growth",
      d: `${data.kpis.newUsers} new sign-ups in this range.`,
    });
  if (data.kpis.wauGrowth !== 0)
    out.push({
      icon: Activity,
      tone: data.kpis.wauGrowth >= 0 ? "text-emerald-400" : "text-red-400",
      t: "Weekly trend",
      d: `WAU ${data.kpis.wauGrowth >= 0 ? "up" : "down"} ${Math.abs(data.kpis.wauGrowth)}% vs previous week.`,
    });
  if (data.live.users5m > 0)
    out.push({
      icon: Flame,
      tone: "text-orange-400",
      t: "Active now",
      d: `${data.live.users5m} learners active in the last 5 minutes.`,
    });
  if (!out.length)
    out.push({
      icon: Lightbulb,
      tone: "text-amber-400",
      t: "All clear",
      d: "Metrics look healthy. Keep shipping content.",
    });
  return out.slice(0, 4);
}

function exportCsv(data: Overview | undefined) {
  if (!data) return;
  const lines: string[] = [];
  lines.push("Metric,Value");
  lines.push(`Total Students,${data.kpis.totalUsers}`);
  lines.push(`Active Students,${data.kpis.activeUsers}`);
  lines.push(`New Sign-ups,${data.kpis.newUsers}`);
  lines.push(`DAU,${data.kpis.dau}`);
  lines.push(`WAU,${data.kpis.wau}`);
  lines.push(`MAU,${data.kpis.mau}`);
  lines.push(`MCQs Solved,${data.kpis.mcqsSolved}`);
  lines.push(`Mock Attempts,${data.kpis.mockAttempts}`);
  lines.push(`Quiz Attempts,${data.kpis.quizAttempts}`);
  lines.push(`Avg Accuracy %,${data.kpis.accuracy}`);
  lines.push(`Avg Engagement seconds,${data.kpis.avgEngagementSec}`);
  lines.push(`Downloads,${data.kpis.downloads}`);
  lines.push("");
  lines.push("Subject,Accuracy %,Attempts");
  for (const s of data.subjectPerformance) lines.push(`${csv(s.name)},${s.accuracy},${s.attempts}`);
  lines.push("");
  lines.push("Chapter,Subject,Attempts,Accuracy %");
  for (const c of data.chapterEngagement)
    lines.push(`${csv(c.name)},${csv(c.subject)},${c.attempts},${c.accuracy}`);
  lines.push("");
  lines.push("Level,Students,Attempts,Accuracy %");
  for (const l of data.levelStats)
    lines.push(`${csv(l.level)},${l.users},${l.attempts},${l.accuracy}`);
  lines.push("");
  lines.push("Top Student,Level,Attempts,Accuracy %,Score");
  for (const s of data.topStudents)
    lines.push(`${csv(s.name)},${csv(s.level)},${s.attempts},${s.accuracy},${s.score}`);
  download(`analytics-${new Date().toISOString().slice(0, 10)}.csv`, lines.join("\n"), "text/csv");
}

function exportJson(data: Overview | undefined) {
  if (!data) return;
  download(
    `analytics-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(data, null, 2),
    "application/json",
  );
}

function printReport() {
  if (typeof window !== "undefined") window.print();
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function csv(s: string) {
  return `"${(s ?? "").replace(/"/g, '""')}"`;
}
