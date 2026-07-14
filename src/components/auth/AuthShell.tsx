import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  GraduationCap,
  Moon,
  Sun,
  Sparkles,
  TrendingUp,
  Users,
  Flame,
  Trophy,
  ShieldCheck,
  Activity,
  ServerCog,
} from "lucide-react";
import { useAppStore } from "@/stores/app-store";

type Variant = "student" | "admin" | "neutral";

function Particles() {
  const dots = Array.from({ length: 26 });
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((_, i) => {
        const left = (i * 37) % 100;
        const top = (i * 53) % 100;
        const delay = (i % 6) * 0.7;
        const size = 4 + (i % 5) * 2;
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
              animationDelay: `${delay}s`,
            }}
          />
        );
      })}
    </div>
  );
}

function GridBg() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.18]"
      style={{
        backgroundImage:
          "linear-gradient(to right, color-mix(in oklab, var(--neon-purple) 40%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--neon-blue) 40%, transparent) 1px, transparent 1px)",
        backgroundSize: "44px 44px",
        maskImage: "radial-gradient(ellipse 80% 70% at 50% 50%, black 40%, transparent 100%)",
      }}
    />
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  trend,
  delay = 0,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  trend?: string;
  delay?: number;
}) {
  return (
    <div
      className="group relative rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur-xl animate-float shadow-[0_10px_40px_-12px_rgba(124,58,237,0.35)]"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center gap-2.5">
        <div className="rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] p-2 text-white shadow-[0_0_20px_var(--neon-purple)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-widest text-white/60">{label}</p>
          <p className="text-base font-display font-semibold text-white">{value}</p>
        </div>
        {trend && (
          <span className="ml-auto rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            {trend}
          </span>
        )}
      </div>
    </div>
  );
}

function DashboardMock() {
  return (
    <div className="relative mx-auto w-full max-w-md rotate-[-2deg] rounded-3xl border border-white/15 bg-gradient-to-br from-white/10 to-white/[0.03] p-4 backdrop-blur-2xl shadow-[0_30px_80px_-20px_rgba(99,102,241,0.5)]">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
        <span className="ml-3 text-[10px] uppercase tracking-widest text-white/50">
          ca aspire bd · live
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { l: "Active", v: "12,847" },
          { l: "Streak", v: "21d" },
          { l: "XP", v: "9.8k" },
        ].map((c) => (
          <div key={c.l} className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-white/50">{c.l}</p>
            <p className="font-display text-sm font-semibold text-white">{c.v}</p>
          </div>
        ))}
      </div>
      <svg viewBox="0 0 300 110" className="mt-3 h-24 w-full">
        <defs>
          <linearGradient id="ag" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--neon-purple)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="var(--neon-blue)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,80 L30,60 L60,68 L90,40 L120,52 L150,28 L180,44 L210,22 L240,36 L270,18 L300,30 L300,110 L0,110 Z"
          fill="url(#ag)"
        />
        <path
          d="M0,80 L30,60 L60,68 L90,40 L120,52 L150,28 L180,44 L210,22 L240,36 L270,18 L300,30"
          fill="none"
          stroke="var(--neon-blue)"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
        <span className="font-medium">Daily Goal</span>
        <span className="font-mono text-emerald-300">86%</span>
      </div>
    </div>
  );
}

export function ThemeLangBar() {
  const [mounted, setMounted] = useState(false);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const dark = theme === "dark";

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleTheme}
        className="group flex h-9 items-center gap-2 rounded-full border border-border bg-card/60 px-3 text-xs backdrop-blur-xl transition hover:border-[var(--neon-purple)] hover:shadow-[0_0_18px_var(--neon-purple)]"
        aria-label="Toggle theme"
      >
        {mounted && dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        <span className="font-medium">{mounted ? (dark ? "Light" : "Dark") : "Theme"}</span>
      </button>
    </div>
  );
}

export function TopNav() {
  return (
    <header className="relative z-20 mx-auto flex max-w-[1500px] items-center justify-between px-5 py-4 sm:px-8">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-[0_0_24px_var(--neon-purple)]">
          <GraduationCap className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-base font-semibold">
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-text)" }}
            >
              CA Aspire BD
            </span>
          </p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            ICAB Learning OS
          </p>
        </div>
      </Link>
      <ThemeLangBar />
    </header>
  );
}

