// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { noInput } from "@/lib/validate";


// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asAny = (x: unknown) => x as any;

export type BroadcastPriority = "normal" | "important" | "urgent";
export type BroadcastStatus = "draft" | "sent" | "hidden" | "archived";
export type BroadcastTargetKind =
  | "all_students"
  | "active_users"
  | "new_users"
  | "class"
  | "batch"
  | "course"
  | "users";

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
export type TargetFilter = { [k: string]: JsonValue };

export type Broadcast = {
  id: string;
  // Persistent broadcast identity. Stable across re-sends of the SAME
  // broadcast; resends inherit the original campaign_id, brand-new broadcasts
  // get a fresh one. Drives identity-based duplicate detection.
  campaign_id: string;
  subject: string;
  body: string;
  priority: BroadcastPriority;
  delivery_methods: string[];
  target_kind: BroadcastTargetKind;
  target_filter: TargetFilter;
  status: BroadcastStatus;
  visible: boolean;
  pinned: boolean;
  recipient_count: number;
  created_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  sender_name?: string | null;
  delivered_count?: number;
  read_count?: number;
};

const SERVER_QUERY_TIMEOUT_MS = 10_000;

function withServerTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(label)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

async function ensureAdmin(
  supabase: any,
  userId: string,
  superOnly = false,
  action: string = superOnly ? "broadcast.super" : "broadcast.admin",
  metadata?: Record<string, unknown>,
) {
  // Central audit + permission gate (Phase 3b: previously bypassed admin_action_log).
  const { assertPermission } = await import("@/lib/admin-permissions");
  await assertPermission(supabase, userId, "manage_content", action, metadata);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rolesToCheck = superOnly ? ["super_admin"] : ["admin", "super_admin"];
  const { data, error } = await withServerTimeout<{ data: Array<{ role: string }> | null; error: { message: string } | null }>(
    asAny(supabaseAdmin)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", rolesToCheck),
    SERVER_QUERY_TIMEOUT_MS,
    "Broadcast admin role lookup timed out",
  );
  if (error) throw new Error(`Broadcast admin role lookup failed: ${error.message}`);
  const roles = ((data ?? []) as Array<{ role: string }>).map((r) => r.role);
  if (superOnly && !roles.includes("super_admin")) throw new Error("Forbidden: super admin only");
  if (!superOnly && !roles.some((role) => role === "admin" || role === "super_admin")) {
    throw new Error("Forbidden: admin role required");
  }
}

