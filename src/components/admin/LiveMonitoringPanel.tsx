import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, LogIn, Pause, Play, Smartphone, Tablet, Monitor, Users2 } from "lucide-react";
import {
  subscribeToLogins,
  subscribeToActivity,
  fetchRecentLogins,
  fetchRecentActivity,
  fetchDisplayNames,
  computeActiveNow,
  deriveDeviceType,
  type LoginEvent,
  type ActivityEvent,
  type DeviceType,
} from "@/lib/adminRealtimeService";

const MAX_FEED = 30;
const ACTIVE_WINDOW_MS = 5 * 60 * 1000;
const BATCH_INTERVAL_MS = 1500;

type LoginRow = LoginEvent & { display_name?: string };
type ActivityRow = ActivityEvent & { display_name?: string };

/**
 * Real-time monitoring widget for the admin user dashboard.
 * - Active Now counter (sliding 5-minute window)
 * - Live login stream with device tag
 * - Live activity feed with pause-on-hover
 * - Live device breakdown derived from streamed user_agents
 */
export function LiveMonitoringPanel() {
  const [logins, setLogins] = useState<LoginRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [paused, setPaused] = useState(false);
  const [highlightLogin, setHighlightLogin] = useState<string | null>(null);
  const [highlightActivity, setHighlightActivity] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Buffered inserts to avoid render storms.
  const loginBuffer = useRef<LoginEvent[]>([]);
  const activityBuffer = useRef<ActivityEvent[]>([]);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // Initial backlog + realtime subscriptions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [l, a] = await Promise.all([fetchRecentLogins(25), fetchRecentActivity(40)]);
        if (cancelled) return;
        const ids = [
          ...l.map((x) => x.user_id),
          ...(a.map((x) => x.user_id).filter(Boolean) as string[]),
        ];
        const names = await fetchDisplayNames(ids);
        if (cancelled) return;
        setLogins(l.map((x) => ({ ...x, display_name: names.get(x.user_id) })));
        setActivity(
          a.map((x) => ({ ...x, display_name: x.user_id ? names.get(x.user_id) : undefined })),
        );
      } catch {
        /* silent — RLS or transient error */
      }
    })();

    const offLogins = subscribeToLogins((row) => loginBuffer.current.push(row));
    const offActivity = subscribeToActivity((row) => activityBuffer.current.push(row));

    return () => {
      cancelled = true;
      offLogins();
      offActivity();
    };
  }, []);

  // Drain buffers in batches; respects pause.
  useEffect(() => {
    const id = window.setInterval(async () => {
      if (pausedRef.current) return;
      const l = loginBuffer.current.splice(0);
      const a = activityBuffer.current.splice(0);
      if (l.length === 0 && a.length === 0) {
        setTick((t) => (t + 1) % 1_000_000); // keep active-now window fresh
        return;
      }
      const ids = [
        ...l.map((x) => x.user_id),
        ...(a.map((x) => x.user_id).filter(Boolean) as string[]),
      ];
      const names = await fetchDisplayNames(ids);
      if (l.length > 0) {
        const enriched: LoginRow[] = l.map((x) => ({ ...x, display_name: names.get(x.user_id) }));
        setLogins((prev) => [...enriched.reverse(), ...prev].slice(0, MAX_FEED));
        setHighlightLogin(enriched[0]?.id ?? null);
        window.setTimeout(() => setHighlightLogin(null), 1500);
      }
      if (a.length > 0) {
        const enriched: ActivityRow[] = a.map((x) => ({
          ...x,
          display_name: x.user_id ? names.get(x.user_id) : undefined,
        }));
        setActivity((prev) => [...enriched.reverse(), ...prev].slice(0, MAX_FEED));
        setHighlightActivity(enriched[0]?.id ?? null);
        window.setTimeout(() => setHighlightActivity(null), 1500);
      }
    }, BATCH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  const activeNow = useMemo(
    () => computeActiveNow(logins, activity, ACTIVE_WINDOW_MS),
    // tick re-evaluates window without new events
    [logins, activity, tick],
  );

  const deviceBreakdown = useMemo(() => {
    const counts = new Map<DeviceType, number>();
    for (const l of logins) {
      const d =
        l.device && /mobile|tablet|desktop/i.test(l.device)
          ? ((l.device[0].toUpperCase() + l.device.slice(1).toLowerCase()) as DeviceType)
          : deriveDeviceType(l.user_agent);
      counts.set(d, (counts.get(d) ?? 0) + 1);
    }
    const total = logins.length || 1;
    return (["Mobile", "Tablet", "Desktop"] as DeviceType[]).map((d) => ({
      label: d,
      count: counts.get(d) ?? 0,
      percent: Math.round(((counts.get(d) ?? 0) / total) * 100),
    }));
  }, [logins]);

  return (
    <section className="grid gap-3 lg:grid-cols-12">
      {/* Active now + device breakdown */}
      <div className="lg:col-span-4 space-y-3">
        <div className="glass shadow-card-soft relative overflow-hidden rounded-2xl p-5">
          <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            LIVE
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Users2 className="h-3.5 w-3.5" /> Active now
          </div>
          <p className="mt-2 font-display text-4xl font-bold tabular-nums">{activeNow}</p>
          <p className="text-[10px] text-muted-foreground">Unique users · last 5 minutes</p>
        </div>

        <div className="glass shadow-card-soft rounded-2xl p-4">
          <div className="mb-3 flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-violet-400" />
            <h3 className="font-display text-sm font-bold tracking-tight">Live device share</h3>
          </div>
          <div className="space-y-2.5">
            {deviceBreakdown.map((d) => {
              const Icon =
                d.label === "Mobile" ? Smartphone : d.label === "Tablet" ? Tablet : Monitor;
              const grad =
                d.label === "Mobile"
                  ? "from-violet-500 to-fuchsia-500"
                  : d.label === "Tablet"
                    ? "from-amber-500 to-orange-500"
                    : "from-emerald-500 to-teal-500";
              return (
                <div key={d.label}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="inline-flex items-center gap-1.5">
                      <Icon className="h-3 w-3" /> {d.label}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {d.percent}% · {d.count}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-background/40">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${grad} transition-all duration-700`}
                      style={{ width: `${d.percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {logins.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Waiting for login events…</p>
            )}
          </div>
        </div>
      </div>

      {/* Live login stream */}
      <FeedCard
        title="Live login stream"
        icon={<LogIn className="h-4 w-4 text-emerald-400" />}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        empty={logins.length === 0}
        className="lg:col-span-4"
      >
        {logins.map((l) => {
          const device =
            l.device && /mobile|tablet|desktop/i.test(l.device)
              ? l.device[0].toUpperCase() + l.device.slice(1).toLowerCase()
              : deriveDeviceType(l.user_agent);
          return (
            <li
              key={l.id}
              className={`rounded-xl border border-border/40 bg-background/40 p-2.5 text-xs transition-all duration-500 ${
                highlightLogin === l.id
                  ? "ring-1 ring-emerald-400/60 shadow-[0_0_18px_rgba(16,185,129,0.25)]"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {l.display_name ?? "Unknown User"}
                </span>
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {relativeTime(l.login_at)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="rounded-md bg-violet-500/15 px-1.5 py-0.5 text-violet-300">
                  {device}
                </span>
                {l.browser && <span>{l.browser}</span>}
                {l.ip && <span className="font-mono">{l.ip}</span>}
              </div>
            </li>
          );
        })}
      </FeedCard>

      {/* Live activity feed */}
      <FeedCard
        title="Live activity feed"
        icon={<Activity className="h-4 w-4 text-fuchsia-400" />}
        paused={paused}
        onTogglePause={() => setPaused((p) => !p)}
        empty={activity.length === 0}
        className="lg:col-span-4"
      >
        {activity.map((a) => (
          <li
            key={a.id}
            className={`rounded-xl border border-border/40 bg-background/40 p-2.5 text-xs transition-all duration-500 ${
              highlightActivity === a.id
                ? "ring-1 ring-fuchsia-400/60 shadow-[0_0_18px_rgba(217,70,239,0.25)]"
                : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium">
                {a.display_name ?? (a.user_id ? "Unknown User" : "Anonymous")}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {relativeTime(a.created_at)}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="rounded-md bg-fuchsia-500/15 px-1.5 py-0.5 text-fuchsia-300">
                {a.event_type}
              </span>
              {a.element_label && <span className="truncate">{a.element_label}</span>}
              {a.page_path && <span className="truncate font-mono">{a.page_path}</span>}
            </div>
          </li>
        ))}
      </FeedCard>
    </section>
  );
}

function FeedCard({
  title,
  icon,
  children,
  paused,
  onTogglePause,
  empty,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  paused: boolean;
  onTogglePause: () => void;
  empty: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      className={`glass shadow-card-soft flex flex-col rounded-2xl p-4 ${className}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-display text-sm font-bold tracking-tight">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {hover && <span className="text-[10px] text-muted-foreground">Paused on hover</span>}
          <button
            onClick={onTogglePause}
            className="inline-flex items-center gap-1 rounded-md bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {paused ? (
              <>
                <Play className="h-3 w-3" /> Resume
              </>
            ) : (
              <>
                <Pause className="h-3 w-3" /> Pause
              </>
            )}
          </button>
        </div>
      </div>
      {empty ? (
        <p className="py-10 text-center text-xs text-muted-foreground">Waiting for live events…</p>
      ) : (
        <ul
          className={`space-y-1.5 overflow-y-auto pr-1 ${hover ? "" : ""}`}
          style={{ maxHeight: 360 }}
        >
          {children}
        </ul>
      )}
    </div>
  );
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}