export function BrandPanel({ variant = "student" }: { variant?: Variant }) {
  const isAdmin = variant === "admin";
  return (
    <div className="relative hidden min-h-[640px] overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-[#0b0820] to-slate-950 p-8 text-white lg:flex lg:flex-col">
      <GridBg />
      <Particles />
      <div
        className="pointer-events-none absolute -left-20 top-10 h-80 w-80 rounded-full opacity-50 blur-3xl"
        style={{ background: "var(--neon-purple)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-24 -right-20 h-96 w-96 rounded-full opacity-40 blur-3xl"
        style={{ background: "var(--neon-blue)" }}
      />

      <div className="relative z-10 flex items-center gap-2 text-xs text-white/70">
        <Sparkles className="h-3.5 w-3.5 text-[var(--neon-purple)]" />
        <span className="uppercase tracking-[0.3em]">
          {isAdmin ? "Secure Command" : "Smart Education"}
        </span>
      </div>

      <h1 className="relative z-10 mt-5 font-display text-4xl font-bold leading-tight xl:text-5xl">
        {isAdmin ? (
          <>
            Command the future of{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-text)" }}
            >
              digital classrooms
            </span>
            .
          </>
        ) : (
          <>
            Master the path to{" "}
            <span
              className="bg-clip-text text-transparent"
              style={{ backgroundImage: "var(--gradient-text)" }}
            >
              Chartered Accountancy
            </span>
            .
          </>
        )}
      </h1>
      <p className="relative z-10 mt-3 max-w-md text-sm text-white/65">
        {isAdmin
          ? "Zero-trust authentication, real-time monitoring and a command deck — engineered for ICAB-aligned institutions that scale."
          : "Join thousands of ICAB aspirants mastering Audit, Taxation, Financial Accounting and Business Law with adaptive practice and live mock tests."}
      </p>

      <div className="relative z-10 mt-7">
        <DashboardMock />
      </div>

      <div className="relative z-10 mt-auto grid grid-cols-2 gap-3 pt-6">
        {isAdmin ? (
          <>
            <StatCard icon={ShieldCheck} label="Threats blocked" value="1,284" trend="+12%" />
            <StatCard icon={Activity} label="Uptime SLA" value="99.99%" delay={0.6} />
            <StatCard icon={ServerCog} label="Edge nodes" value="42 live" delay={1.2} />
            <StatCard icon={Users} label="Active admins" value="38" trend="live" delay={1.8} />
          </>
        ) : (
          <>
            <StatCard icon={Users} label="Live learners" value="12,847" trend="+8%" />
            <StatCard icon={Flame} label="Study streak" value="21 days" delay={0.6} />
            <StatCard icon={Trophy} label="Top rank" value="#3 / 9k" delay={1.2} />
            <StatCard icon={TrendingUp} label="Accuracy" value="92.4%" trend="+2.1%" delay={1.8} />
          </>
        )}
      </div>
    </div>
  );
}

export function AuthShell({
  children,
  variant = "student",
}: {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 bg-hero-glow opacity-60" />
      <div className="pointer-events-none fixed -left-10 top-10 -z-10 h-80 w-80 rounded-full bg-[var(--neon-purple)]/25 blur-3xl animate-pulse-glow" />
      <div className="pointer-events-none fixed -right-10 bottom-10 -z-10 h-96 w-96 rounded-full bg-[var(--neon-blue)]/25 blur-3xl animate-pulse-glow" />

      <TopNav />

      <main className="mx-auto grid max-w-[1500px] gap-6 px-5 pb-10 sm:px-8 lg:grid-cols-[1.05fr_1fr]">
        <BrandPanel variant={variant} />

        <section className="relative">
          <div
            className="pointer-events-none absolute -inset-2 -z-10 rounded-[2rem] opacity-70 blur-2xl"
            style={{
              background:
                "conic-gradient(from 120deg, var(--neon-purple), var(--neon-blue), var(--neon-pink), var(--neon-purple))",
            }}
          />
          <div className="relative rounded-[1.75rem] border border-border/60 bg-card/60 p-6 shadow-[0_30px_90px_-30px_rgba(124,58,237,0.45)] backdrop-blur-2xl sm:p-8 animate-fade-up">
            {children}
          </div>
          <p className="mt-4 text-center text-[11px] text-muted-foreground">
            By continuing you agree to our{" "}
            <a className="text-foreground hover:text-[var(--neon-purple)]">Terms</a> &{" "}
            <a className="text-foreground hover:text-[var(--neon-blue)]">Privacy Policy</a>.
          </p>
        </section>
      </main>
    </div>
  );
}
