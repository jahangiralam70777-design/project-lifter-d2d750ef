import { getRoleDisplayName } from "@/lib/role-display";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Search,
  Send,
  Loader2,
  StickyNote,
  Shield,
  Ban,
  CheckCircle2,
  RefreshCw,
  Download,
  UserCircle2,
  Inbox,
  Trash2,
  History,
  Mail,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatPermissions } from "@/hooks/use-chat-permissions";
import {
  adminListConversations,
  adminGetConversation,
  adminListMessages,
  adminSendReply,
  adminMarkRead,
  adminUpdateConversation,
  adminAssignConversation,
  adminDeleteMessage,
  adminDeleteConversation,
  adminListNotes,
  adminAddNote,
  adminListStaff,
  type ChatConversation,
  type ChatMessage,
  type ChatNote,
  type ChatStatus,
} from "@/lib/live-chat.functions";

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "open", label: "Open" },
  { key: "pending", label: "Pending" },
  { key: "closed", label: "Closed" },
  { key: "mine", label: "Assigned to me" },
  { key: "high_priority", label: "High priority" },
];

const STATUS_COLORS: Record<ChatStatus, string> = {
  new: "bg-blue-500/20 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  open: "bg-emerald-500/20 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  pending: "bg-amber-500/20 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  waiting_user: "bg-violet-500/20 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  resolved: "bg-slate-500/20 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300",
  closed: "bg-slate-500/20 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300",
};

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
  admin: "bg-indigo-500/20 text-indigo-700 dark:text-indigo-300",
  moderator: "bg-cyan-500/20 text-cyan-700 dark:text-cyan-300",
  student: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  user: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString();
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

