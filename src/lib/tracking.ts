import { supabase } from "@/integrations/supabase/client";

/**
 * Lightweight in-browser activity tracker.
 *
 * - All writes go through the user's own RLS-protected INSERT policy on
 *   `public.activity_events`. Admin can read everything; users can only
 *   insert events tagged with their own id.
 * - Events are buffered and flushed in batches (every 2s, max 20) to keep
 *   the network noise low. On `visibilitychange === 'hidden'` we flush
 *   immediately so we don't lose tail events when the tab closes.
 * - Failures are swallowed — tracking must never break user flows.
 */

export type ActivityEventType =
  | "page_view"
  | "click"
  | "submit"
  | "login"
  | "logout"
  | "api_call"
  | "crud"
  | "admin_action"
  | "navigation";

export type TrackInput = {
  event_type: ActivityEventType;
  page_url?: string | null;
  page_path?: string | null;
  referrer?: string | null;
  element_id?: string | null;
  element_label?: string | null;
  element_role?: string | null;
  module?: string | null;
  target_kind?: string | null;
  target_id?: string | null;
  metadata?: Record<string, unknown>;
};

type PendingEvent = TrackInput & {
  user_id: string | null;
  user_agent: string | null;
  device: string | null;
  created_at: string;
};

const queue: PendingEvent[] = [];
// Events captured before we know whether the visitor is signed in.
// We hold them briefly and either flush (once auth resolves) or drop
// them (if the visitor is anonymous after the grace window).
const pendingPreAuth: PendingEvent[] = [];
let authResolved = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let currentUserId: string | null = null;
let initialized = false;

const BATCH_SIZE = 20;
const FLUSH_MS = 2000;

function detectDevice(ua: string | null): string {
  if (!ua) return "unknown";
  if (/mobile|android|iphone|ipod/i.test(ua)) return "mobile";
  if (/ipad|tablet/i.test(ua)) return "tablet";
  return "desktop";
}

function truncate(s: string | null | undefined, max = 160): string | null {
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

async function flush(): Promise<void> {
  if (queue.length === 0) return;
  const batch = queue.splice(0, queue.length);
  try {
    const { error } = await supabase.from("activity_events").insert(batch as never);
    if (error) {
      // Surface to console so silent RLS/permission failures are debuggable.
      // Tracking still never throws into the user's flow.
      console.warn("[tracking] insert failed", error.message, { count: batch.length });
    } else if (typeof window !== "undefined" && (window as unknown as { __TRACK_DEBUG?: boolean }).__TRACK_DEBUG) {
      console.debug("[tracking] flushed", batch.length, "events");
    }
  } catch (e) {
    console.warn("[tracking] insert threw", e);
  }
}

function scheduleFlush(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_MS);
}

