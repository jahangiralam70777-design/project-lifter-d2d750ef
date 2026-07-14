// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type VerifyAdminAccessResult = {
  isAdmin: boolean;
  isModerator: boolean;
  isStaff: boolean;
  userId: string;
  role: "admin" | "super_admin" | "moderator" | null;
  sources?: {
    databaseRoles: string[];
    jwtRole: string | null;
    jwtRoles: string[];
    appMetadataRole: string | null;
    profileRole: string | null;
  };
  degraded?: boolean;
  reason?: string;
};

function pickAdminRole(roles: string[]): "admin" | "super_admin" | "moderator" | null {
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("moderator")) return "moderator";
  return null;
}

/**
 * H-1: Server-side admin verification.
 *
 * The /admin layout gate previously trusted only the client-side `user.role`
 * value from the local app store, which could be spoofed in browser devtools.
 * This server fn re-checks the role against the `user_roles` table using the
 * authenticated user's bearer token (RLS scoped to that user). Server-side
 * RLS on every admin write already enforced this, but the UI shell should
 * also refuse to mount for non-admins so privileged screens never render.
 */
export const verifyAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    if (d !== undefined && d !== null && !(typeof d === "object" && Object.keys(d).length === 0)) {
      throw new Error("verifyAdminAccess accepts no input");
    }
    return {};
  })
  .handler(async ({ context }): Promise<VerifyAdminAccessResult> => {
    const { userId } = context;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .in("role", ["admin", "super_admin", "moderator"]);
      if (error) throw error;
      const databaseRoles = (data ?? []).map((r: { role: string }) => r.role);
      const role = pickAdminRole(databaseRoles);
      const claims = context.claims as {
        app_metadata?: { role?: string; roles?: unknown[] };
      };
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      const appMetadata = (authUser.user?.app_metadata ?? {}) as Record<string, unknown>;
      let profileRole: string | null = null;
      try {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("role")
          .eq("id", userId)
          .maybeSingle();
        profileRole = typeof profile?.role === "string" ? profile.role : null;
      } catch {
        profileRole = null;
      }
      const metadataRole = claims.app_metadata?.role;
      const metadataRoles = (claims.app_metadata?.roles ?? []).filter(
        (role): role is string => typeof role === "string",
      );
      const sources = {
        databaseRoles,
        jwtRole: typeof metadataRole === "string" ? metadataRole : null,
        jwtRoles: metadataRoles,
        appMetadataRole: typeof appMetadata.role === "string" ? appMetadata.role : null,
        profileRole,
      };
      console.info("[admin-auth] role sources", { userId, ...sources });
      const isAdmin = role === "admin" || role === "super_admin";
      const isModerator = role === "moderator";
      return { isAdmin, isModerator, isStaff: isAdmin || isModerator, role, userId, sources };
    } catch (error) {
      console.warn("[verifyAdminAccess] role lookup degraded", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        isAdmin: false,
        isModerator: false,
        isStaff: false,
        userId,
        role: null,
        degraded: true,
        reason: error instanceof Error ? error.message : "role verification unavailable",
      };
    }
  });

export const syncCurrentUserRoleMetadata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleError) throw roleError;
    const databaseRoles = (roleRows ?? []).map((r: { role: string }) => r.role);
    const role = pickAdminRole(databaseRoles);
    const { data: authUser, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (userError) throw userError;
    const current = (authUser.user?.app_metadata ?? {}) as Record<string, unknown>;
    const currentRoles = Array.isArray(current.roles)
      ? current.roles.filter((r): r is string => typeof r === "string")
      : [];
    const nonAdminRoles = currentRoles.filter((r) => r !== "admin" && r !== "super_admin");
    const nextMetadata = role
      ? { ...current, role, roles: Array.from(new Set([...nonAdminRoles, role])) }
      : { ...current, role: "student", roles: nonAdminRoles };
    const changed = JSON.stringify(current) !== JSON.stringify(nextMetadata);
    if (changed) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: nextMetadata,
      });
      if (updateError) throw updateError;
    }
    console.info("[admin-auth] synced metadata from database role", {
      userId,
      databaseRoles,
      role,
      changed,
    });
    return { ok: true, role, databaseRoles, changed };
  });