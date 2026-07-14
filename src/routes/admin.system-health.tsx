import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  adminListSystemErrors,
  adminSystemHealthSummary,
  adminResolveSystemError,
  type SystemErrorRow,
} from "@/lib/admin-system-health.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CheckCheck,
  Download,
  Filter,
  RefreshCw,
  Route as RouteIcon,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/system-health")({
  component: SystemHealthPage,
  head: () => ({ meta: [{ title: "System Health · CA Aspire BD Admin" }] }),
});

type Severity = SystemErrorRow["severity"];
type Source = SystemErrorRow["source"];

const SYSTEM_HEALTH_SUMMARY_KEY = ["sys-health-summary"] as const;
const SYSTEM_HEALTH_LIST_KEY = ["sys-health-list"] as const;
const SYSTEM_HEALTH_REFETCH_MS = 10_000;

const SEVERITY_META: Record<
  Severity,
  { label: string; ring: string; chip: string; dot: string; text: string }
> = {
  critical: {
    label: "Critical",
    ring: "ring-rose-500/30",
    chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    dot: "bg-rose-500 shadow-[0_0_10px_var(--tw-shadow-color)] shadow-rose-500/70",
    text: "text-rose-400",
  },
  high: {
    label: "High",
    ring: "ring-orange-500/30",
    chip: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    dot: "bg-orange-500 shadow-[0_0_10px_var(--tw-shadow-color)] shadow-orange-500/70",
    text: "text-orange-400",
  },
  medium: {
    label: "Medium",
    ring: "ring-amber-500/30",
    chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    dot: "bg-amber-500 shadow-[0_0_10px_var(--tw-shadow-color)] shadow-amber-500/70",
    text: "text-amber-400",
  },
  low: {
    label: "Low",
    ring: "ring-sky-500/30",
    chip: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    dot: "bg-sky-500 shadow-[0_0_10px_var(--tw-shadow-color)] shadow-sky-500/70",
    text: "text-sky-400",
  },
};

const SOURCE_LABEL: Record<Source, string> = {
  frontend: "Frontend",
  backend: "Backend",
  db: "Database",
  network: "Network",
  unknown: "Unknown",
};

