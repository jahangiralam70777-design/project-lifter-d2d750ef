// Phase-3 — Remote/hybrid storage adapter.
// Wraps the Phase-2 local storage adapter so the editor remains functional offline.
// Reads prefer remote; writes go local-first (instant) then push to remote.
// Falls back transparently to local-only if remote calls fail.

import { editorStorage } from "@/lib/editor/storage";
import {
  fetchDraft,
  saveDraft,
  listSnapshots,
  createSnapshot as createSnapshotFn,
  listAudit,
} from "@/lib/editor/editor.functions";
import type { AuditEntry, PageState, Snapshot } from "@/lib/editor/types";

export type SyncMode = "remote" | "local";

export interface RemoteSaveResult {
  status: "saved" | "conflict" | "offline";
  serverVersion?: string | null;
}

let activeMode: SyncMode = "remote";

function downgrade(reason: unknown) {
  if (activeMode === "remote") {
    activeMode = "local";

    console.warn("[editor] remote sync unavailable, using local-only mode:", reason);
  }
}

export const editorRemote = {
  mode: () => activeMode,

  async loadDraft(pageId: string): Promise<PageState | null> {
    try {
      const row = await fetchDraft({ data: { pageId } });
      if (row?.draft_state) {
        editorStorage.saveDraft(row.draft_state as unknown as PageState);
        return row.draft_state as unknown as PageState;
      }
    } catch (e) {
      downgrade(e);
    }
    return editorStorage.loadDraft(pageId);
  },

  async saveDraft(state: PageState, expectedVersion: string | null): Promise<RemoteSaveResult> {
    // Always cache locally first — instant, survives reloads & offline.
    editorStorage.saveDraft(state);
    if (activeMode === "local") return { status: "offline" };
    try {
      const r = await saveDraft({ data: { pageId: state.pageId, expectedVersion, state } });
      if (r.conflict) return { status: "conflict", serverVersion: r.serverVersion };
      return { status: "saved", serverVersion: r.serverVersion };
    } catch (e) {
      downgrade(e);
      return { status: "offline" };
    }
  },

  async loadSnapshots(pageId: string): Promise<Snapshot[]> {
    try {
      const rows = (await listSnapshots({ data: { pageId } })) as any[];
      return rows.map((r) => ({
        versionId: r.version_id,
        parentVersionId: r.parent_version_id,
        timestamp: new Date(r.created_at).getTime(),
        state: r.snapshot as PageState,
        summary: r.summary ?? undefined,
        author: r.author_id ?? undefined,
      }));
    } catch (e) {
      downgrade(e);
      return editorStorage.loadSnapshots(pageId);
    }
  },

  async createSnapshot(
    state: PageState,
    summary?: string,
    parentVersionId?: string | null,
  ): Promise<void> {
    const local: Snapshot = {
      versionId: state.versionId,
      parentVersionId: parentVersionId ?? null,
      timestamp: Date.now(),
      state,
      summary,
      author: "admin",
    };
    editorStorage.appendSnapshot(local);
    if (activeMode === "local") return;
    try {
      await createSnapshotFn({
        data: { pageId: state.pageId, state, summary, parentVersionId: parentVersionId ?? null },
      });
    } catch (e) {
      downgrade(e);
    }
  },

  async loadAudit(pageId: string): Promise<AuditEntry[]> {
    try {
      const rows = (await listAudit({ data: { pageId } })) as any[];
      return rows.map((r) => ({
        id: r.id,
        timestamp: new Date(r.created_at).getTime(),
        actor: r.author_id ?? "admin",
        action: r.action_type,
        payload: r.payload ?? {},
      }));
    } catch (e) {
      downgrade(e);
      return editorStorage.loadAudit(pageId);
    }
  },

  appendAuditLocal(pageId: string, entry: AuditEntry) {
    editorStorage.appendAudit(pageId, entry);
  },
};
