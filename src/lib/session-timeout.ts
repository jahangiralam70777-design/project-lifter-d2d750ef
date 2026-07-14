// Session inactivity / auto-logout configuration shared across the app.

export const SESSION_TIMEOUTS = {
  STUDENT_MS: 60 * 60 * 1000, // 60 minutes
  ADMIN_MS: 30 * 60 * 1000, // 30 minutes
  WARNING_BEFORE_MS: 2 * 60 * 1000, // 2 minutes
  REMEMBER_ME_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
} as const;

export const SESSION_KEYS = {
  LAST_ACTIVITY: "edumaster.last_activity",
  REMEMBER_ME: "edumaster.remember_me",
} as const;

export function getRememberMe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SESSION_KEYS.REMEMBER_ME) === "1";
  } catch {
    return false;
  }
}

export function setRememberMe(remember: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (remember) window.localStorage.setItem(SESSION_KEYS.REMEMBER_ME, "1");
    else window.localStorage.removeItem(SESSION_KEYS.REMEMBER_ME);
  } catch {
    /* noop */
  }
}

export function clearSessionTimers() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_KEYS.LAST_ACTIVITY);
    window.localStorage.removeItem(SESSION_KEYS.REMEMBER_ME);
  } catch {
    /* noop */
  }
}

export function readLastActivity(): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const raw = window.localStorage.getItem(SESSION_KEYS.LAST_ACTIVITY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : Date.now();
  } catch {
    return Date.now();
  }
}

export function writeLastActivity(ts: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSION_KEYS.LAST_ACTIVITY, String(ts));
  } catch {
    /* noop */
  }
}
