// Full-screen PDF preview modal for Exam Batch leaderboard exports.
// Renders the actual server-generated PDF bytes with pdfjs-dist so what
// the admin sees is byte-identical to the download (WYSIWYG). Includes
// zoom, page navigation, print and download controls.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  X,
  ZoomIn,
  ZoomOut,
  Printer,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { primaryBtnCls, ghostBtnCls } from "./kit";

type ZoomMode = number | "fit";

const ZOOM_PRESETS: Array<{ label: string; value: ZoomMode }> = [
  { label: "50%", value: 0.5 },
  { label: "75%", value: 0.75 },
  { label: "100%", value: 1 },
  { label: "125%", value: 1.25 },
  { label: "150%", value: 1.5 },
  { label: "Fit Width", value: "fit" },
];

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type PdfPreviewArtifact = {
  filename: string;
  mimeType: string;
  contentBase64: string;
  rowCount: number;
};

export function PdfPreviewModal({
  open,
  onClose,
  artifact,
  loading,
  onDownload,
  title,
}: {
  open: boolean;
  onClose: () => void;
  artifact: PdfPreviewArtifact | null;
  loading: boolean;
  onDownload: () => void;
  title: string;
}) {
  const [pdf, setPdf] = useState<any>(null);
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState<ZoomMode>("fit");
  const [renderError, setRenderError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  // Load PDF whenever the artifact changes.
  useEffect(() => {
    if (!open || !artifact) {
      setPdf(null);
      setPageCount(0);
      setCurrentPage(1);
      setRenderError(null);
      return;
    }
    let cancelled = false;
    setRenderError(null);
    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist/build/pdf.mjs");
        // Point the worker at the bundled asset via a blob URL so bundlers
        // that block cross-origin worker URLs still succeed.
        try {
          const workerModule = await import(
            "pdfjs-dist/build/pdf.worker.mjs?url"
          );
          pdfjs.GlobalWorkerOptions.workerSrc = (workerModule as any).default;
        } catch {
          // Fallback: rely on same-origin CDN worker resolution.
        }
        const bytes = base64ToBytes(artifact.contentBase64);
        const loadingTask = pdfjs.getDocument({ data: bytes });
        const loaded = await loadingTask.promise;
        if (cancelled) return;
        setPdf(loaded);
        setPageCount(loaded.numPages);
        setCurrentPage(1);
      } catch (e: any) {
        console.error("[pdf-preview] load failed", e);
        if (!cancelled) setRenderError(e?.message ?? "Failed to load PDF");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, artifact]);

  // Render current page whenever page, zoom or pdf changes.
  const renderPage = useCallback(async () => {
    if (!pdf || !canvasRef.current || !viewportRef.current) return;
    try {
      const page = await pdf.getPage(currentPage);
      const baseViewport = page.getViewport({ scale: 1 });
      let scale: number;
      if (zoom === "fit") {
        const available = viewportRef.current.clientWidth - 32;
        scale = Math.max(0.25, available / baseViewport.width);
      } else {
        scale = zoom;
      }
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e: any) {
      console.error("[pdf-preview] render failed", e);
      setRenderError(e?.message ?? "Failed to render page");
    }
  }, [pdf, currentPage, zoom]);

  useEffect(() => {
    if (open) void renderPage();
  }, [open, renderPage]);

  // Re-render on window resize when in fit mode.
  useEffect(() => {
    if (!open || zoom !== "fit") return;
    const on = () => void renderPage();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [open, zoom, renderPage]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [open, onClose]);

  const handlePrint = () => {
    if (!artifact) return;
    const bytes = base64ToBytes(artifact.contentBase64);
    const blob = new Blob([bytes as unknown as BlobPart], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (e) {
        console.error("[pdf-preview] print failed", e);
      }
    };
    document.body.appendChild(iframe);
    // Clean up shortly after — printing is async but the user's dialog
    // holds a reference internally.
    setTimeout(() => {
      URL.revokeObjectURL(url);
      iframe.remove();
    }, 60_000);
  };

  const openInNewTab = () => {
    if (!artifact) return;
    const bytes = base64ToBytes(artifact.contentBase64);
    const blob = new Blob([bytes as unknown as BlobPart], { type: artifact.mimeType });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label="Leaderboard PDF preview"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className={cn(ghostBtnCls, "h-9 min-h-9 px-3")}
            aria-label="Close preview"
          >
            <X className="h-4 w-4" /> Close
          </button>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold">
              {title}
            </p>
            {artifact && (
              <p className="text-xs text-muted-foreground">
                {artifact.filename} · {artifact.rowCount.toLocaleString()} rows
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Page nav */}
          <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 p-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[70px] text-center text-xs font-semibold tabular-nums">
              {pageCount > 0 ? `${currentPage} / ${pageCount}` : "—"}
            </span>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
              disabled={currentPage >= pageCount}
              onClick={() =>
                setCurrentPage((p) => Math.min(pageCount, p + 1))
              }
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Zoom */}
          <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/60 p-1">
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() =>
                setZoom((z) =>
                  typeof z === "number" ? Math.max(0.25, +(z - 0.25).toFixed(2)) : 0.75,
                )
              }
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <select
              value={typeof zoom === "number" ? zoom.toString() : "fit"}
              onChange={(e) => {
                const v = e.target.value;
                setZoom(v === "fit" ? "fit" : Number(v));
              }}
              className="h-8 rounded-full bg-transparent px-2 text-xs font-semibold outline-none"
            >
              {ZOOM_PRESETS.map((p) => (
                <option
                  key={p.label}
                  value={typeof p.value === "number" ? p.value.toString() : "fit"}
                >
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() =>
                setZoom((z) =>
                  typeof z === "number" ? Math.min(3, +(z + 0.25).toFixed(2)) : 1.25,
                )
              }
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={openInNewTab}
            className={cn(ghostBtnCls, "h-9 min-h-9 px-3")}
            disabled={!artifact}
          >
            <Maximize2 className="h-4 w-4" /> Open
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className={cn(ghostBtnCls, "h-9 min-h-9 px-3")}
            disabled={!artifact}
          >
            <Printer className="h-4 w-4" /> Print
          </button>
          <button
            type="button"
            onClick={onDownload}
            className={cn(primaryBtnCls, "h-9 min-h-9 px-3")}
            disabled={!artifact}
          >
            <Download className="h-4 w-4" /> Download
          </button>
        </div>
      </div>

      {/* Viewer */}
      <div
        ref={viewportRef}
        className="flex-1 overflow-auto bg-muted/30 p-4"
      >
        {loading || !artifact ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Generating preview…
          </div>
        ) : renderError ? (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {renderError}
          </div>
        ) : (
          <div className="mx-auto flex justify-center">
            <div className="rounded-xl bg-white p-2 shadow-2xl ring-1 ring-black/5">
              <canvas ref={canvasRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Theme picker ----------

import { PDF_THEME_PRESETS } from "@/lib/exam-batch/pdf-themes";

export type PdfTheme = { name: string; hex: string };

export const PDF_THEMES: PdfTheme[] = PDF_THEME_PRESETS.map((t) => ({
  name: t.name,
  hex: t.primary,
}));

export function PdfThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PDF_THEMES.map((t) => {
        const active = value.toLowerCase() === t.hex.toLowerCase();
        return (
          <button
            key={t.hex}
            type="button"
            onClick={() => onChange(t.hex)}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition",
              active
                ? "border-foreground shadow"
                : "border-border/60 hover:border-foreground/60",
            )}
            title={t.name}
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: t.hex }}
            />
            {t.name}
          </button>
        );
      })}
    </div>
  );
}
