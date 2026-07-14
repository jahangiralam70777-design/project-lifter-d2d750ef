import { useMemo, useState } from "react";

type Day = { date: string; count: number; minutes: number; mcqs: number };

function fmtMinutes(min: number) {
  if (!min) return "0m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * GitHub-style contribution heatmap. Renders the last N days as week columns
 * (Mon..Sun rows). Hovering a cell reveals exact study minutes + MCQ count.
 */
export function ContributionHeatmap({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<{ d: Day; x: number; y: number } | null>(null);

  const { weeks, max, monthMarks } = useMemo(() => {
    if (!days.length)
      return {
        weeks: [] as (Day | null)[][],
        max: 1,
        monthMarks: [] as { col: number; label: string }[],
      };
    // Pad the start so the first column begins on Monday.
    const first = new Date(days[0].date + "T00:00:00");
    const offset = (first.getDay() + 6) % 7; // Mon=0 .. Sun=6
    const padded: (Day | null)[] = [...Array(offset).fill(null), ...days];
    const cols: (Day | null)[][] = [];
    for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7));
    const max = Math.max(1, ...days.map((d) => d.count));
    const marks: { col: number; label: string }[] = [];
    let lastMonth = -1;
    cols.forEach((col, ci) => {
      const firstReal = col.find((c) => c);
      if (!firstReal) return;
      const m = new Date(firstReal.date + "T00:00:00").getMonth();
      if (m !== lastMonth) {
        marks.push({ col: ci, label: MONTHS[m] });
        lastMonth = m;
      }
    });
    return { weeks: cols, max, monthMarks: marks };
  }, [days]);

  const level = (count: number) => {
    if (count === 0) return 0;
    const r = count / max;
    if (r > 0.66) return 4;
    if (r > 0.33) return 3;
    if (r > 0.1) return 2;
    return 1;
  };

  const tone = (lvl: number) =>
    lvl === 0
      ? "color-mix(in oklab, var(--muted) 60%, transparent)"
      : `color-mix(in oklab, var(--neon-purple) ${15 + lvl * 21}%, transparent)`;

  return (
    <div className="relative">
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1">
          {/* month labels */}
          <div className="flex gap-[3px] pl-7 text-[9px] text-muted-foreground">
            {weeks.map((_, ci) => {
              const mark = monthMarks.find((m) => m.col === ci);
              return (
                <div key={ci} className="w-[11px] shrink-0">
                  {mark ? <span className="block -translate-x-0.5">{mark.label}</span> : null}
                </div>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            {/* weekday labels */}
            <div className="mr-1 flex w-6 flex-col gap-[3px] text-[8px] text-muted-foreground">
              {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((d, i) => (
                <div key={i} className="flex h-[11px] items-center">
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {Array.from({ length: 7 }).map((_, ri) => {
                  const d = col[ri];
                  if (!d) return <div key={ri} className="h-[11px] w-[11px]" />;
                  const lvl = level(d.count);
                  return (
                    <div
                      key={ri}
                      onMouseEnter={(e) => setHover({ d, x: e.clientX, y: e.clientY })}
                      onMouseMove={(e) => setHover({ d, x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHover(null)}
                      className="h-[11px] w-[11px] rounded-[3px] ring-1 ring-inset ring-border/40 transition-transform hover:scale-125 hover:ring-foreground/40"
                      style={{
                        background: tone(lvl),
                        boxShadow:
                          lvl >= 3
                            ? `0 0 6px color-mix(in oklab, var(--neon-purple) ${lvl * 12}%, transparent)`
                            : undefined,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* legend */}
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[9px] text-muted-foreground">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <span
            key={l}
            className="h-[11px] w-[11px] rounded-[3px] ring-1 ring-inset ring-border/40"
            style={{ background: tone(l) }}
          />
        ))}
        <span>More</span>
      </div>

      {hover && (
        <div
          className="glass pointer-events-none fixed z-50 rounded-lg px-2.5 py-1.5 text-[10px] shadow-card-soft"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <p className="font-display font-bold">
            {new Date(hover.d.date + "T00:00:00").toLocaleDateString("en", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </p>
          <p className="text-muted-foreground">
            {hover.d.count} session{hover.d.count === 1 ? "" : "s"} · {fmtMinutes(hover.d.minutes)}{" "}
            · {hover.d.mcqs} MCQs
          </p>
        </div>
      )}
    </div>
  );
}

export function HeatmapSummary({ days }: { days: Day[] }) {
  const week = days.slice(-7);
  const month = days.slice(-30);
  const year = days;
  const sum = (arr: Day[], k: "count" | "minutes" | "mcqs") => arr.reduce((s, d) => s + d[k], 0);
  const cell = (label: string, arr: Day[]) => (
    <div className="rounded-xl bg-background/40 p-3 text-center">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="font-display mt-1 text-base font-bold">{fmtMinutes(sum(arr, "minutes"))}</p>
      <p className="text-[10px] text-muted-foreground">
        {sum(arr, "mcqs")} MCQs · {arr.filter((d) => d.count > 0).length} days
      </p>
    </div>
  );
  return (
    <div className="grid grid-cols-3 gap-2">
      {cell("This week", week)}
      {cell("This month", month)}
      {cell("This year", year)}
    </div>
  );
}
