import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
// pdfjs-dist and mammoth are loaded on demand inside extractFileText() to keep
// these large parsers out of the initial admin bundle.
import { toast } from "sonner";
import {
  Plus,
  Search,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Loader2,
  Upload,
  X,
  Check,
  FolderPlus,
  BookPlus,
  AlertCircle,
  Layers,
  GraduationCap,
  BookOpen,
  ChevronRight,
  ChevronLeft,
  Hash,
  Lock,
  Sparkles,
  Sun,
  Moon,
  Bell,
  ChevronDown,
  LayoutGrid,
  FileQuestion,
  ClipboardList,
  FileStack,
  Activity,
  CheckCircle2,
  FolderTree,
  MoveRight,
  Home,
  Zap,
  User as UserIcon,
  Copy,
  MoreHorizontal,
  List,
  Settings2,
  Camera,
  Filter,
  RefreshCw,
  Download,
  BarChart3,
  Maximize2,
  HelpCircle,
  Cloud,
  Target,
  Pin,
  Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/app-store";
import { useMyNotifications } from "@/hooks/use-my-notifications";
import {
  adminListSubjects,
  adminListChapters,
  adminListMcqs,
  adminListLevels,
  adminCreateMcq,
  adminUpdateMcq,
  adminDeleteMcq,
  adminSetMcqStatus,
  adminCreateSubject,
  adminCreateChapter,
  adminBulkImportMcqs,
  adminBulkDeleteMcqs,
  adminDeleteAllMcqs,
  adminMcqDashboardStats,
  type McqDashboardStats,
} from "@/lib/admin-mcq.functions";
import { confirmDialog } from "@/components/ui/confirm-imperative";
import {
  fingerprintQuestion as fingerprintSharedQuestion,
  parseMcqText as parseSharedMcqText,
} from "@/lib/mcq-parse";

// pdfjs worker is configured lazily inside extractFileText() on first PDF parse.

type QuestionType = "mcq" | "true_false";

type Mcq = {
  id: string;
  question: string;
  question_type: QuestionType;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  correct_option: string;
  explanation: string | null;
  difficulty: "easy" | "medium" | "hard";
  status: "draft" | "published" | "archived";
  tags: string[];
  chapter_id: string;
  updated_at?: string;
  chapter_name?: string | null;
  subject_name?: string | null;
  attempts?: number;
};

type Draft = {
  id?: string;
  chapter_id: string;
  question: string;
  question_type: QuestionType;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: "A" | "B" | "C" | "D";
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  status: "draft" | "published" | "archived";
  tags: string;
};

type BulkImportItem = {
  question: string;
  question_type: QuestionType;
  option_a: string;
  option_b: string;
  option_c: string | null;
  option_d: string | null;
  correct_option: "A" | "B" | "C" | "D";
  explanation?: string | null;
  difficulty: "easy" | "medium" | "hard";
  status: "draft" | "published" | "archived";
  tags: string[];
  sourceIndex?: number;
};

type ParsedImportRow = BulkImportItem & {
  source: string;
  sourceIndex?: number;
  duplicate?: boolean;
  error?: string;
};

function emptyDraft(chapterId: string): Draft {
  return {
    chapter_id: chapterId,
    question: "",
    question_type: "mcq",
    option_a: "",
    option_b: "",
    option_c: "",
    option_d: "",
    correct_option: "A",
    explanation: "",
    difficulty: "medium",
    status: "published",
    tags: "",
  };
}

export function McqAdminConsole() {
  const qc = useQueryClient();
  const listSubjectsFn = useServerFn(adminListSubjects);
  const listChaptersFn = useServerFn(adminListChapters);
  const listMcqsFn = useServerFn(adminListMcqs);
  const listLevelsFn = useServerFn(adminListLevels);
  const createMcqFn = useServerFn(adminCreateMcq);
  const updateMcqFn = useServerFn(adminUpdateMcq);
  const deleteMcqFn = useServerFn(adminDeleteMcq);
  const setStatusFn = useServerFn(adminSetMcqStatus);
  const createSubjectFn = useServerFn(adminCreateSubject);
  const createChapterFn = useServerFn(adminCreateChapter);
  const bulkImportFn = useServerFn(adminBulkImportMcqs);
  const bulkDeleteFn = useServerFn(adminBulkDeleteMcqs);
  const deleteAllFn = useServerFn(adminDeleteAllMcqs);
  const statsFn = useServerFn(adminMcqDashboardStats);

  const [levelCode, setLevelCode] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | "draft" | "published" | "archived">("");
  const [difficulty, setDifficulty] = useState<"" | "easy" | "medium" | "hard">("");
  const [typeFilter, setTypeFilter] = useState<"" | "single">("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const levelsQ = useQuery({ queryKey: ["admin-levels"], queryFn: () => listLevelsFn() });
  const subjectsQ = useQuery({ queryKey: ["admin-subjects"], queryFn: () => listSubjectsFn() });
  const statsQ = useQuery({ queryKey: ["admin-mcq-stats"], queryFn: () => statsFn() });
  const chaptersQ = useQuery({
    queryKey: ["admin-chapters", subjectId],
    queryFn: () => listChaptersFn({ data: { subjectId: subjectId! } }),
    enabled: !!subjectId,
  });

  // Subjects filtered by selected level
  const filteredSubjects = useMemo(() => {
    const all = subjectsQ.data ?? [];
    if (!levelCode) return all;
    return all.filter((s: { level?: string | null }) => s.level === levelCode);
  }, [subjectsQ.data, levelCode]);

  // Auto-pick level/subject/chapter
  useEffect(() => {
    if (!levelCode && levelsQ.data && levelsQ.data.length) setLevelCode(levelsQ.data[0].code);
  }, [levelsQ.data, levelCode]);
  useEffect(() => {
    if (!filteredSubjects.length) {
      setSubjectId(null);
      return;
    }
    if (!subjectId || !filteredSubjects.find((s) => s.id === subjectId)) {
      setSubjectId(filteredSubjects[0].id);
      setChapterId(null);
    }
  }, [filteredSubjects, subjectId]);
  useEffect(() => {
    if (!chapterId && chaptersQ.data && chaptersQ.data.length) setChapterId(chaptersQ.data[0].id);
    if (chapterId && chaptersQ.data && !chaptersQ.data.find((c) => c.id === chapterId)) {
      setChapterId(chaptersQ.data[0]?.id ?? null);
    }
  }, [chaptersQ.data, chapterId]);

  const mcqsQ = useQuery({
    queryKey: ["admin-mcqs", { chapterId, subjectId, search, status, difficulty, page, pageSize }],
    queryFn: () =>
      listMcqsFn({
        data: {
          chapterId: chapterId ?? undefined,
          subjectId: !chapterId ? (subjectId ?? undefined) : undefined,
          search: search || undefined,
          status: status || undefined,
          difficulty: difficulty || undefined,
          page,
          pageSize,
        },
      }),
    enabled: !!(chapterId || subjectId),
  });

  const bulkExistingQ = useQuery({
    queryKey: ["admin-mcqs-bulk-existing", chapterId],
    queryFn: async () => {
      const bulkPageSize = 500;
      const first = await listMcqsFn({
        data: { chapterId: chapterId!, page: 1, pageSize: bulkPageSize },
      });
      const existingRows = [...(first.rows ?? [])];
      const count = first.count ?? existingRows.length;
      for (let bulkPage = 2; existingRows.length < count; bulkPage += 1) {
        const next = await listMcqsFn({
          data: { chapterId: chapterId!, page: bulkPage, pageSize: bulkPageSize },
        });
        if (!next.rows?.length) break;
        existingRows.push(...next.rows);
      }
      return existingRows;
    },
    enabled: !!chapterId,
  });

  // Realtime: any change to mcqs/chapters/subjects/levels => invalidate
  useEffect(() => {
    const ch = supabase
      .channel(`admin-mcq-console-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mcqs" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-mcqs"] });
        qc.invalidateQueries({ queryKey: ["admin-mcq-stats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "chapters" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-chapters"] });
        qc.invalidateQueries({ queryKey: ["admin-mcq-stats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "subjects" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-subjects"] });
        qc.invalidateQueries({ queryKey: ["admin-mcq-stats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "levels" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-levels"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quizzes" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-mcq-stats"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const rows = (mcqsQ.data?.rows ?? []) as Mcq[];
  const total = mcqsQ.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [editing, setEditing] = useState<Draft | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmAll, setConfirmAll] = useState<null | { step: 1 | 2 }>(null);
  const [deleteAllText, setDeleteAllText] = useState("");
  const [showSub, setShowSub] = useState(false);
  const [showCh, setShowCh] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["admin-mcqs"] });
    qc.invalidateQueries({ queryKey: ["admin-mcq-stats"] });
  }

  // Clear selection when filters change
  useEffect(() => {
    setSelected(new Set());
  }, [levelCode, subjectId, chapterId, search, status, difficulty, page]);

  const saveMut = useMutation({
    mutationFn: async (d: Draft) => {
      const isTF = d.question_type === "true_false";
      const payload = {
        chapter_id: d.chapter_id,
        question: d.question.trim(),
        question_type: d.question_type,
        option_a: isTF ? "True" : d.option_a.trim(),
        option_b: isTF ? "False" : d.option_b.trim(),
        option_c: isTF ? null : d.option_c.trim(),
        option_d: isTF ? null : d.option_d.trim(),
        correct_option:
          isTF && !["A", "B"].includes(d.correct_option) ? ("A" as const) : d.correct_option,
        explanation: d.explanation.trim() || null,
        difficulty: d.difficulty,
        status: d.status,
        tags: d.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20),
      };
      if (d.id) await updateMcqFn({ data: { id: d.id, ...payload } });
      else await createMcqFn({ data: payload });
    },
    onSuccess: () => {
      setEditing(null);
      invalidateAll();
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteMcqFn({ data: { id } }),
    onSuccess: () => {
      invalidateAll();
      toast.success("Deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: (vars: { id: string; status: Mcq["status"] }) => setStatusFn({ data: vars }),
    onSuccess: (_d, v) => {
      invalidateAll();
      toast.success(v.status === "published" ? "Published" : "Unpublished");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: string[]) =>
      bulkDeleteFn({
        data: {
          ids,
          level: levelCode ?? null,
          subjectId: subjectId ?? null,
          chapterId: chapterId ?? null,
        },
      }),
    onSuccess: (res: { deleted: number }) => {
      setSelected(new Set());
      setConfirmBulk(false);
      invalidateAll();
      toast.success(`Deleted ${res.deleted} MCQ${res.deleted === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAllMut = useMutation({
    mutationFn: () =>
      deleteAllFn({
        data: {
          level: levelCode ?? null,
          subjectId: subjectId ?? null,
          chapterId: chapterId ?? null,
          confirm: "DELETE" as const,
        },
      }),
    onSuccess: (res: { deleted: number }) => {
      setSelected(new Set());
      setConfirmAll(null);
      setDeleteAllText("");
      invalidateAll();
      toast.success(`Deleted ${res.deleted} MCQ${res.deleted === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkStatusMut = useMutation({
    mutationFn: async (vars: { ids: string[]; status: "published" | "draft" }) => {
      for (const id of vars.ids) await setStatusFn({ data: { id, status: vars.status } });
      return vars;
    },
    onSuccess: (vars) => {
      setSelected(new Set());
      invalidateAll();
      toast.success(
        `${vars.status === "published" ? "Published" : "Unpublished"} ${vars.ids.length} MCQ${vars.ids.length === 1 ? "" : "s"}`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkMoveMut = useMutation({
    mutationFn: async (vars: { ids: string[]; chapterId: string }) => {
      for (const id of vars.ids) await updateMcqFn({ data: { id, chapter_id: vars.chapterId } });
      return vars;
    },
    onSuccess: (vars) => {
      setSelected(new Set());
      setMoveOpen(false);
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["admin-chapters"] });
      toast.success(`Moved ${vars.ids.length} MCQ${vars.ids.length === 1 ? "" : "s"}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pageIds = rows.map((r) => r.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const scopeLabel = chapterId
    ? "this chapter"
    : subjectId
      ? "this subject"
      : levelCode
        ? "this level"
        : "this scope";

  const activeLevelName = levelsQ.data?.find((l) => l.code === levelCode)?.name ?? null;
  const activeSubjectName = filteredSubjects.find((s) => s.id === subjectId)?.name ?? null;
  const activeChapterName = chaptersQ.data?.find((c) => c.id === chapterId)?.name ?? null;
  const lastSyncAt = statsQ.data?.lastSyncAt ?? null;

  return (
    <div className="space-y-5">
      <PremiumHero
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Content" }]}
        title="MCQ Management Console"
        subtitle="Powerful, fast & intelligent MCQ management system. Track, organize & analyze in real-time."
        canCreate={!!chapterId}
        onNewMcq={() => chapterId && setEditing(emptyDraft(chapterId))}
        onBulkImport={() => setShowBulk(true)}
        onRefresh={() => {
          invalidateAll();
          qc.invalidateQueries({ queryKey: ["admin-mcq-stats"] });
          toast.success("Refreshed");
        }}
        lastSyncAt={lastSyncAt}
      />

      <KpiRow stats={statsQ.data} loading={statsQ.isLoading} />

      {/* Academic selection — Level / Subject / Chapter rows */}
      <AcademicSelectionRows
        levels={levelsQ.data ?? []}
        subjects={filteredSubjects}
        chapters={chaptersQ.data ?? []}
        levelCode={levelCode}
        subjectId={subjectId}
        chapterId={chapterId}
        onLevel={(code) => {
          setLevelCode(code);
          setSubjectId(null);
          setChapterId(null);
          setPage(1);
        }}
        onSubject={(id) => {
          setSubjectId(id);
          setChapterId(null);
          setPage(1);
        }}
        onChapter={(id) => {
          setChapterId(id);
          setPage(1);
        }}
        onAddSubject={() => setShowSub(true)}
        onAddChapter={() => subjectId && setShowCh(true)}
      />

      {/* Smart filters */}
      <div className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search question text, tags, keywords…"
            className="h-10 w-full rounded-xl border border-border/60 bg-background/40 pl-9 pr-3 text-sm outline-none focus:border-[var(--neon-purple)]/50"
          />
        </div>
        <SelectPill
          value={status}
          onChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
          options={[
            { v: "", l: "All Status" },
            { v: "published", l: "Published" },
            { v: "draft", l: "Draft" },
            { v: "archived", l: "Archived" },
          ]}
        />
        <SelectPill
          value={difficulty}
          onChange={(v) => {
            setDifficulty(v as typeof difficulty);
            setPage(1);
          }}
          options={[
            { v: "", l: "All Difficulties" },
            { v: "easy", l: "Easy" },
            { v: "medium", l: "Medium" },
            { v: "hard", l: "Hard" },
          ]}
        />
        <SelectPill
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as typeof typeFilter)}
          options={[
            { v: "", l: "All Types" },
            { v: "single", l: "Single" },
          ]}
        />
        <button
          onClick={() => setShowMoreFilters((v) => !v)}
          className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${showMoreFilters ? "border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10 text-[var(--neon-purple)]" : "border-border/60 bg-background/40 text-foreground hover:bg-muted/50"}`}
        >
          <Filter className="h-3.5 w-3.5" /> More Filters
        </button>
        <button
          onClick={() => {
            setSearch("");
            setStatus("");
            setDifficulty("");
            setTypeFilter("");
            setShowMoreFilters(false);
            setPage(1);
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Clear
        </button>
      </div>

      {showMoreFilters && (
        <div className="glass shadow-card-soft flex flex-wrap items-center gap-3 rounded-2xl p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Pin className="h-3.5 w-3.5" /> Date, Tag, Creator & Review filters are coming online as
            fields are populated.
          </span>
        </div>
      )}

      {/* Bulk toolbar */}
      <div className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-2.5">
        <span className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-xs">
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full ${selected.size > 0 ? "bg-[var(--neon-purple)] text-white" : "border border-border"}`}
          >
            {selected.size > 0 && <Check className="h-2.5 w-2.5" />}
          </span>
          <span className="font-display font-bold text-gradient">{selected.size}</span>
          <span className="text-muted-foreground">Selected</span>
        </span>
        <button
          onClick={togglePage}
          disabled={pageIds.length === 0}
          className="rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-xs font-semibold hover:bg-muted/50 disabled:opacity-40"
        >
          {allOnPageSelected ? "Deselect Page" : "Select Page"}
        </button>
        <button
          onClick={() => bulkStatusMut.mutate({ ids: Array.from(selected), status: "published" })}
          disabled={selected.size === 0 || bulkStatusMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
        >
          {bulkStatusMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}{" "}
          Publish
        </button>
        <button
          onClick={() => bulkStatusMut.mutate({ ids: Array.from(selected), status: "draft" })}
          disabled={selected.size === 0 || bulkStatusMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/20 disabled:opacity-40"
        >
          <EyeOff className="h-3.5 w-3.5" /> Unpublish
        </button>
        <button
          onClick={() => {
            if (selected.size === 0) {
              toast.error("Select at least one MCQ");
              return;
            }
            setConfirmBulk(true);
          }}
          disabled={selected.size === 0 || bulkDeleteMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-40"
        >
          {bulkDeleteMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}{" "}
          Delete
        </button>
        <MoreActionsMenu
          disabled={selected.size === 0}
          onMove={() => setMoveOpen(true)}
          onArchive={() =>
            bulkStatusMut.mutate({ ids: Array.from(selected), status: "draft" as never })
          }
          onDeleteAll={() => {
            setDeleteAllText("");
            setConfirmAll({ step: 1 });
          }}
          canDeleteAll={!!(chapterId || subjectId || levelCode)}
        />
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setView("grid")}
            title="Grid view"
            className={`flex h-8 w-8 items-center justify-center rounded-lg border ${view === "grid" ? "border-[var(--neon-purple)]/50 bg-[var(--neon-purple)]/10 text-[var(--neon-purple)]" : "border-border/60 bg-background/40 hover:bg-muted/50"}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView("list")}
            title="List view"
            className={`flex h-8 w-8 items-center justify-center rounded-lg border ${view === "list" ? "border-[var(--neon-purple)]/50 bg-[var(--neon-purple)]/10 text-[var(--neon-purple)]" : "border-border/60 bg-background/40 hover:bg-muted/50"}`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDensity((d) => (d === "comfortable" ? "compact" : "comfortable"))}
            title={`Density: ${density}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/40 hover:bg-muted/50"
          >
            <Settings2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Data table */}
      <div className="glass shadow-card-soft overflow-hidden rounded-3xl">
        {mcqsQ.isLoading ? (
          <Loader />
        ) : rows.length === 0 ? (
          <EmptyTable
            chapterId={chapterId}
            onCreate={() => chapterId && setEditing(emptyDraft(chapterId))}
            onImport={() => setShowBulk(true)}
            onRefresh={invalidateAll}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="sticky top-0 z-10 bg-muted/50 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground backdrop-blur">
                <tr>
                  <th className="px-3 py-3 w-10 whitespace-nowrap">
                    <input
                      type="checkbox"
                      aria-label="Select all on page"
                      checked={allOnPageSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = !allOnPageSelected && someOnPageSelected;
                      }}
                      onChange={togglePage}
                      className="h-4 w-4 accent-[var(--neon-purple)]"
                    />
                  </th>
                  <th className="px-2 py-3 w-10 whitespace-nowrap">#</th>
                  <th className="px-4 py-3 whitespace-nowrap">Question</th>
                  <th className="px-3 py-3 w-28 whitespace-nowrap">Subject</th>
                  <th className="px-3 py-3 w-24 whitespace-nowrap">Chapter</th>
                  <th className="px-3 py-3 w-20 whitespace-nowrap">Type</th>
                  <th className="px-3 py-3 w-24 whitespace-nowrap">Difficulty</th>
                  <th className="px-3 py-3 w-28 whitespace-nowrap">Status</th>
                  <th className="px-3 py-3 w-24 whitespace-nowrap">Attempts</th>
                  <th className="px-3 py-3 w-28 whitespace-nowrap">Updated</th>
                  <th className="px-3 py-3 w-32 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m, idx) => {
                  const num = (page - 1) * pageSize + idx + 1;
                  const padding = density === "compact" ? "py-2" : "py-3";
                  return (
                    <tr
                      key={m.id}
                      className={`group border-t border-border/60 transition-colors hover:bg-muted/30 ${selected.has(m.id) ? "bg-[var(--neon-purple)]/5" : ""}`}
                    >
                      <td className={`px-3 ${padding}`}>
                        <input
                          type="checkbox"
                          aria-label="Select MCQ"
                          checked={selected.has(m.id)}
                          onChange={() => toggleOne(m.id)}
                          className="h-4 w-4 accent-[var(--neon-purple)]"
                        />
                      </td>
                      <td className={`px-2 ${padding} tabular-nums text-muted-foreground`}>
                        {num}
                      </td>
                      <td className={`px-4 ${padding}`}>
                        <p className="line-clamp-2 font-medium leading-snug">{m.question}</p>
                        {m.tags.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {m.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                              >
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className={`px-3 ${padding}`}>
                        {m.subject_name ? (
                          <span className="inline-flex items-center rounded-md border border-[var(--neon-blue)]/30 bg-[var(--neon-blue)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--neon-blue)]">
                            {m.subject_name}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={`px-3 ${padding}`}>
                        {m.chapter_name ? (
                          <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium">
                            {m.chapter_name}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className={`px-3 ${padding}`}>
                        <span className="inline-flex items-center rounded-md border border-[var(--neon-purple)]/30 bg-[var(--neon-purple)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--neon-purple)]">
                          Single
                        </span>
                      </td>
                      <td className={`px-3 ${padding}`}>
                        <DifficultyBadge difficulty={m.difficulty} />
                      </td>
                      <td className={`px-3 ${padding}`}>
                        <StatusBadge status={m.status} />
                      </td>
                      <td className={`px-3 ${padding}`}>
                        <span className="inline-flex items-center gap-1.5 tabular-nums text-[11px]">
                          <BarChart3 className="h-3 w-3 text-muted-foreground" />
                          {(m.attempts ?? 0).toLocaleString()}
                        </span>
                      </td>
                      <td
                        className={`px-3 ${padding} text-[11px] text-muted-foreground tabular-nums`}
                      >
                        {m.updated_at ? formatDateTime(m.updated_at) : "—"}
                      </td>
                      <td className={`px-3 ${padding}`}>
                        <div className="flex justify-end gap-1 opacity-80 transition-opacity group-hover:opacity-100">
                          <IconBtn
                            title="View / preview"
                            onClick={() =>
                              setEditing({
                                id: m.id,
                                chapter_id: m.chapter_id,
                                question: m.question,
                                question_type: m.question_type ?? "mcq",
                                option_a: m.option_a,
                                option_b: m.option_b,
                                option_c: m.option_c ?? "",
                                option_d: m.option_d ?? "",
                                correct_option: m.correct_option as Draft["correct_option"],
                                explanation: m.explanation ?? "",
                                difficulty: m.difficulty,
                                status: m.status,
                                tags: m.tags.join(", "),
                              })
                            }
                          >
                            <Eye className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            title="Edit"
                            onClick={() =>
                              setEditing({
                                id: m.id,
                                chapter_id: m.chapter_id,
                                question: m.question,
                                question_type: m.question_type ?? "mcq",
                                option_a: m.option_a,
                                option_b: m.option_b,
                                option_c: m.option_c ?? "",
                                option_d: m.option_d ?? "",
                                correct_option: m.correct_option as Draft["correct_option"],
                                explanation: m.explanation ?? "",
                                difficulty: m.difficulty,
                                status: m.status,
                                tags: m.tags.join(", "),
                              })
                            }
                          >
                            <Edit3 className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            title="Duplicate"
                            onClick={() =>
                              setEditing({
                                chapter_id: m.chapter_id,
                                question: m.question,
                                question_type: m.question_type ?? "mcq",
                                option_a: m.option_a,
                                option_b: m.option_b,
                                option_c: m.option_c ?? "",
                                option_d: m.option_d ?? "",
                                correct_option: m.correct_option as Draft["correct_option"],
                                explanation: m.explanation ?? "",
                                difficulty: m.difficulty,
                                status: "draft",
                                tags: m.tags.join(", "),
                              })
                            }
                          >
                            <Copy className="h-4 w-4" />
                          </IconBtn>
                          <IconBtn
                            title="Delete"
                            danger
                            onClick={() => {
                              void (async () => {
                                if (
                                  await confirmDialog({
                                    title: "Delete this MCQ?",
                                    variant: "destructive",
                                    confirmLabel: "Delete",
                                  })
                                )
                                  deleteMut.mutate(m.id);
                              })();
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            onPage={(p) => setPage(p)}
            onPageSize={(s) => {
              setPageSize(s);
              setPage(1);
            }}
          />
        )}
      </div>

      <RecentActivityPanel
        activity={statsQ.data?.recentActivity ?? []}
        loading={statsQ.isLoading}
      />

      {editing && (
        <EditDialog
          draft={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => saveMut.mutate(editing)}
          saving={saveMut.isPending}
          error={saveMut.error as Error | null}
        />
      )}

      {showSub && (
        <QuickCreateDialog
          title="New subject"
          onClose={() => setShowSub(false)}
          onSubmit={async ({ name, slug }) => {
            await createSubjectFn({ data: { name, slug, sort_order: 0, status: "published" } });
            qc.invalidateQueries({ queryKey: ["admin-subjects"] });
            qc.invalidateQueries({ queryKey: ["admin-mcq-stats"] });
          }}
        />
      )}
      {showCh && subjectId && (
        <QuickCreateDialog
          title="New chapter"
          onClose={() => setShowCh(false)}
          onSubmit={async ({ name, slug }) => {
            await createChapterFn({
              data: { name, slug, subject_id: subjectId, sort_order: 0, status: "published" },
            });
            qc.invalidateQueries({ queryKey: ["admin-chapters", subjectId] });
            qc.invalidateQueries({ queryKey: ["admin-mcq-stats"] });
          }}
        />
      )}
      {moveOpen && (
        <MoveDialog
          subjects={subjectsQ.data ?? []}
          count={selected.size}
          pending={bulkMoveMut.isPending}
          onClose={() => setMoveOpen(false)}
          onMove={(targetChapterId) =>
            bulkMoveMut.mutate({ ids: Array.from(selected), chapterId: targetChapterId })
          }
        />
      )}

      {showBulk && chapterId && (
        <BulkImportDialog
          chapterId={chapterId}
          existingQuestions={bulkExistingQ.data ?? rows}
          onClose={() => setShowBulk(false)}
          onDone={() => {
            setShowBulk(false);
            invalidateAll();
          }}
          run={bulkImportFn}
        />
      )}

      {confirmBulk && (
        <Modal
          onClose={() => !bulkDeleteMut.isPending && setConfirmBulk(false)}
          title="Delete selected MCQs?"
        >
          <div className="space-y-3 text-sm">
            <p>
              You are about to permanently delete{" "}
              <span className="font-bold text-red-400">{selected.size}</span> MCQ
              {selected.size === 1 ? "" : "s"}. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmBulk(false)}
                disabled={bulkDeleteMut.isPending}
                className="rounded-xl border border-border bg-background/40 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkDeleteMut.mutate(Array.from(selected))}
                disabled={bulkDeleteMut.isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleteMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Delete {selected.size}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {confirmAll && (
        <Modal
          onClose={() => !deleteAllMut.isPending && (setConfirmAll(null), setDeleteAllText(""))}
          title={confirmAll.step === 1 ? "Delete all MCQs in scope?" : "Final confirmation"}
        >
          <div className="space-y-3 text-sm">
            {confirmAll.step === 1 ? (
              <>
                <p>
                  This will permanently delete{" "}
                  <span className="font-bold text-red-400">every MCQ</span> in{" "}
                  <span className="font-semibold">{scopeLabel}</span>. This cannot be undone.
                </p>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setConfirmAll(null)}
                    className="rounded-xl border border-border bg-background/40 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setConfirmAll({ step: 2 })}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-500/60 bg-red-600/30 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-600/50"
                  >
                    Continue
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  To confirm, type <span className="font-mono font-bold text-red-300">DELETE</span>{" "}
                  below.
                </p>
                <input
                  autoFocus
                  value={deleteAllText}
                  onChange={(e) => setDeleteAllText(e.target.value)}
                  placeholder="DELETE"
                  className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 font-mono text-sm outline-none focus:border-red-400/60"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => {
                      setConfirmAll(null);
                      setDeleteAllText("");
                    }}
                    disabled={deleteAllMut.isPending}
                    className="rounded-xl border border-border bg-background/40 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteAllMut.mutate()}
                    disabled={deleteAllText !== "DELETE" || deleteAllMut.isPending}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleteAllMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Permanently delete
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------- Academic Selection Flow (Level → Subject → Chapter) ---------------- */
type LevelLite = { code: string; name: string; color?: string | null; icon?: string | null };
type NamedRow = { id: string; name: string; status: string; sort_order?: number };

function AcademicSelectionFlow(props: {
  levels: LevelLite[];
  subjects: NamedRow[];
  chapters: NamedRow[];
  levelCode: string | null;
  subjectId: string | null;
  chapterId: string | null;
  onLevel: (code: string) => void;
  onSubject: (id: string) => void;
  onChapter: (id: string) => void;
  onAddSubject: () => void;
  onAddChapter: () => void;
}) {
  const activeLevel = props.levels.find((l) => l.code === props.levelCode) ?? null;
  const activeSubject = props.subjects.find((s) => s.id === props.subjectId) ?? null;
  const activeChapter = props.chapters.find((c) => c.id === props.chapterId) ?? null;

  const steps = [
    {
      n: 1,
      label: "Level",
      value: activeLevel?.name,
      icon: Layers,
      done: !!activeLevel,
      active: !activeLevel,
    },
    {
      n: 2,
      label: "Subject",
      value: activeSubject?.name,
      icon: GraduationCap,
      done: !!activeSubject,
      active: !!activeLevel && !activeSubject,
      locked: !activeLevel,
    },
    {
      n: 3,
      label: "Chapter",
      value: activeChapter?.name,
      icon: BookOpen,
      done: !!activeChapter,
      active: !!activeSubject && !activeChapter,
      locked: !activeSubject,
    },
  ];

  return (
    <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
      {/* Subtle ambient glow */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--neon-purple)]/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-[var(--neon-blue)]/15 blur-3xl" />

      {/* Stepper breadcrumb */}
      <div className="relative mb-5 flex flex-wrap items-center gap-2">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-2 rounded-2xl border px-3 py-2 transition-all ${
                s.done
                  ? "border-emerald-400/40 bg-emerald-500/10"
                  : s.active
                    ? "border-transparent bg-cta-gradient text-white shadow-glow"
                    : "border-border/60 bg-background/40 opacity-60"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                  s.done
                    ? "bg-emerald-500/20 text-emerald-300"
                    : s.active
                      ? "bg-white/20 text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {s.done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : s.locked ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  s.n
                )}
              </span>
              <s.icon className="h-3.5 w-3.5 opacity-80" />
              <div className="leading-tight">
                <div className="text-[9px] font-semibold uppercase tracking-widest opacity-70">
                  {s.label}
                </div>
                <div className="text-[11px] font-semibold truncate max-w-[160px]">
                  {s.value ?? (s.locked ? "Locked" : "Choose…")}
                </div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight
                className={`h-4 w-4 ${s.done ? "text-emerald-400" : "text-muted-foreground/50"}`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 — Level */}
      <div className="relative space-y-2">
        <StepHeader
          n={1}
          icon={Layers}
          title="Choose Level"
          hint="Pick the qualification tier"
          tint="purple"
        />
        <div className="flex flex-wrap gap-2">
          {props.levels.map((lv) => {
            const selected = props.levelCode === lv.code;
            return (
              <button
                key={lv.code}
                onClick={() => props.onLevel(lv.code)}
                className={`group relative overflow-hidden rounded-xl border px-4 py-2.5 text-xs font-semibold transition-all duration-200 active:scale-[0.97] ${
                  selected
                    ? "border-transparent text-white shadow-glow"
                    : "border-border/60 bg-background/40 text-foreground hover:-translate-y-0.5 hover:border-[var(--neon-purple)]/40 hover:bg-muted/40"
                }`}
                style={
                  selected
                    ? {
                        background: lv.color
                          ? `linear-gradient(135deg, ${lv.color}, ${lv.color}99)`
                          : undefined,
                      }
                    : undefined
                }
              >
                {selected && !lv.color && (
                  <span className="absolute inset-0 bg-cta-gradient" aria-hidden />
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  {selected && <Check className="h-3 w-3" />}
                  {lv.name}
                </span>
              </button>
            );
          })}
          {props.levels.length === 0 && (
            <p className="text-xs text-muted-foreground">No levels configured.</p>
          )}
        </div>
      </div>

      {/* Step 2 — Subject */}
      <div
        className={`relative mt-5 space-y-2 transition-opacity ${!activeLevel ? "pointer-events-none opacity-40" : "opacity-100"}`}
      >
        <StepHeader
          n={2}
          icon={GraduationCap}
          title="Choose Subject"
          hint={activeLevel ? `Within ${activeLevel.name}` : "Select a level first"}
          tint="blue"
          action={
            <button
              onClick={props.onAddSubject}
              disabled={!activeLevel}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-[var(--neon-blue)]/60 hover:text-foreground disabled:opacity-40"
            >
              <FolderPlus className="h-3 w-3" /> Add
            </button>
          }
        />
        <div className="flex flex-wrap gap-2">
          {props.subjects.map((s) => {
            const selected = props.subjectId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => props.onSubject(s.id)}
                className={`group relative overflow-hidden rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 active:scale-[0.97] ${
                  selected
                    ? "text-white shadow-glow"
                    : "border border-border/60 bg-background/40 text-foreground hover:-translate-y-0.5 hover:border-[var(--neon-blue)]/40 hover:bg-muted/40"
                }`}
              >
                {selected && (
                  <>
                    <span className="absolute inset-0 bg-cta-gradient" aria-hidden />
                    <span
                      className="absolute inset-0 rounded-xl ring-1 ring-white/30"
                      aria-hidden
                    />
                  </>
                )}
                <span className="relative inline-flex items-center gap-1.5">
                  {selected && <Check className="h-3 w-3" />}
                  {s.name}
                </span>
              </button>
            );
          })}
          {activeLevel && props.subjects.length === 0 && (
            <p className="text-xs text-muted-foreground">No subjects yet — add one to begin.</p>
          )}
        </div>
      </div>

      {/* Step 3 — Chapter (card grid) */}
      <div
        className={`relative mt-5 space-y-3 transition-opacity ${!activeSubject ? "pointer-events-none opacity-40" : "opacity-100"}`}
      >
        <StepHeader
          n={3}
          icon={BookOpen}
          title="Choose Chapter"
          hint={
            activeSubject
              ? `${props.chapters.length} chapter${props.chapters.length === 1 ? "" : "s"} in ${activeSubject.name}`
              : "Select a subject first"
          }
          tint="pink"
          action={
            <button
              onClick={props.onAddChapter}
              disabled={!activeSubject}
              className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border/60 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:border-[var(--neon-pink)]/60 hover:text-foreground disabled:opacity-40"
            >
              <BookPlus className="h-3 w-3" /> Add
            </button>
          }
        />

        {activeSubject && props.chapters.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/60 bg-background/30 p-6 text-center text-xs text-muted-foreground">
            <BookOpen className="mx-auto mb-2 h-5 w-5 opacity-50" />
            No chapters yet. Click <span className="font-semibold text-foreground">Add</span> to
            create one.
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {props.chapters.map((c, idx) => {
              const selected = props.chapterId === c.id;
              const num = (c.sort_order ?? idx) + 1;
              return (
                <button
                  key={c.id}
                  onClick={() => props.onChapter(c.id)}
                  className={`group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-200 active:scale-[0.98] ${
                    selected
                      ? "border-transparent shadow-glow"
                      : "border-border/60 bg-background/40 hover:-translate-y-0.5 hover:border-[var(--neon-pink)]/40 hover:bg-muted/30 hover:shadow-card-soft"
                  }`}
                >
                  {selected && (
                    <>
                      <span className="absolute inset-0 bg-cta-gradient opacity-95" aria-hidden />
                      <span
                        className="absolute inset-0 rounded-2xl ring-1 ring-white/25"
                        aria-hidden
                      />
                      <span
                        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/20 blur-2xl"
                        aria-hidden
                      />
                    </>
                  )}
                  <div className="relative flex items-start justify-between gap-2">
                    <span
                      className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-[10px] font-bold tabular-nums ${
                        selected
                          ? "bg-white/25 text-white"
                          : "bg-muted/60 text-muted-foreground group-hover:bg-[var(--neon-pink)]/15 group-hover:text-[var(--neon-pink)]"
                      }`}
                    >
                      <Hash className="mr-0.5 h-3 w-3" />
                      {String(num).padStart(2, "0")}
                    </span>
                    {selected ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/25 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-muted-foreground/40 transition-colors group-hover:text-[var(--neon-pink)]" />
                    )}
                  </div>
                  <p
                    className={`relative mt-2 line-clamp-2-safe text-[13px] font-semibold leading-snug ${selected ? "text-white" : "text-foreground"}`}
                  >
                    {c.name}
                  </p>
                  <div
                    className={`relative mt-2 flex items-center justify-between text-[10px] ${selected ? "text-white/80" : "text-muted-foreground"}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${c.status === "published" ? "bg-emerald-400" : "bg-amber-400"}`}
                      />
                      {c.status}
                    </span>
                    <span className="font-medium opacity-80">Chapter {num}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function StepHeader({
  n,
  icon: Icon,
  title,
  hint,
  tint,
  action,
}: {
  n: number;
  icon: typeof Layers;
  title: string;
  hint: string;
  tint: "purple" | "blue" | "pink";
  action?: React.ReactNode;
}) {
  const tintCls =
    tint === "purple"
      ? "from-[var(--neon-purple)]/30 to-transparent text-[var(--neon-purple)]"
      : tint === "blue"
        ? "from-[var(--neon-blue)]/30 to-transparent text-[var(--neon-blue)]"
        : "from-[var(--neon-pink)]/30 to-transparent text-[var(--neon-pink)]";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${tintCls}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="leading-tight">
          <h3 className="text-[13px] font-semibold tracking-tight">
            <span className="mr-1.5 text-muted-foreground">Step {n}</span>
            {title}
          </h3>
          <p className="text-[10px] text-muted-foreground">{hint}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function QuickCreateDialog({
  title,
  onClose,
  onSubmit,
}: {
  title: string;
  onClose: () => void;
  onSubmit: (v: { name: string; slug: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const autoSlug = useMemo(
    () =>
      name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    [name],
  );

  return (
    <Modal onClose={onClose} title={title}>
      <div className="space-y-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slug) setSlug("");
            }}
            className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none focus:border-[var(--neon-blue)]/60"
          />
        </Field>
        <Field label="Slug (a-z, 0-9, dashes)">
          <input
            value={slug || autoSlug}
            onChange={(e) => setSlug(e.target.value)}
            className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none focus:border-[var(--neon-blue)]/60"
          />
        </Field>
        {err && <p className="text-xs text-red-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-border bg-background/40 px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            disabled={busy || !name}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                await onSubmit({ name: name.trim(), slug: (slug || autoSlug).trim() });
                onClose();
              } catch (e) {
                setErr(e instanceof Error ? e.message : "Failed to create");
              } finally {
                setBusy(false);
              }
            }}
            className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{" "}
            Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Edit dialog ---------------- */
function EditDialog({
  draft,
  onChange,
  onClose,
  onSave,
  saving,
  error,
}: {
  draft: Draft;
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
  error: Error | null;
}) {
  return (
    <Modal onClose={onClose} title={draft.id ? "Edit MCQ" : "New MCQ"} wide>
      <div className="grid gap-3">
        <Field label="Question Type">
          <select
            value={draft.question_type}
            onChange={(e) => {
              const qt = e.target.value as QuestionType;
              onChange({
                ...draft,
                question_type: qt,
                ...(qt === "true_false"
                  ? {
                      option_a: "True",
                      option_b: "False",
                      option_c: "",
                      option_d: "",
                      correct_option:
                        draft.correct_option === "C" || draft.correct_option === "D"
                          ? "A"
                          : draft.correct_option,
                    }
                  : {}),
              });
            }}
            className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none focus:border-[var(--neon-blue)]/60"
          >
            <option value="mcq">Multiple Choice</option>
            <option value="true_false">True / False</option>
          </select>
        </Field>
        <Field label="Question">
          <textarea
            value={draft.question}
            onChange={(e) => onChange({ ...draft, question: e.target.value })}
            className="w-full rounded-xl border border-border/60 bg-background/40 p-3 text-sm outline-none focus:border-[var(--neon-blue)]/60 min-h-[80px]"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(draft.question_type === "true_false"
            ? (["A", "B"] as const)
            : (["A", "B", "C", "D"] as const)
          ).map((k) => (
            <Field
              key={k}
              label={
                draft.question_type === "true_false"
                  ? k === "A"
                    ? "True"
                    : "False"
                  : `Option ${k}`
              }
            >
              <input
                value={(draft as unknown as Record<string, string>)[`option_${k.toLowerCase()}`]}
                onChange={(e) =>
                  onChange({ ...draft, [`option_${k.toLowerCase()}`]: e.target.value })
                }
                disabled={draft.question_type === "true_false"}
                className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none focus:border-[var(--neon-blue)]/60 disabled:opacity-60"
              />
            </Field>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Correct">
            <select
              value={draft.correct_option}
              onChange={(e) =>
                onChange({ ...draft, correct_option: e.target.value as Draft["correct_option"] })
              }
              className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none focus:border-[var(--neon-blue)]/60"
            >
              {draft.question_type === "true_false" ? (
                <>
                  <option value="A">True</option>
                  <option value="B">False</option>
                </>
              ) : (
                <>
                  <option>A</option>
                  <option>B</option>
                  <option>C</option>
                  <option>D</option>
                </>
              )}
            </select>
          </Field>
          <Field label="Difficulty">
            <select
              value={draft.difficulty}
              onChange={(e) =>
                onChange({ ...draft, difficulty: e.target.value as Draft["difficulty"] })
              }
              className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none focus:border-[var(--neon-blue)]/60"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </Field>
          <Field label="Status">
            <select
              value={draft.status}
              onChange={(e) => onChange({ ...draft, status: e.target.value as Draft["status"] })}
              className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none focus:border-[var(--neon-blue)]/60"
            >
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        </div>
        <Field label="Explanation (optional)">
          <textarea
            value={draft.explanation}
            onChange={(e) => onChange({ ...draft, explanation: e.target.value })}
            className="w-full rounded-xl border border-border/60 bg-background/40 p-3 text-sm outline-none focus:border-[var(--neon-blue)]/60 min-h-[60px]"
          />
        </Field>
        <Field label="Tags (comma separated)">
          <input
            value={draft.tags}
            onChange={(e) => onChange({ ...draft, tags: e.target.value })}
            className="h-10 w-full rounded-xl border border-border/60 bg-background/40 px-3 text-sm outline-none focus:border-[var(--neon-blue)]/60"
          />
        </Field>
        {error && (
          <p className="flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            {error.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-border bg-background/40 px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{" "}
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Bulk import ---------------- */
function BulkImportDialog({
  chapterId,
  existingQuestions,
  onClose,
  onDone,
  run,
}: {
  chapterId: string;
  existingQuestions: Array<{
    question: string;
    option_a?: string | null;
    option_b?: string | null;
    option_c?: string | null;
    option_d?: string | null;
  }>;
  onClose: () => void;
  onDone: () => void;
  run: (opts: {
    data: { chapter_id: string; items: BulkImportItem[] };
  }) => Promise<{ inserted: number; failed?: Array<{ sourceIndex: number; reason: string }> }>;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Live auto-parse as user types/pastes (debounced)
  useEffect(() => {
    if (!text.trim()) {
      setRows([]);
      return;
    }
    const t = setTimeout(() => {
      const parsed = parseMcqText(text, "pasted");
      setRows(dedupe(parsed, existingQuestions));
    }, 200);
    return () => clearTimeout(t);
  }, [text, existingQuestions]);

  const validRows = rows.filter((r) => !r.error && !r.duplicate);
  const invalidCount = rows.filter((r) => r.error).length;
  const dupCount = rows.filter((r) => r.duplicate).length;

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setBusy(true);
    setMsg(null);
    setProgress(3);
    try {
      const parsed: ParsedImportRow[] = [];
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const sourceText = await extractFileText(file);
        const uploadedPath = `${chapterId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
        await supabase.storage
          .from("mcq-imports")
          .upload(uploadedPath, file, { upsert: false })
          .catch(() => null);
        parsed.push(...parseMcqText(sourceText, file.name));
        setProgress(Math.round(((i + 1) / list.length) * 100));
      }
      setRows(dedupe(parsed, existingQuestions));
      toast.success(
        `Parsed ${parsed.length} MCQs from ${list.length} file${list.length > 1 ? "s" : ""}`,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not parse upload";
      setMsg({ kind: "err", text: message });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function go() {
    if (!validRows.length) {
      toast.error("Nothing valid to import");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const items: BulkImportItem[] = validRows.map(
        ({ source: _s, duplicate: _d, error: _e, ...item }) => item,
      );
      const res = await run({ data: { chapter_id: chapterId, items } });
      const failed = [
        ...rows
          .filter((r) => r.error || r.duplicate)
          .map((r) => ({
            sourceIndex: r.sourceIndex,
            reason: r.error ?? (r.duplicate ? "Duplicate Question" : "Failed"),
          })),
        ...(res.failed ?? []),
      ].sort((a, b) => (a.sourceIndex ?? 0) - (b.sourceIndex ?? 0));
      const failedReport = failed.map((r) => `#${r.sourceIndex ?? "?"} — ${r.reason}`).join("\n");
      const summary =
        `Total Questions: ${rows.length}\n` +
        `Imported Successfully: ${res.inserted}\n` +
        `Failed: ${failed.length}` +
        (failed.length ? `\n\nFailed Questions:\n${failedReport}` : "");
      setMsg({ kind: "ok", text: summary });
      toast.success(`Imported ${res.inserted} MCQs · ${failed.length} skipped`);
      if (!failed.length) setTimeout(onDone, 600);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Import failed";
      setMsg({ kind: "err", text: message });
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Bulk import MCQs" wide>
      <p className="text-xs text-muted-foreground">
        Paste MCQs in any common format, or drop PDF/DOCX/DOC/TXT files. We auto-detect question,
        options (A–D or a–d), answer (Answer/Ans/Correct) and explanation.
      </p>
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
        className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[var(--neon-blue)]/40 bg-background/30 p-5 text-center transition-colors hover:border-[var(--neon-purple)]/60"
      >
        <Upload className="h-5 w-5 text-[var(--neon-blue)]" />
        <span className="mt-1 text-sm font-semibold">Drop files or click to choose</span>
        <span className="text-[11px] text-muted-foreground">PDF · DOCX · DOC · TXT</span>
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,text/plain,application/pdf"
          className="sr-only"
          onChange={(e) => e.target.files && void handleFiles(e.target.files)}
        />
      </label>
      {progress > 0 && progress < 100 && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted/40">
          <div
            className="h-full rounded-full bg-cta-gradient transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Paste MCQs here (auto-parses as you type)</span>
          {rows.length > 0 && (
            <span>
              <span className="text-emerald-400">{validRows.length} valid</span>
              {invalidCount > 0 && (
                <>
                  {" "}
                  · <span className="text-red-400">{invalidCount} invalid</span>
                </>
              )}
              {dupCount > 0 && (
                <>
                  {" "}
                  · <span className="text-amber-400">{dupCount} duplicate</span>
                </>
              )}
            </span>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={SAMPLE_TEXT}
          className="w-full rounded-xl border border-border/60 bg-background/40 p-3 font-mono text-xs outline-none focus:border-[var(--neon-blue)]/60 min-h-[200px]"
        />
      </div>

      {rows.length > 0 && (
        <div className="mt-3 max-h-56 overflow-auto rounded-2xl border border-border/60 bg-background/30">
          {rows.map((row, i) => (
            <div
              key={`${row.source}-${i}`}
              className={`border-b border-border/40 p-3 text-xs last:border-b-0 ${row.error ? "bg-destructive/10" : row.duplicate ? "bg-amber-500/10" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="line-clamp-2 font-medium">{row.question || "Untitled question"}</p>
                <span
                  className={
                    row.error
                      ? "text-destructive"
                      : row.duplicate
                        ? "text-amber-400"
                        : "text-emerald-400"
                  }
                >
                  {row.error ?? (row.duplicate ? "Duplicate" : "Valid")}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                A: {row.option_a?.slice(0, 30)} · B: {row.option_b?.slice(0, 30)} · C:{" "}
                {row.option_c?.slice(0, 30)} · D: {row.option_d?.slice(0, 30)} · Ans{" "}
                <b>{row.correct_option}</b>
              </p>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <pre
          className={`mt-3 whitespace-pre-wrap break-words rounded-lg border border-border/40 bg-background/40 p-3 text-xs ${msg.kind === "ok" ? "text-emerald-300" : "text-red-300"}`}
        >
          {msg.text}
        </pre>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded-xl border border-border bg-background/40 px-4 py-2 text-sm"
        >
          Cancel
        </button>
        <button
          onClick={go}
          disabled={busy || validRows.length === 0}
          className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-glow disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{" "}
          Import {validRows.length || ""}
        </button>
      </div>
    </Modal>
  );
}

let pdfjsWorkerConfigured = false;
async function extractFileText(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "txt" || file.type.startsWith("text/")) return file.text();
  if (ext === "pdf" || file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    if (!pdfjsWorkerConfigured) {
      const { default: workerUrl } = await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      pdfjsWorkerConfigured = true;
    }
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const content = await page.getTextContent();
        return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      }),
    );
    return pages.join("\n\n");
  }
  if (ext === "doc" || ext === "docx" || file.name.toLowerCase().endsWith(".docx")) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return result.value;
  }
  throw new Error(`Unsupported file format: ${file.name}`);
}

function parseMcqText(raw: string, source: string): ParsedImportRow[] {
  const parsed = parseSharedMcqText(raw);
  return [
    ...parsed.cards.map((row) => ({
      source,
      sourceIndex: row.sourceIndex,
      question: row.question,
      question_type: row.question_type,
      option_a: row.option_a,
      option_b: row.option_b,
      option_c: row.question_type === "true_false" ? null : row.option_c,
      option_d: row.question_type === "true_false" ? null : row.option_d,
      correct_option: row.correct_option,
      explanation: row.explanation || null,
      // Honor the parser's optional Difficulty. Fall back to the existing
      // default only when none was supplied — never override an explicit value.
      difficulty: (row.difficulty ?? "medium") as "easy" | "medium" | "hard",
      status: "published" as const,
      tags: [],
    })),
    ...parsed.invalidBlocks.map((block) => ({
      source,
      sourceIndex: block.sourceIndex,
      question: block.raw,
      question_type: "mcq" as const,
      option_a: "",
      option_b: "",
      option_c: null,
      option_d: null,
      correct_option: "A" as const,
      explanation: null,
      difficulty: "medium" as const,
      status: "published" as const,
      tags: [],
      error: block.reason,
    })),
  ];
}

type DedupeMcqShape = {
  question: string;
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
};

function dedupe(parsed: ParsedImportRow[], existing: DedupeMcqShape[]): ParsedImportRow[] {
  const seen = new Set(existing.map((e) => fingerprintSharedQuestion(e)).filter(Boolean));
  return parsed.map((row) => {
    const key = fingerprintSharedQuestion(row);
    const duplicate = !!key && seen.has(key);
    if (!duplicate && key) seen.add(key);
    return { ...row, duplicate, error: row.error ?? validateImportRow(row) };
  });
}

function validateImportRow(row: BulkImportItem) {
  if (row.question.trim().length < 3) return "Question missing";
  if (row.question_type === "true_false") {
    if (!["A", "B"].includes(row.correct_option)) return "T/F answer must be A or B";
    return undefined;
  }
  if (!row.option_a || !row.option_b || !row.option_c || !row.option_d)
    return "All 4 options required";
  if (!["A", "B", "C", "D"].includes(row.correct_option)) return "Correct answer must be A-D";
  return undefined;
}

const SAMPLE_TEXT = `1. What is HTML?
A. Programming Language
B. Markup Language
C. Database
D. Operating System
Answer: B
Explanation: HTML is a markup language used to build web pages.

2. What is CSS?
a) Database
b) Styling Language
c) Server
d) Browser
Ans: b
Explanation: CSS is used for styling.`;

/* ---------------- Atoms ---------------- */
function Modal({
  children,
  onClose,
  title,
  wide,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-md">
      <div
        className={`glass shadow-glow animate-fade-up relative flex max-h-[90vh] w-full flex-col ${wide ? "max-w-2xl" : "max-w-md"} rounded-3xl`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/40 px-6 pt-6 pb-3">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background/40 transition-colors ${danger ? "hover:bg-red-500/10 hover:text-red-400" : "hover:bg-muted"}`}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: Mcq["status"] }) {
  const map: Record<Mcq["status"], string> = {
    published: "bg-emerald-500/15 text-emerald-400 border-emerald-400/40",
    draft: "bg-amber-500/15 text-amber-400 border-amber-400/40",
    archived: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${map[status]}`}
    >
      {status}
    </span>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <div className="p-10 text-center text-sm text-muted-foreground">{text}</div>;
}

// ---------- Premium dashboard UI ----------
function PremiumHeader(props: {
  crumbs: { label: string }[];
  search: string;
  onSearch: (v: string) => void;
  onNewMcq: () => void;
  onBulkImport: () => void;
  onAddChapter: () => void;
  onAddSubject: () => void;
  canCreate: boolean;
  canAddChapter: boolean;
}) {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const { unread: unreadCount } = useMyNotifications();
  return (
    <div className="glass shadow-card-soft flex flex-col gap-3 rounded-2xl p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          to="/admin"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
          title="Admin home"
        >
          <Home className="h-4 w-4" />
        </Link>
        <nav className="flex min-w-0 items-center gap-1 overflow-hidden text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">MCQ Manager</span>
          {props.crumbs
            .filter((c) => c.label)
            .map((c, i) => (
              <span key={i} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3 w-3 shrink-0 opacity-50" />
                <span className="truncate">{c.label}</span>
              </span>
            ))}
        </nav>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder="Search MCQs…"
            className="h-8 w-full rounded-lg border border-border/60 bg-background/40 pl-8 pr-2 text-xs outline-none focus:border-[var(--neon-purple)]/50 sm:w-56"
          />
        </div>
        <IconBtn title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </IconBtn>
        <div className="relative">
          <IconBtn title="Notifications" onClick={() => {}}>
            <Bell className="h-4 w-4" />
          </IconBtn>
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--neon-pink)] px-1 text-[9px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
        <button
          onClick={props.onAddSubject}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-2.5 text-xs font-medium hover:bg-muted"
        >
          <FolderPlus className="h-3.5 w-3.5" /> Subject
        </button>
        <button
          onClick={props.onAddChapter}
          disabled={!props.canAddChapter}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
        >
          <BookPlus className="h-3.5 w-3.5" /> Chapter
        </button>
        <button
          onClick={props.onBulkImport}
          disabled={!props.canCreate}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-2.5 text-xs font-medium hover:bg-muted disabled:opacity-40"
        >
          <Upload className="h-3.5 w-3.5" /> Import
        </button>
        <button
          onClick={props.onNewMcq}
          disabled={!props.canCreate}
          className="relative inline-flex h-8 items-center gap-1.5 overflow-hidden rounded-lg px-3 text-xs font-semibold text-white shadow-glow disabled:opacity-40"
        >
          <span className="absolute inset-0 bg-cta-gradient" aria-hidden />
          <span className="relative inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New MCQ
          </span>
        </button>
      </div>
    </div>
  );
}

function AnalyticsCards({ stats, loading }: { stats?: McqDashboardStats; loading: boolean }) {
  const cards: { label: string; value: number; icon: typeof FileQuestion; tint: string }[] = [
    {
      label: "Total MCQs",
      value: stats?.totalMcqs ?? 0,
      icon: FileQuestion,
      tint: "text-[var(--neon-purple)]",
    },
    {
      label: "Published",
      value: stats?.publishedMcqs ?? 0,
      icon: CheckCircle2,
      tint: "text-emerald-400",
    },
    { label: "Drafts", value: stats?.draftMcqs ?? 0, icon: EyeOff, tint: "text-amber-400" },
    {
      label: "Chapters",
      value: stats?.totalChapters ?? 0,
      icon: BookOpen,
      tint: "text-[var(--neon-pink)]",
    },
    {
      label: "Subjects",
      value: stats?.totalSubjects ?? 0,
      icon: FolderTree,
      tint: "text-[var(--neon-blue)]",
    },
    {
      label: "Quizzes",
      value: stats?.totalQuizzes ?? 0,
      icon: ClipboardList,
      tint: "text-cyan-400",
    },
    {
      label: "Mock Tests",
      value: stats?.totalMocks ?? 0,
      icon: FileStack,
      tint: "text-orange-400",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map((c) => (
        <div
          key={c.label}
          className="glass shadow-card-soft relative overflow-hidden rounded-2xl p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {c.label}
            </span>
            <c.icon className={`h-4 w-4 ${c.tint}`} />
          </div>
          <p className="mt-1.5 text-2xl font-bold tabular-nums tracking-tight">
            {loading ? (
              <span className="inline-block h-6 w-10 animate-pulse rounded bg-muted" />
            ) : (
              c.value.toLocaleString()
            )}
          </p>
        </div>
      ))}
    </div>
  );
}

function RecentActivityPanel({
  activity,
  loading,
}: {
  activity: McqDashboardStats["recentActivity"];
  loading: boolean;
}) {
  const iconFor: Record<string, typeof FileQuestion> = {
    mcq: FileQuestion,
    quiz: ClipboardList,
    mock: FileStack,
    chapter: BookOpen,
    subject: FolderTree,
  };
  if (!loading && activity.length === 0) return null;
  return (
    <div className="glass shadow-card-soft rounded-2xl p-3 sm:p-4">
      <div className="mb-2 flex items-center gap-2">
        <Activity className="h-4 w-4 text-[var(--neon-purple)]" />
        <h3 className="text-[13px] font-semibold tracking-tight">Recent activity</h3>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {activity.slice(0, 8).map((a) => {
            const Icon = iconFor[a.kind] ?? Activity;
            return (
              <li
                key={`${a.kind}-${a.id}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5 text-[11px]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-foreground" title={a.title}>
                  {a.title}
                </span>
                {a.status && <StatusDot status={a.status} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "published"
      ? "bg-emerald-400"
      : status === "draft"
        ? "bg-amber-400"
        : "bg-muted-foreground";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} title={status} />;
}

function MoveDialog({
  subjects,
  count,
  pending,
  onClose,
  onMove,
}: {
  subjects: NamedRow[];
  count: number;
  pending: boolean;
  onClose: () => void;
  onMove: (targetChapterId: string) => void;
}) {
  const listChaptersFn = useServerFn(adminListChapters);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const chaptersQ = useQuery({
    queryKey: ["admin-chapters", subjectId],
    queryFn: () => listChaptersFn({ data: { subjectId: subjectId! } }),
    enabled: !!subjectId,
  });
  return (
    <Modal onClose={onClose} title={`Move ${count} MCQ${count === 1 ? "" : "s"}`}>
      <div className="space-y-3 text-sm">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Target subject</label>
          <select
            value={subjectId ?? ""}
            onChange={(e) => {
              setSubjectId(e.target.value || null);
              setChapterId(null);
            }}
            className="h-9 w-full rounded-lg border border-border bg-background/40 px-2 text-sm outline-none focus:border-[var(--neon-purple)]/50"
          >
            <option value="">Select subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Target chapter</label>
          <select
            value={chapterId ?? ""}
            onChange={(e) => setChapterId(e.target.value || null)}
            disabled={!subjectId || chaptersQ.isLoading}
            className="h-9 w-full rounded-lg border border-border bg-background/40 px-2 text-sm outline-none focus:border-[var(--neon-purple)]/50 disabled:opacity-40"
          >
            <option value="">{chaptersQ.isLoading ? "Loading…" : "Select chapter…"}</option>
            {(chaptersQ.data ?? []).map((c: { id: string; name: string }) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => chapterId && onMove(chapterId)}
            disabled={!chapterId || pending}
            className="relative inline-flex h-9 items-center gap-1.5 overflow-hidden rounded-lg px-3 text-xs font-semibold text-white shadow-glow disabled:opacity-40"
          >
            <span className="absolute inset-0 bg-cta-gradient" aria-hidden />
            <span className="relative inline-flex items-center gap-1.5">
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MoveRight className="h-3.5 w-3.5" />
              )}
              Move here
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ================== Premium dashboard components (new) ================== */

function PremiumHero(props: {
  crumbs: { label: string; href?: string }[];
  title: string;
  subtitle: string;
  canCreate: boolean;
  onNewMcq: () => void;
  onBulkImport: () => void;
  onRefresh: () => void;
  lastSyncAt: string | null;
}) {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const { unread: unreadCount } = useMyNotifications();
  const lastSyncLabel = useLastSync(props.lastSyncAt);
  return (
    <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5 sm:p-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-[var(--neon-purple)]/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-32 bottom-0 h-56 w-56 rounded-full bg-[var(--neon-blue)]/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <nav className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
            {props.crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 opacity-50" />}
                {c.href ? (
                  <Link to={c.href as never} className="text-[var(--neon-blue)] hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{c.label}</span>
                )}
              </span>
            ))}
            <ChevronDown className="ml-0.5 h-3 w-3 opacity-50" />
          </nav>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            MCQ Management <span className="text-gradient">Console</span>
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            {props.subtitle} <Zap className="ml-1 inline h-3.5 w-3.5 text-amber-400" />
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Light mode" : "Dark mode"}
              className="hidden h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/40 hover:bg-muted/50 sm:flex"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              to="/admin"
              className="relative hidden h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/40 hover:bg-muted/50 sm:flex"
              title="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--neon-pink)] px-1 text-[9px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <button
              onClick={props.onBulkImport}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 text-sm font-semibold hover:bg-muted/50"
            >
              <Cloud className="h-4 w-4" /> Bulk Import
            </button>
            <button
              onClick={props.onNewMcq}
              disabled={!props.canCreate}
              className="relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
            >
              <span className="absolute inset-0 bg-cta-gradient" aria-hidden />
              <span className="relative inline-flex items-center gap-2">
                <Plus className="h-4 w-4" /> New MCQ
              </span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Last sync: {lastSyncLabel}
            <button
              onClick={props.onRefresh}
              title="Refresh"
              aria-label="Refresh"
              className="ml-1 flex h-6 w-6 items-center justify-center rounded-md border border-border/60 bg-background/40 hover:bg-muted/50"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function useLastSync(iso: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!iso) return "—";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const date = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return `${date} · ${time}`;
}

function KpiRow({ stats, loading }: { stats?: McqDashboardStats; loading: boolean }) {
  const cards: {
    label: string;
    value: number | string;
    delta: number | null;
    deltaLabel: string;
    icon: typeof BookOpen;
    tint: "purple" | "emerald" | "amber" | "blue" | "pink";
    trend: number[];
  }[] = [
    {
      label: "Total MCQs",
      value: stats?.totalMcqs ?? 0,
      delta: null,
      deltaLabel: "This month",
      icon: BookOpen,
      tint: "purple",
      trend: stats?.totalsTrend30d ?? [],
    },
    {
      label: "Published MCQs",
      value: stats?.publishedMcqs ?? 0,
      delta: null,
      deltaLabel: "This month",
      icon: CheckCircle2,
      tint: "emerald",
      trend: stats?.publishedTrend30d ?? [],
    },
    {
      label: "Questions Today",
      value: stats?.questionsToday ?? 0,
      delta: stats?.questionsTodayDelta ?? null,
      deltaLabel: "Today",
      icon: HelpCircle,
      tint: "amber",
      trend: stats?.totalsTrend30d ?? [],
    },
    {
      label: "Avg. Difficulty",
      value: stats?.avgDifficultyLabel ?? "—",
      delta: null,
      deltaLabel: "This month",
      icon: Target,
      tint: "blue",
      trend: stats?.difficultyTrend30d ?? [],
    },
    {
      label: "Attempted (30d)",
      value: stats?.attempted30d ?? 0,
      delta: stats?.attempted30dDelta ?? null,
      deltaLabel: "Last 30 days",
      icon: BarChart3,
      tint: "pink",
      trend: stats?.attemptedTrend30d ?? [],
    },
  ];
  return (
    <div className="grid gap-3 xl:grid-cols-7">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:col-span-5">
        {cards.map((c) => (
          <KpiCard key={c.label} {...c} loading={loading} />
        ))}
      </div>
      <PerformanceOverviewCard stats={stats} loading={loading} className="xl:col-span-2" />
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  deltaLabel,
  icon: Icon,
  tint,
  trend,
  loading,
}: {
  label: string;
  value: number | string;
  delta: number | null;
  deltaLabel: string;
  icon: typeof BookOpen;
  tint: "purple" | "emerald" | "amber" | "blue" | "pink";
  trend: number[];
  loading: boolean;
}) {
  const tintMap: Record<string, { bg: string; text: string; ring: string; stroke: string }> = {
    purple: {
      bg: "bg-[var(--neon-purple)]/10",
      text: "text-[var(--neon-purple)]",
      ring: "ring-[var(--neon-purple)]/20",
      stroke: "var(--neon-purple)",
    },
    emerald: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-500 dark:text-emerald-400",
      ring: "ring-emerald-400/20",
      stroke: "#10b981",
    },
    amber: {
      bg: "bg-amber-500/10",
      text: "text-amber-500 dark:text-amber-400",
      ring: "ring-amber-400/20",
      stroke: "#f59e0b",
    },
    blue: {
      bg: "bg-[var(--neon-blue)]/10",
      text: "text-[var(--neon-blue)]",
      ring: "ring-[var(--neon-blue)]/20",
      stroke: "var(--neon-blue)",
    },
    pink: {
      bg: "bg-[var(--neon-pink)]/10",
      text: "text-[var(--neon-pink)]",
      ring: "ring-[var(--neon-pink)]/20",
      stroke: "var(--neon-pink)",
    },
  };
  const t = tintMap[tint];
  return (
    <div className="glass shadow-card-soft relative overflow-hidden rounded-2xl p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${t.bg} ${t.ring}`}
        >
          <Icon className={`h-4 w-4 ${t.text}`} />
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        {loading ? (
          <span className="inline-block h-7 w-16 animate-pulse rounded bg-muted" />
        ) : (
          <span className="font-display text-2xl font-bold tabular-nums tracking-tight">
            {typeof value === "number" ? value.toLocaleString() : value}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
        {delta != null && delta !== 0 ? (
          <span className={delta > 0 ? "text-emerald-500" : "text-rose-500"}>
            {delta > 0 ? "↑" : "↓"} {Math.abs(delta).toLocaleString()}
          </span>
        ) : delta === 0 ? (
          <span>— 0.0%</span>
        ) : (
          <span />
        )}
        <span>{deltaLabel}</span>
      </div>
      <Sparkline values={trend} stroke={t.stroke} />
    </div>
  );
}

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  if (!values || values.length === 0) {
    return <div className="mt-2 h-10 rounded-md bg-muted/20" />;
  }
  const w = 100,
    h = 28;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(2)},${(h - (v / max) * h).toFixed(2)}`);
  const path = `M ${pts.join(" L ")}`;
  const areaPath = `${path} L ${w},${h} L 0,${h} Z`;
  const id = `spk-${stroke.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-2 h-10 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${id})`} />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PerformanceOverviewCard({
  stats,
  loading,
  className,
}: {
  stats?: McqDashboardStats;
  loading: boolean;
  className?: string;
}) {
  const sb = stats?.statusBreakdown ?? { published: 0, draft: 0, archived: 0, review: 0 };
  const total = sb.published + sb.draft + sb.archived + sb.review;
  const segs = [
    { label: "Published", value: sb.published, color: "#10b981" },
    { label: "Draft", value: sb.draft, color: "#f59e0b" },
    { label: "Archived", value: sb.archived, color: "#94a3b8" },
    { label: "Review", value: sb.review, color: "#3b82f6" },
  ];
  return (
    <div
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#3b1e8e] via-[#2a1769] to-[#1a0f44] p-4 text-white shadow-glow ${className ?? ""}`}
    >
      <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-[var(--neon-purple)]/40 blur-3xl" />
      <div className="relative flex items-center justify-between">
        <h3 className="text-sm font-semibold">Performance Overview</h3>
        <span className="inline-flex items-center gap-1 text-[11px] text-white/70">
          This Month <ChevronDown className="h-3 w-3" />
        </span>
      </div>
      <div className="relative mt-3 flex items-center gap-4">
        <Donut
          segments={segs}
          totalLabel={loading ? "…" : (stats?.totalMcqs ?? 0).toLocaleString()}
          totalSub="Total MCQs"
        />
        <ul className="flex-1 space-y-1.5 text-[11px]">
          {segs.map((s) => {
            const pct = total > 0 ? (s.value / total) * 100 : 0;
            return (
              <li key={s.label} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-white/85">{s.label}</span>
                </span>
                <span className="font-semibold tabular-nums">{pct.toFixed(1)}%</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Donut({
  segments,
  totalLabel,
  totalSub,
}: {
  segments: { label: string; value: number; color: string }[];
  totalLabel: string;
  totalSub: string;
}) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  const size = 120,
    stroke = 16,
    r = (size - stroke) / 2,
    c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          fill="none"
        />
        {total > 0 &&
          segments.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={s.color}
                strokeWidth={stroke}
                fill="none"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc}
                strokeLinecap="butt"
              />
            );
            acc += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-display text-xl font-bold leading-none">{totalLabel}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-white/60">{totalSub}</span>
      </div>
    </div>
  );
}

function AcademicSelectionRows(props: {
  levels: LevelLite[];
  subjects: NamedRow[];
  chapters: NamedRow[];
  levelCode: string | null;
  subjectId: string | null;
  chapterId: string | null;
  onLevel: (code: string) => void;
  onSubject: (id: string) => void;
  onChapter: (id: string) => void;
  onAddSubject: () => void;
  onAddChapter: () => void;
}) {
  return (
    <div className="glass shadow-card-soft space-y-3 rounded-2xl p-4">
      <SelectionRow
        label="LEVEL"
        items={props.levels.map((l) => ({ id: l.code, name: l.name }))}
        activeId={props.levelCode}
        onSelect={(id) => props.onLevel(id)}
        emptyText="No levels configured"
      />
      <SelectionRow
        label="SUBJECT"
        items={props.subjects.map((s) => ({ id: s.id, name: s.name }))}
        activeId={props.subjectId}
        onSelect={(id) => props.onSubject(id)}
        onAdd={props.onAddSubject}
        addLabel="New"
        emptyText="Pick a level first"
      />
      <SelectionRow
        label="CHAPTER"
        items={props.chapters.map((c, i) => ({ id: c.id, name: `Ch ${i + 1}: ${c.name}` }))}
        activeId={props.chapterId}
        onSelect={(id) => props.onChapter(id)}
        onAdd={props.onAddChapter}
        addLabel="Add"
        emptyText={props.subjectId ? "No chapters yet" : "Pick a subject first"}
        scroll
      />
    </div>
  );
}

function SelectionRow({
  label,
  items,
  activeId,
  onSelect,
  onAdd,
  addLabel,
  emptyText,
  scroll,
}: {
  label: string;
  items: { id: string; name: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  emptyText: string;
  scroll?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <div
        className={`flex flex-1 items-center gap-2 ${scroll ? "overflow-x-auto" : "flex-wrap"} `}
      >
        {items.length === 0 ? (
          <span className="text-xs text-muted-foreground">{emptyText}</span>
        ) : (
          items.map((it) => {
            const selected = activeId === it.id;
            return (
              <button
                key={it.id}
                onClick={() => onSelect(it.id)}
                className={`relative inline-flex h-8 shrink-0 items-center gap-1.5 overflow-hidden rounded-lg px-3 text-xs font-semibold transition-all ${
                  selected
                    ? "text-white shadow-glow"
                    : "border border-border/60 bg-background/40 hover:bg-muted/40"
                }`}
              >
                {selected && <span className="absolute inset-0 bg-cta-gradient" aria-hidden />}
                <span className="relative inline-flex items-center gap-1">
                  {it.name}
                  {selected && <ChevronDown className="h-3 w-3 opacity-80" />}
                </span>
              </button>
            );
          })
        )}
        {onAdd && (
          <button
            onClick={onAdd}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-dashed border-border/60 px-2.5 text-[11px] font-medium text-muted-foreground hover:border-[var(--neon-purple)]/60 hover:text-foreground"
          >
            <Plus className="h-3 w-3" /> {addLabel ?? "Add"}
          </button>
        )}
      </div>
    </div>
  );
}

function SelectPill({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 appearance-none rounded-xl border border-border/60 bg-background/40 pl-3 pr-8 text-xs font-medium outline-none focus:border-[var(--neon-purple)]/50"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function MoreActionsMenu({
  disabled,
  onMove,
  onArchive,
  onDeleteAll,
  canDeleteAll,
}: {
  disabled: boolean;
  onMove: () => void;
  onArchive: () => void;
  onDeleteAll: () => void;
  canDeleteAll: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled && !canDeleteAll}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-xs font-semibold hover:bg-muted/50 disabled:opacity-40"
      >
        More Actions <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <button onClick={() => setOpen(false)} className="fixed inset-0 z-40" aria-hidden />
          <div className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-border/60 bg-background/95 shadow-xl backdrop-blur">
            <button
              onClick={() => {
                setOpen(false);
                onMove();
              }}
              disabled={disabled}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50 disabled:opacity-40"
            >
              <MoveRight className="h-3.5 w-3.5" /> Move to chapter
            </button>
            <button
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
              disabled={disabled}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50 disabled:opacity-40"
            >
              <EyeOff className="h-3.5 w-3.5" /> Set to Draft
            </button>
            <div className="my-1 border-t border-border/60" />
            <button
              onClick={() => {
                setOpen(false);
                onDeleteAll();
              }}
              disabled={!canDeleteAll}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-500 hover:bg-red-500/10 disabled:opacity-40"
            >
              <AlertCircle className="h-3.5 w-3.5" /> Delete all in scope
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DifficultyBadge({ difficulty }: { difficulty: "easy" | "medium" | "hard" }) {
  const map: Record<string, string> = {
    easy: "bg-emerald-500/10 text-emerald-500 border-emerald-400/40",
    medium: "bg-amber-500/10 text-amber-500 border-amber-400/40",
    hard: "bg-rose-500/10 text-rose-500 border-rose-400/40",
  };
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${map[difficulty]}`}
    >
      {difficulty}
    </span>
  );
}

function EmptyTable({
  chapterId,
  onCreate,
  onImport,
  onRefresh,
}: {
  chapterId: string | null;
  onCreate: () => void;
  onImport: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--neon-purple)]/20 to-[var(--neon-blue)]/20">
        <FileQuestion className="h-8 w-8 text-[var(--neon-purple)]" />
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold">
          {chapterId ? "No MCQs in this chapter" : "No chapter selected"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {chapterId
            ? "Create your first MCQ or bulk import from PDF, DOCX, or pasted text."
            : "Pick a level, subject and chapter to view MCQs."}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={onCreate}
          disabled={!chapterId}
          className="relative inline-flex h-9 items-center gap-2 overflow-hidden rounded-xl px-4 text-sm font-semibold text-white shadow-glow disabled:opacity-40"
        >
          <span className="absolute inset-0 bg-cta-gradient" aria-hidden />
          <span className="relative inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Create MCQ
          </span>
        </button>
        <button
          onClick={onImport}
          disabled={!chapterId}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 text-sm font-semibold hover:bg-muted/50 disabled:opacity-40"
        >
          <Upload className="h-4 w-4" /> Bulk Import
        </button>
        <button
          onClick={onRefresh}
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 text-sm font-semibold hover:bg-muted/50"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>
    </div>
  );
}

function Pagination({
  total,
  page,
  pageSize,
  onPage,
  onPageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const pages: (number | "…")[] = [];
  const push = (p: number) => {
    if (!pages.includes(p)) pages.push(p);
  };
  push(1);
  push(2);
  push(3);
  if (page > 4) pages.push("…");
  for (let p = Math.max(4, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) push(p);
  if (page < totalPages - 2) pages.push("…");
  if (totalPages > 1) push(totalPages);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3 text-xs text-muted-foreground">
      <span>
        Showing {from.toLocaleString()} to {to.toLocaleString()} of {total.toLocaleString()} results
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page === 1}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/40 hover:bg-muted/50 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} className="px-2">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold ${p === page ? "bg-cta-gradient text-white shadow-glow" : "border border-border/60 bg-background/40 hover:bg-muted/50"}`}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPage(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-background/40 hover:bg-muted/50 disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span>Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-8 rounded-lg border border-border/60 bg-background/40 px-2 text-xs"
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
