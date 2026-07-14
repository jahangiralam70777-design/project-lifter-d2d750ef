// Admin Exam Batch — Phase 3 (Countdown / Downloads / Settings).
// Fully wired to real backend server functions. No mock/demo data.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Download,
  FileDown,
  FileType2,
  Loader2,
  Plus,
  RefreshCw,
  Settings as SettingsIcon,
  Timer,
  Trophy,
  ClipboardCheck,
  UserCheck,
  Palette,
  Link2,
  Type,
  Shield,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import {
  PdfPreviewModal,
  PdfThemePicker,
  type PdfPreviewArtifact,
} from "./pdf-preview";

import {
  PageHeader,
  SectionCard,
  EmptyState,
  primaryBtnCls,
  ghostBtnCls,
} from "./kit";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import {
  adminGetExamBatchSettings,
  adminUpdateExamBatchSettings,
  adminSetExamBatchModuleVisibility,
  adminListExamBatchCommentRules,
  adminReplaceExamBatchCommentRules,
} from "@/lib/exam-batch/admin-settings.functions";
import {
  adminExportExamBatchLeaderboard,
  adminListExamBatchDownloadHistory,
  adminLogExamBatchDemoDownload,
} from "@/lib/exam-batch/admin-exports.functions";
import {
  DEMO_LEADERBOARD_ROWS,
  demoPdfToBase64,
  generateDemoLeaderboardPdf,
} from "@/lib/exam-batch/demo-leaderboard-pdf";
import { adminListExamBatchSessions } from "@/lib/exam-batch/admin-sessions.functions";
import { adminListExamBatchExams } from "@/lib/exam-batch/admin-exams.functions";
import type {
  ExamBatchSettings,
  CommentRule,
} from "@/lib/exam-batch/settings.types";

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function downloadBase64(filename: string, mimeType: string, contentBase64: string) {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function LoadingBlock({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-3xl border border-border/50 bg-background/40 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> {label ?? "Loading…"}
    </div>
  );
}

function ErrorBlock({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-destructive/40 bg-destructive/5 py-10 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <button className={ghostBtnCls} onClick={onRetry}>
        <RefreshCw className="h-4 w-4" /> Retry
      </button>
    </div>
  );
}

/* ============================================================
 * COUNTDOWN
 * ============================================================ */

function CountdownPreview({
  label,
  targetIso,
  enabled,
}: {
  label: string;
  targetIso: string | null;
  enabled: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const target = targetIso ? new Date(targetIso).getTime() : null;
  const diff = target ? Math.max(0, target - now) : 0;
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff / 3600000) % 24);
  const mins = Math.floor((diff / 60000) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  return (
    <div className="relative overflow-hidden rounded-3xl shadow-card-soft">
      <div className="bg-cta-gradient absolute inset-0" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-black/20 blur-3xl" />
      <div className="relative p-6 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
          Live preview {enabled ? "· enabled" : "· disabled"}
        </p>
        <h3 className="mt-1 font-display text-xl font-bold tracking-tight">
          {label || "Untitled countdown"}
        </h3>
        <p className="mt-1 text-xs text-white/75">
          Target · {targetIso ? format(new Date(targetIso), "PPP p") : "Not set"}
        </p>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            ["D", days],
            ["H", hours],
            ["M", mins],
            ["S", secs],
          ].map(([l, v]) => (
            <div
              key={l as string}
              className="rounded-2xl bg-white/10 px-3 py-3 text-center backdrop-blur"
            >
              <p className="font-display text-2xl font-bold tabular-nums leading-none">
                {String(v).padStart(2, "0")}
              </p>
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-white/70">
                {l}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminCountdown() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["exam-batch", "admin", "settings"],
    queryFn: () => adminGetExamBatchSettings(),
  });

  const [label, setLabel] = useState("");
  const [sessionText, setSessionText] = useState("");
  const [levelText, setLevelText] = useState("");
  const [localTarget, setLocalTarget] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [showOnDashboard, setShowOnDashboard] = useState(false);

  useEffect(() => {
    if (!settingsQuery.data) return;
    const c = settingsQuery.data.countdown as typeof settingsQuery.data.countdown & {
      sessionText?: string | null;
      levelText?: string | null;
    };
    setLabel(c.label ?? "");
    setSessionText(c.sessionText ?? "");
    setLevelText(c.levelText ?? "");
    setLocalTarget(toLocalInputValue(c.targetIso));
    setEnabled(!!c.enabled);
    setShowOnDashboard(!!c.showOnDashboard);
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: (input: { publish: boolean }) => {
      const iso = localTarget ? new Date(localTarget).toISOString() : null;
      return adminUpdateExamBatchSettings({
        data: {
          countdown: {
            label: label.trim() || null,
            sessionText: sessionText.trim() || null,
            levelText: levelText.trim() || null,
            targetIso: iso,
            enabled: input.publish ? true : enabled,
            showOnDashboard,
          },
        },
      });
    },
    onSuccess: (data) => {
      qc.setQueryData(["exam-batch", "admin", "settings"], data);
      qc.invalidateQueries({ queryKey: ["exam-batch", "public-settings"] });
      toast.success("Countdown saved");
    },
    onError: (e) => toast.error((e as Error).message),
  });


  const targetIso = localTarget ? new Date(localTarget).toISOString() : null;

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Countdown manager"
        description="Set the module-wide countdown displayed to students."
        icon={Timer}
      />

      {settingsQuery.isLoading ? (
        <LoadingBlock label="Loading countdown settings…" />
      ) : settingsQuery.isError ? (
        <ErrorBlock error={settingsQuery.error} onRetry={() => settingsQuery.refetch()} />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <SectionCard
            title="Countdown details"
            description="Configure the display"
            className="lg:col-span-3"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Exam title
                </span>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. August 2026 Grand Test"
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Session
                </span>
                <input
                  value={sessionText}
                  onChange={(e) => setSessionText(e.target.value)}
                  placeholder="e.g. August 2026 Session"
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Level
                </span>
                <input
                  value={levelText}
                  onChange={(e) => setLevelText(e.target.value)}
                  placeholder="e.g. CA Foundation"
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Target date &amp; time
                </span>
                <input
                  type="datetime-local"
                  value={localTarget}
                  onChange={(e) => setLocalTarget(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
                />
              </label>

              <ToggleRow label="Enabled" value={enabled} onChange={setEnabled} />
              <ToggleRow
                label="Show on student dashboard"
                value={showOnDashboard}
                onChange={setShowOnDashboard}
              />
            </div>

            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                className={ghostBtnCls}
                onClick={() => save.mutate({ publish: false })}
                disabled={save.isPending}
              >
                {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </button>
              <button
                className={primaryBtnCls}
                onClick={() => save.mutate({ publish: true })}
                disabled={save.isPending || !localTarget}
              >
                Publish
              </button>
            </div>
            {settingsQuery.data?.updatedAt && (
              <p className="mt-3 text-[11px] text-muted-foreground">
                Last updated {format(new Date(settingsQuery.data.updatedAt), "PPP p")}
              </p>
            )}
          </SectionCard>

          <div className="lg:col-span-2">
            <CountdownPreview label={label} targetIso={targetIso} enabled={enabled} />
          </div>
        </div>
      )}
    </>
  );
}

/* ============================================================
 * DOWNLOADS
 * ============================================================ */

export function AdminDownloads() {
  const [mode, setMode] = useState<"real" | "demo">("real");
  const [sessionId, setSessionId] = useState<string>("");
  const [examId, setExamId] = useState<string>("");
  const [fmt, setFmt] = useState<"pdf" | "txt">("pdf");
  const [topN, setTopN] = useState<number>(100);
  const [scope, setScope] = useState<"top_n" | "full">("top_n");
  const [historyPage, setHistoryPage] = useState(0);
  const historyLimit = 50;
  const [themeColor, setThemeColor] = useState<string>("#059669");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewArtifact, setPreviewArtifact] =
    useState<PdfPreviewArtifact | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["exam-batch", "admin", "sessions", "all"],
    queryFn: () => adminListExamBatchSessions({ data: {} }),
  });

  const examsQuery = useQuery({
    queryKey: ["exam-batch", "admin", "exams", sessionId || "all"],
    queryFn: () =>
      adminListExamBatchExams({
        data: sessionId ? { sessionId, includeArchived: true } : { includeArchived: true },
      }),
  });

  const settingsQuery = useQuery({
    queryKey: ["exam-batch", "admin", "settings", "downloads-brand"],
    queryFn: () => adminGetExamBatchSettings(),
    staleTime: 60_000,
  });

  const historyQuery = useQuery({
    queryKey: ["exam-batch", "admin", "download-history", historyPage],
    queryFn: () =>
      adminListExamBatchDownloadHistory({
        data: { offset: historyPage * historyLimit, limit: historyLimit },
      }),
    placeholderData: keepPreviousData,
  });

  const buildDemoMeta = () => {
    const s = settingsQuery.data;
    const sessionTitle =
      sessions.find((x) => x.id === sessionId)?.title ?? "Autumn 2026";
    const examTitle = examLookup.get(examId) ?? "Sample Mock Exam";
    return {
      sessionTitle,
      subjectName: "Sample Subject",
      examTitle,
      themeColor,
      brand: {
        siteName: (s as any)?.general?.brandName ?? "CA Aspire BD",
        websiteUrl: (s as any)?.general?.websiteUrl ?? null,
        facebookUrl:
          s?.content?.facebookPageUrl ?? s?.content?.facebookGroupUrl ?? null,
        youtubeUrl: s?.content?.youtubeChannelUrl ?? null,
        whatsappContact: s?.content?.whatsappContact ?? null,
      },
    };
  };

  const buildDemoArtifact = (): PdfPreviewArtifact => {
    const bytes = generateDemoLeaderboardPdf(buildDemoMeta());
    const base64 = demoPdfToBase64(bytes);
    return {
      filename: `leaderboard-demo-${Date.now()}.pdf`,
      mimeType: "application/pdf",
      contentBase64: base64,
      rowCount: DEMO_LEADERBOARD_ROWS.length,
    };
  };

  const demoLogMut = useMutation({
    mutationFn: (payload: { byteLength: number }) =>
      adminLogExamBatchDemoDownload({
        data: {
          sessionId: sessionId || undefined,
          examId: examId || undefined,
          themeColor,
          rowCount: DEMO_LEADERBOARD_ROWS.length,
          byteLength: payload.byteLength,
        },
      }),
    onSuccess: () => historyQuery.refetch(),
  });

  const demoDownload = () => {
    let artifact: PdfPreviewArtifact;
    try {
      artifact = buildDemoArtifact();
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }
    downloadBase64(artifact.filename, artifact.mimeType, artifact.contentBase64);
    toast.success("Demo PDF downloaded");
    const approxBytes = Math.floor((artifact.contentBase64.length * 3) / 4);
    demoLogMut.mutate({ byteLength: approxBytes });
  };

  const demoPreview = () => {
    try {
      const artifact = buildDemoArtifact();
      setPreviewArtifact(artifact);
      setPreviewOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };


  const buildExportInput = (format: "pdf" | "txt") => ({
    examId,
    format,
    scope,
    topN,
    sessionId: sessionId || undefined,
    themeColor: format === "pdf" ? themeColor : undefined,
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      adminExportExamBatchLeaderboard({ data: buildExportInput(fmt) }),
    onSuccess: (artifact) => {
      downloadBase64(artifact.filename, artifact.mimeType, artifact.contentBase64);
      toast.success(`Downloaded ${artifact.filename} (${artifact.rowCount} rows)`);
      historyQuery.refetch();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const previewMutation = useMutation({
    mutationFn: () =>
      adminExportExamBatchLeaderboard({ data: buildExportInput("pdf") }),
    onSuccess: (artifact) => {
      setPreviewArtifact({
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        contentBase64: artifact.contentBase64,
        rowCount: artifact.rowCount,
      });
      historyQuery.refetch();
    },
    onError: (e) => {
      setPreviewOpen(false);
      toast.error((e as Error).message);
    },
  });

  const openPreview = () => {
    if (!examId) return;
    setPreviewArtifact(null);
    setPreviewOpen(true);
    previewMutation.mutate();
  };

  const downloadFromPreview = () => {
    if (!previewArtifact) return;
    downloadBase64(
      previewArtifact.filename,
      previewArtifact.mimeType,
      previewArtifact.contentBase64,
    );
    toast.success(`Downloaded ${previewArtifact.filename}`);
  };

  const sessions = sessionsQuery.data ?? [];
  const exams = examsQuery.data ?? [];
  const history = historyQuery.data;

  const examLookup = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of exams) map.set(e.id, e.title);
    return map;
  }, [exams]);

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Downloads center"
        description="Generate leaderboard exports and review the download history."
        icon={Download}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <SectionCard
          title="Generate leaderboard export"
          description="Real exports use frozen leaderboards. Demo mode previews the PDF design with sample data."
          className="lg:col-span-3"
        >
          <div className="mb-3 inline-flex items-center gap-1 rounded-xl border border-border/60 bg-background/40 p-1 text-xs">
            {(["real", "demo"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg px-3 py-1.5 font-semibold capitalize transition",
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {m === "real" ? "Real PDF" : "Demo PDF"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Session</span>
              <select
                value={sessionId}
                onChange={(e) => { setSessionId(e.target.value); setExamId(""); }}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              >
                <option value="">All sessions</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Exam</span>
              <select
                value={examId}
                onChange={(e) => setExamId(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
                disabled={examsQuery.isLoading}
              >
                <option value="">{examsQuery.isLoading ? "Loading exams…" : "Select an exam"}</option>
                {exams.map((e) => (
                  <option key={e.id} value={e.id}>{e.title}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Format</span>
              <select
                value={fmt}
                onChange={(e) => setFmt(e.target.value as "pdf" | "txt")}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              >
                <option value="pdf">PDF</option>
                <option value="txt">TXT</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Scope</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "top_n" | "full")}
                className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
              >
                <option value="top_n">Top N</option>
                <option value="full">Full leaderboard</option>
              </select>
            </label>
            {scope === "top_n" && (
              <label className="block sm:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Top N</span>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={topN}
                  onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
                />
              </label>
            )}
          </div>

          {fmt === "pdf" && (
            <div className="mt-4 rounded-2xl border border-border/60 bg-background/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  PDF theme color
                </span>
                <span
                  className="inline-block h-4 w-4 rounded-full ring-1 ring-black/10"
                  style={{ backgroundColor: themeColor }}
                />
              </div>
              <PdfThemePicker value={themeColor} onChange={setThemeColor} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {mode === "demo" ? (
              <>
                <button type="button" className={ghostBtnCls} onClick={demoPreview}>
                  <Eye className="h-4 w-4" /> Preview demo PDF
                </button>
                <button type="button" className={primaryBtnCls} onClick={demoDownload}>
                  <FileDown className="h-4 w-4" /> Download demo PDF
                </button>
              </>
            ) : (
              <>
                {fmt === "pdf" && (
                  <button
                    type="button"
                    className={ghostBtnCls}
                    onClick={openPreview}
                    disabled={!examId || previewMutation.isPending}
                  >
                    {previewMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Preview real PDF
                  </button>
                )}
                <button
                  className={primaryBtnCls}
                  onClick={() => exportMutation.mutate()}
                  disabled={!examId || exportMutation.isPending}
                >
                  {exportMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  Generate &amp; download
                </button>
              </>
            )}
          </div>
        </SectionCard>



        <SectionCard title="Formats" description="Supported outputs" className="lg:col-span-2">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
              <div className="bg-cta-gradient flex h-9 w-9 items-center justify-center rounded-xl text-white">
                <Trophy className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold">Leaderboard PDF</p>
                <p className="text-xs text-muted-foreground">Includes ranks, marks and comments</p>
              </div>
            </li>
            <li className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                <FileType2 className="h-4 w-4" />
              </div>
              <div>
                <p className="font-semibold">Leaderboard TXT</p>
                <p className="text-xs text-muted-foreground">Plain-text digest for sharing</p>
              </div>
            </li>
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Download history" description="Every generated export is audited." className="mt-4">
        {historyQuery.isLoading ? (
          <LoadingBlock label="Loading history…" />
        ) : historyQuery.isError ? (
          <ErrorBlock error={historyQuery.error} onRetry={() => historyQuery.refetch()} />
        ) : !history || history.rows.length === 0 ? (
          <EmptyState
            icon={Download}
            title="No downloads yet"
            description="Generated exports will appear here with the actor, filters and byte size."
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <tr className="border-b border-border/50">
                    <th className="px-3 py-2 text-left">Generated</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Format</th>
                    <th className="px-3 py-2 text-left">Exam</th>
                    <th className="px-3 py-2 text-right">Rows</th>
                    <th className="px-3 py-2 text-right">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {history.rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/30">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {format(new Date(r.created_at), "PPP p")}
                      </td>
                      <td className="px-3 py-2">{r.export_type}</td>
                      <td className="px-3 py-2 uppercase">{r.format}</td>
                      <td className="px-3 py-2">
                        {r.exam_id ? examLookup.get(r.exam_id) ?? r.exam_id.slice(0, 8) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.row_count ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatBytes(r.byte_length)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {history.rows.length > 0
                  ? `Showing ${historyPage * historyLimit + 1}–${historyPage * historyLimit + history.rows.length} of ${history.total}`
                  : "No rows"}
              </span>
              <div className="flex gap-2">
                <button
                  className={ghostBtnCls}
                  disabled={historyPage === 0}
                  onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                >Previous</button>
                <button
                  className={ghostBtnCls}
                  disabled={(historyPage + 1) * historyLimit >= history.total}
                  onClick={() => setHistoryPage((p) => p + 1)}
                >Next</button>
              </div>
            </div>
          </>
        )}
      </SectionCard>

      <PdfPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        artifact={previewArtifact}
        loading={previewMutation.isPending && !previewArtifact}
        onDownload={downloadFromPreview}
        title={
          examId
            ? `Leaderboard · ${examLookup.get(examId) ?? "Selected exam"}`
            : "Leaderboard preview"
        }
      />
    </>
  );
}

/* ============================================================
 * SETTINGS
 * ============================================================ */

type SettingsKey =
  | "general"
  | "enrollment"
  | "approval"
  | "leaderboard"
  | "export"
  | "theme"
  | "content"
  | "visibility"
  | "comments";

type SettingCardDef = {
  id: SettingsKey;
  title: string;
  description: string;
  icon: React.ElementType;
  tone: string;
};

const SETTING_CARDS: SettingCardDef[] = [
  { id: "general", title: "General", description: "Organization, logo, help text", icon: SettingsIcon, tone: "from-fuchsia-500 to-violet-500" },
  { id: "enrollment", title: "Enrollment", description: "Instructions, auto-approval, caps", icon: ClipboardCheck, tone: "from-sky-500 to-indigo-500" },
  { id: "approval", title: "Approval", description: "Admin approval and notifications", icon: UserCheck, tone: "from-emerald-500 to-teal-500" },
  { id: "leaderboard", title: "Leaderboard", description: "Ranking retention and display", icon: Trophy, tone: "from-amber-500 to-orange-500" },
  { id: "export", title: "Downloads", description: "Export defaults and footer", icon: Download, tone: "from-cyan-500 to-sky-500" },
  { id: "theme", title: "Theme", description: "Colors, gradients and mode", icon: Palette, tone: "from-purple-500 to-fuchsia-500" },
  { id: "content", title: "Links", description: "Social and support URLs", icon: Link2, tone: "from-slate-500 to-zinc-500" },
  { id: "visibility", title: "Module visibility", description: "Show or hide the module", icon: Shield, tone: "from-rose-500 to-pink-500" },
  { id: "comments", title: "Comment rules", description: "Score-band feedback messages", icon: Type, tone: "from-indigo-500 to-blue-500" },
];

export function AdminSettings() {
  const qc = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["exam-batch", "admin", "settings"],
    queryFn: () => adminGetExamBatchSettings(),
  });

  const [open, setOpen] = useState<SettingsKey | null>(null);
  const active = SETTING_CARDS.find((c) => c.id === open) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Exam Batch Manager"
        title="Module settings"
        description="Configure enrollment, appearance, downloads, visibility and content."
        icon={SettingsIcon}
        action={
          <button
            className={ghostBtnCls}
            onClick={() => settingsQuery.refetch()}
            disabled={settingsQuery.isFetching}
          >
            {settingsQuery.isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </button>
        }
      />

      {settingsQuery.isLoading ? (
        <LoadingBlock label="Loading settings…" />
      ) : settingsQuery.isError ? (
        <ErrorBlock error={settingsQuery.error} onRetry={() => settingsQuery.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {SETTING_CARDS.map((c) => (
              <motion.button
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setOpen(c.id)}
                className="glass shadow-card-soft group relative overflow-hidden rounded-3xl p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-glow"
              >
                <div
                  className={cn(
                    "pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br opacity-25 blur-3xl",
                    c.tone,
                  )}
                />
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-glow",
                    c.tone,
                  )}
                >
                  <c.icon className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">{c.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
              </motion.button>
            ))}
          </div>
          {settingsQuery.data?.updatedAt && (
            <p className="mt-4 text-[11px] text-muted-foreground">
              Last saved {format(new Date(settingsQuery.data.updatedAt), "PPP p")}
            </p>
          )}
        </>
      )}

      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              {active && (
                <span
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-glow",
                    active.tone,
                  )}
                >
                  <active.icon className="h-4 w-4" />
                </span>
              )}
              <span>{active?.title}</span>
            </SheetTitle>
          </SheetHeader>
          {open && settingsQuery.data && (
            <div className="mt-6">
              <SettingsEditor
                sectionKey={open}
                settings={settingsQuery.data}
                onSaved={(next) => {
                  qc.setQueryData(["exam-batch", "admin", "settings"], next);
                  qc.invalidateQueries({ queryKey: ["exam-batch", "public-settings"] });
                }}
                onClose={() => setOpen(null)}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/60 bg-background/40 px-3 py-3">
      {label ? <span className="text-sm">{label}</span> : <span />}
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={cn(
          "inline-flex h-6 w-11 items-center rounded-full px-0.5 transition",
          value ? "bg-cta-gradient" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "h-5 w-5 rounded-full bg-white shadow transition",
            value ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
    </div>
  );
}

function TextField({
  label, value, onChange, placeholder, type = "text", multiline,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; multiline?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-xl border border-input bg-background/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
      )}
    </label>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
      />
    </label>
  );
}

function SaveBar({ onCancel, onSave, saving, disabled }: { onCancel: () => void; onSave: () => void; saving: boolean; disabled?: boolean }) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button className={ghostBtnCls} onClick={onCancel} type="button">Cancel</button>
      <button className={primaryBtnCls} onClick={onSave} type="button" disabled={saving || disabled}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save changes
      </button>
    </div>
  );
}

function sanitize<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const k of Object.keys(obj)) {
    const val = (obj as any)[k];
    if (typeof val === "string") {
      const trimmed = val.trim();
      out[k] = trimmed === "" ? null : trimmed;
    } else {
      out[k] = val;
    }
  }
  return out;
}

function SettingsEditor({
  sectionKey, settings, onSaved, onClose,
}: {
  sectionKey: SettingsKey;
  settings: ExamBatchSettings;
  onSaved: (s: ExamBatchSettings) => void;
  onClose: () => void;
}) {
  if (sectionKey === "visibility") {
    return <VisibilityEditor settings={settings} onSaved={onSaved} onClose={onClose} />;
  }
  if (sectionKey === "comments") {
    return <CommentRulesEditor onClose={onClose} />;
  }
  return (
    <GenericSectionEditor
      sectionKey={sectionKey}
      settings={settings}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}

function GenericSectionEditor({
  sectionKey, settings, onSaved, onClose,
}: {
  sectionKey: Exclude<SettingsKey, "visibility" | "comments">;
  settings: ExamBatchSettings;
  onSaved: (s: ExamBatchSettings) => void;
  onClose: () => void;
}) {
  const [v, setV] = useState<any>(() => ({ ...(settings as any)[sectionKey] }));
  const updateMutation = useMutation({
    mutationFn: (patch: any) => adminUpdateExamBatchSettings({ data: patch }),
    onSuccess: (data) => {
      onSaved(data);
      toast.success("Settings saved");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const save = () => {
    const payload: any = {};
    payload[sectionKey] =
      sectionKey === "approval" || sectionKey === "leaderboard" ? v : sanitize(v);
    updateMutation.mutate(payload);
  };

  if (sectionKey === "general") {
    return (
      <div className="space-y-3">
        <TextField label="Organization name" value={v.organizationName ?? ""} onChange={(x) => setV({ ...v, organizationName: x })} />
        <TextField label="Logo URL" value={v.logoUrl ?? ""} onChange={(x) => setV({ ...v, logoUrl: x })} placeholder="https://…" />
        <TextField label="Website URL" value={v.websiteUrl ?? ""} onChange={(x) => setV({ ...v, websiteUrl: x })} placeholder="https://…" />
        <TextField label="Help text" value={v.helpText ?? ""} onChange={(x) => setV({ ...v, helpText: x })} multiline />
        <TextField label="Empty-state message" value={v.emptyStateMessage ?? ""} onChange={(x) => setV({ ...v, emptyStateMessage: x })} multiline />
        <TextField label="Success message" value={v.successMessage ?? ""} onChange={(x) => setV({ ...v, successMessage: x })} multiline />
        <SaveBar onCancel={onClose} onSave={save} saving={updateMutation.isPending} />
      </div>
    );
  }
  if (sectionKey === "enrollment") {
    return (
      <div className="space-y-3">
        <TextField label="Enrollment instructions" value={v.enrollmentInstructions ?? ""} onChange={(x) => setV({ ...v, enrollmentInstructions: x })} multiline />
        <TextField label="Pending instructions" value={v.pendingInstructions ?? ""} onChange={(x) => setV({ ...v, pendingInstructions: x })} multiline />
        <TextField label="Approval message" value={v.approvalMessage ?? ""} onChange={(x) => setV({ ...v, approvalMessage: x })} multiline />
        <NumberField label="Max subjects per student" value={v.maxSubjectsPerStudent ?? 0} min={0} max={50} onChange={(x) => setV({ ...v, maxSubjectsPerStudent: x })} />
        <ToggleRow label="Auto-approve enrollments" value={!!v.autoApprove} onChange={(x) => setV({ ...v, autoApprove: x })} />
        <SaveBar onCancel={onClose} onSave={save} saving={updateMutation.isPending} />
      </div>
    );
  }
  if (sectionKey === "approval") {
    return (
      <div className="space-y-3">
        <ToggleRow label="Require admin approval" value={!!v.requireAdminApproval} onChange={(x) => setV({ ...v, requireAdminApproval: x })} />
        <ToggleRow label="Notify on enrollment" value={!!v.notifyOnEnrollment} onChange={(x) => setV({ ...v, notifyOnEnrollment: x })} />
        <ToggleRow label="Notify on approval" value={!!v.notifyOnApproval} onChange={(x) => setV({ ...v, notifyOnApproval: x })} />
        <SaveBar onCancel={onClose} onSave={save} saving={updateMutation.isPending} />
      </div>
    );
  }
  if (sectionKey === "leaderboard") {
    return (
      <div className="space-y-3">
        <NumberField label="Student top N" value={v.studentTopN ?? 20} min={1} max={500} onChange={(x) => setV({ ...v, studentTopN: x })} />
        <NumberField label="Student visibility (hours)" value={v.studentVisibilityHours ?? 24} min={1} max={720} onChange={(x) => setV({ ...v, studentVisibilityHours: x })} />
        <NumberField label="Admin retention (days)" value={v.adminRetentionDays ?? 45} min={1} max={365} onChange={(x) => setV({ ...v, adminRetentionDays: x })} />
        <ToggleRow label="Show percentage" value={!!v.showPercentage} onChange={(x) => setV({ ...v, showPercentage: x })} />
        <ToggleRow label="Show time used" value={!!v.showTimeUsed} onChange={(x) => setV({ ...v, showTimeUsed: x })} />
        <SaveBar onCancel={onClose} onSave={save} saving={updateMutation.isPending} />
      </div>
    );
  }
  if (sectionKey === "export") {
    return (
      <div className="space-y-3">
        <NumberField label="Default top N" value={v.defaultTopN ?? 100} min={1} max={10000} onChange={(x) => setV({ ...v, defaultTopN: x })} />
        <TextField label="Footer text" value={v.footerText ?? ""} onChange={(x) => setV({ ...v, footerText: x })} multiline />
        <ToggleRow label="Include logo" value={!!v.includeLogo} onChange={(x) => setV({ ...v, includeLogo: x })} />
        <ToggleRow label="Include links" value={!!v.includeLinks} onChange={(x) => setV({ ...v, includeLinks: x })} />
        <ToggleRow label="Include comments" value={!!v.includeComments} onChange={(x) => setV({ ...v, includeComments: x })} />
        <SaveBar onCancel={onClose} onSave={save} saving={updateMutation.isPending} />
      </div>
    );
  }
  if (sectionKey === "theme") {
    return (
      <div className="space-y-3">
        <TextField label="Accent color" value={v.accentColor ?? ""} onChange={(x) => setV({ ...v, accentColor: x })} placeholder="#7c3aed" />
        <TextField label="Gradient from" value={v.gradientFrom ?? ""} onChange={(x) => setV({ ...v, gradientFrom: x })} placeholder="#a855f7" />
        <TextField label="Gradient to" value={v.gradientTo ?? ""} onChange={(x) => setV({ ...v, gradientTo: x })} placeholder="#ec4899" />
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Dark mode</span>
          <select
            value={v.darkMode ?? "auto"}
            onChange={(e) => setV({ ...v, darkMode: e.target.value })}
            className="mt-1 h-11 w-full rounded-xl border border-input bg-background/60 px-3 text-sm"
          >
            <option value="auto">Auto</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <SaveBar onCancel={onClose} onSave={save} saving={updateMutation.isPending} />
      </div>
    );
  }
  if (sectionKey === "content") {
    return (
      <div className="space-y-3">
        <TextField label="Facebook page URL" value={v.facebookPageUrl ?? ""} onChange={(x) => setV({ ...v, facebookPageUrl: x })} />
        <TextField label="Facebook group URL" value={v.facebookGroupUrl ?? ""} onChange={(x) => setV({ ...v, facebookGroupUrl: x })} />
        <TextField label="YouTube channel URL" value={v.youtubeChannelUrl ?? ""} onChange={(x) => setV({ ...v, youtubeChannelUrl: x })} />
        <TextField label="WhatsApp contact" value={v.whatsappContact ?? ""} onChange={(x) => setV({ ...v, whatsappContact: x })} />
        <SaveBar onCancel={onClose} onSave={save} saving={updateMutation.isPending} />
      </div>
    );
  }
  return null;
}

function VisibilityEditor({
  settings, onSaved, onClose,
}: {
  settings: ExamBatchSettings;
  onSaved: (s: ExamBatchSettings) => void;
  onClose: () => void;
}) {
  const [visible, setVisible] = useState(settings.visibility.moduleVisible);
  const [reason, setReason] = useState(settings.visibility.hiddenReason ?? "");
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      adminSetExamBatchModuleVisibility({
        data: { visible, reason: visible ? null : (reason.trim() || null) },
      }),
    onSuccess: (data) => {
      onSaved(data);
      qc.invalidateQueries({ queryKey: ["exam-batch", "public-settings"] });
      toast.success(visible ? "Module is now visible" : "Module hidden from students");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 px-3 py-3">
        {visible ? <Eye className="h-5 w-5 text-emerald-500" /> : <EyeOff className="h-5 w-5 text-rose-500" />}
        <div className="flex-1">
          <p className="text-sm font-semibold">
            {visible ? "Module is visible to students" : "Module is hidden from students"}
          </p>
          <p className="text-xs text-muted-foreground">Toggle to change what learners can see.</p>
        </div>
        <button
          type="button"
          onClick={() => setVisible((x) => !x)}
          className={cn(
            "inline-flex h-6 w-11 items-center rounded-full px-0.5 transition",
            visible ? "bg-cta-gradient" : "bg-muted",
          )}
        >
          <span className={cn("h-5 w-5 rounded-full bg-white shadow transition", visible ? "translate-x-5" : "translate-x-0")} />
        </button>
      </div>
      {!visible && (
        <TextField
          label="Reason (shown to students)"
          value={reason}
          onChange={setReason}
          multiline
          placeholder="e.g. Maintenance in progress"
        />
      )}
      <SaveBar onCancel={onClose} onSave={() => mutation.mutate()} saving={mutation.isPending} />
    </div>
  );
}

function CommentRulesEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const rulesQuery = useQuery({
    queryKey: ["exam-batch", "admin", "comment-rules"],
    queryFn: () => adminListExamBatchCommentRules(),
  });
  const [rules, setRules] = useState<CommentRule[]>([]);
  useEffect(() => {
    if (rulesQuery.data) setRules(rulesQuery.data);
  }, [rulesQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      adminReplaceExamBatchCommentRules({
        data: {
          rules: rules.map((r, i) => ({
            minPercent: Number(r.minPercent) || 0,
            maxPercent: Number(r.maxPercent) || 0,
            label: r.label.trim(),
            message: r.message.trim(),
            sortOrder: i,
          })),
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["exam-batch"] });
      toast.success("Comment rules saved");
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (rulesQuery.isLoading) return <LoadingBlock label="Loading rules…" />;
  if (rulesQuery.isError) return <ErrorBlock error={rulesQuery.error} onRetry={() => rulesQuery.refetch()} />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Score bands show a personalized message on student results. Percent values are 0–100.
      </p>
      {rules.length === 0 ? (
        <EmptyState
          icon={Type}
          title="No comment rules yet"
          description="Add a rule to configure feedback for a score range."
        />
      ) : (
        <ul className="space-y-2">
          {rules.map((r, idx) => (
            <li key={idx} className="rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Min %"
                  value={r.minPercent}
                  min={0} max={100}
                  onChange={(x) => setRules((prev) => prev.map((p, i) => (i === idx ? { ...p, minPercent: x } : p)))}
                />
                <NumberField
                  label="Max %"
                  value={r.maxPercent}
                  min={0} max={100}
                  onChange={(x) => setRules((prev) => prev.map((p, i) => (i === idx ? { ...p, maxPercent: x } : p)))}
                />
              </div>
              <div className="mt-2 space-y-2">
                <TextField
                  label="Label"
                  value={r.label}
                  onChange={(x) => setRules((prev) => prev.map((p, i) => (i === idx ? { ...p, label: x } : p)))}
                  placeholder="e.g. Excellent"
                />
                <TextField
                  label="Message"
                  value={r.message}
                  onChange={(x) => setRules((prev) => prev.map((p, i) => (i === idx ? { ...p, message: x } : p)))}
                  multiline
                />
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className={ghostBtnCls}
                  onClick={() => setRules((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={ghostBtnCls}
        onClick={() =>
          setRules((prev) => [
            ...prev,
            { minPercent: 0, maxPercent: 100, label: "", message: "", sortOrder: prev.length },
          ])
        }
        disabled={rules.length >= 50}
      >
        <Plus className="h-4 w-4" /> Add rule
      </button>
      <SaveBar
        onCancel={onClose}
        onSave={() => saveMutation.mutate()}
        saving={saveMutation.isPending}
        disabled={rules.some((r) => !r.label.trim() || !r.message.trim() || r.maxPercent < r.minPercent)}
      />
    </div>
  );
}
