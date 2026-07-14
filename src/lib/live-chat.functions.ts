// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { noInput } from "@/lib/validate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (x: unknown) => x as any;

// ============================================================
// Types
// ============================================================
export type ChatStatus = "new" | "open" | "pending" | "waiting_user" | "resolved" | "closed";
export type ChatPriority = "low" | "normal" | "high" | "urgent";
export type ChatSender = "user" | "staff" | "system";

export type ChatSettings = {
  enabled: boolean;
  position: "bottom-right" | "bottom-left";
  theme_color: string;
  welcome_message: string;
  offline_message: string;
  email_notifications: boolean;
  sound_notifications: boolean;
  auto_assignment_enabled: boolean;
  attachment_max_mb: number;
  rate_limit_per_minute: number;
  // Launcher branding
  button_text: string;
  tooltip_text: string;
  icon_name: string;
  show_label: boolean;
  show_launcher: boolean;
};

export type ChatConversation = {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_email: string | null;
  subject: string | null;
  title: string | null;
  status: ChatStatus;
  priority: ChatPriority;
  assigned_to: string | null;
  is_blocked: boolean;
  unread_for_user: number;
  unread_for_staff: number;
  last_message_at: string;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  // joined display fields (admin views)
  display_name?: string | null;
  display_email?: string | null;
  user_role?: string | null;
  user_last_seen_at?: string | null;
  user_online?: boolean;
  assigned_to_name?: string | null;
  assigned_to_role?: string | null;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_type: ChatSender;
  sender_user_id: string | null;
  body: string | null;
  attachments: Array<{ path?: string; name?: string; type?: string; size?: number }>;
  delivered_at: string | null;
  read_at: string | null;
  is_deleted: boolean;
  created_at: string;
  sender_name?: string | null;
  sender_role?: string | null;
};


export type ChatNote = {
  id: string;
  conversation_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

export type StaffMember = {
  id: string;
  name: string;
  email: string | null;
  role: string;
};

// ============================================================
// Helpers
// ============================================================
// Role lookup goes directly through supabaseAdmin (service role, bypasses RLS)
// so chat permission checks never fail due to RPC/enum-cast quirks or missing
// EXECUTE grants. This is the single source of truth for staff capability
// in the live-chat server functions.
type StaffRoles = { roles: Set<string>; isStaff: boolean; isAdmin: boolean; isSuperAdmin: boolean; isModerator: boolean };

async function loadRoles(userId: string): Promise<StaffRoles> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await asAny(supabaseAdmin)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) {
    console.error("[live-chat][loadRoles] failed", { userId, message: error.message });
    throw new Error("Permission lookup failed");
  }
  const roles = new Set<string>(((data ?? []) as Array<{ role: string }>).map((r) => String(r.role)));
  const isAdmin = roles.has("admin");
  const isSuperAdmin = roles.has("super_admin");
  const isModerator = roles.has("moderator");
  return { roles, isAdmin, isSuperAdmin, isModerator, isStaff: isAdmin || isSuperAdmin || isModerator };
}

// `permission` is informational — capability is derived from the role.
// Moderator => view/reply/close. Admin/Super Admin => everything.
async function ensureStaff(_supabase: any, userId: string, permission?: string) {
  const r = await loadRoles(userId);
  if (!r.isStaff) throw new Error("Forbidden: not authorized for support");
  if (permission === "manage_settings" || permission === "delete_message" || permission === "assign") {
    if (!(r.isAdmin || r.isSuperAdmin)) {
      throw new Error(`Forbidden: missing '${permission}' permission`);
    }
  }
  // view / reply / close => any staff role (moderator included)
}

async function ensureSuperAdmin(_supabase: any, userId: string) {
  const r = await loadRoles(userId);
  if (!r.isSuperAdmin) throw new Error("Forbidden: super admin role required");
}

async function ensureChatAdmin(_supabase: any, userId: string) {
  const r = await loadRoles(userId);
  if (!r.isAdmin && !r.isSuperAdmin) throw new Error("Forbidden: admin role required");
}

