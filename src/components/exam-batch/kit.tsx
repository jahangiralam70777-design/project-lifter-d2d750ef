import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// ---------------- Sub-nav ----------------
export type SubNavItem = { title: string; to: string; icon: LucideIcon };

export function ExamBatchSubNav({ items }: { items: SubNavItem[] }) {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const norm = (p: string) => p.replace(/\/+$/, "");
  // Horizontal-only scroll, whitespace-nowrap, always-visible thin scrollbar.
  // Shift+wheel, touch swipe, trackpad and scrollbar dragging all work
  // because the container is a native scroll container with the browser's
  // default horizontal-scroll behaviour on `overflow-x: auto`.
  return (
    <div
      className="exam-batch-subnav glass shadow-card-soft sticky top-2 z-20 flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-2xl p-1.5 backdrop-saturate-150"
      style={{
        overflowX: "auto",
        overflowY: "hidden",
        WebkitOverflowScrolling: "touch",
        scrollbarGutter: "stable",
        scrollbarWidth: "thin",
      }}
    >
      {items.map((it) => {
        const active = norm(currentPath) === norm(it.to);
        return (
          <Link
            key={it.to}
            to={it.to as never}
            preload="intent"
            className={cn(
              "group relative inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all duration-200 sm:text-sm",
              active
                ? "bg-cta-gradient text-white shadow-glow"
                : "text-foreground/70 hover:bg-muted/70 hover:text-foreground",
            )}
          >
            <it.icon className={cn("h-4 w-4 shrink-0 transition-transform", active ? "" : "group-hover:scale-110")} />
            <span className="whitespace-nowrap">{it.title}</span>
          </Link>
        );
      })}
    </div>
  );
}

// ---------------- Page header ----------------
export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-5 sm:p-7"
    >
      <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-60" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cta-gradient opacity-25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          {Icon && (
            <div className="bg-cta-gradient flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-glow ring-1 ring-white/20">
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {eyebrow}
              </p>
            )}
            <h1 className="text-gradient font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </motion.div>
  );
}

// ---------------- Stat card ----------------
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: "primary" | "success" | "warning" | "info";
}) {
  const toneMap: Record<string, string> = {
    primary: "bg-cta-gradient",
    success: "bg-gradient-to-br from-emerald-500 to-teal-500",
    warning: "bg-gradient-to-br from-amber-500 to-orange-500",
    info: "bg-gradient-to-br from-sky-500 to-indigo-500",
  };
  return (
    <div className="glass shadow-card-soft group relative flex h-full flex-col overflow-hidden rounded-2xl p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-glow sm:p-5">
      <div
        className={cn(
          "pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-20 blur-2xl transition-opacity duration-300 group-hover:opacity-40",
          toneMap[tone],
        )}
      />
      <div className="relative flex flex-1 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            {label}
          </p>
          <div className="mt-2 font-display text-2xl font-bold leading-tight tracking-tight [word-break:break-word] sm:text-[1.75rem]">
            {value}
          </div>
          {hint && <p className="mt-1 text-xs text-muted-foreground [word-break:break-word]">{hint}</p>}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-glow ring-1 ring-white/20 transition-transform duration-300 group-hover:scale-110",
            toneMap[tone],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}


// ---------------- Section card ----------------
export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("glass shadow-card-soft rounded-3xl p-5 sm:p-6", className)}>
      {(title || action) && (
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
          <div className="min-w-0">
            {title && (
              <h2 className="font-display text-base font-semibold tracking-tight sm:text-lg">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground sm:text-[13px]">{description}</p>
            )}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// ---------------- Status badge ----------------
export type StatusTone =
  | "active"
  | "open"
  | "closed"
  | "pending"
  | "approved"
  | "rejected"
  | "upcoming"
  | "live"
  | "ended";

export function StatusBadge({ status }: { status: StatusTone | string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30",
    open: "bg-sky-500/15 text-sky-500 ring-sky-500/30",
    closed: "bg-muted text-muted-foreground ring-border",
    pending: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
    approved: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30",
    rejected: "bg-destructive/15 text-destructive ring-destructive/30",
    banned: "bg-rose-600/15 text-rose-500 ring-rose-500/30",
    upcoming: "bg-indigo-500/15 text-indigo-500 ring-indigo-500/30",
    live: "bg-rose-500/15 text-rose-500 ring-rose-500/30",
    ended: "bg-muted text-muted-foreground ring-border",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground ring-border";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ring-1 ring-inset",
        cls,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
      </span>
      {status}
    </span>
  );
}

// ---------------- Session Card ----------------
export type SessionCardData = {
  id: string;
  title: string;
  subtitle?: string;
  status: StatusTone;
  registrationOpen: boolean;
  totalStudents: number;
  startsAt: string; // ISO
  registrationDeadline?: string; // ISO
  subjectsCount?: number;
  isCurrent?: boolean;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function Countdown({ target }: { target: string }) {
  const t = new Date(target).getTime();
  const now = Date.now();
  const diff = Math.max(0, t - now);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const mins = Math.floor((diff / (1000 * 60)) % 60);
  const items = [
    { l: "D", v: days },
    { l: "H", v: hours },
    { l: "M", v: mins },
  ];
  return (
    <div className="flex items-center gap-1.5">
      {items.map((it) => (
        <div
          key={it.l}
          className="min-w-[46px] rounded-lg bg-white/15 px-2 py-1.5 text-center ring-1 ring-inset ring-white/20 backdrop-blur"
        >
          <p className="font-display text-base font-bold leading-none tabular-nums text-white">
            {String(it.v).padStart(2, "0")}
          </p>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/70">
            {it.l}
          </p>
        </div>
      ))}
    </div>
  );
}

export function SessionCard({ data, actions }: { data: SessionCardData; actions?: ReactNode }) {
  return (
    <motion.article
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 220, damping: 20 }}
      className="group relative overflow-hidden rounded-3xl shadow-card-soft"
    >
      <div className="bg-cta-gradient absolute inset-0" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-black/20 blur-3xl" />
      <div className="relative p-5 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
              Exam Batch Session
            </p>
            <h3 className="mt-1 font-display text-lg font-bold tracking-tight">{data.title}</h3>
            {data.subtitle && <p className="mt-0.5 text-xs text-white/75">{data.subtitle}</p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <StatusBadge status={data.status} />
            {data.isCurrent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white backdrop-blur">
                ★ Current
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/10 px-3 py-2.5 backdrop-blur">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
              Starts In
            </p>
            <p className="mt-0.5 text-[11px] text-white/80">{fmtDate(data.startsAt)}</p>
          </div>
          <Countdown target={data.startsAt} />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
              Registration
            </p>
            <p className="mt-0.5 font-semibold">{data.registrationOpen ? "Open" : "Closed"}</p>
          </div>
          {data.registrationDeadline && (
            <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
                Deadline
              </p>
              <p className="mt-0.5 font-semibold">{fmtDate(data.registrationDeadline)}</p>
            </div>
          )}
          <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
              Students
            </p>
            <p className="mt-0.5 font-semibold tabular-nums">
              {data.totalStudents.toLocaleString()}
            </p>
          </div>
          {typeof data.subjectsCount === "number" && (
            <div className="rounded-xl bg-white/10 px-3 py-2 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
                Subjects
              </p>
              <p className="mt-0.5 font-semibold tabular-nums">{data.subjectsCount}</p>
            </div>
          )}
        </div>

        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </motion.article>
  );
}

// ---------------- Stepper ----------------
export function Stepper({
  steps,
  current,
}: {
  steps: { label: string; hint?: string }[];
  current: number; // 0-based
}) {
  return (
    <ol className="glass shadow-card-soft mb-6 flex items-center gap-2 overflow-x-auto rounded-2xl p-2">
      {steps.map((s, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={s.label} className="flex flex-1 min-w-[140px] items-center gap-2">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold transition-all",
                state === "done" && "bg-emerald-500 text-white shadow-glow",
                state === "active" && "bg-cta-gradient text-white shadow-glow",
                state === "todo" && "bg-muted text-muted-foreground",
              )}
            >
              {state === "done" ? "✓" : i + 1}
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  "truncate text-xs font-semibold",
                  state === "todo" && "text-muted-foreground",
                )}
              >
                {s.label}
              </p>
              {s.hint && (
                <p className="truncate text-[10px] text-muted-foreground">{s.hint}</p>
              )}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "hidden h-px flex-1 md:block",
                  i < current ? "bg-emerald-500/50" : "bg-border",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ---------------- Empty state ----------------
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass shadow-card-soft relative flex flex-col items-center justify-center overflow-hidden rounded-3xl px-6 py-14 text-center">
      <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-40" />
      <div className="bg-cta-gradient relative flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-glow ring-1 ring-white/20">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="relative mt-5 font-display text-lg font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="relative mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="relative mt-5">{action}</div>}
    </div>
  );
}

// ---------------- Skeleton grid ----------------
export function SkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="glass shadow-card-soft relative h-40 overflow-hidden rounded-3xl bg-muted/30"
        >
          <div
            className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent"
            style={{ animation: "shimmer 2s linear infinite", backgroundSize: "200% 100%" }}
          />
        </div>
      ))}
    </div>
  );
}

