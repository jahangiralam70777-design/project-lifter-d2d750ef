import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";
import { studentDailyProgress } from "@/lib/student-daily-progress.functions";
import { useRealtimeActivity } from "@/hooks/use-realtime-invalidator";

type RangeKey = "today" | "week" | "month" | "30d";
const RANGE_LABEL: Record<RangeKey, string> = {
  today: "Today",
  week: "This Week",
  month: "This Month",
  "30d": "Last 30 Days",
};

/**
 * Standalone Accuracy Over Time card — identical chart, data source,
 * calculations, colors, tooltips, range filter, and realtime behavior as the
 * Daily Progress page. Shares the same React Query cache key so both views
 * always render identical results from a single network round-trip.
 */
export function AccuracyOverTimeCard({
  options = ["today", "week"],
}: {
  options?: RangeKey[];
}) {
  const fetchFn = useServerFn(studentDailyProgress);
  const qc = useQueryClient();
  const activity = useRealtimeActivity();
  const lastRealtimeActivityRef = useRef(activity);

  const { data, isLoading } = useQuery({
    queryKey: ["student-daily-progress"],
    queryFn: () => fetchFn(),
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (activity === lastRealtimeActivityRef.current) return;
    lastRealtimeActivityRef.current = activity;
    void qc.invalidateQueries({
      queryKey: ["student-daily-progress"],
      refetchType: "active",
    });
  }, [activity, qc]);

  const [accRange, setAccRange] = useState<RangeKey>("week");
  const series = useMemo(() => data?.series ?? [], [data]);
  const accData = useMemo(() => {
    const n = accRange === "today" ? 1 : accRange === "week" ? 7 : 30;
    return series.slice(-n).map((d) => ({ label: d.label, value: d.accuracy }));
  }, [series, accRange]);

  return (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Accuracy Over Time</h3>
        <select
          value={accRange}
          onChange={(e) => setAccRange(e.target.value as RangeKey)}
          className="glass rounded-lg border-0 bg-background/40 px-2.5 py-1 text-[11px] font-medium outline-none"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {RANGE_LABEL[o]}
            </option>
          ))}
        </select>
      </div>
      <div className="h-48">
        {isLoading && !data ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading accuracy…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={accData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="accG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.18 150)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="oklch(0.72 0.18 150)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                width={28}
                domain={[0, 100]}
              />
              <RTooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--popover)",
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--foreground)" }}
                formatter={(v: number) => [`${v}%`, ""]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="oklch(0.65 0.2 150)"
                strokeWidth={2.5}
                fill="url(#accG)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
