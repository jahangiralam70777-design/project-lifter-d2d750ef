// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { publishAccountRevocation } from "@/lib/account-revocation";

const roleEnum = z.enum(["admin", "super_admin", "moderator", "student", "user"]);
const statusEnum = z.enum(["active", "suspended", "pending"]);
const statusFilterEnum = z.enum(["active", "suspended", "pending", "deleted"]);
const dateRangeEnum = z.enum(["24h", "7d", "30d", "lifetime"]);

const listInput = z.object({
  search: z.string().trim().max(200).optional(),
  role: roleEnum.optional(),
  status: statusFilterEnum.optional(),
  level: z.string().trim().max(40).optional(),
  referralSource: z.string().trim().max(80).optional(),
  dateRange: dateRangeEnum.optional(),
  includeDeleted: z.boolean().optional(),
  verified: z.boolean().optional(),
  page: z.number().int().min(1).max(2000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
});

// Roles that classify a user as an administrator (used by stats + filters)
const ADMIN_ROLES = ["admin", "super_admin"] as const;

// Page through auth.users to collect ids matching a predicate (verified flag).
// Caps at 10k users to stay safe; sufficient for this app's scale.
async function listAuthUsersAll(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
): Promise<Array<{ id: string; email: string | null; verified: boolean }>> {
  const out: Array<{ id: string; email: string | null; verified: boolean }> = [];
  const perPage = 1000;
  const maxPages = 10;
  for (let page = 1; page <= maxPages; page++) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    const users: Array<{ id: string; email?: string | null; email_confirmed_at?: string | null }> =
      data?.users ?? [];
    if (!users.length) break;
    for (const u of users) {
      out.push({
        id: u.id,
        email: u.email ?? null,
        verified: !!u.email_confirmed_at,
      });
    }
    if (users.length < perPage) break;
  }
  return out;
}

