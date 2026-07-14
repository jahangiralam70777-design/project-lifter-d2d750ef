// =====================================================================
// Page Registry — canonical, code-defined source of truth for admin
// surfaces. DB rows in `app_pages` are *overrides* (label/enabled), and
// `page_access` stores role↔page grants. Add a route → add a row here.
// =====================================================================

export type PageRegistryEntry = {
  key: string;
  route: string;
  label: string;
  group: string;
  description?: string;
};

export const PAGE_REGISTRY = [
  { key: "admin.dashboard",       route: "/admin",                   label: "Dashboard",            group: "Overview" },
  { key: "admin.academic",        route: "/admin/academic-manager",  label: "Academic Manager",     group: "Content" },
  { key: "admin.mcq",             route: "/admin/mcq",               label: "MCQ Manager",          group: "Content" },
  { key: "admin.quiz",            route: "/admin/quiz",              label: "Quiz Manager",         group: "Content" },
  { key: "admin.mock-test",       route: "/admin/mock-test",         label: "Mock Test Manager",    group: "Content" },
  { key: "admin.flash-cards",     route: "/admin/flash-cards",       label: "Flash Cards",          group: "Content" },
  { key: "admin.short-notes",     route: "/admin/short-notes",       label: "Short Notes",          group: "Content" },
  { key: "admin.question-bank",   route: "/admin/question-bank",     label: "Question Bank",        group: "Content" },
  { key: "admin.classes",         route: "/admin/classes",           label: "Video Classes",        group: "Content" },
  { key: "admin.users",           route: "/admin/users",             label: "User Management",      group: "People" },
  { key: "admin.permissions",     route: "/admin/permissions",       label: "Roles & Permissions",  group: "People" },
  { key: "admin.notifications",   route: "/admin/notifications",     label: "Notifications",        group: "Engagement" },
  { key: "admin.broadcasts",      route: "/admin/broadcasts",        label: "Broadcasts",           group: "Engagement" },
  { key: "admin.live-chat",       route: "/admin/live-chat",         label: "Live Chat",            group: "Engagement" },
  { key: "admin.analytics",       route: "/admin/analytics",         label: "Analytics",            group: "Insights" },
  { key: "admin.site",            route: "/admin/site",              label: "Site Management",      group: "System" },
  { key: "admin.site-editor",     route: "/admin/site-editor",       label: "Site Editor",          group: "System" },
  { key: "admin.blog",            route: "/admin/blog",              label: "Blog Manager",         group: "System" },
  { key: "admin.database",        route: "/admin/database",          label: "Database Manager",     group: "System" },
  { key: "admin.system-health",   route: "/admin/system-health",     label: "System Health",        group: "System" },
  { key: "admin.routine-manager", route: "/admin/routine-manager",  label: "Routine Manager",      group: "Insights" },
  { key: "admin.settings",        route: "/admin/settings",          label: "Settings",             group: "System" },
] as const satisfies readonly PageRegistryEntry[];

export type PageKey = (typeof PAGE_REGISTRY)[number]["key"];

// Longest-prefix-first → ensures `/admin/users/analytics` matches
// `/admin/users` rather than `/admin`.
const SORTED = [...PAGE_REGISTRY].sort((a, b) => b.route.length - a.route.length);

export function pageKeyForPath(pathname: string): PageKey | null {
  if (!pathname.startsWith("/admin")) return null;
  // Strip trailing slash
  const path = pathname.replace(/\/+$/, "") || "/admin";
  const exact = PAGE_REGISTRY.find((p) => p.route === path);
  if (exact) return exact.key as PageKey;
  const prefix = SORTED.find(
    (p) => path === p.route || path.startsWith(p.route + "/"),
  );
  return (prefix?.key as PageKey) ?? null;
}

export function pageForKey(key: string): PageRegistryEntry | undefined {
  return PAGE_REGISTRY.find((p) => p.key === key);
}