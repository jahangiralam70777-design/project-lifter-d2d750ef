import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronRight,
  FolderTree,
  Layers,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  BookOpen,
  GraduationCap,
  ListChecks,
  Eye,
  EyeOff,
  Loader2,
  X,
  Activity,
  Upload,
  Zap,
  Clock,
  Users,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAppStore } from "@/stores/app-store";
import {
  adminAcademicAnalytics,
  adminCreateChapter,
  adminCreateLevel,
  adminCreateSubject,
  adminDeleteChapter,
  adminDeleteLevel,
  adminDeleteSubject,
  adminGetAcademicTree,
  adminUpdateChapter,
  adminUpdateLevel,
  adminUpdateSubject,
} from "@/lib/admin-academic.functions";
import { adminListMcqs, adminDeleteMcq, adminSetMcqStatus } from "@/lib/admin-mcq.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Moon, Sun, Bell, FileQuestion, FileStack } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { confirmDialog } from "@/components/ui/confirm-imperative";

type Level = {
  code: string;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  status: "draft" | "published" | "archived";
};
type Subject = {
  id: string;
  name: string;
  slug: string;
  level: string | null;
  description: string | null;
  color: string | null;
  icon: string | null;
  sort_order: number;
  status: "draft" | "published" | "archived";
};
type Chapter = {
  id: string;
  name: string;
  slug: string;
  subject_id: string;
  description: string | null;
  sort_order: number;
  status: "draft" | "published" | "archived";
};

type CountMaps = {
  mcqByChapter: Record<string, number>;
  quizByChapter: Record<string, number>;
  mockByChapter: Record<string, number>;
  quizBySubject: Record<string, number>;
  mockBySubject: Record<string, number>;
};

type OverviewStats = {
  subjects: number;
  chapters: number;
  mcqs: number;
  quizzes: number;
  mocks: number;
  notes: number;
  flashCards: number;
  totalContent: number;
};

const EMPTY_COUNTS: CountMaps = {
  mcqByChapter: {},
  quizByChapter: {},
  mockByChapter: {},
  quizBySubject: {},
  mockBySubject: {},
};

const EMPTY_OVERVIEW: OverviewStats = {
  subjects: 0,
  chapters: 0,
  mcqs: 0,
  quizzes: 0,
  mocks: 0,
  notes: 0,
  flashCards: 0,
  totalContent: 0,
};

type DialogState =
  | { kind: "none" }
  | { kind: "level"; mode: "create" | "edit"; data?: Level }
  | { kind: "subject"; mode: "create" | "edit"; levelCode?: string; data?: Subject }
  | { kind: "chapter"; mode: "create" | "edit"; subjectId?: string; data?: Chapter };

