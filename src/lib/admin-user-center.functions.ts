// @ts-nocheck
/* eslint-disable @typescript-eslint/no-explicit-any */
// Phase 2 — User Management Command Center server functions.
// All operations are additive and gated by `manage_users` via assertPermission.
// Each handler is audit-logged through record_admin_action.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPermission } from "@/lib/admin-permissions";
import { publishAccountRevocation } from "@/lib/account-revocation";

import { noInput } from "@/lib/validate";
const uuid = z.string().uuid();

// ============================================================
// Admin notes
// ============================================================
export const listNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { userId: string }) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "notes.list", {
      user_id: data.userId,
    });
    const { data: rows, error } = await (context.supabase as any)
      .from("admin_notes")
      .select("*")
      .eq("user_id", data.userId)
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) =>
    z
      .object({
        userId: uuid,
        title: z.string().trim().max(120).optional(),
        content: z.string().trim().min(1).max(5000),
        note_type: z
          .enum(["warning", "support", "vip", "internal", "investigation"])
          .default("internal"),
        is_pinned: z.boolean().default(false),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "notes.create");
    const { error, data: row } = await (context.supabase as any)
      .from("admin_notes")
      .insert({
        user_id: data.userId,
        admin_id: context.userId,
        title: data.title ?? null,
        content: data.content,
        note_type: data.note_type,
        is_pinned: data.is_pinned,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) =>
    z
      .object({
        id: uuid,
        title: z.string().trim().max(120).nullable().optional(),
        content: z.string().trim().min(1).max(5000).optional(),
        note_type: z.enum(["warning", "support", "vip", "internal", "investigation"]).optional(),
        is_pinned: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "notes.update");
    const { id, ...patch } = data;
    const { error } = await (context.supabase as any)
      .from("admin_notes")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "notes.delete");
    const { error } = await (context.supabase as any).from("admin_notes").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ============================================================
// Tags
// ============================================================
export const listTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { userId: string }) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "tags.list");
    const { data: rows, error } = await (context.supabase as any)
      .from("user_tags")
      .select("*")
      .eq("user_id", data.userId)
      .order("assigned_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const addTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) =>
    z
      .object({
        userId: uuid,
        tag: z.string().trim().min(1).max(40),
        color: z.string().trim().max(20).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "tags.add", {
      user_id: data.userId,
      tag: data.tag,
    });
    const { error } = await (context.supabase as any)
      .from("user_tags")
      .upsert(
        {
          user_id: data.userId,
          tag: data.tag,
          color: data.color ?? null,
          assigned_by: context.userId,
        },
        { onConflict: "user_id,tag" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const removeTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { userId: string; tag: string }) =>
    z.object({ userId: uuid, tag: z.string().min(1).max(40) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "tags.remove");
    const { error } = await (context.supabase as any)
      .from("user_tags")
      .delete()
      .eq("user_id", data.userId)
      .eq("tag", data.tag);
    if (error) throw error;
    return { ok: true };
  });

export const listAllTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "tags.catalog");
    const { data, error } = await (context.supabase as any)
      .from("user_tags")
      .select("tag")
      .limit(2000);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as { tag: string }[])
      counts.set(r.tag, (counts.get(r.tag) ?? 0) + 1);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  });

// ============================================================
// Messages
// ============================================================
export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) =>
    z
      .object({
        userId: uuid,
        kind: z.enum(["message", "warning", "notice", "announcement"]).default("message"),
        subject: z.string().trim().max(200).optional(),
        body: z.string().trim().min(1).max(5000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "messages.send", {
      user_id: data.userId,
      kind: data.kind,
    });
    const { error, data: row } = await (context.supabase as any)
      .from("user_messages")
      .insert({
        from_admin_id: context.userId,
        to_user_id: data.userId,
        kind: data.kind,
        subject: data.subject ?? null,
        body: data.body,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  });

export const listSentMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { userId: string }) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "messages.list");
    const { data: rows, error } = await (context.supabase as any)
      .from("user_messages")
      .select("*")
      .eq("to_user_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return rows ?? [];
  });

export const listMyInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as any)
      .from("user_messages")
      .select("*")
      .eq("to_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data ?? [];
  });

