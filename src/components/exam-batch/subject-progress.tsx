// Exam Batch · Subject Progress (student surface)
// -----------------------------------------------------------------------------
// UI shell + data wiring for the student-facing "Subject Progress" section
// rendered on the Exam Batch Dashboard. All data comes from the Exam Batch
// backend via `getExamBatchStudentSubjectList` /
// `getExamBatchStudentSubjectProgress` — no fake, demo, or placeholder data.
//
// Realtime invalidations are wired in `use-exam-batch-realtime.ts` under the
// query keys `["exam-batch","student","subject-progress",...]` so this
// surface refreshes automatically when exams / attempts / results /
// enrollments / subjects / chapters change.
//
// Design language is 100% inherited from the existing Exam Batch kit:
//   - glass surface + shadow-card-soft cards
//   - bg-cta-gradient primary accents
//   - StatCard / SectionCard / EmptyState / StatusBadge from ./kit
//   - font-display headings, rounded-3xl containers, tabular-nums numerics

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  CalendarClock,
  Flame,
  Gauge,
  Layers,
  LineChart as LineChartIcon,
  ListChecks,
  PieChart,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  TrendingDown,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  EmptyState,
  SectionCard,
  StatCard,
} from "./kit";
import {
  BarChart,
  DonutChart,
  LineChart,
  StackBar,
} from "./charts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getExamBatchStudentSubjectList,
  getExamBatchStudentSubjectProgress,
  ANALYTICS_WINDOW_DAYS,
  type ChapterProgressDTO,
  type SubjectProgressDTO,
} from "@/lib/exam-batch/subject-progress.functions";
import { useExamBatchAccess } from "./access-gate";

// -----------------------------------------------------------------------------
// Small primitives (kept local — inherit the existing token palette)
// -----------------------------------------------------------------------------

export type ChapterStatus = "completed" | "missed" | "not_conducted";
export type PerformanceTone = "excellent" | "good" | "average" | "needs_work";

function ProgressBar({
  value,
  tone = "primary",
  className,
}: {
  value: number | null;
  tone?: "primary" | "success" | "warning" | "danger" | "muted";
  className?: string;
}) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const toneMap: Record<string, string> = {
    primary: "bg-cta-gradient",
    success: "bg-gradient-to-r from-emerald-500 to-teal-500",
    warning: "bg-gradient-to-r from-amber-500 to-orange-500",
    danger: "bg-gradient-to-r from-rose-500 to-red-500",
    muted: "bg-muted-foreground/40",
  };
  return (
    <div
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted/70 ring-1 ring-inset ring-border/40",
        className,
      )}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={cn("h-full rounded-full", toneMap[tone])}
      />
    </div>
  );
}

function PerformanceBadge({ tone }: { tone: PerformanceTone | null }) {
  const map: Record<PerformanceTone, { label: string; cls: string }> = {
    excellent: {
      label: "Excellent",
      cls: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30",
    },
    good: {
      label: "Good",
      cls: "bg-sky-500/15 text-sky-500 ring-sky-500/30",
    },
    average: {
      label: "Average",
      cls: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
    },
    needs_work: {
      label: "Needs work",
      cls: "bg-rose-500/15 text-rose-500 ring-rose-500/30",
    },
  };
  const item = tone ? map[tone] : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset",
        item?.cls ?? "bg-muted text-muted-foreground ring-border",
      )}
    >
      <Target className="h-3 w-3" />
      {item?.label ?? "—"}
    </span>
  );
}

function ChapterStatusPill({ status }: { status: ChapterStatus }) {
  const map: Record<ChapterStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    completed: {
      label: "Completed",
      cls: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30",
      Icon: CheckCircle2,
    },
    missed: {
      label: "Missed",
      cls: "bg-rose-500/15 text-rose-500 ring-rose-500/30",
      Icon: XCircle,
    },
    not_conducted: {
      label: "Not conducted yet",
      cls: "bg-muted text-muted-foreground ring-border",
      Icon: Clock,
    },
  };
  const item = map[status];
  const Icon = item.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset",
        item.cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {item.label}
    </span>
  );
}

