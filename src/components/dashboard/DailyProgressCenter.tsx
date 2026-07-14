import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "motion/react";
import {
  Activity,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Crown,
  Edit3,
  Flame,
  ListChecks,
  Loader2,
  Sparkles,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
  Check,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { studentDailyProgress } from "@/lib/student-daily-progress.functions";
import {
  getUserGoals,
  setUserGoals,
  type UserGoals,
  DEFAULT_USER_GOALS,
} from "@/lib/user-goals.functions";
import { useRealtimeActivity } from "@/hooks/use-realtime-invalidator";
import { useAppStore } from "@/stores/app-store";
import { CountUp } from "@/components/realtime/CountUp";
import { AccuracyOverTimeCard } from "@/components/dashboard/AccuracyOverTimeCard";
import { useModuleVisibility } from "@/hooks/use-module-visibility";

type RangeKey = "today" | "week" | "month" | "30d";
const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  "30d": "Last 30 Days",
};

// Local fallback used when the `public.user_goals` table isn't created yet.
function goalKey(userId: string) {
  return `edumaster.goals.v1.${userId}`;
}
function readLocalGoals(userId: string): UserGoals {
  if (typeof window === "undefined") return { ...DEFAULT_USER_GOALS };
  try {
    const raw = window.localStorage.getItem(goalKey(userId));
    return raw ? { ...DEFAULT_USER_GOALS, ...JSON.parse(raw) } : { ...DEFAULT_USER_GOALS };
  } catch {
    return { ...DEFAULT_USER_GOALS };
  }
}
function writeLocalGoals(userId: string, value: UserGoals) {
  try {
    window.localStorage.setItem(goalKey(userId), JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function pctDelta(curr: number, prev: number): number {
  if (!prev) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 10) / 10;
}

function motivationalSubtitle(streak: number, accuracy: number, mcqsToday: number) {
  if (mcqsToday === 0) return "A fresh start — let's get one streak going today.";
  if (streak >= 7 && accuracy >= 80)
    return `🔥 ${streak}-day streak with ${accuracy}% accuracy — you're on fire!`;
  if (accuracy >= 80) return "Outstanding accuracy. Keep this rhythm going!";
  if (streak >= 3) return `${streak}-day streak — consistency is paying off.`;
  return "Consistency is the key to success. Keep the momentum going!";
}

// ───── Ring (circular progress) ─────
function Ring({
  value,
  size = 120,
  stroke = 10,
  gradient = "ring-grad",
}: {
  value: number;
  size?: number;
  stroke?: number;
  gradient?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--neon-purple)" />
            <stop offset="100%" stopColor="var(--neon-blue)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-muted/40"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gradient})`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${(pct / 100) * c} ${c}` }}
          transition={{ duration: 1.1, ease: "easeOut" }}
          style={{ filter: "drop-shadow(0 0 8px oklch(0.7 0.25 295 / 0.45))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold tabular-nums text-foreground">
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}

// ───── Top bar: Title + avatar ─────
function PageHeader() {
  const user = useAppStore((s) => s.user);
  const initial = (user?.name ?? user?.email ?? "U").slice(0, 1).toUpperCase();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-glow">
          <Activity className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Daily Progress
          </h1>
          <p className="truncate text-sm text-muted-foreground sm:whitespace-normal">Track your learning. Improve every day.</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 self-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-sm font-bold text-white shadow-glow ring-2 ring-background">
          {initial}
        </div>
      </div>
    </div>
  );
}

// ───── Hero section ─────
function Hero({
  name,
  streak,
  overall,
  motivation,
}: {
  name: string;
  streak: number;
  overall: number;
  motivation: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Greeting + CTA */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl p-6 text-white shadow-glow lg:col-span-2"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.45 0.22 290) 0%, oklch(0.4 0.25 275) 45%, oklch(0.42 0.22 250) 100%)",
        }}
      >
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-[var(--neon-pink)]/25 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Good job, {name}! <span className="inline-block animate-pulse-glow">👋</span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/85">{motivation}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                to="/mcq-practice"
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg transition-transform hover:scale-[1.03]"
              >
                Continue Practice
              </Link>
              <Link
                to="/quiz"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                Start Quiz <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
          {/* Streak card */}
          <div className="relative flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 text-2xl shadow-lg">
              🔥
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-white/70">Study Streak</p>
              <p className="font-display text-4xl font-bold tabular-nums">{streak}</p>
              <p className="text-xs text-white/70">Days</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Overall progress */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="glass shadow-card-soft relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-3xl p-6"
      >
        <p className="self-start text-sm font-semibold">Overall Progress</p>
        <Ring value={overall} size={140} stroke={12} />
        <p className="text-xs text-muted-foreground">Your overall learning progress</p>
        <p className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
          <TrendingUp className="h-3.5 w-3.5" /> 8% vs last week
        </p>
      </motion.div>
    </div>
  );
}

