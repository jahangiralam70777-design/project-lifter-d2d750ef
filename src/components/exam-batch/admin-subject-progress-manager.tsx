// Admin · Exam Batch · Subject Progress Manager
// -----------------------------------------------------------------------------
// Real-data admin surface. Wires filter selects, analytics cards, ranking
// table and student-detail drawer to the Exam Batch Subject Progress
// server functions. Realtime invalidations are handled by
// `use-exam-batch-realtime.ts` under the `["exam-batch","admin",
// "subject-progress",...]` query-key bucket.

import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Flame,
  Layers,
  LineChart as LineChartIcon,
  PieChart,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DataTable,
  EmptyState,
  PageHeader,
  SectionCard,
  StatCard,
  ghostBtnCls,
  type Column,
} from "./kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ChartCanvas,
  ChapterStatusPill,
  PerformanceBadge,
  ProgressBar,
  ProgressRing,
} from "./subject-progress";
import { BarChart, LineChart, StackBar } from "./charts";
import {
  adminGetExamBatchSubjectProgressFilters,
  adminGetExamBatchStudentSubjectProgress,
  adminListExamBatchSubjectProgressRanking,
  ANALYTICS_WINDOW_DAYS,
  type AdminRankingRow,
  type AdminChapterAggregate,
} from "@/lib/exam-batch/subject-progress.functions";

const ALL = "all";

export function AdminSubjectProgressManager() {
  const [sessionId, setSessionId] = useState<string>("");
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [chapterId, setChapterId] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminRankingRow | null>(null);

  // Debounce search input so every keystroke doesn't refetch the ranking.
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Filters (sessions + subjects + chapters). Chapters depend on subject.
  const filtersQuery = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "subject-progress",
      "filters",
      subjectId === ALL ? null : subjectId,
    ],
    queryFn: () =>
      adminGetExamBatchSubjectProgressFilters({
        data: subjectId === ALL ? {} : { subjectId },
      }),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const sessions = filtersQuery.data?.sessions ?? [];
  const subjects = filtersQuery.data?.subjects ?? [];
  const chapters = filtersQuery.data?.chapters ?? [];

  // Default session = the most recent one once filters load.
  useEffect(() => {
    if (!sessionId && sessions.length > 0) setSessionId(sessions[0].id);
  }, [sessionId, sessions]);

  // If subject changes, reset chapter.
  useEffect(() => {
    setChapterId(ALL);
  }, [subjectId]);

  const rankingQuery = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "subject-progress",
      "ranking",
      sessionId,
      subjectId,
      chapterId,
      debouncedSearch,
    ],
    queryFn: () =>
      adminListExamBatchSubjectProgressRanking({
        data: {
          sessionId,
          ...(subjectId === ALL ? {} : { subjectId }),
          ...(chapterId === ALL ? {} : { chapterId }),
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          limit: 200,
          offset: 0,
        },
      }),
    enabled: !!sessionId,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
  const rows = rankingQuery.data?.rows ?? [];
  const chapterAggregates = rankingQuery.data?.chapterAggregates ?? [];
  const lastActivityAt = rankingQuery.data?.lastActivityAt ?? null;

  const chapterPerformanceData = useMemo(
    () =>
      chapterAggregates
        .filter((c) => c.avgScore != null)
        .map((c) => ({ label: c.chapterName, value: Math.round(c.avgScore as number) })),
    [chapterAggregates],
  );

  const chapterCompletionSegments = useMemo(() => {
    const completed = chapterAggregates.reduce((s, c) => s + c.completed, 0);
    const missed = chapterAggregates.reduce((s, c) => s + c.missed, 0);
    return [
      {
        label: "Completed",
        value: completed,
        className: "bg-gradient-to-r from-emerald-500 to-teal-500",
      },
      {
        label: "Missed",
        value: missed,
        className: "bg-gradient-to-r from-rose-500 to-red-500",
      },
    ];
  }, [chapterAggregates]);

  const performanceTrendPoints = useMemo(
    () =>
      chapterAggregates
        .filter((c) => c.avgScore != null)
        .map((c) => Math.round(c.avgScore as number)),
    [chapterAggregates],
  );

  const rankingChartData = useMemo(
    () =>
      rows
        .filter((r) => r.overallProgress != null)
        .slice(0, 10)
        .map((r) => ({
          label: r.studentName ?? (r.studentId != null ? `ID ${r.studentId}` : "Student"),
          value: Math.round(r.overallProgress as number),
        })),
    [rows],
  );

  // KPIs derived from the ranking (single source, no extra query).
  const kpis = useMemo(() => {
    if (rows.length === 0)
      return {
        enrolled: 0,
        chapters: 0,
        avgOverall: null as number | null,
        missed: 0,
      };
    const overalls = rows.map((r) => r.overallProgress).filter((v): v is number => v != null);
    return {
      enrolled: rows.length,
      chapters: rows.reduce((s, r) => Math.max(s, r.totalChapters), 0),
      avgOverall: overalls.length
        ? Math.round((overalls.reduce((s, v) => s + v, 0) / overalls.length) * 100) / 100
        : null,
      missed: rows.reduce((s, r) => s + r.missedChapters, 0),
    };
  }, [rows]);

  const highlights = useMemo(() => {
    const scored = rows.filter((r) => r.overallProgress != null);
    const topPerformers = [...scored]
      .sort((a, b) => (b.overallProgress ?? 0) - (a.overallProgress ?? 0))
      .slice(0, 5);
    const needsImprovement = [...scored]
      .sort((a, b) => (a.overallProgress ?? 0) - (b.overallProgress ?? 0))
      .slice(0, 5);

    const chAgg = [...chapterAggregates];
    const mostMissed = [...chAgg]
      .filter((c) => c.missed > 0)
      .sort((a, b) => b.missed - a.missed || (b.completed - a.completed))
      .slice(0, 5);
    const bestPerforming = [...chAgg]
      .filter((c) => c.avgScore != null)
      .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
      .slice(0, 5);
    return { topPerformers, needsImprovement, mostMissed, bestPerforming };
  }, [rows, chapterAggregates]);

  const lastActivityLabel = lastActivityAt
    ? new Date(lastActivityAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : `No activity in the last ${ANALYTICS_WINDOW_DAYS} days`;

  const columns: Column<AdminRankingRow & { id: string; rank: number }>[] = [
    {
      key: "rank",
      header: "Rank",
      cell: (r) => <span className="font-display font-bold">#{r.rank}</span>,
      className: "w-16",
    },
    {
      key: "student",
      header: "Student",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-semibold">{r.studentName ?? "—"}</p>
          <p className="text-[11px] text-muted-foreground">
            {r.studentId != null ? `ID ${r.studentId}` : "No student ID"}
            {r.studentEmail ? ` · ${r.studentEmail}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "overall",
      header: "Overall",
      cell: (r) => (
        <div className="flex min-w-[140px] items-center gap-2">
          <ProgressBar value={r.overallProgress} tone="primary" />
          <span className="shrink-0 tabular-nums">
            {r.overallProgress == null ? "—" : `${Math.round(r.overallProgress)}%`}
          </span>
        </div>
      ),
    },
    {
      key: "completed",
      header: "Completed",
      cell: (r) => <span className="tabular-nums">{r.completedChapters}</span>,
    },
    {
      key: "missed",
      header: "Missed",
      cell: (r) => <span className="tabular-nums">{r.missedChapters}</span>,
    },
    {
      key: "notConducted",
      header: "Not conducted",
      cell: (r) => <span className="tabular-nums">{r.chaptersNotConducted}</span>,
    },
    {
      key: "highest",
      header: "Highest",
      cell: (r) => (
        <span className="tabular-nums">
          {r.highestScore == null ? "—" : `${Math.round(r.highestScore)}%`}
        </span>
      ),
    },
    {
      key: "lowest",
      header: "Lowest",
      cell: (r) => (
        <span className="tabular-nums">
          {r.lowestScore == null ? "—" : `${Math.round(r.lowestScore)}%`}
        </span>
      ),
    },
    {
      key: "action",
      header: "",
      cell: (r) => (
        <button
          type="button"
          onClick={() => setSelected(r)}
          disabled={subjectId === ALL}
          title={subjectId === ALL ? "Pick a subject to view chapter details" : "View details"}
          className={cn(
            ghostBtnCls,
            "h-8 px-3 py-1 text-xs",
            subjectId === ALL && "cursor-not-allowed opacity-60",
          )}
        >
          Details
        </button>
      ),
      className: "w-24",
    },
  ];

  const rankedRows = rows.map((r, i) => ({ ...r, id: r.enrollmentId, rank: i + 1 }));

  const isLoadingRanking =
    !!sessionId && rankingQuery.isLoading && !rankingQuery.data;
  const isErrorRanking = rankingQuery.isError;

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch"
        title="Subject Progress Manager"
        description={`Chapter-level progress, performance and rankings across every student · last ${ANALYTICS_WINDOW_DAYS} days.`}
        icon={BarChart3}
      />

      <SectionCard title="Filters" description="Narrow down by session, subject, chapter or student">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="Session"
            value={sessionId}
            onChange={setSessionId}
            placeholder={filtersQuery.isLoading ? "Loading sessions…" : "Select session"}
            emptyLabel="No sessions available"
            options={sessions.map((s) => ({ id: s.id, name: s.title }))}
            includeAll={false}
          />
          <FilterSelect
            label="Subject"
            value={subjectId}
            onChange={setSubjectId}
            placeholder="All subjects"
            emptyLabel="No subjects available"
            options={subjects.map((s) => ({ id: s.id, name: s.name }))}
          />
          <FilterSelect
            label="Chapter"
            value={chapterId}
            onChange={setChapterId}
            placeholder={subjectId === ALL ? "Pick a subject first" : "All chapters"}
            emptyLabel={subjectId === ALL ? "Pick a subject first" : "No chapters"}
            options={chapters.map((c) => ({ id: c.id, name: c.name }))}
            disabled={subjectId === ALL}
          />
          <div className="min-w-0">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
              Student
            </p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email or ID"
                className="h-10 rounded-xl bg-background/60 pl-9 backdrop-blur"
              />
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Enrolled students"
          value={isLoadingRanking ? "…" : String(kpis.enrolled)}
          icon={Users}
          tone="primary"
        />
        <StatCard
          label="Chapters covered"
          value={isLoadingRanking ? "…" : String(kpis.chapters)}
          icon={Layers}
          tone="info"
        />
        <StatCard
          label="Avg. overall progress"
          value={
            isLoadingRanking
              ? "…"
              : kpis.avgOverall == null
                ? "—"
                : `${Math.round(kpis.avgOverall)}%`
          }
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Missed attempts"
          value={isLoadingRanking ? "…" : String(kpis.missed)}
          icon={XCircle}
          tone="warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard title="Batch Overall Progress" description="Average across ranked students">
          <div className="flex flex-col items-center gap-3 py-2">
            <ProgressRing value={kpis.avgOverall} label="Progress" />
            <p className="text-xs text-muted-foreground">
              {kpis.enrolled === 0
                ? "Ranking will populate once students appear."
                : `Across ${kpis.enrolled} student${kpis.enrolled === 1 ? "" : "s"}.`}
            </p>
          </div>
        </SectionCard>
        <ChartCanvas
          title="Chapter Performance"
          description="Batch average per chapter"
          icon={PieChart}
          className="lg:col-span-2"
          height={220}
        >
          {chapterPerformanceData.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No chapter scores in the last {ANALYTICS_WINDOW_DAYS} days.
            </p>
          ) : (
            <div className="h-full max-h-[260px] w-full overflow-y-auto pr-1">
              <BarChart data={chapterPerformanceData} />
            </div>
          )}
        </ChartCanvas>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCanvas
          title="Performance Trend"
          description="Batch average per chapter"
          icon={LineChartIcon}
        >
          {performanceTrendPoints.length < 2 ? (
            <p className="text-xs text-muted-foreground">
              Not enough completed chapters to plot a trend.
            </p>
          ) : (
            <LineChart
              series={[{ label: "Avg score", points: performanceTrendPoints }]}
              height={180}
            />
          )}
        </ChartCanvas>
        <ChartCanvas
          title="Completed vs Missed"
          description="Attendance distribution"
          icon={Trophy}
        >
          {chapterCompletionSegments.every((s) => s.value === 0) ? (
            <p className="text-xs text-muted-foreground">No chapter activity yet.</p>
          ) : (
            <div className="w-full">
              <StackBar segments={chapterCompletionSegments} />
            </div>
          )}
        </ChartCanvas>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCanvas
          title="Student Ranking"
          description="Top 10 by overall progress"
          icon={BarChart3}
        >
          {rankingChartData.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ranking chart populates once students have scores.
            </p>
          ) : (
            <div className="h-full max-h-[280px] w-full overflow-y-auto pr-1">
              <BarChart data={rankingChartData} />
            </div>
          )}
        </ChartCanvas>
        <ChartCanvas
          title="Chapter Analytics"
          description="Completed vs missed per chapter"
          icon={Layers}
        >
          {chapterAggregates.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No chapter activity in this window.
            </p>
          ) : (
            <ul className="h-full w-full space-y-2 overflow-y-auto pr-1 text-left">
              {chapterAggregates.map((c) => {
                const total = c.completed + c.missed || 1;
                const completedPct = Math.round((c.completed / total) * 100);
                return (
                  <li key={c.chapterId} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-semibold">{c.chapterName}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {c.completed}/{c.completed + c.missed}
                      </span>
                    </div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-500"
                        style={{ width: `${completedPct}%` }}
                      />
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 to-red-500"
                        style={{ width: `${100 - completedPct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ChartCanvas>
      </div>

      <SectionCard
        title={`Recent Activity · Last ${ANALYTICS_WINDOW_DAYS} Days`}
        description="Latest submission across the ranked students in this window"
      >
        <div className="flex items-center gap-3">
          <div className="bg-cta-gradient grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-glow ring-1 ring-white/20">
            <CalendarClock className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Last activity
            </p>
            <p className="truncate font-display text-lg font-bold tracking-tight">
              {lastActivityLabel}
            </p>
          </div>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cta-gradient/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary ring-1 ring-inset ring-primary/20">
            <Sparkles className="h-3 w-3" /> {ANALYTICS_WINDOW_DAYS}-day window
          </span>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <HighlightList
          title="Top Performers"
          description="Highest overall progress in this window"
          icon={Trophy}
          accent="success"
          items={highlights.topPerformers.map((r) => ({
            id: r.enrollmentId,
            primary: r.studentName ?? "—",
            secondary: r.studentId != null ? `ID ${r.studentId}` : r.studentEmail ?? "",
            value: r.overallProgress == null ? "—" : `${Math.round(r.overallProgress)}%`,
          }))}
          emptyLabel="No performers yet in this window"
        />
        <HighlightList
          title="Needs Improvement"
          description="Lowest overall progress in this window"
          icon={TrendingDown}
          accent="danger"
          items={highlights.needsImprovement.map((r) => ({
            id: r.enrollmentId,
            primary: r.studentName ?? "—",
            secondary: r.studentId != null ? `ID ${r.studentId}` : r.studentEmail ?? "",
            value: r.overallProgress == null ? "—" : `${Math.round(r.overallProgress)}%`,
          }))}
          emptyLabel="No students below threshold"
        />
        <HighlightList
          title="Most Missed Chapters"
          description="Chapters with the highest miss count"
          icon={XCircle}
          accent="warning"
          items={highlights.mostMissed.map((c) => ({
            id: c.chapterId,
            primary: c.chapterName,
            secondary: c.subjectName ?? "",
            value: `${c.missed} missed`,
          }))}
          emptyLabel="No missed attempts in this window"
        />
        <HighlightList
          title="Best Performing Chapters"
          description="Highest average chapter score"
          icon={Flame}
          accent="success"
          items={highlights.bestPerforming.map((c) => ({
            id: c.chapterId,
            primary: c.chapterName,
            secondary: c.subjectName ?? "",
            value: c.avgScore == null ? "—" : `${Math.round(c.avgScore)}%`,
          }))}
          emptyLabel="Not enough completed chapters yet"
        />
      </div>

      <SectionCard
        title="Ranking"
        description={
          subjectId === ALL
            ? "Overall progress across every enrolled subject"
            : "Ranking scoped to the selected subject"
        }
      >
        {isErrorRanking ? (
          <EmptyState
            icon={Trophy}
            title="Unable to load ranking"
            description="Please refresh the page. If the issue persists, contact support."
          />
        ) : isLoadingRanking ? (
          <RankingSkeleton />
        ) : rankedRows.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No ranking to show yet"
            description="Once students appear in this batch, their ranking will populate this table."
          />
        ) : (
          <DataTable columns={columns} rows={rankedRows} />
        )}
      </SectionCard>

      <StudentDetailsDrawer
        selected={selected}
        subjectId={subjectId === ALL ? null : subjectId}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

function RankingSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-12 animate-pulse rounded-2xl bg-muted/40"
        />
      ))}
    </div>
  );
}

