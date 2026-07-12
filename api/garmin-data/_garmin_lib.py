"""
Shared Garmin Connect data-fetching logic for Vercel Python functions.

Adapted from mcp-server/garmin_mcp.py: same field shapes and thresholds,
but parameterized on an explicit `client` instead of a process-global one,
since each serverless invocation is stateless. Session persistence across
requests is handled by the caller via Garmin's token dump/resume (see
build_client / resume_client / dump_token below).
"""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from typing import Any, Callable

# Shared secret gating these endpoints so only our own Next.js server can
# reach them. The fallback matches DEFAULT_INTERNAL_FN_SECRET in
# lib/defaults.ts — keep them in sync. Setting INTERNAL_FN_SECRET in the
# Vercel project overrides both sides.
INTERNAL_FN_SECRET = (
    os.environ.get("INTERNAL_FN_SECRET")
    or "e71fa48902a456bb210a75d9ecc25d8eeb4207d3767b0ee3ed75e17aa7affc4c"
)


def build_client(email: str, password: str) -> Any:
    from garminconnect import Garmin

    # return_on_mfa: when the account needs a 2FA code, login() returns
    # ("needs_mfa", None) instead of prompting interactively (impossible in a
    # serverless function). We then snapshot the MFA state (dump_mfa_state)
    # and finish in a second invocation (resume_mfa).
    return Garmin(email=email, password=password, return_on_mfa=True)


# ---------------------------------------------------------------------------
# Stateless MFA plumbing.
#
# garminconnect's resume_login() assumes the same process that started the
# login is still alive: the pending-MFA state lives on the inner Client as a
# requests/curl_cffi Session (cookies) plus a handful of _mfa_* attributes.
# Serverless invocations don't share a process, so we serialize exactly that
# state to JSON after login() returns "needs_mfa", ship it to the caller
# (who encrypts it into a short-lived cookie), and rebuild the Client from it
# in the follow-up request that carries the user's 6-digit code.
# ---------------------------------------------------------------------------

_MFA_STATE_ATTRS = (
    "_mfa_flow",
    "_mfa_method",
    "_mfa_login_params",
    "_mfa_post_headers",
    "_mfa_service_url",
)


def dump_mfa_state(garmin: Any) -> str:
    import json as _json

    inner = garmin.client
    sess = getattr(inner, "_mfa_session", None)
    if sess is None:
        raise RuntimeError("no pending MFA session on client")

    cookies = [
        {
            "name": ck.name,
            "value": ck.value,
            "domain": ck.domain,
            "path": ck.path,
            "secure": bool(ck.secure),
        }
        for ck in sess.cookies.jar
    ]

    state: dict[str, Any] = {
        "impersonate": getattr(sess, "impersonate", None),
        "cookies": cookies,
    }
    for attr in _MFA_STATE_ATTRS:
        value = getattr(inner, attr, None)
        if value is not None:
            state[attr] = value

    # Widget-flow MFA re-reads the CSRF token out of the last response body.
    # Store only a minimal snippet that satisfies the library's regex — the
    # full HTML page would overflow the cookie budget.
    widget_resp = getattr(inner, "_widget_last_resp", None)
    if widget_resp is not None and hasattr(widget_resp, "text"):
        import re as _re

        match = _re.search(r'name="_csrf"\s+value="(.+?)"', widget_resp.text)
        if match:
            state["widget_html"] = f'name="_csrf" value="{match.group(1)}"'

    return _json.dumps(state)


def resume_mfa(state_json: str, code: str) -> Any:
    """Rebuild the pending-MFA client from serialized state and complete login."""
    import json as _json
    from types import SimpleNamespace

    from garminconnect import Garmin

    state = _json.loads(state_json)

    impersonate = state.get("impersonate")
    if impersonate:
        from curl_cffi import requests as cffi_requests

        sess: Any = cffi_requests.Session(impersonate=impersonate)
    else:
        import requests

        sess = requests.Session()

    for ck in state.get("cookies", []):
        sess.cookies.set(
            ck["name"],
            ck["value"],
            domain=ck.get("domain") or "",
            path=ck.get("path") or "/",
            secure=bool(ck.get("secure")),
        )

    garmin = Garmin()
    inner = garmin.client
    inner._mfa_session = sess
    for attr in _MFA_STATE_ATTRS:
        if attr in state:
            setattr(inner, attr, state[attr])
    if state.get("widget_html"):
        inner._widget_last_resp = SimpleNamespace(text=state["widget_html"])

    inner._complete_mfa(code)
    return garmin


