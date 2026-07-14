// Phase-2 Editor Engine — Core Type Definitions
// Fully isolated from Phase-1 site_settings / homepage_sections.

export type ElementType = "text" | "button" | "image";
export type SectionType = "hero" | "content" | "feature" | "footer";

export interface EditorElement {
  id: string;
  type: ElementType;
  content: unknown;
  styles: Record<string, string | number>;
}

export interface EditorSection {
  id: string;
  type: SectionType;
  name?: string;
  elements: EditorElement[];
  visible: boolean;
}

export interface PageStateMeta {
  createdAt: number;
  updatedAt: number;
}

export interface PageState {
  pageId: string;
  versionId: string;
  sections: EditorSection[];
  meta: PageStateMeta;
}

export interface Snapshot {
  versionId: string;
  parentVersionId: string | null;
  timestamp: number;
  state: PageState;
  summary?: string;
  author?: string;
}

// Diff-based action descriptors pushed onto the undo/redo stacks.
export type EditorAction =
  | { kind: "add_section"; section: EditorSection; index: number }
  | { kind: "remove_section"; section: EditorSection; index: number }
  | { kind: "move_section"; sectionId: string; from: number; to: number }
  | { kind: "toggle_visibility"; sectionId: string; before: boolean; after: boolean }
  | {
      kind: "update_element";
      sectionId: string;
      elementId: string;
      before: EditorElement;
      after: EditorElement;
    }
  | { kind: "add_element"; sectionId: string; element: EditorElement; index: number }
  | {
      kind: "remove_element";
      sectionId: string;
      element: EditorElement;
      index: number;
    };

export interface AuditEntry {
  id: string;
  timestamp: number;
  actor: string;
  action: string;
  payload: Record<string, unknown>;
}

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

// Cross-origin / iframe bridge protocol constants.
export const EDITOR_BRIDGE_NAMESPACE = "lovable.editor.v2";

export type BridgeCommand =
  | { type: "SELECT_ELEMENT"; payload: { sectionId: string; elementId: string } }
  | {
      type: "UPDATE_TEXT";
      payload: { sectionId: string; elementId: string; text: string };
    }
  | {
      type: "UPDATE_STYLE";
      payload: {
        sectionId: string;
        elementId: string;
        styles: Record<string, string | number>;
      };
    }
  | {
      type: "UPDATE_IMAGE";
      payload: { sectionId: string; elementId: string; url: string; alt?: string };
    }
  | { type: "READY" }
  | { type: "STATE_SYNC"; payload: { state: PageState } };

export interface BridgeMessage {
  __ns: typeof EDITOR_BRIDGE_NAMESPACE;
  command: BridgeCommand;
}
