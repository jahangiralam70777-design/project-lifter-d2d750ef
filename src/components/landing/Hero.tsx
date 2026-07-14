import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { DashboardPreview } from "./DashboardPreview";
import { formatStatValue, usePlatformStats } from "./LandingSections";
import { useSection } from "@/hooks/use-site-content";

type HeroContent = {
  eyebrow: string;
  heading: string;
  subheading: string;
  description: string;
  primary_cta: { label: string; href: string };
  secondary_cta: { label: string; href: string };
};

const HERO_DEFAULTS: HeroContent = {
  eyebrow: "ICAB · Certificate Level · Bangladesh",
  heading: "CA Preparation,",
  subheading: "made simpler.",
  description:
    "A focused study platform for ICAB Certificate Level students. Practice MCQs, attempt mock tests, revise from short notes and track your progress — all in one place.",
  primary_cta: { label: "Start Preparing", href: "/signup" },
  secondary_cta: { label: "See Inside", href: "/dashboard" },
};

export function Hero() {
  const hero = useSection<HeroContent>("hero", HERO_DEFAULTS);
  const stats = usePlatformStats();
  return (
    <section className="relative overflow-hidden pt-32 pb-20 sm:pt-40">
      {/* Background glow */}
      <div className="bg-hero-glow pointer-events-none absolute inset-0 -z-10" />
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-[0.04] [background-image:linear-gradient(var(--foreground)_1px,transparent_1px),linear-gradient(90deg,var(--foreground)_1px,transparent_1px)] [background-size:60px_60px]" />
      <div className="pointer-events-none absolute left-1/4 top-1/4 -z-10 h-72 w-72 rounded-full bg-[var(--neon-purple)]/30 blur-3xl animate-pulse-glow" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 -z-10 h-80 w-80 rounded-full bg-[var(--neon-blue)]/25 blur-3xl animate-pulse-glow" />

      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-6 lg:grid-cols-2 lg:gap-8">
        {/* Left */}
        <div className="animate-fade-up">
          <div className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
            <span>{hero.eyebrow}</span>
          </div>

          <h1
            className="font-display mt-6 text-[clamp(2rem,9vw,3rem)] font-bold leading-[1.08] tracking-tight [text-wrap:balance] [overflow-wrap:break-word] [hyphens:auto] sm:text-6xl sm:[text-wrap:balance] lg:text-7xl"
          >
            <span className="text-gradient">{hero.heading}</span>{" "}
            <br className="hidden sm:block" />
            <span className="whitespace-normal">{hero.subheading}</span>
          </h1>

          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            {hero.description}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              to={hero.primary_cta.href as never}
              className="bg-cta-gradient shadow-glow group inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-white transition-transform hover:scale-[1.02]"
            >
              {hero.primary_cta.label}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to={hero.secondary_cta.href as never}
              className="glass inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-foreground transition-transform hover:scale-[1.02]"
            >
              {hero.secondary_cta.label}
            </Link>
          </div>

          {/* Inline metrics */}
          <div className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-border pt-6">
            {stats.slice(0, 3).map((s) => (
              <div key={s.key}>
                <p className="font-display text-2xl font-bold text-gradient">
                  {formatStatValue(s)}
                </p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right */}
        <div className="animate-fade-up [animation-delay:150ms]">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}