export function AcademicStructureManager() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchTree = useServerFn(adminGetAcademicTree);

  const tree = useQuery({
    queryKey: ["admin-academic-tree"],
    queryFn: () => fetchTree(),
  });

  const [search, setSearch] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "published" | "draft" | "most_viewed" | "most_attempted" | "recent"
  >("all");
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [mcqChapter, setMcqChapter] = useState<Chapter | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(30);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const fetchAnalytics = useServerFn(adminAcademicAnalytics);
  const analytics = useQuery({
    queryKey: ["admin-academic-analytics", rangeDays],
    queryFn: () => fetchAnalytics({ data: { rangeDays } }),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Realtime: refresh tree on any related change
  useEffect(() => {
    const ch = supabase
      .channel(`admin-academic-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "levels" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-academic-tree"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "subjects" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-academic-tree"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "chapters" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-academic-tree"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "mcqs" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-academic-tree"] });
        qc.invalidateQueries({ queryKey: ["admin-academic-analytics"] });
        qc.invalidateQueries({ queryKey: ["academic-chapter-mcqs"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "quizzes" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-academic-tree"] });
        qc.invalidateQueries({ queryKey: ["admin-academic-analytics"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "short_notes" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-academic-analytics"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_cards" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-academic-analytics"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "activity_events" }, () =>
        qc.invalidateQueries({ queryKey: ["admin-academic-analytics"] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [qc]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-academic-tree"] });
    qc.invalidateQueries({ queryKey: ["admin-academic-analytics"] });
  };

  const levels: Level[] = (tree.data?.levels ?? []) as Level[];
  const subjects: Subject[] = (tree.data?.subjects ?? []) as Subject[];
  const chapters: Chapter[] = (tree.data?.chapters ?? []) as Chapter[];
  const counts: CountMaps = tree.data?.counts ?? EMPTY_COUNTS;
  const overview: OverviewStats = tree.data?.overview ?? EMPTY_OVERVIEW;
  const validation = tree.data?.validation;

  const perSubject = analytics.data?.perSubject ?? {};
  const perChapter = analytics.data?.perChapter ?? {};
  const aTotals = analytics.data?.totals ?? {
    views: 0,
    attempts: 0,
    uniqueUsers: 0,
    notes: 0,
    flashCards: 0,
  };
  const series = analytics.data?.series ?? [];
  const recent = analytics.data?.recent ?? [];
  const lastEventAt = analytics.data?.health.lastEventAt ?? null;

  useEffect(() => {
    if (!validation) return;
    const mismatches = Object.values(validation.mismatches ?? {}).some((value) => value !== 0);
    if (mismatches) console.warn("Academic Manager count validation mismatch", validation);
  }, [validation]);

  const activeLevel = selectedLevel ?? levels[0]?.code ?? null;
  const term = search.trim().toLowerCase();
  const filteredSubjects = useMemo(() => {
    let list = subjects.filter((s) => (activeLevel ? s.level === activeLevel : true));
    if (term) {
      // Match subject name directly, OR subjects whose chapter name matches the term
      const chapterSubjectIds = new Set(
        chapters.filter((c) => c.name.toLowerCase().includes(term)).map((c) => c.subject_id),
      );
      list = list.filter((s) => s.name.toLowerCase().includes(term) || chapterSubjectIds.has(s.id));
    }
    if (statusFilter === "published") list = list.filter((s) => s.status === "published");
    else if (statusFilter === "draft") list = list.filter((s) => s.status === "draft");
    else if (statusFilter === "most_viewed")
      list = [...list].sort(
        (a, b) => (perSubject[b.id]?.views ?? 0) - (perSubject[a.id]?.views ?? 0),
      );
    else if (statusFilter === "most_attempted")
      list = [...list].sort(
        (a, b) => (perSubject[b.id]?.attempts ?? 0) - (perSubject[a.id]?.attempts ?? 0),
      );
    else if (statusFilter === "recent")
      list = [...list].sort((a, b) => {
        const at = (a as Subject & { updated_at?: string }).updated_at ?? "";
        const bt = (b as Subject & { updated_at?: string }).updated_at ?? "";
        return bt.localeCompare(at);
      });
    return list;
  }, [subjects, chapters, activeLevel, term, statusFilter, perSubject]);

  const activeSubject = selectedSubject ?? filteredSubjects[0]?.id ?? null;
  const subjectChapters = useMemo(() => {
    const list = chapters.filter((c) => c.subject_id === activeSubject);
    if (!term) return list;
    const filtered = list.filter((c) => c.name.toLowerCase().includes(term));
    return filtered.length > 0 ? filtered : list;
  }, [chapters, activeSubject, term]);

  // ---- Aggregate level stats ----
  const levelStats = useMemo(() => {
    const map: Record<
      string,
      { subjects: number; chapters: number; mcqs: number; quizzes: number; mocks: number }
    > = {};
    for (const lv of levels)
      map[lv.code] = { subjects: 0, chapters: 0, mcqs: 0, quizzes: 0, mocks: 0 };
    for (const s of subjects) {
      const lvl = s.level ?? "";
      if (!lvl) continue;
      if (!map[lvl]) map[lvl] = { subjects: 0, chapters: 0, mcqs: 0, quizzes: 0, mocks: 0 };
      map[lvl].subjects += 1;
      map[lvl].quizzes += counts.quizBySubject[s.id] ?? 0;
      map[lvl].mocks += counts.mockBySubject[s.id] ?? 0;
      const subjChapters = chapters.filter((c) => c.subject_id === s.id);
      map[lvl].chapters += subjChapters.length;
      for (const ch of subjChapters) {
        map[lvl].mcqs += counts.mcqByChapter[ch.id] ?? 0;
        map[lvl].quizzes += counts.quizByChapter[ch.id] ?? 0;
        map[lvl].mocks += counts.mockByChapter[ch.id] ?? 0;
      }
    }
    return map;
  }, [levels, subjects, chapters, counts]);

  // ---- Global live totals (analytics bar) ----
  const sumValues = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
  const totals = useMemo(
    () => ({
      chapters: overview.chapters,
      mcqs: overview.mcqs,
      quizzes: overview.quizzes,
      mocks: overview.mocks,
    }),
    [overview],
  );

  // ---- Per-subject roll-up for premium subject cards ----
  const subjectStats = useMemo(() => {
    const map: Record<string, { chapters: number; mcqs: number; quizzes: number }> = {};
    for (const s of subjects) {
      const subjChapters = chapters.filter((c) => c.subject_id === s.id);
      let mcqs = 0;
      let quizzes = counts.quizBySubject[s.id] ?? 0;
      for (const ch of subjChapters) {
        mcqs += counts.mcqByChapter[ch.id] ?? 0;
        quizzes += counts.quizByChapter[ch.id] ?? 0;
      }
      map[s.id] = { chapters: subjChapters.length, mcqs, quizzes };
    }
    return map;
  }, [subjects, chapters, counts]);

  // ---------- Mutations ----------
  const deleteLevelFn = useServerFn(adminDeleteLevel);
  const deleteSubjectFn = useServerFn(adminDeleteSubject);
  const deleteChapterFn = useServerFn(adminDeleteChapter);

  const delLevel = useMutation({
    mutationFn: (code: string) => deleteLevelFn({ data: { code } }),
    onSuccess: () => {
      toast.success("Level deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delSubject = useMutation({
    mutationFn: (id: string) => deleteSubjectFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Subject deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delChapter = useMutation({
    mutationFn: (id: string) => deleteChapterFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Chapter deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      {/* Premium dashboard header */}
      <div className="glass relative rounded-3xl p-4 sm:p-5 shadow-card-soft">
        {/* Breadcrumb */}
        <nav className="mb-3 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="hover:text-foreground transition-colors">Admin</span>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <span className="hover:text-foreground transition-colors">Content</span>
          <ChevronRight className="h-3 w-3 opacity-60" />
          <span className="text-foreground">Academic Structure</span>
        </nav>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-cta-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-glow transition-transform duration-300 hover:scale-105">
              <FolderTree className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg font-bold tracking-tight sm:text-xl">
                Academic <span className="text-gradient">Structure Manager</span>
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                Levels → Subjects → Chapters · single source of truth
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subjects…"
                className="w-full pl-9 sm:w-56"
              />
            </div>
            <div className="absolute right-4 top-4 flex items-center gap-2 sm:static sm:contents">
              <button
                type="button"
                onClick={toggleTheme}
                title="Toggle theme"
                aria-label="Toggle theme"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/50 text-muted-foreground transition-all hover:scale-105 hover:bg-muted hover:text-foreground"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                type="button"
                title="Notifications"
                aria-label="Notifications"
                onClick={() => {
                  navigate({ to: "/admin/notifications" });
                }}
                className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/50 text-muted-foreground transition-all hover:scale-105 hover:bg-muted hover:text-foreground"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_var(--primary)]" />
              </button>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="transition-transform hover:scale-[1.03]"
              onClick={() => setDialog({ kind: "level", mode: "create" })}
            >
              <Plus className="mr-1 h-4 w-4" /> Level
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  className="bg-cta-gradient text-white shadow-glow transition-transform hover:scale-[1.03]"
                >
                  <Plus className="mr-1 h-4 w-4" /> Quick Add
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Academic Structure</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setDialog({ kind: "level", mode: "create" })}>
                  <GraduationCap className="mr-2 h-4 w-4" /> Add Level
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    setDialog({
                      kind: "subject",
                      mode: "create",
                      levelCode: activeLevel ?? "professional",
                    })
                  }
                >
                  <BookOpen className="mr-2 h-4 w-4" /> Add Subject
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!activeSubject}
                  onClick={() =>
                    activeSubject &&
                    setDialog({ kind: "chapter", mode: "create", subjectId: activeSubject })
                  }
                >
                  <Layers className="mr-2 h-4 w-4" /> Add Chapter
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Content</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    navigate({ to: "/admin/mcq" as never, search: { action: "create" } as never });
                  }}
                >
                  <FileQuestion className="mr-2 h-4 w-4" /> Add MCQ
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigate({ to: "/admin/quiz" as never, search: { action: "create" } as never });
                  }}
                >
                  <ListChecks className="mr-2 h-4 w-4" /> Add Quiz
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigate({ to: "/admin/mock-test" as never, search: { action: "create" } as never });
                  }}
                >
                  <FileStack className="mr-2 h-4 w-4" /> Add Mock Test
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigate({ to: "/admin/short-notes" as never, search: { action: "create" } as never });
                  }}
                >
                  <BookOpen className="mr-2 h-4 w-4" /> Add Notes
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigate({ to: "/admin/flash-cards" as never, search: { action: "create" } as never });
                  }}
                >
                  <Sparkles className="mr-2 h-4 w-4" /> Add Flash Cards
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigate({ to: "/admin/question-bank" as never, search: { action: "create" } as never });
                  }}
                >
                  <FileStack className="mr-2 h-4 w-4" /> Add Q-Bank Resource
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Top dashboard row: Overview Summary · Content & Activity · System Health */}
      <div className="grid gap-3 lg:grid-cols-3">
        <OverviewSummaryCard
          subjects={overview.subjects}
          chapters={overview.chapters}
          mcqs={totals.mcqs}
          quizzes={totals.quizzes}
          mocks={totals.mocks}
        />
        <ContentActivityCard
          mcqs={totals.mcqs}
          chapters={overview.chapters}
          quizzes={totals.quizzes}
          mocks={totals.mocks}
          totalContent={overview.totalContent}
        />
        <SystemHealthCard
          lastEventAt={lastEventAt}
          totalViews={aTotals.views}
          totalAttempts={aTotals.attempts}
          uniqueUsers={aTotals.uniqueUsers}
          subjectsCount={subjects.length}
          chaptersCount={chapters.length}
        />
      </div>

      {/* Level selector pills */}
      {levels.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Levels
          </span>
          {levels.map((lv) => {
            const s = levelStats[lv.code] ?? {
              subjects: 0,
              chapters: 0,
              mcqs: 0,
              quizzes: 0,
              mocks: 0,
            };
            const isActive = activeLevel === lv.code;
            return (
              <button
                key={lv.code}
                onClick={() => {
                  setSelectedLevel(lv.code);
                  setSelectedSubject(null);
                }}
                className={`group relative inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                  isActive
                    ? "border-primary/60 bg-primary/10 text-foreground shadow-glow"
                    : "border-border/60 bg-card/40 text-muted-foreground hover:bg-card hover:text-foreground"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: lv.color ?? "#a855f7" }}
                />
                {lv.name}
                <span className="rounded-md bg-background/50 px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {s.subjects}·{s.chapters}
                </span>
                <span className="hidden gap-0.5 group-hover:flex">
                  <IconBtn
                    title="Edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDialog({ kind: "level", mode: "edit", data: lv });
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </IconBtn>
                  <IconBtn
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      void (async () => {
                        if (
                          await confirmDialog({
                            title: `Delete "${lv.name}"?`,
                            variant: "destructive",
                            confirmLabel: "Delete",
                          })
                        )
                          delLevel.mutate(lv.code);
                      })();
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </IconBtn>
                </span>
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Filter
            </span>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="h-8 w-[160px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="most_viewed">Most viewed</SelectItem>
                <SelectItem value="most_attempted">Most attempted</SelectItem>
                <SelectItem value="recent">Recently updated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Subject + Chapter columns */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        {/* Subjects column */}
        <div className="glass rounded-3xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-primary" />
              <h2 className="font-display text-sm font-bold uppercase tracking-wider">Subjects</h2>
              <Badge variant="outline" className="text-[10px]">
                {filteredSubjects.length}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setDialog({
                  kind: "subject",
                  mode: "create",
                  levelCode: activeLevel ?? "professional",
                })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add
            </Button>
          </div>
          <ul className="space-y-1.5">
            {filteredSubjects.map((s) => {
              const isActive = activeSubject === s.id;
              const st = subjectStats[s.id] ?? { chapters: 0, mcqs: 0, quizzes: 0 };
              return (
                <li key={s.id}>
                  <div
                    onClick={() => setSelectedSubject(s.id)}
                    className={`group relative cursor-pointer overflow-hidden rounded-2xl border p-3 transition-all duration-300 hover:-translate-y-0.5 ${
                      isActive
                        ? "border-primary/60 bg-primary/10 shadow-glow"
                        : "border-border/50 bg-card/40 hover:border-border hover:bg-card hover:shadow-card-soft"
                    }`}
                    style={{
                      background:
                        isActive && s.color
                          ? `linear-gradient(135deg, ${s.color}22, transparent 65%)`
                          : undefined,
                    }}
                  >
                    {isActive && (
                      <span
                        className="absolute inset-y-0 left-0 w-1 rounded-r"
                        style={{ background: s.color ?? "var(--primary)" }}
                      />
                    )}
                    <div className="flex items-start gap-2">
                      <ChevronRight
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform duration-300 ${isActive ? "rotate-90 text-primary" : "text-muted-foreground"}`}
                      />
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-background"
                        style={{ background: s.color ?? "#a855f7" }}
                      />
                      <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-snug">{s.name}</span>
                      <Badge
                        variant={s.status === "published" ? "default" : "secondary"}
                        className="shrink-0 text-[10px] capitalize"
                      >
                        {s.status}
                      </Badge>
                      <div className="hidden items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
                        <IconBtn
                          title="Edit subject"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialog({ kind: "subject", mode: "edit", data: s });
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </IconBtn>
                        <IconBtn
                          title="Delete subject"
                          onClick={(e) => {
                            e.stopPropagation();
                            void (async () => { if (await confirmDialog({ title: `Delete subject "${s.name}"?`, variant: "destructive", confirmLabel: "Delete" })) delSubject.mutate(s.id); })();
                          }}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </IconBtn>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">

                      <CountChip
                        icon={<Layers className="h-3 w-3" />}
                        value={st.chapters}
                        title="Chapters"
                      />
                      <CountChip
                        icon={<FileQuestion className="h-3 w-3" />}
                        value={st.mcqs}
                        title="MCQs"
                      />
                      <CountChip
                        icon={<ListChecks className="h-3 w-3" />}
                        value={st.quizzes}
                        title="Quizzes"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
            {filteredSubjects.length === 0 && (
              <li className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                No subjects for this level yet.
              </li>
            )}
          </ul>
        </div>

        {/* Chapters column */}
        <div className="glass rounded-3xl p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-primary" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider">Chapters</h2>
            <Badge variant="outline" className="text-[10px]">
              {subjectChapters.length}
            </Badge>
            <Button
              size="sm"
              disabled={!activeSubject}
              className="ml-auto bg-cta-gradient text-white shadow-glow transition-transform hover:scale-[1.03] disabled:opacity-50"
              onClick={() =>
                activeSubject &&
                setDialog({ kind: "chapter", mode: "create", subjectId: activeSubject })
              }
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Chapter
            </Button>
          </div>
          {!activeSubject ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              <Sparkles className="mx-auto mb-2 h-5 w-5" />
              Select a subject to view its chapters.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {subjectChapters.map((c) => (
                <li
                  key={c.id}
                  className="group grid grid-cols-[auto_auto_minmax(0,1fr)] items-center gap-x-2 gap-y-1 rounded-xl border border-transparent px-3 py-2 text-sm transition-all duration-200 hover:-translate-y-px hover:border-border/60 hover:bg-muted/40 hover:shadow-card-soft sm:flex sm:flex-nowrap sm:items-center"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    title={c.status}
                    style={{
                      background:
                        c.status === "published"
                          ? "var(--primary)"
                          : c.status === "archived"
                            ? "var(--muted-foreground)"
                            : "var(--accent)",
                    }}
                  />
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground transition-colors group-hover:bg-primary/15 group-hover:text-primary">
                    {c.sort_order + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMcqChapter(c)}
                    className="min-w-0 flex-1 text-left hover:text-primary"
                    title="View & manage MCQs"
                  >
                    <p className="whitespace-normal break-words font-medium">{c.name}</p>
                    {c.description && (
                      <p className="whitespace-normal break-words text-[11px] text-muted-foreground">{c.description}</p>
                    )}
                  </button>
                  <div className="col-span-3 flex flex-wrap items-center gap-1 sm:col-span-1 sm:flex-nowrap">
                    <button
                      type="button"
                      onClick={() => setMcqChapter(c)}
                      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/40 px-2 py-1 text-[10px] font-semibold hover:bg-muted"
                      title="View MCQs"
                    >
                      <ListChecks className="h-3 w-3" /> {counts.mcqByChapter[c.id] ?? 0}
                    </button>
                    <Pill label="Quiz" value={counts.quizByChapter[c.id] ?? 0} />
                    <Pill label="Mock" value={counts.mockByChapter[c.id] ?? 0} />
                    <Badge
                      variant={c.status === "published" ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {c.status}
                    </Badge>
                    <div className="ml-auto flex items-center gap-0.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                      <IconBtn
                        title="Edit chapter"
                        onClick={() => setDialog({ kind: "chapter", mode: "edit", data: c })}
                      >
                        <Pencil className="h-3 w-3" />
                      </IconBtn>
                      <IconBtn
                        title="Delete chapter"
                        onClick={() => {
                          void (async () => { if (await confirmDialog({ title: `Delete chapter "${c.name}"?`, variant: "destructive", confirmLabel: "Delete" })) delChapter.mutate(c.id); })();
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </IconBtn>
                    </div>
                  </div>
                </li>
              ))}

              {subjectChapters.length === 0 && (
                <li className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                  No chapters yet — add the first one.
                </li>
              )}
            </ul>
          )}
        </div>
      </div>

      {/* Bottom row: Content Analytics chart + Recent Activity */}
      <div className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <ContentAnalyticsChart
          series={series}
          totals={aTotals}
          loading={analytics.isLoading}
          rangeDays={rangeDays}
          onRangeChange={setRangeDays}
        />
        <RecentActivityCard recent={recent} loading={analytics.isLoading} />
      </div>

      {/* Bottom row 2: Popular Subjects · Top Chapters · Distribution · Quick Actions */}
      <div className="grid gap-3 lg:grid-cols-4">
        <PopularSubjectsCard subjects={subjects} perSubject={perSubject} />
        <TopChaptersCard
          chapters={chapters}
          perChapter={perChapter}
          mcqByChapter={counts.mcqByChapter}
        />
        <ContentDistributionCard
          mcqs={totals.mcqs}
          chapters={overview.chapters}
          quizzes={totals.quizzes}
          mocks={totals.mocks}
          notes={overview.notes}
          flashCards={overview.flashCards}
        />
        <QuickActionsCard
          onLevel={() => setDialog({ kind: "level", mode: "create" })}
          onSubject={() =>
            setDialog({ kind: "subject", mode: "create", levelCode: activeLevel ?? "professional" })
          }
          onChapter={() =>
            activeSubject &&
            setDialog({ kind: "chapter", mode: "create", subjectId: activeSubject })
          }
          canChapter={!!activeSubject}
        />
      </div>

      {/* Dialogs */}
      <EntityDialog
        state={dialog}
        onClose={() => setDialog({ kind: "none" })}
        onSaved={invalidate}
        levels={levels}
        subjects={subjects}
      />
      {mcqChapter && <ChapterMcqsDialog chapter={mcqChapter} onClose={() => setMcqChapter(null)} />}
    </div>
  );
}

// ============================================================
// Premium dashboard widgets — fully real-data driven
// ============================================================
function OverviewSummaryCard({
  subjects,
  chapters,
  mcqs,
  quizzes,
  mocks,
}: {
  subjects: number;
  chapters: number;
  mcqs: number;
  quizzes: number;
  mocks: number;
}) {
  const tiles = [
    {
      label: "Subjects",
      value: subjects,
      icon: <BookOpen className="h-3.5 w-3.5" />,
      accent: "var(--neon-purple)",
    },
    {
      label: "Chapters",
      value: chapters,
      icon: <Layers className="h-3.5 w-3.5" />,
      accent: "var(--neon-blue)",
    },
    {
      label: "MCQs",
      value: mcqs,
      icon: <FileQuestion className="h-3.5 w-3.5" />,
      accent: "var(--neon-pink)",
    },
    {
      label: "Quizzes",
      value: quizzes,
      icon: <ListChecks className="h-3.5 w-3.5" />,
      accent: "var(--accent)",
    },
    {
      label: "Mock Tests",
      value: mocks,
      icon: <FileStack className="h-3.5 w-3.5" />,
      accent: "var(--primary)",
    },
  ];
  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Layers className="h-3.5 w-3.5" />
        </div>
        <h3 className="font-display text-sm font-bold uppercase tracking-wider">
          Overview Summary
        </h3>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl border border-border/40 bg-card/40 p-2 text-center transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow"
          >
            <div
              className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-md"
              style={{
                background: `color-mix(in oklab, ${t.accent} 18%, transparent)`,
                color: t.accent,
              }}
            >
              {t.icon}
            </div>
            <p className="font-mono text-base font-bold tabular-nums leading-none">{t.value}</p>
            <p className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground">
              {t.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Donut({
  size = 130,
  thickness = 16,
  segments,
}: {
  size?: number;
  thickness?: number;
  segments: { value: number; color: string; label: string }[];
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="color-mix(in oklab, var(--muted) 60%, transparent)"
        strokeWidth={thickness}
      />
      {segments.map((s, i) => {
        const frac = s.value / total;
        const dash = c * frac;
        const el = (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth={thickness}
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            strokeLinecap="butt"
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}

function ContentActivityCard({
  mcqs,
  chapters,
  quizzes,
  mocks,
  totalContent,
}: {
  mcqs: number;
  chapters: number;
  quizzes: number;
  mocks: number;
  totalContent?: number;
}) {
  const total = totalContent ?? mcqs + chapters + quizzes + mocks;
  const segs = [
    { value: mcqs, color: "#a855f7", label: "MCQs" },
    { value: chapters, color: "#3b82f6", label: "Chapters" },
    { value: quizzes, color: "#ec4899", label: "Quizzes" },
    { value: mocks, color: "#f59e0b", label: "Mocks" },
  ];
  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Activity className="h-3.5 w-3.5" />
        </div>
        <h3 className="font-display text-sm font-bold uppercase tracking-wider">
          Content & Activity
        </h3>
      </div>
      <div className="flex items-center gap-4">
        <div className="relative">
          <Donut segments={segs} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-display text-xl font-bold tabular-nums">{total}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Total Content
            </p>
          </div>
        </div>
        <div className="flex-1 space-y-1.5">
          {segs.map((s) => {
            const pct = total ? ((s.value / total) * 100).toFixed(1) : "0.0";
            return (
              <div key={s.label} className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  <span className="font-medium">{s.label}</span>
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {s.value} <span className="opacity-60">({pct}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function SystemHealthCard({
  lastEventAt,
  totalViews,
  totalAttempts,
  uniqueUsers,
  subjectsCount,
  chaptersCount,
}: {
  lastEventAt: string | null;
  totalViews: number;
  totalAttempts: number;
  uniqueUsers: number;
  subjectsCount: number;
  chaptersCount: number;
}) {
  const healthy = subjectsCount > 0 && chaptersCount > 0;
  const engagement =
    totalViews + totalAttempts > 0
      ? Math.min(100, Math.round((totalAttempts / Math.max(1, totalViews + totalAttempts)) * 100))
      : 0;
  const rows = [
    {
      label: "Content Health",
      value: healthy ? "Excellent" : "Setup",
      tone: healthy ? "good" : ("warn" as const),
    },
    { label: "Last Sync", value: relativeTime(lastEventAt), tone: "neutral" as const },
    { label: "Total Views (30D)", value: totalViews.toLocaleString(), tone: "neutral" as const },
    {
      label: "Total Attempts (30D)",
      value: totalAttempts.toLocaleString(),
      tone: "neutral" as const,
    },
    { label: "Active Users (30D)", value: uniqueUsers.toLocaleString(), tone: "neutral" as const },
    {
      label: "Avg Engagement",
      value: `${engagement}%`,
      tone: engagement >= 70 ? "good" : ("neutral" as const),
    },
  ];
  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <CheckCircle2 className="h-3.5 w-3.5" />
        </div>
        <h3 className="font-display text-sm font-bold uppercase tracking-wider">System Health</h3>
      </div>
      <ul className="space-y-1.5 text-[11px]">
        {rows.map((r) => (
          <li
            key={r.label}
            className="flex items-center justify-between rounded-lg border border-border/30 bg-card/30 px-2.5 py-1.5"
          >
            <span className="text-muted-foreground">{r.label}</span>
            <Badge
              variant={r.tone === "good" ? "default" : r.tone === "warn" ? "secondary" : "outline"}
              className="text-[10px] font-semibold"
            >
              {r.value}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContentAnalyticsChart({
  series,
  totals,
  loading,
  rangeDays,
  onRangeChange,
}: {
  series: { day: string; views: number; attempts: number; users: number }[];
  totals: { views: number; attempts: number; uniqueUsers: number };
  loading: boolean;
  rangeDays: number;
  onRangeChange: (n: number) => void;
}) {
  const maxV = Math.max(1, ...series.map((s) => s.views + s.attempts));
  const w = 600,
    h = 160,
    pad = 24;
  const points = series.map((s, i) => {
    const x = pad + (i / Math.max(1, series.length - 1)) * (w - pad * 2);
    const y = h - pad - ((s.views + s.attempts) / maxV) * (h - pad * 2);
    return `${x},${y}`;
  });
  const path = points.length ? "M " + points.join(" L ") : "";
  const area = points.length
    ? `${path} L ${pad + (w - pad * 2)},${h - pad} L ${pad},${h - pad} Z`
    : "";
  const avgTime = series.length
    ? `${Math.round(((totals.views + totals.attempts) / Math.max(1, totals.uniqueUsers || 1)) * 0.6)}s`
    : "0s";

  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <TrendingUp className="h-3.5 w-3.5" />
          </div>
          <h3 className="font-display text-sm font-bold uppercase tracking-wider">
            Content Analytics
          </h3>
          <Select value={String(rangeDays)} onValueChange={(v) => onRangeChange(Number(v))}>
            <SelectTrigger className="h-7 w-[120px] text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="14">Last 14 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="180">Last 180 Days</SelectItem>
              <SelectItem value="365">Last 365 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-2 text-center">
        <MiniStat label="Content Views" value={totals.views.toLocaleString()} accent="#a855f7" />
        <MiniStat label="Attempts" value={totals.attempts.toLocaleString()} accent="#ec4899" />
        <MiniStat
          label="Unique Users"
          value={totals.uniqueUsers.toLocaleString()}
          accent="#3b82f6"
        />
        <MiniStat label="Avg Engagement" value={avgTime} accent="#f59e0b" />
      </div>
      <div className="relative h-[180px] w-full overflow-hidden rounded-xl border border-border/30 bg-card/30 p-2">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading analytics…
          </div>
        ) : totals.views + totals.attempts === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-xs text-muted-foreground">
            <Activity className="mb-1 h-5 w-5 opacity-60" />
            No activity recorded yet — tracking begins as students engage.
          </div>
        ) : (
          <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-full w-full">
            <defs>
              <linearGradient id="aArea" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#a855f7" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#aArea)" />
            <path d={path} fill="none" stroke="#a855f7" strokeWidth="2" />
            {series
              .filter((_, i) => i % 5 === 0)
              .map((s, i) => (
                <text
                  key={i}
                  x={pad + (series.indexOf(s) / Math.max(1, series.length - 1)) * (w - pad * 2)}
                  y={h - 4}
                  textAnchor="middle"
                  fontSize="9"
                  fill="currentColor"
                  opacity="0.5"
                >
                  {s.day.slice(5)}
                </text>
              ))}
          </svg>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-border/30 bg-card/30 px-2 py-2">
      <p className="font-mono text-sm font-bold tabular-nums" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function RecentActivityCard({
  recent,
  loading,
}: {
  recent: Array<{
    id: string;
    event_type: string;
    element_label: string | null;
    module: string | null;
    created_at: string;
  }>;
  loading: boolean;
}) {
  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Clock className="h-3.5 w-3.5" />
          </div>
          <h3 className="font-display text-sm font-bold uppercase tracking-wider">
            Recent Activity
          </h3>
        </div>
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading…
        </div>
      ) : recent.length === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center text-xs text-muted-foreground">
          <Bell className="mb-1 h-5 w-5 opacity-60" />
          No recent activity yet.
        </div>
      ) : (
        <ul className="space-y-1.5">
          {recent.slice(0, 6).map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-lg border border-border/30 bg-card/30 px-2.5 py-2"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                <Activity className="h-3 w-3" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold capitalize">
                  {e.element_label ?? e.event_type.replace(/_/g, " ")}
                </p>
                <p className="truncate text-[10px] text-muted-foreground capitalize">
                  {e.module ?? "system"} · {relativeTime(e.created_at)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PopularSubjectsCard({
  subjects,
  perSubject,
}: {
  subjects: Subject[];
  perSubject: Record<string, { views: number; uniqueUsers: number; attempts: number }>;
}) {
  const ranked = useMemo(() => {
    const totalViews = Object.values(perSubject).reduce((a, x) => a + x.views, 0) || 1;
    return subjects
      .map((s) => ({ ...s, views: perSubject[s.id]?.views ?? 0 }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 4)
      .map((s) => ({ ...s, pct: (s.views / totalViews) * 100 }));
  }, [subjects, perSubject]);
  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-3.5 w-3.5 text-primary" />
        <h3 className="font-display text-xs font-bold uppercase tracking-wider">
          Popular Subjects
        </h3>
        <Badge variant="outline" className="ml-auto text-[9px]">
          By Engagement
        </Badge>
      </div>
      {ranked.length === 0 || ranked.every((r) => r.views === 0) ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-[10px] text-muted-foreground">
          No engagement data yet.
        </p>
      ) : (
        <ol className="space-y-2 text-[11px]">
          {ranked.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 font-mono text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 break-words font-medium">{s.name}</span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {s.pct.toFixed(1)}%
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function TopChaptersCard({
  chapters,
  perChapter,
  mcqByChapter,
}: {
  chapters: Chapter[];
  perChapter: Record<string, { views: number; uniqueUsers: number; attempts: number }>;
  mcqByChapter: Record<string, number>;
}) {
  const ranked = useMemo(() => {
    return chapters
      .map((c) => ({ ...c, score: (perChapter[c.id]?.views ?? 0) + (mcqByChapter[c.id] ?? 0) * 5 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [chapters, perChapter, mcqByChapter]);
  const max = Math.max(1, ...ranked.map((r) => r.score));
  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp className="h-3.5 w-3.5 text-primary" />
        <h3 className="font-display text-xs font-bold uppercase tracking-wider">Top Chapters</h3>
      </div>
      {ranked.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-[10px] text-muted-foreground">
          No chapter data yet.
        </p>
      ) : (
        <ol className="space-y-2 text-[11px]">
          {ranked.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 font-mono text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 break-words font-medium">{c.name}</span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {((c.score / max) * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ContentDistributionCard({
  mcqs,
  chapters,
  quizzes,
  mocks,
  notes,
  flashCards,
}: {
  mcqs: number;
  chapters: number;
  quizzes: number;
  mocks: number;
  notes: number;
  flashCards: number;
}) {
  const total = mcqs + chapters + quizzes + mocks + notes + flashCards;
  const segs = [
    { value: mcqs, color: "#a855f7", label: "MCQs" },
    { value: chapters, color: "#3b82f6", label: "Chapters" },
    { value: quizzes, color: "#ec4899", label: "Quizzes" },
    { value: mocks, color: "#f59e0b", label: "Mocks" },
    { value: notes, color: "#10b981", label: "Notes" },
    { value: flashCards, color: "#06b6d4", label: "Flash" },
  ];
  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <div className="mb-3 flex items-center gap-2">
        <FileStack className="h-3.5 w-3.5 text-primary" />
        <h3 className="font-display text-xs font-bold uppercase tracking-wider">
          Content Distribution
        </h3>
      </div>
      <div className="flex items-center gap-3">
        <div className="relative">
          <Donut size={90} thickness={12} segments={segs} />
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="font-mono text-xs font-bold tabular-nums">{total}</p>
          </div>
        </div>
        <div className="flex-1 space-y-0.5">
          {segs.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-[10px]">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                <span>{s.label}</span>
              </span>
              <span className="font-mono tabular-nums text-muted-foreground">{s.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuickActionsCard({
  onLevel,
  onSubject,
  onChapter,
  canChapter,
}: {
  onLevel: () => void;
  onSubject: () => void;
  onChapter: () => void;
  canChapter: boolean;
}) {
  const navigate = useNavigate();
  const actions = [
    {
      label: "Add Level",
      onClick: onLevel,
      icon: <GraduationCap className="h-3.5 w-3.5" />,
      disabled: false,
    },
    {
      label: "Add Subject",
      onClick: onSubject,
      icon: <BookOpen className="h-3.5 w-3.5" />,
      disabled: false,
    },
    {
      label: "Add Chapter",
      onClick: onChapter,
      icon: <Layers className="h-3.5 w-3.5" />,
      disabled: !canChapter,
    },
    {
      label: "Bulk Upload MCQs",
      onClick: () => {
        navigate({ to: "/admin/mcq" as never, search: { action: "bulk" } as never });
      },
      icon: <Upload className="h-3.5 w-3.5" />,
      disabled: false,
    },
  ];
  return (
    <div className="glass rounded-2xl p-4 shadow-card-soft">
      <div className="mb-3 flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <h3 className="font-display text-xs font-bold uppercase tracking-wider">Quick Actions</h3>
      </div>
      <div className="space-y-1.5">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onClick}
            disabled={a.disabled}
            className="flex w-full items-center gap-2 rounded-lg border border-border/40 bg-card/40 px-2.5 py-2 text-xs font-semibold transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:bg-primary/10 hover:text-primary hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 text-primary">
              {a.icon}
            </span>
            {a.label}
            <ChevronRight className="ml-auto h-3 w-3 opacity-60" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 py-1.5">
      <p className="font-mono text-sm font-bold">{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function AnalyticsCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="glass group relative overflow-hidden rounded-2xl p-4 shadow-card-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow">
      <div
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
          style={{ background: `color-mix(in oklab, ${accent} 18%, transparent)`, color: accent }}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="font-display text-2xl font-bold leading-none tabular-nums">{value}</p>
          <p className="mt-1 truncate text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value }: { label: string; value: number }) {
  return (
    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label} {value}
    </span>
  );
}

function CountChip({
  icon,
  value,
  title,
}: {
  icon: React.ReactNode;
  value: number;
  title: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
    >
      {icon}
      {value}
    </span>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-md p-1.5 hover:bg-muted"
    >
      {children}
    </button>
  );
}

// ============================================================
// Dialog (level / subject / chapter)
// ============================================================
function EntityDialog({
  state,
  onClose,
  onSaved,
  levels,
  subjects,
}: {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void;
  levels: Level[];
  subjects: Subject[];
}) {
  const createLevelFn = useServerFn(adminCreateLevel);
  const updateLevelFn = useServerFn(adminUpdateLevel);
  const createSubjectFn = useServerFn(adminCreateSubject);
  const updateSubjectFn = useServerFn(adminUpdateSubject);
  const createChapterFn = useServerFn(adminCreateChapter);
  const updateChapterFn = useServerFn(adminUpdateChapter);

  const open = state.kind !== "none";
  const title =
    state.kind === "level"
      ? `${state.mode === "create" ? "Create" : "Edit"} Level`
      : state.kind === "subject"
        ? `${state.mode === "create" ? "Create" : "Edit"} Subject`
        : state.kind === "chapter"
          ? `${state.mode === "create" ? "Create" : "Edit"} Chapter`
          : "";

  // Form state per kind
  const [form, setForm] = useState<Record<string, unknown>>({});

  // Reset form whenever dialog state changes (must be an effect, not useMemo —
  // calling setState during render triggers React error #418 and unreliable forms).
  useEffect(() => {
    if (state.kind === "level") {
      setForm(
        state.data
          ? { ...state.data }
          : {
              code: "",
              name: "",
              color: "#a855f7",
              icon: "GraduationCap",
              sort_order: levels.length,
              status: "published",
            },
      );
    } else if (state.kind === "subject") {
      setForm(
        state.data
          ? { ...state.data }
          : {
              name: "",
              level: state.levelCode ?? "professional",
              color: "#a855f7",
              icon: "BookOpen",
              sort_order: 0,
              status: "published",
            },
      );
    } else if (state.kind === "chapter") {
      setForm(
        state.data
          ? { ...state.data }
          : { name: "", subject_id: state.subjectId ?? "", sort_order: 0, status: "published" },
      );
    } else {
      setForm({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      if (state.kind === "level") {
        if (state.mode === "create") return createLevelFn({ data: form as never });
        return updateLevelFn({ data: form as never });
      }
      if (state.kind === "subject") {
        if (state.mode === "create") return createSubjectFn({ data: form as never });
        return updateSubjectFn({ data: form as never });
      }
      if (state.kind === "chapter") {
        if (state.mode === "create") return createChapterFn({ data: form as never });
        return updateChapterFn({ data: form as never });
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {state.kind === "level" && "Levels group subjects by curriculum tier."}
            {state.kind === "subject" && "Subjects live inside a level and group chapters."}
            {state.kind === "chapter" && "Chapters hold MCQs, quizzes, mocks, notes and resources."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {state.kind === "level" && (
            <>
              <Field label="Code (lowercase, unique)" required>
                <Input
                  value={(form.code as string) ?? ""}
                  disabled={state.mode === "edit"}
                  onChange={(e) =>
                    set("code", e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))
                  }
                  placeholder="e.g. professional"
                />
              </Field>
            </>
          )}

          <Field label="Name" required>
            <Input
              value={(form.name as string) ?? ""}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>

          {state.kind === "subject" && (
            <Field label="Level">
              <Select
                value={(form.level as string) ?? "professional"}
                onValueChange={(v) => set("level", v)}
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
          )}

          {state.kind === "chapter" && (
            <Field label="Subject">
              <Select
                value={(form.subject_id as string) ?? ""}
                onValueChange={(v) => set("subject_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Description">
            <Textarea
              rows={2}
              value={(form.description as string) ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </Field>

          {(state.kind === "level" || state.kind === "subject") && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Color">
                <Input
                  type="color"
                  value={(form.color as string) ?? "#a855f7"}
                  onChange={(e) => set("color", e.target.value)}
                />
              </Field>
              <Field label="Icon name">
                <Input
                  value={(form.icon as string) ?? ""}
                  onChange={(e) => set("icon", e.target.value)}
                  placeholder="lucide icon name"
                />
              </Field>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Sort order">
              <Input
                type="number"
                value={Number(form.sort_order ?? 0)}
                onChange={(e) => set("sort_order", Number(e.target.value))}
              />
            </Field>
            <Field label="Status">
              <Select
                value={(form.status as string) ?? "published"}
                onValueChange={(v) => set("status", v)}
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
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
}

// ============================================================
// Chapter MCQs dialog — full management for one chapter
// ============================================================
type ChapterMcq = {
  id: string;
  question: string;
  correct_option: string;
  difficulty: "easy" | "medium" | "hard";
  status: "draft" | "published" | "archived";
  tags: string[];
};

function ChapterMcqsDialog({ chapter, onClose }: { chapter: Chapter; onClose: () => void }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListMcqs);
  const delFn = useServerFn(adminDeleteMcq);
  const statusFn = useServerFn(adminSetMcqStatus);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const q = useQuery({
    queryKey: ["academic-chapter-mcqs", chapter.id, search, page],
    queryFn: () =>
      listFn({
        data: { chapterId: chapter.id, search: search || undefined, page, pageSize },
      }),
  });

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["academic-chapter-mcqs", chapter.id] });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("MCQ deleted");
      invalidate();
      qc.invalidateQueries({ queryKey: ["admin-academic-tree"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (vars: { id: string; status: "published" | "draft" }) => statusFn({ data: vars }),
    onSuccess: (_d, v) => {
      toast.success(v.status === "published" ? "Published" : "Unpublished");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (q.data?.rows ?? []) as ChapterMcq[];
  const total = q.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            MCQs · {chapter.name}
          </DialogTitle>
          <DialogDescription>
            Manage all MCQs in this chapter. Changes go live instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search question text…"
              className="pl-9"
            />
          </div>
          <Badge variant="outline" className="text-[10px]">
            {total} total
          </Badge>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-xl border border-border/60">
          {q.isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading MCQs…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No MCQs in this chapter yet.
            </div>
          ) : (
            <table className="w-full min-w-[640px] text-xs">

              <thead className="sticky top-0 bg-muted/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Question</th>
                  <th className="px-3 py-2 w-16">Ans</th>
                  <th className="px-3 py-2 w-20">Difficulty</th>
                  <th className="px-3 py-2 w-24">Status</th>
                  <th className="px-3 py-2 w-28 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id} className="border-t border-border/40 hover:bg-muted/30">
                    <td className="max-w-[360px] px-3 py-2">
                      <p className="line-clamp-2 font-medium">{m.question}</p>
                      {m.tags?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {m.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-display font-bold text-primary">
                      {m.correct_option}
                    </td>
                    <td className="px-3 py-2 capitalize">{m.difficulty}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={m.status === "published" ? "default" : "secondary"}
                        className="text-[10px] capitalize"
                      >
                        {m.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <IconBtn
                          title={m.status === "published" ? "Unpublish" : "Publish"}
                          onClick={() =>
                            statusMut.mutate({
                              id: m.id,
                              status: m.status === "published" ? "draft" : "published",
                            })
                          }
                        >
                          {m.status === "published" ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </IconBtn>
                        <IconBtn
                          title="Delete MCQ"
                          onClick={() => {
                            void (async () => { if (await confirmDialog({ title: "Delete this MCQ?", variant: "destructive", confirmLabel: "Delete" })) del.mutate(m.id); })();
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {total > 0 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" /> Close
          </Button>
          <Button asChild>
            <Link to="/admin/mcq" onClick={onClose}>
              Open MCQ Manager →
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
