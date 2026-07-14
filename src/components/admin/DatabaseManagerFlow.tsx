import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  Database,
  Download,
  HardDrive,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
  ListChecks,
  Layers,
  Server,
  Clock,
  Eye,
  Search,
  Trash2,
  Loader2,
  Radio,
  Plus,
  Pencil,
  Play,
  X,
  Network,
  FileJson,
  FileSpreadsheet,
  Lock,
  Table as TableIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { supabase } from "@/integrations/supabase/client";
import { adminGetDatabaseStats, type DatabaseManagerStats } from "@/lib/admin-database.functions";
import {
  adminListTableRows,
  adminDeleteTableRow,
  adminBulkDeleteTableRows,
  adminUpsertTableRow,
  adminListPublicTables,
  adminGetTableMetadata,
  adminRunSelectQuery,
  adminGlobalSearch,
  PROTECTED_WRITE_TABLES,
  type TableMetadata,
} from "@/lib/admin-database-inspect.functions";

const DB_STATS_KEY = ["admin-database-stats"] as const;

function getBackendDiagnostics() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  let host: string | null = null;
  try {
    host = url ? new URL(url).host : null;
  } catch {
    host = url ?? null;
  }
  return {
    host,
    hasUrl: Boolean(url),
    hasKey: Boolean(key),
    keyPreview: key ? `${key.slice(0, 10)}…` : null,
  };
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}
function formatNumber(n: number): string {
  return new Intl.NumberFormat("en").format(n ?? 0);
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
  accent = "from-[var(--neon-purple)] to-[var(--neon-blue)]",
}: {
  icon: typeof Database;
  label: string;
  value: string | number;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <div
          className={`grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br ${accent} text-white shadow-glow`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 font-display text-2xl font-bold">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {hint ? <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-base font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function HealthBadge({ status }: { status: DatabaseManagerStats["systemHealth"]["status"] }) {
  const map = {
    healthy: {
      label: "Healthy",
      className: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      Icon: ShieldCheck,
    },
    warning: {
      label: "Warning",
      className: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      Icon: ShieldAlert,
    },
    critical: {
      label: "Critical",
      className: "bg-rose-500/20 text-rose-300 border-rose-500/30",
      Icon: ShieldAlert,
    },
  } as const;
  const { label, className, Icon } = map[status];
  return (
    <Badge variant="outline" className={`gap-1.5 ${className}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </Badge>
  );
}

function toCsv(stats: DatabaseManagerStats): string {
  const lines: string[] = [];
  lines.push("Section,Metric,Value");
  lines.push(`Users,Total,${stats.users.total}`);
  lines.push(`Users,Students,${stats.users.students}`);
  lines.push(`Users,Admins,${stats.users.admins}`);
  lines.push(`Users,Active 7d,${stats.users.active7d}`);
  for (const [k, v] of Object.entries(stats.content)) lines.push(`Content,${k},${v}`);
  lines.push(`Storage,Database size bytes,${stats.storage.dbSizeBytes}`);
  lines.push("");
  lines.push("Table,Size bytes,Row estimate");
  for (const t of stats.storage.tables) lines.push(`${t.table},${t.sizeBytes},${t.rows}`);
  return lines.join("\n");
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.join(",");
  const body = rows.map((r) => columns.map((c) => esc(r[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function DatabaseManagerFlow() {
  const qc = useQueryClient();
  const backend = useMemo(() => getBackendDiagnostics(), []);
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: DB_STATS_KEY,
    queryFn: () => adminGetDatabaseStats(),
    // Was 10s polling — produced 6 RPC chains per minute (permission +
    // audit + rate-limit + heavy aggregates). Reduced to 60s.
    refetchInterval: 60_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    retry: 1,
  });

  const usagePct = useMemo(() => {
    if (!data) return 0;
    return Math.min(100, (data.storage.dbSizeBytes / data.storage.capacityBytes) * 100);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-card rounded-3xl p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-amber-400" />
        <h2 className="text-lg font-semibold">Couldn't load database stats</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {(error as Error)?.message ?? "No data available right now."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Backend host: {backend.host ?? "missing"} · URL {backend.hasUrl ? "loaded" : "missing"} ·
          key {backend.hasKey ? backend.keyPreview : "missing"}
        </p>
        <Button className="mt-4" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="glass-card flex flex-col gap-3 rounded-3xl p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-glow">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold">Database Manager</h1>
            <p className="text-xs text-muted-foreground">
              Live · refreshed {new Date(data.generatedAt).toLocaleTimeString()}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Backend: {backend.host ?? "missing"} · key {backend.hasKey ? backend.keyPreview : "missing"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          >
            <Radio className={`h-3 w-3 ${isFetching ? "animate-pulse" : ""}`} /> Live
          </Badge>
          <HealthBadge status={data.systemHealth.status} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: DB_STATS_KEY });
              toast.success("Refreshing…");
            }}
            disabled={isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              downloadBlob(
                toCsv(data),
                "text/csv;charset=utf-8",
                `database-report-${new Date().toISOString().slice(0, 10)}.csv`,
              );
              toast.success("Report downloaded");
            }}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="glass-card">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="search">Search</TabsTrigger>
          <TabsTrigger value="query">Query Console</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-5">
          <OverviewTab data={data} usagePct={usagePct} />
        </TabsContent>

        <TabsContent value="tables">
          <TablesTab />
        </TabsContent>

        <TabsContent value="search">
          <SearchTab />
        </TabsContent>

        <TabsContent value="query">
          <QueryConsoleTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ data, usagePct }: { data: DatabaseManagerStats; usagePct: number }) {
  const otherTablesShown = data.storage.tables.slice(0, 12);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Users}
          label="Total Users"
          value={data.users.total}
          hint={`${data.users.new7d} new in 7d`}
        />
        <KpiCard
          icon={Users}
          label="Students"
          value={data.users.students}
          accent="from-blue-500 to-cyan-500"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Admins"
          value={data.users.admins}
          accent="from-fuchsia-500 to-pink-500"
        />
        <KpiCard
          icon={Activity}
          label="Active (7d)"
          value={data.users.active7d}
          hint="Distinct users with attempts"
          accent="from-emerald-500 to-teal-500"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={ListChecks} label="Total MCQs" value={data.content.mcqs} />
        <KpiCard
          icon={Layers}
          label="Quiz Sets"
          value={data.content.quizzes}
          hint={`${formatNumber(data.content.mockTests)} mock tests`}
        />
        <KpiCard
          icon={TrendingUp}
          label="Exam Attempts"
          value={data.content.examAttempts}
          accent="from-amber-500 to-orange-500"
        />
        <KpiCard
          icon={Activity}
          label="Most Active Module"
          value={data.mostActiveModule.name}
          hint={`${formatNumber(data.mostActiveModule.value)} items`}
          accent="from-violet-500 to-fuchsia-500"
        />
      </div>

      <SectionCard
        title="Storage usage"
        action={
          <Badge variant="outline" className="text-xs">
            {formatBytes(data.storage.dbSizeBytes)} / {formatBytes(data.storage.capacityBytes)}
          </Badge>
        }
      >
        <Progress value={usagePct} className="h-3" />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Used:{" "}
            <strong className="text-foreground">{formatBytes(data.storage.dbSizeBytes)}</strong>
          </span>
          <span>
            Free:{" "}
            <strong className="text-foreground">
              {formatBytes(Math.max(0, data.storage.capacityBytes - data.storage.dbSizeBytes))}
            </strong>
          </span>
          <span>
            Usage: <strong className="text-foreground">{usagePct.toFixed(1)}%</strong>
          </span>
        </div>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Storage by table"
          action={
            <Badge variant="outline" className="text-xs">
              Top {otherTablesShown.length}
            </Badge>
          }
        >
          {otherTablesShown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            <ul className="space-y-3">
              {otherTablesShown.map((t) => {
                const pct =
                  data.storage.dbSizeBytes > 0 ? (t.sizeBytes / data.storage.dbSizeBytes) * 100 : 0;
                return (
                  <li key={t.table}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono">{t.table}</span>
                      <span className="text-muted-foreground">
                        {formatBytes(t.sizeBytes)} · ~{formatNumber(t.rows)} rows
                      </span>
                    </div>
                    <Progress value={pct} className="mt-1 h-1.5" />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Daily growth (30 days)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.growthDaily}>
                <defs>
                  <linearGradient id="g-users" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-mcqs" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(15,15,25,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="users"
                  name="New users"
                  stroke="#a78bfa"
                  fill="url(#g-users)"
                />
                <Area
                  type="monotone"
                  dataKey="mcqs"
                  name="New MCQs"
                  stroke="#34d399"
                  fill="url(#g-mcqs)"
                />
                <Area
                  type="monotone"
                  dataKey="attempts"
                  name="Attempts"
                  stroke="#60a5fa"
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="MCQs by subject">
          {data.mcqBySubject.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.mcqBySubject} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(15,15,25,0.95)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="count" fill="#a78bfa" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Top chapters by MCQ count">
          {data.mcqByChapter.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            <div className="max-h-64 overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 text-left">Chapter</th>
                    <th className="py-2 text-left">Subject</th>
                    <th className="py-2 text-right">MCQs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.mcqByChapter.map((c) => (
                    <tr key={`${c.subject}-${c.name}`} className="border-t border-border/60">
                      <td className="py-2">{c.name}</td>
                      <td className="py-2 text-muted-foreground">{c.subject}</td>
                      <td className="py-2 text-right font-mono">{formatNumber(c.count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard title="System health">
          <div className="flex items-center gap-3">
            <Server className="h-8 w-8 text-muted-foreground" />
            <div>
              <HealthBadge status={data.systemHealth.status} />
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {data.systemHealth.notes.map((n) => (
                  <li key={n}>• {n}</li>
                ))}
              </ul>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Peak usage time">
          <div className="flex items-center gap-3">
            <Clock className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-display text-2xl font-bold">
                {data.peakHour ? `${String(data.peakHour.hour).padStart(2, "0")}:00` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.peakHour
                  ? `${formatNumber(data.peakHour.attempts)} attempts at peak (last 7d)`
                  : "No data available"}
              </p>
            </div>
          </div>
        </SectionCard>
        <SectionCard title="Database">
          <div className="flex items-center gap-3">
            <HardDrive className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-display text-2xl font-bold">
                {formatBytes(data.storage.dbSizeBytes)}
              </p>
              <p className="text-xs text-muted-foreground">
                {data.storage.tables.length} tables ·{" "}
                {formatNumber(data.storage.tables.reduce((s, t) => s + t.rows, 0))} estimated rows
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
}

// ---------------- Tables tab ----------------

function TablesTab() {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching, error } = useQuery({
    queryKey: ["admin-public-tables"],
    queryFn: () => adminListPublicTables(),
    refetchInterval: 15_000,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (!filter.trim()) return list;
    const q = filter.toLowerCase();
    return list.filter((t) => t.table_name.toLowerCase().includes(q));
  }, [data, filter]);

  return (
    <SectionCard
      title={`All tables (${data?.length ?? 0})`}
      action={
        <div className="flex items-center gap-2">
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter tables…"
            className="h-8 w-44"
          />
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <p className="font-medium">Couldn&apos;t read public tables.</p>
          <p className="mt-1 text-rose-100/80">{(error as Error).message}</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tables match this filter.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <button
              key={t.table_name}
              type="button"
              onClick={() => setSelected(t.table_name)}
              className="flex items-start justify-between rounded-xl border border-border/60 bg-card/40 px-3 py-2 text-left text-sm transition hover:border-primary/50 hover:bg-card/70"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <TableIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="truncate font-mono">{t.table_name}</span>
                  {PROTECTED_WRITE_TABLES.has(t.table_name) && (
                    <Lock className="h-3 w-3 text-amber-400" />
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  ~{formatNumber(t.row_estimate)} rows · {formatBytes(t.size_bytes)} · RLS{" "}
                  {t.rls_enabled ? "on" : "off"}
                </p>
              </div>
              <Eye className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <TableDetailDialog
          table={selected}
          onClose={() => setSelected(null)}
          onSwitch={setSelected}
        />
      ) : null}
    </SectionCard>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value.length > 80 ? value.slice(0, 77) + "…" : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > 80 ? s.slice(0, 77) + "…" : s;
  } catch {
    return String(value);
  }
}

function TableDetailDialog({
  table,
  onClose,
  onSwitch,
}: {
  table: string;
  onClose: () => void;
  onSwitch: (t: string) => void;
}) {
  const qc = useQueryClient();
  const isProtected = PROTECTED_WRITE_TABLES.has(table);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortColumn, setSortColumn] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{
    mode: "create" | "edit";
    row?: Record<string, unknown>;
  } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmStage, setConfirmStage] = useState(0);
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const pageSize = 25;

  // Reset state when switching table
  useEffect(() => {
    setPage(0);
    setSearch("");
    setSearchInput("");
    setSortColumn(undefined);
    setSortDir("desc");
    setSelectedIds(new Set());
    setEditor(null);
    setDeleteId(null);
    setConfirmStage(0);
    setBulkConfirm(false);
  }, [table]);

  const rowsQuery = useQuery({
    queryKey: ["admin-table-rows", table, page, search, sortColumn, sortDir] as const,
    queryFn: () =>
      adminListTableRows({
        data: { table, page, pageSize, search: search || undefined, sortColumn, sortDir },
      }),
    refetchInterval: 8_000,
    placeholderData: (prev) => prev,
  });

  const metaQuery = useQuery({
    queryKey: ["admin-table-meta", table] as const,
    queryFn: () => adminGetTableMetadata({ data: { table } }),
  });

  // Realtime: invalidate this table's rows on any change
  useEffect(() => {
    const channel = supabase
      .channel(`db-mgr-${table}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, () => {
        qc.invalidateQueries({ queryKey: ["admin-table-rows", table] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, qc]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminDeleteTableRow({ data: { table, id } }),
    onSuccess: () => {
      toast.success("Row deleted");
      qc.invalidateQueries({ queryKey: ["admin-table-rows", table] });
      qc.invalidateQueries({ queryKey: DB_STATS_KEY });
      setDeleteId(null);
      setConfirmStage(0);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => adminBulkDeleteTableRows({ data: { table, ids } }),
    onSuccess: (res) => {
      toast.success(`Deleted ${res.deleted} rows`);
      qc.invalidateQueries({ queryKey: ["admin-table-rows", table] });
      qc.invalidateQueries({ queryKey: DB_STATS_KEY });
      setSelectedIds(new Set());
      setBulkConfirm(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setBulkConfirm(false);
    },
  });

  const totalPages = rowsQuery.data ? Math.max(1, Math.ceil(rowsQuery.data.total / pageSize)) : 1;
  const columns = rowsQuery.data?.columns ?? [];
  const visibleRows = rowsQuery.data?.rows ?? [];
  const visibleIds = visibleRows
    .map((r) => String((r as Record<string, unknown>).id ?? ""))
    .filter(Boolean);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allChecked) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function exportRows(format: "csv" | "json") {
    if (!rowsQuery.data) return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "json") {
      downloadBlob(
        JSON.stringify(rowsQuery.data.rows, null, 2),
        "application/json",
        `${table}-page${page + 1}-${stamp}.json`,
      );
    } else {
      downloadBlob(
        rowsToCsv(columns, rowsQuery.data.rows as Record<string, unknown>[]),
        "text/csv;charset=utf-8",
        `${table}-page${page + 1}-${stamp}.csv`,
      );
    }
    toast.success("Exported");
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => {
          if (!o) onClose();
        }}
      >
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">
              <Database className="h-4 w-4" /> {table}
              {isProtected && (
                <Badge
                  variant="outline"
                  className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-300 text-[10px]"
                >
                  <Lock className="h-3 w-3" />
                  Protected
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Live data ·{" "}
              {rowsQuery.data ? `${formatNumber(rowsQuery.data.total)} rows total` : "loading…"} ·{" "}
              {metaQuery.data?.columns.length ?? "—"} columns
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="rows">
            <TabsList>
              <TabsTrigger value="rows">Records</TabsTrigger>
              <TabsTrigger value="schema">Schema</TabsTrigger>
              <TabsTrigger value="rels">Relationships</TabsTrigger>
              <TabsTrigger value="policies">RLS Policies</TabsTrigger>
              <TabsTrigger value="indexes">Indexes</TabsTrigger>
            </TabsList>

            <TabsContent value="rows" className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setSearch(searchInput);
                        setPage(0);
                      }
                    }}
                    placeholder="Search (name / title / email / key)…"
                    className="pl-8"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSearch(searchInput);
                    setPage(0);
                  }}
                >
                  Search
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => rowsQuery.refetch()}
                  disabled={rowsQuery.isFetching}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${rowsQuery.isFetching ? "animate-spin" : ""}`}
                  />{" "}
                  Refresh
                </Button>
                {!isProtected && (
                  <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
                    <Plus className="mr-2 h-4 w-4" /> New
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportRows("csv")}
                  disabled={visibleRows.length === 0}
                >
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => exportRows("json")}
                  disabled={visibleRows.length === 0}
                >
                  <FileJson className="mr-2 h-4 w-4" /> JSON
                </Button>
                {selectedIds.size > 0 && !isProtected && (
                  <Button size="sm" variant="destructive" onClick={() => setBulkConfirm(true)}>
                    <Trash2 className="mr-2 h-4 w-4" /> Delete {selectedIds.size}
                  </Button>
                )}
              </div>

              <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
                {rowsQuery.error ? (
                  <div className="p-4 text-sm text-rose-300">
                    {(rowsQuery.error as Error).message}
                  </div>
                ) : !rowsQuery.data ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-6 w-full" />
                    ))}
                  </div>
                ) : visibleRows.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No rows</div>
                ) : (
                  <table className="w-full min-w-[720px] text-xs">
                    <thead className="sticky top-0 bg-card/95 backdrop-blur">
                      <tr>
                        {!isProtected && (
                          <th className="w-8 border-b border-border/60 px-2 py-2">
                            <Checkbox checked={allChecked} onCheckedChange={toggleSelectAll} />
                          </th>
                        )}
                        {columns.map((c) => (
                          <th
                            key={c}
                            className="whitespace-nowrap border-b border-border/60 px-2 py-2 text-left font-mono text-[10px] uppercase text-muted-foreground"
                          >
                            <button
                              type="button"
                              className="hover:text-foreground"
                              onClick={() => {
                                if (sortColumn === c)
                                  setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                                else {
                                  setSortColumn(c);
                                  setSortDir("asc");
                                }
                              }}
                            >
                              {c}
                              {sortColumn === c ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                            </button>
                          </th>
                        ))}
                        <th className="sticky right-0 border-b border-border/60 bg-card/95 px-2 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row, idx) => {
                        const rid = String((row as Record<string, unknown>).id ?? "");
                        return (
                          <tr
                            key={rid || idx}
                            className="border-b border-border/40 hover:bg-card/40"
                          >
                            {!isProtected && (
                              <td className="px-2 py-1.5">
                                {rid ? (
                                  <Checkbox
                                    checked={selectedIds.has(rid)}
                                    onCheckedChange={(v) =>
                                      setSelectedIds((prev) => {
                                        const n = new Set(prev);
                                        if (v) n.add(rid);
                                        else n.delete(rid);
                                        return n;
                                      })
                                    }
                                  />
                                ) : null}
                              </td>
                            )}
                            {columns.map((c) => (
                              <td key={c} className="whitespace-nowrap px-2 py-1.5 font-mono">
                                {formatCell((row as Record<string, unknown>)[c])}
                              </td>
                            ))}
                            <td className="sticky right-0 bg-card/95 px-2 py-1.5">
                              <div className="flex items-center justify-end gap-1">
                                {!isProtected && rid ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0"
                                      onClick={() =>
                                        setEditor({
                                          mode: "edit",
                                          row: row as Record<string, unknown>,
                                        })
                                      }
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-rose-400 hover:bg-rose-500/10"
                                      onClick={() => {
                                        setDeleteId(rid);
                                        setConfirmStage(1);
                                      }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Page {page + 1} of {totalPages} · {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page === 0 || rowsQuery.isFetching}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page + 1 >= totalPages || rowsQuery.isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="schema">
              <SchemaPanel meta={metaQuery.data} loading={metaQuery.isLoading} />
            </TabsContent>
            <TabsContent value="rels">
              <RelationshipsPanel
                meta={metaQuery.data}
                loading={metaQuery.isLoading}
                onOpen={onSwitch}
              />
            </TabsContent>
            <TabsContent value="policies">
              <PoliciesPanel meta={metaQuery.data} loading={metaQuery.isLoading} />
            </TabsContent>
            <TabsContent value="indexes">
              <IndexesPanel meta={metaQuery.data} loading={metaQuery.isLoading} />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" /> Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editor ? (
        <RowEditorDialog
          table={table}
          meta={metaQuery.data}
          mode={editor.mode}
          row={editor.row}
          onClose={() => setEditor(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["admin-table-rows", table] });
            qc.invalidateQueries({ queryKey: DB_STATS_KEY });
            setEditor(null);
          }}
        />
      ) : null}

      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => {
          if (!o) {
            setDeleteId(null);
            setConfirmStage(0);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-400" />
              {confirmStage === 1 ? "Delete this row?" : "Are you absolutely sure?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmStage === 1
                ? `This will permanently delete row id ${deleteId} from "${table}". This action cannot be undone.`
                : "Final confirmation. Click Delete forever to remove this row from the database."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            {confirmStage === 1 ? (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  setConfirmStage(2);
                }}
                className="bg-rose-500 text-white hover:bg-rose-600"
              >
                Continue
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  if (deleteId) deleteMutation.mutate(deleteId);
                }}
                disabled={deleteMutation.isPending}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Delete forever
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkConfirm} onOpenChange={setBulkConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} rows?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the selected rows from "{table}". This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDeleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                bulkDeleteMutation.mutate(Array.from(selectedIds));
              }}
              disabled={bulkDeleteMutation.isPending}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {bulkDeleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Delete {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SchemaPanel({ meta, loading }: { meta?: TableMetadata; loading: boolean }) {
  if (loading || !meta)
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  return (
    <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="sticky top-0 bg-card/95">
          <tr className="text-muted-foreground">
            <th className="px-2 py-2 text-left">Column</th>
            <th className="px-2 py-2 text-left">Type</th>
            <th className="px-2 py-2 text-left">Nullable</th>
            <th className="px-2 py-2 text-left">Default</th>
            <th className="px-2 py-2 text-left">PK</th>
          </tr>
        </thead>
        <tbody>
          {meta.columns.map((c) => (
            <tr key={c.name} className="border-t border-border/40">
              <td className="px-2 py-1.5 font-mono">{c.name}</td>
              <td className="px-2 py-1.5 font-mono text-muted-foreground">{c.data_type}</td>
              <td className="px-2 py-1.5">{c.is_nullable ? "Yes" : "No"}</td>
              <td className="px-2 py-1.5 font-mono text-muted-foreground">{c.default ?? "—"}</td>
              <td className="px-2 py-1.5">{c.is_pk ? "✓" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RelationshipsPanel({
  meta,
  loading,
  onOpen,
}: {
  meta?: TableMetadata;
  loading: boolean;
  onOpen: (t: string) => void;
}) {
  if (loading || !meta) return <Skeleton className="h-32 w-full" />;
  return (
    <div className="space-y-4 max-h-[55vh] overflow-auto">
      <div>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Network className="h-4 w-4" /> References (this → other)
        </h4>
        {meta.foreign_keys.length === 0 ? (
          <p className="text-xs text-muted-foreground">No outgoing foreign keys.</p>
        ) : (
          <ul className="space-y-1 text-xs font-mono">
            {meta.foreign_keys.map((f) => (
              <li
                key={f.constraint_name}
                className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5"
              >
                <span>
                  {f.columns.join(", ")} →{" "}
                  <button
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => onOpen(f.foreign_table)}
                  >
                    {f.foreign_table}
                  </button>
                  ({f.foreign_columns.join(", ")})
                </span>
                <span className="text-[10px] text-muted-foreground">{f.constraint_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Network className="h-4 w-4 rotate-180" /> Referenced by (other → this)
        </h4>
        {meta.referenced_by.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tables reference this one.</p>
        ) : (
          <ul className="space-y-1 text-xs font-mono">
            {meta.referenced_by.map((f) => (
              <li
                key={f.constraint_name}
                className="flex items-center justify-between rounded-md border border-border/60 px-2 py-1.5"
              >
                <span>
                  <button
                    className="text-primary underline-offset-2 hover:underline"
                    onClick={() => onOpen(f.from_table)}
                  >
                    {f.from_table}
                  </button>
                  ({f.from_columns.join(", ")}) → {f.columns.join(", ")}
                </span>
                <span className="text-[10px] text-muted-foreground">{f.constraint_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PoliciesPanel({ meta, loading }: { meta?: TableMetadata; loading: boolean }) {
  if (loading || !meta) return <Skeleton className="h-32 w-full" />;
  if (meta.policies.length === 0)
    return <p className="text-sm text-muted-foreground">No RLS policies defined on this table.</p>;
  return (
    <div className="space-y-2 max-h-[55vh] overflow-auto">
      {meta.policies.map((p) => (
        <div key={p.name} className="rounded-md border border-border/60 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-mono font-semibold">{p.name}</span>
            <Badge variant="outline" className="text-[10px]">
              {p.command} · {p.permissive}
            </Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            Roles: {Array.isArray(p.roles) ? p.roles.join(", ") : "—"}
          </p>
          {p.using ? (
            <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">
              USING: {p.using}
            </pre>
          ) : null}
          {p.with_check ? (
            <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">
              WITH CHECK: {p.with_check}
            </pre>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function IndexesPanel({ meta, loading }: { meta?: TableMetadata; loading: boolean }) {
  if (loading || !meta) return <Skeleton className="h-32 w-full" />;
  if (meta.indexes.length === 0)
    return <p className="text-sm text-muted-foreground">No indexes.</p>;
  return (
    <ul className="space-y-1 max-h-[55vh] overflow-auto text-xs font-mono">
      {meta.indexes.map((i) => (
        <li key={i.name} className="rounded-md border border-border/60 p-2">
          <span className="font-semibold">{i.name}</span>
          <pre className="mt-1 whitespace-pre-wrap break-all text-[11px] text-muted-foreground">
            {i.definition}
          </pre>
        </li>
      ))}
    </ul>
  );
}

// ---------------- Row Editor ----------------

function RowEditorDialog({
  table,
  meta,
  mode,
  row,
  onClose,
  onSaved,
}: {
  table: string;
  meta?: TableMetadata;
  mode: "create" | "edit";
  row?: Record<string, unknown>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (row)
      for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined) init[k] = "";
        else if (typeof v === "object") init[k] = JSON.stringify(v);
        else init[k] = String(v);
      }
    return init;
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!meta) throw new Error("Schema not loaded yet");
      const pk = meta.primary_key[0] ?? "id";
      const payload: Record<string, unknown> = {};
      for (const col of meta.columns) {
        // Skip PK on create; on edit, skip the PK + audit columns to avoid writing them.
        if (col.name === pk) continue;
        if (mode === "edit" && (col.name === "created_at" || col.name === "updated_at")) continue;
        const raw = values[col.name];
        if (raw === undefined) continue;
        if (raw === "" && col.is_nullable) {
          payload[col.name] = null;
          continue;
        }
        if (raw === "" && col.default !== null) continue; // let DB default apply
        if (raw === "") continue;
        // Parse based on type
        const t = col.data_type;
        if (t === "boolean") payload[col.name] = raw === "true" || raw === "1";
        else if (t.includes("int") || t === "numeric" || t === "double precision" || t === "real") {
          const n = Number(raw);
          if (!Number.isFinite(n)) throw new Error(`Invalid number for ${col.name}`);
          payload[col.name] = n;
        } else if (t === "jsonb" || t === "json") {
          try {
            payload[col.name] = JSON.parse(raw);
          } catch {
            throw new Error(`Invalid JSON for ${col.name}`);
          }
        } else {
          payload[col.name] = raw;
        }
      }
      const id = mode === "edit" ? String((row as Record<string, unknown>)[pk]) : undefined;
      return adminUpsertTableRow({ data: { table, values: payload, id, idColumn: pk } });
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Row created" : "Row updated");
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!meta) return null;
  const pk = meta.primary_key[0] ?? "id";
  const fields = meta.columns.filter((c) => c.name !== pk);

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Create row" : "Edit row"} ·{" "}
            <span className="font-mono">{table}</span>
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? `Editing ${pk} = ${String((row as Record<string, unknown>)[pk])}`
              : "Leave a field blank to use its default."}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-2">
          {fields.map((c) => {
            const isJson = c.data_type === "jsonb" || c.data_type === "json";
            return (
              <div key={c.name} className="space-y-1">
                <label className="text-xs font-medium">
                  <span className="font-mono">{c.name}</span>
                  <span className="ml-2 text-muted-foreground">
                    {c.data_type}
                    {c.is_nullable ? " · nullable" : ""}
                  </span>
                </label>
                {isJson ? (
                  <Textarea
                    rows={3}
                    value={values[c.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                    placeholder='e.g. {"key": "value"}'
                  />
                ) : c.data_type === "boolean" ? (
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={values[c.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                  >
                    <option value="">(default)</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <Input
                    value={values[c.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}
                    placeholder={c.default ?? ""}
                  />
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {mode === "create" ? "Create" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Search tab ----------------

function SearchTab() {
  const [term, setTerm] = useState("");
  const [submitted, setSubmitted] = useState("");
  const query = useQuery({
    queryKey: ["admin-global-search", submitted],
    queryFn: () => adminGlobalSearch({ data: { term: submitted, limit: 100 } }),
    enabled: submitted.length >= 2,
  });
  return (
    <SectionCard
      title="Global database search"
      action={
        <Badge variant="outline" className="text-xs">
          Searches name / title / email / slug / question / description across all tables
        </Badge>
      }
    >
      <div className="flex gap-2">
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Type at least 2 characters…"
          onKeyDown={(e) => {
            if (e.key === "Enter") setSubmitted(term);
          }}
        />
        <Button onClick={() => setSubmitted(term)} disabled={term.length < 2}>
          <Search className="mr-2 h-4 w-4" /> Search
        </Button>
      </div>
      <div className="mt-4">
        {!submitted ? (
          <p className="text-sm text-muted-foreground">
            Enter a search term to find matching records across all tables.
          </p>
        ) : query.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : query.error ? (
          <p className="text-sm text-rose-300">{(query.error as Error).message}</p>
        ) : !query.data || query.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No matches.</p>
        ) : (
          <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 bg-card/95">
                <tr className="text-muted-foreground">
                  <th className="px-2 py-2 text-left">Table</th>
                  <th className="px-2 py-2 text-left">ID</th>
                  <th className="px-2 py-2 text-left">Match</th>
                </tr>
              </thead>
              <tbody>
                {query.data.map((r, i) => (
                  <tr key={`${r.table_name}-${r.id}-${i}`} className="border-t border-border/40">
                    <td className="px-2 py-1.5 font-mono">{r.table_name}</td>
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.id}</td>
                    <td className="px-2 py-1.5">{r.snippet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ---------------- Query console ----------------

function QueryConsoleTab() {
  const [sql, setSql] = useState(
    "SELECT id, display_name, status, last_login_at FROM profiles ORDER BY last_login_at DESC NULLS LAST LIMIT 25",
  );
  const historyRef = useRef<string[]>([]);
  const [_tick, setTick] = useState(0);

  const mutation = useMutation({
    mutationFn: () => adminRunSelectQuery({ data: { sql, maxRows: 500 } }),
    onSuccess: () => {
      historyRef.current = [sql, ...historyRef.current.filter((q) => q !== sql)].slice(0, 10);
      setTick((t) => t + 1);
      toast.success("Query executed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = mutation.data?.rows ?? [];
  const columns = rows[0] ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-4">
      <SectionCard
        title="Query Console"
        action={
          <Badge variant="outline" className="text-xs">
            SELECT / WITH only · max 500 rows
          </Badge>
        }
      >
        <Textarea
          rows={5}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          className="font-mono text-xs"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || sql.trim().length === 0}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            Run query
          </Button>
          {rows.length > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadBlob(
                    rowsToCsv(columns, rows),
                    "text/csv;charset=utf-8",
                    `query-${Date.now()}.csv`,
                  )
                }
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> CSV
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadBlob(
                    JSON.stringify(rows, null, 2),
                    "application/json",
                    `query-${Date.now()}.json`,
                  )
                }
              >
                <FileJson className="mr-2 h-4 w-4" /> JSON
              </Button>
            </>
          )}
          <span className="text-xs text-muted-foreground">
            {rows.length > 0 ? `${rows.length} rows` : ""}
          </span>
        </div>
        {mutation.error ? (
          <p className="mt-3 text-sm text-rose-300">{(mutation.error as Error).message}</p>
        ) : null}
      </SectionCard>

      {rows.length > 0 && (
        <SectionCard title="Results">
          <div className="max-h-[55vh] overflow-auto rounded-lg border border-border/60">
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 bg-card/95">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="whitespace-nowrap border-b border-border/60 px-2 py-2 text-left font-mono text-[10px] uppercase text-muted-foreground"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={idx} className="border-b border-border/40">
                    {columns.map((c) => (
                      <td key={c} className="whitespace-nowrap px-2 py-1.5 font-mono">
                        {formatCell(r[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {historyRef.current.length > 0 && (
        <SectionCard title="History">
          <ul className="space-y-1 text-xs font-mono">
            {historyRef.current.map((q, i) => (
              <li key={i}>
                <button
                  className="w-full truncate rounded-md border border-border/60 px-2 py-1 text-left hover:bg-card/70"
                  onClick={() => setSql(q)}
                >
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