function dateFromPreset(preset: string, custom_from?: string, custom_to?: string): { from: string; to: string } {
  const now = new Date();
  const to = custom_to ? new Date(custom_to) : now;
  if (preset === "custom" && custom_from) {
    return { from: new Date(custom_from).toISOString(), to: to.toISOString() };
  }
  const offsets: Record<string, number> = {
    today: 0, "24h": 1, "3d": 3, "7d": 7, "15d": 15, "30d": 30,
  };
  const days = offsets[preset] ?? 7;
  const from = new Date(now);
  if (preset === "today") from.setHours(0, 0, 0, 0);
  else from.setTime(now.getTime() - days * 86400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

async function filterStudentRecipients(supabaseAdmin: any, ids: string[]): Promise<string[]> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return [];
  const { data } = await asAny(supabaseAdmin)
    .from("user_roles")
    .select("user_id, role")
    .in("user_id", unique);
  const rolesByUser = new Map<string, Set<string>>();
  for (const r of (data ?? []) as Array<{ user_id: string; role: string }>) {
    const set = rolesByUser.get(r.user_id) ?? new Set<string>();
    set.add(r.role);
    rolesByUser.set(r.user_id, set);
  }
  return unique.filter((id) => {
    const roles = rolesByUser.get(id);
    return !!roles?.has("student") && !roles.has("admin") && !roles.has("super_admin") && !roles.has("moderator");
  });
}

function notificationPriority(priority: BroadcastPriority) {
  if (priority === "urgent") return "critical";
  if (priority === "important") return "high";
  return "medium";
}

function chunks<T>(rows: T[], size = 500) {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function upsertChunkWithRetry(
  supabaseAdmin: any,
  table: string,
  rows: Array<Record<string, unknown>>,
  onConflict: string,
  label: string,
) {
  if (rows.length === 0) return;
  let lastError: { message: string } | null = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { error } = await asAny(supabaseAdmin)
      .from(table)
      .upsert(rows, { onConflict, ignoreDuplicates: true });
    if (!error) return;
    lastError = error;
  }
  throw new Error(`${label} failed after retry: ${lastError?.message ?? "unknown error"}`);
}

async function countBroadcastNotifications(supabaseAdmin: any, broadcastId: string, ids: string[]) {
  let delivered = 0;
  for (const uidChunk of chunks(ids, 500)) {
    const { count, error } = await asAny(supabaseAdmin)
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("source_broadcast_id", broadcastId)
      .in("user_id", uidChunk);
    if (error) throw new Error(`Notification delivery verification failed: ${error.message}`);
    delivered += count ?? 0;
  }
  return delivered;
}

async function resolveRecipients(
  supabaseAdmin: any,
  kind: BroadcastTargetKind,
  filter: TargetFilter,
): Promise<string[]> {
  if (kind === "users") {
    const raw = (filter.user_ids as unknown) ?? [];
    const parsed = z.array(z.string().uuid()).safeParse(raw);
    if (!parsed.success) throw new Error("target_filter.user_ids must be an array of UUIDs");
    return Array.from(new Set(parsed.data));
  }
  if (kind === "all_students") {
    const { data } = await asAny(supabaseAdmin)
      .from("user_roles").select("user_id").eq("role", "student");
    return Array.from(new Set((data ?? []).map((r: any) => r.user_id as string)));
  }
  if (kind === "active_users") {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data } = await asAny(supabaseAdmin)
      .from("profiles").select("id").gte("last_login_at", since);
    return Array.from(new Set((data ?? []).map((r: any) => r.id as string)));
  }
  if (kind === "new_users") {
    const preset = (filter.preset as string) ?? "7d";
    const { from, to } = dateFromPreset(preset, filter.from as string, filter.to as string);
    const { data } = await asAny(supabaseAdmin)
      .from("profiles").select("id").gte("created_at", from).lte("created_at", to);
    return Array.from(new Set((data ?? []).map((r: any) => r.id as string)));
  }
  if (kind === "class" || kind === "batch" || kind === "course") {
    // Best-effort: profile.level field equals filter.level
    const level = filter.level as string | undefined;
    if (!level) return [];
    const { data } = await asAny(supabaseAdmin)
      .from("profiles").select("id").eq("level", level);
    return Array.from(new Set((data ?? []).map((r: any) => r.id as string)));
  }
  return [];
}

// ---------- CREATE / SEND ----------
const createSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  priority: z.enum(["normal", "important", "urgent"]).default("normal"),
  delivery_methods: z.array(z.enum(["inbox", "chat", "popup"])).min(1).default(["inbox"]),
  target_kind: z.enum(["all_students", "active_users", "new_users", "class", "batch", "course", "users"]),
  target_filter: z.record(z.string(), z.any()).default({}) as unknown as z.ZodType<TargetFilter>,
  skip_duplicates: z.boolean().default(false),
  // Persistent broadcast identity. Stable across re-sends of the SAME
  // broadcast. Defaults to a fresh UUID at the DB layer (new campaign) when
  // omitted. Re-send flows pass the original broadcast's campaign_id.
  campaign_id: z.string().uuid().optional(),
});

type DeliveryMethod = "inbox" | "chat" | "popup";

// Skip-duplicates: identity-based, not content-based.
// Two broadcasts with the SAME subject/body but DIFFERENT campaign_id are
// independent campaigns and must NOT be treated as duplicates of each other.
// Only prior sends with the same campaign_id count as duplicates.
async function computeSkipExclusions(
  supabaseAdmin: any,
  campaignId: string,
  currentBroadcastId: string | null,
  methods: DeliveryMethod[],
  candidateIds: string[],
): Promise<Record<DeliveryMethod, Set<string>>> {
  const empty: Record<DeliveryMethod, Set<string>> = {
    inbox: new Set(), chat: new Set(), popup: new Set(),
  };
  if (candidateIds.length === 0) return empty;

  let priorQ = asAny(supabaseAdmin)
    .from("broadcasts")
    .select("id, delivery_methods")
    .eq("campaign_id", campaignId);
  if (currentBroadcastId) priorQ = priorQ.neq("id", currentBroadcastId);
  const { data: priors, error: pErr } = await priorQ;
  if (pErr) throw new Error(`Skip-duplicates prior lookup failed: ${pErr.message}`);
  const priorList = (priors ?? []) as Array<{ id: string; delivery_methods: string[] }>;
  if (priorList.length === 0) return empty;

  for (const method of methods) {
    const priorIdsForMethod = priorList
      .filter((p) => Array.isArray(p.delivery_methods) && p.delivery_methods.includes(method))
      .map((p) => p.id);
    if (priorIdsForMethod.length === 0) continue;

    for (const uidChunk of chunks(candidateIds, 500)) {
      const { data, error } = await asAny(supabaseAdmin)
        .from("broadcast_recipients")
        .select("user_id, methods")
        .in("broadcast_id", priorIdsForMethod)
        .in("user_id", uidChunk);
      if (error) throw new Error(`Skip-duplicates recipient lookup failed: ${error.message}`);
      for (const row of (data ?? []) as Array<{ user_id: string; methods: string[] | null }>) {
        // Back-compat: rows predating per-user `methods` column are treated as
        // having received every method declared on their parent broadcast.
        if (!row.methods || row.methods.length === 0 || row.methods.includes(method)) {
          empty[method].add(row.user_id);
        }
      }
    }
  }
  return empty;
}

