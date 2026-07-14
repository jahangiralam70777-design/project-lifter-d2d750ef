// Client-side demo leaderboard PDF generator (jsPDF).
//
// Redesigned premium layout — royal-blue primary, white body, light-gray
// summary band, subtle gold accents. Renders exactly 15 rows per page and
// auto-paginates for 5,000+ rows. Mirrors the server-side pdf-lib export
// pixel-for-pixel so Preview == Download.

import { jsPDF } from "jspdf";
import {
  BRAND_ABOUT_BODY,
  BRAND_CARD_BORDER,
  BRAND_GOLD,
  BRAND_INK,
  BRAND_INK_SOFT,
  BRAND_SOFT_BG,
  CAABD_ABOUT,
  LEADERBOARD_ROWS_PER_PAGE,
  MEDAL_COLORS,
  hexToRgbTuple,
  resolvePdfTheme,
  type PdfThemePreset,
} from "./pdf-themes";

export interface DemoLeaderboardBrand {
  siteName?: string | null;
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  youtubeUrl?: string | null;
  whatsappContact?: string | null;
}

export interface DemoLeaderboardMeta {
  sessionTitle: string;
  subjectName: string;
  examTitle: string;
  themeColor: string; // #RRGGBB
  brand?: DemoLeaderboardBrand;
}

export interface DemoLeaderboardRow {
  rank: number;
  studentId: number | string;
  name: string;
  marks: number;
  finishTime: string;
  percentage?: number; // 0..100
}

export const DEMO_LEADERBOARD_ROWS: DemoLeaderboardRow[] = [
  { rank: 1, studentId: "CAB-1042", name: "Tanvir Ahmed", marks: 98, percentage: 98, finishTime: "38m 22s" },
  { rank: 2, studentId: "CAB-1088", name: "Nusrat Jahan", marks: 96, percentage: 96, finishTime: "41m 05s" },
  { rank: 3, studentId: "CAB-1113", name: "Rakib Hasan", marks: 94, percentage: 94, finishTime: "39m 47s" },
  { rank: 4, studentId: "CAB-1201", name: "Sadia Rahman", marks: 92, percentage: 92, finishTime: "42m 18s" },
  { rank: 5, studentId: "CAB-1256", name: "Mahdi Karim", marks: 90, percentage: 90, finishTime: "40m 55s" },
  { rank: 6, studentId: "CAB-1278", name: "Farhana Akter", marks: 88, percentage: 88, finishTime: "43m 30s" },
  { rank: 7, studentId: "CAB-1303", name: "Imran Chowdhury", marks: 86, percentage: 86, finishTime: "44m 12s" },
  { rank: 8, studentId: "CAB-1345", name: "Sabrina Islam", marks: 85, percentage: 85, finishTime: "42m 59s" },
  { rank: 9, studentId: "CAB-1389", name: "Rifat Hossain", marks: 83, percentage: 83, finishTime: "45m 04s" },
  { rank: 10, studentId: "CAB-1412", name: "Anika Sultana", marks: 81, percentage: 81, finishTime: "46m 21s" },
  { rank: 11, studentId: "CAB-1433", name: "Mehedi Hasan", marks: 80, percentage: 80, finishTime: "44m 38s" },
  { rank: 12, studentId: "CAB-1456", name: "Sumaiya Kabir", marks: 79, percentage: 79, finishTime: "45m 22s" },
  { rank: 13, studentId: "CAB-1478", name: "Ayaan Rahman", marks: 78, percentage: 78, finishTime: "46m 04s" },
  { rank: 14, studentId: "CAB-1502", name: "Nabila Haque", marks: 77, percentage: 77, finishTime: "46m 55s" },
  { rank: 15, studentId: "CAB-1521", name: "Zubair Ahmed", marks: 76, percentage: 76, finishTime: "47m 18s" },
  { rank: 16, studentId: "CAB-1544", name: "Meherun Nesa", marks: 75, percentage: 75, finishTime: "47m 40s" },
  { rank: 17, studentId: "CAB-1567", name: "Arif Chowdhury", marks: 74, percentage: 74, finishTime: "48m 06s" },
  { rank: 18, studentId: "CAB-1589", name: "Tamanna Islam", marks: 73, percentage: 73, finishTime: "48m 33s" },
  { rank: 19, studentId: "CAB-1601", name: "Sharif Uddin", marks: 72, percentage: 72, finishTime: "48m 55s" },
  { rank: 20, studentId: "CAB-1622", name: "Rifat Karim", marks: 71, percentage: 71, finishTime: "49m 20s" },
  { rank: 21, studentId: "CAB-1644", name: "Sadia Sultana", marks: 70, percentage: 70, finishTime: "49m 48s" },
  { rank: 22, studentId: "CAB-1667", name: "Nayeem Hasan", marks: 69, percentage: 69, finishTime: "50m 12s" },
  { rank: 23, studentId: "CAB-1689", name: "Fahmida Akter", marks: 68, percentage: 68, finishTime: "50m 40s" },
  { rank: 24, studentId: "CAB-1701", name: "Rashed Khan", marks: 67, percentage: 67, finishTime: "51m 05s" },
  { rank: 25, studentId: "CAB-1723", name: "Nowshin Anjum", marks: 66, percentage: 66, finishTime: "51m 34s" },
  { rank: 26, studentId: "CAB-1748", name: "Sabbir Ahmed", marks: 65, percentage: 65, finishTime: "52m 00s" },
  { rank: 27, studentId: "CAB-1769", name: "Tasnim Rahman", marks: 64, percentage: 64, finishTime: "52m 28s" },
  { rank: 28, studentId: "CAB-1782", name: "Rakibul Islam", marks: 63, percentage: 63, finishTime: "52m 55s" },
  { rank: 29, studentId: "CAB-1804", name: "Marufa Karim", marks: 62, percentage: 62, finishTime: "53m 20s" },
  { rank: 30, studentId: "CAB-1826", name: "Shakil Hossain", marks: 61, percentage: 61, finishTime: "53m 48s" },
];

