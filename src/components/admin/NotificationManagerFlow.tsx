import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Search,
  Plus,
  Bell,
  Send,
  Trash2,
  Edit3,
  Copy,
  Calendar,
  Mail,
  Smartphone,
  MessageSquare,
  Megaphone,
  CircleDot,
  Sparkles,
  Loader2,
  X,
  Save,
  Filter,
  Pause,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListNotifications,
  adminNotificationStats,
  adminCreateNotification,
  adminUpdateNotification,
  adminDeleteNotification,
  adminSendNotification,
  adminSetNotificationStatus,
} from "@/lib/admin-notifications.functions";
import { adminListLevels, adminListSubjects } from "@/lib/admin-mcq.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirmDialog } from "@/components/ui/confirm-imperative";
import { PageSizeSelect } from "@/components/ui/page-size-select";

type Notification = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  type: "announcement" | "push" | "email" | "in_app" | "broadcast";
  priority: "low" | "medium" | "high" | "critical";
  status: "draft" | "scheduled" | "sent" | "failed" | "paused" | "unread" | "read";
  audience: "all" | "level" | "subject" | "role" | "users";
  audience_level: string | null;
  audience_subject_id: string | null;
  audience_role: "admin" | "moderator" | "student" | null;
  audience_user_ids: string[];
  scheduled_at: string | null;
  sent_at: string | null;
  delivered_count: number;
  open_count: number;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  sent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  scheduled: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  draft: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  failed: "border-red-500/30 bg-red-500/10 text-red-400",
  paused: "border-zinc-400/30 bg-zinc-400/10 text-zinc-400",
};

const TYPE_ICON = {
  announcement: Megaphone,
  push: Smartphone,
  email: Mail,
  in_app: MessageSquare,
  broadcast: Megaphone,
} as const;