export const createBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => createSchema.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const methods = data.delivery_methods as DeliveryMethod[];
    const baseIds = await filterStudentRecipients(
      supabaseAdmin,
      await resolveRecipients(supabaseAdmin, data.target_kind, data.target_filter),
    );
    // Identity-based duplicate detection. Resends pass the original
    // broadcast's campaign_id; brand-new broadcasts mint a fresh one.
    const campaignId = data.campaign_id ?? crypto.randomUUID();

    const exclusions = data.skip_duplicates
      ? await computeSkipExclusions(supabaseAdmin, campaignId, null, methods, baseIds)
      : { inbox: new Set<string>(), chat: new Set<string>(), popup: new Set<string>() };

    const perMethodIds: Record<DeliveryMethod, string[]> = {
      inbox: methods.includes("inbox") ? baseIds.filter((id) => !exclusions.inbox.has(id)) : [],
      chat:  methods.includes("chat")  ? baseIds.filter((id) => !exclusions.chat.has(id))  : [],
      popup: methods.includes("popup") ? baseIds.filter((id) => !exclusions.popup.has(id)) : [],
    };

    // Per-user effective methods (only methods the user actually receives in this send).
    const methodsByUser = new Map<string, Set<DeliveryMethod>>();
    for (const m of methods) {
      for (const uid of perMethodIds[m]) {
        const set = methodsByUser.get(uid) ?? new Set<DeliveryMethod>();
        set.add(m);
        methodsByUser.set(uid, set);
      }
    }
    const effectiveIds = Array.from(methodsByUser.keys());

    const now = new Date().toISOString();
    const { data: row, error } = await asAny(supabaseAdmin)
      .from("broadcasts")
      .insert({
        subject: data.subject.trim(),
        body: data.body.trim(),
        priority: data.priority,
        delivery_methods: data.delivery_methods,
        target_kind: data.target_kind,
        target_filter: data.target_filter,
        status: "sent",
        recipient_count: effectiveIds.length,
        created_by: context.userId,
        sent_at: now,
        campaign_id: campaignId,
        skip_duplicates: data.skip_duplicates,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    if (effectiveIds.length > 0) {
      const recipientRows = effectiveIds.map((uid) => ({
        broadcast_id: row.id,
        user_id: uid,
        methods: Array.from(methodsByUser.get(uid) ?? []),
      }));
      for (const chunk of chunks(recipientRows)) {
        const { error: e2 } = await asAny(supabaseAdmin)
          .from("broadcast_recipients")
          .upsert(chunk, { onConflict: "broadcast_id,user_id" });
        if (e2) throw new Error(`Broadcast recipient delivery failed: ${e2.message}`);
      }
    }

    // Inbox = notifications table (independent of popup).
    if (methods.includes("inbox") && perMethodIds.inbox.length > 0) {
      const notificationRows = perMethodIds.inbox.map((uid) => ({
        user_id: uid,
        source_broadcast_id: row.id,
        delivery_group_id: row.id,
        title: `FROM ADMIN: ${data.subject.trim()}`,
        body: data.body.trim(),
        message: data.body.trim(),
        type: "broadcast",
        priority: notificationPriority(data.priority),
        audience: "users",
        status: "unread",
        sent_at: now,
        delivered_at: now,
        recipients_count: 1,
        delivered_count: 1,
        created_by: context.userId,
      }));
      for (const chunk of chunks(notificationRows)) {
        await upsertChunkWithRetry(
          supabaseAdmin,
          "notifications",
          chunk,
          "source_broadcast_id,user_id",
          "Per-user notification fan-out",
        );
      }
      const delivered = await countBroadcastNotifications(supabaseAdmin, row.id, perMethodIds.inbox);
      if (delivered !== perMethodIds.inbox.length) {
        throw new Error(`Notification delivery incomplete: ${delivered}/${perMethodIds.inbox.length} recipients confirmed`);
      }
    }

    if (methods.includes("chat") && perMethodIds.chat.length > 0) {
      // Create one fresh conversation per recipient for THIS broadcast so the
      // student widget shows it as a distinct, clearly-labelled thread (and
      // so identity-based dedupe at the broadcast layer is the source of
      // truth, not chat-thread re-use). The unread counter starts at 0 here;
      // the message insert below uses sender_type='staff', and the live-chat
      // rollup trigger increments unread_for_user exactly once.
      const chatSubject = `📢 ${data.subject.trim()}`.slice(0, 200);
      const preview = data.subject.trim().slice(0, 200);
      const messageBody = `📢 FROM ADMIN\n${data.subject.trim()}\n\n${data.body.trim()}`;
      for (const uidChunk of chunks(perMethodIds.chat, 200)) {
        const { data: created, error: cErr } = await asAny(supabaseAdmin)
          .from("live_chat_conversations")
          .insert(uidChunk.map((uid) => ({
            user_id: uid,
            subject: chatSubject,
            title: chatSubject,
            status: "waiting_user",
            last_message_preview: preview,
            last_message_at: now,
            unread_for_user: 0,
            metadata: { source: "broadcast", broadcast_id: row.id, campaign_id: campaignId },
          })))
          .select("id,user_id");
        if (cErr) throw new Error(`Chat delivery failed: ${cErr.message}`);
        const convs = (created ?? []) as Array<{ id: string; user_id: string }>;
        if (convs.length === 0) continue;
        const messages = convs.map((c) => ({
          conversation_id: c.id,
          sender_type: "staff",
          sender_user_id: context.userId,
          body: messageBody,
          delivered_at: now,
        }));
        const { error: mErr } = await asAny(supabaseAdmin)
          .from("live_chat_messages")
          .insert(messages);
        if (mErr) throw new Error(`Chat message delivery failed: ${mErr.message}`);
      }
    }

    return {
      id: row.id,
      recipient_count: effectiveIds.length,
      per_method: {
        inbox: perMethodIds.inbox.length,
        chat: perMethodIds.chat.length,
        popup: perMethodIds.popup.length,
      },
      skipped: {
        inbox: exclusions.inbox.size,
        chat: exclusions.chat.size,
        popup: exclusions.popup.size,
      },
    };
  });






