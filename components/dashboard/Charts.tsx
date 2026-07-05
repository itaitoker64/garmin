"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { series, chrome } from "@/lib/palette";
import type { HrvDaily, StressDay } from "@/lib/types";

function ChartCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-ink-primary">{title}</h3>
        {sub && <span className="text-xs text-ink-muted">{sub}</span>}
      </div>
      {children}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { value: number | null }[];
  label?: string;
  formatter: (v: number) => string;
}) {
  if (!active || !payload?.length || payload[0].value == null) return null;
  return (
    <div className="rounded-lg border border-surface-border bg-surface px-2.5 py-1.5 text-xs shadow-lg">
      <p className="text-ink-muted">{label}</p>
      <p className="tabular font-medium text-ink-primary">{formatter(payload[0].value)}</p>
    </div>
  );
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function HrvTrendChart({ daily }: { daily: HrvDaily[] }) {
  const data = [...daily]
    .filter((d) => d.last_night_avg_ms != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: shortDate(d.date), value: d.last_night_avg_ms }));

  if (data.length === 0) {
    return (
      <ChartCard title="HRV — last night avg">
        <p className="py-8 text-center text-sm text-ink-muted">No HRV data synced yet.</p>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="HRV — last night avg" sub="ms, 7 days">
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={chrome.gridline} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={chrome.mutedInk}
            tick={{ fontSize: 11, fill: chrome.mutedInk }}
            tickLine={false}
            axisLine={{ stroke: chrome.baseline }}
          />
          <YAxis
            stroke={chrome.mutedInk}
            tick={{ fontSize: 11, fill: chrome.mutedInk }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <Tooltip content={<ChartTooltip formatter={(v) => `${v} ms`} />} cursor={{ stroke: chrome.baseline }} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={series.blue}
            strokeWidth={2}
            dot={{ r: 3, fill: series.blue, strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function StressTrendChart({ daily }: { daily: StressDay[] }) {
  const data = [...daily]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: shortDate(d.date), value: d.stress_avg }));

  const hasData = data.some((d) => d.value != null);
  if (!hasData) {
    return (
      <ChartCard title="Stress — daily average">
        <p className="py-8 text-center text-sm text-ink-muted">No stress data synced yet.</p>
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Stress — daily average" sub="0–100, 7 days">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={chrome.gridline} vertical={false} />
          <XAxis
            dataKey="date"
            stroke={chrome.mutedInk}
            tick={{ fontSize: 11, fill: chrome.mutedInk }}
            tickLine={false}
            axisLine={{ stroke: chrome.baseline }}
          />
          <YAxis
            stroke={chrome.mutedInk}
            tick={{ fontSize: 11, fill: chrome.mutedInk }}
            tickLine={false}
            axisLine={false}
            width={40}
            domain={[0, 100]}
          />
          <Tooltip content={<ChartTooltip formatter={(v) => `${v}`} />} cursor={{ fill: chrome.gridline }} />
          <Bar dataKey="value" fill={series.orange} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AcwrMeter({ ratio, status }: { ratio: number | null; status?: string | null }) {
  if (ratio == null) {
    return (
      <ChartCard title="Acute:chronic workload ratio">
        <p className="py-8 text-center text-sm text-ink-muted">Needs ~7 days of activity history.</p>
      </ChartCard>
    );
  }
  // Scale 0 -> 2.0 across the meter width.
  const pct = Math.min(100, Math.max(0, (ratio / 2) * 100));
  const zoneColor = ratio > 1.5 ? "#d03b3b" : ratio > 1.3 ? "#fab219" : ratio < 0.8 ? "#fab219" : "#0ca30c";

  return (
    <ChartCard title="Acute:chronic workload ratio" sub={status || undefined}>
      <div className="mt-3">
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-border">
          <div className="absolute inset-y-0 left-[40%] w-[25%] bg-status-good/25" />
          <div
            className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-plane"
            style={{ left: `calc(${pct}% - 8px)`, backgroundColor: zoneColor }}
          />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-ink-muted">
          <span>0</span>
          <span>0.8–1.3 sweet spot</span>
          <span>2.0</span>
        </div>
        <p className="tabular mt-3 text-2xl font-semibold" style={{ color: zoneColor }}>
          {ratio.toFixed(2)}
        </p>
      </div>
    </ChartCard>
  );
}
