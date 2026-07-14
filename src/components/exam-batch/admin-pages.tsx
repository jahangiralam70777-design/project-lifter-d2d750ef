import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LayoutDashboard,
  CalendarRange,
  UserCheck,
  Users,
  FileText,
  Trophy,
  Timer,
  Settings as SettingsIcon,
  Download,
  BarChart3,
  Plus,
  MoreHorizontal,
  Check,
  X,
  Sparkles,
  TrendingUp,
  GraduationCap,
  Eye,
  Pencil,
  Copy,
  Archive,
  Trash2,
  UserX,
  Search,
  Calendar as CalendarIcon,
  Filter,
  ArrowUpRight,
  FileDown,
  FileType2,
  FileSpreadsheet,
  ClipboardCheck,
  BarChart2,
  Palette,
  Link2,
  Type,
  Bell,
  Shield,
  RefreshCw,
  Play,
  ChevronDown,
  BookOpen,
  Loader2,
  EyeOff,
  ArchiveRestore,
  Hash,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

import {
  PageHeader,
  SectionCard,
  SessionCard,
  StatusBadge,
  FilterBar,
  FilterChip,
  BulkBar,
  DataTable,
  EmptyState,
  primaryBtnCls,
  ghostBtnCls,
  type Column,
} from "./kit";
import {
  AnimatedCounter,
  Sparkline,
  MiniBars,
  DonutChart,
  LineChart,
  BarChart,
  StackBar,
} from "./charts";
import {
  mockSessions,
  mockExams,
  mockLeaderboard,
  mockActivities,
  mockExamCards,
  mockDownloadCards,
  type ExamRow,
  type LeaderRow,
  type ExamCardData,
  type DownloadCard as DownloadCardT,
} from "./mock-data";

import { Link } from "@tanstack/react-router";
import { notifyExamBatchRealtime } from "./use-exam-batch-realtime";
import {
  adminListExamBatchSessions,
  adminCreateExamBatchSession,
  adminUpdateExamBatchSession,
  adminDeleteExamBatchSession,
  adminSetExamBatchSessionArchived,
  adminSetExamBatchSessionHidden,
  adminSetExamBatchSessionActive,
  adminSetExamBatchRegistration,
} from "@/lib/exam-batch/admin-sessions.functions";
import {
  adminListExamBatchEnrollments,
  adminApproveExamBatchEnrollments,
  adminRejectExamBatchEnrollments,
  adminRemoveExamBatchEnrollment,
  adminGetExamBatchEnrollmentCounts,
  adminSetExamBatchEnrollmentStatus,
} from "@/lib/exam-batch/admin-enrollments.functions";
import { adminListExamBatchLevels } from "@/lib/exam-batch/admin-academic.functions";
import { listSubjects } from "@/lib/learning.functions";
import type {
  ExamBatchSessionRow,
  ExamBatchEnrollmentRow,
  ExamBatchEnrollmentEnrichedRow,
  EnrollmentStatus,
} from "@/lib/exam-batch/types";
import {
  sessionCreateSchema,
  sessionUpdateSchema,
} from "@/lib/exam-batch/types";
import type { z } from "zod";
type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
type SessionUpdateInput = z.infer<typeof sessionUpdateSchema>;

import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/* ============================================================
 * 1. DASHBOARD
 * ============================================================ */

