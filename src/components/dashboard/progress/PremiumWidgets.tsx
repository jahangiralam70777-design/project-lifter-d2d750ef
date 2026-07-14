import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Activity,
  Award,
  ArrowRight,
  BookOpen,
  Brain,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Flame,
  Gauge,
  Goal,
  ListChecks,
  Medal,
  Play,
  Rocket,
  Settings2,
  Sparkles,
  Star,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { CountUp } from "@/components/realtime/CountUp";

/* ---------- types matching server payload ---------- */
type Period = {
  attempts?: number;
  mcqs?: number;
  quizzes?: number;
  mocks?: number;
  accuracy?: number;
  studyMinutes?: number;
};
type Today = Period & {
  streak?: number;
  bestStreak?: number;
  chaptersTouched?: number;
  customExams?: number;
};
type Week = Period & { deltaAccuracy?: number; deltaAttempts?: number; bars?: number[] };
type Month = Period & { activeDays?: number };
type Totals = {
  accuracy: number;
  avgScore: number;
  studyMinutes: number;
  correct: number;
  wrong: number;
  mcqs: number;
  quizzes: number;
  mocks: number;
  chaptersCompleted: number;
  subjectsCovered: number;
  answered?: number;
  attempts?: number;
};
type SeriesPoint = { date: string; minutes: number; accuracy?: number; attempts?: number };
type SubjectAgg = {
  id: string;
  name: string;
  level?: string;
  color?: string | null;
  completionPct: number;
  avgScore: number;
  weakChapters: number;
  completedChapters: number;
  totalChapters: number;
  attempts: number;
};
type TimelineItem = {
  id: string;
  at: string;
  kind: string;
  kindLabel?: string;
  title?: string;
  score?: number;
  subjectName?: string | null;
};

/* ---------- shared ---------- */
function fmtMinutes(min = 0) {
  if (!min) return "0m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60),
    m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}
function clamp(n: number, lo = 0, hi = 100) {
  return Math.min(hi, Math.max(lo, n));
}

/* ===========================================================
 * HERO BANNER — premium "Keep going" card mirroring reference
 * =========================================================== */