// ---------- Layout constants (pt, top-down) ----------
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

// Table columns — six columns matching the spec.
const COLS: Array<{
  key: "rank" | "id" | "name" | "marks" | "pct" | "time";
  label: string;
  w: number;
  align: "left" | "right" | "center";
}> = [
  { key: "rank", label: "Rank", w: 46, align: "center" },
  { key: "id", label: "Student ID", w: 92, align: "left" },
  { key: "name", label: "Student Name", w: 165, align: "left" },
  { key: "marks", label: "Marks", w: 60, align: "center" },
  { key: "pct", label: "Percentage", w: 65, align: "center" },
  { key: "time", label: "Finish Time", w: 95.28, align: "center" },
];

function setFill(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgbTuple(hex);
  doc.setFillColor(r, g, b);
}
function setDraw(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgbTuple(hex);
  doc.setDrawColor(r, g, b);
}
function setText(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgbTuple(hex);
  doc.setTextColor(r, g, b);
}

function drawPage(
  doc: jsPDF,
  theme: PdfThemePreset,
  meta: DemoLeaderboardMeta,
  pageRows: DemoLeaderboardRow[],
  pageNo: number,
  totalPages: number,
  totalStudents: number,
  isDemo: boolean,
  generatedAt: string,
) {
  // ----- Page background -----
  setFill(doc, "#FFFFFF");
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  // ----- Header band (solid brand primary) -----
  setFill(doc, theme.primary);
  doc.rect(0, 0, PAGE_W, HEADER_H, "F");
  // thin gold accent under header
  setFill(doc, BRAND_GOLD);
  doc.rect(0, HEADER_H - 3, PAGE_W, 3, "F");

  // Logo mark — white rounded square with primary initials
  setFill(doc, "#FFFFFF");
  doc.roundedRect(MARGIN_X, 22, 60, 60, 10, 10, "F");
  setDraw(doc, BRAND_GOLD);
  doc.setLineWidth(1);
  doc.roundedRect(MARGIN_X, 22, 60, 60, 10, 10, "S");
  setText(doc, theme.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text("CA", MARGIN_X + 30, 60, { align: "center" });

  // Title stack
  setText(doc, "#FFFFFF");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("CA Aspire BD", MARGIN_X + 76, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Exam Batch Leaderboard", MARGIN_X + 76, 62);
  setText(doc, BRAND_GOLD);
  doc.setFontSize(8.5);
  doc.text(CAABD_ABOUT.website, MARGIN_X + 76, 78);

  // Right-side generated card
  const badgeW = 168;
  const badgeH = 56;
  const badgeX = PAGE_W - MARGIN_X - badgeW;
  const badgeY = 24;
  setFill(doc, "#FFFFFF");
  doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 8, 8, "F");
  setFill(doc, BRAND_GOLD);
  doc.rect(badgeX, badgeY, 3, badgeH, "F");
  setText(doc, BRAND_INK_SOFT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("GENERATED", badgeX + 14, badgeY + 16);
  setText(doc, BRAND_INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(generatedAt, badgeX + 14, badgeY + 32);
  setText(doc, theme.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(isDemo ? "DEMO PREVIEW" : "OFFICIAL EXPORT", badgeX + 14, badgeY + 46);

  // ----- Summary cards row -----
  const cardItems: Array<{ label: string; value: string }> = [
    { label: "SESSION", value: meta.sessionTitle || "—" },
    { label: "SUBJECT", value: meta.subjectName || "—" },
    { label: "EXAM", value: meta.examTitle || "—" },
    { label: "TOTAL STUDENTS", value: String(totalStudents) },
    { label: "PAGE", value: `${pageNo} of ${totalPages}` },
  ];
  const gap = 8;
  const availW = PAGE_W - MARGIN_X * 2;
  const cardW = (availW - gap * (cardItems.length - 1)) / cardItems.length;
  cardItems.forEach((it, i) => {
    const x = MARGIN_X + i * (cardW + gap);
    // Card
    setFill(doc, BRAND_SOFT_BG);
    doc.roundedRect(x, CARDS_TOP, cardW, CARDS_H, 6, 6, "F");
    setDraw(doc, BRAND_CARD_BORDER);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, CARDS_TOP, cardW, CARDS_H, 6, 6, "S");
    // Gold accent dot
    setFill(doc, BRAND_GOLD);
    doc.circle(x + 10, CARDS_TOP + 12, 2.2, "F");
    // Label
    setText(doc, BRAND_INK_SOFT);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(it.label, x + 18, CARDS_TOP + 15);
    // Value
    setText(doc, BRAND_INK);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const val = String(it.value);
    // truncate to card width
    let s = val;
    while (s.length > 3 && doc.getTextWidth(s) > cardW - 20) s = s.slice(0, -1);
    if (s !== val) s = s.trimEnd() + "…";
    doc.text(s, x + 10, CARDS_TOP + 38);
    // Divider
    setDraw(doc, BRAND_CARD_BORDER);
    doc.setLineWidth(0.4);
    doc.line(x + 10, CARDS_TOP + 46, x + cardW - 10, CARDS_TOP + 46);
  });

  // ----- Table header -----
  setFill(doc, theme.primary);
  doc.roundedRect(MARGIN_X, TABLE_TOP, availW, HEAD_H, 5, 5, "F");
  setFill(doc, BRAND_GOLD);
  doc.rect(MARGIN_X, TABLE_TOP + HEAD_H - 2, availW, 2, "F");
  setText(doc, "#FFFFFF");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  let cx = MARGIN_X;
  for (const col of COLS) {
    const tx =
      col.align === "center"
        ? cx + col.w / 2
        : col.align === "right"
          ? cx + col.w - 10
          : cx + 10;
    doc.text(col.label.toUpperCase(), tx, TABLE_TOP + 17, { align: col.align });
    cx += col.w;
  }

  // ----- Rows -----
  const bodyTop = TABLE_TOP + HEAD_H;
  for (let i = 0; i < pageRows.length; i++) {
    const r = pageRows[i];
    const rowY = bodyTop + i * ROW_H;
    if (i % 2 === 1) {
      setFill(doc, BRAND_SOFT_BG);
      doc.rect(MARGIN_X, rowY, availW, ROW_H, "F");
    }
    // Rank cell
    if (r.rank >= 1 && r.rank <= 3) {
      const [mr, mg, mb] = hexToRgbTuple(MEDAL_COLORS[r.rank as 1 | 2 | 3]);
      const cxM = MARGIN_X + COLS[0].w / 2;
      const cyM = rowY + ROW_H / 2;
      doc.setFillColor(mr, mg, mb);
      doc.circle(cxM, cyM, 8, "F");
      setDraw(doc, "#FFFFFF");
      doc.setLineWidth(0.6);
      doc.circle(cxM, cyM, 8, "S");
      setText(doc, "#1E1B0A");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(String(r.rank), cxM, cyM + 3, { align: "center" });
    } else {
      setText(doc, BRAND_INK);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.text(String(r.rank), MARGIN_X + COLS[0].w / 2, rowY + 15, {
        align: "center",
      });
    }
    // Remaining columns
    let x = MARGIN_X + COLS[0].w;
    for (let ci = 1; ci < COLS.length; ci++) {
      const col = COLS[ci];
      const val =
        col.key === "id"
          ? String(r.studentId)
          : col.key === "name"
            ? String(r.name)
            : col.key === "marks"
              ? String(r.marks)
              : col.key === "pct"
                ? `${(r.percentage ?? r.marks).toFixed(0)}%`
                : r.finishTime;
      if (col.key === "marks" || col.key === "pct") {
        doc.setFont("helvetica", "bold");
        setText(doc, theme.primary);
      } else {
        doc.setFont("helvetica", "normal");
        setText(doc, BRAND_INK);
      }
      doc.setFontSize(9.5);
      let s = val;
      while (s.length > 3 && doc.getTextWidth(s) > col.w - 14) s = s.slice(0, -1);
      if (s !== val) s = s.trimEnd() + "…";
      const tx =
        col.align === "center"
          ? x + col.w / 2
          : col.align === "right"
            ? x + col.w - 10
            : x + 10;
      doc.text(s, tx, rowY + 15, { align: col.align });
      x += col.w;
    }
    // Row bottom hairline
    setDraw(doc, BRAND_CARD_BORDER);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X, rowY + ROW_H, MARGIN_X + availW, rowY + ROW_H);
  }
  // Table outer border
  setDraw(doc, BRAND_CARD_BORDER);
  doc.setLineWidth(0.6);
  doc.roundedRect(MARGIN_X, TABLE_TOP, availW, HEAD_H + LEADERBOARD_ROWS_PER_PAGE * ROW_H, 5, 5, "S");

  // ----- About / footer -----
  setDraw(doc, BRAND_GOLD);
  doc.setLineWidth(0.8);
  doc.line(MARGIN_X, ABOUT_TOP, MARGIN_X + 60, ABOUT_TOP);
  setText(doc, theme.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("About CA Aspire BD", MARGIN_X, ABOUT_TOP + 14);
  setText(doc, BRAND_INK_SOFT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const wrapped = doc.splitTextToSize(BRAND_ABOUT_BODY, PAGE_W - MARGIN_X * 2);
  doc.text(wrapped, MARGIN_X, ABOUT_TOP + 28);

  // Bottom bar
  setDraw(doc, BRAND_CARD_BORDER);
  doc.setLineWidth(0.5);
  doc.line(MARGIN_X, BOTTOM_BAR_Y - 14, PAGE_W - MARGIN_X, BOTTOM_BAR_Y - 14);
  setText(doc, theme.primary);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(`https://${CAABD_ABOUT.website}`, MARGIN_X, BOTTOM_BAR_Y - 2);
  setText(doc, BRAND_INK_SOFT);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text(CAABD_ABOUT.copyright, PAGE_W / 2, BOTTOM_BAR_Y - 2, { align: "center" });
  // Page pill
  const pillLabel = `Page ${pageNo} of ${totalPages}`;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const pillW = doc.getTextWidth(pillLabel) + 18;
  const pillH = 14;
  setFill(doc, theme.primary);
  doc.roundedRect(PAGE_W - MARGIN_X - pillW, BOTTOM_BAR_Y - 12, pillW, pillH, 7, 7, "F");
  setText(doc, "#FFFFFF");
  doc.text(pillLabel, PAGE_W - MARGIN_X - pillW / 2, BOTTOM_BAR_Y - 3, { align: "center" });
}

export function generateDemoLeaderboardPdf(
  meta: DemoLeaderboardMeta,
  rows: DemoLeaderboardRow[] = DEMO_LEADERBOARD_ROWS,
): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  const theme = resolvePdfTheme(meta.themeColor);
  const totalPages = Math.max(
    1,
    Math.ceil((rows.length || 1) / LEADERBOARD_ROWS_PER_PAGE),
  );
  const generatedAt = new Date().toLocaleString("en-GB", { hour12: false }).slice(0, 20);
  for (let p = 0; p < totalPages; p++) {
    if (p > 0) doc.addPage("a4", "portrait");
    const start = p * LEADERBOARD_ROWS_PER_PAGE;
    const pageRows = rows.slice(start, start + LEADERBOARD_ROWS_PER_PAGE);
    drawPage(doc, theme, meta, pageRows, p + 1, totalPages, rows.length, true, generatedAt);
  }

  const buffer = doc.output("arraybuffer") as ArrayBuffer;
  return new Uint8Array(buffer);
}

export function demoPdfToBase64(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) {
    bytes = new Uint8Array(bytes as unknown as ArrayBuffer);
  }
  if (bytes.byteLength === 0) {
    throw new Error("Refusing to encode empty PDF: generator produced 0 bytes");
  }
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)) as unknown as number[],
    );
  }
  return btoa(binary);
}