// ---------- LIST / HISTORY ----------
export const listBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await asAny(supabaseAdmin)
      .from("broadcasts").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as Broadcast[];
    if (list.length === 0) return list;
    const ids = list.map((b) => b.id);
    const { data: recs } = await asAny(supabaseAdmin)
      .from("broadcast_recipients").select("broadcast_id, read_at").in("broadcast_id", ids);
    const delivered = new Map<string, number>();
    const read = new Map<string, number>();
    for (const r of (recs ?? []) as Array<{ broadcast_id: string; read_at: string | null }>) {
      delivered.set(r.broadcast_id, (delivered.get(r.broadcast_id) ?? 0) + 1);
      if (r.read_at) read.set(r.broadcast_id, (read.get(r.broadcast_id) ?? 0) + 1);
    }
    const senderIds = Array.from(new Set(list.map((b) => b.created_by).filter(Boolean) as string[]));
    let senders = new Map<string, string>();
    if (senderIds.length > 0) {
      const { data: profs } = await asAny(supabaseAdmin)
        .from("profiles").select("id, display_name").in("id", senderIds);
      senders = new Map((profs ?? []).map((p: any) => [p.id, p.display_name ?? "Admin"]));
    }
    return list.map((b) => ({
      ...b,
      delivered_count: delivered.get(b.id) ?? 0,
      read_count: read.get(b.id) ?? 0,
      sender_name: b.created_by ? senders.get(b.created_by) ?? "Admin" : "System",
    }));
  });

const idSchema = z.object({ id: z.string().uuid() });

