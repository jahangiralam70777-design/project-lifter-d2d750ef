// Phase-3 — Conflict resolution helpers.
// A version conflict means the server's editor_pages.version_id no longer
// matches what we expected. We offer three resolution strategies:
//   - overwrite: force-write the local state (becomes the new server version)
//   - merge:     keep server sections + append any local-only sections (by id)
//   - discard:   drop local edits and adopt the server state

import type { PageState, EditorSection } from "@/lib/editor/types";

export type ConflictResolution = "overwrite" | "merge" | "discard";

export interface ConflictInfo {
  localVersion: string;
  serverVersion: string;
  serverState: PageState | null;
}

export function mergeStates(local: PageState, server: PageState): PageState {
  const serverIds = new Set(server.sections.map((s) => s.id));
  const localOnly: EditorSection[] = local.sections.filter((s) => !serverIds.has(s.id));
  return {
    ...server,
    sections: [...server.sections, ...localOnly],
    meta: { ...server.meta, updatedAt: Date.now() },
  };
}

export function resolveConflict(
  resolution: ConflictResolution,
  local: PageState,
  server: PageState | null,
): PageState {
  if (resolution === "overwrite" || !server) return local;
  if (resolution === "discard") return server;
  return mergeStates(local, server);
}
