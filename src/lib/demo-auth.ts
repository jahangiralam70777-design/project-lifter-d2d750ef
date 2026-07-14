import type { AuthUser } from "@/lib/auth-client";

const DEMO_SESSION_KEY = "edumaster.demo_session";

// H-2 fix: demo accounts must NEVER ship in the production bundle.
// `import.meta.env.DEV` is statically replaced at build time, so the entire
// credential object is tree-shaken out of production builds. In dev/preview
// the walkthrough demo accounts remain available.
export const DEMO_USERS: Record<string, AuthUser & { password: string }> = import.meta.env.DEV
  ? {
      "demo@student.com": {
        id: "demo-student-001",
        name: "Alex Morgan",
        email: "demo@student.com",
        role: "student",
        password: "Demo@1234",
      },
      "demo@admin.com": {
        id: "demo-admin-001",
        name: "Demo Admin",
        email: "demo@admin.com",
        role: "admin",
        password: "Admin@1234",
      },
    }
  : {};

export function getDemoSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  // M-1 fix: demo sessions are a dev-only convenience. In production, refuse
  // to hydrate from `edumaster.demo_session` so a tampered localStorage value
  // cannot inject a fake admin/student user into the store.
  if (!import.meta.env.DEV) return null;
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}


export function setDemoSession(user: AuthUser): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(user));
}

export function clearDemoSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_SESSION_KEY);
}

export function demoSignIn(email: string, password: string): AuthUser {
  const user = DEMO_USERS[email.trim().toLowerCase()];
  if (!user) throw new Error("No demo account found for this email.");
  if (user.password !== password) throw new Error("Incorrect password.");
  const { password: _pw, ...authUser } = user;
  setDemoSession(authUser);
  return authUser;
}