export function LiveChatManager() {
  const qc = useQueryClient();
  const perms = useChatPermissions();
  const listFn = useServerFn(adminListConversations);
  const getFn = useServerFn(adminGetConversation);
  const msgsFn = useServerFn(adminListMessages);
  const replyFn = useServerFn(adminSendReply);
  const markReadFn = useServerFn(adminMarkRead);
  const updateFn = useServerFn(adminUpdateConversation);
  const assignFn = useServerFn(adminAssignConversation);
  const deleteMsgFn = useServerFn(adminDeleteMessage);
  const deleteConvFn = useServerFn(adminDeleteConversation);
  const notesFn = useServerFn(adminListNotes);
  const addNoteFn = useServerFn(adminAddNote);
  const staffFn = useServerFn(adminListStaff);

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"reply" | "notes">("reply");
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const convsQ = useQuery({
    queryKey: ["admin", "chat", "list", filter, search],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn: () => listFn({ data: { filter: filter as any, search } }),
    refetchInterval: 15_000,
  });

  const detailQ = useQuery({
    queryKey: ["admin", "chat", "detail", selectedId],
    queryFn: () => getFn({ data: { conversation_id: selectedId! } }),
    enabled: !!selectedId,
  });
  const msgsQ = useQuery({
    queryKey: ["admin", "chat", "messages", selectedId],
    queryFn: () => msgsFn({ data: { conversation_id: selectedId! } }),
    enabled: !!selectedId,
  });
  const notesQ = useQuery({
    queryKey: ["admin", "chat", "notes", selectedId],
    queryFn: () => notesFn({ data: { conversation_id: selectedId! } }),
    enabled: !!selectedId && tab === "notes",
  });
  const staffQ = useQuery({
    queryKey: ["admin", "chat", "staff"],
    queryFn: () => staffFn(),
    enabled: perms.canAssign,
  });

  // Realtime: conversations + messages + assignment history
  useEffect(() => {
    const ch = supabase
      .channel("admin-lc-all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_chat_conversations" },
        () => {
          qc.invalidateQueries({ queryKey: ["admin", "chat", "list"] });
          if (selectedId)
            qc.invalidateQueries({ queryKey: ["admin", "chat", "detail", selectedId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_chat_messages" },
        (payload) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const m = ((payload as any).new ?? (payload as any).old) as ChatMessage;
          if (m && m.conversation_id === selectedId) {
            qc.invalidateQueries({ queryKey: ["admin", "chat", "messages", selectedId] });
          }
          qc.invalidateQueries({ queryKey: ["admin", "chat", "list"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_chat_assignment_history" },
        () => {
          if (selectedId)
            qc.invalidateQueries({ queryKey: ["admin", "chat", "detail", selectedId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc, selectedId]);

  // Mark a conversation as read only when the staff member explicitly opens it,
  // not on auto-select or background renders. Do NOT auto-select the first
  // conversation, and do NOT call markRead inside an effect that re-fires on
  // realtime invalidations — both caused student messages to flip to "Seen"
  // without staff ever viewing them.
  const openConversation = useCallback(
    (id: string) => {
      setSelectedId(id);
      markReadFn({ data: { conversation_id: id } }).catch(() => undefined);
    },
    [markReadFn],
  );

  // When the staff member is actively viewing a conversation and a new student
  // message arrives, mark it read — but only if the page is currently visible.
  useEffect(() => {
    if (!selectedId) return;
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;
    const ch = supabase
      .channel(`admin-lc-active-read-${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_chat_messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          const m = (payload as unknown as { new?: ChatMessage }).new;
          if (!m || m.sender_type !== "user") return;
          if (document.visibilityState !== "visible") return;
          markReadFn({ data: { conversation_id: selectedId } }).catch(() => undefined);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedId, markReadFn]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgsQ.data, selectedId]);

  const replyMut = useMutation({
    mutationFn: async (body: string) => {
      if (!selectedId) throw new Error("No conversation");
      return replyFn({ data: { conversation_id: selectedId, body } });
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["admin", "chat", "messages", selectedId] });
      qc.invalidateQueries({ queryKey: ["admin", "chat", "list"] });
      qc.invalidateQueries({ queryKey: ["chat", "my-conversations"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const noteMut = useMutation({
    mutationFn: async (body: string) => {
      if (!selectedId) throw new Error("No conversation");
      return addNoteFn({ data: { conversation_id: selectedId, body } });
    },
    onSuccess: () => {
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "chat", "notes", selectedId] });
      toast.success("Internal note added");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  type UpdatePatch = {
    conversation_id: string;
    status?: ChatStatus;
    priority?: "low" | "normal" | "high" | "urgent";
    is_blocked?: boolean;
  };
  const updateMut = useMutation({
    mutationFn: async (patch: UpdatePatch) => updateFn({ data: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "chat", "list"] });
      qc.invalidateQueries({ queryKey: ["admin", "chat", "detail", selectedId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const assignMut = useMutation({
    mutationFn: async (assignee: string | null) => {
      if (!selectedId) throw new Error("No conversation");
      return assignFn({ data: { conversation_id: selectedId, assigned_to: assignee } });
    },
    onSuccess: () => {
      toast.success("Assignment updated");
      qc.invalidateQueries({ queryKey: ["admin", "chat", "detail", selectedId] });
      qc.invalidateQueries({ queryKey: ["admin", "chat", "list"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteMessageMut = useMutation({
    mutationFn: async (message_id: string) => deleteMsgFn({ data: { message_id } }),
    onSuccess: () => {
      toast.success("Message deleted");
      qc.invalidateQueries({ queryKey: ["admin", "chat", "messages", selectedId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const deleteConvMut = useMutation({
    mutationFn: async (conversationId: string) => {
      return deleteConvFn({ data: { conversation_id: conversationId } });
    },
    onMutate: async (conversationId) => {
      await qc.cancelQueries({ queryKey: ["admin", "chat", "list"] });
      qc.setQueriesData<ChatConversation[]>(
        { queryKey: ["admin", "chat", "list"] },
        (old) => (old ?? []).filter((c) => c.id !== conversationId),
      );
      setSelectedId((cur) => (cur === conversationId ? null : cur));
      return { conversationId };
    },
    onSuccess: () => {
      toast.success("Conversation deleted");
      qc.invalidateQueries({ queryKey: ["admin", "chat", "list"] });
    },
    onError: (e, _id, ctx) => {
      if (ctx?.conversationId) setSelectedId(ctx.conversationId);
      qc.invalidateQueries({ queryKey: ["admin", "chat", "list"] });
      toast.error((e as Error).message);
    },
  });

  const conv = detailQ.data?.conversation ?? null;
  const profile = detailQ.data?.profile ?? null;
  const assignee = detailQ.data?.assignee ?? null;
  const previousConvs = detailQ.data?.previousConversations ?? [];
  const assignmentHistory = detailQ.data?.assignmentHistory ?? [];
  const messages = msgsQ.data ?? [];
  const notes = notesQ.data ?? [];
  const conversations = convsQ.data ?? [];
  const canDeleteConversation = perms.isAdmin || perms.isSuperAdmin;
  const canDeleteMessage = perms.isSuperAdmin;

  const exportConv = () => {
    if (!conv) return;
    const blob = new Blob(
      [JSON.stringify({ conversation: conv, profile, messages, notes }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `conversation-${conv.id}.json`;
    a.click();
  };

  return (
    <div className="grid h-[calc(100dvh-10rem)] min-h-[480px] grid-cols-12 gap-3 overflow-hidden rounded-2xl border border-border bg-card text-card-foreground">
      {/* ──────────── LEFT: Filter + list ──────────── */}
      <aside className={`${selectedId ? "hidden md:flex" : "flex"} col-span-12 h-full min-h-0 flex-col border-r border-border md:col-span-4 lg:col-span-3`}>
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, ID…"
              className="pl-8"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  filter === f.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground hover:bg-muted/70"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {convsQ.isLoading && (
            <div className="flex justify-center p-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!convsQ.isLoading && conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <Inbox className="h-8 w-8" />
              <p className="text-sm">No conversations</p>
            </div>
          )}
          <ul>
            {conversations.map((c: ChatConversation) => (
              <li key={c.id}>
                <button
                  onClick={() => openConversation(c.id)}
                  className={`w-full border-b border-border px-3 py-3 text-left transition hover:bg-muted/50 ${
                    selectedId === c.id ? "bg-muted/70" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            c.user_online ? "bg-emerald-500" : "bg-muted-foreground/40"
                          }`}
                          title={c.user_online ? "Online" : "Offline"}
                        />
                        <p className="truncate text-sm font-semibold text-foreground">
                          {c.display_name}
                        </p>
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {c.display_email ?? "no email"}
                      </p>
                      {c.user_role && (
                        <span
                          className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${ROLE_COLORS[c.user_role] ?? ROLE_COLORS.user}`}
                        >
                          {getRoleDisplayName(c.user_role)}
                        </span>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUS_COLORS[c.status]}`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-xs text-foreground/80">
                    {c.last_message_preview ?? "No messages yet"}
                  </p>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{fmtTime(c.last_message_at)}</span>
                    <div className="flex items-center gap-1">
                      {c.assigned_to_name && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-foreground/80">
                          → {c.assigned_to_name}
                        </span>
                      )}
                      {c.unread_for_staff > 0 && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                          {c.unread_for_staff}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* ──────────── CENTER: Thread ──────────── */}
      <section className={`${selectedId ? "flex" : "hidden md:flex"} col-span-12 h-full min-h-0 flex-col md:col-span-5 lg:col-span-6`}>
        {!conv ? (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            Select a conversation
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 md:hidden"
                  onClick={() => setSelectedId(null)}
                  aria-label="Back to conversations"
                  title="Back to conversations"
                >
                  ←
                </Button>
                <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {conv.display_name ?? "User"}
                  </p>
                  {conv.user_role && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${ROLE_COLORS[conv.user_role] ?? ROLE_COLORS.user}`}
                    >
                      {getRoleDisplayName(conv.user_role)}
                    </span>
                  )}
                  {conv.user_online && (
                    <span
                      className="h-2 w-2 rounded-full bg-emerald-500"
                      title="Online now"
                    />
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground">
                  {conv.display_email ?? "—"}
                </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_COLORS[conv.status]}`}
                >
                  {conv.status}
                </span>
                {canDeleteConversation && (
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8"
                    disabled={deleteConvMut.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          "Permanently delete this conversation, all its messages, notes and attachments?",
                        )
                      ) {
                        deleteConvMut.mutate(conv.id);
                      }
                    }}
                    aria-label="Delete conversation"
                    title="Delete conversation"
                  >
                    {deleteConvMut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border px-3 py-2">
              <button
                onClick={() => setTab("reply")}
                className={`rounded-md px-3 py-1 text-xs font-medium ${tab === "reply" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
              >
                Reply
              </button>
              <button
                onClick={() => setTab("notes")}
                className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium ${tab === "notes" ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted"}`}
              >
                <StickyNote className="h-3 w-3" /> Internal notes
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-background px-4 py-4">
              {msgsQ.isLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {messages.map((m) => {
                const isStaff = m.sender_type === "staff";
                const isSystem = m.sender_type === "system";
                const isSelf = isStaff && m.sender_user_id && m.sender_user_id === perms.userId;
                const role = (m.sender_role ?? "").toLowerCase();
                let label: string;
                if (isSystem) {
                  label = "System";
                } else if (isStaff) {
                  if (isSelf) label = "You (Admin)";
                  else if (role === "super_admin") label = "Super Admin";
                  else if (role === "admin") label = "Admin";
                  else if (role === "moderator") label = "Moderator";
                  else label = "Staff";
                } else {
                  label = "Student";
                }
                const name =
                  m.sender_name ||
                  (isStaff ? "Support" : conv?.guest_name || profile?.display_name || "Student");
                const align = isStaff ? "items-end" : "items-start";
                const justify = isStaff ? "justify-end" : "justify-start";
                return (
                  <div key={m.id} className={`group flex ${justify}`}>
                    <div className={`flex max-w-[80%] flex-col ${align}`}>
                      <div
                        className={`mb-1 flex items-center gap-1.5 px-1 text-[11px] ${isStaff ? "flex-row-reverse" : ""}`}
                      >
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            isStaff
                              ? "bg-primary/15 text-primary"
                              : isSystem
                                ? "bg-muted text-muted-foreground"
                                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                          }`}
                        >
                          {label}
                        </span>
                        <span className="font-medium text-foreground/80">{name}</span>
                      </div>
                      <div
                        className={`relative rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          isStaff
                            ? "rounded-br-sm bg-primary text-primary-foreground"
                            : "rounded-bl-sm border border-border bg-card text-card-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            isStaff ? "text-primary-foreground/85" : "text-foreground/70"
                          }`}
                        >
                          {fmtTime(m.created_at)}
                          {isStaff && m.read_at ? " · Seen" : ""}
                        </p>
                        {canDeleteMessage && (
                          <button
                            onClick={() => {
                              if (confirm("Permanently delete this message?")) {
                                deleteMessageMut.mutate(m.id);
                              }
                            }}
                            className={`absolute -top-2 ${isStaff ? "-left-2" : "-right-2"} hidden h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow group-hover:flex`}
                            aria-label="Delete message"
                            title="Delete message (super admin)"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            </div>

            {/* Composer */}
            <div className="sticky bottom-0 shrink-0 border-t border-border bg-card px-3 py-3">
              {tab === "reply" ? (
                <div className="space-y-2">
                  {perms.failed && (
                    <p className="text-xs text-destructive">{perms.error}</p>
                  )}
                  {!perms.failed && !perms.loading && !perms.canReply && (
                    <p className="text-xs text-muted-foreground">Reply permission is required.</p>
                  )}
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          if (reply.trim() && perms.canReply) replyMut.mutate(reply.trim());
                        }
                      }}
                      placeholder="Type your reply… (Cmd/Ctrl+Enter to send)"
                      rows={2}
                      className="flex-1 resize-none"
                      disabled={perms.loading || replyMut.isPending}
                    />
                    <Button
                      onClick={() => reply.trim() && replyMut.mutate(reply.trim())}
                      disabled={!selectedId || !reply.trim() || replyMut.isPending || perms.loading || !perms.canReply}
                      className="h-10"
                      title={!perms.canReply ? "Reply permission is required" : "Send reply"}
                    >
                      {replyMut.isPending || perms.loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="max-h-32 space-y-1 overflow-y-auto">
                    {notes.length === 0 && (
                      <p className="text-xs text-muted-foreground">No internal notes yet.</p>
                    )}
                    {notes.map((n: ChatNote) => (
                      <div
                        key={n.id}
                        className="rounded-lg border border-amber-500/40 bg-amber-50 px-2 py-1.5 text-xs text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
                      >
                        <p className="whitespace-pre-wrap">{n.body}</p>
                        <p className="mt-0.5 text-[10px] text-amber-900/70 dark:text-amber-100/70">
                          {fmtTime(n.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Internal note (only staff can see)"
                      rows={2}
                      className="flex-1 resize-none"
                    />
                    <Button
                      onClick={() => note.trim() && noteMut.mutate(note.trim())}
                      disabled={!note.trim() || noteMut.isPending}
                      variant="secondary"
                      className="h-10"
                    >
                      {noteMut.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <StickyNote className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      {/* ──────────── RIGHT: Details / actions ──────────── */}
      <aside className="col-span-12 hidden h-full min-h-0 flex-col gap-4 overflow-y-auto border-l border-border p-4 md:col-span-3 md:flex">
        {!conv ? (
          <p className="text-sm text-muted-foreground">No conversation selected</p>
        ) : (
          <>
            {/* User profile card */}
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <UserCircle2 className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {profile?.display_name ?? conv.display_name ?? "User"}
                  </p>
                  <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {profile?.email ?? conv.display_email ?? "no email"}
                  </p>
                </div>
              </div>
              {profile?.role && (
                <span
                  className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${ROLE_COLORS[profile.role] ?? ROLE_COLORS.user}`}
                >
                  {getRoleDisplayName(profile.role)}
                </span>
              )}
              <dl className="mt-3 space-y-1 text-xs">
                <Row label="Registered" value={fmtDate(profile?.created_at)} />
                <Row label="Last login" value={fmtDate(profile?.last_sign_in_at)} />
                <Row
                  label="Total chats"
                  value={String(profile?.total_conversations ?? 0)}
                />
                <Row
                  label="Active chats"
                  value={String(profile?.active_conversations ?? 0)}
                />
              </dl>
            </div>

            {/* Conversation meta */}
            <div className="space-y-2 text-xs">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Conversation
              </p>
              <Row label="ID" value={conv.id.slice(0, 8)} />
              <Row label="Created" value={fmtTime(conv.created_at)} />
              <Row label="Last activity" value={fmtTime(conv.last_message_at)} />
              {conv.expires_at && (
                <Row label="Auto-delete" value={fmtDate(conv.expires_at)} />
              )}
            </div>

            {/* Controls */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Status
              </label>
              <select
                value={conv.status}
                onChange={(e) =>
                  updateMut.mutate({
                    conversation_id: conv.id,
                    status: e.target.value as ChatStatus,
                  })
                }
                className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground"
              >
                <option value="new">New</option>
                <option value="open">Open</option>
                <option value="pending">Pending</option>
                <option value="waiting_user">Waiting for user</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Priority
              </label>
              <select
                value={conv.priority}
                onChange={(e) =>
                  updateMut.mutate({
                    conversation_id: conv.id,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    priority: e.target.value as any,
                  })
                }
                className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            {/* Assignment (super_admin only) */}
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Assigned to
              </label>
              {assignee ? (
                <div className="rounded-lg border border-border bg-background p-2 text-xs">
                  <p className="font-semibold text-foreground">{assignee.name}</p>
                  <p className="text-muted-foreground">{assignee.email}</p>
                  <span
                    className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${ROLE_COLORS[assignee.role] ?? ROLE_COLORS.user}`}
                  >
                    {getRoleDisplayName(assignee.role)}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Unassigned</p>
              )}
              {perms.canAssign ? (
                <select
                  value={conv.assigned_to ?? ""}
                  onChange={(e) => assignMut.mutate(e.target.value || null)}
                  disabled={assignMut.isPending}
                  className="w-full rounded-lg border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                >
                  <option value="">— Unassigned —</option>
                  {(staffQ.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({getRoleDisplayName(s.role)})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Only super admins can change assignments.
                </p>
              )}
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  updateMut.mutate({ conversation_id: conv.id, status: "resolved" })
                }
              >
                <CheckCircle2 className="mr-1 h-3 w-3" /> Resolve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateMut.mutate({ conversation_id: conv.id, status: "open" })}
              >
                <RefreshCw className="mr-1 h-3 w-3" /> Reopen
              </Button>
              <Button
                size="sm"
                variant={conv.is_blocked ? "default" : "outline"}
                onClick={() =>
                  updateMut.mutate({
                    conversation_id: conv.id,
                    is_blocked: !conv.is_blocked,
                  })
                }
              >
                <Ban className="mr-1 h-3 w-3" />
                {conv.is_blocked ? "Unblock" : "Block"}
              </Button>
              <Button size="sm" variant="outline" onClick={exportConv}>
                <Download className="mr-1 h-3 w-3" /> Export
              </Button>
            </div>

            {/* Previous conversations */}
            {previousConvs.length > 0 && (
              <div className="space-y-1.5">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <History className="h-3 w-3" /> Previous conversations
                </p>
                <ul className="space-y-1">
                  {previousConvs.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => openConversation(p.id)}
                        className="block w-full rounded-md border border-border bg-background px-2 py-1.5 text-left text-xs hover:bg-muted/50"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-medium text-foreground">
                            {p.subject || "Untitled"}
                          </span>
                          <span
                            className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${STATUS_COLORS[p.status]}`}
                          >
                            {p.status}
                          </span>
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {fmtTime(p.last_message_at)}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Assignment history */}
            {assignmentHistory.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Assignment history
                </p>
                <ul className="space-y-1 text-[11px]">
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {assignmentHistory.map((h: any) => (
                    <li key={h.id} className="rounded border border-border bg-background px-2 py-1 text-muted-foreground">
                      {fmtTime(h.created_at)} — assignee changed
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Danger zone */}
            {canDeleteConversation && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-2">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-destructive">
                  Danger zone
                </p>
                <Button
                  size="sm"
                  variant="destructive"
                  className="w-full"
                  disabled={deleteConvMut.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        "Permanently delete this conversation, all its messages, notes and attachments?",
                      )
                    ) {
                      deleteConvMut.mutate(conv.id);
                    }
                  }}
                >
                  {deleteConvMut.isPending ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1 h-3 w-3" />
                  )}
                  Delete conversation
                </Button>
              </div>
            )}

            <div className="mt-auto rounded-lg border border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
              <Shield className="mr-1 inline h-3 w-3" />
              RLS-isolated per user. Auto-deleted after 30 days of inactivity.
              {!canDeleteConversation && " Only admins can delete."}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium text-foreground">{value}</span>
    </div>
  );
}