export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof listInput>) => listInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    // -----------------------------------------------------------------------
    // Build a server-side ID allowlist BEFORE pagination so summary cards
    // (role / verified filters) match list contents exactly. Previously these
    // were applied AFTER `.range()`, which caused "15 verified, 4 visible".
    // -----------------------------------------------------------------------
    const idFilters: Array<Set<string>> = [];
    const idDenylists: Array<Set<string>> = [];

    // 1) Search (email/uuid resolves through auth.users).
    const searchTerm = (data.search ?? "").trim();
    let allAuthUsers: Array<{ id: string; email: string | null; verified: boolean }> | null = null;
    const loadAllAuthUsers = async () => {
      if (allAuthUsers) return allAuthUsers;
      try {
        allAuthUsers = await listAuthUsersAll(supabaseAdmin);
      } catch {
        allAuthUsers = [];
      }
      return allAuthUsers;
    };

    if (searchTerm) {
      const isEmail = /@/.test(searchTerm);
      const isUuidPrefix = /^[0-9a-f-]{6,}$/i.test(searchTerm);
      if (isEmail || isUuidPrefix) {
        const users = await loadAllAuthUsers();
        const lower = searchTerm.toLowerCase();
        const matches = users
          .filter(
            (u) =>
              (u.email ?? "").toLowerCase().includes(lower) ||
              u.id.toLowerCase().startsWith(lower),
          )
          .map((u) => u.id);
        if (matches.length > 0 || isUuidPrefix) {
          idFilters.push(new Set(matches));
        }
      }
    }

    // 2) Role filter (server-side via user_roles).
    //    Always filter by explicit user_roles rows. Never infer "student" from
    //    missing roles — role display/filtering must reflect the database only.
    if (data.role) {
      const role = data.role;
      const targetRoles = role === "admin" ? (ADMIN_ROLES as readonly string[]) : [role];
      const { data: matches, error: roleFilterError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", targetRoles as unknown as string[]);
      if (roleFilterError) throw roleFilterError;
      const matchIds = new Set<string>(
        (matches ?? []).map((r: { user_id: string }) => r.user_id),
      );
      idFilters.push(matchIds);
    }

    // 3) Verified filter (server-side via auth.users).
    if (typeof data.verified === "boolean") {
      const users = await loadAllAuthUsers();
      const matchIds = new Set<string>(
        users.filter((u) => u.verified === data.verified).map((u) => u.id),
      );
      idFilters.push(matchIds);
    }

    // Intersect all positive id sets, then subtract denylists.
    let allowedIds: string[] | null = null;
    if (idFilters.length > 0) {
      let intersection = new Set(idFilters[0]);
      for (let i = 1; i < idFilters.length; i++) {
        intersection = new Set([...intersection].filter((id) => idFilters[i].has(id)));
      }
      allowedIds = [...intersection];
    }
    if (idDenylists.length > 0) {
      const deny = new Set<string>();
      for (const d of idDenylists) for (const id of d) deny.add(id);
      if (allowedIds === null) {
        // No positive allowlist — we'll express this as NOT IN below.
        allowedIds = null;
        // Track to apply not.in later via separate query path.
      } else {
        allowedIds = allowedIds.filter((id) => !deny.has(id));
      }
    }

    // Empty allowlist → return empty page early.
    if (allowedIds !== null && allowedIds.length === 0) {
      return { rows: [], count: 0, page: data.page, pageSize: data.pageSize };
    }

    // -----------------------------------------------------------------------
    // Build the profiles query with all filters applied server-side.
    // -----------------------------------------------------------------------
    let q = sb
      .from("profiles")
      .select(
        "id,display_name,avatar_url,level,bio,status,referral_source,created_at,updated_at,last_login_at,total_login_count,total_usage_seconds,deleted_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.status === "deleted") {
      q = q.not("deleted_at", "is", null);
    } else if (data.status) {
      q = q.eq("status", data.status).is("deleted_at", null);
    } else if (!data.includeDeleted) {
      q = q.is("deleted_at", null);
    }
    if (data.level) q = q.eq("level", data.level);
    if (data.referralSource) q = q.eq("referral_source", data.referralSource);

    if (allowedIds !== null) {
      // Postgres `in` accepts up to ~1000 ids comfortably; we cap at 10k auth users.
      q = q.in("id", allowedIds);
    } else if (idDenylists.length > 0) {
      const denyAll = new Set<string>();
      for (const d of idDenylists) for (const id of d) denyAll.add(id);
      if (denyAll.size > 0) {
        // Supabase JS doesn't support `not in (uuid[])` natively in a clean form,
        // so we use a comma-joined `not.in` filter.
        const list = `(${[...denyAll].join(",")})`;
        q = q.not("id", "in", list);
      }
    }

    if (searchTerm && allowedIds === null) {
      q = q.ilike("display_name", `%${searchTerm}%`);
    }
    if (data.dateRange && data.dateRange !== "lifetime") {
      const map: Record<string, number> = { "24h": 1, "7d": 7, "30d": 30 };
      const days = map[data.dateRange];
      if (days) {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        q = q.gte("last_login_at", since);
      }
    }
    const { data: profiles, error, count } = await q;
    if (error) throw error;

    const ids = (profiles ?? []).map((p: { id: string }) => p.id);
    const rolesMap = new Map<string, string[]>();
    const roleDisplayMap = new Map<string, string[]>();
    if (ids.length) {
      // Use service-role client: caller already verified via assertPermission("manage_users").
      // RLS on user_roles only exposes the caller's own row to authenticated roles,
      // which would mask every other user's real role and make them all read as "student".
      const { data: rs, error: rolesError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id,role")
        .in("user_id", ids);
      if (rolesError) throw rolesError;
      for (const r of rs ?? []) {
        const arr = rolesMap.get(r.user_id) ?? [];
        arr.push(r.role);
        rolesMap.set(r.user_id, arr);
        const dArr = roleDisplayMap.get(r.user_id) ?? [];
        dArr.push(r.role);
        roleDisplayMap.set(r.user_id, dArr);
      }
    }

    // Email + verification lookup. Reuse cached auth list when we already paged it.
    const emailMap = new Map<string, { email: string | null; verified: boolean }>();
    if (ids.length) {
      const cachedAuthUsers: Array<{ id: string; email: string | null; verified: boolean }> =
        allAuthUsers ?? [];
      if (cachedAuthUsers.length > 0) {
        const idSet = new Set(ids);
        for (const u of cachedAuthUsers) {
          if (idSet.has(u.id)) emailMap.set(u.id, { email: u.email, verified: u.verified });
        }
      } else {
        try {
          const idSet = new Set(ids);
          const perPage = 1000;
          const maxPages = 10;
          for (let page = 1; page <= maxPages && idSet.size > emailMap.size; page++) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: u } = await (supabaseAdmin.auth.admin as any).listUsers({ page, perPage });
            const users: Array<{
              id: string;
              email?: string | null;
              email_confirmed_at?: string | null;
            }> = u?.users ?? [];
            if (!users.length) break;
            for (const usr of users) {
              if (idSet.has(usr.id)) {
                emailMap.set(usr.id, {
                  email: usr.email ?? null,
                  verified: !!usr.email_confirmed_at,
                });
              }
            }
            if (users.length < perPage) break;
          }
        } catch {
          // best-effort
        }
      }
      for (const id of ids) {
        if (!emailMap.has(id)) emailMap.set(id, { email: null, verified: false });
      }
    }

    const rows = (profiles ?? []).map((p: { id: string; display_name: string | null }) => {
      const auth = emailMap.get(p.id);
      const fallback = auth?.email ?? `${p.id.slice(0, 8)}…`;
      const roles = rolesMap.get(p.id) ?? [];
      return {
        ...p,
        display_name: p.display_name ?? fallback,
        roles,
        roleDisplays: roleDisplayMap.get(p.id) ?? roles,
        email: auth?.email ?? null,
        email_verified: auth?.verified ?? false,
      };
    });

    return { rows, count: count ?? 0, page: data.page, pageSize: data.pageSize };
  });