def resume_client(token: str) -> Any:
    """Build a Garmin client from a previously dumped in-memory token string."""
    from garminconnect import Garmin

    client = Garmin()
    client.login(tokenstore=token)
    return client


def dump_token(client: Any) -> str:
    return client.client.dumps()


def _safe(fn: Callable[[], Any], default: Any = None) -> Any:
    try:
        return fn()
    except Exception as e:
        cls_name = type(e).__name__
        if cls_name in {
            "GarminConnectAuthenticationError",
            "GarminConnectConnectionError",
            "GarminConnectTooManyRequestsError",
        }:
            raise
        return default


def _today_iso() -> str:
    return date.today().isoformat()


def _date_range_iso(days: int) -> list[str]:
    return [(date.today() - timedelta(days=i)).isoformat() for i in range(days)]


def _round(value: Any, ndigits: int = 2) -> Any:
    if value is None:
        return None
    try:
        return round(float(value), ndigits)
    except (TypeError, ValueError):
        return None


def _parse_local(ts: str | None) -> str | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(ts.replace(" ", "T")).isoformat()
    except Exception:
        return ts


SWIM_TYPES = {"lap_swimming", "open_water_swimming", "swimming"}
BIKE_TYPES = {
    "cycling", "indoor_cycling", "road_biking", "mountain_biking",
    "gravel_cycling", "virtual_ride", "e_bike_mountain", "e_bike_fitness",
}
RUN_TYPES = {"running", "treadmill_running", "trail_running", "track_running", "virtual_run"}
STRENGTH_TYPES = {"strength_training", "indoor_climbing", "bouldering"}
MINDFULNESS_TYPES = {"yoga", "pilates", "meditation", "breathwork", "mindfulness"}
HIIT_TYPES = {"hiit", "cardio", "indoor_cardio", "fitness_equipment"}
WALK_TYPES = {"walking", "indoor_walking", "hiking"}


def _bucket(type_key: str | None) -> str | None:
    if not type_key:
        return None
    if type_key in SWIM_TYPES:
        return "swim"
    if type_key in BIKE_TYPES:
        return "bike"
    if type_key in RUN_TYPES:
        return "run"
    if type_key in STRENGTH_TYPES:
        return "strength"
    if type_key in MINDFULNESS_TYPES:
        return "mindfulness"
    if type_key in HIIT_TYPES:
        return "hiit"
    if type_key in WALK_TYPES:
        return "walk"
    return "other"


