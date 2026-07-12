"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GarminSnapshot, LiveToday } from "@/lib/types";
import { buildBriefing } from "@/lib/coach";
import { CoachBriefingCard, StatTile } from "./Overview";
import { HrvTrendChart, StressTrendChart, AcwrMeter } from "./Charts";
import { ActivityList, PersonalRecordsCard, FitnessCard } from "./Lists";
import { LiveTodayCard } from "./LiveToday";
import { TopNav } from "@/components/TopNav";

const LIVE_POLL_MS = 3 * 60 * 1000; // light endpoint — safe to poll
const SNAPSHOT_REFRESH_MS = 30 * 60 * 1000; // heavy endpoint — refresh sparingly
const FOCUS_STALE_MS = 2 * 60 * 1000;

export function DashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<GarminSnapshot | null>(null);
  const [live, setLive] = useState<LiveToday | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const lastLiveFetch = useRef(0);

  const loadLive = useCallback(async () => {
    try {
      const res = await fetch("/api/garmin/live", { cache: "no-store" });
      if (res.status === 409 || res.status === 401) {
        router.push("/connect");
        return;
      }
      if (!res.ok) return; // live panel is best-effort; the snapshot is the backbone
      const json = await res.json();
      setLive(json.data);
      lastLiveFetch.current = Date.now();
    } catch {
      // network hiccup — next poll retries
    }
  }, [router]);

  const loadSnapshot = useCallback(
    async (initial = false) => {
      if (initial) setLoading(true);
      else setSyncing(true);
      setError(null);
      try {
        const res = await fetch("/api/garmin/snapshot", { cache: "no-store" });
        if (res.status === 409 || res.status === 401) {
          router.push("/connect");
          return;
        }
        const json = await res.json();
        if (!res.ok) {
          // Keep showing stale data on background-refresh failures.
          if (initial) setError(json.message || "Couldn't load your Garmin data.");
          return;
        }
        setData(json.data);
        setLastSynced(new Date());
      } catch {
        if (initial) setError("Network error — try again.");
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [router],
  );

  const refresh = useCallback(() => {
    loadSnapshot(false);
    loadLive();
  }, [loadSnapshot, loadLive]);

  useEffect(() => {
    loadSnapshot(true);
    loadLive();

    const liveTimer = setInterval(loadLive, LIVE_POLL_MS);
    const snapTimer = setInterval(() => loadSnapshot(false), SNAPSHOT_REFRESH_MS);

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLiveFetch.current > FOCUS_STALE_MS) loadLive();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(liveTimer);
      clearInterval(snapTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [loadSnapshot, loadLive]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-muted">Pulling your Garmin data…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-status-critical">{error}</p>
        <button
          onClick={() => loadSnapshot(true)}
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
      <TopNav lastSynced={lastSynced} syncing={syncing} onRefresh={refresh} />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        {live && <LiveTodayCard live={live} />}

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
