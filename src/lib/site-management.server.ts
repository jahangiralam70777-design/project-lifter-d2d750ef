// Server-only helpers for site management (NOT importable from client code).
import type { SupabaseClient } from "@supabase/supabase-js";

export async function assertAdmin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  userId: string,
) {
  // Back-compat shim: site-management is fully gated on `manage_system`.
  const { assertPermission } = await import("./admin-permissions");
  await assertPermission(supabase, userId, "manage_system", "site-management");
}

export const TARGET_KIND = {
  section: "section" as const,
  setting: "setting" as const,
};

export type TargetKind = (typeof TARGET_KIND)[keyof typeof TARGET_KIND];
