import { useCallback } from "react";
import { useAppStore } from "@/stores/app-store";

export type ScopedTheme = "light" | "dark";

/**
 * MCQ Practice theme hook — bound to the GLOBAL app theme store.
 *
 * Previously this maintained a page-scoped theme in its own localStorage key,
 * which caused partial/inconsistent updates: some child components read the
 * global theme (`.dark` on <html>) while others read the scoped wrapper class,
 * so toggling on the MCQ page only updated parts of the UI.
 *
 * The MCQ page now subscribes to the same `theme` value in `useAppStore`
 * that the rest of the app uses, and `toggle()` calls the global
 * `toggleTheme()` action. This guarantees:
 *   - One source of truth (Zustand store) shared by every component
 *   - Instant, full-page re-render on toggle (all subscribers update together)
 *   - Persistence + rehydration via the existing `edumaster.theme` localStorage key
 *   - `.dark` on <html> stays in sync with the wrapper class
 */
export function useScopedTheme() {
  const theme = useAppStore((s) => s.theme) as ScopedTheme;
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const toggle = useCallback(() => {
    toggleTheme();
  }, [toggleTheme]);

  const themeClass =
    theme === "dark" ? "mcq-scope dark" : "mcq-scope mcq-theme-light";

  return { theme, toggle, themeClass };
}
