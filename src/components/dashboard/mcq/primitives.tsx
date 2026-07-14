import { memo, useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import { studentPerformanceCenter } from "@/lib/student-performance.functions";

/* ---------------- Real overview data ---------------- */

export type Overview = Awaited<ReturnType<typeof studentPerformanceCenter>>;

export function useMcqOverview() {
  const fn = useServerFn(studentPerformanceCenter);
  return useQuery({
    queryKey: ["student-performance-center"],
    queryFn: () => fn() as Promise<Overview>,
    staleTime: 30_000,
  });
}

/* ---------------- Preview badge ---------------- */

export const PreviewBadge = memo(function PreviewBadge({ label = "PREVIEW" }: { label?: string }) {
  return (
    <span
      title="Sample data — full feature coming soon"
      className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-500"
    >
      <Sparkles className="h-2.5 w-2.5" /> {label}
    </span>
  );
});

/* ---------------- Action button with all states ---------------- */

type ActionState = "idle" | "loading" | "success" | "error";

export type ActionButtonProps = {
  onAction?: () => void | Promise<unknown>;
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant?: "primary" | "ghost" | "soft";
  disabled?: boolean;
  className?: string;
  successLabel?: string;
  title?: string;
};

export function ActionButton({
  onAction,
  children,
  icon,
  variant = "primary",
  disabled,
  className = "",
  successLabel = "Done",
  title,
}: ActionButtonProps) {
  const [state, setState] = useState<ActionState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback(async () => {
    if (!onAction || state === "loading") return;
    try {
      const result = onAction();
      if (result instanceof Promise) {
        setState("loading");
        await result;
      }
      setState("success");
    } catch {
      setState("error");
    } finally {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState("idle"), 1600);
    }
  }, [onAction, state]);

  const base =
    "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-2xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40";
  const tone =
    variant === "primary"
      ? "bg-cta-gradient text-white shadow-glow hover:scale-[1.02]"
      : variant === "soft"
        ? "border border-border bg-muted/40 text-foreground hover:bg-muted/70"
        : "text-foreground/80 hover:bg-muted/50";

  return (
    <button
      type="button"
      title={title}
      disabled={disabled || state === "loading"}
      onClick={run}
      className={`${base} ${tone} ${className}`}
    >
      {variant === "primary" && (
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
      )}
      <span className="relative flex items-center gap-2">
        {state === "loading" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "success" ? (
          <Check className="h-4 w-4" />
        ) : state === "error" ? (
          <X className="h-4 w-4" />
        ) : (
          icon
        )}
        {state === "success" ? successLabel : state === "error" ? "Failed" : children}
      </span>
    </button>
  );
}

/* ---------------- Misc helpers ---------------- */

export function fmtMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function downloadFile(name: string, content: string, mime = "text/csv") {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    /* ignore */
  }
}
