/**
 * Shared utilities for in-progress exam protection.
 *
 *  - persistAnswers / loadAnswers: localStorage autosave keyed per attempt
 *    so a browser refresh or accidental tab close does not destroy work.
 *  - useBeforeUnloadGuard: shows the native browser "leave site?" prompt
 *    while the predicate is true (e.g. during an active timed attempt).
 *
 * P3a-Q-H4: keys are namespaced by the current Supabase user id so a
 * shared device cannot leak User A's in-progress answer sheet to User B.
 */
import { useEffect } from "react";

/**
 * Synchronously derive the current user id from the Supabase auth token
 * cached in localStorage. We can't use the async `supabase.auth.getUser()`
 * because persistAnswers/loadAnswers run inside sync render code paths.
 * Returns "anon" when there is no session — that bucket is treated as
 * untrusted and never touched by a signed-in user.
 */
function currentUserKey(): string {
  if (typeof window === "undefined") return "anon";
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("sb-") || !k.endsWith("-auth-token")) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        user?: { id?: string };
        currentSession?: { user?: { id?: string } };
      };
      const uid = parsed?.user?.id ?? parsed?.currentSession?.user?.id;
      if (uid) return String(uid);
    }
  } catch {
    /* private mode / parse error — fall through */
  }
  return "anon";
}

const KEY = (id: string) => `exam-draft:${currentUserKey()}:${id}`;

export type ExamDraft = {
  answers: Record<string, string>;
  bookmarks: number[];
  current?: number;
  savedAt: number;
};

export function persistAnswers(attemptKey: string, draft: ExamDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(attemptKey), JSON.stringify(draft));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function loadAnswers(attemptKey: string): ExamDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(attemptKey));
    if (!raw) return null;
    return JSON.parse(raw) as ExamDraft;
  } catch {
    return null;
  }
}

export function clearAnswers(attemptKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(attemptKey));
  } catch {
    /* noop */
  }
}

/**
 * Show the native browser "Leave site?" prompt while `active` is true.
 * Use during in-progress exams to protect against accidental refresh /
 * close / back-navigation outside the SPA router.
 */
export function useBeforeUnloadGuard(active: boolean) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required for the prompt to show in Chromium browsers.
      e.returnValue = "";
      return "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);
}
