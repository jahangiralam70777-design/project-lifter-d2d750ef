import { getRoleDisplayName } from "@/lib/role-display";
/* eslint-disable @typescript-eslint/no-explicit-any */
// Premium User Command Drawer — Phase 2 enterprise upgrade.
// Self-contained: opens via `userId` prop, renders Sheet-style drawer
// with Overview / Timeline / Notes / Tags / Bans / Messages tabs.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  X,
  Pin,
  Trash2,
  Plus,
  Send,
  ShieldAlert,
  Tag as TagIcon,
  Clock,
  StickyNote,
  Mail,
  LogOut,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listNotes,
  createNote,
  deleteNote,
  updateNote,
  listTags,
  addTag,
  removeTag,
  sendMessage,
  listSentMessages,
  applyBan,
  liftBan,
  listBans,
  revokeAllSessions,
  getUserTimeline,
} from "@/lib/admin-user-center.functions";

type UserLite = {
  id: string;
  display_name: string;
  email: string | null;
  status: string;
  level?: string;
  roles?: string[];
  created_at: string;
  last_login_at?: string | null;
  total_login_count?: number;
  referral_source?: string | null;
  email_verified?: boolean;
};

const TABS = [
  { k: "overview", l: "Overview", i: CheckCircle2 },
  { k: "timeline", l: "Timeline", i: Clock },
  { k: "notes", l: "Notes", i: StickyNote },
  { k: "tags", l: "Tags", i: TagIcon },
  { k: "bans", l: "Bans", i: ShieldAlert },
  { k: "messages", l: "Messages", i: Mail },
] as const;

type TabKey = (typeof TABS)[number]["k"];