def get_recovery(client: Any) -> dict[str, Any]:
    today = _today_iso()
    week_dates = _date_range_iso(7)

    with ThreadPoolExecutor(max_workers=8) as ex:
        f_readiness = ex.submit(_safe, lambda: client.get_training_readiness(today))
        f_status = ex.submit(_safe, lambda: client.get_training_status(today))
        f_hrv = {d: ex.submit(_safe, lambda dd=d: client.get_hrv_data(dd)) for d in week_dates}
        f_sleep = {d: ex.submit(_safe, lambda dd=d: client.get_sleep_data(dd)) for d in week_dates}
        f_bb = ex.submit(_safe, lambda: client.get_body_battery(week_dates[-1], today))
        f_rhr = ex.submit(_safe, lambda: client.get_resting_heart_rate(today))

        readiness_raw = f_readiness.result()
        status_raw = f_status.result()
        hrv_raw = {d: f.result() for d, f in f_hrv.items()}
        sleep_raw = {d: f.result() for d, f in f_sleep.items()}
        body_battery_raw = f_bb.result()
        rhr_raw = f_rhr.result()

    readiness: dict[str, Any] | None = None
    item: dict[str, Any] | None = None
    if isinstance(readiness_raw, list) and readiness_raw:
        item = readiness_raw[0] if isinstance(readiness_raw[0], dict) else None
    elif isinstance(readiness_raw, dict):
        item = readiness_raw
    if item:
        readiness = {
            "score": item.get("score"),
            "level": item.get("level"),
            "feedback_short": item.get("feedbackShort"),
            "feedback_long": item.get("feedbackLong"),
            "recovery_time_hours": item.get("recoveryTime"),
            "sleep_score": item.get("sleepScore"),
            "hrv_weekly_avg": item.get("hrvWeeklyAverage"),
        }

    hrv_daily: list[dict[str, Any]] = []
    for d in week_dates:
        raw = hrv_raw.get(d)
        if not isinstance(raw, dict):
            continue
        summary = raw.get("hrvSummary") or {}
        last_night = summary.get("lastNightAvg")
        if last_night is None and summary.get("weeklyAvg") is None:
            continue
        hrv_daily.append({
            "date": d,
            "last_night_avg_ms": last_night,
            "weekly_avg_ms": summary.get("weeklyAvg"),
            "status": summary.get("status"),
        })
    hrv_values = [h["last_night_avg_ms"] for h in hrv_daily if h["last_night_avg_ms"] is not None]
    hrv_7d_avg = _round(sum(hrv_values) / len(hrv_values), 1) if hrv_values else None
    hrv_status_latest = hrv_daily[0]["status"] if hrv_daily else None

    sleep_hour_values: list[float] = []
    sleep_score_values: list[float] = []
    for d in week_dates:
        raw = sleep_raw.get(d)
        if not isinstance(raw, dict):
            continue
        dto = raw.get("dailySleepDTO") or {}
        seconds = dto.get("sleepTimeSeconds")
        if isinstance(seconds, (int, float)) and seconds > 0:
            sleep_hour_values.append(seconds / 3600)
        scores = dto.get("sleepScores") or {}
        overall = scores.get("overall") if isinstance(scores, dict) else None
        score = overall.get("value") if isinstance(overall, dict) else None
        if isinstance(score, (int, float)):
            sleep_score_values.append(float(score))
    sleep_7d_avg_hours = (
        _round(sum(sleep_hour_values) / len(sleep_hour_values), 2) if sleep_hour_values else None
    )
    sleep_7d_avg_score = (
        _round(sum(sleep_score_values) / len(sleep_score_values), 1) if sleep_score_values else None
    )

    body_battery: dict[str, Any] | None = None
    if isinstance(body_battery_raw, list) and body_battery_raw:
        latest = body_battery_raw[-1] if isinstance(body_battery_raw[-1], dict) else None
        if latest:
            body_battery = {
                "charged": latest.get("charged"),
                "drained": latest.get("drained"),
                "highest": latest.get("highestBatteryLevel") or latest.get("highest"),
                "lowest": latest.get("lowestBatteryLevel") or latest.get("lowest"),
                "end_of_day": latest.get("endOfDayBatteryLevel"),
            }

    rhr_bpm: int | None = None
    if isinstance(rhr_raw, dict):
        try:
            metrics_list = rhr_raw["allMetrics"]["metricsMap"]["WELLNESS_RESTING_HEART_RATE"]
            if isinstance(metrics_list, list) and metrics_list:
                value = metrics_list[0].get("value")
                if isinstance(value, (int, float)):
                    rhr_bpm = int(value)
        except (KeyError, TypeError, IndexError):
            pass

    training_status: dict[str, Any] | None = None
    if isinstance(status_raw, dict):
        try:
            most_recent = status_raw.get("mostRecentTrainingStatus") or {}
            latest_map = most_recent.get("latestTrainingStatusData") or {}
            if latest_map:
                first = next(iter(latest_map.values()))
                if isinstance(first, dict):
                    training_status = {
                        "status": first.get("trainingStatus"),
                        "feedback": first.get("trainingStatusFeedbackPhrase"),
                        "fitness_trend": first.get("fitnessTrend"),
                        "load_tunnel_min": first.get("loadTunnelMin"),
                        "load_tunnel_max": first.get("loadTunnelMax"),
                    }
        except Exception:
            pass

    return {
        "training_readiness": readiness,
        "hrv": {
            "weekly_avg_ms": hrv_7d_avg,
            "status_latest": hrv_status_latest,
            "daily": hrv_daily,
        },
        "sleep": {
            "weekly_avg_hours": sleep_7d_avg_hours,
            "weekly_avg_score": sleep_7d_avg_score,
        },
        "body_battery_today": body_battery,
        "resting_heart_rate_bpm": rhr_bpm,
        "training_status": training_status,
    }