// ---------------- Filter Bar ----------------
export function FilterBar({
  children,
  onSearchChange,
  searchPlaceholder = "Search…",
}: {
  children?: ReactNode;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;
}) {
  return (
    <div className="glass shadow-card-soft flex flex-col gap-2 rounded-2xl p-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder={searchPlaceholder}
          onChange={(e) => onSearchChange?.(e.target.value)}
          className="h-10 w-full rounded-xl border border-input bg-background/60 pl-9 pr-3 text-sm outline-none ring-ring/20 transition focus:border-primary/50 focus:ring-2"
        />
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ---------------- Data Table ----------------
export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  empty,
}: {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        {empty ?? "No records found."}
      </div>
    );
  }
  return (
    <div className="glass shadow-card-soft overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 text-[10px] uppercase tracking-[0.15em] text-muted-foreground backdrop-blur">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cn(
                    "border-b border-border/60 px-4 py-3 font-semibold first:pl-5 last:pr-5",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.id}
                className={cn(
                  "border-t border-border/40 transition-colors hover:bg-primary/[0.04]",
                  idx % 2 === 1 && "bg-muted/20",
                )}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={cn(
                      "px-4 py-3 align-middle tabular-nums first:pl-5 last:pr-5",
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------- Primary button style ----------------
export const primaryBtnCls =
  "bg-cta-gradient inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-glow ring-1 ring-inset ring-white/20 transition-all duration-200 hover:scale-[1.03] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const ghostBtnCls =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-input bg-background/60 px-4 py-2 text-sm font-semibold text-foreground backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ---------------- Filter Chip ----------------
export function FilterChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all",
        active
          ? "bg-cta-gradient text-white shadow-glow"
          : "border border-input bg-background/60 text-foreground/80 hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

// ---------------- Bulk Actions Bar ----------------
export function BulkBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children?: ReactNode;
}) {
  if (!count) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass shadow-card-soft mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/30 p-2.5 pl-3"
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="bg-cta-gradient inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-bold text-white shadow-glow">
          {count}
        </span>
        <span className="font-semibold">selected</span>
        <button
          onClick={onClear}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Clear
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </motion.div>
  );
}

// ---------------- Kbd ----------------
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
      {children}
    </kbd>
  );
}
