// Phase-2 Editor Engine — central client store.
// - Page draft state
// - Undo / redo stacks of structured EditorAction diffs
// - Snapshot version chain
// - Audit trail
// - Auto-save status
//
// Isolated from Phase-1. Persists locally via editorStorage.

import { create } from "zustand";
import { editorStorage } from "@/lib/editor/storage";
import { pushCapped, MAX_UNDO, MAX_REDO } from "@/lib/editor/perf/undo-cap";
import type {
  AuditEntry,
  EditorAction,
  EditorElement,
  EditorSection,
  PageState,
  SaveStatus,
  Snapshot,
} from "@/lib/editor/types";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

function defaultState(pageId: string): PageState {
  const now = Date.now();
  return {
    pageId,
    versionId: uid(),
    sections: [
      {
        id: uid(),
        type: "hero",
        name: "Hero",
        visible: true,
        elements: [
          { id: uid(), type: "text", content: "Welcome", styles: { fontSize: 48 } },
          {
            id: uid(),
            type: "text",
            content: "Edit this in Editor Mode",
            styles: { fontSize: 18 },
          },
          {
            id: uid(),
            type: "button",
            content: "Get started",
            styles: { variant: "primary" },
          },
        ],
      },
      {
        id: uid(),
        type: "content",
        name: "Content",
        visible: true,
        elements: [
          {
            id: uid(),
            type: "text",
            content: "Tell your story here.",
            styles: { fontSize: 16 },
          },
        ],
      },
      {
        id: uid(),
        type: "footer",
        name: "Footer",
        visible: true,
        elements: [{ id: uid(), type: "text", content: "© Your company", styles: {} }],
      },
    ],
    meta: { createdAt: now, updatedAt: now },
  };
}

function applyAction(state: PageState, action: EditorAction): PageState {
  const next: PageState = {
    ...state,
    sections: state.sections.map((s) => ({
      ...s,
      elements: s.elements.map((e) => ({ ...e })),
    })),
    meta: { ...state.meta, updatedAt: Date.now() },
    versionId: uid(),
  };
  switch (action.kind) {
    case "add_section":
      next.sections.splice(action.index, 0, action.section);
      break;
    case "remove_section":
      next.sections = next.sections.filter((s) => s.id !== action.section.id);
      break;
    case "move_section": {
      const idx = next.sections.findIndex((s) => s.id === action.sectionId);
      if (idx >= 0) {
        const [moved] = next.sections.splice(idx, 1);
        next.sections.splice(action.to, 0, moved);
      }
      break;
    }
    case "toggle_visibility": {
      const s = next.sections.find((x) => x.id === action.sectionId);
      if (s) s.visible = action.after;
      break;
    }
    case "update_element": {
      const s = next.sections.find((x) => x.id === action.sectionId);
      if (s) {
        const i = s.elements.findIndex((e) => e.id === action.elementId);
        if (i >= 0) s.elements[i] = action.after;
      }
      break;
    }
    case "add_element": {
      const s = next.sections.find((x) => x.id === action.sectionId);
      if (s) s.elements.splice(action.index, 0, action.element);
      break;
    }
    case "remove_element": {
      const s = next.sections.find((x) => x.id === action.sectionId);
      if (s) s.elements = s.elements.filter((e) => e.id !== action.element.id);
      break;
    }
  }
  return next;
}

function invert(action: EditorAction): EditorAction {
  switch (action.kind) {
    case "add_section":
      return { kind: "remove_section", section: action.section, index: action.index };
    case "remove_section":
      return { kind: "add_section", section: action.section, index: action.index };
    case "move_section":
      return {
        kind: "move_section",
        sectionId: action.sectionId,
        from: action.to,
        to: action.from,
      };
    case "toggle_visibility":
      return {
        kind: "toggle_visibility",
        sectionId: action.sectionId,
        before: action.after,
        after: action.before,
      };
    case "update_element":
      return {
        kind: "update_element",
        sectionId: action.sectionId,
        elementId: action.elementId,
        before: action.after,
        after: action.before,
      };
    case "add_element":
      return {
        kind: "remove_element",
        sectionId: action.sectionId,
        element: action.element,
        index: action.index,
      };
    case "remove_element":
      return {
        kind: "add_element",
        sectionId: action.sectionId,
        element: action.element,
        index: action.index,
      };
  }
}

const AUTO_SAVE_DELAY = 1500;

interface EditorEngineState {
  pageId: string;
  editorMode: boolean;
  state: PageState;
  undoStack: EditorAction[];
  redoStack: EditorAction[];
  snapshots: Snapshot[];
  audit: AuditEntry[];
  saveStatus: SaveStatus;
  selectedElementId: string | null;
  selectedSectionId: string | null;