export const adminReferralStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({}).strict().optional().parse(d) ?? {})
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users", "users.referral_stats");
    const { data, error } = await (
      context.supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            limit: (n: number) => Promise<{
              data: Array<{ referral_source: string | null }> | null;
              error: unknown;
            }>;
          };
        };
      }
    )
      .from("profiles")
      .select("referral_source")
      .limit(5000);
    if (error) throw error;
    const counts = new Map<string, number>();
    let unknown = 0;
    for (const row of data ?? []) {
      const k = (row.referral_source ?? "").trim();
      if (!k) {
        unknown += 1;
        continue;
      }
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const sources = [...counts.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);
    return { sources, unknown, total: (data ?? []).length };
  });

export const adminUserStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = context.supabase as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [total, active, suspended, pending, adminRows] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
      sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .is("deleted_at", null),
      sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "suspended")
        .is("deleted_at", null),
      sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .is("deleted_at", null),
      // Pull distinct user_ids holding any admin-class role (admin OR super_admin).
      // Use service-role client — RLS on user_roles only exposes the caller's own row.
      supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ADMIN_ROLES as unknown as string[]),
    ]);
    const adminIdSet = new Set<string>(
      (adminRows.data ?? []).map((r: { user_id: string }) => r.user_id),
    );

    // Count verified users by paging through ALL auth.users (capped at 10k).
    // Previously this read only page 1 / 1000 rows → undercounted on larger sets.
    let verified = 0;
    try {
      const all = await listAuthUsersAll(supabaseAdmin);
      verified = all.filter((u) => u.verified).length;
    } catch {
      verified = 0;
    }
    return {
      total: total.count ?? 0,
      active: active.count ?? 0,
      suspended: suspended.count ?? 0,
      pending: pending.count ?? 0,
      admins: adminIdSet.size,
      verified,
    };
  });


const createStudentInput = z.object({
  display_name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  level: z.string().trim().min(1).max(40),
  phone: z.string().trim().max(40).optional(),
});
export const adminCreateStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: z.infer<typeof createStudentInput>) => createStudentInput.parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users", "admin.user.create", {
      email: data.email,
      level: data.level,
    });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.display_name, phone: data.phone ?? null },
      // Critical: marks this user as service-role created so the
      // hook_before_user_created Auth Hook lets it through even when the
      // student-signup kill-switch is OFF. Only the service role can set
      // app_metadata — public /auth/v1/signup cannot forge this.
      app_metadata: { created_by_admin: true },
    });
    if (error) throw error;
    const newId = created.user?.id;
    if (!newId) throw new Error("Failed to create auth user");
    // Upsert profile row. (No trigger; admin-created student starts active.)
    const { error: pe } = await supabaseAdmin.from("profiles").upsert({
      id: newId,
      display_name: data.display_name,
      level: data.level,
      status: "active",
      bio: data.phone ? `Phone: ${data.phone}` : null,
    });
    if (pe) throw pe;
    return { ok: true, id: newId };
  });

