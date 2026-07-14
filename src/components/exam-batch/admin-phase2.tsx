// Admin Exam Batch — Phase 2 (Exams / Leaderboard / Analytics).
// Fully wired to real backend server functions. No mock/demo data.
//
// Kept in a separate file so the massive admin-pages.tsx stays reviewable.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Archive,
  ArchiveRestore,
  BarChart3,
  Download,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
  Play,
  Square,
  FileType2,
  Upload,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ListChecks,
} from "lucide-react";
import { motion } from "framer-motion";

import {
  PageHeader,
  SectionCard,
  FilterBar,
  FilterChip,
  StatusBadge,
  EmptyState,
  primaryBtnCls,
  ghostBtnCls,
} from "./kit";
import { AnimatedCounter, BarChart, DonutChart, LineChart } from "./charts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  adminListExamBatchSessions,
} from "@/lib/exam-batch/admin-sessions.functions";
import {
  adminListExamBatchExams,
  adminCreateExamBatchExam,
  adminUpdateExamBatchExam,
  adminDeleteExamBatchExam,
  adminSetExamBatchExamPublished,
  adminSetExamBatchExamArchived,
  adminSetExamBatchExamHidden,
  adminForceCloseExamBatchExam,
  adminSetExamBatchExamQuestions,
  adminListExamBatchExamQuestions,
} from "@/lib/exam-batch/admin-exams.functions";
import {
  adminGetExamBatchLeaderboard,
  adminListExamBatchLeaderboards,
  adminGetExamBatchAnalytics,
  adminRecalculateExamBatch,
  adminDeleteExamBatchLeaderboard,
} from "@/lib/exam-batch/admin-results.functions";
import { adminExportExamBatchLeaderboard } from "@/lib/exam-batch/admin-exports.functions";
import { PDF_THEME_PRESETS, DEFAULT_PDF_THEME } from "@/lib/exam-batch/pdf-themes";
import {
  adminListExamBatchSubjects,
  adminListExamBatchChapters,
} from "@/lib/exam-batch/admin-academic.functions";
import { adminListExamBatchMcqs } from "@/lib/exam-batch/admin-mcqs.functions";
import { ExamBatchBulkUploadMcqsDialog } from "./bulk-upload-mcqs-dialog";
import { notifyExamBatchRealtime } from "./use-exam-batch-realtime";
import type { ExamBatchExamRow } from "@/lib/exam-batch/exam-engine.types";
import type { ExamBatchSessionRow } from "@/lib/exam-batch/types";

/* ---------- shared helpers ---------- */

