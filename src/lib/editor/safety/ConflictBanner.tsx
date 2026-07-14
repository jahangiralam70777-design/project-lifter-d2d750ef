// Phase-4 — Soft, non-blocking conflict banner.
// Surfaces concurrent-edit detection from realtime layer without freezing the UI.

import { AlertTriangle, RefreshCw, X } from "lucide-react";

export interface ConflictBannerProps {
  visible: boolean;
  remoteAuthor?: string | null;
  onReload: () => void;
  onDismiss: () => void;
  onMerge?: () => void;
}

export function ConflictBanner({
  visible,
  remoteAuthor,
  onReload,
  onDismiss,
  onMerge,
}: ConflictBannerProps) {
  if (!visible) return null;
  return (
    <div
      role="status"
      className="pointer-events-auto flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm shadow-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="flex-1">
        <div className="font-medium text-amber-700 dark:text-amber-300">
          Concurrent edit detected
        </div>
        <div className="text-xs text-muted-foreground">
          {remoteAuthor
            ? `${remoteAuthor} updated this page in another session.`
            : "Another session updated this page."}{" "}
          Your work is preserved locally.
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onReload}
            className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
          >
            <RefreshCw className="h-3 w-3" /> Reload remote
          </button>
          {onMerge ? (
            <button
              type="button"
              onClick={onMerge}
              className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
            >
              Auto-merge
            </button>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
