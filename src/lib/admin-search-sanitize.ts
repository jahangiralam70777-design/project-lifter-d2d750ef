/**
 * H-1: Sanitize a user-supplied search term before embedding it in a
 * PostgREST `.or(...)` filter expression like
 *   `title.ilike.%${term}%,summary.ilike.%${term}%`
 *
 * Characters with special meaning in PostgREST `.or()` syntax (`,` `(` `)`
 * `:`), in PostgREST ilike patterns (`*`), and in SQL ilike patterns
 * (`%` `_` `\`) are stripped. Replacing them with a space preserves the
 * intent of the search (multi-word lookup) without letting the caller
 * break out of the filter, smuggle wildcards, or inject extra clauses.
 *
 * Always pass the OUTPUT of this function into the `${...}` slot of an
 * `.or()`/`.ilike()` filter — never the raw user input.
 */
export function sanitizeSearchTerm(raw: string, maxLen = 100): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[,()*%_\\:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}
