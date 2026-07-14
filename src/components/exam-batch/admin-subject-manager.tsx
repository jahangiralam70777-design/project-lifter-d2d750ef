// Admin · Exam Batch · Subject Manager
// -----------------------------------------------------------------------------
// Real-data admin surface for managing which subjects an approved student is
// enrolled in. Live-updates via useExamBatchRealtime → invalidations on
// exam_batch_enrollment_subjects & exam_batch_enrollments.

import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpenCheck,
  Hash,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
  ChevronRight,
  Users,
} from "lucide-react";
import { format } from "date-fns";

import {
  PageHeader,
  SectionCard,
  EmptyState,
  primaryBtnCls,
  ghostBtnCls,
} from "./kit";
import { adminListExamBatchSessions } from "@/lib/exam-batch/admin-sessions.functions";
import {
  adminListExamBatchEnrollments,
  adminAddExamBatchSubjectsBulk,
  adminRemoveExamBatchSubjectsBulk,
} from "@/lib/exam-batch/admin-enrollments.functions";
import { adminListExamBatchSubjects } from "@/lib/exam-batch/admin-academic.functions";
import type {
  ExamBatchEnrollmentEnrichedRow,
  ExamBatchSessionRow,
  EnrollmentStatus,
} from "@/lib/exam-batch/types";
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
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------

const STATUS_OPTIONS: { value: "all" | EnrollmentStatus; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "approved", label: "Approved" },
  { value: "pending", label: "Pending" },
  { value: "rejected", label: "Rejected" },
  { value: "banned", label: "Banned" },
];

