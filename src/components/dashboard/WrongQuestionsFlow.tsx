import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import { sanitizeOptionText } from "@/lib/sanitize-option";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  XCircle,
  Loader2,
  Check,
  RotateCw,
  Trash2,
  ChevronDown,
  Filter as FilterIcon,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Trophy,
  Lightbulb,
  ArrowRight,
  Target,
  Layers,
  Eye,
  BookOpen,
} from "lucide-react";

import { listWrongMcqs, markWrongMcqsMastered, removeWrongMcqs } from "@/lib/mcq-review.functions";
import { listSubjects, listChapters } from "@/lib/learning.functions";
import { useLevels } from "@/hooks/use-levels";

/* -------------------------------------------------- */
/* Tiny inline sparkline (SVG, no deps)               */
/* -------------------------------------------------- */
function Sparkline({
  values,
  color = "currentColor",
  className = "",
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  if (!values.length) values = [0, 0];
  const w = 100;
  const h = 28;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${i * step},${h - ((v - min) / span) * h}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={pts}
      />
    </svg>
  );
}

/* -------------------------------------------------- */
/* Premium stat card                                  */
/* -------------------------------------------------- */
type StatTone = "rose" | "amber" | "violet" | "emerald";

const toneMap: Record<StatTone, { ring: string; bg: string; text: string; spark: string }> = {
  rose: {
    ring: "ring-rose-500/20",
    bg: "bg-rose-500/10",
    text: "text-rose-500",
    spark: "#f43f5e",
  },
  amber: {
    ring: "ring-amber-500/20",
    bg: "bg-amber-500/10",
    text: "text-amber-500",
    spark: "#f59e0b",
  },
  violet: {
    ring: "ring-violet-500/20",
    bg: "bg-violet-500/10",
    text: "text-violet-500",
    spark: "#8b5cf6",
  },
  emerald: {
    ring: "ring-emerald-500/20",
    bg: "bg-emerald-500/10",
    text: "text-emerald-500",
    spark: "#10b981",
  },
};

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  tone,
  spark,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  unit?: string;
  hint: string;
  tone: StatTone;
  spark: number[];
}) {
  const t = toneMap[tone];
  return (
    <div className="glass shadow-card-soft group rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${t.bg} ${t.ring}`}
        >
          <Icon className={`h-4 w-4 ${t.text}`} />
        </div>
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${t.bg} ${t.text}`}
        >
          {label}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-bold tabular-nums">{value}</span>
        {unit && <span className="text-xs font-medium text-muted-foreground">{unit}</span>}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-2 h-7">
        <Sparkline values={spark} color={t.spark} className="h-full w-full" />
      </div>
    </div>
  );
}

/* -------------------------------------------------- */
/* Circular progress ring                             */
/* -------------------------------------------------- */
function ProgressRing({
  percent,
  size = 140,
  stroke = 12,
}: {
  percent: number;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  const dash = (p / 100) * c;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="currentColor"
        strokeOpacity={0.12}
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="url(#ring-grad)"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${dash} ${c - dash}`}
      />
    </svg>
  );
}

/* -------------------------------------------------- */
/* Helpers                                            */
/* -------------------------------------------------- */
function fmtDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return { date, time };
}

function weekBuckets(timestamps: string[], weeks = 8) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const buckets = Array(weeks).fill(0);
  for (const t of timestamps) {
    const diff = now - new Date(t).getTime();
    const w = Math.floor(diff / (7 * day));
    if (w >= 0 && w < weeks) buckets[weeks - 1 - w]++;
  }
  return buckets;
}