export function NotificationManagerFlow() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListNotifications);
  const statsFn = useServerFn(adminNotificationStats);
  const delFn = useServerFn(adminDeleteNotification);
  const sendFn = useServerFn(adminSendNotification);
  const statusFn = useServerFn(adminSetNotificationStatus);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [type, setType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<Notification | null>(null);
  const [creating, setCreating] = useState(false);

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel(`notif-live-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["admin-notifications"] });
        qc.invalidateQueries({ queryKey: ["admin-notif-stats"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const stats = useQuery({ queryKey: ["admin-notif-stats"], queryFn: () => statsFn() });
  const list = useQuery({
    queryKey: ["admin-notifications", { search, status, type, page, pageSize }],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          status: status === "all" ? undefined : (status as Notification["status"]),
          type: type === "all" ? undefined : (type as Notification["type"]),
          page,
          pageSize,
        },
      }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-notifications"] });
    qc.invalidateQueries({ queryKey: ["admin-notif-stats"] });
  };

  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Notification deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const sendM = useMutation({
    mutationFn: (id: string) => sendFn({ data: { id } }),
    onSuccess: (d) => {
      toast.success(`Sent to ${d.delivered} users`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const statusM = useMutation({
    mutationFn: (v: { id: string; status: Notification["status"] }) => statusFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(`Marked ${v.status}`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = (list.data?.rows ?? []) as Notification[];
  const total = list.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4 p-4 lg:p-6">
      {/* Header */}
      <section className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-[var(--neon-purple)]/25 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Badge className="bg-cta-gradient border-0 text-white shadow-glow">
              <Sparkles className="mr-1 h-3 w-3" /> Comms Engine
            </Badge>
            <h1 className="font-display text-3xl font-bold tracking-tight md:text-4xl">
              Notification <span className="text-gradient">Manager</span>
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Create, schedule and broadcast announcements. Delivered to students instantly via
              realtime.
            </p>
          </div>
          <Button
            className="bg-cta-gradient text-white shadow-glow"
            onClick={() => setCreating(true)}
          >
            <Plus className="mr-2 h-4 w-4" /> Create Notification
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { l: "Total", v: stats.data?.total ?? 0, i: Bell, c: "#a855f7" },
          { l: "Sent", v: stats.data?.sent ?? 0, i: Send, c: "#22d3ee" },
          { l: "Scheduled", v: stats.data?.scheduled ?? 0, i: Calendar, c: "#a78bfa" },
          { l: "Drafts", v: stats.data?.draft ?? 0, i: Edit3, c: "#fbbf24" },
          { l: "Failed", v: stats.data?.failed ?? 0, i: X, c: "#ef4444" },
        ].map(({ l, v, i: Icon, c }) => (
          <div key={l} className="glass shadow-card-soft rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: `${c}22`, color: c }}
              >
                <Icon className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 font-display text-2xl font-bold tracking-tight">
              {v.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">{l}</p>
          </div>
        ))}
      </section>

      {/* Filters */}
      <section className="glass shadow-card-soft rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search notifications…"
              className="h-9 rounded-xl pl-9"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="announcement">Announcement</SelectItem>
              <SelectItem value="push">Push</SelectItem>
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="in_app">In-app</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="ml-auto text-[10px]">
            <Filter className="mr-1 h-3 w-3" />
            {total} total
          </Badge>
        </div>
      </section>

      {/* Table */}
      <section className="glass shadow-card-soft overflow-hidden rounded-2xl">
        <div className="flex items-center justify-between border-b border-border/40 px-4 py-3">
          <div>
            <h3 className="font-display text-sm font-bold tracking-tight">All Notifications</h3>
            <p className="text-[11px] text-muted-foreground">
              Page {page} of {totalPages} · live sync
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-glow" />{" "}
            Realtime
          </div>
        </div>
        <div className="overflow-x-auto">
          {list.isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              No notifications yet. Click "Create Notification" to send your first one.
            </div>
          ) : (
            <table className="w-full min-w-[860px] text-xs">
              <thead className="bg-background/30 text-muted-foreground">
                <tr className="text-left">
                  {[
                    "Title",
                    "Type",
                    "Audience",
                    "Priority",
                    "Status",
                    "Delivered",
                    "Sent / Scheduled",
                    "Actions",
                  ].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((n) => {
                  const TI = TYPE_ICON[n.type];
                  return (
                    <tr key={n.id} className="border-t border-border/30 hover:bg-background/40">
                      <td className="max-w-[260px] px-3 py-3">
                        <p className="truncate text-sm font-medium">{n.title}</p>
                        {n.body && (
                          <p className="line-clamp-1 text-[10px] text-muted-foreground">{n.body}</p>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <TI className="h-3 w-3" />
                          {n.type}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground capitalize">
                        {n.audience === "all"
                          ? "Everyone"
                          : n.audience === "level"
                            ? `Level: ${n.audience_level ?? "—"}`
                            : n.audience === "role"
                              ? `Role: ${n.audience_role ?? "—"}`
                              : n.audience === "users"
                                ? `${n.audience_user_ids.length} users`
                                : "Subject"}
                      </td>
                      <td className="px-3 py-3 capitalize">
                        <Badge variant="outline" className="text-[10px]">
                          {n.priority}
                        </Badge>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] capitalize ${STATUS_TONE[n.status]}`}
                        >
                          <CircleDot className="mr-1 h-2 w-2" />
                          {n.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono">{n.delivered_count.toLocaleString()}</td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {n.sent_at
                          ? new Date(n.sent_at).toLocaleString()
                          : n.scheduled_at
                            ? `→ ${new Date(n.scheduled_at).toLocaleString()}`
                            : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <IconBtn title="Edit" onClick={() => setEditing(n)}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </IconBtn>
                          {n.status !== "sent" && (
                            <IconBtn
                              title="Send now"
                              onClick={() => {
                                void (async () => {
                                  const recipients =
                                    n.audience === "all"
                                      ? "ALL users"
                                      : n.audience === "level"
                                        ? `Level: ${n.audience_level ?? "—"}`
                                        : n.audience === "role"
                                          ? `Role: ${n.audience_role ?? "—"}`
                                          : n.audience === "users"
                                            ? `${n.audience_user_ids.length} specific user(s)`
                                            : "Subject audience";
                                  if (
                                    await confirmDialog({
                                      title: "Send this notification now?",
                                      description: `Recipients: ${recipients}. This cannot be undone.`,
                                      confirmLabel: "Send now",
                                      variant: "destructive",
                                    })
                                  )
                                    sendM.mutate(n.id);
                                })();
                              }}
                            >
                              <Send className="h-3.5 w-3.5 text-emerald-400" />
                            </IconBtn>
                          )}
                          {n.status === "scheduled" && (
                            <IconBtn
                              title="Pause"
                              onClick={() => statusM.mutate({ id: n.id, status: "paused" })}
                            >
                              <Pause className="h-3.5 w-3.5" />
                            </IconBtn>
                          )}
                          {n.status === "paused" && (
                            <IconBtn
                              title="Resume"
                              onClick={() => statusM.mutate({ id: n.id, status: "scheduled" })}
                            >
                              <Play className="h-3.5 w-3.5" />
                            </IconBtn>
                          )}
                          <IconBtn
                            title="Delete"
                            onClick={() => {
                              void (async () => { if (await confirmDialog({ title: "Delete this notification?", variant: "destructive", confirmLabel: "Delete" })) delM.mutate(n.id); })();
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                          </IconBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-3">
              <PageSizeSelect
                value={pageSize}
                onChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {(creating || editing) && (
        <NotificationEditor
          notif={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="rounded-lg border border-border/40 bg-background/40 p-1.5 hover:border-[var(--neon-purple)]/60 hover:text-[var(--neon-purple)]"
    >
      {children}
    </button>
  );
}

// ============================================================
// Editor
// ============================================================
function NotificationEditor({
  notif,
  onClose,
  onSaved,
}: {
  notif: Notification | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const createFn = useServerFn(adminCreateNotification);
  const updateFn = useServerFn(adminUpdateNotification);
  const sendFn = useServerFn(adminSendNotification);
  const levelsFn = useServerFn(adminListLevels);
  const subjectsFn = useServerFn(adminListSubjects);

  const levels = useQuery({ queryKey: ["admin-levels"], queryFn: () => levelsFn() });
  const subjects = useQuery({ queryKey: ["admin-subjects"], queryFn: () => subjectsFn() });

  const [form, setForm] = useState({
    title: notif?.title ?? "",
    body: notif?.body ?? "",
    link: notif?.link ?? "",
    type: notif?.type ?? "in_app",
    priority: notif?.priority ?? "medium",
    audience: notif?.audience ?? "all",
    audience_level: notif?.audience_level ?? "",
    audience_subject_id: notif?.audience_subject_id ?? "",
    audience_role: notif?.audience_role ?? "student",
    scheduled_at: notif?.scheduled_at ? notif.scheduled_at.slice(0, 16) : "",
  });

  const save = useMutation({
    mutationFn: async (sendNow: boolean) => {
      const payload = {
        title: form.title,
        body: form.body,
        link: form.link || null,
        type: form.type as Notification["type"],
        priority: form.priority as Notification["priority"],
        audience: form.audience as Notification["audience"],
        audience_level: form.audience === "level" ? form.audience_level || null : null,
        audience_subject_id: form.audience === "subject" ? form.audience_subject_id || null : null,
        audience_role:
          form.audience === "role" ? (form.audience_role as Notification["audience_role"]) : null,
        audience_user_ids: [],
        scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
      };
      let id = notif?.id;
      if (notif) await updateFn({ data: { id: notif.id, ...payload } });
      else {
        const row = await createFn({ data: payload });
        id = row.id;
      }
      if (sendNow && id) await sendFn({ data: { id } });
    },
    onSuccess: (_d, sendNow) => {
      toast.success(sendNow ? "Notification sent" : notif ? "Saved" : "Created");
      onSaved();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{notif ? "Edit Notification" : "Create Notification"}</DialogTitle>
          <DialogDescription>Compose your message and pick the audience.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Title *</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Audit Mock Test 12 is live"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Body</Label>
            <Textarea
              rows={3}
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Link (optional)</Label>
            <Input
              value={form.link}
              onChange={(e) => setForm({ ...form, link: e.target.value })}
              placeholder="/mock-test/abc-123"
            />
          </div>
          <div>
            <Label>Type</Label>
            <Select
              value={form.type}
              onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_app">In-app</SelectItem>
                <SelectItem value="push">Push</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="announcement">Announcement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Priority</Label>
            <Select
              value={form.priority}
              onValueChange={(v) => setForm({ ...form, priority: v as typeof form.priority })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Audience</Label>
            <Select
              value={form.audience}
              onValueChange={(v) => setForm({ ...form, audience: v as typeof form.audience })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                <SelectItem value="level">By level</SelectItem>
                <SelectItem value="subject">By subject</SelectItem>
                <SelectItem value="role">By role</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.audience === "level" && (
            <div>
              <Label>Level</Label>
              <Select
                value={form.audience_level}
                onValueChange={(v) => setForm({ ...form, audience_level: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose level" />
                </SelectTrigger>
                <SelectContent>
                  {((levels.data as Array<{ code: string; name: string }> | undefined) ?? []).map(
                    (l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.audience === "subject" && (
            <div>
              <Label>Subject</Label>
              <Select
                value={form.audience_subject_id}
                onValueChange={(v) => setForm({ ...form, audience_subject_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose subject" />
                </SelectTrigger>
                <SelectContent>
                  {((subjects.data as Array<{ id: string; name: string }> | undefined) ?? []).map(
                    (s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          {form.audience === "role" && (
            <div>
              <Label>Role</Label>
              <Select
                value={form.audience_role}
                onValueChange={(v) =>
                  setForm({ ...form, audience_role: v as typeof form.audience_role })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Students</SelectItem>
                  <SelectItem value="moderator">Moderators</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="md:col-span-2">
            <Label>Schedule (optional)</Label>
            <Input
              type="datetime-local"
              value={form.scheduled_at}
              onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={!form.title.trim() || save.isPending}
            onClick={() => save.mutate(false)}
          >
            {save.isPending ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-1 h-4 w-4" />
            )}
            Save {form.scheduled_at ? "& schedule" : "as draft"}
          </Button>
          <Button
            className="bg-cta-gradient text-white"
            disabled={!form.title.trim() || save.isPending}
            onClick={() => save.mutate(true)}
          >
            <Send className="mr-1 h-4 w-4" /> Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