function toDatetimeLocal(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIsoOrNull(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

type ExamAvailability = "live" | "upcoming" | "ended" | "draft";
function examAvailability(row: ExamBatchExamRow): ExamAvailability {
  if (!row.is_published) return "draft";
  const now = Date.now();
  const start = new Date(row.window_start).getTime();
  const end = new Date(row.window_end).getTime();
  if (row.force_closed_at) return "ended";
  if (now < start) return "upcoming";
  if (now > end) return "ended";
  return "live";
}

function downloadBase64(filename: string, mimeType: string, contentBase64: string) {
  const bin = atob(contentBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============================================================
 * 1. EXAMS
 * ============================================================ */

type ExamFormState = {
  sessionId: string;
  title: string;
  subtitle: string;
  level: string;
  subjectId: string;
  chapterId: string;
  durationMinutes: number;
  totalQuestions: number;
  windowStart: string;
  windowEnd: string;
  availableBefore: number;
  upcomingBefore: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  isPublished: boolean;
  isHidden: boolean;
};

function emptyExamForm(defaults?: Partial<ExamFormState>): ExamFormState {
  const start = new Date();
  start.setDate(start.getDate() + 7);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    sessionId: "",
    title: "",
    subtitle: "",
    level: "foundation",
    subjectId: "",
    chapterId: "",
    durationMinutes: 60,
    totalQuestions: 50,
    windowStart: toDatetimeLocal(start.toISOString()),
    windowEnd: toDatetimeLocal(end.toISOString()),
    availableBefore: 15,
    upcomingBefore: 1440,
    randomizeQuestions: true,
    randomizeOptions: true,
    isPublished: false,
    isHidden: false,
    ...defaults,
  };
}

export function AdminExams() {
  const queryClient = useQueryClient();
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | ExamAvailability | "archived" | "hidden">("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ExamBatchExamRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExamBatchExamRow | null>(null);
  const [confirmClose, setConfirmClose] = useState<ExamBatchExamRow | null>(null);
  const [form, setForm] = useState<ExamFormState>(emptyExamForm());
  const [busyId, setBusyId] = useState<string | null>(null);

  // Attach-questions picker state (per-open-dialog).
  const [selectedQIds, setSelectedQIds] = useState<string[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerPage, setPickerPage] = useState(1);
  const [previewOnly, setPreviewOnly] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [pickerPageSize, setPickerPageSize] = useState<20 | 50 | 100>(20);
  const dialogOpen = createOpen || editing !== null;

  const sessionsQ = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", { archived: true }],
    queryFn: () => adminListExamBatchSessions({ data: { includeArchived: true } }),
  });
  const examsQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "exams",
      { sessionId: sessionFilter === "all" ? undefined : sessionFilter },
    ],
    queryFn: () =>
      adminListExamBatchExams({
        data: {
          sessionId: sessionFilter === "all" ? undefined : sessionFilter,
          includeArchived: true,
        },
      }),
  });
  const subjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "subjects", { level: form.level }],
    queryFn: () => adminListExamBatchSubjects({ data: { level: form.level } }),
    enabled: createOpen || editing !== null,
  });
  const chaptersQ = useQuery({
    queryKey: ["exam-batch", "admin", "chapters", { subjectId: form.subjectId }],
    queryFn: () => adminListExamBatchChapters({ data: { subjectId: form.subjectId } }),
    enabled: dialogOpen && !!form.subjectId,
  });
  const attachedQ = useQuery({
    queryKey: ["exam-batch", "admin", "exam-questions", editing?.id],
    queryFn: () =>
      adminListExamBatchExamQuestions({ data: { id: editing!.id } }),
    enabled: !!editing,
  });
  const mcqPickerQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "mcqs-picker",
      {
        subjectId: form.subjectId,
        chapterId: form.chapterId || null,
        search: pickerSearch.trim() || undefined,
        page: pickerPage,
        pageSize: pickerPageSize,
      },
    ],

    queryFn: () =>
      adminListExamBatchMcqs({
        data: {
          subjectId: form.subjectId || undefined,
          chapterId: form.chapterId || undefined,
          search: pickerSearch.trim() || undefined,
          status: "published" as const,
          page: pickerPage,
          pageSize: pickerPageSize,
        },
      }),
    enabled: dialogOpen && !!form.subjectId && !previewOnly,
  });

  const invalidate = () => {
    notifyExamBatchRealtime("exam_batch_exams");
    return queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
  };

  // Sync selectedQIds when the attached list loads for the editing target.
  useEffect(() => {
    if (editing && attachedQ.data) setSelectedQIds(attachedQ.data);
  }, [editing, attachedQ.data]);
  // Reset picker state whenever the dialog opens/closes.
  useEffect(() => {
    if (!dialogOpen) {
      setSelectedQIds([]);
      setPickerSearch("");
      setPickerPage(1);
      setPreviewOnly(false);
    }
  }, [dialogOpen]);

  const createMut = useMutation({
    mutationFn: (payload: any) => adminCreateExamBatchExam({ data: payload }),
    onError: (e: Error) => toast.error(e.message || "Create failed"),
  });
  const updateMut = useMutation({
    mutationFn: (payload: any) => adminUpdateExamBatchExam({ data: payload }),
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteExamBatchExam({ data: { id } }),
    onSuccess: () => {
      toast.success("Exam deleted");
      setConfirmDelete(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Delete failed"),
  });
  const publishMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      adminSetExamBatchExamPublished({ data: { id, value } }),
    onMutate: (v) => setBusyId(v.id),
    onSettled: () => setBusyId(null),
    onSuccess: (_r, v) => {
      toast.success(v.value ? "Published" : "Unpublished");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const archiveMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      adminSetExamBatchExamArchived({ data: { id, value } }),
    onMutate: (v) => setBusyId(v.id),
    onSettled: () => setBusyId(null),
    onSuccess: (_r, v) => {
      toast.success(v.value ? "Archived" : "Unarchived");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const hideMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      adminSetExamBatchExamHidden({ data: { id, value } }),
    onMutate: (v) => setBusyId(v.id),
    onSettled: () => setBusyId(null),
    onSuccess: (_r, v) => {
      toast.success(v.value ? "Hidden" : "Visible");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const closeMut = useMutation({
    mutationFn: (id: string) => adminForceCloseExamBatchExam({ data: { id } }),
    onSuccess: () => {
      toast.success("Exam force-closed");
      setConfirmClose(null);
      void invalidate();
      // Force-close synchronously freezes the leaderboard inside a DB
      // trigger. Postgres realtime *should* fan those writes out to every
      // enrolled student, but the events are RLS-filtered and can arrive
      // late (or not at all) on flaky sockets — students would then see a
      // stale "not yet published" board until they refresh manually.
      // Broadcasts bypass RLS and always deliver, so we kick every
      // subscribed client to refetch the student-scoped leaderboard queries
      // in lock-step with the admin panel.
      notifyExamBatchRealtime("exam_batch_exams");
      notifyExamBatchRealtime("exam_batch_leaderboards");
      notifyExamBatchRealtime("exam_batch_leaderboard_entries");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sessions = sessionsQ.data ?? [];
  const sessionMap = useMemo(() => {
    const m = new Map<string, ExamBatchSessionRow>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);
  const subjects = subjectsQ.data ?? [];
  const subjectMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subjects as any[]) m.set(s.id, s.name);
    return m;
  }, [subjects]);

  const rows = examsQ.data ?? [];
  const filtered = useMemo(() => {
    let out = rows;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      out = out.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.subtitle ?? "").toLowerCase().includes(q) ||
          r.level.toLowerCase().includes(q),
      );
    }
    if (statusFilter !== "all") {
      out = out.filter((r) => {
        if (statusFilter === "archived") return r.is_archived;
        if (statusFilter === "hidden") return r.is_hidden;
        return examAvailability(r) === statusFilter;
      });
    }
    return out;
  }, [rows, search, statusFilter]);

  const openEdit = (row: ExamBatchExamRow) => {
    setEditing(row);
    setForm({
      sessionId: row.session_id,
      title: row.title,
      subtitle: row.subtitle ?? "",
      level: row.level,
      subjectId: row.subject_id,
      chapterId: row.chapter_id ?? "",
      durationMinutes: row.duration_minutes,
      totalQuestions: row.total_questions,
      windowStart: toDatetimeLocal(row.window_start),
      windowEnd: toDatetimeLocal(row.window_end),
      availableBefore: row.available_before_minutes,
      upcomingBefore: row.upcoming_before_minutes,
      randomizeQuestions: row.randomize_questions,
      randomizeOptions: row.randomize_options,
      isPublished: row.is_published,
      isHidden: row.is_hidden,
    });
  };

  const submit = async () => {
    const ws = toIsoOrNull(form.windowStart);
    const we = toIsoOrNull(form.windowEnd);
    if (!form.sessionId) return toast.error("Session required");
    if (!form.subjectId) return toast.error("Subject required");
    if (!form.chapterId) return toast.error("Chapter required");
    const chapterList = (chaptersQ.data ?? []) as Array<{ id: string; name: string }>;
    const chapter = chapterList.find((c) => c.id === form.chapterId);
    const derivedTitle = (chapter?.name ?? form.title).trim();
    if (!derivedTitle) return toast.error("Selected chapter has no name");
    if (!ws || !we) return toast.error("Valid window required");
    if (new Date(ws).getTime() >= new Date(we).getTime())
      return toast.error("Window end must be after start");
    if (form.isPublished && selectedQIds.length === 0) {
      return toast.error("Attach at least one question before publishing.");
    }
    const payload = {
      title: derivedTitle,
      subtitle: form.subtitle.trim() || undefined,
      level: form.level.trim(),
      subjectId: form.subjectId,
      chapterId: form.chapterId,
      durationMinutes: Number(form.durationMinutes),
      totalQuestions: Number(form.totalQuestions),
      windowStart: ws,
      windowEnd: we,
      availableBefore: Number(form.availableBefore),
      upcomingBefore: Number(form.upcomingBefore),
      randomizeQuestions: form.randomizeQuestions,
      randomizeOptions: form.randomizeOptions,
      status: "active" as const,
      isPublished: form.isPublished,
      isHidden: form.isHidden,
    };

    try {
      let examId: string;
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...payload });
        examId = editing.id;
      } else {
        const created = (await createMut.mutateAsync({
          sessionId: form.sessionId,
          ...payload,
        })) as { id: string };
        examId = created.id;
      }
      // Attach the currently selected question set (idempotent overwrite).
      // The server refuses when attempts exist — surface that as a warning.
      try {
        await adminSetExamBatchExamQuestions({
          data: { examId, questionIds: selectedQIds },
        });
      } catch (e) {
        toast.warning(
          (e as Error)?.message ??
            "Exam saved but attaching questions failed.",
        );
      }
      toast.success(editing ? "Exam updated" : "Exam created");
      setCreateOpen(false);
      setEditing(null);
      setForm(emptyExamForm());
      void invalidate();
    } catch {
      /* mutation onError already toasted */
    }
  };

  const availabilityTone: Record<ExamAvailability | "archived" | "hidden", string> = {
    live: "success",
    upcoming: "info",
    ended: "muted",
    draft: "warning",
    archived: "muted",
    hidden: "muted",
  };

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Exam management"
        description="Schedule, publish and force-close exams inside each session."
        icon={FileText}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["exam-batch"] })
              }
            >
              <RefreshCw className={cn("h-4 w-4", examsQ.isFetching && "animate-spin")} /> Refresh
            </button>
            <button
              type="button"
              className={primaryBtnCls}
              onClick={() => {
                const firstSession = sessions[0];
                setForm(
                  emptyExamForm({
                    sessionId: firstSession?.id ?? "",
                    level: firstSession?.level ?? "foundation",
                  }),
                );
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> New Exam
            </button>
          </div>
        }
      />

      <SectionCard>
        <FilterBar
          searchPlaceholder="Search exams by title or level…"
          onSearchChange={setSearch}
        >
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="all">All sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </FilterBar>

        <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {(["all", "live", "upcoming", "ended", "draft", "archived", "hidden"] as const).map((s) => (
            <FilterChip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </FilterChip>
          ))}
        </div>

        {examsQ.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : examsQ.isError ? (
          <EmptyState icon={FileText}
            title="Failed to load exams"
            description={(examsQ.error as Error)?.message ?? "Unknown error"}
            action={
              <button
                onClick={() => examsQ.refetch()}
                className={primaryBtnCls}
              >
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileText}
            title="No exams yet"
            description="Create an exam to schedule your first mock or chapter test."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">

              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2">Exam</th>
                  <th className="px-3 py-2">Session</th>
                  <th className="px-3 py-2">Window</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Questions</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const availability = examAvailability(r);
                  const badge = r.is_archived
                    ? "archived"
                    : r.is_hidden
                      ? "hidden"
                      : availability;
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-border/60 hover:bg-muted/30"
                    >
                      <td className="px-3 py-3">
                        <p className="font-semibold">{r.title}</p>
                        {r.subtitle && (
                          <p className="text-xs text-muted-foreground">{r.subtitle}</p>
                        )}
                        <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                          {r.level}
                        </p>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {sessionMap.get(r.session_id)?.title ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <p>{format(new Date(r.window_start), "PPp")}</p>
                        <p className="text-muted-foreground">
                          → {format(new Date(r.window_end), "PPp")}
                        </p>
                      </td>
                      <td className="px-3 py-3 tabular-nums">{r.duration_minutes}m</td>
                      <td className="px-3 py-3 tabular-nums">{r.total_questions}</td>
                      <td className="px-3 py-3">
                        <StatusBadge status={badge} />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-background/60 text-muted-foreground hover:bg-muted"
                              disabled={busyId === r.id}
                            >
                              {busyId === r.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreHorizontal className="h-4 w-4" />
                              )}
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(r)}>
                              <Pencil className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                publishMut.mutate({ id: r.id, value: !r.is_published })
                              }
                            >
                              {r.is_published ? (
                                <>
                                  <Square className="mr-2 h-4 w-4" /> Unpublish
                                </>
                              ) : (
                                <>
                                  <Play className="mr-2 h-4 w-4" /> Publish
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                hideMut.mutate({ id: r.id, value: !r.is_hidden })
                              }
                            >
                              {r.is_hidden ? (
                                <>
                                  <Eye className="mr-2 h-4 w-4" /> Show
                                </>
                              ) : (
                                <>
                                  <EyeOff className="mr-2 h-4 w-4" /> Hide
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                archiveMut.mutate({ id: r.id, value: !r.is_archived })
                              }
                            >
                              {r.is_archived ? (
                                <>
                                  <ArchiveRestore className="mr-2 h-4 w-4" /> Unarchive
                                </>
                              ) : (
                                <>
                                  <Archive className="mr-2 h-4 w-4" /> Archive
                                </>
                              )}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setConfirmClose(r)}
                              disabled={!!r.force_closed_at}
                            >
                              <Square className="mr-2 h-4 w-4" /> Force close
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setConfirmDelete(r)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <Dialog
        open={createOpen || editing !== null}
        onOpenChange={(v) => {
          if (!v) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit exam" : "New exam"}</DialogTitle>
            <DialogDescription>
              Configure the exam window, question count and visibility. Attach questions from
              the question bank before publishing.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="sm:col-span-2 block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Subtitle
              </span>
              <input
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Session
              </span>
              <select
                value={form.sessionId}
                onChange={(e) => {
                  const s = sessionMap.get(e.target.value);
                  setForm({
                    ...form,
                    sessionId: e.target.value,
                    level: s?.level ?? form.level,
                    subjectId: "",
                    chapterId: "",
                    title: "",
                  });
                }}
                disabled={!!editing}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              >
                <option value="">Select session…</option>
                {sessions
                  .filter((s) => !s.is_archived)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.level})
                    </option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Subject
              </span>
              <select
                value={form.subjectId}
                onChange={(e) =>
                  setForm({ ...form, subjectId: e.target.value, chapterId: "", title: "" })
                }
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              >
                <option value="">
                  {subjectsQ.isLoading ? "Loading subjects…" : "Select subject…"}
                </option>
                {(subjects as any[]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="sm:col-span-2 block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Chapter
              </span>
              <select
                value={form.chapterId}
                onChange={(e) => {
                  const chapters = (chaptersQ.data ?? []) as Array<{ id: string; name: string }>;
                  const picked = chapters.find((c) => c.id === e.target.value);
                  setForm({
                    ...form,
                    chapterId: e.target.value,
                    title: picked?.name ?? "",
                  });
                }}
                disabled={!form.subjectId}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              >
                <option value="">
                  {!form.subjectId
                    ? "Select subject first…"
                    : chaptersQ.isLoading
                      ? "Loading chapters…"
                      : "Select chapter…"}
                </option>
                {((chaptersQ.data ?? []) as any[]).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {form.title && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Exam title: <span className="font-semibold text-foreground">{form.title}</span>
                </p>
              )}
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Duration (minutes)
              </span>
              <input
                type="number"
                min={1}
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Total questions
              </span>
              <input
                type="number"
                min={1}
                value={form.totalQuestions}
                onChange={(e) => setForm({ ...form, totalQuestions: Number(e.target.value) })}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Window start
              </span>
              <input
                type="datetime-local"
                value={form.windowStart}
                onChange={(e) => setForm({ ...form, windowStart: e.target.value })}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Window end
              </span>
              <input
                type="datetime-local"
                value={form.windowEnd}
                onChange={(e) => setForm({ ...form, windowEnd: e.target.value })}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Available before (min)
              </span>
              <input
                type="number"
                min={0}
                value={form.availableBefore}
                onChange={(e) => setForm({ ...form, availableBefore: Number(e.target.value) })}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Upcoming before (min)
              </span>
              <input
                type="number"
                min={0}
                value={form.upcomingBefore}
                onChange={(e) => setForm({ ...form, upcomingBefore: Number(e.target.value) })}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.randomizeQuestions}
                onChange={(e) => setForm({ ...form, randomizeQuestions: e.target.checked })}
              />
              Randomize questions
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.randomizeOptions}
                onChange={(e) => setForm({ ...form, randomizeOptions: e.target.checked })}
              />
              Randomize options
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
              />
              Published
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isHidden}
                onChange={(e) => setForm({ ...form, isHidden: e.target.checked })}
              />
              Hidden from students
            </label>
          </div>

          {/* --- Attach Questions --- */}
          <div className="mt-5 rounded-2xl border border-border/60 bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">
                  Attach questions
                </span>
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {selectedQIds.length} selected
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={ghostBtnCls}
                  onClick={() => setPreviewOnly((v) => !v)}
                  disabled={selectedQIds.length === 0}
                >
                  <Eye className="h-4 w-4" />
                  {previewOnly ? "Show picker" : "Preview selected"}
                </button>
                <button
                  type="button"
                  className={ghostBtnCls}
                  onClick={() => setBulkOpen(true)}
                  disabled={!form.subjectId}
                  title={
                    form.subjectId
                      ? "Bulk upload MCQs to the question bank"
                      : "Pick a subject first"
                  }
                >
                  <Upload className="h-4 w-4" /> Bulk upload
                </button>
              </div>
            </div>

            {!form.subjectId ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Select a subject to start attaching questions.
              </p>
            ) : previewOnly ? (
              <PreviewSelectedQuestions
                ids={selectedQIds}
                subjectId={form.subjectId}
                chapterId={form.chapterId}
                onRemove={(id) =>
                  setSelectedQIds((prev) => prev.filter((x) => x !== id))
                }
                onClear={() => setSelectedQIds([])}
              />
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={pickerSearch}
                      onChange={(e) => {
                        setPickerSearch(e.target.value);
                        setPickerPage(1);
                      }}
                      placeholder="Search questions…"
                      className="h-9 w-full rounded-xl border border-input bg-background/60 pl-9 pr-3 text-sm"
                    />
                  </div>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>Per page</span>
                    <select
                      className="h-9 rounded-xl border border-input bg-background/60 px-2 text-xs"
                      value={pickerPageSize}
                      onChange={(e) => {
                        setPickerPageSize(Number(e.target.value) as 20 | 50 | 100);
                        setPickerPage(1);
                      }}
                    >
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={ghostBtnCls}
                    onClick={() => {
                      const rows = (mcqPickerQ.data?.rows ?? []) as any[];
                      const ids = rows.map((r) => r.id as string);
                      setSelectedQIds((prev) => Array.from(new Set([...prev, ...ids])));
                    }}
                    disabled={((mcqPickerQ.data?.rows ?? []) as any[]).length === 0}
                  >
                    Select all
                  </button>
                  <button
                    type="button"
                    className={ghostBtnCls}
                    onClick={() => {
                      const rows = (mcqPickerQ.data?.rows ?? []) as any[];
                      const ids = new Set(rows.map((r) => r.id as string));
                      setSelectedQIds((prev) => prev.filter((x) => !ids.has(x)));
                    }}
                    disabled={((mcqPickerQ.data?.rows ?? []) as any[]).length === 0}
                  >
                    Deselect all
                  </button>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {selectedQIds.length} selected across all pages
                </p>


                <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-border/60 bg-background/60">
                  {mcqPickerQ.isLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : mcqPickerQ.isError ? (
                    <p className="px-3 py-6 text-center text-xs text-destructive">
                      {(mcqPickerQ.error as Error)?.message ??
                        "Failed to load questions."}
                    </p>
                  ) : (mcqPickerQ.data?.rows ?? []).length === 0 ? (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                      No published MCQs match. Try bulk upload.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {((mcqPickerQ.data?.rows ?? []) as any[]).map((row) => {
                        const checked = selectedQIds.includes(row.id);
                        return (
                          <li
                            key={row.id}
                            className="flex items-start gap-3 px-3 py-2 hover:bg-muted/40"
                          >
                            <input
                              type="checkbox"
                              className="mt-1"
                              checked={checked}
                              onChange={(e) =>
                                setSelectedQIds((prev) =>
                                  e.target.checked
                                    ? Array.from(new Set([...prev, row.id]))
                                    : prev.filter((x) => x !== row.id),
                                )
                              }
                            />
                            <div className="min-w-0 flex-1">
                              <p className="line-clamp-2 text-sm">
                                {row.question}
                              </p>
                              <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                                {row.chapter_name ?? row.subject_name ?? "—"}
                                {row.difficulty ? ` · ${row.difficulty}` : ""}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {mcqPickerQ.data && mcqPickerQ.data.count > pickerPageSize && (
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Page {mcqPickerQ.data.page} ·{" "}
                      {mcqPickerQ.data.count} total
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className={ghostBtnCls}
                        onClick={() => setPickerPage((p) => Math.max(1, p - 1))}
                        disabled={pickerPage === 1}
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={ghostBtnCls}
                        onClick={() =>
                          setPickerPage((p) =>
                            p * pickerPageSize < (mcqPickerQ.data?.count ?? 0)
                              ? p + 1
                              : p,
                          )
                        }
                        disabled={
                          pickerPage * pickerPageSize >=
                          (mcqPickerQ.data?.count ?? 0)
                        }
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => {
                setCreateOpen(false);
                setEditing(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className={primaryBtnCls}
              onClick={submit}
              disabled={createMut.isPending || updateMut.isPending}
            >
              {(createMut.isPending || updateMut.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {editing ? "Save changes" : "Create exam"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {bulkOpen && (
        <ExamBatchBulkUploadMcqsDialog
          initialLevel={form.level}
          initialSubjectId={form.subjectId}
          initialChapterId={form.chapterId || undefined}
          lockScope={!!form.chapterId}
          onImported={() => {
            void queryClient.invalidateQueries({
              queryKey: ["exam-batch", "admin", "mcqs-picker"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["exam-batch", "admin", "mcqs"],
            });
          }}
          onClose={() => setBulkOpen(false)}
        />
      )}

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete exam?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes “{confirmDelete?.title}”. Exams with attempts cannot be
              deleted — archive them instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmClose} onOpenChange={(v) => !v && setConfirmClose(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force-close exam?</AlertDialogTitle>
            <AlertDialogDescription>
              This auto-submits every in-progress attempt for “{confirmClose?.title}”. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmClose && closeMut.mutate(confirmClose.id)}
            >
              Force close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* silence unused subject-name lookup on `subjectMap` */}
      <span className="hidden">{subjectMap.size}</span>
    </>
  );
}

/* ============================================================
 * 2. LEADERBOARD
 * ============================================================ */

export function AdminLeaderboard() {
  const queryClient = useQueryClient();
  // Cascading filter hierarchy: Session → Subject → Exam.
  // Empty string means "not selected yet" — children stay disabled and no
  // data is fetched until the parent is chosen. There is intentionally no
  // "All sessions" / "All subjects" option: loading every leaderboard at
  // once bypasses the required cascading flow and floods the response.
  const [sessionFilter, setSessionFilter] = useState<string>("");
  const [subjectFilter, setSubjectFilter] = useState<string>("");
  const [examId, setExamId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const sessionsQ = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", { archived: true }],
    queryFn: () => adminListExamBatchSessions({ data: { includeArchived: true } }),
  });
  const subjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "subjects", "all"],
    queryFn: () => adminListExamBatchSubjects({ data: {} }),
  });
  const boardsQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "leaderboards",
      { sessionId: sessionFilter || undefined },
    ],
    queryFn: () =>
      adminListExamBatchLeaderboards({
        data: {
          sessionId: sessionFilter,
          days: 45,
        },
      }),
    // Do NOT preload every session's leaderboards — cascade requires session first.
    enabled: !!sessionFilter,
  });
  const examsQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "exams-for-leaderboard",
      { sessionId: sessionFilter || undefined },
    ],
    queryFn: () =>
      adminListExamBatchExams({
        data: {
          sessionId: sessionFilter,
          includeArchived: true,
        },
      }),
    // Session-scoped only. Never load all exams.
    enabled: !!sessionFilter,
  });
  const detailQ = useQuery({
    queryKey: ["exam-batch", "admin", "leaderboard", examId, { search, offset, limit }],
    queryFn: () =>
      adminGetExamBatchLeaderboard({
        data: {
          examId: examId!,
          search: search.trim() || undefined,
          offset,
          limit,
        },
      }),
    enabled: !!examId,
  });

  const recalcMut = useMutation({
    mutationFn: () =>
      adminRecalculateExamBatch({
        data: { examId: examId ?? undefined, scope: "leaderboard" },
      }),
    onSuccess: () => {
      toast.success("Leaderboard recalculated");
      void queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
      // Broadcast to every student socket — RLS-filtered postgres_changes
      // can silently drop leaderboard events for individual students; a
      // channel broadcast reaches every subscriber so the Student
      // Leaderboard refetches at the same instant as this Admin panel.
      notifyExamBatchRealtime("exam_batch_leaderboards");
      notifyExamBatchRealtime("exam_batch_leaderboard_entries");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const deleteMut = useMutation({
    mutationFn: (targetExamId: string) =>
      adminDeleteExamBatchLeaderboard({ data: { examId: targetExamId } }),
    onSuccess: (_res, targetExamId) => {
      toast.success("Leaderboard deleted successfully.");
      if (examId === targetExamId) setExamId(null);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["exam-batch", "admin", "leaderboards"] });
      void queryClient.invalidateQueries({ queryKey: ["exam-batch", "admin", "leaderboard"] });
      void queryClient.invalidateQueries({ queryKey: ["exam-batch", "student", "leaderboard"] });
      void queryClient.invalidateQueries({ queryKey: ["exam-batch", "student", "history"] });
      notifyExamBatchRealtime("exam_batch_leaderboards");
      notifyExamBatchRealtime("exam_batch_leaderboard_entries");
    },
    onError: (e: Error) => toast.error(e.message || "Failed to delete leaderboard"),
  });

  const [pdfColorOpen, setPdfColorOpen] = useState(false);
  const [pdfColor, setPdfColor] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const remembered = window.sessionStorage.getItem("exam-batch:pdf-theme");
      if (remembered) return remembered;
    }
    return DEFAULT_PDF_THEME.primary;
  });

  const exportMut = useMutation({
    mutationFn: (opts: { format: "pdf" | "txt"; themeColor?: string }) =>
      adminExportExamBatchLeaderboard({
        data: {
          examId: examId!,
          format: opts.format,
          scope: "full",
          topN: 100,
          ...(opts.themeColor ? { themeColor: opts.themeColor } : {}),
        },
      }),
    onSuccess: (art) => {
      downloadBase64(art.filename, art.mimeType, art.contentBase64);
      toast.success("Export downloaded");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openPdfExport = () => {
    if (!examId) return;
    setPdfColorOpen(true);
  };
  const confirmPdfExport = () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("exam-batch:pdf-theme", pdfColor);
    }
    setPdfColorOpen(false);
    exportMut.mutate({ format: "pdf", themeColor: pdfColor });
  };

  const sessions = sessionsQ.data ?? [];
  const subjects = (subjectsQ.data ?? []) as Array<{ id: string; name: string }>;
  const boards = boardsQ.data ?? [];
  const exams = examsQ.data ?? [];
  const examMap = useMemo(() => {
    const m = new Map<string, ExamBatchExamRow>();
    for (const e of exams) m.set(e.id, e);
    return m;
  }, [exams]);

  // Subject options limited to subjects present in the current session's exams.
  const subjectOptions = useMemo(() => {
    if (!sessionFilter) return [];
    const ids = new Set<string>();
    for (const e of exams) if (e.subject_id) ids.add(e.subject_id);
    return subjects
      .filter((s) => ids.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exams, subjects, sessionFilter]);

  // Reset subject/exam when session changes and options invalidate (defence
  // in depth — the onChange handler also resets, but background refetches
  // can drop the previously selected subject from the list).
  useEffect(() => {
    if (subjectFilter && !subjectOptions.some((s) => s.id === subjectFilter)) {
      setSubjectFilter("");
      setExamId(null);
    }
  }, [subjectFilter, subjectOptions]);

  // Frozen boards visible in the picker are strictly scoped to the chosen
  // Session + Subject. No subject → no exams shown (empty state guides the
  // user to the next step). No stale exams from a previous selection.
  const filteredBoards = useMemo(() => {
    if (!sessionFilter || !subjectFilter) return [];
    return boards.filter((b) => examMap.get(b.exam_id)?.subject_id === subjectFilter);
  }, [boards, sessionFilter, subjectFilter, examMap]);

  // Reset selected exam if it no longer matches the filters.
  useEffect(() => {
    if (examId && !filteredBoards.some((b) => b.exam_id === examId)) {
      setExamId(null);
    }
  }, [examId, filteredBoards]);

  const detail = detailQ.data;

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Batch leaderboard"
        description="Frozen rankings from the last 45 days. Select an exam to view entries and export."
        icon={Trophy}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => recalcMut.mutate()}
              disabled={!examId || recalcMut.isPending}
            >
              {recalcMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Recalculate
            </button>
            <button
              type="button"
              className={ghostBtnCls}
              onClick={openPdfExport}
              disabled={!examId || exportMut.isPending || detail?.exam.status !== "frozen"}
            >
              <Download className="h-4 w-4" /> PDF
            </button>
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => exportMut.mutate({ format: "txt" })}
              disabled={!examId || exportMut.isPending || detail?.exam.status !== "frozen"}
            >
              <FileType2 className="h-4 w-4" /> TXT
            </button>
            <button
              type="button"
              className={cn(ghostBtnCls, "border-destructive/40 text-destructive hover:bg-destructive/10")}
              onClick={() => examId && setDeleteTarget(examId)}
              disabled={!examId || deleteMut.isPending}
              title="Delete leaderboard"
            >
              {deleteMut.isPending && deleteMut.variables === examId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <SectionCard title="Frozen exams" description="Filter and pick an exam" className="lg:col-span-1">
          <div className="mb-3 space-y-2">
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Session</label>
            <select
              value={sessionFilter}
              onChange={(e) => {
                setSessionFilter(e.target.value);
                setSubjectFilter("");
                setExamId(null);
                setOffset(0);
              }}
              className="h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
            >
              <option value="">Select session…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Subject</label>
            <select
              value={subjectFilter}
              onChange={(e) => {
                setSubjectFilter(e.target.value);
                setExamId(null);
                setOffset(0);
              }}
              disabled={!sessionFilter || subjectOptions.length === 0}
              className="h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm disabled:opacity-60"
            >
              <option value="">
                {!sessionFilter
                  ? "Select session first…"
                  : subjectOptions.length === 0
                    ? "No subjects for this session"
                    : "Select subject…"}
              </option>
              {subjectOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {!sessionFilter ? (
            <EmptyState icon={FileText}
              title="Select a session"
              description="Pick a session to see subjects and their frozen exams."
            />
          ) : !subjectFilter ? (
            <EmptyState icon={FileText}
              title="Select a subject"
              description="Choose a subject to list frozen exams for that subject."
            />
          ) : boardsQ.isLoading || examsQ.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredBoards.length === 0 ? (
            <EmptyState icon={FileText}
              title="No frozen leaderboards"
              description="Leaderboards freeze automatically after each exam window ends."
            />
          ) : (
            <ul className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
              {filteredBoards.map((b) => {
                const ex = examMap.get(b.exam_id);
                const active = examId === b.exam_id;
                return (
                  <li key={b.exam_id} className="group relative">
                    <button
                      onClick={() => {
                        setExamId(b.exam_id);
                        setOffset(0);
                      }}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 pr-10 text-left text-xs transition",
                        active
                          ? "border-primary bg-primary/10"
                          : "border-border/60 hover:bg-muted/40",
                      )}
                    >
                      <p className="truncate font-semibold text-sm">
                        {ex?.title ?? b.exam_id.slice(0, 8)}
                      </p>
                      <p className="text-muted-foreground">
                        {b.frozen_at ? format(new Date(b.frozen_at), "PPp") : "—"}
                      </p>
                      <p className="text-muted-foreground">
                        {b.entry_count} entries · v{b.version}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label="Delete leaderboard"
                      title="Delete leaderboard"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(b.exam_id);
                      }}
                      disabled={deleteMut.isPending}
                      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {deleteMut.isPending && deleteMut.variables === b.exam_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard className="lg:col-span-3">
          {!examId ? (
            <EmptyState icon={FileText}
              title="Pick an exam"
              description="Select a frozen exam from the list to view its ranking."
            />
          ) : detailQ.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detailQ.isError ? (
            <EmptyState icon={FileText}
              title="Failed to load leaderboard"
              description={(detailQ.error as Error)?.message ?? "Unknown error"}
              action={
                <button className={primaryBtnCls} onClick={() => detailQ.refetch()}>
                  <RefreshCw className="h-4 w-4" /> Retry
                </button>
              }
            />
          ) : detail ? (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg font-semibold">{detail.exam.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    Status: {detail.exam.status} · {detail.exam.entryCount} entries · Frozen{" "}
                    {detail.exam.frozenAt ? format(new Date(detail.exam.frozenAt), "PPp") : "—"}
                  </p>
                </div>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setOffset(0);
                  }}
                  placeholder="Search by name, email or student ID…"
                  className="h-10 w-64 rounded-xl border border-input bg-background/60 px-3 text-sm"
                />
              </div>
              {detail.exam.status !== "frozen" ? (
                <EmptyState icon={FileText}
                  title="Leaderboard not frozen"
                  description="Ranking becomes available after the exam window ends."
                />
              ) : detail.entries.length === 0 ? (
                <EmptyState icon={FileText} title="No entries" description="No results match your filter." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Student</th>
                        <th className="px-3 py-2">Marks</th>
                        <th className="px-3 py-2">%</th>
                        <th className="px-3 py-2">Correct/Wrong/Skip</th>
                        <th className="px-3 py-2">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.entries.map((e) => (
                        <tr key={e.attempt_id} className="border-t border-border/60">
                          <td className="px-3 py-2 font-semibold tabular-nums">{e.rank}</td>
                          <td className="px-3 py-2">
                            <p className="font-semibold">
                              {e.display_name ?? `Student #${e.student_id}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {e.email ?? `ID ${e.student_id}`}
                            </p>
                          </td>
                          <td className="px-3 py-2 tabular-nums">
                            {e.marks}/{e.max_marks}
                          </td>
                          <td className="px-3 py-2 tabular-nums">{e.percentage.toFixed(2)}%</td>
                          <td className="px-3 py-2 tabular-nums text-xs">
                            {e.correct} / {e.wrong} / {e.skipped}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-xs">
                            {Math.floor(e.time_used_seconds / 60)}m{" "}
                            {e.time_used_seconds % 60}s
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Showing {offset + 1}–{offset + detail.entries.length} of {detail.total}
                    </span>
                    <div className="flex gap-2">
                      <button
                        className={ghostBtnCls}
                        disabled={offset === 0}
                        onClick={() => setOffset(Math.max(0, offset - limit))}
                      >
                        Previous
                      </button>
                      <button
                        className={ghostBtnCls}
                        disabled={offset + detail.entries.length >= detail.total}
                        onClick={() => setOffset(offset + limit)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </SectionCard>
      </div>

      <Dialog open={pdfColorOpen} onOpenChange={setPdfColorOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose PDF theme color</DialogTitle>
            <DialogDescription>
              Pick the color used for headers, titles and highlights in the exported PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-2 sm:grid-cols-3">
            {PDF_THEME_PRESETS.map((t) => {
              const active = t.primary.toLowerCase() === pdfColor.toLowerCase();
              return (
                <button
                  key={t.name}
                  type="button"
                  onClick={() => setPdfColor(t.primary)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border p-2 text-left text-xs transition",
                    active
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border hover:border-primary/40",
                  )}
                >
                  <span
                    className="h-6 w-6 shrink-0 rounded-md ring-1 ring-black/10"
                    style={{ background: t.primary }}
                  />
                  <span className="font-medium">{t.name}</span>
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => setPdfColorOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={primaryBtnCls}
              onClick={confirmPdfExport}
              disabled={exportMut.isPending}
            >
              {exportMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Download PDF
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleteMut.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Leaderboard?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the leaderboard and all ranking entries
              for this exam. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget && !deleteMut.isPending) deleteMut.mutate(deleteTarget);
              }}
              disabled={deleteMut.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Deleting…
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ============================================================
 * 3. ANALYTICS
 * ============================================================ */

export function AdminAnalytics() {
  const queryClient = useQueryClient();
  const [sessionFilter, setSessionFilter] = useState<string>("all");

  const sessionsQ = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", { archived: true }],
    queryFn: () => adminListExamBatchSessions({ data: { includeArchived: true } }),
  });
  const scope = sessionFilter === "all" ? {} : { sessionId: sessionFilter };
  const analyticsQ = useQuery({
    queryKey: ["exam-batch", "admin", "analytics", scope],
    queryFn: () => adminGetExamBatchAnalytics({ data: scope }),
  });
  // Real subject names — resolves subject UUIDs coming back from the analytics
  // snapshot into human labels. If listSubjects errors we fall back to IDs.
  const subjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "analytics", "subject-index"],
    queryFn: () => adminListExamBatchSubjects({ data: {} }),
    staleTime: 60_000,
  });

  const recalcMut = useMutation({
    mutationFn: () =>
      adminRecalculateExamBatch({
        data: { sessionId: sessionFilter === "all" ? undefined : sessionFilter, scope: "analytics" },
      }),
    onSuccess: () => {
      toast.success("Analytics rebuilt");
      void queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const a = analyticsQ.data;
  const sessions = sessionsQ.data ?? [];
  const subjectNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subjectsQ.data ?? []) m.set(s.id, s.name);
    return m;
  }, [subjectsQ.data]);

  // Derived KPIs — computed from the real analytics payload, no mock data.
  const derived = useMemo(() => {
    if (!a) return null;
    const exams = a.exams ?? [];
    const highest = exams.length ? Math.max(...exams.map((e) => e.highestPercentage)) : 0;
    const lowestPool = exams.filter((e) => e.totalAttempts > 0);
    const lowest = lowestPool.length ? Math.min(...lowestPool.map((e) => e.lowestPercentage)) : 0;
    const participation =
      exams.length && a.eligibleStudents
        ? Math.round(
            (exams.reduce((sum, e) => sum + e.totalAttempts, 0) /
              (a.eligibleStudents * exams.length)) *
              100,
          )
        : 0;
    const attendance =
      exams.length
        ? Math.round(
            (exams.reduce((sum, e) => sum + (e.participation || 0), 0) / exams.length) * 100,
          )
        : 0;
    return { highest, lowest, participation, attendance };
  }, [a]);

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Batch analytics"
        description="Cohort-level performance, engagement and enrollment funnel — powered by real backend snapshots."
        icon={BarChart3}
        action={
          <div className="flex gap-2">
            <select
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm"
            >
              <option value="all">All sessions</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => recalcMut.mutate()}
              disabled={recalcMut.isPending}
            >
              {recalcMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Recalculate
            </button>
          </div>
        }
      />

      {analyticsQ.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : analyticsQ.isError ? (
        <EmptyState icon={FileText}
          title="Failed to load analytics"
          description={(analyticsQ.error as Error)?.message ?? "Unknown error"}
          action={
            <button className={primaryBtnCls} onClick={() => analyticsQ.refetch()}>
              <RefreshCw className="h-4 w-4" /> Retry
            </button>
          }
        />
      ) : a && derived ? (
        <>
          {/* Session-wise students + core participation KPIs */}
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatBox
              label={sessionFilter === "all" ? "Approved students" : "Session students"}
              value={a.approvedStudents}
              hint={`${a.pendingStudents} pending · ${a.eligibleStudents} eligible`}
            />
            <StatBox
              label="Approval rate"
              value={a.approvalRate}
              suffix="%"
              hint={`${a.approvedStudents} / ${a.eligibleStudents}`}
            />
            <StatBox
              label="Participation"
              value={derived.participation}
              suffix="%"
              hint={`${a.overall.attempts} attempts`}
            />
            <StatBox
              label="Attendance"
              value={derived.attendance}
              suffix="%"
              hint={`${a.overall.submitted} submitted`}
            />
          </div>

          {/* Score summary — student performance highlights */}
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatBox
              label="Average score"
              value={a.overall.averagePercentage}
              suffix="%"
              hint={`${a.overall.exams} exams`}
            />
            <StatBox label="Highest score" value={derived.highest} suffix="%" />
            <StatBox
              label="Lowest score"
              value={derived.lowest}
              suffix="%"
              hint={derived.lowest ? undefined : "No attempts yet"}
            />
            <StatBox
              label="Completion rate"
              value={
                a.overall.attempts
                  ? Math.round((a.overall.submitted / a.overall.attempts) * 100)
                  : 0
              }
              suffix="%"
              hint={`${a.overall.submitted}/${a.overall.attempts}`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <SectionCard
              title="Score trend"
              description="Average % over time"
              className="lg:col-span-2"
            >
              {a.overall.trend.length === 0 ? (
                <EmptyState icon={FileText} title="No trend data" description="Trend appears once exams complete." />
              ) : (
                <LineChart
                  series={[
                    {
                      label: "Avg %",
                      points: a.overall.trend.map((t) => Math.round(t.averagePercentage)),
                    },
                  ]}
                />
              )}
            </SectionCard>
            <SectionCard title="Approval" description="Approved vs pending">
              <div className="flex items-center justify-center py-2">
                <DonutChart
                  value={Math.round(a.approvalRate)}
                  label="Approved"
                  sub={`${a.approvedStudents} students`}
                  size={140}
                  stroke={14}
                />
              </div>
            </SectionCard>
          </div>

          {/* Per-exam student performance breakdown */}
          <SectionCard
            className="mt-4"
            title="Student performance by exam"
            description="Attendance, average, highest and lowest — real backend snapshot"
          >
            {a.exams.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No exam metrics yet"
                description="Metrics appear once attempts are submitted."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="py-2 pr-3 text-left font-semibold">Exam</th>
                      <th className="py-2 pr-3 text-right font-semibold">Participation</th>
                      <th className="py-2 pr-3 text-right font-semibold">Attendance</th>
                      <th className="py-2 pr-3 text-right font-semibold">Avg %</th>
                      <th className="py-2 pr-3 text-right font-semibold">Highest %</th>
                      <th className="py-2 pr-3 text-right font-semibold">Lowest %</th>
                      <th className="py-2 pr-3 text-right font-semibold">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.exams.map((e) => (
                      <tr key={e.examId} className="border-b border-border/40 last:border-0">
                        <td className="py-2 pr-3 font-medium text-foreground">{e.title}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {a.eligibleStudents
                            ? Math.round((e.totalAttempts / a.eligibleStudents) * 100)
                            : 0}
                          %
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {Math.round((e.participation || 0) * 100)}%
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {Math.round(e.averagePercentage)}%
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {Math.round(e.highestPercentage)}%
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {e.totalAttempts ? Math.round(e.lowestPercentage) : 0}%
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                          {e.totalSubmitted}/{e.totalAttempts}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Subject-wise students */}
          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SectionCard title="Subject-wise students" description="Attempts per subject">
              {a.subjects.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No subject data"
                  description="Subject metrics appear after students attempt exams."
                />
              ) : (
                <BarChart
                  data={a.subjects.slice(0, 8).map((s) => ({
                    label: subjectNameById.get(s.subjectId) ?? s.subjectId.slice(0, 8),
                    value: s.totalAttempts,
                  }))}
                />
              )}
            </SectionCard>
            <SectionCard title="Subject average score" description="Highest — lowest range">
              {a.subjects.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No subject data"
                  description="Metrics appear after submissions."
                />
              ) : (
                <div className="space-y-2">
                  {a.subjects.slice(0, 8).map((s) => (
                    <div
                      key={s.subjectId}
                      className="flex items-center justify-between rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">
                        {subjectNameById.get(s.subjectId) ?? s.subjectId.slice(0, 8)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        avg {Math.round(s.averagePercentage)}% · high{" "}
                        {Math.round(s.highestPercentage)}% · {s.examCount} exams
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* Chapter-wise — chapter aggregation isn't in the analytics snapshot
              yet, so surface an honest empty state rather than fake data. */}
          <SectionCard
            className="mt-4"
            title="Chapter-wise statistics"
            description="Per-chapter attempt breakdown"
          >
            <EmptyState
              icon={FileText}
              title="No chapter breakdown available"
              description="Chapter-level metrics will appear here once exams are tagged with chapters and attempts are recorded."
            />
          </SectionCard>

          <p className="mt-3 text-right text-xs text-muted-foreground">
            Generated {format(new Date(a.generatedAt), "PPp")}
          </p>
        </>
      ) : null}
    </>
  );
}

function StatBox({
  label,
  value,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass shadow-card-soft rounded-2xl p-4"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl font-bold">
        <AnimatedCounter value={Math.round(value)} suffix={suffix} />
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </motion.div>
  );
}

/* ---------- Preview selected questions ---------- */

function PreviewSelectedQuestions({
  ids,
  subjectId,
  chapterId,
  onRemove,
  onClear,
}: {
  ids: string[];
  subjectId: string;
  chapterId: string;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  // Fetch a wide slice of the same scope; then match by id. The picker's
  // subject/chapter constraints keep this bounded.
  const q = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "mcqs-preview-selected",
      { subjectId, chapterId: chapterId || null },
    ],
    queryFn: () =>
      adminListExamBatchMcqs({
        data: {
          subjectId: subjectId || undefined,
          chapterId: chapterId || undefined,
          page: 1,
          pageSize: 500,
        },
      }),
    enabled: !!subjectId && ids.length > 0,
  });

  if (ids.length === 0) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Nothing selected yet.
      </p>
    );
  }
  const rowMap = new Map<string, any>();
  for (const r of ((q.data?.rows ?? []) as any[])) rowMap.set(r.id, r);

  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {ids.length} question{ids.length === 1 ? "" : "s"} attached
        </span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs font-medium text-destructive hover:underline"
        >
          Remove all
        </button>
      </div>
      {q.isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-xl border border-border/60 bg-background/60">
          {ids.map((id, idx) => {
            const row = rowMap.get(id);
            return (
              <li
                key={id}
                className="flex items-start gap-3 px-3 py-2 hover:bg-muted/40"
              >
                <span className="mt-0.5 w-6 text-right text-xs tabular-nums text-muted-foreground">
                  {idx + 1}.
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm">
                    {row?.question ?? (
                      <span className="italic text-muted-foreground">
                        Question outside current scope (id {id.slice(0, 8)}…)
                      </span>
                    )}
                  </p>
                  {row && (
                    <p className="mt-0.5 text-[11px] uppercase tracking-widest text-muted-foreground">
                      {row.chapter_name ?? row.subject_name ?? "—"}
                      {row.difficulty ? ` · ${row.difficulty}` : ""}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}