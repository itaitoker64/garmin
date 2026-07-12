export interface TrainingReadiness {
  score: number | null;
  level: string | null;
  feedback_short: string | null;
  feedback_long: string | null;
  recovery_time_hours: number | null;
  sleep_score: number | null;
  hrv_weekly_avg: number | null;
}

export interface HrvDaily {
  date: string;
  last_night_avg_ms: number | null;
  weekly_avg_ms: number | null;
  status: string | null;
}

export interface TrainingStatus {
  status: string | null;
  feedback: string | null;
  fitness_trend: string | null;
  load_tunnel_min: number | null;
  load_tunnel_max: number | null;
}

export interface Recovery {
  training_readiness: TrainingReadiness | null;
  hrv: { weekly_avg_ms: number | null; status_latest: string | null; daily: HrvDaily[] };
  sleep: { weekly_avg_hours: number | null; weekly_avg_score: number | null };
  body_battery_today: {
    charged: number | null;
    drained: number | null;
    highest: number | null;
    lowest: number | null;
    end_of_day: number | null;
  } | null;
  resting_heart_rate_bpm: number | null;
  training_status: TrainingStatus | null;
}

export interface RacePrediction {
  seconds: number;
  time: string;
}

export interface Fitness {
  vo2_max_running: number | null;
  vo2_max_cycling: number | null;
  cycling_ftp_w: number | null;
  race_predictions: Record<string, RacePrediction> | null;
}

export interface SportLoad {
  sessions: number;
  total_km: number;
  total_minutes: number;
  total_hours: number;
  avg_hr: number | null;
}

export interface RecentLoad {
  period_days: number;
  by_sport: Record<"swim" | "bike" | "run", SportLoad>;
}

export interface Activity {
  activity_id: number;
  name: string | null;
  sport: string;
  type_key: string | null;
  date: string | null;
  duration_min: number | null;
  distance_km: number | null;
  hr_avg: number | null;
  hr_max: number | null;
  pace_min_km?: string;
  cadence_spm?: number;
  avg_power_w?: number;
  normalized_power_w?: number;
  total_strokes?: number;
  avg_stroke_distance_m?: number;
}

export interface Activities {
  period_days: number;
  count: number;
  activities: Activity[];
}

export interface LoadFocus {
  monthly_load_aerobic_low: number | null;
  monthly_load_aerobic_high: number | null;
  monthly_load_anaerobic: number | null;
  aerobic_low_target_min: number | null;
  aerobic_low_target_max: number | null;
  aerobic_high_target_min: number | null;
  aerobic_high_target_max: number | null;
  anaerobic_target_min: number | null;
  anaerobic_target_max: number | null;
  training_balance_feedback_phrase: string | null;
}

export interface TrainingLoad {
  error?: string;
  acute_load?: number | null;
  chronic_load?: number | null;
  load_ratio?: number | null;
  acwr_status?: string | null;
  load_focus?: LoadFocus | null;
}

export interface StressDay {
  date: string;
  stress_avg: number | null;
  max_stress?: number | null;
  rest_minutes?: number | null;
  low_minutes?: number | null;
  medium_minutes?: number | null;
  high_minutes?: number | null;
  activity_minutes?: number | null;
}

export interface Stress {
  period_days: number;
  period_avg_stress: number | null;
  daily: StressDay[];
}

export interface PersonalRecord {
  type_id: number | null;
  label: string;
  value_raw: number | null;
  value_formatted: string | null;
  unit: string | null;
  date: string | null;
  activity_id: number | null;
}

export interface PersonalRecords {
  count: number;
  by_sport: Record<string, PersonalRecord[]>;
}

export interface GarminSnapshot {
  recovery: Recovery;
  fitness: Fitness;
  recent_load: RecentLoad;
  activities: Activities;
  training_load: TrainingLoad;
  stress: Stress;
  personal_records: PersonalRecords;
}

export interface LivePoint {
  t: number; // epoch ms
  v: number;
}

export interface LiveToday {
  as_of: string;
  date: string;
  steps: number | null;
  step_goal: number | null;
  floors_up: number | null;
  calories_active: number | null;
  calories_total: number | null;
  intensity_minutes: number | null;
  heart_rate: {
    current_bpm: number | null;
    current_at: number | null;
    resting_today: number | null;
    min_today: number | null;
    max_today: number | null;
    series: LivePoint[];
  };
  body_battery: {
    current: number | null;
    charged: number | null;
    drained: number | null;
    series: LivePoint[];
  };
  stress: {
    current: number | null;
    avg_today: number | null;
    max_today: number | null;
  };
  sleep_seconds_last_night: number | null;
}