function statusChip(status: EnrollmentStatus) {
  const map: Record<EnrollmentStatus, string> = {
    approved: "bg-emerald-500/15 text-emerald-500",
    pending: "bg-amber-500/15 text-amber-500",
    rejected: "bg-rose-500/15 text-rose-500",
    banned: "bg-zinc-500/15 text-zinc-400",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function AdminSubjectManager() {
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] =
    useState<(typeof STATUS_OPTIONS)[number]["value"]>("approved");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const [manageTarget, setManageTarget] =
    useState<ExamBatchEnrollmentEnrichedRow | null>(null);

  const sessionsQ = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", { archived: true }],
    queryFn: () => adminListExamBatchSessions({ data: { includeArchived: true } }),
    staleTime: 60_000,
  });

  const enrollmentsQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "enrollments",
      "subject-manager",
      {
        session: sessionFilter,
        subject: subjectFilter,
        status: statusFilter,
        offset: page * pageSize,
      },
    ],
    queryFn: () =>
      adminListExamBatchEnrollments({
        data: {
          sessionId: sessionFilter === "all" ? undefined : sessionFilter,
          subjectId: subjectFilter === "all" ? undefined : subjectFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
          limit: pageSize,
          offset: page * pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const allSubjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "subjects", "all"],
    queryFn: () => adminListExamBatchSubjects({ data: {} }),
    staleTime: 60_000,
  });

  const sessions = sessionsQ.data ?? [];
  const sessionById = useMemo(() => {
    const m = new Map<string, ExamBatchSessionRow>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);

  const levels = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) set.add(s.level);
    return Array.from(set).sort();
  }, [sessions]);

  const rows = enrollmentsQ.data ?? [];
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (levelFilter !== "all") {
        const sess = sessionById.get(r.session_id);
        if (sess?.level !== levelFilter) return false;
      }
      if (!q) return true;
      return (
        (r.student_name ?? "").toLowerCase().includes(q) ||
        (r.student_email ?? "").toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        (r.student_id != null && String(r.student_id).includes(q))
      );
    });
  }, [rows, search, levelFilter, sessionById]);

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Subject Manager"
        description="Assign or revoke individual subjects for each enrolled student. Changes propagate live."
        icon={BookOpenCheck}
      />

      <SectionCard>
        {/* Filters */}
        <div className="flex flex-col gap-3 pb-4 lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative min-w-0 flex-1 lg:min-w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setPage(0);
                setSearch(e.target.value);
              }}
              placeholder="Search by ID, name or email…"
              className="h-10 w-full rounded-xl border border-input bg-background/60 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <select
            value={sessionFilter}
            onChange={(e) => {
              setPage(0);
              setSessionFilter(e.target.value);
            }}
            className="h-10 min-w-0 rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="all">All sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>

          <select
            value={levelFilter}
            onChange={(e) => {
              setPage(0);
              setLevelFilter(e.target.value);
            }}
            className="h-10 min-w-0 rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="all">All levels</option>
            {levels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => {
              setPage(0);
              setStatusFilter(e.target.value as typeof statusFilter);
            }}
            className="h-10 min-w-0 rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={subjectFilter}
            onChange={(e) => {
              setPage(0);
              setSubjectFilter(e.target.value);
            }}
            className="h-10 min-w-0 rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="all">All subjects</option>
            {(allSubjectsQ.data ?? []).map((s: { id: string; name: string; level: string }) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.level}
              </option>
            ))}
          </select>
        </div>

        {/* Body */}
        {enrollmentsQ.isLoading ? (
          <div className="flex items-center justify-center py-14 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading students…
          </div>
        ) : enrollmentsQ.isError ? (
          <EmptyState
            icon={Users}
            title="Couldn't load students"
            description={(enrollmentsQ.error as Error)?.message ?? "Try again."}
            action={
              <button className={primaryBtnCls} onClick={() => enrollmentsQ.refetch()}>
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            }
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={BookOpenCheck}
            title="No students match"
            description="Adjust filters to see enrolled students."
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-2xl border border-border/60 lg:block">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Student ID</th>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Email</th>
                    <th className="px-3 py-3">Session</th>
                    <th className="px-3 py-3">Level</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Subjects</th>
                    <th className="px-3 py-3">Updated</th>
                    <th className="px-3 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => {
                    const sess = sessionById.get(r.session_id);
                    const initials = (r.student_name ?? r.student_email ?? r.user_id)
                      .slice(0, 2)
                      .toUpperCase();
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-border/60 transition-colors hover:bg-muted/30"
                      >
                        <td className="px-3 py-3">
                          {r.student_id != null ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-bold text-primary">
                              <Hash className="h-3 w-3" />
                              {r.student_id}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <div className="bg-cta-gradient flex h-9 w-9 items-center justify-center rounded-full font-display text-xs font-bold text-white shadow-glow">
                              {initials}
                            </div>
                            <p className="truncate text-sm font-semibold">
                              {r.student_name ?? "—"}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          <span className="block max-w-[220px] truncate">
                            {r.student_email ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          <span className="block max-w-[180px] truncate">
                            {r.session_title ?? sess?.title ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                            {sess?.level ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3">{statusChip(r.status)}</td>
                        <td className="px-3 py-3">
                          <SubjectChips names={r.subject_names} />
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {format(new Date(r.updated_at ?? r.created_at), "dd MMM yy")}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setManageTarget(r)}
                            disabled={r.status !== "approved"}
                            className={cn(
                              primaryBtnCls,
                              "h-8 px-3 text-xs",
                              r.status !== "approved" && "cursor-not-allowed opacity-40",
                            )}
                            title={
                              r.status === "approved"
                                ? "Manage subjects"
                                : "Only approved students can be managed"
                            }
                          >
                            Manage <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile / tablet cards */}
            <div className="grid gap-3 lg:hidden">
              {filteredRows.map((r) => {
                const sess = sessionById.get(r.session_id);
                return (
                  <div
                    key={r.id}
                    className="rounded-2xl border border-border/60 bg-background/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {r.student_id != null && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                              <Hash className="h-3 w-3" />
                              {r.student_id}
                            </span>
                          )}
                          {statusChip(r.status)}
                        </div>
                        <p className="mt-1.5 truncate text-sm font-semibold">
                          {r.student_name ?? "—"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.student_email ?? "—"}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {r.session_title ?? sess?.title ?? "—"} · {sess?.level ?? "—"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setManageTarget(r)}
                        disabled={r.status !== "approved"}
                        className={cn(
                          primaryBtnCls,
                          "h-8 shrink-0 px-3 text-xs",
                          r.status !== "approved" && "cursor-not-allowed opacity-40",
                        )}
                      >
                        Manage
                      </button>
                    </div>
                    <div className="mt-3">
                      <SubjectChips names={r.subject_names} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Pagination */}
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page + 1} · Showing {filteredRows.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className={cn(ghostBtnCls, "h-8 px-3 disabled:opacity-50")}
            >
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={rows.length < pageSize}
              className={cn(ghostBtnCls, "h-8 px-3 disabled:opacity-50")}
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>

      <ManageSubjectsDialog
        target={manageTarget}
        session={manageTarget ? sessionById.get(manageTarget.session_id) : undefined}
        onClose={() => setManageTarget(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------

function SubjectChips({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {names.slice(0, 6).map((n, i) => (
        <span
          key={`${n}-${i}`}
          className="inline-flex max-w-[160px] items-center truncate rounded-full bg-gradient-to-r from-primary/10 to-primary/5 px-2 py-0.5 text-[10px] font-semibold text-foreground/90 ring-1 ring-primary/10"
          title={n}
        >
          {n}
        </span>
      ))}
      {names.length > 6 && (
        <span className="text-[10px] font-medium text-muted-foreground">
          +{names.length - 6}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ManageSubjectsDialog({
  target,
  session,
  onClose,
}: {
  target: ExamBatchEnrollmentEnrichedRow | null;
  session: ExamBatchSessionRow | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const level = session?.level ?? null;

  const subjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "subjects", { level }],
    queryFn: () => adminListExamBatchSubjects({ data: { level } }),
    enabled: !!target && !!level,
    staleTime: 30_000,
  });

  const [selectedAdd, setSelectedAdd] = useState<Set<string>>(new Set());
  const [selectedRemove, setSelectedRemove] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<{
    ids: string[];
    names: string[];
  } | null>(null);

  // Reset selection when target changes.
  useEffect(() => {
    setSelectedAdd(new Set());
    setSelectedRemove(new Set());
  }, [target?.id]);

  const enrolledIds = useMemo(
    () => new Set(target?.subject_ids ?? []),
    [target?.subject_ids],
  );
  const enrolledPairs = useMemo(() => {
    const pairs = (target?.subject_ids ?? []).map((id, idx) => ({
      id,
      name: target?.subject_names[idx] ?? id,
    }));
    return pairs.sort((a, b) => a.name.localeCompare(b.name));
  }, [target]);

  const availablePool = useMemo(() => {
    const all = (subjectsQ.data ?? []) as { id: string; name: string; level: string }[];
    return all
      .filter((s) => !enrolledIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [subjectsQ.data, enrolledIds]);

  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["exam-batch", "admin", "enrollments"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["exam-batch", "student"],
    });
  };

  const addMut = useMutation({
    mutationFn: (subjectIds: string[]) =>
      adminAddExamBatchSubjectsBulk({
        data: { enrollmentId: target!.id, subjectIds },
      }),
    onSuccess: (res) => {
      toast.success(`Added ${res.added} subject${res.added === 1 ? "" : "s"}`);
      setSelectedAdd(new Set());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Failed to add subjects"),
  });

  const removeMut = useMutation({
    mutationFn: (subjectIds: string[]) =>
      adminRemoveExamBatchSubjectsBulk({
        data: { enrollmentId: target!.id, subjectIds },
      }),
    onSuccess: (res) => {
      toast.success(`Removed ${res.removed} subject${res.removed === 1 ? "" : "s"}`);
      setSelectedRemove(new Set());
      setConfirmRemove(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Failed to remove subjects"),
  });

  const busy = addMut.isPending || removeMut.isPending;

  const open = !!target;

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-6 pt-6 pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold tracking-tight">
              <BookOpenCheck className="h-5 w-5 text-primary" />
              Manage subjects
            </DialogTitle>
            <DialogDescription>
              Add or remove subject enrollments for this student. Changes apply instantly.
            </DialogDescription>
          </DialogHeader>

          {target && (
            <div className="grid grid-cols-2 gap-3 border-b border-border/60 bg-muted/30 px-6 py-4 text-xs sm:grid-cols-4">
              <InfoCell label="Student ID" value={target.student_id != null ? `#${target.student_id}` : "—"} />
              <InfoCell label="Name" value={target.student_name ?? "—"} />
              <InfoCell label="Email" value={target.student_email ?? "—"} mono />
              <InfoCell label="Session" value={target.session_title ?? session?.title ?? "—"} />
              <InfoCell label="Level" value={session?.level ?? "—"} />
              <InfoCell label="Status" value={target.status} />
              <InfoCell label="Enrolled" value={String(enrolledPairs.length)} />
              <InfoCell label="Updated" value={format(new Date(target.updated_at ?? target.created_at), "dd MMM yyyy")} />
            </div>
          )}

          <div className="grid max-h-[55vh] grid-cols-1 gap-4 overflow-y-auto p-6 md:grid-cols-2">
            {/* AVAILABLE */}
            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Available
                  </p>
                  <p className="text-sm font-semibold">
                    {availablePool.length} subject{availablePool.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  className={cn(primaryBtnCls, "h-8 px-3 text-xs")}
                  disabled={selectedAdd.size === 0 || busy}
                  onClick={() => addMut.mutate(Array.from(selectedAdd))}
                >
                  {addMut.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Add {selectedAdd.size > 0 ? `(${selectedAdd.size})` : ""}
                </button>
              </div>

              {subjectsQ.isLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : availablePool.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  All level subjects are already enrolled.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {availablePool.map((s) => {
                    const checked = selectedAdd.has(s.id);
                    return (
                      <li key={s.id}>
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 px-3 py-2 text-sm transition-colors",
                            checked
                              ? "border-primary/40 bg-primary/5"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setSelectedAdd((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(s.id);
                                else next.delete(s.id);
                                return next;
                              });
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">{s.name}</span>
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {s.level}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* ENROLLED */}
            <div className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Enrolled
                  </p>
                  <p className="text-sm font-semibold">
                    {enrolledPairs.length} subject{enrolledPairs.length === 1 ? "" : "s"}
                  </p>
                </div>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-xl bg-destructive/10 px-3 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-40",
                  )}
                  disabled={selectedRemove.size === 0 || busy}
                  onClick={() => {
                    const ids = Array.from(selectedRemove);
                    const names = enrolledPairs
                      .filter((p) => selectedRemove.has(p.id))
                      .map((p) => p.name);
                    setConfirmRemove({ ids, names });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove {selectedRemove.size > 0 ? `(${selectedRemove.size})` : ""}
                </button>
              </div>

              {enrolledPairs.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No subjects enrolled yet.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {enrolledPairs.map((s) => {
                    const checked = selectedRemove.has(s.id);
                    return (
                      <li key={s.id}>
                        <div
                          className={cn(
                            "flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2 text-sm transition-colors",
                            checked
                              ? "border-destructive/40 bg-destructive/5"
                              : "hover:bg-muted/50",
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              setSelectedRemove((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(s.id);
                                else next.delete(s.id);
                                return next;
                              });
                            }}
                          />
                          <span className="min-w-0 flex-1 truncate">{s.name}</span>
                          <button
                            type="button"
                            className="rounded-md p-1 text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                            title="Remove"
                            onClick={() =>
                              setConfirmRemove({ ids: [s.id], names: [s.name] })
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-border/60 bg-muted/20 px-6 py-4">
            <div className="flex w-full items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                Only Exam Batch admins can perform these changes.
              </span>
              <button type="button" onClick={onClose} className={cn(ghostBtnCls, "h-8 px-4")}>
                Close
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(v) => !v && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove subject enrollment?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove?.names.length === 1 ? (
                <>
                  This will remove <b>{confirmRemove.names[0]}</b> from the student's
                  enrollment. Related exams, leaderboard entries and progress will hide
                  automatically.
                </>
              ) : (
                <>
                  This will remove <b>{confirmRemove?.names.length}</b> subjects from
                  the student's enrollment. Other subjects remain unchanged.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (confirmRemove) removeMut.mutate(confirmRemove.ids);
              }}
            >
              {removeMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function InfoCell({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 truncate text-sm font-semibold text-foreground",
          mono && "font-mono text-xs",
        )}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}
