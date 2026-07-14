import { TrendingUp, Brain, Trophy, Clock, BookOpen, Target, Zap } from "lucide-react";

const bars = [42, 65, 38, 78, 55, 88, 72];
const days = ["M", "T", "W", "T", "F", "S", "S"];

export function DashboardPreview() {
  return (
    <div className="relative">
      {/* Floating stat cards */}
      <div className="glass shadow-card-soft animate-float absolute -left-6 top-12 z-20 rounded-2xl p-3 sm:-left-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[oklch(0.7_0.16_240)]/15 text-[var(--neon-blue)]">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base font-bold">5K+</p>
            <p className="text-[10px] text-muted-foreground">MCQs</p>
          </div>
        </div>
      </div>

      <div className="glass shadow-card-soft animate-float-slow absolute -right-4 top-32 z-20 rounded-2xl p-3 sm:-right-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[oklch(0.6_0.27_295)]/15 text-[var(--neon-purple)]">
            <Trophy className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base font-bold">1K+</p>
            <p className="text-[10px] text-muted-foreground">Mock Attempts</p>
          </div>
        </div>
      </div>

      <div className="glass shadow-card-soft animate-float absolute -bottom-4 -left-4 z-20 rounded-2xl p-3 sm:-left-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[oklch(0.72_0.22_340)]/15 text-[var(--neon-pink)]">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-base font-bold">2K+</p>
            <p className="text-[10px] text-muted-foreground">Students</p>
          </div>
        </div>
      </div>

      {/* Main dashboard */}
      <div className="glass shadow-glow relative overflow-hidden rounded-3xl p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-[var(--neon-purple)]/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-[var(--neon-blue)]/25 blur-3xl" />

        {/* Header */}
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Welcome back,</p>
            <p className="font-display text-lg font-bold">Rahim Ahmed</p>
          </div>
          <div className="flex -space-x-2">
            {["bg-[var(--neon-purple)]", "bg-[var(--neon-blue)]", "bg-[var(--neon-pink)]"].map(
              (c, i) => (
                <div key={i} className={`h-8 w-8 rounded-full ring-2 ring-background ${c}`} />
              ),
            )}
          </div>
        </div>

        {/* Quick stats row */}
        <div className="relative mt-5 grid grid-cols-3 gap-3">
          {[
            { i: Target, l: "Accuracy", v: "92%", c: "var(--neon-purple)" },
            { i: Clock, l: "Streak", v: "24d", c: "var(--neon-blue)" },
            { i: Brain, l: "XP", v: "8.4k", c: "var(--neon-pink)" },
          ].map(({ i: Icon, l, v, c }) => (
            <div key={l} className="rounded-2xl border border-border bg-card/40 p-3">
              <Icon
                className="h-4 w-4"
                style={{
                  color: `var(--${c.includes("purple") ? "neon-purple" : c.includes("blue") ? "neon-blue" : "neon-pink"})`,
                }}
              />
              <p className="font-display mt-2 text-lg font-bold">{v}</p>
              <p className="text-[10px] text-muted-foreground">{l}</p>
            </div>
          ))}
        </div>

        {/* Chart + ring */}
        <div className="relative mt-5 grid grid-cols-5 gap-4">
          <div className="col-span-3 rounded-2xl border border-border bg-card/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">Weekly Performance</p>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <TrendingUp className="h-3 w-3" /> +12.4%
              </span>
            </div>
            <div className="mt-4 flex h-28 items-end gap-2">
              {bars.map((h, i) => (
                <div key={i} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className="w-full rounded-t-md bg-gradient-to-t from-[var(--neon-purple)] to-[var(--neon-blue)] opacity-90 transition-all hover:opacity-100"
                    style={{ height: `${h}%` }}
                  />
                  <span className="text-[9px] text-muted-foreground">{days[i]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Progress ring */}
          <div className="col-span-2 flex flex-col items-center justify-center rounded-2xl border border-border bg-card/40 p-4">
            <div className="relative h-28 w-28">
              <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
                <defs>
                  <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="oklch(0.7 0.25 295)" />
                    <stop offset="100%" stopColor="oklch(0.72 0.2 235)" />
                  </linearGradient>
                </defs>
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  stroke="currentColor"
                  strokeWidth="10"
                  fill="none"
                  className="text-muted/40"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  stroke="url(#ringGrad)"
                  strokeWidth="10"
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray="339"
                  className="animate-ring"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="font-display text-2xl font-bold">78%</p>
                <p className="text-[10px] text-muted-foreground">Goal</p>
              </div>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Monthly progress</p>
          </div>
        </div>

        {/* Recent activity */}
        <div className="relative mt-4 rounded-2xl border border-border bg-card/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Recent Activity</p>
            <span className="text-[10px] text-muted-foreground">Today</span>
          </div>
          <div className="mt-3 space-y-2">
            {[
              { t: "Audit Mock Test", s: "Score 94/100", c: "var(--neon-purple)" },
              { t: "Taxation Flash Cards", s: "32 cards reviewed", c: "var(--neon-blue)" },
            ].map((a) => (
              <div
                key={a.t}
                className="flex items-center justify-between rounded-xl bg-background/40 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full" style={{ background: a.c }} />
                  <div>
                    <p className="text-xs font-medium">{a.t}</p>
                    <p className="text-[10px] text-muted-foreground">{a.s}</p>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground">2m ago</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
