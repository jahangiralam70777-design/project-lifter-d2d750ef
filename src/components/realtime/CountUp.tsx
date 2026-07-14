import { useEffect, useRef, useState } from "react";

/**
 * Smoothly animates a number from its previous value to the new one.
 * Honors prefers-reduced-motion. Accepts optional formatter (e.g. for
 * comma-separated thousands or units).
 */
export function CountUp({
  value,
  duration = 800,
  format,
  className = "",
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const delta = value - from;

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + delta * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  const rendered = format
    ? format(display)
    : Number.isInteger(value)
      ? Math.round(display).toLocaleString()
      : display.toFixed(1);

  return <span className={`tabular-nums ${className}`}>{rendered}</span>;
}
