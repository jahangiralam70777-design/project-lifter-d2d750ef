// Exam Batch — Question Bank (independent MCQ manager).
// All I/O goes through `@/lib/exam-batch/admin-mcqs.functions` and
// `@/lib/exam-batch/admin-academic.functions`. Never touches public.mcqs.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpenCheck,
  Filter,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";

import {
  EmptyState,
  FilterBar,
  FilterChip,
  PageHeader,
  SectionCard,
  StatusBadge,
  ghostBtnCls,
  primaryBtnCls,
} from "./kit";
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
  adminListExamBatchLevels,
  adminListExamBatchSubjects,
  adminListExamBatchChapters,
} from "@/lib/exam-batch/admin-academic.functions";
import {
  adminListExamBatchMcqs,
  adminCreateExamBatchMcq,
  adminUpdateExamBatchMcq,
  adminDeleteExamBatchMcq,
  adminSetExamBatchMcqStatus,
} from "@/lib/exam-batch/admin-mcqs.functions";
import { ExamBatchBulkUploadMcqsDialog } from "./bulk-upload-mcqs-dialog";
import { cn } from "@/lib/utils";

type Difficulty = "easy" | "medium" | "hard";
type Status = "draft" | "published" | "archived";
type Option = "A" | "B" | "C" | "D";

type McqForm = {
  id?: string;
  chapter_id: string;
  question: string;
  question_type: "mcq" | "true_false";
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: Option;
  explanation: string;
  difficulty: Difficulty;
  status: Status;
};

function emptyMcqForm(chapterId: string): McqForm {
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
  };
}

