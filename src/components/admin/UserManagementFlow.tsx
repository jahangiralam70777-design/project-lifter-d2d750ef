// @ts-nocheck
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getRoleDisplayName } from "@/lib/role-display";
import {
  Search,
  Users,
  UserPlus,
  UserX,
  Crown,
  ShieldCheck,
  Activity,
  TrendingUp,
  Filter,
  Loader2,
  X,
  Save,
  Edit3,
  Eye,
  Sparkles,
  CircleDot,
  CheckCircle2,
  Pause,
  Play,
  Trash2,
  RotateCcw,
  Clock,
  LogIn,
  Monitor,
  AlertTriangle,
  BarChart3,
  Plus,
  Download,
  MoreHorizontal,
  ArrowUp,
  ArrowDown,
  Mail,
  ShieldAlert,
  KeyRound,
  BadgeCheck,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListUsers,
  adminUserStats,
  adminSetUserStatus,
  adminSetUserRole,
  adminUpdateUserProfile,
  adminReferralStats,
  adminUserAnalytics,
  adminTopUsers,
  adminUserSessions,
  adminSoftDeleteUser,
  adminRestoreUser,
  adminHardDeleteUser,
  adminCreateStudent,
  adminVerifyUser,
} from "@/lib/admin-users.functions";
import {
  adminLoginHistory,
  adminDeviceBreakdown,
  adminLoginHeatmap,
  adminRoleBreakdown,
  adminSecuritySummary,
  adminSendPasswordReset,
  adminUserTrends,
} from "@/lib/admin-users-extra.functions";
import { adminActivityFeed } from "@/lib/admin-analytics.functions";
import { LiveMonitoringPanel } from "@/components/admin/LiveMonitoringPanel";
import { UserCommandDrawer } from "@/components/admin/users/UserCommandDrawer";
import {
  listRolePermissions,
  toggleRolePermission,
  ALL_ROLES,
  ALL_PERMISSIONS,
  type RbacRole,
} from "@/lib/admin-role-permissions.functions";
import { adminListLevels } from "@/lib/admin-mcq.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirmDialog } from "@/components/ui/confirm-imperative";
import { PageSizeSelect } from "@/components/ui/page-size-select";

type User = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  level: string;
  bio: string | null;
  status: "active" | "suspended" | "pending";
  referral_source: string | null;
  created_at: string;
  updated_at: string;
  roles: string[];
  roleDisplays: string[];
  last_login_at: string | null;
  total_login_count: number;
  total_usage_seconds: number;
  deleted_at: string | null;
  email: string | null;
  email_verified: boolean;
};

const REFERRAL_OPTIONS = [
  "Facebook",
  "YouTube",
  "Friend/Referral",
  "Teacher",
  "Google Search",
  "WhatsApp",
  "Instagram",
  "Other",
] as const;

const STATUS_TONE: Record<string, string> = {
  active:
    "border-emerald-400/30 bg-emerald-500/10 text-emerald-500 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
  pending:
    "border-amber-400/30 bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-1 ring-inset ring-amber-400/20",
  suspended:
    "border-rose-400/30 bg-rose-500/10 text-rose-500 dark:text-rose-300 ring-1 ring-inset ring-rose-400/20",
  deleted:
    "border-zinc-400/30 bg-zinc-500/10 text-zinc-500 dark:text-zinc-300 ring-1 ring-inset ring-zinc-400/20",
};

const LEVEL_TONE: Record<string, string> = {
  student:
    "bg-sky-500/10 text-sky-600 dark:text-sky-300 ring-1 ring-inset ring-sky-400/25",
  professional:
    "bg-violet-500/10 text-violet-600 dark:text-violet-300 ring-1 ring-inset ring-violet-400/25",
  certificate:
    "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-300 ring-1 ring-inset ring-fuchsia-400/25",
  expert:
    "bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-1 ring-inset ring-amber-400/25",
};

// Canonical role chip styling. Keys are the raw role values stored in
// public.user_roles — never display these directly; always render via
// getRoleDisplayName(role) so "super_admin" shows as "Super Admin", etc.
const ROLE_TONE: Record<string, { chip: string; dot: string }> = {
  super_admin: {
    chip: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-1 ring-inset ring-amber-400/25",
    dot: "bg-amber-500",
  },
  admin: {
    chip: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-400/25",
    dot: "bg-indigo-500",
  },
  moderator: {
    chip: "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-1 ring-inset ring-sky-400/25",
    dot: "bg-sky-500",
  },
  student: {
    chip: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-inset ring-emerald-400/25",
    dot: "bg-emerald-500",
  },
  user: {
    chip: "bg-zinc-500/10 text-zinc-700 dark:text-zinc-300 ring-1 ring-inset ring-zinc-400/25",
    dot: "bg-zinc-500",
  },
};

