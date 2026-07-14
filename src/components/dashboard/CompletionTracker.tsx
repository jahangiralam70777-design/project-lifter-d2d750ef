import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Sparkles,
  ArrowRight,
  Layers,
  Target,
} from "lucide-react";
import { studentCompletionTracker } from "@/lib/student-performance.functions";
import { useRealtimeActivity } from "@/hooks/use-realtime-invalidator";
import { useModuleVisibility } from "@/hooks/use-module-visibility";

function Ring({
  pct,
  size = 56,
  stroke = 6,
  tone = "var(--neon-purple)",
}: {
  pct: number;
  size?: number;
  stroke?: number;
  tone?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="currentColor"
        strokeWidth={stroke}
        fill="none"
        className="text-muted/40"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={tone}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        style={{
          filter: `drop-shadow(0 0 6px ${tone})`,
          transition: "stroke-dasharray 700ms ease",
        }}
      />
    </svg>
  );
}

const STATUS_DOT: Record<string, string> = {
  completed: "bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400",
  in_progress: "bg-amber-400 shadow-[0_0_6px] shadow-amber-400",
  not_started: "bg-rose-400/60",
};

export function CompletionTracker() {
  const fetchFn = useServerFn(studentCompletionTracker);
  const qc = useQueryClient();
  const activity = useRealtimeActivity();
  const lastRealtimeActivityRef = useRef(activity);
  const { isPathHidden } = useModuleVisibility();
  const flashCardsHidden = isPathHidden("/flash-cards");

  const { data, isLoading } = useQuery({
    queryKey: ["student-completion-tracker"],
    queryFn: () => fetchFn(),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (activity === lastRealtimeActivityRef.current) return;
    lastRealtimeActivityRef.current = activity;
    void qc.invalidateQueries({ queryKey: ["student-completion-tracker"], refetchType: "active" });
  }, [activity, qc]);

  const subjects = useMemo(() => data?.subjects ?? [], [data]);
  const chapters = useMemo(() => data?.chapters ?? [], [data]);
  const recs = data?.recommendations ?? [];
  const overall = data?.overall;

  const [activeSubject, setActiveSubject] = useState<string | "all">("all");
  const filteredChapters = useMemo(
    () =>
      activeSubject === "all" ? chapters : chapters.filter((c) => c.subjectId === activeSubject),
    [chapters, activeSubject],
  );

  if (isLoading && !data) {
    return (
      <div className="glass shadow-card-soft flex items-center justify-center gap-2 rounded-3xl p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading completion tracker…
      </div>
    );
  }

  if (!subjects.length) {
    return (
      <div className="glass shadow-card-soft rounded-3xl p-6 text-center text-sm text-muted-foreground">
        No subjects available for your level yet.
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Completion <span className="text-gradient">Tracker</span>
          </h2>
          <p className="text-xs text-muted-foreground">
            Subject &amp; chapter coverage · {overall?.chaptersDone ?? 0}/
            {overall?.chaptersTotal ?? 0} chapters · {overall?.completionPct ?? 0}% overall
          </p>
        </div>
        <div className="hidden items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground sm:inline-flex">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400" />
          Live
        </div>
      </div>

      {/* Subject cards with rings */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {subjects.map((s) => {
          const tone = s.color ?? "var(--neon-purple)";
          return (
            <button
              key={s.id}
              onClick={() => setActiveSubject(activeSubject === s.id ? "all" : s.id)}
              className={`glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5 ${activeSubject === s.id ? "ring-2 ring-[var(--neon-purple)]" : ""}`}
            >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-2xl"
                style={{ background: tone }}
              />
              <div className="flex items-start gap-3">
                <Ring pct={s.completionPct} tone={tone} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-display text-sm font-bold line-clamp-1">{s.name}</p>
                    <span className="font-display text-lg font-bold" style={{ color: tone }}>
                      {s.completionPct}%
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {s.mcqsDone}/{s.mcqsTotal} MCQs · acc {s.accuracy}%
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    <span className="rounded-full bg-background/50 px-1.5 py-0.5">
                      Q {s.quizzes}
                    </span>
                    <span className="rounded-full bg-background/50 px-1.5 py-0.5">M {s.mocks}</span>
                    <span className="rounded-full bg-background/50 px-1.5 py-0.5">
                      CE {s.customExams}
                    </span>
                    <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 text-amber-400">
                      {s.pendingChapters} pending
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Chapter grid + recommendations */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="glass shadow-card-soft rounded-3xl p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-lg font-bold flex items-center gap-2">
                <Layers className="h-4 w-4 text-[var(--neon-blue)]" /> Chapter Completion
              </h3>
              <p className="text-xs text-muted-foreground">
                {activeSubject === "all"
                  ? "All subjects · click a subject above to filter"
                  : "Tap a subject to clear filter"}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT.completed}`} /> done
              </span>
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT.in_progress}`} /> in
                progress
              </span>
              <span className="flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT.not_started}`} /> not
                started
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredChapters.length === 0 && (
              <p className="text-xs text-muted-foreground col-span-full">No chapters here yet.</p>
            )}
            {filteredChapters.map((c) => (
              <div key={c.id} className="rounded-2xl bg-background/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[c.status]}`} />
                      <p className="font-medium text-sm line-clamp-1">{c.name}</p>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">
                      {c.subjectName} · {c.mcqsDone}/{c.mcqsTotal} MCQs · {c.attempts} sessions
                    </p>
                  </div>
                  <span
                    className={`font-display text-xs font-bold ${
                      c.status === "completed"
                        ? "text-emerald-400"
                        : c.status === "in_progress"
                          ? "text-amber-400"
                          : "text-muted-foreground"
                    }`}
                  >
                    {c.completionPct}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${c.completionPct}%`,
                      background:
                        c.status === "completed"
                          ? "linear-gradient(90deg, oklch(0.78 0.18 150), oklch(0.7 0.18 170))"
                          : c.status === "in_progress"
                            ? "linear-gradient(90deg, oklch(0.82 0.18 80), var(--neon-pink))"
                            : "var(--muted)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass shadow-card-soft rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--neon-purple)]" /> Study Next
            </h3>
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">Smart recommendations</p>
          <ul className="mt-4 space-y-2">
            {recs.length ? (
              recs.map((r) => (
                <li key={r.chapterId} className="rounded-2xl bg-background/40 p-3">
                  <div className="flex items-start gap-2">
                    <BookOpen className="mt-0.5 h-3.5 w-3.5 text-[var(--neon-blue)]" />
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-bold line-clamp-1">{r.title}</p>
                      <p className="text-[10px] text-muted-foreground line-clamp-2">
                        {r.subjectName} · {r.reason}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Link
                      to="/mcq-practice"
                      className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-[var(--neon-purple)]/15 px-2 py-1 text-[10px] font-bold text-[var(--neon-purple)] hover:bg-[var(--neon-purple)]/25"
                    >
                      Practice <ArrowRight className="h-3 w-3" />
                    </Link>
                    {!flashCardsHidden && (
                      <Link
                        to="/flash-cards"
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl bg-background/60 px-2 py-1 text-[10px] font-bold hover:bg-background/80"
                      >
                        Revise
                      </Link>
                    )}
                  </div>
                </li>
              ))
            ) : (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                All caught up — keep going!
              </li>
            )}
            {!recs.length && chapters.length > 0 && (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <CircleDashed className="h-3.5 w-3.5" /> Complete a session to unlock smart picks.
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
