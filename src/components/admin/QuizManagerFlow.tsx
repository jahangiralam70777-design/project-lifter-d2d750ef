import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Search,
  Plus,
  Sparkles,
  Send,
  EyeOff,
  Eye,
  Trash2,
  Copy,
  Filter,
  ListChecks,
  Timer,
  CheckCircle2,
  Activity,
  Trophy,
  Loader2,
  X,
  Save,
  Clock,
  Shuffle,
  Edit3,
  ArrowUp,
  ArrowDown,
  Wand2,
  CheckSquare,
  ExternalLink,
  Upload,
  TrendingUp,
  TrendingDown,
  Calendar,
  Target,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Database,
  Hand,
  FileText,
  Download,
  Users,
  Gauge,
  Bot,
  Archive,
  CalendarClock,
  PercentSquare,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListQuizzes,
  adminQuizStats,
  adminCreateQuiz,
  adminUpdateQuiz,
  adminDeleteQuiz,
  adminSetQuizStatus,
  adminDuplicateQuiz,
  adminGetQuizQuestions,
  adminSetQuizQuestions,
  adminAutoGenerateQuizzes,
  adminRegenerateQuizQuestions,
  adminBulkQuizAction,
  adminExportQuizzes,
} from "@/lib/admin-quiz.functions";

import { adminListLevels, adminListSubjects, adminListMcqs } from "@/lib/admin-mcq.functions";
import { adminListChapters, adminListAllChapters } from "@/lib/admin-mcq.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BulkUploadMcqsDialog } from "./BulkUploadMcqsDialog";
import { QuizKpiDetailDialog, type KpiMetric } from "./QuizKpiDetailDialog";
import { confirmDialog } from "@/components/ui/confirm-imperative";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown } from "lucide-react";
import { PageSizeSelect } from "@/components/ui/page-size-select";

type Quiz = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  subject_id: string | null;
  chapter_id: string | null;
  kind: "quiz" | "mock";
  status: "draft" | "published" | "archived";
  difficulty: "easy" | "medium" | "hard";
  total_questions: number;
  duration_seconds: number;
  starts_at: string | null;
  ends_at: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

const STATUS_TONE: Record<string, string> = {
  published: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400",
  draft: "border-amber-400/30 bg-amber-400/10 text-amber-400",
  archived: "border-rose-400/30 bg-rose-400/10 text-rose-400",
};

