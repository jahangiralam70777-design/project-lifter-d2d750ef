import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  GitBranch,
  History,
  ListTree,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  Redo2,
  Scale,
  Rocket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEditorEngine, makeElement, makeSection } from "@/stores/editor-engine";
import type { EditorElement, EditorSection, SaveStatus } from "@/lib/editor/types";
import { diffPageState } from "@/lib/editor/diff";
import { EditorErrorBoundary } from "@/lib/editor/safety/EditorErrorBoundary";
import { ConflictBanner } from "@/lib/editor/safety/ConflictBanner";
import { evaluatePublishGuard } from "@/lib/editor/safety/publish-guard";
import { useEditorSync, type EditorSyncApi, type SyncStatus } from "@/lib/editor/use-editor-sync";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-imperative";

const STATUS_LABEL: Record<SaveStatus, { label: string; tone: string }> = {
  idle: { label: "Idle", tone: "bg-muted text-muted-foreground" },
  dirty: { label: "Unsaved changes", tone: "bg-amber-500/15 text-amber-600" },
  saving: { label: "Saving…", tone: "bg-blue-500/15 text-blue-600" },
  saved: { label: "Saved", tone: "bg-emerald-500/15 text-emerald-600" },
  error: { label: "Error", tone: "bg-destructive/15 text-destructive" },
};

const SYNC_LABEL: Record<SyncStatus, { label: string; tone: string }> = {
  idle: { label: "Local only", tone: "bg-muted text-muted-foreground" },
  loading: { label: "Connecting…", tone: "bg-blue-500/15 text-blue-600" },
  synced: { label: "Synced", tone: "bg-emerald-500/15 text-emerald-600" },
  offline: { label: "Offline", tone: "bg-amber-500/15 text-amber-600" },
  conflict: { label: "Conflict", tone: "bg-destructive/15 text-destructive" },
};

// Phase-3 sync is opt-in: this child mounts only while Editor Mode is on,
// so the editor stays local-first by default and starts pushing to the
// backend (remote-storage + realtime + conflict detection) only after the
// admin explicitly turns Editor Mode on.
function SyncActivator({ pageId, onApi }: { pageId: string; onApi: (api: EditorSyncApi) => void }) {
  const api = useEditorSync(pageId);
  useEffect(() => {
    onApi(api);
  }, [api, onApi]);
  return null;
}

