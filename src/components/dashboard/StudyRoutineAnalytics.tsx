/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";
import {
  getStudyGoalTargets,
  setStudyGoalTargets,
  DEFAULT_STUDY_TARGETS,
} from "@/lib/user-goals.functions";

import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  Gauge,
  Hourglass,
  Layers,
  ListChecks,
  Loader2,
  Minus,
  PieChart as PieIcon,
  Sparkles,
  Star,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { StudyRoutineTaskRow } from "@/lib/study-routine.functions";

export const STUDY_GOAL_QUERY_KEY = ["study-goal-targets"] as const;

export function useStudyGoalTargets() {
  const get = useServerFn(getStudyGoalTargets);
  const set = useServerFn(setStudyGoalTargets);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: STUDY_GOAL_QUERY_KEY,
    queryFn: () => get({ data: undefined as never }),
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (payload: {
      weeklyStudyMinutes?: number;
      monthlyStudyMinutes?: number;
    }) => set({ data: payload }),
    onSuccess: (next) => {
      qc.setQueryData(STUDY_GOAL_QUERY_KEY, next);
      toast.success("Goal updated");
    },
    onError: (err: any) => toast.error(err?.message ?? "Could not save goal"),
  });
  return { query, mutation };
}

export function GoalEditDialog({
  open,
  onOpenChange,
  scope,
  currentMinutes,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: "week" | "month";
  currentMinutes: number;
  onSave: (minutes: number) => void;
  saving: boolean;
}) {
  const [hours, setHours] = useState(() => (currentMinutes / 60).toFixed(1));
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v) setHours((currentMinutes / 60).toFixed(1));
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Edit {scope === "week" ? "This Week" : "This Month"} Goal
          </DialogTitle>
          <DialogDescription>
            Set your target study time in hours. Applies to all routine widgets.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="goal-hours">Target hours</Label>
          <Input
            id="goal-hours"
            type="number"
            min={scope === "week" ? 0.5 : 1}
            max={scope === "week" ? 168 : 720}
            step={0.5}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {scope === "week"
              ? "Between 0.5 and 168 hours per week."
              : "Between 1 and 720 hours per month."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              const n = Number(hours);
              if (!Number.isFinite(n) || n <= 0) {
                toast.error("Enter a valid number of hours");
                return;
              }
              onSave(Math.round(n * 60));
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------



const TASK_TYPE_LABEL: Record<StudyRoutineTaskRow["task_type"], string> = {
  study: "Study",
  mcq: "MCQ Practice",
  quiz: "Quiz",
  mock: "Mock Test",
  revision: "Revision",
  custom: "Custom",
};

// Chart palette resolved from CSS tokens so it inherits theme + dark mode.
const CHART_COLORS = [
  "var(--primary)",
  "var(--accent)",
  "var(--neon-pink)",
  "var(--neon-blue)",
  "var(--neon-purple)",
  "oklch(0.72 0.18 145)", // emerald
  "oklch(0.78 0.16 75)", // amber
  "oklch(0.7 0.2 25)", // rose
];

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--popover-foreground)",
  boxShadow: "0 10px 40px -15px oklch(0 0 0 / 0.2)",
};