export type MyChatPermissions = {
  userId: string;
  roles: string[];
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isModerator: boolean;
  isStaff: boolean;
  canReply: boolean;
  canAssign: boolean;
  canDelete: boolean;
  canManageSettings: boolean;
};

export const getMyChatPermissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    const r = await loadRoles(context.userId);
    return {
      userId: context.userId,
      roles: Array.from(r.roles),
      isAuthenticated: true,
      isSuperAdmin: r.isSuperAdmin,
      isAdmin: r.isAdmin,
      isModerator: r.isModerator,
      isStaff: r.isStaff,
      canReply: r.isStaff,
      canAssign: r.isSuperAdmin,
      canDelete: r.isAdmin || r.isSuperAdmin,
      canManageSettings: r.isAdmin || r.isSuperAdmin,
    } satisfies MyChatPermissions;
  });

const sanitizeBody = (s: string) =>
  s.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 4000);

async function getOwnedConversation(supabaseAdmin: any, conversationId: string, userId: string) {
  const { data: conv, error } = await asAny(supabaseAdmin)
    .from("live_chat_conversations")
    .select("id,user_id,is_blocked")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!conv || conv.user_id !== userId) throw new Error("Not your conversation");
  return conv as { id: string; user_id: string; is_blocked: boolean };
}

/** Look up auth emails for a set of user ids using supabaseAdmin. */
async function lookupAuthEmails(
  supabaseAdmin: any,
  ids: string[],
): Promise<Map<string, { email: string | null; last_sign_in_at: string | null }>> {
  const out = new Map<string, { email: string | null; last_sign_in_at: string | null }>();
  if (ids.length === 0) return out;
  const idSet = new Set(ids);
  const maxPages = 8;
  for (let page = 1; page <= maxPages && idSet.size > out.size; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) break;
    const users = (data?.users ?? []) as Array<{
      id: string;
      email?: string | null;
      last_sign_in_at?: string | null;
    }>;
    for (const u of users) {
      if (idSet.has(u.id)) {
        out.set(u.id, {
          email: u.email ?? null,
          last_sign_in_at: u.last_sign_in_at ?? null,
        });
      }
    }
    if (users.length < 200) break;
  }
  for (const id of ids) if (!out.has(id)) out.set(id, { email: null, last_sign_in_at: null });
  return out;
}

async function lookupTopRoles(supabaseAdmin: any, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids);
  const RANK: Record<string, number> = { super_admin: 5, admin: 4, moderator: 3, student: 2, user: 1 };
  for (const r of (data ?? []) as Array<{ user_id: string; role: string }>) {
    const prev = out.get(r.user_id);
    if (!prev || (RANK[r.role] ?? 0) > (RANK[prev] ?? 0)) out.set(r.user_id, r.role);
  }
  return out;
}

// ============================================================
// SETTINGS
// ============================================================
export const getChatSettings = createServerFn({ method: "GET" })
  .validator(noInput)
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await asAny(supabaseAdmin)
      .from("live_chat_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) throw new Error(error.message);
    return data as ChatSettings;
  });

const settingsUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  position: z.enum(["bottom-right", "bottom-left"]).optional(),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  welcome_message: z.string().min(1).max(500).optional(),
  offline_message: z.string().min(1).max(500).optional(),
  email_notifications: z.boolean().optional(),
  sound_notifications: z.boolean().optional(),
  auto_assignment_enabled: z.boolean().optional(),
  attachment_max_mb: z.number().int().min(1).max(50).optional(),
  rate_limit_per_minute: z.number().int().min(1).max(120).optional(),
  button_text: z.string().min(1).max(40).optional(),
  tooltip_text: z.string().min(1).max(80).optional(),
  icon_name: z.enum(["message-circle", "headphones", "life-buoy", "bot", "sparkles", "send"]).optional(),
  show_label: z.boolean().optional(),
  show_launcher: z.boolean().optional(),
});

export const updateChatSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => settingsUpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId, "manage_settings");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await asAny(supabaseAdmin)
      .from("live_chat_settings")
      .update(data)
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// USER SIDE — multi-conversation
// ============================================================