export const setBroadcastVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid(), visible: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await asAny(supabaseAdmin).from("broadcasts")
      .update({ visible: data.visible, status: data.visible ? "sent" : "hidden" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setBroadcastPinned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid(), pinned: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await asAny(supabaseAdmin).from("broadcasts")
      .update({ pinned: data.pinned }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const editBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({
    id: z.string().uuid(),
    subject: z.string().min(1).max(200).optional(),
    body: z.string().min(1).max(5000).optional(),
    priority: z.enum(["normal", "important", "urgent"]).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    const { error } = await asAny(supabaseAdmin).from("broadcasts").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await asAny(supabaseAdmin).from("broadcasts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- TEMPLATES ----------
export type BroadcastTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  priority: BroadcastPriority;
  delivery_methods: string[];
  target_kind: BroadcastTargetKind | null;
  target_filter: TargetFilter;
  archived: boolean;
  created_at: string;
};

export const listTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await asAny(supabaseAdmin).from("broadcast_templates")
      .select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as BroadcastTemplate[];
  });

const templateSchema = z.object({
  name: z.string().min(1).max(120),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  priority: z.enum(["normal", "important", "urgent"]).default("normal"),
  delivery_methods: z.array(z.enum(["inbox", "chat", "popup"])).default(["inbox"]),
  target_kind: z.enum(["all_students", "active_users", "new_users", "class", "batch", "course", "users"]).optional(),
  target_filter: z.record(z.string(), z.any()).default({}) as unknown as z.ZodType<TargetFilter>,
});

export const createTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => templateSchema.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await asAny(supabaseAdmin).from("broadcast_templates").insert({
      ...data, created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid() }).merge(templateSchema.partial()).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...patch } = data;
    const { error } = await asAny(supabaseAdmin).from("broadcast_templates").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const archiveTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => z.object({ id: z.string().uuid(), archived: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await asAny(supabaseAdmin).from("broadcast_templates")
      .update({ archived: data.archived }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId, true);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await asAny(supabaseAdmin).from("broadcast_templates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- STUDENT SIDE ----------
export type MyBroadcast = Broadcast & {
  recipient_id: string;
  read_at: string | null;
  hidden_at: string | null;
};

export const listMyBroadcasts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(noInput)
  .handler(async ({ context }) => {
    const { data, error } = await asAny(context.supabase)
      .from("broadcast_recipients")
      .select("id, broadcast_id, read_at, hidden_at, methods, broadcasts(*)")
      .eq("user_id", context.userId)
      .is("hidden_at", null)
      .order("delivered_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return ((data ?? []) as any[])
      .filter((r) => r.broadcasts?.visible)
      .map((r) => {
        const b = r.broadcasts as Broadcast;
        // Per-user effective methods: prefer the per-recipient `methods`
        // column (recorded at send time); fall back to broadcast-level
        // methods for pre-existing rows that predate the column.
        const effective = Array.isArray(r.methods) && r.methods.length > 0
          ? (r.methods as string[])
          : (b?.delivery_methods ?? []);
        return {
          ...b,
          delivery_methods: effective,
          recipient_id: r.id,
          read_at: r.read_at,
          hidden_at: r.hidden_at,
        };
      }) as MyBroadcast[];
  });


export const markBroadcastRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    const now = new Date().toISOString();
    const { data: recipient, error } = await asAny(context.supabase)
      .from("broadcast_recipients")
      .update({ read_at: now })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("id,broadcast_id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!recipient) throw new Error("Broadcast recipient not found");

    const { data: notifications, error: notificationError } = await asAny(context.supabase)
      .from("notifications")
      .update({ status: "read", read_at: now })
      .eq("source_broadcast_id", recipient.broadcast_id)
      .eq("user_id", context.userId)
      .select("id");
    if (notificationError) throw new Error(notificationError.message);

    const notificationIds = ((notifications ?? []) as Array<{ id: string }>).map((n) => n.id);
    if (notificationIds.length > 0) {
      const { error: readError } = await asAny(context.supabase)
        .from("notification_reads")
        .upsert(
          notificationIds.map((notificationId) => ({
            notification_id: notificationId,
            user_id: context.userId,
            read_at: now,
          })),
          { onConflict: "notification_id,user_id" },
        );
      if (readError) throw new Error(readError.message);
    }

    return { ok: true, notification_ids: notificationIds };
  });

// Student-side soft delete: hide a broadcast from the current user only.
// Does not affect the underlying broadcast row or other recipients.
export const hideBroadcastForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((i: unknown) => idSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await asAny(context.supabase)
      .from("broadcast_recipients")
      .update({ hidden_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });