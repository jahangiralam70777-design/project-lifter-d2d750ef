// Client-side flow state for the Student Exam Batch enrollment journey.
//
// UI-only session cache. Remembers which session the student is currently
// operating on (Home → Subjects → Verification → Pending) and which subject
// IDs they picked so navigating between steps doesn't lose selection.
//
// Approval / submission status is NEVER stored here — the backend is the
// single source of truth. UI reads it via `getMyExamBatchEnrollment` /
// `getExamBatchAccess`.

import { useSyncExternalStore } from "react";

const KEY = "examBatch.flow.v2";

export type ExamBatchFlow = {
  sessionId: string | null;
  subjectIds: string[];
};

const EMPTY: ExamBatchFlow = {
  sessionId: null,
  subjectIds: [],
};

let cachedFlow: ExamBatchFlow = EMPTY;
let cachedRaw: string | null = null;

function readFlow(): ExamBatchFlow {
  if (typeof window === "undefined") return EMPTY;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return cachedFlow;
  }
  // Return the SAME object identity across renders when the underlying
  // storage hasn't changed. `useSyncExternalStore` compares snapshots by
  // reference — returning a fresh `{ ...EMPTY, ...parsed }` on every call
  // triggers an infinite re-render loop and every Exam Batch page hangs
  // on the pending spinner.
  if (raw === cachedRaw) return cachedFlow;
  cachedRaw = raw;
  if (!raw) {
    cachedFlow = EMPTY;
    return cachedFlow;
  }
  try {
    cachedFlow = { ...EMPTY, ...(JSON.parse(raw) as Partial<ExamBatchFlow>) };
  } catch {
    cachedFlow = EMPTY;
  }
  return cachedFlow;
}


const listeners = new Set<() => void>();

function writeFlow(next: ExamBatchFlow) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(next);
  window.localStorage.setItem(KEY, raw);
  cachedRaw = raw;
  cachedFlow = next;
  listeners.forEach((l) => l());
}


function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key === KEY) l();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(l);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function useExamBatchFlow() {
  const state = useSyncExternalStore(subscribe, readFlow, () => EMPTY);
  return {
    state,
    setSession(sessionId: string) {
      const prev = readFlow();
      // Switching sessions clears the previous subject selection so we never
      // send subject IDs that belong to a different session's level.
      if (prev.sessionId === sessionId) {
        writeFlow({ ...prev, sessionId });
      } else {
        writeFlow({ sessionId, subjectIds: [] });
      }
    },
    setSubjects(subjectIds: string[]) {
      writeFlow({ ...readFlow(), subjectIds });
    },
    clearSelection() {
      writeFlow({ ...readFlow(), subjectIds: [] });
    },
    reset() {
      writeFlow(EMPTY);
    },
  };
}