/** @deprecated kept for back-compat: returns latest open or creates new. */
export const getOrCreateMyConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing, error: e1 } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .select("*")
      .eq("user_id", userId)
      .not("status", "eq", "closed")
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (existing) return existing as ChatConversation;

    const { data: created, error: e2 } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .insert({ user_id: userId, status: "new" })
      .select("*")
      .single();
    if (e2) throw new Error(e2.message);
    return created as ChatConversation;
  });

export const listMyConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await asAny(context.supabase)
      .from("live_chat_conversations")
      .select("*")
      .eq("user_id", context.userId)
      .is("user_hidden_at", null)
      .order("last_message_at", { ascending: false });
    if (error) {
      const fallback = await asAny(supabaseAdmin)
        .from("live_chat_conversations")
        .select("*")
        .eq("user_id", context.userId)
        .is("user_hidden_at", null)
        .order("last_message_at", { ascending: false });
      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data ?? []) as ChatConversation[];
    }
    return (data ?? []) as ChatConversation[];
  });

// Student-side soft delete: hide conversation from the current user's view only.
// Admin/staff queries use the service role and continue to see the conversation.
export const userHideConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await getOwnedConversation(supabaseAdmin, data.conversation_id, context.userId);
    const { error } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .update({ user_hidden_at: new Date().toISOString() })
      .eq("id", data.conversation_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const startConversationSchema = z
  .object({
    subject: z.string().max(200).optional(),
    first_message: z.string().max(4000).optional(),
  })
  .optional()
  .default({});

export const startNewConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => startConversationSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const subject = data.subject?.trim() || null;
    const firstMessage = data.first_message ? sanitizeBody(data.first_message) : "";
    const fallbackFromMessage = firstMessage
      ? firstMessage.split(/\s+/).filter(Boolean).slice(0, 8).join(" ")
      : null;
    const inferredTitle = subject || fallbackFromMessage;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .insert({
        user_id: context.userId,
        status: "new",
        subject,
        title: inferredTitle,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (firstMessage) {
      const { error: messageError } = await asAny(supabaseAdmin)
        .from("live_chat_messages")
        .insert({
          conversation_id: created.id,
          sender_type: "user",
          sender_user_id: context.userId,
          body: firstMessage,
          delivered_at: new Date().toISOString(),
        });
      if (messageError) {
        await asAny(supabaseAdmin)
          .from("live_chat_conversations")
          .delete()
          .eq("id", created.id);
        throw new Error(messageError.message);
      }
    }
    return created as ChatConversation;
  });

const conversationIdSchema = z.object({ conversation_id: z.string().uuid() });

export const listConversationMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await getOwnedConversation(supabaseAdmin, data.conversation_id, context.userId);
    const { data: rows, error } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as ChatMessage[];
  });

const sendMessageSchema = z.object({
  conversation_id: z.string().uuid(),
  body: z.string().min(1).max(4000),
});

export const userSendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const body = sanitizeBody(data.body);
    if (!body) throw new Error("Message is empty");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const conv = await getOwnedConversation(supabaseAdmin, data.conversation_id, context.userId);
    if (conv.is_blocked) throw new Error("This conversation is blocked");

    const { data: msg, error } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .insert({
        conversation_id: data.conversation_id,
        sender_type: "user",
        sender_user_id: context.userId,
        body,
        delivered_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    try {
      const { data: admins } = await asAny(supabaseAdmin)
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);
      const recipients = new Set<string>((admins ?? []).map((r: any) => r.user_id));
      const { data: convRow } = await asAny(supabaseAdmin)
        .from("live_chat_conversations")
        .select("assigned_to")
        .eq("id", data.conversation_id)
        .single();
      if (convRow?.assigned_to) recipients.add(convRow.assigned_to);
      if (recipients.size > 0) {
        await asAny(supabaseAdmin)
          .from("live_chat_notifications")
          .insert(
            Array.from(recipients).map((rid) => ({
              recipient_id: rid,
              conversation_id: data.conversation_id,
              kind: "new_message",
              payload: { preview: body.slice(0, 120) },
            })),
          );
      }
    } catch {
      /* non-blocking */
    }

    return msg as ChatMessage;
  });