  setEditorMode: (on: boolean) => void;
  load: (pageId: string) => void;
  dispatch: (action: EditorAction, label?: string) => void;
  undo: () => void;
  redo: () => void;
  createSnapshot: (summary?: string) => Snapshot;
  restoreSnapshot: (versionId: string) => void;
  selectElement: (sectionId: string | null, elementId: string | null) => void;
  reset: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleAutoSave(
  get: () => EditorEngineState,
  set: (p: Partial<EditorEngineState>) => void,
) {
  if (saveTimer) clearTimeout(saveTimer);
  set({ saveStatus: "dirty" });
  saveTimer = setTimeout(() => {
    set({ saveStatus: "saving" });
    try {
      editorStorage.saveDraft(get().state);
      set({ saveStatus: "saved" });
    } catch {
      set({ saveStatus: "error" });
    }
  }, AUTO_SAVE_DELAY);
}

function pushAudit(
  pageId: string,
  action: string,
  payload: Record<string, unknown>,
  current: AuditEntry[],
): AuditEntry[] {
  const entry: AuditEntry = {
    id: uid(),
    timestamp: Date.now(),
    actor: "admin",
    action,
    payload,
  };
  editorStorage.appendAudit(pageId, entry);
  return [entry, ...current].slice(0, 200);
}

export const useEditorEngine = create<EditorEngineState>((set, get) => ({
  pageId: "home",
  editorMode: false,
  state: defaultState("home"),
  undoStack: [],
  redoStack: [],
  snapshots: [],
  audit: [],
  saveStatus: "idle",
  selectedElementId: null,
  selectedSectionId: null,

  setEditorMode(on) {
    set({ editorMode: on });
    const audit = pushAudit(
      get().pageId,
      on ? "editor_mode_on" : "editor_mode_off",
      {},
      get().audit,
    );
    set({ audit });
  },

  load(pageId) {
    const draft = editorStorage.loadDraft(pageId) ?? defaultState(pageId);
    const snapshots = editorStorage.loadSnapshots(pageId);
    const audit = editorStorage.loadAudit(pageId);
    set({
      pageId,
      state: draft,
      snapshots,
      audit,
      undoStack: [],
      redoStack: [],
      saveStatus: "idle",
      selectedElementId: null,
      selectedSectionId: null,
    });
  },

  dispatch(action, label) {
    const prev = get().state;
    const next = applyAction(prev, action);
    const audit = pushAudit(get().pageId, label ?? action.kind, { kind: action.kind }, get().audit);
    set({
      state: next,
      undoStack: pushCapped(get().undoStack, action, MAX_UNDO),
      redoStack: [],
      audit,
    });
    scheduleAutoSave(get, set);
  },

  undo() {
    const stack = [...get().undoStack];
    const last = stack.pop();
    if (!last) return;
    const inverted = invert(last);
    const next = applyAction(get().state, inverted);
    set({
      state: next,
      undoStack: stack,
      redoStack: pushCapped(get().redoStack, last, MAX_REDO),
    });
    scheduleAutoSave(get, set);
  },

  redo() {
    const stack = [...get().redoStack];
    const last = stack.pop();
    if (!last) return;
    const next = applyAction(get().state, last);
    set({
      state: next,
      redoStack: stack,
      undoStack: pushCapped(get().undoStack, last, MAX_UNDO),
    });
    scheduleAutoSave(get, set);
  },

  createSnapshot(summary) {
    const cur = get().state;
    const snap: Snapshot = {
      versionId: cur.versionId,
      parentVersionId: get().snapshots[0]?.versionId ?? null,
      timestamp: Date.now(),
      state: cur,
      summary,
      author: "admin",
    };
    editorStorage.appendSnapshot(snap);
    const audit = pushAudit(
      get().pageId,
      "snapshot_created",
      { versionId: snap.versionId, summary: summary ?? null },
      get().audit,
    );
    set({ snapshots: [snap, ...get().snapshots].slice(0, 50), audit });
    return snap;
  },

  restoreSnapshot(versionId) {
    const snap = get().snapshots.find((s) => s.versionId === versionId);
    if (!snap) return;
    const restored: PageState = {
      ...snap.state,
      versionId: uid(),
      meta: { ...snap.state.meta, updatedAt: Date.now() },
    };
    const audit = pushAudit(get().pageId, "snapshot_restored", { from: versionId }, get().audit);
    set({
      state: restored,
      undoStack: [],
      redoStack: [],
      audit,
    });
    scheduleAutoSave(get, set);
  },

  selectElement(sectionId, elementId) {
    set({ selectedSectionId: sectionId, selectedElementId: elementId });
  },

  reset() {
    const fresh = defaultState(get().pageId);
    editorStorage.clear(get().pageId);
    set({
      state: fresh,
      undoStack: [],
      redoStack: [],
      snapshots: [],
      audit: [],
      saveStatus: "idle",
      selectedElementId: null,
      selectedSectionId: null,
    });
  },
}));

// Helpers exported for components.
export function makeElement(type: EditorElement["type"], content: unknown = ""): EditorElement {
  return { id: uid(), type, content, styles: {} };
}

export function makeSection(type: EditorSection["type"]): EditorSection {
  return {
    id: uid(),
    type,
    name: type.charAt(0).toUpperCase() + type.slice(1),
    visible: true,
    elements: [makeElement("text", "New section")],
  };
}