export const adminVerifyUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_users",
      "admin.user.verify_email",
      { target_id: data.id },
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      email_confirm: true,
    });
    if (error) throw error;
    return { ok: true };
  });

export const adminSetUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; status: z.infer<typeof statusEnum> }) =>
    z.object({ id: z.string().uuid(), status: statusEnum }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.id === context.userId) {
      throw new Error("You cannot change your own account status.");
    }
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_users",
      `admin.user.set_status:${data.status}`,
      { target_id: data.id, status: data.status },
    );
    const { error } = await context.supabase
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw error;
    if (data.status === "suspended") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await publishAccountRevocation(supabaseAdmin, {
        userId: data.id,
        reason: "suspended",
        actorId: context.userId,
        metadata: { source: "adminSetUserStatus" },
      });
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabaseAdmin.auth.admin as any).signOut(data.id, "global");
      } catch (e) {
        console.warn("[adminSetUserStatus] signOut failed", e);
      }
    }
    return { ok: true };
  });

export const adminSetUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; role: z.infer<typeof roleEnum>; grant: boolean }) =>
    z.object({ id: z.string().uuid(), role: roleEnum, grant: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.id === context.userId) {
      throw new Error("You cannot modify your own roles. Ask another admin.");
    }
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_users",
      data.grant ? "admin.user.role_grant" : "admin.user.role_revoke",
      { target_id: data.id, role: data.role },
    );
    // Only super_admin can grant or revoke super_admin / admin roles.
    if (data.role === "super_admin" || data.role === "admin") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = context.supabase as any;
      const { data: callerRoles } = await sb
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId);
      const hasSuper = ((callerRoles ?? []) as Array<{ role: string }>).some(
        (r) => r.role === "super_admin",
      );
      if (!hasSuper) {
        throw new Error("Only super_admin can grant or revoke admin / super_admin roles.");
      }
    }
    // Mutate via service-role client — caller already passed manage_users check.
    // Avoids RLS edge cases on user_roles when granting/revoking roles for other users.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.grant) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.id, role: data.role }, { onConflict: "user_id,role" });
      if (error) throw error;
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.id)
        .eq("role", data.role);
      if (error) throw error;
    }
    return { ok: true };
  });

export const adminUpdateUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; display_name?: string; level?: string; bio?: string | null }) =>
    z
      .object({
        id: z.string().uuid(),
        display_name: z.string().trim().min(1).max(120).optional(),
        level: z.string().trim().max(40).optional(),
        bio: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_users",
      "admin.user.update_profile",
      { target_id: data.id, fields: Object.keys(data).filter((k) => k !== "id") },
    );
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("profiles").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

// ============================================================
// Analytics + lifecycle (control center)
// ============================================================
export const adminUserAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (context.supabase as any).rpc("admin_user_analytics");
    if (error) throw error;
    return data as {
      total_users: number;
      deleted_users: number;
      active_24h: number;
      active_7d: number;
      active_30d: number;
      lifetime_active: number;
      total_logins: number;
      avg_session_seconds: number;
      usage_24h: number;
      usage_7d: number;
      usage_30d: number;
    };
  });

export const adminTopUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { order?: "most" | "least"; limit?: number }) =>
    z
      .object({
        order: z.enum(["most", "least"]).default("most"),
        limit: z.number().int().min(1).max(50).default(10),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (context.supabase as any).rpc("admin_top_users", {
      _order: data.order,
      _limit: data.limit,
    });
    if (error) throw error;
    return (rows ?? []) as Array<{
      user_id: string;
      display_name: string;
      total_login_count: number;
      total_usage_seconds: number;
      last_login_at: string | null;
    }>;
  });

export const adminUserSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { userId: string; limit?: number }) =>
    z
      .object({ userId: z.string().uuid(), limit: z.number().int().min(1).max(100).default(20) })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users");
    const { data: rows, error } = await context.supabase
      .from("user_login_events")
      .select("id,login_at,logout_at,duration_seconds,user_agent,device,browser,ip")
      .eq("user_id", data.userId)
      .order("login_at", { ascending: false })
      .limit(data.limit);
    if (error) throw error;
    return rows ?? [];
  });

