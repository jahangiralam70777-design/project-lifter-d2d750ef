/**
 * UI-only formatter for Exam Batch "level" display values.
 * Does not modify stored data — used purely at render time.
 *
 * Rules:
 * - Title-case each word ("certificate level" → "Certificate Level").
 * - Preserve common abbreviations in uppercase (ICAB, CA, CPA, ACCA, CMA, CFA,
 *   ICMAB, ICSI, ICAI, etc.) regardless of stored casing.
 * - Preserve pure-numeric tokens as-is ("Level 1" stays "Level 1").
 * - Leave placeholder / sentinel strings ("—", "…", "") untouched.
 */

const ABBREVIATIONS = new Set([
  "ICAB",
  "ICMAB",
  "ICSI",
  "ICAI",
  "CA",
  "CPA",
  "ACCA",
  "CMA",
  "CFA",
  "CS",
  "CIMA",
  "FCA",
  "FCMA",
  "MBA",
  "BBA",
  "II",
  "III",
  "IV",
  "VI",
  "VII",
  "VIII",
  "IX",
  "XI",
  "XII",
]);

const PLACEHOLDERS = new Set(["", "—", "-", "–", "…", "N/A", "n/a"]);

export function formatExamBatchLevel(
  value: string | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  const trimmed = String(value).trim();
  if (!trimmed || PLACEHOLDERS.has(trimmed)) return trimmed;

  return trimmed
    .split(/(\s+)/)
    .map((token) => {
      if (/^\s+$/.test(token)) return token;
      const upper = token.toUpperCase();
      if (ABBREVIATIONS.has(upper)) return upper;
      if (/^[0-9]+$/.test(token)) return token;
      // Handle hyphenated / slash-joined words: "sub-level" → "Sub-Level"
      return token
        .split(/([-/])/)
        .map((part) => {
          if (part === "-" || part === "/") return part;
          const partUpper = part.toUpperCase();
          if (ABBREVIATIONS.has(partUpper)) return partUpper;
          if (/^[0-9]+$/.test(part)) return part;
          const lower = part.toLowerCase();
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join("");
    })
    .join("");
}
