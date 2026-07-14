import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SeriesPoint = {
  date: string;
  label: string;
  attempts: number;
  mcqs: number;
  correct: number;
  total: number;
  minutes: number;
  accuracy: number;
};

type SubjectAgg = {
  id: string;
  name: string;
  completionPct: number;
  avgScore: number;
};

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass shadow-card-soft rounded-3xl p-5">
      <div className="mb-3">
        <h3 className="font-display text-base font-bold">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="h-56 w-full">{children}</div>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function GlassTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-2.5 py-1.5 text-[10px] shadow-card-soft">
      <p className="font-display font-bold">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-muted-foreground">
          <span style={{ color: p.color }}>●</span> {p.name}:{" "}
          <b className="text-foreground">
            {p.value}
            {unit ?? ""}
          </b>
        </p>
      ))}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fontSize: 10, fill: "var(--muted-foreground)" },
  tickLine: false,
  axisLine: false,
} as const;

export function TrendCharts({
  series,
  subjects,
  days,
}: {
  series: SeriesPoint[];
  subjects: SubjectAgg[];
  days: number;
}) {
  const data = series.slice(-days);
  const subjData = subjects
    .filter((s) => s.avgScore > 0 || s.completionPct > 0)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 8)
    .map((s) => ({
      name: s.name.length > 12 ? s.name.slice(0, 11) + "…" : s.name,
      accuracy: s.avgScore,
      completion: s.completionPct,
    }));

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <ChartCard title="Accuracy Trend" subtitle={`Daily accuracy · last ${days} days`}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--neon-purple)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--neon-purple)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} domain={[0, 100]} width={34} />
            <Tooltip content={<GlassTooltip unit="%" />} />
            <Area
              type="monotone"
              dataKey="accuracy"
              name="Accuracy"
              stroke="var(--neon-purple)"
              strokeWidth={2}
              fill="url(#accGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="MCQ Progress Trend" subtitle={`MCQ sessions per day · last ${days} days`}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} allowDecimals={false} width={34} />
            <Tooltip content={<GlassTooltip />} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
            <Bar dataKey="mcqs" name="MCQ sessions" radius={[4, 4, 0, 0]} fill="var(--neon-blue)" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Study Time Trend" subtitle={`Minutes studied per day · last ${days} days`}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="timeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--neon-pink)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--neon-pink)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" {...axisProps} minTickGap={24} />
            <YAxis {...axisProps} allowDecimals={false} width={34} />
            <Tooltip content={<GlassTooltip unit="m" />} />
            <Area
              type="monotone"
              dataKey="minutes"
              name="Minutes"
              stroke="var(--neon-pink)"
              strokeWidth={2}
              fill="url(#timeGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Subject Performance" subtitle="Average accuracy by subject">
        <ResponsiveContainer>
          {subjData.length ? (
            <BarChart
              data={subjData}
              layout="vertical"
              margin={{ top: 6, right: 12, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} {...axisProps} />
              <YAxis type="category" dataKey="name" {...axisProps} width={86} />
              <Tooltip
                content={<GlassTooltip unit="%" />}
                cursor={{ fill: "var(--muted)", opacity: 0.3 }}
              />
              <Bar dataKey="accuracy" name="Accuracy" radius={[0, 4, 4, 0]}>
                {subjData.map((s, i) => (
                  <Cell
                    key={i}
                    fill={
                      s.accuracy >= 70
                        ? "var(--neon-purple)"
                        : s.accuracy >= 50
                          ? "var(--neon-blue)"
                          : "oklch(0.7 0.2 25)"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Complete sessions to see subject performance.
            </div>
          )}
        </ResponsiveContainer>
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard
          title="Chapter Completion Trend"
          subtitle="Completion % across your top subjects"
        >
          <ResponsiveContainer>
            {subjData.length ? (
              <BarChart data={subjData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="name"
                  {...axisProps}
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                  height={48}
                />
                <YAxis {...axisProps} domain={[0, 100]} width={34} />
                <Tooltip
                  content={<GlassTooltip unit="%" />}
                  cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                />
                <Bar
                  dataKey="completion"
                  name="Completion"
                  radius={[4, 4, 0, 0]}
                  fill="var(--neon-blue)"
                />
              </BarChart>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Complete chapters to see completion trends.
              </div>
            )}
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
