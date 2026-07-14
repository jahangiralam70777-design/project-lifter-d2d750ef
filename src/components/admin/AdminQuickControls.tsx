import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Users,
  Trophy,
  FileUp,
  Bell,
  PenSquare,
  CircleDot,
  ArrowUpRight,
  ListChecks,
  FileText,
  Layers,
  PlayCircle,
  Database,
  Timer,
} from "lucide-react";
import {
  listModuleVisibility,
  adminSetModuleHidden,
  type ModuleKey,
  type ModuleVisibilityRow,
} from "@/lib/module-visibility.functions";
import { adminDashboardSnapshot } from "@/lib/admin-dashboard.functions";
import { CountUp } from "@/components/realtime/CountUp";

const MODULE_ICON: Record<ModuleKey, typeof ListChecks> = {
  mcq_practice: ListChecks,
  quiz: Timer,
  mock_test: Trophy,
  flash_cards: Layers,
  short_notes: FileText,
  qns_bank: Database,
  classes: PlayCircle,
};

const MODULE_ROUTE: Record<ModuleKey, string> = {
  mcq_practice: "/admin/mcq",
  quiz: "/admin/quiz",
  mock_test: "/admin/mock-test",
  flash_cards: "/admin/flash-cards",
  short_notes: "/admin/short-notes",
  qns_bank: "/admin/question-bank",
  classes: "/admin/classes",
};

