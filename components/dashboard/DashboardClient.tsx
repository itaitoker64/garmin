"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GarminSnapshot } from "@/lib/types";
import { buildBriefing } from "@/lib/coach";
import { CoachBriefingCard, StatTile } from "./Overview";
import { HrvTrendChart, StressTrendChart, AcwrMeter } from "./Charts";
import { ActivityList, PersonalRecordsCard, FitnessCard } from "./Lists";
import { TopNav } from "@/components/TopNav";

export function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<GarminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/garmin/snapshot", { cache: "no-store" });
        if (res.status === 409 || res.status === 401) {
          router.push("/connect");
          return;
        }
        const json = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(json.message || "Couldn't load your Garmin data.");
          return;
        }
        if (!cancelled) setData(json.data);
      } catch {
        if (!cancelled) setError("Network error — try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-muted">Pulling your Garmin data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-status-critical">{error}</p>
        <button
          onClick={() => router.refresh()}
          className="rounded-lg border border-surface-border px-3 py-1.5 text-sm text-ink-secondary hover:text-ink-primary"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) return null;

  const briefing = buildBriefing(data);
  const readiness = data.recovery.training_readiness;
  const hrv = data.recovery.hrv;
  const sleep = data.recovery.sleep;
  const bb = data.recovery.body_battery_today;
  const rhr = data.recovery.resting_heart_rate_bpm;

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <CoachBriefingCard briefing={briefing} />

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="Readiness"
            value={readiness?.score != null ? `${readiness.score}` : "—"}
            sub={readiness?.level ?? undefined}
            severity={
              readiness?.score == null ? "unknown" : readiness.score < 33 ? "caution" : readiness.score < 66 ? "watch" : "good"
            }
          />
          <StatTile label="HRV (7d avg)" value={hrv.weekly_avg_ms != null ? `${hrv.weekly_avg_ms} ms` : "—"} sub={hrv.status_latest ?? undefined} />
          <StatTile label="Sleep score" value={sleep.weekly_avg_score != null ? `${sleep.weekly_avg_score}` : "—"} sub={sleep.weekly_avg_hours != null ? `${sleep.weekly_avg_hours.toFixed(1)} h avg` : undefined} />
          <StatTile label="Body battery" value={bb?.end_of_day != null ? `${bb.end_of_day}` : "—"} sub={bb ? `+${bb.charged ?? 0} / -${bb.drained ?? 0}` : undefined} />
          <StatTile label="Resting HR" value={rhr != null ? `${rhr} bpm` : "—"} />
          <StatTile label="Stress (7d avg)" value={data.stress.period_avg_stress != null ? `${data.stress.period_avg_stress}` : "—"} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <HrvTrendChart daily={hrv.daily} />
          <StressTrendChart daily={data.stress.daily} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <AcwrMeter ratio={data.training_load.load_ratio ?? null} status={data.training_load.acwr_status} />
          <FitnessCard fitness={data.fitness} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <ActivityList activities={data.activities.activities} />
          <PersonalRecordsCard records={data.personal_records} />
        </div>
      </main>
    </div>
  );
}