// ───── Stat card ─────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
  delta,
  deltaLabel,
}: {
  icon: typeof ListChecks;
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent: string;
  delta?: number;
  deltaLabel?: string;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full opacity-30 blur-3xl transition-opacity group-hover:opacity-60"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md"
          style={{ background: `linear-gradient(135deg, ${accent}, oklch(0.55 0.22 280))` }}
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="relative mt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="font-display relative mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {(sub || delta !== undefined) && (
        <p className="relative mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          {delta !== undefined && (
            <span
              className={
                up
                  ? "inline-flex items-center text-emerald-500"
                  : "inline-flex items-center text-rose-500"
              }
            >
              {up ? (
                <TrendingUp className="mr-0.5 h-3 w-3" />
              ) : (
                <TrendingDown className="mr-0.5 h-3 w-3" />
              )}
              {up ? "+" : ""}
              {delta}%
            </span>
          )}
          <span>{deltaLabel ?? sub}</span>
        </p>
      )}
    </motion.div>
  );
}

// ───── Chart card ─────
function ChartCard({
  title,
  range,
  onRange,
  options,
  children,
}: {
  title: string;
  range: RangeKey;
  onRange: (r: RangeKey) => void;
  options: RangeKey[];
  children: React.ReactNode;
}) {
  return (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <select
          value={range}
          onChange={(e) => onRange(e.target.value as RangeKey)}
          className="glass rounded-lg border-0 bg-background/40 px-2.5 py-1 text-[11px] font-medium outline-none"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {RANGE_LABEL[o]}
            </option>
          ))}
        </select>
      </div>
      <div className="h-48">{children}</div>
    </div>
  );
}

