// @ts-nocheck
// Exam Batch — Export Engine.
//
// Generates Leaderboard exports (PDF + TXT) from the FROZEN leaderboard
// tables only. Never reads live attempts.
//
// Performance:
//   - Rows are paged in chunks of EXPORT_CHUNK entries so a 10k-student
//     leaderboard never lives in memory in one shot.
//   - PDF is drawn page-by-page with pdf-lib; TXT is assembled from chunk
//     buffers into a single Uint8Array before being base64-encoded.
//
// Security:
//   - assertPermission("manage_content") on every export path.
//   - Comments are generated server-side from `exam_batch_comment_rules`.
//   - Every export writes a row into `exam_batch_download_history` **before**
//     the artifact is returned, and emits an "export.generate" audit event.

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createServerFn } from "@tanstack/react-start";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { audit } from "./audit";
import { errors, mapSupabaseError } from "./errors";
import {
  CAABD_ABOUT,
  BRAND_ABOUT_BODY,
  BRAND_CARD_BORDER,
  BRAND_GOLD,
  BRAND_INK,
  BRAND_INK_SOFT,
  BRAND_SOFT_BG,
  LEADERBOARD_ROWS_PER_PAGE,
  MEDAL_COLORS,
  hexToRgbNormalized,
  resolvePdfTheme,
  type PdfThemePreset,
} from "./pdf-themes";
import {
  DEFAULT_EXAM_BATCH_SETTINGS,
  downloadHistoryInput,
  exportLeaderboardInput,
  logDemoDownloadInput,
  type CommentRule,
  type DownloadHistoryRow,
  type ExamBatchSettings,
  type ExportArtifact,
  type ExportLeaderboardInput,
} from "./settings.types";

const EXPORT_CHUNK = 500;
const LEADERBOARD_COLUMNS =
  "exam_id,attempt_id,user_id,student_id,rank,marks,max_marks,percentage,correct,wrong,skipped,time_used_seconds,submitted_at";

// ---------- Helpers ----------

async function readSettings(supabase: any): Promise<ExamBatchSettings> {
  const { data, error } = await supabase
    .from("exam_batch_settings")
    .select("value")
    .eq("id", "singleton")
    .maybeSingle();
  if (error) mapSupabaseError(error, "export:readSettings");
  const value = ((data as any)?.value ?? {}) as Record<string, any>;
  return {
    ...DEFAULT_EXAM_BATCH_SETTINGS,
    ...value,
    general: { ...DEFAULT_EXAM_BATCH_SETTINGS.general, ...(value.general ?? {}) },
    enrollment: { ...DEFAULT_EXAM_BATCH_SETTINGS.enrollment, ...(value.enrollment ?? {}) },
    approval: { ...DEFAULT_EXAM_BATCH_SETTINGS.approval, ...(value.approval ?? {}) },
    leaderboard: { ...DEFAULT_EXAM_BATCH_SETTINGS.leaderboard, ...(value.leaderboard ?? {}) },
    countdown: { ...DEFAULT_EXAM_BATCH_SETTINGS.countdown, ...(value.countdown ?? {}) },
    export: { ...DEFAULT_EXAM_BATCH_SETTINGS.export, ...(value.export ?? {}) },
    theme: { ...DEFAULT_EXAM_BATCH_SETTINGS.theme, ...(value.theme ?? {}) },
    visibility: { ...DEFAULT_EXAM_BATCH_SETTINGS.visibility, ...(value.visibility ?? {}) },
    content: { ...DEFAULT_EXAM_BATCH_SETTINGS.content, ...(value.content ?? {}) },
    updatedAt: null,
    updatedBy: null,
  };
}

async function readCommentRules(supabase: any): Promise<CommentRule[]> {
  const { data, error } = await supabase
    .from("exam_batch_comment_rules")
    .select("id,min_percent,max_percent,label,message,sort_order")
    .order("sort_order", { ascending: true })
    .order("min_percent", { ascending: true });
  if (error) mapSupabaseError(error, "export:readCommentRules");
  return (data ?? []).map((r: any) => ({
    id: r.id,
    minPercent: Number(r.min_percent),
    maxPercent: Number(r.max_percent),
    label: r.label,
    message: r.message,
    sortOrder: r.sort_order ?? 0,
  }));
}