export const markMessageRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { id: string }) => z.object({ id: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .from("user_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("to_user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

// ============================================================
// Bans / Suspensions
// ============================================================
export const applyBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) =>
    z
      .object({
        userId: uuid,
        kind: z.enum(["suspension", "temporary_ban", "permanent_ban"]).default("suspension"),
        reason: z.string().trim().max(500).optional(),
        durationHours: z.number().int().min(1).max(24 * 365).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "ban.apply", {
      user_id: data.userId,
      kind: data.kind,
    });
    if (data.userId === context.userId) {
      throw new Error("You cannot ban your own account.");
    }
    const endsAt =
      data.kind === "permanent_ban"
        ? null
        : data.durationHours
          ? new Date(Date.now() + data.durationHours * 3600_000).toISOString()
          : null;

    const { supabaseAdmin: _sa } = await import("@/integrations/supabase/client.server"); const supabaseAdmin: any = _sa as any;

    // Refuse to ban another admin/super_admin via this path (must be demoted first).
    const { data: targetRoles } = await (context.supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    const isPrivileged = ((targetRoles ?? []) as Array<{ role: string }>).some(
      (r) => r.role === "admin" || r.role === "super_admin" || r.role === "moderator",
    );
    if (isPrivileged) {
      throw new Error("Cannot ban a privileged user (admin / super_admin / moderator). Demote them first.");
    }

    const { error: insErr } = await supabaseAdmin.from("user_bans").insert({
      user_id: data.userId,
      admin_id: context.userId,
      kind: data.kind,
      reason: data.reason ?? null,
      ends_at: endsAt,
    });
    if (insErr) throw insErr;

    await supabaseAdmin
      .from("profiles")
      .update({
        status: "suspended",
        ban_until: endsAt,
        ban_reason: data.reason ?? null,
      })
      .eq("id", data.userId);
    await publishAccountRevocation(supabaseAdmin, {
      userId: data.userId,
      reason: "banned",
      actorId: context.userId,
      metadata: { source: "applyBan", kind: data.kind, ends_at: endsAt },
    });

    // Native Supabase auth-level ban: blocks all sign-in attempts and
    // refresh-token exchanges until banned_until passes (or "none" lifts it).
    // For permanent bans we use ~100y so Supabase rejects future logins.
    const banDuration =
      data.kind === "permanent_ban"
        ? `${24 * 365 * 100}h`
        : data.durationHours
          ? `${data.durationHours}h`
          : `${24 * 365 * 100}h`; // indefinite suspension defaults to ~100y
    try {
      await (supabaseAdmin.auth.admin as any).updateUserById(data.userId, {
        ban_duration: banDuration,
      });
    } catch (e) {
      console.warn("[applyBan] ban_duration update failed", e);
    }

    // Force logout active sessions globally.
    try {
      await (supabaseAdmin.auth.admin as any).signOut(data.userId, "global");
    } catch (e) {
      console.warn("[applyBan] signOut failed", e);
    }
    return { ok: true, ends_at: endsAt };
  });

export const liftBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { userId: string }) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "ban.lift", {
      user_id: data.userId,
    });
    const { supabaseAdmin: _sa } = await import("@/integrations/supabase/client.server"); const supabaseAdmin: any = _sa as any;
    const now = new Date().toISOString();
    await supabaseAdmin
      .from("user_bans")
      .update({ lifted_at: now, lifted_by: context.userId })
      .eq("user_id", data.userId)
      .is("lifted_at", null);
    await supabaseAdmin
      .from("profiles")
      .update({ status: "active", ban_until: null, ban_reason: null })
      .eq("id", data.userId);
    // Clear native Supabase auth ban so the user can sign in again.
    try {
      await (supabaseAdmin.auth.admin as any).updateUserById(data.userId, {
        ban_duration: "none",
      });
    } catch (e) {
      console.warn("[liftBan] ban_duration clear failed", e);
    }
    return { ok: true };
  });

export const listBans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { userId: string }) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "ban.list");
    const { data: rows, error } = await (context.supabase as any)
      .from("user_bans")
      .select("*")
      .eq("user_id", data.userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const listActiveBans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "ban.active");
    const { data, error } = await (context.supabase as any)
      .from("user_bans")
      .select("id,user_id,kind,reason,starts_at,ends_at,created_at")
      .is("lifted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await (context.supabase as any)
        .from("profiles")
        .select("id,display_name")
        .in("id", ids);
      nameMap = new Map((profs ?? []).map((p: any) => [p.id, p.display_name]));
    }
    return (data ?? []).map((r: any) => ({
      ...r,
      display_name: nameMap.get(r.user_id) ?? "Unknown",
    }));
  });

// ============================================================
// Sessions
// ============================================================
export const revokeAllSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { userId: string }) => z.object({ userId: uuid }).parse(i))
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "sessions.revoke_all");
    const { supabaseAdmin: _sa } = await import("@/integrations/supabase/client.server"); const supabaseAdmin: any = _sa as any;
    await (supabaseAdmin.auth.admin as any).signOut(data.userId, "global");
    return { ok: true };
  });

