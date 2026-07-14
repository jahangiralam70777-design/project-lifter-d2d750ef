// Local-only user preferences: accent color, font size, notification toggles.
// Persisted to localStorage; accent/font are applied to <html> as CSS vars.

import { useEffect, useSyncExternalStore } from "react";

const KEY = "edumaster.prefs.v1";

export type NotifPrefs = {
  email: boolean;
  push: boolean;
  mock: boolean;
  quiz: boolean;
  class: boolean;
};

export type Prefs = {
  accent: string; // hex
  fontSize: number; // 12-22
  notif: NotifPrefs;
  twoFA: boolean;
  subjects: string[];
};

export const DEFAULT_PREFS: Prefs = {
  accent: "#a855f7",
  fontSize: 16,
  notif: { email: true, push: true, mock: true, quiz: false, class: true },
  twoFA: false,
  subjects: [],
};

function read(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

const listeners = new Set<() => void>();
let cache: Prefs | null = null;

function getSnapshot(): Prefs {
  if (!cache) cache = read();
  return cache;
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function applyPrefsToDom(p: Prefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--user-accent", p.accent);
  root.style.fontSize = `${p.fontSize}px`;
}

export function setPrefs(patch: Partial<Prefs>) {
  const next = { ...getSnapshot(), ...patch };
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  applyPrefsToDom(next);
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_PREFS);
  useEffect(() => {
    applyPrefsToDom(prefs);
  }, [prefs]);
  return prefs;
}