export function QuizManagerFlow() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListQuizzes);
  const statsFn = useServerFn(adminQuizStats);
  const levelsFn = useServerFn(adminListLevels);
  const subjectsFn = useServerFn(adminListSubjects);
  const delFn = useServerFn(adminDeleteQuiz);
  const statusFn = useServerFn(adminSetQuizStatus);
  const dupFn = useServerFn(adminDuplicateQuiz);
  const bulkFn = useServerFn(adminBulkQuizAction);
  const exportFn = useServerFn(adminExportQuizzes);

  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<string>("all");
  const [subjectId, setSubjectId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [statusTab, setStatusTab] = useState<
    "all" | "published" | "draft" | "scheduled" | "archived"
  >("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<Quiz | null>(null);
  const [creating, setCreating] = useState(false);
  const [builderFor, setBuilderFor] = useState<Quiz | null>(null);
  const [previewFor, setPreviewFor] = useState<Quiz | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [autoGenOpen, setAutoGenOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [genMode, setGenMode] = useState<"auto" | "bank" | "manual">("auto");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kpiMetric, setKpiMetric] = useState<KpiMetric | null>(null);

  const regenFn = useServerFn(adminRegenerateQuizQuestions);

  // realtime: invalidate on any quiz change
  useEffect(() => {
    const ch = supabase
      .channel(`quiz-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quizzes" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-quizzes"] });
        qc.invalidateQueries({ queryKey: ["admin-quiz-stats"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const stats = useQuery({ queryKey: ["admin-quiz-stats"], queryFn: () => statsFn() });
  const levels = useQuery({ queryKey: ["admin-levels"], queryFn: () => levelsFn() });
  const subjects = useQuery({ queryKey: ["admin-subjects"], queryFn: () => subjectsFn() });

  const filteredSubjects = useMemo(() => {
    const all = (subjects.data ?? []) as Array<{ id: string; name: string; level: string }>;
    return level === "all" ? all : all.filter((s) => s.level === level);
  }, [subjects.data, level]);

  const list = useQuery({
    queryKey: ["admin-quizzes", { search, level, subjectId, status, statusTab, page, pageSize }],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          level: level === "all" ? undefined : level,
          subjectId: subjectId === "all" ? undefined : subjectId,
          status:
            statusTab === "scheduled" || statusTab === "all"
              ? status === "all"
                ? undefined
                : (status as Quiz["status"])
              : (statusTab as Quiz["status"]),
          scheduled: statusTab === "scheduled" ? true : undefined,
          kind: "quiz",
          page,
          pageSize,
        },
      }),
    placeholderData: (prev) => prev,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-quizzes"] });
    qc.invalidateQueries({ queryKey: ["admin-quiz-stats"] });
  };

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Quiz deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusM = useMutation({
    mutationFn: (v: { id: string; status: Quiz["status"] }) => statusFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(`Quiz ${v.status}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const dupM = useMutation({
    mutationFn: (id: string) => dupFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Quiz duplicated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const regenM = useMutation({
    mutationFn: (id: string) => regenFn({ data: { quizId: id } }),
    onSuccess: (r: { picked: number }) => {
      toast.success(`Regenerated · ${r.picked} random MCQs`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (list.data?.rows ?? []) as Quiz[];
  const total = list.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const subjectName = (id: string | null) =>
    (subjects.data as Array<{ id: string; name: string }> | undefined)?.find((s) => s.id === id)
      ?.name ?? "—";

  const kpis: Array<KpiProps & { metric: KpiMetric }> = [
    {
      metric: "total",
      l: "Total Quizzes",
      v: stats.data?.total ?? 0,
      d: stats.data?.deltas.total ?? 0,
      i: ListChecks,
      c: "#a855f7",
    },
    {
      metric: "published",
      l: "Published",
      v: stats.data?.published ?? 0,
      d: stats.data?.deltas.published ?? 0,
      i: Send,
      c: "#22d3ee",
    },
    {
      metric: "draft",
      l: "Drafts",
      v: stats.data?.draft ?? 0,
      d: stats.data?.deltas.draft ?? 0,
      i: Edit3,
      c: "#fbbf24",
    },
    {
      metric: "scheduled",
      l: "Scheduled",
      v: stats.data?.scheduled ?? 0,
      d: 0,
      i: CalendarClock,
      c: "#60a5fa",
    },
    {
      metric: "archived",
      l: "Archived",
      v: stats.data?.archived ?? 0,
      d: 0,
      i: Archive,
      c: "#94a3b8",
    },
    {
      metric: "attempts",
      l: "Total Attempts",
      v: stats.data?.attempts ?? 0,
      d: stats.data?.deltas.attempts ?? 0,
      i: Trophy,
      c: "#34d399",
      fmt: "k" as const,
    },
  ];
  const kpis2: Array<KpiProps & { metric: KpiMetric }> = [
    {
      metric: "completion_rate",
      l: "Completion Rate",
      v: stats.data?.completionRate ?? 0,
      d: 0,
      i: PercentSquare,
      c: "#10b981",
      fmt: "pct" as const,
    },
    {
      metric: "avg_score",
      l: "Avg. Score",
      v: stats.data?.avgScore ?? 0,
      d: 0,
      i: Target,
      c: "#f472b6",
      fmt: "pct" as const,
    },
    {
      metric: "active_users",
      l: "Active Users (24h)",
      v: stats.data?.activeUsers ?? 0,
      d: 0,
      i: Users,
      c: "#38bdf8",
    },
    {
      metric: "performance_score",
      l: "Performance Score",
      v: stats.data?.performanceScore ?? 0,
      d: 0,
      i: Gauge,
      c: "#f59e0b",
      fmt: "pct" as const,
    },
    {
      metric: "ai_generated",
      l: "AI Generated",
      v: stats.data?.aiGenerated ?? 0,
      d: stats.data?.deltas.aiGenerated ?? 0,
      i: Bot,
      c: "#a78bfa",
    },
  ];

  const tabCounts = {
    all: stats.data?.total ?? 0,
    published: stats.data?.published ?? 0,
    draft: stats.data?.draft ?? 0,
    scheduled: stats.data?.scheduled ?? 0,
    archived: stats.data?.archived ?? 0,
  };

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleSelect = (id: string) => {
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const togglePage = () => {
    setSelected((p) => {
      const n = new Set(p);
      if (allOnPageSelected) rows.forEach((r) => n.delete(r.id));
      else rows.forEach((r) => n.add(r.id));
      return n;
    });
  };
  const clearSelection = () => setSelected(new Set());

  const bulkM = useMutation({
    mutationFn: (action: "publish" | "unpublish" | "archive" | "delete" | "duplicate") =>
      bulkFn({ data: { ids: Array.from(selected), action } }),
    onSuccess: (r: { count: number }, action) => {
      toast.success(`${action}: ${r.count} quizzes`);
      clearSelection();
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportM = useMutation({
    mutationFn: (scope: "selected" | "all") =>
      exportFn({
        data: { ids: scope === "selected" ? Array.from(selected) : undefined, format: "csv" },
      }),
    onSuccess: (r: { content: string; filename: string; mime: string }) => {
      const blob = new Blob([r.content], { type: r.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exported");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <section className="relative flex flex-wrap items-end justify-between gap-4 px-1">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold tracking-tight md:text-[34px]">
            Quiz Manager
          </h1>
          <p className="text-sm text-muted-foreground">
            Create, manage and track quizzes with powerful automation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl border-border/60"
            onClick={() => exportM.mutate("all")}
            disabled={exportM.isPending}
          >
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl border-border/60"
            onClick={() => setBulkOpen(true)}
          >
            <Upload className="mr-2 h-4 w-4" /> Bulk Upload MCQs
          </Button>
          <Button
            className="h-10 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-[0_10px_30px_-12px_rgba(139,92,246,0.7)] hover:from-violet-600 hover:to-indigo-600"
            onClick={() => setCreating(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Create Quiz
          </Button>
        </div>
      </section>

      {/* KPI cards — primary row */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpis.map((k) => (
          <KpiCard key={k.l} {...k} onClick={() => setKpiMetric(k.metric)} />
        ))}
      </section>
      {/* KPI cards — secondary row */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {kpis2.map((k) => (
          <KpiCard key={k.l} {...k} onClick={() => setKpiMetric(k.metric)} />
        ))}
      </section>

      <QuizKpiDetailDialog
        metric={kpiMetric}
        onClose={() => setKpiMetric(null)}
        onOpenQuiz={(id, action) => {
          const quiz = rows.find((r) => r.id === id);
          if (!quiz) return;
          setKpiMetric(null);
          if (action === "edit") setEditing(quiz);
          else if (action === "builder") setBuilderFor(quiz);
          else setPreviewFor(quiz);
        }}
      />

      {/* Quiz Generator */}
      <section className="glass shadow-card-soft overflow-hidden rounded-2xl border border-border/60">
        <div className="flex items-center justify-between border-b border-border/40 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-glow">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h3 className="font-display text-base font-bold tracking-tight">Quiz Generator</h3>
              <p className="text-[11px] text-muted-foreground">
                Generate quiz automatically in minutes using AI or from MCQ Bank.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-400/10 px-3 py-1 text-[11px] font-semibold text-violet-400">
            <Sparkles className="h-3 w-3" /> AI Powered
          </span>
        </div>
        {/* Mode tabs */}
        <div className="grid grid-cols-3 border-b border-border/40 text-sm">
          {(
            [
              { k: "auto", l: "Auto Generate", icon: Wand2 },
              { k: "bank", l: "From MCQ Bank", icon: Database },
              { k: "manual", l: "Manual Select", icon: Hand },
            ] as const
          ).map((t) => {
            const active = genMode === t.k;
            return (
              <button
                key={t.k}
                onClick={() => setGenMode(t.k)}
                className={`relative inline-flex items-center justify-center gap-2 px-3 py-3 text-xs font-medium transition ${
                  active ? "text-violet-500" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <t.icon className="h-3.5 w-3.5" /> {t.l}
                {active && (
                  <span className="absolute inset-x-6 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" />
                )}
              </button>
            );
          })}
        </div>
        <div className="p-5">
          <QuickQuizGeneratorPanel
            mode={genMode}
            levels={(levels.data as Array<{ code: string; name: string }>) ?? []}
            subjects={(subjects.data as Array<{ id: string; name: string; level: string }>) ?? []}
            onAuto={() => setAutoGenOpen(true)}
            onBank={() => setPickerOpen(true)}
            onManual={() => setCreating(true)}
            onDone={invalidate}
          />
        </div>
      </section>

      {/* Status tabs */}
      <section className="flex flex-wrap items-center gap-1 rounded-2xl border border-border/40 bg-background/40 p-1.5">
        {(["all", "published", "draft", "scheduled", "archived"] as const).map((t) => {
          const active = statusTab === t;
          const label = t === "all" ? "All Quizzes" : t.charAt(0).toUpperCase() + t.slice(1);
          return (
            <button
              key={t}
              onClick={() => {
                setStatusTab(t);
                setPage(1);
              }}
              className={`relative inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-medium transition ${
                active
                  ? "bg-gradient-to-r from-violet-500/15 to-indigo-500/15 text-violet-500 shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0 text-[10px] ${active ? "bg-violet-500/20 text-violet-500" : "bg-muted text-muted-foreground"}`}
              >
                {tabCounts[t]}
              </span>
            </button>
          );
        })}
      </section>

      {/* Filters */}
      <section className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search quizzes…"
            className="h-10 rounded-xl border-border/60 bg-background/60 pl-9"
          />
        </div>
        <Select
          value={level}
          onValueChange={(v) => {
            setLevel(v);
            setSubjectId("all");
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 w-36 rounded-xl border-border/60">
            <SelectValue placeholder="All Levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {((levels.data as Array<{ code: string; name: string }> | undefined) ?? []).map((l) => (
              <SelectItem key={l.code} value={l.code}>
                {l.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={subjectId}
          onValueChange={(v) => {
            setSubjectId(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 w-40 rounded-xl border-border/60">
            <SelectValue placeholder="All Subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {filteredSubjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-10 w-36 rounded-xl border-border/60">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="h-10 rounded-xl border-border/60"
          onClick={() => setShowFilters((v) => !v)}
        >
          <Filter className="mr-2 h-4 w-4" /> Filters
        </Button>
      </section>

      {showFilters && (
        <section className="glass rounded-2xl border border-border/60 p-3 text-xs text-muted-foreground">
          More filters coming soon — currently using Level, Subject and Status above.
        </section>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <section className="glass shadow-card-soft sticky top-2 z-20 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-violet-400/40 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 px-4 py-2.5">
          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-violet-500 px-2 text-[11px] font-bold text-white">
              {selected.size}
            </span>
            <span className="font-medium">selected</span>
            <button
              onClick={clearSelection}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg text-xs"
              disabled={bulkM.isPending}
              onClick={() => bulkM.mutate("publish")}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Publish
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg text-xs"
              disabled={bulkM.isPending}
              onClick={() => bulkM.mutate("unpublish")}
            >
              <EyeOff className="mr-1.5 h-3.5 w-3.5" />
              Unpublish
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg text-xs"
              disabled={bulkM.isPending}
              onClick={() => bulkM.mutate("archive")}
            >
              <Archive className="mr-1.5 h-3.5 w-3.5" />
              Archive
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg text-xs"
              disabled={bulkM.isPending}
              onClick={() => bulkM.mutate("duplicate")}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Duplicate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg text-xs"
              disabled={exportM.isPending}
              onClick={() => exportM.mutate("selected")}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Export
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg text-xs text-rose-500 hover:bg-rose-500/10 hover:text-rose-500"
              disabled={bulkM.isPending}
              onClick={() => {
                void (async () => {
                  if (
                    await confirmDialog({
                      title: `Delete ${selected.size} quizzes?`,
                      description: "This cannot be undone.",
                      variant: "destructive",
                      confirmLabel: "Delete",
                    })
                  )
                    bulkM.mutate("delete");
                })();
              }}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </section>
      )}

      {/* Table */}
      <section className="glass shadow-card-soft overflow-hidden rounded-2xl border border-border/60">
        <div className="overflow-x-auto">
          {list.isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No quizzes match the current filters.
            </div>
          ) : (
            <table className="w-full min-w-[720px] text-xs">
              <thead className="bg-background/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on page"
                      checked={allOnPageSelected}
                      onChange={togglePage}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-border/60 accent-violet-500"
                    />
                  </th>
                  {[
                    "Quiz Title",
                    "Level",
                    "Subject",
                    "Questions",
                    "Duration",
                    "Status",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3 font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-border/30 transition hover:bg-violet-500/5 ${selected.has(r.id) ? "bg-violet-500/5" : ""}`}
                  >
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.title}`}
                        checked={selected.has(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-border/60 accent-violet-500"
                      />
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-foreground">{r.title}</p>
                      {r.description && (
                        <p className="line-clamp-1 text-[10px] text-muted-foreground">
                          {r.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3.5 capitalize text-muted-foreground">{r.level}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      {subjectName(r.subject_id)}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-foreground">{r.total_questions}</td>
                    <td className="px-4 py-3.5 text-muted-foreground">
                      {Math.round(r.duration_seconds / 60)} min
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={r.status} starts_at={r.starts_at} />
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1">
                        <IconBtn title="Preview" onClick={() => setPreviewFor(r)}>
                          <Eye className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title="Edit" onClick={() => setEditing(r)}>
                          <Edit3 className="h-3.5 w-3.5" />
                        </IconBtn>
                        <IconBtn title="Manage MCQs" onClick={() => setBuilderFor(r)}>
                          <ListChecks className="h-3.5 w-3.5" />
                        </IconBtn>
                        <RowMenu
                          onDuplicate={() => dupM.mutate(r.id)}
                          onRegenerate={() => {
                            void (async () => {
                              if (
                                await confirmDialog({
                                  title: "Regenerate questions?",
                                  description:
                                    "Replace this quiz's questions with a fresh random pick from its chapter.",
                                  confirmLabel: "Regenerate",
                                  variant: "destructive",
                                })
                              )
                                regenM.mutate(r.id);
                            })();
                          }}
                          onToggle={() =>
                            statusM.mutate({
                              id: r.id,
                              status: r.status === "published" ? "draft" : "published",
                            })
                          }
                          onArchive={() =>
                            statusM.mutate({
                              id: r.id,
                              status: r.status === "archived" ? "draft" : "archived",
                            })
                          }
                          onDelete={() => {
                            void (async () => {
                              if (
                                await confirmDialog({
                                  title: "Delete this quiz?",
                                  variant: "destructive",
                                  confirmLabel: "Delete",
                                })
                              )
                                delM.mutate(r.id);
                            })();
                          }}
                          status={r.status}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total}{" "}
              entries
            </span>
            <div className="flex items-center gap-3">
              <PageSizeSelect
                value={pageSize}
                onChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>
          </div>
        )}
      </section>

      {/* Bottom analytics cards */}
      <section className="grid gap-3 md:grid-cols-3">
        <AnalyticsBarCard
          title="Real-time Tracking"
          subtitle="Track attempts, performance and analytics in real-time."
          data={stats.data?.attemptsByDay ?? []}
          live={{
            active: stats.data?.activeUsers ?? 0,
            inProgress: stats.data?.inProgress ?? 0,
            completed: stats.data?.completedAttempts ?? 0,
            avgScore: stats.data?.avgScore ?? 0,
            latest: stats.data?.latestSubmissions ?? [],
          }}
        />
        <AnalyticsDonutCard
          title="Performance Analytics"
          subtitle="Detailed reports and insights for every quiz."
          value={stats.data?.avgScore ?? 0}
          extra={{
            passRate: stats.data?.passRate ?? 0,
            failRate: stats.data?.failRate ?? 0,
            highest: stats.data?.highestScore ?? 0,
            lowest: stats.data?.lowestScore ?? 0,
            avgDurationSec: stats.data?.avgDurationSec ?? 0,
          }}
        />
        <AnalyticsLineCard
          title="Smart Recommendations"
          subtitle="AI suggests improvements and insights."
          data={stats.data?.attemptsTrend30 ?? []}
        />
      </section>

      {(creating || editing) && (
        <QuizEditorDialog
          quiz={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={invalidate}
          levels={(levels.data as Array<{ code: string; name: string }>) ?? []}
          subjects={(subjects.data as Array<{ id: string; name: string; level: string }>) ?? []}
        />
      )}

      {builderFor && (
        <QuestionPickerDialog
          quiz={builderFor}
          onClose={() => setBuilderFor(null)}
          onSaved={invalidate}
        />
      )}

      {previewFor && <QuizPreviewDialog quiz={previewFor} onClose={() => setPreviewFor(null)} />}

      {bulkOpen && (
        <BulkUploadMcqsDialog onClose={() => setBulkOpen(false)} onImported={invalidate} />
      )}

      {autoGenOpen && (
        <AutoGenerateDialog
          onClose={() => setAutoGenOpen(false)}
          onDone={invalidate}
          levels={(levels.data as Array<{ code: string; name: string }>) ?? []}
          subjects={(subjects.data as Array<{ id: string; name: string; level: string }>) ?? []}
        />
      )}

      {pickerOpen && (
        <PickFromBankDialog
          onClose={() => setPickerOpen(false)}
          onDone={(quiz) => {
            setPickerOpen(false);
            setBuilderFor(quiz);
            invalidate();
          }}
          levels={(levels.data as Array<{ code: string; name: string }>) ?? []}
          subjects={(subjects.data as Array<{ id: string; name: string; level: string }>) ?? []}
        />
      )}
    </div>
  );
}

// =========== KPI card ===========
type KpiProps = {
  l: string;
  v: number;
  d: number;
  i: React.ComponentType<{ className?: string }>;
  c: string;
  fmt?: "k" | "pct";
};
function KpiCard({ l, v, d, i: Icon, c, fmt, onClick }: KpiProps & { onClick?: () => void }) {
  const up = d >= 0;
  const fmtVal =
    fmt === "k" && v >= 1000
      ? `${(v / 1000).toFixed(1)}K`
      : fmt === "pct"
        ? `${v}%`
        : v.toLocaleString();
  return (
    <button
      type="button"
      onClick={onClick}
      className="group glass shadow-card-soft rounded-2xl border border-border/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ background: `${c}1f`, color: c }}
        >
          <Icon className="h-4 w-4" />
        </div>
        {d !== 0 && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${up ? "bg-emerald-500/15 text-emerald-500" : "bg-rose-500/15 text-rose-500"}`}
          >
            {up ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
            {up ? "+" : ""}
            {d}%
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-[26px] font-bold tracking-tight leading-none">
        {fmtVal}
      </p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{l}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground/70">vs last month</p>
    </button>
  );
}

// =========== Status badge ===========

function StatusBadge({ status, starts_at }: { status: string; starts_at: string | null }) {
  const isScheduled =
    status === "published" && starts_at && new Date(starts_at).getTime() > Date.now();
  const effective = isScheduled ? "scheduled" : status;
  const map: Record<string, string> = {
    published: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    draft: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    scheduled: "bg-sky-500/15 text-sky-500 border-sky-500/30",
    archived: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold capitalize ${map[effective] ?? "bg-muted"}`}
    >
      {effective}
    </span>
  );
}

// =========== Row dropdown menu (more) ===========
function RowMenu({
  onDuplicate,
  onRegenerate,
  onToggle,
  onArchive,
  onDelete,
  status,
}: {
  onDuplicate: () => void;
  onRegenerate: () => void;
  onToggle: () => void;
  onArchive: () => void;
  onDelete: () => void;
  status: string;
}) {
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="More actions"
          aria-label="More actions"
          className="rounded-lg border border-border/40 bg-background/40 p-1.5 hover:border-[var(--neon-purple)]/60 hover:text-[var(--neon-purple)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onDuplicate} className="gap-2 text-xs">
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRegenerate} className="gap-2 text-xs">
          <Shuffle className="h-3.5 w-3.5" /> Regenerate MCQs
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onToggle} className="gap-2 text-xs">
          {status === "published" ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          {status === "published" ? "Unpublish" : "Publish"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onArchive} className="gap-2 text-xs">
          <EyeOff className="h-3.5 w-3.5" />
          {status === "archived" ? "Unarchive" : "Archive"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={onDelete}
          className="gap-2 text-xs text-rose-500 focus:text-rose-500"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =========== Pagination ===========
function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  const nums = useMemo(() => {
    const out: (number | "…")[] = [];
    const push = (n: number | "…") => out.push(n);
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) push(i);
      return out;
    }
    push(1);
    if (page > 3) push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) push(i);
    if (page < totalPages - 2) push("…");
    push(totalPages);
    return out;
  }, [page, totalPages]);
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:border-violet-500/60 disabled:opacity-40"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e-${i}`} className="px-2 text-muted-foreground">
            …
          </span>
        ) : (
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2.5 text-xs font-semibold transition ${
              n === page
                ? "bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow"
                : "border border-border/60 text-foreground hover:border-violet-500/60"
            }`}
          >
            {n}
          </button>
        ),
      )}
      <button
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:border-violet-500/60 disabled:opacity-40"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// =========== Analytics cards ===========
function AnalyticsBarCard({
  title,
  subtitle,
  data,
  live,
}: {
  title: string;
  subtitle: string;
  data: Array<{ d: string; c: number }>;
  live?: {
    active: number;
    inProgress: number;
    completed: number;
    avgScore: number;
    latest: Array<{
      id: string;
      pct: number;
      completed_at: string;
      duration_seconds: number;
    }>;
  };
}) {
  const max = Math.max(1, ...data.map((d) => d.c));
  const fmtTime = (iso: string) => {
    const t = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - t);
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };
  return (
    <div className="glass relative overflow-hidden rounded-2xl border border-border/60 p-5 shadow-card-soft">
      <h3 className="font-display text-sm font-bold tracking-tight">{title}</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      {live && (
        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-sm font-bold">{live.active}</div>
            <div className="text-[10px] text-muted-foreground">Active 24h</div>
          </div>
          <div>
            <div className="text-sm font-bold">{live.inProgress}</div>
            <div className="text-[10px] text-muted-foreground">In progress</div>
          </div>
          <div>
            <div className="text-sm font-bold">{live.completed}</div>
            <div className="text-[10px] text-muted-foreground">Completed</div>
          </div>
          <div>
            <div className="text-sm font-bold">{live.avgScore}%</div>
            <div className="text-[10px] text-muted-foreground">Avg score</div>
          </div>
        </div>
      )}
      {data.length === 0 || max <= 1 ? (
        <div className="mt-4 flex h-24 items-center justify-center text-[11px] text-muted-foreground">
          No attempts in the last 7 days.
        </div>
      ) : (
        <div className="mt-4 flex h-24 items-end gap-2">
          {data.map((d, i) => (
            <div key={d.d} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-violet-500 to-indigo-400"
                style={{
                  height: `${Math.max(8, (d.c / max) * 88)}%`,
                  opacity: 0.5 + (i / data.length) * 0.5,
                }}
              />
            </div>
          ))}
        </div>
      )}
      {live && live.latest.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-muted-foreground">
          {live.latest.slice(0, 3).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <span className="truncate">Submission · {s.pct}%</span>
              <span className="shrink-0">{fmtTime(s.completed_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
function AnalyticsDonutCard({
  title,
  subtitle,
  value,
  extra,
}: {
  title: string;
  subtitle: string;
  value: number;
  extra?: {
    passRate: number;
    failRate: number;
    highest: number;
    lowest: number;
    avgDurationSec: number;
  };
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const r = 30;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  return (
    <div className="glass relative overflow-hidden rounded-2xl border border-border/60 p-5 shadow-card-soft">
      <h3 className="font-display text-sm font-bold tracking-tight">{title}</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      <div className="mt-3 flex items-center justify-end">
        <svg width="90" height="90" viewBox="0 0 80 80">
          <defs>
            <linearGradient id="dg" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          <circle
            cx="40"
            cy="40"
            r={r}
            stroke="currentColor"
            strokeOpacity="0.12"
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx="40"
            cy="40"
            r={r}
            stroke="url(#dg)"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={off}
            transform="rotate(-90 40 40)"
          />
          <text
            x="40"
            y="44"
            textAnchor="middle"
            fontSize="14"
            fontWeight="700"
            fill="currentColor"
          >
            {pct}%
          </text>
        </svg>
      </div>
      {extra && (
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <div className="flex justify-between"><span>Pass rate</span><span className="font-semibold text-foreground">{extra.passRate}%</span></div>
          <div className="flex justify-between"><span>Fail rate</span><span className="font-semibold text-foreground">{extra.failRate}%</span></div>
          <div className="flex justify-between"><span>Highest</span><span className="font-semibold text-foreground">{extra.highest}%</span></div>
          <div className="flex justify-between"><span>Lowest</span><span className="font-semibold text-foreground">{extra.lowest}%</span></div>
          <div className="col-span-2 flex justify-between"><span>Avg duration</span><span className="font-semibold text-foreground">{Math.floor(extra.avgDurationSec / 60)}m {extra.avgDurationSec % 60}s</span></div>
        </div>
      )}
    </div>
  );
}
function AnalyticsLineCard({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data: Array<{ d: string; c: number }>;
}) {
  const max = Math.max(1, ...data.map((d) => d.c));
  const w = 260;
  const h = 80;
  const pts = data
    .map((d, i) => `${(i / Math.max(1, data.length - 1)) * w},${h - (d.c / max) * (h - 8) - 4}`)
    .join(" ");
  return (
    <div className="glass relative overflow-hidden rounded-2xl border border-border/60 p-5 shadow-card-soft">
      <h3 className="font-display text-sm font-bold tracking-tight">{title}</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      {data.length === 0 ? (
        <div className="mt-4 flex h-20 items-center justify-center text-[11px] text-muted-foreground">
          No activity yet.
        </div>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-20 w-full">
          <defs>
            <linearGradient id="lg" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polyline
            points={pts}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#lg)" />
        </svg>
      )}
    </div>
  );
}

// =========== Quiz Generator Panel (matches reference) ===========
function QuickQuizGeneratorPanel({
  mode,
  levels,
  subjects,
  onAuto,
  onBank,
  onManual,
  onDone,
}: {
  mode: "auto" | "bank" | "manual";
  levels: Array<{ code: string; name: string }>;
  subjects: Array<{ id: string; name: string; level: string }>;
  onAuto: () => void;
  onBank: () => void;
  onManual: () => void;
  onDone: () => void;
}) {
  const autoGenFn = useServerFn(adminAutoGenerateQuizzes);
  const allChaptersFn = useServerFn(adminListAllChapters);
  const qc = useQueryClient();
  const [level, setLevel] = useState<string>(levels[0]?.code ?? "");
  const [time, setTime] = useState<string>("10");
  const [count, setCount] = useState<string>("10");
  const [subj, setSubj] = useState<string>("all");
  const [dist, setDist] = useState<"random" | "smart">("random");
  const [adv, setAdv] = useState(false);
  const [pickedChapterIds, setPickedChapterIds] = useState<Set<string>>(new Set());
  const [chapterSearch, setChapterSearch] = useState("");
  const [recentOnly, setRecentOnly] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  useEffect(() => {
    if (!level && levels[0]) setLevel(levels[0].code);
  }, [levels, level]);

  const filtered = useMemo(
    () => subjects.filter((s) => !level || s.level === level),
    [subjects, level],
  );

  // Always fetch fresh chapter list keyed by current level + subject, so newly
  // added/updated chapters appear without a manual refresh.
  const chaptersQ = useQuery({
    queryKey: ["admin-all-chapters", { level, subj }],
    queryFn: () =>
      allChaptersFn({
        data: { level: level || null, subjectId: subj !== "all" ? subj : null },
      }),
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Realtime: any chapter insert/update/delete invalidates the picker list.
  useEffect(() => {
    const ch = supabase
      .channel(`quiz-gen-chapters-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "chapters" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-all-chapters"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const allChapters = (chaptersQ.data ?? []) as Array<{
    id: string;
    name: string;
    subject_id: string;
    status: string;
    updated_at: string;
  }>;

  const subjectName = useMemo(() => {
    const m = new Map(subjects.map((s) => [s.id, s.name]));
    return (id: string) => m.get(id) ?? "—";
  }, [subjects]);

  const recentCutoff = useMemo(() => Date.now() - 7 * 24 * 3600 * 1000, []);
  const visibleChapters = useMemo(() => {
    const q = chapterSearch.trim().toLowerCase();
    return allChapters.filter((c) => {
      if (recentOnly && new Date(c.updated_at).getTime() < recentCutoff) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) || subjectName(c.subject_id).toLowerCase().includes(q)
      );
    });
  }, [allChapters, chapterSearch, recentOnly, recentCutoff, subjectName]);

  const allVisibleSelected =
    visibleChapters.length > 0 && visibleChapters.every((c) => pickedChapterIds.has(c.id));
  const someVisibleSelected =
    !allVisibleSelected && visibleChapters.some((c) => pickedChapterIds.has(c.id));

  // Drop selections that are no longer in the available chapter set (e.g. after
  // a chapter was deleted or filters changed scope) to prevent stale ids.
  useEffect(() => {
    if (pickedChapterIds.size === 0) return;
    const valid = new Set(allChapters.map((c) => c.id));
    let changed = false;
    const next = new Set<string>();
    pickedChapterIds.forEach((id) => {
      if (valid.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) setPickedChapterIds(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allChapters]);

  const toggleChapter = (id: string) => {
    setPickedChapterIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    setPickedChapterIds((prev) => {
      const next = new Set(prev);
      visibleChapters.forEach((c) => next.add(c.id));
      return next;
    });
  };
  const clearAll = () => setPickedChapterIds(new Set());

  const sourceLabel = (() => {
    if (pickedChapterIds.size === 0) return "All Chapters";
    if (pickedChapterIds.size === 1) {
      const ch = allChapters.find((c) => pickedChapterIds.has(c.id));
      return ch ? ch.name : "1 chapter";
    }
    return `${pickedChapterIds.size} chapters selected`;
  })();

  const run = useMutation({
    mutationFn: () => {
      const ids = Array.from(pickedChapterIds);
      // "All Chapters" = empty selection → fall back to subject/level scope.
      // Individual picks override scope, so there is no overlap/duplication.
      return autoGenFn({
        data: {
          level: ids.length === 0 && subj === "all" ? level : null,
          subjectId: ids.length === 0 && subj !== "all" ? subj : null,
          chapterId: null,
          chapterIds: ids.length > 0 ? ids : undefined,
          questionCount: Number(count) || 10,
          durationMinutes: Number(time) || 10,
          overwrite: true,
          publish: true,
          randomizeOptions: dist === "random",
        },
      });
    },
    onSuccess: (r: { created: number; updated: number; skipped: number }) => {
      toast.success(
        `Generated · ${r.created} created · ${r.updated} updated · ${r.skipped} skipped`,
      );
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (mode === "bank") {
    return (
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-500">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Pull questions from MCQ Bank</p>
            <p className="text-xs text-muted-foreground">
              Pick directly from your existing MCQ Manager and Practice question bank.
            </p>
          </div>
        </div>
        <Button
          className="h-10 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white"
          onClick={onBank}
        >
          <ListChecks className="mr-2 h-4 w-4" /> Open MCQ Bank Picker
        </Button>
      </div>
    );
  }
  if (mode === "manual") {
    return (
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
            <Hand className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Manually build a quiz</p>
            <p className="text-xs text-muted-foreground">
              Create a quiz, then hand-select MCQs with full ordering control.
            </p>
          </div>
        </div>
        <Button
          className="h-10 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white"
          onClick={onManual}
        >
          <Plus className="mr-2 h-4 w-4" /> Create Quiz Manually
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="Select Level">
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="h-10 rounded-xl border-border/60">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Time">
          <Select value={time} onValueChange={setTime}>
            <SelectTrigger className="h-10 rounded-xl border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 20, 30, 45, 60].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} Minutes
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Questions">
          <Select value={count} onValueChange={setCount}>
            <SelectTrigger className="h-10 rounded-xl border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 10, 15, 20, 30, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} MCQs
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Select Source">
          <Popover open={sourceOpen} onOpenChange={setSourceOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex h-10 w-full items-center justify-between rounded-xl border border-border/60 bg-background px-3 text-left text-sm hover:bg-accent/30"
              >
                <span className="truncate">
                  {chaptersQ.isLoading ? "Loading chapters…" : sourceLabel}
                </span>
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[320px] p-0">
              <div className="border-b border-border/50 p-2">
                <Input
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder="Search chapters…"
                  className="h-8"
                />
                <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <Checkbox
                      checked={recentOnly}
                      onCheckedChange={(v) => setRecentOnly(v === true)}
                    />
                    Recently updated (7d)
                  </label>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="font-medium text-violet-500 hover:underline disabled:opacity-50"
                    disabled={pickedChapterIds.size === 0}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-2 text-xs font-semibold">
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={
                      pickedChapterIds.size === 0
                        ? true
                        : allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                    }
                    onCheckedChange={(v) => {
                      if (v === true) {
                        // "All Chapters" = no explicit picks (scope by level/subject)
                        clearAll();
                      } else {
                        selectAllVisible();
                      }
                    }}
                  />
                  All Chapters
                </label>
                <span className="text-muted-foreground">
                  {pickedChapterIds.size}/{allChapters.length}
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {chaptersQ.isLoading ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    Loading…
                  </div>
                ) : visibleChapters.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No chapters found
                  </div>
                ) : (
                  visibleChapters.map((c) => {
                    const checked = pickedChapterIds.has(c.id);
                    const recent = Date.now() - new Date(c.updated_at).getTime() < 7 * 24 * 3600 * 1000;
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-accent/40"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleChapter(c.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{c.name}</span>
                            {recent && (
                              <Badge
                                variant="outline"
                                className="border-emerald-400/40 bg-emerald-400/10 px-1 py-0 text-[10px] text-emerald-500"
                              >
                                new
                              </Badge>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {subjectName(c.subject_id)}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </PopoverContent>
          </Popover>
        </Field>
        <Field label="Subjects">
          <Select value={subj} onValueChange={setSubj}>
            <SelectTrigger className="h-10 rounded-xl border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Subjects</SelectItem>
              {filtered.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="md:col-span-3">
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Question Distribution
          </Label>
          <div className="flex items-center gap-6 pt-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="dist"
                checked={dist === "random"}
                onChange={() => setDist("random")}
                className="h-4 w-4 accent-violet-500"
              />
              Random (AI)
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="dist"
                checked={dist === "smart"}
                onChange={() => setDist("smart")}
                className="h-4 w-4 accent-violet-500"
              />
              Smart (By Weightage)
            </label>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-3">
        <button
          type="button"
          onClick={() => setAdv((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={`h-3.5 w-3.5 transition ${adv ? "rotate-90" : ""}`} /> Advanced
          Options
        </button>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="h-10 rounded-xl border-border/60" onClick={onAuto}>
            <Calendar className="mr-2 h-4 w-4" /> Schedule
          </Button>
          <Button
            className="h-10 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-[0_10px_30px_-12px_rgba(139,92,246,0.7)]"
            disabled={run.isPending || !level}
            onClick={() => run.mutate()}
          >
            {run.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Generate Quiz
          </Button>
        </div>
      </div>
      {adv && (
        <div className="rounded-xl border border-border/50 bg-background/40 p-3 text-xs text-muted-foreground">
          For finer control (overwrite, publish, randomise options, per-chapter scope) use the
          <button onClick={onAuto} className="mx-1 font-semibold text-violet-500 underline">
            Auto-Generate dialog
          </button>
          .
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

// =========== Pick From MCQ Bank Dialog (creates draft quiz, opens picker) ===========
function PickFromBankDialog({
  onClose,
  onDone,
  levels,
  subjects,
}: {
  onClose: () => void;
  onDone: (q: Quiz) => void;
  levels: Array<{ code: string; name: string }>;
  subjects: Array<{ id: string; name: string; level: string }>;
}) {
  const createFn = useServerFn(adminCreateQuiz);
  const chaptersFn = useServerFn(adminListChapters);
  const [level, setLevel] = useState(levels[0]?.code ?? "");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [title, setTitle] = useState("New Bank Quiz");
  const [duration, setDuration] = useState(15);

  const filtered = useMemo(() => subjects.filter((s) => s.level === level), [subjects, level]);
  const chaptersQ = useQuery({
    queryKey: ["pick-bank-chapters", subjectId],
    queryFn: () => chaptersFn({ data: { subjectId } }),
    enabled: !!subjectId,
  });
  const chapters = (chaptersQ.data ?? []) as Array<{ id: string; name: string }>;

  const create = useMutation({
    mutationFn: async () => {
      const r = await createFn({
        data: {
          title,
          description: null,
          level,
          subject_id: subjectId || null,
          chapter_id: chapterId || null,
          kind: "quiz",
          status: "draft",
          difficulty: "medium",
          total_questions: 10,
          duration_seconds: duration * 60,
          is_public: true,
          randomize_questions: true,
          randomize_options: false,
          passing_marks: 0,
          negative_marking: 0,
        },
      });
      return { id: (r as { id: string }).id };
    },
    onSuccess: (r) => {
      const q: Quiz = {
        id: r.id,
        title,
        description: null,
        level,
        subject_id: subjectId || null,
        chapter_id: chapterId || null,
        kind: "quiz",
        status: "draft",
        difficulty: "medium",
        total_questions: 10,
        duration_seconds: duration * 60,
        starts_at: null,
        ends_at: null,
        is_public: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      toast.success("Draft quiz created — pick MCQs from bank");
      onDone(q);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pick Questions From MCQ Bank</DialogTitle>
          <DialogDescription>
            Scope the quiz, then choose MCQs from the existing MCQ bank.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Level">
              <Select
                value={level}
                onValueChange={(v) => {
                  setLevel(v);
                  setSubjectId("");
                  setChapterId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Subject">
              <Select
                value={subjectId}
                onValueChange={(v) => {
                  setSubjectId(v);
                  setChapterId("");
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick" />
                </SelectTrigger>
                <SelectContent>
                  {filtered.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Chapter">
              <Select value={chapterId} onValueChange={setChapterId} disabled={!subjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick" />
                </SelectTrigger>
                <SelectContent>
                  {chapters.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div>
            <Label>Duration (min)</Label>
            <Input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 0))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
          <Button
            className="bg-gradient-to-r from-violet-500 to-indigo-500 text-white"
            disabled={!title.trim() || !level || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ListChecks className="mr-1 h-4 w-4" />
            )}
            Continue to MCQ Picker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-lg border border-border/40 bg-background/40 p-1.5 hover:border-[var(--neon-purple)]/60 hover:text-[var(--neon-purple)]"
    >
      {children}
    </button>
  );
}

// ============================================================
// Editor dialog
// ============================================================
function QuizEditorDialog({
  quiz,
  onClose,
  onSaved,
  levels,
  subjects,
}: {
  quiz: Quiz | null;
  onClose: () => void;
  onSaved: () => void;
  levels: Array<{ code: string; name: string }>;
  subjects: Array<{ id: string; name: string; level: string }>;
}) {
  const createFn = useServerFn(adminCreateQuiz);
  const updateFn = useServerFn(adminUpdateQuiz);
  const chaptersFn = useServerFn(adminListChapters);
  const mcqListFn = useServerFn(adminListMcqs);
  const setQuestionsFn = useServerFn(adminSetQuizQuestions);

  const [form, setForm] = useState({
    title: quiz?.title ?? "",
    description: quiz?.description ?? "",
    level: quiz?.level ?? levels[0]?.code ?? "professional",
    subject_id: quiz?.subject_id ?? "",
    chapter_id: quiz?.chapter_id ?? "",
    difficulty: quiz?.difficulty ?? "medium",
    total_questions: quiz?.total_questions ?? 10,
    duration_minutes: Math.round((quiz?.duration_seconds ?? 600) / 60),
    passing_marks: 0,
    is_public: quiz?.is_public ?? true,
    randomize_questions: true,
    status: quiz?.status ?? "draft",
    auto_attach: !quiz, // default ON when creating
  });

  const filteredSubjects = useMemo(
    () => subjects.filter((s) => s.level === form.level),
    [subjects, form.level],
  );

  const chaptersQ = useQuery({
    queryKey: ["chapters-for", form.subject_id],
    queryFn: () => chaptersFn({ data: { subjectId: form.subject_id } }),
    enabled: !!form.subject_id,
  });

  // Live preview count of available MCQs in the selected chapter
  const poolPreview = useQuery({
    queryKey: ["editor-pool-count", form.chapter_id],
    queryFn: () =>
      mcqListFn({
        data: { chapterId: form.chapter_id, status: "published", page: 1, pageSize: 1 },
      }),
    enabled: !!form.chapter_id,
  });
  const availableCount = poolPreview.data?.count ?? 0;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        level: form.level,
        subject_id: form.subject_id || null,
        chapter_id: form.chapter_id || null,
        kind: "quiz" as const,
        status: form.status as Quiz["status"],
        difficulty: form.difficulty as Quiz["difficulty"],
        total_questions: form.total_questions,
        duration_seconds: form.duration_minutes * 60,
        is_public: form.is_public,
        randomize_questions: form.randomize_questions,
        randomize_options: false,
        passing_marks: form.passing_marks,
        negative_marking: 0,
      };
      let quizId = quiz?.id;
      if (quiz) {
        await updateFn({ data: { id: quiz.id, ...payload } });
      } else {
        const created = await createFn({ data: payload });
        quizId = (created as { id: string }).id;
      }
      // Auto-attach chapter MCQs on create
      if (!quiz && form.auto_attach && form.chapter_id && quizId) {
        const pool = await mcqListFn({
          data: { chapterId: form.chapter_id, status: "published", page: 1, pageSize: 200 },
        });
        const ids = (pool.rows as Array<{ id: string }>).map((m) => m.id);
        if (ids.length) {
          // shuffle for "random pick"
          for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
          }
          const picked = ids.slice(0, Math.min(form.total_questions, ids.length));
          await setQuestionsFn({ data: { quizId, mcqIds: picked } });
        }
      }
      return { quizId, attached: !quiz && form.auto_attach };
    },
    onSuccess: (r) => {
      toast.success(
        quiz
          ? "Quiz updated"
          : r.attached
            ? "Quiz created · MCQs auto-attached from chapter"
            : "Quiz created",
      );
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{quiz ? "Edit Quiz" : "Create Quiz"}</DialogTitle>
          <DialogDescription>Set scope, settings and publish status.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <Textarea
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div>
            <Label>Level</Label>
            <Select
              value={form.level}
              onValueChange={(v) => setForm({ ...form, level: v, subject_id: "", chapter_id: "" })}
            >
              <SelectTrigger>
                <SelectValue />
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
            <Label>Subject</Label>
            <Select
              value={form.subject_id}
              onValueChange={(v) => setForm({ ...form, subject_id: v, chapter_id: "" })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose subject" />
              </SelectTrigger>
              <SelectContent>
                {filteredSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Chapter</Label>
            <Select
              value={form.chapter_id}
              onValueChange={(v) => setForm({ ...form, chapter_id: v })}
              disabled={!form.subject_id}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose chapter" />
              </SelectTrigger>
              <SelectContent>
                {(chaptersQ.data ?? []).map((c: { id: string; name: string }) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Difficulty</Label>
            <Select
              value={form.difficulty}
              onValueChange={(v) => setForm({ ...form, difficulty: v as typeof form.difficulty })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              <Timer className="mr-1 inline h-3 w-3" />
              Total questions
            </Label>
            <Input
              type="number"
              value={form.total_questions}
              onChange={(e) =>
                setForm({ ...form, total_questions: Math.max(1, Number(e.target.value) || 0) })
              }
            />
          </div>
          <div>
            <Label>
              <Clock className="mr-1 inline h-3 w-3" />
              Duration (minutes)
            </Label>
            <Input
              type="number"
              value={form.duration_minutes}
              onChange={(e) =>
                setForm({ ...form, duration_minutes: Math.max(1, Number(e.target.value) || 0) })
              }
            />
          </div>
          <div>
            <Label>
              <Trophy className="mr-1 inline h-3 w-3" />
              Passing marks
            </Label>
            <Input
              type="number"
              value={form.passing_marks}
              onChange={(e) =>
                setForm({ ...form, passing_marks: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </div>
          <div>
            <Label>Status</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm({ ...form, status: v as Quiz["status"] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <Shuffle className="h-3.5 w-3.5" /> Randomize question order
            </div>
            <Switch
              checked={form.randomize_questions}
              onCheckedChange={(v) => setForm({ ...form, randomize_questions: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> Public to students
            </div>
            <Switch
              checked={form.is_public}
              onCheckedChange={(v) => setForm({ ...form, is_public: v })}
            />
          </div>
          {!quiz && (
            <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-[var(--neon-purple)]/30 bg-[var(--neon-purple)]/10 px-3 py-2">
              <div className="flex items-center gap-2 text-xs">
                <Wand2 className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
                <span>
                  Auto-attach MCQs from this chapter on create
                  {form.chapter_id && (
                    <span className="ml-2 text-muted-foreground">
                      · {availableCount} available · will pick{" "}
                      {Math.min(form.total_questions, availableCount)}
                    </span>
                  )}
                </span>
              </div>
              <Switch
                checked={form.auto_attach}
                onCheckedChange={(v) => setForm({ ...form, auto_attach: v })}
              />
            </div>
          )}
          {!quiz && form.chapter_id && availableCount === 0 && (
            <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs">
              <span>No MCQs available in this chapter yet.</span>
              <Link
                to="/admin/mcq"
                className="inline-flex items-center gap-1 font-semibold text-amber-300 hover:underline"
              >
                Go to MCQ Manager <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
          <Button
            className="bg-cta-gradient text-white"
            disabled={!form.title.trim() || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            {quiz ? "Save changes" : "Create quiz"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Question picker dialog
// ============================================================
type PoolRow = { id: string; question: string; difficulty: string; correct_option: string };

const PickerRow = ({
  m,
  selected,
  onToggle,
}: {
  m: PoolRow;
  selected: boolean;
  onToggle: (id: string) => void;
}) => (
  <label
    className={`flex cursor-pointer items-start gap-3 border-b border-border/40 p-3 text-xs ${selected ? "bg-[var(--neon-purple)]/10" : "hover:bg-background/40"}`}
  >
    <input
      type="checkbox"
      checked={selected}
      onChange={() => onToggle(m.id)}
      className="mt-1 h-4 w-4 accent-[var(--neon-purple)]"
    />
    <div className="flex-1">
      <p className="font-medium">{m.question}</p>
      <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5 capitalize">{m.difficulty}</span>
        <span>
          Answer: <b className="text-primary">{m.correct_option}</b>
        </span>
      </div>
    </div>
  </label>
);
const MemoPickerRow = memo(PickerRow);

function QuestionPickerDialog({
  quiz,
  onClose,
  onSaved,
}: {
  quiz: Quiz;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const getQ = useServerFn(adminGetQuizQuestions);
  const setQ = useServerFn(adminSetQuizQuestions);
  const mcqList = useServerFn(adminListMcqs);
  const levelsFn = useServerFn(adminListLevels);
  const subjectsFn = useServerFn(adminListSubjects);
  const chaptersFn = useServerFn(adminListChapters);

  // In-modal L→S→C selectors, seeded from the quiz so it "just works" for existing quizzes.
  const [level, setLevel] = useState<string>(quiz.level || "");
  const [subjectId, setSubjectId] = useState<string>(quiz.subject_id ?? "");
  const [chapterId, setChapterId] = useState<string>(quiz.chapter_id ?? "");

  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 250);
  const [difficulty, setDifficulty] = useState<string>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const [autoSave, setAutoSave] = useState(true);
  const lastSaved = useRef<string>("");

  // ---- Academic tree (admin view) ----
  const levelsQ = useQuery({
    queryKey: ["admin-levels"],
    queryFn: () => levelsFn(),
    staleTime: 60_000,
  });
  const subjectsQ = useQuery({
    queryKey: ["admin-subjects"],
    queryFn: () => subjectsFn(),
    staleTime: 60_000,
  });
  const chaptersQ = useQuery({
    queryKey: ["admin-chapters", subjectId],
    queryFn: () => chaptersFn({ data: { subjectId } }),
    enabled: !!subjectId,
    staleTime: 30_000,
  });

  const levels = (levelsQ.data ?? []) as Array<{ code: string; name: string }>;
  const subjects = useMemo(
    () =>
      ((subjectsQ.data ?? []) as Array<{ id: string; name: string; level: string }>).filter(
        (s) => !level || s.level === level,
      ),
    [subjectsQ.data, level],
  );
  const chapters = (chaptersQ.data ?? []) as Array<{ id: string; name: string }>;

  // ---- Initial selection from existing quiz ----
  const initial = useQuery({
    queryKey: ["quiz-questions", quiz.id],
    queryFn: () => getQ({ data: { quizId: quiz.id } }),
  });
  useEffect(() => {
    if (initial.data) {
      const ids = (initial.data as Array<{ mcq_id: string }>).map((q) => q.mcq_id);
      setSelected(ids);
      lastSaved.current = ids.join(",");
    }
  }, [initial.data]);

  // ---- Pool query: scoped to chapter (preferred) or subject ----
  const pool = useQuery({
    queryKey: ["quiz-mcq-pool", chapterId || null, subjectId || null, search, difficulty],
    queryFn: () =>
      mcqList({
        data: {
          chapterId: chapterId || undefined,
          subjectId: !chapterId && subjectId ? subjectId : undefined,
          search: search || undefined,
          difficulty: difficulty === "all" ? undefined : (difficulty as "easy" | "medium" | "hard"),
          status: "published",
          page: 1,
          pageSize: 300,
        },
      }),
    enabled: !!(chapterId || subjectId),
    staleTime: 10_000,
    placeholderData: (prev) => prev,
  });

  // ---- Realtime: refresh pool on any MCQ change ----
  useEffect(() => {
    const ch = supabase
      .channel(`quiz-picker-${quiz.id}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mcqs" }, () => {
        qc.invalidateQueries({ queryKey: ["quiz-mcq-pool"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, quiz.id]);

  // ---- Auto-save (debounced) when selection changes ----
  const save = useMutation({
    mutationFn: (ids: string[]) => setQ({ data: { quizId: quiz.id, mcqIds: ids } }),
    onSuccess: (_d, ids) => {
      lastSaved.current = ids.join(",");
      qc.invalidateQueries({ queryKey: ["admin-quizzes"] });
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  useEffect(() => {
    if (!autoSave) return;
    const key = selected.join(",");
    if (key === lastSaved.current) return;
    const t = window.setTimeout(() => save.mutate(selected), 600);
    return () => window.clearTimeout(t);
  }, [selected, autoSave]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useMemo(
    () => (id: string) =>
      setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
    [],
  );

  const move = (idx: number, dir: -1 | 1) => {
    setSelected((s) => {
      const j = idx + dir;
      if (j < 0 || j >= s.length) return s;
      const n = [...s];
      [n[idx], n[j]] = [n[j], n[idx]];
      return n;
    });
  };

  const rows = useMemo(() => (pool.data?.rows ?? []) as PoolRow[], [pool.data]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const shuffle = (arr: string[]) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const autoPick = (count: number, random: boolean) => {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) {
      toast.error("No MCQs available in this chapter");
      return;
    }
    const source = random ? shuffle(ids) : ids;
    setSelected(source.slice(0, Math.min(count, source.length)));
    toast.success(`Picked ${Math.min(count, source.length)} MCQs`);
  };

  const pickDifficultyMix = () => {
    const buckets: Record<string, string[]> = { easy: [], medium: [], hard: [] };
    rows.forEach((r) => {
      (buckets[r.difficulty] ?? buckets.medium).push(r.id);
    });
    const target = quiz.total_questions || 10;
    const per = Math.ceil(target / 3);
    const mix = [
      ...shuffle(buckets.easy).slice(0, per),
      ...shuffle(buckets.medium).slice(0, per),
      ...shuffle(buckets.hard).slice(0, per),
    ].slice(0, target);
    if (mix.length === 0) {
      toast.error("No MCQs available in this chapter");
      return;
    }
    setSelected(mix);
    toast.success(`Picked ${mix.length} MCQs across difficulties`);
  };

  const noScope = !chapterId && !subjectId;
  const isEmptyPool =
    !pool.isLoading && !noScope && rows.length === 0 && !search && difficulty === "all";

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Manage Questions · {quiz.title}</DialogTitle>
          <DialogDescription>
            Pulls MCQs directly from the MCQ Practice database. Selected: <b>{selected.length}</b>
            {autoSave && <span className="ml-2 text-emerald-400">· Auto-saving</span>}
          </DialogDescription>
        </DialogHeader>

        {/* Level → Subject → Chapter selectors */}
        <div className="grid gap-2 rounded-xl border border-border/60 bg-background/40 p-3 sm:grid-cols-3">
          <Select
            value={level}
            onValueChange={(v) => {
              setLevel(v);
              setSubjectId("");
              setChapterId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              {levels.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={subjectId}
            onValueChange={(v) => {
              setSubjectId(v);
              setChapterId("");
            }}
            disabled={!level}
          >
            <SelectTrigger>
              <SelectValue placeholder={level ? "Subject" : "Pick a level first"} />
            </SelectTrigger>
            <SelectContent>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={chapterId} onValueChange={setChapterId} disabled={!subjectId}>
            <SelectTrigger>
              <SelectValue placeholder={subjectId ? "Chapter" : "Pick a subject first"} />
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

        {/* Auto-pick toolbar */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--neon-purple)]/30 bg-[var(--neon-purple)]/5 p-2">
          <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-[var(--neon-purple)]">
            <Wand2 className="h-3.5 w-3.5" /> Smart pick
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => autoPick(10, false)}
          >
            Pick 10
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => autoPick(quiz.total_questions || 10, true)}
          >
            <Shuffle className="mr-1 h-3 w-3" /> Random {quiz.total_questions || 10}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={rows.length === 0}
            onClick={pickDifficultyMix}
          >
            Difficulty mix
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={rows.length === 0}
            onClick={() => setSelected(rows.map((r) => r.id))}
          >
            <CheckSquare className="mr-1 h-3 w-3" /> Select all ({rows.length})
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={selected.length === 0}
            onClick={() => setSelected([])}
          >
            Clear
          </Button>
          <label className="ml-auto flex items-center gap-2 px-2 text-xs">
            <Switch checked={autoSave} onCheckedChange={setAutoSave} /> Auto-save
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Pool */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search chapter MCQs…"
                  className="pl-9"
                />
              </div>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All levels</SelectItem>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div
              className="max-h-[55vh] overflow-auto rounded-xl border border-border/60"
              style={{ contentVisibility: "auto" } as React.CSSProperties}
            >
              {noScope ? (
                <div className="flex h-40 items-center justify-center p-4 text-center text-xs text-muted-foreground">
                  Pick a Level, Subject and Chapter to load MCQs.
                </div>
              ) : pool.isLoading && rows.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : isEmptyPool ? (
                <div className="flex h-40 flex-col items-center justify-center gap-3 p-4 text-center text-xs text-muted-foreground">
                  <p>No MCQs available in this chapter.</p>
                  <Link
                    to="/admin/mcq"
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--neon-purple)] hover:border-[var(--neon-purple)]"
                  >
                    Go to MCQ Manager <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              ) : rows.length === 0 ? (
                <div className="flex h-32 items-center justify-center p-4 text-center text-xs text-muted-foreground">
                  No MCQs match these filters.
                </div>
              ) : (
                rows.map((m) => (
                  <MemoPickerRow
                    key={m.id}
                    m={m}
                    selected={selectedSet.has(m.id)}
                    onToggle={toggle}
                  />
                ))
              )}
            </div>
          </div>

          {/* Selected with reorder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Selected order ({selected.length})
              </p>
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="text-[10px] text-rose-400 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
            <div
              className="max-h-[55vh] overflow-auto rounded-xl border border-border/60"
              style={{ contentVisibility: "auto" } as React.CSSProperties}
            >
              {selected.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                  No questions selected yet.
                </div>
              ) : (
                selected.map((id, i) => {
                  const m = byId.get(id);
                  return (
                    <div
                      key={id}
                      className="flex items-start gap-2 border-b border-border/40 p-2 text-xs"
                    >
                      <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[10px]">
                        {i + 1}
                      </span>
                      <p className="flex-1 line-clamp-2">
                        {m?.question ?? (
                          <span className="text-muted-foreground italic">
                            Not in current filter
                          </span>
                        )}
                      </p>
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          title="Move up"
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                          className="rounded border border-border/50 p-0.5 disabled:opacity-30 hover:border-[var(--neon-purple)]/60"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          title="Move down"
                          disabled={i === selected.length - 1}
                          onClick={() => move(i, 1)}
                          className="rounded border border-border/50 p-0.5 disabled:opacity-30 hover:border-[var(--neon-purple)]/60"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                      <button
                        type="button"
                        title="Remove"
                        onClick={() => toggle(id)}
                        className="rounded border border-border/50 p-0.5 text-rose-400 hover:border-rose-400/60"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <div className="mr-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            {save.isPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" /> Saving…
              </>
            ) : selected.join(",") === lastSaved.current ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-400" /> All changes saved
              </>
            ) : (
              <>Unsaved changes</>
            )}
          </div>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Close
          </Button>
          <Button
            className="bg-cta-gradient text-white"
            disabled={save.isPending || selected.join(",") === lastSaved.current}
            onClick={() => save.mutate(selected)}
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Save now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Preview dialog
// ============================================================
function QuizPreviewDialog({ quiz, onClose }: { quiz: Quiz; onClose: () => void }) {
  const getQ = useServerFn(adminGetQuizQuestions);
  const mcqList = useServerFn(adminListMcqs);

  const qq = useQuery({
    queryKey: ["preview-quiz-questions", quiz.id],
    queryFn: () => getQ({ data: { quizId: quiz.id } }),
  });

  const ids = (qq.data ?? []).map((r: { mcq_id: string }) => r.mcq_id);

  const pool = useQuery({
    queryKey: ["preview-quiz-mcqs", quiz.chapter_id, quiz.subject_id],
    queryFn: () =>
      mcqList({
        data: {
          chapterId: quiz.chapter_id ?? undefined,
          subjectId: !quiz.chapter_id ? (quiz.subject_id ?? undefined) : undefined,
          page: 1,
          pageSize: 200,
        },
      }),
    enabled: ids.length > 0,
  });

  const byId = new Map(
    (
      (pool.data?.rows ?? []) as Array<{
        id: string;
        question: string;
        option_a: string;
        option_b: string;
        option_c: string;
        option_d: string;
        correct_option: string;
        difficulty: string;
      }>
    ).map((m) => [m.id, m]),
  );
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as Array<{
    id: string;
    question: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: string;
    difficulty: string;
  }>;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Preview · {quiz.title}</DialogTitle>
          <DialogDescription>
            {quiz.total_questions} questions · {Math.round(quiz.duration_seconds / 60)} min ·{" "}
            <span className="capitalize">{quiz.difficulty}</span> ·{" "}
            <span className="capitalize">{quiz.status}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
          {qq.isLoading || (ids.length > 0 && pool.isLoading) ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : ordered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
              <p>
                No questions assigned yet. Use <b>Manage MCQs</b> to auto-pick from the chapter
                pool.
              </p>
              <Link
                to="/admin/mcq"
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--neon-purple)]"
              >
                Open MCQ Manager <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            ordered.map((m, i) => (
              <div key={m.id} className="glass rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold">
                    <span className="text-muted-foreground">Q{i + 1}.</span> {m.question}
                  </p>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize">
                    {m.difficulty}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(["A", "B", "C", "D"] as const).map((k) => {
                    const text = (m as unknown as Record<string, string>)[
                      `option_${k.toLowerCase()}`
                    ];
                    const ok = m.correct_option === k;
                    return (
                      <div
                        key={k}
                        className={`flex items-start gap-2 rounded-lg border p-2 text-xs ${ok ? "border-emerald-400/40 bg-emerald-400/10" : "border-border/50"}`}
                      >
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${ok ? "bg-emerald-400/30 text-emerald-300" : "bg-muted"}`}
                        >
                          {k}
                        </span>
                        <span>{text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Auto-Generate dialog
// ============================================================
function AutoGenerateDialog({
  onClose,
  onDone,
  levels,
  subjects,
}: {
  onClose: () => void;
  onDone: () => void;
  levels: Array<{ code: string; name: string }>;
  subjects: Array<{ id: string; name: string; level: string }>;
}) {
  const autoGenFn = useServerFn(adminAutoGenerateQuizzes);
  const chaptersFn = useServerFn(adminListChapters);

  const [level, setLevel] = useState<string>(levels[0]?.code ?? "professional");
  const [subjectId, setSubjectId] = useState<string>("");
  const [chapterId, setChapterId] = useState<string>("");
  const [questionCount, setQuestionCount] = useState(10);
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [overwrite, setOverwrite] = useState(true);
  const [publish, setPublish] = useState(true);
  const [randomizeOptions, setRandomizeOptions] = useState(true);

  const filteredSubjects = useMemo(
    () => subjects.filter((s) => s.level === level),
    [subjects, level],
  );

  const chaptersQ = useQuery({
    queryKey: ["auto-gen-chapters", subjectId],
    queryFn: () => chaptersFn({ data: { subjectId } }),
    enabled: !!subjectId,
  });
  const chapters = (chaptersQ.data ?? []) as Array<{ id: string; name: string }>;

  const run = useMutation({
    mutationFn: () =>
      autoGenFn({
        data: {
          level: !subjectId && !chapterId ? level : null,
          subjectId: subjectId && !chapterId ? subjectId : null,
          chapterId: chapterId || null,
          questionCount,
          durationMinutes,
          overwrite,
          publish,
          randomizeOptions,
        },
      }),
    onSuccess: (r: { created: number; updated: number; skipped: number }) => {
      toast.success(
        `Auto-generation done · ${r.created} created · ${r.updated} updated · ${r.skipped} skipped`,
      );
      onDone();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Auto-Generate Quizzes</DialogTitle>
          <DialogDescription>
            Generate one quiz per chapter from existing published MCQs. Pick scope and defaults.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label>Level</Label>
            <Select
              value={level}
              onValueChange={(v) => {
                setLevel(v);
                setSubjectId("");
                setChapterId("");
              }}
            >
              <SelectTrigger>
                <SelectValue />
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
            <Label>Subject (optional)</Label>
            <Select
              value={subjectId || "__all"}
              onValueChange={(v) => {
                setSubjectId(v === "__all" ? "" : v);
                setChapterId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All subjects in level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All subjects in level</SelectItem>
                {filteredSubjects.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Chapter (optional)</Label>
            <Select
              value={chapterId || "__all"}
              onValueChange={(v) => setChapterId(v === "__all" ? "" : v)}
              disabled={!subjectId}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={subjectId ? "All chapters in subject" : "Pick a subject first"}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">All chapters in subject</SelectItem>
                {chapters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>
              <Timer className="mr-1 inline h-3 w-3" />
              Questions per quiz
            </Label>
            <Input
              type="number"
              min={1}
              max={200}
              value={questionCount}
              onChange={(e) => setQuestionCount(Math.max(1, Number(e.target.value) || 0))}
            />
          </div>
          <div>
            <Label>
              <Clock className="mr-1 inline h-3 w-3" />
              Duration (minutes)
            </Label>
            <Input
              type="number"
              min={1}
              max={360}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value) || 0))}
            />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <Shuffle className="h-3.5 w-3.5" /> Shuffle answer options
            </div>
            <Switch checked={randomizeOptions} onCheckedChange={setRandomizeOptions} />
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <Send className="h-3.5 w-3.5" /> Publish immediately
            </div>
            <Switch checked={publish} onCheckedChange={setPublish} />
          </div>
          <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2">
            <div className="flex items-center gap-2 text-xs">
              <Wand2 className="h-3.5 w-3.5 text-amber-300" />
              Overwrite existing <code className="rounded bg-background/40 px-1">[Auto]</code>{" "}
              quizzes for these chapters
            </div>
            <Switch checked={overwrite} onCheckedChange={setOverwrite} />
          </div>
          <div className="md:col-span-2 rounded-xl border border-border/40 bg-background/30 px-3 py-2 text-[11px] text-muted-foreground">
            Tip: chapters with no published MCQs are skipped. Existing auto-quizzes are detected by
            title prefix <code>[Auto]</code>.
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
          <Button
            className="bg-cta-gradient text-white"
            disabled={run.isPending}
            onClick={() => run.mutate()}
          >
            {run.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-1 h-4 w-4" />
            )}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