def _format_time(seconds: Any) -> str | None:
    if not isinstance(seconds, (int, float)) or seconds <= 0:
        return None
    total = int(seconds)
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"


def get_fitness(client: Any) -> dict[str, Any]:
    today = _today_iso()

    with ThreadPoolExecutor(max_workers=3) as ex:
        f_max = ex.submit(_safe, lambda: client.get_max_metrics(today))
        f_race = ex.submit(_safe, lambda: client.get_race_predictions())
        f_ftp = ex.submit(_safe, lambda: client.get_cycling_ftp())
        max_raw = f_max.result()
        race_raw = f_race.result()
        ftp_raw = f_ftp.result()

    vo2_run = None
    vo2_bike = None
    if isinstance(max_raw, list) and max_raw:
        first = max_raw[0] if isinstance(max_raw[0], dict) else {}
        generic = first.get("generic") or {}
        cycling = first.get("cycling") or {}
        if isinstance(generic, dict):
            vo2_run = _round(generic.get("vo2MaxPreciseValue") or generic.get("vo2MaxValue"), 1)
        if isinstance(cycling, dict):
            vo2_bike = _round(cycling.get("vo2MaxPreciseValue") or cycling.get("vo2MaxValue"), 1)

    race: dict[str, Any] = {}
    race_item: dict[str, Any] | None = None
    if isinstance(race_raw, list) and race_raw:
        race_item = race_raw[-1] if isinstance(race_raw[-1], dict) else None
    elif isinstance(race_raw, dict):
        race_item = race_raw
    if race_item:
        for key_in, key_out in [
            ("time5K", "5k"), ("time10K", "10k"),
            ("timeHalfMarathon", "half_marathon"), ("timeMarathon", "marathon"),
        ]:
            seconds = race_item.get(key_in)
            if isinstance(seconds, (int, float)) and seconds > 0:
                race[key_out] = {"seconds": int(seconds), "time": _format_time(seconds)}

    ftp_watts: int | None = None
    if isinstance(ftp_raw, dict):
        ftp_watts = ftp_raw.get("functionalThresholdPower") or ftp_raw.get("ftp")
    elif isinstance(ftp_raw, (int, float)):
        ftp_watts = int(ftp_raw)

    return {
        "vo2_max_running": vo2_run,
        "vo2_max_cycling": vo2_bike,
        "cycling_ftp_w": ftp_watts,
        "race_predictions": race or None,
    }