export const userMarkRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await getOwnedConversation(supabaseAdmin, data.conversation_id, context.userId);
    const { error } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .update({ unread_for_user: 0, user_last_seen_at: now })
      .eq("id", data.conversation_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const { error: messageError } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .update({ read_at: now })
      .eq("conversation_id", data.conversation_id)
      .eq("sender_type", "staff")
      .is("read_at", null);
    if (messageError) throw new Error(messageError.message);
    return { ok: true };
  });

// ============================================================
// ADMIN / STAFF
// ============================================================
const adminListSchema = z
  .object({
    filter: z
      .enum(["all", "unread", "open", "pending", "closed", "mine", "high_priority"])
      .optional(),
    search: z.string().max(200).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .optional()
  .default({});

const ONLINE_WINDOW_MS = 5 * 60_000;

export const adminListConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => adminListSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId, "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(data.limit ?? 200);

    switch (data.filter) {
      case "unread":
        q = q.gt("unread_for_staff", 0);
        break;
      case "open":
        q = q.in("status", ["new", "open", "waiting_user"]);
        break;
      case "pending":
        q = q.eq("status", "pending");
        break;
      case "closed":
        q = q.in("status", ["resolved", "closed"]);
        break;
      case "mine":
        q = q.eq("assigned_to", context.userId);
        break;
      case "high_priority":
        q = q.in("priority", ["high", "urgent"]);
        break;
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const convs = (rows ?? []) as ChatConversation[];

    const userIds = Array.from(new Set(convs.map((c) => c.user_id).filter(Boolean) as string[]));
    const assigneeIds = Array.from(
      new Set(convs.map((c) => c.assigned_to).filter(Boolean) as string[]),
    );
    const allIds = Array.from(new Set([...userIds, ...assigneeIds]));

    let profilesById = new Map<string, { display_name: string | null; avatar_url: string | null }>();
    if (allIds.length > 0) {
      const { data: profs } = await asAny(supabaseAdmin)
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", allIds);
      profilesById = new Map(
        (profs ?? []).map((p: any) => [
          p.id,
          { display_name: p.display_name, avatar_url: p.avatar_url },
        ]),
      );
    }
    const emailsById = await lookupAuthEmails(supabaseAdmin, allIds);
    const rolesById = await lookupTopRoles(supabaseAdmin, allIds);

    const now = Date.now();
    const enriched = convs.map((c) => {
      const p = c.user_id ? profilesById.get(c.user_id) : undefined;
      const ae = c.user_id ? emailsById.get(c.user_id) : undefined;
      const userRole = c.user_id ? rolesById.get(c.user_id) ?? "user" : null;
      const lastSeen = c.user_last_seen_at ? new Date(c.user_last_seen_at).getTime() : 0;
      const online = lastSeen > 0 && now - lastSeen < ONLINE_WINDOW_MS;

      const assignee = c.assigned_to ? profilesById.get(c.assigned_to) : undefined;
      const assigneeRole = c.assigned_to ? rolesById.get(c.assigned_to) ?? "staff" : null;

      return {
        ...c,
        display_name:
          p?.display_name ?? c.guest_name ?? ae?.email ?? `User ${c.user_id?.slice(0, 6) ?? ""}`,
        display_email: ae?.email ?? c.guest_email ?? null,
        user_role: userRole,
        user_online: online,
        assigned_to_name: assignee?.display_name ?? null,
        assigned_to_role: assigneeRole,
      } satisfies ChatConversation;
    });

    if (data.search && data.search.trim()) {
      const s = data.search.toLowerCase();
      return enriched.filter(
        (c) =>
          (c.display_name ?? "").toLowerCase().includes(s) ||
          (c.display_email ?? "").toLowerCase().includes(s) ||
          c.id.toLowerCase().includes(s) ||
          (c.last_message_preview ?? "").toLowerCase().includes(s),
      );
    }
    return enriched;
  });

export const adminGetConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId, "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv, error } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .select("*")
      .eq("id", data.conversation_id)
      .single();
    if (error) throw new Error(error.message);

    let profile: {
      id: string;
      display_name: string | null;
      email: string | null;
      avatar_url: string | null;
      role: string | null;
      created_at: string | null;
      last_sign_in_at: string | null;
      total_conversations: number;
      active_conversations: number;
    } | null = null;
    let previousConversations: ChatConversation[] = [];
    let assignee: StaffMember | null = null;

    if (conv?.user_id) {
      const [{ data: p }, emails, roles] = await Promise.all([
        asAny(supabaseAdmin)
          .from("profiles")
          .select("id, display_name, avatar_url, created_at")
          .eq("id", conv.user_id)
          .maybeSingle(),
        lookupAuthEmails(supabaseAdmin, [conv.user_id]),
        lookupTopRoles(supabaseAdmin, [conv.user_id]),
      ]);
      const ae = emails.get(conv.user_id);
      const { data: priors } = await asAny(supabaseAdmin)
        .from("live_chat_conversations")
        .select("id, subject, status, last_message_at, last_message_preview, created_at")
        .eq("user_id", conv.user_id)
        .neq("id", conv.id)
        .order("last_message_at", { ascending: false })
        .limit(20);
      const { count: total } = await asAny(supabaseAdmin)
        .from("live_chat_conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", conv.user_id);
      const { count: active } = await asAny(supabaseAdmin)
        .from("live_chat_conversations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", conv.user_id)
        .not("status", "in", "(closed,resolved)");

      previousConversations = (priors ?? []) as ChatConversation[];
      profile = {
        id: conv.user_id,
        display_name: p?.display_name ?? null,
        email: ae?.email ?? null,
        avatar_url: p?.avatar_url ?? null,
        role: roles.get(conv.user_id) ?? "user",
        created_at: p?.created_at ?? null,
        last_sign_in_at: ae?.last_sign_in_at ?? null,
        total_conversations: total ?? 0,
        active_conversations: active ?? 0,
      };
    }

    if (conv?.assigned_to) {
      const [{ data: ap }, emails, roles] = await Promise.all([
        asAny(supabaseAdmin)
          .from("profiles")
          .select("id, display_name")
          .eq("id", conv.assigned_to)
          .maybeSingle(),
        lookupAuthEmails(supabaseAdmin, [conv.assigned_to]),
        lookupTopRoles(supabaseAdmin, [conv.assigned_to]),
      ]);
      assignee = {
        id: conv.assigned_to,
        name: ap?.display_name ?? "Staff",
        email: emails.get(conv.assigned_to)?.email ?? null,
        role: roles.get(conv.assigned_to) ?? "staff",
      };
    }

    const { data: history } = await asAny(supabaseAdmin)
      .from("live_chat_assignment_history")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: false })
      .limit(20);

    return {
      conversation: conv as ChatConversation,
      profile,
      previousConversations,
      assignee,
      assignmentHistory: history ?? [],
    };
  });

