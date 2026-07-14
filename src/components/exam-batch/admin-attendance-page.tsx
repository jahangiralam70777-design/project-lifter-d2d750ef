// Admin Attendance & Ban Management for Exam Batch.
// Fully wired to the existing attendance backend — no mock data.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ShieldOff,
  ShieldCheck,
  ShieldAlert,
  Users2,
  Search,
  Loader2,
  RefreshCw,
  Settings2,
  History as HistoryIcon,
  Ban,
  Check,
  X,
  Hash,
  MoreHorizontal,
  RotateCcw,
  Pencil,
  IdCard,
} from "lucide-react";

import {
  PageHeader,
  SectionCard,
  EmptyState,
  FilterBar,
  BulkBar,
  primaryBtnCls,
  ghostBtnCls,
} from "./kit";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  adminGetExamBatchAttendanceDashboard,
  adminGetExamBatchAttendanceHistory,
  adminGetExamBatchAttendanceSettings,
  adminListExamBatchAttendanceStates,
  adminManualBanExamBatchAttendance,
  adminUnbanExamBatchAttendance,
  adminBulkUnbanExamBatchAttendance,
  adminSetExamBatchAttendanceCounter,
  adminUpdateExamBatchAttendanceSettings,
} from "@/lib/exam-batch/admin-attendance.functions";
import { adminListExamBatchSessions } from "@/lib/exam-batch/admin-sessions.functions";
import { listSubjects } from "@/lib/learning.functions";
import type {
  AttendanceEvent,
  AttendanceStateWithProfile,
} from "@/lib/exam-batch/attendance.types";
import { notifyExamBatchRealtime } from "./use-exam-batch-realtime";

type StatusTab = "all" | "active" | "banned" | "near";