/* -------------------------------------------------- */
/* Main component                                     */
/* -------------------------------------------------- */
export function WrongQuestionsFlow() {
  const [level, setLevel] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [visible, setVisible] = useState(5);
  type WrongItem = NonNullable<Awaited<ReturnType<typeof listFn>>>[number];
  const [reviewItems, setReviewItems] = useState<WrongItem[] | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewBusy, setReviewBusy] = useState(false);
  const navigate = useNavigate();

  const qc = useQueryClient();
  const listFn = useServerFn(listWrongMcqs);
  const masterFn = useServerFn(markWrongMcqsMastered);
  const removeFn = useServerFn(removeWrongMcqs);
  const subjectsFn = useServerFn(listSubjects);
  const chaptersFn = useServerFn(listChapters);

  const subjectsQ = useQuery({
    queryKey: ["subjects", level],
    queryFn: () => subjectsFn({ data: { level: level ?? undefined } }),
  });
  const { data: levelsList = [] } = useLevels();

  const chaptersQ = useQuery({
    queryKey: ["chapters", subjectId],
    queryFn: () => chaptersFn({ data: { subjectId: subjectId! } }),
    enabled: !!subjectId,
  });

  // Pending wrong (default — RLS scoped, mastered=false)
  const wrongQ = useQuery({
    queryKey: ["mcq-wrong", { level, subjectId, chapterId }],
    queryFn: () =>
      listFn({
        data: {
          level: level ?? undefined,
          subjectId: subjectId ?? undefined,
          chapterId: chapterId ?? undefined,
        },
      }),
  });

  // Full set incl. mastered for analytics
  const allQ = useQuery({
    queryKey: ["mcq-wrong-all", { level, subjectId, chapterId }],
    queryFn: () =>
      listFn({
        data: {
          level: level ?? undefined,
          subjectId: subjectId ?? undefined,
          chapterId: chapterId ?? undefined,
          includeMastered: true,
        },
      }),
  });

  const items = useMemo(() => (wrongQ.data ?? []).filter((w) => !!w.mcq), [wrongQ.data]);
  const allItems = useMemo(() => allQ.data ?? [], [allQ.data]);

  // Subject name lookup
  const subjectName = useMemo(() => {
    const map = new Map<string, string>();
    (subjectsQ.data ?? []).forEach((s) => map.set(s.id, s.name));
    return map;
  }, [subjectsQ.data]);
  const chapterName = useMemo(() => {
    const map = new Map<string, string>();
    (chaptersQ.data ?? []).forEach((c) => map.set(c.id, c.name));
    return map;
  }, [chaptersQ.data]);

  // -------- Analytics (all derived from real data) --------
  const stats = useMemo(() => {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const pending = items.length;
    const total = allItems.length;
    const mastered = allItems.filter((i) => i.mastered).length;
    const thisWeek = allItems.filter(
      (i) => now - new Date(i.last_wrong_at).getTime() <= 7 * day,
    ).length;
    const lastWeek = allItems.filter((i) => {
      const d = now - new Date(i.last_wrong_at).getTime();
      return d > 7 * day && d <= 14 * day;
    }).length;
    const reviewPct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    const accuracyImpact =
      total > 0 ? -Math.min(100, Math.round((pending / Math.max(total, 1)) * 100)) : 0;
    const potentialGain =
      pending > 0 ? Math.min(100, Math.round((pending / Math.max(total, pending + 1)) * 100)) : 0;

    return {
      pending,
      total,
      mastered,
      reviewed: mastered,
      remaining: pending,
      thisWeek,
      lastWeek,
      reviewPct,
      accuracyImpact,
      potentialGain,
    };
  }, [items, allItems]);

  // Subject ranking (most wrong)
  const weakest = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((i) => {
      const k = i.subject_id ?? "—";
      counts.set(k, (counts.get(k) ?? 0) + 1);
    });
    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return top.map(([id, n]) => ({ id, name: subjectName.get(id) ?? "Other", n }));
  }, [items, subjectName]);

  // Sparkline series (per metric)
  const sparkAll = useMemo(
    () =>
      weekBuckets(
        allItems.map((i) => i.last_wrong_at),
        8,
      ),
    [allItems],
  );
  const sparkRecent = useMemo(
    () =>
      weekBuckets(
        allItems.map((i) => i.last_wrong_at),
        6,
      ),
    [allItems],
  );

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["mcq-wrong"] });
    qc.invalidateQueries({ queryKey: ["mcq-wrong-all"] });
    qc.invalidateQueries({ queryKey: ["mcq-review-counts"] });
  }

  async function master(mcqId: string) {
    try {
      await masterFn({ data: { mcqIds: [mcqId] } });
      invalidateAll();
    } catch {
      /* silent */
    }
  }
  async function remove(mcqId: string) {
    try {
      await removeFn({ data: { mcqIds: [mcqId] } });
      invalidateAll();
    } catch {
      /* silent */
    }
  }

  function startReview(ids: string[]) {
    const unique = Array.from(new Set(ids)).filter(Boolean);
    if (unique.length === 0) return;
    // Resolve full payloads from already-loaded lists so the modal is self-contained.
    const pool = new Map<string, WrongItem>();
    for (const it of allItems) if (it.mcq) pool.set(it.mcq.id, it);
    for (const it of items) if (it.mcq) pool.set(it.mcq.id, it);
    const resolved = unique.map((id) => pool.get(id)).filter((x): x is WrongItem => !!x && !!x.mcq);
    if (resolved.length === 0) return;
    setReviewItems(resolved);
    setReviewIdx(0);
  }
  async function finishReview() {
    if (!reviewItems || reviewItems.length === 0) return;
    setReviewBusy(true);
    const mcqIds = reviewItems.map((r) => r.mcq!.id);
    const idSet = new Set(mcqIds);
    // Snapshot caches for rollback
    const prevWrong = qc.getQueriesData({ queryKey: ["mcq-wrong"] });
    const prevAll = qc.getQueriesData({ queryKey: ["mcq-wrong-all"] });
    try {
      // Await DB deletion BEFORE updating UI to prevent mismatch
      const res = await removeFn({ data: { mcqIds } });
      if (!res || typeof res.removed !== "number") {
        throw new Error("Delete did not confirm");
      }
      // 1) Optimistically prune list caches so derived counts drop instantly
      const prune = <T extends { mcq_id: string }>(rows: T[] | undefined) =>
        (rows ?? []).filter((r) => !idSet.has(r.mcq_id));
      qc.setQueriesData({ queryKey: ["mcq-wrong"] }, prune);
      qc.setQueriesData({ queryKey: ["mcq-wrong-all"] }, prune);
      // 2) Optimistically decrement the dashboard "wrong" count
      qc.setQueriesData<{ bookmarks: number; wrong: number } | undefined>(
        { queryKey: ["mcq-review-counts"] },
        (prev) =>
          prev ? { ...prev, wrong: Math.max(0, (prev.wrong ?? 0) - res.removed) } : prev,
      );
      // 3) Close modal immediately (UI feels instant)
      setReviewItems(null);
      setReviewIdx(0);
      // 4) Invalidate every dependent key, then force-refetch the active ones
      //    so the server-truth count overwrites the optimistic value.
      const dependentKeys = [
        ["mcq-wrong"],
        ["mcq-wrong-all"],
        ["mcq-review-counts"],
        ["wrong-questions"],
        ["mcq-wrong-questions"],
        ["student-dashboard-snapshot"],
        ["student-daily-progress"],
        ["student-performance-center"],
        ["student-completion-tracker"],
        ["subject-progress"],
        ["chapter-progress"],
      ] as const;
      dependentKeys.forEach((k) => qc.invalidateQueries({ queryKey: k as unknown as string[] }));
      await Promise.all([
        qc.refetchQueries({ queryKey: ["mcq-wrong"], type: "active" }),
        qc.refetchQueries({ queryKey: ["mcq-wrong-all"], type: "active" }),
        qc.refetchQueries({ queryKey: ["mcq-review-counts"], type: "active" }),
        qc.refetchQueries({ queryKey: ["student-dashboard-snapshot"], type: "active" }),
      ]);
      toast.success(`Removed ${res.removed} reviewed question${res.removed === 1 ? "" : "s"}`);
    } catch (err) {
      // Rollback cache snapshots
      prevWrong.forEach(([key, data]) => qc.setQueryData(key, data));
      prevAll.forEach(([key, data]) => qc.setQueryData(key, data));
      qc.invalidateQueries({ queryKey: ["mcq-review-counts"] });
      toast.error(err instanceof Error ? err.message : "Failed to remove reviewed questions");
    } finally {
      setReviewBusy(false);
    }
  }
  function cancelReview() {
    setReviewItems(null);
    setReviewIdx(0);
  }

  function resetFilters() {
    setLevel(null);
    setSubjectId(null);
    setChapterId(null);
  }

  const displayed = items.slice(0, visible);

  return (
    <div className="space-y-5">
      {/* ============ HEADER ============ */}
      <div className="glass shadow-card-soft rounded-3xl p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/15 ring-1 ring-rose-500/30">
            <XCircle className="h-5 w-5 text-rose-500" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold tracking-tight">Wrong Answers</h1>
            <p className="text-xs text-muted-foreground">
              Review MCQs you answered incorrectly. Master them to remove from this list.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-500">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
            {stats.pending} Pending
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <select
            value={level ?? ""}
            onChange={(e) => {
              setLevel(e.target.value || null);
              setSubjectId(null);
              setChapterId(null);
            }}
            className="glass min-w-[140px] rounded-xl border border-border/60 px-3 py-2 text-xs font-medium"
          >
            <option value="">All Levels</option>
            {levelsList.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
          <select
            value={subjectId ?? ""}
            onChange={(e) => {
              setSubjectId(e.target.value || null);
              setChapterId(null);
            }}
            className="glass min-w-[160px] rounded-xl border border-border/60 px-3 py-2 text-xs font-medium"
          >
            <option value="">All Subjects</option>
            {(subjectsQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={chapterId ?? ""}
            onChange={(e) => setChapterId(e.target.value || null)}
            disabled={!subjectId}
            className="glass min-w-[160px] rounded-xl border border-border/60 px-3 py-2 text-xs font-medium disabled:opacity-50"
          >
            <option value="">All Chapters</option>
            {(chaptersQ.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={resetFilters}
            title="Reset filters"
            className="glass flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 text-muted-foreground transition hover:text-foreground"
          >
            <FilterIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ============ MAIN GRID ============ */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        {/* ---------- LEFT COLUMN ---------- */}
        <div className="space-y-5 min-w-0">
          {/* Stat cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={XCircle}
              label="Total Wrong"
              value={String(stats.pending)}
              unit="MCQs"
              hint="Across all subjects"
              tone="rose"
              spark={sparkAll}
            />
            <StatCard
              icon={Target}
              label="This Week"
              value={String(stats.thisWeek).padStart(2, "0")}
              unit="MCQs"
              hint="Needs Review"
              tone="amber"
              spark={sparkRecent}
            />
            <StatCard
              icon={TrendingDown}
              label="Accuracy Impact"
              value={`${stats.accuracyImpact}%`}
              hint="Due to wrong answers"
              tone="violet"
              spark={sparkAll.slice().reverse()}
            />
            <StatCard
              icon={TrendingUp}
              label="Potential Score Gain"
              value={`+${stats.potentialGain}%`}
              hint="If you master them"
              tone="emerald"
              spark={sparkAll}
            />
          </div>

          {/* Table */}
          <div className="glass shadow-card-soft overflow-hidden rounded-3xl">
            <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
              <h2 className="font-display text-lg font-bold">Wrong Answers List</h2>
              <span className="text-xs text-muted-foreground">{items.length} total</span>
            </div>

            {wrongQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 p-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : items.length === 0 ? (
              <div className="m-5 rounded-2xl border border-dashed border-border bg-card/30 p-12 text-center text-sm text-muted-foreground">
                🎯 No wrong answers. Complete an MCQ practice to populate this list.
              </div>
            ) : (
              <>
              {/* Mobile cards */}
              <ul className="space-y-3 p-3 md:hidden">
                {displayed.map((w, idx) => {
                  const m = w.mcq!;
                  const open = openId === m.id;
                  const subj = w.subject_id ? (subjectName.get(w.subject_id) ?? "—") : "—";
                  const chap = w.chapter_id ? (chapterName.get(w.chapter_id) ?? "") : "";
                  const { date, time } = fmtDate(w.last_wrong_at);
                  const correct = w.correct_option ?? m.correct_option;
                  return (
                    <li key={`m-${m.id}`} className="rounded-2xl border border-border/60 bg-card/40 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex max-w-full items-center break-words rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-500 ring-1 ring-violet-500/20">
                          {subj}
                        </span>
                        <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                          #{String(idx + 1).padStart(2, "0")}
                        </span>
                      </div>
                      <p className="mt-2 break-words text-sm font-medium">
                        {sanitizeOptionText(m.question)}
                      </p>
                      {chap && (
                        <p className="mt-1 break-words text-[11px] text-muted-foreground">{chap}</p>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-2 py-1.5">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Your answer</div>
                          <div className="font-bold text-rose-500">{w.last_chosen_option ?? "—"}</div>
                        </div>
                        <div className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2 py-1.5">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Correct</div>
                          <div className="font-bold text-emerald-500">{correct ?? "—"}</div>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        Wrong on {date} · {time}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => setOpenId(open ? null : m.id)}
                          className="glass flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground"
                          title="View explanation"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => master(m.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-emerald-500"
                          title="Mark as mastered"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => remove(m.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-500"
                          title="Remove"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => startReview([m.id])}
                          className="bg-cta-gradient ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-glow"
                        >
                          Review
                        </button>
                      </div>
                      {open && (
                        <div className="animate-fade-up mt-3 grid grid-cols-1 gap-2">
                          {[
                            { k: "A", t: sanitizeOptionText(m.option_a) },
                            { k: "B", t: sanitizeOptionText(m.option_b) },
                            { k: "C", t: sanitizeOptionText(m.option_c) },
                            { k: "D", t: sanitizeOptionText(m.option_d) },
                          ]
                            .filter((o) => o.t && o.t.length > 0)
                            .map((o) => {
                              const isCorrect = correct === o.k;
                              const isPicked = w.last_chosen_option === o.k;
                              const tone = isCorrect
                                ? "border-emerald-400/60 bg-emerald-400/10"
                                : isPicked
                                  ? "border-rose-400/60 bg-rose-400/10"
                                  : "border-border bg-background/40";
                              return (
                                <div key={o.k} className={`break-words rounded-xl border p-3 text-sm ${tone}`}>
                                  <span className="mr-2 font-display font-bold">{o.k}.</span>
                                  {o.t}
                                </div>
                              );
                            })}
                          {m.explanation && (
                            <div className="break-words rounded-xl border border-dashed border-border bg-background/30 p-3 text-xs text-muted-foreground">
                              <b className="text-foreground">Explanation: </b>
                              {m.explanation}
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">

                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <th className="w-12 px-4 py-3 font-semibold">#</th>
                      <th className="px-4 py-3 font-semibold">Question</th>
                      <th className="px-4 py-3 font-semibold">Subject</th>
                      <th className="px-4 py-3 font-semibold text-center">Your Answer</th>
                      <th className="px-4 py-3 font-semibold text-center">Correct Answer</th>
                      <th className="px-4 py-3 font-semibold">Wrong On</th>
                      <th className="px-4 py-3 text-right font-semibold">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((w, idx) => {
                      const m = w.mcq!;
                      const open = openId === m.id;
                      const subj = w.subject_id ? (subjectName.get(w.subject_id) ?? "—") : "—";
                      const chap = w.chapter_id ? (chapterName.get(w.chapter_id) ?? "") : "";
                      const { date, time } = fmtDate(w.last_wrong_at);
                      const correct = w.correct_option ?? m.correct_option;
                      return (
                        <Fragment key={m.id}>
                          <tr
                            key={m.id}
                            className="border-b border-border/40 transition hover:bg-muted/30"
                          >
                            <td className="px-4 py-4 align-top font-mono text-xs text-muted-foreground">
                              {String(idx + 1).padStart(2, "0")}
                            </td>
                            <td className="px-4 py-4 align-top">
                              <p className="line-clamp-2 max-w-md font-medium">
                                {sanitizeOptionText(m.question)}
                              </p>
                              {chap && (
                                <p className="mt-1 text-[11px] text-muted-foreground">{chap}</p>
                              )}
                            </td>
                            <td className="px-4 py-4 align-top">
                              <span className="inline-flex items-center rounded-md bg-violet-500/10 px-2 py-0.5 text-[11px] font-semibold text-violet-500 ring-1 ring-violet-500/20">
                                {subj}
                              </span>
                            </td>
                            <td className="px-4 py-4 align-top text-center">
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rose-500/15 text-xs font-bold text-rose-500 ring-1 ring-rose-500/30">
                                {w.last_chosen_option ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-4 align-top text-center">
                              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/15 text-xs font-bold text-emerald-500 ring-1 ring-emerald-500/30">
                                {correct ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 py-4 align-top text-xs text-muted-foreground">
                              <div>{date}</div>
                              <div className="opacity-70">{time}</div>
                            </td>
                            <td className="px-4 py-4 align-top">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => setOpenId(open ? null : m.id)}
                                  className="glass flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground hover:text-foreground"
                                  title="View explanation"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => master(m.id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                                  title="Mark as mastered"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => remove(m.id)}
                                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-400/30 bg-rose-500/10 text-rose-500 hover:bg-rose-500/20"
                                  title="Remove"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => startReview([m.id])}
                                  className="bg-cta-gradient inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-glow"
                                  title="Review in Practice"
                                >
                                  Review
                                </button>
                              </div>
                            </td>
                          </tr>
                          {open && (
                            <tr
                              key={`${m.id}-exp`}
                              className="border-b border-border/40 bg-muted/20"
                            >
                              <td colSpan={7} className="px-4 py-4">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  {[
                                    { k: "A", t: sanitizeOptionText(m.option_a) },
                                    { k: "B", t: sanitizeOptionText(m.option_b) },
                                    { k: "C", t: sanitizeOptionText(m.option_c) },
                                    { k: "D", t: sanitizeOptionText(m.option_d) },
                                  ]
                                    .filter((o) => o.t && o.t.length > 0)
                                    .map((o) => {
                                      const isCorrect = correct === o.k;
                                      const isPicked = w.last_chosen_option === o.k;
                                      const tone = isCorrect
                                        ? "border-emerald-400/60 bg-emerald-400/10"
                                        : isPicked
                                          ? "border-rose-400/60 bg-rose-400/10"
                                          : "border-border bg-background/40";
                                      return (
                                        <div
                                          key={o.k}
                                          className={`rounded-xl border p-3 text-sm ${tone}`}
                                        >
                                          <span className="mr-2 font-display font-bold">
                                            {o.k}.
                                          </span>
                                          {o.t}
                                          {isCorrect && (
                                            <span className="ml-2 text-[10px] font-bold text-emerald-500">
                                              CORRECT
                                            </span>
                                          )}
                                          {isPicked && !isCorrect && (
                                            <span className="ml-2 text-[10px] font-bold text-rose-500">
                                              YOUR PICK
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })}
                                  {m.explanation && (
                                    <div className="rounded-xl border border-dashed border-border bg-background/30 p-3 text-xs text-muted-foreground sm:col-span-2">
                                      <b className="text-foreground">Explanation: </b>
                                      {m.explanation}
                                    </div>
                                  )}
                                  <div className="sm:col-span-2 flex justify-end">
                                    <button
                                      onClick={() => startReview([m.id])}
                                      className="bg-cta-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-glow"
                                    >
                                      <RotateCw className="h-3.5 w-3.5" /> Retry in Practice
                                    </button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}


            {items.length > visible && (
              <div className="flex justify-center border-t border-border/60 p-4">
                <button
                  onClick={() => setVisible((v) => v + 5)}
                  className="glass inline-flex items-center gap-2 rounded-full border border-border/60 px-5 py-2 text-xs font-semibold transition hover:bg-muted/40"
                >
                  Load More <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ---------- RIGHT COLUMN ---------- */}
        <aside className="space-y-5">
          {/* Review Progress */}
          <div className="glass shadow-card-soft rounded-3xl p-5">
            <h3 className="font-display text-base font-bold">Review Progress</h3>
            <div className="mt-4 flex items-center gap-4">
              <div className="relative flex-shrink-0">
                <ProgressRing percent={stats.reviewPct} />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-2xl font-bold tabular-nums">
                    {stats.reviewPct}%
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Completed
                  </span>
                </div>
              </div>
              <ul className="flex-1 space-y-2 text-xs">
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" /> Reviewed
                  </span>
                  <b className="tabular-nums">{stats.reviewed}</b>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500" /> Pending
                  </span>
                  <b className="tabular-nums">{stats.pending}</b>
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-rose-500" /> Remaining
                  </span>
                  <b className="tabular-nums">{stats.remaining}</b>
                </li>
              </ul>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="glass shadow-card-soft rounded-3xl p-5">
            <h3 className="font-display text-base font-bold">Quick Actions</h3>
            <div className="mt-3 space-y-2">
              {[
                {
                  icon: RotateCw,
                  title: "Review All Wrong",
                  hint: "Start reviewing all wrong answers",
                  onClick: () => startReview(items.map((i) => i.mcq!.id)),
                },
                {
                  icon: Layers,
                  title: "Practice All Chapters",
                  hint: "Practice MCQs from all chapters",
                  onClick: () => navigate({ to: "/mcq-practice" }),
                },
                {
                  icon: Target,
                  title: weakest[0] ? `Weakest: ${weakest[0].name}` : "Weakest Subjects",
                  hint: "Focus on your weak areas",
                  onClick: () => {
                    if (weakest[0]?.id && weakest[0].id !== "—") setSubjectId(weakest[0].id);
                  },
                },
              ].map(({ icon: Icon, title, hint, onClick }) => (
                <button
                  key={title}
                  onClick={onClick}
                  className="glass group flex w-full items-center gap-3 rounded-2xl border border-border/60 p-3 text-left transition hover:border-violet-400/40 hover:bg-violet-500/5"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-500 ring-1 ring-violet-500/20">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{title}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{hint}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-violet-500" />
                </button>
              ))}
            </div>
          </div>

          {/* Keep Going */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-rose-500 p-5 text-white shadow-glow">
            <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
            <div className="relative">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-300" />
                <h3 className="font-display text-base font-bold">Keep going!</h3>
              </div>
              <p className="mt-2 text-xs text-white/85">
                Every wrong answer you correct brings you closer to success.
              </p>
              <button
                onClick={() => navigate({ to: "/daily-progress" })}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/30 backdrop-blur transition hover:bg-white/25"
              >
                View Progress <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* Tips */}
          <div className="glass shadow-card-soft rounded-3xl p-5">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <h3 className="font-display text-base font-bold">Tips</h3>
            </div>
            {weakest.length > 0 ? (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Focus on <b className="text-foreground">{weakest[0].name}</b> — it accounts for{" "}
                <b className="text-foreground">{weakest[0].n}</b> of your pending wrong answers.
                Reviewing weak subjects regularly improves accuracy and builds concepts stronger.
              </p>
            ) : (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Review your wrong answers regularly to improve accuracy and build concepts stronger.
              </p>
            )}
            {weakest.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {weakest.slice(0, 3).map((w) => (
                  <span
                    key={w.id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border/60"
                  >
                    <Sparkles className="h-2.5 w-2.5" /> {w.name} · {w.n}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={() => navigate({ to: "/bookmarks" })}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-500 hover:underline"
            >
              <BookOpen className="h-3 w-3" /> Open Bookmarks
            </button>
          </div>
        </aside>
      </div>

      {reviewItems && reviewItems.length > 0 && (() => {
        const cur = reviewItems[Math.min(reviewIdx, reviewItems.length - 1)];
        const m = cur?.mcq;
        const correct = cur?.correct_option ?? m?.correct_option ?? null;
        const picked = cur?.last_chosen_option ?? null;
        const total = reviewItems.length;
        const isLast = reviewIdx >= total - 1;
        return (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <div className="glass shadow-card-soft w-full max-w-2xl rounded-3xl border border-border/60 p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Review Mode
                  </div>
                  <h3 className="font-display text-lg font-bold">
                    Question {reviewIdx + 1} of {total}
                  </h3>
                </div>
                <button
                  onClick={cancelReview}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
              {!m ? (
                <div className="mt-6 text-sm text-muted-foreground">Question unavailable.</div>
              ) : (
                <>
                  <p className="mt-4 text-sm font-medium">{sanitizeOptionText(m.question)}</p>
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {[
                      { k: "A", t: sanitizeOptionText(m.option_a) },
                      { k: "B", t: sanitizeOptionText(m.option_b) },
                      { k: "C", t: sanitizeOptionText(m.option_c) },
                      { k: "D", t: sanitizeOptionText(m.option_d) },
                    ]
                      .filter((o) => o.t && o.t.length > 0)
                      .map((o) => {
                        const isCorrect = correct === o.k;
                        const isPicked = picked === o.k;
                        const tone = isCorrect
                          ? "border-emerald-400/60 bg-emerald-400/10"
                          : isPicked
                            ? "border-rose-400/60 bg-rose-400/10"
                            : "border-border bg-background/40";
                        return (
                          <div key={o.k} className={`rounded-xl border p-3 text-sm ${tone}`}>
                            <span className="mr-2 font-display font-bold">{o.k}.</span>
                            {o.t}
                            {isCorrect && (
                              <span className="ml-2 text-[10px] font-bold text-emerald-500">
                                CORRECT
                              </span>
                            )}
                            {isPicked && !isCorrect && (
                              <span className="ml-2 text-[10px] font-bold text-rose-500">
                                YOUR PICK
                              </span>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  {m.explanation && (
                    <div className="mt-3 rounded-xl border border-dashed border-border bg-background/30 p-3 text-xs text-muted-foreground">
                      <b className="text-foreground">Explanation: </b>
                      {m.explanation}
                    </div>
                  )}
                </>
              )}
              <div className="mt-6 flex items-center justify-between gap-2">
                <button
                  onClick={() => setReviewIdx((i) => Math.max(0, i - 1))}
                  disabled={reviewIdx === 0 || reviewBusy}
                  className="glass rounded-full border border-border/60 px-4 py-2 text-xs font-semibold disabled:opacity-40"
                >
                  Previous
                </button>
                {!isLast ? (
                  <button
                    onClick={() => setReviewIdx((i) => Math.min(total - 1, i + 1))}
                    disabled={reviewBusy}
                    className="bg-cta-gradient inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold text-white shadow-glow"
                  >
                    Next <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={finishReview}
                    disabled={reviewBusy}
                    className="bg-cta-gradient inline-flex items-center gap-2 rounded-full px-5 py-2 text-xs font-semibold text-white shadow-glow disabled:opacity-60"
                  >
                    {reviewBusy ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Finishing…
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" /> Finish Review
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
