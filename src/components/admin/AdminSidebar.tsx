import { LogOut, Menu, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { MouseEvent } from "react";
import { toast } from "sonner";
import { adminNavItems } from "@/lib/app-data";
import { useAppStore } from "@/stores/app-store";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";


function normalizeAdminPath(path: string) {
  return path.replace(/\/+$/, "") || "/admin";
}

function SidebarBody({
  currentPath,
  mobile = false,
  onNavigate,
  onLogout,
}: {
  currentPath: string;
  mobile?: boolean;
  onNavigate: (target: string, event: MouseEvent<HTMLAnchorElement>) => void;
  onLogout: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2 px-2 py-2">
        <div className="bg-cta-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-glow">
          <ShieldCheck className="h-5 w-5 text-white" />
        </div>
        <div className="leading-tight">
          <p className="font-display text-sm font-bold tracking-tight">
            CA Aspire BD<span className="text-gradient"> Admin</span>
          </p>
          <p className="text-[10px] text-muted-foreground">Control Center · v3.2</p>
        </div>
      </div>

      <nav
        className="mt-6 min-h-0 flex-1 overflow-y-scroll scroll-smooth [scrollbar-color:hsl(var(--foreground)/0.25)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/25 [&::-webkit-scrollbar-thumb:hover]:bg-foreground/45"
        aria-label="Admin navigation"
      >
        <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Manage
        </p>
        <ul className="mt-2 space-y-1">
          {adminNavItems.map((m) => {
            const itemPath = normalizeAdminPath(m.to);
            const activePath = normalizeAdminPath(currentPath);
            const isActive =
              itemPath === "/admin"
                ? activePath === "/admin"
                : activePath === itemPath || activePath.startsWith(itemPath + "/");
            return (
              <li key={m.to}>
                <Link
                  to={m.to as never}
                  preload="intent"
                  onClick={(event) => onNavigate(m.to, event)}
                  aria-current={isActive ? "page" : undefined}
                  className={`group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-cta-gradient text-white shadow-glow"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <m.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  {isActive && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white shadow-[0_0_8px_white]" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <button
        onClick={onLogout}
        className="mt-4 flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="h-4 w-4 shrink-0" />
        <span className="truncate">Logout</span>
      </button>
    </>
  );
}

export function AdminSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  
  const logout = useAppStore((s) => s.logout);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const navigate = useNavigate();
  const handleLogout = async () => {
    await logout();
    setSidebarOpen(false);
    toast.success("Logged out");
    navigate({ to: "/login" });
  };
  const handleNavigate = (target: string, event: MouseEvent<HTMLAnchorElement>) => {
    // Modifier/aux-button clicks → let the browser handle normally.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    const from = normalizeAdminPath(currentPath);
    const to = normalizeAdminPath(target);
    // Same route: don't navigate; just close the mobile drawer.
    if (from === to) {
      event.preventDefault();
      if (sidebarOpen) setSidebarOpen(false);
      return;
    }
    // Different route: let TanStack <Link> drive the navigation (client-side,
    // type-safe, preserves preload). Just close the drawer.
    if (sidebarOpen) setSidebarOpen(false);
  };
  return (
    <>
      {/* Mobile hamburger trigger (lg- only) */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="glass fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
        aria-label="Open admin menu"
        aria-expanded={sidebarOpen}
        aria-controls="admin-mobile-drawer"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Mobile drawer — shadcn Sheet (focus trap, ESC, restore focus, aria-modal) */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent
          side="left"
          id="admin-mobile-drawer"
          className="glass flex w-72 max-w-[85vw] flex-col p-4 lg:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Admin navigation</SheetTitle>
          </SheetHeader>
          <SidebarBody
            currentPath={currentPath}
            mobile
            onNavigate={handleNavigate}
            onLogout={handleLogout}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar (unchanged) */}
      <aside className="glass shadow-card-soft sticky top-4 hidden h-[calc(100vh-2rem)] w-64 shrink-0 flex-col rounded-3xl p-4 lg:flex">
        <SidebarBody
          currentPath={currentPath}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
        />
      </aside>
    </>
  );
}
