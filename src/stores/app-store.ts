// @ts-nocheck
import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import type { AppRole } from "@/lib/app-data";
import { supabase } from "@/integrations/supabase/client";
import { fetchSessionUser, signOut, type AuthUser } from "@/lib/auth-client";
import { getDemoSession } from "@/lib/demo-auth";
import { claimNewSession, clearLocalSessionId, getLocalSessionId } from "@/lib/single-session";
import { clearSessionTimers } from "@/lib/session-timeout";

type UserSession = AuthUser | null;
type ThemeMode = "dark" | "light";

type AppState = {
  user: UserSession;
  sessionReady: boolean;
  authLoading: boolean;
  authError: string | null;
  authVersion: number;
  theme: ThemeMode;
  sidebarOpen: boolean;
  notificationsUnread: number;
  quizRuntime: { active: boolean; score: number; answered: number };
  hydrated: boolean;
  hydrate: () => void;
  login: (user: NonNullable<UserSession>) => void;
  syncAuthSession: (session?: Session | null, user?: NonNullable<UserSession>) => UserSession;
  refreshAuth: (options?: { force?: boolean }) => Promise<UserSession>;
  logout: () => Promise<void>;
  toggleTheme: () => void;
  setSidebarOpen: (open: boolean) => void;
  markNotificationsRead: () => void;
  setQuizRuntime: (quizRuntime: AppState["quizRuntime"]) => void;
};

const THEME_KEY = "edumaster.theme";
const AUTH_SNAPSHOT_KEY = "edumaster.auth_snapshot";
let authSubscribed = false;
let storageSubscribed = false;
let inflightRefresh: Promise<UserSession> | null = null;
let authEpoch = 0;
let refreshEpoch = 0;
const AUTH_REFRESH_TIMEOUT_MS = 8_000;

