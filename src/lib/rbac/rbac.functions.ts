// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
// Server fns for the RBAC matrix system.
// Every mutation re-checks `manage_permissions` server-side and writes an
// entry to permission_audit_log via record_permission_audit().

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { noInput } from "@/lib/validate";
import { PAGE_REGISTRY } from "./page-registry";
import { ALL_ROLES, ALL_PERMISSIONS } from "@/lib/admin-role-permissions.functions";

const roleEnum = z.enum(ALL_ROLES);
const permRe = /^[a-z][a-z0-9_]{1,63}$/;
const pageKeyRe = /^[a-z][a-z0-9_.-]{1,63}$/;

// ---------------------------------------------------------------------------
// listMyAccess — preload caller's effective roles, permissions, pages
// ---------------------------------------------------------------------------
export const listMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    const sb = context.supabase as any;
    const [rolesRes, permsRes, pagesRes] = await Promise.all([
      sb.from("user_roles").select("role").eq("user_id", context.userId),
      sb.rpc("list_my_permissions"),
      sb.rpc("list_my_pages"),
    ]);
    if (rolesRes.error) throw new Error(rolesRes.error.message);
    const roles: string[] = (rolesRes.data ?? []).map((r: any) => r.role);
    const permissions: string[] = !permsRes.error
      ? (permsRes.data ?? []).map((r: any) => r.permission ?? r)
      : [];
    const pages: string[] = !pagesRes.error
      ? (pagesRes.data ?? []).map((r: any) => r.page_key ?? r)
      : [];
    return {
      userId: context.userId,
      roles,
      permissions,
      pages,
      isSuperAdmin: roles.includes("super_admin"),
      isAdmin: roles.includes("admin") || roles.includes("super_admin"),
    };
  });

// ---------------------------------------------------------------------------
// syncPageRegistry — upsert canonical pages into app_pages
// ---------------------------------------------------------------------------
export const syncPageRegistry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_permissions",
      "sync_page_registry",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const rows = PAGE_REGISTRY.map((p) => ({
      key: p.key,
      label: p.label,
      group: p.group,
      route: p.route,
      description: (p as { description?: string }).description ?? null,
      enabled: true,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await sb.from("app_pages").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });

// ---------------------------------------------------------------------------
// listPermissionMatrix — the entire grid (roles, perms, pages, grants)
// ---------------------------------------------------------------------------
export const listPermissionMatrix = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_permissions",
      "list_matrix",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const [rpRes, paRes, pagesRes] = await Promise.all([
      sb.from("role_permissions").select("role, permission"),
      sb.from("page_access").select("role, page_key"),
      sb.from("app_pages").select("key, label, group, route, enabled").order("group"),
    ]);
    if (rpRes.error) throw new Error(rpRes.error.message);
    if (paRes.error) throw new Error(paRes.error.message);
    if (pagesRes.error) throw new Error(pagesRes.error.message);

    const dbPages = (pagesRes.data ?? []) as any[];
    // Merge DB pages with code registry so brand-new code-defined pages
    // appear immediately even before syncPageRegistry runs.
    const known = new Set(dbPages.map((p) => p.key));
    const merged = [
      ...dbPages,
      ...PAGE_REGISTRY.filter((p) => !known.has(p.key)).map((p) => ({
        key: p.key,
        label: p.label,
        group: p.group,
        route: p.route,
        enabled: true,
      })),
    ];
    return {
      roles: ALL_ROLES,
      permissions: ALL_PERMISSIONS,
      pages: merged,
      rolePermissions: (rpRes.data ?? []) as { role: string; permission: string }[],
      pageAccess: (paRes.data ?? []) as { role: string; page_key: string }[],
    };
  });

