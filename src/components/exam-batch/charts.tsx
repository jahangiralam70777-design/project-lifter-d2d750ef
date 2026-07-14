import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { cn } from "@/lib/utils";

// Animated numeric counter
export function AnimatedCounter({
  value,
  duration = 1.1,
  format = (n) => n.toLocaleString(),
  className,
  suffix = "",
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const durMs = duration * 1000;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(display)}
      {suffix}
    </span>
  );
}

// SVG Sparkline
export function Sparkline({
  points,
  className,
  strokeClass = "stroke-white",
  fillClass = "fill-white/25",
  height = 40,
  ariaLabel,
}: {
  points: number[];
  className?: string;
  strokeClass?: string;
  fillClass?: string;
  height?: number;
  ariaLabel?: string;
}) {
  const w = 100;
  const h = height;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  const step = w / Math.max(1, points.length - 1);
  const coords = points.map((p, i) => [i * step, h - ((p - min) / range) * (h - 4) - 2] as const);
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-10 w-full", className)}
      role="img"
      aria-label={ariaLabel ?? `Sparkline of ${points.length} data points`}
    >
      <path d={area} className={fillClass} />
      <motion.path
        d={line}
        className={cn("fill-none", strokeClass)}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
    </svg>
  );
}

// Mini vertical bars
export function MiniBars({
  points,
  className,
  barClass = "bg-cta-gradient",
  height = 44,
}: {
  points: number[];
  className?: string;
  barClass?: string;
  height?: number;
}) {
  const max = Math.max(...points, 1);
  return (
    <div className={cn("flex items-end gap-0.5", className)} style={{ height }}>
      {points.map((p, i) => (
        <motion.div
          key={i}
          initial={{ height: 0 }}
          animate={{ height: `${(p / max) * 100}%` }}
          transition={{ duration: 0.5, delay: i * 0.03, ease: "easeOut" }}
          className={cn("min-w-[3px] flex-1 rounded-t-sm", barClass)}
        />
      ))}
    </div>
  );
}

// Donut / progress ring
export function DonutChart({
  value,
  size = 96,
  stroke = 10,
  label,
  sub,
  className,
  ariaLabel,
}: {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  label?: string;
  sub?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * (Math.max(0, Math.min(100, value)) / 100);
  return (
    <div className={cn("relative inline-flex flex-col items-center", className)}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        role="img"
        aria-label={ariaLabel ?? `${label ?? "Progress"}: ${value} percent`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="fill-none stroke-muted"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="fill-none stroke-[url(#eb-donut-grad)]"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c - dash }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
        <defs>
          <linearGradient id="eb-donut-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="oklch(0.68 0.22 300)" />
            <stop offset="100%" stopColor="oklch(0.62 0.24 260)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-lg font-bold tabular-nums">{value}%</span>
        {label && (
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {label}
          </span>
        )}
      </div>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// Line chart with grid
export function LineChart({
  series,
  className,
  height = 200,
  ariaLabel,
}: {
  series: { label: string; points: number[]; color?: string }[];
  className?: string;
  height?: number;
  ariaLabel?: string;
}) {
  const w = 400;
  const h = height;
  const all = series.flatMap((s) => s.points);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = Math.max(1, max - min);
  const len = series[0]?.points.length ?? 1;
  const step = w / Math.max(1, len - 1);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={cn("h-52 w-full", className)}
      role="img"
      aria-label={
        ariaLabel ??
        `Line chart: ${series.map((s) => s.label).join(", ")} over ${len} points`
      }
    >
      {[0.2, 0.4, 0.6, 0.8].map((y) => (
        <line
          key={y}
          x1={0}
          x2={w}
          y1={h * y}
          y2={h * y}
          className="stroke-border/60"
          strokeDasharray="2 4"
          strokeWidth={0.5}
        />
      ))}
      {series.map((s, si) => {
        const coords = s.points.map(
          (p, i) => [i * step, h - ((p - min) / range) * (h - 20) - 10] as const,
        );
        const d = coords
          .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
          .join(" ");
        return (
          <motion.path
            key={s.label}
            d={d}
            fill="none"
            stroke={s.color ?? (si === 0 ? "oklch(0.65 0.22 290)" : "oklch(0.7 0.18 190)")}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.1, ease: "easeOut", delay: si * 0.15 }}
          />
        );
      })}
    </svg>
  );
}

// Bar chart (horizontal category list)
export function BarChart({
  data,
  className,
}: {
  data: { label: string; value: number }[];
  className?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className={cn("space-y-3", className)}>
      {data.map((d, i) => (
        <li key={d.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-semibold">{d.label}</span>
            <span className="tabular-nums text-muted-foreground">{d.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(d.value / max) * 100}%` }}
              transition={{ duration: 0.7, delay: i * 0.06, ease: "easeOut" }}
              className="bg-cta-gradient h-full"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Stacked distribution bar
export function StackBar({
  segments,
  className,
}: {
  segments: { label: string; value: number; className: string }[];
  className?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ width: 0 }}
            animate={{ width: `${(s.value / total) * 100}%` }}
            transition={{ duration: 0.7, delay: i * 0.05, ease: "easeOut" }}
            className={s.className}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", s.className)} />
            <span className="font-semibold">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">{s.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
