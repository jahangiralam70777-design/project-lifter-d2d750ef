// @ts-nocheck
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Activity, Smartphone, Calendar, Clock } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { adminUserAnalyticsMetric } from "@/lib/admin-user-analytics-service.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const metricEnum = z.enum(["active", "usage", "devices", "heatmap"]);
const rangeEnum = z.enum(["24h", "7d", "30d", "lifetime"]);

const searchSchema = z.object({
  metric: fallback(metricEnum, "active").default("active"),
  range: fallback(rangeEnum, "7d").default("7d"),
});

export const Route = createFileRoute("/admin/users/analytics")({
  validateSearch: zodValidator(searchSchema),
  component: AdminUserAnalyticsPage,
  head: () => ({
    meta: [
      { title: "User Analytics · CA Aspire BD Admin" },
      {
        name: "description",
        content: "Drill into live user activity, device, heatmap and usage analytics.",
      },
    ],
  }),
});

const COLORS = ["#a855f7", "#22d3ee", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];

function AdminUserAnalyticsPage() {
  const { metric, range } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/users/analytics" });

  const fn = useServerFn(adminUserAnalyticsMetric);
  const { data, isFetching, error } = useQuery({
    queryKey: ["admin-user-analytics", metric, range],
    queryFn: () => fn({ data: { metric, range } }),
    placeholderData: keepPreviousData,
  });

  function setMetric(m: z.infer<typeof metricEnum>) {
    navigate({ search: (prev) => ({ ...prev, metric: m }) });
  }
  function setRange(r: z.infer<typeof rangeEnum>) {
    navigate({ search: (prev) => ({ ...prev, range: r }) });
  }

  const metricLabels: Record<string, string> = {
    active: "Active Users",
    usage: "Usage Time",
    devices: "Login by Device",
    heatmap: "Activity Heatmap",
  };

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <header className="glass shadow-card-soft rounded-2xl p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-2">
            <Link
              to="/admin/users"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" /> Back to User Management
            </Link>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              {metricLabels[metric]}
            </h1>
            <p className="text-xs text-muted-foreground">
              {isFetching ? "Loading live data…" : `Range: ${range}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-xl">
              Real-time · Supabase
            </Badge>
            <Link to="/admin/users/list">
              <Button size="sm" variant="outline" className="rounded-xl">
                View users
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Metric tabs */}
      <section className="glass shadow-card-soft flex flex-wrap items-center gap-2 rounded-2xl p-3">
        {(
          [
            ["active", "Active Users", Activity],
            ["usage", "Usage Time", Clock],
            ["devices", "Devices", Smartphone],
            ["heatmap", "Heatmap", Calendar],
          ] as const
        ).map(([k, l, Icon]) => (
          <button
            key={k}
            onClick={() => setMetric(k)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition ${
              metric === k
                ? "bg-gradient-to-r from-violet-600/30 to-fuchsia-500/20 text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {l}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {(["24h", "7d", "30d", "lifetime"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                range === r
                  ? "bg-violet-500/20 text-violet-200"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}

      {isFetching && !data && (
        <div className="glass shadow-card-soft flex h-64 items-center justify-center rounded-2xl text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading analytics…
        </div>
      )}

      {data && (data.metric === "active" || data.metric === "usage") && <SeriesView data={data} />}
      {data && data.metric === "devices" && <DevicesView data={data} />}
      {data && data.metric === "heatmap" && <HeatmapView data={data} />}
    </div>
  );
}

type AnyData = Awaited<ReturnType<typeof adminUserAnalyticsMetric>>;

function fmtDuration(s: number) {
  if (!s) return "0s";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function SeriesView({ data }: { data: Extract<AnyData, { metric: "active" | "usage" }> }) {
  const isUsage = data.metric === "usage";
  const chartData = data.series.map((s) => ({
    label: s.label,
    value: isUsage ? Math.round(s.usageSeconds / 60) : s.activeUsers,
    logins: s.logins,
  }));
  const empty = chartData.every((d) => d.value === 0);

  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Unique users"
          value={data.summary.uniqueUsers.toLocaleString()}
          sub={`in ${data.range}`}
        />
        <StatCard label="Total logins" value={data.summary.totalLogins.toLocaleString()} />
        <StatCard label="Total usage" value={fmtDuration(data.summary.totalUsageSeconds)} />
        <StatCard label="Avg / user" value={fmtDuration(data.summary.avgUsagePerUser)} />
      </section>

      <section className="glass shadow-card-soft rounded-2xl p-4">
        <h3 className="mb-3 font-display text-sm font-bold tracking-tight">
          {isUsage ? "Usage minutes over time" : "Active users over time"}
        </h3>
        {empty ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No activity recorded in this window.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a855f7" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="label" stroke="#71717a" fontSize={11} />
              <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "rgba(15,15,20,0.95)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#a855f7"
                strokeWidth={2}
                fill="url(#grad)"
                name={isUsage ? "minutes" : "active users"}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="glass shadow-card-soft rounded-2xl p-4">
        <h3 className="mb-3 font-display text-sm font-bold tracking-tight">Logins per bucket</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" stroke="#71717a" fontSize={11} />
            <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: "rgba(15,15,20,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                fontSize: 12,
              }}
            />
            <Line type="monotone" dataKey="logins" stroke="#22d3ee" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </>
  );
}

function DevicesView({ data }: { data: Extract<AnyData, { metric: "devices" }> }) {
  const empty = data.breakdown.length === 0;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Total logins"
          value={data.totalLogins.toLocaleString()}
          sub={`in ${data.range}`}
        />
        {data.breakdown.slice(0, 3).map((d) => (
          <StatCard
            key={d.label}
            label={d.label}
            value={`${d.percent}%`}
            sub={`${d.count.toLocaleString()} logins · ${d.uniqueUsers} users`}
          />
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="glass shadow-card-soft rounded-2xl p-4">
          <h3 className="mb-3 font-display text-sm font-bold tracking-tight">Device share</h3>
          {empty ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No device data recorded.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data.breakdown}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                >
                  {data.breakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "rgba(15,15,20,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="glass shadow-card-soft rounded-2xl p-4">
          <h3 className="mb-3 font-display text-sm font-bold tracking-tight">Device counts</h3>
          {empty ? (
            <p className="py-10 text-center text-xs text-muted-foreground">
              No device data recorded.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.breakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "rgba(15,15,20,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#a855f7" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>
    </>
  );
}

function HeatmapView({ data }: { data: Extract<AnyData, { metric: "heatmap" }> }) {
  const dayLabels = Array.from({ length: data.days }, (_, i) => {
    const d = new Date(Date.now() - (data.days - 1 - i) * 86_400_000);
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
  });
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          label="Total logins"
          value={data.total.toLocaleString()}
          sub={`last ${data.days} days`}
        />
        <StatCard label="Peak hour count" value={data.max.toLocaleString()} />
        <StatCard label="Time buckets" value={`${data.days} × 24h`} />
      </section>

      <section className="glass shadow-card-soft overflow-x-auto rounded-2xl p-4">
        <h3 className="mb-3 font-display text-sm font-bold tracking-tight">
          Hourly login intensity
        </h3>
        {data.total === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">
            No login activity recorded in this window.
          </p>
        ) : (
          <div className="inline-block min-w-full">
            <div className="flex gap-1 pl-16 text-[9px] text-muted-foreground">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="w-5 text-center">
                  {h}
                </div>
              ))}
            </div>
            {Array.from({ length: data.days }, (_, day) => (
              <div key={day} className="flex items-center gap-1">
                <div className="w-16 truncate text-[10px] text-muted-foreground">
                  {dayLabels[day]}
                </div>
                {Array.from({ length: 24 }, (_, h) => {
                  const v = data.cells[day * 24 + h] ?? 0;
                  const intensity = data.max > 0 ? Math.max(0.06, v / data.max) : 0.06;
                  return (
                    <div
                      key={h}
                      title={`${v} login(s)`}
                      className="h-5 w-5 rounded-sm"
                      style={{ background: `rgba(168, 85, 247, ${intensity.toFixed(2)})` }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}