def _normalize_activity(activity: dict[str, Any]) -> dict[str, Any] | None:
    type_key = (activity.get("activityType") or {}).get("typeKey")
    sport = _bucket(type_key)
    if not sport:
        return None

    duration_s = activity.get("duration") or 0
    distance_m = activity.get("distance") or 0
    hr_avg = activity.get("averageHR")
    hr_max = activity.get("maxHR")
    out: dict[str, Any] = {
        "activity_id": activity.get("activityId"),
        "name": activity.get("activityName"),
        "sport": sport,
        "type_key": type_key,
        "date": _parse_local(activity.get("startTimeLocal")),
        "duration_min": _round(duration_s / 60, 1),
        "distance_km": _round(distance_m / 1000, 2) if distance_m else None,
        "hr_avg": int(hr_avg) if isinstance(hr_avg, (int, float)) else None,
        "hr_max": int(hr_max) if isinstance(hr_max, (int, float)) else None,
    }

    if sport == "run":
        avg_speed_mps = activity.get("averageSpeed")
        if isinstance(avg_speed_mps, (int, float)) and avg_speed_mps > 0:
            pace_seconds_per_km = 1000.0 / avg_speed_mps
            minutes = int(pace_seconds_per_km // 60)
            seconds = int(pace_seconds_per_km % 60)
            out["pace_min_km"] = f"{minutes}:{seconds:02d}"
        cadence = (
            activity.get("averageRunningCadenceInStepsPerMinute")
            or activity.get("avgRunCadence")
        )
        if isinstance(cadence, (int, float)):
            out["cadence_spm"] = _round(cadence, 0)

    if sport == "bike":
        avg_power = activity.get("avgPower") or activity.get("averagePower")
        if isinstance(avg_power, (int, float)):
            out["avg_power_w"] = int(avg_power)
        normalized_power = activity.get("normPower") or activity.get("normalizedPower")
        if isinstance(normalized_power, (int, float)):
            out["normalized_power_w"] = int(normalized_power)

    if sport == "swim":
        strokes = activity.get("totalNumberOfStrokes") or activity.get("strokes")
        if isinstance(strokes, (int, float)):
            out["total_strokes"] = int(strokes)
        stroke_distance = activity.get("avgStrokeDistance")
        if isinstance(stroke_distance, (int, float)):
            out["avg_stroke_distance_m"] = _round(stroke_distance, 2)

    return out


def _fetch_recent_activities(client: Any, days: int) -> list[dict[str, Any]]:
    raw = _safe(lambda: client.get_activities(0, 200), default=[]) or []
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    activities: list[dict[str, Any]] = []
    for activity in raw:
        if not isinstance(activity, dict):
            continue
        start = activity.get("startTimeLocal") or ""
        if start[:10] < cutoff:
            continue
        normalized = _normalize_activity(activity)
        if normalized:
            activities.append(normalized)
    activities.sort(key=lambda a: a.get("date") or "", reverse=True)
    return activities


def get_recent_load(client: Any, days: int = 28) -> dict[str, Any]:
    activities = _fetch_recent_activities(client, days)

    buckets: dict[str, dict[str, Any]] = {
        "swim": {"sessions": 0, "total_km": 0.0, "total_minutes": 0.0, "hr_sum": 0.0, "hr_count": 0},
        "bike": {"sessions": 0, "total_km": 0.0, "total_minutes": 0.0, "hr_sum": 0.0, "hr_count": 0},
        "run":  {"sessions": 0, "total_km": 0.0, "total_minutes": 0.0, "hr_sum": 0.0, "hr_count": 0},
    }
    for activity in activities:
        bucket = buckets.get(activity["sport"])
        if not bucket:
            continue
        bucket["sessions"] += 1
        if activity.get("distance_km"):
            bucket["total_km"] += activity["distance_km"]
        if activity.get("duration_min"):
            bucket["total_minutes"] += activity["duration_min"]
        if activity.get("hr_avg"):
            bucket["hr_sum"] += activity["hr_avg"]
            bucket["hr_count"] += 1

    by_sport: dict[str, Any] = {}
    for sport, bucket in buckets.items():
        by_sport[sport] = {
            "sessions": bucket["sessions"],
            "total_km": _round(bucket["total_km"], 2),
            "total_minutes": _round(bucket["total_minutes"], 1),
            "total_hours": _round(bucket["total_minutes"] / 60, 2) if bucket["total_minutes"] else 0,
            "avg_hr": _round(bucket["hr_sum"] / bucket["hr_count"], 0) if bucket["hr_count"] else None,
        }

    return {"period_days": days, "by_sport": by_sport}


def get_activities(client: Any, days: int = 14) -> dict[str, Any]:
    activities = _fetch_recent_activities(client, days)
    return {"period_days": days, "count": len(activities), "activities": activities}


def get_training_load(client: Any) -> dict[str, Any]:
    today = _today_iso()
    status_raw = _safe(lambda: client.get_training_status(today))

    if not isinstance(status_raw, dict):
        return {
            "error": "training status not available "
                     "(needs ~7 days of activities on a compatible device)"
        }

    acute = chronic = ratio = None
    acwr_status = None
    load_focus: dict[str, Any] | None = None

    try:
        most_recent = status_raw.get("mostRecentTrainingStatus") or {}
        latest_map = most_recent.get("latestTrainingStatusData") or {}
        if latest_map:
            first = next(iter(latest_map.values()))
            if isinstance(first, dict):
                atl_dto = first.get("acuteTrainingLoadDTO") or {}
                if isinstance(atl_dto, dict):
                    acute = _round(atl_dto.get("dailyTrainingLoadAcute"), 1)
                    chronic = _round(atl_dto.get("dailyTrainingLoadChronic"), 1)
                    ratio = _round(atl_dto.get("dailyAcuteChronicWorkloadRatio"), 2)
                    acwr_status = atl_dto.get("acwrStatus")
    except Exception:
        pass

    try:
        balance = status_raw.get("mostRecentTrainingLoadBalance") or {}
        balance_map = balance.get("metricsTrainingLoadBalanceDTOMap") or {}
        if balance_map:
            first_balance = next(iter(balance_map.values()))
            if isinstance(first_balance, dict):
                load_focus = {
                    "monthly_load_aerobic_low": _round(first_balance.get("monthlyLoadAerobicLow"), 1),
                    "monthly_load_aerobic_high": _round(first_balance.get("monthlyLoadAerobicHigh"), 1),
                    "monthly_load_anaerobic": _round(first_balance.get("monthlyLoadAnaerobic"), 1),
                    "aerobic_low_target_min": _round(first_balance.get("monthlyLoadAerobicLowTargetMin"), 1),
                    "aerobic_low_target_max": _round(first_balance.get("monthlyLoadAerobicLowTargetMax"), 1),
                    "aerobic_high_target_min": _round(first_balance.get("monthlyLoadAerobicHighTargetMin"), 1),
                    "aerobic_high_target_max": _round(first_balance.get("monthlyLoadAerobicHighTargetMax"), 1),
                    "anaerobic_target_min": _round(first_balance.get("monthlyLoadAnaerobicTargetMin"), 1),
                    "anaerobic_target_max": _round(first_balance.get("monthlyLoadAnaerobicTargetMax"), 1),
                    "training_balance_feedback_phrase": first_balance.get("trainingBalanceFeedbackPhrase"),
                }
    except Exception:
        pass

    return {
        "acute_load": acute,
        "chronic_load": chronic,
        "load_ratio": ratio,
        "acwr_status": acwr_status,
        "load_focus": load_focus,
    }


def get_stress_data(client: Any, days: int = 7) -> dict[str, Any]:
    dates = _date_range_iso(days)
    daily: list[dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {d: ex.submit(_safe, lambda dd=d: client.get_all_day_stress(dd)) for d in dates}
        for d in dates:
            raw = futures[d].result()
            if not isinstance(raw, dict):
                daily.append({"date": d, "stress_avg": None})
                continue
            daily.append({
                "date": d,
                "stress_avg": raw.get("avgStressLevel") or raw.get("overallStressLevel"),
                "max_stress": raw.get("maxStressLevel"),
                "rest_minutes": _round((raw.get("restStressDuration") or 0) / 60, 1),
                "low_minutes": _round((raw.get("lowStressDuration") or 0) / 60, 1),
                "medium_minutes": _round((raw.get("mediumStressDuration") or 0) / 60, 1),
                "high_minutes": _round((raw.get("highStressDuration") or 0) / 60, 1),
                "activity_minutes": _round((raw.get("activityStressDuration") or 0) / 60, 1),
            })

    valid_days = [d for d in daily if isinstance(d.get("stress_avg"), (int, float))]
    period_avg = (
        _round(sum(d["stress_avg"] for d in valid_days) / len(valid_days), 1) if valid_days else None
    )

    return {"period_days": days, "period_avg_stress": period_avg, "daily": daily}


PR_TYPE_LABELS: dict[int, dict[str, str]] = {
    1:  {"sport": "run",     "label": "1K best time",            "unit": "seconds"},
    2:  {"sport": "run",     "label": "1 mile best time",        "unit": "seconds"},
    3:  {"sport": "run",     "label": "5K best time",            "unit": "seconds"},
    4:  {"sport": "run",     "label": "10K best time",           "unit": "seconds"},
    5:  {"sport": "run",     "label": "Half marathon best time", "unit": "seconds"},
    6:  {"sport": "run",     "label": "Marathon best time",      "unit": "seconds"},
    7:  {"sport": "run",     "label": "Longest run",             "unit": "meters"},
    8:  {"sport": "bike",    "label": "Longest ride",            "unit": "meters"},
    9:  {"sport": "bike",    "label": "Best 20-min power",       "unit": "watts"},
    10: {"sport": "bike",    "label": "Best 1-hour power",       "unit": "watts"},
    12: {"sport": "general", "label": "Most steps in a day",     "unit": "steps"},
    13: {"sport": "general", "label": "Most steps in a week",    "unit": "steps"},
}


def _format_pr_value(value: Any, unit: str) -> str | None:
    if not isinstance(value, (int, float)):
        return None
    if unit == "seconds":
        total = int(value)
        hours, remainder = divmod(total, 3600)
        minutes, secs = divmod(remainder, 60)
        return f"{hours}:{minutes:02d}:{secs:02d}" if hours else f"{minutes}:{secs:02d}"
    if unit == "meters":
        return f"{value / 1000:.2f} km"
    if unit == "watts":
        return f"{int(value)} W"
    if unit == "steps":
        return f"{int(value)} steps"
    return str(value)


def get_personal_records(client: Any) -> dict[str, Any]:
    raw = _safe(lambda: client.get_personal_records(), default=[])
    if not isinstance(raw, list):
        return {"by_sport": {}, "count": 0}

    grouped: dict[str, list[dict[str, Any]]] = {"run": [], "bike": [], "swim": [], "general": []}
    for record in raw:
        if not isinstance(record, dict):
            continue
        type_id = record.get("typeId")
        meta = PR_TYPE_LABELS.get(type_id) if isinstance(type_id, int) else None
        value = record.get("value")
        date_value = (
            record.get("prStartTimeGmtFormatted")
            or record.get("prStartTimeGmt")
            or record.get("prTypeLabelKey")
        )
        entry: dict[str, Any] = {
            "type_id": type_id,
            "label": meta["label"] if meta else (record.get("prTypeLabelKey") or f"type_{type_id}"),
            "value_raw": value,
            "value_formatted": (
                _format_pr_value(value, meta["unit"]) if meta else
                (str(value) if value is not None else None)
            ),
            "unit": meta["unit"] if meta else None,
            "date": _parse_local(date_value) if isinstance(date_value, str) else date_value,
            "activity_id": record.get("activityId"),
        }
        sport = meta["sport"] if meta else "general"
        grouped.setdefault(sport, []).append(entry)

    total = sum(len(records) for records in grouped.values())
    return {"count": total, "by_sport": {k: v for k, v in grouped.items() if v}}


def _downsample_series(
    values: list[tuple[int, float]], max_points: int = 96
) -> list[dict[str, Any]]:
    """Thin an intraday [(epoch_ms, value), ...] series to at most max_points,
    always keeping the most recent sample so "current" matches the series end."""
    if not values:
        return []
    if len(values) > max_points:
        step = len(values) / max_points
        picked = [values[int(i * step)] for i in range(max_points)]
        if picked[-1][0] != values[-1][0]:
            picked.append(values[-1])
        values = picked
    return [{"t": ts, "v": v} for ts, v in values]


def get_today_live(client: Any) -> dict[str, Any]:
    """Lightweight intraday snapshot for the dashboard's live panel.

    Much cheaper than get_snapshot (4 calls vs ~30) so the client can poll it
    every few minutes without tripping Garmin's rate limits.
    """
    today = _today_iso()

    with ThreadPoolExecutor(max_workers=4) as ex:
        f_stats = ex.submit(_safe, lambda: client.get_stats(today))
        f_hr = ex.submit(_safe, lambda: client.get_heart_rates(today))
        f_bb = ex.submit(_safe, lambda: client.get_body_battery(today))
        f_stress = ex.submit(_safe, lambda: client.get_all_day_stress(today))
        stats_raw = f_stats.result()
        hr_raw = f_hr.result()
        bb_raw = f_bb.result()
        stress_raw = f_stress.result()

    stats = stats_raw if isinstance(stats_raw, dict) else {}

    hr_series: list[tuple[int, float]] = []
    if isinstance(hr_raw, dict):
        for point in hr_raw.get("heartRateValues") or []:
            if isinstance(point, (list, tuple)) and len(point) == 2 and point[1] is not None:
                hr_series.append((int(point[0]), float(point[1])))
    hr_current = hr_series[-1] if hr_series else None

    bb_series: list[tuple[int, float]] = []
    if isinstance(bb_raw, list) and bb_raw:
        day = bb_raw[-1] if isinstance(bb_raw[-1], dict) else {}
        for point in day.get("bodyBatteryValuesArray") or []:
            # Entries are [timestamp, status, level, version]; older payloads
            # may be [timestamp, level]. Take the first numeric after ts.
            if not isinstance(point, (list, tuple)) or len(point) < 2:
                continue
            level = next(
                (p for p in point[1:] if isinstance(p, (int, float))),
                None,
            )
            if level is not None:
                bb_series.append((int(point[0]), float(level)))
    bb_current = stats.get("bodyBatteryMostRecentValue")
    if bb_current is None and bb_series:
        bb_current = bb_series[-1][1]

    def _none_if_neg(value: Any) -> Any:
        # Garmin uses -1/-2 sentinels for "not measured".
        return value if isinstance(value, (int, float)) and value >= 0 else None

    stress_current = None
    if isinstance(stress_raw, dict):
        for point in reversed(stress_raw.get("stressValuesArray") or []):
            if (
                isinstance(point, (list, tuple))
                and len(point) >= 2
                and isinstance(point[1], (int, float))
                and point[1] >= 0  # negative codes mean "unmeasurable"
            ):
                stress_current = int(point[1])
                break

    return {
        "as_of": datetime.now().astimezone().isoformat(),
        "date": today,
        "steps": stats.get("totalSteps"),
        "step_goal": stats.get("dailyStepGoal"),
        "floors_up": _round(stats.get("floorsAscended"), 0),
        "calories_active": stats.get("activeKilocalories"),
        "calories_total": stats.get("totalKilocalories"),
        "intensity_minutes": (
            (stats.get("moderateIntensityMinutes") or 0)
            + 2 * (stats.get("vigorousIntensityMinutes") or 0)
        ),
        "heart_rate": {
            "current_bpm": int(hr_current[1]) if hr_current else None,
            "current_at": hr_current[0] if hr_current else None,
            "resting_today": _none_if_neg(stats.get("restingHeartRate")),
            "min_today": _none_if_neg(stats.get("minHeartRate")),
            "max_today": _none_if_neg(stats.get("maxHeartRate")),
            "series": _downsample_series(hr_series),
        },
        "body_battery": {
            "current": int(bb_current) if isinstance(bb_current, (int, float)) else None,
            "charged": stats.get("bodyBatteryChargedValue"),
            "drained": stats.get("bodyBatteryDrainedValue"),
            "series": _downsample_series(bb_series),
        },
        "stress": {
            "current": stress_current,
            "avg_today": _none_if_neg(stats.get("averageStressLevel")),
            "max_today": _none_if_neg(stats.get("maxStressLevel")),
        },
        "sleep_seconds_last_night": stats.get("sleepingSeconds"),
    }


def get_snapshot(client: Any) -> dict[str, Any]:
    """Fetch everything the dashboard needs in one shot."""
    with ThreadPoolExecutor(max_workers=6) as ex:
        f_recovery = ex.submit(get_recovery, client)
        f_fitness = ex.submit(get_fitness, client)
        f_load = ex.submit(get_recent_load, client, 28)
        f_activities = ex.submit(get_activities, client, 14)
        f_training_load = ex.submit(get_training_load, client)
        f_stress = ex.submit(get_stress_data, client, 7)
        f_prs = ex.submit(get_personal_records, client)

        return {
            "recovery": f_recovery.result(),
            "fitness": f_fitness.result(),
            "recent_load": f_load.result(),
            "activities": f_activities.result(),
            "training_load": f_training_load.result(),
            "stress": f_stress.result(),
            "personal_records": f_prs.result(),
        }
