// Legacy compatibility shim.
//
// Some pre-Phase-4 admin modules reference tables/columns that either no
// longer exist in the generated Supabase types or have drifted in shape.
// This file does NOT touch the database — it only provides type-level
// escape hatches so the strict TypeScript build keeps passing while the
// legacy runtime code continues to execute unchanged.
//
// Anything imported from here is intentionally typed as `any` so callers
// can keep their original query shapes without us rewriting business logic.

export type LegacyRow = Record<string, any>;
export type LegacyTable = string;

/** Marker type for query results coming from legacy/untyped tables. */
export type LegacyResult<T = LegacyRow> = {
  data: T | T[] | null;
  error: { message: string } | null;
};

/** No-op identity helper used by legacy modules to bypass strict inserts. */
export const asLegacyPayload = <T>(value: T): any => value as any;

/** Cast helper for legacy reads where the generated row type is too narrow. */
export const asLegacyRow = <T = LegacyRow>(value: unknown): T => value as T;
