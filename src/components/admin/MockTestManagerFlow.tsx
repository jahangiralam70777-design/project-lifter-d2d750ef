import { type MouseEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Send,
  Copy,
  BarChart3,
  Loader2,
  CalendarClock,
  Trophy,
  Users,
  Timer,
  Target,
  CheckCircle2,
  PlayCircle,
  Rocket,
  Save,
  Layers,
  BookOpen,
  Sparkles,
  ChevronRight,
  X,
  CircleDot,
  Download,
  ArrowUpDown,
  RefreshCw,
  Upload,
  FileText,
  Filter,
  TrendingUp,
  TrendingDown,
  Brain,
  Activity,
  Wand2,
  Zap,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useLevels } from "@/hooks/use-levels";
import {
  adminListSubjectsByLevel,
  adminListChaptersBySubject,
  adminListMcqsForBuilder,
  adminListMocks,
  adminMockStats,
  adminCreateMock,
  adminUpdateMock,
  adminDeleteMock,
  adminSetMockStatus,
  adminDuplicateMock,
  adminGetMockQuestions,
  adminAutoGenerateMock,
  adminMockDetail,
} from "@/lib/admin-mock.functions";
import { BulkUploadMockDialog } from "@/components/admin/BulkUploadMockDialog";
import { lazy, Suspense } from "react";
import type { MockCardKey } from "./MockCardDrawer";
import { PageSizeSelect } from "@/components/ui/page-size-select";
const MockCardDrawer = lazy(() =>
  import("./MockCardDrawer").then((m) => ({ default: m.MockCardDrawer })),
);

type Level = string;
type Status = "draft" | "published" | "archived";
type MockType = "all" | "full" | "chapter" | "level";
type DateFilter = "all" | "scheduled" | "unscheduled" | "upcoming" | "expired";
type SortBy = "updated_at" | "title" | "starts_at" | "total_questions";
type SortDir = "asc" | "desc";

type Mock = {
  id: string;
  title: string;
  description: string | null;
  level: Level;
  status: Status;
  total_questions: number;
  duration_seconds: number;
  difficulty: "easy" | "medium" | "hard";
  starts_at: string | null;
  ends_at: string | null;
  is_public: boolean;
  randomize_questions: boolean;
  randomize_options: boolean;
  negative_marking: number;
  passing_marks: number;
  subject_id: string | null;
  chapter_id: string | null;
  updated_at: string;
};

function statusTone(s: string) {
  switch (s) {
    case "published":
      return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "draft":
      return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "archived":
      return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
    default:
      return "bg-muted text-foreground";
  }
}

function stopRowAction(e: MouseEvent<HTMLElement>) {
  e.preventDefault();
  e.stopPropagation();
}

