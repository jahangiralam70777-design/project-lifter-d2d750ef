// Global text sanitizer for MCQ / True-False option and question text.
// Strips stray markdown markers (e.g. trailing/leading "**", "__") that can
// leak in from bulk imports or AI-generated content, and normalizes whitespace.

export function sanitizeOptionText(value: string | null | undefined): string {
  if (value == null) return "";
  let s = String(value);
  // Remove markdown bold/italic markers wherever they appear
  s = s.replace(/\*+/g, "").replace(/_{2,}/g, "");
  // Collapse whitespace
  return s.replace(/\s+/g, " ").trim();
}

// Convenience: sanitize all option_* + question fields on an MCQ-like row.
export function sanitizeMcqRow<T extends Record<string, unknown>>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const out: Record<string, unknown> = { ...row };
  for (const k of ["question", "option_a", "option_b", "option_c", "option_d", "explanation"]) {
    if (typeof out[k] === "string") out[k] = sanitizeOptionText(out[k] as string);
  }
  return out as T;
}
