/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Radar,
  RadarChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Award,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Flame,
  Layers,
  ListChecks,
  Loader2,
  Search,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminRoutineStats,
  adminRoutineStudents,
  adminRoutineStudentDetail,
  adminRoutineAnalytics,
  getStudyRoutineModuleEnabled,
  setStudyRoutineModuleEnabled,
} from "@/lib/admin-routine-manager.functions";

/* --------------------------------------------------------------- primitives */

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent, var(--primary)))",
  "hsl(217 91% 60%)",
  "hsl(160 84% 39%)",
  "hsl(43 96% 56%)",
  "hsl(0 84% 60%)",
  "hsl(280 83% 60%)",
  "hsl(190 90% 45%)",
];

const tooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
} as const;

const formatMinutes = (m: number) => {
  if (!m) return "0m";
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h ? `${h}h ${mm}m` : `${mm}m`;
};

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const KpiCard = ({
  label,
  value,
  icon: Icon,
  hint,
  tone = "primary",
}: {
  label: string;
  value: string | number;
  icon: any;
  hint?: string;
  tone?: "primary" | "emerald" | "amber" | "rose" | "sky" | "violet";
}) => {
  const tones: Record<string, string> = {
    primary: "bg-cta-gradient text-white shadow-glow",
    emerald: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
    sky: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
    violet: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
  };
  return (
    <Card className="glass-card border-border/60 transition-shadow hover:shadow-lg">
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="mt-0.5 truncate font-display text-xl font-bold tracking-tight sm:text-2xl">
            {value}
          </p>
          {hint ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
};

const StatusPill = ({ pct }: { pct: number }) => {
  const tone =
    pct >= 80
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : pct >= 40
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-rose-500/10 text-rose-600 dark:text-rose-400";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${tone}`}
    >
      {pct}%
    </span>
  );
};

/* ------------------------------------------------------------------- flow */

export function RoutineManagerFlow() {
  const qc = useQueryClient();

  useEffect(() => {
    // Unique per-mount channel name so React StrictMode double-mount and
    // hot-reload never collide on a shared channel identifier.
    const channelName = `admin_routine_manager_watch:${Math.random().toString(36).slice(2)}:${Date.now()}`;
    const ch = (supabase as any).channel(channelName);
    // Register every listener BEFORE .subscribe() so no event is missed.
    ch.on("postgres_changes", { event: "*", schema: "public", table: "study_routines" }, () => {
      qc.invalidateQueries({ queryKey: ["admin-routine"] });
    })
      .on("postgres_changes", { event: "*", schema: "public", table: "study_routine_tasks" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-routine"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "study_routine_settings" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-routine", "settings"] });
      })
      .on("system", { event: "SUBSCRIBED" }, () => {
        // Refresh on (re)connect so we don't miss events across websocket drops.
        qc.invalidateQueries({ queryKey: ["admin-routine"] });
      })
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {
        /* noop */
      }
    };
  }, [qc]);

  const statsFn = useServerFn(adminRoutineStats);
  const stats = useQuery({
    queryKey: ["admin-routine", "stats"],
    queryFn: () => statsFn(),
  });
  const s: any = stats.data ?? {};

  return (
    <div className="space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Admin · Monitoring
          </p>
          <h1 className="truncate font-display text-2xl font-bold tracking-tight md:text-3xl">
            Routine Manager
          </h1>
          <p className="text-sm text-muted-foreground">
            Real-time oversight of student Study Routines, progress and activity.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit shrink-0">
          <Eye className="mr-1 h-3.5 w-3.5" /> View only
        </Badge>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Total Students" value={s.totalStudents ?? "—"} icon={Users} tone="primary" />
        <KpiCard label="Active Today" value={s.activeToday ?? "—"} icon={Activity} tone="emerald"
          hint={s.activeWeek !== undefined ? `${s.activeWeek} this week` : undefined} />
        <KpiCard label="Total Routines" value={s.totalRoutines ?? "—"} icon={CalendarClock} tone="sky" />
        <KpiCard label="Today Planned" value={s.todayPlannedTasks ?? "—"} icon={CalendarDays} tone="violet"
          hint={stats.data ? formatMinutes(s.todayPlannedMinutes ?? 0) : undefined} />
        <KpiCard label="Today Completed" value={s.todayCompletedTasks ?? "—"} icon={CheckCircle2} tone="emerald"
          hint={stats.data ? formatMinutes(s.todayCompletedMinutes ?? 0) : undefined} />
        <KpiCard
          label="Completion Rate"
          value={stats.data ? `${s.completionRate ?? 0}%` : "—"}
          icon={Target}
          tone="amber"
          hint={stats.data ? `${s.completedTasks}/${s.totalTasks} tasks` : undefined}
        />
        <KpiCard
          label="Planned Study Hours"
          value={stats.data ? formatMinutes(s.totalPlannedMinutes ?? 0) : "—"}
          icon={Clock}
          tone="sky"
        />
        <KpiCard
          label="Completed Study Hours"
          value={stats.data ? formatMinutes(s.totalCompletedMinutes ?? 0) : "—"}
          icon={Award}
          tone="emerald"
        />
        <KpiCard label="Weekly Active" value={s.activeWeek ?? "—"} icon={Activity} tone="sky" />
        <KpiCard label="Monthly Active" value={s.activeMonth ?? "—"} icon={CalendarDays} tone="violet" />
        <KpiCard label="In Progress" value={s.inProgressTasks ?? "—"} icon={Loader2} tone="amber" />
        <KpiCard label="Pending" value={s.pendingTasks ?? "—"} icon={Clock} tone="rose" />
      </div>

      {/* Highlights row */}
      <div className="grid gap-3 md:grid-cols-3">
        <HighlightCard
          icon={BookOpen}
          label="Most used subject"
          value={s.mostUsedSubject?.name ?? "—"}
          sub={s.mostUsedSubject ? `${s.mostUsedSubject.count} tasks` : "No data"}
        />
        <HighlightCard
          icon={Layers}
          label="Most used chapter"
          value={s.mostUsedChapter?.name ?? "—"}
          sub={s.mostUsedChapter ? `${s.mostUsedChapter.count} tasks` : "No data"}
        />
        <HighlightCard
          icon={Trophy}
          label="Top student"
          value={s.mostActiveStudents?.[0]?.name ?? "—"}
          sub={
            s.mostActiveStudents?.[0]
              ? `${s.mostActiveStudents[0].completed}/${s.mostActiveStudents[0].total} tasks done`
              : "No data"
          }
        />
      </div>

      <Tabs defaultValue="students" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="students" className="mt-4">
          <StudentsPanel />
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <AnalyticsPanel />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HighlightCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: any;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="glass-card border-border/60">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="truncate font-display text-base font-semibold">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------- students */

function StudentsPanel() {
  const [search, setSearch] = useState("");
  const [routineType, setRoutineType] = useState<string>("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [sortBy, setSortBy] = useState<"last_active" | "completion" | "tasks" | "created">(
    "last_active",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const listFn = useServerFn(adminRoutineStudents);
  const list = useQuery({
    queryKey: ["admin-routine", "students", { search, routineType, status, sortBy, sortDir, page, pageSize }],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          routineType: (routineType || undefined) as any,
          status,
          sortBy,
          sortDir,
          page,
          pageSize,
        },
      }),
    placeholderData: (prev) => prev,
  });

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));

  return (
    <Card className="glass-card border-border/60">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle className="text-base">Students</CardTitle>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <div className="relative col-span-2 sm:col-span-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search name or email…"
              className="w-full pl-9 sm:w-56"
            />
          </div>
          <Select
            value={routineType || "all"}
            onValueChange={(v) => {
              setRoutineType(v === "all" ? "" : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Routine type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v: any) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Sort by" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="last_active">Last active</SelectItem>
              <SelectItem value="completion">Completion</SelectItem>
              <SelectItem value="tasks">Total tasks</SelectItem>
              <SelectItem value="created">Created</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortDir} onValueChange={(v: any) => setSortDir(v)}>
            <SelectTrigger className="w-full sm:w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Desc</SelectItem>
              <SelectItem value="asc">Asc</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Tasks</TableHead>
                <TableHead className="text-right">Done</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Completion</TableHead>
                <TableHead className="text-right">Study Time</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.isLoading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : (list.data?.rows ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-10 text-center text-muted-foreground">
                    No students found for the selected filters.
                  </TableCell>
                </TableRow>
              ) : (
                (list.data?.rows ?? []).map((r: any) => (
                  <TableRow key={r.userId} className="hover:bg-muted/40">
                    <TableCell>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.email ?? "—"}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.routineType ? (
                        <Badge variant="secondary" className="capitalize">{r.routineType}</Badge>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.totalTasks}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.completed}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.pending}</TableCell>
                    <TableCell className="text-right"><StatusPill pct={r.completion} /></TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMinutes(r.studyMinutes)}
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(r.lastActive)}</TableCell>
                    <TableCell className="text-sm">{formatDate(r.createdAt)}</TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="View details"
                        onClick={() => setSelectedUserId(r.userId)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-4 flex flex-col-reverse items-center gap-3 md:flex-row md:justify-between">
          <p className="text-sm text-muted-foreground">
            {list.data?.total ?? 0} student{(list.data?.total ?? 0) === 1 ? "" : "s"}
          </p>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
            >
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm tabular-nums text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              size="icon"
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <StudentDetailDialog
        userId={selectedUserId}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
      />
    </Card>
  );
}