function HighlightList({
  title,
  description,
  icon: Icon,
  accent,
  items,
  emptyLabel,
}: {
  title: string;
  description?: string;
  icon: typeof Trophy;
  accent: "success" | "danger" | "warning" | "primary";
  items: Array<{ id: string; primary: string; secondary?: string; value: string }>;
  emptyLabel: string;
}) {
  const accentBg =
    accent === "success"
      ? "bg-gradient-to-br from-emerald-500 to-teal-500"
      : accent === "danger"
        ? "bg-gradient-to-br from-rose-500 to-red-500"
        : accent === "warning"
          ? "bg-gradient-to-br from-amber-500 to-orange-500"
          : "bg-cta-gradient";
  return (
    <SectionCard title={title} description={description}>
      {items.length === 0 ? (
        <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground ring-1 ring-inset ring-border/40">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={it.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl bg-background/40 p-3 ring-1 ring-inset ring-border/40 transition hover:bg-background/70 hover:shadow-glow"
            >
              <div
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-glow ring-1 ring-white/20",
                  accentBg,
                )}
              >
                <span className="font-display text-xs font-bold tabular-nums">#{i + 1}</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{it.primary}</p>
                {it.secondary && (
                  <p className="truncate text-[11px] text-muted-foreground">{it.secondary}</p>
                )}
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-semibold tabular-nums">
                <Icon className="h-3 w-3 text-muted-foreground" />
                {it.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  placeholder,
  emptyLabel,
  options,
  includeAll = true,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  emptyLabel: string;
  options: { id: string; name: string }[];
  includeAll?: boolean;
  disabled?: boolean;
}) {
  const isDisabled = disabled || options.length === 0;
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <Select value={value} onValueChange={onChange} disabled={isDisabled}>
        <SelectTrigger className="h-10 rounded-xl border-border/60 bg-background/60 backdrop-blur">
          <SelectValue
            placeholder={options.length === 0 ? emptyLabel : placeholder}
          />
        </SelectTrigger>
        <SelectContent>
          {includeAll && <SelectItem value={ALL}>All</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function StudentDetailsDrawer({
  selected,
  subjectId,
  onClose,
}: {
  selected: AdminRankingRow | null;
  subjectId: string | null;
  onClose: () => void;
}) {
  const open = !!selected && !!subjectId;
  const detailQuery = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "subject-progress",
      "detail",
      selected?.enrollmentId,
      subjectId,
    ],
    queryFn: () =>
      adminGetExamBatchStudentSubjectProgress({
        data: { enrollmentId: selected!.enrollmentId, subjectId: subjectId! },
      }),
    enabled: open,
    staleTime: 15_000,
  });
  const detail = detailQuery.data;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">
            {selected?.studentName ?? detail?.student?.name ?? "Student details"}
          </SheetTitle>
          <SheetDescription>
            {selected
              ? `${selected.studentId != null ? `ID ${selected.studentId}` : "No student ID"} · ${
                  detail?.subject?.name ?? "Subject"
                }`
              : "Chapter-level breakdown"}
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-4">
          {detailQuery.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-muted/40" />
              ))}
            </div>
          ) : detailQuery.isError || !detail ? (
            <EmptyState
              icon={BookOpenCheck}
              title="Unable to load student details"
              description="Please close and reopen this drawer to retry."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard
                  label="Overall"
                  value={
                    detail.analytics.overallProgress == null
                      ? "—"
                      : `${Math.round(detail.analytics.overallProgress)}%`
                  }
                  icon={CheckCircle2}
                  tone="primary"
                />
                <StatCard
                  label="Highest"
                  value={
                    detail.analytics.highestScore == null
                      ? "—"
                      : `${Math.round(detail.analytics.highestScore)}%`
                  }
                  icon={BarChart3}
                  tone="info"
                />
                <StatCard
                  label="Completed"
                  value={String(detail.analytics.completedChapters)}
                  icon={CheckCircle2}
                  tone="success"
                />
                <StatCard
                  label="Missed"
                  value={String(detail.analytics.missedChapters)}
                  icon={XCircle}
                  tone="warning"
                />
              </div>
              <SectionCard title="Chapters" description="Latest score, status and performance">
                {detail.chapters.length === 0 ? (
                  <EmptyState
                    icon={BookOpenCheck}
                    title="No chapters"
                    description="This subject has no chapters yet."
                  />
                ) : (
                  <ul className="space-y-2">
                    {detail.chapters.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center gap-3 rounded-2xl bg-background/40 p-3 ring-1 ring-inset ring-border/40"
                      >
                        <div className="bg-cta-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white shadow-glow ring-1 ring-white/20">
                          <BookOpenCheck className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{c.name}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <ProgressBar value={c.progress} />
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                              {c.progress == null ? "—" : `${Math.round(c.progress)}%`}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <PerformanceBadge tone={c.performance} />
                          <ChapterStatusPill status={c.status} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
              {detail.analytics.trend.length > 0 && (
                <SectionCard title="Progress Timeline" description="Latest chapter scores over time">
                  <ul className="space-y-2 text-xs">
                    {detail.analytics.trend.map((t) => (
                      <li
                        key={`${t.chapterId}-${t.submittedAt}`}
                        className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{t.chapterName}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(t.submittedAt).toLocaleString()}
                          </p>
                        </div>
                        <span className="shrink-0 font-display text-sm font-bold tabular-nums">
                          {Math.round(t.percentage)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </SectionCard>
              )}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground transition hover:bg-muted"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </SheetContent>
    </Sheet>
  );
}

// Suppress lint on referenced-but-icon-used names (Clock is passed to
// ChartCanvas defaults elsewhere).
void Clock;