const activityIcon = {
  enroll: UserCheck,
  exam: FileText,
  session: CalendarRange,
  system: Sparkles,
};

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function initialsFromLabel(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function DashStat({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number;
  hint?: string;
  icon: React.ElementType;
  tone: "primary" | "success" | "warning" | "info" | "rose" | "sky";
  loading?: boolean;
}) {
  const toneMap: Record<string, string> = {
    primary: "bg-cta-gradient",
    success: "bg-gradient-to-br from-emerald-500 to-teal-500",
    warning: "bg-gradient-to-br from-amber-500 to-orange-500",
    info: "bg-gradient-to-br from-sky-500 to-indigo-500",
    rose: "bg-gradient-to-br from-rose-500 to-pink-500",
    sky: "bg-gradient-to-br from-cyan-500 to-sky-500",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-glow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 font-display text-2xl font-bold tracking-tight">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <AnimatedCounter value={value} />
            )}
          </p>
          {hint && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowUpRight className="h-3 w-3" />
              <span>{hint}</span>
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow",
            toneMap[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}

function widgetErrorMessage(err: unknown): string {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function WidgetError({ label, error }: { label: string; error: unknown }) {
  const msg = widgetErrorMessage(error);
  if (import.meta.env.DEV) {
    // Surface the exact failing widget + payload in the browser console so
    // "Failed to load" is never a black box during development.
    // eslint-disable-next-line no-console
    console.error(`[exam-batch dashboard] ${label} failed:`, error);
  }
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      <span className="font-semibold">{label}:</span> {msg}
    </div>
  );
}

export function AdminDashboard() {
  const queryClient = useQueryClient();

  // Sessions — used for KPIs and to resolve session titles in Recent Approvals.
  const sessionsQ = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", { archived: true }],
    queryFn: () => adminListExamBatchSessions({ data: { includeArchived: true } }),
  });

  // Aggregated counts via lightweight RPC — avoids pulling 500-row enriched
  // lists just to render two numbers, and isolates count failures from list
  // failures.
  const countsQ = useQuery({
    queryKey: ["exam-batch", "admin", "enrollments", "counts", {}],
    queryFn: () => adminGetExamBatchEnrollmentCounts({ data: {} }),
  });

  // Recent approvals — small enriched slice; if the enriched join fails
  // (profiles / subjects), only this card degrades.
  const recentApprovalsQ = useQuery({
    queryKey: ["exam-batch", "admin", "enrollments", "recent-approved"],
    queryFn: () =>
      adminListExamBatchEnrollments({
        data: { status: "approved", limit: 5, offset: 0 },
      }),
  });

  // Oldest pending — 1 row, keeps the "queue hint" cheap and independent.
  const oldestPendingQ = useQuery({
    queryKey: ["exam-batch", "admin", "enrollments", "oldest-pending"],
    queryFn: () =>
      adminListExamBatchEnrollments({
        data: { status: "pending", limit: 1, offset: 0 },
      }),
  });

  const sessions = sessionsQ.data ?? [];
  const counts = countsQ.data;
  const recentApprovals = recentApprovalsQ.data ?? [];
  const oldestPending = (oldestPendingQ.data ?? [])[0];

  const totalSessions = sessions.length;
  const activeSessions = sessions.filter(
    (s) => s.status === "active" && !s.is_archived,
  ).length;
  const archivedSessions = sessions.filter((s) => s.is_archived).length;

  const sessionById = useMemo(() => {
    const m = new Map<string, ExamBatchSessionRow>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
  };
  const isRefreshing =
    sessionsQ.isFetching || countsQ.isFetching ||
    recentApprovalsQ.isFetching || oldestPendingQ.isFetching;

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Batch operations dashboard"
        description="Monitor cohorts, enrollments and exam operations in real time."
        icon={LayoutDashboard}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refreshAll}
              className={ghostBtnCls}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={cn("h-4 w-4", isRefreshing && "animate-spin")}
              />{" "}
              Refresh
            </button>
            <Link to={"/admin/exam-batch/sessions" as never} className={primaryBtnCls}>
              <Plus className="h-4 w-4" /> New Session
            </Link>
          </div>
        }
      />

      {(sessionsQ.isError || countsQ.isError || recentApprovalsQ.isError || oldestPendingQ.isError) && (
        <div className="mb-3 space-y-1.5">
          {sessionsQ.isError && <WidgetError label="Sessions" error={sessionsQ.error} />}
          {countsQ.isError && <WidgetError label="Enrollment counts" error={countsQ.error} />}
          {recentApprovalsQ.isError && <WidgetError label="Recent approvals" error={recentApprovalsQ.error} />}
          {oldestPendingQ.isError && <WidgetError label="Pending queue" error={oldestPendingQ.error} />}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <DashStat
          label="Total Sessions"
          value={totalSessions}
          hint={`${archivedSessions} archived`}
          icon={CalendarRange}
          tone="primary"
          loading={sessionsQ.isLoading}
        />
        <DashStat
          label="Active Sessions"
          value={activeSessions}
          hint="live for students"
          icon={Play}
          tone="success"
          loading={sessionsQ.isLoading}
        />
        <DashStat
          label="Pending Enrollments"
          value={counts?.pending ?? 0}
          hint={oldestPending ? `oldest ${fmtRelative(oldestPending.created_at)}` : "queue clear"}
          icon={UserCheck}
          tone="warning"
          loading={countsQ.isLoading}
        />
        <DashStat
          label="Approved Students"
          value={counts?.approved ?? 0}
          hint="total enrollments"
          icon={Users}
          tone="info"
          loading={countsQ.isLoading}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SectionCard
          title="Recent approvals"
          description="Latest enrollments processed"
          className="lg:col-span-2"
          action={
            <Link to={"/admin/exam-batch/enrollment" as never} className={ghostBtnCls}>
              Open queue
            </Link>
          }
        >
          {recentApprovalsQ.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : recentApprovalsQ.isError ? (
            <WidgetError label="Recent approvals" error={recentApprovalsQ.error} />
          ) : recentApprovals.length === 0 ? (
            <EmptyState
              icon={UserCheck}
              title="No approvals yet"
              description="Approved enrollments will appear here."
            />
          ) : (
            <ul className="space-y-2.5">
              {recentApprovals.map((e) => {
                const sess = sessionById.get(e.session_id);
                const nameLabel = e.student_name ?? (e.student_id != null ? `Student #${e.student_id}` : `Student ${e.user_id.slice(0, 8)}`);
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5"
                  >
                    <div className="bg-cta-gradient flex h-9 w-9 items-center justify-center rounded-full font-display text-xs font-bold text-white shadow-glow">
                      {e.student_id != null ? String(e.student_id).slice(-2) : initialsFromLabel(nameLabel)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{nameLabel}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {(sess?.title ?? e.session_title ?? "Session") + " · " + fmtRelative(e.reviewed_at ?? e.updated_at)}
                      </p>
                    </div>
                    <StatusBadge status="approved" />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Quick actions" description="Jump to a task">
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Sessions", icon: CalendarRange, to: "/admin/exam-batch/sessions" },
              { label: "Enrollment", icon: UserCheck, to: "/admin/exam-batch/enrollment" },
              { label: "Students", icon: Users, to: "/admin/exam-batch/students" },
              { label: "Exams", icon: FileText, to: "/admin/exam-batch/exams" },
              { label: "Leaderboard", icon: Trophy, to: "/admin/exam-batch/leaderboard" },
              { label: "Analytics", icon: BarChart3, to: "/admin/exam-batch/analytics" },
            ].map((q) => (
              <Link
                key={q.label}
                to={q.to as never}
                className="group flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-background/40 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-glow"
              >
                <span className="bg-cta-gradient flex h-8 w-8 items-center justify-center rounded-lg text-white shadow-glow">
                  <q.icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-semibold">{q.label}</span>
              </Link>
            ))}
          </div>
        </SectionCard>
      </div>
    </>
  );
}


/* ============================================================
 * 2. SESSION MANAGEMENT
 * ============================================================ */

const LEVELS = ["foundation", "intermediate", "final"] as const;
type LevelCode = (typeof LEVELS)[number];

type SessionFormState = {
  title: string;
  subtitle: string;
  level: string;
  startsAt: string;
  registrationDeadline: string;
  status: "active" | "inactive";
  registrationOpen: boolean;
  isHidden: boolean;
};

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

function emptySessionForm(): SessionFormState {
  const now = new Date();
  now.setDate(now.getDate() + 30);
  now.setHours(10, 0, 0, 0);
  return {
    title: "",
    subtitle: "",
    level: "foundation",
    startsAt: toDatetimeLocal(now.toISOString()),
    registrationDeadline: "",
    status: "active",
    registrationOpen: true,
    isHidden: false,
  };
}

function LevelSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const q = useQuery({
    queryKey: ["exam-batch", "admin", "levels"],
    queryFn: () => adminListExamBatchLevels(),
    staleTime: 60_000,
  });
  const rows = (q.data ?? []) as Array<{ code: string; name: string; status: string }>;
  const options = rows.filter((r) => r.status !== "archived");
  const hasValue = options.some((o) => o.code === value);
  return (
    <select
      value={hasValue ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
    >
      <option value="" disabled>
        {q.isLoading ? "Loading levels…" : options.length ? "Select a level" : "No levels — create one in Academic Manager"}
      </option>
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.name} ({o.code})
        </option>
      ))}
    </select>
  );
}