const ROLE_RANK = ["super_admin", "admin", "moderator", "student", "user"];
function sortRolesByRank(roles: string[]): string[] {
  return [...roles].sort((a, b) => {
    const ai = ROLE_RANK.indexOf(a);
    const bi = ROLE_RANK.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function fmtDuration(seconds: number) {
  if (!seconds || seconds < 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString();
}

function parseDevice(ua: string | null | undefined) {
  const s = ua ?? "";
  if (!s) return "—";
  let browser = "Unknown";
  if (/Edg\//.test(s)) browser = "Edge";
  else if (/Chrome\//.test(s)) browser = "Chrome";
  else if (/Safari\//.test(s)) browser = "Safari";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  const device = /Mobile|Android|iPhone/.test(s)
    ? "Mobile"
    : /iPad|Tablet/.test(s)
      ? "Tablet"
      : "Desktop";
  return `${browser} · ${device}`;
}

export function UserManagementFlow() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListUsers);
  const statsFn = useServerFn(adminUserStats);
  const referralFn = useServerFn(adminReferralStats);
  const statusFn = useServerFn(adminSetUserStatus);
  const levelsFn = useServerFn(adminListLevels);
  const analyticsFn = useServerFn(adminUserAnalytics);
  const topFn = useServerFn(adminTopUsers);
  const softDeleteFn = useServerFn(adminSoftDeleteUser);
  const restoreFn = useServerFn(adminRestoreUser);
  const hardDeleteFn = useServerFn(adminHardDeleteUser);
  const verifyFn = useServerFn(adminVerifyUser);
  const resetPwFn = useServerFn(adminSendPasswordReset);
  const userSessionsFn = useServerFn(adminUserSessions);
  const [showCreate, setShowCreate] = useState(false);

  const [search, setSearch] = useState("");
  const [role, setRole] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [level, setLevel] = useState<string>("all");
  const [referralFilter, setReferralFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("lifetime");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<User | null>(null);
  const [viewing, setViewing] = useState<User | null>(null);
  const [commandUser, setCommandUser] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ user: User; mode: "soft" | "hard" } | null>(
    null,
  );

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel(`users-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-users"] });
        qc.invalidateQueries({ queryKey: ["admin-user-stats"] });
        qc.invalidateQueries({ queryKey: ["admin-referral-stats"] });
        qc.invalidateQueries({ queryKey: ["admin-user-analytics"] });
        qc.invalidateQueries({ queryKey: ["admin-top-users"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-users"] });
        qc.invalidateQueries({ queryKey: ["admin-user-stats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_login_events" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-user-analytics"] });
        qc.invalidateQueries({ queryKey: ["admin-top-users"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const stats = useQuery({ queryKey: ["admin-user-stats"], queryFn: () => statsFn() });
  const analytics = useQuery({
    queryKey: ["admin-user-analytics"],
    queryFn: () => analyticsFn(),
    staleTime: 15_000,
  });
  const topMost = useQuery({
    queryKey: ["admin-top-users", "most"],
    queryFn: () => topFn({ data: { order: "most", limit: 10 } }),
    staleTime: 30_000,
  });
  const topLeast = useQuery({
    queryKey: ["admin-top-users", "least"],
    queryFn: () => topFn({ data: { order: "least", limit: 10 } }),
    staleTime: 30_000,
  });
  const referralStats = useQuery({
    queryKey: ["admin-referral-stats"],
    queryFn: () => referralFn(),
  });
  const levels = useQuery({ queryKey: ["admin-levels"], queryFn: () => levelsFn() });

  const devicesFn = useServerFn(adminDeviceBreakdown);
  const heatmapFn = useServerFn(adminLoginHeatmap);
  const loginHistoryFn = useServerFn(adminLoginHistory);
  const rolesFn = useServerFn(adminRoleBreakdown);
  const securityFn = useServerFn(adminSecuritySummary);
  const feedFn = useServerFn(adminActivityFeed);

  const devices = useQuery({
    queryKey: ["admin-devices"],
    queryFn: () => devicesFn({ data: { rangeHours: 24 * 7 } }),
    staleTime: 60_000,
  });
  const heatmap = useQuery({
    queryKey: ["admin-heatmap"],
    queryFn: () => heatmapFn({ data: { days: 7 } }),
    staleTime: 60_000,
  });
  const loginHistory = useQuery({
    queryKey: ["admin-login-history"],
    queryFn: () => loginHistoryFn({ data: { limit: 100, rangeHours: 24 * 14 } }),
    staleTime: 30_000,
  });
  const roleBreakdown = useQuery({
    queryKey: ["admin-role-breakdown"],
    queryFn: () => rolesFn(),
    staleTime: 60_000,
  });
  const security = useQuery({
    queryKey: ["admin-security-summary"],
    queryFn: () => securityFn({ data: { rangeHours: 24 * 7 } }),
    staleTime: 30_000,
  });
  const activityFeed = useQuery({
    queryKey: ["admin-activity-feed"],
    queryFn: () => feedFn({ data: { rangeHours: 24, limit: 60 } }),
    staleTime: 15_000,
  });
  const debouncedSearch = useDebouncedValue(search, 300);
  const list = useQuery({
    queryKey: [
      "admin-users",
      { search: debouncedSearch, role, status, level, referralFilter, dateRange, page, pageSize },
    ],
    queryFn: () =>
      listFn({
        data: {
          search: debouncedSearch || undefined,
          role:
            role === "all"
              ? undefined
              : (role as "admin" | "super_admin" | "moderator" | "student" | "user"),
          status:
            status === "all"
              ? undefined
              : (status as "active" | "suspended" | "pending" | "deleted"),
          level: level === "all" ? undefined : level,
          referralSource: referralFilter === "all" ? undefined : referralFilter,
          dateRange: dateRange === "lifetime" ? undefined : (dateRange as "24h" | "7d" | "30d"),
          page,
          pageSize,
        },
      }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-user-stats"] });
    qc.invalidateQueries({ queryKey: ["admin-user-analytics"] });
    qc.invalidateQueries({ queryKey: ["admin-top-users"] });
  };

  const statusM = useMutation({
    mutationFn: (v: { id: string; status: User["status"] }) => statusFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(`User ${v.status}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const softDeleteM = useMutation({
    mutationFn: (id: string) => softDeleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("User removed (archived)");
      invalidate();
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreM = useMutation({
    mutationFn: (id: string) => restoreFn({ data: { id } }),
    onSuccess: () => {
      toast.success("User restored");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const hardDeleteM = useMutation({
    mutationFn: (v: { id: string; confirmName: string }) => hardDeleteFn({ data: v }),
    onSuccess: () => {
      toast.success("User permanently deleted");
      invalidate();
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [tab, setTab] = useState<
    "overview" | "analytics" | "roles" | "activity" | "logins" | "security" | "permissions"
  >("overview");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<"name" | "joined" | "status" | "last_active">("joined");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const rawRows = (list.data?.rows ?? []) as User[];
  const rows = [...rawRows].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortKey === "name") return a.display_name.localeCompare(b.display_name) * dir;
    if (sortKey === "status")
      return (
        (a.deleted_at ? "deleted" : a.status).localeCompare(b.deleted_at ? "deleted" : b.status) *
        dir
      );
    if (sortKey === "last_active")
      return (
        (new Date(a.last_login_at ?? 0).getTime() - new Date(b.last_login_at ?? 0).getTime()) * dir
      );
    return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
  });
  const total = list.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const a = analytics.data;
  const s = stats.data;

  useEffect(() => {
    setSelected(new Set());
  }, [page, debouncedSearch, role, status, level, referralFilter, dateRange]);

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allOnPageSelected) rows.forEach((r) => next.delete(r.id));
    else rows.forEach((r) => next.add(r.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const bulkStatus = useMutation({
    mutationFn: async (newStatus: User["status"]) => {
      const ids = [...selected];
      for (const id of ids) await statusFn({ data: { id, status: newStatus } });
      return ids.length;
    },
    onSuccess: (n, st) => {
      toast.success(`${n} user${n === 1 ? "" : "s"} marked ${st}`);
      invalidate();
      setSelected(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkArchive = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      for (const id of ids) await softDeleteFn({ data: { id } });
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} user${n === 1 ? "" : "s"} archived`);
      invalidate();
      setSelected(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const verifyM = useMutation({
    mutationFn: (id: string) => verifyFn({ data: { id } }),
    onSuccess: () => {
      toast.success("User verified");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetPwM = useMutation({
    mutationFn: (id: string) =>
      resetPwFn({ data: { id } }),
    onSuccess: (r) => toast.success(`Password reset email sent${r?.email ? ` to ${r.email}` : ""}`),
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkVerify = useMutation({
    mutationFn: async () => {
      const ids = [...selected];
      for (const id of ids) await verifyFn({ data: { id } });
      return ids.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} user${n === 1 ? "" : "s"} verified`);
      invalidate();
      setSelected(new Set());
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportCsv = (scope: "page" | "selected" | "all") => {
    const source: User[] = scope === "selected" ? rows.filter((r) => selected.has(r.id)) : rows; // 'all' currently exports current page; backend export not yet available
    if (source.length === 0) {
      toast.error("Nothing to export");
      return;
    }
    const header = [
      "id",
      "name",
      "level",
      "roles",
      "status",
      "last_login",
      "total_logins",
      "usage_seconds",
      "joined",
    ];
    const csv = [
      header.join(","),
      ...source.map((u) =>
        [
          u.id,
          JSON.stringify(u.display_name),
          u.level,
          JSON.stringify(u.roles.join("|")),
          u.deleted_at ? "deleted" : u.status,
          u.last_login_at ?? "",
          u.total_login_count ?? 0,
          u.total_usage_seconds ?? 0,
          u.created_at,
        ].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `users-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`Exported ${source.length} row${source.length === 1 ? "" : "s"}`);
  };

  // Real period-over-period trends (last 7d vs prior 7d) from timestamped events
  const trendsFn = useServerFn(adminUserTrends);
  const trends = useQuery({
    queryKey: ["admin-user-trends", 7],
    queryFn: () => trendsFn({ data: { days: 7 } }),
    staleTime: 60_000,
  });
  const t = trends.data;
  const totalUsers = s?.total ?? 0;
  const verifiedCount = (s as { verified?: number } | undefined)?.verified ?? 0;
  const fmtTrend = (n: number | undefined) => {
    if (n === undefined) return "—";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n}% vs prev 7d`;
  };
  const kpis = [
    {
      l: "Total Users",
      v: totalUsers,
      i: Users,
      tone: "from-violet-500/30 to-fuchsia-500/20 text-violet-400",
      sub: `${fmtTrend(t?.new_users.pct)} · ${t?.new_users.current ?? 0} new`,
      filter: {} as Record<string, unknown>,
    },
    {
      l: "Active Users",
      v: s?.active ?? 0,
      i: Activity,
      tone: "from-emerald-500/30 to-cyan-500/20 text-emerald-400",
      sub: fmtTrend(t?.active.pct),
      filter: { status: "active" },
    },
    {
      l: "Pending Users",
      v: s?.pending ?? 0,
      i: TrendingUp,
      tone: "from-amber-500/30 to-orange-500/20 text-amber-400",
      sub: `${(a?.active_24h ?? 0).toLocaleString()} active 24h`,
      filter: { status: "pending" },
    },
    {
      l: "Suspended Users",
      v: s?.suspended ?? 0,
      i: UserX,
      tone: "from-rose-500/30 to-red-500/20 text-rose-400",
      sub: `${fmtTrend(t?.suspended_actions.pct)} actions`,
      filter: { status: "suspended" },
    },
    {
      l: "Administrators",
      v: s?.admins ?? 0,
      i: Crown,
      tone: "from-blue-500/30 to-indigo-500/20 text-blue-400",
      sub: `${totalUsers > 0 ? Math.round(((s?.admins ?? 0) / totalUsers) * 100) : 0}% of total`,
      filter: { role: "admin" },
    },
    {
      l: "Verified Users",
      v: verifiedCount,
      i: BadgeCheck,
      tone: "from-purple-500/30 to-pink-500/20 text-purple-400",
      sub: `${fmtTrend(t?.verifications.pct)} verified`,
      filter: { verified: true },
    },
  ];

  const TABS = [
    { k: "overview", l: "Overview" },
    { k: "analytics", l: "User Analytics" },
    { k: "roles", l: "Role Analytics" },
    { k: "activity", l: "Activity Logs" },
    { k: "logins", l: "Login History" },
    { k: "security", l: "Security" },
    { k: "permissions", l: "Permissions" },
  ] as const;

  return (
    <div className="space-y-5 p-4 lg:p-6">
      {/* Premium header */}
      <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-72 w-72 rounded-full bg-gradient-to-br from-violet-500/30 via-fuchsia-500/20 to-blue-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Badge className="border-0 bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-glow">
              <Sparkles className="mr-1 h-3 w-3" /> Identity Control
            </Badge>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              User{" "}
              <span className="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-blue-400 bg-clip-text text-transparent">
                Management
              </span>
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Manage students, roles, permissions and account status in real-time.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowCreate(true)}
              className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-glow hover:opacity-90"
            >
              <Plus className="mr-1 h-4 w-4" /> Add New Student
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              title="More"
              aria-label="More options"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* KPI grid */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map(({ l, v, i: Icon, tone, sub, filter }) => (
          <Link
            key={l}
            to="/admin/users/list"
            search={{ ...(filter as Record<string, never>), title: l }}
            className="glass shadow-card-soft group relative block overflow-hidden rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:ring-1 hover:ring-violet-500/40 focus:outline-none focus:ring-2 focus:ring-violet-500/60"
            aria-label={`View ${l}`}
          >
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${tone}`} />
            <div
              className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${tone}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">{l}</p>
            <p className="font-display text-2xl font-bold tracking-tight">{v.toLocaleString()}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
          </Link>
        ))}
      </section>

      {/* Tabs */}
      <section className="glass shadow-card-soft rounded-2xl px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`relative whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-medium transition ${
                tab === t.k
                  ? "bg-gradient-to-r from-violet-600/20 to-fuchsia-500/10 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.l}
              {tab === t.k && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500" />
              )}
            </button>
          ))}
        </div>
      </section>

      {/* Overview: secondary stat strip */}
      {tab === "overview" && (
        <>
          <LiveMonitoringPanel />
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              {
                l: "Active 24h",
                v: (a?.active_24h ?? 0).toLocaleString(),
                sub: "Unique users",
                c: "text-emerald-400",
                to: "/admin/users/analytics" as const,
                search: { metric: "active" as const, range: "24h" as const },
              },
              {
                l: "Active 7d",
                v: (a?.active_7d ?? 0).toLocaleString(),
                sub: "Unique users",
                c: "text-violet-400",
                to: "/admin/users/analytics" as const,
                search: { metric: "active" as const, range: "7d" as const },
              },
              {
                l: "Usage 7d",
                v: fmtDuration(a?.usage_7d ?? 0),
                sub: "Total time",
                c: "text-blue-400",
                to: "/admin/users/analytics" as const,
                search: { metric: "usage" as const, range: "7d" as const },
              },
              {
                l: "Login by Device",
                v: "View",
                sub: "Mobile · Tablet · Desktop",
                c: "text-fuchsia-400",
                to: "/admin/users/analytics" as const,
                search: { metric: "devices" as const, range: "7d" as const },
              },
              {
                l: "Activity Heatmap",
                v: "View",
                sub: "Hourly intensity",
                c: "text-amber-400",
                to: "/admin/users/analytics" as const,
                search: { metric: "heatmap" as const, range: "7d" as const },
              },
            ].map((x) => (
              <Link
                key={x.l}
                to={x.to}
                search={x.search}
                className="glass shadow-card-soft block rounded-2xl p-4 transition hover:scale-[1.02] hover:bg-white/5"
              >
                <p className="text-[11px] text-muted-foreground">{x.l}</p>
                <p className="text-[10px] text-muted-foreground">{x.sub}</p>
                <p className={`mt-2 font-display text-xl font-bold ${x.c}`}>{x.v}</p>
              </Link>
            ))}
          </section>
        </>
      )}

      {tab !== "overview" && (
        <TabPanel
          tab={tab}
          analytics={a}
          stats={s}
          devices={devices.data}
          heatmap={heatmap.data}
          loginHistory={loginHistory.data ?? []}
          loginHistoryLoading={loginHistory.isLoading}
          activity={activityFeed.data ?? []}
          activityLoading={activityFeed.isLoading}
          roles={roleBreakdown.data ?? []}
          security={security.data}
        />
      )}

      {/* Filters */}
      <section className="glass shadow-card-soft rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search users by name, email or ID…"
              className="h-9 rounded-xl pl-9"
            />
          </div>
          <Select
            value={role}
            onValueChange={(v) => {
              setRole(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-32 rounded-xl">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="moderator">Moderator</SelectItem>
              <SelectItem value="admin">Admin (incl. Super Admin)</SelectItem>
              <SelectItem value="super_admin">Super Admin only</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-32 rounded-xl">
              <SelectValue placeholder="Any Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="deleted">Deleted (archived)</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={level}
            onValueChange={(v) => {
              setLevel(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-32 rounded-xl">
              <SelectValue placeholder="All Levels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              {((levels.data as Array<{ code: string; name: string }> | undefined) ?? []).map(
                (l) => (
                  <SelectItem key={l.code} value={l.code}>
                    {l.name}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
          <Select
            value={referralFilter}
            onValueChange={(v) => {
              setReferralFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-36 rounded-xl">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {REFERRAL_OPTIONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={dateRange}
            onValueChange={(v) => {
              setDateRange(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-32 rounded-xl">
              <SelectValue placeholder="Date Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lifetime">Lifetime</SelectItem>
              <SelectItem value="24h">Active 24h</SelectItem>
              <SelectItem value="7d">Active 7d</SelectItem>
              <SelectItem value="30d">Active 30d</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="ml-auto rounded-full text-[10px]">
            <Filter className="mr-1 h-3 w-3" />
            {total.toLocaleString()} users
          </Badge>
        </div>
      </section>

      {/* Bulk action bar */}
      <section className="glass shadow-card-soft flex flex-wrap items-center justify-between gap-2 rounded-2xl p-3">
        <p className="text-xs text-muted-foreground">
          {selected.size > 0 ? (
            <>
              <span className="font-semibold text-foreground">{selected.size}</span> selected
            </>
          ) : (
            <>
              <span className="font-semibold text-foreground">{total.toLocaleString()}</span> users
              found
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {selected.size > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={bulkStatus.isPending}
                onClick={() => bulkStatus.mutate("active")}
              >
                <CheckCircle2 className="mr-1 h-3.5 w-3.5 text-emerald-400" /> Activate
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={bulkStatus.isPending}
                onClick={() => bulkStatus.mutate("suspended")}
              >
                <Pause className="mr-1 h-3.5 w-3.5 text-amber-400" /> Suspend
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={bulkVerify.isPending}
                onClick={() => bulkVerify.mutate()}
              >
                <BadgeCheck className="mr-1 h-3.5 w-3.5 text-emerald-400" /> Verify
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={bulkArchive.isPending}
                onClick={() => {
                  void (async () => {
                    if (
                      await confirmDialog({
                        title: `Archive ${selected.size} users?`,
                        variant: "destructive",
                        confirmLabel: "Archive",
                      })
                    )
                      bulkArchive.mutate();
                  })();
                }}
              >
                <UserX className="mr-1 h-3.5 w-3.5 text-rose-400" /> Archive
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => exportCsv("selected")}
              >
                <Download className="mr-1 h-3.5 w-3.5" /> Export selected
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="rounded-xl"
                onClick={() => setSelected(new Set())}
              >
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            </>
          )}
          {selected.size === 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                disabled={rows.length === 0}
                onClick={() => setSelected(new Set(rows.map((r) => r.id)))}
                title="Select all users on this page to enable bulk actions"
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Select page
              </Button>
              <Button
                size="sm"
                className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white"
                onClick={() => exportCsv("page")}
              >
                <Download className="mr-1 h-3.5 w-3.5" /> Export
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Main grid: table + live activity */}
      <section className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* Table */}
        <div className="glass shadow-card-soft overflow-hidden rounded-2xl border border-border/40 ring-1 ring-inset ring-white/[0.04] dark:ring-white/[0.03]">
          <div className="flex items-center justify-between gap-3 border-b border-border/40 bg-gradient-to-b from-background/60 to-background/20 px-6 py-5">
            <div className="space-y-1">
              <h3 className="font-display text-lg font-bold tracking-tight text-foreground">All Users</h3>
              <p className="text-[11px] font-medium text-muted-foreground">
                Page {page} of {totalPages} <span className="mx-1.5 text-muted-foreground/40">|</span> Live sync
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/[0.08] px-3 py-1.5 text-[11px] font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-400/15 dark:text-emerald-300">
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Realtime
            </div>
          </div>
          <div className="overflow-x-auto">
            {list.isLoading ? (
              <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                No users match the current filters.
              </div>
            ) : (
              <table className="w-full min-w-[720px] text-xs">
                <thead className="border-b border-border/40 bg-muted/50 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-5 py-3.5 w-11">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 cursor-pointer rounded border-border/60 bg-background accent-[var(--neon-purple)] ring-1 ring-inset ring-border/40 transition"
                      />
                    </th>
                    {[
                      { label: "User", key: "name" as const },
                      { label: "Email", key: null },
                      { label: "Role", key: null },
                      { label: "Level", key: null },
                      { label: "Status", key: "status" as const },
                      { label: "Last Active", key: "last_active" as const },
                      { label: "Joined", key: "joined" as const },
                      { label: "Actions", key: null },
                    ].map((h) => (
                      <th key={h.label} className="whitespace-nowrap px-5 py-3.5 font-semibold">
                        {h.key ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(h.key!)}
                            className="inline-flex items-center gap-1.5 transition hover:text-foreground"
                          >
                            {h.label}
                            {sortKey === h.key ? (
                              sortDir === "asc" ? (
                                <ArrowUp className="h-3 w-3 text-[var(--neon-purple)]" />
                              ) : (
                                <ArrowDown className="h-3 w-3 text-[var(--neon-purple)]" />
                              )
                            ) : null}
                          </button>
                        ) : (
                          h.label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/[0.35]">
                  {rows.map((u) => {
                    const isAdmin = u.roles.includes("admin") || u.roles.includes("super_admin");
                    const isDeleted = !!u.deleted_at;
                    const displayStatus = isDeleted ? "deleted" : u.status;
                    const checked = selected.has(u.id);
                    return (
                      <tr
                        key={u.id}
                        className={`group relative transition-colors duration-200 hover:bg-muted/30 ${isDeleted ? "opacity-55" : ""} ${checked ? "bg-[var(--neon-purple)]/[0.035]" : ""}`}
                      >
                        <td className="relative px-5 py-3.5">
                          {checked && (
                            <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-gradient-to-b from-[var(--neon-purple)] to-[var(--neon-pink)]" />
                          )}
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(u.id)}
                            className="h-3.5 w-3.5 cursor-pointer rounded border-border/60 bg-background accent-[var(--neon-purple)] ring-1 ring-inset ring-border/40 transition"
                          />
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3.5">
                            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[11px] font-bold text-white shadow-[0_4px_14px_-4px_rgba(139,92,246,0.5)] ring-2 ring-background">
                              {u.display_name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold tracking-tight text-foreground">
                                {u.display_name}
                                {isAdmin && <Crown className="h-3 w-3 shrink-0 text-amber-400" />}
                              </p>
                              <p className="font-mono text-[10px] tracking-wide text-muted-foreground/70">
                                {u.id.slice(0, 8)}…
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate max-w-[200px] text-[12px]">{u.email ?? "—"}</span>
                            {u.email_verified && (
                              <BadgeCheck
                                className="h-3.5 w-3.5 shrink-0 text-emerald-500 dark:text-emerald-400"
                                aria-label="Verified"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex flex-nowrap items-center gap-1.5">
                            {(() => {
                              const ordered = sortRolesByRank(u.roles ?? []);
                              if (ordered.length === 0) {
                                return (
                                  <span className="text-[11px] font-medium text-muted-foreground">
                                    No role assigned
                                  </span>
                                );
                              }
                              return ordered.map((roleKey) => {
                                const tone = ROLE_TONE[roleKey] ?? ROLE_TONE.user;
                                return (
                                  <span
                                    key={roleKey}
                                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[10px] font-semibold ${tone.chip}`}
                                    title={getRoleDisplayName(roleKey)}
                                  >
                                    <span className={`h-1 w-1 rounded-full ${tone.dot}`} />
                                    {getRoleDisplayName(roleKey)}
                                  </span>
                                );
                              });
                            })()}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[10px] font-semibold capitalize ${LEVEL_TONE[String(u.level).toLowerCase()] ?? "bg-muted text-muted-foreground ring-1 ring-inset ring-border/60"}`}
                          >
                            <span className={`h-1 w-1 rounded-full ${String(u.level).toLowerCase() === "student" ? "bg-sky-500" : String(u.level).toLowerCase() === "professional" ? "bg-violet-500" : String(u.level).toLowerCase() === "certificate" ? "bg-fuchsia-500" : String(u.level).toLowerCase() === "expert" ? "bg-amber-500" : "bg-muted-foreground"}`} />
                            {u.level}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[10px] font-semibold capitalize ${STATUS_TONE[displayStatus]}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${displayStatus === "active" ? "bg-emerald-400" : displayStatus === "pending" ? "bg-amber-400" : displayStatus === "suspended" ? "bg-rose-400" : "bg-zinc-400"}`} />
                            {displayStatus}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-muted-foreground whitespace-nowrap tabular-nums">
                          {fmtDateTime(u.last_login_at)}
                        </td>
                        <td className="px-5 py-3.5 text-[12px] text-muted-foreground tabular-nums">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>

                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">

                            <IconBtn title="View details" onClick={() => setViewing(u)}>
                              <Eye className="h-3.5 w-3.5" />
                            </IconBtn>
                            <IconBtn
                              title="Open command center"
                              onClick={() => setCommandUser(u)}
                            >
                              <Sparkles className="h-3.5 w-3.5 text-violet-400" />
                            </IconBtn>
                            <IconBtn title="Edit profile" onClick={() => setEditing(u)}>
                              <Edit3 className="h-3.5 w-3.5" />
                            </IconBtn>
                            {!u.email_verified && (
                              <IconBtn
                                title="Verify user (email)"
                                disabled={verifyM.isPending}
                                onClick={() => verifyM.mutate(u.id)}
                              >
                                <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />
                              </IconBtn>
                            )}
                            <IconBtn
                              title="Send password reset email"
                              disabled={resetPwM.isPending || !u.email}
                              onClick={() => {
                                void (async () => {
                                  if (
                                    await confirmDialog({
                                      title: "Send password reset email?",
                                      description: `An email with a reset link will be sent to ${u.email}.`,
                                      confirmLabel: "Send",
                                    })
                                  )
                                    resetPwM.mutate(u.id);
                                })();
                              }}
                            >
                              <KeyRound className="h-3.5 w-3.5 text-sky-400" />
                            </IconBtn>
                            {!isDeleted && u.status === "suspended" ? (
                              <IconBtn
                                title="Reactivate"
                                onClick={() => statusM.mutate({ id: u.id, status: "active" })}
                              >
                                <Play className="h-3.5 w-3.5 text-emerald-400" />
                              </IconBtn>
                            ) : !isDeleted ? (
                              <IconBtn
                                title="Suspend"
                                onClick={() => {
                                  void (async () => {
                                    if (
                                      await confirmDialog({
                                        title: `Suspend ${u.display_name}?`,
                                        variant: "destructive",
                                        confirmLabel: "Suspend",
                                      })
                                    )
                                      statusM.mutate({ id: u.id, status: "suspended" });
                                  })();
                                }}
                              >
                                <Pause className="h-3.5 w-3.5 text-amber-400" />
                              </IconBtn>
                            ) : null}
                            {isDeleted ? (
                              <IconBtn title="Restore user" onClick={() => restoreM.mutate(u.id)}>
                                <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                              </IconBtn>
                            ) : (
                              <IconBtn
                                title={isAdmin ? "Demote admin first" : "Remove (archive)"}
                                disabled={isAdmin}
                                onClick={() => setConfirmDelete({ user: u, mode: "soft" })}
                              >
                                <UserX
                                  className={`h-3.5 w-3.5 ${isAdmin ? "text-muted-foreground" : "text-amber-400"}`}
                                />
                              </IconBtn>
                            )}
                            <IconBtn
                              title={isAdmin ? "Demote admin first" : "Permanent delete"}
                              disabled={isAdmin}
                              onClick={() => setConfirmDelete({ user: u, mode: "hard" })}
                            >
                              <Trash2
                                className={`h-3.5 w-3.5 ${isAdmin ? "text-muted-foreground" : "text-rose-400"}`}
                              />
                            </IconBtn>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 bg-gradient-to-t from-background/40 to-transparent px-6 py-4 text-xs text-muted-foreground">
              <span className="font-medium tabular-nums">
                Showing{" "}
                <span className="font-semibold text-foreground">
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)}
                </span>{" "}
                of <span className="font-semibold text-foreground">{total.toLocaleString()}</span>
              </span>
              <div className="flex items-center gap-3">
                <PageSizeSelect
                  value={pageSize}
                  onChange={(n) => {
                    setPageSize(n);
                    setPage(1);
                  }}
                />
                <div className="inline-flex items-center gap-1 rounded-xl border border-border/50 bg-muted/40 p-1 shadow-sm">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-semibold text-muted-foreground transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    Prev
                  </button>
                  <span className="inline-flex h-8 min-w-[32px] items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 px-2.5 text-[11px] font-bold text-white shadow-[0_2px_10px_-2px_rgba(139,92,246,0.5)]">
                    {page}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-semibold text-muted-foreground transition hover:bg-background hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Real-time activity sidebar */}
        <aside className="space-y-4">
          <div className="glass shadow-card-soft rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold tracking-tight">
                  Real-time Activity
                </h3>
                <p className="text-[10px] text-muted-foreground">Last 7 days</p>
              </div>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-glow">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/60" />
              </span>
            </div>
            <ul className="space-y-2 text-xs">
              {(activityFeed.data ?? []).slice(0, 8).map((ev) => {
                const label = (ev as { display_name?: string | null }).display_name ?? "System";
                const action =
                  ev.event_type === "click"
                    ? `Clicked ${ev.element_label ?? "element"}`
                    : ev.event_type === "page_view"
                      ? `Viewed ${ev.page_path ?? "/"}`
                      : ev.event_type === "login"
                        ? "Logged in"
                        : ev.event_type === "submit"
                          ? `Submitted ${ev.element_label ?? "form"}`
                          : ev.event_type === "crud"
                            ? `${ev.target_kind ?? "Record"} ${ev.module ?? "updated"}`
                            : ev.event_type === "admin_action"
                              ? `Admin: ${ev.element_label ?? ev.module ?? "action"}`
                              : ev.event_type;
                return (
                  <li
                    key={ev.id}
                    className="flex items-start gap-2.5 rounded-xl border border-border/30 bg-background/40 p-2.5"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[10px] font-bold text-white">
                      {label.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium">{label}</p>
                      <p className="truncate text-[10px] text-muted-foreground">{action}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </li>
                );
              })}
              {(activityFeed.data ?? []).length === 0 && (
                <li className="rounded-xl border border-dashed border-border/40 p-3 text-center text-[11px] text-muted-foreground">
                  No activity recorded yet.
                </li>
              )}
            </ul>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 w-full rounded-xl text-[11px]"
              onClick={() => setTab("activity")}
            >
              View All Activity
            </Button>
          </div>

          <div className="glass shadow-card-soft rounded-2xl p-4">
            <h3 className="mb-3 font-display text-sm font-bold tracking-tight">System Alerts</h3>
            <ul className="space-y-2 text-xs">
              <li className="flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-500/5 p-2.5">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                <div>
                  <p className="text-[11px] font-medium">{s?.suspended ?? 0} Suspended Accounts</p>
                  <p className="text-[10px] text-muted-foreground">Awaiting review</p>
                </div>
              </li>
              <li className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-500/5 p-2.5">
                <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                <div>
                  <p className="text-[11px] font-medium">{s?.pending ?? 0} Accounts Pending</p>
                  <p className="text-[10px] text-muted-foreground">Awaiting email verification</p>
                </div>
              </li>
              <li className="flex items-start gap-2 rounded-xl border border-violet-400/30 bg-violet-500/5 p-2.5">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-400" />
                <div>
                  <p className="text-[11px] font-medium">{a?.active_24h ?? 0} active in last 24h</p>
                  <p className="text-[10px] text-muted-foreground">Live session count</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="glass shadow-card-soft rounded-2xl p-4">
            <h3 className="mb-3 font-display text-sm font-bold tracking-tight">Top Active Users</h3>
            <ul className="space-y-1.5 text-xs">
              {(topMost.data ?? []).slice(0, 5).map((u) => (
                <li
                  key={u.user_id}
                  className="flex items-center justify-between rounded-lg border border-border/30 bg-background/40 px-2 py-1.5"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[9px] font-bold text-white">
                      {u.display_name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="truncate text-[11px]">{u.display_name}</span>
                  </span>
                  <span className="font-mono text-[10px] text-violet-400">
                    {u.total_login_count} sess
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      {/* Bottom analytics row */}
      <section className="grid gap-3 lg:grid-cols-3">
        <Link
          to="/admin/users/analytics"
          search={{ metric: "devices", range: "7d" }}
          className="glass shadow-card-soft block rounded-2xl p-4 transition hover:bg-white/5"
        >
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-violet-400" />
            <h3 className="font-display text-sm font-bold tracking-tight">Login by Device</h3>
          </div>
          <div className="space-y-2">
            {(devices.data?.devices ?? []).length === 0 ? (
              <p className="text-[11px] text-muted-foreground">No login data yet.</p>
            ) : (
              (devices.data?.devices ?? []).map((d, i) => {
                const colors = [
                  "from-violet-500 to-fuchsia-500",
                  "from-blue-500 to-cyan-500",
                  "from-emerald-500 to-teal-500",
                  "from-amber-500 to-orange-500",
                ];
                return (
                  <div key={d.label}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span>{d.label}</span>
                      <span className="text-muted-foreground">
                        {d.percent}% · {d.count}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-background/40">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${colors[i % colors.length]}`}
                        style={{ width: `${d.percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Link>

        <Link
          to="/admin/users/analytics"
          search={{ metric: "heatmap", range: "7d" }}
          className="glass shadow-card-soft block rounded-2xl p-4 transition hover:bg-white/5"
        >
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-fuchsia-400" />
            <h3 className="font-display text-sm font-bold tracking-tight">User Activity Heatmap</h3>
          </div>
          <div className="grid grid-cols-12 gap-1">
            {(heatmap.data?.grid ?? Array(84).fill(0)).map((v: number, i: number) => {
              const max = heatmap.data?.max ?? 1;
              const intensity = max > 0 ? Math.max(0.06, v / max) : 0.06;
              return (
                <div
                  key={i}
                  className="aspect-square rounded-sm"
                  title={`${v} login(s)`}
                  style={{ background: `rgba(168, 85, 247, ${intensity.toFixed(2)})` }}
                />
              );
            })}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Login intensity · last {heatmap.data?.days ?? 7} days · {heatmap.data?.max ?? 0} peak
          </p>
        </Link>

        <div className="glass shadow-card-soft rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-emerald-400" />
            <h3 className="font-display text-sm font-bold tracking-tight">Account Verification</h3>
          </div>
          <div className="space-y-3 text-xs">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-muted-foreground">Verified</span>
                <span className="font-semibold">{(s?.active ?? 0).toLocaleString()}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                  style={{
                    width: `${Math.min(100, ((s?.active ?? 0) / Math.max(s?.total ?? 1, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-muted-foreground">Unverified</span>
                <span className="font-semibold">{(s?.pending ?? 0).toLocaleString()}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                  style={{
                    width: `${Math.min(100, ((s?.pending ?? 0) / Math.max(s?.total ?? 1, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-muted-foreground">Suspended</span>
                <span className="font-semibold">{(s?.suspended ?? 0).toLocaleString()}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-background/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 to-red-500"
                  style={{
                    width: `${Math.min(100, ((s?.suspended ?? 0) / Math.max(s?.total ?? 1, 1)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Referral analytics */}
      {((referralStats.data?.sources ?? []).length > 0 ||
        (referralStats.data?.unknown ?? 0) > 0) && (
        <section className="glass shadow-card-soft rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-bold tracking-tight">
                Where users came from
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Signup attribution across {referralStats.data?.total ?? 0} profiles
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(referralStats.data?.sources ?? []).map((src) => (
              <button
                key={src.source}
                onClick={() => {
                  setReferralFilter(src.source);
                  setPage(1);
                }}
                className={`rounded-full border px-3 py-1 text-[11px] transition ${
                  referralFilter === src.source
                    ? "border-violet-500/60 bg-violet-500/15 text-foreground"
                    : "border-border/60 bg-background/40 text-foreground/80 hover:text-foreground"
                }`}
              >
                {src.source} <span className="ml-1 font-semibold text-blue-400">{src.count}</span>
              </button>
            ))}
            {(referralStats.data?.unknown ?? 0) > 0 && (
              <span className="rounded-full border border-border/60 bg-background/40 px-3 py-1 text-[11px] text-muted-foreground">
                Unknown <span className="ml-1 font-semibold">{referralStats.data?.unknown}</span>
              </span>
            )}
          </div>
        </section>
      )}

      {editing && (
        <UserEditorDialog
          user={editing}
          levels={(levels.data as Array<{ code: string; name: string }>) ?? []}
          onClose={() => setEditing(null)}
          onSaved={invalidate}
        />
      )}

      {viewing && (
        <UserDetailsDialog
          user={viewing}
          onClose={() => setViewing(null)}
          sessionsFn={userSessionsFn}
        />
      )}

      <UserCommandDrawer user={commandUser} onClose={() => setCommandUser(null)} />

      {confirmDelete && (
        <ConfirmDeleteDialog
          user={confirmDelete.user}
          mode={confirmDelete.mode}
          onClose={() => setConfirmDelete(null)}
          onSoft={(id) => softDeleteM.mutate(id)}
          onHard={(id, confirmName) => hardDeleteM.mutate({ id, confirmName })}
          pending={softDeleteM.isPending || hardDeleteM.isPending}
        />
      )}
      {showCreate && (
        <CreateStudentDialog
          levels={(levels.data as Array<{ code: string; name: string }>) ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={invalidate}
        />
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-border/40 bg-background/40 p-1.5 hover:border-[var(--neon-purple)]/60 hover:text-[var(--neon-purple)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border/40 disabled:hover:text-foreground"
    >
      {children}
    </button>
  );
}

// ============================================================
// Editor dialog
// ============================================================
function UserEditorDialog({
  user,
  levels,
  onClose,
  onSaved,
}: {
  user: User;
  levels: Array<{ code: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const profileFn = useServerFn(adminUpdateUserProfile);
  const roleFn = useServerFn(adminSetUserRole);
  const statusFn = useServerFn(adminSetUserStatus);

  const [form, setForm] = useState({
    display_name: user.display_name,
    level: user.level,
    bio: user.bio ?? "",
  });
  const [roles, setRoles] = useState<Set<string>>(new Set(user.roles));

  const save = useMutation({
    mutationFn: async () => {
      await profileFn({
        data: {
          id: user.id,
          display_name: form.display_name,
          level: form.level,
          bio: form.bio || null,
        },
      });
      // sync role grants/revokes
      const target = new Set(roles);
      const current = new Set(user.roles);
      // Admin role is read-only here — only moderator/student can be toggled.
      const allRoles = ["moderator", "student"] as const;
      for (const r of allRoles) {
        const want = target.has(r);
        const had = current.has(r);
        if (want !== had) await roleFn({ data: { id: user.id, role: r, grant: want } });
      }
    },
    onSuccess: () => {
      toast.success("User updated");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusM = useMutation({
    mutationFn: (s: User["status"]) => statusFn({ data: { id: user.id, status: s } }),
    onSuccess: (_d, s) => {
      toast.success(`Marked ${s}`);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> {user.display_name}
          </DialogTitle>
          <DialogDescription>Manage profile, roles, and account status.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label>Display name</Label>
            <Input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Level</Label>
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
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
            <Label>Bio</Label>
            <Textarea
              rows={2}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
            />
          </div>

          <div>
            <Label className="mb-2 block">Roles</Label>
            <p className="mb-2 text-[11px] text-muted-foreground">
              Admin promotion is restricted to the system owner. You may only manage
              student/moderator status.
            </p>
            <div className="grid gap-2">
              {(["student", "moderator", "admin", "super_admin"] as const).map((r) => {
                const isAdminRole = r === "admin" || r === "super_admin";
                return (
                  <div
                    key={r}
                    className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-sm capitalize">
                      {isAdminRole ? (
                        <Crown className="h-4 w-4 text-amber-400" />
                      ) : r === "moderator" ? (
                        <ShieldCheck className="h-4 w-4 text-sky-400" />
                      ) : (
                        <UserPlus className="h-4 w-4 text-emerald-400" />
                      )}
                      {getRoleDisplayName(r)}
                      {isAdminRole && (
                        <span className="ml-1 text-[10px] text-muted-foreground">(read-only)</span>
                      )}
                    </div>
                    <Switch
                      checked={roles.has(r)}
                      disabled={isAdminRole}
                      onCheckedChange={(v) => {
                        if (isAdminRole) return;
                        const next = new Set(roles);
                        if (v) next.add(r);
                        else next.delete(r);
                        setRoles(next);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <Label className="mb-2 block">Account status</Label>
            <div className="flex gap-2">
              {(["active", "suspended", "pending"] as const).map((s) => (
                <Button
                  key={s}
                  variant={user.status === s ? "default" : "outline"}
                  size="sm"
                  onClick={() => statusM.mutate(s)}
                  disabled={statusM.isPending}
                  className="capitalize"
                >
                  {s === "active" ? (
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                  ) : s === "suspended" ? (
                    <UserX className="mr-1 h-3 w-3" />
                  ) : (
                    <Activity className="mr-1 h-3 w-3" />
                  )}
                  {s}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Close
          </Button>
          <Button
            className="bg-cta-gradient text-white"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// View details dialog (sessions, device, activity)
// ============================================================
function UserDetailsDialog({
  user,
  onClose,
  sessionsFn,
}: {
  user: User;
  onClose: () => void;
  sessionsFn: ReturnType<typeof useServerFn<typeof adminUserSessions>>;
}) {
  const sessions = useQuery({
    queryKey: ["admin-user-sessions", user.id],
    queryFn: () => sessionsFn({ data: { userId: user.id, limit: 20 } }),
  });
  const lastSession = sessions.data?.[0];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" /> {user.display_name}
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px]">{user.id}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailCard
            label="Total logins"
            value={(user.total_login_count ?? 0).toLocaleString()}
            icon={LogIn}
          />
          <DetailCard
            label="Total usage time"
            value={fmtDuration(user.total_usage_seconds ?? 0)}
            icon={Clock}
          />
          <DetailCard label="Last login" value={fmtDateTime(user.last_login_at)} icon={Activity} />
          <DetailCard
            label="Last device"
            value={parseDevice(lastSession?.user_agent)}
            icon={Monitor}
          />
        </div>

        <div>
          <h4 className="mb-2 mt-3 text-xs font-semibold text-muted-foreground">Recent sessions</h4>
          <div className="max-h-64 overflow-auto rounded-xl border border-border/40">
            {sessions.isLoading ? (
              <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : (sessions.data ?? []).length === 0 ? (
              <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
                No login sessions recorded yet.
              </div>
            ) : (
              <table className="w-full min-w-[720px] text-[11px]">
                <thead className="bg-background/40 text-muted-foreground">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 font-medium">Login</th>
                    <th className="px-2 py-1.5 font-medium">Duration</th>
                    <th className="px-2 py-1.5 font-medium">Device</th>
                  </tr>
                </thead>
                <tbody>
                  {(sessions.data ?? []).map((s) => (
                    <tr key={s.id} className="border-t border-border/30">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {new Date(s.login_at).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5">
                        {s.duration_seconds ? (
                          fmtDuration(s.duration_seconds)
                        ) : (
                          <span className="text-emerald-400">Active</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {parseDevice(s.user_agent)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
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

function DetailCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Eye;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-background/40 p-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <p className="mt-1 font-display text-sm font-bold">{value}</p>
    </div>
  );
}

// ============================================================
// Confirm soft / hard delete
// ============================================================
function ConfirmDeleteDialog({
  user,
  mode,
  onClose,
  onSoft,
  onHard,
  pending,
}: {
  user: User;
  mode: "soft" | "hard";
  onClose: () => void;
  onSoft: (id: string) => void;
  onHard: (id: string, confirmName: string) => void;
  pending: boolean;
}) {
  const [typed, setTyped] = useState("");
  const canHardDelete = typed.trim() === user.display_name.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle
              className={`h-5 w-5 ${mode === "hard" ? "text-rose-400" : "text-amber-400"}`}
            />
            {mode === "hard" ? "Permanently delete user?" : "Remove user?"}
          </DialogTitle>
          <DialogDescription>
            {mode === "hard"
              ? "This wipes the user, their roles, login history, and authentication record. This cannot be undone."
              : "The user is archived (soft delete) and removed from the active system. You can restore them later."}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-border/40 bg-background/40 p-3">
          <p className="text-xs text-muted-foreground">User</p>
          <p className="font-display text-sm font-bold">{user.display_name}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{user.id}</p>
        </div>

        {mode === "hard" && (
          <div>
            <Label className="text-xs">Type the display name to confirm</Label>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={user.display_name}
              className="mt-1"
              autoFocus
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
          {mode === "soft" ? (
            <Button variant="destructive" disabled={pending} onClick={() => onSoft(user.id)}>
              {pending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <UserX className="mr-1 h-4 w-4" />
              )}
              Remove (archive)
            </Button>
          ) : (
            <Button
              variant="destructive"
              disabled={pending || !canHardDelete}
              onClick={() => onHard(user.id, typed)}
            >
              {pending ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-1 h-4 w-4" />
              )}
              Permanently delete
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Create Student dialog (Admin → Add New Student)
// ============================================================
function CreateStudentDialog({
  levels,
  onClose,
  onCreated,
}: {
  levels: Array<{ code: string; name: string }>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const createFn = useServerFn(adminCreateStudent);
  const [form, setForm] = useState({
    display_name: "",
    email: "",
    phone: "",
    password: "",
    level: levels[0]?.code ?? "",
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          display_name: form.display_name.trim(),
          email: form.email.trim(),
          password: form.password,
          level: form.level,
          phone: form.phone.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Student account created");
      onCreated();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    form.display_name.trim().length > 0 &&
    /@/.test(form.email) &&
    form.password.length >= 8 &&
    form.level.length > 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> Add New Student
          </DialogTitle>
          <DialogDescription>
            Creates a Student account only. Admin accounts cannot be created from this panel.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div>
            <Label>Full name</Label>
            <Input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="student@example.com"
            />
          </div>
          <div>
            <Label>Phone (optional)</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+8801XXXXXXXXX"
            />
          </div>
          <div>
            <Label>Temporary password</Label>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Min. 8 characters"
            />
          </div>
          <div>
            <Label>Level</Label>
            <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select a level" />
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
          <div className="rounded-lg border border-amber-400/30 bg-amber-500/5 p-2 text-[11px] text-amber-300">
            Role will be set to <strong>Student</strong>. Admin role cannot be assigned here.
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
          <Button
            className="bg-cta-gradient text-white"
            disabled={!canSubmit || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="mr-1 h-4 w-4" />
            )}
            Create Student
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Tab content panels (Analytics / Roles / Activity / Logins / Security / Permissions)
// ============================================================
type TabPanelProps = {
  tab: "analytics" | "roles" | "activity" | "logins" | "security" | "permissions" | "overview";
  analytics:
    | {
        active_24h?: number;
        active_7d?: number;
        active_30d?: number;
        lifetime_active?: number;
        total_logins?: number;
        avg_session_seconds?: number;
        usage_24h?: number;
        usage_7d?: number;
        usage_30d?: number;
      }
    | undefined;
  stats:
    | {
        total?: number;
        active?: number;
        pending?: number;
        suspended?: number;
        admins?: number;
        verified?: number;
      }
    | undefined;
  devices:
    | {
        devices: Array<{ label: string; count: number; percent: number }>;
        browsers: Array<{ label: string; count: number; percent: number }>;
        total: number;
      }
    | undefined;
  heatmap: { grid: number[]; max: number; days: number } | undefined;
  loginHistory: Array<{
    id: string;
    user_id: string;
    display_name: string;
    login_at: string;
    logout_at: string | null;
    duration_seconds: number | null;
    ip: string | null;
    device: string | null;
    browser: string | null;
  }>;
  loginHistoryLoading: boolean;
  activity: Array<{
    id: string;
    event_type: string;
    page_path: string | null;
    element_label: string | null;
    module: string | null;
    created_at: string;
    display_name?: string | null;
  }>;
  activityLoading: boolean;
  roles: Array<{ role: string; count: number }>;
  security:
    | {
        suspended: number;
        unverified: number;
        logins_in_window: number;
        admin_actions: number;
        suspicious_multi_ip: number;
        range_hours: number;
      }
    | undefined;
};

function TabPanel(p: TabPanelProps) {
  if (p.tab === "analytics") {
    return (
      <section className="grid gap-3 lg:grid-cols-4">
        {[
          { l: "Active (24h)", v: p.analytics?.active_24h ?? 0 },
          { l: "Active (7d)", v: p.analytics?.active_7d ?? 0 },
          { l: "Active (30d)", v: p.analytics?.active_30d ?? 0 },
          { l: "Lifetime Active", v: p.analytics?.lifetime_active ?? 0 },
          { l: "Usage 24h", v: fmtDuration(p.analytics?.usage_24h ?? 0) },
          { l: "Usage 7d", v: fmtDuration(p.analytics?.usage_7d ?? 0) },
          { l: "Usage 30d", v: fmtDuration(p.analytics?.usage_30d ?? 0) },
          { l: "Avg Session", v: fmtDuration(p.analytics?.avg_session_seconds ?? 0) },
        ].map((x) => (
          <div key={x.l} className="glass shadow-card-soft rounded-2xl p-4">
            <p className="text-[11px] text-muted-foreground">{x.l}</p>
            <p className="mt-2 font-display text-xl font-bold">
              {typeof x.v === "number" ? x.v.toLocaleString() : x.v}
            </p>
          </div>
        ))}
      </section>
    );
  }

  if (p.tab === "roles") {
    const total = p.roles.reduce((a, r) => a + r.count, 0);
    return (
      <section className="glass shadow-card-soft rounded-2xl p-4">
        <h3 className="mb-3 font-display text-sm font-bold tracking-tight">Role Distribution</h3>
        {p.roles.length === 0 ? (
          <p className="text-xs text-muted-foreground">No roles assigned yet.</p>
        ) : (
          <div className="space-y-3">
            {p.roles.map((r) => {
              const pct = total ? Math.round((r.count / total) * 100) : 0;
              return (
                <div key={r.role}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span>{getRoleDisplayName(r.role)}</span>
                    <span className="text-muted-foreground">
                      {r.count} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-background/40">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  if (p.tab === "activity") {
    return (
      <section className="glass shadow-card-soft rounded-2xl p-4">
        <h3 className="mb-3 font-display text-sm font-bold tracking-tight">
          Activity Logs · last 24h
        </h3>
        {p.activityLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : p.activity.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity recorded.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 bg-background/60 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-2 py-1.5">User</th>
                  <th className="px-2 py-1.5">Event</th>
                  <th className="px-2 py-1.5">Target</th>
                  <th className="px-2 py-1.5">Time</th>
                </tr>
              </thead>
              <tbody>
                {p.activity.map((ev) => (
                  <tr key={ev.id} className="border-t border-border/30">
                    <td className="px-2 py-1.5">{ev.display_name ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <span className="rounded-full border border-border/40 bg-background/40 px-2 py-0.5 text-[10px] capitalize">
                        {ev.event_type}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[280px]">
                      {ev.element_label ?? ev.page_path ?? ev.module ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  if (p.tab === "logins") {
    return (
      <section className="glass shadow-card-soft rounded-2xl p-4">
        <h3 className="mb-3 font-display text-sm font-bold tracking-tight">
          Login History · last 14 days
        </h3>
        {p.loginHistoryLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : p.loginHistory.length === 0 ? (
          <p className="text-xs text-muted-foreground">No logins recorded.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 bg-background/60 text-muted-foreground">
                <tr className="text-left">
                  <th className="px-2 py-1.5">User</th>
                  <th className="px-2 py-1.5">Login</th>
                  <th className="px-2 py-1.5">Logout</th>
                  <th className="px-2 py-1.5">Duration</th>
                  <th className="px-2 py-1.5">Device</th>
                  <th className="px-2 py-1.5">Browser</th>
                  <th className="px-2 py-1.5">IP</th>
                </tr>
              </thead>
              <tbody>
                {p.loginHistory.map((r) => (
                  <tr key={r.id} className="border-t border-border/30">
                    <td className="px-2 py-1.5">{r.display_name}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {new Date(r.login_at).toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                      {r.logout_at ? (
                        new Date(r.logout_at).toLocaleString()
                      ) : (
                        <span className="text-emerald-400">Active</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      {r.duration_seconds ? fmtDuration(r.duration_seconds) : "—"}
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.device ?? "—"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{r.browser ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
                      {r.ip ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  }

  if (p.tab === "security") {
    const items = [
      { l: "Suspended Accounts", v: p.security?.suspended ?? 0, c: "text-rose-400" },
      { l: "Unverified Emails", v: p.security?.unverified ?? 0, c: "text-amber-400" },
      { l: "Logins (7d)", v: p.security?.logins_in_window ?? 0, c: "text-violet-400" },
      { l: "Suspicious (Multi-IP)", v: p.security?.suspicious_multi_ip ?? 0, c: "text-orange-400" },
      { l: "Admin Actions (7d)", v: p.security?.admin_actions ?? 0, c: "text-blue-400" },
    ];
    return (
      <section className="grid gap-3 md:grid-cols-5">
        {items.map((x) => (
          <div key={x.l} className="glass shadow-card-soft rounded-2xl p-4">
            <p className="text-[11px] text-muted-foreground">{x.l}</p>
            <p className={`mt-2 font-display text-2xl font-bold ${x.c}`}>{x.v.toLocaleString()}</p>
          </div>
        ))}
      </section>
    );
  }

  if (p.tab === "permissions") {
    return <PermissionsMatrix />;
  }

  return null;
}

function PermissionsMatrix() {
  const qc = useQueryClient();
  const fetchPerms = useServerFn(listRolePermissions);
  const togglePerm = useServerFn(toggleRolePermission);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "role-permissions"],
    queryFn: () => fetchPerms(),
    // role_permissions is intentionally NOT in the realtime publication
    // (sensitive global table). Poll every 15s so a second admin's edits
    // surface without a manual refresh.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });


  const mut = useMutation({
    mutationFn: (v: { role: RbacRole; permission: string; enabled: boolean }) =>
      togglePerm({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["admin", "role-permissions"] });
      const prev = qc.getQueryData<{ rows: { role: RbacRole; permission: string }[] }>([
        "admin",
        "role-permissions",
      ]);
      if (prev) {
        const rows = v.enabled
          ? [...prev.rows, { role: v.role, permission: v.permission }]
          : prev.rows.filter((r) => !(r.role === v.role && r.permission === v.permission));
        qc.setQueryData(["admin", "role-permissions"], { ...prev, rows });
      }
      return { prev };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin", "role-permissions"], ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to update permission");
    },
    onSuccess: () => {
      toast.success("Permission updated");
      qc.invalidateQueries({ queryKey: ["admin", "role-permissions"] });
    },
  });

  const rows = data?.rows ?? [];
  const set = new Set(rows.map((r) => `${r.role}:${r.permission}`));
  const has = (role: RbacRole, perm: string) =>
    role === "super_admin" ? true : set.has(`${role}:${perm}`);

  const roles = ALL_ROLES;
  const perms = ALL_PERMISSIONS;

  return (
    <section className="glass shadow-card-soft rounded-2xl p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-sm font-bold tracking-tight">Permission Matrix</h3>
          <p className="text-[11px] text-muted-foreground">
            Toggle capabilities per role. Changes save instantly and sync across all admin sessions
            in real-time.
            <span className="ml-1 text-amber-400">super_admin</span> always has every permission and
            cannot be edited (fallback safeguard).
          </p>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="px-2 py-2">Capability</th>
              {roles.map((r) => (
                <th key={r} className="px-2 py-2 text-center capitalize">
                  {r.replace("_", " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perms.map((perm) => (
              <tr key={perm.key} className="border-t border-border/30">
                <td className="px-2 py-2">
                  <div className="font-medium">{perm.label}</div>
                  <div className="text-[10px] text-muted-foreground">{perm.key}</div>
                </td>
                {roles.map((role) => {
                  const enabled = has(role, perm.key);
                  const locked = role === "super_admin";
                  const pending =
                    mut.isPending &&
                    mut.variables?.role === role &&
                    mut.variables?.permission === perm.key;
                  return (
                    <td key={role} className="px-2 py-2 text-center">
                      <button
                        type="button"
                        disabled={locked || pending}
                        onClick={() =>
                          mut.mutate({ role, permission: perm.key, enabled: !enabled })
                        }
                        className={
                          "inline-flex h-6 w-10 items-center rounded-full border transition " +
                          (enabled
                            ? "border-emerald-400/40 bg-emerald-500/30 justify-end"
                            : "border-border/40 bg-muted/30 justify-start") +
                          (locked ? " cursor-not-allowed opacity-70" : " hover:opacity-90")
                        }
                        title={
                          locked
                            ? "super_admin permissions are immutable"
                            : enabled
                              ? "Click to revoke"
                              : "Click to grant"
                        }
                      >
                        <span
                          className={
                            "mx-0.5 inline-block h-5 w-5 rounded-full " +
                            (enabled ? "bg-emerald-300" : "bg-muted-foreground/40")
                          }
                        />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Backed by <code className="rounded bg-muted/30 px-1">public.role_permissions</code> +{" "}
        <code className="rounded bg-muted/30 px-1">has_permission()</code>. Row Level Security
        restricts editing to admins; the safeguard trigger prevents removing{" "}
        <code>manage_permissions</code> / <code>manage_users</code> from the admin role unless a
        super_admin exists.
      </p>
    </section>
  );
}