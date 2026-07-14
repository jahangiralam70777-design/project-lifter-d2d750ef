import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  Loader2,
  Send,
  EyeOff,
  Edit3,
  Archive,
  RotateCcw,
  Bot,
  TrendingUp,
  TrendingDown,
  Users,
  Trophy,
  Target,
  Gauge,
  PercentSquare,
  ListChecks,
  CalendarClock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminQuizCardDetails, adminSetQuizStatus } from "@/lib/admin-quiz.functions";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export type KpiMetric =
  | "total"
  | "published"
  | "draft"
  | "scheduled"
  | "archived"
  | "attempts"
  | "completion_rate"
  | "avg_score"
  | "active_users"
  | "performance_score"
  | "ai_generated";

const TITLES: Record<
  KpiMetric,
  { title: string; desc: string; icon: React.ComponentType<{ className?: string }> }
> = {
  total: {
    title: "All Quizzes",
    desc: "Every quiz in the system with attempts, status and performance.",
    icon: ListChecks,
  },
  published: {
    title: "Published Quizzes",
    desc: "Live quizzes — publish dates, attempts and performance.",
    icon: Send,
  },
  draft: {
    title: "Draft Quizzes",
    desc: "Drafts in progress — last edited, edit and publish from here.",
    icon: Edit3,
  },
  scheduled: {
    title: "Scheduled Quizzes",
    desc: "Published quizzes that go live in the future.",
    icon: CalendarClock,
  },
  archived: {
    title: "Archived Quizzes",
    desc: "Archived quizzes — restore at any time.",
    icon: Archive,
  },
  attempts: {
    title: "All Quiz Attempts",
    desc: "Recent attempts with student, score, accuracy and duration.",
    icon: Trophy,
  },
  completion_rate: {
    title: "Completion Analytics",
    desc: "Completed vs abandoned attempts, daily trend and per-subject breakdown.",
    icon: PercentSquare,
  },
  avg_score: {
    title: "Score Analytics",
    desc: "Score distribution, highest/lowest and averages by quiz and subject.",
    icon: Target,
  },
  active_users: {
    title: "Active Students (24h)",
    desc: "Students with quiz activity in the last 24 hours.",
    icon: Users,
  },
  performance_score: {
    title: "Performance Analytics",
    desc: "Top and weak performers with subject and chapter analysis.",
    icon: Gauge,
  },
  ai_generated: {
    title: "AI Generated Quizzes",
    desc: "Quizzes created by Auto-Generate with performance comparison.",
    icon: Bot,
  },
};