// ───── MAIN ─────
export function DailyProgressCenter() {
  const fetchFn = useServerFn(studentDailyProgress);
  const fetchGoalsFn = useServerFn(getUserGoals);
  const saveGoalsFn = useServerFn(setUserGoals);
  const qc = useQueryClient();
  const activity = useRealtimeActivity();
  const lastRealtimeActivityRef = useRef(activity);
  const { isPathHidden } = useModuleVisibility();
  const qnsBankHidden = isPathHidden("/qns-bank");
  const user = useAppStore((s) => s.user);
  const uid = user?.id ?? "anon";
  const [editing, setEditing] = useState<null | "daily" | "weekly" | "monthly">(null);
  const [savedFlash, setSavedFlash] = useState<null | "daily" | "weekly" | "monthly">(null);

  const { data, isLoading } = useQuery({
    queryKey: ["student-daily-progress"],
    queryFn: () => fetchFn(),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  // Goals — server-backed via Supabase (RLS scoped to auth.uid()); on first
  // load uses cached localStorage as initial data to avoid flashing defaults.
  const goalsQuery = useQuery({
    queryKey: ["user-goals", uid],
    queryFn: () => fetchGoalsFn(),
    enabled: !!user?.id,
    initialData: () => readLocalGoals(uid),
    staleTime: 60_000,
  });
  const goals: UserGoals = goalsQuery.data ?? readLocalGoals(uid);
  useEffect(() => {
    if (goalsQuery.data && user?.id) writeLocalGoals(uid, goalsQuery.data);
  }, [goalsQuery.data, uid, user?.id]);

  const saveGoalsMut = useMutation({
    mutationFn: (patch: { daily?: number; weekly?: number; monthly?: number }) =>
      saveGoalsFn({ data: patch }),
    onSuccess: (next, _vars) => {
      qc.setQueryData(["user-goals", uid], next);
      writeLocalGoals(uid, next);
    },
  });

  useEffect(() => {
    if (activity === lastRealtimeActivityRef.current) return;
    lastRealtimeActivityRef.current = activity;
    void qc.invalidateQueries({
      queryKey: ["student-daily-progress"],
      refetchType: "active",
    });
  }, [activity, qc]);

  const [trendRange, setTrendRange] = useState<RangeKey>("week");
  

  const today = data?.today;
  const week = data?.week;
  const month = data?.month;
  const totals = data?.totals;
  const subjects = useMemo(() => data?.subjects ?? [], [data]);
  const series = useMemo(() => data?.series ?? [], [data]);
  const timeline = data?.timeline ?? [];

  const trendData = useMemo(() => {
    const n =
      trendRange === "today" ? 1 : trendRange === "week" ? 7 : trendRange === "month" ? 30 : 30;
    return series.slice(-n).map((d) => ({ label: d.label, value: d.mcqs }));
  }, [series, trendRange]);


  if (isLoading && !data) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-3xl bg-muted/30" />
        <div className="h-48 animate-pulse rounded-3xl bg-muted/30" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted/30" />
          ))}
        </div>
        <div className="text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" /> Loading your progress…
        </div>
      </div>
    );
  }

  const name = (user?.name ?? "Learner").split(" ")[0];
  const streak = today?.streak ?? 0;
  const overallAccuracy = totals?.accuracy ?? 0;
  const mcqsSolved = totals?.mcqs ?? 0;
  const correct = totals?.correct ?? 0;
  const wrong = totals?.wrong ?? 0;
  const accuracyRate = totals?.accuracy ?? 0;

  // Deltas (this week vs prior week — server-provided)
  const wkAccuracy = week?.deltaAccuracy ?? 0;
  const wkAttemptsDelta = week?.deltaAttempts ?? 0;
  const prevWeekAttempts = Math.max(0, (week?.attempts ?? 0) - wkAttemptsDelta);
  const wkAttemptsPct =
    prevWeekAttempts > 0
      ? Math.round((wkAttemptsDelta / prevWeekAttempts) * 100)
      : wkAttemptsDelta > 0
        ? 100
        : 0;

  // Goal calculations (per-user persisted targets)
  const dailyMcqs = today?.mcqs ?? 0;
  const weeklyMcqs = week?.mcqs ?? 0;
  const monthlyMcqs = month?.mcqs ?? 0;
  const dailyPct = Math.min(100, Math.round((dailyMcqs / Math.max(1, goals.daily)) * 100));
  const weeklyPct = Math.min(100, Math.round((weeklyMcqs / Math.max(1, goals.weekly)) * 100));
  const monthlyPct = Math.min(100, Math.round((monthlyMcqs / Math.max(1, goals.monthly)) * 100));

  // Subject breakdown — only subjects where MCQ Practice has been started.
  // Completion % is computed from submitted MCQs in MCQ Practice.
  const subjBreakdown = [...subjects]
    .filter((s) => s.practiceAttempted)
    .sort((a, b) => b.practiceCompletionPct - a.practiceCompletionPct)
    .slice(0, 5);


  // Donut: Correct vs Wrong
  const unattempted = Math.max(0, (totals?.answered ?? 0) - correct - wrong);
  const total = correct + wrong + unattempted;
  const donut = [
    { name: "Correct", value: correct, color: "oklch(0.72 0.18 150)" },
    { name: "Wrong", value: wrong, color: "oklch(0.7 0.22 25)" },
    { name: "Unattempted", value: unattempted, color: "oklch(0.5 0.02 270)" },
  ];

  // (Subject mastery section was removed — Subject Breakdown already shows per-subject %.)

  // Achievements (earned only — derived from real data)
  const achievements: { icon: typeof Trophy; title: string; sub: string; tone: string }[] = [];
  if ((totals?.mcqs ?? 0) >= 50)
    achievements.push({
      icon: Trophy,
      title: "Quiz Master",
      sub: `Solved ${totals?.mcqs} MCQs`,
      tone: "from-amber-400 to-rose-500",
    });
  if (accuracyRate >= 70)
    achievements.push({
      icon: Award,
      title: "Accuracy Expert",
      sub: `Maintained ${accuracyRate}% accuracy`,
      tone: "from-violet-500 to-fuchsia-500",
    });
  if (streak >= 7)
    achievements.push({
      icon: Flame,
      title: "Consistency Star",
      sub: `${streak} days study streak`,
      tone: "from-orange-400 to-pink-500",
    });
  if ((totals?.mocks ?? 0) >= 5)
    achievements.push({
      icon: Crown,
      title: "Mock Champion",
      sub: `${totals?.mocks} mock tests completed`,
      tone: "from-cyan-400 to-blue-500",
    });

  const subjBest = subjBreakdown[0];
  const subjWeak = [...subjBreakdown].reverse()[0];
  const subjMostMcqs = [...subjects]
    .filter((s) => s.practiceAttempted)
    .sort((a, b) => b.practiceSolved - a.practiceSolved)[0];

  return (
    <div className="space-y-6 px-1 pb-8">
      <PageHeader />

      <Hero
        name={name}
        streak={streak}
        overall={overallAccuracy}
        motivation={motivationalSubtitle(streak, accuracyRate, dailyMcqs)}
      />

      {/* Stat row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={ListChecks}
          label="MCQs Solved"
          value={<CountUp value={mcqsSolved} />}
          accent="oklch(0.7 0.27 295)"
          delta={wkAttemptsPct}
          deltaLabel="vs last week"
        />
        <StatCard
          icon={CheckCircle2}
          label="Correct Answers"
          value={correct}
          accent="oklch(0.72 0.18 150)"
          sub={`${accuracyRate}% Accuracy`}
        />
        <StatCard
          icon={XCircle}
          label="Wrong Answers"
          value={wrong}
          accent="oklch(0.7 0.22 25)"
          sub={`${100 - accuracyRate}% of attempts`}
        />
        <StatCard
          icon={Target}
          label="Accuracy Rate"
          value={`${accuracyRate}%`}
          accent="oklch(0.72 0.18 235)"
          delta={wkAccuracy}
          deltaLabel="vs last week"
        />
      </div>

      {/* Trend charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title="MCQ Solved Trend"
          range={trendRange}
          onRange={setTrendRange}
          options={["today", "week"]}
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="trendG" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--neon-purple)" />
                  <stop offset="100%" stopColor="var(--neon-blue)" />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <RTooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--foreground)" }}
                formatter={(v: number) => [`${v} MCQs`, ""]}
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="url(#trendG)"
                strokeWidth={3}
                dot={{ r: 3, fill: "var(--neon-purple)" }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <AccuracyOverTimeCard options={["today", "week"]} />
      </div>

      {/* Performance + Subject breakdown + Insights */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Donut */}
        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">MCQ Performance</h3>
            <span className="rounded-md bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {RANGE_LABEL.week}
            </span>
          </div>
          <div className="relative flex h-48 items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donut}
                  dataKey="value"
                  innerRadius={52}
                  outerRadius={78}
                  paddingAngle={3}
                  stroke="none"
                >
                  {donut.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <p className="font-display text-2xl font-bold tabular-nums">{total}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Total MCQs
              </p>
            </div>
          </div>
          <div className="mt-2 space-y-1.5 text-xs">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
                <span className="font-semibold tabular-nums">
                  {d.value} ({total ? Math.round((d.value / total) * 100) : 0}%)
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Subject breakdown */}
        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Subject Breakdown</h3>
            {!qnsBankHidden && (
              <Link
                to="/qns-bank"
                className="text-[11px] font-semibold text-[var(--neon-blue)] hover:underline"
              >
                View All
              </Link>
            )}
          </div>
          {subjBreakdown.length === 0 ? (
            <EmptyMini text="Start practicing to see your subject performance." />
          ) : (
            <div className="space-y-3">
              {subjBreakdown.map((s, i) => {
                const colors = [
                  "var(--neon-purple)",
                  "var(--neon-blue)",
                  "var(--neon-pink)",
                  "oklch(0.72 0.18 150)",
                  "oklch(0.78 0.16 75)",
                ];
                return (
                  <div key={s.id}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium truncate-safe max-w-[60%]">{s.name}</span>
                      <span className="font-semibold tabular-nums text-muted-foreground">
                        {s.practiceSolved}/{s.practiceTotal} ({s.practiceCompletionPct}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted/40">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${s.practiceCompletionPct}%` }}
                        transition={{ duration: 0.8, delay: i * 0.05 }}
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${colors[i % colors.length]}, var(--neon-blue))`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Insights */}
        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-4">
          <h3 className="mb-3 text-sm font-semibold">MCQ Insights</h3>
          <div className="space-y-2">
            {subjBest && (
              <InsightRow
                icon={Trophy}
                title="Best Accuracy"
                value={`${subjBest.avgScore}%`}
                sub={`On ${subjBest.name}`}
                tone="from-emerald-400 to-teal-500"
              />
            )}
            {subjMostMcqs && (
              <InsightRow
                icon={BookOpen}
                title="Most MCQs Solved"
                value={`${subjMostMcqs.practiceSolved}`}
                sub={`On ${subjMostMcqs.name}`}
                tone="from-violet-500 to-blue-500"
              />
            )}
            {subjWeak && subjWeak.id !== subjBest?.id && (
              <InsightRow
                icon={Zap}
                title="Needs Improvement"
                value={`${subjWeak.avgScore}%`}
                sub={`On ${subjWeak.name}`}
                tone="from-rose-500 to-pink-500"
              />
            )}
            {!subjBest && <EmptyMini text="Complete a few quizzes to unlock insights." />}
          </div>
        </div>
      </div>

      {/* Goals */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <GoalCard
          title="Daily Goal"
          current={dailyMcqs}
          target={goals.daily}
          pct={dailyPct}
          variant="ring"
          status={
            dailyPct >= 100
              ? "Daily goal smashed — incredible!"
              : dailyPct >= 50
                ? "Keep it up! You're doing great."
                : "Let's get started today!"
          }
          onEdit={() => setEditing("daily")}
          flashSaved={savedFlash === "daily"}
        />
        <GoalCard
          title="Weekly Goal"
          current={weeklyMcqs}
          target={goals.weekly}
          pct={weeklyPct}
          variant="bar"
          status={
            weeklyPct >= 100
              ? "🎉 Weekly goal complete!"
              : weeklyPct >= 50
                ? "You're halfway there!"
                : "Plenty of week left — go for it!"
          }
          onEdit={() => setEditing("weekly")}
          flashSaved={savedFlash === "weekly"}
        />
        <GoalCard
          title="Monthly Goal"
          current={monthlyMcqs}
          target={goals.monthly}
          pct={monthlyPct}
          variant="bar"
          status={monthlyPct >= 100 ? "🏆 Monthly milestone achieved!" : "Keep the consistency!"}
          onEdit={() => setEditing("monthly")}
          flashSaved={savedFlash === "monthly"}
        />
      </div>

      {/* Achievements */}
      <div className="glass shadow-card-soft rounded-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Achievements</h3>
          <Link
            to="/profile"
            className="text-[11px] font-semibold text-[var(--neon-blue)] hover:underline"
          >
            View All
          </Link>
        </div>
        {achievements.length === 0 ? (
          <EmptyMini text="Earn your first achievement by solving 50 MCQs!" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {achievements.slice(0, 4).map((a) => (
              <div
                key={a.title}
                className="rounded-2xl border border-border/50 bg-background/30 p-3 text-center transition-transform hover:-translate-y-1"
              >
                <div
                  className={`mx-auto mb-2 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${a.tone} text-white shadow-lg`}
                >
                  <a.icon className="h-5 w-5" />
                </div>
                <p className="font-display text-xs font-bold">{a.title}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{a.sub}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent activity */}
      <div className="glass shadow-card-soft rounded-3xl p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Recent Activity</h3>
        </div>
        {timeline.length === 0 ? (
          <EmptyMini text="Your study activity will appear here." />
        ) : (
          <div className="space-y-2">
            {timeline.slice(0, 6).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-border/50 bg-background/30 px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white">
                    {t.kind === "mcq_practice" ? (
                      <ListChecks className="h-4 w-4" />
                    ) : t.kind === "quiz" ? (
                      <Timer className="h-4 w-4" />
                    ) : t.kind === "mock" ? (
                      <Trophy className="h-4 w-4" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate-safe text-xs font-semibold">{t.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {t.kindLabel}
                      {t.correct != null ? ` · ${t.correct}/${t.total} correct` : ""}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">{timeAgo(t.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <EditGoalDialog
        open={editing !== null}
        kind={editing}
        current={editing ? goals[editing] : 0}
        saving={saveGoalsMut.isPending}
        error={saveGoalsMut.error ? (saveGoalsMut.error as Error).message : null}
        fallback={goals.fallback}
        onClose={() => {
          if (!saveGoalsMut.isPending) setEditing(null);
        }}
        onSave={(value) => {
          if (!editing) return;
          saveGoalsMut.mutate(
            { [editing]: value },
            {
              onSuccess: () => {
                setSavedFlash(editing);
                setEditing(null);
                setTimeout(() => setSavedFlash(null), 2000);
              },
            },
          );
        }}
      />
    </div>
  );
}

// ───── helpers ─────
function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function InsightRow({
  icon: Icon,
  title,
  value,
  sub,
  tone,
}: {
  icon: typeof Trophy;
  title: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/30 p-2.5">
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold">{title}</p>
        <p className="text-[10px] text-muted-foreground">{sub}</p>
      </div>
      <span className="font-display text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

function GoalCard({
  title,
  current,
  target,
  pct,
  status,
  variant,
  onEdit,
  flashSaved,
}: {
  title: string;
  current: number;
  target: number;
  pct: number;
  status: string;
  variant: "ring" | "bar";
  onEdit?: () => void;
  flashSaved?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5"
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex items-center gap-2">
          <AnimatePresence>
            {flashSaved && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500"
              >
                <Check className="h-3 w-3" /> Saved
              </motion.span>
            )}
          </AnimatePresence>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Edit ${title}`}
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-background/40 px-2.5 py-1 text-[11px] font-semibold text-foreground/80 transition-colors hover:bg-background/70"
            >
              <Edit3 className="h-3 w-3" /> Edit
            </button>
          )}
        </div>
      </div>
      {variant === "ring" ? (
        <div className="flex items-center gap-4">
          <Ring value={pct} size={84} stroke={8} gradient={`g-${title}`} />
          <div className="min-w-0">
            <p className="font-display text-lg font-bold">
              {current} / {target} MCQs
            </p>
            <p className="text-[11px] text-muted-foreground">Today's Goal</p>
            <p className="mt-1 text-[11px] font-semibold text-emerald-500">{status} 💪</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <p className="font-display text-lg font-bold">
              {current} / {target} MCQs
            </p>
            <p className="text-sm font-bold text-muted-foreground tabular-nums">{pct}%</p>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted/40">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-[var(--neon-purple)] via-[var(--neon-blue)] to-[var(--neon-pink)]"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">{status}</p>
        </div>
      )}
    </motion.div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/50 p-6 text-center">
      <Sparkles className="h-5 w-5 text-muted-foreground" />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

// ───── Edit Goal Dialog ─────
const GOAL_META: Record<
  "daily" | "weekly" | "monthly",
  { label: string; hint: string; min: number; max: number; suggest: number }
> = {
  daily: {
    label: "Daily MCQ Goal",
    hint: "How many MCQs do you want to solve each day?",
    min: 1,
    max: 500,
    suggest: 20,
  },
  weekly: {
    label: "Weekly MCQ Goal",
    hint: "Target MCQs you want to solve over a 7-day window.",
    min: 1,
    max: 3000,
    suggest: 100,
  },
  monthly: {
    label: "Monthly MCQ Goal",
    hint: "Target MCQs you want to solve over the last 30 days.",
    min: 1,
    max: 10000,
    suggest: 400,
  },
};

function EditGoalDialog({
  open,
  kind,
  current,
  onClose,
  onSave,
  saving,
  error,
  fallback,
}: {
  open: boolean;
  kind: "daily" | "weekly" | "monthly" | null;
  current: number;
  onClose: () => void;
  onSave: (value: number) => void;
  saving?: boolean;
  error?: string | null;
  fallback?: boolean;
}) {
  const meta = kind ? GOAL_META[kind] : null;
  const [val, setVal] = useState<string>(String(current));
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setVal(String(current));
      setErr(null);
    }
  }, [open, current]);

  if (!meta) return null;

  const submit = () => {
    const n = Number(val);
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      setErr("Enter a whole number.");
      return;
    }
    if (n < meta.min) {
      setErr(`Minimum is ${meta.min}.`);
      return;
    }
    if (n > meta.max) {
      setErr(`Maximum is ${meta.max}.`);
      return;
    }
    onSave(n);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white">
              <Target className="h-4 w-4" />
            </span>
            {meta.label}
          </DialogTitle>
          <DialogDescription>{meta.hint}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label
              htmlFor="goal-input"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              MCQs
            </Label>
            <Input
              id="goal-input"
              type="number"
              inputMode="numeric"
              min={meta.min}
              max={meta.max}
              value={val}
              onChange={(e) => {
                setVal(e.target.value);
                setErr(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="font-display text-lg font-bold tabular-nums"
              autoFocus
            />
            {err && <p className="text-xs font-medium text-rose-500">{err}</p>}
            {error && !err && <p className="text-xs font-medium text-rose-500">{error}</p>}
            {fallback && (
              <p className="text-[11px] text-amber-500">
                Saved locally — run the <code className="rounded bg-muted px-1">user_goals</code>{" "}
                SQL setup to sync across devices.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {[meta.suggest, Math.round(meta.suggest * 1.5), meta.suggest * 2].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setVal(String(s));
                  setErr(null);
                }}
                className="rounded-full border border-border/50 bg-background/40 px-3 py-1 text-[11px] font-semibold transition-colors hover:bg-background/70"
              >
                {s} MCQs
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-border/50 px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] px-5 py-2 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.03] disabled:opacity-70"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save Goal"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
