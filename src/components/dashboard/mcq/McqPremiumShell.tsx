import { useScopedTheme } from "./useScopedTheme";

/**
 * Premium scoped wrapper for the MCQ Practice landing flow.
 * Keeps the page focused on Level → Subject → Chapter selection
 * (matching the reference) and lets McqFlow render its own premium
 * cards + right-side tracking panel without dashboard-style widgets
 * stacked on top.
 */
export function McqPremiumShell({ children }: { children: React.ReactNode }) {
  const { themeClass } = useScopedTheme();
  return (
    <div className={themeClass}>
      <div className="space-y-4 p-1 sm:p-2">{children}</div>
    </div>
  );
}