// ============================================================
// Timeline (unified)
// ============================================================
export const getUserTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) =>
    z
      .object({
        userId: uuid,
        days: z.number().int().min(1).max(365).default(90),
        kinds: z.array(z.enum(["login", "admin", "ban", "message", "note"])).optional(),
        search: z.string().trim().max(120).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "timeline.read");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const sb: any = (context.supabase as any) as any;

    const [logins, actions, bans, msgs, notes] = await Promise.all([
      sb
        .from("user_login_events")
        .select("id,login_at,logout_at,ip,device,browser")
        .eq("user_id", data.userId)
        .gte("login_at", since)
        .order("login_at", { ascending: false })
        .limit(200),
      sb
        .from("admin_action_log")
        .select("id,permission,action,allowed,metadata,created_at,user_id")
        .gte("created_at", since)
        .contains("metadata", { user_id: data.userId } as any)
        .order("created_at", { ascending: false })
        .limit(200),
      sb
        .from("user_bans")
        .select("id,kind,reason,starts_at,ends_at,lifted_at,created_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      sb
        .from("user_messages")
        .select("id,kind,subject,created_at,read_at")
        .eq("to_user_id", data.userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100),
      sb
        .from("admin_notes")
        .select("id,note_type,title,content,created_at")
        .eq("user_id", data.userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    type Event = {
      id: string;
      at: string;
      kind: string;
      label: string;
      detail?: string;
    };
    const items: Event[] = [];

    for (const r of (logins.data ?? []) as any[]) {
      items.push({
        id: `login-${r.id}`,
        at: r.login_at,
        kind: "login",
        label: r.logout_at ? "Login (ended)" : "Login",
        detail: [r.device, r.browser, r.ip].filter(Boolean).join(" · "),
      });
    }
    for (const r of (actions.data ?? []) as any[]) {
      items.push({
        id: `act-${r.id}`,
        at: r.created_at,
        kind: "admin",
        label: r.action || r.permission,
        detail: r.allowed ? "Allowed" : "Denied",
      });
    }
    for (const r of (bans.data ?? []) as any[]) {
      items.push({
        id: `ban-${r.id}`,
        at: r.created_at,
        kind: "ban",
        label: r.lifted_at ? `${r.kind} (lifted)` : r.kind,
        detail: r.reason ?? undefined,
      });
    }
    for (const r of (msgs.data ?? []) as any[]) {
      items.push({
        id: `msg-${r.id}`,
        at: r.created_at,
        kind: "message",
        label: `Message: ${r.kind}`,
        detail: r.subject ?? undefined,
      });
    }
    for (const r of (notes.data ?? []) as any[]) {
      items.push({
        id: `note-${r.id}`,
        at: r.created_at,
        kind: "note",
        label: `Note: ${r.note_type}`,
        detail: r.title ?? r.content?.slice(0, 80),
      });
    }

    let filtered = items;
    if (data.kinds?.length) {
      const allowed = new Set<string>(data.kinds);
      filtered = filtered.filter((e) => allowed.has(e.kind));
    }
    if (data.search) {
      const s = data.search.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.label.toLowerCase().includes(s) || (e.detail ?? "").toLowerCase().includes(s),
      );
    }
    filtered.sort((a, b) => (a.at < b.at ? 1 : -1));
    return filtered.slice(0, 500);
  });

// ============================================================
// Segments
// ============================================================
export const getSegments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "segments.read");
    const sb: any = (context.supabase as any) as any;
    const now = Date.now();
    const d7 = new Date(now - 7 * 86_400_000).toISOString();
    const d30 = new Date(now - 30 * 86_400_000).toISOString();
    const d90 = new Date(now - 90 * 86_400_000).toISOString();

    const [newU, active7, inactive30, suspended, verified, power, total] = await Promise.all([
      sb.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", d7),
      sb.from("profiles").select("id", { count: "exact", head: true }).gte("last_login_at", d7),
      sb.from("profiles").select("id", { count: "exact", head: true }).lt("last_login_at", d30),
      sb.from("profiles").select("id", { count: "exact", head: true }).eq("status", "suspended"),
      sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("email_verified", true as any),
      sb
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("total_usage_seconds", 3600 * 20),
      sb.from("profiles").select("id", { count: "exact", head: true }),
    ]);

    const seg = (key: string, label: string, count: number, hint?: string) => ({
      key,
      label,
      count: count ?? 0,
      hint: hint ?? "",
    });
    return [
      seg("new", "New Users (7d)", newU.count ?? 0, "Signed up in last 7 days"),
      seg("active", "Active (7d)", active7.count ?? 0, "Logged in last 7 days"),
      seg("inactive", "Inactive (30d+)", inactive30.count ?? 0, "No login in 30+ days"),
      seg("suspended", "Suspended", suspended.count ?? 0, "Currently suspended"),
      seg("verified", "Verified", verified.count ?? 0, "Email verified"),
      seg("power", "Power Users", power.count ?? 0, "20+ hours total usage"),
      seg("returning", "Returning (90d)", power.count ?? 0, d90 ? "Active last 90 days" : ""),
      seg("total", "Total", total.count ?? 0, "All accounts"),
    ];
  });

