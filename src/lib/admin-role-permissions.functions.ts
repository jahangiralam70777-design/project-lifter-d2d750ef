// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";

import { noInput } from "@/lib/validate";
export const ALL_ROLES = ["super_admin", "admin", "moderator", "student", "user"] as const;
export type RbacRole = (typeof ALL_ROLES)[number];

export const ALL_PERMISSIONS: { key: string; label: string; description?: string }[] = [
  { key: "manage_users", label: "Manage Users" },
  { key: "manage_permissions", label: "Manage Permissions" },
  { key: "manage_system", label: "Manage System / Site / Database" },
  { key: "moderate_content", label: "Moderate Content" },
  { key: "view_analytics", label: "View Analytics" },
  { key: "edit_academic_structure", label: "Edit Academic Structure" },
  { key: "manage_content", label: "Manage MCQs / Quizzes / Notes" },
  { key: "take_exams", label: "Take Exams / Practice" },
  { key: "bookmark_review", label: "Bookmark / Review Wrong Answers" },
];

const roleEnum = z.enum(ALL_ROLES);
const permissionRe = /^[a-z][a-z0-9_]{1,63}$/;

// Editing the matrix itself is gated on the manage_permissions capability.
// Reading it requires manage_permissions or view_analytics (read-only auditors).
async function assertCanReadMatrix(supabase: unknown, userId: string) {
  await assertPermission(supabase, userId, "manage_permissions", "list_role_permissions");
}
async function assertCanEditMatrix(supabase: unknown, userId: string) {
  await assertPermission(supabase, userId, "manage_permissions", "toggle_role_permission");
}

export const listRolePermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertCanReadMatrix(context.supabase, context.userId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { data, error } = await sb
      .from("role_permissions")
      .select("role, permission")
      .order("role", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      rows: (data ?? []) as { role: RbacRole; permission: string }[],
      roles: ALL_ROLES,
      permissions: ALL_PERMISSIONS,
    };
  });

const toggleInput = z.object({
  role: roleEnum,
  permission: z.string().min(2).max(64).regex(permissionRe),
  enabled: z.boolean(),
});

export const toggleRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof toggleInput>) => toggleInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertCanEditMatrix(context.supabase, context.userId);
    if (data.role === "super_admin") {
      throw new Error("super_admin permissions are immutable");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    // Self-lockout guard: revoking manage_permissions from a role the caller holds
    // would orphan the matrix. Only super_admin may do so.
    if (!data.enabled && data.permission === "manage_permissions") {
      const { data: callerRoles } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      const roles = ((callerRoles ?? []) as Array<{ role: string }>).map((r) => r.role);
      if (roles.includes(data.role) && !roles.includes("super_admin")) {
        throw new Error(
          "Refusing to revoke manage_permissions from a role you hold. Ask a super_admin.",
        );
      }
    }
    if (data.enabled) {
      const { error } = await sb
        .from("role_permissions")
        .upsert(
          { role: data.role, permission: data.permission },
          { onConflict: "role,permission" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("role_permissions")
        .delete()
        .eq("role", data.role)
        .eq("permission", data.permission);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

const checkInput = z.object({ permission: z.string().min(2).max(64).regex(permissionRe) });

export const checkMyPermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof checkInput>) => checkInput.parse(i))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    try {
      const { data: ok, error } = await sb.rpc("has_permission", {
        _user_id: context.userId,
        _permission: data.permission,
      });
      if (error) throw error;
      return { allowed: ok === true, degraded: false };
    } catch (error) {
      console.warn("[checkMyPermission] permission lookup degraded", {
        userId: context.userId,
        permission: data.permission,
        error: error instanceof Error ? error.message : String(error),
      });
      return { allowed: false, degraded: true };
    }
  });