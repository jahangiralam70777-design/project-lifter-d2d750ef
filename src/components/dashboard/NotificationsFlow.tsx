import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useModuleVisibility } from "@/hooks/use-module-visibility";
import {
  Bell,
  Megaphone,
  Mail,
  Smartphone,
  MessageSquare,
  Search,
  CheckCheck,
  Filter,
  ArrowUpDown,
  Activity,
  Clock,
  ChevronRight,
  Loader2,
  X,
  Trash2,
  Pin,
  ExternalLink,
} from "lucide-react";
import { useMyNotifications, type MyNotification } from "@/hooks/use-my-notifications";
import { useMyBroadcasts } from "@/hooks/use-my-broadcasts";
import type { MyBroadcast } from "@/lib/broadcasts.functions";

const TYPE_ICON: Record<MyNotification["type"], typeof Bell> = {
  announcement: Megaphone,
  push: Smartphone,
  email: Mail,
  in_app: MessageSquare,
  broadcast: Megaphone,
};

const TYPE_TINT: Record<MyNotification["type"], string> = {
  announcement: "from-fuchsia-500/30 to-purple-500/10 text-fuchsia-300",
  push: "from-sky-400/30 to-blue-500/10 text-sky-300",
  email: "from-cyan-400/30 to-sky-500/10 text-cyan-300",
  in_app: "from-violet-500/30 to-indigo-500/10 text-violet-300",
  broadcast: "from-amber-500/30 to-rose-500/10 text-amber-300",
};

const TYPE_LABEL: Record<MyNotification["type"], string> = {
  announcement: "Announcement",
  push: "Push",
  email: "Email",
  in_app: "In-app",
  broadcast: "Broadcast",
};

const FILTERS = ["All", "Broadcast", "Announcement", "In-app", "Push", "Email"] as const;
type FilterKey = (typeof FILTERS)[number];

const filterMap: Record<FilterKey, MyNotification["type"] | null> = {
  All: null,
  Broadcast: "broadcast",
  Announcement: "announcement",
  "In-app": "in_app",
  Push: "push",
  Email: "email",
};

function relativeTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const DISMISS_KEY = "ca-aspire:notif-dismissed";

function loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function persistDismissed(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
}

// Smart route inference when notification has no explicit link.
// Lets admins broadcast "New quiz published" without manually setting URLs.
function inferRoute(n: MyNotification): string | null {
  const txt = `${n.title} ${n.body ?? ""}`.toLowerCase();
  if (/quiz/.test(txt)) return "/quiz";
  if (/mock\s*test|mock[- ]?exam/.test(txt)) return "/mock-test";
  if (/class|video|lecture/.test(txt)) return "/classes";
  if (/flash[- ]?card/.test(txt)) return "/flash-cards";
  if (/note/.test(txt)) return "/short-notes";
  if (/question\s*bank|qns|qnsbank/.test(txt)) return "/qns-bank";
  if (/result|report|score|progress/.test(txt)) return "/daily-progress";
  if (/mcq/.test(txt)) return "/mcq-practice";
  return null;
}

