import { Link, useRouterState } from "@tanstack/react-router";
import { GraduationCap, X } from "lucide-react";
import { memo, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { studentNavItems } from "@/lib/app-data";
import { useAppStore } from "@/stores/app-store";
import { useModuleVisibility } from "@/hooks/use-module-visibility";
import { useExamBatchVisibility } from "@/hooks/use-exam-batch-visibility";
import { useStudyRoutineVisibility } from "@/hooks/use-study-routine-visibility";
import { DashSidebarFooter } from "./DashSidebarFooter";

type NavItem = { title: string; to: string; icon: LucideIcon };

type SidebarContentProps = {
  mobile?: boolean;
  currentPath: string;
  learningItems: NavItem[];
  accountItems: NavItem[];
  onNavigate: () => void;
};

const SidebarContent = memo(function SidebarContent({
  mobile = false,
  currentPath,
  learningItems,
  accountItems,
  onNavigate,
}: SidebarContentProps) {
  return (
    <>
      <Link
        to="/"
        onClick={() => mobile && onNavigate()}
        className="flex shrink-0 items-center gap-2 px-2 py-2"
      >
        <div className="bg-cta-gradient flex h-9 w-9 items-center justify-center rounded-xl shadow-glow">
          <GraduationCap className="h-5 w-5 text-white" />
        </div>
        <span className="font-display text-base font-bold tracking-tight">
          CA Aspire BD<span className="text-gradient"> Pro</span>
        </span>
      </Link>

      <nav className="mt-6 min-h-0 flex-1 overflow-y-scroll scroll-smooth [scrollbar-color:hsl(var(--foreground)/0.25)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-foreground/25 [&::-webkit-scrollbar-thumb:hover]:bg-foreground/45">
        <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Learning
        </p>
        <ul className="mt-2 space-y-1">
          {learningItems.map((m) => {
            const isActive =
              currentPath === m.to || currentPath.startsWith(m.to + "/");
            return (
              <li key={m.title}>
                <Link
                  to={m.to as never}
                  activeOptions={{ exact: m.to !== "/exam-batch" }}
                  onClick={() => mobile && onNavigate()}
                  aria-current={isActive ? "page" : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-cta-gradient text-white"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <m.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{m.title}</span>
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      isActive ? "bg-white shadow-[0_0_8px_white]" : "bg-transparent"
                    }`}
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-6 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Account
        </p>
        <ul className="mt-2 space-y-1">
          {accountItems.map((s) => {
            const isActive = currentPath === s.to;
            return (
              <li key={s.title}>
                <Link
                  to={s.to as never}
                  activeOptions={{ exact: true }}
                  onClick={() => mobile && onNavigate()}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-cta-gradient text-white"
                      : "text-foreground/80 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <s.icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{s.title}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <DashSidebarFooter onNavigate={() => mobile && onNavigate()} />
    </>
  );
});

export function DashSidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const setSidebarOpen = useAppStore((s) => s.setSidebarOpen);
  const { isPathHidden } = useModuleVisibility();
  const { moduleVisible: examBatchVisible } = useExamBatchVisibility();
  const { enabled: studyRoutineEnabled } = useStudyRoutineVisibility();

  const { learningItems, accountItems } = useMemo(() => {
    const visible = studentNavItems.filter((item) => {
      if (isPathHidden(item.to)) return false;
      if (item.to === "/exam-batch" && !examBatchVisible) return false;
      if (item.to === "/study-routine" && !studyRoutineEnabled) return false;
      return true;
    });
    return {
      learningItems: visible.filter((i) => !["Notifications", "Profile"].includes(i.title)),
      accountItems: visible.filter((i) => ["Notifications", "Profile"].includes(i.title)),
    };
  }, [isPathHidden, examBatchVisible, studyRoutineEnabled]);

  const closeMobile = () => setSidebarOpen(false);

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={closeMobile}
          />
          <aside className="glass shadow-card-soft pointer-events-auto relative z-10 flex h-full w-72 max-w-[85vw] flex-col p-4">
            <button
              aria-label="Close menu"
              onClick={closeMobile}
              className="absolute right-3 top-3 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent
              mobile
              currentPath={currentPath}
              learningItems={learningItems}
              accountItems={accountItems}
              onNavigate={closeMobile}
            />
          </aside>
        </div>
      )}
      <aside className="glass shadow-card-soft sticky top-4 hidden h-[calc(100vh-2rem)] w-64 shrink-0 flex-col rounded-3xl p-4 lg:flex">
        <SidebarContent
          currentPath={currentPath}
          learningItems={learningItems}
          accountItems={accountItems}
          onNavigate={closeMobile}
        />
      </aside>
    </>
  );
}
