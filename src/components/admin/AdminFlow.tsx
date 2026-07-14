import {
  Search,
  Bell,
  Moon,
  Sun,
  CircleDot,
  Users,
  Trophy,
  Activity,
  Server,
  PlusCircle,
  Send,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  FileText,
  Layers,
  ListChecks,
  Timer,
  ClipboardList,
  BookOpen,
  UserPlus,
  Megaphone,
  LayoutGrid,
  Smartphone,
  Monitor,
  Tablet,
  Chrome,
  Globe,
  Crown,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database as DatabaseIcon,
  PlayCircle,
  Mail,
  HelpCircle,
} from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAppStore } from "@/stores/app-store";
import { FloatingQuickActions } from "@/components/admin/FloatingQuickActions";
import {
  adminControlCenter,
  adminDashboardSnapshot,
  adminPremiumOverview,
  adminNotificationsBadge,
  adminEngagementSeries,
  type AdminControlCenter,
  type AdminPremiumOverview,
  type AdminNotificationsBadge,
  type EngagementRange,
} from "@/lib/admin-dashboard.functions";
import { adminGlobalSearch, type SearchHit } from "@/lib/admin-search.functions";
import { getRoleDisplayName } from "@/lib/role-display";
import { supabase } from "@/integrations/supabase/client";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/* ---------------- helpers ---------------- */
function fmtNum(n: number | undefined | null) {
  const v = Number(n ?? 0);
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return v.toLocaleString();
  return String(v);
}
function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - +new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
function fmtDate(d: Date) {
  return d.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

/* ============================================================== */
export function AdminFlow() {
  const ccFn = useServerFn(adminControlCenter);
  const poFn = useServerFn(adminPremiumOverview);
  const snapFn = useServerFn(adminDashboardSnapshot);
  const badgeFn = useServerFn(adminNotificationsBadge);

  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(30);
  const [participationScope, setParticipationScope] = useState<"all" | "month">("month");

  const cc = useQuery({
    queryKey: ["admin-control-center"],
    queryFn: () => ccFn(),
    refetchInterval: 15_000,
  });
  const po = useQuery({
    queryKey: ["admin-premium-overview", periodDays, participationScope],
    queryFn: () =>
      poFn({ data: { period_days: periodDays, participation_scope: participationScope } }),
    refetchInterval: 15_000,
  });
  const snap = useQuery({
    queryKey: ["admin-dashboard-snapshot"],
    queryFn: () => snapFn(),
    refetchInterval: 20_000,
  });
  const badge = useQuery({
    queryKey: ["admin-notifications-badge"],
    queryFn: () => badgeFn(),
    refetchInterval: 20_000,
  });

  return (
    <main id="main-content" className="space-y-4" aria-label="Admin dashboard">
      <h1 className="sr-only">Admin Dashboard</h1>
      <AdminTopbar badge={badge.data} />

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <WelcomeHero overview={po.data} />
        <QuickActionsPanel />
      </div>

      <KPIStrip overview={po.data} loading={po.isLoading} />

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <PlatformOverviewCard
          overview={po.data}
          periodDays={periodDays}
          onChangePeriod={setPeriodDays}
        />
        <DeviceBrowserCard overview={po.data} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TopSubjectsCard overview={po.data} />
        <ExamParticipationCard
          overview={po.data}
          scope={participationScope}
          onChangeScope={setParticipationScope}
        />
        <StudentEngagementCard overview={po.data} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <RecentActivityCard cc={cc.data} />
        <SystemHealthCard overview={po.data} />
        <RecentUploadsCard snap={snap.data} />
      </div>

      <FooterRow />
      <FloatingQuickActions />
    </main>
  );
}
/* ============================================================== */
/* Topbar                                                          */
/* ============================================================== */
function AdminTopbar({ badge }: { badge?: AdminNotificationsBadge }) {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const user = useAppStore((s) => s.user);
  const navigate = useNavigate();
  const [now, setNow] = useState(new Date());
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const iconBtn =
    "relative flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-background/40 text-foreground/80 transition-all hover:scale-105 hover:bg-muted hover:text-foreground";

  const unread = badge?.unread ?? 0;
  const initials =
    (user?.name ?? "Admin")
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "AD";

  return (
    <div className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-2.5 pl-14 sm:gap-3 lg:flex-nowrap lg:pl-2.5">
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="relative order-2 w-full min-w-0 basis-full text-left lg:order-none lg:w-auto lg:flex-1 lg:basis-auto lg:max-w-2xl"
        aria-label="Open global search"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <span className="block h-10 w-full truncate rounded-xl border border-border/60 bg-background/40 pl-9 pr-16 text-sm leading-10 text-muted-foreground hover:bg-muted/50">
          Search users, exams, content, analytics…
        </span>
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
          Ctrl + K
        </kbd>
      </button>
      <div className="order-1 ml-auto flex flex-nowrap items-center justify-end gap-2 lg:order-none">
        <span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground md:flex">
          <CircleDot className="h-2.5 w-2.5 animate-pulse text-emerald-400" />
          {fmtTime(now)}
        </span>
        <button type="button" onClick={toggleTheme} aria-label="Toggle theme" className={iconBtn}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <NotificationsPopover badge={badge} unread={unread} iconBtn={iconBtn} />
        <Link
          to="/admin/notifications"
          search={{ tab: "inbox" } as never}
          aria-label="Inbox"
          className={iconBtn}
        >
          <Mail className="h-4 w-4" />
        </Link>
        <Link
          to="/admin/settings"
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-background/40 p-1.5 pr-3"
        >
          <div className="bg-cta-gradient flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold text-white shadow-glow">
            {initials}
          </div>
          <div className="leading-tight">
            <p className="text-xs font-semibold">{user?.name ?? "Admin"}</p>
            <p className="text-[10px] text-muted-foreground">{user?.role ? getRoleDisplayName(user.role) : "—"}</p>
          </div>
        </Link>
      </div>
      <GlobalSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        onSelect={(to) => {
          setSearchOpen(false);
          navigate({ to: to as never });
        }}
      />
    </div>
  );
}

/* ============================================================== */
/* Notifications popover                                           */
/* ============================================================== */
function NotificationsPopover({
  badge,
  unread,
  iconBtn,
}: {
  badge?: AdminNotificationsBadge;
  unread: number;
  iconBtn: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Notifications" className={iconBtn}>
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-cta-gradient px-1 text-[9px] font-bold text-white shadow-glow">
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <p className="text-xs font-semibold">Notifications</p>
          <span className="text-[10px] text-muted-foreground">
            {unread} sent · {badge?.scheduled ?? 0} scheduled
          </span>
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {(badge?.recent ?? []).length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              No notifications yet.
            </li>
          ) : (
            (badge?.recent ?? []).map((n) => (
              <li key={n.id} className="border-b border-border/40 px-3 py-2 last:border-0">
                <p className="truncate text-xs font-medium">{n.title}</p>
                <p className="text-[10px] capitalize text-muted-foreground">
                  {n.status} · {timeAgo(n.created_at)}
                </p>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-border/60 p-2">
          <Link
            to="/admin/notifications"
            className="block rounded-lg bg-muted/40 px-3 py-1.5 text-center text-xs font-medium hover:bg-muted"
          >
            View all
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================== */
/* Global search dialog                                            */
/* ============================================================== */
function GlobalSearchDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (to: string) => void;
}) {
  const [q, setQ] = useState("");
  const searchFn = useServerFn(adminGlobalSearch);
  const results = useQuery({
    queryKey: ["admin-global-search", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: q.trim().length >= 2,
    staleTime: 5_000,
  });
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const groups = useMemo(() => {
    const all = results.data?.hits ?? [];
    const by = new Map<SearchHit["kind"], SearchHit[]>();
    for (const h of all) {
      if (!by.has(h.kind)) by.set(h.kind, []);
      by.get(h.kind)!.push(h);
    }
    return Array.from(by.entries());
  }, [results.data]);
  const labelFor = (k: SearchHit["kind"]) =>
    ({
      user: "Users",
      subject: "Subjects",
      chapter: "Chapters",
      mcq: "MCQs",
      quiz: "Quizzes",
      mock: "Mock Tests",
      note: "Short Notes",
    })[k];

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command shouldFilter={false}>
        <CommandInput
          placeholder="Search users, subjects, chapters, MCQs, quizzes, mocks, notes…"
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          {q.trim().length < 2 ? (
            <CommandEmpty>Type at least 2 characters to search.</CommandEmpty>
          ) : results.isLoading ? (
            <CommandEmpty>Searching…</CommandEmpty>
          ) : groups.length === 0 ? (
            <CommandEmpty>No results found.</CommandEmpty>
          ) : (
            groups.map(([kind, hits]) => (
              <CommandGroup key={kind} heading={labelFor(kind)}>
                {hits.map((h) => (
                  <CommandItem
                    key={`${h.kind}-${h.id}`}
                    value={`${h.kind}-${h.id}`}
                    onSelect={() => onSelect(h.to)}
                  >
                    <span className="truncate">{h.label}</span>
                    {h.sub && (
                      <span className="ml-auto text-[10px] capitalize text-muted-foreground">
                        {h.sub}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

/* ============================================================== */
/* Welcome hero                                                    */
/* ============================================================== */
function WelcomeHero({ overview }: { overview?: AdminPremiumOverview }) {
  const user = useAppStore((s) => s.user);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const uptime = overview?.system.uptime_pct ?? 0;
  const sparkData = overview?.engagement.series.slice(-12).map((p) => p.dau) ?? [];
  const health = overview?.system.health ?? [];
  const worst: "healthy" | "warning" | "down" = health.some((h) => h.status === "down")
    ? "down"
    : health.some((h) => h.status === "warning")
      ? "warning"
      : "healthy";
  const statusMeta = {
    healthy: { Icon: CheckCircle2, cls: "text-emerald-400", label: "All Systems Operational" },
    warning: { Icon: AlertTriangle, cls: "text-amber-400", label: "Degraded — investigating" },
    down: { Icon: XCircle, cls: "text-rose-400", label: "Service disruption" },
  }[worst];
  // server time = server_time_iso + local elapsed ticks
  const serverTime = useMemo(() => {
    if (!overview?.system.server_time_iso) return now;
    const base = new Date(overview.system.server_time_iso).getTime();
    // refresh per-tick using local interval; rebase whenever overview changes
    return new Date(base + (Date.now() - +new Date(overview.system.server_time_iso)));
  }, [overview?.system.server_time_iso, now]);

  return (
    <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />
      <div className="relative">
        <h1 className="font-display text-2xl font-bold tracking-tight md:text-[26px]">
          Welcome back, <span className="text-gradient">{user?.name ?? "Admin"}!</span> 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Good to see you again. Monitor and manage your platform efficiently.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {/* System Status */}
          <div className="rounded-2xl border border-border/60 bg-background/40 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold">
              <statusMeta.Icon className={`h-3.5 w-3.5 ${statusMeta.cls}`} />
              System Status
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{statusMeta.label}</p>
            <Sparkline data={sparkData.length ? sparkData : []} className="mt-2 h-6 w-full" />
            {sparkData.length === 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">No activity yet</p>
            )}
          </div>
          {/* Uptime */}
          <div className="rounded-2xl border border-border/60 bg-background/40 p-3.5">
            <p className="text-[11px] font-semibold text-muted-foreground">Uptime</p>
            <p
              className={`font-display mt-1 text-2xl font-bold tabular-nums ${
                overview
                  ? uptime >= 99
                    ? "text-emerald-400"
                    : uptime >= 95
                      ? "text-amber-400"
                      : "text-rose-400"
                  : "text-muted-foreground"
              }`}
            >
              {overview ? `${uptime.toFixed(2)}%` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {overview ? `Last 24h · ${overview.system.api_errors_24h ?? 0} errors` : "Loading…"}
            </p>
          </div>
          {/* Server Time */}
          <div className="rounded-2xl border border-border/60 bg-background/40 p-3.5">
            <p className="text-[11px] font-semibold text-muted-foreground">Server Time (UTC)</p>
            <p className="font-display mt-1 text-2xl font-bold tabular-nums">
              {serverTime.toISOString().slice(11, 19)}
            </p>
            <p className="text-[10px] text-muted-foreground">{fmtDate(serverTime)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Sparkline({ data, className }: { data: number[]; className?: string }) {
  if (data.length === 0) return null;
  const w = 100,
    h = 24;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${i * step},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
  const id = `sp-${pts.length}-${(data[0] ?? 0).toFixed(0)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className}>
      <defs>
        <linearGradient id={id} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--neon-purple)" />
          <stop offset="100%" stopColor="var(--neon-blue)" />
        </linearGradient>
      </defs>
      <polyline
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

/* ============================================================== */
/* Quick actions                                                   */
/* ============================================================== */
function QuickActionsPanel() {
  type Action = { t: string; i: typeof PlusCircle; to: string; search?: Record<string, string> };
  const actions: Action[] = [
    { t: "Create MCQ", i: ListChecks, to: "/admin/mcq", search: { action: "create" } },
    { t: "Create Quiz", i: Timer, to: "/admin/quiz", search: { action: "create" } },
    { t: "Create Mock Test", i: Trophy, to: "/admin/mock-test", search: { action: "create" } },
    {
      t: "Add Chapter",
      i: BookOpen,
      to: "/admin/academic-manager",
      search: { action: "create-chapter" },
    },
    {
      t: "Add Subject",
      i: Layers,
      to: "/admin/academic-manager",
      search: { action: "create-subject" },
    },
    {
      t: "Broadcast Notice",
      i: Megaphone,
      to: "/admin/notifications",
      search: { action: "broadcast" },
    },
    { t: "Add User", i: UserPlus, to: "/admin/users", search: { action: "create" } },
    { t: "View All", i: LayoutGrid, to: "/admin/analytics" },
  ];
  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center gap-2">
        <PlusCircle className="h-4 w-4 text-[var(--neon-purple)]" />
        <h2 className="font-display text-sm font-bold">Quick Actions</h2>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2.5">
        {actions.map((a) => (
          <Link
            key={a.t}
            to={a.to as never}
            search={a.search as never}
            className="group flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-background/40 p-2.5 text-center transition-all hover:-translate-y-0.5 hover:border-[var(--neon-purple)]/50 hover:shadow-glow"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--neon-purple)]/15 to-[var(--neon-blue)]/15 text-[var(--neon-purple)] transition-colors group-hover:from-[var(--neon-purple)]/30 group-hover:to-[var(--neon-blue)]/30">
              <a.i className="h-4 w-4" />
            </span>
            <span className="text-[10px] font-semibold leading-tight">{a.t}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ============================================================== */
/* KPI Strip                                                       */
/* ============================================================== */
type KpiTile = {
  l: string;
  v: string;
  sub: string;
  delta: number;
  i: typeof Users;
  tint: string;
  to: string;
};
function KPIStrip({ overview, loading }: { overview?: AdminPremiumOverview; loading: boolean }) {
  const k = overview?.kpi;
  const tiles: KpiTile[] = [
    {
      l: "Active Students",
      v: fmtNum(k?.active_students),
      sub: "Students",
      delta: k?.active_students_delta_pct ?? 0,
      i: Users,
      tint: "text-sky-400 bg-sky-500/15",
      to: "/admin/users",
    },
    {
      l: "Live Exams",
      v: fmtNum(k?.live_exams),
      sub: fmtNum(k?.live_exams),
      delta: k?.live_exams_delta_pct ?? 0,
      i: Trophy,
      tint: "text-amber-400 bg-amber-500/15",
      to: "/admin/mock-test",
    },
    {
      l: "Tests Completed",
      v: fmtNum(k?.tests_completed),
      sub: fmtNum(k?.tests_completed),
      delta: k?.tests_completed_delta_pct ?? 0,
      i: ClipboardList,
      tint: "text-emerald-400 bg-emerald-500/15",
      to: "/admin/analytics",
    },
    {
      l: "Questions in Bank",
      v: fmtNum(k?.questions_in_bank),
      sub: "Questions",
      delta: k?.questions_in_bank_delta_pct ?? 0,
      i: HelpCircle,
      tint: "text-violet-400 bg-violet-500/15",
      to: "/admin/question-bank",
    },
    {
      l: "Active Sessions",
      v: fmtNum(k?.active_sessions),
      sub: fmtNum(k?.active_sessions),
      delta: k?.active_sessions_delta_pct ?? 0,
      i: Activity,
      tint: "text-fuchsia-400 bg-fuchsia-500/15",
      to: "/admin/analytics",
    },
    {
      l: "New Registrations",
      v: fmtNum(k?.new_registrations),
      sub: fmtNum(k?.new_registrations),
      delta: k?.new_registrations_delta_pct ?? 0,
      i: UserPlus,
      tint: "text-pink-400 bg-pink-500/15",
      to: "/admin/users",
    },
  ];
  return (
    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map((t) => {
        const up = t.delta >= 0;
        return (
          <Link
            key={t.l}
            to={t.to as never}
            className="glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${t.tint}`}>
                <t.i className="h-3.5 w-3.5" />
              </span>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t.l}
              </p>
            </div>
            <p className="font-display mt-3 text-[26px] font-bold leading-none tabular-nums">
              {loading ? "—" : t.v}
            </p>
            <div className="mt-2 flex items-center justify-between">
              <span className="truncate text-[10px] text-muted-foreground">{t.sub}</span>
              <span
                className={`flex items-center gap-0.5 text-[10px] font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}
              >
                {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(t.delta).toFixed(1)}%
              </span>
            </div>
            <p className="mt-0.5 text-[9px] text-muted-foreground">vs last 7 days</p>
          </Link>
        );
      })}
    </div>
  );
}

/* ============================================================== */
/* Platform Overview                                               */
/* ============================================================== */
function PlatformOverviewCard({
  overview,
  periodDays,
  onChangePeriod,
}: {
  overview?: AdminPremiumOverview;
  periodDays: 7 | 30 | 90;
  onChangePeriod: (d: 7 | 30 | 90) => void;
}) {
  const points = overview?.platform_overview ?? [];
  const total = overview?.platform_overview_total ?? 0;
  const delta = overview?.platform_overview_delta_pct ?? 0;
  const up = delta >= 0;
  const options: { v: 7 | 30 | 90; label: string }[] = [
    { v: 7, label: "7D" },
    { v: 30, label: "30D" },
    { v: 90, label: "90D" },
  ];

  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-display text-base font-bold">Platform Overview</h3>
          <p className="text-[11px] text-muted-foreground">
            Students Activity Overview (Last {periodDays} Days)
          </p>
        </div>
        <div
          role="tablist"
          aria-label="Period"
          className="flex items-center gap-1 rounded-xl border border-border/60 bg-background/40 p-0.5 text-[11px]"
        >
          {options.map((o) => (
            <button
              key={o.v}
              role="tab"
              aria-selected={periodDays === o.v}
              onClick={() => onChangePeriod(o.v)}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                periodDays === o.v
                  ? "bg-cta-gradient text-white shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-baseline gap-3">
        <p className="font-display text-3xl font-bold tabular-nums">{fmtNum(total)}</p>
        <span
          className={`flex items-center gap-0.5 text-xs font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}
        >
          {up ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          {Math.abs(delta).toFixed(1)}%
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">vs previous {periodDays} days</p>
      <AreaChart points={points} />
    </section>
  );
}

function AreaChart({ points }: { points: { date: string; value: number }[] }) {
  const w = 600,
    h = 200;
  if (points.length === 0) {
    return (
      <div className="mt-4 flex h-[200px] items-center justify-center text-xs text-muted-foreground">
        No activity data yet.
      </div>
    );
  }
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const pts = points.map((p, i) => `${i * step},${h - (p.value / max) * (h - 20)}`).join(" ");
  const yTicks = [0, max * 0.25, max * 0.5, max * 0.75, max];
  return (
    <div className="mt-4">
      <div className="flex gap-3">
        <div className="flex flex-col justify-between py-1 text-[9px] text-muted-foreground">
          {[...yTicks].reverse().map((t, i) => (
            <span key={i}>{fmtNum(Math.round(t))}</span>
          ))}
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[200px] w-full">
          <defs>
            <linearGradient id="po-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--neon-purple)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="var(--neon-purple)" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="po-stroke" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--neon-purple)" />
              <stop offset="100%" stopColor="var(--neon-blue)" />
            </linearGradient>
          </defs>
          {yTicks.map((_, i) => (
            <line
              key={i}
              x1="0"
              x2={w}
              y1={(h / 4) * i}
              y2={(h / 4) * i}
              stroke="currentColor"
              strokeOpacity="0.06"
            />
          ))}
          <polygon fill="url(#po-area)" points={`0,${h} ${pts} ${w},${h}`} />
          <polyline fill="none" stroke="url(#po-stroke)" strokeWidth="2.2" points={pts} />
        </svg>
      </div>
      <div className="ml-7 mt-1 flex justify-between text-[9px] text-muted-foreground">
        {[
          0,
          Math.floor(points.length / 4),
          Math.floor(points.length / 2),
          Math.floor((points.length * 3) / 4),
          points.length - 1,
        ].map((i) => (
          <span key={i}>{points[i]?.date.slice(5)}</span>
        ))}
      </div>
    </div>
  );
}

/* ============================================================== */
/* Devices + Browsers                                              */
/* ============================================================== */
function DeviceBrowserCard({ overview }: { overview?: AdminPremiumOverview }) {
  const devices = overview?.devices ?? [];
  const browsers = overview?.browsers ?? [];

  const devIcon = (n: string) =>
    n === "Mobile" ? Smartphone : n === "Desktop" ? Monitor : n === "Tablet" ? Tablet : Globe;
  const brIcon = (n: string) => (n === "Chrome" || n === "Edge" ? Chrome : Globe);

  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <h3 className="font-display text-base font-bold">Device &amp; Browser Analytics</h3>
      <div className="mt-4 grid grid-cols-2 gap-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Most Used Devices
          </p>
          <ul className="mt-3 space-y-3">
            {devices.length === 0 ? (
              <li className="text-xs text-muted-foreground">No data yet.</li>
            ) : (
              devices.map((d) => {
                const Icon = devIcon(d.name);
                return (
                  <li key={d.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {d.name}
                      </span>
                      <span className="font-semibold tabular-nums">{d.pct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/50">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)]"
                        style={{ width: `${Math.min(100, d.pct)}%` }}
                      />
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Top Browsers
          </p>
          <ul className="mt-3 space-y-3">
            {browsers.length === 0 ? (
              <li className="text-xs text-muted-foreground">No data yet.</li>
            ) : (
              browsers.map((b) => {
                const Icon = brIcon(b.name);
                return (
                  <li key={b.name}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {b.name}
                      </span>
                      <span className="font-semibold tabular-nums">{b.pct.toFixed(1)}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/50">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500"
                        style={{ width: `${Math.min(100, b.pct)}%` }}
                      />
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ============================================================== */
/* Top Subjects                                                    */
/* ============================================================== */
function TopSubjectsCard({ overview }: { overview?: AdminPremiumOverview }) {
  const rows = overview?.top_subjects ?? [];
  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Top Performing Subjects</h3>
        <Link
          to="/admin/analytics"
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          View All
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 text-xs text-muted-foreground">No completed attempts yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-medium">{r.name}</span>
                <span className="font-semibold tabular-nums">{r.accuracy}%</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-pink)]"
                  style={{ width: `${Math.min(100, r.accuracy)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ============================================================== */
/* Exam Participation (donut)                                      */
/* ============================================================== */
function ExamParticipationCard({
  overview,
  scope,
  onChangeScope,
}: {
  overview?: AdminPremiumOverview;
  scope: "all" | "month";
  onChangeScope: (s: "all" | "month") => void;
}) {
  const p = overview?.exam_participation;
  const rate = p?.rate_pct ?? 0;
  const joined = p?.joined ?? 0;
  const invited = p?.invited ?? 0;
  const notJoined = Math.max(0, invited - joined);
  const c = 2 * Math.PI * 42;
  const dash = (rate / 100) * c;
  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Exam Participation</h3>
        <div
          role="tablist"
          className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 p-0.5 text-[10px]"
        >
          <button
            role="tab"
            aria-selected={scope === "month"}
            onClick={() => onChangeScope("month")}
            className={`rounded-md px-2 py-0.5 transition-colors ${scope === "month" ? "bg-cta-gradient text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            This Month
          </button>
          <button
            role="tab"
            aria-selected={scope === "all"}
            onClick={() => onChangeScope("all")}
            className={`rounded-md px-2 py-0.5 transition-colors ${scope === "all" ? "bg-cta-gradient text-white" : "text-muted-foreground hover:text-foreground"}`}
          >
            All Time
          </button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-[120px_1fr] items-center gap-3">
        <div className="relative h-[120px] w-[120px]">
          <svg viewBox="0 0 100 100" className="-rotate-90">
            <circle
              cx="50"
              cy="50"
              r="42"
              stroke="currentColor"
              strokeOpacity="0.1"
              strokeWidth="10"
              fill="none"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              stroke="url(#donut-g)"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
            />
            <defs>
              <linearGradient id="donut-g" x1="0" x2="1">
                <stop offset="0%" stopColor="var(--neon-purple)" />
                <stop offset="100%" stopColor="var(--neon-pink)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-display text-2xl font-bold leading-none">{rate}%</p>
            <p className="text-[9px] text-muted-foreground">Participation</p>
          </div>
        </div>
        <ul className="space-y-2 text-[11px]">
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-[var(--neon-purple)]" />
            <span className="font-medium">Joined</span>
            <span className="ml-auto text-muted-foreground tabular-nums">
              {fmtNum(joined)} ({rate}%)
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" />
            <span className="font-medium">Not Joined</span>
            <span className="ml-auto text-muted-foreground tabular-nums">
              {fmtNum(notJoined)} ({100 - rate}%)
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

/* ============================================================== */
/* Student Engagement                                              */
/* ============================================================== */
function StudentEngagementCard({ overview }: { overview?: AdminPremiumOverview }) {
  const e = overview?.engagement;
  const [range, setRange] = useState<EngagementRange>("weekly");
  const engFn = useServerFn(adminEngagementSeries);
  const engQ = useQuery({
    queryKey: ["admin-engagement-series", range],
    queryFn: () => engFn({ data: { range } }),
    refetchInterval: 15_000,
  });
  const series = engQ.data?.series ?? [];
  const max = Math.max(1, ...series.map((s) => s.dau));
  const up = (e?.delta_pct ?? 0) >= 0;
  const rangeLabel = range === "daily" ? "Daily Active Users" : range === "weekly" ? "Weekly Active Users" : "Monthly Active Users";
  const fmtBucketLabel = (k: string) => {
    if (range === "monthly") {
      const [y, m] = k.split("-");
      const d = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
      return d.toLocaleString(undefined, { month: "short", year: "numeric" });
    }
    return k;
  };
  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-bold">Student Engagement</h3>
        <div className="flex items-center gap-1 rounded-full bg-muted/40 p-0.5 text-[10px] font-semibold">
          {(["daily", "weekly", "monthly"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-full px-2 py-1 capitalize transition ${
                range === r ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={range === r}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {rangeLabel}
      </p>
      <div className="flex items-baseline gap-2">
        <p className="font-display text-3xl font-bold tabular-nums">{fmtNum(e?.dau_today)}</p>
        <span
          className={`flex items-center gap-0.5 text-xs font-semibold ${up ? "text-emerald-400" : "text-rose-400"}`}
        >
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(e?.delta_pct ?? 0).toFixed(1)}%
        </span>
      </div>
      <div className="mt-4 flex h-[110px] items-end gap-1.5">
        {engQ.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : series.length === 0 || series.every((s) => s.dau === 0) ? (
          <p className="text-xs text-muted-foreground">No engagement data yet.</p>
        ) : (
          series.map((s) => (
            <div key={s.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-gradient-to-t from-[var(--neon-purple)] to-[var(--neon-pink)]"
                style={{ height: `${(s.dau / max) * 100}%`, minHeight: 2 }}
                title={`${fmtBucketLabel(s.date)} · ${s.dau} active`}
              />
            </div>
          ))
        )}
      </div>
    </section>
  );
}

/* ============================================================== */
/* Recent Activity                                                 */
/* ============================================================== */
type RecentRow = AdminControlCenter["recent_activity"][number];
function RecentActivityCard({ cc }: { cc?: AdminControlCenter }) {
  const [items, setItems] = useState<RecentRow[]>([]);
  useEffect(() => {
    if (cc?.recent_activity) setItems(cc.recent_activity);
  }, [cc?.recent_activity]);
  useEffect(() => {
    const ch = supabase
      .channel(`admin-live-activity-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_events" },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          setItems((prev) =>
            [
              {
                id: String(row.id),
                event_type: String(row.event_type ?? ""),
                element_label: (row.element_label as string) ?? null,
                page_path: (row.page_path as string) ?? null,
                module: (row.module as string) ?? null,
                user_id: (row.user_id as string) ?? null,
                user_name: null,
                created_at: String(row.created_at ?? new Date().toISOString()),
              },
              ...prev,
            ].slice(0, 20),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const iconFor = (t: string) => {
    switch (t) {
      case "login":
        return Users;
      case "logout":
        return Users;
      case "submit":
        return ClipboardList;
      case "crud":
        return PlusCircle;
      case "admin_action":
        return Crown;
      case "page_view":
        return Activity;
      default:
        return Activity;
    }
  };

  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Recent Activity</h3>
        <Link
          to="/admin/analytics"
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          View All
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="mt-3 max-h-[260px] space-y-2 overflow-y-auto pr-1">
          {items.slice(0, 6).map((a) => {
            const Icon = iconFor(a.event_type);
            return (
              <li
                key={a.id}
                className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-background/40 p-2.5"
              >
                <span className="mt-0.5 text-[10px] text-muted-foreground tabular-nums">
                  {timeAgo(a.created_at)}
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{a.element_label ?? a.event_type}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {a.user_name ?? "User"} {a.module ? `· ${a.module}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ============================================================== */
/* System Health                                                   */
/* ============================================================== */
function SystemHealthCard({ overview }: { overview?: AdminPremiumOverview }) {
  const items = overview?.system.health ?? [];
  const badge = (s: string) =>
    s === "healthy"
      ? "bg-emerald-500/15 text-emerald-400"
      : s === "warning"
        ? "bg-amber-500/15 text-amber-400"
        : "bg-rose-500/15 text-rose-400";
  const Icon = (key: string) => {
    switch (key) {
      case "server":
        return Server;
      case "db":
        return DatabaseIcon;
      case "storage":
        return Layers;
      case "api":
        return Activity;
      default:
        return CircleDot;
    }
  };
  const sIcon = (s: string) =>
    s === "healthy" ? CheckCircle2 : s === "warning" ? AlertTriangle : XCircle;
  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <h3 className="font-display text-sm font-bold">System Health</h3>
      <ul className="mt-3 space-y-2">
        {items.map((h) => {
          const I = Icon(h.key);
          const S = sIcon(h.status);
          return (
            <li
              key={h.key}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
                <I className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{h.label}</p>
                <p className="truncate text-[10px] text-muted-foreground">{h.detail}</p>
              </div>
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge(h.status)}`}
              >
                <S className="h-3 w-3" />
                {h.status === "healthy" ? "Healthy" : h.status === "warning" ? "Warning" : "Down"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ============================================================== */
/* Recent Uploads                                                  */
/* ============================================================== */
type Snap =
  | {
      recentUploads: {
        id: string;
        title: string;
        kind: string;
        created_at: string;
        status: string;
      }[];
    }
  | undefined;
function RecentUploadsCard({ snap }: { snap: Snap }) {
  const KIND_META: Record<
    string,
    { i: typeof ListChecks; tint: string; label: string; to: string }
  > = {
    mcq: {
      i: ListChecks,
      tint: "text-fuchsia-300 bg-fuchsia-500/15",
      label: "MCQ",
      to: "/admin/mcq",
    },
    note: {
      i: FileText,
      tint: "text-cyan-300 bg-cyan-500/15",
      label: "Note",
      to: "/admin/short-notes",
    },
    flash: {
      i: Layers,
      tint: "text-violet-300 bg-violet-500/15",
      label: "Card",
      to: "/admin/flash-cards",
    },
    video: {
      i: PlayCircle,
      tint: "text-sky-300 bg-sky-500/15",
      label: "Class",
      to: "/admin/classes",
    },
    qbank: {
      i: DatabaseIcon,
      tint: "text-amber-300 bg-amber-500/15",
      label: "QBank",
      to: "/admin/question-bank",
    },
    quiz: {
      i: Timer,
      tint: "text-emerald-300 bg-emerald-500/15",
      label: "Quiz",
      to: "/admin/quiz",
    },
  };
  const data = snap?.recentUploads ?? [];
  return (
    <section className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold">Recent Uploads</h3>
        <Link
          to="/admin/analytics"
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          View All
        </Link>
      </div>
      {data.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No uploads yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.slice(0, 6).map((u) => {
            const meta = KIND_META[u.kind] ?? KIND_META.mcq;
            return (
              <li key={`${u.kind}-${u.id}`}>
                <Link
                  to={meta.to as never}
                  search={{ focus: u.id } as never}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5 transition-colors hover:bg-muted/40"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.tint}`}
                  >
                    <meta.i className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-medium sm:truncate">{u.title || "Untitled"}</p>
                    <p className="break-words text-[10px] text-muted-foreground sm:truncate">
                      {meta.label} · {timeAgo(u.created_at)}
                    </p>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function FooterRow() {
  return (
    <footer className="glass shadow-card-soft mt-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-2 text-[11px] text-muted-foreground">
      <span>© {new Date().getFullYear()} CA Aspire BD. All rights reserved.</span>
      <div className="flex items-center gap-4">
        <Link to="/privacy" className="hover:text-foreground">
          Privacy Policy
        </Link>
        <Link to="/terms" className="hover:text-foreground">
          Terms of Service
        </Link>
        <Link to="/security" className="hover:text-foreground">
          Support
        </Link>
      </div>
    </footer>
  );
}
