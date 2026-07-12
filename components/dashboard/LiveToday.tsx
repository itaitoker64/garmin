"use client";

import { ResponsiveContainer, LineChart, Line, Tooltip, YAxis } from "recharts";
import { series, chrome } from "@/lib/palette";
import type { LiveToday, LivePoint } from "@/lib/types";

function timeOf(t: number): string {
  return new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function SparkTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { value: number; payload: { t: number } }[];
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-surface-border bg-surface px-2.5 py-1.5 text-xs shadow-lg">
      <p className="text-ink-muted">{timeOf(payload[0].payload.t)}</p>
      <p className="tabular font-medium text-ink-primary">
        {Math.round(payload[0].value)} {unit}
      </p>
    </div>
  );
}

function Sparkline({ data, color, unit }: { data: LivePoint[]; color: string; unit: string }) {
  if (data.length < 2) {
    return <p className="flex h-16 items-center text-xs text-ink-muted">No intraday data yet</p>;
  }
  return (
    <div className="h-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            content={<SparkTooltip unit={unit} />}
            cursor={{ stroke: chrome.baseline, strokeWidth: 1 }}
          />
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function LiveStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold text-ink-primary">
        {accent && (
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: accent }} aria-hidden />
        )}
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-secondary">{sub}</p>}
    </div>
  );
}

export function LiveTodayCard({ live }: { live: LiveToday }) {
  const hr = live.heart_rate;
  const bb = live.body_battery;
  const stepsPct =
    live.steps != null && live.step_goal ? Math.min(100, (live.steps / live.step_goal) * 100) : null;

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="flex items-center gap-2 text-sm font-medium text-ink-primary">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-good opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-status-good" />
          </span>
          Today — live
        </h3>
        <span className="text-xs text-ink-muted">
          as of {new Date(live.as_of).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-surface-border bg-surface/60 p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Heart rate</p>
            <p className="text-[11px] text-ink-secondary">
              {hr.resting_today != null && `resting ${hr.resting_today}`}
              {hr.min_today != null && hr.max_today != null && ` · ${hr.min_today}–${hr.max_today} bpm`}
            </p>
          </div>
          <p className="tabular mt-1 text-2xl font-semibold text-ink-primary">
            {hr.current_bpm != null ? `${hr.current_bpm} bpm` : "—"}
            {hr.current_at != null && (
              <span className="ml-2 text-xs font-normal text-ink-muted">at {timeOf(hr.current_at)}</span>
            )}
          </p>
          <Sparkline data={hr.series} color={series.red} unit="bpm" />
        </div>

        <div className="rounded-xl border border-surface-border bg-surface/60 p-3">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-medium uppercase tracking-wide text-ink-muted">Body battery</p>
            <p className="text-[11px] text-ink-secondary">
              {bb.charged != null && `+${bb.charged}`}
              {bb.drained != null && ` / -${bb.drained}`}
            </p>
          </div>
          <p className="tabular mt-1 text-2xl font-semibold text-ink-primary">
            {bb.current != null ? bb.current : "—"}
            <span className="ml-1 text-xs font-normal text-ink-muted">/ 100</span>
          </p>
          <Sparkline data={bb.series} color={series.aqua} unit="" />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LiveStat
          label="Steps"
          value={live.steps != null ? live.steps.toLocaleString() : "—"}
          sub={
            stepsPct != null
              ? `${Math.round(stepsPct)}% of ${live.step_goal?.toLocaleString()}`
              : undefined
          }
          accent={series.blue}
        />
        <LiveStat
          label="Stress now"
          value={live.stress.current != null ? `${live.stress.current}` : "—"}
          sub={live.stress.avg_today != null ? `avg ${live.stress.avg_today} today` : undefined}
          accent={series.yellow}
        />
        <LiveStat
          label="Active kcal"
          value={live.calories_active != null ? live.calories_active.toLocaleString() : "—"}
          sub={live.calories_total != null ? `${live.calories_total.toLocaleString()} total` : undefined}
        />
        <LiveStat
          label="Intensity min"
          value={live.intensity_minutes != null ? `${live.intensity_minutes}` : "—"}
          sub={live.floors_up != null ? `${live.floors_up} floors` : undefined}
        />
      </div>

      {stepsPct != null && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${stepsPct}%`, backgroundColor: series.blue }}
          />
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
        Numbers are as fresh as your watch&rsquo;s last sync to Garmin Connect. Panel refreshes
        automatically every few minutes.
      </p>
    </div>
  );
}
