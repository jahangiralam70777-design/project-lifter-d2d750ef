import { Link } from "@tanstack/react-router";
import {
  Award,
  Briefcase,
  Crown,
  Calculator,
  Coins,
  ShieldCheck,
  Receipt,
  Scale,
  Landmark,
  Cpu,
  TrendingUp,
  ListChecks,
  Trophy,
  Timer,
  LineChart,
  Activity,
  Target,
  Sparkles,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

/* ---------------- Learning Paths ---------------- */

const PATHS = [
  {
    icon: Award,
    tier: "Certificate Level",
    title: "Foundation in Accountancy",
    desc: "Build core CA fundamentals — accounting principles, business maths, and economics.",
    chips: ["Accounting", "Business Maths", "Economics", "ICT"],
    accent: "var(--neon-blue)",
  },
  {
    icon: Briefcase,
    tier: "Professional Level",
    title: "CA Professional Stage",
    desc: "Advance into audit, taxation, financial reporting and corporate law mastery.",
    chips: ["Audit", "Taxation", "Financial Reporting", "Business Law"],
    accent: "var(--neon-purple)",
    featured: true,
  },
  {
    icon: Crown,
    tier: "Advanced Level",
    title: "Strategic CA Finalist",
    desc: "Master strategic finance, corporate reporting and advanced audit for ICAB finals.",
    chips: ["Corporate Reporting", "Strategic Finance", "Advanced Audit", "Ethics"],
    accent: "var(--neon-pink)",
  },
] as const;

function LearningPaths() {
  return (
    <section id="learning-paths" className="relative py-24 sm:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-10 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-[var(--neon-purple)]/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="glass mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
            CA Learning Paths
          </div>
          <h2 className="font-display mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            A clear road to <span className="text-gradient">Chartered Accountancy</span>
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Three structured stages aligned with the ICAB qualification — from foundations to
            finalist.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {PATHS.map((p, i) => {
            const Icon = p.icon;
            const featured = "featured" in p && p.featured;
            return (
              <article
                key={p.title}
                className={`group relative rounded-3xl p-px transition-transform duration-300 hover:-translate-y-1 ${
                  featured ? "lg:scale-[1.03]" : ""
                }`}
                style={{
                  background: `linear-gradient(140deg, ${p.accent}, transparent 65%)`,
                  animationDelay: `${i * 80}ms`,
                }}
              >
                <div className="glass relative h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] p-7">
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-30 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
                    style={{ background: p.accent }}
                  />
                  <div className="flex items-center justify-between">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow"
                      style={{
                        background: `linear-gradient(135deg, ${p.accent}, color-mix(in oklab, ${p.accent} 50%, var(--neon-blue)))`,
                      }}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    {featured && (
                      <span className="rounded-full border border-border bg-card/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
                        Most popular
                      </span>
                    )}
                  </div>

                  <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {p.tier}
                  </p>
                  <h3 className="font-display mt-1 text-xl font-bold">{p.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {p.chips.map((c) => (
                      <span
                        key={c}
                        className="rounded-full border border-border bg-card/60 px-2.5 py-1 text-[11px] font-medium text-foreground/80"
                      >
                        {c}
                      </span>
                    ))}
                  </div>

                  <Link
                    to="/signup"
                    className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/90 hover:text-foreground"
                  >
                    Start this path
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Subject Categories ---------------- */

const SUBJECTS: { icon: LucideIcon; name: string; sub: string; tone: string }[] = [
  {
    icon: Calculator,
    name: "Financial Accounting",
    sub: "Ledgers · Standards · IFRS",
    tone: "var(--neon-blue)",
  },
  {
    icon: Coins,
    name: "Cost & Management",
    sub: "Costing · Budgeting · Variance",
    tone: "var(--neon-purple)",
  },
  {
    icon: ShieldCheck,
    name: "Audit & Assurance",
    sub: "ISA · Risk · Sampling",
    tone: "var(--neon-pink)",
  },
  { icon: Receipt, name: "Taxation", sub: "Income · VAT · Corporate", tone: "var(--neon-blue)" },
  {
    icon: TrendingUp,
    name: "Financial Management",
    sub: "Capital · Valuation · Risk",
    tone: "var(--neon-purple)",
  },
  {
    icon: Scale,
    name: "Business Law",
    sub: "Contract · Company · Ethics",
    tone: "var(--neon-pink)",
  },
  { icon: Cpu, name: "ICT", sub: "Systems · Controls · Data", tone: "var(--neon-blue)" },
  {
    icon: Landmark,
    name: "Corporate Reporting",
    sub: "Group · Consolidation · IFRS",
    tone: "var(--neon-purple)",
  },
];

function SubjectCategories() {
  return (
    <section id="subjects" className="relative py-24 sm:py-28">
      <div className="mx-auto max-w-7xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <div className="glass mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5 text-[var(--neon-blue)]" />
            Subject Coverage
          </div>
          <h2 className="font-display mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            Every CA subject, <span className="text-gradient">deeply covered</span>
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Chapter-wise practice across the full ICAB syllabus — accounting, audit, tax, finance,
            law and beyond.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {SUBJECTS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div
                key={s.name}
                className="group relative rounded-2xl p-px transition-transform duration-300 hover:-translate-y-1"
                style={{ background: `linear-gradient(135deg, ${s.tone}, transparent 70%)` }}
              >
                <div className="glass relative h-full overflow-hidden rounded-[15px] p-5">
                  <div
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
                    style={{ background: s.tone }}
                  />
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-glow transition-transform duration-300 group-hover:scale-110"
                    style={{
                      background: `linear-gradient(135deg, ${s.tone}, color-mix(in oklab, ${s.tone} 50%, black))`,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="font-display mt-4 text-sm font-bold leading-tight">{s.name}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{s.sub}</p>
                </div>
                <span className="sr-only">{i}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Exam Preparation System ---------------- */

const EXAM_TOOLS = [
  {
    icon: ListChecks,
    title: "MCQ Practice",
    desc: "Unlimited ICAB-aligned MCQs with instant explanations.",
    tone: "var(--neon-purple)",
  },
  {
    icon: Trophy,
    title: "Mock Tests",
    desc: "Full-length CA mock papers with rank prediction.",
    tone: "var(--neon-blue)",
  },
  {
    icon: Timer,
    title: "Quiz Engine",
    desc: "Sharp 10-question timed challenges to stay exam-ready.",
    tone: "var(--neon-pink)",
  },
  {
    icon: LineChart,
    title: "Performance Tracking",
    desc: "Realtime accuracy, time-per-question & subject heatmaps.",
    tone: "var(--neon-blue)",
  },
  {
    icon: Target,
    title: "Weak Topic Analysis",
    desc: "AI-surfaced weak chapters with targeted revision.",
    tone: "var(--neon-purple)",
  },
  {
    icon: Activity,
    title: "Study Streaks",
    desc: "Daily progress, XP, streaks and consistency analytics.",
    tone: "var(--neon-pink)",
  },
];

function ExamSystem() {
  return (
    <section id="exam-system" className="relative py-24 sm:py-28">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute bottom-0 right-1/3 h-80 w-80 rounded-full bg-[var(--neon-blue)]/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-2">
          <div>
            <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <Target className="h-3.5 w-3.5 text-[var(--neon-pink)]" />
              Exam Preparation System
            </div>
            <h2 className="font-display mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
              The complete <span className="text-gradient">CA exam engine</span>
            </h2>
            <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
              Practice, mocks, quizzes and analytics built for ICAB success — every attempt makes
              you measurably sharper.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 lg:justify-end">
            <Link
              to="/signup"
              className="bg-cta-gradient shadow-glow inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
            >
              Start CA Prep
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/dashboard"
              className="glass inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-foreground transition-transform hover:scale-[1.02]"
            >
              Explore Platform
            </Link>
          </div>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {EXAM_TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.title}
                className="group relative rounded-3xl p-px transition-transform duration-300 hover:-translate-y-1"
                style={{ background: `linear-gradient(135deg, ${t.tone}, transparent 60%)` }}
              >
                <div className="glass relative h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] p-6">
                  <div
                    className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
                    style={{ background: t.tone }}
                  />
                  <div
                    className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-glow"
                    style={{
                      background: `linear-gradient(135deg, ${t.tone}, color-mix(in oklab, ${t.tone} 55%, black))`,
                    }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display mt-4 text-lg font-bold">{t.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{t.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Combined export ---------------- */

export function CAPremiumSections() {
  return (
    <>
      <LearningPaths />
      <SubjectCategories />
      <ExamSystem />
    </>
  );
}
