// Local-first persistence for the Editor Engine.
// Keeps Phase-2 fully isolated: no backend writes, no Phase-1 table touches.
// A future migration can swap this for the editor_pages / editor_snapshots tables
// without changing the store or UI.

import type { AuditEntry, PageState, Snapshot } from "./types";

const KEY_PREFIX = "lovable.editor.v2";

const draftKey = (pageId: string) => `${KEY_PREFIX}.draft.${pageId}`;
const snapshotsKey = (pageId: string) => `${KEY_PREFIX}.snapshots.${pageId}`;
const auditKey = (pageId: string) => `${KEY_PREFIX}.audit.${pageId}`;

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / private-mode — silently ignore
  }
}

export const editorStorage = {
  loadDraft(pageId: string): PageState | null {
    return safeRead<PageState | null>(draftKey(pageId), null);
  },
  saveDraft(state: PageState) {
    safeWrite(draftKey(state.pageId), state);
  },
  loadSnapshots(pageId: string): Snapshot[] {
    return safeRead<Snapshot[]>(snapshotsKey(pageId), []);
  },
  appendSnapshot(snap: Snapshot) {
    const list = editorStorage.loadSnapshots(snap.state.pageId);
    // cap at 50 snapshots per page for safety
    const next = [snap, ...list].slice(0, 50);
    safeWrite(snapshotsKey(snap.state.pageId), next);
  },
  loadAudit(pageId: string): AuditEntry[] {
    return safeRead<AuditEntry[]>(auditKey(pageId), []);
  },
  appendAudit(pageId: string, entry: AuditEntry) {
    const list = editorStorage.loadAudit(pageId);
    const next = [entry, ...list].slice(0, 200);
    safeWrite(auditKey(pageId), next);
  },
  clear(pageId: string) {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(draftKey(pageId));
    window.localStorage.removeItem(snapshotsKey(pageId));
    window.localStorage.removeItem(auditKey(pageId));
  },
};
