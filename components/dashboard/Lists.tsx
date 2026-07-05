import type { Activity, PersonalRecords, Fitness } from "@/lib/types";

const SPORT_ICON: Record<string, string> = {
  run: "🏃",
  bike: "🚴",
  swim: "🏊",
  strength: "🏋️",
  mindfulness: "🧘",
  hiit: "🔥",
  walk: "🚶",
  other: "⚡",
};

function activityMetric(a: Activity): string {
  if (a.sport === "run" && a.pace_min_km) return `${a.pace_min_km} /km`;
  if (a.sport === "bike" && a.avg_power_w) return `${a.avg_power_w} W avg`;
  if (a.sport === "swim" && a.total_strokes) return `${a.total_strokes} strokes`;
  if (a.distance_km) return `${a.distance_km.toFixed(1)} km`;
  return "";
}

export function ActivityList({ activities }: { activities: Activity[] }) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <h3 className="mb-3 text-sm font-medium text-ink-primary">Recent activities</h3>
      {activities.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No activities in this window.</p>
      ) : (
        <ul className="scrollbar-thin max-h-96 space-y-1 overflow-y-auto">
          {activities.map((a) => (
            <li
              key={a.activity_id}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-base">
                {SPORT_ICON[a.sport] ?? "⚡"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-primary">{a.name || a.sport}</p>
                <p className="text-xs text-ink-muted">
                  {a.date ? new Date(a.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                  {a.duration_min ? ` · ${Math.round(a.duration_min)} min` : ""}
                </p>
              </div>
              <div className="tabular shrink-0 text-right text-sm text-ink-secondary">
                {activityMetric(a)}
                {a.hr_avg ? <p className="text-xs text-ink-muted">{a.hr_avg} bpm avg</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PersonalRecordsCard({ records }: { records: PersonalRecords }) {
  const sports = Object.entries(records.by_sport);
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <h3 className="mb-3 text-sm font-medium text-ink-primary">Personal records</h3>
      {sports.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-muted">No personal records on file yet.</p>
      ) : (
        <div className="space-y-4">
          {sports.map(([sport, entries]) => (
            <div key={sport}>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">{sport}</p>
              <ul className="space-y-1">
                {entries.map((r) => (
                  <li key={`${r.type_id}-${r.label}`} className="flex items-center justify-between text-sm">
                    <span className="text-ink-secondary">{r.label}</span>
                    <span className="tabular font-medium text-ink-primary">{r.value_formatted ?? "—"}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FitnessCard({ fitness }: { fitness: Fitness }) {
  const races = fitness.race_predictions
    ? Object.entries(fitness.race_predictions)
    : [];
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <h3 className="mb-3 text-sm font-medium text-ink-primary">Fitness markers</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-xs text-ink-muted">VO2max run</p>
          <p className="tabular text-lg font-semibold text-ink-primary">
            {fitness.vo2_max_running ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">VO2max bike</p>
          <p className="tabular text-lg font-semibold text-ink-primary">
            {fitness.vo2_max_cycling ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">Cycling FTP</p>
          <p className="tabular text-lg font-semibold text-ink-primary">
            {fitness.cycling_ftp_w ? `${fitness.cycling_ftp_w} W` : "—"}
          </p>
        </div>
      </div>
      {races.length > 0 && (
        <div className="mt-4 border-t border-surface-border pt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Race predictions</p>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {races.map(([label, r]) => (
              <li key={label} className="flex justify-between">
                <span className="text-ink-secondary">{label.replace("_", " ")}</span>
                <span className="tabular font-medium text-ink-primary">{r.time}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