function deferAuthWork(work: () => void) {
  if (typeof window !== "undefined") {
    window.setTimeout(work, 0);
    return;
  }
  queueMicrotask(work);
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(label)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyThemeClass(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function persistTheme(theme: ThemeMode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* noop */
  }
}

export function getLocalAuthSnapshot(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_SNAPSHOT_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function hasLocalAuthSession(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(AUTH_SNAPSHOT_KEY)) return true;
    if (window.localStorage.getItem("edumaster.demo_session")) return true;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function persistAuthSnapshot(user: UserSession) {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(AUTH_SNAPSHOT_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(AUTH_SNAPSHOT_KEY);
  } catch {
    /* noop */
  }
}

function toAuthUser(session: Session): NonNullable<UserSession> {
  const email = session.user.email ?? "";
  return {
    id: session.user.id,
    name: (session.user.user_metadata?.display_name as string) ?? email.split("@")[0] ?? "Learner",
    email,
    role: "student",
  };
}

function bumpAuthVersion() {
  authEpoch += 1;
  return authEpoch;
}

function emitAuthSync() {
  // Same-tab auth sync is handled by Zustand state updates. Other tabs get
  // native `storage` events from persistAuthSnapshot/localStorage writes.
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  sessionReady: true,
  authLoading: false,
  authError: null,
  authVersion: 0,
  theme: "light",
  sidebarOpen: false,
  notificationsUnread: 0,
  quizRuntime: { active: false, score: 0, answered: 0 },
  hydrated: false,
  hydrate: () => {
    if (typeof window === "undefined") return;
    if (get().hydrated) return;
    const theme = readStoredTheme();
    applyThemeClass(theme);
    persistTheme(theme);
    const demoUser = getDemoSession();
    const snapshotUser = getLocalAuthSnapshot();
    const localUser = demoUser ?? snapshotUser;
    set({
      theme,
      hydrated: true,
      user: localUser ?? get().user,
      sessionReady: true,
      authLoading: Boolean(snapshotUser && !demoUser),
    });

    if (!authSubscribed) {
      authSubscribed = true;
      supabase.auth.onAuthStateChange((event, session) => {
        console.debug("[auth] state change", { event, hasSession: !!session });
        const current = get().user;
        if (event === "SIGNED_OUT") {
          clearLocalSessionId();
          persistAuthSnapshot(null);
          set({
            user: null,
            sessionReady: true,
            authLoading: false,
            authError: null,
            authVersion: bumpAuthVersion(),
          });
          emitAuthSync();
          return;
        }
        // A fresh sign-in mints a new single-session id and writes it to the
        // DB. Any other device still signed in for this account will see the
        // change via Realtime and force-logout itself.
        if (event === "SIGNED_IN" && session?.user?.id) {
          const uid = session.user.id;
          const isDuplicateForCurrentUser = current?.id === uid && !!getLocalSessionId(uid);
          if (!isDuplicateForCurrentUser) {
            deferAuthWork(() => {
              void claimNewSession(uid).catch((e) => {
                console.warn("[single-session] claim error", e);
              });
            });
          }
        }
        if (!session) {
          set({ user: current ?? null, sessionReady: true, authLoading: false, authError: null });
          return;
        }
        // Skip refetch for token refreshes / user-updates when we already
        // have the same user loaded — avoids the double session fetch.
        if (
          (event === "TOKEN_REFRESHED" ||
            event === "USER_UPDATED" ||
            event === "INITIAL_SESSION" ||
            event === "SIGNED_IN") &&
          current &&
          current.id === session.user.id
        ) {
          set({ sessionReady: true, authLoading: Boolean(inflightRefresh) });
          return;
        }
        // Do NOT optimistically guess a role here — writing role:"student"
        // for an admin causes route guards to bounce (admin→student→admin).
        // Mark auth as loading and let refreshAuth() resolve the real role
        // from the backend before any gate makes a redirect decision.
        if (!current || current.id !== session.user.id) {
          set({
            sessionReady: true,
            authLoading: true,
            authError: null,
          });
        }
        // Supabase auth callbacks run while the auth client holds its internal
        // lock. Starting getSession()/database work synchronously from here can
        // deadlock that lock and leave authLoading=true forever. Always defer
        // follow-up auth work to the next macrotask.
        deferAuthWork(() => {
          void get().refreshAuth({ force: event === "SIGNED_IN" });
        });
      });
    }

    if (!storageSubscribed) {
      storageSubscribed = true;
      window.addEventListener("storage", (event) => {
        const key = event instanceof StorageEvent ? event.key : null;
        if (
          key &&
          key !== "edumaster.demo_session" &&
          !(key.startsWith("sb-") && key.endsWith("-auth-token"))
        )
          return;
        void useAppStore.getState().refreshAuth({ force: true });
      });
    }

    void get().refreshAuth();
  },
  login: (user) => {
    persistAuthSnapshot(user);
    set({
      user,
      sessionReady: true,
      authLoading: false,
      authError: null,
      authVersion: bumpAuthVersion(),
    });
    emitAuthSync();
  },
  syncAuthSession: (session, user) => {
    const resolvedUser = user ?? (session ? toAuthUser(session) : null);
    persistAuthSnapshot(resolvedUser);
    set({
      user: resolvedUser,
      sessionReady: true,
      authLoading: false,
      authError: null,
      authVersion: bumpAuthVersion(),
    });
    emitAuthSync();
    return resolvedUser;
  },
  refreshAuth: async (options) => {
    if (inflightRefresh && !options?.force) return inflightRefresh;
    set({ authLoading: true });
    const runId = ++refreshEpoch;
    const run = (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_REFRESH_TIMEOUT_MS,
          "Auth session restore timed out",
        );
        if (error) {
          console.warn("[auth] getSession error", error);
          const msg = (error.message ?? "").toLowerCase();
          if (msg.includes("refresh") || msg.includes("token")) {
            try {
              await supabase.auth.signOut({ scope: "local" });
            } catch {
              /* noop */
            }
            if (runId === refreshEpoch) {
              set({
                user: null,
                sessionReady: true,
                authLoading: false,
                authError: null,
                authVersion: bumpAuthVersion(),
              });
            }
            return null;
          }
          throw error;
        }
        const demoUser = getDemoSession();
        if (!data.session && !demoUser) {
          persistAuthSnapshot(null);
          clearLocalSessionId();
          if (runId === refreshEpoch) {
            set({
              user: null,
              sessionReady: true,
              authLoading: false,
              authError: null,
              authVersion: bumpAuthVersion(),
            });
          }
          return null;
        }

        const user =
          (await withTimeout(
            fetchSessionUser(data.session),
            AUTH_REFRESH_TIMEOUT_MS,
            "Auth profile restore timed out",
          )) ?? demoUser;
        console.debug("[auth] refreshAuth resolved", {
          hasSession: !!data.session,
          hasUser: !!user,
        });
        if (data.session && !user && !demoUser) {
          // `fetchSessionUser` returning null is AMBIGUOUS: it can mean
          // "profile/ban lookup timed out / network blip" OR "account
          // genuinely deleted". A silent signOut() here was logging valid
          // students out on slow Supabase responses. AccountStatusGuard
          // owns the authoritative "is the account still valid" probe
          // (with retry + explicit error code checks) — leave the
          // session intact and let that path handle real deletions.
          console.warn(
            "[auth] refreshAuth: session present but profile lookup returned null — keeping session, will retry",
          );
          if (runId === refreshEpoch) {
            set({
              sessionReady: true,
              authLoading: false,
              authError: null,
            });
          }
          return null;
        }
        if (runId === refreshEpoch) {
          if (user) persistAuthSnapshot(user);
          set((state) => {
            const isIdentityChange =
              Boolean(user && state.user) &&
              (user!.id !== state.user!.id || user!.role !== state.user!.role);

            return {
              user: user ?? state.user,
              sessionReady: true,
              authLoading: false,
              authError: null,
              // A hard-refresh auth restore often goes null -> restored user while
              // dashboard queries are already active. That is not an identity
              // switch and must not invalidate/refetch the just-loaded dashboard.
              authVersion: isIdentityChange ? bumpAuthVersion() : state.authVersion,
            };
          });
        }
        return user;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not restore session";
        console.warn("[auth] refreshAuth failed", message);
        if (runId === refreshEpoch) {
          set((state) => ({
            user: state.user,
            sessionReady: true,
            authLoading: false,
            authError: message,
          }));
        }
        return null;
      } finally {
        if (!options?.force) inflightRefresh = null;
        if (runId === refreshEpoch) {
          set((state) => (state.authLoading ? { authLoading: false } : state));
        }
      }
    })();
    if (!options?.force) inflightRefresh = run;
    return run;
  },
  logout: async () => {
    set({ authLoading: true });
    await signOut();
    persistAuthSnapshot(null);
    clearSessionTimers();
    set({
      user: null,
      sessionReady: true,
      authLoading: false,
      authError: null,
      authVersion: bumpAuthVersion(),
      quizRuntime: { active: false, score: 0, answered: 0 },
    });
  },
  toggleTheme: () => {
    if (typeof document !== "undefined") {
      const theme: ThemeMode = document.documentElement.classList.contains("dark")
        ? "light"
        : "dark";
      applyThemeClass(theme);
      persistTheme(theme);
      if (get().theme !== theme) set({ theme });
      return;
    }
    set({ theme: get().theme === "dark" ? "light" : "dark" });
  },
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  markNotificationsRead: () => set({ notificationsUnread: 0 }),
  setQuizRuntime: (quizRuntime) => set({ quizRuntime }),
}));