function commentFor(rules: CommentRule[], percent: number): string {
  for (const r of rules) {
    if (percent >= r.minPercent && percent <= r.maxPercent) {
      return `${r.label} — ${r.message}`;
    }
  }
  return "";
}

async function assertFrozenLeaderboard(
  supabase: any,
  examId: string,
): Promise<{ status: string; frozen_at: string | null }> {
  const { data, error } = await supabase
    .from("exam_batch_leaderboards")
    .select("status,frozen_at")
    .eq("exam_id", examId)
    .maybeSingle();
  if (error) mapSupabaseError(error, "export:assertFrozen");
  if (!data) throw errors.notFound("Leaderboard");
  if ((data as any).status !== "frozen") {
    throw errors.invalidState("Leaderboard is not frozen yet — exports are unavailable.");
  }
  return data as { status: string; frozen_at: string | null };
}

type EntryRow = {
  student_id: number | null;
  rank: number;
  marks: number;
  max_marks: number;
  percentage: number;
  correct: number;
  wrong: number;
  skipped: number;
  time_used_seconds: number | null;
  submitted_at: string | null;
  user_id: string;
  display_name?: string | null;
};

async function* iterateLeaderboardEntries(
  supabase: any,
  input: ExportLeaderboardInput,
): AsyncGenerator<EntryRow[]> {
  const cap =
    input.scope === "top_n"
      ? Math.max(1, input.topN)
      : Number.POSITIVE_INFINITY;
  let offset = 0;
  let remaining = cap;
  while (remaining > 0) {
    const size = Math.min(EXPORT_CHUNK, remaining === Number.POSITIVE_INFINITY ? EXPORT_CHUNK : remaining);
    let q = supabase
      .from("exam_batch_leaderboard_entries")
      .select(LEADERBOARD_COLUMNS)
      .eq("exam_id", input.examId)
      .order("rank", { ascending: true })
      .range(offset, offset + size - 1);
    if (input.subjectId) q = q.eq("subject_id", input.subjectId);
    if (input.sessionId) q = q.eq("session_id", input.sessionId);
    const { data, error } = await q;
    if (error) mapSupabaseError(error, "export:pageEntries");
    const rows = (data ?? []) as EntryRow[];
    if (rows.length === 0) break;

    // Best-effort join to profile display names for the current page only.
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    if (userIds.length > 0) {
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id,display_name")
        .in("id", userIds);
      if (profErr) console.warn("[exam-batch:export] profile join failed", profErr);
      const nameMap = new Map<string, string>();
      for (const p of (profiles ?? []) as any[]) {
        nameMap.set(p.id, p.display_name ?? "");
      }
      for (const r of rows) r.display_name = nameMap.get(r.user_id) ?? null;
    }

    yield rows;
    offset += rows.length;
    if (remaining !== Number.POSITIVE_INFINITY) remaining -= rows.length;
    if (rows.length < size) break;
  }
}

