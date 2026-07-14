import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Search,
  Download,
  CheckCircle2,
  ArrowLeft,
  ExternalLink,
  Activity,
  FileSpreadsheet,
  FileText,
  ChevronDown,
  PlayCircle,
  Trophy,
  Pencil,
  Plus,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  RadialBarChart,
  RadialBar,
} from "recharts";
// Heavy export libs (xlsx, jspdf, jspdf-autotable) are loaded on demand inside exportXlsx/exportPdf
// to keep them out of the initial admin bundle.
import { supabase } from "@/integrations/supabase/client";
import {
  adminListMocks,
  adminListLiveMocks,
  adminMockBreakdowns,
  adminMockAttemptsOverview,
  adminMockDetail,
  adminMockActivity,
} from "@/lib/admin-mock.functions";

export type MockCardKey =
  | "total"
  | "published"
  | "drafts"
  | "scheduled"
  | "live"
  | "archived"
  | "attempts"
  | "completion"
  | "avgQuestions"
  | "topStatus"
  | "liveMocks";

const TITLES: Record<MockCardKey, { title: string; description: string }> = {
  total: {
    title: "All mock tests",
    description: "Every mock in the library with search and quick actions.",
  },
  published: {
    title: "Published mocks",
    description: "Currently live in the catalog with publish dates.",
  },
  drafts: { title: "Draft mocks", description: "In-progress mocks awaiting review or publish." },
  scheduled: { title: "Scheduled mocks", description: "Mocks with an upcoming start window." },
  live: { title: "Live now", description: "Published mocks inside their active window." },
  archived: { title: "Archived mocks", description: "Retired mocks — restore or audit history." },
  attempts: { title: "Attempts overview", description: "Real attempts pulled from exam_attempts." },
  completion: { title: "Completion rate", description: "Completed vs. abandoned mock attempts." },
  avgQuestions: {
    title: "Question distribution",
    description: "How many questions each mock carries.",
  },
  topStatus: { title: "Status breakdown", description: "Library composition by publish status." },
  liveMocks: { title: "Live mocks", description: "Active mocks running right now." },
};

type Row = {
  id: string;
  title: string;
  status: string;
  level: string;
  total_questions: number;
  duration_seconds: number;
  starts_at: string | null;
  ends_at: string | null;
  updated_at: string;
};

const CHART_COLORS = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b", "#f43f5e", "#06b6d4"];

function statusTone(s: string) {
  if (s === "published") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
  if (s === "draft") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  if (s === "archived") return "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
  return "bg-muted text-foreground";
}

function exportCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const csv = [header, ...rows]
    .map((line) => line.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
async function exportXlsx(filename: string, header: string[], rows: (string | number)[][]) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}
async function exportPdf(filename: string, title: string, header: string[], rows: (string | number)[][]) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const doc = new jsPDF({ orientation: header.length > 5 ? "landscape" : "portrait" });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(9);
  doc.text(new Date().toLocaleString(), 14, 22);
  autoTable(doc, {
    head: [header],
    body: rows.map((r) => r.map((c) => String(c))),
    startY: 28,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [139, 92, 246] },
  });
  doc.save(filename);
}

