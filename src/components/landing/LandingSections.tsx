import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSection, useSetting } from "@/hooks/use-site-content";
import { Facebook } from "lucide-react";
import {
  Brain,
  LineChart,
  BookOpenCheck,
  GraduationCap,
  Users,
  CircleHelp,
  ClipboardList,
  Trophy,
  Video,
  Layers,
  Sparkles,
  Star,
  Crown,
  Flame,
  Smartphone,
  Apple,
  Plus,
  Minus,
  ArrowRight,
  ArrowUp,
  Twitter,
  Github,
  Youtube,
  Instagram,
  Linkedin,
  Quote,
  type LucideIcon,
} from "lucide-react";

/* ---------- Shared building blocks ---------- */

function SectionEyebrow({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground backdrop-blur-xl">
      <Icon className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
      {label}
    </div>
  );
}

function GradientHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
      {children}
    </h2>
  );
}

function Orbs() {
  return (
    <>
      <div className="pointer-events-none absolute -left-20 top-10 -z-10 h-72 w-72 rounded-full bg-[var(--neon-purple)]/20 blur-3xl animate-pulse-glow" />
      <div className="pointer-events-none absolute -right-10 bottom-10 -z-10 h-80 w-80 rounded-full bg-[var(--neon-blue)]/20 blur-3xl animate-pulse-glow" />
    </>
  );
}

function GridLines() {
  return (
    <div
      className="pointer-events-none absolute inset-0 -z-10 opacity-[0.18]"
      style={{
        backgroundImage:
          "linear-gradient(to right, color-mix(in oklab, var(--neon-purple) 30%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--neon-blue) 30%, transparent) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
        maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black 30%, transparent 90%)",
      }}
    />
  );
}