function fmtTime(sec: number | null): string {
  if (sec == null || !Number.isFinite(sec)) return "--";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

// ---------- TXT ----------
async function buildTxt(
  supabase: any,
  input: ExportLeaderboardInput,
  settings: ExamBatchSettings,
  rules: CommentRule[],
  includeComments: boolean,
): Promise<{ bytes: Uint8Array; rowCount: number }> {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const push = (s: string) => chunks.push(enc.encode(s));

  const org = settings.general.organizationName ?? "Exam Batch";
  push(`${org} — Leaderboard\n`);
  if (settings.general.websiteUrl) push(`Website: ${settings.general.websiteUrl}\n`);
  if (settings.content.facebookPageUrl) push(`Facebook: ${settings.content.facebookPageUrl}\n`);
  if (settings.content.facebookGroupUrl) push(`FB Group: ${settings.content.facebookGroupUrl}\n`);
  if (settings.content.youtubeChannelUrl) push(`YouTube: ${settings.content.youtubeChannelUrl}\n`);
  if (settings.content.whatsappContact) push(`WhatsApp: ${settings.content.whatsappContact}\n`);
  push(`Generated: ${new Date().toISOString()}\n`);
  push(`Scope: ${input.scope === "top_n" ? `Top ${input.topN}` : "Full"}\n`);
  push("\n");
  const cols = ["Rank", "Student ID", "Name", "Marks", "%", "Correct", "Wrong", "Skipped", "Time"];
  if (includeComments) cols.push("Comment");
  push(cols.join("\t") + "\n");
  push("-".repeat(80) + "\n");

  let rowCount = 0;
  for await (const page of iterateLeaderboardEntries(supabase, input)) {
    for (const r of page) {
      const line = [
        r.rank,
        r.student_id ?? "",
        (r.display_name ?? "").replace(/[\t\r\n]/g, " "),
        `${r.marks}/${r.max_marks}`,
        `${r.percentage.toFixed(2)}%`,
        r.correct,
        r.wrong,
        r.skipped,
        fmtTime(r.time_used_seconds),
      ];
      if (includeComments) line.push(commentFor(rules, r.percentage));
      push(line.join("\t") + "\n");
      rowCount += 1;
    }
  }

  if (settings.export.footerText) {
    push("\n");
    push(`${settings.export.footerText}\n`);
  }

  const total = chunks.reduce((n, b) => n + b.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return { bytes: out, rowCount };
}

// ---------- PDF context loader ----------
type ExportContext = {
  sessionTitle: string | null;
  sessionLevel: string | null;
  subjectName: string | null;
  chapterName: string | null;
  examTitle: string | null;
  generatedByName: string | null;
};

async function loadExportContext(
  supabase: any,
  input: ExportLeaderboardInput,
  userId: string,
): Promise<ExportContext> {
  const ctx: ExportContext = {
    sessionTitle: null,
    sessionLevel: null,
    subjectName: null,
    chapterName: null,
    examTitle: null,
    generatedByName: null,
  };

  // Exam → gives us title + resolves session/subject/chapter when the
  // caller didn't pass them explicitly.
  try {
    const { data: exam } = await supabase
      .from("exam_batch_exams")
      .select("title,session_id,subject_id,chapter_id")
      .eq("id", input.examId)
      .maybeSingle();
    if (exam) {
      ctx.examTitle = (exam as any).title ?? null;
      const sid = input.sessionId ?? (exam as any).session_id ?? null;
      const subjId = input.subjectId ?? (exam as any).subject_id ?? null;
      const chId = (exam as any).chapter_id ?? null;

      const [sess, subj, ch] = await Promise.all([
        sid
          ? supabase
              .from("exam_batch_sessions")
              .select("title,subtitle,level")
              .eq("id", sid)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        subjId
          ? supabase
              .from("exam_batch_subjects")
              .select("name")
              .eq("id", subjId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        chId
          ? supabase
              .from("exam_batch_chapters")
              .select("name")
              .eq("id", chId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const sessData = (sess as any).data;
      if (sessData) {
        ctx.sessionTitle = sessData.title ?? null;
        ctx.sessionLevel = sessData.level ?? sessData.subtitle ?? null;
      }
      const subjData = (subj as any).data;
      if (subjData) ctx.subjectName = subjData.name ?? null;
      const chData = (ch as any).data;
      if (chData) ctx.chapterName = chData.name ?? null;
    }
  } catch (e) {
    // Table shape can differ (chapter is optional); never fail the whole
    // export because a metadata lookup failed.
    console.warn("[exam-batch:export] loadExportContext partial failure", e);
  }

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    if (profile) {
      ctx.generatedByName = (profile as any).display_name ?? null;
    }
  } catch {
    /* ignore */
  }

  return ctx;
}

function themeColors(theme: PdfThemePreset) {
  const [pr, pg, pb] = hexToRgbNormalized(theme.primary);
  const [gr, gg, gb] = hexToRgbNormalized(BRAND_GOLD);
  const [sr, sg, sb] = hexToRgbNormalized(BRAND_SOFT_BG);
  const [br, bg, bb] = hexToRgbNormalized(BRAND_INK);
  const [nr, ng, nb] = hexToRgbNormalized(BRAND_INK_SOFT);
  const [hr, hg, hb] = hexToRgbNormalized(BRAND_CARD_BORDER);
  return {
    primary: rgb(pr, pg, pb),
    gold: rgb(gr, gg, gb),
    soft: rgb(sr, sg, sb),
    onPrimary: rgb(1, 1, 1),
    body: rgb(br, bg, bb),
    subtle: rgb(nr, ng, nb),
    hairline: rgb(hr, hg, hb),
    white: rgb(1, 1, 1),
  };
}

function medalColor(rank: 1 | 2 | 3) {
  const [r, g, b] = hexToRgbNormalized(MEDAL_COLORS[rank]);
  return rgb(r, g, b);
}

async function tryEmbedLogo(pdf: PDFDocument, url: string | null | undefined) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (ct.includes("png")) return await pdf.embedPng(buf);
    if (ct.includes("jpeg") || ct.includes("jpg")) return await pdf.embedJpg(buf);
    // last-ditch: try png then jpg based on magic bytes
    if (buf[0] === 0x89 && buf[1] === 0x50) return await pdf.embedPng(buf);
    if (buf[0] === 0xff && buf[1] === 0xd8) return await pdf.embedJpg(buf);
    return null;
  } catch {
    return null;
  }
}

// ---------- PDF (premium layout, 15 rows / page, matches demo generator) ----------
//
// Coordinates are authored top-down (pt); pdf-lib uses bottom-left origin,
// so every draw call flips through Y = PAGE_H - topY at the call site.

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 36;
const HEADER_H = 104;
const CARDS_TOP = 122;
const CARDS_H = 66;
const TABLE_TOP = 204;
const HEAD_H = 26;
const ROW_H = 22;
const TABLE_BOTTOM = TABLE_TOP + HEAD_H + LEADERBOARD_ROWS_PER_PAGE * ROW_H;
const ABOUT_TOP = TABLE_BOTTOM + 22;
const BOTTOM_BAR_Y = PAGE_H - 26;

type PdfCol = {
  key: "rank" | "id" | "name" | "marks" | "pct" | "time" | "comment";
  label: string;
  w: number;
  align: "left" | "right" | "center";
};

async function buildPdf(
  supabase: any,
  input: ExportLeaderboardInput,
  settings: ExamBatchSettings,
  rules: CommentRule[],
  includeComments: boolean,
  ctx: ExportContext,
): Promise<{ bytes: Uint8Array; rowCount: number }> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const theme = resolvePdfTheme(input.themeColor);
  const c = themeColors(theme);
  const logo = await tryEmbedLogo(pdf, settings.general.logoUrl);

  const availW = PAGE_W - MARGIN_X * 2;
  const cols: PdfCol[] = includeComments
    ? [
        { key: "rank", label: "Rank", w: 50, align: "center" },
        { key: "id", label: "Student ID", w: 75, align: "left" },
        { key: "name", label: "Student Name", w: 140, align: "left" },
        { key: "marks", label: "Marks", w: 55, align: "right" },
        { key: "time", label: "Finish Time", w: 70, align: "center" },
        { key: "comment", label: "Comment", w: availW - (50 + 75 + 140 + 55 + 70), align: "left" },
      ]
    : [
        { key: "rank", label: "Rank", w: 46, align: "center" },
        { key: "id", label: "Student ID", w: 92, align: "left" },
        { key: "name", label: "Student Name", w: 165, align: "left" },
        { key: "marks", label: "Marks", w: 60, align: "center" },
        { key: "pct", label: "Percentage", w: 65, align: "center" },
        { key: "time", label: "Finish Time", w: availW - (46 + 92 + 165 + 60 + 65), align: "center" },
      ];

  const colXs: number[] = [];
  {
    let x = MARGIN_X;
    for (const col of cols) {
      colXs.push(x);
      x += col.w;
    }
  }

  // Wrap a paragraph to fit `maxW` at font size `size`. Returns each visual line.
  const wrap = (text: string, size: number, maxW: number, f = font): string[] => {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const cand = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(cand, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = cand;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const truncate = (v: string, size: number, maxW: number, f = font): string => {
    if (f.widthOfTextAtSize(v, size) <= maxW) return v;
    let s = v;
    while (s.length > 1 && f.widthOfTextAtSize(s + "…", size) > maxW) s = s.slice(0, -1);
    return s + "…";
  };

  type Page = import("pdf-lib").PDFPage;

  const drawPage = (
    page: Page,
    pageRows: EntryRow[],
    pageNo: number,
    totalPages: number,
    participants: number,
  ) => {
    const availW = PAGE_W - MARGIN_X * 2;
    // Top-down Y helper for readability.
    const y = (top: number) => PAGE_H - top;

    // ---------- Header band ----------
    page.drawRectangle({
      x: 0,
      y: y(HEADER_H),
      width: PAGE_W,
      height: HEADER_H,
      color: c.primary,
    });
    // Thin gold accent along the header bottom edge.
    page.drawRectangle({
      x: 0,
      y: y(HEADER_H),
      width: PAGE_W,
      height: 3,
      color: c.gold,
    });

    // Logo tile — white rounded square with subtle gold border.
    const tileX = MARGIN_X;
    const tileY = y(82); // top = 22
    page.drawRectangle({
      x: tileX,
      y: tileY,
      width: 60,
      height: 60,
      color: c.white,
      borderColor: c.gold,
      borderWidth: 1,
    });
    if (logo) {
      const maxD = 46;
      const scale = Math.min(maxD / logo.width, maxD / logo.height);
      const lw = logo.width * scale;
      const lh = logo.height * scale;
      page.drawImage(logo, {
        x: tileX + 30 - lw / 2,
        y: tileY + 30 - lh / 2,
        width: lw,
        height: lh,
      });
    } else {
      const initials = "CA";
      const tw = bold.widthOfTextAtSize(initials, 22);
      page.drawText(initials, {
        x: tileX + 30 - tw / 2,
        y: tileY + 20,
        size: 22,
        font: bold,
        color: c.primary,
      });
    }

    // Title stack
    page.drawText("CA Aspire BD", {
      x: MARGIN_X + 76,
      y: y(46),
      size: 19,
      font: bold,
      color: c.onPrimary,
    });
    page.drawText("Exam Batch Leaderboard", {
      x: MARGIN_X + 76,
      y: y(62),
      size: 11,
      font,
      color: c.onPrimary,
    });
    page.drawText(CAABD_ABOUT.website, {
      x: MARGIN_X + 76,
      y: y(78),
      size: 8.5,
      font,
      color: c.gold,
    });

    // Right-side generated card
    const badgeW = 168;
    const badgeH = 56;
    const badgeX = PAGE_W - MARGIN_X - badgeW;
    const badgeY = y(24 + badgeH); // top = 24
    page.drawRectangle({
      x: badgeX,
      y: badgeY,
      width: badgeW,
      height: badgeH,
      color: c.white,
    });
    // Left gold stripe on the badge
    page.drawRectangle({
      x: badgeX,
      y: badgeY,
      width: 3,
      height: badgeH,
      color: c.gold,
    });
    page.drawText("GENERATED", {
      x: badgeX + 14,
      y: y(40),
      size: 7.5,
      font: bold,
      color: c.subtle,
    });
    const generatedAt = new Date()
      .toLocaleString("en-GB", { hour12: false })
      .slice(0, 20);
    page.drawText(generatedAt, {
      x: badgeX + 14,
      y: y(56),
      size: 10,
      font: bold,
      color: c.body,
    });
    page.drawText("OFFICIAL EXPORT", {
      x: badgeX + 14,
      y: y(70),
      size: 8,
      font: bold,
      color: c.primary,
    });

    // ---------- Summary cards ----------
    const cardItems: Array<[string, string]> = [
      ["SESSION", ctx.sessionTitle ?? "—"],
      ["SUBJECT", ctx.subjectName ?? "—"],
      ["EXAM", ctx.examTitle ?? "—"],
      ["TOTAL STUDENTS", String(participants)],
      ["PAGE", `${pageNo} of ${totalPages}`],
    ];
    const gap = 8;
    const cardW = (availW - gap * (cardItems.length - 1)) / cardItems.length;
    cardItems.forEach(([label, value], i) => {
      const cx = MARGIN_X + i * (cardW + gap);
      page.drawRectangle({
        x: cx,
        y: y(CARDS_TOP + CARDS_H),
        width: cardW,
        height: CARDS_H,
        color: c.soft,
        borderColor: c.hairline,
        borderWidth: 0.5,
      });
      // Gold accent dot
      page.drawCircle({
        x: cx + 10,
        y: y(CARDS_TOP + 12),
        size: 2.2,
        color: c.gold,
      });
      page.drawText(label, {
        x: cx + 18,
        y: y(CARDS_TOP + 15),
        size: 7,
        font: bold,
        color: c.subtle,
      });
      const drawnVal = truncate(value, 11, cardW - 20, bold);
      page.drawText(drawnVal, {
        x: cx + 10,
        y: y(CARDS_TOP + 38),
        size: 11,
        font: bold,
        color: c.body,
      });
      page.drawLine({
        start: { x: cx + 10, y: y(CARDS_TOP + 46) },
        end: { x: cx + cardW - 10, y: y(CARDS_TOP + 46) },
        thickness: 0.4,
        color: c.hairline,
      });
    });

    // ---------- Table header ----------
    page.drawRectangle({
      x: MARGIN_X,
      y: y(TABLE_TOP + HEAD_H),
      width: availW,
      height: HEAD_H,
      color: c.primary,
    });
    page.drawRectangle({
      x: MARGIN_X,
      y: y(TABLE_TOP + HEAD_H),
      width: availW,
      height: 2,
      color: c.gold,
    });
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const label = col.label.toUpperCase();
      const tw = bold.widthOfTextAtSize(label, 9);
      let tx: number;
      if (col.align === "right") tx = colXs[i] + col.w - tw - 10;
      else if (col.align === "center") tx = colXs[i] + col.w / 2 - tw / 2;
      else tx = colXs[i] + 10;
      page.drawText(label, {
        x: tx,
        y: y(TABLE_TOP + 17),
        size: 9,
        font: bold,
        color: c.onPrimary,
      });
    }

    // ---------- Rows ----------
    for (let i = 0; i < pageRows.length; i++) {
      const r = pageRows[i];
      const rowY = TABLE_TOP + HEAD_H + i * ROW_H;
      if (i % 2 === 1) {
        page.drawRectangle({
          x: MARGIN_X,
          y: y(rowY + ROW_H),
          width: availW,
          height: ROW_H,
          color: c.soft,
        });
      }

      const values: Record<string, string> = {
        rank: String(r.rank),
        id: r.student_id != null ? String(r.student_id) : "—",
        name: r.display_name ?? "—",
        marks: `${r.marks}/${r.max_marks}`,
        pct: `${r.percentage.toFixed(1)}%`,
        time: fmtTime(r.time_used_seconds),
        comment: includeComments ? commentFor(rules, r.percentage) : "",
      };

      // Medal for top 3
      if (r.rank >= 1 && r.rank <= 3) {
        const rankColW = cols[0].w;
        const cxM = MARGIN_X + rankColW / 2;
        const cyM = y(rowY + ROW_H / 2);
        page.drawCircle({ x: cxM, y: cyM, size: 8, color: medalColor(r.rank as 1 | 2 | 3) });
        page.drawCircle({
          x: cxM,
          y: cyM,
          size: 8,
          borderColor: c.white,
          borderWidth: 0.6,
        });
      }

      for (let ci = 0; ci < cols.length; ci++) {
        const col = cols[ci];
        const val = values[col.key] ?? "";
        if (col.key === "rank" && r.rank <= 3) {
          // Draw the rank number white on top of the medal.
          const drawn = String(r.rank);
          const tw = bold.widthOfTextAtSize(drawn, 9);
          page.drawText(drawn, {
            x: colXs[ci] + col.w / 2 - tw / 2,
            y: y(rowY + ROW_H / 2 + 3),
            size: 9,
            font: bold,
            color: rgb(0.12, 0.1, 0.04),
          });
          continue;
        }
        const isRank = col.key === "rank";
        const isEmphasis = col.key === "marks" || col.key === "pct";
        const useBold = isRank || isEmphasis;
        const f = useBold ? bold : font;
        const size = 9.5;
        const drawn = truncate(val, size, col.w - 14, f);
        const tw = f.widthOfTextAtSize(drawn, size);
        let tx: number;
        if (col.align === "right") tx = colXs[ci] + col.w - tw - 10;
        else if (col.align === "center") tx = colXs[ci] + col.w / 2 - tw / 2;
        else tx = colXs[ci] + 10;
        const textColor = isEmphasis ? c.primary : c.body;
        page.drawText(drawn, {
          x: tx,
          y: y(rowY + 15),
          size,
          font: f,
          color: textColor,
        });
      }

      // Row hairline
      page.drawLine({
        start: { x: MARGIN_X, y: y(rowY + ROW_H) },
        end: { x: MARGIN_X + availW, y: y(rowY + ROW_H) },
        thickness: 0.3,
        color: c.hairline,
      });
    }

    // Table outer border
    page.drawRectangle({
      x: MARGIN_X,
      y: y(TABLE_BOTTOM),
      width: availW,
      height: HEAD_H + LEADERBOARD_ROWS_PER_PAGE * ROW_H,
      borderColor: c.hairline,
      borderWidth: 0.6,
    });

    // ---------- About / footer ----------
    page.drawLine({
      start: { x: MARGIN_X, y: y(ABOUT_TOP) },
      end: { x: MARGIN_X + 60, y: y(ABOUT_TOP) },
      thickness: 0.8,
      color: c.gold,
    });
    page.drawText("About CA Aspire BD", {
      x: MARGIN_X,
      y: y(ABOUT_TOP + 14),
      size: 10,
      font: bold,
      color: c.primary,
    });
    const bodyLines = wrap(BRAND_ABOUT_BODY, 8.5, availW);
    bodyLines.forEach((line, li) => {
      page.drawText(line, {
        x: MARGIN_X,
        y: y(ABOUT_TOP + 28 + li * 11),
        size: 8.5,
        font,
        color: c.subtle,
      });
    });

    // Bottom bar
    page.drawLine({
      start: { x: MARGIN_X, y: y(BOTTOM_BAR_Y - 14) },
      end: { x: PAGE_W - MARGIN_X, y: y(BOTTOM_BAR_Y - 14) },
      thickness: 0.5,
      color: c.hairline,
    });
    page.drawText(`https://${CAABD_ABOUT.website}`, {
      x: MARGIN_X,
      y: y(BOTTOM_BAR_Y - 2),
      size: 8,
      font: bold,
      color: c.primary,
    });
    const cr = CAABD_ABOUT.copyright;
    const crW = font.widthOfTextAtSize(cr, 7.5);
    page.drawText(cr, {
      x: PAGE_W / 2 - crW / 2,
      y: y(BOTTOM_BAR_Y - 2),
      size: 7.5,
      font,
      color: c.subtle,
    });
    const pillLabel = `Page ${pageNo} of ${totalPages}`;
    const pillW2 = bold.widthOfTextAtSize(pillLabel, 8) + 18;
    const pillH2 = 14;
    page.drawRectangle({
      x: PAGE_W - MARGIN_X - pillW2,
      y: y(BOTTOM_BAR_Y - 12 + pillH2),
      width: pillW2,
      height: pillH2,
      color: c.primary,
    });
    const pillTw = bold.widthOfTextAtSize(pillLabel, 8);
    page.drawText(pillLabel, {
      x: PAGE_W - MARGIN_X - pillW2 / 2 - pillTw / 2,
      y: y(BOTTOM_BAR_Y - 3),
      size: 8,
      font: bold,
      color: c.onPrimary,
    });
  };

  // ---------- Collect rows in a streaming buffer, then paginate ----------
  // We buffer 15 rows at a time (one page) so we never materialize the whole
  // leaderboard. Total page count is computed lazily by tracking chunks.
  const pageBuffer: EntryRow[] = [];
  const pageBuffers: EntryRow[][] = [];
  let rowCount = 0;
  for await (const chunk of iterateLeaderboardEntries(supabase, input)) {
    for (const r of chunk) {
      pageBuffer.push(r);
      rowCount += 1;
      if (pageBuffer.length === LEADERBOARD_ROWS_PER_PAGE) {
        pageBuffers.push(pageBuffer.splice(0, pageBuffer.length));
      }
    }
  }
  if (pageBuffer.length > 0 || pageBuffers.length === 0) {
    pageBuffers.push(pageBuffer.splice(0, pageBuffer.length));
  }

  const totalPages = pageBuffers.length;
  for (let p = 0; p < totalPages; p++) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    drawPage(page, pageBuffers[p], p + 1, totalPages, rowCount);
  }

  const bytes = await pdf.save();
  return { bytes, rowCount };
}

// ---------- Bytes → base64 (chunked, Worker-safe) ----------
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  // btoa is available in the Cloudflare Workers runtime.
  // eslint-disable-next-line no-undef
  return btoa(binary);
}

// ============================================================================
// Server functions
// ============================================================================

export const adminExportExamBatchLeaderboard = createServerFn({ method: "POST" })
  .validator((i: unknown) => exportLeaderboardInput.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<ExportArtifact> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      `exam_batch.export.${data.format}`,
    );
    await assertFrozenLeaderboard(context.supabase, data.examId);

    const [settings, rules, ctx] = await Promise.all([
      readSettings(context.supabase),
      readCommentRules(context.supabase),
      loadExportContext(context.supabase, data, context.userId),
    ]);
    const includeComments =
      (data.includeComments ?? settings.export.includeComments ?? true) && rules.length > 0;

    const built =
      data.format === "pdf"
        ? await buildPdf(context.supabase, data, settings, rules, includeComments, ctx)
        : await buildTxt(context.supabase, data, settings, rules, includeComments);

    const filename = `exam-batch-leaderboard-${data.examId}.${data.format}`;
    const mimeType = data.format === "pdf" ? "application/pdf" : "text/plain; charset=utf-8";

    // Download history — best-effort but written before returning the artifact
    // so the audit trail is authoritative even if the client aborts.
    const { error: histErr } = await context.supabase.from("exam_batch_download_history").insert({
      actor_id: context.userId,
      export_type: "leaderboard",
      format: data.format,
      exam_id: data.examId,
      session_id: data.sessionId ?? null,
      subject_id: data.subjectId ?? null,
      filters: {
        scope: data.scope,
        topN: data.topN,
        includeComments,
      },
      row_count: built.rowCount,
      byte_length: built.bytes.byteLength,
    });
    if (histErr && histErr.code !== "42P01") {
      // Non-fatal, but surface in server logs — never block the caller.
      console.error("[exam-batch:export] download_history insert failed", histErr);
    }

    await audit(
      context.supabase,
      context.userId,
      "export.generate",
      "export",
      data.examId,
      {
        format: data.format,
        scope: data.scope,
        topN: data.topN,
        rowCount: built.rowCount,
        byteLength: built.bytes.byteLength,
      },
    );

    return {
      filename,
      mimeType,
      contentBase64: toBase64(built.bytes),
      byteLength: built.bytes.byteLength,
      rowCount: built.rowCount,
    };
  });

