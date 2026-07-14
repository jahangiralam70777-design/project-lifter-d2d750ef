/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  BookMarked,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  FileText,
  Flame,
  GraduationCap,
  Hourglass,
  Layers,
  ListChecks,
  Loader2,
  NotebookPen,
  Plus,
  RefreshCcw,
  Sparkles,
  Target,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLevels } from "@/hooks/use-levels";
import { listSubjects, listChapters } from "@/lib/learning.functions";
import {
  useStudyRoutines,
  useStudyRoutineTasks,
  useStudyRoutineMutations,
} from "@/hooks/use-study-routine";
import type {
  StudyRoutineRow,
  StudyRoutineTaskRow,
} from "@/lib/study-routine.functions";
import { WeeklyAnalytics, MonthlyAnalytics } from "./StudyRoutineAnalytics";
import { ManageRoutinesCard } from "./ManageRoutinesCard";
import {
  CreateRoutineDialog,
  type CreateRoutinePayload,
} from "./CreateRoutineDialog";

type FilterKey =
  | "today"
  | "tomorrow"
  | "week"
  | "month"
  | "completed"
  | "pending";

type RoutineType = StudyRoutineRow["type"];
type TaskType = StudyRoutineTaskRow["task_type"];
type Priority = StudyRoutineTaskRow["priority"];
type TaskStatus = StudyRoutineTaskRow["status"];

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  study: "Study",
  mcq: "MCQ Practice",
  quiz: "Quiz",
  mock: "Mock Test",
  revision: "Revision",
  custom: "Custom",
};

const TASK_TYPE_ICON: Record<
  TaskType,
  React.ComponentType<{ className?: string }>
> = {
  study: BookOpen,
  mcq: ListChecks,
  quiz: Zap,
  mock: Trophy,
  revision: RefreshCcw,
  custom: Sparkles,
};

const TASK_TYPE_TONE: Record<TaskType, string> = {
  study: "bg-primary/10 text-primary border-primary/25",
  mcq: "bg-sky-500/10 text-sky-600 border-sky-500/25 dark:text-sky-400",
  quiz: "bg-violet-500/10 text-violet-600 border-violet-500/25 dark:text-violet-400",
  mock: "bg-amber-500/10 text-amber-600 border-amber-500/25 dark:text-amber-400",
  revision:
    "bg-teal-500/10 text-teal-600 border-teal-500/25 dark:text-teal-400",
  custom: "bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/25 dark:text-fuchsia-400",
};

const STATUS_STYLES: Record<
  TaskStatus,
  { label: string; dot: string; badge: string; ring: string; accent: string }
> = {
  completed: {
    label: "Completed",
    dot: "bg-emerald-500",
    badge:
      "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
    ring: "ring-emerald-500/20",
    accent: "bg-emerald-500",
  },
  in_progress: {
    label: "In Progress",
    dot: "bg-amber-500",
    badge:
      "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400",
    ring: "ring-amber-500/20",
    accent: "bg-amber-500",
  },
  pending: {
    label: "Pending",
    dot: "bg-rose-500",
    badge:
      "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
    ring: "ring-rose-500/20",
    accent: "bg-rose-500",
  },
};

const PRIORITY_STYLES: Record<Priority, string> = {
  low: "bg-sky-500/10 text-sky-600 border-sky-500/30 dark:text-sky-400",
  medium:
    "bg-violet-500/10 text-violet-600 border-violet-500/30 dark:text-violet-400",
  high: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
};

const PRIORITY_ACCENT: Record<Priority, string> = {
  low: "bg-sky-500",
  medium: "bg-violet-500",
  high: "bg-rose-500",
};

