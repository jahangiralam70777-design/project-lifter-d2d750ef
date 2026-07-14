import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  MessageCircle,
  X,
  Send,
  Loader2,
  ArrowLeft,
  Plus,
  Inbox,
  Headphones,
  LifeBuoy,
  Bot,
  Sparkles,
  Trash2,
  MoreVertical,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getChatSettings,
  listMyConversations,
  startNewConversation,
  listConversationMessages,
  userSendMessage,
  userMarkRead,
  userHideConversation,
  userDeleteMessage,
  type ChatConversation,
  type ChatMessage,
  type ChatSettings,
} from "@/lib/live-chat.functions";


const LAUNCHER_ICONS: Record<string, LucideIcon> = {
  "message-circle": MessageCircle,
  headphones: Headphones,
  "life-buoy": LifeBuoy,
  bot: Bot,
  sparkles: Sparkles,
  send: Send,
};

// Backwards-compat exports (older settings consumer still references these)
export type LiveChatWidgetSettings = {
  enabled: boolean;
  position: "bottom-right" | "bottom-left";
  chat_message?: string;
  heading?: string;
  subheading?: string;
  whatsapp_number?: string;
};
export const LIVE_CHAT_DEFAULTS: LiveChatWidgetSettings = {
  enabled: true,
  position: "bottom-right",
};

const SOUND_KEY = "lc_sound_enabled";
const CHAT_CONVERSATIONS_KEY = ["chat", "my-conversations"] as const;