export const adminSoftDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(
      context.supabase,
      context.userId,
      "manage_users",
      "admin.user.soft_delete",
      { target_id: data.id },
    );
    if (data.id === context.userId) {
      throw new Error("You cannot delete your own account.");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).rpc("admin_soft_delete_user", {
      _id: data.id,
    });
    if (error) throw error;
    // Soft-delete should also kick any active sessions so the UI state and the
    // user's reality match immediately. Non-fatal if it fails.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await publishAccountRevocation(supabaseAdmin, {
        userId: data.id,
        reason: "deleted",
        actorId: context.userId,
        metadata: { source: "adminSoftDeleteUser" },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabaseAdmin.auth.admin as any).signOut(data.id, "global");
    } catch (e) {
      console.warn("[adminSoftDeleteUser] signOut failed", e);
    }
    return { ok: true };
  });

export const adminRestoreUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users", "admin.user.restore", {
      target_id: data.id,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (context.supabase as any).rpc("admin_restore_user", { _id: data.id });
    if (error) throw error;
    return { ok: true };
  });

export const adminHardDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string; confirmName: string }) =>
    z
      .object({
        id: z.string().uuid(),
        confirmName: z.string().transform((v) => v.trim()).pipe(z.string().min(1)),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const tag = `[adminHardDeleteUser:${data.id}]`;
    console.log(`${tag} requested by admin=${context.userId}`);

    await assertPermission(
      context.supabase,
      context.userId,
      "manage_users",
      "admin.user.hard_delete",
      { target_id: data.id },
    );
    if (data.id === context.userId) {
      throw new Error("You cannot delete your own account.");
    }

    // Profile may be missing (orphaned auth record). Don't hard-fail.
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("display_name,email")
      .eq("id", data.id)
      .maybeSingle();
    const profileExists = !!prof;
    console.log(`${tag} profile exists=${profileExists}`);

    // Look up the auth row up front. getUserById can either return {user:null}
    // or throw a "User not found" error depending on SDK version — treat both
    // as "no auth row".
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin.auth.admin as any;

    const safeGetAuthUser = async (id: string) => {
      try {
        const { data: r, error } = await admin.getUserById(id);
        if (error) {
          if (/not.?found|user.*not.*exist/i.test(error.message ?? "")) return null;
          throw error;
        }
        return r?.user ?? null;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/not.?found|user.*not.*exist/i.test(msg)) return null;
        throw e;
      }
    };

    const preAuthUser = await safeGetAuthUser(data.id);
    const targetEmail =
      ((prof as { email?: string } | null)?.email ?? preAuthUser?.email ?? null) || null;
    console.log(
      `${tag} preflight: authExists=${!!preAuthUser} email=${targetEmail ?? "(unknown)"}`,
    );

    if (!profileExists && !preAuthUser) {
      console.log(`${tag} nothing to delete — already gone`);
      return { ok: true, email: null, alreadyGone: true as const };
    }

    await publishAccountRevocation(supabaseAdmin, {
      userId: data.id,
      reason: "deleted",
      actorId: context.userId,
      metadata: { source: "adminHardDeleteUser", profileExists, authExists: !!preAuthUser },
    });
    try {
      await admin.signOut(data.id, "global");
    } catch (e) {
      console.warn(`${tag} pre-delete signOut failed`, e);
    }

    // Confirmation name check — only enforce if we have a profile display_name.
    // For orphaned auth-only records the admin may type the email instead.
    if (profileExists) {
      const expected = (prof?.display_name ?? "").trim();
      const provided = data.confirmName.trim();
      const emailMatch =
        targetEmail && provided.toLowerCase() === targetEmail.toLowerCase();
      if (expected && provided !== expected && !emailMatch) {
        throw new Error("Confirmation name does not match");
      }
    }

    // Phase 1: auth deletion via Supabase Admin API. This is the canonical
    // path that exactly matches Authentication > Users deletion and surfaces
    // the real blocking FK as "Database error deleting user" when production
    // schema drift contains a RESTRICT / NO ACTION auth.users reference.
    let authDeleteOutcome: "deleted" | "already-gone" | "skipped" = "skipped";
    try {
      if (preAuthUser) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: authErr } = await admin.deleteUser(data.id);
        if (authErr) {
          if (/not.?found|user.*not.*exist/i.test(authErr.message ?? "")) {
            console.log(`${tag} Phase 1 auth row already absent (treated as success)`);
            authDeleteOutcome = "already-gone";
          } else {
            console.error(`${tag} Phase 1 auth.admin.deleteUser failed:`, authErr);
            throw authErr;
          }
        } else {
          console.log(`${tag} Phase 1 auth.admin.deleteUser OK`);
          authDeleteOutcome = "deleted";
        }
      } else {
        console.log(`${tag} Phase 1 skipped — no auth row at preflight`);
      }

      // Phase 2: deterministic in-DB cleanup via SECURITY DEFINER RPC. After
      // Auth deletion this removes/NULLs any remaining app rows. If Auth API
      // was skipped because the auth row was already absent, this still cleans
      // orphaned profiles/roles/bans.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: rpcErr } = await (context.supabase as any).rpc("admin_hard_delete_user", {
        _id: data.id,
      });
      if (rpcErr) {
        console.error(`${tag} Phase 2 RPC cleanup failed:`, rpcErr);
        throw rpcErr;
      }
      console.log(`${tag} Phase 2 RPC cleanup OK`);

      // Phase 3: verify auth.users row is gone. Missing == success.
      const postAuthUser = await safeGetAuthUser(data.id);
      if (postAuthUser) {
        console.error(`${tag} Phase 3 verification FAILED — auth.users row still present`);
        throw new Error(
          "User still exists in auth.users after deletion. The email will remain blocked for re-registration.",
        );
      }
      console.log(`${tag} Phase 3 verification OK — auth.users row removed`);

      // Phase 4 (defensive): confirm email isn't held by another auth row.
      if (targetEmail) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: list } = await admin.listUsers({ page: 1, perPage: 200 });
        const stillThere = (list?.users ?? []).find(
          (u: { id: string; email?: string | null }) =>
            u.id !== data.id &&
            (u.email ?? "").toLowerCase() === targetEmail.toLowerCase(),
        );
        if (stillThere) {
          console.error(`${tag} Phase 4 email still registered to id=${stillThere.id}`);
          throw new Error(
            `Email ${targetEmail} is still registered to another auth user (id=${stillThere.id}). Manual cleanup required.`,
          );
        }
        console.log(`${tag} Phase 4 email is free for re-registration`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`${tag} auth deletion error:`, msg);
      throw new Error(
        `Failed to fully remove user from authentication system: ${msg}. ` +
          "Verify SUPABASE_SERVICE_ROLE_KEY is configured in Render and apply supabase/manual_apply/20260625_auth_user_delete_hardening.sql.",
      );
    }

    console.log(`${tag} hard delete complete (auth=${authDeleteOutcome})`);
    return { ok: true, email: targetEmail, authDeleteOutcome };
  });


