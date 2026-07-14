import { useEffect, useState } from "react";
import {
  Moon,
  Sun,
  GraduationCap,
  Menu,
  X,
  LayoutDashboard,
  LogIn,
  Sparkles,
  Newspaper,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useAppStore } from "@/stores/app-store";
import { useSetting } from "@/hooks/use-site-content";
import { useHydrated } from "@/hooks/use-hydrated";

type NavLink = { label: string; hash: string };

type NavbarSettings = {
  brand_primary: string;
  brand_secondary: string;
  tagline: string;
  links: NavLink[];
};

const NAVBAR_DEFAULTS: NavbarSettings = {
  brand_primary: "CA Aspire",
  brand_secondary: "BD",
  tagline: "ICAB Learning OS",
  links: [
    { label: "Features", hash: "features" },
    { label: "Learning Paths", hash: "learning-paths" },
    { label: "Subjects", hash: "subjects" },
    { label: "Exams", hash: "exam-system" },
    { label: "FAQ", hash: "faq" },
  ],
};

function scrollToHash(hash: string) {
  const el = document.getElementById(hash);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - 80;
  window.scrollTo({ top, behavior: "smooth" });
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState<string>("");
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const user = useAppStore((s) => s.user);
  const sessionReady = useAppStore((s) => s.sessionReady);
  const nav = useSetting<NavbarSettings>("navbar", NAVBAR_DEFAULTS);
  const LINKS: NavLink[] =
    Array.isArray(nav.links) && nav.links.length > 0 ? nav.links : NAVBAR_DEFAULTS.links;
  // Gate any UI that depends on browser-only state (theme from localStorage,
  // user session restored by hydrate()) until after the first client commit
  // so SSR HTML and the first client render are byte-identical.
  const hydrated = useHydrated();
  const showAuthedNav = hydrated && sessionReady && Boolean(user);
  const themeIsDark = hydrated && theme === "dark";

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 12);
      let current = "";
      for (const l of LINKS) {
        const el = document.getElementById(l.hash);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= 120) current = l.hash;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const dashboardHref = user?.role === "admin" ? "/admin" : "/dashboard";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "pt-2" : "pt-4"
      }`}
    >
      <div className="mx-auto w-[min(1200px,calc(100%-1.5rem))]">
        <nav
          className={`flex items-center justify-between rounded-2xl border border-border/60 px-3 py-2.5 backdrop-blur-2xl transition-all duration-300 sm:px-5 ${
            scrolled
              ? "bg-background/80 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.5)]"
              : "bg-background/40"
          }`}
        >
          <Link to="/" className="group flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)] text-white shadow-[0_0_20px_var(--neon-purple)] transition-transform group-hover:scale-105">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="font-display text-[15px] font-bold tracking-tight sm:text-base">
                {nav.brand_primary}
                <span className="text-gradient"> {nav.brand_secondary}</span>
              </p>
              <p className="hidden text-[9px] uppercase tracking-[0.22em] text-muted-foreground sm:block">
                {nav.tagline}
              </p>
            </div>
          </Link>

          <ul className="hidden items-center gap-1 lg:flex">
            {LINKS.map((l) => {
              const isActive = active === l.hash;
              return (
                <li key={l.hash}>
                  <button
                    type="button"
                    onClick={() => scrollToHash(l.hash)}
                    className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l.label}
                    {isActive && (
                      <span className="pointer-events-none absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)]" />
                    )}
                  </button>
                </li>
              );
            })}
            <li>
              <Link
                to="/blog"
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                <Newspaper className="h-3.5 w-3.5" />
                Blog
              </Link>
            </li>
          </ul>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-background/60 text-foreground transition hover:-translate-y-0.5 hover:border-[var(--neon-purple)]/60"
              aria-label="Toggle theme"
            >
              {themeIsDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {showAuthedNav ? (
              <Link
                to={dashboardHref}
                className="hidden items-center gap-1.5 rounded-xl border border-border/60 bg-background/60 px-3.5 py-2 text-sm font-semibold text-foreground transition hover:-translate-y-0.5 hover:border-[var(--neon-purple)]/60 sm:inline-flex"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="hidden items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium text-foreground/80 transition hover:text-foreground sm:inline-flex"
                >
                  <LogIn className="h-4 w-4" />
                  Login
                </Link>
                <Link
                  to="/signup"
                  className="hidden items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_var(--neon-purple)] transition hover:-translate-y-0.5 sm:inline-flex"
                  style={{ background: "var(--gradient-cta)" }}
                >
                  <Sparkles className="h-4 w-4" />
                  Sign Up
                </Link>
              </>
            )}

            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-xl border border-border/60 bg-background/60 lg:hidden"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        <div
          className={`overflow-hidden transition-all duration-300 lg:hidden ${
            open ? "mt-2 max-h-[80vh] opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="rounded-2xl border border-border/60 bg-background/90 p-3 backdrop-blur-2xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.5)]">
            <ul className="flex flex-col gap-0.5">
              {LINKS.map((l) => (
                <li key={l.hash}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setTimeout(() => scrollToHash(l.hash), 50);
                    }}
                    className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                      active === l.hash
                        ? "bg-muted text-foreground"
                        : "text-foreground/80 hover:bg-muted"
                    }`}
                  >
                    {l.label}
                  </button>
                </li>
              ))}
              <li>
                <Link
                  to="/blog"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground/80 hover:bg-muted"
                >
                  <Newspaper className="h-4 w-4" />
                  Blog
                </Link>
              </li>
            </ul>

            <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 sm:hidden">
              {showAuthedNav ? (
                <Link
                  to={dashboardHref}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm font-semibold"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm font-medium"
                  >
                    <LogIn className="h-4 w-4" />
                    Login
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white"
                    style={{ background: "var(--gradient-cta)" }}
                  >
                    <Sparkles className="h-4 w-4" />
                    Sign Up
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
