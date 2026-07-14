import {
  ListChecks,
  Timer,
  SlidersHorizontal,
  Trophy,
  Layers,
  FileText,
  Database,
  PlayCircle,
  type LucideIcon,
} from "lucide-react";
import { useModuleVisibility, MODULE_BY_FEATURE_TITLE } from "@/hooks/use-module-visibility";
import { DEFAULT_STATS, formatStatValue } from "./LandingSections";

type Feature = {
  icon: LucideIcon;
  title: string;
  desc: string;
  bullets: string[];
  tone: "purple" | "blue" | "pink" | "cyan";
};

const features: Feature[] = [
  {
    icon: ListChecks,
    title: "MCQ Practice",
    desc: "ICAB-aligned MCQs across every CA subject.",
    bullets: ["Level → Subject → Chapter", "Instant explanations", "Unlimited attempts"],
    tone: "purple",
  },
  {
    icon: Timer,
    title: "Quiz System",
    desc: "Sharp 10-question CA challenges with a live timer.",
    bullets: ["10 MCQ format", "Timer based", "Instant result"],
    tone: "blue",
  },
  {
    icon: SlidersHorizontal,
    title: "Custom Exam",
    desc: "Tailor CA practice to your weak chapters.",
    bullets: ["Choose MCQ count", "Set duration", "Subject-wise filters"],
    tone: "pink",
  },
  {
    icon: Trophy,
    title: "Mock Test",
    desc: "Full-length ICAB-style mock papers.",
    bullets: ["Subject-wise mocks", "Deep analytics", "Live rank system"],
    tone: "cyan",
  },
  {
    icon: Layers,
    title: "Flash Cards",
    desc: "Audit, Tax & Law concepts that actually stick.",
    bullets: ["Spaced revision", "Quick learning mode", "Interactive design"],
    tone: "purple",
  },
  {
    icon: FileText,
    title: "Short Notes",
    desc: "Financial Reporting & Audit notes — chapter-wise.",
    bullets: ["PDF & text notes", "Chapter organized", "Reader mode"],
    tone: "blue",
  },
  {
    icon: Database,
    title: "Qns Bank",
    desc: "A vault of CA past questions ready when you are.",
    bullets: ["Huge collection", "Downloadable", "Topic filters"],
    tone: "pink",
  },
  {
    icon: PlayCircle,
    title: "Video Classes",
    desc: "Premium CA video lessons, beautifully organized.",
    bullets: ["YouTube embedded", "Subject & chapter wise", "Premium cards"],
    tone: "cyan",
  },
];

const toneMap: Record<Feature["tone"], { from: string; to: string; glow: string }> = {
  purple: { from: "oklch(0.7 0.25 295)", to: "oklch(0.6 0.22 270)", glow: "var(--neon-purple)" },
  blue: { from: "oklch(0.72 0.18 235)", to: "oklch(0.65 0.2 260)", glow: "var(--neon-blue)" },
  pink: { from: "oklch(0.72 0.22 340)", to: "oklch(0.65 0.25 310)", glow: "var(--neon-pink)" },
  cyan: { from: "oklch(0.78 0.15 200)", to: "oklch(0.7 0.18 230)", glow: "var(--neon-blue)" },
};

const stats = DEFAULT_STATS.map((s) => ({ v: formatStatValue(s), l: s.label }));

export function Features() {
  const { isHidden } = useModuleVisibility();
  const visibleFeatures = features.filter((f) => {
    const k = MODULE_BY_FEATURE_TITLE[f.title];
    return !k || !isHidden(k);
  });
  return (
    <section id="features" className="relative py-24 sm:py-32">
      {/* floating shapes */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-20 left-1/3 h-72 w-72 rounded-full bg-[var(--neon-purple)]/20 blur-3xl animate-pulse-glow" />
        <div className="absolute bottom-0 right-10 h-80 w-80 rounded-full bg-[var(--neon-blue)]/20 blur-3xl animate-pulse-glow" />
        <div className="absolute top-1/2 left-0 h-60 w-60 rounded-full bg-[var(--neon-pink)]/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-6">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="glass mx-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon-purple)] animate-pulse" />
            Features
          </div>
          <h2 className="font-display mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            A Complete Toolkit for <span className="text-gradient">CA Aspirants</span>
          </h2>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            Everything ICAB students need — practice, mocks, notes, flash cards and analytics in one
            place.
          </p>
        </div>

        {/* Grid */}
        <div className="mt-16 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visibleFeatures.map((f, i) => {
            const t = toneMap[f.tone];
            const Icon = f.icon;
            return (
              <article
                key={f.title}
                className="group relative rounded-3xl p-px transition-transform duration-300 hover:-translate-y-1"
                style={{
                  background: `linear-gradient(135deg, ${t.from}, transparent 60%)`,
                  animationDelay: `${i * 60}ms`,
                }}
              >
                <div className="glass relative h-full overflow-hidden rounded-[calc(theme(borderRadius.3xl)-1px)] p-6">
                  {/* hover glow */}
                  <div
                    className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-70"
                    style={{ background: t.glow }}
                  />

                  {/* icon */}
                  <div
                    className="relative flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-glow transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3"
                    style={{ background: `linear-gradient(135deg, ${t.from}, ${t.to})` }}
                  >
                    <Icon className="h-6 w-6" />
                  </div>

                  <h3 className="font-display mt-5 text-lg font-bold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>

                  <ul className="mt-5 space-y-2">
                    {f.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-xs text-foreground/80">
                        <span
                          className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: t.glow }}
                        />
                        {b}
                      </li>
                    ))}
                  </ul>

                  {/* corner shimmer line */}
                  <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
              </article>
            );
          })}
        </div>

        {/* Stats strip */}
        <div className="glass shadow-card-soft mt-16 overflow-hidden rounded-3xl">
          <div className="relative grid grid-cols-2 divide-border sm:grid-cols-4 sm:divide-x">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--neon-purple)]/10 via-transparent to-[var(--neon-blue)]/10" />
            {stats.map((s) => (
              <div key={s.l} className="relative px-6 py-8 text-center">
                <p className="font-display text-3xl font-bold text-gradient sm:text-4xl">{s.v}</p>
                <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