/* --------------------------------------------------------------- detail */

function StudentDetailDialog({
  userId,
  onOpenChange,
}: {
  userId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const detailFn = useServerFn(adminRoutineStudentDetail);
  const detail = useQuery({
    queryKey: ["admin-routine", "detail", userId],
    queryFn: () => detailFn({ data: { userId: userId! } }),
    enabled: !!userId,
  });

  const derived = useMemo(() => {
    const tasks = (detail.data?.tasks ?? []) as any[];
    const now = new Date();
    // Local Y-M-D formatter — toISOString() shifts east-of-UTC viewers to
    // the previous calendar day and misaligns todayKey / week / month buckets
    // from task_date (which is stored in the student's local calendar).
    const isoLocal = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${dd}`;
    };
    const todayKey = isoLocal(now);
    const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
    const monthKey = todayKey.slice(0, 7);


    const minutesFor = (t: any) => {
      const [h1, m1] = String(t.start_time ?? "00:00").split(":").map(Number);
      const [h2, m2] = String(t.end_time ?? "00:00").split(":").map(Number);
      const v = h2 * 60 + m2 - (h1 * 60 + m1);
      return v > 0 ? v : 0;
    };

    // Per-day series (last 30 days)
    const byDay: Record<string, { total: number; done: number; minutes: number }> = {};
    for (const t of tasks) {
      const d = t.task_date;
      byDay[d] = byDay[d] ?? { total: 0, done: 0, minutes: 0 };
      byDay[d].total += 1;
      if (t.status === "completed") {
        byDay[d].done += 1;
        byDay[d].minutes += minutesFor(t);
      }
    }
    const dailySeries = Object.entries(byDay)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-30)
      .map(([k, v]) => ({
        day: k.slice(5),
        completed: v.done,
        total: v.total,
        minutes: v.minutes,
        pct: v.total ? Math.round((v.done / v.total) * 100) : 0,
      }));

    // Weekly aggregation (last 12 weeks)
    const byWeek: Record<string, { total: number; done: number; minutes: number }> = {};
    for (const t of tasks) {
      const dt = new Date(t.task_date);
      const first = new Date(dt); first.setDate(dt.getDate() - dt.getDay());
      const k = isoLocal(first);
      byWeek[k] = byWeek[k] ?? { total: 0, done: 0, minutes: 0 };
      byWeek[k].total += 1;
      if (t.status === "completed") {
        byWeek[k].done += 1;
        byWeek[k].minutes += minutesFor(t);
      }
    }
    const weeklySeries = Object.entries(byWeek)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .slice(-12)
      .map(([k, v]) => ({
        week: k.slice(5),
        completed: v.done,
        total: v.total,
        minutes: v.minutes,
      }));

    // Monthly aggregation
    const byMonth: Record<string, { total: number; done: number; minutes: number }> = {};
    for (const t of tasks) {
      const k = t.task_date.slice(0, 7);
      byMonth[k] = byMonth[k] ?? { total: 0, done: 0, minutes: 0 };
      byMonth[k].total += 1;
      if (t.status === "completed") {
        byMonth[k].done += 1;
        byMonth[k].minutes += minutesFor(t);
      }
    }
    const monthlySeries = Object.entries(byMonth)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => ({ month: k, completed: v.done, total: v.total, minutes: v.minutes }));

    // Study pattern by DOW (radar)
    const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dow = Array(7).fill(0);
    for (const t of tasks) if (t.status === "completed") dow[new Date(t.task_date).getDay()] += 1;
    const pattern = dow.map((v, i) => ({ dow: dowNames[i], done: v }));

    // Calendar heatmap for current month
    const cy = now.getFullYear();
    const cm = now.getMonth();
    const daysInMonth = new Date(cy, cm + 1, 0).getDate();
    const monthCells = Array.from({ length: daysInMonth }, (_, i) => {
      const key = isoLocal(new Date(cy, cm, i + 1));
      const v = byDay[key];
      return {
        day: i + 1,
        pct: v?.total ? Math.round((v.done / v.total) * 100) : 0,
        done: v?.done ?? 0,
        total: v?.total ?? 0,
      };
    });

    // Consistency = % of last 30 days with at least one completion
    const active30 = dailySeries.filter((d) => d.completed > 0).length;
    const consistency = dailySeries.length
      ? Math.round((active30 / dailySeries.length) * 100)
      : 0;
    const productivity = tasks.length
      ? Math.round(
          (tasks.filter((t) => t.status === "completed").length / tasks.length) * 100,
        )
      : 0;

    return {
      tasks,
      dailySeries,
      weeklySeries,
      monthlySeries,
      pattern,
      monthCells,
      consistency,
      productivity,
      todayKey,
      monthKey,
      todayCount: tasks.filter((t) => t.task_date === todayKey).length,
      weekCount: tasks.filter((t) => new Date(t.task_date) >= startOfWeek).length,
      monthCount: tasks.filter((t) => t.task_date.startsWith(monthKey)).length,
      totalMinutes: tasks
        .filter((t) => t.status === "completed")
        .reduce((s, t) => s + minutesFor(t), 0),
    };
  }, [detail.data]);

  const timeline = useMemo(() => {
    return ((detail.data?.tasks ?? []) as any[])
      .slice()
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .slice(0, 30);
  }, [detail.data]);

  return (
    <Dialog open={!!userId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1.5rem)] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate">
            {detail.data?.user.name ?? detail.data?.user.email ?? "Student details"}
          </DialogTitle>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex justify-center py-14">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label="Routines" value={(detail.data?.routines ?? []).length} icon={CalendarClock} tone="primary" />
              <KpiCard label="Tasks" value={derived.tasks.length} icon={ListChecks} tone="sky" />
              <KpiCard label="Completed" value={derived.tasks.filter((t: any) => t.status === "completed").length} icon={CheckCircle2} tone="emerald" />
              <KpiCard label="Study Time" value={formatMinutes(derived.totalMinutes)} icon={Clock} tone="rose" />
              <KpiCard label="Productivity" value={`${derived.productivity}%`} icon={Target} tone="amber" />
              <KpiCard label="Consistency" value={`${derived.consistency}%`} icon={Flame} tone="violet" />
            </div>

            {/* Progress totals */}
            <div className="grid gap-3 md:grid-cols-3">
              <ProgressStat label="Today" value={derived.todayCount} icon={CalendarDays} />
              <ProgressStat label="This Week" value={derived.weekCount} icon={CalendarDays} />
              <ProgressStat label="This Month" value={derived.monthCount} icon={CalendarDays} />
            </div>

            {/* Daily / Weekly / Monthly progress charts */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Daily progress (30d)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={derived.dailySeries}>
                        <defs>
                          <linearGradient id="dcomp" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeOpacity={0.15} vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RTooltip contentStyle={tooltipStyle} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Area type="monotone" dataKey="completed" name="Completed" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#dcomp)" />
                        <Line type="monotone" dataKey="total" name="Planned" stroke="hsl(var(--muted-foreground))" strokeWidth={1.25} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Productivity graph — study time</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={derived.dailySeries}>
                        <CartesianGrid strokeOpacity={0.15} vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RTooltip contentStyle={tooltipStyle} formatter={(v: any) => `${v}m`} />
                        <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Weekly progress (12w)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={derived.weeklySeries}>
                        <CartesianGrid strokeOpacity={0.15} vertical={false} />
                        <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RTooltip contentStyle={tooltipStyle} />
                        <Bar dataKey="completed" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="total" fill="hsl(var(--muted-foreground))" opacity={0.35} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Monthly progress</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={derived.monthlySeries}>
                        <CartesianGrid strokeOpacity={0.15} vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <RTooltip contentStyle={tooltipStyle} />
                        <Line type="monotone" dataKey="completed" stroke="hsl(var(--primary))" strokeWidth={2} dot />
                        <Line type="monotone" dataKey="total" stroke="hsl(var(--muted-foreground))" strokeWidth={1} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Pattern + Consistency + Calendar */}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Study pattern</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={derived.pattern}>
                        <PolarGrid strokeOpacity={0.2} />
                        <PolarAngleAxis dataKey="dow" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis tick={{ fontSize: 10 }} />
                        <Radar dataKey="done" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.35} />
                        <RTooltip contentStyle={tooltipStyle} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Consistency graph</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={derived.dailySeries}>
                        <defs>
                          <linearGradient id="cons" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(160 84% 39%)" stopOpacity={0.6} />
                            <stop offset="95%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeOpacity={0.15} vertical={false} />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" />
                        <RTooltip contentStyle={tooltipStyle} formatter={(v: any) => `${v}%`} />
                        <Area type="monotone" dataKey="pct" stroke="hsl(160 84% 39%)" strokeWidth={2} fill="url(#cons)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Calendar — this month</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-7 gap-1.5">
                    {derived.monthCells.map((c) => {
                      const tone =
                        c.total === 0
                          ? "bg-muted/40"
                          : c.pct >= 80
                            ? "bg-emerald-500/70"
                            : c.pct >= 40
                              ? "bg-amber-500/70"
                              : "bg-rose-500/60";
                      return (
                        <div
                          key={c.day}
                          title={`${c.day}: ${c.done}/${c.total} (${c.pct}%)`}
                          className={`aspect-square rounded-md ${tone} flex items-center justify-center text-[10px] font-medium text-white/90`}
                        >
                          {c.day}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Low</span>
                    <div className="flex gap-1">
                      <span className="h-3 w-3 rounded bg-muted/40" />
                      <span className="h-3 w-3 rounded bg-rose-500/60" />
                      <span className="h-3 w-3 rounded bg-amber-500/70" />
                      <span className="h-3 w-3 rounded bg-emerald-500/70" />
                    </div>
                    <span>High</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Routine + Completion History */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Routine history</CardTitle></CardHeader>
                <CardContent className="max-h-64 overflow-y-auto">
                  {(detail.data?.routines ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No routines yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {(detail.data?.routines ?? []).map((r: any) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium">{r.name ?? "Untitled routine"}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {formatDate(r.created_at)} · {r.type ?? "—"}
                            </p>
                          </div>
                          <Badge variant={r.is_archived ? "outline" : "secondary"} className="capitalize">
                            {r.is_archived ? "archived" : r.is_active ? "active" : "paused"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Completion history</CardTitle></CardHeader>
                <CardContent className="max-h-64 overflow-y-auto">
                  {timeline.filter((t) => t.status === "completed").length === 0 ? (
                    <p className="text-sm text-muted-foreground">No completions yet.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {timeline
                        .filter((t) => t.status === "completed")
                        .slice(0, 20)
                        .map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm"
                          >
                            <span className="min-w-0 truncate">{t.title}</span>
                            <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                              {formatDate(t.updated_at)}
                            </span>
                          </li>
                        ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Activity Timeline */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Recent activity timeline</CardTitle></CardHeader>
              <CardContent>
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                ) : (
                  <ol className="relative space-y-3 border-l border-border/60 pl-5">
                    {timeline.map((t) => (
                      <li key={t.id} className="relative">
                        <span
                          className={`absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-background ${
                            t.status === "completed" ? "bg-emerald-500" : t.status === "in_progress" ? "bg-amber-500" : "bg-muted-foreground/50"
                          }`}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate font-medium">{t.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {t.status.replace("_", " ")} · {formatDate(t.updated_at)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProgressStat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: any;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="font-display text-lg font-semibold tabular-nums">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------- analytics */

function AnalyticsPanel() {
  const fn = useServerFn(adminRoutineAnalytics);
  const q = useQuery({ queryKey: ["admin-routine", "analytics"], queryFn: () => fn() });

  if (q.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const a: any = q.data ?? {};

  const daily = (a.daily ?? []).map((d: any) => ({ ...d, day: d.key.slice(5) }));
  const weekly = (a.weekly ?? []).map((d: any) => ({ ...d, day: d.key.slice(5) }));
  const monthly = (a.monthly ?? []).map((d: any) => ({ ...d, day: d.key }));
  const growth = (a.studentGrowth ?? []).map((d: any) => ({ ...d, day: d.key.slice(5) }));
  const routineGrowth = (a.routineGrowth ?? []).map((d: any) => ({ ...d, day: d.key.slice(5) }));

  return (
    <div className="space-y-5">
      {/* Trends */}
      <div className="grid gap-4 lg:grid-cols-3">
        <TrendCard title="Daily Trend" data={daily} xKey="day" gradientId="atd" />
        <TrendCard title="Weekly Trend" data={weekly} xKey="day" gradientId="atw" />
        <TrendCard title="Monthly Trend" data={monthly} xKey="day" gradientId="atm" />
      </div>

      {/* Growth + Completion + Study time */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Student growth</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={growth}>
                  <defs>
                    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#sg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Routine growth</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={routineGrowth}>
                  <defs>
                    <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RTooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="total" stroke="hsl(217 91% 60%)" strokeWidth={2} fill="url(#rg)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Completion rate (daily)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily.map((d: any) => ({ ...d, pct: d.total ? Math.round((d.completed / d.total) * 100) : 0 }))}>
                  <CartesianGrid strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} unit="%" />
                  <RTooltip contentStyle={tooltipStyle} formatter={(v: any) => `${v}%`} />
                  <Line type="monotone" dataKey="pct" stroke="hsl(160 84% 39%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active students trend */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Active students (daily)</CardTitle></CardHeader>
        <CardContent>
          <div className="h-56">
            {daily.some((d: any) => (d.activeUsers ?? 0) > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={daily}>
                  <defs>
                    <linearGradient id="au" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(280 83% 60%)" stopOpacity={0.5} />
                      <stop offset="95%" stopColor="hsl(280 83% 60%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeOpacity={0.15} vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RTooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="activeUsers" name="Active students"
                    stroke="hsl(280 83% 60%)" strokeWidth={2} fill="url(#au)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No active students yet.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Distributions */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DistPie title="Subject distribution" rows={a.subjectDistribution ?? []} />
        <DistPie title="Routine type distribution" rows={a.routineTypeDistribution ?? []} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <DistBar title="Chapter distribution" rows={a.chapterDistribution ?? []} />
        <DistBar title="Level distribution" rows={a.levelDistribution ?? []} />
      </div>

      {/* Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Activity heatmap (day × hour)</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap data={a.heatmap ?? []} />
        </CardContent>
      </Card>

      {/* Leaderboards */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Leaderboard title="Top 10 students" rows={a.top10 ?? []} icon={Trophy} />
        <Leaderboard title="Lowest active students" rows={a.lowest10 ?? []} icon={TrendingDown} />
      </div>
    </div>
  );
}

function TrendCard({
  title,
  data,
  xKey,
  gradientId,
}: {
  title: string;
  data: any[];
  xKey: string;
  gradientId: string;
}) {
  const isEmpty = !data.some((d) => (d.total ?? 0) > 0 || (d.plannedHours ?? 0) > 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className="h-56">
          {isEmpty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No activity yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`${gradientId}-p`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(217 91% 60%)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeOpacity={0.15} vertical={false} />
                <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
                <YAxis yAxisId="tasks" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="hours" orientation="right" tick={{ fontSize: 11 }} unit="h" />
                <RTooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area yAxisId="hours" type="monotone" dataKey="plannedHours" name="Planned h"
                  stroke="hsl(217 91% 60%)" strokeWidth={2} fill={`url(#${gradientId}-p)`} />
                <Area yAxisId="hours" type="monotone" dataKey="completedHours" name="Completed h"
                  stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#${gradientId})`} />
                <Line yAxisId="tasks" type="monotone" dataKey="total" name="Planned tasks"
                  stroke="hsl(var(--muted-foreground))" strokeWidth={1.25} dot={false} />
                <Line yAxisId="tasks" type="monotone" dataKey="completed" name="Completed tasks"
                  stroke="hsl(160 84% 39%)" strokeWidth={1.75} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DistPie({ title, rows }: { title: string; rows: { id: string; name: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <RTooltip contentStyle={tooltipStyle} />
                <Pie
                  data={rows}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {rows.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {rows.length > 0 ? (
          <ul className="mt-3 grid grid-cols-2 gap-1.5 text-xs">
            {rows.slice(0, 8).map((r, i) => (
              <li key={r.id} className="flex items-center gap-2 truncate">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                />
                <span className="truncate">{r.name}</span>
                <span className="ml-auto tabular-nums text-muted-foreground">{r.count}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DistBar({ title, rows }: { title: string; rows: { id: string; name: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeOpacity={0.15} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <RTooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]}>
                  {rows.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Heatmap({ data }: { data: number[][] }) {
  if (!data.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>;
  }
  const flat = data.flat();
  const max = Math.max(1, ...flat);
  const dowNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="ml-10 grid grid-cols-24 gap-0.5 text-[9px] text-muted-foreground" style={{ gridTemplateColumns: "repeat(24,minmax(0,1fr))" }}>
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="text-center tabular-nums">{h}</div>
          ))}
        </div>
        <div className="mt-1 space-y-0.5">
          {data.map((row, dow) => (
            <div key={dow} className="flex items-center gap-1">
              <span className="w-9 text-[11px] font-medium text-muted-foreground">{dowNames[dow]}</span>
              <div className="grid flex-1 gap-0.5" style={{ gridTemplateColumns: "repeat(24,minmax(0,1fr))" }}>
                {row.map((v, h) => {
                  const intensity = v / max;
                  const opacity = v === 0 ? 0.08 : 0.2 + intensity * 0.8;
                  return (
                    <div
                      key={h}
                      title={`${dowNames[dow]} ${h}:00 — ${v} completions`}
                      className="aspect-square rounded-[3px]"
                      style={{ background: `hsl(var(--primary) / ${opacity})` }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Leaderboard({
  title,
  rows,
  icon: Icon,
}: {
  title: string;
  rows: any[];
  icon: any;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r: any, i: number) => (
              <li key={r.userId} className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm">
                <div
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    i === 0
                      ? "bg-amber-500/20 text-amber-600 dark:text-amber-400"
                      : i === 1
                        ? "bg-slate-400/20 text-slate-600 dark:text-slate-300"
                        : i === 2
                          ? "bg-orange-500/20 text-orange-600 dark:text-orange-400"
                          : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name}</p>
                  <Progress value={r.completion} className="mt-1 h-1.5" />
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums text-xs text-muted-foreground">{r.completed}/{r.total}</p>
                  <StatusPill pct={r.completion} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ settings */

function SettingsPanel() {
  const qc = useQueryClient();
  const getFn = useServerFn(getStudyRoutineModuleEnabled);
  const setFn = useServerFn(setStudyRoutineModuleEnabled);
  const q = useQuery({
    queryKey: ["admin-routine", "settings"],
    queryFn: () => getFn(),
  });
  const enabled = q.data?.enabled ?? true;

  const mutation = useMutation({
    mutationFn: (next: boolean) => setFn({ data: { enabled: next } }),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["admin-routine", "settings"] });
      const prev = qc.getQueryData(["admin-routine", "settings"]);
      qc.setQueryData(["admin-routine", "settings"], { enabled: next });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin-routine", "settings"], ctx.prev);
      toast.error("Failed to update setting");
    },
    onSuccess: (res) => {
      toast.success(res.enabled ? "Study Routine enabled" : "Study Routine disabled");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-routine", "settings"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Module visibility</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-xl">
          <Label className="text-sm font-semibold">Enable Study Routine</Label>
          <p className="mt-1 text-sm text-muted-foreground">
            When disabled, the Study Routine sidebar entry hides instantly for every
            student and its routes become inaccessible. No refresh, no logout required.
          </p>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => mutation.mutate(v)}
          disabled={mutation.isPending || q.isLoading}
          aria-label="Toggle Study Routine module"
        />
      </CardContent>
    </Card>
  );
}
