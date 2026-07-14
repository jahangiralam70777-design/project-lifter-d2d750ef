import { create } from "zustand";

export type ActionStatus = "pending" | "success" | "error";

export interface ActionLogEntry {
  id: string;
  ts: number;
  fn: string;
  file?: string;
  payload?: unknown;
  status: ActionStatus;
  ms?: number;
  result?: unknown;
  error?: string;
}

interface ActionLogState {
  entries: ActionLogEntry[];
  inspectorOpen: boolean;
  inspectorMode: boolean;
  record: (entry: Omit<ActionLogEntry, "id" | "ts" | "status"> & { status?: ActionStatus }) => string;
  update: (id: string, patch: Partial<ActionLogEntry>) => void;
  clear: () => void;
  toggleOpen: () => void;
  toggleMode: () => void;
}

const MAX = 50;

export const useActionLog = create<ActionLogState>((set) => ({
  entries: [],
  inspectorOpen: false,
  inspectorMode: false,
  record: (entry) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({
      entries: [
        { id, ts: Date.now(), status: entry.status ?? "pending", ...entry },
        ...s.entries,
      ].slice(0, MAX),
    }));
    return id;
  },
  update: (id, patch) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    })),
  clear: () => set({ entries: [] }),
  toggleOpen: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  toggleMode: () => set((s) => ({ inspectorMode: !s.inspectorMode })),
}));

// Helper used by the global mutation observer & TraceButton to record an
// action. Returns { done, fail } so callers can finalize the entry.
export function startAction(input: { fn: string; file?: string; payload?: unknown }) {
  const id = useActionLog.getState().record({ ...input, status: "pending" });
  const start = performance.now();
  return {
    id,
    done: (result?: unknown) =>
      useActionLog.getState().update(id, {
        status: "success",
        ms: Math.round(performance.now() - start),
        result,
      }),
    fail: (error: unknown) =>
      useActionLog.getState().update(id, {
        status: "error",
        ms: Math.round(performance.now() - start),
        error: error instanceof Error ? error.message : String(error),
      }),
  };
}
