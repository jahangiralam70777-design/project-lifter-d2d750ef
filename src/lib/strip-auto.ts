// Strips internal "Auto" labels from titles/descriptions before displaying to students.
// Does NOT mutate stored data — UI-only sanitization.
export function stripAutoTitle(title?: string | null): string {
  if (!title) return "";
  let t = title;
  t = t.replace(/^\s*\[Auto\]\s*/i, "");
  t = t.replace(/^\s*Auto Mock\s*·\s*/i, "");
  return t.trim();
}

export function stripAutoDescription(desc?: string | null): string | null {
  if (!desc) return desc ?? null;
  if (/^\s*Auto-generated\b/i.test(desc)) return null;
  return desc;
}