function timeAgo(iso: string) {
  const diff = Date.now() - +new Date(iso);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function AdminQuickControls() {
  const snapshotFn = useServerFn(adminDashboardSnapshot);
  const listFn = useServerFn(listModuleVisibility);

  const snapQ = useQuery({
    queryKey: ["admin-dashboard-snapshot"],
    queryFn: () => snapshotFn(),
    refetchInterval: 20_000,
  });

  const modulesQ = useQuery({
    queryKey: ["module-visibility"],
    queryFn: () => listFn(),
    staleTime: 15_000,
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
      <div className="space-y-4">
        <QuickCounters loading={snapQ.isLoading} data={snapQ.data?.counters} />
        <ModuleToggles rows={modulesQ.data ?? []} loading={modulesQ.isLoading} />
      </div>
      <div className="space-y-4">
        <RecentUploadsPanel data={snapQ.data?.recentUploads ?? []} loading={snapQ.isLoading} />
        <RecentNotificationsPanel
          data={snapQ.data?.recentNotifications ?? []}
          loading={snapQ.isLoading}
        />
      </div>
    </div>
  );
}

/* -------- Counters -------- */
function QuickCounters({
  loading,
  data,
}: {
  loading: boolean;
  data?: {
    activeStudents: number;
    liveExams: number;
    pendingDrafts: number;
    recentUploads24h: number;
    scheduledNotifications: number;
  };
}) {
  const tiles = [
    {
      l: "Active Students",
      v: data?.activeStudents ?? 0,
      i: Users,
      tint: "text-sky-300",
      to: "/admin/users",
    },
    {
      l: "Live Exams",
      v: data?.liveExams ?? 0,
      i: Trophy,
      tint: "text-amber-300",
      to: "/admin/mock-test",
    },
    {
      l: "Uploads · 24h",
      v: data?.recentUploads24h ?? 0,
      i: FileUp,
      tint: "text-fuchsia-300",
      to: "/admin/mcq",
    },
    {
      l: "Pending Drafts",
      v: data?.pendingDrafts ?? 0,
      i: PenSquare,
      tint: "text-violet-300",
      to: "/admin/mcq",
    },
    {
      l: "Scheduled Sends",
      v: data?.scheduledNotifications ?? 0,
      i: Bell,
      tint: "text-emerald-300",
      to: "/admin/notifications",
    },
  ];
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CircleDot className="h-3 w-3 animate-pulse text-emerald-400" />
          <h3 className="text-sm font-semibold">Live Quick Stats</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {loading ? "Syncing…" : "Auto-refresh 20s"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link
            key={t.l}
            to={t.to as never}
            className="group rounded-xl border border-border/60 bg-background/40 p-3 transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            <div className="flex items-start justify-between">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-lg bg-muted/40 ${t.tint}`}
              >
                <t.i className="h-3.5 w-3.5" />
              </div>
              <ArrowUpRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              {t.l}
            </p>
            <p className="font-display text-lg font-bold">
              <CountUp value={t.v} />
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* -------- Module toggles -------- */
function ModuleToggles({ rows, loading }: { rows: ModuleVisibilityRow[]; loading: boolean }) {
  const qc = useQueryClient();
  const setFn = useServerFn(adminSetModuleHidden);
  const mut = useMutation({
    mutationFn: (vars: { key: ModuleKey; hidden: boolean }) => setFn({ data: vars }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["module-visibility"] });
      const prev = qc.getQueryData<ModuleVisibilityRow[]>(["module-visibility"]);
      qc.setQueryData<ModuleVisibilityRow[]>(["module-visibility"], (old) =>
        (old ?? []).map((r) => (r.key === vars.key ? { ...r, hidden: vars.hidden } : r)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["module-visibility"], ctx.prev);
      toast.error("Failed to update visibility");
    },
    onSuccess: (_d, vars) => {
      toast.success(`${vars.hidden ? "Hidden" : "Published"} for students`);
      qc.invalidateQueries({ queryKey: ["module-visibility"] });
    },
  });

  const sorted = useMemo(() => [...rows].sort((a, b) => a.label.localeCompare(b.label)), [rows]);

  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Module Visibility · Instant Toggle</h3>
        <span className="text-[10px] text-muted-foreground">
          {loading ? "Loading…" : `${rows.length} modules`}
        </span>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {sorted.map((r) => {
          const Icon = MODULE_ICON[r.key] ?? ListChecks;
          const route = MODULE_ROUTE[r.key];
          return (
            <li
              key={r.key}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5"
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${r.hidden ? "bg-rose-500/15 text-rose-300" : "bg-emerald-500/15 text-emerald-300"}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  to={route as never}
                  className="block truncate text-xs font-medium hover:underline"
                >
                  {r.label}
                </Link>
                <p className="text-[10px] text-muted-foreground">
                  {r.hidden ? "Hidden for students" : "Visible everywhere"}
                </p>
              </div>
              <button
                type="button"
                disabled={mut.isPending}
                onClick={() => mut.mutate({ key: r.key, hidden: !r.hidden })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors ${
                  r.hidden
                    ? "border-rose-400/40 bg-rose-500/20"
                    : "border-emerald-400/40 bg-emerald-500/20"
                }`}
                aria-label={`Toggle ${r.label}`}
              >
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-background shadow transition-transform ${
                    r.hidden ? "translate-x-0.5" : "translate-x-[22px]"
                  }`}
                >
                  {r.hidden ? (
                    <EyeOff className="h-3 w-3 text-rose-400" />
                  ) : (
                    <Eye className="h-3 w-3 text-emerald-400" />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* -------- Recent uploads -------- */
function RecentUploadsPanel({
  data,
  loading,
}: {
  data: { id: string; title: string; kind: string; created_at: string; status: string }[];
  loading: boolean;
}) {
  const KIND_META: Record<
    string,
    { i: typeof ListChecks; tint: string; label: string; to: string }
  > = {
    mcq: {
      i: ListChecks,
      tint: "text-fuchsia-300 bg-fuchsia-500/15",
      label: "MCQ",
      to: "/admin/mcq",
    },
    note: {
      i: FileText,
      tint: "text-cyan-300 bg-cyan-500/15",
      label: "Note",
      to: "/admin/short-notes",
    },
    flash: {
      i: Layers,
      tint: "text-violet-300 bg-violet-500/15",
      label: "Card",
      to: "/admin/flash-cards",
    },
    video: {
      i: PlayCircle,
      tint: "text-sky-300 bg-sky-500/15",
      label: "Class",
      to: "/admin/classes",
    },
    qbank: {
      i: Database,
      tint: "text-amber-300 bg-amber-500/15",
      label: "QBank",
      to: "/admin/question-bank",
    },
    quiz: {
      i: Timer,
      tint: "text-emerald-300 bg-emerald-500/15",
      label: "Quiz",
      to: "/admin/quiz",
    },
  };
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent Uploads</h3>
        <span className="text-[10px] text-muted-foreground">
          {loading ? "Loading…" : `${data.length} items`}
        </span>
      </div>
      {data.length === 0 && !loading ? (
        <p className="text-xs text-muted-foreground">No uploads yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.slice(0, 6).map((u) => {
            const meta = KIND_META[u.kind] ?? KIND_META.mcq;
            return (
              <li
                key={`${u.kind}-${u.id}`}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5"
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.tint}`}>
                  <meta.i className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{u.title || "Untitled"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {meta.label} · {timeAgo(u.created_at)} · {u.status}
                  </p>
                </div>
                <Link
                  to={meta.to as never}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Open
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* -------- Recent notifications -------- */
function RecentNotificationsPanel({
  data,
  loading,
}: {
  data: {
    id: string;
    title: string;
    status: string;
    audience: string;
    created_at: string;
    sent_at: string | null;
  }[];
  loading: boolean;
}) {
  const statusTint = (s: string) =>
    s === "sent"
      ? "bg-emerald-500/15 text-emerald-300"
      : s === "scheduled"
        ? "bg-sky-500/15 text-sky-300"
        : "bg-muted/40 text-muted-foreground";
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent Notifications</h3>
        <Link
          to="/admin/notifications"
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          Manage
        </Link>
      </div>
      {data.length === 0 && !loading ? (
        <p className="text-xs text-muted-foreground">No notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.slice(0, 6).map((n) => (
            <li
              key={n.id}
              className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-2.5"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/40">
                <Bell className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{n.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {n.audience} · {timeAgo(n.sent_at ?? n.created_at)}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${statusTint(n.status)}`}>
                {n.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
