import { Search, Menu, Sun, Moon } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { LiveIndicator } from "@/components/realtime/LiveIndicator";

export function DashTopbar({ onMenu }: { onMenu?: () => void }) {
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const openMenu = onMenu ?? (() => setSidebarOpen(true));
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);

  const iconBtn =
    "group relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-background/60 text-foreground/80 transition-all hover:scale-105 hover:bg-muted hover:text-foreground";

  return (
    <header className="glass shadow-card-soft sticky top-4 z-30 flex items-center gap-2 rounded-2xl px-3 py-2.5 sm:gap-3 sm:px-4">
      <button
        type="button"
        onClick={openMenu}
        className="glass flex h-9 w-9 items-center justify-center rounded-xl lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="relative flex-1 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="Search subjects, MCQs, notes…"
          className="h-10 w-full rounded-xl border border-border bg-background/60 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
        />
      </div>

      <LiveIndicator className="ml-auto hidden sm:inline-flex" />

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={toggleTheme}
          data-store-theme-toggle="true"
          className={iconBtn}
          aria-label="Toggle theme"
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
    </header>
  );
}
