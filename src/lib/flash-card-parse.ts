// Flash card text/file parser — extracts {front, back} pairs.
// Browser-safe. PDF/DOCX libraries are dynamically imported.

export type ParsedCard = { front: string; back: string };

/** Normalize whitespace inside a single field. */
function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Parse raw text into Q/A pairs. Supports multiple formats:
 *  1.  "Question: ...\nAnswer: ..."  (also Q:/A:, Front:/Back:)
 *  2.  "Front :: Back"               (one card per line)
 *  3.  Numbered Q/A blocks (1. ... / Ans: ...)
 *  4.  Blank-line separated pairs (first line front, rest back)
 */
export function parseFlashCardText(input: string): ParsedCard[] {
  const text = (input ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) return [];

  const out: ParsedCard[] = [];

  // ---- Format 1: labelled Q/A ----
  // Split by occurrences of a question label.
  const labelRe = /(?:^|\n)\s*(?:question|q|front|prompt)\s*[:\-.)]\s*/i;
  if (labelRe.test(text)) {
    const blocks = text.split(/(?=(?:^|\n)\s*(?:question|q|front|prompt)\s*[:\-.)])/i);
    for (const raw of blocks) {
      const m = raw.match(
        /\s*(?:question|q|front|prompt)\s*[:\-.)]\s*([\s\S]*?)\n\s*(?:answer|ans|a|back|explanation)\s*[:\-.)]\s*([\s\S]*)$/i,
      );
      if (m) {
        const front = clean(m[1]);
        const back = clean(m[2]);
        if (front && back) out.push({ front, back });
      }
    }
    if (out.length) return dedupe(out);
  }

  // ---- Format 2: "Front :: Back" on a single line ----
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.some((l) => l.includes("::"))) {
    for (const l of lines) {
      if (!l.includes("::")) continue;
      const [front, ...rest] = l.split("::");
      const back = rest.join("::");
      const f = clean(front);
      const b = clean(back);
      if (f && b) out.push({ front: f, back: b });
    }
    if (out.length) return dedupe(out);
  }

  // ---- Format 3: blank-line separated pairs ----
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of paras) {
    const pl = p
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (pl.length >= 2) {
      const front = clean(pl[0]);
      const back = clean(pl.slice(1).join(" "));
      if (front && back) out.push({ front, back });
    }
  }

  return dedupe(out);
}

function dedupe(cards: ParsedCard[]): ParsedCard[] {
  const seen = new Set<string>();
  const result: ParsedCard[] = [];
  for (const c of cards) {
    const key = `${c.front.toLowerCase()}|||${c.back.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Trim insanely long fields to schema limits
    result.push({
      front: c.front.slice(0, 500),
      back: c.back.slice(0, 4000),
    });
  }
  return result;
}

/** Extract plain text from an uploaded file (txt, md, pdf, docx). */
export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return file.text();
  }

  if (name.endsWith(".docx")) {
    const mammoth = await import("mammoth/mammoth.browser");
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer: buf });
    return res.value ?? "";
  }

  if (name.endsWith(".pdf")) {
    // pdfjs-dist legacy build works in modern browsers without worker config gymnastics.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // Disable worker — runs on main thread, fine for moderate PDFs.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (pdfjs as any).GlobalWorkerOptions.workerSrc = "";
    const buf = await file.arrayBuffer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loadingTask = (pdfjs as any).getDocument({
      data: buf,
      disableWorker: true,
      isEvalSupported: false,
    });
    const pdf = await loadingTask.promise;
    const chunks: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const strs = content.items.map((i: any) => ("str" in i ? i.str : "")).filter(Boolean);
      chunks.push(strs.join(" "));
    }
    return chunks.join("\n\n");
  }

  if (name.endsWith(".doc")) {
    throw new Error("Legacy .doc files are not supported. Please save as .docx and re-upload.");
  }

  throw new Error(`Unsupported file type: ${file.name}`);
}