function todayISO(offset = 0) {
  // Use LOCAL calendar date, not UTC. toISOString() would shift a
  // late-evening user into "tomorrow" and skew daily analytics.
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeTime(t: string) {
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function minutesBetween(a: string, b: string) {
  const [ah, am] = normalizeTime(a).split(":").map(Number);
  const [bh, bm] = normalizeTime(b).split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

function formatDuration(mins: number) {
  const m = Math.max(0, mins);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// -----------------------------------------------------------------------------
// Root
// -----------------------------------------------------------------------------

export function StudyRoutineFlow() {
  const [filter, setFilter] = useState<FilterKey>("today");
  const [editing, setEditing] = useState<StudyRoutineTaskRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [routineDialogOpen, setRoutineDialogOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<StudyRoutineRow | null>(
    null,
  );

  const tasksQuery = useStudyRoutineTasks();
  const routinesQuery = useStudyRoutines({ includeArchived: true });
  const mut = useStudyRoutineMutations();

  const tasks = tasksQuery.data ?? [];

  // Resolve subject names once so every task card can display them.
  const subjectsFn = useServerFn(listSubjects);
  const subjectsAllQuery = useQuery({
    queryKey: ["sr-all-subjects"],
    queryFn: async () =>
      (await subjectsFn({ data: undefined as any })) as Array<{
        id: string;
        name: string;
        level: string;
      }>,
    staleTime: 60_000,
  });
  const subjectMap = useMemo(() => {
    const m = new Map<string, string>();
    (subjectsAllQuery.data ?? []).forEach((s) => m.set(s.id, s.name));
    return m;
  }, [subjectsAllQuery.data]);

  const filtered = useMemo(() => filterTasks(tasks, filter), [tasks, filter]);
  const todays = useMemo(
    () => tasks.filter((t) => t.task_date === todayISO()),
    [tasks],
  );

  const stats = useMemo(() => {
    const total = todays.length;
    const completed = todays.filter((t) => t.status === "completed").length;
    const inProgress = todays.filter((t) => t.status === "in_progress").length;
    const pending = todays.filter((t) => t.status === "pending").length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    const studyMinutes = todays.reduce(
      (a, t) => a + Math.max(0, minutesBetween(t.start_time, t.end_time)),
      0,
    );
    return { total, completed, inProgress, pending, pct, studyMinutes };
  }, [todays]);

  const loading = tasksQuery.isLoading;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:gap-8 lg:p-8">
        <Header />

        <CreateRoutineCard
          onCreate={() => {
            setEditingRoutine(null);
            setRoutineDialogOpen(true);
          }}
          routines={routinesQuery.data ?? []}
          onCopyPrevious={(id) => mut.duplicateRoutine.mutate(id)}
        />

        <ManageRoutinesCard
          routines={routinesQuery.data ?? []}
          loading={routinesQuery.isLoading}
        />

        <FilterBar
          value={filter}
          onChange={setFilter}
          count={filtered.length}
          tasks={tasks}
        />

        {filter === "week" ? (
          <WeeklyAnalytics tasks={tasks} subjectMap={subjectMap} />
        ) : filter === "month" ? (
          <MonthlyAnalytics tasks={tasks} subjectMap={subjectMap} />
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:gap-8">
            <div className="lg:col-span-3">
              <TodaysRoutineCard
                stats={stats}
                tasks={filtered}
                loading={loading}
                subjectMap={subjectMap}
                onEdit={(t) => {
                  setEditing(t);
                  setDialogOpen(true);
                }}
                onCreate={() => {
                  setEditingRoutine(null);
                  setRoutineDialogOpen(true);
                }}
                onDelete={(id) => mut.deleteTask.mutate(id)}
                onStatus={(id, status) =>
                  mut.setTaskStatus.mutate({ id, status })
                }
                onDuplicate={(t) => mut.duplicateTask.mutate(t.id)}
              />
            </div>
            <div className="flex flex-col gap-6 lg:col-span-2 lg:gap-8">
              <RoutineOverviewCard tasks={tasks} />
              <MonthlySummaryCard tasks={tasks} />
            </div>
          </div>
        )}

        <RoutineCalendarCard tasks={tasks} />

        <CreateRoutineDialog
          open={routineDialogOpen}
          onOpenChange={setRoutineDialogOpen}
          initial={editingRoutine}
          saving={mut.saveRoutine.isPending}
          onSave={(payload: CreateRoutinePayload) => {
            mut.saveRoutine.mutate(payload as never, {
              onSuccess: () => {
                setRoutineDialogOpen(false);
                setEditingRoutine(null);
              },
            });
          }}
        />

        <TaskDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initial={editing}
          onSave={(payload) => {
            mut.upsertTask.mutate(payload, {
              onSuccess: () => setDialogOpen(false),
            });
          }}
          saving={mut.upsertTask.isPending}
        />
      </div>
    </TooltipProvider>
  );
}

// -----------------------------------------------------------------------------
// Header
// -----------------------------------------------------------------------------

function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent ring-1 ring-primary/25 sm:h-14 sm:w-14">
          <CalendarDays className="h-6 w-6 text-primary sm:h-7 sm:w-7" />
          <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground shadow-sm">
            <Sparkles className="h-2.5 w-2.5" />
          </span>
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl lg:text-[1.75rem]">
            Study Routine
          </h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            Plan smart. Study consistently. Achieve more.
          </p>
        </div>
      </div>
      <Badge
        variant="secondary"
        className="shrink-0 gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Premium Planner
      </Badge>
    </motion.header>
  );
}

// -----------------------------------------------------------------------------
// Cascading Level → Subject → Chapter reader
// -----------------------------------------------------------------------------

function useAcademicCascade(level: string | null, subjectId: string | null) {
  const levelsQuery = useLevels();
  const subjectsFn = useServerFn(listSubjects);
  const chaptersFn = useServerFn(listChapters);

  const subjectsQuery = useQuery({
    queryKey: ["sr-subjects", level ?? "__all"],
    queryFn: async () =>
      (await subjectsFn({
        data: level ? { level } : undefined,
      })) as Array<{ id: string; name: string; level: string }>,
    staleTime: 30_000,
  });

  const chaptersQuery = useQuery({
    queryKey: ["sr-chapters", subjectId ?? "__none"],
    queryFn: async () => {
      if (!subjectId) return [] as Array<{ id: string; name: string }>;
      return (await chaptersFn({
        data: { subjectId },
      })) as Array<{ id: string; name: string }>;
    },
    enabled: !!subjectId,
    staleTime: 30_000,
  });

  return { levelsQuery, subjectsQuery, chaptersQuery };
}

// -----------------------------------------------------------------------------
// Create routine card
// -----------------------------------------------------------------------------

function CreateRoutineCard({
  onCreate,
  routines,
  onCopyPrevious,
}: {
  onCreate: () => void;
  routines: StudyRoutineRow[];
  onCopyPrevious: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
    >
      <Card className="relative overflow-hidden border-border/60 shadow-sm">
        <div className="pointer-events-none absolute inset-x-0 -top-24 h-40 bg-gradient-to-b from-primary/10 to-transparent blur-2xl" />
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Plus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                Create a new routine
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                One place for details, task settings and scheduling. Occurrences
                appear automatically on the dates you pick.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {routines.length > 0 && (
              <Select
                onValueChange={(v) => {
                  if (v) onCopyPrevious(v);
                }}
              >
                <SelectTrigger className="h-10 w-full gap-1.5 text-xs sm:w-[220px]">
                  <Copy className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <SelectValue placeholder="Copy previous routine" />
                </SelectTrigger>
                <SelectContent className="max-w-[calc(100vw-2rem)]">
                  {routines.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              className="h-10 w-full gap-2 shadow-sm sm:w-auto"
              onClick={onCreate}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="truncate">Create Routine</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}


function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </Label>
      {children}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Filter bar
// -----------------------------------------------------------------------------

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "completed", label: "Completed" },
  { key: "pending", label: "Pending" },
];

function FilterBar({
  value,
  onChange,
  count,
  tasks,
}: {
  value: FilterKey;
  onChange: (k: FilterKey) => void;
  count: number;
  tasks: StudyRoutineTaskRow[];
}) {
  const counts = useMemo(() => {
    const map: Partial<Record<FilterKey, number>> = {};
    FILTERS.forEach((f) => (map[f.key] = filterTasks(tasks, f.key).length));
    return map;
  }, [tasks]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTERS.map((f) => {
        const active = value === f.key;
        const n = counts[f.key] ?? 0;
        return (
          <motion.button
            key={f.key}
            onClick={() => onChange(f.key)}
            whileTap={{ scale: 0.96 }}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
              "hover:border-primary/40 hover:bg-primary/5",
              active
                ? "border-primary/50 bg-primary text-primary-foreground shadow-sm hover:bg-primary"
                : "border-border bg-card text-muted-foreground",
            )}
          >
            {f.label}
            <span
              className={cn(
                "ml-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                active
                  ? "bg-primary-foreground/20 text-primary-foreground"
                  : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
              )}
            >
              {n}
            </span>
          </motion.button>
        );
      })}
      <span className="ml-auto text-xs text-muted-foreground">
        Showing {count} task{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function filterTasks(
  tasks: StudyRoutineTaskRow[],
  filter: FilterKey,
): StudyRoutineTaskRow[] {
  const today = todayISO();
  const tomorrow = todayISO(1);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() + 7);
  const monthEnd = new Date(now);
  monthEnd.setMonth(now.getMonth() + 1);

  return tasks.filter((t) => {
    const d = new Date(t.task_date);
    switch (filter) {
      case "today":
        return t.task_date === today;
      case "tomorrow":
        return t.task_date === tomorrow;
      case "week":
        return d >= now && d <= weekEnd;
      case "month":
        return d >= now && d <= monthEnd;
      case "completed":
        return t.status === "completed";
      case "pending":
        return t.status === "pending";
    }
  });
}

// -----------------------------------------------------------------------------
// Today's routine
// -----------------------------------------------------------------------------

function TodaysRoutineCard({
  stats,
  tasks,
  loading,
  subjectMap,
  onCreate,
  onEdit,
  onDelete,
  onStatus,
  onDuplicate,
}: {
  stats: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    pct: number;
    studyMinutes: number;
  };
  tasks: StudyRoutineTaskRow[];
  loading: boolean;
  subjectMap: Map<string, string>;
  onCreate: () => void;
  onEdit: (t: StudyRoutineTaskRow) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, s: TaskStatus) => void;
  onDuplicate: (t: StudyRoutineTaskRow) => void;
}) {
  return (
    <Card className="h-full border-border/60 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <ListChecks className="h-4 w-4" />
              </span>
              Today's Routine
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Your plan for the day
            </p>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 gap-1.5 rounded-full border-border/70 px-3 py-1 text-xs"
          >
            <CalendarDays className="h-3 w-3 text-primary" />
            {new Date().toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid grid-cols-1 items-center gap-4 rounded-2xl border border-border/60 bg-gradient-to-br from-muted/40 via-muted/20 to-transparent p-4 sm:grid-cols-[auto_1fr] sm:gap-6 sm:p-5">
          <CompletionRing pct={stats.pct} />
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat label="Total" value={stats.total} icon={Target} />
            <MiniStat
              label="Completed"
              value={stats.completed}
              icon={CheckCircle2}
              tone="emerald"
            />
            <MiniStat
              label="In Progress"
              value={stats.inProgress}
              icon={Loader2}
              tone="amber"
            />
            <MiniStat
              label="Study Time"
              value={formatDuration(stats.studyMinutes)}
              icon={Clock}
              tone="primary"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {loading ? (
            <>
              <TaskSkeleton />
              <TaskSkeleton />
              <TaskSkeleton />
            </>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              {tasks.length === 0 ? (
                <EmptyTasks key="empty" onCreate={onCreate} />
              ) : (
                tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    subjectMap={subjectMap}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onStatus={onStatus}
                    onDuplicate={onDuplicate}
                  />
                ))
              )}
            </AnimatePresence>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskSkeleton() {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
}

function EmptyTasks({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 bg-muted/10 p-8 text-center"
    >
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <NotebookPen className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">
          No tasks in this view
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add your first task to start building a consistent routine.
        </p>
      </div>
      <Button size="sm" onClick={onCreate} className="mt-1 gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Create Routine
      </Button>
    </motion.div>
  );
}

function CompletionRing({ pct }: { pct: number }) {
  const size = 112;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <div className="relative mx-auto grid h-28 w-28 place-items-center sm:mx-0">
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="sr-ring-grad" x1="0" y1="0" x2="1" y2="1">
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
          stroke="url(#sr-ring-grad)"
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
            {pct}
            <span className="text-sm font-medium text-muted-foreground">%</span>
          </div>
          <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Complete
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "emerald" | "amber" | "rose" | "primary";
}) {
  const toneMap = {
    emerald: {
      icon: "text-emerald-500",
      chip: "bg-emerald-500/10 text-emerald-500 ring-emerald-500/20",
    },
    amber: {
      icon: "text-amber-500",
      chip: "bg-amber-500/10 text-amber-500 ring-amber-500/20",
    },
    rose: {
      icon: "text-rose-500",
      chip: "bg-rose-500/10 text-rose-500 ring-rose-500/20",
    },
    primary: {
      icon: "text-primary",
      chip: "bg-primary/10 text-primary ring-primary/20",
    },
    none: {
      icon: "text-primary",
      chip: "bg-primary/10 text-primary ring-primary/20",
    },
  } as const;
  const t = toneMap[tone ?? "none"];
  return (
    <div className="group flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/80 p-2.5 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
      <div
        className={cn(
          "grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1",
          t.chip,
        )}
      >
        <Icon className={cn("h-4 w-4", t.icon)} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="truncate text-sm font-bold tabular-nums text-foreground">
          {value}
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  subjectMap,
  onEdit,
  onDelete,
  onStatus,
  onDuplicate,
}: {
  task: StudyRoutineTaskRow;
  subjectMap: Map<string, string>;
  onEdit: (t: StudyRoutineTaskRow) => void;
  onDelete: (id: string) => void;
  onStatus: (id: string, s: TaskStatus) => void;
  onDuplicate: (t: StudyRoutineTaskRow) => void;
}) {
  const s = STATUS_STYLES[task.status];
  const TypeIcon = TASK_TYPE_ICON[task.task_type];
  const durationMins = Math.max(
    0,
    minutesBetween(task.start_time, task.end_time),
  );
  const subjectName = task.subject_id
    ? (subjectMap.get(task.subject_id) ?? null)
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-4 shadow-sm ring-1 ring-transparent transition-all",
        "hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg",
        s.ring,
      )}
    >
      {/* Priority accent bar */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1",
          PRIORITY_ACCENT[task.priority],
        )}
      />

      <div className="flex flex-col gap-3 pl-2 sm:flex-row sm:items-start sm:gap-4">
        {/* Type icon tile */}
        <div
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-xl border",
            TASK_TYPE_TONE[task.task_type],
          )}
        >
          <TypeIcon className="h-5 w-5" />
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="min-w-0 truncate text-sm font-semibold text-foreground sm:text-[15px]">
              {task.title}
            </h3>
            {task.notes && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  {task.notes}
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Meta chips */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <Badge
              variant="outline"
              className={cn("gap-1 px-2 py-0.5", TASK_TYPE_TONE[task.task_type])}
            >
              <TypeIcon className="h-3 w-3" />
              {TASK_TYPE_LABEL[task.task_type]}
            </Badge>
            <Badge
              variant="outline"
              className={cn("capitalize", PRIORITY_STYLES[task.priority])}
            >
              {task.priority}
            </Badge>
            <Badge variant="outline" className={cn("gap-1", s.badge)}>
              <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
              {s.label}
            </Badge>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {task.level_code && (
              <span className="inline-flex items-center gap-1">
                <GraduationCap className="h-3 w-3" /> {task.level_code}
              </span>
            )}
            {subjectName && (
              <span className="inline-flex min-w-0 items-center gap-1">
                <BookOpen className="h-3 w-3" />
                <span className="max-w-[14ch] truncate">{subjectName}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> {normalizeTime(task.start_time)}
              <span className="text-muted-foreground/60">–</span>
              {normalizeTime(task.end_time)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Hourglass className="h-3 w-3" /> {formatDuration(durationMins)}
            </span>
          </div>

          {/* Progress */}
          <div className="mt-3 flex items-center gap-2.5">
            <Progress
              value={task.completion}
              className="h-1.5 flex-1 bg-muted"
            />
            <span className="w-9 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
              {task.completion}%
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-1 sm:flex-col sm:items-end sm:gap-1.5">
          <Select
            value={task.status}
            onValueChange={(v) => onStatus(task.id, v as TaskStatus)}
          >
            <SelectTrigger
              className={cn(
                "h-8 w-[150px] gap-1.5 text-xs font-medium",
                STATUS_STYLES[task.status].badge,
              )}
              aria-label="Change status"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_STYLES[task.status].dot)} />
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="pending">
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                  Not Completed
                </span>
              </SelectItem>
              <SelectItem value="in_progress">
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  In Progress
                </span>
              </SelectItem>
              <SelectItem value="completed">
                <span className="inline-flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Completed
                </span>
              </SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onDuplicate(task)}
                  aria-label="Duplicate"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Duplicate</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => onEdit(task)}
                  aria-label="Edit"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Edit</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                  onClick={() => onDelete(task.id)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Delete</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// Overview + summary
// -----------------------------------------------------------------------------

function RoutineOverviewCard({ tasks }: { tasks: StudyRoutineTaskRow[] }) {
  const data = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    return days.map((label, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - day + i);
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      const iso = `${y}-${mo}-${da}`;
      const dayTasks = tasks.filter((t) => t.task_date === iso);
      const total = dayTasks.length;
      const done = dayTasks.filter((t) => t.status === "completed").length;
      return { day: label, planned: total, completed: done };
    });
  }, [tasks]);

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <TrendingUp className="h-4 w-4" />
          </span>
          Routine Overview
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Completed vs planned tasks per day
        </p>
      </CardHeader>
      <CardContent className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="currentColor" className="text-border" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="currentColor" className="text-muted-foreground" fontSize={11} />
            <RTooltip
              cursor={{ fill: "var(--muted)", opacity: 0.4 }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--popover-foreground)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="planned" name="Planned (Target)" radius={[6, 6, 0, 0]} fill="currentColor" className="fill-muted-foreground/40" />
            <Bar dataKey="completed" name="Completed" radius={[6, 6, 0, 0]} fill="currentColor" className="fill-primary" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}