// ============================================================
// Growth / Signup trends
// ============================================================
export const signupTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: { days?: number }) =>
    z.object({ days: z.number().int().min(7).max(180).default(30) }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "growth.signups");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await (context.supabase as any)
      .from("profiles")
      .select("created_at")
      .gte("created_at", since)
      .limit(10_000);
    if (error) throw error;
    const buckets = new Map<string, number>();
    for (const r of (rows ?? []) as { created_at: string }[]) {
      const day = r.created_at.slice(0, 10);
      buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
    const series: { day: string; count: number }[] = [];
    for (let i = data.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      series.push({ day: d, count: buckets.get(d) ?? 0 });
    }
    return { series, total: rows?.length ?? 0 };
  });

// ============================================================
// Bulk operations
// ============================================================
export const bulkAssignTag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) =>
    z
      .object({
        userIds: z.array(uuid).min(1).max(500),
        tag: z.string().trim().min(1).max(40),
        color: z.string().max(20).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "tags.bulk", {
      tag: data.tag,
      count: data.userIds.length,
    });
    const rows = data.userIds.map((id) => ({
      user_id: id,
      tag: data.tag,
      color: data.color ?? null,
      assigned_by: context.userId,
    }));
    const { error } = await (context.supabase as any)
      .from("user_tags")
      .upsert(rows, { onConflict: "user_id,tag" });
    if (error) throw error;
    return { ok: true, count: rows.length };
  });

export const bulkBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: any) =>
    z
      .object({
        userIds: z.array(uuid).min(1).max(200),
        kind: z.enum(["suspension", "temporary_ban", "permanent_ban"]).default("suspension"),
        reason: z.string().trim().max(500).optional(),
        durationHours: z.number().int().min(1).max(24 * 365).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertPermission((context.supabase as any), context.userId, "manage_users", "ban.bulk", {
      count: data.userIds.length,
      kind: data.kind,
    });
    // Drop self and any admin targets — admins must be demoted before banning.
    const filteredIds: string[] = [];
    for (const id of data.userIds) {
      if (id === context.userId) continue;
      const { data: isAdmin } = await (context.supabase as any).rpc("has_role", {
        _user_id: id,
        _role: "admin",
      });
      if (isAdmin === true) continue;
      filteredIds.push(id);
    }
    if (filteredIds.length === 0) {
      return { ok: true, count: 0, skipped: data.userIds.length };
    }
    const { supabaseAdmin: _sa } = await import("@/integrations/supabase/client.server"); const supabaseAdmin: any = _sa as any;
    const endsAt =
      data.kind === "permanent_ban"
        ? null
        : data.durationHours
          ? new Date(Date.now() + data.durationHours * 3600_000).toISOString()
          : null;
    const rows = filteredIds.map((id) => ({
      user_id: id,
      admin_id: context.userId,
      kind: data.kind,
      reason: data.reason ?? null,
      ends_at: endsAt,
    }));
    const { error } = await supabaseAdmin.from("user_bans").insert(rows);
    if (error) throw error;
    await supabaseAdmin
      .from("profiles")
      .update({ status: "suspended", ban_until: endsAt, ban_reason: data.reason ?? null })
      .in("id", filteredIds);
    await Promise.all(
      filteredIds.map((id) =>
        publishAccountRevocation(supabaseAdmin, {
          userId: id,
          reason: "banned",
          actorId: context.userId,
          metadata: { source: "bulkBan", kind: data.kind, ends_at: endsAt },
        }),
      ),
    );
    const banDuration =
      data.kind === "permanent_ban"
        ? `${24 * 365 * 100}h`
        : data.durationHours
          ? `${data.durationHours}h`
          : `${24 * 365 * 100}h`;
    for (const id of filteredIds) {
      try {
        await (supabaseAdmin.auth.admin as any).updateUserById(id, {
          ban_duration: banDuration,
        });
      } catch {
        /* keep going */
      }
      try {
        await (supabaseAdmin.auth.admin as any).signOut(id, "global");
      } catch {
        /* keep going */
      }
    }
    return { ok: true, count: filteredIds.length, skipped: data.userIds.length - filteredIds.length };
  });

// Lightweight self-check used by the client to detect "you've been banned".
export const checkMyBan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    try {
      const { data, error } = await (context.supabase as any).rpc("is_user_banned", {
        _user_id: context.userId,
      });
      if (error) throw error;
      return { banned: data === true, degraded: false };
    } catch (error) {
      console.warn("[checkMyBan] ban lookup degraded", {
        userId: context.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { banned: false, degraded: true };
    }
  });