function normaliseInternalPath(target: string | null) {
  if (!target || /^https?:\/\//i.test(target)) return null;
  return target.startsWith("/") ? target : `/${target}`;
}

export function NotificationsFlow() {
  const { isPathHidden } = useModuleVisibility();
  const { items, unread, isLoading, markRead, markAll } = useMyNotifications();
  const navigate = useNavigate();
  const [tab, setTab] = useState<FilterKey>("All");
  const [q, setQ] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [selected, setSelected] = useState<MyNotification | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed());

  // Auto-prune dismissed ids that no longer exist server-side, so the set
  // doesn't grow unbounded as old notifications fall off.
  useEffect(() => {
    if (!items.length || dismissed.size === 0) return;
    const alive = new Set(items.map((i) => i.id));
    let changed = false;
    const next = new Set<string>();
    dismissed.forEach((id) => {
      if (alive.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) {
      persistDismissed(next);
      setDismissed(next);
    }
  }, [items, dismissed]);

  const visibleItems = useMemo(() => items.filter((n) => !dismissed.has(n.id)), [items, dismissed]);

  const pinned = useMemo(
    () => visibleItems.filter((n) => n.priority === "critical" || n.priority === "high"),
    [visibleItems],
  );

  const filtered = useMemo(() => {
    let arr = [...visibleItems];
    const tf = filterMap[tab];
    if (tf) arr = arr.filter((n) => n.type === tf);
    if (onlyUnread) arr = arr.filter((n) => !n.read);
    if (q.trim()) {
      const k = q.toLowerCase();
      arr = arr.filter(
        (n) => n.title.toLowerCase().includes(k) || (n.body ?? "").toLowerCase().includes(k),
      );
    }
    return arr;
  }, [visibleItems, tab, onlyUnread, q]);

  const todayCount = visibleItems.filter((i) => {
    const t = i.sent_at ?? i.created_at;
    return new Date(t).toDateString() === new Date().toDateString();
  }).length;

  const visibleUnread = visibleItems.filter((n) => !n.read).length;

  const dismiss = (id: string) => {
    const next = new Set(dismissed);
    next.add(id);
    persistDismissed(next);
    setDismissed(next);
    setSelected((cur) => (cur?.id === id ? null : cur));
  };

  // Click opens the detail modal. Marks as read at the same time so the
  // badge in the sidebar stays in sync without waiting for a navigation.
  const openDetails = (n: MyNotification) => {
    if (!n.read) markRead.mutate(n.id);
    setSelected(n);
  };

  const navigateTo = (n: MyNotification) => {
    const link = (n.link ?? "").trim();
    const target = link || inferRoute(n);
    if (!target) return;
    const internalPath = normaliseInternalPath(target);
    if (internalPath && isPathHidden(internalPath)) return;
    if (/^https?:\/\//i.test(target)) {
      window.open(target, "_blank", "noopener");
      return;
    }
    const path = internalPath ?? "/dashboard";
    setSelected(null);
    try {
      navigate({ to: path as never });
    } catch {
      window.location.assign(path);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="glass shadow-card-soft relative overflow-hidden rounded-3xl p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--neon-purple)]/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-48 w-48 rounded-full bg-[var(--neon-blue)]/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-[var(--neon-blue)]">
              Inbox · Live
            </div>
            <h1 className="font-display mt-1 text-3xl font-bold tracking-tight md:text-4xl">
              Notifications <span className="text-gradient">Center</span>
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Realtime announcements, exam alerts and learning updates from your faculty.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Stat label="Total" value={visibleItems.length} />
            <Stat label="Unread" value={visibleUnread} accent />
            <Stat label="Today" value={todayCount} />
          </div>
        </div>
      </div>

      <BroadcastsInbox />

      {/* Filter bar */}
      <div className="glass shadow-card-soft rounded-2xl p-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const active = tab === f;
            return (
              <button
                key={f}
                onClick={() => setTab(f)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
                  active
                    ? "bg-cta-gradient text-white shadow-glow"
                    : "border border-border/60 bg-background/40 text-foreground/70 hover:text-foreground"
                }`}
              >
                {f}
              </button>
            );
          })}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search notifications…"
                className="h-9 w-56 rounded-xl border border-border/60 bg-background/40 pl-8 pr-3 text-xs outline-none focus:border-[var(--neon-blue)]/60"
              />
            </div>
            <button className="flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 text-xs text-foreground/80 hover:text-foreground">
              <ArrowUpDown className="h-3.5 w-3.5" /> Latest
            </button>
            <button
              onClick={() => setOnlyUnread((v) => !v)}
              className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs transition-colors ${
                onlyUnread
                  ? "border border-[var(--neon-purple)]/60 bg-[var(--neon-purple)]/15 text-foreground"
                  : "border border-border/60 bg-background/40 text-foreground/80"
              }`}
            >
              <Filter className="h-3.5 w-3.5" /> Unread
            </button>
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending || unread === 0}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 text-xs text-foreground/80 hover:text-foreground disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark all
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {pinned.length > 0 && tab === "All" && !onlyUnread && !q.trim() && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                <Pin className="h-3 w-3 text-[var(--neon-purple)]" /> Pinned · High priority
              </div>
              {pinned.slice(0, 3).map((n) => (
                <NotifCard
                  key={`pin-${n.id}`}
                  n={n}
                  onOpen={() => openDetails(n)}
                  onDismiss={() => dismiss(n.id)}
                />
              ))}
            </div>
          )}

          {isLoading ? (
            <div className="glass flex items-center justify-center rounded-2xl p-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading notifications…
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">
              {visibleItems.length === 0
                ? "No notifications yet. You'll see new announcements here in realtime."
                : "No notifications match these filters."}
            </div>
          ) : (
            filtered.map((n) => (
              <NotifCard
                key={n.id}
                n={n}
                onOpen={() => openDetails(n)}
                onDismiss={() => dismiss(n.id)}
              />
            ))
          )}
        </div>

        <aside className="space-y-4">
          <ActivitySummary total={visibleItems.length} unread={visibleUnread} today={todayCount} />
        </aside>
      </div>

      {selected && (
        <DetailModal
          n={selected}
          canNavigate={
            !isPathHidden(
              normaliseInternalPath((selected.link ?? "").trim() || inferRoute(selected) || "") ?? "",
            )
          }
          onClose={() => setSelected(null)}
          onNavigate={() => navigateTo(selected)}
          onDismiss={() => dismiss(selected.id)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div
      className={`flex min-w-[78px] flex-col items-center rounded-2xl border px-3 py-2 ${
        accent
          ? "border-[var(--neon-purple)]/40 bg-[var(--neon-purple)]/10"
          : "border-border/60 bg-background/40"
      }`}
    >
      <span className={`font-display text-xl font-bold ${accent ? "text-gradient" : ""}`}>
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
    </div>
  );
}

function NotifCard({
  n,
  onOpen,
  onDismiss,
}: {
  n: MyNotification;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const Icon = TYPE_ICON[n.type] ?? Bell;
  const pTint =
    n.priority === "critical" || n.priority === "high"
      ? "border-red-400/40 bg-red-500/10 text-red-300"
      : n.priority === "medium"
        ? "border-amber-400/40 bg-amber-500/10 text-amber-300"
        : "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
  const unread = !n.read;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`group glass shadow-card-soft relative cursor-pointer overflow-hidden rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-glow ${
        unread ? "border-[var(--neon-blue)]/40" : "border-border/60"
      }`}
    >
      {unread && (
        <span className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-[var(--neon-purple)] to-[var(--neon-blue)]" />
      )}
      <div className="flex items-start gap-3">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${TYPE_TINT[n.type]} ring-1 ring-white/10`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold">{n.title}</h3>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${pTint}`}
            >
              {n.priority}
            </span>
            <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground">
              {TYPE_LABEL[n.type]}
            </span>
            {unread && (
              <span className="ml-1 inline-flex h-2 w-2 animate-pulse rounded-full bg-[var(--neon-blue)] shadow-[0_0_10px_var(--neon-blue)]" />
            )}
            <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" /> {relativeTime(n.sent_at ?? n.created_at)}
            </span>
          </div>
          {n.body && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {n.body}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="bg-cta-gradient flex items-center gap-1 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white shadow-glow"
            >
              Open <ChevronRight className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-[11px] text-foreground/70 hover:text-foreground"
              aria-label="Dismiss notification"
            >
              <Trash2 className="h-3 w-3" /> Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailModal({
  n,
  canNavigate,
  onClose,
  onNavigate,
  onDismiss,
}: {
  n: MyNotification;
  canNavigate: boolean;
  onClose: () => void;
  onNavigate: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const Icon = TYPE_ICON[n.type] ?? Bell;
  const hasTarget = canNavigate && !!(n.link?.trim() || inferRoute(n));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass shadow-card-soft relative w-full max-w-lg overflow-hidden rounded-3xl border border-border/70 p-6 animate-in fade-in zoom-in-95 duration-200"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-border/60 bg-background/40 p-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 pr-8">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${TYPE_TINT[n.type]} ring-1 ring-white/10`}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {TYPE_LABEL[n.type]}
              </span>
              <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {n.priority}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {relativeTime(n.sent_at ?? n.created_at)}
              </span>
            </div>
            <h2 className="mt-2 font-display text-xl font-bold leading-tight">{n.title}</h2>
          </div>
        </div>
        <div className="mt-4 max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border/50 bg-background/30 p-4 text-sm leading-relaxed text-foreground/90">
          {n.body?.trim() || "No additional details."}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onDismiss}
            className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs text-foreground/80 hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" /> Dismiss
          </button>
          {hasTarget && (
            <button
              onClick={onNavigate}
              className="bg-cta-gradient flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-glow"
            >
              Open related page <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ActivitySummary({
  total,
  unread,
  today,
}: {
  total: number;
  unread: number;
  today: number;
}) {
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-[var(--neon-blue)]" />
        <h3 className="text-sm font-semibold">Activity Summary</h3>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Mini label="Total" value={total} />
        <Mini label="Unread" value={unread} />
        <Mini label="Today" value={today} />
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 py-2">
      <div className="font-display text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function BroadcastsInbox() {
  const { items, unread, markRead, hide } = useMyBroadcasts();
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<MyBroadcast | null>(null);
  if (!items.length) return null;
  const sorted = [...items].sort((a, b) => {
    if (!!a.read_at !== !!b.read_at) return a.read_at ? 1 : -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  const shown = expanded ? sorted : sorted.slice(0, 3);
  const openBroadcast = (broadcast: MyBroadcast) => {
    if (!broadcast.read_at) markRead.mutate(broadcast.recipient_id);
    setSelected({ ...broadcast, read_at: broadcast.read_at ?? new Date().toISOString() });
  };
  return (
    <div className="glass shadow-card-soft rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-[var(--neon-purple)]" />
          <h3 className="text-sm font-semibold">Admin Broadcasts</h3>
          {unread > 0 ? (
            <span className="rounded-full bg-[var(--neon-purple)]/20 px-2 py-0.5 text-[10px] font-semibold text-[var(--neon-purple)]">
              {unread} new
            </span>
          ) : null}
        </div>
        {sorted.length > 3 ? (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {expanded ? "Show less" : `Show all (${sorted.length})`}
          </button>
        ) : null}
      </div>
      <ul className="space-y-2">
        {shown.map((b: MyBroadcast) => {
          const tag =
            b.priority === "urgent"
              ? "bg-red-500/15 text-red-500"
              : b.priority === "important"
                ? "bg-amber-500/15 text-amber-500"
                : "bg-primary/15 text-primary";
          return (
            <li
              key={b.recipient_id}
              className={`flex items-start gap-3 rounded-xl border border-border/60 bg-background/40 p-3 transition-colors ${
                !b.read_at ? "ring-1 ring-[var(--neon-purple)]/30" : ""
              }`}
            >
              <div className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tag}`}>
                {b.priority === "urgent" ? "Urgent" : b.priority === "important" ? "Important" : "Notice"}
              </div>
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => openBroadcast(b)}
                  className="block w-full text-left"
                >
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold">{b.subject}</p>
                  {!b.read_at ? (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--neon-purple)]" aria-hidden />
                  ) : null}
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{b.body}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {b.sender_name ?? "Admin"} · {new Date(b.sent_at ?? b.created_at).toLocaleString()}
                </p>
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => openBroadcast(b)}
                  className="rounded-md border border-border/60 px-2 py-1 text-[10px] text-foreground/80 hover:text-foreground"
                >
                  Open
                </button>
                {!b.read_at ? (
                  <button
                    onClick={() => markRead.mutate(b.recipient_id)}
                    className="rounded-md border border-border/60 px-2 py-1 text-[10px] text-foreground/80 hover:text-foreground"
                  >
                    Mark read
                  </button>
                ) : null}
                <button
                  onClick={() => {
                    if (hide.isPending) return;
                    if (!window.confirm("Delete this notification?")) return;
                    hide.mutate(b.recipient_id);
                  }}
                  aria-label="Delete broadcast"
                  title="Delete from my inbox"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-red-500/10 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {selected && (
        <BroadcastDetailModal
          b={selected}
          onClose={() => setSelected(null)}
          onDismiss={() => {
            setSelected(null);
            hide.mutate(selected.recipient_id);
          }}
        />
      )}
    </div>
  );
}

function BroadcastDetailModal({
  b,
  onClose,
  onDismiss,
}: {
  b: MyBroadcast;
  onClose: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-background/70 backdrop-blur-md" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass shadow-card-soft relative w-full max-w-lg overflow-hidden rounded-3xl border border-border/70 p-6 animate-in fade-in zoom-in-95 duration-200"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-border/60 bg-background/40 p-1.5 text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 pr-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--neon-purple)]/15 text-[var(--neon-purple)] ring-1 ring-white/10">
            <Megaphone className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="rounded-full border border-border/60 bg-background/40 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Broadcast
            </span>
            <h2 className="mt-2 font-display text-xl font-bold leading-tight">{b.subject}</h2>
            <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              {b.sender_name ?? "Admin"} · {new Date(b.sent_at ?? b.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="mt-4 max-h-[40vh] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-border/50 bg-background/30 p-4 text-sm leading-relaxed text-foreground/90">
          {b.body}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={onDismiss}
            className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 py-2 text-xs text-foreground/80 hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete from inbox
          </button>
          <button
            onClick={onClose}
            className="bg-cta-gradient rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-glow"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