function SessionFormFields({
  value,
  onChange,
}: {
  value: SessionFormState;
  onChange: (v: SessionFormState) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="sm:col-span-2 block">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Title
        </span>
        <input
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="August 2026 Exam Batch"
        />
      </label>
      <label className="sm:col-span-2 block">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Subtitle
        </span>
        <input
          value={value.subtitle}
          onChange={(e) => onChange({ ...value, subtitle: e.target.value })}
          className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          placeholder="CA Foundation · Level 1"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Level
        </span>
        <LevelSelect
          value={value.level}
          onChange={(v) => onChange({ ...value, level: v })}
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Status
        </span>
        <select
          value={value.status}
          onChange={(e) =>
            onChange({ ...value, status: e.target.value as "active" | "inactive" })
          }
          className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Starts at
        </span>
        <input
          type="datetime-local"
          value={value.startsAt}
          onChange={(e) => onChange({ ...value, startsAt: e.target.value })}
          className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
      </label>
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Registration deadline
        </span>
        <input
          type="datetime-local"
          value={value.registrationDeadline}
          onChange={(e) =>
            onChange({ ...value, registrationDeadline: e.target.value })
          }
          className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
      </label>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={value.registrationOpen}
          onCheckedChange={(v) =>
            onChange({ ...value, registrationOpen: Boolean(v) })
          }
        />
        <span className="text-sm">Registration open</span>
      </label>
      <label className="flex items-center gap-2">
        <Checkbox
          checked={value.isHidden}
          onCheckedChange={(v) => onChange({ ...value, isHidden: Boolean(v) })}
        />
        <span className="text-sm">Hidden from students</span>
      </label>
    </div>
  );
}

