import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { lazy, memo, Suspense, useEffect, useMemo, useState } from "react";
import { useModuleVisibility } from "@/hooks/use-module-visibility";
import { studentDashboardSnapshot } from "@/lib/student-dashboard.functions";
import { studentAdvancedAnalytics } from "@/lib/student-advanced-analytics.functions";
import { useAppStore } from "@/stores/app-store";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyNotifications } from "@/hooks/use-my-notifications";

const CompletionTracker = lazy(() =>
  import("./CompletionTracker").then((m) => ({ default: m.CompletionTracker })),
);
const AdvancedAnalyticsSection = lazy(() =>
  import("./AdvancedAnalyticsSection").then((m) => ({ default: m.AdvancedAnalyticsSection })),
);

/** Mount children only after the browser is idle to keep initial paint fast. */
function DeferUntilIdle({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === "function") {
      const id = w.requestIdleCallback(() => setReady(true), { timeout: 1500 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setReady(true), 200);
    return () => clearTimeout(t);
  }, []);
  if (!ready) return <>{fallback ?? null}</>;
  return <>{children}</>;
}
import { CountUp } from "@/components/realtime/CountUp";
import { AccuracyOverTimeCard } from "@/components/dashboard/AccuracyOverTimeCard";
import { stripAutoTitle } from "@/lib/strip-auto";
import {
  ListChecks,
  Trophy,
  Target,
  Flame,
  ArrowRight,
  Bell,
  TrendingUp,
  Clock,
  Sparkles,
  Activity,
  Zap,
  BookOpen,
  Calendar as CalendarIcon,
} from "lucide-react";

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function greeting() {
  return "Welcome back";
}

// Tiny inline sparkline
const Sparkline = memo(function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * 100},${30 - (v / max) * 28}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline points={`0,30 ${pts} 100,30`} fill={color} opacity="0.12" />
    </svg>
  );
});