function downloadCsv(filename: string, rows: Mock[]) {
  const header = ["Title", "Level", "Status", "Questions", "Duration", "Starts", "Ends"];
  const body = rows.map((r) => [
    r.title,
    r.level,
    r.status,
    String(r.total_questions),
    String(Math.round(r.duration_seconds / 60)),
    r.starts_at ?? "",
    r.ends_at ?? "",
  ]);
  const csv = [header, ...body]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MockTestManagerFlow() {
  const qc = useQueryClient();
  const listMocksFn = useServerFn(adminListMocks);
  const deleteMockFn = useServerFn(adminDeleteMock);
  const setStatusFn = useServerFn(adminSetMockStatus);
  const duplicateFn = useServerFn(adminDuplicateMock);
  const listSubjectsByFilterLevel = useServerFn(adminListSubjectsByLevel);
  const { data: liveLevels = [] } = useLevels();
  const levelOptions = useMemo(
    () => liveLevels.map((l) => ({ value: l.code as Level, label: l.name })),
    [liveLevels],
  );

  const [openCard, setOpenCard] = useState<MockCardKey | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [filterStatus, setFilterStatus] = useState<"" | Status>("");
  const [filterLevel, setFilterLevel] = useState<"" | Level>("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterMockType, setFilterMockType] = useState<MockType>("all");
  const [filterDate, setFilterDate] = useState<DateFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const subjectsFilterQ = useQuery({
    queryKey: ["mock-filter-subjects", filterLevel || "all"],
    queryFn: () => listSubjectsByFilterLevel({ data: { level: filterLevel || undefined } }),
  });

  const mocksQ = useQuery({
    queryKey: [
      "admin-mocks",
      {
        deferredSearch,
        filterStatus,
        filterLevel,
        filterSubject,
        filterMockType,
        filterDate,
        sortBy,
        sortDir,
        page,
        pageSize,
      },
    ],
    queryFn: () =>
      listMocksFn({
        data: {
          search: deferredSearch || undefined,
          status: (filterStatus || undefined) as Status | undefined,
          level: (filterLevel || undefined) as Level | undefined,
          subjectId: filterSubject || undefined,
          mockType: filterMockType,
          date: filterDate,
          sortBy,
          sortDir,
          page,
          pageSize,
        },
      }),
    placeholderData: (previous) => previous,
  });

  const rows = (mocksQ.data?.rows ?? []) as Mock[];
  const total = mocksQ.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Full-dataset KPI stats (not limited to current page).
  const statsQ = useQuery({
    queryKey: ["admin-mock-stats"],
    queryFn: () => adminMockStats(),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin-mocks"] });
    qc.invalidateQueries({ queryKey: ["admin-mock-stats"] });
  }

  useEffect(() => {
    const channel = supabase
      .channel(`admin-mock-tests-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quizzes" }, (payload) => {
        const record = (payload.new || payload.old) as { kind?: string } | null;
        if (!record || record.kind === "mock") invalidate();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_questions" }, () =>
        invalidate(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  useEffect(() => {
    setFilterSubject("");
  }, [filterLevel]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMockFn({ data: { id } }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["admin-mocks"] });
      qc.setQueriesData<{ rows: Mock[]; count: number }>({ queryKey: ["admin-mocks"] }, (old) =>
        old
          ? { ...old, rows: old.rows.filter((r) => r.id !== id), count: Math.max(0, old.count - 1) }
          : old,
      );
    },
    onSuccess: () => {
      toast.success("Mock test deleted");
      setDeleting(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (vars: { id: string; status: Status }) => setStatusFn({ data: vars }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["admin-mocks"] });
      qc.setQueriesData<{ rows: Mock[]; count: number }>({ queryKey: ["admin-mocks"] }, (old) =>
        old
          ? { ...old, rows: old.rows.map((r) => (r.id === v.id ? { ...r, status: v.status } : r)) }
          : old,
      );
    },
    onSuccess: (_d, v) => {
      toast.success(`Mock ${v.status}`);
      setPublishing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dupMut = useMutation({
    mutationFn: (id: string) => duplicateFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Mock duplicated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const autoGenFn = useServerFn(adminAutoGenerateMock);
  const autoGenMut = useMutation({
    mutationFn: (vars: {
      subjectId: string;
      chapterId: string;
      level: string;
      questionCount?: number;
      durationMinutes?: number;
      difficulty?: "easy" | "medium" | "hard" | "mixed";
      status?: "draft" | "published";
    }) => autoGenFn({ data: vars }),
    onSuccess: (res) => {
      toast.success(
        `Mock generated: ${res.questionCount} questions${
          res.usedFallback ? " (some added from related chapters)" : ""
        }`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Auto-generation failed"),
  });

  const [editing, setEditing] = useState<Mock | null>(null);
  const [creating, setCreating] = useState(false);
  const [builderPreset, setBuilderPreset] = useState<
    "blank" | "generate" | "full" | "chapter" | "level"
  >("blank");
  const [viewing, setViewing] = useState<Mock | null>(null);
  const [analyticsFor, setAnalyticsFor] = useState<Mock | null>(null);
  const [deleting, setDeleting] = useState<Mock | null>(null);
  const [publishing, setPublishing] = useState<{ mock: Mock; status: Status } | null>(null);
  const [scheduling, setScheduling] = useState<Mock | null>(null);

  function openBuilder(preset: "blank" | "generate" | "full" | "chapter" | "level") {
    setBuilderPreset(preset);
    setEditing(null);
    setCreating(true);
  }

  // KPIs use full-dataset counts from the server (not just the current page).
  const stats = useMemo(() => {
    const s = statsQ.data;
    return {
      total: s?.total ?? total,
      published: s?.published ?? 0,
      drafts: s?.drafts ?? 0,
      scheduled: s?.scheduled ?? 0,
      archived: s?.archived ?? 0,
      live: s?.live ?? 0,
      totalQuestions: s?.totalQuestions ?? 0,
      avgQuestions: s?.avgQuestions ?? 0,
    };
  }, [statsQ.data, total]);

  // Quick generator form state (wires into existing builder)
  const [qgScope, setQgScope] = useState<"chapter" | "subject" | "level">("chapter");
  const [qgLevel, setQgLevel] = useState<Level>("professional");
  const [qgSubjectId, setQgSubjectId] = useState<string>("");
  const [qgChapterId, setQgChapterId] = useState<string>("");
  const [qgDuration, setQgDuration] = useState(10);
  const [qgQuestions, setQgQuestions] = useState(10);
  const [qgDifficulty, setQgDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("mixed");
  const [qgStatus, setQgStatus] = useState<"draft" | "published">("draft");
  const [qgSource, setQgSource] = useState<"random" | "smart" | "manual">("random");
  const [qgTab, setQgTab] = useState<"auto" | "bank" | "manual" | "import">("auto");
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  // Subjects/chapters for Auto Generate selectors.
  const subjectsFn = useServerFn(adminListSubjectsByLevel);
  const chaptersFn = useServerFn(adminListChaptersBySubject);
  const qgSubjectsQ = useQuery({
    queryKey: ["qg-subjects", qgLevel],
    queryFn: () => subjectsFn({ data: { level: qgLevel } }),
  });
  const qgChaptersQ = useQuery({
    queryKey: ["qg-chapters", qgSubjectId],
    queryFn: () => chaptersFn({ data: { subjectId: qgSubjectId } }),
    enabled: !!qgSubjectId,
  });
  // Reset chapter when subject/level changes.
  useEffect(() => {
    setQgChapterId("");
  }, [qgSubjectId, qgLevel]);
  useEffect(() => {
    setQgSubjectId("");
  }, [qgLevel]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Header */}
      <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 bottom-0 h-56 w-56 rounded-full bg-[var(--neon-blue)]/25 blur-3xl" />
        <div className="relative grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Mock Center</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">Mock Test Manager</span>
            </div>
            <h1 className="font-display text-2xl font-bold leading-tight tracking-tight sm:text-3xl md:text-[42px]">
              Mock Test <br className="hidden md:block" />
              <span className="text-gradient">Management Center</span>
            </h1>

            <p className="max-w-xl text-sm text-muted-foreground">
              Create, manage, track and analyze mock tests with powerful automation.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:w-[440px]">
            <Button
              onClick={() => openBuilder("blank")}
              className="bg-cta-gradient col-span-1 h-10 rounded-xl text-white shadow-glow hover:opacity-95 sm:col-span-2"
            >
              <Plus className="h-4 w-4" /> Create Mock Test
            </Button>
            <Button
              variant="outline"
              onClick={() => openBuilder("generate")}
              className="h-10 rounded-xl border-white/10 bg-background/40"
            >
              <Sparkles className="h-4 w-4" /> Generate from MCQs
            </Button>
            <Button
              variant="outline"
              onClick={() => openBuilder("chapter")}
              className="h-10 rounded-xl border-white/10 bg-background/40"
            >
              <Layers className="h-4 w-4" /> Chapter Wise Mock
            </Button>
            <Button
              variant="outline"
              onClick={() => openBuilder("level")}
              className="h-10 rounded-xl border-white/10 bg-background/40"
            >
              <Trophy className="h-4 w-4" /> Level Wise Mock
            </Button>
            <Button
              variant="outline"
              onClick={() => openBuilder("full")}
              className="h-10 rounded-xl border-white/10 bg-background/40"
            >
              <BookOpen className="h-4 w-4" /> Full Subject Mock
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                downloadCsv("mock-tests.csv", rows);
                toast.success("Export ready");
              }}
              className="col-span-1 h-10 rounded-xl border-white/10 bg-background/40 sm:col-span-2"
            >
              <Download className="h-4 w-4" /> Export Mock
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stats — premium 6-card grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            {
              k: "total",
              l: "Total Mocks",
              v: stats.total,
              i: Trophy,
              c: "var(--neon-purple)",
              d: "+12.5%",
              up: true,
            },
            {
              k: "published",
              l: "Published",
              v: stats.published,
              i: CheckCircle2,
              c: "#10b981",
              d: "+18.6%",
              up: true,
            },
            {
              k: "drafts",
              l: "Drafts",
              v: stats.drafts,
              i: FileText,
              c: "#f43f5e",
              d: "-4.3%",
              up: false,
            },
            {
              k: "scheduled",
              l: "Scheduled",
              v: stats.scheduled,
              i: CalendarClock,
              c: "var(--neon-blue)",
              d: "+6.2%",
              up: true,
            },
            {
              k: "live",
              l: "Live Now",
              v: stats.live,
              i: Radio,
              c: "#22c55e",
              d: "Active",
              up: true,
            },
            {
              k: "archived",
              l: "Archived",
              v: stats.archived,
              i: Save,
              c: "#94a3b8",
              d: "Stable",
              up: true,
            },
          ] as const
        ).map((s) => (
          <button
            key={s.l}
            type="button"
            onClick={() => setOpenCard(s.k)}
            className="glass relative overflow-hidden rounded-2xl p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-purple)]"
          >
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10"
              style={{ background: `color-mix(in oklab, ${s.c} 18%, transparent)` }}
            >
              <s.i className="h-4.5 w-4.5" style={{ color: s.c }} />
            </div>
            <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {s.l}
            </p>
            <p className="font-display text-2xl font-bold tracking-tight">{s.v}</p>
            <div
              className={`mt-1 inline-flex items-center gap-1 text-[10px] font-semibold ${s.up ? "text-emerald-400" : "text-rose-400"}`}
            >
              {s.up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {s.d}
            </div>
          </button>
        ))}
      </div>

      {/* Quick Create & Generator */}
      <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
        <div className="pointer-events-none absolute right-6 top-6 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-sm font-bold text-white shadow-glow">
          <Brain className="h-7 w-7" />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--neon-purple)]/15 text-[var(--neon-purple)]">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-lg font-bold">Quick Create &amp; Generator</h3>
            <p className="text-xs text-muted-foreground">
              Create mock tests in seconds using AI or select from MCQ Bank.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 border-b border-white/10">
          {[
            { id: "auto", l: "Auto Generate (AI)", i: Wand2 },
            { id: "bank", l: "From MCQ Bank", i: BookOpen },
            { id: "manual", l: "Manual Create", i: Edit3 },
            { id: "import", l: "Import Mock", i: Upload, badge: "NEW" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setQgTab(t.id as typeof qgTab)}
              className={`relative flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-xs font-semibold transition ${
                qgTab === t.id
                  ? "border-b-2 border-[var(--neon-purple)] text-[var(--neon-purple)]"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.i className="h-3.5 w-3.5" /> {t.l}
              {t.badge && (
                <Badge className="ml-1 h-4 border-0 bg-amber-500/20 px-1.5 py-0 text-[9px] text-amber-400">
                  {t.badge}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {qgTab === "auto" && (
          <div className="mt-4 space-y-4">
            <p className="text-[11px] text-muted-foreground">
              Questions are pulled from the existing{" "}
              <span className="text-foreground">MCQ Practice Question Bank</span>. Required:{" "}
              <span className="text-foreground">Subject</span>,{" "}
              <span className="text-foreground">Chapter</span>,{" "}
              <span className="text-foreground">Level</span>. Other fields are optional.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Level <span className="text-red-400">*</span>
                </Label>
                <Select value={qgLevel} onValueChange={(v) => setQgLevel(v as Level)}>
                  <SelectTrigger className="h-9 rounded-xl border-white/10 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {levelOptions.map((l) => (
                      <SelectItem key={l.value} value={l.value}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Subject <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={qgSubjectId}
                  onValueChange={(v) => setQgSubjectId(v)}
                  disabled={qgSubjectsQ.isLoading}
                >
                  <SelectTrigger className="h-9 rounded-xl border-white/10 bg-background/60">
                    <SelectValue
                      placeholder={qgSubjectsQ.isLoading ? "Loading…" : "Select subject"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(qgSubjectsQ.data ?? []).map((s: { id: string; name: string }) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">
                  Chapter <span className="text-red-400">*</span>
                </Label>
                <Select
                  value={qgChapterId}
                  onValueChange={(v) => setQgChapterId(v)}
                  disabled={!qgSubjectId || qgChaptersQ.isLoading}
                >
                  <SelectTrigger className="h-9 rounded-xl border-white/10 bg-background/60">
                    <SelectValue
                      placeholder={
                        !qgSubjectId
                          ? "Select subject first"
                          : qgChaptersQ.isLoading
                            ? "Loading…"
                            : "Select chapter"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(qgChaptersQ.data ?? []).map((c: { id: string; name: string }) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-5">
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">Duration</Label>
                <Select value={String(qgDuration)} onValueChange={(v) => setQgDuration(Number(v))}>
                  <SelectTrigger className="h-9 rounded-xl border-white/10 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[10, 20, 30, 45, 60, 90, 120, 180].map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} Minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">Questions</Label>
                <Select
                  value={String(qgQuestions)}
                  onValueChange={(v) => setQgQuestions(Number(v))}
                >
                  <SelectTrigger className="h-9 rounded-xl border-white/10 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[5, 10, 20, 30, 50, 75, 100].map((q) => (
                      <SelectItem key={q} value={String(q)}>
                        {q} MCQs
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">Difficulty</Label>
                <Select
                  value={qgDifficulty}
                  onValueChange={(v) => setQgDifficulty(v as typeof qgDifficulty)}
                >
                  <SelectTrigger className="h-9 rounded-xl border-white/10 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Mixed (30/40/30)</SelectItem>
                    <SelectItem value="easy">Easy only</SelectItem>
                    <SelectItem value="medium">Medium only</SelectItem>
                    <SelectItem value="hard">Hard only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">Scope</Label>
                <Select value={qgScope} onValueChange={(v) => setQgScope(v as typeof qgScope)}>
                  <SelectTrigger className="h-9 rounded-xl border-white/10 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chapter">Selected Chapter</SelectItem>
                    <SelectItem value="subject">Full Subject</SelectItem>
                    <SelectItem value="level">Level Wide</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-[11px] text-muted-foreground">Source</Label>
                <Select value={qgSource} onValueChange={(v) => setQgSource(v as typeof qgSource)}>
                  <SelectTrigger className="h-9 rounded-xl border-white/10 bg-background/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="random">MCQ Practice Bank</SelectItem>
                    <SelectItem value="smart">Smart (By Weightage)</SelectItem>
                    <SelectItem value="manual">Manual Select</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <Label className="mb-1.5 block text-[11px] text-muted-foreground">
                  Difficulty Preview
                </Label>
                <div className="flex flex-wrap gap-2">
                  {(qgDifficulty === "mixed"
                    ? [
                        { l: "Easy", v: "30%", c: "#10b981" },
                        { l: "Medium", v: "40%", c: "#f59e0b" },
                        { l: "Hard", v: "30%", c: "#ef4444" },
                      ]
                    : [
                        {
                          l: qgDifficulty.charAt(0).toUpperCase() + qgDifficulty.slice(1),
                          v: "100%",
                          c:
                            qgDifficulty === "easy"
                              ? "#10b981"
                              : qgDifficulty === "medium"
                                ? "#f59e0b"
                                : "#ef4444",
                        },
                      ]
                  ).map((d) => (
                    <div
                      key={d.l}
                      className="flex items-center gap-2 rounded-lg border border-white/10 bg-background/40 px-3 py-1.5 text-xs"
                      style={{ borderColor: `color-mix(in oklab, ${d.c} 35%, transparent)` }}
                    >
                      <span className="font-semibold" style={{ color: d.c }}>
                        {d.l}
                      </span>
                      <span className="text-muted-foreground">{d.v}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-background/40 px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <button
                      type="button"
                      onClick={() => setQgStatus(qgStatus === "draft" ? "published" : "draft")}
                      className="font-semibold capitalize text-foreground"
                    >
                      {qgStatus}
                    </button>
                  </div>
                </div>
              </div>
              <Button
                onClick={() =>
                  autoGenMut.mutate({
                    subjectId: qgSubjectId,
                    chapterId: qgChapterId,
                    level: qgLevel,
                    questionCount: qgQuestions,
                    durationMinutes: qgDuration,
                    difficulty: qgDifficulty,
                    status: qgStatus,
                  })
                }
                disabled={autoGenMut.isPending || !qgSubjectId || !qgChapterId || !qgLevel}
                className="bg-cta-gradient h-10 rounded-xl px-5 text-white shadow-glow"
              >
                {autoGenMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {autoGenMut.isPending ? "Generating…" : "Generate Mock Test"}
              </Button>
            </div>
          </div>
        )}

        {qgTab === "bank" && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 bg-background/30 p-6">
            <div>
              <p className="font-semibold">Pick questions from your MCQ Bank</p>
              <p className="text-xs text-muted-foreground">
                Use the full builder to select questions by chapter, topic, level and difficulty.
              </p>
            </div>
            <Button
              onClick={() => openBuilder("generate")}
              className="bg-cta-gradient rounded-xl text-white shadow-glow"
            >
              <BookOpen className="h-4 w-4" /> Open Builder
            </Button>
          </div>
        )}

        {qgTab === "manual" && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 bg-background/30 p-6">
            <div>
              <p className="font-semibold">Build a mock manually, step by step</p>
              <p className="text-xs text-muted-foreground">
                Define scope, attach questions, configure marks &amp; schedule.
              </p>
            </div>
            <Button
              onClick={() => openBuilder("blank")}
              className="bg-cta-gradient rounded-xl text-white shadow-glow"
            >
              <Edit3 className="h-4 w-4" /> Start Manual
            </Button>
          </div>
        )}

        {qgTab === "import" && (
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-dashed border-white/10 bg-background/30 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">Bulk Upload Mock Test</p>
                  <p className="text-xs text-muted-foreground">
                    Upload a .txt / .md / .pdf / .docx file or paste raw text. We auto-parse MCQ
                    blocks, detect duplicates, let you preview &amp; edit, then create the mock
                    test in one click — same workflow as MCQ Practice Bulk Upload.
                  </p>
                </div>
                <Button
                  onClick={() => setShowBulkUpload(true)}
                  className="bg-cta-gradient rounded-xl text-white shadow-glow"
                >
                  <Upload className="h-4 w-4" /> Open Bulk Upload
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/30 p-4">
              <div>
                <p className="text-sm font-semibold">Or duplicate an existing mock</p>
                <p className="text-xs text-muted-foreground">
                  Copy the most recent mock from your library and edit it as a starting point.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  const first = rows[0];
                  if (!first) return toast.error("No mock tests to import from yet.");
                  dupMut.mutate(first.id);
                }}
                className="rounded-xl"
              >
                <Copy className="h-4 w-4" /> Duplicate Most Recent
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10">
        <div className="flex flex-wrap gap-1">
          {[
            { id: "", l: "All Mocks" },
            { id: "published", l: "Published" },
            { id: "draft", l: "Drafts" },
            { id: "scheduled", l: "Scheduled" },
            { id: "live", l: "Live" },
            { id: "archived", l: "Archived" },
          ].map((t) => {
            const active =
              (t.id === "" && filterStatus === "" && filterDate === "all") ||
              (t.id === "scheduled" && filterDate === "scheduled") ||
              (t.id === "live" && filterDate === "upcoming") ||
              (t.id !== "" && t.id !== "scheduled" && t.id !== "live" && filterStatus === t.id);
            return (
              <button
                key={t.l}
                onClick={() => {
                  if (t.id === "scheduled") {
                    setFilterStatus("");
                    setFilterDate("scheduled");
                  } else if (t.id === "live") {
                    setFilterStatus("published");
                    setFilterDate("upcoming");
                  } else {
                    setFilterStatus(t.id as "" | Status);
                    setFilterDate("all");
                  }
                  setPage(1);
                }}
                className={`relative rounded-t-lg px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? "border-b-2 border-[var(--neon-purple)] text-[var(--neon-purple)]"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.l}
              </button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.info("Select rows in the table to perform bulk actions")}
          className="h-8 rounded-xl border-white/10"
        >
          <Filter className="h-3.5 w-3.5" /> Bulk Actions
        </Button>
      </div>

      {/* Filters */}
      <div className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search mock by title…"
            className="h-9 rounded-xl border-white/10 bg-background/60 pl-9"
          />
        </div>
        <Select
          value={filterLevel || "all"}
          onValueChange={(v) => {
            setFilterLevel(v === "all" ? "" : (v as Level));
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[160px] rounded-xl border-white/10 bg-background/60">
            <SelectValue placeholder="All levels" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All levels</SelectItem>
            {levelOptions.map((l) => (
              <SelectItem key={l.value} value={l.value}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterSubject || "all"}
          onValueChange={(v) => {
            setFilterSubject(v === "all" ? "" : v);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[180px] rounded-xl border-white/10 bg-background/60">
            <SelectValue placeholder="All subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {(subjectsFilterQ.data ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterMockType}
          onValueChange={(v) => {
            setFilterMockType(v as MockType);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[160px] rounded-xl border-white/10 bg-background/60">
            <SelectValue placeholder="Mock type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="full">Full subject</SelectItem>
            <SelectItem value="chapter">Chapter wise</SelectItem>
            <SelectItem value="level">Level wide</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filterStatus || "all"}
          onValueChange={(v) => {
            setFilterStatus(v === "all" ? "" : (v as Status));
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[150px] rounded-xl border-white/10 bg-background/60">
            <SelectValue placeholder="All status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filterDate}
          onValueChange={(v) => {
            setFilterDate(v as DateFilter);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[150px] rounded-xl border-white/10 bg-background/60">
            <SelectValue placeholder="Date" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All dates</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="unscheduled">Unscheduled</SelectItem>
            <SelectItem value="upcoming">Upcoming</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={`${sortBy}:${sortDir}`}
          onValueChange={(v) => {
            const [by, dir] = v.split(":") as [SortBy, SortDir];
            setSortBy(by);
            setSortDir(dir);
            setPage(1);
          }}
        >
          <SelectTrigger className="h-9 w-[170px] rounded-xl border-white/10 bg-background/60">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated_at:desc">Newest updated</SelectItem>
            <SelectItem value="title:asc">Title A–Z</SelectItem>
            <SelectItem value="starts_at:asc">Schedule soonest</SelectItem>
            <SelectItem value="total_questions:desc">Most questions</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="rounded-xl border-white/10"
          onClick={() => {
            invalidate();
            toast.success("Refreshed");
          }}
        >
          {mocksQ.isFetching ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}{" "}
          Refresh
        </Button>
      </div>

      {/* Table */}
      <div className="glass shadow-card-soft overflow-hidden rounded-3xl">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div>
            <h3 className="font-display text-lg font-bold">All Mock Tests</h3>
            <p className="text-xs text-muted-foreground">
              Showing {rows.length} of {total} — live sync enabled
            </p>
          </div>
          <Badge variant="outline" className="border-white/10 bg-background/40">
            <CircleDot className="mr-1 h-2.5 w-2.5 animate-pulse text-emerald-400" /> Live
          </Badge>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[860px]">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="pl-4">
                  <button
                    onClick={() => {
                      setSortBy("title");
                      setSortDir(sortBy === "title" && sortDir === "asc" ? "desc" : "asc");
                    }}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Title <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>Level</TableHead>
                <TableHead>
                  <button
                    onClick={() => {
                      setSortBy("total_questions");
                      setSortDir(
                        sortBy === "total_questions" && sortDir === "desc" ? "asc" : "desc",
                      );
                    }}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    MCQs <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button
                    onClick={() => {
                      setSortBy("starts_at");
                      setSortDir(sortBy === "starts_at" && sortDir === "asc" ? "desc" : "asc");
                    }}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    Schedule <ArrowUpDown className="h-3 w-3" />
                  </button>
                </TableHead>
                <TableHead className="text-right pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mocksQ.isLoading && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              )}
              {!mocksQ.isLoading && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No mock tests yet. Click <strong>Create Mock Test</strong> to start.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((m) => (
                <TableRow
                  key={m.id}
                  onClick={() => setViewing(m)}
                  className="cursor-pointer border-white/5 hover:bg-white/[0.03]"
                >
                  <TableCell className="pl-4 font-medium">
                    <div>{m.title}</div>
                    {m.description && (
                      <div className="text-[11px] text-muted-foreground truncate max-w-[28ch]">
                        {m.description}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-white/10 text-[10px] capitalize">
                      {m.level}
                    </Badge>
                  </TableCell>
                  <TableCell>{m.total_questions}</TableCell>
                  <TableCell>{Math.round(m.duration_seconds / 60)}m</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`${statusTone(m.status)} border text-[10px] capitalize`}
                    >
                      {m.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {m.starts_at ? new Date(m.starts_at).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        title="View"
                        onClick={(e) => {
                          stopRowAction(e);
                          setViewing(m);
                        }}
                        className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Edit"
                        onClick={(e) => {
                          stopRowAction(e);
                          setEditing(m);
                        }}
                        className="rounded-lg p-1.5 text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Duplicate"
                        onClick={(e) => {
                          stopRowAction(e);
                          dupMut.mutate(m.id);
                        }}
                        disabled={dupMut.isPending}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground disabled:opacity-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      {m.status !== "published" ? (
                        <button
                          title="Publish"
                          onClick={(e) => {
                            stopRowAction(e);
                            setPublishing({ mock: m, status: "published" });
                          }}
                          className="rounded-lg p-1.5 text-emerald-400 hover:bg-emerald-500/10"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          title="Unpublish (archive)"
                          onClick={(e) => {
                            stopRowAction(e);
                            setPublishing({ mock: m, status: "archived" });
                          }}
                          className="rounded-lg p-1.5 text-amber-400 hover:bg-amber-500/10"
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        title="Schedule"
                        onClick={(e) => {
                          stopRowAction(e);
                          setScheduling(m);
                        }}
                        className="rounded-lg p-1.5 text-sky-400 hover:bg-sky-500/10"
                      >
                        <CalendarClock className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Analytics"
                        onClick={(e) => {
                          stopRowAction(e);
                          setAnalyticsFor(m);
                        }}
                        className="rounded-lg p-1.5 text-indigo-300 hover:bg-indigo-500/10"
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Export"
                        onClick={(e) => {
                          stopRowAction(e);
                          downloadCsv(`${m.title || "mock"}.csv`, [m]);
                          toast.success("Mock exported");
                        }}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button
                        title="Delete"
                        onClick={(e) => {
                          stopRowAction(e);
                          setDeleting(m);
                        }}
                        className="rounded-lg p-1.5 text-red-400 hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3 text-xs text-muted-foreground">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-3">
            <PageSizeSelect
              value={pageSize}
              onChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            />
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-7 rounded-lg border-white/10"
              >
                Prev
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-7 rounded-lg border-white/10"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </div>

      {(creating || editing) && (
        <MockBuilderDialog
          open
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          existing={editing}
          preset={builderPreset}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            invalidate();
          }}
        />
      )}

      <MockDetailsDialog
        mock={viewing}
        onClose={() => setViewing(null)}
        onEdit={(mock: Mock) => {
          setViewing(null);
          setEditing(mock);
        }}
      />
      <MockAnalyticsDialog mock={analyticsFor} onClose={() => setAnalyticsFor(null)} />
      <ScheduleDialog
        mock={scheduling}
        onClose={() => setScheduling(null)}
        onSaved={() => {
          setScheduling(null);
          invalidate();
        }}
      />

      <AlertDialog open={!!publishing} onOpenChange={(open) => !open && setPublishing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {publishing?.status === "published" ? "Publish mock test?" : "Hide mock test?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {publishing?.mock.title} will be{" "}
              {publishing?.status === "published"
                ? "visible to students immediately"
                : "archived and hidden from students"}
              .
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusMut.isPending}
              onClick={() =>
                publishing &&
                statusMut.mutate({ id: publishing.mock.id, status: publishing.status })
              }
            >
              {statusMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}{" "}
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete mock test?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {deleting?.title} and its selected question links.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMut.isPending}
              onClick={() => deleting && deleteMut.mutate(deleting.id)}
            >
              {deleteMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}{" "}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bottom analytics row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => setOpenCard("attempts")}
          className="glass rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-purple)]"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">Attempts Overview</p>
            <BarChart3 className="h-4 w-4 text-[var(--neon-purple)]" />
          </div>
          <p className="font-display mt-1 text-2xl font-bold">
            {stats.totalQuestions.toLocaleString()}
          </p>
          <p className="text-[10px] text-emerald-400">+22.1% total mock questions</p>
          <svg viewBox="0 0 120 28" className="mt-2 h-7 w-full">
            <polyline
              fill="none"
              stroke="url(#g1)"
              strokeWidth="2"
              points="0,20 15,16 30,18 45,10 60,14 75,8 90,12 105,6 120,9"
            />
            <defs>
              <linearGradient id="g1" x1="0" x2="1">
                <stop offset="0" stopColor="#8b5cf6" />
                <stop offset="1" stopColor="#3b82f6" />
              </linearGradient>
            </defs>
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setOpenCard("completion")}
          className="glass rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-purple)]"
        >
          <p className="text-xs font-semibold text-muted-foreground">Completion Rate</p>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="font-display text-2xl font-bold">
                {stats.total
                  ? Math.round((stats.published / Math.max(1, stats.total)) * 100 * 10) / 10
                  : 0}
                %
              </p>
              <p className="text-[10px] text-emerald-400 inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> vs last month
              </p>
            </div>
            <div className="relative h-14 w-14">
              <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeDasharray={`${(stats.published / Math.max(1, stats.total)) * 94} 94`}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setOpenCard("avgQuestions")}
          className="glass rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-purple)]"
        >
          <p className="text-xs font-semibold text-muted-foreground">Avg. Questions</p>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="font-display text-2xl font-bold">{stats.avgQuestions}</p>
              <p className="text-[10px] text-emerald-400 inline-flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> per mock
              </p>
            </div>
            <div className="relative h-14 w-14">
              <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90">
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="hsl(var(--muted))"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15"
                  fill="none"
                  stroke="var(--neon-blue)"
                  strokeWidth="3"
                  strokeDasharray="62 94"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setOpenCard("topStatus")}
          className="glass rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-purple)] lg:col-span-1"
        >
          <p className="text-xs font-semibold text-muted-foreground">Top Status</p>
          <p className="font-display mt-1 text-xl font-bold capitalize">
            {stats.published >= stats.drafts ? "Published" : "Draft"}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-cta-gradient"
              style={{
                width: `${stats.total ? Math.round((Math.max(stats.published, stats.drafts) / stats.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {stats.total
              ? Math.round((Math.max(stats.published, stats.drafts) / stats.total) * 100)
              : 0}
            % of library
          </p>
        </button>
        <button
          type="button"
          onClick={() => setOpenCard("liveMocks")}
          className="glass rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--neon-purple)]"
        >
          <p className="text-xs font-semibold text-muted-foreground">Live Mocks</p>
          <p className="font-display mt-1 text-3xl font-bold text-emerald-400">{stats.live}</p>
          <p className="text-[10px] inline-flex items-center gap-1 text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            Active now
          </p>
          <svg viewBox="0 0 120 28" className="mt-2 h-7 w-full">
            <polyline
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              points="0,20 12,18 24,12 36,16 48,8 60,14 72,6 84,10 96,4 108,8 120,2"
            />
          </svg>
        </button>
      </div>

      {openCard && (
        <Suspense fallback={null}>
          <MockCardDrawer cardKey={openCard} open={!!openCard} onClose={() => setOpenCard(null)} />
        </Suspense>
      )}

      {showBulkUpload && (
        <BulkUploadMockDialog
          onClose={() => setShowBulkUpload(false)}
          onImported={() => {
            qc.invalidateQueries({ queryKey: ["admin-mocks"] });
            qc.invalidateQueries({ queryKey: ["admin-mock-stats"] });
          }}
        />
      )}
    </div>
  );
}

function MockDetailsDialog({
  mock,
  onClose,
  onEdit,
}: {
  mock: Mock | null;
  onClose: () => void;
  onEdit: (mock: Mock) => void;
}) {
  return (
    <Dialog open={!!mock} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mock?.title}</DialogTitle>
          <DialogDescription>
            {mock?.description || "Mock test overview and quick actions."}
          </DialogDescription>
        </DialogHeader>
        {mock && (
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-background/30 p-3">
              <span className="text-xs text-muted-foreground">Level</span>
              <p className="font-semibold capitalize">{mock.level}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/30 p-3">
              <span className="text-xs text-muted-foreground">Status</span>
              <p className="font-semibold capitalize">{mock.status}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/30 p-3">
              <span className="text-xs text-muted-foreground">Questions</span>
              <p className="font-semibold">{mock.total_questions}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/30 p-3">
              <span className="text-xs text-muted-foreground">Duration</span>
              <p className="font-semibold">{Math.round(mock.duration_seconds / 60)} min</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-background/30 p-3 md:col-span-2">
              <span className="text-xs text-muted-foreground">Schedule</span>
              <p className="font-semibold">
                {mock.starts_at ? new Date(mock.starts_at).toLocaleString() : "Not scheduled"}
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          {mock && (
            <Button onClick={() => onEdit(mock)} className="bg-cta-gradient text-white">
              <Edit3 className="h-4 w-4" /> Edit
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MockAnalyticsDialog({ mock, onClose }: { mock: Mock | null; onClose: () => void }) {
  const fn = useServerFn(adminMockDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["mock-analytics-dialog", mock?.id],
    queryFn: () => fn({ data: { quizId: mock!.id, rangeDays: 30 } }),
    enabled: !!mock,
  });
  return (
    <Dialog open={!!mock} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Mock Analytics</DialogTitle>
          <DialogDescription>{mock?.title}</DialogDescription>
        </DialogHeader>
        {!mock || isLoading || !data ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              {[
                { label: "Attempts", value: data.stats.totalAttempts, icon: Users },
                { label: "Completed", value: data.stats.completed, icon: CheckCircle2 },
                { label: "Avg score", value: `${data.stats.avgScore}%`, icon: Target },
                {
                  label: "Avg time",
                  value: `${Math.round(data.stats.avgDurationSeconds / 60)}m`,
                  icon: Timer,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-xl border border-white/10 bg-background/30 p-4"
                >
                  <item.icon className="mb-3 h-4 w-4 text-[var(--neon-blue)]" />
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="font-display text-2xl font-bold">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-white/10 bg-background/30 p-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Attempts & avg score — last 30 days
              </p>
              <MiniLine data={data.daily} />
            </div>
            <div className="rounded-xl border border-white/10 bg-background/30 p-4">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span>Completion rate</span>
                <span>{data.stats.completionRate}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-cta-gradient"
                  style={{ width: `${data.stats.completionRate}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MiniLine({ data }: { data: Array<{ day: string; count: number; avgScore: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <svg viewBox="0 0 300 80" className="h-20 w-full">
      <polyline
        fill="none"
        stroke="#8b5cf6"
        strokeWidth="2"
        points={data
          .map((d, i) => `${(i / Math.max(1, data.length - 1)) * 300},${80 - (d.count / max) * 70}`)
          .join(" ")}
      />
      <polyline
        fill="none"
        stroke="#f59e0b"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        points={data
          .map(
            (d, i) => `${(i / Math.max(1, data.length - 1)) * 300},${80 - (d.avgScore / 100) * 70}`,
          )
          .join(" ")}
      />
    </svg>
  );
}

function ScheduleDialog({
  mock,
  onClose,
  onSaved,
}: {
  mock: Mock | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const updateFn = useServerFn(adminUpdateMock);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  useEffect(() => {
    setStartsAt(mock?.starts_at?.slice(0, 16) ?? "");
    setEndsAt(mock?.ends_at?.slice(0, 16) ?? "");
  }, [mock]);
  const save = useMutation({
    mutationFn: () => {
      if (!mock) throw new Error("No mock selected");
      return updateFn({
        data: {
          id: mock.id,
          starts_at: startsAt ? new Date(startsAt).toISOString() : null,
          ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Schedule updated");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={!!mock} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule Mock</DialogTitle>
          <DialogDescription>{mock?.title}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div>
            <Label className="mb-1 block text-xs">Starts at</Label>
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Ends at</Label>
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarClock className="h-4 w-4" />
            )}{" "}
            Save schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================
 * Mock Builder Dialog — Level → Subject → Chapter → MCQs → Settings
 * ============================================================ */

function MockBuilderDialog({
  open,
  onClose,
  existing,
  preset,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  existing: Mock | null;
  preset: "blank" | "generate" | "full" | "chapter" | "level";
  onSaved: () => void;
}) {
  const listSubjects = useServerFn(adminListSubjectsByLevel);
  const listChapters = useServerFn(adminListChaptersBySubject);
  const listMcqs = useServerFn(adminListMcqsForBuilder);
  const createFn = useServerFn(adminCreateMock);
  const updateFn = useServerFn(adminUpdateMock);
  const getQuestions = useServerFn(adminGetMockQuestions);
  const { data: liveLevels = [] } = useLevels();
  const levelOptions = useMemo(
    () => liveLevels.map((l) => ({ value: l.code as Level, label: l.name })),
    [liveLevels],
  );

  const [step, setStep] = useState(preset === "blank" ? 1 : preset === "generate" ? 2 : 1);
  const [level, setLevel] = useState<Level>(existing?.level || "professional");
  const [subjectId, setSubjectId] = useState<string | null>(existing?.subject_id ?? null);
  const [chapterIds, setChapterIds] = useState<string[]>(
    existing?.chapter_id ? [existing.chapter_id] : [],
  );
  const [selectedMcqIds, setSelectedMcqIds] = useState<string[]>([]);
  const [mcqSearch, setMcqSearch] = useState("");
  const [difficulty, setDifficulty] = useState<"" | "easy" | "medium" | "hard">("");
  const [chapterFilter, setChapterFilter] = useState<string>("all");
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);


  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [durationMin, setDurationMin] = useState(
    existing ? Math.round(existing.duration_seconds / 60) : 60,
  );
  const [passingMarks, setPassingMarks] = useState(existing?.passing_marks ?? 40);
  const [negativeMarking, setNegativeMarking] = useState(existing?.negative_marking ?? 0);
  const [startsAt, setStartsAt] = useState(existing?.starts_at?.slice(0, 16) ?? "");
  const [endsAt, setEndsAt] = useState(existing?.ends_at?.slice(0, 16) ?? "");
  const [isPublic, setIsPublic] = useState(existing?.is_public ?? true);
  const [randomizeQ, setRandomizeQ] = useState(existing?.randomize_questions ?? true);
  const [randomizeO, setRandomizeO] = useState(existing?.randomize_options ?? false);

  // Cascade queries
  const subjectsQ = useQuery({
    queryKey: ["builder-subjects", level],
    queryFn: () => listSubjects({ data: { level } }),
  });

  const chaptersQ = useQuery({
    queryKey: ["builder-chapters", subjectId],
    queryFn: () => listChapters({ data: { subjectId: subjectId! } }),
    enabled: !!subjectId,
  });

  // Scope is initialized from preset but user can change it inside the builder.
  const [scope, setScope] = useState<"chapter" | "subject" | "level">(
    preset === "full" ? "subject" : preset === "level" ? "level" : "chapter",
  );

  const mcqsQ = useQuery({
    queryKey: ["builder-mcqs", scope, level, subjectId, chapterIds, mcqSearch, difficulty],
    queryFn: () =>
      listMcqs({
        data: {
          chapterIds: scope === "chapter" ? chapterIds : undefined,
          subjectId: scope === "subject" ? (subjectId ?? undefined) : undefined,
          level: scope === "level" ? level : undefined,
          search: mcqSearch || undefined,
          difficulty: (difficulty || undefined) as "easy" | "medium" | "hard" | undefined,
        },
      }),
    enabled:
      (scope === "chapter" && chapterIds.length > 0) ||
      (scope === "subject" && !!subjectId) ||
      (scope === "level" && !!level),
  });

  // Load existing mock's MCQ ids
  useEffect(() => {
    if (existing) {
      getQuestions({ data: { id: existing.id } }).then((ids) => setSelectedMcqIds(ids));
    }
  }, [existing, getQuestions]);

  // Reset on level change
  useEffect(() => {
    if (!existing) {
      setSubjectId(null);
      setChapterIds([]);
      setSelectedMcqIds([]);
    }
  }, [level, existing]);

  const subjects = subjectsQ.data ?? [];
  const chapters = chaptersQ.data ?? [];
  const mcqs = mcqsQ.data ?? [];

  function toggleChapter(id: string) {
    setChapterIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function toggleMcq(id: string) {
    setSelectedMcqIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function clearMcqs() {
    setSelectedMcqIds([]);
  }
  function goNext() {
    if (step === 1) {
      if (scope === "chapter" && (!subjectId || chapterIds.length === 0))
        return toast.error("Select a subject and at least one chapter");
      if (scope === "subject" && !subjectId) return toast.error("Select a subject");
      // level scope: just needs level (always set)
    }
    if (step === 2 && selectedMcqIds.length === 0) return toast.error("Select at least one MCQ");
    if (step === 3 && !title.trim()) return toast.error("Enter a mock test title");
    setStep((s) => Math.min(4, s + 1));
  }

  const saveMut = useMutation({
    mutationFn: async (status: Status) => {
      if (!title.trim()) throw new Error("Title is required");
      if (selectedMcqIds.length === 0) throw new Error("Select at least one MCQ");
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        level,
        subject_id: scope === "level" ? null : subjectId,
        chapter_id: scope === "chapter" ? (chapterIds[0] ?? null) : null,

        duration_seconds: Math.max(60, durationMin * 60),
        total_questions: selectedMcqIds.length,
        difficulty: "medium" as const,
        status,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        is_public: isPublic,
        randomize_questions: randomizeQ,
        randomize_options: randomizeO,
        negative_marking: negativeMarking,
        passing_marks: passingMarks,
        mcq_ids: selectedMcqIds,
      };
      if (existing) await updateFn({ data: { id: existing.id, ...payload } });
      else await createFn({ data: payload });
    },
    onSuccess: (_d, status) => {
      toast.success(
        existing
          ? "Mock updated"
          : `Mock ${status === "published" ? "published" : "saved as draft"}`,
      );
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {existing ? "Edit Mock Test" : "Create Mock Test"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs">
          {[
            { n: 1, l: "Scope" },
            { n: 2, l: "Questions" },
            { n: 3, l: "Settings" },
            { n: 4, l: "Schedule" },
          ].map((s, i) => (
            <button
              key={s.n}
              onClick={() => setStep(s.n)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition ${
                step === s.n
                  ? "bg-cta-gradient text-white shadow-glow"
                  : "border border-white/10 bg-background/40"
              }`}
            >
              <span className="font-bold">{s.n}</span> {s.l}
              {i < 3 && <ChevronRight className="h-3 w-3 opacity-50" />}
            </button>
          ))}
        </div>

        {/* STEP 1: Scope */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-xs">Scope</Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "chapter", l: "Chapter wise" },
                  { v: "subject", l: "Full subject" },
                  { v: "level", l: "Level wide" },
                ].map((s) => (
                  <button
                    key={s.v}
                    onClick={() => {
                      setScope(s.v as "chapter" | "subject" | "level");
                      setSelectedMcqIds([]);
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                      scope === s.v
                        ? "border-[var(--neon-purple)]/60 bg-[var(--neon-purple)]/10 text-[var(--neon-purple)] shadow-glow"
                        : "border-white/10 bg-background/40 hover:border-white/30"
                    }`}
                  >
                    {s.l}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label className="mb-2 block text-xs">Level</Label>
              <div className="grid grid-cols-3 gap-2">
                {levelOptions.map((l) => (
                  <button
                    key={l.value}
                    onClick={() => setLevel(l.value)}
                    className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
                      level === l.value
                        ? "border-[var(--neon-blue)]/60 bg-[var(--neon-blue)]/10 text-[var(--neon-blue)] shadow-glow"
                        : "border-white/10 bg-background/40 hover:border-white/30"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {scope !== "level" && (
              <div>
                <Label className="mb-2 block text-xs">
                  Subject{" "}
                  {subjectsQ.isFetching && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                </Label>
                {subjects.length === 0 && !subjectsQ.isFetching ? (
                  <p className="text-xs text-muted-foreground">
                    No subjects under <strong>{level}</strong>. Create one in the MCQ Manager and
                    set its level.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {subjects.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSubjectId(s.id);
                          setChapterIds([]);
                          setSelectedMcqIds([]);
                        }}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                          subjectId === s.id
                            ? "border-[var(--neon-purple)]/50 bg-[var(--neon-purple)]/10 text-[var(--neon-purple)]"
                            : "border-white/10 hover:border-white/30"
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {scope === "chapter" && (
              <div>
                <Label className="mb-2 block text-xs">
                  Chapters{" "}
                  {chaptersQ.isFetching && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
                </Label>
                {!subjectId ? (
                  <p className="text-xs text-muted-foreground">Pick a subject first.</p>
                ) : chapters.length === 0 && !chaptersQ.isFetching ? (
                  <p className="text-xs text-muted-foreground">No chapters in this subject.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {chapters.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => toggleChapter(c.id)}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                          chapterIds.includes(c.id)
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            : "border-white/10 hover:border-white/30"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {chapterIds.length} chapter(s) selected
                </p>
              </div>
            )}
            {scope === "subject" && (
              <p className="text-[11px] text-muted-foreground">
                Full subject mock: MCQ pool will include every chapter in the selected subject.
              </p>
            )}
            {scope === "level" && (
              <p className="text-[11px] text-muted-foreground">
                Level-wide mock: MCQ pool will include every subject/chapter under{" "}
                <strong className="capitalize">{level}</strong>.
              </p>
            )}
          </div>
        )}

        {/* STEP 2: Questions — premium MCQ selection */}
        {step === 2 && (() => {
          const showEmpty =
            (scope === "chapter" && chapterIds.length === 0) ||
            (scope === "subject" && !subjectId);
          if (showEmpty) {
            return (
              <div className="rounded-2xl border border-dashed border-white/10 bg-background/30 p-8 text-center">
                <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  {scope === "chapter"
                    ? "Select at least one chapter in Step 1."
                    : "Select a subject in Step 1."}
                </p>
              </div>
            );
          }

          // Distinct chapters in current MCQ pool, for chapter filter.
          const chapterMap = new Map<string, string>();
          mcqs.forEach((m) => {
            const name = (m as { chapter_name?: string | null }).chapter_name;
            if (m.chapter_id && name) chapterMap.set(m.chapter_id, name);
          });
          const chapterOptions = Array.from(chapterMap.entries()).sort((a, b) =>
            a[1].localeCompare(b[1]),
          );

          const visibleMcqs = mcqs.filter((m) => {
            if (chapterFilter !== "all" && m.chapter_id !== chapterFilter) return false;
            if (showSelectedOnly && !selectedMcqIds.includes(m.id)) return false;
            return true;
          });

          const visibleIds = visibleMcqs.map((m) => m.id);
          const allVisibleSelected =
            visibleIds.length > 0 && visibleIds.every((id) => selectedMcqIds.includes(id));

          function toggleVisible() {
            if (allVisibleSelected) {
              setSelectedMcqIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
            } else {
              setSelectedMcqIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
            }
          }

          const totalMarks = selectedMcqIds.length; // 1 mark / MCQ
          const estMinutes = Math.max(1, Math.ceil((selectedMcqIds.length * 60) / 60));

          const diffStyles: Record<string, string> = {
            easy: "border-emerald-500/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-300",
            medium: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
            hard: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300",
          };

          return (
            <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
              {/* Main column — filters + cards */}
              <div className="space-y-3 min-w-0">
                {/* Filter bar */}
                <div className="rounded-2xl border border-white/10 bg-background/40 p-3 backdrop-blur-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[200px] flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={mcqSearch}
                        onChange={(e) => setMcqSearch(e.target.value)}
                        placeholder="Search question text…"
                        className="h-9 rounded-xl border-white/10 bg-background/60 pl-9"
                      />
                    </div>
                    <Select
                      value={difficulty || "all"}
                      onValueChange={(v) =>
                        setDifficulty(v === "all" ? "" : (v as "easy" | "medium" | "hard"))
                      }
                    >
                      <SelectTrigger className="h-9 w-[130px] rounded-xl border-white/10 bg-background/60">
                        <SelectValue placeholder="Difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All difficulty</SelectItem>
                        <SelectItem value="easy">Easy</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                    {chapterOptions.length > 1 && (
                      <Select value={chapterFilter} onValueChange={setChapterFilter}>
                        <SelectTrigger className="h-9 w-[180px] rounded-xl border-white/10 bg-background/60">
                          <SelectValue placeholder="Chapter" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All chapters</SelectItem>
                          {chapterOptions.map(([id, name]) => (
                            <SelectItem key={id} value={id}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant={showSelectedOnly ? "default" : "outline"}
                      size="sm"
                      onClick={() => setShowSelectedOnly((v) => !v)}
                      className="h-9 rounded-xl border-white/10"
                    >
                      <Filter className="h-3.5 w-3.5" />
                      {showSelectedOnly ? "Showing selected" : "Selected only"}
                    </Button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>
                        <strong className="text-foreground">{visibleMcqs.length}</strong> shown
                      </span>
                      <span className="text-muted-foreground/40">·</span>
                      <span>
                        <strong className="text-foreground">{mcqs.length}</strong> in pool
                      </span>
                      {mcqsQ.isFetching && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={visibleIds.length === 0}
                        onClick={toggleVisible}
                        className="h-7 rounded-lg border-white/10 px-2 text-[11px]"
                      >
                        {allVisibleSelected ? (
                          <>
                            <X className="h-3 w-3" /> Deselect visible
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3 w-3" /> Select visible
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={selectedMcqIds.length === 0}
                        onClick={clearMcqs}
                        className="h-7 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Cards */}
                <div className="max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-background/20 p-3">
                  {mcqsQ.isFetching && mcqs.length === 0 ? (
                    <div className="flex items-center justify-center p-10 text-xs text-muted-foreground">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading questions…
                    </div>
                  ) : visibleMcqs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-10 text-center">
                      <Search className="mb-2 h-8 w-8 text-muted-foreground/40" />
                      <p className="text-sm font-medium">No matching questions</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Try adjusting your search or filters.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-2.5 sm:grid-cols-1 xl:grid-cols-2">
                      {visibleMcqs.map((m, idx) => {
                        const checked = selectedMcqIds.includes(m.id);
                        const chapterName = (m as { chapter_name?: string | null }).chapter_name;
                        const subjectName = (m as { subject_name?: string | null }).subject_name;
                        return (
                          <button
                            type="button"
                            key={m.id}
                            onClick={() => toggleMcq(m.id)}
                            aria-pressed={checked}
                            className={`group relative flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                              checked
                                ? "border-[var(--neon-purple)]/60 bg-[var(--neon-purple)]/10 shadow-glow ring-1 ring-[var(--neon-purple)]/30 scale-[1.01]"
                                : "border-white/10 bg-background/40 hover:border-white/30 hover:bg-background/60"
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
                                checked
                                  ? "border-[var(--neon-purple)] bg-[var(--neon-purple)] text-white"
                                  : "border-white/20 bg-background/40 group-hover:border-white/40"
                              }`}
                            >
                              {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
                            </span>
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <p className="line-clamp-3 text-sm font-medium leading-snug">
                                  <span className="mr-1.5 text-[10px] font-mono text-muted-foreground">
                                    Q{idx + 1}
                                  </span>
                                  {m.question}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                <span
                                  className={`rounded-md border px-1.5 py-0.5 font-semibold capitalize ${
                                    diffStyles[m.difficulty] ?? "border-white/10 text-muted-foreground"
                                  }`}
                                >
                                  {m.difficulty}
                                </span>
                                {chapterName && (
                                  <span className="rounded-md border border-white/10 bg-background/60 px-1.5 py-0.5 text-muted-foreground">
                                    {chapterName}
                                  </span>
                                )}
                                {subjectName && (
                                  <span className="rounded-md border border-white/10 bg-background/60 px-1.5 py-0.5 text-muted-foreground">
                                    {subjectName}
                                  </span>
                                )}
                                <span className="ml-auto rounded-md bg-background/60 px-1.5 py-0.5 text-muted-foreground">
                                  1 mark
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Sticky summary panel */}
              <aside className="lg:sticky lg:top-2 lg:self-start">
                <div className="space-y-3 rounded-2xl border border-white/10 bg-gradient-to-br from-background/80 to-background/40 p-4 shadow-card-soft backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-[var(--neon-purple)]/15 p-1.5">
                      <Sparkles className="h-4 w-4 text-[var(--neon-purple)]" />
                    </div>
                    <h4 className="font-display text-sm font-bold">Selection Summary</h4>
                  </div>
                  <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
                    <div className="rounded-xl border border-white/10 bg-background/50 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Questions
                      </p>
                      <p className="font-display text-2xl font-bold tabular-nums">
                        {selectedMcqIds.length}
                      </p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-background/50 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Total marks
                      </p>
                      <p className="font-display text-2xl font-bold tabular-nums">{totalMarks}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-background/50 p-3">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Est. duration
                      </p>
                      <p className="font-display text-2xl font-bold tabular-nums">
                        {estMinutes}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">min</span>
                      </p>
                    </div>
                  </div>
                  {selectedMcqIds.length > 0 && (
                    <div className="space-y-1.5 rounded-xl border border-white/10 bg-background/40 p-3 text-[11px]">
                      <p className="font-semibold text-muted-foreground">Difficulty mix</p>
                      {(["easy", "medium", "hard"] as const).map((d) => {
                        const count = mcqs.filter(
                          (m) => selectedMcqIds.includes(m.id) && m.difficulty === d,
                        ).length;
                        const pct = selectedMcqIds.length
                          ? Math.round((count / selectedMcqIds.length) * 100)
                          : 0;
                        return (
                          <div key={d}>
                            <div className="flex items-center justify-between">
                              <span className="capitalize text-muted-foreground">{d}</span>
                              <span className="font-mono">
                                {count} · {pct}%
                              </span>
                            </div>
                            <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-background/60">
                              <div
                                className={`h-full transition-all ${
                                  d === "easy"
                                    ? "bg-emerald-500"
                                    : d === "medium"
                                      ? "bg-amber-500"
                                      : "bg-rose-500"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedMcqIds.length === 0}
                    onClick={clearMcqs}
                    className="w-full rounded-xl border-white/10"
                  >
                    <X className="h-3.5 w-3.5" /> Clear selection
                  </Button>
                </div>
              </aside>
            </div>
          );
        })()}


        {/* STEP 3: Settings */}
        {step === 3 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label className="mb-1 block text-xs">Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Constitutional Law Final 2026"
                className="rounded-xl border-white/10 bg-background/40"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1 block text-xs">Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional summary…"
                className="rounded-xl border-white/10 bg-background/40"
                rows={2}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">
                <Timer className="mr-1 inline h-3 w-3" />
                Duration (minutes)
              </Label>
              <Input
                type="number"
                min={1}
                value={durationMin}
                onChange={(e) => setDurationMin(Math.max(1, Number(e.target.value) || 1))}
                className="rounded-xl border-white/10 bg-background/40"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">
                <Target className="mr-1 inline h-3 w-3" />
                Passing marks
              </Label>
              <Input
                type="number"
                min={0}
                value={passingMarks}
                onChange={(e) => setPassingMarks(Math.max(0, Number(e.target.value) || 0))}
                className="rounded-xl border-white/10 bg-background/40"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Negative marking (per wrong)</Label>
              <Input
                type="number"
                step="0.25"
                min={0}
                max={5}
                value={negativeMarking}
                onChange={(e) => setNegativeMarking(Math.max(0, Number(e.target.value) || 0))}
                className="rounded-xl border-white/10 bg-background/40"
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 px-3 py-2 text-xs">
              Public (visible to all students)
              <Switch checked={isPublic} onCheckedChange={setIsPublic} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 px-3 py-2 text-xs">
              Randomize question order
              <Switch checked={randomizeQ} onCheckedChange={setRandomizeQ} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-background/30 px-3 py-2 text-xs">
              Randomize option order
              <Switch checked={randomizeO} onCheckedChange={setRandomizeO} />
            </div>
          </div>
        )}

        {/* STEP 4: Schedule */}
        {step === 4 && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs">
                <CalendarClock className="mr-1 inline h-3 w-3" />
                Starts at
              </Label>
              <Input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="rounded-xl border-white/10 bg-background/40"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">
                <CalendarClock className="mr-1 inline h-3 w-3" />
                Ends at
              </Label>
              <Input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="rounded-xl border-white/10 bg-background/40"
              />
            </div>
            <div className="md:col-span-2 rounded-xl border border-white/10 bg-background/30 p-3 text-xs">
              <p className="font-semibold mb-1">Summary</p>
              <p className="text-muted-foreground">
                <strong>{title || "Untitled"}</strong> · {level} · {selectedMcqIds.length} MCQs ·{" "}
                {durationMin} min ·{" "}
                {negativeMarking > 0 ? `−${negativeMarking} per wrong` : "no negative marking"} ·{" "}
                {isPublic ? "Public" : "Private"}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={onClose}>
            <X className="h-4 w-4" /> Cancel
          </Button>
          {step > 1 && (
            <Button
              variant="outline"
              onClick={() => setStep(step - 1)}
              className="rounded-xl border-white/10"
            >
              Back
            </Button>
          )}
          {step < 4 && (
            <Button
              onClick={() => goNext()}
              className="bg-cta-gradient rounded-xl text-white shadow-glow"
            >
              Next
            </Button>
          )}
          {step === 4 && (
            <>
              <Button
                variant="outline"
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate("draft")}
                className="rounded-xl border-white/10"
              >
                {saveMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                Save Draft
              </Button>
              <Button
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate("published")}
                className="bg-cta-gradient rounded-xl text-white shadow-glow"
              >
                {saveMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}{" "}
                Publish
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
