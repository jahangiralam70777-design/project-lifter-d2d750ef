import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Award,
  Target,
  Clock,
  RotateCw,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Trophy,
  ListChecks,
  Timer,
  SlidersHorizontal,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { studentPerformanceCenter } from "@/lib/student-performance.functions";
import { useRealtimeActivity } from "@/hooks/use-realtime-invalidator";
import { CountUp } from "@/components/realtime/CountUp";

const KIND_META: Record<
  string,
  { label: string; icon: typeof ListChecks; to: string; tone: string }
> = {
  mcq_practice: {
    label: "MCQ Practice",
    icon: ListChecks,
    to: "/mcq-practice",
    tone: "var(--neon-purple)",
  },
  quiz: { label: "Quiz", icon: Timer, to: "/quiz", tone: "var(--neon-blue)" },
  mock: { label: "Mock Test", icon: Trophy, to: "/mock-test", tone: "var(--neon-pink)" },
  custom_exam: {
    label: "Custom Exam",
    icon: SlidersHorizontal,
    to: "/custom-exam",
    tone: "oklch(0.78 0.15 200)",
  },
};

function timeAgo(iso?: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function fmtDuration(sec: number) {
  if (!sec) return "0s";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export function PerformanceCenter() {
  const fetchFn = useServerFn(studentPerformanceCenter);
  const qc = useQueryClient();
  const activity = useRealtimeActivity();

  const { data, isLoading } = useQuery({
    queryKey: ["student-performance-center"],
    queryFn: () => fetchFn(),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["student-performance-center"] });
  }, [activity, qc]);

  if (isLoading && !data) {
    return (
      <div className="glass shadow-card-soft flex items-center justify-center gap-2 rounded-3xl p-10 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading performance…
      </div>
    );
  }

  const summary = data?.summary ?? [];
  const recent = data?.recent ?? [];
  const trend = data?.trend ?? [];
  const subjectPerf = data?.subjectPerformance ?? [];
  const weakChapters = data?.weakChapters ?? [];
  const improvements = data?.improvements ?? [];
  const totals = data?.totals;
  const continueLearning = data?.continueLearning ?? [];
  const strongest = data?.strongestSubject;
  const weakest = data?.weakestSubject;

  const trendMax = Math.max(...trend.map((d) => d.accuracy), 100);

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Performance <span className="text-gradient">Center</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Live insights from every session you complete.
          </p>
        </div>
        <div className="hidden items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground sm:inline-flex">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" />
          Realtime
        </div>
      </div>

      {/* Completed Summary */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {summary.map((s) => {
          const meta = KIND_META[s.kind] ?? KIND_META.quiz;
          const Icon = meta.icon;
          return (
            <Link
              key={s.kind}
              to={meta.to}
              className="glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4 transition-transform hover:-translate-y-0.5"
            >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-70"
                style={{ background: meta.tone }}
              />
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-glow"
                style={{ background: `linear-gradient(135deg, ${meta.tone}, oklch(0.55 0.2 270))` }}
              >
                <Icon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">{meta.label}</p>
              <p className="font-display mt-1 text-2xl font-bold">
                <CountUp value={s.total} />
              </p>
              <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                <span>
                  <b className="text-foreground">{s.today}</b> today
                </span>
                <span>
                  <b className="text-foreground">{s.week}</b> wk
                </span>
                <span>
                  <b className="text-foreground">{s.month}</b> mo
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi
          icon={Target}
          label="Overall Accuracy"
          value={`${totals?.accuracy ?? 0}%`}
          tone="var(--neon-purple)"
        />
        <Kpi
          icon={totals && totals.improvementPct >= 0 ? TrendingUp : TrendingDown}
          label="7-day Improvement"
          value={`${totals && totals.improvementPct >= 0 ? "+" : ""}${totals?.improvementPct ?? 0}%`}
          tone={totals && totals.improvementPct >= 0 ? "oklch(0.75 0.18 150)" : "var(--neon-pink)"}
        />
        <Kpi
          icon={Clock}
          label="Avg Session"
          value={fmtDuration(totals?.avgCompletionSec ?? 0)}
          tone="var(--neon-blue)"
        />
        <Kpi
          icon={Activity}
          label="Total Attempts"
          value={String(totals?.attempts ?? 0)}
          tone="oklch(0.78 0.15 200)"
        />
      </div>

      {/* Accuracy Trend + Strongest/Weakest */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Accuracy Trend</h3>
              <p className="text-xs text-muted-foreground">Last 14 days · all session types</p>
            </div>
            <div className="glass rounded-xl px-3 py-1.5 text-xs">14d</div>
          </div>
          <div className="mt-6 flex h-48 items-end gap-2">
            {trend.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <div className="relative flex h-full w-full items-end">
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-[var(--neon-purple)] to-[var(--neon-blue)] transition-all duration-700"
                    style={{
                      height: `${(d.accuracy / Math.max(trendMax, 1)) * 100}%`,
                      opacity: d.attempts ? 1 : 0.15,
                      boxShadow: d.attempts ? "0 -6px 24px -6px var(--neon-purple)" : undefined,
                    }}
                    title={`${d.date}: ${d.accuracy}% (${d.attempts} attempts)`}
                  />
                </div>
                <span className="text-[9px] text-muted-foreground">{d.label[0]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="glass shadow-card-soft space-y-4 rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Strengths & Gaps</h3>
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-emerald-400">
              <Award className="h-3.5 w-3.5" /> Strongest Subject
            </div>
            <p className="font-display mt-1 text-base font-bold">
              {strongest?.name ?? "Not enough data"}
            </p>
            {strongest && (
              <p className="text-xs text-muted-foreground">
                {strongest.accuracy}% accuracy · {strongest.attempts} attempts
              </p>
            )}
          </div>
          <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-rose-400">
              <AlertTriangle className="h-3.5 w-3.5" /> Needs Work
            </div>
            <p className="font-display mt-1 text-base font-bold">
              {weakest?.name ?? "Not enough data"}
            </p>
            {weakest && (
              <p className="text-xs text-muted-foreground">
                {weakest.accuracy}% accuracy · {weakest.attempts} attempts
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Subject performance + Weak chapters */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="glass shadow-card-soft rounded-3xl p-5">
          <h3 className="font-display text-lg font-bold">Subject Analytics</h3>
          <p className="text-xs text-muted-foreground">Accuracy and attempts by subject</p>
          <div className="mt-4 space-y-3">
            {subjectPerf.length ? (
              subjectPerf.map((s) => (
                <div key={s.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.attempts} attempts · <b className="text-foreground">{s.accuracy}%</b>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${s.accuracy}%`,
                        background: `linear-gradient(90deg, ${s.color ?? "var(--neon-purple)"}, oklch(0.7 0.2 260))`,
                        boxShadow: `0 0 12px ${s.color ?? "var(--neon-purple)"}`,
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                No subject data yet — complete a session to see it here.
              </p>
            )}
          </div>
        </div>

        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Weak Chapters</h3>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <p className="text-xs text-muted-foreground">Lowest accuracy chapters · focus here</p>
          <ul className="mt-4 space-y-2">
            {weakChapters.length ? (
              weakChapters.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-xl bg-background/40 p-3 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium line-clamp-1">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {c.subjectName ?? "—"} · {c.attempts} attempts
                    </p>
                  </div>
                  <span
                    className={`font-display rounded-full px-2 py-0.5 text-xs font-bold ${
                      c.accuracy < 50
                        ? "bg-rose-400/15 text-rose-400"
                        : "bg-amber-400/15 text-amber-400"
                    }`}
                  >
                    {c.accuracy}%
                  </span>
                </li>
              ))
            ) : (
              <li className="text-xs text-muted-foreground">No weak chapters detected yet.</li>
            )}
          </ul>
        </div>
      </div>

      {/* Recent Activity (timeline) + Improvements */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Attempt History</h3>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <ul className="mt-4 space-y-2">
            {recent.length ? (
              recent.map((a) => {
                const meta = KIND_META[a.kind] ?? KIND_META.quiz;
                const Icon = meta.icon;
                const passed = a.score >= 60;
                return (
                  <li
                    key={a.id}
                    className="flex items-center gap-3 rounded-2xl bg-background/40 p-3 transition-colors hover:bg-background/60"
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow"
                      style={{
                        background: `linear-gradient(135deg, ${meta.tone}, oklch(0.55 0.2 270))`,
                      }}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          {meta.label}
                        </span>
                        {a.attemptNumber > 1 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--neon-blue)]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--neon-blue)]">
                            <RotateCw className="h-2.5 w-2.5" /> #{a.attemptNumber}
                          </span>
                        )}
                      </div>
                      <p className="font-display text-sm font-bold line-clamp-1">{a.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {a.subjectName ? `${a.subjectName} · ` : ""}
                        {a.correct}/{a.total} correct · {fmtDuration(a.duration)} ·{" "}
                        {timeAgo(a.completedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-display text-lg font-bold ${passed ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {a.score}%
                      </p>
                      <div className="mt-0.5 flex items-center justify-end gap-1 text-[9px] uppercase tracking-widest text-muted-foreground">
                        <CheckCircle2 className="h-2.5 w-2.5" /> done
                      </div>
                    </div>
                  </li>
                );
              })
            ) : (
              <li className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                No attempts yet. Start a quiz, mock, or practice session to begin tracking.
              </li>
            )}
          </ul>
        </div>

        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Improvement</h3>
            <Sparkles className="h-4 w-4 text-[var(--neon-purple)]" />
          </div>
          <p className="text-xs text-muted-foreground">Retry progression</p>
          <ul className="mt-4 space-y-2">
            {improvements.length ? (
              improvements.map((g) => {
                const up = g.delta >= 0;
                return (
                  <li key={g.key} className="rounded-2xl bg-background/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-display text-sm font-bold line-clamp-1">{g.title}</p>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          up ? "bg-emerald-400/15 text-emerald-400" : "bg-rose-400/15 text-rose-400"
                        }`}
                      >
                        {up ? (
                          <TrendingUp className="h-3 w-3" />
                        ) : (
                          <TrendingDown className="h-3 w-3" />
                        )}
                        {up ? "+" : ""}
                        {g.delta}%
                      </span>
                    </div>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Attempt 1 → {g.firstScore}% &nbsp;·&nbsp; Latest → {g.latestScore}%
                      &nbsp;·&nbsp; {g.attempts} attempts
                    </p>
                  </li>
                );
              })
            ) : (
              <li className="text-xs text-muted-foreground">
                Retry a session to see improvement trends.
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* Continue Learning */}
      {continueLearning.length > 0 && (
        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold">Pick Up Where You Left Off</h3>
            <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              In progress
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {continueLearning.map((c) => {
              const meta = KIND_META[c.kind] ?? KIND_META.quiz;
              return (
                <Link
                  key={c.id}
                  to={meta.to}
                  className="glass group flex items-center justify-between rounded-2xl p-3 transition-transform hover:-translate-y-0.5"
                >
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {meta.label}
                    </p>
                    <p className="font-display text-sm font-bold line-clamp-1">{c.title}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4">
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl"
        style={{ background: tone }}
      />
      <div
        className="flex h-8 w-8 items-center justify-center rounded-lg text-white"
        style={{ background: `linear-gradient(135deg, ${tone}, oklch(0.55 0.2 270))` }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-display mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}
