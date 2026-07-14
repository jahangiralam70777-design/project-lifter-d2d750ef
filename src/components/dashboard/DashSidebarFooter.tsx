import { Link, useNavigate } from "@tanstack/react-router";
import { Settings, LogOut } from "lucide-react";
import { useAppStore } from "@/stores/app-store";

export function DashSidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  const logout = useAppStore((s) => s.logout);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    setSidebarOpen(false);
    navigate({ to: "/login" });
  };

  const base =
    "flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background/60 text-xs font-medium transition-all hover:scale-[1.02]";

  return (
    <div className="mt-4 flex items-center gap-2 border-t border-border/60 pt-4">
      <Link
        to="/profile"
        onClick={() => onNavigate?.()}
        className={`${base} text-foreground/80 hover:bg-muted hover:text-foreground`}
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="h-4 w-4" />
        Settings
      </Link>
      <button
        type="button"
        onClick={handleLogout}
        className={`${base} text-foreground/80 hover:bg-destructive/10 hover:text-destructive`}
        aria-label="Logout"
        title="Logout"
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>
    </div>
  );
}
