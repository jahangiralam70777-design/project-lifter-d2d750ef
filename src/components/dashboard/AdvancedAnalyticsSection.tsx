import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect, useRef } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  Calendar,
  CheckCircle2,
  Flame,
  Goal,
  ListChecks,
  Pencil,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import {
  studentAdvancedAnalytics,
  updateStudentMcqGoals,
} from "@/lib/student-advanced-analytics.functions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRealtimeActivity } from "@/hooks/use-realtime-invalidator";

function PremiumCard({
  title,
  value,
  sub,
  icon,
  accent,
  trend,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <div className="glass shadow-card-soft group relative overflow-hidden rounded-3xl p-5 transition-all hover:-translate-y-1 hover:shadow-glow">
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full opacity-25 blur-3xl transition-opacity group-hover:opacity-50"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg"
          style={{ background: `linear-gradient(135deg, ${accent}, oklch(0.55 0.2 270))` }}
        >
          {icon}
        </div>
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              trend.positive ? "bg-emerald-500/15 text-emerald-500" : "bg-rose-500/15 text-rose-500"
            }`}
          >
            {trend.positive ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      <p className="relative mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <p className="relative mt-1 font-display text-3xl font-bold tabular-nums text-foreground">
        {value}
      </p>
      {sub && <p className="relative mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Skeleton({ className = "h-32" }: { className?: string }) {
  return <div className={`glass animate-pulse rounded-3xl ${className}`} />;
}

const INSIGHT_STYLES: Record<string, { bg: string; ring: string; icon: React.ReactNode }> = {
  up: {
    bg: "from-emerald-500/15 to-emerald-500/5",
    ring: "ring-emerald-500/30",
    icon: <TrendingUp className="h-4 w-4 text-emerald-500" />,
  },
  down: {
    bg: "from-rose-500/15 to-rose-500/5",
    ring: "ring-rose-500/30",
    icon: <TrendingDown className="h-4 w-4 text-rose-500" />,
  },
  info: {
    bg: "from-violet-500/15 to-violet-500/5",
    ring: "ring-violet-500/30",
    icon: <Sparkles className="h-4 w-4 text-violet-500" />,
  },
  goal: {
    bg: "from-amber-500/15 to-amber-500/5",
    ring: "ring-amber-500/30",
    icon: <Goal className="h-4 w-4 text-amber-500" />,
  },
};

function GoalCard({
  label,
  solved,
  target,
  percent,
  tone,
  iconColor,
  onEdit,
}: {
  label: string;
  solved: number;
  target: number;
  percent: number;
  tone: string;
  iconColor: string;
  onEdit: () => void;
}) {
  return (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background/40 px-2 text-[10px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
          <Goal className={`h-4 w-4 ${iconColor}`} />
        </div>
      </div>
      <p className="font-display mt-2 text-2xl font-bold">
        {solved} <span className="text-sm text-muted-foreground">/ {target} MCQs</span>
      </p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all duration-700`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{percent}% complete</p>
    </div>
  );
}

