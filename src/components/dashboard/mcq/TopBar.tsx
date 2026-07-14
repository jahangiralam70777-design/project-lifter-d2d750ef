import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Bell,
  Bot,
  Check,
  Flame,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  Trophy,
  User,
  Zap,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useMyNotifications } from "@/hooks/use-my-notifications";
import { useAppStore } from "@/stores/app-store";
import type { ScopedTheme } from "./useScopedTheme";

type TopBarProps = {
  theme: ScopedTheme;
  onToggleTheme: () => void;
  query: string;
  onQuery: (v: string) => void;
  streak: number;
  xp: number;
  onAiAssistant: () => void;
};

function IconShell({
  label,
  children,
  onClick,
  badge,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  badge?: number;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="glass relative flex h-10 w-10 items-center justify-center rounded-2xl text-foreground/80 transition-all duration-200 hover:scale-105 hover:text-foreground"
          >
            {children}
            {!!badge && badge > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--neon-pink)] px-1 text-[9px] font-bold text-white">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function McqTopBar({
  theme,
  onToggleTheme,
  query,
  onQuery,
  streak,
  xp,
  onAiAssistant,
}: TopBarProps) {
  const { items, unread, markAll } = useMyNotifications();
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const [notifOpen, setNotifOpen] = useState(false);
  const recent = useMemo(() => items.slice(0, 6), [items]);
  const initials = (user?.name ?? "L").slice(0, 2).toUpperCase();

  return (
    <div className="glass shadow-card-soft relative z-20 flex flex-wrap items-center gap-3 rounded-3xl p-3 sm:p-4">
      {/* Brand */}
      <div className="flex items-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cta-gradient text-white shadow-glow">
          <Trophy className="h-5 w-5" />
        </div>
        <div className="hidden sm:block">
          <p className="font-display text-sm font-bold leading-tight">MCQ Practice</p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
            CA Aspire BD
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="order-3 w-full min-w-0 flex-1 sm:order-2 sm:w-auto">
        <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2 transition-shadow focus-within:ring-2 focus-within:ring-primary/40">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search subjects & chapters…"
            className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => onQuery("")}
              className="text-[10px] font-semibold text-muted-foreground hover:text-foreground"
            >
              clear
            </button>
          )}
        </div>
      </div>

      {/* Right cluster */}
      <div className="order-2 ml-auto flex items-center gap-2 sm:order-3">
        {/* Streak */}
        <div className="glass hidden items-center gap-1.5 rounded-2xl px-3 py-2 md:flex">
          <Flame className="h-4 w-4 text-[var(--neon-pink)]" />
          <span className="text-sm font-bold tabular-nums">{streak}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">day</span>
        </div>
        {/* XP */}
        <div className="glass hidden items-center gap-1.5 rounded-2xl px-3 py-2 sm:flex">
          <Zap className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-bold tabular-nums">{xp.toLocaleString()}</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">XP</span>
        </div>

        {/* AI assistant */}
        <button
          onClick={onAiAssistant}
          className="group relative inline-flex h-10 items-center gap-2 overflow-hidden rounded-2xl bg-cta-gradient px-3 text-sm font-semibold text-white shadow-glow transition-transform hover:scale-105"
        >
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <Bot className="relative h-4 w-4" />
          <span className="relative hidden lg:inline">AI Assistant</span>
        </button>

        {/* Notifications */}
        <Popover open={notifOpen} onOpenChange={setNotifOpen}>
          <PopoverTrigger asChild>
            <button
              aria-label="Notifications"
              className="glass relative flex h-10 w-10 items-center justify-center rounded-2xl text-foreground/80 transition-all hover:scale-105 hover:text-foreground"
            >
              <Bell className="h-4 w-4" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--neon-pink)] px-1 text-[9px] font-bold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 rounded-2xl p-0">
            <div className="flex items-center justify-between border-b border-border p-3">
              <p className="text-sm font-bold">Notifications</p>
              {unread > 0 && (
                <button
                  onClick={() => markAll.mutate()}
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                >
                  <Check className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              {recent.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  You're all caught up 🎉
                </p>
              ) : (
                recent.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl p-2.5 ${n.read ? "opacity-60" : "bg-muted/40"}`}
                  >
                    <p className="text-xs font-semibold">{n.title}</p>
                    <p className="line-clamp-2 text-[11px] text-muted-foreground">{n.body}</p>
                  </div>
                ))
              )}
            </div>
            <Link
              to="/notifications"
              className="block border-t border-border p-2.5 text-center text-[11px] font-semibold text-primary hover:underline"
            >
              View all
            </Link>
          </PopoverContent>
        </Popover>

        {/* Theme toggle */}
        <IconShell
          label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          onClick={onToggleTheme}
        >
          <motion.span
            key={theme}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </motion.span>
        </IconShell>

        {/* Profile */}
        <Popover>
          <PopoverTrigger asChild>
            <button className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cta-gradient text-xs font-bold text-white shadow-glow transition-transform hover:scale-105">
              {initials}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 rounded-2xl p-2">
            <div className="rounded-xl bg-muted/40 p-3">
              <p className="truncate text-sm font-bold">{user?.name ?? "Learner"}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user?.email ?? ""}</p>
            </div>
            <div className="mt-1 flex flex-col">
              <Link
                to="/profile"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted/50"
              >
                <User className="h-4 w-4" /> Profile
              </Link>
              <Link
                to="/daily-progress"
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted/50"
              >
                <Settings className="h-4 w-4" /> Daily progress
              </Link>
              <button
                onClick={() => logout()}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