function Particles({ count = 14 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }).map((_, i) => {
        const left = (i * 47) % 100;
        const top = (i * 31) % 100;
        const size = 3 + (i % 4) * 2;
        const color = i % 2 ? "var(--neon-blue)" : "var(--neon-purple)";
        return (
          <span
            key={i}
            className="absolute rounded-full opacity-60 animate-float"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: size,
              height: size,
              background: color,
              boxShadow: `0 0 ${size * 3}px ${color}`,
              animationDelay: `${(i % 6) * 0.6}s`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ---------- 1 · Why Choose Us ---------- */

const WHY = [
  {
    icon: Brain,
    title: "ICAB Syllabus Focused",
    desc: "Every chapter, question and note is mapped to the ICAB Certificate Level syllabus — nothing extra, nothing missing.",
    bullets: ["Chapter-wise practice", "Syllabus coverage tracker", "Topic-wise revision plan"],
    metric: { label: "Accuracy lift", value: "+24%" },
    spark: [12, 18, 14, 22, 19, 28, 26, 34, 32, 40, 38, 47],
  },
  {
    icon: LineChart,
    title: "Mock Test Analytics",
    desc: "After every mock you get a clear breakdown — score, time per question, weak chapters and what to revise next.",
    bullets: ["Time per question", "Subject-wise score", "Weak chapter report"],
    metric: { label: "Avg score", value: "78%" },
    spark: [40, 38, 44, 41, 49, 52, 50, 58, 61, 65, 72, 78],
  },
  {
    icon: BookOpenCheck,
    title: "Chapter-wise Practice",
    desc: "Practice Financial Accounting, Audit, Taxation and Business Law chapter by chapter, with proper explanations.",
    bullets: ["All Certificate subjects", "Solved explanations", "Bookmark & revisit"],
    metric: { label: "Chapters", value: "1,840" },
    spark: [10, 14, 12, 18, 16, 22, 24, 28, 26, 32, 36, 42],
  },
  {
    icon: GraduationCap,
    title: "Notes, Flash Cards & Classes",
    desc: "Short notes, flash cards and recorded classes prepared by teachers who have actually taught ICAB students.",
    bullets: ["Teacher-made short notes", "Recorded video classes", "Flash card revision"],
    metric: { label: "Resources", value: "12.4k" },
    spark: [30, 28, 35, 33, 40, 44, 42, 50, 56, 60, 64, 70],
  },
] as const;

function Spark({ data }: { data: readonly number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * 100;
      const y = 30 - ((v - min) / (max - min || 1)) * 28;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" className="h-10 w-full overflow-visible">
      <defs>
        <linearGradient id={`sg-${pts.length}`} x1="0" x2="1">
          <stop offset="0%" stopColor="var(--neon-purple)" />
          <stop offset="100%" stopColor="var(--neon-blue)" />
        </linearGradient>
      </defs>
      <polyline
        points={pts}
        fill="none"
        stroke={`url(#sg-${pts.length})`}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function WhyCard({ item, flip }: { item: (typeof WHY)[number]; flip?: boolean }) {
  const Icon = item.icon;
  return (
    <article
      className={`group relative overflow-hidden rounded-3xl border border-border bg-card/60 p-6 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1.5 hover:border-[var(--neon-purple)]/60 hover:shadow-[0_30px_80px_-20px_var(--neon-purple)] sm:p-8 ${
        flip ? "lg:translate-y-10" : ""
      }`}
    >
      <div
        className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "conic-gradient(from 120deg, transparent, var(--neon-purple), transparent 30%, var(--neon-blue), transparent 70%)",
          mask: "linear-gradient(black,black) content-box,linear-gradient(black,black)",
          WebkitMask: "linear-gradient(black,black) content-box,linear-gradient(black,black)",
          padding: 1,
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      />
      <div className="pointer-events-none absolute right-6 top-6 h-24 w-24 rounded-full bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] opacity-20 blur-2xl" />
      <Particles count={6} />

      <div className="relative flex items-start gap-4">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-[0_0_24px_var(--neon-purple)]">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-xl font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
        </div>
      </div>

      <ul className="relative mt-5 flex flex-wrap gap-2">
        {item.bullets.map((b) => (
          <li
            key={b}
            className="rounded-full border border-border bg-background/50 px-2.5 py-1 text-[11px] font-medium text-foreground/80"
          >
            {b}
          </li>
        ))}
      </ul>

      <div className="relative mt-6 grid grid-cols-[1fr_auto] items-end gap-4 rounded-2xl border border-border bg-background/40 p-4">
        <Spark data={item.spark} />
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {item.metric.label}
          </p>
          <p className="font-display text-lg font-semibold text-foreground">{item.metric.value}</p>
        </div>
      </div>
    </article>
  );
}

export function WhyChooseUs() {
  return (
    <section className="relative py-24">
      <Orbs />
      <GridLines />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center">
          <SectionEyebrow icon={Sparkles} label="Why students switch" />
          <div className="mt-4">
            <GradientHeading>
              Why students choose{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-text)" }}
              >
                CA Aspire BD
              </span>
            </GradientHeading>
          </div>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Built around how ICAB Certificate Level students actually study — practice, mock,
            revise, repeat.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          {WHY.map((w, i) => (
            <WhyCard key={w.title} item={w} flip={i % 2 === 1} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 2 · Live Platform Stats ---------- */

// Realistic, CA-focused platform stats. Values are overridable so admin/DB
// metrics can flow in later via a hook or props without UI changes.
export type PlatformStat = {
  key: string;
  value: number;
  suffix: string;
  divisor: number;
  label: string;
  icon: typeof Users;
};

export const DEFAULT_STATS: PlatformStat[] = [
  { key: "students", value: 2000, suffix: "K+", divisor: 1000, label: "CA Students", icon: Users },
  { key: "mcqs", value: 5000, suffix: "K+", divisor: 1000, label: "MCQs", icon: ClipboardList },
  {
    key: "success",
    value: 500,
    suffix: "+",
    divisor: 1,
    label: "Success Tracking",
    icon: Sparkles,
  },
  { key: "mocks", value: 1000, suffix: "K+", divisor: 1000, label: "Mock Attempts", icon: Trophy },
];

export function formatStatValue(s: PlatformStat): string {
  const n = s.divisor === 1 ? s.value : Math.round(s.value / s.divisor);
  return `${n.toLocaleString()}${s.suffix}`;
}

// Reads the published `stats` homepage section and merges over the
// hardcoded defaults so admin edits show up immediately (no refresh
// required — invalidated by `useRealtimeInvalidator`). Items the admin
// hasn't configured fall back to defaults so the UI is never broken.
// eslint-disable-next-line react-refresh/only-export-components
export function usePlatformStats(): PlatformStat[] {
  const section = useSection<{ items: Array<{ label?: string; value?: string }> }>("stats", {
    items: [],
  });
  if (!section.items || section.items.length === 0) return DEFAULT_STATS;
  return DEFAULT_STATS.map((d, i) => {
    const item = section.items[i];
    if (!item) return d;
    const parsed = parseStatValue(item.value ?? "");
    return {
      ...d,
      label: item.label ?? d.label,
      value: parsed?.value ?? d.value,
      suffix: parsed?.suffix ?? d.suffix,
      divisor: parsed?.divisor ?? d.divisor,
    };
  });
}

// Parses strings like "2K+", "500+", "1.5K" into value/suffix/divisor.
function parseStatValue(s: string): { value: number; suffix: string; divisor: number } | null {
  const m = s.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(K|M|B)?\s*(\+|)$/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const unit = (m[2] ?? "").toUpperCase();
  const plus = m[3] ?? "";
  const divisor = unit === "M" ? 1_000_000 : unit === "K" ? 1_000 : 1;
  const value = Math.round(num * divisor);
  const suffix = `${unit}${plus}`;
  return { value, suffix, divisor };
}

function useCountUp(target: number, run: boolean, duration = 1400) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return n;
}

function StatCell({ stat, run }: { stat: PlatformStat; run: boolean }) {
  const n = useCountUp(stat.value, run);
  const display = stat.divisor === 1 ? n : Math.round(n / stat.divisor);
  const Icon = stat.icon;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-card/50 p-5 backdrop-blur-xl transition hover:-translate-y-1 hover:border-[var(--neon-blue)] hover:shadow-[0_20px_50px_-15px_var(--neon-blue)]">
      <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[var(--neon-purple)]/30 blur-2xl" />
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-[0_0_18px_var(--neon-purple)]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p
            className="font-display text-3xl font-bold leading-none"
            style={{
              backgroundImage: "var(--gradient-text)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            {display.toLocaleString()}
            {stat.suffix}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {stat.label}
          </p>
        </div>
      </div>
    </div>
  );
}

export function LiveStats() {
  const stats = usePlatformStats();
  const ref = useRef<HTMLDivElement | null>(null);
  const [run, setRun] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setRun(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref} className="relative py-20">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-full">
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none" className="h-full w-full opacity-40">
          <defs>
            <linearGradient id="wave" x1="0" x2="1">
              <stop offset="0%" stopColor="var(--neon-purple)" stopOpacity="0.5" />
              <stop offset="100%" stopColor="var(--neon-blue)" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          <path
            d="M0,160 C240,80 480,240 720,160 C960,80 1200,240 1440,160 L1440,320 L0,320 Z"
            fill="url(#wave)"
            opacity="0.25"
          />
          <path
            d="M0,200 C240,120 480,280 720,200 C960,120 1200,280 1440,200"
            fill="none"
            stroke="url(#wave)"
            strokeWidth="1.2"
          />
        </svg>
      </div>
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="relative rounded-[2rem] border border-border bg-card/40 p-6 backdrop-blur-2xl shadow-[0_30px_90px_-30px_var(--neon-purple)] sm:p-8">
          <div
            className="pointer-events-none absolute -inset-px rounded-[2rem] opacity-60"
            style={{
              background:
                "conic-gradient(from 0deg, transparent, var(--neon-purple) 25%, transparent 50%, var(--neon-blue) 75%, transparent)",
              mask: "linear-gradient(black,black) content-box,linear-gradient(black,black)",
              WebkitMask: "linear-gradient(black,black) content-box,linear-gradient(black,black)",
              padding: 1,
              WebkitMaskComposite: "xor",
              maskComposite: "exclude",
            }}
          />
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <SectionEyebrow icon={Sparkles} label="Live · updated this hour" />
              <h2 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
                A CA learning platform that scales with every ICAB cohort.
              </h2>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />
              All systems nominal
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <StatCell key={s.key} stat={s} run={run} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 3 · Testimonials ---------- */

const TESTIMONIALS = [
  {
    name: "Rahim Ahmed",
    level: "ICAB · Certificate Level",
    avatar: "RA",
    rating: 5,
    text: "The chapter-wise MCQs helped me cover the full Financial Accounting syllabus without missing any topic. Mock tests felt close to the real exam.",
    stats: [
      { l: "Mock score", v: "82%" },
      { l: "Streak", v: "64 d" },
    ],
    tone: "from-fuchsia-500 to-violet-500",
  },
  {
    name: "Sadia Islam",
    level: "ICAB · Certificate Level",
    avatar: "SI",
    rating: 5,
    text: "Short notes and flash cards were a lifesaver during last-minute revision. I could quickly go through Taxation and Business Law in one evening.",
    stats: [
      { l: "Cards", v: "1,240" },
      { l: "Accuracy", v: "88%" },
    ],
    tone: "from-sky-500 to-cyan-400",
  },
  {
    name: "Nafis Hasan",
    level: "ICAB · Certificate Level",
    avatar: "NH",
    rating: 5,
    text: "Mock test analytics showed exactly which chapters I was weak in. I focused only on those for two weeks and my score jumped.",
    stats: [
      { l: "Mocks", v: "28" },
      { l: "Improve", v: "+19%" },
    ],
    tone: "from-rose-500 to-amber-400",
  },
  {
    name: "Jannatul Ferdous",
    level: "ICAB · Certificate Level",
    avatar: "JF",
    rating: 5,
    text: "Simple, clean and made for ICAB students. I use it every day on my phone between classes — the routine works.",
    stats: [
      { l: "Streak", v: "92 d" },
      { l: "Hours", v: "180" },
    ],
    tone: "from-emerald-400 to-teal-400",
  },
] as const;

export function Testimonials() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(id);
  }, []);
  return (
    <section className="relative py-24">
      <Orbs />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center">
          <SectionEyebrow icon={Quote} label="Voices from the cohort" />
          <div className="mt-4">
            <GradientHeading>What our students say</GradientHeading>
          </div>
        </div>

        <div className="relative mt-12">
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[420px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, var(--neon-purple) 0%, var(--neon-blue) 40%, transparent 70%)",
            }}
          />
          <div className="grid gap-5 lg:grid-cols-3">
            {[0, 1, 2].map((offset) => {
              const t = TESTIMONIALS[(idx + offset) % TESTIMONIALS.length];
              const focused = offset === 1;
              return (
                <article
                  key={offset}
                  className={`relative overflow-hidden rounded-3xl border bg-card/60 p-6 backdrop-blur-xl transition-all duration-700 ${
                    focused
                      ? "border-[var(--neon-purple)]/60 shadow-[0_30px_80px_-20px_var(--neon-purple)] lg:scale-[1.04]"
                      : "border-border opacity-90"
                  }`}
                >
                  <Quote
                    className="pointer-events-none absolute -right-2 -top-2 h-24 w-24 text-[var(--neon-purple)] opacity-10"
                    fill="currentColor"
                  />
                  <div className="flex items-center gap-3">
                    <div
                      className={`grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br ${t.tone} font-display text-base font-semibold text-white shadow-[0_0_20px_rgba(168,85,247,0.5)]`}
                    >
                      {t.avatar}
                    </div>
                    <div className="min-w-0">
                      <p className="font-display text-sm font-semibold">{t.name}</p>
                      <p className="text-[11px] text-muted-foreground">{t.level}</p>
                    </div>
                    <div className="ml-auto flex">
                      {Array.from({ length: t.rating }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-foreground/85">"{t.text}"</p>
                  <div className="mt-4 flex gap-2">
                    {t.stats.map((s) => (
                      <div
                        key={s.l}
                        className="flex-1 rounded-xl border border-border bg-background/40 p-2 text-center"
                      >
                        <p className="font-display text-sm font-semibold">{s.v}</p>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {s.l}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-8 flex justify-center gap-2">
            {TESTIMONIALS.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`Show testimonial ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === idx
                    ? "w-8 bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] shadow-[0_0_12px_var(--neon-purple)]"
                    : "w-3 bg-border"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 4 · Top Rankers ---------- */

const RANKERS = [
  {
    rank: 2,
    name: "Tanzim Rahman",
    level: "Certificate Level",
    xp: "18,420",
    acc: "92.4%",
    streak: "112 d",
    medals: 8,
    tone: "from-slate-400 to-slate-200",
    glow: "rgba(148,163,184,0.5)",
    avatar: "TR",
  },
  {
    rank: 1,
    name: "Sadia Islam",
    level: "Certificate Level",
    xp: "24,860",
    acc: "95.2%",
    streak: "184 d",
    medals: 12,
    tone: "from-amber-300 to-yellow-400",
    glow: "rgba(251,191,36,0.55)",
    avatar: "SI",
  },
  {
    rank: 3,
    name: "Nafis Hasan",
    level: "Certificate Level",
    xp: "16,210",
    acc: "90.8%",
    streak: "78 d",
    medals: 6,
    tone: "from-orange-500 to-rose-400",
    glow: "rgba(249,115,22,0.45)",
    avatar: "NH",
  },
];

export function TopRankers() {
  return (
    <section className="relative py-24">
      <GridLines />
      <Orbs />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="text-center">
          <SectionEyebrow icon={Crown} label="Hall of fame · this season" />
          <div className="mt-4">
            <GradientHeading>Top performers</GradientHeading>
          </div>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            The learners writing the highest scores on our leaderboard right now.
          </p>
        </div>

        <div className="mt-16 grid items-end gap-5 sm:grid-cols-3">
          {RANKERS.map((r) => {
            const isFirst = r.rank === 1;
            return (
              <div
                key={r.rank}
                className={`relative ${isFirst ? "order-first sm:order-none sm:-mb-6" : ""}`}
                style={{ perspective: 1200 }}
              >
                {isFirst && (
                  <Crown
                    className="absolute left-1/2 top-[-46px] h-10 w-10 -translate-x-1/2 animate-float text-amber-300 drop-shadow-[0_0_18px_rgba(251,191,36,0.8)]"
                    fill="currentColor"
                  />
                )}
                <article
                  className={`group relative overflow-hidden rounded-3xl border border-border bg-card/60 p-6 text-center backdrop-blur-xl transition-transform duration-500 hover:rotate-[0.5deg] ${
                    isFirst
                      ? "shadow-[0_40px_100px_-30px_rgba(251,191,36,0.5)]"
                      : "shadow-[0_20px_60px_-25px_var(--neon-purple)]"
                  }`}
                  style={{
                    boxShadow: `0 30px 80px -25px ${r.glow}`,
                  }}
                >
                  <div
                    className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      background: `conic-gradient(from 90deg, transparent, ${r.glow}, transparent 60%)`,
                      mask: "linear-gradient(black,black) content-box,linear-gradient(black,black)",
                      WebkitMask:
                        "linear-gradient(black,black) content-box,linear-gradient(black,black)",
                      padding: 1,
                      WebkitMaskComposite: "xor",
                      maskComposite: "exclude",
                    }}
                  />
                  <div className="mx-auto flex h-20 w-20 items-center justify-center">
                    <div
                      className={`grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br ${r.tone} font-display text-xl font-bold text-slate-900 shadow-[0_10px_30px_rgba(0,0,0,0.35)]`}
                    >
                      {r.avatar}
                    </div>
                  </div>
                  <p className="mt-3 font-display text-lg font-semibold">{r.name}</p>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {r.level}
                  </p>

                  <div className="my-5 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl border border-border bg-background/40 p-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        XP
                      </p>
                      <p className="font-display text-sm font-semibold">{r.xp}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background/40 p-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Acc
                      </p>
                      <p className="font-display text-sm font-semibold">{r.acc}</p>
                    </div>
                    <div className="rounded-xl border border-border bg-background/40 p-2">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Streak
                      </p>
                      <p className="font-display text-sm font-semibold">{r.streak}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-1">
                    {Array.from({ length: Math.min(5, r.medals) }).map((_, i) => (
                      <Trophy
                        key={i}
                        className="h-3.5 w-3.5 fill-amber-300 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.7)]"
                      />
                    ))}
                    {r.medals > 5 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        +{r.medals - 5}
                      </span>
                    )}
                  </div>

                  {/* Podium */}
                  <div
                    className={`mx-auto mt-6 w-3/4 rounded-t-xl bg-gradient-to-b ${r.tone} ${
                      isFirst ? "h-14" : r.rank === 2 ? "h-10" : "h-7"
                    } shadow-[inset_0_2px_0_rgba(255,255,255,0.4)] opacity-60`}
                  >
                    <p className="pt-1 text-center font-display text-lg font-bold text-slate-900/80">
                      #{r.rank}
                    </p>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------- 5 · Mobile App Promo ---------- */

const APP_FEATURES = [
  "Offline study mode with auto sync",
  "Push reminders that respect your streak",
  "Biometric login · WebAuthn ready",
  "Voice-powered flash card sprints",
];

function PhoneMock() {
  return (
    <div className="relative mx-auto h-[520px] w-[260px] rotate-[-6deg] sm:rotate-[-4deg]">
      <div
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[60px] opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, var(--neon-purple) 0%, var(--neon-blue) 50%, transparent 80%)",
        }}
      />
      <div className="relative h-full w-full rounded-[44px] border-[10px] border-slate-900 bg-slate-950 shadow-[0_40px_80px_-20px_rgba(124,58,237,0.6)]">
        <div className="absolute left-1/2 top-2 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900" />
        {/* Screen */}
        <div className="relative h-full w-full overflow-hidden rounded-[34px] bg-gradient-to-br from-[#0b0820] via-slate-950 to-[#0a1535] p-4 text-white">
          <div className="flex items-center justify-between text-[10px] opacity-80">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Live
            </span>
          </div>
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-widest opacity-60">Today's plan</p>
            <p className="font-display text-xl font-semibold">3 of 5 done</p>
          </div>
          <div className="mt-3 rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur-xl">
            <p className="text-[10px] uppercase tracking-widest opacity-60">Streak</p>
            <p className="font-display text-2xl font-bold text-amber-300">21 🔥</p>
            <div className="mt-2 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }).map((_, i) => (
                <div
                  key={i}
                  className={`h-6 rounded-md ${
                    i < 5
                      ? "bg-gradient-to-b from-[var(--neon-purple)] to-[var(--neon-blue)]"
                      : "bg-white/10"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {["Audit · Risk", "Tax · VAT", "FR · IFRS 15"].map((t, i) => (
              <div
                key={t}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px]"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    i === 0 ? "bg-emerald-400" : i === 1 ? "bg-amber-300" : "bg-[var(--neon-blue)]"
                  }`}
                />
                <span className="flex-1">{t}</span>
                <span className="opacity-60">{[12, 25, 18][i]} min</span>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-white/15 bg-gradient-to-br from-[var(--neon-purple)]/30 to-[var(--neon-blue)]/30 p-3">
            <p className="text-[10px] uppercase tracking-widest opacity-80">Live mock</p>
            <p className="font-display text-sm font-semibold">ICAB · Full Length</p>
            <p className="mt-1 text-[10px] opacity-70">Starts in 12 min · 2,140 enrolled</p>
          </div>
        </div>
      </div>
      {/* Floating notification */}
      <div className="absolute -left-10 top-32 w-[210px] rotate-[5deg] rounded-2xl border border-white/15 bg-slate-900/80 p-3 text-white backdrop-blur-xl shadow-[0_20px_50px_-15px_rgba(124,58,237,0.6)] animate-float">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white">
            <Trophy className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[10px] font-semibold">New badge unlocked</p>
            <p className="truncate text-[9px] opacity-70">7-day streak · +120 XP</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AppPromo() {
  return (
    <section className="relative py-24">
      <Orbs />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="relative grid items-center gap-12 overflow-hidden rounded-[2rem] border border-border bg-card/40 p-8 backdrop-blur-2xl sm:p-12 lg:grid-cols-2">
          <div
            className="pointer-events-none absolute -inset-px rounded-[2rem]"
            style={{
              background:
                "radial-gradient(circle at 30% 20%, color-mix(in oklab, var(--neon-purple) 25%, transparent), transparent 60%), radial-gradient(circle at 80% 80%, color-mix(in oklab, var(--neon-blue) 25%, transparent), transparent 60%)",
            }}
          />
          <div className="relative">
            <SectionEyebrow icon={Smartphone} label="CA Aspire BD · Mobile" />
            <h2 className="mt-4 font-display text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl">
              Study anywhere,{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-text)" }}
              >
                anytime
              </span>
              .
            </h2>
            <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
              Sync your study plan across every device. Practice on the bus, review during lunch,
              flex your streak before bed.
            </p>

            <ul className="mt-6 space-y-2.5">
              {APP_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm">
                  <span className="grid h-5 w-5 place-items-center rounded-md bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white">
                    <Sparkles className="h-3 w-3" />
                  </span>
                  {f}
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button className="group flex items-center gap-3 rounded-2xl bg-foreground px-5 py-3 text-background transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_-10px_var(--neon-purple)]">
                <Apple className="h-6 w-6" />
                <div className="text-left leading-tight">
                  <p className="text-[10px] opacity-70">Download on the</p>
                  <p className="font-display text-sm font-semibold">App Store</p>
                </div>
              </button>
              <button className="group flex items-center gap-3 rounded-2xl bg-foreground px-5 py-3 text-background transition hover:-translate-y-0.5 hover:shadow-[0_15px_40px_-10px_var(--neon-blue)]">
                <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                  <path d="M3.6 1.6l13.5 7.8-2.7 2.7L3.6 1.6zm0 20.8L14.4 11.9l2.7 2.7-13.5 7.8zM18 9.5l3.6 2.1c.9.5.9 1.8 0 2.3L18 16.1l-3.1-3.1L18 9.5z" />
                </svg>
                <div className="text-left leading-tight">
                  <p className="text-[10px] opacity-70">Get it on</p>
                  <p className="font-display text-sm font-semibold">Google Play</p>
                </div>
              </button>
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-background/50 p-3">
                <div className="grid h-14 w-14 place-items-center rounded-lg bg-white p-1.5">
                  <svg viewBox="0 0 50 50" className="h-full w-full">
                    {Array.from({ length: 8 }).map((_, r) =>
                      Array.from({ length: 8 }).map((_, c) => {
                        const filled = (r * 13 + c * 7) % 3 !== 0;
                        return filled ? (
                          <rect
                            key={`${r}-${c}`}
                            x={3 + c * 5.5}
                            y={3 + r * 5.5}
                            width="5"
                            height="5"
                            fill="#0b0820"
                          />
                        ) : null;
                      }),
                    )}
                  </svg>
                </div>
                <div className="text-[11px] leading-tight">
                  <p className="font-semibold">Scan to install</p>
                  <p className="text-muted-foreground">iOS · Android · iPad</p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <PhoneMock />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 6 · Why Students Choose CA Aspire BD ---------- */

const BENEFITS = [
  {
    q: "Chapter-wise preparation, the way ICAB actually teaches",
    a: "Every subject is broken down chapter by chapter, exactly the way it appears in your ICAB study manual. You always know what to study next and how much is left.",
  },
  {
    q: "Easy MCQ practice with clear explanations",
    a: "Practice MCQs by chapter or by full subject. Every question has a short explanation, so even when you get it wrong, you learn something new.",
  },
  {
    q: "Mock tests that feel like the real ICAB exam",
    a: "Timed mock tests built on the ICAB pattern — same time pressure, same style of questions. You walk into the real exam already knowing the feeling.",
  },
  {
    q: "Quick revision with flash cards",
    a: "Short flash cards for formulas, standards, sections of law and key concepts. Perfect for revising on the bus, between classes or the night before exam.",
  },
  {
    q: "Organized short notes by qualified teachers",
    a: "Clean, exam-focused short notes written by teachers who have actually taught ICAB Certificate Level students. No extra fluff, only what matters.",
  },
  {
    q: "Honest progress tracking",
    a: "See your accuracy per chapter, your study streak and which topics still need work. No fake scores — just a clear picture of where you stand.",
  },
  {
    q: "All your CA resources in one place",
    a: "MCQs, mocks, notes, flash cards, video classes and bookmarks — all in one app. Stop juggling PDFs, Google Drive folders and Facebook groups.",
  },
  {
    q: "Mobile friendly, works on any phone",
    a: "Built to work smoothly on a normal phone with normal internet. Study from home, from coaching, from your articleship desk — wherever you are.",
  },
  {
    q: "Less time wasted searching for materials",
    a: "Everything is already organized by Level, Subject and Chapter. You spend your time studying, not hunting for the right PDF.",
  },
];

function BenefitItem({
  item,
  open,
  onToggle,
}: {
  item: (typeof BENEFITS)[number];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`group overflow-hidden rounded-2xl border bg-card/60 backdrop-blur-xl transition-all ${
        open
          ? "border-[var(--neon-purple)]/60 shadow-[0_20px_60px_-20px_var(--neon-purple)]"
          : "border-border hover:border-[var(--neon-blue)]/60"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <span className="font-display text-sm font-semibold sm:text-base">{item.q}</span>
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-background/60 transition-transform ${
            open ? "rotate-180 border-[var(--neon-purple)]" : ""
          }`}
        >
          {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
        </div>
      </div>
    </div>
  );
}

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="relative py-24">
      <Orbs />
      <div className="mx-auto max-w-5xl px-5 sm:px-8">
        <div className="text-center">
          <SectionEyebrow icon={CircleHelp} label="Why CA Aspire BD" />
          <div className="mt-4">
            <GradientHeading>Why students choose CA Aspire BD</GradientHeading>
          </div>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Simple, honest reasons ICAB Certificate Level students use this platform every day.
          </p>
        </div>
        <div className="mt-10 grid gap-3">
          {BENEFITS.map((b, i) => (
            <BenefitItem
              key={b.q}
              item={b}
              open={open === i}
              onToggle={() => setOpen(open === i ? null : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 7 · Final CTA ---------- */

export function FinalCta() {
  return (
    <section className="relative py-24">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-border bg-gradient-to-br from-slate-950 via-[#0b0820] to-slate-950 p-12 text-center text-white shadow-[0_50px_120px_-30px_var(--neon-purple)] sm:p-16 lg:p-20">
          <GridLines />
          <Particles count={22} />

          {/* glow rings */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute -translate-x-1/2 -translate-y-1/2 h-[460px] w-[460px] rounded-full border border-[var(--neon-purple)]/30 animate-pulse-glow" />
            <div className="absolute -translate-x-1/2 -translate-y-1/2 h-[640px] w-[640px] rounded-full border border-[var(--neon-blue)]/20" />
            <div className="absolute -translate-x-1/2 -translate-y-1/2 h-[820px] w-[820px] rounded-full border border-white/5" />
          </div>
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(circle at 50% 50%, color-mix(in oklab, var(--neon-purple) 35%, transparent), transparent 60%)",
            }}
          />

          <div className="relative">
            <SectionEyebrow icon={Sparkles} label="Limited launch · 30% off pro" />
            <h2 className="mx-auto mt-5 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Start your{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-text)" }}
              >
                CA journey
              </span>{" "}
              today.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm text-white/70 sm:text-base">
              Practice smarter, mock with precision, become a Chartered Accountant faster. Your ICAB
              readiness starts on the next click.
            </p>

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/signup"
                className="group inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 font-semibold text-white shadow-[0_20px_50px_-10px_var(--neon-purple)] transition hover:-translate-y-0.5 hover:shadow-[0_25px_60px_-10px_var(--neon-blue)]"
                style={{ background: "var(--gradient-cta)" }}
              >
                Get started free{" "}
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-6 py-3.5 font-semibold text-white backdrop-blur-xl transition hover:border-[var(--neon-blue)] hover:bg-white/10"
              >
                Explore dashboard
              </Link>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-white/60">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> No credit card needed
              </span>
              <span className="flex items-center gap-1.5">
                <Flame className="h-3 w-3 text-amber-300" /> 12,847 learners online now
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="h-3 w-3 fill-amber-300 text-amber-300" /> 4.9 / 5 · 24k reviews
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- 8 · Footer ---------- */

const SOCIAL_ICONS: Record<string, LucideIcon> = {
  twitter: Twitter,
  x: Twitter,
  linkedin: Linkedin,
  youtube: Youtube,
  instagram: Instagram,
  github: Github,
  facebook: Facebook,
};

type FooterLink = { label: string; href: string };
type FooterColumn = { title: string; links: FooterLink[] };
type FooterSocial = { platform: string; href: string };
type FooterContent = {
  brand_primary: string;
  brand_secondary: string;
  brand_eyebrow: string;
  brand_description: string;
  tagline: string;
  copyright: string;
  contact: {
    support_label: string;
    support_email: string;
    sales_label: string;
    sales_email: string;
    hq_label: string;
    hq_value: string;
  };
  columns: FooterColumn[];
  social: FooterSocial[];
};

const FOOTER_FALLBACK: FooterContent = {
  brand_primary: "CA Aspire",
  brand_secondary: "BD",
  brand_eyebrow: "ICAB Learning OS",
  brand_description:
    "The professional CA learning platform powering ICAB aspirants and the institutions that train them.",
  tagline: "",
  copyright: `© ${new Date().getFullYear()} CA Aspire BD · Practice. Learn. Become a CA.`,
  contact: {
    support_label: "Support",
    support_email: "help@caaspirebd.xyz",
    sales_label: "Sales",
    sales_email: "sales@caaspirebd.xyz",
    hq_label: "HQ",
    hq_value: "Dhaka · Chattogram · Sylhet",
  },
  columns: [
    {
      title: "About",
      links: [
        { label: "Features", href: "#features" },
        { label: "Learning Paths", href: "#learning-paths" },
        { label: "Subjects", href: "#subjects" },
        { label: "Exam System", href: "#exam-system" },
      ],
    },
    {
      title: "Support",
      links: [
        { label: "Help & FAQ", href: "#faq" },
        { label: "Contact Support", href: "mailto:help@caaspirebd.xyz" },
        { label: "Sales Enquiry", href: "mailto:sales@caaspirebd.xyz" },
        { label: "Sign In", href: "/login" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Privacy Policy", href: "/privacy" },
        { label: "Terms of Service", href: "/terms" },
        { label: "Cookie Policy", href: "/cookies" },
        { label: "Security", href: "/security" },
      ],
    },
  ],
  social: [
    { platform: "twitter", href: "https://x.com/caaspirebd" },
    { platform: "linkedin", href: "https://linkedin.com/company/caaspirebd" },
    { platform: "youtube", href: "https://youtube.com/@caaspirebd" },
    { platform: "instagram", href: "https://instagram.com/caaspirebd" },
  ],
};

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: "smooth" });
}

function FooterNavLink({ link }: { link: FooterLink }) {
  const href = (link.href || "").trim();
  const cls = "text-foreground/80 transition hover:text-foreground text-left";
  if (!href) return <span className={cls}>{link.label}</span>;
  if (href.startsWith("#")) {
    return (
      <button onClick={() => scrollToId(href.slice(1))} className={cls}>
        {link.label}
      </button>
    );
  }
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    return (
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel="noreferrer noopener"
        className={cls}
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link to={href} className={cls}>
      {link.label}
    </Link>
  );
}

export function Footer() {
  const f = useSetting<FooterContent>("footer", FOOTER_FALLBACK);
  const columns = f.columns?.length ? f.columns : FOOTER_FALLBACK.columns;
  const social = f.social?.length ? f.social : FOOTER_FALLBACK.social;
  const contact = { ...FOOTER_FALLBACK.contact, ...(f.contact || {}) };

  return (
    <footer className="relative pt-16">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-t-[2rem] border border-border bg-card/40 p-8 backdrop-blur-2xl sm:p-12">
          <Orbs />
          <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <Link to="/" className="flex items-center gap-2.5">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-[0_0_24px_var(--neon-purple)]">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div className="leading-tight">
                  <p className="font-display text-base font-semibold">
                    <span
                      className="bg-clip-text text-transparent"
                      style={{ backgroundImage: "var(--gradient-text)" }}
                    >
                      {f.brand_primary} {f.brand_secondary}
                    </span>
                  </p>
                  {f.brand_eyebrow ? (
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {f.brand_eyebrow}
                    </p>
                  ) : null}
                </div>
              </Link>
              {f.brand_description ? (
                <p className="mt-4 max-w-sm text-sm text-muted-foreground">{f.brand_description}</p>
              ) : null}

              {social.length ? (
                <div className="mt-5 flex items-center gap-2">
                  {social.map((s, i) => {
                    const Ic = SOCIAL_ICONS[s.platform?.toLowerCase()] ?? Github;
                    return (
                      <a
                        key={`${s.platform}-${i}`}
                        href={s.href}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={s.platform}
                        className="group grid h-9 w-9 place-items-center rounded-xl border border-border bg-background/60 text-muted-foreground transition hover:-translate-y-0.5 hover:border-[var(--neon-purple)] hover:text-foreground hover:shadow-[0_0_18px_var(--neon-purple)]"
                      >
                        <Ic className="h-4 w-4" />
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </div>

            {columns.map((col, ci) => (
              <div key={`${col.title}-${ci}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {col.title}
                </p>
                <ul className="mt-4 space-y-2.5 text-sm">
                  {(col.links ?? []).map((l, li) => (
                    <li key={`${l.label}-${li}`}>
                      <FooterNavLink link={l} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 grid gap-4 border-t border-border pt-6 sm:grid-cols-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {contact.support_label}
              </p>
              <a
                href={`mailto:${contact.support_email}`}
                className="text-sm font-medium text-foreground/90 hover:text-foreground"
              >
                {contact.support_email}
              </a>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {contact.sales_label}
              </p>
              <a
                href={`mailto:${contact.sales_email}`}
                className="text-sm font-medium text-foreground/90 hover:text-foreground"
              >
                {contact.sales_email}
              </a>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {contact.hq_label}
              </p>
              <p className="text-sm font-medium">{contact.hq_value}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row">
            <p>{f.copyright}</p>
            {f.tagline ? (
              <p className="text-[11px] uppercase tracking-[0.18em]">{f.tagline}</p>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}

export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      className={`fixed bottom-6 right-6 z-40 grid h-12 w-12 place-items-center rounded-full text-white shadow-[0_20px_50px_-10px_var(--neon-purple)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_25px_60px_-10px_var(--neon-blue)] ${
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
      }`}
      style={{ background: "var(--gradient-cta)" }}
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