/**
 * Admin validation tool: check whether a user id or email still has any
 * footprint in Supabase Auth. Returns presence info for auth.users so an
 * admin can confirm a deletion landed end-to-end.
 */
export const adminCheckAuthUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id?: string; email?: string }) =>
    z
      .object({
        id: z.string().uuid().optional(),
        email: z.string().email().optional(),
      })
      .refine((v) => v.id || v.email, { message: "Provide id or email" })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission(context.supabase, context.userId, "manage_users");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin.auth.admin as any;

    let authUser: { id: string; email: string | null; created_at: string } | null = null;

    if (data.id) {
      const { data: r } = await admin.getUserById(data.id);
      if (r?.user)
        authUser = { id: r.user.id, email: r.user.email ?? null, created_at: r.user.created_at };
    }
    if (!authUser && data.email) {
      const needle = data.email.toLowerCase();
      const { data: list } = await admin.listUsers({ page: 1, perPage: 200 });
      const hit = (list?.users ?? []).find(
        (u: { email?: string | null }) => (u.email ?? "").toLowerCase() === needle,
      );
      if (hit) authUser = { id: hit.id, email: hit.email ?? null, created_at: hit.created_at };
    }

    let profile: { id: string; display_name: string | null } | null = null;
    if (authUser?.id || data.id) {
      const lookupId = authUser?.id ?? data.id!;
      const { data: p } = await context.supabase
        .from("profiles")
        .select("id,display_name")
        .eq("id", lookupId)
        .maybeSingle();
      profile = (p as typeof profile) ?? null;
    }

    return {
      existsInAuth: !!authUser,
      authUser,
      existsInProfiles: !!profile,
      profile,
      emailAvailableForSignup: !authUser,
    };
  });