export function DashContent() {
  const { isPathHidden } = useModuleVisibility();
  const mockTestHidden = isPathHidden("/mock-test");

  const user = useAppStore((s) => s.user);
  const userName = user?.name ?? "Learner";

  const fetchSnapshot = useServerFn(studentDashboardSnapshot);
  // Read once at mount — cheap and stable per device for the lifetime of
  // a session. Wrapped in try/catch because old browsers / SSR contexts
  // may not expose Intl.DateTimeFormat().resolvedOptions().timeZone.
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  })();
  const { data } = useQuery({
    queryKey: ["student-dashboard-snapshot", "submission-counts-v3", user?.id ?? "pending", tz],
    queryFn: () => fetchSnapshot({ data: { tz } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  // Dedupes with AdvancedAnalyticsSection's query — gives us real MCQ counts + goals.
  const fetchAdvanced = useServerFn(studentAdvancedAnalytics);
  const { data: adv } = useQuery({
    queryKey: ["student-advanced-analytics"],
    queryFn: () => fetchAdvanced(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const counts = data?.counts;
  const bars = data?.bars ?? [0, 0, 0, 0, 0, 0, 0];
  const subjects = useMemo(() => {
    const list = data?.subjects ?? [];
    const palette = [
      "var(--neon-purple)",
      "var(--neon-blue)",
      "var(--neon-pink)",
      "oklch(0.75 0.15 200)",
      "oklch(0.7 0.2 140)",
    ];
    return list
      .slice(0, 5)
      .map((s, i) => ({ n: s.name, p: s.progress, c: s.color ?? palette[i % palette.length] }));
  }, [data]);

  // Real MCQ-derived numbers (questions, not sessions)
  const mcqsAnswered = adv?.totals.answered ?? 0;
  const mcqsToday = adv?.mcqCounts.today ?? 0;
  const mcqsWeek = adv?.mcqCounts.week ?? 0;
  const mcqsMonth = adv?.mcqCounts.month ?? 0;
  const dailyTarget = adv?.goals.daily.target ?? 0;
  const dailyPercent = adv?.goals.daily.percent ?? 0;

  const stats = [
    {
      i: Flame,
      l: "Current Streak",
      v: data?.streak ?? 0,
      suffix: " days",
      d: "Keep it going",
      tone: "var(--neon-pink)",
    },
    {
      i: Target,
      l: "Accuracy",
      v: data?.accuracy ?? 0,
      suffix: "%",
      d: `${counts?.attempts ?? 0} attempts`,
      tone: "var(--neon-purple)",
    },
    {
      i: ListChecks,
      l: "Questions Solved",
      v: mcqsAnswered,
      suffix: "",
      d: `+${mcqsWeek} this week`,
      tone: "var(--neon-blue)",
    },
    {
      i: Trophy,
      l: "Mock Tests",
      v: counts?.mocks ?? 0,
      suffix: "",
      d: `+${counts?.mocksThisWeek ?? 0} this week`,
      tone: "oklch(0.78 0.17 70)",
    },
    {
      i: BookOpen,
      l: "Quizzes",
      v: counts?.quizzes ?? 0,
      suffix: "",
      d: `+${counts?.quizzesThisWeek ?? 0} this week`,
      tone: "oklch(0.7 0.2 200)",
    },
  ];

  const monthlyPct =
    dailyTarget > 0 ? Math.min(100, Math.round((mcqsMonth / (dailyTarget * 30)) * 100)) : 0;
  const todayPct = dailyPercent;

  const recommendations = data?.recommendations ?? [];
  const recentActivity = data?.recentActivity ?? [];
  const { items: myNotifications } = useMyNotifications();
  const liveNotifications = myNotifications.slice().sort((a, b) => {
    const ta = Date.parse(a.sent_at ?? a.created_at ?? "") || 0;
    const tb = Date.parse(b.sent_at ?? b.created_at ?? "") || 0;
    return tb - ta;
  });
  const upcoming = data?.upcomingMock;

  // Calendar grid for current month
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const startWeekday = (monthStart.getDay() + 6) % 7; // Mon=0
  const activeDays = new Set(
    (recentActivity ?? []).map((a) => (a.completed_at ?? "").slice(0, 10)).filter(Boolean),
  );
  const calendarCells: Array<{ d?: number; active?: boolean; isToday?: boolean }> = [];
  for (let i = 0; i < startWeekday; i++) calendarCells.push({});
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const iso = new Date(today.getFullYear(), today.getMonth(), d).toISOString().slice(0, 10);
    calendarCells.push({
      d,
      active: activeDays.has(iso),
      isToday: d === today.getDate(),
    });
  }

  return (
    <main id="main-content" className="space-y-6 animate-fade-in" aria-label="Student dashboard">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden rounded-3xl">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--neon-purple)] via-[oklch(0.55_0.2_270)] to-[var(--neon-blue)]" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/25 blur-3xl animate-float" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-[var(--neon-pink)]/40 blur-3xl animate-float-slow" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="text-white">
            <p className="text-xs uppercase tracking-[0.2em] text-white/70">
              {today.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
            <h1 className="font-display mt-2 text-3xl font-bold sm:text-4xl lg:text-5xl">
              {greeting()}, {userName} <span className="inline-block animate-float">👋</span>
            </h1>
            <p className="mt-3 max-w-lg text-sm text-white/85 sm:text-base">
              {(data?.streak ?? 0) > 0
                ? `You're on a ${data?.streak}-day streak — one focused session keeps the fire alive.`
                : "Keep learning and stay consistent. One focused session changes everything."}
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/mcq-practice"
                className="group inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black shadow-card-soft transition-all hover:scale-[1.03] hover:shadow-glow"
              >
                <Zap className="h-4 w-4 text-[var(--neon-purple)]" />
                Start Practice
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {!mockTestHidden && (
                <Link
                  to="/mock-test"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-xl transition-colors hover:bg-white/20"
                >
                  <Trophy className="h-4 w-4" />
                  Join Mock Test
                </Link>
              )}
            </div>
          </div>

          {/* Hero quick stats */}
          <div className="relative grid grid-cols-3 gap-3 self-end">
            {[
              { l: "Streak", v: data?.streak ?? 0, s: "d", i: Flame },
              { l: "Accuracy", v: data?.accuracy ?? 0, s: "%", i: Target },
              { l: "Solved", v: mcqsAnswered, s: "", i: ListChecks },
            ].map((m) => (
              <div
                key={m.l}
                className="rounded-2xl border border-white/20 bg-white/10 p-3 text-white backdrop-blur-xl transition-transform hover:-translate-y-0.5"
              >
                <m.i className="h-4 w-4 opacity-80" />
                <p className="font-display mt-2 text-xl font-bold">
                  <CountUp value={Number(m.v) || 0} />
                  {m.s}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-white/70">{m.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ STAT STRIP ============ */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((s, idx) => (
          <div
            key={s.l}
            className="glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4 transition-all hover:-translate-y-1 hover:shadow-glow"
          >
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-60"
              style={{ background: s.tone }}
            />
            <div className="flex items-center justify-between">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-glow"
                style={{ background: `linear-gradient(135deg, ${s.tone}, oklch(0.55 0.2 270))` }}
              >
                <s.i className="h-4 w-4" />
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                <TrendingUp className="h-3 w-3" /> live
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{s.l}</p>
            <p className="font-display mt-0.5 text-2xl font-bold">
              <CountUp value={Number(s.v) || 0} />
              {s.suffix}
            </p>
            <div className="mt-2">
              <Sparkline values={bars} color={s.tone} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>

      {/* ============ ACCURACY TREND + TODAY GOAL ============ */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <div>
            <h3 className="font-display text-lg font-bold">Accuracy Trend</h3>
          </div>
          <AccuracyOverTimeCard options={["today", "week"]} />
        </div>

        {/* Today's Goal ring */}
        <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Today's Goal</h3>
              <p className="text-xs text-muted-foreground">Daily target progress</p>
            </div>
            <Sparkles className="h-4 w-4 text-[var(--neon-purple)]" />
          </div>
          <div className="mt-4 flex flex-col items-center">
            <div className="relative h-40 w-40">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="todayGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.25 295)" />
                    <stop offset="100%" stopColor="oklch(0.72 0.2 235)" />
                  </linearGradient>
                </defs>
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  stroke="currentColor"
                  strokeWidth="10"
                  fill="none"
                  className="text-muted/30"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  stroke="url(#todayGrad)"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - todayPct / 100)}`}
                  style={{ transition: "stroke-dashoffset 900ms ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-display text-3xl font-bold">
                  <CountUp value={todayPct} />%
                </p>
                <p className="text-[10px] text-muted-foreground">of daily goal</p>
              </div>
            </div>
            <div className="mt-4 grid w-full grid-cols-3 gap-2 text-center">
              <div>
                <p className="font-display text-sm font-bold">
                  <CountUp value={mcqsToday} />
                </p>
                <p className="text-[10px] text-muted-foreground">Today</p>
              </div>
              <div>
                <p className="font-display text-sm font-bold">
                  <CountUp value={data?.streak ?? 0} />
                </p>
                <p className="text-[10px] text-muted-foreground">Streak</p>
              </div>
              <div>
                <p className="font-display text-sm font-bold">
                  <CountUp value={monthlyPct} />%
                </p>
                <p className="text-[10px] text-muted-foreground">Month</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SUBJECT PERFORMANCE + STUDY CALENDAR ============ */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Subject Performance</h3>
              <p className="text-xs text-muted-foreground">Accuracy by subject · live</p>
            </div>
            <Link
              to="/mcq-practice"
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <div className="mt-5 space-y-4">
            {(subjects.length
              ? subjects
              : [{ n: "No subjects yet", p: 0, c: "var(--neon-purple)" }]
            ).map((s) => {
              const weak = s.p > 0 && s.p < 60;
              return (
                <div key={s.n}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: s.c, boxShadow: `0 0 8px ${s.c}` }}
                      />
                      <span className="font-medium">{s.n}</span>
                      {weak && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-semibold text-amber-500">
                          weak
                        </span>
                      )}
                    </div>
                    <span className="font-display text-sm font-bold">{s.p}%</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        width: `${s.p}%`,
                        background: `linear-gradient(90deg, ${s.c}, oklch(0.7 0.2 260))`,
                        boxShadow: `0 0 12px ${s.c}`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Study Calendar */}
        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Study Calendar</h3>
              <p className="text-xs text-muted-foreground">
                {today.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </p>
            </div>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1">
            {calendarCells.map((c, i) => (
              <div
                key={i}
                className={`flex aspect-square items-center justify-center rounded-lg text-[11px] font-medium transition-all ${
                  !c.d
                    ? ""
                    : c.isToday
                      ? "bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-glow"
                      : c.active
                        ? "bg-[var(--neon-purple)]/20 text-foreground ring-1 ring-[var(--neon-purple)]/40"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {c.d ?? ""}
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--neon-purple)]/60" /> Active
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)]" />{" "}
              Today
            </span>
          </div>
        </div>
      </section>

      {/* ============ ADVANCED ANALYTICS (existing) ============ */}
      <DeferUntilIdle fallback={<Skeleton className="h-72 w-full rounded-3xl" />}>
        <Suspense fallback={<Skeleton className="h-72 w-full rounded-3xl" />}>
          <AdvancedAnalyticsSection />
        </Suspense>
      </DeferUntilIdle>

      {/* ============ MOCK CARD ============ */}
      {!mockTestHidden && (
        <section>
          <div className="relative overflow-hidden rounded-3xl p-px">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--neon-purple)] via-[var(--neon-blue)] to-[var(--neon-pink)] opacity-90 animate-pulse" />
            <div className="relative flex h-full flex-col rounded-[calc(theme(borderRadius.3xl)-1px)] bg-background/90 p-5 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Upcoming Mock
                  </p>
                  <h3 className="font-display mt-1 text-lg font-bold line-clamp-1">
                    {stripAutoTitle(upcoming?.title) || "No mock scheduled"}
                  </h3>
                </div>
                <Clock className="h-5 w-5 text-[var(--neon-purple)]" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="glass rounded-xl py-2 text-center">
                  <p className="font-display text-lg font-bold text-gradient">
                    {upcoming?.total_questions ?? 0}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    Questions
                  </p>
                </div>
                <div className="glass rounded-xl py-2 text-center">
                  <p className="font-display text-lg font-bold text-gradient">
                    {Math.round((upcoming?.duration_seconds ?? 0) / 60)}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
                    Minutes
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
                <p>
                  · <CountUp value={counts?.availableMocks ?? 0} /> mocks available
                </p>
                <p>· Updated {timeAgo(upcoming?.created_at)}</p>
              </div>

              <Link
                to="/mock-test"
                className="bg-cta-gradient mt-auto inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02]"
              >
                Join Mock Test <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* ============ RECENT ACTIVITY + NOTIFICATIONS + RECOMMENDATIONS ============ */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Recent Activity</h3>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <ul className="mt-4 space-y-2">
            {recentActivity.length ? (
              recentActivity.slice(0, 5).map((a, idx) => (
                <li
                  key={a.id}
                  className="relative flex items-start gap-3 rounded-xl bg-background/40 p-3 text-xs"
                >
                  <div className="bg-cta-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-glow">
                    <Trophy className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      Attempt · {a.correct}/{a.total}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(a.completed_at)}</p>
                  </div>
                  <span className="font-display text-sm font-bold text-gradient">{a.score}%</span>
                  {idx < Math.min(4, recentActivity.length - 1) && (
                    <span className="absolute left-[27px] top-12 h-2 w-px bg-border" />
                  )}
                </li>
              ))
            ) : (
              <li className="text-xs text-muted-foreground">No activity yet.</li>
            )}
          </ul>
        </div>

        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Notifications</h3>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </div>
          <ul className="mt-4 space-y-3">
            {liveNotifications.slice(0, 3).map((n) => {
              const tone =
                n.priority === "high"
                  ? "var(--neon-pink)"
                  : n.priority === "low"
                    ? "var(--neon-blue)"
                    : "var(--neon-purple)";
              return (
                <li key={n.id} className="flex items-start gap-3 rounded-xl bg-background/40 p-3">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ background: tone, boxShadow: `0 0 10px ${tone}` }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium line-clamp-2">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {timeAgo(n.sent_at ?? n.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
            {!liveNotifications.length && (
              <li className="text-xs text-muted-foreground">No notifications yet.</li>
            )}
          </ul>
          <Link
            to="/notifications"
            className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-border bg-background/40 py-2 text-xs font-semibold transition-colors hover:bg-muted"
          >
            View all
          </Link>
        </div>

        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Smart Picks</h3>
            <Sparkles className="h-4 w-4 text-[var(--neon-purple)]" />
          </div>
          <div className="mt-4 space-y-2">
            {recommendations.length ? (
              recommendations.slice(0, 4).map((r) => (
                <Link
                  key={r.id}
                  to="/quiz"
                  className="glass group flex items-center justify-between rounded-xl p-3 transition-all hover:-translate-y-0.5 hover:shadow-glow"
                >
                  <div className="min-w-0">
                    <p className="font-display text-sm font-bold line-clamp-1">
                      {stripAutoTitle(r.title)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.total_questions} Qs · {Math.round((r.duration_seconds ?? 0) / 60)} min
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">No recommendations yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* ============ COMPLETION TRACKER (existing) ============ */}
      <DeferUntilIdle fallback={<Skeleton className="h-40 w-full rounded-3xl" />}>
        <Suspense fallback={<Skeleton className="h-40 w-full rounded-3xl" />}>
          <CompletionTracker />
        </Suspense>
      </DeferUntilIdle>
    </main>
  );
}