export const adminListMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId, "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .eq("is_deleted", false)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const msgs = (rows ?? []) as ChatMessage[];
    const ids = Array.from(
      new Set(msgs.map((m) => m.sender_user_id).filter((x): x is string => !!x))
    );
    if (ids.length > 0) {
      const [{ data: profs }, roles] = await Promise.all([
        asAny(supabaseAdmin).from("profiles").select("id, display_name").in("id", ids),
        lookupTopRoles(supabaseAdmin, ids),
      ]);
      const nameMap = new Map<string, string | null>(
        ((profs ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [
          p.id,
          p.display_name,
        ])
      );
      for (const m of msgs) {
        if (m.sender_user_id) {
          m.sender_name = nameMap.get(m.sender_user_id) ?? null;
          m.sender_role = roles.get(m.sender_user_id) ?? null;
        }
      }
    }
    return msgs;
  });


export const adminSendReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => sendMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId, "reply");
    const body = sanitizeBody(data.body);
    if (!body) throw new Error("Message empty");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv, error: convError } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .select("id,is_blocked")
      .eq("id", data.conversation_id)
      .maybeSingle();
    if (convError) throw new Error(convError.message);
    if (!conv) throw new Error("Conversation not found");
    if (conv.is_blocked) throw new Error("This conversation is blocked");
    const { data: msg, error } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .insert({
        conversation_id: data.conversation_id,
        sender_type: "staff",
        sender_user_id: context.userId,
        body,
        delivered_at: new Date().toISOString(),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return msg as ChatMessage;
  });