function ProgressRing({
  value,
  size = 148,
  stroke = 12,
  label,
  sub,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const dash = c * (pct / 100);
  const gradId = "sp-ring-grad";
  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="fill-none stroke-muted"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className={cn("fill-none", `stroke-[url(#${gradId})]`)}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - dash }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.68 0.22 300)" />
            <stop offset="100%" stopColor="oklch(0.62 0.24 260)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-3xl font-bold tabular-nums">
          {value == null ? "—" : `${Math.round(pct)}%`}
        </span>
        {label && (
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </span>
        )}
      </div>
      {sub && <p className="mt-2 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Chart placeholders — no data is invented; each renders a labelled canvas
// with a subtle grid so the layout, spacing and colour language are locked in.
// -----------------------------------------------------------------------------

function ChartCanvas({
  title,
  description,
  icon: Icon,
  height = 200,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon: typeof PieChart;
  height?: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "glass shadow-card-soft flex h-full flex-col overflow-hidden rounded-2xl p-4 sm:p-5",
        className,
      )}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-sm font-semibold tracking-tight sm:text-base">
            {title}
          </h3>
          {description && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="bg-cta-gradient flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-glow ring-1 ring-white/20">
          <Icon className="h-4 w-4" />
        </div>
      </header>
      <div
        className="relative flex-1 overflow-hidden rounded-xl bg-muted/30 ring-1 ring-inset ring-border/40"
        style={{ minHeight: height }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-30" />
        <div className="relative flex h-full w-full items-center justify-center px-4 py-6 text-center">
          {children ?? (
            <p className="text-xs text-muted-foreground">
              Chart will populate once data is available.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Skeletons — mirror the final layout so there is zero shift on load
// -----------------------------------------------------------------------------

function ShimmerBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-muted/40",
        className,
      )}
    >
      <div
        className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent"
        style={{ animation: "shimmer 2s linear infinite", backgroundSize: "200% 100%" }}
      />
    </div>
  );
}

export function SubjectProgressSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <ShimmerBlock key={i} className="h-24" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ShimmerBlock className="h-64 lg:col-span-1" />
        <ShimmerBlock className="h-64 lg:col-span-2" />
      </div>
      <ShimmerBlock className="h-72" />
    </div>
  );
}

