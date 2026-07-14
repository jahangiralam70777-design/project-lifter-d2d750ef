/**
 * PageSizeSelect — lightweight, theme-aware rows-per-page selector.
 * Used by admin tables so users can switch between 10/25/50/100 rows.
 */
import { cn } from "@/lib/utils";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function PageSizeSelect({
  value,
  onChange,
  options = PAGE_SIZE_OPTIONS as unknown as number[],
  className,
  label = "Rows per page",
}: {
  value: number;
  onChange: (n: number) => void;
  options?: number[];
  className?: string;
  label?: string;
}) {
  return (
    <label className={cn("flex items-center gap-2 text-xs text-muted-foreground", className)}>
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </label>
  );
}
