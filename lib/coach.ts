import type { GarminSnapshot } from "./types";

export type Severity = "good" | "watch" | "caution" | "unknown";

export interface CoachInsight {
  title: string;
  detail: string;
  severity: Severity;
}

export interface CoachBriefing {
  headline: string;
  narrative: string;
  severity: Severity;
  insights: CoachInsight[];
  recommendation: string;
}

function worse(a: Severity, b: Severity): Severity {
  const rank: Record<Severity, number> = { good: 0, watch: 1, caution: 2, unknown: -1 };
  if (rank[b] < 0) return a;
  if (rank[a] < 0) return b;
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Deterministic coaching logic, no LLM involved. Thresholds are the ones
 * Garmin/the connector's own docs use (ACWR 0.8-1.3 sweet spot, >1.5
 * overtraining risk, <0.8 detraining; training readiness bands, etc.)
 */
export function buildBriefing(snapshot: GarminSnapshot): CoachBriefing {
  const insights: CoachInsight[] = [];
  let overall: Severity = "unknown";

  const readiness = snapshot.recovery.training_readiness;
  if (readiness?.score != null) {
    let severity: Severity = "good";
    if (readiness.score < 33) severity = "caution";
    else if (readiness.score < 66) severity = "watch";
    overall = worse(overall, severity);
    insights.push({
      title: `Training readiness: ${readiness.score}/100${readiness.level ? ` (${readiness.level})` : ""}`,
      detail:
        readiness.feedback_long ||
        readiness.feedback_short ||
        "No detailed feedback returned by Garmin for today.",
      severity,
    });
  }

  const hrvStatus = snapshot.recovery.hrv.status_latest;
  if (hrvStatus) {
    const lower = hrvStatus.toLowerCase();
    const severity: Severity = lower.includes("unbalanced") || lower.includes("low") ? "caution" : "good";
    overall = worse(overall, severity);
    insights.push({
      title: `HRV status: ${hrvStatus}`,
      detail:
        snapshot.recovery.hrv.weekly_avg_ms != null
          ? `7-day average ${snapshot.recovery.hrv.weekly_avg_ms} ms.`
          : "No 7-day HRV average available yet.",
      severity,
    });
  }

  const acwr = snapshot.training_load.load_ratio;
  if (acwr != null) {
    let severity: Severity = "good";
    let detail = `Acute/chronic workload ratio ${acwr.toFixed(2)} — sweet spot is 0.8-1.3.`;
    if (acwr > 1.5) {
      severity = "caution";
      detail = `ACWR ${acwr.toFixed(2)} is above 1.5 — real overtraining/injury risk. Back off intensity or volume this week.`;
    } else if (acwr > 1.3) {
      severity = "watch";
      detail = `ACWR ${acwr.toFixed(2)} is a little hot. Keep an eye on it and avoid stacking another hard day immediately.`;
    } else if (acwr < 0.8) {
      severity = "watch";
      detail = `ACWR ${acwr.toFixed(2)} suggests detraining — load has dropped versus your chronic baseline.`;
    }
    overall = worse(overall, severity);
    insights.push({ title: "Acute:chronic workload ratio", detail, severity });
  }

  const bodyBattery = snapshot.recovery.body_battery_today;
  if (bodyBattery?.end_of_day != null) {
    const severity: Severity = bodyBattery.end_of_day < 30 ? "watch" : "good";
    overall = worse(overall, severity);
    insights.push({
      title: `Body battery: ${bodyBattery.end_of_day}`,
      detail: `Charged +${bodyBattery.charged ?? "?"}, drained -${bodyBattery.drained ?? "?"} today.`,
      severity,
    });
  }

  const sleepScore = snapshot.recovery.sleep.weekly_avg_score;
  if (sleepScore != null) {
    const severity: Severity = sleepScore < 60 ? "watch" : "good";
    overall = worse(overall, severity);
    insights.push({
      title: `Sleep: 7-day avg score ${sleepScore}`,
      detail:
        snapshot.recovery.sleep.weekly_avg_hours != null
          ? `Averaging ${snapshot.recovery.sleep.weekly_avg_hours.toFixed(1)} h/night.`
          : "Duration data unavailable.",
      severity,
    });
  }

  const stress = snapshot.stress.period_avg_stress;
  if (stress != null) {
    const severity: Severity = stress > 50 ? "watch" : "good";
    overall = worse(overall, severity);
    insights.push({
      title: `Stress: 7-day avg ${stress}`,
      detail: stress > 50 ? "Elevated life-load stress can blunt recovery even with easy training." : "Stress levels look manageable.",
      severity,
    });
  }

  if (overall === "unknown") overall = "watch";

  const headline =
    overall === "good"
      ? "You're clear to train — your numbers back it up."
      : overall === "watch"
      ? "Green light, but a few things are worth watching."
      : "Dial it back today — your body is asking for recovery.";

  const recommendation = buildRecommendation(overall, acwr ?? null, readiness?.score ?? null);
  const narrative = insights.length
    ? `Based on today's data: ${insights.map((i) => i.title).join("; ")}.`
    : "Not enough data synced yet to build a full briefing — check back after your next activity syncs.";

  return { headline, narrative, severity: overall, insights, recommendation };
}

function buildRecommendation(severity: Severity, acwr: number | null, readiness: number | null): string {
  if (severity === "caution") {
    return "Prioritize an easy or full rest day. Sleep, hydration, and light mobility work over intensity.";
  }
  if (severity === "watch") {
    if (acwr != null && acwr > 1.3) {
      return "Keep today aerobic and controlled — hold off on intervals or a long hard effort until the ratio settles.";
    }
    if (readiness != null && readiness < 66) {
      return "Moderate session is fine, but skip the heroics — save the hard day for when readiness climbs back up.";
    }
    return "Good to train — keep effort moderate and reassess tomorrow.";
  }
  return "You're primed for a quality session — this is a good day to push if your plan calls for it.";
}
