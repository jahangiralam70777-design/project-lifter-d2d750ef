// Structural diff for PageState snapshots.
// Pure functions — no React, no DOM, easy to unit-test later.

import type { EditorElement, EditorSection, PageState } from "./types";

export interface SectionDiff {
  added: EditorSection[];
  removed: EditorSection[];
  modified: Array<{
    sectionId: string;
    before: EditorSection;
    after: EditorSection;
    elementDiff: ElementDiff;
    visibilityChanged: boolean;
    reordered: boolean;
  }>;
}

export interface ElementDiff {
  added: EditorElement[];
  removed: EditorElement[];
  modified: Array<{ elementId: string; before: EditorElement; after: EditorElement }>;
}

export interface PageDiff {
  pageId: string;
  fromVersion: string;
  toVersion: string;
  sectionDiff: SectionDiff;
  totalChanges: number;
}

function diffElements(before: EditorElement[], after: EditorElement[]): ElementDiff {
  const beforeMap = new Map(before.map((e) => [e.id, e]));
  const afterMap = new Map(after.map((e) => [e.id, e]));

  const added: EditorElement[] = [];
  const removed: EditorElement[] = [];
  const modified: ElementDiff["modified"] = [];

  for (const [id, el] of afterMap) {
    const prev = beforeMap.get(id);
    if (!prev) added.push(el);
    else if (JSON.stringify(prev) !== JSON.stringify(el)) {
      modified.push({ elementId: id, before: prev, after: el });
    }
  }
  for (const [id, el] of beforeMap) {
    if (!afterMap.has(id)) removed.push(el);
  }
  return { added, removed, modified };
}

export function diffPageState(before: PageState, after: PageState): PageDiff {
  const beforeMap = new Map(before.sections.map((s, i) => [s.id, { s, i }]));
  const afterMap = new Map(after.sections.map((s, i) => [s.id, { s, i }]));

  const added: EditorSection[] = [];
  const removed: EditorSection[] = [];
  const modified: SectionDiff["modified"] = [];

  for (const [id, { s, i }] of afterMap) {
    const prev = beforeMap.get(id);
    if (!prev) {
      added.push(s);
      continue;
    }
    const elementDiff = diffElements(prev.s.elements, s.elements);
    const visibilityChanged = prev.s.visible !== s.visible;
    const reordered = prev.i !== i;
    if (
      elementDiff.added.length ||
      elementDiff.removed.length ||
      elementDiff.modified.length ||
      visibilityChanged ||
      reordered
    ) {
      modified.push({
        sectionId: id,
        before: prev.s,
        after: s,
        elementDiff,
        visibilityChanged,
        reordered,
      });
    }
  }
  for (const [id, { s }] of beforeMap) {
    if (!afterMap.has(id)) removed.push(s);
  }

  const totalChanges =
    added.length +
    removed.length +
    modified.reduce(
      (n, m) =>
        n +
        m.elementDiff.added.length +
        m.elementDiff.removed.length +
        m.elementDiff.modified.length +
        (m.visibilityChanged ? 1 : 0) +
        (m.reordered ? 1 : 0),
      0,
    );

  return {
    pageId: after.pageId,
    fromVersion: before.versionId,
    toVersion: after.versionId,
    sectionDiff: { added, removed, modified },
    totalChanges,
  };
}