function sortConversationsByLatest(rows: ChatConversation[]) {
  return [...rows].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function playPing() {
  try {
    const enabled = localStorage.getItem(SOUND_KEY) !== "0";
    if (!enabled) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.start();
    o.stop(ctx.currentTime + 0.26);
  } catch {
    /* ignore */
  }
}

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  open: "Open",
  pending: "Pending",
  waiting_user: "Waiting",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_BADGE: Record<string, string> = {
  new: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
  open: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  pending: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  waiting_user: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
  resolved: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
  closed: "bg-slate-500/20 text-slate-700 dark:text-slate-300",
};

export function LiveChatWidget() {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getChatSettings);
  const listConvs = useServerFn(listMyConversations);
  const startConv = useServerFn(startNewConversation);
  const fetchMessages = useServerFn(listConversationMessages);
  const sendMsg = useServerFn(userSendMessage);
  const markRead = useServerFn(userMarkRead);
  const hideConv = useServerFn(userHideConversation);
  const deleteMsg = useServerFn(userDeleteMessage);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingHideConvId, setPendingHideConvId] = useState<string | null>(null);


  const [authed, setAuthed] = useState<boolean | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [view, setView] = useState<"picker" | "thread" | "compose">("picker");
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(SOUND_KEY) !== "0";
  });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refreshConversations = useCallback(() => {
    qc.invalidateQueries({ queryKey: CHAT_CONVERSATIONS_KEY });
    void qc.refetchQueries({ queryKey: CHAT_CONVERSATIONS_KEY, type: "active" });
  }, [qc]);

  const hideMut = useMutation({
    mutationFn: (conversation_id: string) => hideConv({ data: { conversation_id } }),
    onMutate: async (conversation_id: string) => {
      await qc.cancelQueries({ queryKey: CHAT_CONVERSATIONS_KEY });
      const prev = qc.getQueryData<ChatConversation[]>(CHAT_CONVERSATIONS_KEY);
      qc.setQueryData<ChatConversation[]>(
        CHAT_CONVERSATIONS_KEY,
        (old) => (old ?? []).filter((c) => c.id !== conversation_id),
      );
      return { prev };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(CHAT_CONVERSATIONS_KEY, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to delete conversation");
    },
    onSuccess: () => {
      toast.success("Conversation deleted");
    },
    onSettled: () => {
      setPendingHideConvId(null);
      refreshConversations();
    },
  });

  const deleteMsgMut = useMutation({
    mutationFn: (message_id: string) => deleteMsg({ data: { message_id } }),
    onMutate: async (message_id: string) => {
      const key = ["chat", "messages", activeConvId] as const;
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChatMessage[]>(key);
      qc.setQueryData<ChatMessage[]>(key, (old) => (old ?? []).filter((m) => m.id !== message_id));
      return { prev, key };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(ctx.key, ctx.prev);
      toast.error(err instanceof Error ? err.message : "Failed to delete message");
    },
    onSuccess: () => {
      toast.success("Message deleted");
      refreshConversations();
    },
    onSettled: () => {
      setPendingDeleteId(null);
    },
  });


  // Auth gate
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setAuthed(!!data.user);
      setUserId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setAuthed(!!s?.user);
      setUserId(s?.user?.id ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const settingsQ = useQuery({
    queryKey: ["chat", "settings"],
    queryFn: () => fetchSettings(),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  // Realtime: settings updates
  useEffect(() => {
    const ch = supabase
      .channel("lc-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "live_chat_settings" },
        () => qc.invalidateQueries({ queryKey: ["chat", "settings"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const settings = (settingsQ.data ?? {
    enabled: true,
    position: "bottom-right",
    theme_color: "#3b82f6",
    welcome_message: "Hi! How can we help today?",
    offline_message: "",
    email_notifications: true,
    sound_notifications: true,
    auto_assignment_enabled: false,
    attachment_max_mb: 10,
    rate_limit_per_minute: 20,
    button_text: "Live Chat",
    tooltip_text: "Chat with our team",
    icon_name: "message-circle",
    show_label: true,
    show_launcher: true,
  }) as ChatSettings;

  const convsQ = useQuery({
    queryKey: CHAT_CONVERSATIONS_KEY,
    queryFn: () => listConvs(),
    enabled: !!authed,
    staleTime: open ? 5_000 : 15_000,
    refetchInterval: open ? 15_000 : 45_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const messagesQ = useQuery({
    queryKey: ["chat", "messages", activeConvId],
    queryFn: () => fetchMessages({ data: { conversation_id: activeConvId! } }),
    enabled: !!activeConvId && view === "thread",
    staleTime: 5_000,
  });

  // Realtime + fallback refresh: new broadcast chat deliveries create fresh
  // conversation rows first, then message rows. Listen to both so the picker,
  // launcher badge, and active thread update without requiring a reload.
  useEffect(() => {
    if (!authed || !userId) return;
    const timers = new Set<number>();
    const scheduleRefresh = (delayMs: number) => {
      const run = () => {
        timers.delete(id);
        refreshConversations();
      };
      const id = window.setTimeout(run, delayMs);
      timers.add(id);
    };

    const ch = supabase
      .channel(`lc-user-convs-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "live_chat_conversations",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const eventType = (payload as { eventType?: string }).eventType;
          const row = ((payload as { new?: unknown; old?: unknown }).new ??
            (payload as { old?: unknown }).old) as
            | (ChatConversation & { user_hidden_at?: string | null })
            | undefined;
          if (row?.id) {
            qc.setQueryData<ChatConversation[]>(CHAT_CONVERSATIONS_KEY, (prev = []) => {
              if (eventType === "DELETE" || row.user_hidden_at) {
                return prev.filter((c) => c.id !== row.id);
              }
              const merged = prev.some((c) => c.id === row.id)
                ? prev.map((c) => (c.id === row.id ? { ...c, ...row } : c))
                : [row, ...prev];
              return sortConversationsByLatest(merged);
            });
          }
          refreshConversations();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "broadcast_recipients",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = ((payload as { new?: unknown }).new ?? {}) as { methods?: string[] | null };
          if (!row.methods || row.methods.length === 0 || row.methods.includes("chat")) {
            scheduleRefresh(250);
            scheduleRefresh(1_500);
          }
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") refreshConversations();
      });

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      supabase.removeChannel(ch);
    };
  }, [authed, userId, qc, refreshConversations]);

  // Realtime: incoming messages on any of my conversations
  useEffect(() => {
    if (!authed) return;
    const ch = supabase
      .channel("lc-user-msgs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "live_chat_messages" },
        (payload) => {
          const m = payload.new as ChatMessage;
          if (m.conversation_id === activeConvId) {
            qc.setQueryData<ChatMessage[]>(
              ["chat", "messages", activeConvId],
              (prev = []) => (prev.find((x) => x.id === m.id) ? prev : [...prev, m]),
            );
          }
          refreshConversations();
          if (m.sender_type === "staff" || m.sender_type === "system") {
            if (!open || view !== "thread" || m.conversation_id !== activeConvId) {
              playPing();
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "live_chat_messages" },
        (payload) => {
          const oldRow = payload.old as Partial<ChatMessage> | null;
          const deletedId = oldRow?.id;
          if (!deletedId) return;
          // Remove from any cached thread we have.
          const caches = qc.getQueriesData<ChatMessage[]>({ queryKey: ["chat", "messages"] });
          for (const [key, data] of caches) {
            if (!data) continue;
            if (data.some((m) => m.id === deletedId)) {
              qc.setQueryData<ChatMessage[]>(key, data.filter((m) => m.id !== deletedId));
            }
          }
          refreshConversations();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [authed, qc, activeConvId, open, view, refreshConversations]);

  // Mark read when thread opens
  useEffect(() => {
    if (open && view === "thread" && activeConvId) {
      markRead({ data: { conversation_id: activeConvId } })
        .catch(() => undefined)
        .finally(refreshConversations);
    }
  }, [open, view, activeConvId, markRead, refreshConversations]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messagesQ.data, view]);

  const conversations = (convsQ.data ?? []) as ChatConversation[];
  const totalUnread = conversations.reduce((s, c) => s + (c.unread_for_user ?? 0), 0);
  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (!activeConvId) throw new Error("No conversation");
      return sendMsg({ data: { conversation_id: activeConvId, body } });
    },
    onSuccess: (msg) => {
      qc.setQueryData<ChatMessage[]>(
        ["chat", "messages", activeConvId],
        (prev = []) => (prev.find((m) => m.id === msg.id) ? prev : [...prev, msg]),
      );
      refreshConversations();
    },
  });

  const startMutation = useMutation({
    mutationFn: async (vars: { subject?: string; first_message?: string }) =>
      startConv({ data: vars }),
    onSuccess: (conv) => {
      refreshConversations();
      qc.invalidateQueries({ queryKey: ["chat", "messages", conv.id] });
      setActiveConvId(conv.id);
      setNewSubject("");
      setNewMessage("");
      setView("thread");
    },
  });

  const openConversation = useCallback((id: string) => {
    setActiveConvId(id);
    setView("thread");
  }, []);

  const handleSend = useCallback(() => {
    const v = input.trim();
    if (!v || sendMutation.isPending) return;
    setInput("");
    sendMutation.mutate(v);
  }, [input, sendMutation]);

  const toggleSound = () => {
    setSoundOn((s) => {
      const next = !s;
      try {
        localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const positionClass = settings.position === "bottom-left" ? "left-4" : "right-4";
  const themeStyle = useMemo(
    () => ({ background: settings.theme_color || "#3b82f6" }),
    [settings.theme_color],
  );

  // Hidden states
  if (!authed) return null;
  if (!settings.enabled) return null;

  return (
    <div
      className={`fixed bottom-4 ${positionClass} z-50 flex flex-col items-end gap-3`}
      data-testid="live-chat-widget"
    >
      {open && (
        <div
          className="flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200"
          role="dialog"
          aria-label="Live support chat"
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 text-white" style={themeStyle}>
            {view === "thread" && (
              <button
                onClick={() => setView("picker")}
                className="rounded-md p-1 text-white hover:bg-white/20"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="relative">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
                <MessageCircle className="h-5 w-5" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
            </div>
            <div className="flex-1 leading-tight">
              <p className="text-sm font-semibold text-white">
                {view === "thread" ? activeConv?.subject || "Conversation" : "Support"}
              </p>
              <p className="text-[11px] text-white/85">
                {view === "thread"
                  ? activeConv
                    ? STATUS_LABEL[activeConv.status]
                    : ""
                  : "We typically reply within minutes"}
              </p>
            </div>
            <button
              onClick={toggleSound}
              className="rounded-md p-1 text-white hover:bg-white/20"
              aria-label={soundOn ? "Mute notifications" : "Enable sound"}
              title={soundOn ? "Sound on" : "Sound off"}
            >
              <span className="text-xs">{soundOn ? "🔔" : "🔕"}</span>
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-white hover:bg-white/20"
              aria-label="Close chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* ───────── PICKER VIEW ───────── */}
          {view === "picker" && (
            <div className="flex flex-1 flex-col overflow-hidden bg-background">
              <div className="border-b border-border bg-card px-4 py-3">
                <button
                  onClick={() => {
                    setNewSubject("");
                    setNewMessage("");
                    setView("compose");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow"
                  style={themeStyle}
                >
                  <Plus className="h-4 w-4" />
                  Start new conversation
                </button>
              </div>


              <div className="flex-1 overflow-y-auto">
                {convsQ.isLoading && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!convsQ.isLoading && conversations.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-foreground">
                    <Inbox className="h-10 w-10 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        No conversations yet
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {settings.welcome_message}
                      </p>
                    </div>
                  </div>
                )}
                <ul className="divide-y divide-border">
                  {conversations.map((c) => {
                    const unread = c.unread_for_user ?? 0;
                    return (
                      <li key={c.id} className="group relative">
                        <button
                          onClick={() => openConversation(c.id)}
                          className="w-full px-4 py-3 pr-10 text-left transition hover:bg-muted/60"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-foreground">
                              {c.subject || c.title || "Support request"}
                            </p>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_BADGE[c.status]}`}
                            >
                              {STATUS_LABEL[c.status]}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-foreground/75">
                            {c.last_message_preview ?? "No messages yet"}
                          </p>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{timeAgo(c.last_message_at)}</span>
                            {unread > 0 && (
                              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                                {unread > 9 ? "9+" : unread}
                              </span>
                            )}
                          </div>
                        </button>
                        <div
                          className="absolute right-2 top-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              aria-label="Conversation options"
                              title="Conversation options"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none data-[state=open]:bg-muted"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" side="bottom">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={(e) => {
                                  e.preventDefault();
                                  setPendingHideConvId(c.id);
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete conversation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* ───────── COMPOSE VIEW ───────── */}
          {view === "compose" && (
            <div className="flex flex-1 flex-col overflow-hidden bg-background">
              <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-2">
                <button
                  onClick={() => setView("picker")}
                  className="rounded-md p-1 text-foreground hover:bg-muted"
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <p className="text-sm font-semibold text-foreground">New conversation</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Subject <span className="font-normal normal-case text-muted-foreground/70">(optional)</span>
                  </label>
                  <input
                    value={newSubject}
                    onChange={(e) => setNewSubject(e.target.value)}
                    placeholder="Subject (optional)"
                    maxLength={120}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Message
                  </label>
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="How can we help?"
                    rows={6}
                    maxLength={4000}
                    className="w-full resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                {startMutation.error && (
                  <p className="text-[11px] text-destructive">
                    {(startMutation.error as Error).message}
                  </p>
                )}
              </div>
              <div className="border-t border-border bg-card px-3 py-3">
                <button
                  onClick={() => {
                    const msg = newMessage.trim();
                    if (!msg || startMutation.isPending) return;
                    startMutation.mutate({
                      subject: newSubject.trim() || undefined,
                      first_message: msg,
                    });
                  }}
                  disabled={!newMessage.trim() || startMutation.isPending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-white shadow disabled:opacity-60"
                  style={themeStyle}
                >
                  {startMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Send message
                </button>
              </div>
            </div>
          )}

          {/* ───────── THREAD VIEW ───────── */}
          {view === "thread" && (
            <>
              <div
                ref={scrollRef}
                className="flex-1 space-y-3 overflow-y-auto bg-background px-4 py-4"
              >
                <div className="flex gap-2">
                  <div className="rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2 text-sm text-card-foreground shadow-sm">
                    {settings.welcome_message}
                  </div>
                </div>

                {messagesQ.isLoading && (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                )}

                {(messagesQ.data ?? []).map((m) => {
                  const isUser = m.sender_type === "user";
                  const isOwn = isUser && !!userId && m.sender_user_id === userId;
                  return (
                    <div
                      key={m.id}
                      className={`group/msg flex items-start gap-1 ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      {isOwn && (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label="Message options"
                            className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-muted focus:opacity-100 group-hover/msg:opacity-100 data-[state=open]:opacity-100 sm:opacity-0"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="top">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onSelect={(e) => {
                                e.preventDefault();
                                setPendingDeleteId(m.id);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          isUser
                            ? "rounded-br-sm text-white"
                            : "rounded-bl-sm border border-border bg-card text-card-foreground"
                        }`}
                        style={isUser ? themeStyle : undefined}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p
                          className={`mt-1 text-[10px] ${
                            isUser ? "text-white/85" : "text-foreground/70"
                          }`}
                        >
                          {timeAgo(m.created_at)}
                          {isUser && m.read_at ? " · Seen" : ""}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <AlertDialog
                open={pendingDeleteId !== null}
                onOpenChange={(o) => {
                  if (!o && !deleteMsgMut.isPending) setPendingDeleteId(null);
                }}
              >
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this message?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove the message for everyone in this conversation.
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={deleteMsgMut.isPending}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={deleteMsgMut.isPending}
                      onClick={(e) => {
                        e.preventDefault();
                        if (pendingDeleteId) deleteMsgMut.mutate(pendingDeleteId);
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteMsgMut.isPending ? "Deleting…" : "Delete"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>


              <div className="border-t border-border bg-card px-3 py-2">
                <div className="flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a message…"
                    rows={1}
                    className="max-h-32 flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || sendMutation.isPending}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow disabled:opacity-50"
                    style={themeStyle}
                    aria-label="Send"
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {sendMutation.error && (
                  <p className="mt-1 text-[11px] text-destructive">
                    {(sendMutation.error as Error).message}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {settings.show_launcher !== false && (
        <button
          onClick={() => {
            setOpen((o) => !o);
            if (!open) setView("picker");
          }}
          title={settings.tooltip_text || "Chat with our team"}
          aria-label={open ? "Close chat" : settings.button_text || "Live Chat"}
          className={`relative flex items-center gap-2 rounded-full font-semibold text-white shadow-xl ring-1 ring-white/10 transition-all hover:scale-[1.03] hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            open || settings.show_label === false
              ? "h-14 w-14 justify-center"
              : "h-12 px-5"
          }`}
          style={themeStyle}
        >
          {(() => {
            if (open) return <X className="h-6 w-6" />;
            const Icon = LAUNCHER_ICONS[settings.icon_name] ?? MessageCircle;
            const showLabel = settings.show_label !== false;
            return (
              <>
                <Icon className={showLabel ? "h-5 w-5" : "h-6 w-6"} />
                {showLabel && (
                  <span className="hidden text-sm leading-none tracking-wide sm:inline">
                    {settings.button_text || "Live Chat"}
                  </span>
                )}
              </>
            );
          })()}
          {!open && totalUnread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white shadow ring-2 ring-background">
              {totalUnread > 9 ? "9+" : totalUnread}
            </span>
          )}
        </button>
      )}

      <AlertDialog
        open={pendingHideConvId !== null}
        onOpenChange={(o) => {
          if (!o && !hideMut.isPending) setPendingHideConvId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the conversation from your chat list only. Our support team will
              still have access to the conversation history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={hideMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={hideMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                const id = pendingHideConvId;
                if (!id) return;
                if (activeConvId === id) {
                  setActiveConvId(null);
                  setView("picker");
                }
                hideMut.mutate(id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {hideMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