export function UserCommandDrawer({
  user,
  onClose,
}: {
  user: UserLite | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  if (!user) return null;
  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-gradient-to-b from-background to-background/80 p-0"
      >
        <div className="sticky top-0 z-10 border-b border-white/10 bg-background/80 px-6 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-bold">{user.display_name}</h2>
                <Badge variant="outline" className="text-[10px]">
                  {user.status}
                </Badge>
                {user.email_verified && (
                  <Badge className="bg-emerald-500/15 text-emerald-400 text-[10px]">verified</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close user drawer">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  tab === t.k
                    ? "bg-gradient-to-r from-violet-600/30 to-fuchsia-500/20 text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                }`}
              >
                <t.i className="h-3.5 w-3.5" />
                {t.l}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-5">
          {tab === "overview" && <OverviewTab user={user} />}
          {tab === "timeline" && <TimelineTab userId={user.id} />}
          {tab === "notes" && <NotesTab userId={user.id} />}
          {tab === "tags" && <TagsTab userId={user.id} />}
          {tab === "bans" && <BansTab userId={user.id} />}
          {tab === "messages" && <MessagesTab userId={user.id} />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ----------------------------------------------------------------
// Overview
// ----------------------------------------------------------------
function OverviewTab({ user }: { user: UserLite }) {
  const revokeFn = useServerFn(revokeAllSessions);
  const revoke = useMutation({
    mutationFn: () => revokeFn({ data: { userId: user.id } }),
    onSuccess: () => toast.success("All sessions revoked"),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <StatCard label="Status" value={user.status} />
      <StatCard label="Role" value={(user.roles ?? []).map(getRoleDisplayName).join(", ") || "No role assigned"} />
      <StatCard label="Level" value={user.level ?? "—"} />
      <StatCard
        label="Joined"
        value={new Date(user.created_at).toLocaleDateString()}
      />
      <StatCard
        label="Last login"
        value={user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never"}
      />
      <StatCard label="Login count" value={(user.total_login_count ?? 0).toLocaleString()} />
      <StatCard label="Referral" value={user.referral_source ?? "—"} />
      <StatCard label="Verified" value={user.email_verified ? "Yes" : "No"} />
      <div className="md:col-span-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-center"
          onClick={() => revoke.mutate()}
          disabled={revoke.isPending}
        >
          <LogOut className="mr-2 h-3.5 w-3.5" /> Force logout all devices
        </Button>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass rounded-xl border border-white/5 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-display text-sm font-semibold">{value}</p>
    </div>
  );
}

// ----------------------------------------------------------------
// Timeline
// ----------------------------------------------------------------
function TimelineTab({ userId }: { userId: string }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<string>("all");
  const fn = useServerFn(getUserTimeline);
  const q = useQuery({
    queryKey: ["uc-timeline", userId, search, kind],
    queryFn: () =>
      fn({
        data: {
          userId,
          days: 90,
          search: search || undefined,
          kinds: kind === "all" ? undefined : [kind],
        },
      }),
  });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search timeline…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All events</SelectItem>
            <SelectItem value="login">Logins</SelectItem>
            <SelectItem value="admin">Admin actions</SelectItem>
            <SelectItem value="ban">Bans</SelectItem>
            <SelectItem value="message">Messages</SelectItem>
            <SelectItem value="note">Notes</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {q.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}
      {q.data && q.data.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No events found.</p>
      )}
      <ol className="relative ml-3 space-y-3 border-l border-white/10 pl-4">
        {(q.data ?? []).map((e: any) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[19px] top-1.5 h-2.5 w-2.5 rounded-full bg-violet-500 ring-4 ring-violet-500/10" />
            <div className="glass rounded-lg border border-white/5 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">{e.label}</p>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(e.at).toLocaleString()}
                </span>
              </div>
              {e.detail && (
                <p className="mt-1 text-[11px] text-muted-foreground">{e.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ----------------------------------------------------------------
// Notes
// ----------------------------------------------------------------
function NotesTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listNotes);
  const createFn = useServerFn(createNote);
  const deleteFn = useServerFn(deleteNote);
  const updateFn = useServerFn(updateNote);
  const q = useQuery({
    queryKey: ["uc-notes", userId],
    queryFn: () => listFn({ data: { userId } }),
  });
  const inv = () => qc.invalidateQueries({ queryKey: ["uc-notes", userId] });

  const [form, setForm] = useState({ title: "", content: "", note_type: "internal" });
  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          userId,
          title: form.title || undefined,
          content: form.content,
          note_type: form.note_type as any,
        },
      }),
    onSuccess: () => {
      toast.success("Note added");
      setForm({ title: "", content: "", note_type: "internal" });
      inv();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: inv,
  });
  const pin = useMutation({
    mutationFn: (v: { id: string; is_pinned: boolean }) =>
      updateFn({ data: { id: v.id, is_pinned: v.is_pinned } }),
    onSuccess: inv,
  });

  return (
    <div className="space-y-4">
      <div className="glass space-y-2 rounded-xl border border-white/5 p-3">
        <div className="flex gap-2">
          <Input
            placeholder="Title (optional)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="h-9"
          />
          <Select
            value={form.note_type}
            onValueChange={(v) => setForm({ ...form, note_type: v })}
          >
            <SelectTrigger className="h-9 w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="internal">Internal</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="support">Support</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="investigation">Investigation</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea
          placeholder="Note content…"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          rows={3}
        />
        <Button
          size="sm"
          disabled={!form.content.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add note
        </Button>
      </div>

      {q.isLoading && <Skeleton className="h-24 w-full" />}
      {(q.data ?? []).map((n: any) => (
        <div
          key={n.id}
          className={`glass rounded-xl border p-3 ${
            n.is_pinned ? "border-amber-500/40" : "border-white/5"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {n.note_type}
              </Badge>
              {n.title && <p className="text-xs font-semibold">{n.title}</p>}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => pin.mutate({ id: n.id, is_pinned: !n.is_pinned })}
                aria-label={n.is_pinned ? "Unpin note" : "Pin note"}
                aria-pressed={n.is_pinned}
              >
                <Pin className={`h-3.5 w-3.5 ${n.is_pinned ? "text-amber-400" : ""}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 hover:text-red-400"
                onClick={() => del.mutate(n.id)}
                aria-label="Delete note"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{n.content}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {new Date(n.created_at).toLocaleString()}
          </p>
        </div>
      ))}
      {q.data && q.data.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No notes yet.</p>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Tags
// ----------------------------------------------------------------
function TagsTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listTags);
  const addFn = useServerFn(addTag);
  const removeFn = useServerFn(removeTag);
  const q = useQuery({
    queryKey: ["uc-tags", userId],
    queryFn: () => listFn({ data: { userId } }),
  });
  const inv = () => qc.invalidateQueries({ queryKey: ["uc-tags", userId] });
  const [value, setValue] = useState("");
  const add = useMutation({
    mutationFn: () => addFn({ data: { userId, tag: value.trim() } }),
    onSuccess: () => {
      setValue("");
      inv();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (tag: string) => removeFn({ data: { userId, tag } }),
    onSuccess: inv,
  });
  const SUGGEST = ["VIP", "Premium", "Top Performer", "Scholarship", "High Risk", "Needs Review"];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Add a tag…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value.trim() && add.mutate()}
          className="h-9"
        />
        <Button size="sm" disabled={!value.trim() || add.isPending} onClick={() => add.mutate()}>
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {SUGGEST.map((s) => (
          <button
            key={s}
            onClick={() => {
              setValue(s);
            }}
            className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground hover:border-violet-500/40 hover:text-foreground"
          >
            + {s}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {q.isLoading && <Skeleton className="h-7 w-32" />}
        {(q.data ?? []).map((t: any) => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs"
          >
            {t.tag}
            <button
              onClick={() => remove.mutate(t.tag)}
              className="ml-1 text-muted-foreground hover:text-red-400"
              aria-label={`Remove ${t.tag}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {q.data && q.data.length === 0 && (
          <p className="text-xs text-muted-foreground">No tags assigned.</p>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Bans
// ----------------------------------------------------------------
function BansTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listBans);
  const applyFn = useServerFn(applyBan);
  const liftFn = useServerFn(liftBan);
  const q = useQuery({
    queryKey: ["uc-bans", userId],
    queryFn: () => listFn({ data: { userId } }),
  });
  const inv = () => qc.invalidateQueries({ queryKey: ["uc-bans", userId] });
  const [form, setForm] = useState({
    kind: "suspension" as "suspension" | "temporary_ban" | "permanent_ban",
    durationHours: 24,
    reason: "",
  });
  const apply = useMutation({
    mutationFn: () =>
      applyFn({
        data: {
          userId,
          kind: form.kind,
          reason: form.reason || undefined,
          durationHours: form.kind === "permanent_ban" ? undefined : form.durationHours,
        },
      }),
    onSuccess: () => {
      toast.success("Ban applied — user signed out");
      inv();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const lift = useMutation({
    mutationFn: () => liftFn({ data: { userId } }),
    onSuccess: () => {
      toast.success("Bans lifted");
      inv();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="glass space-y-2 rounded-xl border border-amber-500/20 p-3">
        <div className="flex items-center gap-2 text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          <p className="text-xs font-semibold">Apply ban / suspension</p>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as any })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="suspension">Suspension</SelectItem>
              <SelectItem value="temporary_ban">Temporary Ban</SelectItem>
              <SelectItem value="permanent_ban">Permanent Ban</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            value={form.durationHours}
            disabled={form.kind === "permanent_ban"}
            onChange={(e) => setForm({ ...form, durationHours: Number(e.target.value) || 1 })}
            className="h-9"
            placeholder="Hours"
          />
          <Button
            variant="destructive"
            size="sm"
            className="h-9"
            disabled={apply.isPending}
            onClick={() => apply.mutate()}
          >
            Apply ban
          </Button>
        </div>
        <Textarea
          placeholder="Reason (optional, visible in audit log)"
          rows={2}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Ban history</p>
          <Button variant="outline" size="sm" onClick={() => lift.mutate()} disabled={lift.isPending}>
            Lift all active
          </Button>
        </div>
        {q.isLoading && <Skeleton className="h-16 w-full" />}
        {(q.data ?? []).map((b: any) => (
          <div key={b.id} className="glass rounded-lg border border-white/5 p-2.5">
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  b.lifted_at ? "" : "border-amber-500/40 text-amber-400"
                }`}
              >
                {b.kind} {b.lifted_at ? "(lifted)" : "(active)"}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {new Date(b.created_at).toLocaleString()}
              </span>
            </div>
            {b.reason && (
              <p className="mt-1 text-xs text-muted-foreground">{b.reason}</p>
            )}
            {b.ends_at && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Ends: {new Date(b.ends_at).toLocaleString()}
              </p>
            )}
          </div>
        ))}
        {q.data && q.data.length === 0 && (
          <p className="py-3 text-center text-xs text-muted-foreground">No ban history.</p>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Messages
// ----------------------------------------------------------------
function MessagesTab({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSentMessages);
  const sendFn = useServerFn(sendMessage);
  const q = useQuery({
    queryKey: ["uc-msgs", userId],
    queryFn: () => listFn({ data: { userId } }),
  });
  const inv = () => qc.invalidateQueries({ queryKey: ["uc-msgs", userId] });
  const [form, setForm] = useState({
    kind: "message" as "message" | "warning" | "notice" | "announcement",
    subject: "",
    body: "",
  });
  const send = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          userId,
          kind: form.kind,
          subject: form.subject || undefined,
          body: form.body,
        },
      }),
    onSuccess: () => {
      toast.success("Message sent");
      setForm({ kind: "message", subject: "", body: "" });
      inv();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="glass space-y-2 rounded-xl border border-white/5 p-3">
        <div className="grid gap-2 md:grid-cols-[140px_1fr]">
          <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v as any })}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="message">Message</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="notice">Notice</SelectItem>
              <SelectItem value="announcement">Announcement</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Subject (optional)"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="h-9"
          />
        </div>
        <Textarea
          rows={3}
          placeholder="Message body…"
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
        />
        <Button
          size="sm"
          disabled={!form.body.trim() || send.isPending}
          onClick={() => send.mutate()}
        >
          <Send className="mr-1 h-3.5 w-3.5" /> Send
        </Button>
      </div>

      {q.isLoading && <Skeleton className="h-20 w-full" />}
      {(q.data ?? []).map((m: any) => (
        <div key={m.id} className="glass rounded-lg border border-white/5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">
                {m.kind}
              </Badge>
              {m.subject && <p className="text-xs font-semibold">{m.subject}</p>}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {m.read_at ? "✓ read" : "sent"}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{m.body}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {new Date(m.created_at).toLocaleString()}
          </p>
        </div>
      ))}
      {q.data && q.data.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
      )}
    </div>
  );
}
