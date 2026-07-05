import clsx from "clsx";
import type { CoachBriefing as CoachBriefingT, Severity } from "@/lib/coach";
import { severityColor } from "@/lib/palette";

export function StatTile({
  label,
  value,
  sub,
  severity,
}: {
  label: string;
  value: string;
  sub?: string;
  severity?: Severity;
}) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-raised p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        {severity && (
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: severityColor(severity) }}
            aria-hidden
          />
        )}
      </div>
      <p className="tabular mt-2 text-2xl font-semibold text-ink-primary">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-secondary">{sub}</p>}
    </div>
  );
}

const severityStyles: Record<Severity, { bg: string; border: string; label: string }> = {
  good: { bg: "bg-status-good/10", border: "border-status-good/30", label: "On track" },
  watch: { bg: "bg-status-warning/10", border: "border-status-warning/30", label: "Watch" },
  caution: { bg: "bg-status-critical/10", border: "border-status-critical/30", label: "Caution" },
  unknown: { bg: "bg-surface-raised", border: "border-surface-border", label: "Unknown" },
};

export function CoachBriefingCard({ briefing }: { briefing: CoachBriefingT }) {
  const s = severityStyles[briefing.severity];
  return (
    <div className={clsx("rounded-2xl border p-6", s.bg, s.border)}>
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{
            backgroundColor: `${severityColor(briefing.severity)}22`,
            color: severityColor(briefing.severity),
          }}
        >
          {s.label}
        </span>
        <span className="text-xs text-ink-muted">Today&rsquo;s briefing</span>
      </div>
      <h2 className="mt-3 text-xl font-semibold tracking-tight text-ink-primary">{briefing.headline}</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{briefing.narrative}</p>
      <div className="mt-4 rounded-xl border border-surface-border bg-surface/60 p-3.5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Recommendation</p>
        <p className="mt-1 text-sm text-ink-primary">{briefing.recommendation}</p>
      </div>
      {briefing.insights.length > 0 && (
        <ul className="mt-4 space-y-2">
          {briefing.insights.map((insight) => (
            <li key={insight.title} className="flex items-start gap-2.5 text-sm">
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: severityColor(insight.severity) }}
              />
              <span>
                <span className="font-medium text-ink-primary">{insight.title}</span>{" "}
                <span className="text-ink-secondary">{insight.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
