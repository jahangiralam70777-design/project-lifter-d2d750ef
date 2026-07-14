import { useMemo } from "react";
import { motion } from "motion/react";
import { Area, AreaChart, ResponsiveContainer, Tooltip as RTooltip, XAxis } from "recharts";
import { Activity, Brain, Clock, Gauge, Target, TrendingUp, Trophy } from "lucide-react";
import { PreviewBadge, fmtMinutes, type Overview } from "./primitives";

function Ring({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <defs>
          <linearGradient id="wRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--neon-purple)" />
            <stop offset="100%" stopColor="var(--neon-blue)" />
          </linearGradient>
        </defs>
        <circle
          cx="40"
          cy="40"
          r={r}
          strokeWidth="7"
          fill="none"
          className="text-muted/50"
          stroke="currentColor"
        />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          stroke="url(#wRing)"
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${(value / 100) * c} ${c}` }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ filter: "drop-shadow(0 0 6px var(--neon-purple))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-xl font-bold tabular-nums">{value}%</span>
      </div>
    </div>
  );
}

function Tile({
  icon,
  label,
  value,
  sub,
  accent,
  preview,
  delay = 0,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
  preview?: boolean;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className="glass shadow-card-soft group relative overflow-hidden rounded-3xl p-4 transition-transform duration-200 hover:-translate-y-1"
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-30 blur-3xl transition-opacity group-hover:opacity-60"
        style={{ background: accent }}
      />
      <div className="relative flex items-center justify-between">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-2xl text-white"
          style={{ background: `linear-gradient(135deg, ${accent}, oklch(0.55 0.2 270))` }}
        >
          {icon}
        </span>
        {preview && <PreviewBadge />}
      </div>
      <p className="relative mt-3 font-display text-2xl font-bold tabular-nums">{value}</p>
      <p className="relative text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {sub && <p className="relative mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </motion.div>
  );
}

export function McqDashboardWidgets({ data, loading }: { data?: Overview; loading: boolean }) {
  const totals = data?.totals;
  const trend = data?.trend ?? [];
  const accuracy = Math.round(totals?.accuracy ?? 0);
  const answered = totals?.answered ?? 0;
  const sessions = totals?.attempts ?? 0;
  const improvement = totals?.improvementPct ?? 0;

  const rankPct = useMemo(
    () => Math.min(99, Math.max(5, Math.round(accuracy * 0.9 + sessions))),
    [accuracy, sessions],
  );
  const forecast = useMemo(
    () => Math.min(100, accuracy + Math.max(0, improvement) + 8),
    [accuracy, improvement],
  );

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="glass h-28 animate-pulse rounded-3xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      {/* Progress ring + weekly graph hero */}
      <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5 lg:col-span-5">
        <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-[var(--neon-purple)]/20 blur-3xl" />
        <div className="relative flex items-center gap-5">
          <Ring value={accuracy} />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Overall accuracy
            </p>
            <p className="font-display text-3xl font-bold text-gradient">{accuracy}%</p>
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
              <TrendingUp className="h-3.5 w-3.5" /> {improvement >= 0 ? "+" : ""}
              {improvement}% this week
            </p>
          </div>
        </div>
        <div className="relative mt-3 h-20">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id="wArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--neon-blue)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="var(--neon-blue)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" hide />
              <RTooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--foreground)" }}
              />
              <Area
                type="monotone"
                dataKey="accuracy"
                stroke="var(--neon-blue)"
                strokeWidth={2}
                fill="url(#wArea)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Metric tiles */}
      <div className="grid grid-cols-2 gap-3 lg:col-span-7 lg:grid-cols-3">
        <Tile
          icon={<Gauge className="h-4 w-4" />}
          label="Accuracy"
          value={`${accuracy}%`}
          accent="var(--neon-blue)"
          delay={0.05}
        />
        <Tile
          icon={<Target className="h-4 w-4" />}
          label="MCQs Solved"
          value={answered.toLocaleString()}
          accent="var(--neon-purple)"
          delay={0.1}
        />
        <Tile
          icon={<Activity className="h-4 w-4" />}
          label="Sessions"
          value={sessions.toLocaleString()}
          accent="oklch(0.75 0.18 150)"
          delay={0.15}
        />
        <Tile
          icon={<Clock className="h-4 w-4" />}
          label="Time Spent"
          value={fmtMinutes(totals?.durationSeconds ?? 0)}
          accent="oklch(0.82 0.16 85)"
          delay={0.2}
        />
        <Tile
          icon={<Trophy className="h-4 w-4" />}
          label="Rank Prediction"
          value={`Top ${100 - rankPct}%`}
          accent="var(--neon-pink)"
          preview
          delay={0.25}
        />
        <Tile
          icon={<Brain className="h-4 w-4" />}
          label="Score Forecast"
          value={`${forecast}%`}
          accent="var(--neon-purple)"
          preview
          delay={0.3}
        />
      </div>
    </div>
  );
}