export function QuizKpiDetailDialog({
  metric,
  onClose,
  onOpenQuiz,
}: {
  metric: KpiMetric | null;
  onClose: () => void;
  onOpenQuiz?: (id: string, action?: "preview" | "edit" | "builder") => void;
}) {
  const qc = useQueryClient();
  const detailsFn = useServerFn(adminQuizCardDetails);
  const statusFn = useServerFn(adminSetQuizStatus);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin-quiz-card", metric, search],
    queryFn: () =>
      detailsFn({ data: { metric: metric!, search: search || undefined, limit: 150 } }),
    enabled: !!metric,
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "published" | "draft" | "archived" }) =>
      statusFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(`Quiz ${v.status}`);
      qc.invalidateQueries({ queryKey: ["admin-quiz-card"] });
      qc.invalidateQueries({ queryKey: ["admin-quizzes"] });
      qc.invalidateQueries({ queryKey: ["admin-quiz-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!metric) return null;
  const meta = TITLES[metric];
  const Icon = meta.icon;
  const data = q.data;
  const showSearch = [
    "total",
    "published",
    "draft",
    "scheduled",
    "archived",
    "ai_generated",
  ].includes(metric);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            {meta.title}
          </DialogTitle>
          <DialogDescription>{meta.desc}</DialogDescription>
        </DialogHeader>

        {showSearch && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quizzes…"
              className="pl-9 h-10"
            />
          </div>
        )}

        <div className="flex-1 overflow-auto rounded-xl border border-border/40">
          {q.isLoading ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !data ? (
            <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
              No data.
            </div>
          ) : data.kind === "quiz_list" ? (
            <QuizListView
              data={data}
              onOpenQuiz={onOpenQuiz}
              onSetStatus={(id, status) => setStatus.mutate({ id, status })}
              pending={setStatus.isPending}
              metric={metric}
            />
          ) : data.kind === "attempts" ? (
            <AttemptsView rows={data.rows} />
          ) : data.kind === "completion" ? (
            <CompletionView data={data} />
          ) : data.kind === "scores" ? (
            <ScoresView data={data} />
          ) : data.kind === "active_users" ? (
            <ActiveUsersView rows={data.rows} total={data.total} />
          ) : data.kind === "performance" ? (
            <PerformanceView data={data} />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
function fmtCountdown(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "starting";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  return `in ${m}m`;
}

function QuizListView({
  data,
  onOpenQuiz,
  onSetStatus,
  pending,
  metric,
}: {
  data: {
    rows: Array<{
      id: string;
      title: string;
      status: string;
      level: string | null;
      subject_name: string | null;
      total_questions: number;
      starts_at: string | null;
      attempts: number;
      avg_score: number;
      updated_at: string;
    }>;
    breakdown: Record<string, number>;
  };
  onOpenQuiz?: (id: string, a?: "preview" | "edit" | "builder") => void;
  onSetStatus: (id: string, status: "published" | "draft" | "archived") => void;
  pending: boolean;
  metric: KpiMetric;
}) {
  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {Object.entries(data.breakdown).map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border/40 bg-card/40 p-2 text-center">
            <p className="font-mono text-lg font-bold">{v.toLocaleString()}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground capitalize">
              {k.replace("_", " ")}
            </p>
          </div>
        ))}
      </div>
      {data.rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No quizzes match.</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/40">
              <th className="py-2 pr-2">Title</th>
              <th className="px-2">Subject</th>
              <th className="px-2">Status</th>
              <th className="px-2 text-right">Q</th>
              <th className="px-2 text-right">Attempts</th>
              <th className="px-2 text-right">Avg</th>
              <th className="px-2">{metric === "scheduled" ? "Starts" : "Updated"}</th>
              <th className="px-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr key={r.id} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-2 pr-2 font-medium">
                  <button
                    className="text-left hover:text-primary"
                    onClick={() => onOpenQuiz?.(r.id, "preview")}
                  >
                    {r.title}
                  </button>
                </td>
                <td className="px-2 text-muted-foreground">{r.subject_name ?? "—"}</td>
                <td className="px-2">
                  <Badge
                    variant={r.status === "published" ? "default" : "secondary"}
                    className="text-[10px] capitalize"
                  >
                    {r.status}
                  </Badge>
                </td>
                <td className="px-2 text-right tabular-nums">{r.total_questions}</td>
                <td className="px-2 text-right tabular-nums">{r.attempts}</td>
                <td className="px-2 text-right tabular-nums">{r.avg_score}%</td>
                <td className="px-2 text-muted-foreground">
                  {metric === "scheduled" ? (
                    <span title={r.starts_at ?? ""}>{fmtCountdown(r.starts_at)}</span>
                  ) : (
                    fmtRelative(r.updated_at)
                  )}
                </td>
                <td className="px-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    {metric === "draft" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={pending}
                        onClick={() => onSetStatus(r.id, "published")}
                      >
                        <Send className="mr-1 h-3 w-3" /> Publish
                      </Button>
                    )}
                    {metric === "published" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={pending}
                        onClick={() => onSetStatus(r.id, "draft")}
                      >
                        <EyeOff className="mr-1 h-3 w-3" /> Unpublish
                      </Button>
                    )}
                    {metric === "archived" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={pending}
                        onClick={() => onSetStatus(r.id, "draft")}
                      >
                        <RotateCcw className="mr-1 h-3 w-3" /> Restore
                      </Button>
                    )}
                    {metric === "scheduled" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-[11px]"
                        disabled={pending}
                        onClick={() => onSetStatus(r.id, "draft")}
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[11px]"
                      onClick={() => onOpenQuiz?.(r.id, "edit")}
                    >
                      <Edit3 className="mr-1 h-3 w-3" /> Edit
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

function AttemptsView({
  rows,
}: {
  rows: Array<{
    id: string;
    student: string;
    title: string | null;
    score: number;
    total_count: number;
    accuracy: number;
    duration_seconds: number;
    status: string;
    created_at: string;
    completed_at: string | null;
  }>;
}) {
  if (rows.length === 0)
    return <p className="py-10 text-center text-sm text-muted-foreground">No attempts yet.</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs">
      <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
        <tr className="border-b border-border/40">
          <th className="py-2 pl-3 pr-2">Student</th>
          <th className="px-2">Quiz</th>
          <th className="px-2 text-right">Score</th>
          <th className="px-2 text-right">Accuracy</th>
          <th className="px-2 text-right">Duration</th>
          <th className="px-2">Status</th>
          <th className="px-2 pr-3">When</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-border/20 hover:bg-muted/30">
            <td className="py-2 pl-3 pr-2 font-medium">{r.student}</td>
            <td className="px-2 text-muted-foreground truncate max-w-[260px]">{r.title ?? "—"}</td>
            <td className="px-2 text-right tabular-nums">
              {r.score}/{r.total_count}
            </td>
            <td className="px-2 text-right tabular-nums">{r.accuracy}%</td>
            <td className="px-2 text-right tabular-nums">{Math.round(r.duration_seconds / 60)}m</td>
            <td className="px-2">
              <Badge variant="outline" className="text-[10px] capitalize">
                {r.status}
              </Badge>
            </td>
            <td className="px-2 pr-3 text-muted-foreground">{fmtRelative(r.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

function MiniBars({
  series,
  valueKey,
  color = "#a855f7",
}: {
  series: Array<Record<string, number | string>>;
  valueKey: string;
  color?: string;
}) {
  const max = Math.max(1, ...series.map((s) => Number(s[valueKey] ?? 0)));
  return (
    <div className="flex h-24 items-end gap-px">
      {series.map((s, i) => {
        const v = Number(s[valueKey] ?? 0);
        return (
          <div
            key={i}
            title={`${s.d}: ${v}`}
            className="flex-1 rounded-t"
            style={{ height: `${(v / max) * 100}%`, background: color, minHeight: v ? 2 : 0 }}
          />
        );
      })}
    </div>
  );
}

function CompletionView({
  data,
}: {
  data: {
    series: Array<{ d: string; started: number; completed: number; rate: number }>;
    bySubject: Array<{
      subject_id: string;
      subject_name: string;
      started: number;
      completed: number;
      rate: number;
    }>;
    totals: { started: number; completed: number; abandoned: number; rate: number };
  };
}) {
  return (
    <div className="p-3 space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <Tile label="Started" value={data.totals.started.toLocaleString()} />
        <Tile label="Completed" value={data.totals.completed.toLocaleString()} accent="#10b981" />
        <Tile label="Abandoned" value={data.totals.abandoned.toLocaleString()} accent="#f43f5e" />
        <Tile label="Completion Rate" value={`${data.totals.rate}%`} accent="#a855f7" />
      </div>
      <div className="rounded-xl border border-border/40 p-3">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Daily Started vs Completed (30d)
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Started</p>
            <MiniBars series={data.series} valueKey="started" color="#60a5fa" />
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1">Completed</p>
            <MiniBars series={data.series} valueKey="completed" color="#10b981" />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border/40">
        <p className="border-b border-border/40 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Subject Breakdown
        </p>
        {data.bySubject.length === 0 ? (
          <p className="p-6 text-center text-xs text-muted-foreground">
            No subject-level data yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/30">
            {data.bySubject.map((s) => (
              <li key={s.subject_id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="flex-1 font-medium truncate">{s.subject_name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {s.completed}/{s.started}
                </span>
                <div className="h-1.5 w-32 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${s.rate}%` }} />
                </div>
                <span className="w-12 text-right tabular-nums">{s.rate}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ScoresView({
  data,
}: {
  data: {
    distribution: Array<{ label: string; count: number }>;
    highest: number;
    lowest: number;
    average: number;
    byQuiz: Array<{ quiz_id: string; title: string; avg: number; attempts: number }>;
    bySubject: Array<{ subject_id: string; subject_name: string; avg: number; attempts: number }>;
  };
}) {
  const max = Math.max(1, ...data.distribution.map((d) => d.count));
  return (
    <div className="p-3 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Tile label="Highest" value={`${data.highest}%`} accent="#10b981" />
        <Tile label="Average" value={`${data.average}%`} accent="#a855f7" />
        <Tile label="Lowest" value={`${data.lowest}%`} accent="#f43f5e" />
      </div>
      <div className="rounded-xl border border-border/40 p-3">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          Score Distribution
        </p>
        <div className="space-y-1.5">
          {data.distribution.map((d) => (
            <div key={d.label} className="flex items-center gap-2 text-xs">
              <span className="w-16 text-muted-foreground">{d.label}</span>
              <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
                  style={{ width: `${(d.count / max) * 100}%` }}
                />
              </div>
              <span className="w-10 text-right tabular-nums">{d.count}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <RankList
          title="Top Quizzes by Avg Score"
          items={data.byQuiz.map((q) => ({
            id: q.quiz_id,
            name: q.title,
            value: `${q.avg}%`,
            sub: `${q.attempts} attempts`,
          }))}
        />
        <RankList
          title="Subjects by Avg Score"
          items={data.bySubject.map((s) => ({
            id: s.subject_id,
            name: s.subject_name,
            value: `${s.avg}%`,
            sub: `${s.attempts} attempts`,
          }))}
        />
      </div>
    </div>
  );
}

function ActiveUsersView({
  rows,
  total,
}: {
  rows: Array<{
    user_id: string;
    name: string;
    email: string | null;
    last_seen: string;
    activity_count: number;
    last_quiz: string | null;
    device: string | null;
    browser: string | null;
  }>;
  total: number;
}) {
  return (
    <div className="p-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Active Users (24h)" value={total.toLocaleString()} accent="#38bdf8" />
        <Tile
          label="Total Activity Events"
          value={rows.reduce((a, r) => a + r.activity_count, 0).toLocaleString()}
        />
      </div>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No active users in the last 24 hours.
        </p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-xs">
          <thead className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/40">
              <th className="py-2 pl-3 pr-2">Student</th>
              <th className="px-2">Last Quiz</th>
              <th className="px-2">Device</th>
              <th className="px-2 text-right">Activity</th>
              <th className="px-2 pr-3">Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-border/20 hover:bg-muted/30">
                <td className="py-2 pl-3 pr-2 font-medium">{r.name}</td>
                <td className="px-2 text-muted-foreground truncate max-w-[280px]">
                  {r.last_quiz ?? "—"}
                </td>
                <td className="px-2 text-muted-foreground">
                  {[r.device, r.browser].filter(Boolean).join(" · ") || "—"}
                </td>
                <td className="px-2 text-right tabular-nums">{r.activity_count}</td>
                <td className="px-2 pr-3 text-muted-foreground">{fmtRelative(r.last_seen)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

function PerformanceView({
  data,
}: {
  data: {
    top: Array<{ user_id: string; name: string; avg: number; attempts: number }>;
    weak: Array<{ user_id: string; name: string; avg: number; attempts: number }>;
    bySubject: Array<{ subject_id: string; subject_name: string; avg: number; attempts: number }>;
    byChapter: Array<{ chapter_id: string; chapter_name: string; avg: number; attempts: number }>;
  };
}) {
  return (
    <div className="p-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <RankList
          title="Top Performers"
          items={data.top.map((u) => ({
            id: u.user_id,
            name: u.name,
            value: `${u.avg}%`,
            sub: `${u.attempts} attempts`,
          }))}
          icon={TrendingUp}
        />
        <RankList
          title="Needs Support"
          items={data.weak.map((u) => ({
            id: u.user_id,
            name: u.name,
            value: `${u.avg}%`,
            sub: `${u.attempts} attempts`,
          }))}
          icon={TrendingDown}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <RankList
          title="Subject Analysis"
          items={data.bySubject.map((s) => ({
            id: s.subject_id,
            name: s.subject_name,
            value: `${s.avg}%`,
            sub: `${s.attempts} attempts`,
          }))}
        />
        <RankList
          title="Chapter Analysis"
          items={data.byChapter.map((c) => ({
            id: c.chapter_id,
            name: c.chapter_name,
            value: `${c.avg}%`,
            sub: `${c.attempts} attempts`,
          }))}
        />
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  accent = "var(--primary)",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-3">
      <p className="font-mono text-xl font-bold tabular-nums" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    </div>
  );
}

function RankList({
  title,
  items,
  icon: Icon,
}: {
  title: string;
  items: Array<{ id: string; name: string; value: string; sub?: string }>;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-border/40">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2">
        {Icon ? <Icon className="h-3.5 w-3.5 text-primary" /> : null}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</p>
      </div>
      {items.length === 0 ? (
        <p className="p-6 text-center text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ol className="divide-y divide-border/30">
          {items.map((it, i) => (
            <li key={it.id} className="flex items-center gap-3 px-3 py-2 text-xs">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 font-mono text-[10px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="flex-1 truncate font-medium">{it.name}</span>
              {it.sub && <span className="text-[10px] text-muted-foreground">{it.sub}</span>}
              <span className="font-mono tabular-nums">{it.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