export function HeroBanner({
  name,
  today,
  week,
}: {
  name?: string | null;
  today?: Today;
  week?: Week;
}) {
  const streak = today?.streak ?? 0;
  const studyMin = today?.studyMinutes ?? 0;
  const weekAcc = week?.accuracy ?? 0;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-br from-[oklch(0.45_0.22_295)] via-[oklch(0.4_0.2_280)] to-[oklch(0.35_0.18_260)] p-6 text-white shadow-[0_30px_80px_-30px_oklch(0.4_0.22_280)]">
      <div className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-[var(--neon-pink)]/30 blur-3xl" />
      <div className="relative grid grid-cols-1 items-center gap-6 md:grid-cols-[1fr_auto_auto]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-widest backdrop-blur">
            <Sparkles className="h-3 w-3" /> Daily focus
          </div>
          <h3 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
            Keep going{name ? `, ${name.split(" ")[0]}` : ""}! <span aria-hidden>👋</span>
          </h3>
          <p className="mt-1 max-w-md text-sm text-white/80">
            Consistency is the key to success. You've studied {fmtMinutes(studyMin)} today —
            {weekAcc ? ` ${weekAcc}% weekly accuracy.` : " let's start a session."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/mcq-practice"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-bold text-[oklch(0.4_0.22_280)] shadow-lg transition-transform hover:-translate-y-0.5"
            >
              <Play className="h-3.5 w-3.5" /> Resume practice
            </Link>
            <Link
              to="/quiz"
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 bg-white/10 px-4 py-2 text-xs font-bold backdrop-blur transition-colors hover:bg-white/20"
            >
              Start a quiz <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/80">
            <Flame className="h-3.5 w-3.5 text-amber-300" /> Study Streak
          </div>
          <p className="font-display mt-2 text-5xl font-bold leading-none">
            <CountUp value={streak} />
          </p>
          <p className="mt-1 text-[11px] text-white/70">Days</p>
        </div>
        <div className="hidden h-32 w-32 items-center justify-center rounded-2xl bg-white/5 backdrop-blur md:flex">
          <Target className="h-20 w-20 text-white/70" strokeWidth={1.2} />
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
 * SCORE CARDS — Consistency / Productivity / Momentum
 * =========================================================== */
function scoreColor(v: number) {
  if (v >= 80) return "oklch(0.72 0.18 150)";
  if (v >= 55) return "oklch(0.78 0.16 85)";
  return "oklch(0.7 0.2 25)";
}
function ScoreRing({
  value,
  label,
  tone,
  icon: Icon,
  hint,
}: {
  value: number;
  label: string;
  tone: string;
  icon: typeof Gauge;
  hint: string;
}) {
  const C = 2 * Math.PI * 36;
  return (
    <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-30 blur-2xl"
        style={{ background: tone }}
      />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <Icon className="h-3.5 w-3.5" /> {label}
          </div>
          <p className="font-display mt-3 text-3xl font-bold">
            <CountUp value={value} />%
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
        </div>
        <div className="relative h-20 w-20">
          <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              className="text-muted/30"
            />
            <circle
              cx="40"
              cy="40"
              r="36"
              stroke={tone}
              strokeWidth="6"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${(value / 100) * C} ${C}`}
              style={{ transition: "stroke-dasharray 700ms ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center font-display text-sm font-bold">
            {value}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ScoreRow({
  today,
  week,
  month,
  totals,
}: {
  today?: Today;
  week?: Week;
  month?: Month;
  totals?: Totals;
}) {
  const consistency = useMemo(() => {
    const active = month?.activeDays ?? 0;
    const streakBonus = clamp((today?.streak ?? 0) * 3, 0, 30);
    return clamp(Math.round((active / 30) * 70 + streakBonus));
  }, [month, today]);
  const productivity = useMemo(() => {
    const acc = totals?.accuracy ?? 0;
    const min = clamp((week?.studyMinutes ?? 0) / 6, 0, 50);
    const solved = clamp((week?.mcqs ?? 0) / 2, 0, 40);
    return clamp(Math.round(acc * 0.4 + min * 0.6 + solved * 0.4));
  }, [totals, week]);
  const momentum = useMemo(() => {
    const da = week?.deltaAccuracy ?? 0;
    const dat = week?.deltaAttempts ?? 0;
    const base = 50 + da * 1.5 + dat * 2;
    return clamp(Math.round(base));
  }, [week]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <ScoreRing
        value={consistency}
        label="Consistency Score"
        tone={scoreColor(consistency)}
        icon={Gauge}
        hint={`${month?.activeDays ?? 0} active days · ${today?.streak ?? 0}-day streak`}
      />
      <ScoreRing
        value={productivity}
        label="Productivity Score"
        tone={scoreColor(productivity)}
        icon={Zap}
        hint={`${week?.mcqs ?? 0} MCQs · ${fmtMinutes(week?.studyMinutes ?? 0)} this week`}
      />
      <ScoreRing
        value={momentum}
        label="Learning Momentum"
        tone={scoreColor(momentum)}
        icon={Rocket}
        hint={`${(week?.deltaAccuracy ?? 0) >= 0 ? "+" : ""}${week?.deltaAccuracy ?? 0}% acc · ${(week?.deltaAttempts ?? 0) >= 0 ? "+" : ""}${week?.deltaAttempts ?? 0} sessions vs last week`}
      />
    </div>
  );
}

/* ===========================================================
 * GOAL TRACKER — Daily / Weekly / Monthly completion
 * =========================================================== */
export function GoalTracker({ today, week, month }: { today?: Today; week?: Week; month?: Month }) {
  const items = [
    {
      label: "Daily goal",
      icon: Target,
      current: today?.mcqs ?? 0,
      target: 20,
      unit: "MCQs",
      tone: "var(--neon-purple)",
    },
    {
      label: "Weekly goal",
      icon: CalendarDays,
      current: week?.mcqs ?? 0,
      target: 100,
      unit: "MCQs",
      tone: "var(--neon-blue)",
    },
    {
      label: "Monthly goal",
      icon: Trophy,
      current: month?.mcqs ?? 0,
      target: 400,
      unit: "MCQs",
      tone: "var(--neon-pink)",
    },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((g) => {
        const pct = clamp(Math.round((g.current / g.target) * 100));
        const done = pct >= 100;
        return (
          <div key={g.label} className="glass shadow-card-soft rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <g.icon className="h-3.5 w-3.5" /> {g.label}
              </div>
              {done ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" /> Done
                </span>
              ) : (
                <span className="text-[11px] font-bold" style={{ color: g.tone }}>
                  {pct}%
                </span>
              )}
            </div>
            <p className="font-display mt-3 text-2xl font-bold">
              <CountUp value={g.current} />{" "}
              <span className="text-base text-muted-foreground">
                / {g.target} {g.unit}
              </span>
            </p>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${g.tone}, oklch(0.7 0.2 260))`,
                  boxShadow: `0 0 12px ${g.tone}`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===========================================================
 * SUBJECT RANKING — Strongest / Average / Weakest
 * =========================================================== */
export function SubjectRanking({ subjects }: { subjects: SubjectAgg[] }) {
  const ranked = useMemo(() => {
    const active = subjects.filter((s) => s.attempts > 0);
    const sorted = [...active].sort((a, b) => b.avgScore - a.avgScore);
    return {
      strongest: sorted.slice(0, 3),
      weakest: [...sorted].reverse().slice(0, 3),
      average: sorted.slice(3, 6),
    };
  }, [subjects]);
  const cols: { title: string; tone: string; icon: typeof Medal; list: SubjectAgg[] }[] = [
    { title: "Strongest", tone: "oklch(0.72 0.18 150)", icon: Trophy, list: ranked.strongest },
    { title: "Average", tone: "oklch(0.78 0.16 85)", icon: Medal, list: ranked.average },
    { title: "Needs work", tone: "oklch(0.7 0.2 25)", icon: Target, list: ranked.weakest },
  ];
  return (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display flex items-center gap-2 text-lg font-bold">
          <Award className="h-4 w-4 text-[var(--neon-purple)]" /> Subject Performance Ranking
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Auto-ranked
        </span>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        {cols.map((c) => (
          <div key={c.title} className="rounded-2xl bg-background/40 p-4">
            <div
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: c.tone }}
            >
              <c.icon className="h-3.5 w-3.5" /> {c.title}
            </div>
            <ul className="mt-3 space-y-2">
              {c.list.length ? (
                c.list.map((s, i) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-2 rounded-xl bg-background/50 px-3 py-2 text-xs"
                  >
                    <span
                      className="font-display flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-bold text-white"
                      style={{
                        background: `linear-gradient(135deg, ${c.tone}, oklch(0.55 0.2 270))`,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span className="line-clamp-1 flex-1">{s.name}</span>
                    <span className="font-display font-bold" style={{ color: c.tone }}>
                      {s.avgScore}%
                    </span>
                  </li>
                ))
              ) : (
                <li className="rounded-xl border border-dashed border-border p-3 text-center text-[10px] text-muted-foreground">
                  Not enough data yet.
                </li>
              )}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================
 * ACHIEVEMENTS — dynamic badges
 * =========================================================== */
export function Achievements({
  today,
  totals,
  month,
}: {
  today?: Today;
  totals?: Totals;
  month?: Month;
}) {
  const streak = today?.streak ?? 0;
  const best = today?.bestStreak ?? 0;
  const acc = totals?.accuracy ?? 0;
  const mocks = totals?.mocks ?? 0;
  const active = month?.activeDays ?? 0;
  const badges = [
    {
      label: "7-Day Streak",
      icon: Flame,
      unlocked: best >= 7 || streak >= 7,
      tone: "oklch(0.78 0.16 60)",
    },
    { label: "30-Day Streak", icon: Flame, unlocked: best >= 30, tone: "oklch(0.7 0.2 25)" },
    { label: "Accuracy Master", icon: Target, unlocked: acc >= 85, tone: "oklch(0.72 0.18 150)" },
    { label: "Mock Champion", icon: Trophy, unlocked: mocks >= 5, tone: "var(--neon-pink)" },
    { label: "Consistency Expert", icon: Star, unlocked: active >= 20, tone: "var(--neon-purple)" },
    {
      label: "Knowledge Builder",
      icon: Brain,
      unlocked: (totals?.chaptersCompleted ?? 0) >= 10,
      tone: "var(--neon-blue)",
    },
  ];
  return (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-display flex items-center gap-2 text-lg font-bold">
          <Medal className="h-4 w-4 text-amber-400" /> Achievements
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {badges.filter((b) => b.unlocked).length} / {badges.length} unlocked
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {badges.map((b) => (
          <div
            key={b.label}
            className={`rounded-2xl border p-3 text-center transition-all ${b.unlocked ? "border-border bg-background/50" : "border-dashed border-border/40 bg-background/20 opacity-50"}`}
          >
            <span
              className={`mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-white ${b.unlocked ? "shadow-glow" : ""}`}
              style={{
                background: b.unlocked
                  ? `linear-gradient(135deg, ${b.tone}, oklch(0.55 0.2 270))`
                  : "var(--muted)",
              }}
            >
              <b.icon className="h-4 w-4" />
            </span>
            <p className="mt-2 text-[10px] font-bold">{b.label}</p>
            <p className="text-[9px] text-muted-foreground">{b.unlocked ? "Unlocked" : "Locked"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================
 * FOCUS ANALYTICS — best hour/day/avg session
 * =========================================================== */
export function FocusAnalytics({
  timeline,
  month,
  productiveDay,
}: {
  timeline: TimelineItem[];
  month?: Month;
  productiveDay?: string | null;
}) {
  const stats = useMemo(() => {
    const hours = new Array(24).fill(0);
    let sessions = 0,
      totalMin = 0;
    for (const t of timeline) {
      const h = new Date(t.at).getHours();
      hours[h] += 1;
      sessions += 1;
    }
    totalMin = month?.studyMinutes ?? 0;
    const bestHour = hours.indexOf(Math.max(...hours));
    const avgSession = sessions ? Math.round(totalMin / sessions) : 0;
    const hourLabel = sessions
      ? `${bestHour.toString().padStart(2, "0")}:00 – ${((bestHour + 1) % 24).toString().padStart(2, "0")}:00`
      : "—";
    return { hourLabel, avgSession, sessions };
  }, [timeline, month]);
  const items = [
    {
      icon: Timer,
      label: "Most productive hour",
      value: stats.hourLabel,
      tone: "var(--neon-purple)",
    },
    {
      icon: CalendarDays,
      label: "Most productive day",
      value: productiveDay ?? "—",
      tone: "var(--neon-blue)",
    },
    {
      icon: Activity,
      label: "Avg session length",
      value: stats.avgSession ? `${stats.avgSession}m` : "—",
      tone: "oklch(0.78 0.15 200)",
    },
  ];
  return (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <h3 className="font-display flex items-center gap-2 text-lg font-bold">
        <Brain className="h-4 w-4 text-[var(--neon-purple)]" /> Focus Analytics
      </h3>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.label} className="rounded-2xl bg-background/40 p-4">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-glow"
              style={{ background: `linear-gradient(135deg, ${it.tone}, oklch(0.55 0.2 270))` }}
            >
              <it.icon className="h-4 w-4" />
            </span>
            <p className="mt-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              {it.label}
            </p>
            <p className="font-display text-lg font-bold">{it.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ===========================================================
 * PERFORMANCE COMPARISON — this week vs last, this month vs last
 * =========================================================== */
export function PerformanceComparison({ series }: { series: SeriesPoint[] }) {
  const cmp = useMemo(() => {
    const sum = (arr: SeriesPoint[], pick: (p: SeriesPoint) => number) =>
      arr.reduce((s, p) => s + pick(p), 0);
    const last7 = series.slice(-7),
      prev7 = series.slice(-14, -7);
    const last30 = series.slice(-30),
      prev30 = series.slice(-60, -30);
    const mk = (a: SeriesPoint[], b: SeriesPoint[]) => {
      const am = sum(a, (p) => p.minutes),
        bm = sum(b, (p) => p.minutes);
      const aAcc = a.length ? Math.round(sum(a, (p) => p.accuracy ?? 0) / a.length) : 0;
      const bAcc = b.length ? Math.round(sum(b, (p) => p.accuracy ?? 0) / b.length) : 0;
      const aSes = sum(a, (p) => p.attempts ?? 0),
        bSes = sum(b, (p) => p.attempts ?? 0);
      return {
        minutes: am,
        minutesDelta: am - bm,
        accuracy: aAcc,
        accuracyDelta: aAcc - bAcc,
        sessions: aSes,
        sessionsDelta: aSes - bSes,
      };
    };
    return { week: mk(last7, prev7), month: mk(last30, prev30) };
  }, [series]);
  const Card = ({ title, c }: { title: string; c: typeof cmp.week }) => (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <h3 className="font-display flex items-center gap-2 text-lg font-bold">
        <TrendingUp className="h-4 w-4 text-[var(--neon-blue)]" /> {title}
      </h3>
      <div className="mt-4 grid grid-cols-3 gap-3">
        {[
          { label: "Study time", val: fmtMinutes(c.minutes), delta: c.minutesDelta, unit: "m" },
          { label: "Accuracy", val: `${c.accuracy}%`, delta: c.accuracyDelta, unit: "%" },
          { label: "Sessions", val: c.sessions, delta: c.sessionsDelta, unit: "" },
        ].map((r) => {
          const up = r.delta >= 0;
          return (
            <div key={r.label} className="rounded-2xl bg-background/40 p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {r.label}
              </p>
              <p className="font-display mt-1 text-lg font-bold">{r.val}</p>
              <p
                className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold ${up ? "text-emerald-500" : "text-rose-500"}`}
              >
                {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{" "}
                {up ? "+" : ""}
                {r.delta}
                {r.unit}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Card title="This week vs last" c={cmp.week} />
      <Card title="This month vs last" c={cmp.month} />
    </div>
  );
}

/* ===========================================================
 * QUICK ACTIONS
 * =========================================================== */
export function QuickActions({ wrongCount }: { wrongCount: number }) {
  const items = [
    {
      to: "/mcq-practice",
      icon: Play,
      label: "Resume Last Session",
      hint: "Continue practicing",
      tone: "var(--neon-purple)",
    },
    {
      to: "/wrong-questions",
      icon: XCircle,
      label: "Review Wrong Answers",
      hint: `${wrongCount} unresolved`,
      tone: "oklch(0.7 0.2 25)",
    },
    {
      to: "/quiz",
      icon: ListChecks,
      label: "Continue Study Plan",
      hint: "Today's tasks",
      tone: "var(--neon-blue)",
    },
    {
      to: "/mock-test",
      icon: Trophy,
      label: "Take a Mock Test",
      hint: "Full syllabus",
      tone: "var(--neon-pink)",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((it) => (
        <Link
          key={it.label}
          to={it.to}
          className="glass shadow-card-soft group relative overflow-hidden rounded-2xl p-4 transition-transform hover:-translate-y-0.5"
        >
          <div
            className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-60"
            style={{ background: it.tone }}
          />
          <div className="flex items-center gap-3">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-glow"
              style={{ background: `linear-gradient(135deg, ${it.tone}, oklch(0.55 0.2 270))` }}
            >
              <it.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-sm font-bold leading-tight">{it.label}</p>
              <p className="text-[10px] text-muted-foreground">{it.hint}</p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ===========================================================
 * STUDY PLAN — collapsible, localStorage-persisted tasks
 * =========================================================== */
type PlanTask = { id: string; title: string; tag: string; due?: string; done: boolean };
const PLAN_KEY = "dp-study-plan-v1";
const PLAN_ENABLED_KEY = "dp-study-plan-enabled";
const PLAN_COLLAPSED_KEY = "dp-study-plan-collapsed";

function defaultPlan(): PlanTask[] {
  return [
    { id: "t1", title: "MCQ Practice — Financial Accounting", tag: "30 MCQs", done: false },
    { id: "t2", title: "Quiz — Cost Accounting", tag: "15 Questions", done: false },
    { id: "t3", title: "Read Notes — Taxation", tag: "Chapter 3", done: false },
    { id: "t4", title: "Mock Test — Full Syllabus", tag: "Not Started", done: false },
    { id: "t5", title: "Review Wrong Answers", tag: "Not Started", done: false },
  ];
}

function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [val, setVal] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {
      /* ignore */
    }
  }, [key, val]);
  return [val, setVal];
}

export function StudyPlanPanel() {
  const [enabled, setEnabled] = useLocalStorage<boolean>(PLAN_ENABLED_KEY, true);
  const [collapsed, setCollapsed] = useLocalStorage<boolean>(PLAN_COLLAPSED_KEY, false);
  const [tasks, setTasks] = useLocalStorage<PlanTask[]>(PLAN_KEY, defaultPlan());

  if (!enabled) {
    return (
      <div className="glass flex items-center justify-between rounded-2xl p-4 text-xs">
        <span className="text-muted-foreground">Study Plan is hidden.</span>
        <button
          onClick={() => setEnabled(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] px-3 py-1.5 font-bold text-white"
        >
          <Settings2 className="h-3.5 w-3.5" /> Enable
        </button>
      </div>
    );
  }
  const completed = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const toggle = (id: string) =>
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));

  return (
    <div className="glass shadow-card-soft overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between gap-3 border-b border-border/40 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-glow">
            <Goal className="h-4 w-4" />
          </span>
          <div>
            <h3 className="font-display text-lg font-bold">Today's Plan</h3>
            <p className="text-[11px] text-muted-foreground">
              {completed}/{tasks.length} Completed · {pct}%
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="hidden h-2 w-40 overflow-hidden rounded-full bg-muted sm:block">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] transition-all duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="glass rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setEnabled(false)}
            className="glass rounded-lg px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
            title="Hide plan"
          >
            Hide
          </button>
        </div>
      </div>
      {!collapsed && (
        <ul className="divide-y divide-border/40">
          {tasks.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 p-4 transition-colors hover:bg-background/40"
            >
              <button
                onClick={() => toggle(t.id)}
                aria-label="toggle"
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${t.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border"}`}
              >
                {t.done && <CheckCircle2 className="h-3.5 w-3.5" />}
              </button>
              <p
                className={`flex-1 text-sm ${t.done ? "text-muted-foreground line-through" : "font-semibold"}`}
              >
                {t.title}
              </p>
              <span className="text-[11px] text-muted-foreground">{t.tag}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