export function ChapterRowSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-muted/30 p-3">
      <ShimmerBlock className="h-10 w-10 rounded-xl" />
      <div className="flex-1 space-y-2">
        <ShimmerBlock className="h-3 w-1/3 rounded-md" />
        <ShimmerBlock className="h-2 w-full rounded-full" />
      </div>
      <ShimmerBlock className="h-6 w-16 rounded-full" />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Public: Student · Subject Progress Section (renders on the Exam Batch
// Dashboard alongside the "Upcoming Exams" section). This component is UI-only
// and never calls the network — it exposes loading/empty states out of the box.
// -----------------------------------------------------------------------------

export type SubjectOption = { id: string; name: string };

export function SubjectProgressSection({ className }: { className?: string }) {
  const { sessionId, canAccessDashboard } = useExamBatchAccess();
  const enabled = !!sessionId && canAccessDashboard;

  const subjectsQuery = useQuery({
    queryKey: ["exam-batch", "student", "subject-progress", "subjects", sessionId],
    queryFn: () =>
      getExamBatchStudentSubjectList({ data: sessionId ? { sessionId } : {} }),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const subjects = subjectsQuery.data ?? [];

  const [subjectId, setSubjectId] = useState<string>("");
  useEffect(() => {
    if (!subjectId && subjects.length > 0) setSubjectId(subjects[0].id);
    if (subjectId && subjects.length > 0 && !subjects.some((s) => s.id === subjectId)) {
      setSubjectId(subjects[0].id);
    }
  }, [subjects, subjectId]);

  const progressQuery = useQuery({
    queryKey: ["exam-batch", "student", "subject-progress", "detail", sessionId, subjectId],
    queryFn: () =>
      getExamBatchStudentSubjectProgress({
        data: { subjectId, ...(sessionId ? { sessionId } : {}) },
      }),
    enabled: enabled && !!subjectId,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });

  const isLoading =
    (subjectsQuery.isLoading && !subjectsQuery.data) ||
    (!!subjectId && progressQuery.isLoading && !progressQuery.data);
  const isError = subjectsQuery.isError || progressQuery.isError;

  return (
    <section className={cn("mt-8", className)}>
      <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
            Subject Progress
          </h2>
          <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
            Chapter-level performance across your enrolled subjects · last {ANALYTICS_WINDOW_DAYS} days.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Select
            value={subjectId}
            onValueChange={setSubjectId}
            disabled={subjects.length === 0 || isLoading}
          >
            <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-background/60 backdrop-blur sm:w-64">
              <SelectValue
                placeholder={
                  isLoading
                    ? "Loading subjects…"
                    : subjects.length === 0
                      ? "No subjects available"
                      : "Select a subject"
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
      </div>

      {isError ? (
        <EmptyState
          icon={BookOpenCheck}
          title="Unable to load subject progress"
          description="Please refresh the page. If the issue persists, contact support."
        />
      ) : isLoading ? (
        <SubjectProgressSkeleton />
      ) : subjects.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title="No enrolled subjects"
          description="You do not have any approved subjects in this exam batch yet."
        />
      ) : !progressQuery.data ? (
        <SubjectProgressSkeleton />
      ) : (
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={progressQuery.data.subject?.id ?? subjectId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <SubjectProgressBody data={progressQuery.data} />
          </motion.div>
        </AnimatePresence>
      )}
    </section>
  );
}

function SubjectProgressBody({ data }: { data: SubjectProgressDTO }) {
  return <SubjectProgressBodyInner data={data} />;
}

function SubjectHeader({
  name,
  lastUpdatedLabel,
  overall,
  strongest,
  weakest,
}: {
  name: string;
  lastUpdatedLabel: string;
  overall: number | null;
  strongest: { id: string; name: string; percentage: number } | null;
  weakest: { id: string; name: string; percentage: number } | null;
}) {
  return (
    <div className="glass shadow-card-soft rounded-3xl p-4 sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-cta-gradient grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-glow ring-1 ring-white/20">
            <BookOpenCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Selected subject
            </p>
            <h3 className="truncate font-display text-lg font-bold tracking-tight sm:text-xl">
              {name}
            </h3>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cta-gradient/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary ring-1 ring-inset ring-primary/20">
          <Sparkles className="h-3 w-3" /> {ANALYTICS_WINDOW_DAYS}-day window
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <HeaderPill icon={CalendarClock} label="Last updated" value={lastUpdatedLabel} />
        <HeaderPill
          icon={Gauge}
          label="Overall"
          value={overall == null ? "—" : `${Math.round(overall)}%`}
          accent="primary"
        />
        <HeaderPill
          icon={Flame}
          label="Strongest"
          value={
            strongest ? `${strongest.name} · ${Math.round(strongest.percentage)}%` : "—"
          }
          accent="success"
        />
        <HeaderPill
          icon={TrendingDown}
          label="Weakest"
          value={
            weakest ? `${weakest.name} · ${Math.round(weakest.percentage)}%` : "—"
          }
          accent="danger"
        />
      </div>
    </div>
  );
}

function HeaderPill({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof CalendarClock;
  label: string;
  value: string;
  accent?: "primary" | "success" | "danger";
}) {
  const accentCls =
    accent === "primary"
      ? "text-primary"
      : accent === "success"
        ? "text-emerald-500"
        : accent === "danger"
          ? "text-rose-500"
          : "text-foreground";
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-background/40 px-3 py-2 ring-1 ring-inset ring-border/40 transition hover:bg-background/70">
      <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted/60", accentCls)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-xs font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function SubjectProgressBodyInner({ data }: { data: SubjectProgressDTO }) {
  const a = data.analytics;
  const lastUpdatedLabel = a.lastUpdatedAt
    ? new Date(a.lastUpdatedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "No activity yet";

  if (!a.hasActivityInWindow) {
    return (
      <div className="space-y-4">
        <SubjectHeader
          name={data.subject?.name ?? "Subject"}
          lastUpdatedLabel={lastUpdatedLabel}
          overall={a.overallProgress}
          strongest={a.strongestChapter}
          weakest={a.weakestChapter}
        />
        <EmptyState
          icon={CalendarClock}
          title={`No activity in the last ${a.windowDays} days`}
          description="Take an exam to start seeing your Subject Progress analytics here. Historical results remain in your Exam History."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SubjectHeader
        name={data.subject?.name ?? "Subject"}
        lastUpdatedLabel={lastUpdatedLabel}
        overall={a.overallProgress}
        strongest={a.strongestChapter}
        weakest={a.weakestChapter}
      />

      {/* Analytics cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label={`Overall (${a.windowDays}d)`}
          value={a.overallProgress == null ? "—" : `${Math.round(a.overallProgress)}%`}
          icon={TrendingUp}
          tone="primary"
        />
        <StatCard
          label="Completed"
          value={String(a.completedChapters)}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Missed"
          value={String(a.missedChapters)}
          icon={XCircle}
          tone="warning"
        />
        <StatCard
          label="Not conducted"
          value={String(a.chaptersWithNoExam)}
          icon={Clock}
          tone="info"
        />
      </div>

      {/* Ring + Chapter list */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Overall Progress" description="Ring across all chapters">
          <div className="flex flex-col items-center gap-3 py-2">
            <ProgressRing value={a.overallProgress} label="Progress" />
            <p className="text-xs text-muted-foreground">
              Average score{" "}
              <span className="font-semibold text-foreground">
                {a.averageScore == null ? "—" : `${Math.round(a.averageScore)}%`}
              </span>
            </p>
            {a.strongestChapter || a.weakestChapter ? (
              <div className="mt-1 grid w-full grid-cols-1 gap-1 text-[11px] text-muted-foreground">
                {a.strongestChapter && (
                  <div className="flex items-center justify-between gap-2">
                    <span>Strongest</span>
                    <span className="truncate font-semibold text-foreground">
                      {a.strongestChapter.name} · {Math.round(a.strongestChapter.percentage)}%
                    </span>
                  </div>
                )}
                {a.weakestChapter && (
                  <div className="flex items-center justify-between gap-2">
                    <span>Weakest</span>
                    <span className="truncate font-semibold text-foreground">
                      {a.weakestChapter.name} · {Math.round(a.weakestChapter.percentage)}%
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="Chapter Progress"
          description="Latest score, progress and status per chapter"
          className="lg:col-span-2"
        >
          <ul className="space-y-2">
            {data.chapters.length === 0 ? (
              <li>
                <EmptyState
                  icon={Layers}
                  title="No chapters yet"
                  description="Chapters for this subject will appear here."
                />
              </li>
            ) : (
              data.chapters.map((c) => <ChapterRow key={c.id} chapter={c} />)
            )}
          </ul>
        </SectionCard>
      </div>

      {/* Charts area */}
      <StudentCharts data={data} />
    </div>
  );
}

function StudentCharts({ data }: { data: SubjectProgressDTO }) {
  const a = data.analytics;

  const chapterBars = useMemo(
    () =>
      data.chapters
        .filter((c) => c.latestScore != null)
        .map((c) => ({ label: c.name, value: Math.round(c.latestScore as number) })),
    [data.chapters],
  );

  const trendPoints = useMemo(
    () => a.trend.map((t) => Math.round(t.percentage)),
    [a.trend],
  );

  const donutSegments = useMemo(
    () => [
      {
        label: "Completed",
        value: a.completedChapters,
        className: "bg-gradient-to-r from-emerald-500 to-teal-500",
      },
      {
        label: "Missed",
        value: a.missedChapters,
        className: "bg-gradient-to-r from-rose-500 to-red-500",
      },
      {
        label: "Not conducted",
        value: a.chaptersWithNoExam,
        className: "bg-muted-foreground/40",
      },
    ],
    [a.completedChapters, a.missedChapters, a.chaptersWithNoExam],
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      <ChartCanvas title="Overall Progress" description="Across all chapters" icon={PieChart}>
        <div className="flex h-full w-full items-center justify-center">
          <DonutChart
            value={Math.round(a.overallProgress ?? 0)}
            size={148}
            stroke={14}
            label="Overall"
            sub={
              a.averageScore == null
                ? "No completed chapters yet"
                : `Avg score ${Math.round(a.averageScore)}%`
            }
          />
        </div>
      </ChartCanvas>
      <ChartCanvas
        title="Chapter Performance"
        description="Latest score per completed chapter"
        icon={ListChecks}
      >
        {chapterBars.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No chapter scores in the last {a.windowDays} days.
          </p>
        ) : (
          <div className="h-full w-full overflow-y-auto pr-1">
            <BarChart data={chapterBars} />
          </div>
        )}
      </ChartCanvas>
      <ChartCanvas
        title="Performance Trend"
        description="Score over time"
        icon={LineChartIcon}
      >
        {trendPoints.length < 2 ? (
          <p className="text-xs text-muted-foreground">
            Attempt more chapters to see the trend.
          </p>
        ) : (
          <LineChart
            series={[{ label: "Score", points: trendPoints }]}
            height={180}
          />
        )}
      </ChartCanvas>
      <ChartCanvas title="Timeline" description="Latest chapter submissions" icon={Clock}>
        {a.trend.length === 0 ? (
          <p className="text-xs text-muted-foreground">No attempts in this window.</p>
        ) : (
          <ul className="h-full w-full space-y-1.5 overflow-y-auto pr-1 text-left">
            {a.trend.map((t) => (
              <li
                key={`${t.chapterId}-${t.submittedAt}`}
                className="flex items-center justify-between gap-2 rounded-lg bg-background/50 px-2.5 py-1.5 ring-1 ring-inset ring-border/40"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold">{t.chapterName}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(t.submittedAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="shrink-0 font-display text-xs font-bold tabular-nums">
                  {Math.round(t.percentage)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartCanvas>
      <ChartCanvas
        title="Completed vs Missed"
        description="Chapter attendance split"
        icon={Trophy}
        className="md:col-span-2 xl:col-span-1"
      >
        {a.completedChapters + a.missedChapters + a.chaptersWithNoExam === 0 ? (
          <p className="text-xs text-muted-foreground">No chapter activity yet.</p>
        ) : (
          <div className="w-full">
            <StackBar segments={donutSegments} />
          </div>
        )}
      </ChartCanvas>
    </div>
  );
}

function ChapterRow({ chapter }: { chapter: ChapterProgressDTO }) {
  const progressTone: "primary" | "success" | "warning" | "danger" | "muted" =
    chapter.status === "not_conducted"
      ? "muted"
      : chapter.status === "missed"
        ? "danger"
        : chapter.performance === "excellent" || chapter.performance === "good"
          ? "success"
          : chapter.performance === "average"
            ? "warning"
            : "primary";
  return (
    <li>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-background/40 p-3 ring-1 ring-inset ring-border/40 transition hover:bg-background/70 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-cta-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow ring-1 ring-white/20">
            <BookOpenCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{chapter.name}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <ProgressBar value={chapter.progress} tone={progressTone} className="flex-1" />
              <span className="shrink-0 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {chapter.progress == null ? "—" : `${Math.round(chapter.progress)}%`}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:hidden">
          <ChapterStatusPill status={chapter.status} />
        </div>
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-muted px-2 py-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
              Latest{" "}
              <span className="text-foreground">
                {chapter.latestScore == null ? "—" : `${Math.round(chapter.latestScore)}%`}
              </span>
            </span>
            <PerformanceBadge tone={chapter.performance} />
            <span className="hidden sm:inline-flex">
              <ChapterStatusPill status={chapter.status} />
            </span>
          </div>
        </div>
      </div>
    </li>
  );
}

// -----------------------------------------------------------------------------
// Public: Admin · Subject Progress Manager (route surface). UI-only, no data.
// -----------------------------------------------------------------------------

export { ProgressBar, PerformanceBadge, ChapterStatusPill, ProgressRing, ChartCanvas };