export const adminListExamBatchDownloadHistory = createServerFn({ method: "POST" })
  .validator((i: unknown) => downloadHistoryInput.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ data, context }): Promise<{ rows: DownloadHistoryRow[]; total: number }> => {
      await assertPermission(
        context.supabase,
        context.userId,
        "manage_content",
        "exam_batch.export.history",
      );
      let q = context.supabase
        .from("exam_batch_download_history")
        .select(
          "id,actor_id,export_type,format,exam_id,session_id,subject_id,filters,row_count,byte_length,created_at",
          { count: "exact" },
        )
        .order("created_at", { ascending: false })
        .range(data.offset, data.offset + data.limit - 1);
      if (data.actorId) q = q.eq("actor_id", data.actorId);
      if (data.examId) q = q.eq("exam_id", data.examId);
      const { data: rows, count, error } = await q;
      if (error) mapSupabaseError(error, "adminListExamBatchDownloadHistory");
      return {
        rows: (rows ?? []) as DownloadHistoryRow[],
        total: count ?? rows?.length ?? 0,
      };
    },
  );

// Records a demo (client-generated) PDF into the download history so admins
// have a full audit trail even for design-preview downloads.
export const adminLogExamBatchDemoDownload = createServerFn({ method: "POST" })
  .validator((i: unknown) => logDemoDownloadInput.parse(i))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_content",
      "exam_batch.export.pdf",
    );
    const { error } = await context.supabase.from("exam_batch_download_history").insert({
      actor_id: context.userId,
      export_type: "leaderboard_demo",
      format: "pdf",
      exam_id: data.examId ?? null,
      session_id: data.sessionId ?? null,
      subject_id: data.subjectId ?? null,
      filters: {
        demo: true,
        themeColor: data.themeColor ?? null,
      },
      row_count: data.rowCount,
      byte_length: data.byteLength,
    });
    if (error && error.code !== "42P01") {
      mapSupabaseError(error, "adminLogExamBatchDemoDownload");
    }
    await audit(
      context.supabase,
      context.userId,
      "export.generate",
      "export",
      "demo",
      {
        format: "pdf",
        demo: true,
        themeColor: data.themeColor ?? null,
        rowCount: data.rowCount,
        byteLength: data.byteLength,
      },
    );
    return { ok: true };
  });