function EditGoalsDialog({
  open,
  onOpenChange,
  initialDaily,
  initialWeekly,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialDaily: number;
  initialWeekly: number;
}) {
  const qc = useQueryClient();
  const saveGoals = useServerFn(updateStudentMcqGoals);
  const [daily, setDaily] = useState<string>(String(initialDaily));
  const [weekly, setWeekly] = useState<string>(String(initialWeekly));

  useEffect(() => {
    if (open) {
      setDaily(String(initialDaily));
      setWeekly(String(initialWeekly));
    }
  }, [open, initialDaily, initialWeekly]);

  const mutation = useMutation({
    mutationFn: (vars: { dailyMcqGoal: number; weeklyMcqGoal: number }) =>
      saveGoals({ data: vars }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["student-advanced-analytics"] });
      toast.success("Goals updated");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to save goals"),
  });

  const submit = () => {
    const d = Math.max(1, Math.min(5000, Math.round(Number(daily) || 0)));
    const w = Math.max(1, Math.min(50000, Math.round(Number(weekly) || 0)));
    mutation.mutate({ dailyMcqGoal: d, weeklyMcqGoal: w });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit MCQ Goals</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="daily-goal">Daily MCQ Goal</Label>
            <Input
              id="daily-goal"
              type="number"
              min={1}
              max={5000}
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Number of MCQs to solve each day.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="weekly-goal">Weekly MCQ Goal</Label>
            <Input
              id="weekly-goal"
              type="number"
              min={1}
              max={50000}
              value={weekly}
              onChange={(e) => setWeekly(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">Number of MCQs to solve each week.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save Goals"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdvancedAnalyticsSection() {
  const fetchData = useServerFn(studentAdvancedAnalytics);
  const qc = useQueryClient();
  const activity = useRealtimeActivity();
  const lastRealtimeActivityRef = useRef(activity);
  const { data, isLoading } = useQuery({
    queryKey: ["student-advanced-analytics"],
    queryFn: () => fetchData(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [splitRange, setSplitRange] = useState<"week" | "month">("week");

  useEffect(() => {
    if (activity === lastRealtimeActivityRef.current) return;
    lastRealtimeActivityRef.current = activity;
    void qc.invalidateQueries({ queryKey: ["student-advanced-analytics"], refetchType: "active" });
  }, [activity, qc]);

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  // Defensive destructure: in production, partial/null payloads from the
  // server fn (e.g. brand-new account with no goals row yet) would throw
  // when accessing nested fields, which would crash inside Recharts during
  // render and trigger the route error boundary into an infinite retry
  // loop (React error #185). Default every nested shape here.
  const mcqCounts = data.mcqCounts ?? { today: 0, week: 0, month: 0, daily: [] };
  const totals =
    data.totals ?? { correct: 0, wrong: 0, accuracy: 0, attempts: 0, answered: 0, weeklyChange: 0 };
  const byKind = data.byKind ?? {};
  const subjectAccuracy = Array.isArray(data.subjectAccuracy) ? data.subjectAccuracy : [];
  const chapterAccuracy = Array.isArray(data.chapterAccuracy) ? data.chapterAccuracy : [];
  const strongTopics = Array.isArray(data.strongTopics) ? data.strongTopics : [];
  const weakTopics = Array.isArray(data.weakTopics) ? data.weakTopics : [];
  const heatmap = Array.isArray(data.heatmap) ? data.heatmap : [];
  const streak = data.streak ?? { current: 0, longest: 0 };
  const insights = Array.isArray(data.insights) ? data.insights : [];
  const goals = data.goals ?? {
    daily: { solved: 0, target: 0, percent: 0 },
    weekly: { solved: 0, target: 0, percent: 0 },
  };
  const answersSplit = data.answersSplit ?? {
    week: { correct: 0, wrong: 0, total: 0 },
    month: { correct: 0, wrong: 0, total: 0 },
  };

  const splitTotals = answersSplit[splitRange] ?? { correct: 0, wrong: 0, total: 0 };

  const accuracyPie = [
    { name: "Correct", value: splitTotals.correct, color: "oklch(0.72 0.18 155)" },
    { name: "Wrong", value: splitTotals.wrong, color: "oklch(0.7 0.22 25)" },
  ];

  const kindData = [
    {
      name: "Mock",
      accuracy: byKind.mock?.accuracy ?? 0,
      attempts: byKind.mock?.attempts ?? 0,
      color: "var(--neon-pink)",
    },
    {
      name: "Quiz",
      accuracy: byKind.quiz?.accuracy ?? 0,
      attempts: byKind.quiz?.attempts ?? 0,
      color: "var(--neon-blue)",
    },
    {
      name: "Practice",
      accuracy: byKind.mcq_practice?.accuracy ?? 0,
      attempts: byKind.mcq_practice?.attempts ?? 0,
      color: "var(--neon-purple)",
    },
  ];

  return (
    <div className="space-y-5">
      {/* === MCQ Solved Totals === */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <PremiumCard
          title="Daily MCQ Solved"
          value={`${mcqCounts.today}`}
          sub={`${goals.daily.percent}% of daily goal`}
          icon={<ListChecks className="h-5 w-5" />}
          accent="var(--neon-purple)"
        />
        <PremiumCard
          title="Weekly MCQ Solved"
          value={`${mcqCounts.week}`}
          sub={`${goals.weekly.percent}% of weekly goal`}
          icon={<Calendar className="h-5 w-5" />}
          accent="var(--neon-blue)"
        />
        <PremiumCard
          title="Monthly MCQ Solved"
          value={`${mcqCounts.month}`}
          sub={`${totals.attempts} sessions · last 30d`}
          icon={<Flame className="h-5 w-5" />}
          accent="oklch(0.75 0.18 150)"
        />
        <PremiumCard
          title="Accuracy"
          value={`${totals.accuracy}%`}
          sub={`${totals.correct} correct · ${totals.wrong} wrong`}
          icon={<Target className="h-5 w-5" />}
          accent="var(--neon-pink)"
          trend={{ value: totals.weeklyChange, positive: totals.weeklyChange >= 0 }}
        />
      </section>

      {/* === Smart Insights === */}
      {insights.length > 0 && (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--neon-purple)]" />
            <h3 className="font-display text-lg font-bold">Smart Insights</h3>
            <span className="text-xs text-muted-foreground">Generated from your activity</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {insights.map((ins, i) => {
              const s = INSIGHT_STYLES[ins.kind] ?? INSIGHT_STYLES.info;
              return (
                <div
                  key={i}
                  className={`glass relative overflow-hidden rounded-2xl p-4 ring-1 ${s.ring} bg-gradient-to-br ${s.bg}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-background/60">
                      {s.icon}
                    </div>
                    <p className="text-sm leading-snug">{ins.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* === MCQ chart + Accuracy donut === */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Daily MCQs Solved</h3>
              <p className="text-xs text-muted-foreground">
                Questions answered per day · last 7 days
              </p>
            </div>
            <div className="glass rounded-xl px-3 py-1.5 text-xs">{mcqCounts.week} this week</div>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mcqCounts.daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="mcqAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--neon-purple)" stopOpacity={0.55} />
                    <stop offset="100%" stopColor="var(--neon-purple)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString(undefined, { weekday: "short" })
                  }
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  allowDecimals={false}
                />
                <RTooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    fontSize: 12,
                  }}
                  labelStyle={{ color: "var(--foreground)" }}
                  formatter={(v: number) => [`${v} MCQs`, "Solved"]}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="var(--neon-purple)"
                  strokeWidth={2.5}
                  fill="url(#mcqAreaFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold">Answers Split</h3>
              <p className="text-xs text-muted-foreground">
                {splitRange === "week" ? "Last 7 days" : "Last 30 days"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex rounded-full border border-border/60 bg-background/40 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSplitRange("week")}
                  className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                    splitRange === "week"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={splitRange === "week"}
                >
                  This Week
                </button>
                <button
                  type="button"
                  onClick={() => setSplitRange("month")}
                  className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
                    splitRange === "month"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={splitRange === "month"}
                >
                  This Month
                </button>
              </div>
              <Brain className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="mt-2 h-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={
                    accuracyPie.filter((d) => d.value > 0).length
                      ? accuracyPie
                      : [{ name: "No data", value: 1, color: "var(--muted)" }]
                  }
                  innerRadius={50}
                  outerRadius={75}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {accuracyPie.map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Pie>
                <RTooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-emerald-500/10 p-2 text-center">
              <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
              <p className="font-display mt-1 font-bold">{splitTotals.correct}</p>
              <p className="text-[10px] text-muted-foreground">Correct</p>
            </div>
            <div className="rounded-xl bg-rose-500/10 p-2 text-center">
              <XCircle className="mx-auto h-4 w-4 text-rose-500" />
              <p className="font-display mt-1 font-bold">{splitTotals.wrong}</p>
              <p className="text-[10px] text-muted-foreground">Wrong</p>
            </div>
          </div>
        </div>
      </section>

      {/* === MCQ Goals (editable) + Streak === */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <GoalCard
          label="Daily Goal"
          solved={goals.daily.solved}
          target={goals.daily.target}
          percent={goals.daily.percent}
          tone="from-[var(--neon-blue)] to-[var(--neon-purple)]"
          iconColor="text-[var(--neon-blue)]"
          onEdit={() => setEditOpen(true)}
        />
        <GoalCard
          label="Weekly Goal"
          solved={goals.weekly.solved}
          target={goals.weekly.target}
          percent={goals.weekly.percent}
          tone="from-[var(--neon-purple)] to-[var(--neon-pink)]"
          iconColor="text-[var(--neon-purple)]"
          onEdit={() => setEditOpen(true)}
        />

        <div className="relative overflow-hidden rounded-3xl p-px">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 opacity-90" />
          <div className="relative flex h-full flex-col rounded-[calc(theme(borderRadius.3xl)-1px)] bg-background/85 p-5 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Learning Streak
              </p>
              <Flame className="h-5 w-5 text-amber-500" />
            </div>
            <p className="font-display mt-2 text-3xl font-bold">
              {streak.current}
              <span className="ml-1 text-sm font-semibold text-muted-foreground">days</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Longest streak: {streak.longest} days
            </p>
            <div className="mt-3 flex gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <span
                  key={i}
                  className={`h-7 flex-1 rounded-md ${i < Math.min(7, streak.current) ? "bg-gradient-to-t from-amber-500 to-orange-400 shadow-[0_0_12px_var(--neon-pink)]" : "bg-muted"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* === Performance by kind + Subject accuracy === */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-2">
          <h3 className="font-display text-lg font-bold">Performance by Type</h3>
          <p className="text-xs text-muted-foreground">Mock · Quiz · Practice</p>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={kindData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                />
                <RTooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--popover)",
                    fontSize: 12,
                  }}
                  formatter={(v: number, _n, p) => [
                    `${v}% · ${p.payload.attempts} attempts`,
                    "Accuracy",
                  ]}
                />
                <Bar dataKey="accuracy" radius={[8, 8, 0, 0]}>
                  {kindData.map((e, i) => (
                    <Cell key={i} fill={e.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Subject-wise Accuracy</h3>
              <p className="text-xs text-muted-foreground">Last 30 days</p>
            </div>
            <Zap className="h-4 w-4 text-[var(--neon-blue)]" />
          </div>
          <div className="mt-4 space-y-3">
            {subjectAccuracy.length ? (
              subjectAccuracy.map((s) => (
                <div key={s.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium">{s.name}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {s.accuracy}% · {s.attempts} Qs
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${s.accuracy}%`,
                        background: `linear-gradient(90deg, ${s.color ?? "var(--neon-purple)"}, var(--neon-blue))`,
                        boxShadow: `0 0 12px ${s.color ?? "var(--neon-purple)"}`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No attempts yet — start practising to see subject accuracy.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* === Strong / Weak topics === */}
      <section className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Strong Topics</h3>
            <TrendingUp className="h-4 w-4 text-emerald-500" />
          </div>
          <ul className="mt-3 space-y-2">
            {strongTopics.length ? (
              strongTopics.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-xl bg-emerald-500/5 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    {t.subject && <p className="text-[10px] text-muted-foreground">{t.subject}</p>}
                  </div>
                  <span className="text-sm font-bold text-emerald-500 tabular-nums">
                    {t.accuracy}%
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">
                Answer 3+ questions per chapter to see your strong topics.
              </li>
            )}
          </ul>
        </div>
        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Weak Topics</h3>
            <TrendingDown className="h-4 w-4 text-rose-500" />
          </div>
          <ul className="mt-3 space-y-2">
            {weakTopics.length ? (
              weakTopics.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded-xl bg-rose-500/5 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{t.name}</p>
                    {t.subject && <p className="text-[10px] text-muted-foreground">{t.subject}</p>}
                  </div>
                  <span className="text-sm font-bold text-rose-500 tabular-nums">
                    {t.accuracy}%
                  </span>
                </li>
              ))
            ) : (
              <li className="text-sm text-muted-foreground">
                No weak topics yet — keep practising.
              </li>
            )}
          </ul>
        </div>
      </section>

      {/* === 30-day heatmap === */}
      <section className="glass shadow-card-soft rounded-3xl p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg font-bold">Activity Heatmap</h3>
            <p className="text-xs text-muted-foreground">Last 30 days · attempts per day</p>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            Less
            {[0.15, 0.35, 0.6, 0.85, 1].map((o, i) => (
              <span
                key={i}
                className="h-3 w-3 rounded-sm"
                style={{ background: `oklch(0.6 0.27 295 / ${o})` }}
              />
            ))}
            More
          </div>
        </div>
        <div className="mt-4 grid grid-flow-col grid-rows-5 gap-1.5 overflow-x-auto pb-1">
          {heatmap.map((d) => {
            const max = Math.max(1, ...heatmap.map((h) => h.count));
            const opacity = d.count === 0 ? 0.08 : 0.2 + (d.count / max) * 0.8;
            return (
              <div
                key={d.date}
                title={`${d.date}: ${d.count} attempts`}
                className="h-5 w-5 rounded-md transition-transform hover:scale-125"
                style={{ background: `oklch(0.6 0.27 295 / ${opacity})` }}
              />
            );
          })}
        </div>
      </section>

      {/* === Chapter accuracy table === */}
      {chapterAccuracy.length > 0 && (
        <section className="glass shadow-card-soft rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Chapter-wise Accuracy</h3>
          <p className="text-xs text-muted-foreground">From your MCQ Practice submissions</p>
          <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {chapterAccuracy.map((c) => {
              const correct = Math.round((c.accuracy / 100) * c.attempts);
              const wrong = Math.max(0, c.attempts - correct);
              return (
              <div key={c.id} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-sm">
                  <span className="min-w-0 break-words font-medium leading-snug">{c.name}</span>
                  <span
                    className="shrink-0 font-bold tabular-nums"
                    style={{
                      color:
                        c.accuracy >= 70
                          ? "rgb(16 185 129)"
                          : c.accuracy >= 40
                            ? "rgb(245 158 11)"
                            : "rgb(244 63 94)",
                    }}
                  >
                    {c.accuracy}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)]"
                    style={{ width: `${c.accuracy}%` }}
                  />
                </div>
                <p className="mt-1 break-words text-[10px] text-muted-foreground">
                  {c.subject ?? "—"} · {c.attempts} answered · {wrong} wrong
                </p>
              </div>
              );
            })}
          </div>
        </section>
      )}
      <EditGoalsDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialDaily={goals.daily.target}
        initialWeekly={goals.weekly.target}
      />
    </div>
  );
}