export function AdminExamBatchMcqs() {
  const qc = useQueryClient();
  const [level, setLevel] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | Status>("all");
  const [difficulty, setDifficulty] = useState<"all" | Difficulty>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);


  const [bulkOpen, setBulkOpen] = useState(false);
  const [editing, setEditing] = useState<McqForm | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; question: string } | null>(null);

  const levelsQ = useQuery({
    queryKey: ["exam-batch", "admin", "levels"],
    queryFn: () => adminListExamBatchLevels(),
    staleTime: 60_000,
  });
  const subjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "subjects", { level: level || null }],
    queryFn: () => adminListExamBatchSubjects({ data: { level: level || null } }),
    enabled: !!level,
  });
  const chaptersQ = useQuery({
    queryKey: ["exam-batch", "admin", "chapters", { subjectId }],
    queryFn: () => adminListExamBatchChapters({ data: { subjectId } }),
    enabled: !!subjectId,
  });

  const mcqsQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "mcqs",
      { chapterId, subjectId, search, status, difficulty, page, pageSize },
    ],
    queryFn: () =>
      adminListExamBatchMcqs({
        data: {
          chapterId: chapterId || undefined,
          subjectId: !chapterId && subjectId ? subjectId : undefined,
          search: search.trim() || undefined,
          status: status === "all" ? undefined : status,
          difficulty: difficulty === "all" ? undefined : difficulty,
          page,
          pageSize,
        },
      }),
    enabled: !!(chapterId || subjectId || level) || page > 0,
  });

  const levels = (levelsQ.data ?? []) as Array<{ code: string; name: string }>;
  const subjects = (subjectsQ.data ?? []) as Array<{ id: string; name: string; level: string }>;
  const chapters = (chaptersQ.data ?? []) as Array<{ id: string; name: string }>;

  const invalidate = () => qc.invalidateQueries({ queryKey: ["exam-batch"] });

  const createMut = useMutation({
    mutationFn: (payload: McqForm) =>
      adminCreateExamBatchMcq({
        data: {
          chapter_id: payload.chapter_id,
          question: payload.question,
          question_type: payload.question_type,
          option_a: payload.option_a,
          option_b: payload.option_b,
          option_c: payload.question_type === "true_false" ? null : payload.option_c,
          option_d: payload.question_type === "true_false" ? null : payload.option_d,
          correct_option: payload.correct_option,
          explanation: payload.explanation || null,
          difficulty: payload.difficulty,
          status: payload.status,
          tags: [],
        },
      }),
    onSuccess: () => {
      toast.success("MCQ created");
      setEditing(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateMut = useMutation({
    mutationFn: (payload: McqForm) =>
      adminUpdateExamBatchMcq({
        data: {
          id: payload.id!,
          chapter_id: payload.chapter_id,
          question: payload.question,
          question_type: payload.question_type,
          option_a: payload.option_a,
          option_b: payload.option_b,
          option_c: payload.question_type === "true_false" ? null : payload.option_c,
          option_d: payload.question_type === "true_false" ? null : payload.option_d,
          correct_option: payload.correct_option,
          explanation: payload.explanation || null,
          difficulty: payload.difficulty,
          status: payload.status,
          tags: [],
        },
      }),
    onSuccess: () => {
      toast.success("MCQ updated");
      setEditing(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteExamBatchMcq({ data: { id } }),
    onSuccess: () => {
      toast.success("MCQ deleted");
      setConfirmDelete(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: Status }) =>
      adminSetExamBatchMcqStatus({ data: v }),
    onSuccess: () => void invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (mcqsQ.data?.rows ?? []) as any[];
  const count = mcqsQ.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  const submit = () => {
    if (!editing) return;
    if (!editing.chapter_id) return toast.error("Chapter required");
    if (!editing.question.trim()) return toast.error("Question required");
    if (editing.question_type === "mcq") {
      if (!editing.option_a.trim() || !editing.option_b.trim() || !editing.option_c.trim() || !editing.option_d.trim()) {
        return toast.error("All four options required");
      }
    } else {
      if (!editing.option_a.trim() || !editing.option_b.trim()) {
        return toast.error("True/False options required");
      }
      if (!["A", "B"].includes(editing.correct_option)) {
        return toast.error("True/False correct must be A or B");
      }
    }
    if (editing.id) updateMut.mutate(editing);
    else createMut.mutate(editing);
  };

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Question bank"
        description="Manage the MCQ pool used by every Exam Batch exam. Independent from the site's original MCQ Manager."
        icon={BookOpenCheck}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => qc.invalidateQueries({ queryKey: ["exam-batch"] })}
            >
              <RefreshCw className={cn("h-4 w-4", mcqsQ.isFetching && "animate-spin")} /> Refresh
            </button>
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => setBulkOpen(true)}
            >
              <Upload className="h-4 w-4" /> Bulk upload
            </button>
            <button
              type="button"
              className={primaryBtnCls}
              onClick={() => {
                if (!chapterId) return toast.error("Pick a chapter first");
                setEditing(emptyMcqForm(chapterId));
              }}
            >
              <Plus className="h-4 w-4" /> New MCQ
            </button>
          </div>
        }
      />

      <SectionCard>
        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setSubjectId("");
              setChapterId("");
              setPage(1);
            }}
            className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="">All levels</option>
            {levels.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setChapterId("");
              setPage(1);
            }}
            disabled={!level}
            className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm disabled:opacity-50"
          >
            <option value="">{level ? "All subjects" : "Pick a level first"}</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={chapterId}
            onChange={(e) => {
              setChapterId(e.target.value);
              setPage(1);
            }}
            disabled={!subjectId}
            className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm disabled:opacity-50"
          >
            <option value="">{subjectId ? "All chapters" : "Pick a subject first"}</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <FilterBar
            searchPlaceholder="Search question text…"
            onSearchChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
          />
        </div>

        <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {(["all", "published", "draft", "archived"] as const).map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => { setStatus(s); setPage(1); }}>
              {s === "all" ? "Any status" : s}
            </FilterChip>
          ))}
          <span className="mx-2 h-4 w-px bg-border/60" />
          {(["all", "easy", "medium", "hard"] as const).map((d) => (
            <FilterChip key={d} active={difficulty === d} onClick={() => { setDifficulty(d); setPage(1); }}>
              {d === "all" ? "Any difficulty" : d}
            </FilterChip>
          ))}
        </div>

        {mcqsQ.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : mcqsQ.isError ? (
          <EmptyState
            icon={BookOpenCheck}
            title="Failed to load MCQs"
            description={(mcqsQ.error as Error)?.message ?? "Unknown error"}
            action={
              <button onClick={() => mcqsQ.refetch()} className={primaryBtnCls}>
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Search}
            title="No MCQs found"
            description={chapterId ? "Add a new MCQ or bulk-upload a file." : "Pick a chapter and add or import questions."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Question</th>
                  <th className="px-3 py-2">Chapter</th>
                  <th className="px-3 py-2">Difficulty</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className="border-t border-border/60 hover:bg-muted/30 align-top">
                    <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">
                      {(page - 1) * pageSize + i + 1}
                    </td>
                    <td className="px-3 py-3">
                      <p className="line-clamp-2 font-medium">{r.question}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Correct: {r.correct_option} · {r.subject_name ?? "—"}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{r.chapter_name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs uppercase">{r.difficulty}</td>
                    <td className="px-3 py-3">
                      <select
                        value={r.status}
                        onChange={(e) => statusMut.mutate({ id: r.id, status: e.target.value as Status })}
                        className="h-7 rounded-md border border-input bg-background/60 px-1 text-xs"
                      >
                        <option value="published">published</option>
                        <option value="draft">draft</option>
                        <option value="archived">archived</option>
                      </select>
                      <StatusBadge status={r.status === "published" ? "success" : r.status === "draft" ? "warning" : "muted"} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          className={ghostBtnCls}
                          onClick={() =>
                            setEditing({
                              id: r.id,
                              chapter_id: r.chapter_id,
                              question: r.question,
                              question_type: (r.question_type as "mcq" | "true_false") ?? "mcq",
                              option_a: r.option_a ?? "",
                              option_b: r.option_b ?? "",
                              option_c: r.option_c ?? "",
                              option_d: r.option_d ?? "",
                              correct_option: r.correct_option as Option,
                              explanation: r.explanation ?? "",
                              difficulty: (r.difficulty as Difficulty) ?? "medium",
                              status: (r.status as Status) ?? "published",
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className={cn(ghostBtnCls, "text-destructive")}
                          onClick={() => setConfirmDelete({ id: r.id, question: r.question })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} of {count}
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1">
                  <span>Rows per page</span>
                  <select
                    className="h-7 rounded-md border border-input bg-background/60 px-2 text-xs"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value) as 20 | 50 | 100);
                      setPage(1);
                    }}
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </label>
                <div className="flex gap-1">
                  <button
                    className={ghostBtnCls}
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </button>
                  <button
                    className={ghostBtnCls}
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}
      </SectionCard>

      {bulkOpen && (
        <ExamBatchBulkUploadMcqsDialog
          onClose={() => setBulkOpen(false)}
          onImported={() => qc.invalidateQueries({ queryKey: ["exam-batch"] })}
          initialLevel={level || undefined}
          initialSubjectId={subjectId || undefined}
          initialChapterId={chapterId || undefined}
        />
      )}

      <McqFormDialog
        value={editing}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        onChange={(patch) => setEditing((e) => (e ? { ...e, ...patch } : e))}
        chapters={chapters}
        busy={createMut.isPending || updateMut.isPending}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete MCQ?</AlertDialogTitle>
            <AlertDialogDescription className="line-clamp-3">
              {confirmDelete?.question}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function McqFormDialog({
  value,
  onClose,
  onSubmit,
  onChange,
  chapters,
  busy,
}: {
  value: McqForm | null;
  onClose: () => void;
  onSubmit: () => void;
  onChange: (patch: Partial<McqForm>) => void;
  chapters: Array<{ id: string; name: string }>;
  busy: boolean;
}) {
  const isEdit = !!value?.id;
  const showCD = value?.question_type !== "true_false";
  const correctOptions = useMemo<Option[]>(
    () => (value?.question_type === "true_false" ? ["A", "B"] : ["A", "B", "C", "D"]),
    [value?.question_type],
  );
  return (
    <Dialog open={!!value} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit MCQ" : "New MCQ"}</DialogTitle>
          <DialogDescription>
            Stored in the Exam Batch question bank (`exam_batch_mcqs`).
          </DialogDescription>
        </DialogHeader>
        {value && (
          <div className="grid gap-3">
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Chapter</span>
              <select
                value={value.chapter_id}
                onChange={(e) => onChange({ chapter_id: e.target.value })}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              >
                <option value="">Select chapter…</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Type</span>
              <select
                value={value.question_type}
                onChange={(e) => {
                  const qt = e.target.value as "mcq" | "true_false";
                  onChange({
                    question_type: qt,
                    correct_option: qt === "true_false" && !["A", "B"].includes(value.correct_option) ? "A" : value.correct_option,
                  });
                }}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              >
                <option value="mcq">MCQ (A/B/C/D)</option>
                <option value="true_false">True / False</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Question</span>
              <textarea
                rows={3}
                value={value.question}
                onChange={(e) => onChange({ question: e.target.value })}
                className="mt-1 w-full rounded-xl border border-input bg-background/60 p-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <OptionField label={value.question_type === "true_false" ? "True" : "Option A"} value={value.option_a} onChange={(v) => onChange({ option_a: v })} />
              <OptionField label={value.question_type === "true_false" ? "False" : "Option B"} value={value.option_b} onChange={(v) => onChange({ option_b: v })} />
              {showCD && (
                <>
                  <OptionField label="Option C" value={value.option_c} onChange={(v) => onChange({ option_c: v })} />
                  <OptionField label="Option D" value={value.option_d} onChange={(v) => onChange({ option_d: v })} />
                </>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Correct</span>
                <select
                  value={value.correct_option}
                  onChange={(e) => onChange({ correct_option: e.target.value as Option })}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
                >
                  {correctOptions.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Difficulty</span>
                <select
                  value={value.difficulty}
                  onChange={(e) => onChange({ difficulty: e.target.value as Difficulty })}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
                >
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs uppercase tracking-widest text-muted-foreground">Status</span>
                <select
                  value={value.status}
                  onChange={(e) => onChange({ status: e.target.value as Status })}
                  className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
                >
                  <option value="published">published</option>
                  <option value="draft">draft</option>
                  <option value="archived">archived</option>
                </select>
              </label>
            </div>
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Explanation</span>
              <textarea
                rows={2}
                value={value.explanation}
                onChange={(e) => onChange({ explanation: e.target.value })}
                className="mt-1 w-full rounded-xl border border-input bg-background/60 p-2 text-sm"
              />
            </label>
          </div>
        )}
        <DialogFooter>
          <button type="button" className={ghostBtnCls} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={primaryBtnCls}
            onClick={onSubmit}
            disabled={busy}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create MCQ"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-sm">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
      />
    </label>
  );
}