function MonthlySummaryCard({ tasks }: { tasks: StudyRoutineTaskRow[] }) {
  const summary = useMemo(() => {
    const now = new Date();
    // Local YYYY-MM prefix. Using toISOString would flip east-of-UTC users
    // into the neighboring month around midnight and drop this month's data.
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthTasks = tasks.filter((t) => t.task_date.startsWith(monthPrefix));

    const days = new Set(monthTasks.map((t) => t.task_date));
    const completedDays = new Set(
      monthTasks
        .filter((t) => t.status === "completed")
        .map((t) => t.task_date),
    );
    const subjects = new Set(
      monthTasks.map((t) => t.subject_id ?? t.level_code ?? "—"),
    );
    const totalMinutes = monthTasks.reduce(
      (acc, t) => acc + Math.max(0, minutesBetween(t.start_time, t.end_time)),
      0,
    );
    return {
      studyDays: days.size,
      completedDays: completedDays.size,
      completionRate: days.size
        ? Math.round((completedDays.size / days.size) * 100)
        : 0,
      studyTime: formatDuration(totalMinutes),
      subjects: subjects.size,
      tasksCompleted: monthTasks.filter((t) => t.status === "completed").length,
    };
  }, [tasks]);

  const items: Array<{
    label: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    tone: "primary" | "emerald" | "amber" | "rose";
  }> = [
    { label: "Study Days", value: summary.studyDays, icon: CalendarDays, tone: "primary" },
    { label: "Completed", value: summary.completedDays, icon: CheckCircle2, tone: "emerald" },
    { label: "Completion", value: `${summary.completionRate}%`, icon: Flame, tone: "amber" },
    { label: "Study Time", value: summary.studyTime, icon: Clock, tone: "primary" },
    { label: "Subjects", value: summary.subjects, icon: BookOpen, tone: "primary" },
    { label: "Tasks Done", value: summary.tasksCompleted, icon: Trophy, tone: "amber" },
  ];

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Trophy className="h-4 w-4" />
          </span>
          Monthly Summary
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          A snapshot of this month
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {items.map((it) => (
            <MiniStat
              key={it.label}
              label={it.label}
              value={it.value}
              icon={it.icon}
              tone={it.tone}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Calendar
// -----------------------------------------------------------------------------

function RoutineCalendarCard({ tasks }: { tasks: StudyRoutineTaskRow[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const { grid, monthLabel } = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const todayIso = todayISO();

  function daySummary(iso: string | null) {
    if (!iso) return null;
    const day = tasks.filter((t) => t.task_date === iso);
    if (day.length === 0)
      return {
        status: "empty" as const,
        total: 0,
        done: 0,
        pct: 0,
        minutes: 0,
      };
    const done = day.filter((t) => t.status === "completed").length;
    const minutes = day.reduce(
      (a, t) => a + Math.max(0, minutesBetween(t.start_time, t.end_time)),
      0,
    );
    const pct = Math.round((done / day.length) * 100);
    const status =
      done === day.length
        ? ("completed" as const)
        : done === 0
          ? ("missed" as const)
          : ("partial" as const);
    return { status, total: day.length, done, pct, minutes };
  }

  const legend = [
    { key: "completed", label: "Completed", cls: "bg-emerald-500" },
    { key: "partial", label: "Partial", cls: "bg-amber-500" },
    { key: "missed", label: "Not Completed", cls: "bg-rose-500" },
    { key: "empty", label: "No Routine", cls: "bg-muted" },
  ];

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <CalendarDays className="h-4 w-4" />
              </span>
              Routine Calendar
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Hover a day for its summary
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border/60 bg-card p-1 shadow-sm">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full"
              onClick={() => setCursor(shiftMonth(cursor, -1))}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[9rem] text-center text-sm font-semibold text-foreground">
              {monthLabel}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full"
              onClick={() => setCursor(shiftMonth(cursor, 1))}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {grid.map((cell, i) => {
            if (!cell.iso) {
              return (
                <div
                  key={i}
                  className="aspect-square rounded-xl border border-transparent"
                  aria-hidden
                />
              );
            }
            const sum = daySummary(cell.iso)!;
            const isToday = cell.iso === todayIso;
            const tone =
              sum.status === "completed"
                ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:text-emerald-400 hover:bg-emerald-500/25"
                : sum.status === "partial"
                  ? "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400 hover:bg-amber-500/25"
                  : sum.status === "missed"
                    ? "bg-rose-500/15 text-rose-600 border-rose-500/30 dark:text-rose-400 hover:bg-rose-500/25"
                    : "bg-muted/30 text-muted-foreground border-border/60 hover:bg-muted/60";
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className={cn(
                      "relative aspect-square rounded-xl border p-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                      tone,
                      isToday && "ring-2 ring-primary/60 ring-offset-1 ring-offset-background",
                    )}
                  >
                    <div className="flex h-full flex-col justify-between">
                      <span className="font-semibold tabular-nums">
                        {cell.day}
                      </span>
                      {sum.status !== "empty" && (
                        <div className="flex items-center justify-end gap-0.5">
                          <span className="text-[9px] font-semibold tabular-nums opacity-80">
                            {sum.done}/{sum.total}
                          </span>
                        </div>
                      )}
                    </div>
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent className="text-xs">
                  <div className="flex flex-col gap-0.5">
                    <div className="font-semibold text-foreground">
                      {new Date(cell.iso).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    {sum.status === "empty" ? (
                      <div className="text-muted-foreground">No tasks</div>
                    ) : (
                      <>
                        <div>
                          Tasks:{" "}
                          <span className="font-medium">
                            {sum.done}/{sum.total}
                          </span>
                        </div>
                        <div>
                          Completion:{" "}
                          <span className="font-medium">{sum.pct}%</span>
                        </div>
                        <div>
                          Study time:{" "}
                          <span className="font-medium">
                            {formatDuration(sum.minutes)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <Separator />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
          {legend.map((l) => (
            <span key={l.key} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-full", l.cls)} />
              {l.label}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function shiftMonth(d: Date, delta: number) {
  const n = new Date(d);
  n.setMonth(n.getMonth() + delta);
  return n;
}

function buildMonthGrid(cursor: Date) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const startWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: { day: number | null; iso: string | null }[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push({ day: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    // Local-calendar ISO. toISOString() would drift by one day for
    // east-of-UTC users (their local midnight is the previous UTC day).
    const mm = String(m + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    const iso = `${y}-${mm}-${dd}`;
    cells.push({ day: d, iso });
  }

  while (cells.length % 7 !== 0) cells.push({ day: null, iso: null });
  const monthLabel = cursor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  return { grid: cells, monthLabel };
}

// -----------------------------------------------------------------------------
// Task dialog
// -----------------------------------------------------------------------------

type TaskFormPayload = {
  id?: string;
  routine_id: string | null;
  level_code: string | null;
  subject_id: string | null;
  chapter_id: string | null;
  title: string;
  description: string | null;
  task_type: TaskType;
  task_date: string;
  start_time: string;
  end_time: string;
  priority: Priority;
  status: TaskStatus;
  completion: number;
  notes: string | null;
};

function makeDefaultTask(): TaskFormPayload {
  return {
    routine_id: null,
    level_code: null,
    subject_id: null,
    chapter_id: null,
    title: "",
    description: null,
    task_type: "study",
    task_date: todayISO(),
    start_time: "09:00",
    end_time: "10:00",
    priority: "medium",
    status: "pending",
    completion: 0,
    notes: null,
  };
}

function TaskDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: StudyRoutineTaskRow | null;
  onSave: (payload: TaskFormPayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<TaskFormPayload>(() => makeDefaultTask());

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        id: initial.id,
        routine_id: initial.routine_id,
        level_code: initial.level_code,
        subject_id: initial.subject_id,
        chapter_id: initial.chapter_id,
        title: initial.title,
        description: initial.description,
        task_type: initial.task_type,
        task_date: initial.task_date,
        start_time: normalizeTime(initial.start_time),
        end_time: normalizeTime(initial.end_time),
        priority: initial.priority,
        status: initial.status,
        completion: initial.completion,
        notes: initial.notes,
      });
    } else {
      setForm(makeDefaultTask());
    }
  }, [open, initial]);

  const { levelsQuery, subjectsQuery, chaptersQuery } = useAcademicCascade(
    form.level_code,
    form.subject_id,
  );
  const levels = levelsQuery.data ?? [];
  const subjects = subjectsQuery.data ?? [];
  const chapters = chaptersQuery.data ?? [];

  function set<K extends keyof TaskFormPayload>(
    key: K,
    value: TaskFormPayload[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Task" : "New Task"}</DialogTitle>
          <DialogDescription>
            Fill in the details for this study task.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. Revise chapter 3"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Level</Label>
            <Select
              value={form.level_code ?? undefined}
              onValueChange={(v) => {
                set("level_code", v);
                set("subject_id", null);
                set("chapter_id", null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select level" />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <Select
              value={form.subject_id ?? undefined}
              onValueChange={(v) => {
                set("subject_id", v);
                set("chapter_id", null);
              }}
              disabled={!form.level_code}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !form.level_code ? "Select level first" : "Select subject"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Chapter</Label>
            <Select
              value={form.chapter_id ?? undefined}
              onValueChange={(v) => set("chapter_id", v)}
              disabled={!form.subject_id}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !form.subject_id
                      ? "Select subject first"
                      : "Select chapter"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {chapters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select
              value={form.task_type}
              onValueChange={(v) => set("task_type", v as TaskType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_TYPE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Date</Label>
            <Input
              type="date"
              value={form.task_date}
              onChange={(e) => set("task_date", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => set("priority", v as Priority)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => set("status", v as TaskStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Start</Label>
            <Input
              type="time"
              value={form.start_time}
              onChange={(e) => set("start_time", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">End</Label>
            <Input
              type="time"
              value={form.end_time}
              onChange={(e) => set("end_time", e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Completion %
            </Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={form.completion}
              onChange={(e) =>
                set(
                  "completion",
                  Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                )
              }
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={form.description ?? ""}
              onChange={(e) =>
                set("description", e.target.value ? e.target.value : null)
              }
              rows={2}
              placeholder="Short description"
            />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) =>
                set("notes", e.target.value ? e.target.value : null)
              }
              rows={2}
              placeholder="Optional notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving}
            onClick={() => {
              if (!form.title.trim()) return;
              onSave(form);
            }}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : initial ? (
              "Save Changes"
            ) : (
              "Create Task"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