function SessionActionsMenu({
  row,
  onEdit,
  onDuplicate,
  onArchive,
  onDelete,
  onToggleHidden,
  onToggleRegistration,
  onToggleActive,
  busy,
}: {
  row: ExamBatchSessionRow;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleHidden: () => void;
  onToggleRegistration: () => void;
  onToggleActive: () => void;
  busy: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground transition hover:bg-muted/70 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Session</DropdownMenuLabel>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy className="mr-2 h-4 w-4" /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onToggleActive}>
          <Play className="mr-2 h-4 w-4" />
          {row.status === "active" ? "Mark inactive" : "Mark active"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleRegistration}>
          <UserCheck className="mr-2 h-4 w-4" />
          {row.registration_open ? "Close registration" : "Open registration"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleHidden}>
          {row.is_hidden ? (
            <>
              <Eye className="mr-2 h-4 w-4" /> Show to students
            </>
          ) : (
            <>
              <EyeOff className="mr-2 h-4 w-4" /> Hide from students
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onArchive}>
          {row.is_archived ? (
            <>
              <ArchiveRestore className="mr-2 h-4 w-4" /> Unarchive
            </>
          ) : (
            <>
              <Archive className="mr-2 h-4 w-4" /> Archive
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminSessions() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<
    "all" | "open" | "closed" | "active" | "inactive" | "archived" | "hidden"
  >("all");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<ExamBatchSessionRow | null>(null);
  const [form, setForm] = useState<SessionFormState>(emptySessionForm());
  const [confirmDelete, setConfirmDelete] = useState<ExamBatchSessionRow | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const sessionsQ = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", { archived: true }],
    queryFn: () => adminListExamBatchSessions({ data: { includeArchived: true } }),
  });

  const invalidate = () => {
    notifyExamBatchRealtime("exam_batch_sessions");
    return queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
  };

  const createMut = useMutation({
    mutationFn: (data: SessionCreateInput) =>
      adminCreateExamBatchSession({ data }),
    onSuccess: () => {
      toast.success("Session created");
      setCreateOpen(false);
      setForm(emptySessionForm());
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Create failed"),
  });
  const updateMut = useMutation({
    mutationFn: (data: SessionUpdateInput) =>
      adminUpdateExamBatchSession({ data }),
    onSuccess: () => {
      toast.success("Session updated");
      setEditingRow(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteExamBatchSession({ data: { id } }),
    onSuccess: () => {
      toast.success("Session deleted");
      setConfirmDelete(null);
      setSelected(new Set());
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Delete failed"),
  });
  const archiveMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      adminSetExamBatchSessionArchived({ data: { id, value } }),
    onMutate: (v) => setBusyId(v.id),
    onSettled: () => setBusyId(null),
    onSuccess: (_r, v) => {
      toast.success(v.value ? "Archived" : "Unarchived");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const hiddenMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      adminSetExamBatchSessionHidden({ data: { id, value } }),
    onMutate: (v) => setBusyId(v.id),
    onSettled: () => setBusyId(null),
    onSuccess: (_r, v) => {
      toast.success(v.value ? "Hidden" : "Visible");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const activeMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      adminSetExamBatchSessionActive({ data: { id, value } }),
    onMutate: (v) => setBusyId(v.id),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      toast.success("Status updated");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const regMut = useMutation({
    mutationFn: ({ id, value }: { id: string; value: boolean }) =>
      adminSetExamBatchRegistration({ data: { id, value } }),
    onMutate: (v) => setBusyId(v.id),
    onSettled: () => setBusyId(null),
    onSuccess: (_r, v) => {
      toast.success(v.value ? "Registration opened" : "Registration closed");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = sessionsQ.data ?? [];
  const filteredRows = useMemo(() => {
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
    if (levelFilter !== "all") {
      out = out.filter((r) => r.level.toLowerCase() === levelFilter.toLowerCase());
    }
    if (statusFilter !== "all") {
      out = out.filter((r) => {
        switch (statusFilter) {
          case "open":
            return r.registration_open;
          case "closed":
            return !r.registration_open;
          case "active":
            return r.status === "active";
          case "inactive":
            return r.status === "inactive";
          case "archived":
            return r.is_archived;
          case "hidden":
            return r.is_hidden;
          default:
            return true;
        }
      });
    }
    return out;
  }, [rows, search, statusFilter, levelFilter]);

  const allSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filteredRows.map((r) => r.id)));
  };
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const openEdit = (row: ExamBatchSessionRow) => {
    setEditingRow(row);
    setForm({
      title: row.title,
      subtitle: row.subtitle ?? "",
      level: row.level,
      startsAt: toDatetimeLocal(row.starts_at),
      registrationDeadline: row.registration_deadline
        ? toDatetimeLocal(row.registration_deadline)
        : "",
      status: row.status,
      registrationOpen: row.registration_open,
      isHidden: row.is_hidden,
    });
  };

  const submitCreate = () => {
    const startsAt = toIsoOrNull(form.startsAt);
    if (!form.title.trim()) return toast.error("Title required");
    if (!startsAt) return toast.error("Valid start date required");
    createMut.mutate({
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      level: form.level.trim() || "foundation",
      startsAt,
      registrationDeadline: toIsoOrNull(form.registrationDeadline) ?? undefined,
      status: form.status,
      registrationOpen: form.registrationOpen,
      isHidden: form.isHidden,
    });
  };

  const submitEdit = () => {
    if (!editingRow) return;
    const startsAt = toIsoOrNull(form.startsAt);
    if (!form.title.trim()) return toast.error("Title required");
    if (!startsAt) return toast.error("Valid start date required");
    updateMut.mutate({
      id: editingRow.id,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      level: form.level.trim(),
      startsAt,
      registrationDeadline: toIsoOrNull(form.registrationDeadline),
      status: form.status,
      registrationOpen: form.registrationOpen,
      isHidden: form.isHidden,
    });
  };

  const submitDuplicate = (row: ExamBatchSessionRow) => {
    createMut.mutate({
      title: `${row.title} (Copy)`,
      subtitle: row.subtitle ?? undefined,
      level: row.level,
      startsAt: row.starts_at,
      registrationDeadline: row.registration_deadline ?? undefined,
      status: row.status,
      registrationOpen: row.registration_open,
      isHidden: true,
    });
  };

  const bulkArchive = async (value: boolean) => {
    await Promise.allSettled(
      Array.from(selected).map((id) => archiveMut.mutateAsync({ id, value })),
    );
    setSelected(new Set());
  };
  const bulkDelete = async () => {
    await Promise.allSettled(
      Array.from(selected).map((id) => deleteMut.mutateAsync(id)),
    );
    setSelected(new Set());
    setConfirmBulkDelete(false);
  };

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Session management"
        description="Create, publish and archive cohorts across the academic calendar."
        icon={CalendarRange}
        action={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: ["exam-batch", "admin", "sessions"],
                })
              }
              className={ghostBtnCls}
            >
              <RefreshCw
                className={cn("h-4 w-4", sessionsQ.isFetching && "animate-spin")}
              />{" "}
              Refresh
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(emptySessionForm());
                setCreateOpen(true);
              }}
              className={primaryBtnCls}
            >
              <Plus className="h-4 w-4" /> New Session
            </button>
          </div>
        }
      />

      <SectionCard>
        <FilterBar
          searchPlaceholder="Search sessions by title, subtitle, level…"
          onSearchChange={setSearch}
        >
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="all">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </option>
            ))}
          </select>
        </FilterBar>

        <div className="mb-3 mt-3 flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {(
            ["all", "open", "closed", "active", "inactive", "archived", "hidden"] as const
          ).map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              onClick={() => setStatusFilter(s)}
            >
              {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </FilterChip>
          ))}
        </div>

        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <button
            type="button"
            onClick={() => bulkArchive(true)}
            className={ghostBtnCls}
          >
            <Archive className="h-4 w-4" /> Archive
          </button>
          <button
            type="button"
            onClick={() => bulkArchive(false)}
            className={ghostBtnCls}
          >
            <ArchiveRestore className="h-4 w-4" /> Unarchive
          </button>
          <button
            type="button"
            onClick={() => setConfirmBulkDelete(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-destructive/10 px-4 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive/20"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </BulkBar>

        {sessionsQ.isLoading ? (
          <div className="flex items-center justify-center py-14 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading sessions…
          </div>
        ) : sessionsQ.isError ? (
          <EmptyState
            icon={CalendarRange}
            title="Couldn't load sessions"
            description={(sessionsQ.error as Error)?.message ?? "Try again."}
            action={
              <button className={primaryBtnCls} onClick={() => sessionsQ.refetch()}>
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            }
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No sessions found"
            description={
              rows.length === 0
                ? "Create your first exam batch session to get started."
                : "Adjust filters or search to see more results."
            }
            action={
              rows.length === 0 ? (
                <button
                  className={primaryBtnCls}
                  onClick={() => {
                    setForm(emptySessionForm());
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" /> New Session
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-3">Session</th>
                  <th className="px-3 py-3">Level</th>
                  <th className="px-3 py-3">Registration</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Subjects</th>
                  <th className="px-3 py-3">Starts</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr
                    key={r.id}
                    className={cn(
                      "border-t border-border/60 transition-colors hover:bg-muted/30",
                      r.is_archived && "opacity-60",
                    )}
                  >
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="bg-cta-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-glow">
                          <CalendarRange className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-semibold">{r.title}</p>
                          {r.subtitle && (
                            <p className="text-xs text-muted-foreground">
                              {r.subtitle}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-semibold">
                        {r.level}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.registration_open ? "open" : "closed"} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusBadge status={r.status} />
                        {r.is_hidden && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
                            <EyeOff className="h-3 w-3" /> Hidden
                          </span>
                        )}
                        {r.is_archived && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            <Archive className="h-3 w-3" /> Archived
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {r.subjects_count}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {format(new Date(r.starts_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {format(new Date(r.created_at), "dd MMM yyyy")}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <SessionActionsMenu
                        row={r}
                        busy={busyId === r.id}
                        onEdit={() => openEdit(r)}
                        onDuplicate={() => submitDuplicate(r)}
                        onArchive={() =>
                          archiveMut.mutate({ id: r.id, value: !r.is_archived })
                        }
                        onDelete={() => setConfirmDelete(r)}
                        onToggleHidden={() =>
                          hiddenMut.mutate({ id: r.id, value: !r.is_hidden })
                        }
                        onToggleRegistration={() =>
                          regMut.mutate({
                            id: r.id,
                            value: !r.registration_open,
                          })
                        }
                        onToggleActive={() =>
                          activeMut.mutate({
                            id: r.id,
                            value: r.status !== "active",
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {filteredRows.length} of {rows.length}
          </span>
        </div>
      </SectionCard>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New session</DialogTitle>
            <DialogDescription>
              Configure a new exam batch cohort.
            </DialogDescription>
          </DialogHeader>
          <SessionFormFields value={form} onChange={setForm} />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className={ghostBtnCls}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitCreate}
              disabled={createMut.isPending}
              className={primaryBtnCls}
            >
              {createMut.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Create session
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editingRow} onOpenChange={(v) => !v && setEditingRow(null)}>
        <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit session</DialogTitle>
            <DialogDescription>{editingRow?.title}</DialogDescription>
          </DialogHeader>
          <SessionFormFields value={form} onChange={setForm} />
          <DialogFooter>
            <button
              type="button"
              onClick={() => setEditingRow(null)}
              className={ghostBtnCls}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitEdit}
              disabled={updateMut.isPending}
              className={primaryBtnCls}
            >
              {updateMut.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Save changes
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => !v && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete session?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes "{confirmDelete?.title}" and cascades to any linked
              enrollments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected.size} sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the selected sessions and cascades to any linked
              enrollments. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={bulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ============================================================
 * 3. ENROLLMENT MANAGEMENT
 * ============================================================ */

type StatusTab = "all" | EnrollmentStatus;

const STATUS_TABS: { key: StatusTab; label: string; tone: string }[] = [
  { key: "all", label: "All", tone: "bg-muted text-foreground" },
  { key: "pending", label: "Pending", tone: "bg-amber-500/15 text-amber-500" },
  { key: "approved", label: "Approved", tone: "bg-emerald-500/15 text-emerald-500" },
  { key: "rejected", label: "Rejected", tone: "bg-destructive/15 text-destructive" },
  { key: "banned", label: "Banned", tone: "bg-rose-500/15 text-rose-500" },
];

function TrackingCard({
  label,
  value,
  tone,
  icon: Icon,
  loading,
}: {
  label: string;
  value: number | undefined;
  tone: string;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
}) {
  return (
    <div className="glass shadow-card-soft flex items-center gap-3 rounded-2xl p-4">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
          tone,
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 font-display text-2xl font-bold tabular-nums">
          {loading || value == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <AnimatedCounter value={value} />
          )}
        </p>
      </div>
    </div>
  );
}

export function AdminEnrollment() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [rejectingIds, setRejectingIds] = useState<string[] | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [removeConfirm, setRemoveConfirm] =
    useState<ExamBatchEnrollmentEnrichedRow | null>(null);

  const sessionsQ = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", { archived: true }],
    queryFn: () => adminListExamBatchSessions({ data: { includeArchived: true } }),
    staleTime: 60_000,
  });
  const subjectsQ = useQuery({
    queryKey: ["exam-batch", "admin", "enrollment", "subjects"],
    queryFn: () => listSubjects(),
    staleTime: 60_000,
  });
  const enrollQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "enrollments",
      {
        session: sessionFilter,
        subject: subjectFilter,
        status: statusTab,
        offset: page * pageSize,
      },
    ],
    queryFn: () =>
      adminListExamBatchEnrollments({
        data: {
          sessionId: sessionFilter === "all" ? undefined : sessionFilter,
          subjectId: subjectFilter === "all" ? undefined : subjectFilter,
          status: statusTab === "all" ? undefined : statusTab,
          limit: pageSize,
          offset: page * pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });
  const countsQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "enrollments",
      "counts",
      { session: sessionFilter, subject: subjectFilter },
    ],
    queryFn: () =>
      adminGetExamBatchEnrollmentCounts({
        data: {
          sessionId: sessionFilter === "all" ? undefined : sessionFilter,
          subjectId: subjectFilter === "all" ? undefined : subjectFilter,
        },
      }),
    // Realtime (postgres_changes on exam_batch_enrollments) invalidates this
    // key already; no need for a 15s poll on top.
  });

  const invalidate = () => {
    // Broadcast so student sockets (and other admin tabs) refetch even when
    // postgres_changes are RLS-filtered or momentarily delayed.
    notifyExamBatchRealtime("exam_batch_enrollments");
    notifyExamBatchRealtime("exam_batch_enrollment_subjects");
    return queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
  };

  const approveMut = useMutation({
    mutationFn: (ids: string[]) =>
      adminApproveExamBatchEnrollments({ data: { enrollmentIds: ids } }),
    onSuccess: (r) => {
      toast.success(
        `Approved ${r.approvedCount}${
          r.skipped.length ? ` · ${r.skipped.length} skipped` : ""
        }`,
      );
      setSelected(new Set());
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Approve failed"),
  });
  const rejectMut = useMutation({
    mutationFn: ({ ids, notes }: { ids: string[]; notes?: string }) =>
      adminRejectExamBatchEnrollments({
        data: { enrollmentIds: ids, notes: notes || undefined },
      }),
    onSuccess: (r) => {
      toast.success(
        `Rejected ${r.rejectedCount}${
          r.skipped.length ? ` · ${r.skipped.length} skipped` : ""
        }`,
      );
      setSelected(new Set());
      setRejectingIds(null);
      setRejectNotes("");
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Reject failed"),
  });
  const setStatusMut = useMutation({
    mutationFn: (v: { id: string; status: EnrollmentStatus; notes?: string }) =>
      adminSetExamBatchEnrollmentStatus({
        data: { enrollmentId: v.id, status: v.status, notes: v.notes },
      }),
    onSuccess: (row) => {
      toast.success(`Moved to ${row.status}`);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Update failed"),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) =>
      adminRemoveExamBatchEnrollment({ data: { enrollmentId: id } }),
    onSuccess: () => {
      toast.success("Enrollment removed");
      setRemoveConfirm(null);
      void invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Remove failed"),
  });

  const sessions = sessionsQ.data ?? [];
  const sessionById = useMemo(() => {
    const m = new Map<string, ExamBatchSessionRow>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);

  const rows = enrollQ.data ?? [];
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (r.student_name ?? "").toLowerCase().includes(q) ||
        (r.student_email ?? "").toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        (r.student_id != null && String(r.student_id).includes(q)),
    );
  }, [rows, search]);

  const allSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selected.has(r.id));
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(filteredRows.map((r) => r.id)));
  const toggle = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setSelected(n);
  };

  const selectedIds = Array.from(selected);
  const counts = countsQ.data;

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Enrollment management"
        description="Approve, reject and audit incoming batch enrollments."
        icon={UserCheck}
        action={
          <button
            type="button"
            onClick={() => void invalidate()}
            className={ghostBtnCls}
          >
            <RefreshCw
              className={cn("h-4 w-4", enrollQ.isFetching && "animate-spin")}
            />{" "}
            Refresh
          </button>
        }
      />

      {/* Tracking cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <TrackingCard
          label="Total"
          value={counts?.total}
          tone="bg-primary/10 text-primary ring-primary/20"
          icon={Users}
          loading={countsQ.isLoading}
        />
        <TrackingCard
          label="Pending"
          value={counts?.pending}
          tone="bg-amber-500/15 text-amber-500 ring-amber-500/30"
          icon={Timer}
          loading={countsQ.isLoading}
        />
        <TrackingCard
          label="Approved"
          value={counts?.approved}
          tone="bg-emerald-500/15 text-emerald-500 ring-emerald-500/30"
          icon={Check}
          loading={countsQ.isLoading}
        />
        <TrackingCard
          label="Rejected"
          value={counts?.rejected}
          tone="bg-destructive/15 text-destructive ring-destructive/30"
          icon={X}
          loading={countsQ.isLoading}
        />
        <TrackingCard
          label="Today's Approval"
          value={counts?.todayApproved}
          tone="bg-sky-500/15 text-sky-500 ring-sky-500/30"
          icon={Sparkles}
          loading={countsQ.isLoading}
        />
        <TrackingCard
          label="This Week"
          value={counts?.weekApproved}
          tone="bg-indigo-500/15 text-indigo-500 ring-indigo-500/30"
          icon={TrendingUp}
          loading={countsQ.isLoading}
        />
      </div>

      <SectionCard
        title="Enrollment queue"
        description="Review incoming applications"
      >
        {/* Status tabs with real counts */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((t) => {
            const isActive = statusTab === t.key;
            const count =
              t.key === "all"
                ? counts?.total
                : t.key === "banned"
                  ? counts?.banned
                  : counts?.[t.key as "pending" | "approved" | "rejected"];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  setPage(0);
                  setStatusTab(t.key);
                }}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all",
                  isActive
                    ? "bg-cta-gradient text-white shadow-glow"
                    : cn(t.tone, "hover:opacity-90"),
                )}
              >
                <span>{t.label}</span>
                <span
                  className={cn(
                    "inline-flex min-w-[1.5rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ring-1 ring-inset",
                    isActive
                      ? "bg-white/20 text-white ring-white/30"
                      : "bg-background/60 text-foreground ring-border",
                  )}
                >
                  {count ?? "—"}
                </span>
              </button>
            );
          })}
          {countsQ.isFetching && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          )}
        </div>

        <FilterBar
          searchPlaceholder="Search by name, email or student id…"
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
            {(subjectsQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </FilterBar>

        <BulkBar count={selected.size} onClear={() => setSelected(new Set())}>
          <button
            type="button"
            disabled={approveMut.isPending}
            onClick={() => approveMut.mutate(selectedIds)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-500 hover:bg-emerald-500/25 disabled:opacity-60"
          >
            {approveMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}{" "}
            Approve
          </button>
          <button
            type="button"
            onClick={() => {
              setRejectingIds(selectedIds);
              setRejectNotes("");
            }}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-500 hover:bg-amber-500/25"
          >
            <X className="h-4 w-4" /> Reject
          </button>
        </BulkBar>

        {enrollQ.isLoading ? (
          <div className="flex items-center justify-center py-14 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : enrollQ.isError ? (
          <EmptyState
            icon={UserCheck}
            title="Couldn't load enrollments"
            description={(enrollQ.error as Error)?.message ?? "Try again."}
            action={
              <button className={primaryBtnCls} onClick={() => enrollQ.refetch()}>
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            }
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No enrollments"
            description="No enrollments match the current filters."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                  </th>
                  <th className="px-3 py-3">Student ID</th>
                  <th className="px-3 py-3">Student</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Session</th>
                  <th className="px-3 py-3">Subjects</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Submitted</th>
                  <th className="px-3 py-3">Approved</th>
                  <th className="px-3 py-3">Approved by</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((e) => {
                  const sess = sessionById.get(e.session_id);
                  const sessionTitle = e.session_title ?? sess?.title ?? "—";
                  const initials =
                    (e.student_name ?? e.student_email ?? e.user_id)
                      .slice(0, 2)
                      .toUpperCase();
                  return (
                    <tr
                      key={e.id}
                      className="border-t border-border/60 transition-colors hover:bg-muted/30"
                    >
                      <td className="px-3 py-3">
                        <Checkbox
                          checked={selected.has(e.id)}
                          onCheckedChange={() => toggle(e.id)}
                        />
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {e.student_id != null ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            <Hash className="h-3 w-3" />
                            {e.student_id}
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
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">
                              {e.student_name ?? "—"}
                            </p>
                            <p className="truncate font-mono text-[10px] text-muted-foreground">
                              {e.user_id.slice(0, 8)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        <span className="truncate">{e.student_email ?? "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {sessionTitle}
                      </td>
                      <td className="px-3 py-3">
                        {e.subject_names.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex max-w-[220px] flex-wrap gap-1">
                            {e.subject_names.slice(0, 3).map((n, i) => (
                              <span
                                key={`${e.id}-s-${i}`}
                                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold"
                              >
                                {n}
                              </span>
                            ))}
                            {e.subject_names.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{e.subject_names.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {fmtRelative(e.created_at)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {e.status === "approved" && e.reviewed_at
                          ? format(new Date(e.reviewed_at), "dd MMM yyyy")
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {e.status === "approved"
                          ? (e.reviewer_name ?? "—")
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-input bg-background/60 text-muted-foreground hover:bg-muted"
                                aria-label="Actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuLabel>
                                Manage enrollment
                              </DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {e.status === "pending" && (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() => approveMut.mutate([e.id])}
                                    className="text-emerald-500 focus:text-emerald-500"
                                  >
                                    <Check className="mr-2 h-4 w-4" /> Approve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() => {
                                      setRejectingIds([e.id]);
                                      setRejectNotes("");
                                    }}
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <X className="mr-2 h-4 w-4" /> Reject
                                  </DropdownMenuItem>
                                </>
                              )}
                              {e.status === "approved" && (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setStatusMut.mutate({
                                        id: e.id,
                                        status: "pending",
                                      })
                                    }
                                  >
                                    <Timer className="mr-2 h-4 w-4" /> Move to Pending
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setStatusMut.mutate({
                                        id: e.id,
                                        status: "rejected",
                                      })
                                    }
                                    className="text-destructive focus:text-destructive"
                                  >
                                    <X className="mr-2 h-4 w-4" /> Reject
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setStatusMut.mutate({
                                        id: e.id,
                                        status: "banned",
                                      })
                                    }
                                    className="text-rose-500 focus:text-rose-500"
                                  >
                                    <UserX className="mr-2 h-4 w-4" /> Ban
                                  </DropdownMenuItem>
                                </>
                              )}
                              {e.status === "rejected" && (
                                <>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setStatusMut.mutate({
                                        id: e.id,
                                        status: "pending",
                                      })
                                    }
                                  >
                                    <Timer className="mr-2 h-4 w-4" /> Move to Pending
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onSelect={() =>
                                      setStatusMut.mutate({
                                        id: e.id,
                                        status: "approved",
                                      })
                                    }
                                    className="text-emerald-500 focus:text-emerald-500"
                                  >
                                    <Check className="mr-2 h-4 w-4" /> Approve
                                  </DropdownMenuItem>
                                </>
                              )}
                              {e.status === "banned" && (
                                <DropdownMenuItem
                                  onSelect={() =>
                                    setStatusMut.mutate({
                                      id: e.id,
                                      status: "pending",
                                    })
                                  }
                                >
                                  <Timer className="mr-2 h-4 w-4" /> Unban → Pending
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onSelect={() => setRemoveConfirm(e)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" /> Remove
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

      {/* Reject dialog */}
      <Dialog
        open={!!rejectingIds}
        onOpenChange={(v) => !v && setRejectingIds(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Reject {rejectingIds?.length ?? 0} enrollment
              {(rejectingIds?.length ?? 0) === 1 ? "" : "s"}
            </DialogTitle>
            <DialogDescription>
              Bulk reject only affects pending rows. Use the row action menu to
              downgrade an already-approved enrollment.
            </DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Notes (optional)
            </span>
            <textarea
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-input bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
              placeholder="Reason for rejection…"
              maxLength={2000}
            />
          </label>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setRejectingIds(null)}
              className={ghostBtnCls}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={rejectMut.isPending}
              onClick={() =>
                rejectingIds &&
                rejectMut.mutate({ ids: rejectingIds, notes: rejectNotes })
              }
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60"
            >
              {rejectMut.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Reject
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!removeConfirm}
        onOpenChange={(v) => !v && setRemoveConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove enrollment?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the enrollment. The assigned Student ID is
              never recycled. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeConfirm && removeMut.mutate(removeConfirm.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ============================================================
 * 4. STUDENT MANAGEMENT
 * ============================================================ */

export function AdminStudents() {
  const queryClient = useQueryClient();
  const [sessionFilter, setSessionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [removeConfirm, setRemoveConfirm] =
    useState<ExamBatchEnrollmentEnrichedRow | null>(null);

  const sessionsQ = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", { archived: true }],
    queryFn: () => adminListExamBatchSessions({ data: { includeArchived: true } }),
    staleTime: 60_000,
  });
  const studentsQ = useQuery({
    queryKey: [
      "exam-batch",
      "admin",
      "enrollments",
      { session: sessionFilter, status: "approved", offset: page * pageSize },
    ],
    queryFn: () =>
      adminListExamBatchEnrollments({
        data: {
          sessionId: sessionFilter === "all" ? undefined : sessionFilter,
          status: "approved",
          limit: pageSize,
          offset: page * pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const removeMut = useMutation({
    mutationFn: (id: string) =>
      adminRemoveExamBatchEnrollment({ data: { enrollmentId: id } }),
    onSuccess: () => {
      toast.success("Student removed");
      setRemoveConfirm(null);
      notifyExamBatchRealtime("exam_batch_enrollments");
      notifyExamBatchRealtime("exam_batch_enrollment_subjects");
      void queryClient.invalidateQueries({ queryKey: ["exam-batch"] });
    },
    onError: (e: Error) => toast.error(e.message || "Remove failed"),
  });

  const sessions = sessionsQ.data ?? [];
  const sessionById = useMemo(() => {
    const m = new Map<string, ExamBatchSessionRow>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);

  const rows = studentsQ.data ?? [];
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (r.student_name ?? "").toLowerCase().includes(q) ||
        (r.student_email ?? "").toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        (r.student_id != null && String(r.student_id).includes(q)),
    );
  }, [rows, search]);

  const exportCsv = () => {
    if (rows.length === 0) return toast.error("Nothing to export");
    const header = [
      "student_id",
      "name",
      "email",
      "session",
      "subjects",
      "status",
      "approved_at",
      "created_at",
    ];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          r.student_id ?? "",
          JSON.stringify(r.student_name ?? ""),
          JSON.stringify(r.student_email ?? ""),
          JSON.stringify(r.session_title ?? sessionById.get(r.session_id)?.title ?? ""),
          JSON.stringify(r.subject_names.join(" | ")),
          r.status,
          r.reviewed_at ?? "",
          r.created_at,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `exam-batch-students-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${rows.length} rows`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Student management"
        description="View enrolled cohort members and manage access."
        icon={Users}
        action={
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className={ghostBtnCls}
          >
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />
      <SectionCard>
        <FilterBar
          searchPlaceholder="Search by name, email or student id…"
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
        </FilterBar>

        {studentsQ.isLoading ? (
          <div className="flex items-center justify-center py-14 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading students…
          </div>
        ) : studentsQ.isError ? (
          <EmptyState
            icon={Users}
            title="Couldn't load students"
            description={(studentsQ.error as Error)?.message ?? "Try again."}
            action={
              <button className={primaryBtnCls} onClick={() => studentsQ.refetch()}>
                <RefreshCw className="h-4 w-4" /> Retry
              </button>
            }
          />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No approved students"
            description="Approved enrollments will appear here."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border/60">
            <table className="w-full min-w-[1000px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">Student ID</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Email</th>
                  <th className="px-3 py-3">Session</th>
                  <th className="px-3 py-3">Subjects</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Enrolled</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => {
                  const sess = sessionById.get(r.session_id);
                  const initials = (
                    r.student_name ??
                    r.student_email ??
                    r.user_id
                  )
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
                        {r.student_email ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {r.session_title ?? sess?.title ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        {r.subject_names.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex max-w-[220px] flex-wrap gap-1">
                            {r.subject_names.slice(0, 3).map((n, i) => (
                              <span
                                key={`${r.id}-s-${i}`}
                                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold"
                              >
                                {n}
                              </span>
                            ))}
                            {r.subject_names.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{r.subject_names.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {format(new Date(r.created_at), "dd MMM yyyy")}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setRemoveConfirm(r)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-muted/70"
                          title="Remove enrollment"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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

      <AlertDialog
        open={!!removeConfirm}
        onOpenChange={(v) => !v && setRemoveConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove student from batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the enrollment. The Student ID
              {removeConfirm?.student_id != null
                ? ` (#${removeConfirm.student_id})`
                : ""}{" "}
              is never recycled. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeConfirm && removeMut.mutate(removeConfirm.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


/* ============================================================
 * 5. EXAM MANAGEMENT
 * ============================================================ */

function ExamCard({ data }: { data: ExamCardData }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="glass shadow-card-soft group relative overflow-hidden rounded-3xl p-5 transition-all hover:-translate-y-0.5 hover:shadow-glow"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-cta-gradient opacity-20 blur-3xl transition-opacity group-hover:opacity-30" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="bg-cta-gradient flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-glow">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base font-semibold">{data.subject}</p>
            <p className="text-xs text-muted-foreground">{data.chapter}</p>
          </div>
        </div>
        <StatusBadge status={data.status} />
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Questions
          </p>
          <p className="mt-0.5 font-semibold tabular-nums">{data.questions}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Duration
          </p>
          <p className="mt-0.5 font-semibold">{data.duration}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Available
          </p>
          <p className="mt-0.5 font-semibold">{data.availableAt}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Upcoming
          </p>
          <p className="mt-0.5 font-semibold">{data.upcomingAt}</p>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-2">
        <button className={primaryBtnCls}>
          <Eye className="h-4 w-4" /> View
        </button>
        <button className={ghostBtnCls}>
          <Pencil className="h-4 w-4" /> Edit
        </button>
        <div className="ml-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-input bg-background/60 text-muted-foreground hover:bg-muted">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Copy className="mr-2 h-4 w-4" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Archive className="mr-2 h-4 w-4" /> Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </motion.article>
  );
}

function _oldAdminExams() {
  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Exam management"
        description="Schedule mocks, chapter tests and grand tests inside each session."
        icon={FileText}
        action={
          <div className="flex gap-2">
            <button className={ghostBtnCls}>
              <Filter className="h-4 w-4" /> Advanced
            </button>
            <button className={primaryBtnCls}>
              <Plus className="h-4 w-4" /> New Exam
            </button>
          </div>
        }
      />
      <FilterBar searchPlaceholder="Search exams by subject or chapter…">
        <select className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm">
          <option>All sessions</option>
        </select>
        <select className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm">
          <option>All subjects</option>
        </select>
      </FilterBar>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {["All", "Live", "Upcoming", "Ended"].map((c, i) => (
          <FilterChip key={c} active={i === 0}>
            {c}
          </FilterChip>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {mockExamCards.map((e) => (
          <ExamCard key={e.id} data={e} />
        ))}
      </div>
    </>
  );
}

/* ============================================================
 * 6. LEADERBOARD (existing, polished)
 * ============================================================ */

const leaderColumns: Column<LeaderRow>[] = [
  {
    key: "rank",
    header: "#",
    cell: (r) => (
      <span
        className={
          r.rank === 1
            ? "font-display text-lg font-bold text-amber-500"
            : r.rank === 2
              ? "font-display text-lg font-bold text-zinc-400"
              : r.rank === 3
                ? "font-display text-lg font-bold text-orange-400"
                : "font-semibold text-muted-foreground"
        }
      >
        {r.rank}
      </span>
    ),
  },
  {
    key: "name",
    header: "Student",
    cell: (r) => (
      <div className="flex items-center gap-3">
        <div className="bg-cta-gradient flex h-9 w-9 items-center justify-center rounded-full font-display text-xs font-bold text-white shadow-glow">
          {r.name
            .split(" ")
            .map((p) => p[0])
            .slice(0, 2)
            .join("")}
        </div>
        <div>
          <p className="font-semibold">{r.name}</p>
          <p className="text-xs text-muted-foreground">{r.batch}</p>
        </div>
      </div>
    ),
  },
  {
    key: "score",
    header: "Score",
    cell: (r) => <span className="font-display text-base font-bold tabular-nums">{r.score}</span>,
  },
  { key: "acc", header: "Accuracy", cell: (r) => `${r.accuracy}%` },
];

function _oldAdminLeaderboard() {
  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Batch leaderboard"
        description="Top performers across all live and upcoming sessions."
        icon={Trophy}
        action={
          <button className={ghostBtnCls}>
            <Download className="h-4 w-4" /> Export
          </button>
        }
      />
      <SectionCard>
        <FilterBar searchPlaceholder="Search top performers…">
          <select className="h-10 rounded-xl border border-input bg-background/60 px-3 text-sm">
            <option>All batches</option>
          </select>
        </FilterBar>
        <DataTable columns={leaderColumns} rows={mockLeaderboard} />
      </SectionCard>
    </>
  );
}


// Phase 3 real-data implementations (see admin-phase3.tsx)
export { AdminCountdown, AdminDownloads, AdminSettings } from "./admin-phase3";

// Phase 2 real-data implementations (see admin-phase2.tsx)
export { AdminExams, AdminLeaderboard, AdminAnalytics } from "./admin-phase2";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _phase2Unused = [_oldAdminExams, _oldAdminLeaderboard, ExamCard, leaderColumns];
