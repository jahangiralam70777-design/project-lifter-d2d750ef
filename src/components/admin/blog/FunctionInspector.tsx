import { useEffect, useState } from "react";
import { useActionLog, type ActionLogEntry } from "@/lib/blog/action-log";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Trash2,
  X,
  Eye,
  EyeOff,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";

/**
 * Dev-only floating panel that mirrors the action log. Toggle with
 * Ctrl/Cmd + ` (backtick). Inspector Mode (Ctrl/Cmd+Shift+`) draws an outline
 * + fn-name badge on every <TraceButton>.
 */
export function FunctionInspector() {
  const open = useActionLog((s) => s.inspectorOpen);
  const mode = useActionLog((s) => s.inspectorMode);
  const entries = useActionLog((s) => s.entries);
  const clear = useActionLog((s) => s.clear);
  const toggleOpen = useActionLog((s) => s.toggleOpen);
  const toggleMode = useActionLog((s) => s.toggleMode);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "`") {
        e.preventDefault();
        if (e.shiftKey) toggleMode();
        else toggleOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleOpen, toggleMode]);

  useEffect(() => {
    document.body.classList.toggle("inspector-mode-on", mode);
    return () => document.body.classList.remove("inspector-mode-on");
  }, [mode]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggleOpen}
        title="Open Function Inspector (Ctrl/⌘+`)"
        className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur hover:bg-background"
      >
        <Activity className="h-3.5 w-3.5 text-primary" />
        Inspector
        {entries.length > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 text-[10px] text-primary">
            {entries.length}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex w-[420px] max-w-[95vw] flex-col rounded-2xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur">
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-semibold">
          <Activity className="h-3.5 w-3.5 text-primary" />
          Function Inspector
          <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
            {entries.length}/50
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={toggleMode}
            title="Toggle button overlays (Ctrl/⌘+Shift+`)"
            className={`rounded-md p-1.5 text-xs ${
              mode ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {mode ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={clear}
            title="Clear log"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={toggleOpen}
            title="Close"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      <div className="max-h-[60vh] overflow-y-auto p-2">
        {entries.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            No actions yet. Trigger a mutation in Blog Manager to see it here.
          </p>
        ) : (
          <ul className="space-y-1">
            {entries.map((e) => (
              <InspectorRow
                key={e.id}
                entry={e}
                expanded={expanded === e.id}
                onToggle={() => setExpanded(expanded === e.id ? null : e.id)}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
        Ctrl/⌘+` toggle · Ctrl/⌘+Shift+` button overlays
      </footer>
    </div>
  );
}

function InspectorRow({
  entry,
  expanded,
  onToggle,
}: {
  entry: ActionLogEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  const StatusIcon =
    entry.status === "pending"
      ? Loader2
      : entry.status === "success"
        ? CheckCircle2
        : AlertCircle;
  const tone =
    entry.status === "pending"
      ? "text-muted-foreground"
      : entry.status === "success"
        ? "text-emerald-500"
        : "text-destructive";

  return (
    <li className="rounded-lg border border-border/50 bg-muted/20">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs"
      >
        <StatusIcon className={`h-3.5 w-3.5 shrink-0 ${tone} ${entry.status === "pending" ? "animate-spin" : ""}`} />
        <span className="flex-1 truncate font-mono">{entry.fn}</span>
        {typeof entry.ms === "number" && (
          <span className="shrink-0 text-[10px] text-muted-foreground">{entry.ms}ms</span>
        )}
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="space-y-1 border-t border-border/40 px-2 py-2 text-[11px]">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>{new Date(entry.ts).toLocaleTimeString()}</span>
            {entry.file && <span className="font-mono">{entry.file}</span>}
          </div>
          {entry.payload !== undefined && (
            <CodeBlock label="payload" value={entry.payload} />
          )}
          {entry.error && (
            <p className="rounded bg-destructive/10 px-2 py-1 text-destructive">{entry.error}</p>
          )}
          {entry.result !== undefined && entry.status === "success" && (
            <CodeBlock label="result" value={entry.result} />
          )}
        </div>
      )}
    </li>
  );
}

function CodeBlock({ label, value }: { label: string; value: unknown }) {
  const text = (() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(text)}
          title="Copy"
          className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
      <pre className="max-h-40 overflow-auto rounded bg-background/80 p-2 font-mono text-[10px] leading-snug">
        {text}
      </pre>
    </div>
  );
}