function normalizeTime(t: string) {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function minutesBetween(a: string, b: string) {
  const [ah, am] = normalizeTime(a).split(":").map(Number);
  const [bh, bm] = normalizeTime(b).split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

function taskMinutes(t: StudyRoutineTaskRow) {
  return Math.max(0, minutesBetween(t.start_time, t.end_time));
}

/**
 * Effective completed study minutes for a task, from real backend fields:
 *   completed  → full duration
 *   in_progress → duration × (completion% / 100)  (falls back to 50% if completion is 0)
 *   pending    → 0
 */
function taskDoneMinutes(t: StudyRoutineTaskRow) {
  const dur = taskMinutes(t);
  if (t.status === "completed") return dur;
  if (t.status === "in_progress") {
    const pct = typeof t.completion === "number" && t.completion > 0 ? t.completion : 50;
    return Math.round((dur * Math.min(100, Math.max(0, pct))) / 100);
  }
  return 0;
}

function fmtDuration(mins: number) {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function fmtHours(mins: number) {
  return (mins / 60).toFixed(1);
}

function isoDay(d: Date) {
  // Use LOCAL calendar Y-M-D. Task_date on the server is stored/aligned to
  // the user's local calendar (BST); toISOString() would shift east-of-UTC
  // users to the previous day and zero out streaks / daily analytics buckets.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}


function startOfWeek(base = new Date()) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Mon=0
  d.setDate(d.getDate() - day);
  return d;
}

function startOfMonth(base = new Date()) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

function endOfMonth(base = new Date()) {
  const d = new Date(base);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
}

function computeStreak(tasks: StudyRoutineTaskRow[]) {
  const doneDays = new Set(
    tasks
      .filter((t) => t.status === "completed")
      .map((t) => t.task_date),
  );
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // Grace: today counts if today has a done task OR (no tasks today and yesterday has done)
  while (doneDays.has(isoDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// -----------------------------------------------------------------------------
// Section shell
// -----------------------------------------------------------------------------

function SectionCard({
  title,
  icon: Icon,
  subtitle,
  children,
  className,
  action,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className={cn("border-border/60 shadow-sm", className)}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <Icon className="h-4 w-4" />
              </span>
              {title}
            </CardTitle>
            {subtitle && (
              <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone = "primary",
  hint,
  delta,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "emerald" | "amber" | "rose" | "sky" | "violet";
  hint?: string;
  delta?: { value: number; label?: string } | null;
}) {
  const toneMap = {
    primary: "bg-primary/10 text-primary ring-primary/20",
    emerald: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
    rose: "bg-rose-500/10 text-rose-500 ring-rose-500/20",
    sky: "bg-sky-500/10 text-sky-500 ring-sky-500/20",
    violet: "bg-violet-500/10 text-violet-500 ring-violet-500/20",
  } as const;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="group flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md sm:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "grid h-9 w-9 place-items-center rounded-xl ring-1",
            toneMap[tone],
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              delta.value > 0 &&
                "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
              delta.value < 0 &&
                "bg-rose-500/10 text-rose-600 dark:text-rose-400",
              delta.value === 0 && "bg-muted text-muted-foreground",
            )}
          >
            {delta.value > 0 ? (
              <TrendingUp className="h-2.5 w-2.5" />
            ) : delta.value < 0 ? (
              <TrendingDown className="h-2.5 w-2.5" />
            ) : (
              <Minus className="h-2.5 w-2.5" />
            )}
            {Math.abs(delta.value)}%{delta.label ? ` ${delta.label}` : ""}
          </span>
        ) : null}
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 text-xl font-bold tabular-nums text-foreground sm:text-2xl">
          {value}
        </div>
        {hint && (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {hint}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ScoreRing({
  value,
  label,
  hint,
}: {
  value: number;
  label: string;
  hint?: string;
}) {
  const size = 132;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const off = c - (clamped / 100) * c;
  const gradId = `sr-score-${label.replace(/\s+/g, "-")}`;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative grid place-items-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="currentColor" className="text-primary" />
              <stop offset="100%" stopColor="currentColor" className="text-accent" />
            </linearGradient>
          </defs>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="currentColor"
            className="text-muted"
            strokeWidth={stroke}
            fill="none"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={`url(#${gradId})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: off }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-2xl font-bold tabular-nums text-foreground">
              {clamped}
              <span className="text-sm font-medium text-muted-foreground">
                /100
              </span>
            </div>
            {hint && (
              <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {hint}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="text-xs font-semibold text-foreground">{label}</div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 bg-muted/10 p-6 text-center">
      <PieIcon className="h-6 w-6 text-muted-foreground/60" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Weekly Analytics
// -----------------------------------------------------------------------------

export function WeeklyAnalytics({
  tasks,
  subjectMap,
}: {
  tasks: StudyRoutineTaskRow[];
  subjectMap: Map<string, string>;
}) {
  const { query: goalQuery, mutation: goalMutation } = useStudyGoalTargets();
  const goalMinutes =
    goalQuery.data?.weeklyStudyMinutes ??
    DEFAULT_STUDY_TARGETS.weeklyStudyMinutes;
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);

  const analysis = useMemo(() => {

    const weekStart = startOfWeek();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    const prevStart = new Date(weekStart);
    prevStart.setDate(prevStart.getDate() - 7);

    const inRange = (t: StudyRoutineTaskRow, s: Date, e: Date) => {
      const d = new Date(t.task_date);
      return d >= s && d < e;
    };
    const week = tasks.filter((t) => inRange(t, weekStart, weekEnd));
    const prev = tasks.filter((t) => inRange(t, prevStart, weekStart));

    const total = week.length;
    const completed = week.filter((t) => t.status === "completed").length;
    const inProgress = week.filter((t) => t.status === "in_progress").length;
    const pending = week.filter((t) => t.status === "pending").length;
    const completionPct = total ? Math.round((completed / total) * 100) : 0;

    const totalMinutes = week.reduce((a, t) => a + taskMinutes(t), 0);
    const prevMinutes = prev.reduce((a, t) => a + taskMinutes(t), 0);
    const avgSession = week.length ? totalMinutes / week.length : 0;
    const longestSession = week.reduce(
      (m, t) => Math.max(m, taskMinutes(t)),
      0,
    );

    const prevTotal = prev.length;
    const prevCompleted = prev.filter((t) => t.status === "completed").length;
    const prevPct = prevTotal ? Math.round((prevCompleted / prevTotal) * 100) : 0;

    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const daily = days.map((label, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      const iso = isoDay(d);
      const dayTasks = week.filter((t) => t.task_date === iso);
      const dayDone = dayTasks.filter((t) => t.status === "completed");
      const mins = dayTasks.reduce((a, t) => a + taskMinutes(t), 0);
      const doneMins = dayTasks.reduce((a, t) => a + taskDoneMinutes(t), 0);
      return {
        day: label,
        iso,
        hours: +(mins / 60).toFixed(2),
        doneHours: +(doneMins / 60).toFixed(2),
        tasks: dayTasks.length,
        completed: dayDone.length,
        completion: dayTasks.length
          ? Math.round((dayDone.length / dayTasks.length) * 100)
          : 0,
      };
    });

    const totalDoneMinutes = week.reduce((a, t) => a + taskDoneMinutes(t), 0);

    // Distributions
    const byType = new Map<string, number>();
    const bySubject = new Map<string, number>();
    const byChapter = new Map<string, number>();
    week.forEach((t) => {
      byType.set(
        TASK_TYPE_LABEL[t.task_type],
        (byType.get(TASK_TYPE_LABEL[t.task_type]) ?? 0) + 1,
      );
      if (t.subject_id) {
        const name = subjectMap.get(t.subject_id) ?? "Unknown";
        bySubject.set(name, (bySubject.get(name) ?? 0) + taskMinutes(t));
      }
      if (t.chapter_id) {
        byChapter.set(
          t.chapter_id,
          (byChapter.get(t.chapter_id) ?? 0) + taskMinutes(t),
        );
      }
    });

    const typeCounts = Array.from(byType, ([name, value]) => ({ name, value }));
    const subjectData = Array.from(bySubject, ([name, mins]) => ({
      name,
      minutes: mins,
      hours: +(mins / 60).toFixed(1),
    }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6);
    const chapterData = Array.from(byChapter, ([id, mins]) => ({
      name: id.slice(0, 6),
      minutes: mins,
      hours: +(mins / 60).toFixed(1),
    }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 6);

    // Radar: task-type completion
    const radar = (
      Object.keys(TASK_TYPE_LABEL) as StudyRoutineTaskRow["task_type"][]
    ).map((k) => {
      const items = week.filter((t) => t.task_type === k);
      const done = items.filter((t) => t.status === "completed").length;
      return {
        type: TASK_TYPE_LABEL[k],
        completion: items.length ? Math.round((done / items.length) * 100) : 0,
      };
    });

    // Task-type breakdown counts for stat row
    const typeSummary = (
      Object.keys(TASK_TYPE_LABEL) as StudyRoutineTaskRow["task_type"][]
    ).map((k) => ({
      key: k,
      label: TASK_TYPE_LABEL[k],
      total: week.filter((t) => t.task_type === k).length,
      done: week.filter((t) => t.task_type === k && t.status === "completed")
        .length,
    }));

    // Productivity: 0.5 * completion + 0.5 * (actual completed minutes / weekly goal)
    const productivity = Math.round(
      0.5 * completionPct +
        0.5 * Math.min(100, (totalDoneMinutes / Math.max(1, goalMinutes)) * 100),
    );


    // Streak
    const streak = computeStreak(tasks);

    // Heatmap: last 8 weeks x 7 days for context
    const heat: { iso: string; minutes: number }[] = [];
    const heatStart = new Date(weekStart);
    heatStart.setDate(heatStart.getDate() - 7 * 7); // 7 previous weeks + this
    for (let i = 0; i < 8 * 7; i++) {
      const d = new Date(heatStart);
      d.setDate(heatStart.getDate() + i);
      const iso = isoDay(d);
      const mins = tasks
        .filter((t) => t.task_date === iso)
        .reduce((a, t) => a + taskMinutes(t), 0);
      heat.push({ iso, minutes: mins });
    }

    const deltaMinutes =
      prevMinutes > 0
        ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100)
        : totalMinutes > 0
          ? 100
          : 0;
    const deltaPct = completionPct - prevPct;

    return {
      total,
      completed,
      inProgress,
      pending,
      completionPct,
      totalMinutes,
      totalDoneMinutes,
      avgSession,
      longestSession,
      daily,
      typeCounts,
      subjectData,
      chapterData,
      radar,
      typeSummary,
      productivity,
      streak,
      heat,
      goalMinutes,
      deltaMinutes,
      deltaPct,
    };
  }, [tasks, subjectMap, goalMinutes]);


  const goalPct = Math.min(
    100,
    Math.round((analysis.totalDoneMinutes / Math.max(1, goalMinutes)) * 100),
  );


  return (
    <div className="flex flex-col gap-6">
      {/* Top stat row */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Planned Study"
          value={fmtDuration(analysis.totalMinutes)}
          icon={Clock}
          hint={`${fmtHours(analysis.totalMinutes)} h planned this week`}
          delta={{ value: analysis.deltaMinutes, label: "vs last" }}
        />
        <StatTile
          label="Completion"
          value={`${analysis.completionPct}%`}
          icon={CheckCircle2}
          tone="emerald"
          hint={`${analysis.completed} / ${analysis.total} tasks`}
          delta={{ value: analysis.deltaPct, label: "vs last" }}
        />
        <StatTile
          label="Study Streak"
          value={analysis.streak}
          icon={Flame}
          tone="amber"
          hint={analysis.streak === 1 ? "day" : "days"}
        />
        <StatTile
          label="Productivity"
          value={`${analysis.productivity}`}
          icon={Gauge}
          tone="violet"
          hint="Score / 100"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Completed Study"
          value={fmtDuration(analysis.totalDoneMinutes)}
          icon={CheckCircle2}
          tone="emerald"
          hint={`${fmtHours(analysis.totalDoneMinutes)} h logged`}
        />
        <StatTile
          label="In Progress"
          value={analysis.inProgress}
          icon={Loader2}
          tone="amber"
        />
        <StatTile
          label="Pending"
          value={analysis.pending}
          icon={Timer}
          tone="rose"
        />
        <StatTile
          label="Longest Session"
          value={fmtDuration(analysis.longestSession)}
          icon={Hourglass}
          tone="sky"
          hint={`Avg ${fmtDuration(analysis.avgSession)}`}
        />
      </div>

      {/* Task-type mini row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {analysis.typeSummary.slice(0, 4).map((t, i) => (
          <TypeChip
            key={t.key}
            label={t.label}
            done={t.done}
            total={t.total}
            color={CHART_COLORS[i]}
          />
        ))}
      </div>

      {/* Weekly goal ring + Daily hours */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard
          title="This Week Goal"
          icon={Trophy}
          subtitle={`${fmtHours(analysis.totalDoneMinutes)}h completed / ${fmtHours(goalMinutes)}h target`}
        >
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="flex w-full items-center justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={() => setGoalDialogOpen(true)}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </div>
            <ScoreRing
              value={goalPct}
              label={goalPct >= 100 ? "Goal reached" : "In progress"}
              hint="Goal %"
            />
            <div className="grid w-full grid-cols-2 gap-2 text-center">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Consistency
                </div>
                <div className="mt-0.5 text-sm font-bold text-foreground">
                  {analysis.daily.filter((d) => d.hours > 0).length}/7 days
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Avg completed / day
                </div>
                <div className="mt-0.5 text-sm font-bold text-foreground">
                  {fmtDuration(analysis.totalDoneMinutes / 7)}
                </div>
              </div>
            </div>
          </div>
        </SectionCard>
        <GoalEditDialog
          open={goalDialogOpen}
          onOpenChange={setGoalDialogOpen}
          scope="week"
          currentMinutes={goalMinutes}
          saving={goalMutation.isPending}
          onSave={(minutes) =>
            goalMutation.mutate(
              { weeklyStudyMinutes: minutes },
              { onSuccess: () => setGoalDialogOpen(false) },
            )
          }
        />


        <SectionCard
          title="Daily Study Hours"
          icon={Activity}
          subtitle="Planned vs completed hours"
          className="lg:col-span-2"
        >
          <div className="h-64">
            {analysis.total === 0 ? (
              <EmptyChart label="No tasks this week yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analysis.daily} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="sr-w-hours" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="sr-w-done" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="hours" name="Planned h" stroke="var(--primary)" strokeWidth={2} fill="url(#sr-w-hours)" />
                  <Area type="monotone" dataKey="doneHours" name="Completed h" stroke="var(--accent)" strokeWidth={2} fill="url(#sr-w-done)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Completion trend + Radar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Completion Trend" icon={TrendingUp} subtitle="Daily completion percentage">
          <div className="h-64">
            {analysis.total === 0 ? (
              <EmptyChart label="No completion data yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysis.daily} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} domain={[0, 100]} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => `${v}%`} />
                  <Line type="monotone" dataKey="completion" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--primary)" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Task Type Performance" icon={Star} subtitle="Completion % by task type">
          <div className="h-64">
            {analysis.total === 0 ? (
              <EmptyChart label="No tasks to score yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={analysis.radar} outerRadius="75%">
                  <PolarGrid stroke="currentColor" className="text-border" />
                  <PolarAngleAxis dataKey="type" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <Radar name="Completion %" dataKey="completion" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.35} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => `${v}%`} />
                </RadarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Subject / Chapter / Type distributions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Subject Distribution" icon={BookOpen} subtitle="Study time by subject">
          <div className="h-64">
            {analysis.subjectData.length === 0 ? (
              <EmptyChart label="No subject data this week." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.subjectData} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
                  <YAxis dataKey="name" type="category" tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} width={90} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => `${v}h`} />
                  <Bar dataKey="hours" radius={[0, 6, 6, 0]}>
                    {analysis.subjectData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Chapter Distribution" icon={Layers} subtitle="Top chapters by study time">
          <div className="h-64">
            {analysis.chapterData.length === 0 ? (
              <EmptyChart label="Attach chapters to tasks to track." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.chapterData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => `${v}h`} />
                  <Bar dataKey="hours" radius={[6, 6, 0, 0]}>
                    {analysis.chapterData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Task Type Distribution" icon={PieIcon} subtitle="Share of tasks this week">
          <div className="h-64">
            {analysis.typeCounts.length === 0 ? (
              <EmptyChart label="No tasks scheduled." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analysis.typeCounts}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="var(--background)"
                    strokeWidth={2}
                  >
                    {analysis.typeCounts.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Heatmap + Timeline */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <SectionCard title="Study Heatmap" icon={Sparkles} subtitle="Last 8 weeks of study minutes" className="lg:col-span-3">
          <Heatmap heat={analysis.heat} />
        </SectionCard>
        <SectionCard title="This Week Timeline" icon={CalendarDays} subtitle="Sessions in chronological order" className="lg:col-span-2">
          <WeekTimeline
            tasks={tasks.filter((t) => {
              const s = startOfWeek();
              const e = new Date(s);
              e.setDate(s.getDate() + 7);
              const d = new Date(t.task_date);
              return d >= s && d < e;
            })}
            subjectMap={subjectMap}
          />
        </SectionCard>
      </div>
    </div>
  );
}

function TypeChip({
  label,
  done,
  total,
  color,
}: {
  label: string;
  done: number;
  total: number;
  color: string;
}) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: color }}
          />
          <span className="text-xs font-semibold text-foreground">{label}</span>
        </div>
        <Badge variant="outline" className="rounded-full text-[10px] tabular-nums">
          {done}/{total}
        </Badge>
      </div>
      <Progress value={pct} className="h-1.5" />
      <div className="text-right text-[10px] font-semibold tabular-nums text-muted-foreground">
        {pct}%
      </div>
    </div>
  );
}

function Heatmap({ heat }: { heat: { iso: string; minutes: number }[] }) {
  const max = Math.max(1, ...heat.map((c) => c.minutes));
  const cols: (typeof heat)[] = [];
  for (let i = 0; i < heat.length; i += 7) cols.push(heat.slice(i, i + 7));
  const monthLabels = cols.map((col) => {
    const d = new Date(col[0].iso);
    return d.toLocaleDateString(undefined, { month: "short" });
  });
  const dedupedLabels = monthLabels.map((l, i) =>
    i === 0 || l !== monthLabels[i - 1] ? l : "",
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5">
        <div className="grid w-8 grid-rows-7 gap-1.5 pt-4 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="grid place-items-center">
              {d}
            </span>
          ))}
        </div>
        <div className="flex-1 overflow-x-auto">
          <div className="flex min-w-max flex-col gap-1">
            <div className="flex gap-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              {dedupedLabels.map((l, i) => (
                <span key={i} className="w-4 text-center">
                  {l}
                </span>
              ))}
            </div>
            <div className="flex gap-1.5">
              {cols.map((col, ci) => (
                <div key={ci} className="grid grid-rows-7 gap-1.5">
                  {col.map((cell) => {
                    const intensity = cell.minutes / max;
                    return (
                      <UITooltip key={cell.iso}>
                        <TooltipTrigger asChild>
                          <div
                            className="h-4 w-4 rounded-[4px] border border-border/40 transition-transform hover:scale-125"
                            style={{
                              background:
                                intensity === 0
                                  ? "var(--muted)"
                                  : `color-mix(in oklab, var(--primary) ${Math.max(15, Math.round(intensity * 100))}%, transparent)`,
                            }}
                          />
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          <div className="font-medium">
                            {new Date(cell.iso).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </div>
                          <div className="text-muted-foreground">
                            {cell.minutes
                              ? `${fmtDuration(cell.minutes)} studied`
                              : "No study"}
                          </div>
                        </TooltipContent>
                      </UITooltip>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
        <span>Less</span>
        {[10, 30, 60, 90].map((p) => (
          <span
            key={p}
            className="h-3 w-3 rounded-[3px]"
            style={{
              background: `color-mix(in oklab, var(--primary) ${p}%, transparent)`,
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

function WeekTimeline({
  tasks,
  subjectMap,
}: {
  tasks: StudyRoutineTaskRow[];
  subjectMap: Map<string, string>;
}) {
  const sorted = [...tasks].sort((a, b) =>
    (a.task_date + a.start_time).localeCompare(b.task_date + b.start_time),
  );
  if (sorted.length === 0) {
    return (
      <div className="grid h-64 place-items-center rounded-xl border border-dashed border-border/60 bg-muted/10 text-xs text-muted-foreground">
        No sessions scheduled this week.
      </div>
    );
  }
  return (
    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
      {sorted.map((t) => {
        const isDone = t.status === "completed";
        const isInProg = t.status === "in_progress";
        return (
          <div
            key={t.id}
            className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-card/70 p-2.5 text-xs"
          >
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                isDone
                  ? "bg-emerald-500"
                  : isInProg
                    ? "bg-amber-500"
                    : "bg-rose-500",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-foreground">
                {t.title}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                <span>
                  {new Date(t.task_date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span>
                  {normalizeTime(t.start_time)}–{normalizeTime(t.end_time)}
                </span>
                {t.subject_id && subjectMap.get(t.subject_id) && (
                  <span>· {subjectMap.get(t.subject_id)}</span>
                )}
              </div>
            </div>
            <Badge variant="outline" className="rounded-full text-[10px] tabular-nums">
              {fmtDuration(taskMinutes(t))}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Monthly Analytics
// -----------------------------------------------------------------------------

export function MonthlyAnalytics({
  tasks,
  subjectMap,
}: {
  tasks: StudyRoutineTaskRow[];
  subjectMap: Map<string, string>;
}) {
  const { query: goalQuery, mutation: goalMutation } = useStudyGoalTargets();
  const monthlyGoal =
    goalQuery.data?.monthlyStudyMinutes ??
    DEFAULT_STUDY_TARGETS.monthlyStudyMinutes;
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);

  const analysis = useMemo(() => {

    const monthStart = startOfMonth();
    const monthEnd = endOfMonth();
    const prevStart = startOfMonth(
      new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 15),
    );
    const prevEnd = endOfMonth(prevStart);

    const inRange = (t: StudyRoutineTaskRow, s: Date, e: Date) => {
      const d = new Date(t.task_date);
      return d >= s && d <= e;
    };
    const month = tasks.filter((t) => inRange(t, monthStart, monthEnd));
    const prev = tasks.filter((t) => inRange(t, prevStart, prevEnd));

    const total = month.length;
    const completed = month.filter((t) => t.status === "completed").length;
    const completionPct = total ? Math.round((completed / total) * 100) : 0;
    const totalMinutes = month.reduce((a, t) => a + taskMinutes(t), 0);
    const totalDoneMinutes = month.reduce((a, t) => a + taskDoneMinutes(t), 0);
    const prevMinutes = prev.reduce((a, t) => a + taskMinutes(t), 0);
    const prevTotal = prev.length;
    const prevPct = prevTotal
      ? Math.round(
          (prev.filter((t) => t.status === "completed").length / prevTotal) *
            100,
        )
      : 0;

    // Days in month grid
    const daysInMonth = monthEnd.getDate();
    const days: {
      iso: string;
      day: number;
      minutes: number;
      doneMinutes: number;
      done: number;
      total: number;
      pct: number;
      weekday: number;
    }[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i);
      const iso = isoDay(d);
      const items = month.filter((t) => t.task_date === iso);
      const done = items.filter((t) => t.status === "completed").length;
      const mins = items.reduce((a, t) => a + taskMinutes(t), 0);
      const doneMins = items.reduce((a, t) => a + taskDoneMinutes(t), 0);
      days.push({
        iso,
        day: i,
        minutes: mins,
        doneMinutes: doneMins,
        done,
        total: items.length,
        pct: items.length ? Math.round((done / items.length) * 100) : 0,
        weekday: (d.getDay() + 6) % 7,
      });
    }

    const activeDays = days.filter((d) => d.total > 0);
    const avgDaily = activeDays.length
      ? totalMinutes / activeDays.length
      : 0;
    const mostActive = [...days].sort((a, b) => b.minutes - a.minutes)[0];
    const leastActive = [...activeDays].sort((a, b) => a.minutes - b.minutes)[0];

    // Weekly comparison inside month
    const weeks: {
      label: string;
      minutes: number;
      completion: number;
      tasks: number;
    }[] = [];
    let bucketStart = new Date(monthStart);
    let wi = 1;
    while (bucketStart <= monthEnd) {
      const bucketEnd = new Date(bucketStart);
      bucketEnd.setDate(bucketStart.getDate() + 6);
      const bItems = month.filter((t) => {
        const d = new Date(t.task_date);
        return d >= bucketStart && d <= bucketEnd;
      });
      const mins = bItems.reduce((a, t) => a + taskMinutes(t), 0);
      const done = bItems.filter((t) => t.status === "completed").length;
      weeks.push({
        label: `W${wi}`,
        minutes: mins,
        completion: bItems.length ? Math.round((done / bItems.length) * 100) : 0,
        tasks: bItems.length,
      });
      wi += 1;
      bucketStart = new Date(bucketEnd);
      bucketStart.setDate(bucketEnd.getDate() + 1);
    }

    // Subject progress
    const bySubject = new Map<string, { minutes: number; done: number; total: number }>();
    month.forEach((t) => {
      if (!t.subject_id) return;
      const name = subjectMap.get(t.subject_id) ?? "Unknown";
      const cur = bySubject.get(name) ?? { minutes: 0, done: 0, total: 0 };
      cur.minutes += taskMinutes(t);
      cur.total += 1;
      if (t.status === "completed") cur.done += 1;
      bySubject.set(name, cur);
    });
    const subjectData = Array.from(bySubject, ([name, s]) => ({
      name,
      minutes: s.minutes,
      hours: +(s.minutes / 60).toFixed(1),
      completion: s.total ? Math.round((s.done / s.total) * 100) : 0,
      total: s.total,
      done: s.done,
    })).sort((a, b) => b.minutes - a.minutes);

    const mostStudied = subjectData[0] ?? null;
    const leastStudied =
      subjectData.length > 1 ? subjectData[subjectData.length - 1] : null;

    // Chapter progress
    const byChapter = new Map<string, { minutes: number; done: number; total: number }>();
    month.forEach((t) => {
      if (!t.chapter_id) return;
      const cur = byChapter.get(t.chapter_id) ?? { minutes: 0, done: 0, total: 0 };
      cur.minutes += taskMinutes(t);
      cur.total += 1;
      if (t.status === "completed") cur.done += 1;
      byChapter.set(t.chapter_id, cur);
    });
    const chapterData = Array.from(byChapter, ([id, s]) => ({
      name: id.slice(0, 6),
      hours: +(s.minutes / 60).toFixed(1),
      completion: s.total ? Math.round((s.done / s.total) * 100) : 0,
    }))
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 8);

    // Task distribution
    const byType = new Map<string, number>();
    month.forEach((t) =>
      byType.set(
        TASK_TYPE_LABEL[t.task_type],
        (byType.get(TASK_TYPE_LABEL[t.task_type]) ?? 0) + 1,
      ),
    );
    const typeData = Array.from(byType, ([name, value]) => ({ name, value }));

    // Scores — completion + actual completed hours vs monthly target
    const performance = Math.round(
      0.6 * completionPct +
        0.4 * Math.min(100, (totalDoneMinutes / Math.max(1, monthlyGoal)) * 100),
    );

    const consistency = Math.round((activeDays.length / daysInMonth) * 100);
    const streak = computeStreak(tasks);

    const deltaMinutes =
      prevMinutes > 0
        ? Math.round(((totalMinutes - prevMinutes) / prevMinutes) * 100)
        : totalMinutes > 0
          ? 100
          : 0;
    const deltaPct = completionPct - prevPct;

    return {
      total,
      completed,
      completionPct,
      totalMinutes,
      totalDoneMinutes,
      avgDaily,
      mostActive,
      leastActive,
      mostStudied,
      leastStudied,
      subjectData,
      chapterData,
      typeData,
      weeks,
      days,
      performance,
      consistency,
      streak,
      monthlyGoal,
      deltaMinutes,
      deltaPct,
      daysInMonth,
      activeDays: activeDays.length,
    };
  }, [tasks, subjectMap, monthlyGoal]);

  const goalPct = Math.min(
    100,
    Math.round((analysis.totalDoneMinutes / Math.max(1, monthlyGoal)) * 100),
  );


  return (
    <div className="flex flex-col gap-6">
      {/* Top cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Planned Study"
          value={fmtDuration(analysis.totalMinutes)}
          icon={Clock}
          hint={`${fmtHours(analysis.totalDoneMinutes)}h completed`}
          delta={{ value: analysis.deltaMinutes, label: "vs last" }}
        />
        <StatTile
          label="Completion"
          value={`${analysis.completionPct}%`}
          icon={CheckCircle2}
          tone="emerald"
          hint={`${analysis.completed} / ${analysis.total} tasks`}
          delta={{ value: analysis.deltaPct, label: "vs last" }}
        />
        <StatTile
          label="Avg Daily Study"
          value={fmtDuration(analysis.avgDaily)}
          icon={Activity}
          tone="sky"
          hint={`${analysis.activeDays}/${analysis.daysInMonth} active days`}
        />
        <StatTile
          label="Streak"
          value={analysis.streak}
          icon={Flame}
          tone="amber"
          hint={analysis.streak === 1 ? "day" : "days"}
        />
      </div>

      {/* Highlights row */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <HighlightTile
          label="Most Studied Subject"
          value={analysis.mostStudied?.name ?? "—"}
          hint={
            analysis.mostStudied
              ? `${fmtHours(analysis.mostStudied.minutes)}h · ${analysis.mostStudied.completion}%`
              : "No subject data"
          }
          icon={Trophy}
          tone="emerald"
        />
        <HighlightTile
          label="Least Studied"
          value={analysis.leastStudied?.name ?? "—"}
          hint={
            analysis.leastStudied
              ? `${fmtHours(analysis.leastStudied.minutes)}h`
              : "Add more subjects"
          }
          icon={BookOpen}
          tone="rose"
        />
        <HighlightTile
          label="Most Active Day"
          value={
            analysis.mostActive && analysis.mostActive.minutes > 0
              ? new Date(analysis.mostActive.iso).toLocaleDateString(undefined, {
                  weekday: "short",
                  day: "numeric",
                })
              : "—"
          }
          hint={
            analysis.mostActive && analysis.mostActive.minutes > 0
              ? fmtDuration(analysis.mostActive.minutes)
              : "No study yet"
          }
          icon={Zap}
          tone="violet"
        />
        <HighlightTile
          label="Least Active Day"
          value={
            analysis.leastActive
              ? new Date(analysis.leastActive.iso).toLocaleDateString(
                  undefined,
                  { weekday: "short", day: "numeric" },
                )
              : "—"
          }
          hint={
            analysis.leastActive
              ? fmtDuration(analysis.leastActive.minutes)
              : "—"
          }
          icon={ListChecks}
          tone="sky"
        />
      </div>

      {/* Scores + goal */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <SectionCard title="Performance Score" icon={Gauge} subtitle="Completion + hours weighted">
          <div className="grid place-items-center py-2">
            <ScoreRing value={analysis.performance} label="Performance" hint="Score" />
          </div>
        </SectionCard>
        <SectionCard title="Consistency Score" icon={Sparkles} subtitle="% of days you studied">
          <div className="grid place-items-center py-2">
            <ScoreRing value={analysis.consistency} label="Consistency" hint="Score" />
          </div>
        </SectionCard>
        <SectionCard title="This Month Goal" icon={Target} subtitle={`${fmtHours(analysis.totalDoneMinutes)}h completed / ${fmtHours(monthlyGoal)}h`}>
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="flex w-full items-center justify-end">
              <Button size="sm" variant="ghost" className="h-7 gap-1.5 px-2 text-xs" onClick={() => setGoalDialogOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Button>
            </div>
            <ScoreRing value={goalPct} label={goalPct >= 100 ? "Goal reached" : "Progress"} hint="Goal %" />
          </div>
        </SectionCard>
        <GoalEditDialog
          open={goalDialogOpen}
          onOpenChange={setGoalDialogOpen}
          scope="month"
          currentMinutes={monthlyGoal}
          saving={goalMutation.isPending}
          onSave={(minutes) =>
            goalMutation.mutate(
              { monthlyStudyMinutes: minutes },
              { onSuccess: () => setGoalDialogOpen(false) },
            )
          }
        />
      </div>


      {/* Calendar heatmap */}
      <SectionCard title="Calendar Heatmap" icon={CalendarDays} subtitle="Study intensity by day">
        <MonthHeatmap days={analysis.days} />
      </SectionCard>

      {/* Trends */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Study Trend" icon={Activity} subtitle="Planned vs completed hours per day">
          <div className="h-64">
            {analysis.total === 0 ? (
              <EmptyChart label="No study sessions yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analysis.days.map((d) => ({ day: d.day, hours: +(d.minutes / 60).toFixed(2), doneHours: +(d.doneMinutes / 60).toFixed(2) }))} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="sr-m-hours" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="sr-m-done" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={10} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => `${v}h`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="hours" name="Planned h" stroke="var(--primary)" strokeWidth={2} fill="url(#sr-m-hours)" />
                  <Area type="monotone" dataKey="doneHours" name="Completed h" stroke="var(--accent)" strokeWidth={2} fill="url(#sr-m-done)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
        <SectionCard title="Completion Trend" icon={TrendingUp} subtitle="Daily completion %">
          <div className="h-64">
            {analysis.total === 0 ? (
              <EmptyChart label="No completion data yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analysis.days.map((d) => ({ day: d.day, pct: d.pct }))} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={10} />
                  <YAxis tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={10} domain={[0, 100]} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => `${v}%`} />
                  <Line type="monotone" dataKey="pct" stroke="var(--accent)" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Weekly comparison + Task distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Weekly Comparison" icon={BookOpen} subtitle="Hours & completion by week">
          <div className="h-64">
            {analysis.weeks.every((w) => w.tasks === 0) ? (
              <EmptyChart label="No weeks with data yet." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analysis.weeks.map((w) => ({ ...w, hours: +(w.minutes / 60).toFixed(1) }))} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="hours" name="Hours" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="completion" name="Completion %" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Task Distribution" icon={PieIcon} subtitle="Share of tasks by type">
          <div className="h-64">
            {analysis.typeData.length === 0 ? (
              <EmptyChart label="No tasks this month." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analysis.typeData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius="55%"
                    outerRadius="85%"
                    paddingAngle={2}
                    stroke="var(--background)"
                    strokeWidth={2}
                  >
                    {analysis.typeData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <RTooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Subject + chapter progress */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Subject Progress" icon={BookOpen} subtitle="Time invested and completion">
          {analysis.subjectData.length === 0 ? (
            <EmptyChart label="No subjects tagged yet." />
          ) : (
            <div className="flex flex-col gap-3">
              {analysis.subjectData.slice(0, 6).map((s, i) => (
                <div key={s.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                      <span className="truncate font-semibold text-foreground">
                        {s.name}
                      </span>
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {s.hours}h · {s.completion}%
                    </span>
                  </div>
                  <Progress value={s.completion} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Chapter Progress" icon={Layers} subtitle="Top chapters by study time">
          {analysis.chapterData.length === 0 ? (
            <EmptyChart label="Tag chapters on tasks to see progress." />
          ) : (
            <div className="flex flex-col gap-3">
              {analysis.chapterData.map((c, i) => (
                <div key={c.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: CHART_COLORS[(i + 2) % CHART_COLORS.length] }}
                      />
                      <span className="truncate font-semibold text-foreground">
                        Chapter · {c.name}
                      </span>
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {c.hours}h · {c.completion}%
                    </span>
                  </div>
                  <Progress value={c.completion} className="h-1.5" />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function HighlightTile({
  label,
  value,
  hint,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "primary" | "emerald" | "amber" | "rose" | "sky" | "violet";
}) {
  const toneMap = {
    primary: "bg-primary/10 text-primary ring-primary/20",
    emerald: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
    amber: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
    rose: "bg-rose-500/10 text-rose-500 ring-rose-500/20",
    sky: "bg-sky-500/10 text-sky-500 ring-sky-500/20",
    violet: "bg-violet-500/10 text-violet-500 ring-violet-500/20",
  } as const;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-3.5 shadow-sm">
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1",
          toneMap[tone],
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 truncate text-sm font-bold text-foreground">
          {value}
        </div>
        {hint && (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

function MonthHeatmap({
  days,
}: {
  days: {
    iso: string;
    day: number;
    minutes: number;
    done: number;
    total: number;
    pct: number;
    weekday: number;
  }[];
}) {
  const max = Math.max(1, ...days.map((d) => d.minutes));
  // Build week-aligned grid: pad leading weekdays with null
  const leading = days.length ? days[0].weekday : 0;
  const cells: (typeof days[number] | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...days,
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="aspect-square" aria-hidden />;
          const intensity = c.minutes / max;
          return (
            <UITooltip key={c.iso}>
              <TooltipTrigger asChild>
                <div
                  className="relative flex aspect-square flex-col justify-between rounded-lg border border-border/40 p-1.5 text-[10px] transition-transform hover:scale-[1.06]"
                  style={{
                    background:
                      intensity === 0
                        ? "var(--muted)"
                        : `color-mix(in oklab, var(--primary) ${Math.max(18, Math.round(intensity * 100))}%, transparent)`,
                    color:
                      intensity > 0.55
                        ? "var(--primary-foreground)"
                        : "var(--foreground)",
                  }}
                >
                  <span className="font-semibold tabular-nums">{c.day}</span>
                  {c.total > 0 && (
                    <span className="self-end text-[9px] font-semibold tabular-nums opacity-80">
                      {c.done}/{c.total}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                <div className="font-medium">
                  {new Date(c.iso).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                {c.total === 0 ? (
                  <div className="text-muted-foreground">No tasks</div>
                ) : (
                  <>
                    <div>
                      Study:{" "}
                      <span className="font-medium">{fmtDuration(c.minutes)}</span>
                    </div>
                    <div>
                      Tasks:{" "}
                      <span className="font-medium">
                        {c.done}/{c.total}
                      </span>
                    </div>
                    <div>
                      Completion:{" "}
                      <span className="font-medium">{c.pct}%</span>
                    </div>
                  </>
                )}
              </TooltipContent>
            </UITooltip>
          );
        })}
      </div>
    </div>
  );
}