export function SiteEditorV2Flow() {
  const {
    editorMode,
    setEditorMode,
    state,
    undoStack,
    redoStack,
    snapshots,
    audit,
    saveStatus,
    selectedSectionId,
    selectedElementId,
    load,
    dispatch,
    undo,
    redo,
    createSnapshot,
    restoreSnapshot,
    selectElement,
    reset,
  } = useEditorEngine();

  const [snapshotSummary, setSnapshotSummary] = useState("");
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [syncApi, setSyncApi] = useState<EditorSyncApi | null>(null);
  const [conflictDismissed, setConflictDismissed] = useState(false);

  // Reset sync handle when Editor Mode is turned off — local-first default.
  useEffect(() => {
    if (!editorMode) {
      setSyncApi(null);
      setConflictDismissed(false);
    }
  }, [editorMode]);

  useEffect(() => {
    load("home");
  }, [load]);

  // Keyboard shortcuts: ⌘/Ctrl+Z, ⌘/Ctrl+Shift+Z
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!editorMode) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editorMode, undo, redo]);

  const selectedSection = useMemo(
    () => state.sections.find((s) => s.id === selectedSectionId) ?? null,
    [state.sections, selectedSectionId],
  );
  const selectedElement = useMemo(
    () => selectedSection?.elements.find((e) => e.id === selectedElementId) ?? null,
    [selectedSection, selectedElementId],
  );

  const status = STATUS_LABEL[saveStatus];
  const syncStatus: SyncStatus = syncApi?.status ?? "idle";
  const syncBadge = SYNC_LABEL[syncStatus];
  const showConflictBanner = !!syncApi?.conflict && !conflictDismissed && editorMode;

  async function handlePublish() {
    if (!syncApi) {
      toast.error("Turn on Editor Mode to enable publishing.");
      return;
    }
    const guard = evaluatePublishGuard({
      localVersionId: state.versionId,
      localUpdatedAt: state.meta.updatedAt,
      remoteVersionId: syncApi.conflict?.serverVersion ?? null,
      remoteUpdatedAt: null,
      remotePublishedVersionId: null,
      sectionCount: state.sections.length,
    });
    if (guard.severity === "block") {
      toast.error(`Publish blocked: ${guard.reasons.join(" ")}`);
      return;
    }
    if (guard.requiresConfirmation) {
      const ok = await confirmDialog({
        title: "Publish with warnings?",
        description: `${guard.reasons.join("\n")}`,
        confirmLabel: "Publish anyway",
        variant: "destructive",
      });
      if (!ok) return;
    }
    await syncApi.publish(snapshotSummary || undefined);
    if (syncApi.publishStatus === "conflict") {
      toast.error("Version conflict — reload and retry.");
    } else {
      toast.success("Published to live site.");
      setSnapshotSummary("");
    }
  }

  return (
    <EditorErrorBoundary area="SiteEditorV2">
      <div className="min-h-dvh bg-background text-foreground">
        {editorMode && <SyncActivator pageId="home" onApi={setSyncApi} />}
        {/* Top toolbar */}
        <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/site">
                <ArrowLeft className="h-4 w-4" />
                Back to Site Management
              </Link>
            </Button>
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Advanced Editor · Phase 2</span>
              <Badge variant="secondary" className="ml-1">
                Isolated
              </Badge>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch id="editor-mode" checked={editorMode} onCheckedChange={setEditorMode} />
                <Label htmlFor="editor-mode" className="text-sm">
                  Editor Mode
                </Label>
              </div>

              <Separator orientation="vertical" className="h-6" />

              <Button
                variant="ghost"
                size="icon"
                onClick={undo}
                disabled={!editorMode || undoStack.length === 0}
                title="Undo (⌘Z)"
                aria-label="Undo"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={redo}
                disabled={!editorMode || redoStack.length === 0}
                title="Redo (⌘⇧Z)"
                aria-label="Redo"
              >
                <Redo2 className="h-4 w-4" />
              </Button>

              <span className={`rounded-full px-3 py-1 text-xs font-medium ${status.tone}`}>
                {status.label}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${syncBadge.tone}`}
                title="Backend sync status (active only in Editor Mode)"
              >
                {syncBadge.label}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  createSnapshot(snapshotSummary || undefined);
                  setSnapshotSummary("");
                }}
                disabled={!editorMode}
              >
                <Save className="h-4 w-4" />
                Snapshot
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handlePublish}
                disabled={!editorMode || !syncApi || syncApi.publishStatus === "publishing"}
                title="Publish current draft to live site"
              >
                <Rocket className="h-4 w-4" />
                {syncApi?.publishStatus === "publishing" ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </div>
          {showConflictBanner && syncApi ? (
            <div className="px-4 pb-3">
              <ConflictBanner
                visible
                onReload={() => syncApi.syncNow()}
                onDismiss={() => setConflictDismissed(true)}
                onMerge={() => syncApi.resolveConflictWith("merge")}
              />
            </div>
          ) : null}
        </header>

        <div className="grid gap-0 lg:grid-cols-[280px_1fr_320px]">
          {/* Left: structure tree */}
          <aside className="border-r bg-card/40 p-3">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ListTree className="h-4 w-4" />
                Structure
              </div>
              <div className="flex items-center gap-1">
                <Select
                  onValueChange={(t) => {
                    dispatch(
                      {
                        kind: "add_section",
                        section: makeSection(t as EditorSection["type"]),
                        index: state.sections.length,
                      },
                      "add_section",
                    );
                  }}
                  disabled={!editorMode}
                >
                  <SelectTrigger className="h-8 w-[110px]">
                    <SelectValue placeholder={<Plus className="h-4 w-4" />} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hero">+ Hero</SelectItem>
                    <SelectItem value="content">+ Content</SelectItem>
                    <SelectItem value="feature">+ Feature</SelectItem>
                    <SelectItem value="footer">+ Footer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ScrollArea className="h-[calc(100vh-180px)] pr-2">
              <div className="space-y-2">
                {state.sections.map((section, sIndex) => (
                  <Card
                    key={section.id}
                    className={`p-2 ${
                      selectedSectionId === section.id ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        className="flex flex-1 items-center gap-2 text-left text-sm font-medium"
                        onClick={() => selectElement(section.id, null)}
                      >
                        <Badge variant="outline" className="capitalize">
                          {section.type}
                        </Badge>
                        <span className="truncate">{section.name ?? section.type}</span>
                      </button>

                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={!editorMode || sIndex === 0}
                          onClick={() =>
                            dispatch(
                              {
                                kind: "move_section",
                                sectionId: section.id,
                                from: sIndex,
                                to: sIndex - 1,
                              },
                              "move_section",
                            )
                          }
                          title="Move up"
                          aria-label="Move section up"
                        >
                          <ChevronLeft className="h-3.5 w-3.5 -rotate-90" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={!editorMode || sIndex === state.sections.length - 1}
                          onClick={() =>
                            dispatch(
                              {
                                kind: "move_section",
                                sectionId: section.id,
                                from: sIndex,
                                to: sIndex + 1,
                              },
                              "move_section",
                            )
                          }
                          title="Move down"
                          aria-label="Move section down"
                        >
                          <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={!editorMode}
                          onClick={() =>
                            dispatch(
                              {
                                kind: "toggle_visibility",
                                sectionId: section.id,
                                before: section.visible,
                                after: !section.visible,
                              },
                              "toggle_visibility",
                            )
                          }
                          title="Toggle visibility"
                          aria-label={section.visible ? "Hide section" : "Show section"}
                          aria-pressed={!section.visible}
                        >
                          {section.visible ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          disabled={!editorMode}
                          aria-label="Remove section"
                          onClick={() =>
                            dispatch(
                              {
                                kind: "remove_section",
                                section,
                                index: sIndex,
                              },
                              "remove_section",
                            )
                          }
                          title="Delete section"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-2 ml-1 space-y-1">
                      {section.elements.map((el) => (
                        <button
                          key={el.id}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs hover:bg-muted ${
                            selectedElementId === el.id ? "bg-primary/10 text-primary" : ""
                          }`}
                          onClick={() => selectElement(section.id, el.id)}
                        >
                          <Badge variant="outline" className="capitalize">
                            {el.type}
                          </Badge>
                          <span className="truncate text-muted-foreground">
                            {String((el.content as string) ?? "").slice(0, 28) || "—"}
                          </span>
                        </button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-full justify-start text-xs"
                        disabled={!editorMode}
                        onClick={() =>
                          dispatch(
                            {
                              kind: "add_element",
                              sectionId: section.id,
                              element: makeElement("text", "New text"),
                              index: section.elements.length,
                            },
                            "add_element",
                          )
                        }
                      >
                        <Plus className="h-3 w-3" /> Add element
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </aside>

          {/* Center: preview canvas */}
          <section aria-label="Preview canvas" className="bg-muted/20 p-4">
            <PreviewCanvas
              sections={state.sections}
              editorMode={editorMode}
              selectedElementId={selectedElementId}
              onSelect={(s, e) => selectElement(s, e)}
            />
          </section>

          {/* Right: inspector & tabs */}
          <aside className="border-l bg-card/40">
            <Tabs defaultValue="inspector" className="flex h-full flex-col">
              <TabsList className="m-3 grid w-auto grid-cols-4">
                <TabsTrigger value="inspector">Inspect</TabsTrigger>
                <TabsTrigger value="history">
                  <History className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="diff">
                  <Scale className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="audit">
                  <GitBranch className="h-3.5 w-3.5" />
                </TabsTrigger>
              </TabsList>

              <TabsContent value="inspector" className="flex-1 px-3 pb-3">
                <ScrollArea className="h-[calc(100vh-200px)] pr-2">
                  {!editorMode && (
                    <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                      Turn on <strong>Editor Mode</strong> to edit content. The live site is never
                      touched until you publish.
                    </p>
                  )}
                  {editorMode && !selectedElement && (
                    <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                      Select an element in the structure tree or the preview to edit its content and
                      styles.
                    </p>
                  )}
                  {editorMode && selectedSection && selectedElement && (
                    <ElementInspector
                      section={selectedSection}
                      element={selectedElement}
                      onChange={(after) =>
                        dispatch(
                          {
                            kind: "update_element",
                            sectionId: selectedSection.id,
                            elementId: selectedElement.id,
                            before: selectedElement,
                            after,
                          },
                          "update_element",
                        )
                      }
                    />
                  )}

                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <Label className="text-xs">Snapshot summary (optional)</Label>
                    <Textarea
                      value={snapshotSummary}
                      onChange={(e) => setSnapshotSummary(e.target.value)}
                      placeholder="e.g. Updated hero headline"
                      disabled={!editorMode}
                      rows={2}
                    />
                  </div>
                  <Button variant="outline" size="sm" className="mt-3 w-full" onClick={reset}>
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset draft (this page)
                  </Button>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="history" className="flex-1 px-3 pb-3">
                <ScrollArea className="h-[calc(100vh-200px)] pr-2">
                  <p className="mb-2 text-xs text-muted-foreground">
                    {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"} · most recent
                    first
                  </p>
                  <div className="space-y-2">
                    <AnimatePresence initial={false}>
                      {snapshots.map((snap) => (
                        <motion.div
                          key={snap.versionId}
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                        >
                          <Card className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">
                                  {snap.summary || "Snapshot"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(snap.timestamp).toLocaleString()}
                                </p>
                                <code className="text-[10px] text-muted-foreground">
                                  {snap.versionId.slice(0, 8)}
                                </code>
                              </div>
                              <div className="flex flex-col gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => restoreSnapshot(snap.versionId)}
                                  disabled={!editorMode}
                                >
                                  <RotateCw className="h-3 w-3" />
                                  Restore
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCompareA(snap.versionId)}
                                >
                                  Compare A
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setCompareB(snap.versionId)}
                                >
                                  Compare B
                                </Button>
                              </div>
                            </div>
                          </Card>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {snapshots.length === 0 && (
                      <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
                        No snapshots yet. Make a change in editor mode and click Snapshot.
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="diff" className="flex-1 px-3 pb-3">
                <DiffPanel
                  aId={compareA}
                  bId={compareB}
                  onClear={() => {
                    setCompareA(null);
                    setCompareB(null);
                  }}
                />
              </TabsContent>

              <TabsContent value="audit" className="flex-1 px-3 pb-3">
                <ScrollArea className="h-[calc(100vh-200px)] pr-2">
                  <p className="mb-2 text-xs text-muted-foreground">
                    {audit.length} event{audit.length === 1 ? "" : "s"}
                  </p>
                  <div className="space-y-1">
                    {audit.map((entry) => (
                      <div key={entry.id} className="rounded-md border bg-card/60 p-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{entry.action}</span>
                          <span className="text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </div>
    </EditorErrorBoundary>
  );
}

function ElementInspector({
  element,
  onChange,
}: {
  section: EditorSection;
  element: EditorElement;
  onChange: (next: EditorElement) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Type</Label>
        <p className="text-sm font-medium capitalize">{element.type}</p>
      </div>

      {element.type === "text" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Text content</Label>
          <Textarea
            value={String(element.content ?? "")}
            onChange={(e) => onChange({ ...element, content: e.target.value })}
            rows={3}
          />
        </div>
      )}
      {element.type === "button" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={String(element.content ?? "")}
            onChange={(e) => onChange({ ...element, content: e.target.value })}
          />
        </div>
      )}
      {element.type === "image" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Image URL</Label>
          <Input
            value={String(element.content ?? "")}
            onChange={(e) => onChange({ ...element, content: e.target.value })}
            placeholder="https://…"
          />
        </div>
      )}

      <Separator />
      <div className="space-y-1.5">
        <Label className="text-xs">Styles (JSON)</Label>
        <Textarea
          value={JSON.stringify(element.styles, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value || "{}");
              onChange({ ...element, styles: parsed });
            } catch {
              /* ignore invalid until valid */
            }
          }}
          rows={5}
          className="font-mono text-xs"
        />
      </div>
    </div>
  );
}

function PreviewCanvas({
  sections,
  editorMode,
  selectedElementId,
  onSelect,
}: {
  sections: EditorSection[];
  editorMode: boolean;
  selectedElementId: string | null;
  onSelect: (sectionId: string, elementId: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Phase-2 preview canvas. The iframe bridge protocol is defined in
  // src/lib/editor/bridge.ts and can be wired to a real preview iframe later;
  // for now we render directly so this page never touches the live site.

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Preview · draft state only</span>
        <span>{sections.length} sections</span>
      </div>
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        {sections
          .filter((s) => s.visible)
          .map((section) => (
            <div
              key={section.id}
              className="border-b p-8 last:border-b-0"
              data-section-id={section.id}
            >
              <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="capitalize">
                  {section.type}
                </Badge>
                <span>{section.name}</span>
              </div>
              <div className="space-y-3">
                {section.elements.map((el) => (
                  <ElementPreview
                    key={el.id}
                    element={el}
                    editorMode={editorMode}
                    isSelected={selectedElementId === el.id}
                    onClick={() => editorMode && onSelect(section.id, el.id)}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>
      <iframe ref={iframeRef} className="hidden" title="editor-bridge" />
    </div>
  );
}

function ElementPreview({
  element,
  editorMode,
  isSelected,
  onClick,
}: {
  element: EditorElement;
  editorMode: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const ring = isSelected
    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
    : editorMode
      ? "hover:ring-2 hover:ring-primary/40 hover:ring-offset-2 hover:ring-offset-background cursor-pointer"
      : "";
  const styleObj = element.styles as Record<string, string | number>;

  if (element.type === "text") {
    const size = Number(styleObj.fontSize ?? 16);
    return (
      <p onClick={onClick} className={`rounded-md px-1 ${ring}`} style={{ fontSize: size }}>
        {String(element.content ?? "")}
      </p>
    );
  }
  if (element.type === "button") {
    return (
      <div onClick={onClick} className={`inline-block rounded-md ${ring}`}>
        <Button variant="default" size="sm" type="button">
          {String(element.content ?? "Button")}
        </Button>
      </div>
    );
  }
  if (element.type === "image") {
    const src = String(element.content ?? "");
    return (
      <div onClick={onClick} className={`inline-block rounded-md ${ring}`}>
        {src ? (
          <img src={src} alt="" className="max-h-48 rounded-md" loading="lazy" />
        ) : (
          <div className="flex h-32 w-48 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
            Image
          </div>
        )}
      </div>
    );
  }
  return null;
}

function DiffPanel({
  aId,
  bId,
  onClear,
}: {
  aId: string | null;
  bId: string | null;
  onClear: () => void;
}) {
  const { snapshots, state } = useEditorEngine();

  const a = snapshots.find((s) => s.versionId === aId);
  const b = snapshots.find((s) => s.versionId === bId);
  const right = b?.state ?? state;

  if (!a || !right) {
    return (
      <div className="p-2 text-xs text-muted-foreground">
        <p className="rounded-md border border-dashed p-4">
          Pick two snapshots from the History tab to compare. The B side defaults to the current
          draft when only A is selected.
        </p>
      </div>
    );
  }
  const diff = diffPageState(a.state, right);

  return (
    <ScrollArea className="h-[calc(100vh-200px)] pr-2">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          <code>{a.versionId.slice(0, 8)}</code> →{" "}
          <code>{(b?.versionId ?? state.versionId).slice(0, 8)}</code>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
      <div className="mb-2 text-sm">
        <strong>{diff.totalChanges}</strong> total change
        {diff.totalChanges === 1 ? "" : "s"}
      </div>
      <div className="space-y-2">
        {diff.sectionDiff.added.map((s) => (
          <Card key={s.id} className="border-emerald-500/30 bg-emerald-500/5 p-2">
            <p className="text-xs">
              <span className="font-semibold text-emerald-600">+ Added</span> section{" "}
              <strong>{s.name ?? s.type}</strong>
            </p>
          </Card>
        ))}
        {diff.sectionDiff.removed.map((s) => (
          <Card key={s.id} className="border-destructive/30 bg-destructive/5 p-2">
            <p className="text-xs">
              <span className="font-semibold text-destructive">− Removed</span> section{" "}
              <strong>{s.name ?? s.type}</strong>
            </p>
          </Card>
        ))}
        {diff.sectionDiff.modified.map((m) => (
          <Card key={m.sectionId} className="p-2">
            <p className="text-xs font-medium">
              ~ Modified <strong>{m.after.name ?? m.after.type}</strong>
            </p>
            <ul className="ml-3 mt-1 list-disc text-[11px] text-muted-foreground">
              {m.visibilityChanged && (
                <li>
                  visibility: {String(m.before.visible)} → {String(m.after.visible)}
                </li>
              )}
              {m.reordered && <li>reordered</li>}
              {m.elementDiff.added.length > 0 && <li>+{m.elementDiff.added.length} element(s)</li>}
              {m.elementDiff.removed.length > 0 && (
                <li>−{m.elementDiff.removed.length} element(s)</li>
              )}
              {m.elementDiff.modified.length > 0 && (
                <li>{m.elementDiff.modified.length} element edit(s)</li>
              )}
            </ul>
          </Card>
        ))}
        {diff.totalChanges === 0 && (
          <p className="rounded-md border border-dashed p-4 text-xs text-muted-foreground">
            Snapshots are identical.
          </p>
        )}
      </div>
    </ScrollArea>
  );
}