type BanType = "any" | "auto" | "manual";

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "PPp");
  } catch {
    return iso;
  }
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: typeof ShieldOff;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "danger" | "warn" | "ok";
}) {
  const toneCls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-500"
        : tone === "ok"
          ? "text-emerald-500"
          : "text-primary";
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <Icon className={cn("h-4 w-4", toneCls)} />
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function AdminAttendanceBanManagement() {
  const queryClient = useQueryClient();

  // Filters
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [banType, setBanType] = useState<BanType>("any");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Selection for bulk actions
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals / drawers
  const [manualBanTarget, setManualBanTarget] = useState<AttendanceStateWithProfile | null>(null);
  const [manualBanReason, setManualBanReason] = useState("");
  const [manualBanDuration, setManualBanDuration] = useState<string>("0"); // "0"=permanent, "1"|"3"|"7"|"15"|"30"|"custom"
  const [manualBanCustomUntil, setManualBanCustomUntil] = useState<string>("");
  const [historyTarget, setHistoryTarget] = useState<AttendanceStateWithProfile | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setCountTarget, setSetCountTarget] = useState<AttendanceStateWithProfile | null>(null);
  const [setCountValue, setSetCountValue] = useState<number>(0);

  const rowKey = (r: { userId: string; sessionId: string; subjectId: string }) =>
    `${r.userId}::${r.sessionId}::${r.subjectId}`;

  const sessionsQ = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", { archived: true }],
    queryFn: () => adminListExamBatchSessions({ data: { includeArchived: true } }),
    staleTime: 60_000,
  });
  const subjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "attendance", "subjects"],
    queryFn: () => listSubjects(),
    staleTime: 60_000,
  });
  const dashboardQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "attendance",
      "dashboard",
      { session: sessionFilter, subject: subjectFilter },
    ],
    queryFn: () =>
      adminGetExamBatchAttendanceDashboard({
        data: {
          sessionId: sessionFilter === "all" ? undefined : sessionFilter,
          subjectId: subjectFilter === "all" ? undefined : subjectFilter,
        },
      }),
    // Realtime covers exam_batch_attendance_state/events; no 30s polling needed.
  });

  const listFilters = useMemo(() => {
    const base = {
      sessionId: sessionFilter === "all" ? undefined : sessionFilter,
      subjectId: subjectFilter === "all" ? undefined : subjectFilter,
      search: search.trim() || undefined,
      limit: pageSize,
      offset: page * pageSize,
    };
    if (statusTab === "banned") {
      return { ...base, onlyBanned: true, banType };
    }
    if (statusTab === "near") {
      return { ...base, onlyNearLimit: true };
    }
    if (statusTab === "active") {
      return { ...base, minCount: 0 as const };
    }
    return base;
  }, [sessionFilter, subjectFilter, search, page, statusTab, banType]);

  const statesQ = useQuery({
    queryKey: ["exam-batch", "admin", "attendance", "list", listFilters],
    queryFn: () => adminListExamBatchAttendanceStates({ data: listFilters as any }),
    placeholderData: keepPreviousData,
  });
  // Filter out banned rows client-side for the "active" tab (the server has no
  // explicit "exclude banned" flag; every other tab already restricts server-side).
  const rows = useMemo(() => {
    const raw = statesQ.data?.rows ?? [];
    return statusTab === "active" ? raw.filter((r) => !r.banned) : raw;
  }, [statesQ.data, statusTab]);

  const settingsQ = useQuery({
    queryKey: ["exam-batch", "admin", "attendance", "settings"],
    queryFn: () => adminGetExamBatchAttendanceSettings(),
    staleTime: 60_000,
  });

  const invalidateAll = () => {
    // Broadcast so student sockets (attendance state / ban history) and
    // other admin tabs update instantly without waiting on RLS-filtered
    // postgres_changes.
    notifyExamBatchRealtime("exam_batch_attendance_state");
    notifyExamBatchRealtime("exam_batch_ban_history");
    return queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
  };

  const unbanMut = useMutation({
    mutationFn: (row: AttendanceStateWithProfile) =>
      adminUnbanExamBatchAttendance({
        data: {
          userId: row.userId,
          sessionId: row.sessionId,
          subjectId: row.subjectId,
          resetCounter: true,
        },
      }),
    onSuccess: () => {
      toast.success("Student unbanned");
      void invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Unban failed"),
  });

  const bulkUnbanMut = useMutation({
    mutationFn: (items: AttendanceStateWithProfile[]) =>
      adminBulkUnbanExamBatchAttendance({
        data: {
          items: items.map((r) => ({
            userId: r.userId,
            sessionId: r.sessionId,
            subjectId: r.subjectId,
          })),
          resetCounter: true,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Unbanned ${r.processed}${r.skipped ? ` · ${r.skipped} skipped` : ""}`);
      setSelected(new Set());
      void invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Bulk unban failed"),
  });

  const manualBanMut = useMutation({
    mutationFn: (payload: {
      userId: string;
      sessionId: string;
      subjectId: string;
      reason: string;
      durationDays?: number | null;
      bannedUntil?: string | null;
    }) => adminManualBanExamBatchAttendance({ data: payload }),
    onSuccess: () => {
      toast.success("Student banned");
      setManualBanTarget(null);
      setManualBanReason("");
      setManualBanDuration("0");
      setManualBanCustomUntil("");
      void invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Ban failed"),
  });

  const setCounterMut = useMutation({
    mutationFn: (payload: {
      userId: string;
      sessionId: string;
      subjectId: string;
      value: number;
    }) => adminSetExamBatchAttendanceCounter({ data: payload }),
    onSuccess: (_r, vars) => {
      toast.success(vars.value === 0 ? "Miss count reset" : `Miss count set to ${vars.value}`);
      setSetCountTarget(null);
      void invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });

  const rowsById = useMemo(() => {
    const m = new Map<string, AttendanceStateWithProfile>();
    for (const r of rows) m.set(rowKey(r), r);
    return m;
  }, [rows]);
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(rowKey(r)));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => rowKey(r))));
  const toggle = (k: string) => {
    const n = new Set(selected);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    setSelected(n);
  };
  const selectedRows = useMemo(
    () =>
      Array.from(selected)
        .map((k) => rowsById.get(k))
        .filter((r): r is AttendanceStateWithProfile => !!r),
    [selected, rowsById],
  );

  const dash = dashboardQ.data;
  const sessions = sessionsQ.data ?? [];
  const subjects = subjectsQ.data ?? [];

  const tabDefs: Array<{ id: StatusTab; label: string; count: number | undefined }> = [
    { id: "all", label: "All", count: undefined },
    { id: "active", label: "Active", count: undefined },
    { id: "banned", label: "Banned", count: dash?.currentlyBanned },
    { id: "near", label: "Near ban", count: dash?.nearLimit },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Attendance & ban management"
        description="Search, monitor and manage every student's attendance and ban state — powered by real-time backend data."
        icon={ShieldOff}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="h-4 w-4" /> Auto-ban rules
            </button>
            <button
              type="button"
              className={ghostBtnCls}
              onClick={() => void invalidateAll()}
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  (statesQ.isFetching || dashboardQ.isFetching) && "animate-spin",
                )}
              />
              Refresh
            </button>
          </div>
        }
      />

      {/* KPIs (real-time via 30s poll + invalidation) */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          icon={ShieldOff}
          tone="danger"
          label="Currently banned"
          value={dash?.currentlyBanned ?? 0}
          hint={
            dash
              ? `${dash.autoBans} auto · ${dash.manualBans} manual`
              : "Loading…"
          }
        />
        <KpiCard
          icon={ShieldAlert}
          tone="warn"
          label="Near limit"
          value={dash?.nearLimit ?? 0}
          hint={
            dash
              ? `Limit ${dash.limit || "—"} · offset ${dash.nearBanOffset}`
              : undefined
          }
        />
        <KpiCard
          icon={Ban}
          tone="danger"
          label="Banned (7d)"
          value={dash?.bannedLast7d ?? 0}
        />
        <KpiCard
          icon={ShieldCheck}
          tone="ok"
          label="Unbanned (7d)"
          value={dash?.unbannedLast7d ?? 0}
          hint={dash ? `${dash.recoveredLast30d} in 30d` : undefined}
        />
      </div>

      <SectionCard
        title="Students"
        description="Real-time search across every tracked (student · session · subject) row"
      >
        {/* Status tabs with real counts */}
        <div className="mb-3 flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-background/40 p-1">
          {tabDefs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setPage(0);
                setSelected(new Set());
                setStatusTab(t.id);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold capitalize transition",
                statusTab === t.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {t.label}
              {t.count != null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    statusTab === t.id
                      ? "bg-primary-foreground/20"
                      : "bg-muted/70 text-foreground",
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <FilterBar
          searchPlaceholder="Search by Student Name, Student ID or email…"
          onSearchChange={(v) => {
            setPage(0);
            setSearch(v);
          }}
        >
          <select
            value={sessionFilter}
            onChange={(e) => {
              setPage(0);
              setSessionFilter(e.target.value);
            }}
            className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="all">All sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
          <select
            value={subjectFilter}
            onChange={(e) => {
              setPage(0);
              setSubjectFilter(e.target.value);
            }}
            className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="all">All subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {statusTab === "banned" && (
            <div className="flex items-center gap-1 rounded-xl border border-input bg-background/60 p-0.5 text-xs">
              {(["any", "auto", "manual"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setPage(0);
                    setBanType(t);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 font-semibold capitalize transition",
                    banType === t
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  {t === "any" ? "All bans" : `${t} ban`}
                </button>
              ))}
            </div>
          )}
        </FilterBar>

        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <button
            type="button"
            disabled={
              bulkUnbanMut.isPending ||
              selectedRows.length === 0 ||
              !selectedRows.some((r) => r.banned)
            }
            onClick={() => bulkUnbanMut.mutate(selectedRows.filter((r) => r.banned))}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-500 hover:bg-emerald-500/25 disabled:opacity-60"
          >
            {bulkUnbanMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Bulk unban
          </button>
        </BulkBar>

        {statesQ.isLoading ? (
          <div className="flex items-center justify-center py-14 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : statesQ.isError ? (
          <EmptyState
            icon={ShieldOff}
            title="Couldn't load attendance data"
            description={(statesQ.error as Error)?.message ?? "Try again."}
            action={
              <button className={primaryBtnCls} onClick={() => statesQ.refetch()}>
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title={
              search
                ? "No students match your search"
                : statusTab === "banned"
                  ? "No students are banned"
                  : "Nothing to show"
            }
            description={
              search
                ? "Try a different Student Name, Student ID or email."
                : "No records match the current filters."
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className="px-3 py-3">Student Name</th>
                  <th className="px-3 py-3">Student ID</th>
                  <th className="px-3 py-3">Session</th>
                  <th className="px-3 py-3">Subject</th>
                  <th className="px-3 py-3">Missed</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Last exam</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const k = rowKey(r);
                  const lastExam =
                    r.lastAttendedAt && r.lastMissedAt
                      ? new Date(r.lastAttendedAt) > new Date(r.lastMissedAt)
                        ? r.lastAttendedAt
                        : r.lastMissedAt
                      : r.lastAttendedAt ?? r.lastMissedAt;
                  return (
                    <tr
                      key={k}
                      className="border-t border-border/60 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selected.has(k)}
                          onCheckedChange={() => toggle(k)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {r.studentName ?? "—"}
                          </p>
                          {r.studentEmail ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {r.studentEmail}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {r.studentId != null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            <IdCard className="h-3 w-3" />
                            {r.studentId}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {r.sessionTitle ?? r.sessionId.slice(0, 8)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {r.subjectName ?? r.subjectId.slice(0, 8)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            r.banned
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-foreground/80",
                          )}
                        >
                          <Hash className="h-3 w-3" />
                          {r.consecutiveMissedCount}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {r.banned ? (
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              r.autoBanned
                                ? "bg-amber-500/15 text-amber-500"
                                : "bg-destructive/15 text-destructive",
                            )}
                          >
                            {r.autoBanned ? "Auto-banned" : "Manually banned"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {fmtDateTime(lastExam)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-muted/70"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              {r.banned ? (
                                <DropdownMenuItem
                                  onClick={() => unbanMut.mutate(r)}
                                  disabled={unbanMut.isPending}
                                >
                                  <ShieldCheck className="mr-2 h-4 w-4" /> Unban
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onClick={() => {
                                    setManualBanTarget(r);
                                    setManualBanReason("");
                                  }}
                                >
                                  <Ban className="mr-2 h-4 w-4" /> Manual ban
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                onClick={() =>
                                  setCounterMut.mutate({
                                    userId: r.userId,
                                    sessionId: r.sessionId,
                                    subjectId: r.subjectId,
                                    value: 0,
                                  })
                                }
                                disabled={
                                  setCounterMut.isPending ||
                                  r.consecutiveMissedCount === 0
                                }
                              >
                                <RotateCcw className="mr-2 h-4 w-4" /> Reset miss count
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSetCountTarget(r);
                                  setSetCountValue(r.consecutiveMissedCount);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" /> Set miss count…
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setHistoryTarget(r)}>
                                <HistoryIcon className="mr-2 h-4 w-4" /> View history
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Page {page + 1} · {rows.length} shown
            {statesQ.data ? ` · ${statesQ.data.total} total` : ""}
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

      {/* Manual ban dialog */}
      <ManualBanDialog
        target={manualBanTarget}
        reason={manualBanReason}
        onReasonChange={setManualBanReason}
        duration={manualBanDuration}
        onDurationChange={setManualBanDuration}
        customUntil={manualBanCustomUntil}
        onCustomUntilChange={setManualBanCustomUntil}
        onClose={() => setManualBanTarget(null)}
        onSubmit={() => {
          if (!manualBanTarget || !manualBanReason.trim()) return;
          const days = Number(manualBanDuration);
          const isCustom = manualBanDuration === "custom";
          const bannedUntil =
            isCustom && manualBanCustomUntil
              ? new Date(manualBanCustomUntil).toISOString()
              : null;
          manualBanMut.mutate({
            userId: manualBanTarget.userId,
            sessionId: manualBanTarget.sessionId,
            subjectId: manualBanTarget.subjectId,
            reason: manualBanReason.trim(),
            durationDays: isCustom ? null : Number.isFinite(days) ? days : 0,
            bannedUntil,
          });
        }}
        submitting={manualBanMut.isPending}
      />


      {/* Set miss count dialog */}
      <Dialog
        open={!!setCountTarget}
        onOpenChange={(v) => !v && setSetCountTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Set miss count
            </DialogTitle>
            <DialogDescription>
              {setCountTarget
                ? `${setCountTarget.studentName ?? "Student"} · ${
                    setCountTarget.sessionTitle ?? "session"
                  } · ${setCountTarget.subjectName ?? "subject"}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Consecutive missed exams
            </span>
            <input
              type="number"
              min={0}
              max={50}
              value={setCountValue}
              onChange={(e) => setSetCountValue(Math.max(0, Number(e.target.value)))}
              className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
            />
          </label>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setSetCountTarget(null)}
              className={ghostBtnCls}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={setCounterMut.isPending}
              onClick={() =>
                setCountTarget &&
                setCounterMut.mutate({
                  userId: setCountTarget.userId,
                  sessionId: setCountTarget.sessionId,
                  subjectId: setCountTarget.subjectId,
                  value: setCountValue,
                })
              }
              className={primaryBtnCls}
            >
              {setCounterMut.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History drawer */}
      <HistoryDrawer target={historyTarget} onClose={() => setHistoryTarget(null)} />

      {/* Settings sheet */}
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        initial={settingsQ.data}
        loading={settingsQ.isLoading}
      />
    </>
  );
}


// -----------------------------------------------------------------------------
// Manual ban dialog
// -----------------------------------------------------------------------------

function ManualBanDialog({
  target,
  reason,
  onReasonChange,
  duration,
  onDurationChange,
  customUntil,
  onCustomUntilChange,
  onClose,
  onSubmit,
  submitting,
}: {
  target: AttendanceStateWithProfile | null;
  reason: string;
  onReasonChange: (v: string) => void;
  duration: string;
  onDurationChange: (v: string) => void;
  customUntil: string;
  onCustomUntilChange: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const durations: Array<{ value: string; label: string }> = [
    { value: "0", label: "Permanent" },
    { value: "1", label: "1 Day" },
    { value: "3", label: "3 Days" },
    { value: "7", label: "7 Days" },
    { value: "15", label: "15 Days" },
    { value: "30", label: "30 Days" },
    { value: "custom", label: "Custom Date" },
  ];
  const customInvalid = duration === "custom" && !customUntil;
  return (
    <Dialog open={!!target} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-destructive" /> Manual ban
          </DialogTitle>
          <DialogDescription>
            {target
              ? `${target.studentName ?? target.studentEmail ?? target.userId} · ${
                  target.sessionTitle ?? "session"
                } · ${target.subjectName ?? "subject"}`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Ban reason
          </span>
          <textarea
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Why is this student being banned?"
            className="mt-1 w-full rounded-xl border border-input bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
        </label>
        <div className="mt-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Ban duration
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {durations.map((d) => (
              <button
                key={d.value}
                type="button"
                onClick={() => onDurationChange(d.value)}
                className={cn(
                  "rounded-xl border px-3 py-1.5 text-xs font-semibold transition",
                  duration === d.value
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-input bg-background/60 text-muted-foreground hover:bg-muted",
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
          {duration === "custom" && (
            <input
              type="datetime-local"
              value={customUntil}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => onCustomUntilChange(e.target.value)}
              className="mt-2 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
            />
          )}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            This ban blocks ONLY the Exam Batch module. The student keeps full
            access to the rest of the website.
          </p>
        </div>
        <DialogFooter>
          <button type="button" onClick={onClose} className={ghostBtnCls}>
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || !reason.trim() || customInvalid}
            onClick={onSubmit}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Ban student
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// -----------------------------------------------------------------------------
// History drawer
// -----------------------------------------------------------------------------

function HistoryDrawer({
  target,
  onClose,
}: {
  target: AttendanceStateWithProfile | null;
  onClose: () => void;
}) {
  const historyQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "attendance",
      "history",
      target ? { u: target.userId, s: target.sessionId, sub: target.subjectId } : null,
    ],
    queryFn: () =>
      adminGetExamBatchAttendanceHistory({
        data: {
          userId: target!.userId,
          sessionId: target!.sessionId,
          subjectId: target!.subjectId,
          limit: 200,
        },
      }),
    enabled: !!target,
  });

  return (
    <Sheet open={!!target} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4" /> Ban history
          </SheetTitle>
          {target && (
            <p className="text-xs text-muted-foreground">
              {target.studentName ?? target.userId} · {target.sessionTitle ?? "—"} ·{" "}
              {target.subjectName ?? "—"}
            </p>
          )}
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {historyQ.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : historyQ.isError ? (
            <p className="text-sm text-destructive">
              {(historyQ.error as Error)?.message ?? "Failed to load"}
            </p>
          ) : !historyQ.data || historyQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history for this scope.</p>
          ) : (
            historyQ.data.map((e) => <HistoryEventRow key={e.id} event={e} />)
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HistoryEventRow({ event }: { event: AttendanceEvent }) {
  const tone =
    event.kind === "manual_ban" || event.kind === "auto_ban"
      ? "text-destructive"
      : event.kind === "manual_unban"
        ? "text-emerald-500"
        : "text-muted-foreground";
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className={cn("font-semibold capitalize", tone)}>
          {event.kind.replace(/[._]/g, " ")}
        </span>
        <span className="text-xs text-muted-foreground">
          {fmtDateTime(event.createdAt)}
        </span>
      </div>
      {(event.previousCount != null || event.newCount != null) && (
        <p className="mt-1 text-xs text-muted-foreground">
          Count {event.previousCount ?? "—"} → {event.newCount ?? "—"}
        </p>
      )}
      {event.reason && <p className="mt-1 text-xs">{event.reason}</p>}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Auto-ban settings sheet
// -----------------------------------------------------------------------------

function SettingsSheet({
  open,
  onOpenChange,
  initial,
  loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: {
    consecutiveMissLimit: number;
    autoBanEnabled: boolean;
    nearBanOffset: number;
  } | null | undefined;
  loading: boolean;
}) {
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState<number>(initial?.consecutiveMissLimit ?? 3);
  const [enabled, setEnabled] = useState<boolean>(initial?.autoBanEnabled ?? true);
  const [offset, setOffset] = useState<number>(initial?.nearBanOffset ?? 1);

  // Rehydrate when the sheet opens or the loader resolves.
  useMemo(() => {
    if (initial) {
      setLimit(initial.consecutiveMissLimit);
      setEnabled(initial.autoBanEnabled);
      setOffset(initial.nearBanOffset);
    }
  }, [initial, open]);

  const saveMut = useMutation({
    mutationFn: () =>
      adminUpdateExamBatchAttendanceSettings({
        data: {
          consecutiveMissLimit: limit,
          autoBanEnabled: enabled,
          nearBanOffset: offset,
        },
      }),
    onSuccess: () => {
      toast.success("Auto-ban rules updated");
      void queryClient.invalidateQueries({
        queryKey: ["exam-batch", "admin", "attendance"],
      });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Save failed"),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" /> Auto-ban rules
          </SheetTitle>
        </SheetHeader>
        {loading ? (
          <div className="mt-6 flex items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 p-3">
              <span className="text-sm font-medium">Auto-ban enabled</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4"
              />
            </label>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Consecutive missed exams before auto-ban
              </label>
              <input
                type="number"
                min={0}
                max={50}
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                0 disables auto-ban for every session · subject.
              </p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Near-limit warning offset
              </label>
              <input
                type="number"
                min={0}
                max={20}
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value))}
                className="mt-1 h-10 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Students within {offset} miss{offset === 1 ? "" : "es"} of the limit appear
                under &quot;Near limit&quot;.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className={ghostBtnCls}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate()}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saveMut.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Save
              </button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// unused imports kept intentionally minimal
void Users2;
void Search;
void X;