export const adminMarkRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId, "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .update({ unread_for_staff: 0, staff_last_seen_at: now })
      .eq("id", data.conversation_id);
    await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .update({ read_at: now })
      .eq("conversation_id", data.conversation_id)
      .eq("sender_type", "user")
      .is("read_at", null);
    return { ok: true };
  });

const updateConvSchema = z.object({
  conversation_id: z.string().uuid(),
  status: z.enum(["new", "open", "pending", "waiting_user", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  is_blocked: z.boolean().optional(),
});

export const adminUpdateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => updateConvSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId, "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { conversation_id, ...patch } = data;
    if (patch.status === "closed" || patch.status === "resolved") {
      await ensureStaff(context.supabase, context.userId, "close");
    }
    const { error } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .update(patch)
      .eq("id", conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- Assignment (super_admin only) -----
const assignSchema = z.object({
  conversation_id: z.string().uuid(),
  assigned_to: z.string().uuid().nullable(),
  note: z.string().max(500).optional(),
});

export const adminAssignConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => assignSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prev } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .select("assigned_to")
      .eq("id", data.conversation_id)
      .single();

    const { error } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .update({ assigned_to: data.assigned_to })
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);

    await asAny(supabaseAdmin).from("live_chat_assignment_history").insert({
      conversation_id: data.conversation_id,
      assigned_to: data.assigned_to,
      assigned_by: context.userId,
      previous_assignee: prev?.assigned_to ?? null,
      note: data.note ?? null,
    });

    if (data.assigned_to) {
      await asAny(supabaseAdmin).from("live_chat_notifications").insert({
        recipient_id: data.assigned_to,
        conversation_id: data.conversation_id,
        kind: "assigned",
        payload: { by: context.userId },
      });
    }
    return { ok: true };
  });

// ----- Delete (super_admin only) -----
const deleteMessageSchema = z.object({ message_id: z.string().uuid() });
export const adminDeleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => deleteMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Remove any attached storage objects first
    const { data: msg } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .select("attachments")
      .eq("id", data.message_id)
      .single();
    const paths: string[] = ((msg?.attachments ?? []) as Array<{ path?: string }>)
      .map((a) => a?.path ?? "")
      .filter(Boolean);
    if (paths.length > 0) {
      try {
        await asAny(supabaseAdmin).storage.from("chat-attachments").remove(paths);
      } catch {
        /* non-blocking */
      }
    }
    const { error } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .delete()
      .eq("id", data.message_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ----- User-side delete: a user may delete only their OWN messages -----
// (sender_type='user' AND sender_user_id = context.userId). Staff/admin deletes
// continue to go through adminDeleteMessage above.
const userDeleteMessageSchema = z.object({ message_id: z.string().uuid() });
export const userDeleteMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => userDeleteMessageSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: msg, error: loadErr } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .select("id, sender_type, sender_user_id, attachments, conversation_id")
      .eq("id", data.message_id)
      .maybeSingle();
    if (loadErr) throw new Error(loadErr.message);
    if (!msg) throw new Error("Message not found");
    if (msg.sender_type !== "user" || msg.sender_user_id !== context.userId) {
      throw new Error("Forbidden: you can only delete your own messages");
    }
    const paths: string[] = ((msg.attachments ?? []) as Array<{ path?: string }>)
      .map((a) => a?.path ?? "")
      .filter(Boolean);
    if (paths.length > 0) {
      try {
        await asAny(supabaseAdmin).storage.from("chat-attachments").remove(paths);
      } catch {
        /* non-blocking */
      }
    }
    const { error } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .delete()
      .eq("id", data.message_id);
    if (error) throw new Error(error.message);
    return { ok: true, conversation_id: msg.conversation_id as string };
  });


