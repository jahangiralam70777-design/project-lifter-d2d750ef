// Phase-3 — Sync hook bridging the Phase-2 editor store with the remote backend.
// Loads draft + history from DB, mirrors local saves to the server (debounced
// by the store itself), and subscribes to realtime updates from other admins.
//
// Designed to be opt-in: call useEditorSync(pageId) from any editor surface.
// Phase-2 store is unchanged; this hook reads/writes its public API only.

import { useEffect, useRef, useState } from "react";
import { useEditorEngine } from "@/stores/editor-engine";
import { editorRemote } from "@/lib/editor/remote-storage";
import { subscribeEditorPage } from "@/lib/editor/realtime";
import { publishPage } from "@/lib/editor/editor.functions";
import {
  resolveConflict,
  type ConflictInfo,
  type ConflictResolution,
} from "@/lib/editor/conflicts";
import type { PageState } from "@/lib/editor/types";

export type SyncStatus = "idle" | "loading" | "synced" | "offline" | "conflict";

export interface EditorSyncApi {
  status: SyncStatus;
  conflict: ConflictInfo | null;
  publishStatus: "idle" | "publishing" | "published" | "error" | "conflict";
  remoteSnapshotCount: number;
  syncNow: () => Promise<void>;
  publish: (summary?: string) => Promise<void>;
  resolveConflictWith: (resolution: ConflictResolution) => Promise<void>;
}

export function useEditorSync(pageId: string): EditorSyncApi {
  const engine = useEditorEngine();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  const [publishStatus, setPublishStatus] = useState<EditorSyncApi["publishStatus"]>("idle");
  const [remoteSnapshotCount, setRemoteSnapshotCount] = useState(0);
  const lastSavedVersion = useRef<string | null>(null);

  // 1. Initial load + load history
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const remoteDraft = await editorRemote.loadDraft(pageId);
      if (cancelled) return;
      if (remoteDraft) engine.load(pageId);
      else engine.load(pageId);
      const snaps = await editorRemote.loadSnapshots(pageId);
      if (cancelled) return;
      setRemoteSnapshotCount(snaps.length);
      setStatus(editorRemote.mode() === "remote" ? "synced" : "offline");
      lastSavedVersion.current = remoteDraft?.versionId ?? null;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId]);

  // 2. Mirror local state changes to the server (state.versionId changes per edit).
  useEffect(() => {
    if (status === "loading") return;
    const current = engine.state;
    if (current.pageId !== pageId) return;
    if (current.versionId === lastSavedVersion.current) return;

    const handle = setTimeout(async () => {
      const res = await editorRemote.saveDraft(current, lastSavedVersion.current);
      if (res.status === "saved") {
        lastSavedVersion.current = res.serverVersion ?? current.versionId;
        setStatus("synced");
      } else if (res.status === "conflict") {
        setConflict({
          localVersion: current.versionId,
          serverVersion: res.serverVersion ?? "",
          serverState: null,
        });
        setStatus("conflict");
        // Hydrate server state for merge previews.
        const r = await editorRemote.loadDraft(pageId);
        if (r) {
          setConflict((c) => (c ? { ...c, serverState: r } : c));
        }
      } else {
        setStatus("offline");
      }
    }, 600);

    return () => clearTimeout(handle);
  }, [engine.state, pageId, status]);

  // 3. Realtime — react to other admins.
  useEffect(() => {
    if (status === "loading") return;
    const unsub = subscribeEditorPage(pageId, {
      onDraftChange: (row) => {
        if (row.version_id === lastSavedVersion.current) return;
        if (engine.state.versionId !== row.version_id) {
          setConflict({
            localVersion: engine.state.versionId,
            serverVersion: row.version_id,
            serverState: null,
          });
          setStatus("conflict");
        }
      },
      onSnapshotInsert: () => {
        setRemoteSnapshotCount((c) => c + 1);
      },
      onPublished: () => {
        setPublishStatus("published");
      },
    });
    return unsub;
  }, [pageId, status, engine.state.versionId]);

  async function syncNow() {
    const r = await editorRemote.saveDraft(engine.state, lastSavedVersion.current);
    if (r.status === "saved") {
      lastSavedVersion.current = r.serverVersion ?? engine.state.versionId;
      setStatus("synced");
    }
  }

  async function publish(summary?: string) {
    setPublishStatus("publishing");
    try {
      const r = await publishPage({
        data: { pageId, expectedVersion: lastSavedVersion.current, state: engine.state, summary },
      });
      if (r.conflict) {
        setPublishStatus("conflict");
        setStatus("conflict");
      } else {
        setPublishStatus("published");
      }
    } catch {
      setPublishStatus("error");
    }
  }

  async function resolveConflictWith(resolution: ConflictResolution) {
    if (!conflict) return;
    const server: PageState | null = conflict.serverState;
    const merged = resolveConflict(resolution, engine.state, server);
    // Reset version chain to merged result and force-overwrite.
    lastSavedVersion.current = null;
    const r = await editorRemote.saveDraft(merged, null);
    if (r.status === "saved") {
      lastSavedVersion.current = r.serverVersion ?? merged.versionId;
      setConflict(null);
      setStatus("synced");
      engine.restoreSnapshot?.(merged.versionId);
    }
  }

  return {
    status,
    conflict,
    publishStatus,
    remoteSnapshotCount,
    syncNow,
    publish,
    resolveConflictWith,
  };
}
