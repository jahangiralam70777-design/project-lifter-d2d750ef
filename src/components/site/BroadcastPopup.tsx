import { useEffect, useMemo } from "react";
import { Megaphone, X, AlertTriangle, Pin } from "lucide-react";
import { useMyBroadcasts } from "@/hooks/use-my-broadcasts";
import type { MyBroadcast } from "@/lib/broadcasts.functions";

const PRIORITY_STYLES: Record<
  MyBroadcast["priority"],
  { ring: string; tag: string; icon: typeof Megaphone }
> = {
  urgent: {
    ring: "ring-red-500/50 shadow-red-500/20",
    tag: "bg-red-500/15 text-red-500 border-red-500/30",
    icon: AlertTriangle,
  },
  important: {
    ring: "ring-amber-500/50 shadow-amber-500/20",
    tag: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    icon: Pin,
  },
  normal: {
    ring: "ring-primary/40 shadow-primary/20",
    tag: "bg-primary/15 text-primary border-primary/30",
    icon: Megaphone,
  },
};

/**
 * Broadcast popup.
 *
 * A broadcast appears in `items` only while the recipient row still has
 * `read_at = null` AND `dismissed_at = null` (server-enforced; see
 * `listMyBroadcasts`). The popup shows the first unread broadcast whose
 * delivery_methods includes "popup".
 *
 * Closing / Got it / overlay click ALL persist the dismissal on the server
 * via `markRead` (sets `read_at`). The previous implementation only
 * persisted dismissal in sessionStorage, which cleared on browser close /
 * private mode / new device, so users saw every prior broadcast again on
 * the next login. We now treat any close interaction as "acknowledged" so
 * a broadcast appears exactly once per recipient.
 */
export function BroadcastPopup() {
  const { items, markRead } = useMyBroadcasts();

  const queue = useMemo(() => {
    return items.filter((b) => {
      if (b.read_at) return false;
      const methods = Array.isArray(b.delivery_methods) ? b.delivery_methods : [];
      return methods.includes("popup");
    });
  }, [items]);

  const current = queue[0];

  const acknowledge = () => {
    if (!current) return;
    // Optimistic + server persistence in one shot. Once the server row
    // has `read_at` set, listMyBroadcasts will never return it again, so
    // this broadcast is gone for this user across all devices and sessions.
    markRead.mutate(current.recipient_id);
  };

  useEffect(() => {
    if (!current) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") acknowledge();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.recipient_id]);

  if (!current) return null;

  const style = PRIORITY_STYLES[current.priority] ?? PRIORITY_STYLES.normal;
  const Icon = style.icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="broadcast-popup-title"
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={acknowledge}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl ring-1 ${style.ring}`}
      >
        <button
          type="button"
          onClick={acknowledge}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="px-6 pb-2 pt-6">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.tag}`}
            >
              <Icon className="h-3 w-3" />
              {current.priority}
            </span>
          </div>
          <h2 id="broadcast-popup-title" className="mt-3 text-lg font-semibold leading-tight">
            {current.subject}
          </h2>
        </div>
        <div className="max-h-[55vh] overflow-y-auto px-6 pb-6 pt-2">
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {current.body}
          </div>
          {current.sender_name ? (
            <p className="mt-4 text-xs text-muted-foreground">— {current.sender_name}</p>
          ) : null}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-4 py-3">
          <button
            type="button"
            onClick={acknowledge}
            disabled={markRead.isPending}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