/** Wire up unload handlers + cache the current user once. */
export function initTracking(): () => void {
  if (initialized || typeof window === "undefined") return () => {};
  initialized = true;

  // Resolve initial user, then flush any early events we held.
  void supabase.auth.getSession().then(({ data }) => {
    currentUserId = data.session?.user?.id ?? null;
    authResolved = true;
    drainPreAuth();
  });
  // Hard timeout: if auth never resolves (offline / SDK stuck), give up
  // on the buffered anonymous events instead of leaking memory.
  window.setTimeout(() => {
    if (!authResolved) {
      authResolved = true;
      drainPreAuth();
    }
  }, 4000);

  const sub = supabase.auth.onAuthStateChange((event, session) => {
    currentUserId = session?.user?.id ?? null;
    authResolved = true;
    drainPreAuth();
    if (event === "SIGNED_IN") void trackEvent({ event_type: "login" });
    if (event === "SIGNED_OUT") void trackEvent({ event_type: "logout" });
  });

  const onVis = () => {
    if (document.visibilityState === "hidden") void flush();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", () => void flush());

  return () => {
    sub.data.subscription.unsubscribe();
    document.removeEventListener("visibilitychange", onVis);
  };
}

export function trackEvent(input: TrackInput): void {
  if (typeof window === "undefined") return;
  const ua = navigator.userAgent ?? null;
  const evt: PendingEvent = {
    ...input,
    user_id: currentUserId,
    user_agent: ua,
    device: detectDevice(ua),
    page_url: input.page_url ?? window.location.href,
    page_path: input.page_path ?? window.location.pathname,
    referrer: input.referrer ?? document.referrer ?? null,
    element_id: truncate(input.element_id ?? null, 120),
    element_label: truncate(input.element_label ?? null, 160),
    element_role: input.element_role ?? null,
    module: input.module ?? null,
    target_kind: input.target_kind ?? null,
    target_id: input.target_id ?? null,
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  // If auth hasn't resolved yet, hold the event briefly so we don't
  // drop the initial page_view / clicks that fire before the Supabase
  // session is hydrated.
  if (!evt.user_id) {
    if (!authResolved) {
      pendingPreAuth.push(evt);
      if (pendingPreAuth.length > 50) pendingPreAuth.splice(0, pendingPreAuth.length - 50);
      return;
    }
    // Truly anonymous visitor — RLS would reject; drop.
    return;
  }

  queue.push(evt);
  if (queue.length >= BATCH_SIZE) {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    void flush();
  } else {
    scheduleFlush();
  }
}

function drainPreAuth(): void {
  if (pendingPreAuth.length === 0) return;
  const uid = currentUserId;
  const batch = pendingPreAuth.splice(0, pendingPreAuth.length);
  if (!uid) return; // visitor is anonymous, discard
  for (const evt of batch) {
    evt.user_id = uid;
    queue.push(evt);
  }
  scheduleFlush();
}

export function trackPageView(path: string, url?: string): void {
  trackEvent({
    event_type: "page_view",
    page_path: path,
    page_url: url,
    module: inferModuleFromPath(path),
  });
}

export function trackClick(el: Element, extra?: Partial<TrackInput>): void {
  const target = findTrackTarget(el);
  if (!target) return;
  trackEvent({
    event_type: "click",
    element_id: target.id,
    element_label: target.label,
    element_role: target.role,
    module: extra?.module ?? inferModuleFromPath(window.location.pathname),
    ...extra,
  });
}

export function trackSubmit(form: HTMLFormElement): void {
  trackEvent({
    event_type: "submit",
    element_id: form.id || form.getAttribute("name") || form.getAttribute("data-track") || "form",
    element_label:
      form.getAttribute("aria-label") || form.getAttribute("data-track-label") || "form",
    element_role: "form",
    module: inferModuleFromPath(window.location.pathname),
  });
}

export function trackApi(name: string, ok: boolean, meta?: Record<string, unknown>): void {
  trackEvent({
    event_type: "api_call",
    element_id: name,
    element_label: name,
    metadata: { ok, ...(meta ?? {}) },
  });
}

export function trackCrud(
  action: "create" | "update" | "delete",
  kind: string,
  id?: string | null,
  meta?: Record<string, unknown>,
): void {
  trackEvent({
    event_type: "crud",
    target_kind: kind,
    target_id: id ?? null,
    element_label: `${action} ${kind}`,
    metadata: { action, ...(meta ?? {}) },
  });
}

export function trackAdminAction(name: string, meta?: Record<string, unknown>): void {
  trackEvent({
    event_type: "admin_action",
    element_id: name,
    element_label: name,
    module: "admin",
    metadata: meta ?? {},
  });
}

function findTrackTarget(start: Element): { id: string; label: string; role: string } | null {
  let el: Element | null = start;
  for (let i = 0; i < 5 && el; i++) {
    const dt = el.getAttribute?.("data-track");
    const tag = el.tagName?.toLowerCase();
    const role = el.getAttribute?.("role");
    if (dt || tag === "button" || tag === "a" || role === "button") {
      const text = (
        el.getAttribute?.("aria-label") ||
        el.getAttribute?.("data-track-label") ||
        (el as HTMLElement).innerText ||
        el.getAttribute?.("title") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
      return {
        id: dt || el.id || text.slice(0, 40) || tag || "el",
        label: text || dt || tag || "element",
        role: role || tag || "element",
      };
    }
    el = el.parentElement;
  }
  return null;
}

function inferModuleFromPath(path: string): string {
  if (path.startsWith("/admin")) {
    const seg = path.split("/")[2];
    return seg ? `admin/${seg}` : "admin";
  }
  if (path === "/" || path === "") return "landing";
  const seg = path.split("/")[1];
  return seg || "app";
}
