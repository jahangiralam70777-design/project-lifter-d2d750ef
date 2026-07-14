import { useEffect, useState } from "react";
import { useRealtimeActivity, realtimeBus } from "@/hooks/use-realtime-invalidator";

/**
 * Compact "Live" pulse indicator. Sits in the topbar.
 * - Idle: soft green dot with "Live" label.
 * - On every realtime event: flashes, briefly shows "Synced".
 */
export function LiveIndicator({ className = "" }: { className?: string }) {
  const count = useRealtimeActivity();
  const [flash, setFlash] = useState(false);
  const [label, setLabel] = useState<"Live" | "Synced">("Live");

  useEffect(() => {
    if (count === 0) return;
    setFlash(true);
    setLabel("Synced");
    const t1 = window.setTimeout(() => setFlash(false), 700);
    const t2 = window.setTimeout(() => setLabel("Live"), 1400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [count]);

  const last = realtimeBus.last;

  return (
    <div
      role="status"
      aria-live="polite"
      title={
        last ? `Last update: ${last.table} (${last.type.toLowerCase()})` : "Realtime sync active"
      }
      className={[
        "glass inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-300",
        flash
          ? "ring-1 ring-emerald-400/60 shadow-[0_0_18px_rgba(16,185,129,0.35)] scale-[1.03]"
          : "",
        className,
      ].join(" ")}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={[
            "absolute inline-flex h-full w-full rounded-full opacity-75",
            flash ? "animate-ping bg-emerald-400" : "bg-emerald-400/40",
          ].join(" ")}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span
        className={[
          "tabular-nums transition-colors",
          flash ? "text-emerald-300" : "text-muted-foreground",
        ].join(" ")}
      >
        {label}
      </span>
    </div>
  );
}