function ExportMenu({
  baseName,
  title,
  header,
  rows,
}: {
  baseName: string;
  title: string;
  header: string[];
  rows: (string | number)[][];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => exportCsv(`${baseName}.csv`, header, rows)}>
          <FileText className="h-4 w-4" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportXlsx(`${baseName}.xlsx`, header, rows)}>
          <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => exportPdf(`${baseName}.pdf`, title, header, rows)}>
          <FileText className="h-4 w-4" /> PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function fmtMins(seconds: number) {
  if (!seconds) return "—";
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

/** Realtime subscription scoped to the drawer; invalidates supplied query keys. */
function useMockRealtimePulse(enabled: boolean, invalidateKeys: string[]) {
  const qc = useQueryClient();
  const [pulse, setPulse] = useState(0);
  const keysRef = useRef(invalidateKeys);
  keysRef.current = invalidateKeys;
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(`mock-drawer-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes" as never, { event: "*", schema: "public", table: "quizzes" }, () => {
        setPulse(Date.now());
        for (const k of keysRef.current) qc.invalidateQueries({ queryKey: [k] });
      })
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: "exam_attempts" },
        () => {
          setPulse(Date.now());
          for (const k of keysRef.current) qc.invalidateQueries({ queryKey: [k] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [enabled, qc]);
  return pulse;
}

function LivePulse({ pulse, label = "Live" }: { pulse: number; label?: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  const age = pulse ? Math.max(0, Math.round((Date.now() - pulse) / 1000)) : null;
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] text-emerald-400">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {label} {age != null ? `· ${age}s ago` : "· waiting"}
    </div>
  );
}

function ActivityFeed({ quizId }: { quizId?: string }) {
  const fn = useServerFn(adminMockActivity);
  const { data, isLoading } = useQuery({
    queryKey: ["mock-activity", quizId ?? "all"],
    queryFn: () => fn({ data: { quizId, limit: 50 } }),
    refetchInterval: 20_000,
  });
  const events = data?.events ?? [];
  const iconFor = (k: string) =>
    k === "completed" ? (
      <Trophy className="h-3.5 w-3.5 text-emerald-400" />
    ) : k === "started" ? (
      <PlayCircle className="h-3.5 w-3.5 text-blue-400" />
    ) : k === "created" ? (
      <Plus className="h-3.5 w-3.5 text-violet-400" />
    ) : (
      <Pencil className="h-3.5 w-3.5 text-amber-400" />
    );
  return (
    <div className="rounded-xl border border-white/10 bg-background/40">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Activity className="h-4 w-4" /> Activity feed
        </p>
        <ExportMenu
          baseName={`mock-activity-${quizId ?? "all"}`}
          title="Mock test activity"
          header={["Time", "Event", "Actor", "Target", "Details"]}
          rows={events.map((e) => [
            new Date(e.at).toLocaleString(),
            e.kind,
            e.actor,
            e.target,
            e.meta,
          ])}
        />
      </div>
      {isLoading ? (
        <LoadingRow />
      ) : events.length === 0 ? (
        <Empty message="No activity recorded yet." />
      ) : (
        <ul className="max-h-[320px] divide-y divide-white/5 overflow-y-auto">
          {events.map((e, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-2 text-xs">
              <span className="mt-1">{iconFor(e.kind)}</span>
              <div className="flex-1 min-w-0">
                <p className="truncate">
                  <span className="font-medium text-foreground">{e.actor}</span>{" "}
                  <span className="text-muted-foreground">{e.kind}</span>{" "}
                  <span className="truncate">{e.target}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(e.at).toLocaleString()} · {e.meta}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MockCardDrawer({
  cardKey,
  open,
  onClose,
}: {
  cardKey: MockCardKey | null;
  open: boolean;
  onClose: () => void;
}) {
  const [drilledMockId, setDrilledMockId] = useState<string | null>(null);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && (setDrilledMockId(null), onClose())}>
      <SheetContent side="right" className="w-full overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
        {cardKey &&
          (drilledMockId ? (
            <MockDetailView quizId={drilledMockId} onBack={() => setDrilledMockId(null)} />
          ) : (
            <DrawerBody cardKey={cardKey} onDrillMock={setDrilledMockId} />
          ))}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  cardKey,
  onDrillMock,
}: {
  cardKey: MockCardKey;
  onDrillMock: (id: string) => void;
}) {
  const meta = TITLES[cardKey];
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-white/10 px-6 py-4">
        <SheetTitle className="font-display text-xl">{meta.title}</SheetTitle>
        <SheetDescription>{meta.description}</SheetDescription>
      </SheetHeader>
      <ScrollArea className="flex-1">
        <div className="px-6 py-4">
          {cardKey === "total" && <MockListView preset={{}} onDrillMock={onDrillMock} />}
          {cardKey === "published" && (
            <MockListView preset={{ status: "published" }} onDrillMock={onDrillMock} />
          )}
          {cardKey === "drafts" && (
            <MockListView preset={{ status: "draft" }} onDrillMock={onDrillMock} />
          )}
          {cardKey === "scheduled" && (
            <MockListView preset={{ date: "upcoming" }} onDrillMock={onDrillMock} />
          )}
          {cardKey === "archived" && (
            <MockListView preset={{ status: "archived" }} onDrillMock={onDrillMock} />
          )}
          {cardKey === "live" && <LiveMocksView onDrillMock={onDrillMock} />}
          {cardKey === "liveMocks" && <LiveMocksView onDrillMock={onDrillMock} />}
          {cardKey === "attempts" && <AttemptsView onDrillMock={onDrillMock} />}
          {cardKey === "completion" && (
            <AttemptsView focus="completion" onDrillMock={onDrillMock} />
          )}
          {cardKey === "avgQuestions" && (
            <BreakdownView focus="questions" onDrillMock={onDrillMock} />
          )}
          {cardKey === "topStatus" && <BreakdownView focus="status" onDrillMock={onDrillMock} />}
        </div>
      </ScrollArea>
    </div>
  );
}

type Preset = {
  status?: "published" | "draft" | "archived";
  date?: "all" | "scheduled" | "unscheduled" | "upcoming" | "expired";
};

function MockListView({
  preset,
  onDrillMock,
}: {
  preset: Preset;
  onDrillMock: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const listFn = useServerFn(adminListMocks);
  const { data, isLoading } = useQuery({
    queryKey: ["mock-card-list", preset, search],
    queryFn: () =>
      listFn({
        data: { ...preset, search: search || undefined, pageSize: 50, page: 1 },
      }),
  });
  const rows = (data?.rows ?? []) as Row[];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mocks..."
            className="h-9 pl-9"
          />
        </div>
        <Badge variant="secondary">{data?.count ?? 0} total</Badge>
        <ExportMenu
          baseName={`mocks-${preset.status ?? preset.date ?? "all"}`}
          title={`Mocks · ${preset.status ?? preset.date ?? "all"}`}
          header={[
            "Title",
            "Status",
            "Level",
            "Questions",
            "Duration (min)",
            "Starts",
            "Ends",
            "Updated",
          ]}
          rows={rows.map((r) => [
            r.title,
            r.status,
            r.level,
            r.total_questions,
            Math.round(r.duration_seconds / 60),
            r.starts_at ?? "",
            r.ends_at ?? "",
            r.updated_at,
          ])}
        />
      </div>
      <MockTable rows={rows} isLoading={isLoading} onRowClick={onDrillMock} />
      <ActivityFeed />
    </div>
  );
}

function MockTable({
  rows,
  isLoading,
  onRowClick,
}: {
  rows: Row[];
  isLoading: boolean;
  onRowClick?: (id: string) => void;
}) {
  if (isLoading) return <LoadingRow />;
  if (!rows.length) return <Empty message="No mocks match this view yet." />;
  return (
    <div className="overflow-hidden rounded-xl border border-white/10">
      <Table className="min-w-[640px]">
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Qs</TableHead>
            <TableHead className="text-right">Min</TableHead>
            <TableHead>Window</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow
              key={r.id}
              onClick={() => onRowClick?.(r.id)}
              className={onRowClick ? "cursor-pointer hover:bg-white/[0.03]" : undefined}
            >
              <TableCell className="max-w-[220px] truncate font-medium">
                <div className="flex items-center gap-2">
                  {r.title}
                  {onRowClick && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                </div>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={statusTone(r.status)}>
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.total_questions}</TableCell>
              <TableCell className="text-right tabular-nums">
                {Math.round(r.duration_seconds / 60)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {r.starts_at ? new Date(r.starts_at).toLocaleString() : "—"}
                {r.ends_at ? ` → ${new Date(r.ends_at).toLocaleString()}` : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LiveMocksView({ onDrillMock }: { onDrillMock: (id: string) => void }) {
  const fn = useServerFn(adminListLiveMocks);
  const { data, isLoading } = useQuery({
    queryKey: ["mock-card-live"],
    queryFn: () => fn({ data: { limit: 100 } }),
    refetchInterval: 15_000,
  });
  const pulse = useMockRealtimePulse(true, ["mock-card-live", "mock-activity"]);
  const rows = (data?.rows ?? []) as Row[];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <LivePulse pulse={pulse} label={`${rows.length} live now`} />
        <ExportMenu
          baseName="mocks-live-now"
          title="Live mocks"
          header={["Title", "Status", "Level", "Questions", "Duration (min)", "Starts", "Ends"]}
          rows={rows.map((r) => [
            r.title,
            r.status,
            r.level,
            r.total_questions,
            Math.round(r.duration_seconds / 60),
            r.starts_at ?? "",
            r.ends_at ?? "",
          ])}
        />
      </div>
      <MockTable rows={rows} isLoading={isLoading} onRowClick={onDrillMock} />
      <ActivityFeed />
    </div>
  );
}

function RangeTabs({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-background/40 p-0.5 text-xs">
      {[7, 30, 90].map((d) => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-3 py-1 rounded-lg transition ${value === d ? "bg-[var(--neon-purple)]/20 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

function AttemptsView({
  focus,
  onDrillMock,
}: {
  focus?: "completion";
  onDrillMock: (id: string) => void;
}) {
  const [rangeDays, setRangeDays] = useState(30);
  const fn = useServerFn(adminMockAttemptsOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["mock-card-attempts", rangeDays],
    queryFn: () => fn({ data: { rangeDays } }),
  });
  const pulse = useMockRealtimePulse(true, ["mock-card-attempts", "mock-activity"]);
  if (isLoading || !data) return <LoadingRow />;

  const completionPieData = [
    { name: "Completed", value: data.completed },
    { name: "Abandoned", value: data.abandoned },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RangeTabs value={rangeDays} onChange={setRangeDays} />
          <LivePulse pulse={pulse} />
        </div>
        <ExportMenu
          baseName={`mock-attempts-${rangeDays}d`}
          title={`Mock attempts · last ${rangeDays} days`}
          header={["Day", "Attempts", "Completed", "Avg Score"]}
          rows={data.daily.map((d) => [d.day, d.count, d.completed, d.avgScore])}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Total attempts" value={data.totalAttempts} />
        <Stat label="Completed" value={data.completed} accent="emerald" />
        <Stat label="Avg score" value={data.avgScore} suffix="%" />
        <Stat label="Avg time" value={Math.round(data.avgDurationSeconds / 60)} suffix="m" />
      </div>

      {focus !== "completion" ? (
        <ChartCard title={`Attempts — last ${rangeDays} days`}>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={data.daily}>
              <defs>
                <linearGradient id="atGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                hide={data.daily.length > 30}
              />
              <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
              <Tooltip
                contentStyle={{
                  background: "#0b1020",
                  border: "1px solid #ffffff20",
                  borderRadius: 8,
                }}
              />
              <Area type="monotone" dataKey="count" stroke="#8b5cf6" fill="url(#atGrad)" />
              <Area type="monotone" dataKey="completed" stroke="#10b981" fill="transparent" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      ) : (
        <ChartCard title="Completion split">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={completionPieData}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {completionPieData.map((_e, i) => (
                  <Cell key={i} fill={i === 0 ? "#10b981" : "#f43f5e"} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#0b1020",
                  border: "1px solid #ffffff20",
                  borderRadius: 8,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <ChartCard title="Score distribution">
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data.scoreHistogram}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
            <Tooltip
              contentStyle={{
                background: "#0b1020",
                border: "1px solid #ffffff20",
                borderRadius: 8,
              }}
            />
            <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div>
        <p className="mb-2 text-xs font-semibold text-muted-foreground">
          Top mocks by attempts — click to drill in
        </p>
        {data.topMocks.length === 0 ? (
          <Empty message="No attempts yet." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Avg score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topMocks.map((m, i) => (
                  <TableRow
                    key={(m.id ?? "noid") + i}
                    onClick={() => m.id && onDrillMock(m.id)}
                    className={m.id ? "cursor-pointer hover:bg-white/[0.03]" : "opacity-60"}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {m.title}
                        {m.id && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.attempts}</TableCell>
                    <TableCell className="text-right tabular-nums">{m.avgScore}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <ActivityFeed />
    </div>
  );
}

function BreakdownView({
  focus,
  onDrillMock,
}: {
  focus: "status" | "questions";
  onDrillMock: (id: string) => void;
}) {
  const fn = useServerFn(adminMockBreakdowns);
  const { data, isLoading } = useQuery({
    queryKey: ["mock-card-breakdowns"],
    queryFn: () => fn({ data: undefined }),
  });
  if (isLoading || !data) return <LoadingRow />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total mocks" value={data.totalMocks} />
        <Stat label="Total questions" value={data.totalQuestions} />
        <Stat label="Avg per mock" value={data.avgQuestions} />
      </div>

      {focus === "status" ? (
        <>
          <ChartCard title="By status">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data.byStatus}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={48}
                  outerRadius={80}
                >
                  {data.byStatus.map((_e, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0b1020",
                    border: "1px solid #ffffff20",
                    borderRadius: 8,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="By level">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.byLevel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0b1020",
                    border: "1px solid #ffffff20",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="By difficulty">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={data.byDifficulty}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip
                  contentStyle={{
                    background: "#0b1020",
                    border: "1px solid #ffffff20",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </>
      ) : (
        <>
          <ChartCard title="Questions per mock — bucket distribution">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.questionBuckets}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Tooltip
                  contentStyle={{
                    background: "#0b1020",
                    border: "1px solid #ffffff20",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="By difficulty">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={data.byDifficulty}
                  dataKey="count"
                  nameKey="label"
                  innerRadius={42}
                  outerRadius={72}
                >
                  {data.byDifficulty.map((_e, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0b1020",
                    border: "1px solid #ffffff20",
                    borderRadius: 8,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Largest mocks — click to open
            </p>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Questions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.largest.map((r) => (
                    <TableRow
                      key={r.id}
                      onClick={() => onDrillMock(r.id)}
                      className="cursor-pointer hover:bg-white/[0.03]"
                    >
                      <TableCell className="max-w-[260px] truncate font-medium">
                        <div className="flex items-center gap-2">
                          {r.title}
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusTone(r.status)}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.total_questions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}
      <ActivityFeed />
    </div>
  );
}

/* ============================================================
 * Per-mock detail view (used by drill-in from any list/chart)
 * ============================================================ */

function MockDetailView({ quizId, onBack }: { quizId: string; onBack: () => void }) {
  const [rangeDays, setRangeDays] = useState(30);
  const fn = useServerFn(adminMockDetail);
  const { data, isLoading } = useQuery({
    queryKey: ["mock-detail", quizId, rangeDays],
    queryFn: () => fn({ data: { quizId, rangeDays } }),
  });
  const pulse = useMockRealtimePulse(true, ["mock-detail", "mock-activity"]);

  const mock = data?.mock as Row | undefined;
  const completionGauge = useMemo(() => {
    if (!data) return [];
    return [{ name: "completion", value: data.stats.completionRate, fill: "#10b981" }];
  }, [data]);

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} className="h-7 px-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <SheetTitle className="font-display text-xl flex-1 truncate">
            {mock?.title ?? "Mock detail"}
          </SheetTitle>
          {mock && (
            <Badge variant="outline" className={statusTone(mock.status)}>
              {mock.status}
            </Badge>
          )}
        </div>
        <SheetDescription>Real-time analytics for this mock from exam_attempts.</SheetDescription>
      </SheetHeader>
      <ScrollArea className="flex-1">
        <div className="space-y-4 px-6 py-4">
          {isLoading || !data ? (
            <LoadingRow />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RangeTabs value={rangeDays} onChange={setRangeDays} />
                  <LivePulse pulse={pulse} />
                </div>
                <ExportMenu
                  baseName={`mock-${quizId}-${rangeDays}d`}
                  title={mock?.title ? `${mock.title} · ${rangeDays}d` : "Mock detail"}
                  header={["Day", "Attempts", "Completed", "Avg Score"]}
                  rows={data.daily.map((d) => [d.day, d.count, d.completed, d.avgScore])}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Attempts" value={data.stats.totalAttempts} />
                <Stat label="Completed" value={data.stats.completed} accent="emerald" />
                <Stat label="Avg score" value={data.stats.avgScore} suffix="%" />
                <Stat
                  label="Avg time"
                  value={Math.round(data.stats.avgDurationSeconds / 60)}
                  suffix="m"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <ChartCard title="Completion rate">
                  <ResponsiveContainer width="100%" height={180}>
                    <RadialBarChart
                      innerRadius="60%"
                      outerRadius="100%"
                      data={completionGauge}
                      startAngle={90}
                      endAngle={-270}
                    >
                      <RadialBar background dataKey="value" cornerRadius={10} />
                      <Tooltip
                        contentStyle={{
                          background: "#0b1020",
                          border: "1px solid #ffffff20",
                          borderRadius: 8,
                        }}
                      />
                    </RadialBarChart>
                  </ResponsiveContainer>
                  <p className="text-center font-display text-xl font-bold -mt-10">
                    {data.stats.completionRate}%
                  </p>
                </ChartCard>
                <ChartCard title="Score distribution">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={data.scoreHistogram}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Tooltip
                        contentStyle={{
                          background: "#0b1020",
                          border: "1px solid #ffffff20",
                          borderRadius: 8,
                        }}
                      />
                      <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              <ChartCard title={`Attempts & completions — last ${rangeDays} days`}>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      hide={data.daily.length > 30}
                    />
                    <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis
                      yAxisId="r"
                      orientation="right"
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0b1020",
                        border: "1px solid #ffffff20",
                        borderRadius: 8,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      yAxisId="l"
                      type="monotone"
                      dataKey="count"
                      stroke="#8b5cf6"
                      name="Attempts"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="l"
                      type="monotone"
                      dataKey="completed"
                      stroke="#10b981"
                      name="Completed"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      yAxisId="r"
                      type="monotone"
                      dataKey="avgScore"
                      stroke="#f59e0b"
                      name="Avg score"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">Top scorers</p>
                  {data.topScorers.length > 0 && (
                    <ExportMenu
                      baseName={`mock-${quizId}-top-scorers`}
                      title="Top scorers"
                      header={["User", "Best %", "Attempts", "Last"]}
                      rows={data.topScorers.map((u) => [
                        u.name,
                        u.score,
                        u.attempts,
                        u.lastAt ?? "",
                      ])}
                    />
                  )}
                </div>
                {data.topScorers.length === 0 ? (
                  <Empty message="No scorers yet." />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead className="text-right">Best %</TableHead>
                          <TableHead className="text-right">Attempts</TableHead>
                          <TableHead>Last</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.topScorers.map((u) => (
                          <TableRow key={u.user_id}>
                            <TableCell className="font-medium">{u.name}</TableCell>
                            <TableCell className="text-right tabular-nums">{u.score}%</TableCell>
                            <TableCell className="text-right tabular-nums">{u.attempts}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {u.lastAt ? new Date(u.lastAt).toLocaleString() : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">Recent attempts</p>
                  {data.recent.length > 0 && (
                    <ExportMenu
                      baseName={`mock-${quizId}-recent-attempts`}
                      title="Recent attempts"
                      header={["User", "Status", "Score", "Duration (s)", "Started", "Completed"]}
                      rows={data.recent.map((r) => [
                        r.userName,
                        r.status,
                        r.score ?? "",
                        r.duration_seconds,
                        r.started_at ?? "",
                        r.completed_at ?? "",
                      ])}
                    />
                  )}
                </div>
                {data.recent.length === 0 ? (
                  <Empty message="No attempts yet." />
                ) : (
                  <div className="overflow-hidden rounded-xl border border-white/10">
                    <Table className="min-w-[640px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                          <TableHead className="text-right">Time</TableHead>
                          <TableHead>Started</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.recent.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.userName}</TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={statusTone(
                                  r.status === "completed" ? "published" : "draft",
                                )}
                              >
                                {r.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.score ?? "—"}
                              {r.score != null ? "%" : ""}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {fmtMins(r.duration_seconds)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.started_at ? new Date(r.started_at).toLocaleString() : "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <ActivityFeed quizId={quizId} />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-background/40 p-4">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  suffix,
}: {
  label: string;
  value: number;
  accent?: "emerald" | "rose";
  suffix?: string;
}) {
  const tone = accent === "emerald" ? "text-emerald-400" : accent === "rose" ? "text-rose-400" : "";
  return (
    <div className="rounded-xl border border-white/10 bg-background/40 p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`font-display text-2xl font-bold ${tone}`}>
        {value.toLocaleString()}
        {suffix ?? ""}
      </p>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-6 text-sm text-muted-foreground">
      <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {message}
    </div>
  );
}