function toCsv(rows: SystemErrorRow[]): string {
  const cols = [
    "id",
    "severity",
    "source",
    "message",
    "route",
    "occurrence_count",
    "last_seen_at",
    "resolved",
  ] as const;
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    cols.join(","),
    ...rows.map((r) =>
      cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(","),
    ),
  ].join("\n");
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(1, Math.round(diff / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function SystemHealthPage() {
  const qc = useQueryClient();
  const list = useServerFn(adminListSystemErrors);
  const summary = useServerFn(adminSystemHealthSummary);
  const resolve = useServerFn(adminResolveSystemError);

  const [page, setPage] = useState(0);
  const [pageSize] = useState(50);
  const [severity, setSeverity] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [resolved, setResolved] = useState<string>("open");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<SystemErrorRow | null>(null);
  const [tick, setTick] = useState(0); // forces relativeTime re-render
  const [liveConnected, setLiveConnected] = useState(false);

  const filters = useMemo(
    () => ({
      page,
      pageSize,
      severity: (severity || undefined) as Severity | undefined,
      source: (source || undefined) as Source | undefined,
      resolved: resolved === "open" ? false : resolved === "resolved" ? true : undefined,
      q: q.trim() || undefined,
    }),
    [page, pageSize, severity, source, resolved, q],
  );

  const refetchSystemHealth = useCallback(() => {
    qc.invalidateQueries({ queryKey: SYSTEM_HEALTH_LIST_KEY });
    qc.invalidateQueries({ queryKey: SYSTEM_HEALTH_SUMMARY_KEY });
    return Promise.all([
      qc.refetchQueries({ queryKey: SYSTEM_HEALTH_LIST_KEY, type: "active" }),
      qc.refetchQueries({ queryKey: SYSTEM_HEALTH_SUMMARY_KEY, type: "active" }),
    ]);
  }, [qc]);

  const summaryQ = useQuery({
    queryKey: SYSTEM_HEALTH_SUMMARY_KEY,
    queryFn: () => summary(),
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: SYSTEM_HEALTH_REFETCH_MS,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: 1,
  });
  const listQ = useQuery({
    queryKey: [...SYSTEM_HEALTH_LIST_KEY, filters],
    queryFn: () => list({ data: filters }),
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: SYSTEM_HEALTH_REFETCH_MS,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    retry: 1,
  });

  // Re-render relative timestamps every 30s.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Real-time: subscribe to system_error_logs so resolved issues vanish
  // instantly and new incidents surface without waiting for the next poll.
  useEffect(() => {
    const channel = supabase
      .channel("sys-health-rt")
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "system_error_logs" },
        () => {
          void refetchSystemHealth();
        },
      )
      .subscribe((status: string) => {
        setLiveConnected(status === "SUBSCRIBED");
      });
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    };
  }, [refetchSystemHealth]);

  useEffect(() => {
    if (!selected || !listQ.data?.rows) return;
    const fresh = listQ.data.rows.find((row) => row.id === selected.id);
    if (!fresh) {
      setSelected(null);
      return;
    }
    if (fresh !== selected) {
      setSelected(fresh);
    }
  }, [listQ.data?.rows, selected]);

  const resolveM = useMutation({
    mutationFn: (vars: { id: string; resolved: boolean }) => resolve({ data: vars }),
    onMutate: (vars) => {
      // Optimistic update on the list cache so the UI snaps instantly.
      const key = [...SYSTEM_HEALTH_LIST_KEY, filters] as const;
      const prev = qc.getQueryData<{ rows: SystemErrorRow[]; total: number }>(key);
      if (prev) {
        const nextRows = prev.rows.map((r) =>
          r.id === vars.id
            ? {
                ...r,
                resolved: vars.resolved,
                resolved_at: vars.resolved ? new Date().toISOString() : null,
              }
            : r,
        );
        const rows =
          typeof filters.resolved === "boolean"
            ? nextRows.filter((r) => r.resolved === filters.resolved)
            : nextRows;
        qc.setQueryData(key, {
          ...prev,
          rows,
          total: Math.max(0, prev.total - (prev.rows.length - rows.length)),
        });
      }
      return { prev, key };
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.resolved ? "Issue resolved" : "Issue reopened");
      void refetchSystemHealth();
      setSelected(null);
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev && ctx.key) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(e.message);
    },
  });

  const exportCsv = () => {
    if (!listQ.data?.rows.length) return;
    const blob = new Blob([toCsv(listQ.data.rows)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `system-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const s = summaryQ.data;

  // Severity mix derived from current page (real rows).
  const severityCounts = useMemo(() => {
    const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const r of listQ.data?.rows ?? []) c[r.severity] += 1;
    return c;
  }, [listQ.data?.rows]);
  const totalOnPage = (listQ.data?.rows.length ?? 0) || 1;

  const refreshing = listQ.isFetching || summaryQ.isFetching;
  const total = listQ.data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : page * pageSize + 1;
  const showingTo = Math.min(total, (page + 1) * pageSize);

  const hasActiveFilters = !!(severity || source || q || resolved !== "open");
  const clearFilters = () => {
    setSeverity("");
    setSource("");
    setQ("");
    setResolved("open");
    setPage(0);
  };

  // Hero status palette
  const status = s?.status ?? null;
  const StatusIcon =
    status === "healthy" ? ShieldCheck : status === "degraded" ? ShieldAlert : AlertTriangle;
  const statusTone =
    status === "healthy"
      ? {
          grad: "from-emerald-500/25 via-emerald-400/10 to-transparent",
          ring: "ring-emerald-500/30",
          text: "text-emerald-400",
          chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
          dot: "bg-emerald-500",
          headline: "All systems operational",
        }
      : status === "degraded"
        ? {
            grad: "from-rose-500/25 via-rose-400/10 to-transparent",
            ring: "ring-rose-500/40",
            text: "text-rose-400",
            chip: "bg-rose-500/15 text-rose-300 border-rose-500/30",
            dot: "bg-rose-500",
            headline: "Degraded performance",
          }
        : status === "warning"
          ? {
              grad: "from-amber-500/25 via-amber-400/10 to-transparent",
              ring: "ring-amber-500/30",
              text: "text-amber-400",
              chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
              dot: "bg-amber-500",
              headline: "Minor incidents reported",
            }
          : {
              grad: "from-amber-500/25 via-amber-400/10 to-transparent",
              ring: "ring-amber-500/30",
              text: "text-amber-400",
              chip: "bg-amber-500/15 text-amber-300 border-amber-500/30",
              dot: "bg-amber-500",
              headline: "Telemetry unavailable",
            };

  // Hide tick from lint as a no-op dependency.
  void tick;

  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-6">
      {/* ============ HEADER ============ */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">
            <Link to="/admin" className="hover:text-foreground hover:underline">
              Admin
            </Link>{" "}
            <span className="px-1 opacity-50">/</span> System Health
          </p>
          <h1 className="font-display mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            System Health & Incidents
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live monitoring of platform errors, severity trends and affected routes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "hidden items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] sm:flex",
              liveConnected
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300",
            )}
            title={
              liveConnected ? "Realtime channel connected" : "Realtime offline · polling every 10s"
            }
          >
            <span className="relative flex h-2 w-2">
              {liveConnected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              )}
              <span
                className={cn(
                  "relative inline-flex h-2 w-2 rounded-full",
                  liveConnected ? "bg-emerald-500" : "bg-amber-500",
                )}
              />
            </span>
            {liveConnected ? "Live · realtime" : "Polling · 10s"}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchSystemHealth();
            }}
            disabled={refreshing}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!listQ.data?.rows.length}
          >
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
        </div>
      </header>

      {/* ============ UNREACHABLE BANNER ============ */}
      {(summaryQ.isError || listQ.isError) && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-rose-100">Telemetry service unreachable</p>
            <p className="mt-0.5 text-xs text-rose-300/80" style={{ overflowWrap: "anywhere" }}>
              {(summaryQ.error as Error | null)?.message ||
                (listQ.error as Error | null)?.message ||
                "Could not fetch system health data. Retrying automatically."}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-rose-500/40 text-rose-100 hover:bg-rose-500/20"
            onClick={() => {
              void refetchSystemHealth();
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      )}

      {/* ============ HERO STATUS ============ */}
      <section
        className={cn(
          "relative overflow-hidden rounded-3xl border border-border/60 bg-card/40 p-6 ring-1 backdrop-blur",
          statusTone.ring,
        )}
      >
        <div
          className={cn(
            "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80",
            statusTone.grad,
          )}
        />
        <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-foreground/[0.04] blur-3xl" />

        <div className="relative grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex items-start gap-4">
            <div
              className={cn(
                "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-background/60 ring-1 backdrop-blur",
                statusTone.ring,
              )}
            >
              <StatusIcon className={cn("h-7 w-7", statusTone.text)} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("uppercase tracking-wider", statusTone.chip)}
                >
                  <span
                    className={cn("mr-1.5 inline-block h-1.5 w-1.5 rounded-full", statusTone.dot)}
                  />
                  {status ?? "—"}
                </Badge>
                <span className="text-[11px] text-muted-foreground">
                  Updated{" "}
                  {summaryQ.dataUpdatedAt
                    ? relativeTime(new Date(summaryQ.dataUpdatedAt).toISOString())
                    : "—"}
                </span>
              </div>
              {summaryQ.isLoading ? (
                <Skeleton className="mt-3 h-8 w-72" />
              ) : (
                <h2 className="font-display mt-2 text-2xl font-bold leading-tight sm:text-3xl">
                  {statusTone.headline}
                </h2>
              )}
              <p className="mt-1 text-sm text-muted-foreground">
                {status === "healthy"
                  ? "No active incidents. Continuous error telemetry is streaming normally."
                  : status === "degraded"
                    ? "Critical errors detected in the last 24 hours — prioritise the queue below."
                    : "Open issues require attention. Triage and resolve from the list below."}
              </p>
            </div>
          </div>

          {/* Quick metrics */}
          <div className="grid grid-cols-3 gap-3">
            <MetricTile
              label="Open issues"
              value={summaryQ.isLoading ? null : (s?.openErrors ?? 0)}
              icon={<AlertOctagon className="h-4 w-4" />}
              tone="text-amber-400"
            />
            <MetricTile
              label="Critical · 24h"
              value={summaryQ.isLoading ? null : (s?.critical24h ?? 0)}
              icon={<ShieldAlert className="h-4 w-4" />}
              tone="text-rose-400"
              emphasise={(s?.critical24h ?? 0) > 0}
            />
            <MetricTile
              label="Affected routes"
              value={summaryQ.isLoading ? null : (s?.topRoutes.length ?? 0)}
              icon={<RouteIcon className="h-4 w-4" />}
              tone="text-sky-400"
            />
          </div>
        </div>
      </section>

      {/* ============ SECONDARY ROW: SEVERITY MIX + TOP ROUTES ============ */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* Severity distribution (from current view) */}
        <div className="glass-card rounded-2xl border border-border/60 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Severity mix</p>
              <h3 className="font-display mt-1 text-base font-bold">Current view breakdown</h3>
            </div>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>

          <div className="mt-4 space-y-3">
            {(["critical", "high", "medium", "low"] as Severity[]).map((sev) => {
              const meta = SEVERITY_META[sev];
              const count = severityCounts[sev];
              const pct = Math.round((count / totalOnPage) * 100);
              return (
                <div key={sev}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                      <span className="font-medium">{meta.label}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {count} <span className="opacity-50">· {pct}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/60">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700",
                        sev === "critical" && "bg-rose-500",
                        sev === "high" && "bg-orange-500",
                        sev === "medium" && "bg-amber-500",
                        sev === "low" && "bg-sky-500",
                      )}
                      style={{ width: `${count === 0 ? 0 : Math.max(4, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            Derived from {listQ.data?.rows.length ?? 0} issues on this page · live data.
          </p>
        </div>

        {/* Top affected routes */}
        <div className="glass-card rounded-2xl border border-border/60 p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Top affected routes
              </p>
              <h3 className="font-display mt-1 text-base font-bold">Where issues concentrate</h3>
            </div>
            <RouteIcon className="h-4 w-4 text-muted-foreground" />
          </div>

          {summaryQ.isLoading ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (s?.topRoutes ?? []).length === 0 ? (
            <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 py-8 text-center">
              <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              <p className="mt-2 text-sm font-medium">No routes reporting open issues.</p>
              <p className="text-xs text-muted-foreground">The system is quiet right now.</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border/40">
              {s!.topRoutes.slice(0, 6).map((r) => {
                const max = s!.topRoutes[0]?.count || 1;
                const pct = Math.round((r.count / max) * 100);
                return (
                  <li key={r.route} className="flex items-center gap-3 py-2">
                    <code className="min-w-0 flex-1 truncate rounded-md bg-muted/50 px-2 py-1 text-[11px]">
                      {r.route}
                    </code>
                    <div className="relative hidden h-1.5 w-32 overflow-hidden rounded-full bg-muted/60 sm:block">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400"
                        style={{ width: `${Math.max(6, pct)}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-xs tabular-nums">
                      {r.count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* ============ ISSUE QUEUE ============ */}
      <section className="glass-card rounded-2xl border border-border/60">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 border-b border-border/40 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold leading-tight">Issue queue</h3>
              <p className="text-[11px] text-muted-foreground">
                {total.toLocaleString()} total · showing {showingFrom}–{showingTo}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setPage(0);
                  setQ(e.target.value);
                }}
                placeholder="Search message…"
                className="h-9 w-full pl-8 sm:w-64"
              />
            </div>
            <Select
              value={severity || "all"}
              onValueChange={(v) => {
                setPage(0);
                setSeverity(v === "all" ? "" : v);
              }}
            >
              <SelectTrigger className="h-9 w-36">
                <Filter className="mr-1.5 h-3.5 w-3.5" />
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={source || "all"}
              onValueChange={(v) => {
                setPage(0);
                setSource(v === "all" ? "" : v);
              }}
            >
              <SelectTrigger className="h-9 w-36">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="frontend">Frontend</SelectItem>
                <SelectItem value="backend">Backend</SelectItem>
                <SelectItem value="db">Database</SelectItem>
                <SelectItem value="network">Network</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={resolved}
              onValueChange={(v) => {
                setPage(0);
                setResolved(v);
              }}
            >
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>

        {/* List */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/40">
                <th className="px-4 py-3 font-medium">Issue</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Route</th>
                <th className="px-4 py-3 text-right font-medium">Count</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-t border-border/30">
                    <td colSpan={6} className="px-4 py-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))
              ) : (listQ.data?.rows.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                        <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                      </div>
                      <p className="font-display mt-3 text-base font-bold">
                        {hasActiveFilters ? "No matches" : "The system is quiet"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {hasActiveFilters
                          ? "Try clearing filters to see more issues."
                          : "No errors reported with the current view. We'll surface new incidents here automatically."}
                      </p>
                      {hasActiveFilters && (
                        <Button size="sm" variant="outline" className="mt-4" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                listQ.data!.rows.map((r) => {
                  const meta = SEVERITY_META[r.severity];
                  return (
                    <tr
                      key={r.id}
                      className="group cursor-pointer border-t border-border/30 transition-colors hover:bg-accent/30"
                      onClick={() => setSelected(r)}
                    >
                      <td className="max-w-[28rem] px-4 py-3 align-top">
                        <div className="flex items-start gap-3">
                          <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", meta.dot)} />
                          <div className="min-w-0">
                            <p className="truncate font-medium leading-tight">{r.message}</p>
                            <div className="mt-1 flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn("h-5 px-1.5 py-0 text-[10px]", meta.chip)}
                              >
                                {meta.label}
                              </Badge>
                              {r.resolved && (
                                <Badge
                                  variant="outline"
                                  className="h-5 border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0 text-[10px] text-emerald-300"
                                >
                                  <CheckCheck className="mr-1 h-3 w-3" /> Resolved
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                        {SOURCE_LABEL[r.source]}
                      </td>
                      <td className="max-w-xs px-4 py-3 align-top">
                        {r.route ? (
                          <code className="truncate rounded bg-muted/50 px-1.5 py-0.5 text-[11px]">
                            {r.route}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right align-top font-mono text-xs tabular-nums">
                        {r.occurrence_count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                        {relativeTime(r.last_seen_at)}
                      </td>
                      <td
                        className="px-4 py-3 text-right align-top"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1.5 opacity-80 transition-opacity group-hover:opacity-100">
                          {r.resolved ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => resolveM.mutate({ id: r.id, resolved: false })}
                              disabled={resolveM.isPending}
                            >
                              Reopen
                            </Button>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                className="h-7 bg-emerald-500/90 text-xs text-white hover:bg-emerald-500"
                                onClick={() => resolveM.mutate({ id: r.id, resolved: true })}
                                disabled={resolveM.isPending}
                              >
                                <CheckCheck className="mr-1 h-3.5 w-3.5" /> Resolve
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => resolveM.mutate({ id: r.id, resolved: true })}
                                disabled={resolveM.isPending}
                                title="Dismiss (mark resolved)"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
          <span>
            {total === 0
              ? "0 results"
              : `Showing ${showingFrom}–${showingTo} of ${total.toLocaleString()}`}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Prev
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!listQ.data || (page + 1) * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </section>

      {/* ============ DETAIL DIALOG ============ */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-3xl flex-col overflow-hidden p-0 sm:w-full">
          <DialogHeader className="shrink-0 border-b border-border/40 px-6 pb-4 pt-6">
            <DialogTitle className="flex items-start gap-2 pr-6 text-base">
              {selected ? (
                <Badge
                  variant="outline"
                  className={cn("shrink-0", SEVERITY_META[selected.severity].chip)}
                >
                  {SEVERITY_META[selected.severity].label}
                </Badge>
              ) : null}
              <span
                className="min-w-0 flex-1 font-display"
                style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
              >
                {selected?.message}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs" style={{ overflowWrap: "anywhere" }}>
              {selected ? (
                <>
                  {SOURCE_LABEL[selected.source]} ·{" "}
                  {selected.route ? (
                    <code
                      className="inline-block max-w-full rounded bg-muted/60 px-1 py-0.5 align-bottom"
                      style={{ overflowWrap: "anywhere", wordBreak: "break-all" }}
                    >
                      {selected.route}
                    </code>
                  ) : (
                    "no route"
                  )}{" "}
                  · seen {selected.occurrence_count.toLocaleString()}× · last{" "}
                  {new Date(selected.last_seen_at).toLocaleString()}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4 text-sm">
                {selected.stack ? (
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Stack trace
                    </p>
                    <pre
                      className="max-h-64 max-w-full overflow-auto rounded-lg border border-border/40 bg-muted/40 p-3 text-[11px] leading-relaxed"
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {selected.stack}
                    </pre>
                  </div>
                ) : null}
                {selected.payload ? (
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Payload
                    </p>
                    <pre
                      className="max-h-48 max-w-full overflow-auto rounded-lg border border-border/40 bg-muted/40 p-3 text-[11px] leading-relaxed"
                      style={{
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {JSON.stringify(selected.payload, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border/40 px-6 py-3">
                <div
                  className="min-w-0 text-[11px] text-muted-foreground"
                  style={{ overflowWrap: "anywhere" }}
                >
                  Fingerprint:{" "}
                  <code className="rounded bg-muted/60 px-1 py-0.5 font-mono">
                    {selected.fingerprint.slice(0, 16)}
                  </code>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!selected.resolved && (
                    <Button
                      variant="outline"
                      onClick={() => resolveM.mutate({ id: selected.id, resolved: true })}
                      disabled={resolveM.isPending}
                    >
                      <Trash2 className="mr-2 h-4 w-4" /> Dismiss
                    </Button>
                  )}
                  <Button
                    className={cn(
                      !selected.resolved && "bg-emerald-500/90 text-white hover:bg-emerald-500",
                    )}
                    variant={selected.resolved ? "outline" : "default"}
                    onClick={() =>
                      resolveM.mutate({ id: selected.id, resolved: !selected.resolved })
                    }
                    disabled={resolveM.isPending}
                  >
                    {selected.resolved ? (
                      "Reopen issue"
                    ) : (
                      <>
                        <CheckCheck className="mr-2 h-4 w-4" /> Mark resolved
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricTile({
  label,
  value,
  icon,
  tone,
  emphasise,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  tone: string;
  emphasise?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 bg-background/50 p-4 backdrop-blur",
        emphasise && "ring-1 ring-rose-500/30",
      )}
    >
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[10px] font-medium uppercase tracking-wider">{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      {value === null ? (
        <Skeleton className="mt-2 h-7 w-12" />
      ) : (
        <p className="font-display mt-1.5 text-2xl font-bold tabular-nums">
          {value.toLocaleString()}
        </p>
      )}
    </div>
  );
}