export const adminDeleteConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureChatAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Collect attachment paths from all messages
    const { data: msgs } = await asAny(supabaseAdmin)
      .from("live_chat_messages")
      .select("attachments")
      .eq("conversation_id", data.conversation_id);
    const paths = ((msgs ?? []) as Array<{ attachments: Array<{ path?: string }> }>)
      .flatMap((m) => m.attachments ?? [])
      .map((a) => a?.path ?? "")
      .filter(Boolean);
    if (paths.length > 0) {
      try {
        await asAny(supabaseAdmin).storage.from("chat-attachments").remove(paths);
      } catch {
        /* non-blocking */
      }
    }
    // Cascade handles messages/notes/assignments/notifications
    const { error } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .delete()
      .eq("id", data.conversation_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Notes
export const adminListNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => conversationIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId, "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await asAny(supabaseAdmin)
      .from("live_chat_notes")
      .select("*")
      .eq("conversation_id", data.conversation_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as ChatNote[];
  });

const noteSchema = z.object({
  conversation_id: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export const adminAddNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => noteSchema.parse(input))
  .handler(async ({ data, context }) => {
    await ensureStaff(context.supabase, context.userId, "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await asAny(supabaseAdmin)
      .from("live_chat_notes")
      .insert({
        conversation_id: data.conversation_id,
        author_id: context.userId,
        body: sanitizeBody(data.body),
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as ChatNote;
  });

export const adminListStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await ensureStaff(context.supabase, context.userId, "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rolesRows } = await asAny(supabaseAdmin)
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["super_admin", "admin", "moderator"]);
    const { data: perms } = await asAny(supabaseAdmin)
      .from("live_chat_permissions")
      .select("user_id");
    const ids = Array.from(
      new Set<string>([
        ...((rolesRows ?? []).map((r: any) => r.user_id) as string[]),
        ...((perms ?? []).map((r: any) => r.user_id) as string[]),
      ]),
    );
    if (ids.length === 0) return [] as StaffMember[];
    const [{ data: profs }, emails, roles] = await Promise.all([
      asAny(supabaseAdmin).from("profiles").select("id, display_name").in("id", ids),
      lookupAuthEmails(supabaseAdmin, ids),
      lookupTopRoles(supabaseAdmin, ids),
    ]);
    const byId = new Map((profs ?? []).map((p: any) => [p.id, p.display_name as string | null]));
    return ids.map((id) => ({
      id,
      name: byId.get(id) ?? "Staff",
      email: emails.get(id)?.email ?? null,
      role: roles.get(id) ?? "staff",
    })) as StaffMember[];
  });

// Analytics
export const adminChatAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await ensureStaff(context.supabase, context.userId, "view");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: convs } = await asAny(supabaseAdmin)
      .from("live_chat_conversations")
      .select("id, status, created_at, last_message_at");
    const list = (convs ?? []) as Array<{
      id: string;
      status: ChatStatus;
      created_at: string;
      last_message_at: string;
    }>;
    const total = list.length;
    const active = list.filter((c) => !["closed", "resolved"].includes(c.status)).length;
    const closed = list.filter((c) => ["closed", "resolved"].includes(c.status)).length;
    const open = list.filter((c) => c.status === "open" || c.status === "new").length;
    const days: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    list.forEach((c) => {
      const k = c.created_at.slice(0, 10);
      if (k in days) days[k]++;
    });
    return { total, active, closed, open, trend: Object.entries(days).map(([day, count]) => ({ day, count })) };
  });

// Notifications
export const listMyChatNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    const { data, error } = await asAny(context.supabase)
      .from("live_chat_notifications")
      .select("*")
      .eq("recipient_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markChatNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await asAny(context.supabase)
      .from("live_chat_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("recipient_id", context.userId)
      .is("read_at", null);
    return { ok: true };
  });