// ---------------------------------------------------------------------------
// toggleRolePermission
// ---------------------------------------------------------------------------
const togglePermInput = z.object({
  role: roleEnum,
  permission: z.string().min(2).max(64).regex(permRe),
  enabled: z.boolean(),
});
export const toggleRolePermission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof togglePermInput>) => togglePermInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_permissions",
      data.enabled ? "grant_permission" : "revoke_permission",
      { role: data.role, permission: data.permission },
    );
    if (data.role === "super_admin") {
      throw new Error("super_admin permissions are immutable");
    }
    const sb = context.supabase as any;
    if (data.enabled) {
      const { error } = await sb
        .from("role_permissions")
        .upsert({ role: data.role, permission: data.permission }, { onConflict: "role,permission" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("role_permissions")
        .delete()
        .eq("role", data.role)
        .eq("permission", data.permission);
      if (error) throw new Error(error.message);
    }
    await (context.supabase as any).rpc("record_permission_audit", {
      _action: data.enabled ? "grant_permission" : "revoke_permission",
      _target_role: data.role,
      _target_permission: data.permission,
      _metadata: {},
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// toggleRolePageAccess
// ---------------------------------------------------------------------------
const togglePageInput = z.object({
  role: roleEnum,
  page_key: z.string().min(2).max(64).regex(pageKeyRe),
  enabled: z.boolean(),
});
export const toggleRolePageAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof togglePageInput>) => togglePageInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_permissions",
      data.enabled ? "grant_page" : "revoke_page",
      { role: data.role, page_key: data.page_key },
    );
    if (data.role === "super_admin") {
      throw new Error("super_admin page access is immutable");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    if (data.enabled) {
      const { error } = await sb
        .from("page_access")
        .upsert({ role: data.role, page_key: data.page_key }, { onConflict: "role,page_key" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("page_access")
        .delete()
        .eq("role", data.role)
        .eq("page_key", data.page_key);
      if (error) throw new Error(error.message);
    }
    await (context.supabase as any).rpc("record_permission_audit", {
      _action: data.enabled ? "grant_page" : "revoke_page",
      _target_role: data.role,
      _target_page: data.page_key,
      _metadata: {},
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// listAuditLog
// ---------------------------------------------------------------------------
const auditQueryInput = z
  .object({
    limit: z.number().int().min(1).max(200).default(50),
    action: z.string().optional(),
    role: roleEnum.optional(),
  })
  .default({ limit: 50 });
export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof auditQueryInput>) => auditQueryInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_permissions",
      "list_audit_log",
    );
    const sb = context.supabase as any;
    let q = sb
      .from("permission_audit_log")
      .select(
        "id, actor_id, actor_email, action, target_role, target_page, target_permission, target_user_id, metadata, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) q = q.eq("action", data.action);
    if (data.role) q = q.eq("target_role", data.role);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[] };
  });

// ---------------------------------------------------------------------------
// lookupUsersForRbac — light search for the role-override panel
// ---------------------------------------------------------------------------
const lookupInput = z
  .object({ q: z.string().trim().max(120).optional(), limit: z.number().int().min(1).max(50).default(20) })
  .default({ limit: 20 });

export const lookupUsersForRbac = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof lookupInput>) => lookupInput.parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_permissions",
      "lookup_users",
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const q = (data.q ?? "").trim().toLowerCase();
    // Pull a window of profiles, then enrich with auth email + roles
    let profilesQ = sb
      .from("profiles")
      .select("id, display_name")
      .order("created_at", { ascending: false })
      .limit(data.limit * 4);
    if (q) {
      profilesQ = profilesQ.ilike("display_name", `%${q}%`);
    }
    const { data: profiles, error: pErr } = await profilesQ;
    if (pErr) throw new Error(pErr.message);
    let ids: string[] = (profiles ?? []).map((p: any) => p.id);

    // If searching by email and no profile matches, page auth.users.
    let authIndex = new Map<string, { email: string | null }>();
    if (q.includes("@") || ids.length === 0) {
      try {
        const { data: auth } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
        for (const u of auth?.users ?? []) {
          if (!q || (u.email ?? "").toLowerCase().includes(q) || u.id.toLowerCase().startsWith(q)) {
            authIndex.set(u.id, { email: u.email ?? null });
            if (!ids.includes(u.id)) ids.push(u.id);
          }
        }
      } catch (e) {
        console.warn("[rbac.lookupUsers] auth list failed", e);
      }
    } else {
      try {
        const { data: auth } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
        for (const u of auth?.users ?? []) authIndex.set(u.id, { email: u.email ?? null });
      } catch (e) {
        console.warn("[rbac.lookupUsers] auth list failed", e);
      }
    }
    ids = ids.slice(0, data.limit);
    if (ids.length === 0) return { rows: [] as any[] };

    const { data: roleRows } = await sb
      .from("user_roles")
      .select("user_id, role")
      .in("user_id", ids);
    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const rolesByUser = new Map<string, string[]>();
    for (const r of roleRows ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUser.set(r.user_id, list);
    }
    const rows = ids.map((id) => ({
      id,
      email: authIndex.get(id)?.email ?? null,
      display_name: (profileById.get(id) as any)?.display_name ?? null,
      roles: rolesByUser.get(id) ?? [],
    }));
    return { rows };
  });

// ---------------------------------------------------------------------------
// overrideUserRole — grant/revoke a single role on a target user with audit
// ---------------------------------------------------------------------------
const overrideInput = z.object({
  user_id: z.string().uuid(),
  role: roleEnum,
  grant: z.boolean(),
});
export const overrideUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof overrideInput>) => overrideInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_permissions",
      data.grant ? "grant_user_role" : "revoke_user_role",
      { user_id: data.user_id, role: data.role },
    );
    if (data.role === "super_admin") {
      throw new Error("super_admin role can only be granted via direct DB access");
    }
    if (data.user_id === context.userId && !data.grant && data.role === "admin") {
      throw new Error("You cannot revoke your own admin role");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    if (data.grant) {
      const { error } = await sb
        .from("user_roles")
        .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("user_roles")
        .delete()
        .eq("user_id", data.user_id)
        .eq("role", data.role);
      if (error) throw new Error(error.message);
    }
    await (context.supabase as any).rpc("record_permission_audit", {
      _action: data.grant ? "grant_user_role" : "revoke_user_role",
      _target_role: data.role,
      _target_user_id: data.user_id,
      _metadata: {},
    });
    return { ok: true };
  });