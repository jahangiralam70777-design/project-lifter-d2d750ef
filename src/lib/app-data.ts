import {
  Activity,
  BarChart3,
  Bell,
  Bookmark,
  Database,
  FileText,
  FolderTree,
  Layers,
  LayoutDashboard,
  LineChart,
  ListChecks,
  PlayCircle,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Timer,
  Trophy,
  User,
  Users,
  XCircle,
  Globe,
  Newspaper,
  MessageCircle,
  Megaphone,
  CalendarClock,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";

export type AppRole = "student" | "admin" | "super_admin" | "moderator";

export type NavItem = {
  title: string;
  to: string;
  icon: LucideIcon;
  keywords?: string[];
};

export const studentNavItems: NavItem[] = [
  { title: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  {
    title: "Daily Progress",
    to: "/daily-progress",
    icon: LineChart,
    keywords: ["progress", "analytics", "tracking", "streak"],
  },
  {
    title: "Study Routine",
    to: "/study-routine",
    icon: CalendarDays,
    keywords: ["routine", "planner", "schedule", "study plan"],
  },
  { title: "MCQ Practice", to: "/mcq-practice", icon: ListChecks, keywords: ["practice", "mcq"] },
  { title: "Quiz", to: "/quiz", icon: Timer },
  {
    title: "Custom Exam",
    to: "/custom-exam",
    icon: SlidersHorizontal,
    keywords: ["exam", "custom"],
  },
  { title: "Mock Test", to: "/mock-test", icon: Trophy, keywords: ["mock"] },
  { title: "Exam Batch", to: "/exam-batch", icon: CalendarClock, keywords: ["batch", "session", "enroll"] },
  { title: "Flash Cards", to: "/flash-cards", icon: Layers, keywords: ["flash"] },
  { title: "Short Notes", to: "/short-notes", icon: FileText, keywords: ["notes", "pdf"] },
  { title: "Qns Bank", to: "/qns-bank", icon: Database, keywords: ["question", "bank"] },
  { title: "Classes", to: "/classes", icon: PlayCircle, keywords: ["video", "watch"] },
  {
    title: "Wrong Answers",
    to: "/wrong-questions",
    icon: XCircle,
    keywords: ["wrong", "mistakes", "review"],
  },
  { title: "Bookmarks", to: "/bookmarks", icon: Bookmark, keywords: ["bookmark", "saved"] },
  { title: "Notifications", to: "/notifications", icon: Bell },
  { title: "Profile", to: "/profile", icon: User, keywords: ["settings", "goals"] },
];

export const adminNavItems: NavItem[] = [
  { title: "Dashboard", to: "/admin", icon: LayoutDashboard },
  {
    title: "Academic Manager",
    to: "/admin/academic-manager",
    icon: FolderTree,
    keywords: ["level", "subject", "chapter", "academic", "structure"],
  },
  { title: "MCQ Manager", to: "/admin/mcq", icon: ListChecks, keywords: ["upload mcq", "mcq"] },
  {
    title: "Routine Manager",
    to: "/admin/routine-manager",
    icon: CalendarClock,
    keywords: ["routine", "planner", "schedule", "study routine"],
  },

  { title: "Quiz Manager", to: "/admin/quiz", icon: Timer, keywords: ["quiz"] },
  { title: "Mock Test Manager", to: "/admin/mock-test", icon: Trophy, keywords: ["mock"] },
  { title: "Exam Batch Manager", to: "/admin/exam-batch", icon: CalendarClock, keywords: ["batch", "session", "enroll", "cohort"] },
  { title: "Flash Card Manager", to: "/admin/flash-cards", icon: Layers, keywords: ["flash"] },
  { title: "Short Notes Manager", to: "/admin/short-notes", icon: FileText, keywords: ["notes"] },
  {
    title: "Qns Bank Manager",
    to: "/admin/question-bank",
    icon: Database,
    keywords: ["question", "bank"],
  },
  {
    title: "Classes Manager",
    to: "/admin/classes",
    icon: PlayCircle,
    keywords: ["class", "video"],
  },
  { title: "User Management", to: "/admin/users", icon: Users, keywords: ["user"] },
  {
    title: "Roles & Permissions",
    to: "/admin/permissions",
    icon: ShieldCheck,
    keywords: ["permissions", "rbac", "role", "matrix", "access"],
  },
  {
    title: "Notification Manager",
    to: "/admin/notifications",
    icon: Bell,
    keywords: ["broadcast", "send"],
  },
  {
    title: "Analytics",
    to: "/admin/analytics",
    icon: BarChart3,
    keywords: ["report", "result", "analytics"],
  },
  {
    title: "Site Management",
    to: "/admin/site",
    icon: Globe,
    keywords: ["homepage", "cms", "site", "theme", "content"],
  },
  {
    title: "Blog Manager",
    to: "/admin/blog",
    icon: Newspaper,
    keywords: ["blog", "post", "article", "news"],
  },
  {
    title: "Database Manager",
    to: "/admin/database",
    icon: Database,
    keywords: ["storage", "size", "monitor", "database", "stats", "system"],
  },
  {
    title: "System Health",
    to: "/admin/system-health",
    icon: Activity,
    keywords: ["errors", "logs", "monitoring", "debug", "incidents", "health"],
  },
  {
    title: "Live Chat Manager",
    to: "/admin/live-chat",
    icon: MessageCircle,
    keywords: ["chat", "support", "messages", "inbox", "live"],
  },
  {
    title: "Broadcast Messages",
    to: "/admin/broadcasts",
    icon: Megaphone,
    keywords: ["broadcast", "announcement", "notify", "send", "blast"],
  },
  { title: "Settings", to: "/admin/settings", icon: Settings, keywords: ["save", "platform"] },
];

export function getRouteTitle(pathname: string) {
  const match = [...adminNavItems, ...studentNavItems].find((item) => item.to === pathname);
  if (match) return match.title;
  if (pathname === "/") return "Home";
  if (pathname === "/login") return "Student Login";
  if (pathname === "/signup" || pathname === "/register") return "Sign Up";
  if (pathname === "/admin/login") return "Admin Login";
  return (
    pathname
      .split("/")
      .filter(Boolean)
      .map((p) => p.replace(/-/g, " "))
      .join(" / ") || "CA Aspire BD"
  );
}

export function routeForAction(label: string, role: AppRole = "student") {
  const normalized = label.toLowerCase().replace(/\s+/g, " ").trim();
  const items = role === "admin" || role === "super_admin" || role === "moderator" ? adminNavItems : studentNavItems;
  const direct = items.find((item) =>
    [item.title.toLowerCase(), ...(item.keywords ?? [])].some((key) => normalized.includes(key)),
  );
  if (direct) return direct.to;
  if (normalized.includes("login") || normalized.includes("sign in"))
    return role === "admin" || role === "super_admin" || role === "moderator" ? "/admin/login" : "/login";
  if (
    normalized.includes("register") ||
    normalized.includes("sign up") ||
    normalized.includes("create account")
  )
    return "/signup";
  if (
    normalized.includes("start") ||
    normalized.includes("continue") ||
    normalized.includes("resume")
  )
    return "/dashboard";
  return null;
}
