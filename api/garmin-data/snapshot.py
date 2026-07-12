"""
POST /api/garmin-data/snapshot
Body: {"token": str}

Resumes a Garmin session from a previously-dumped token string (no
password needed) and returns every metric the dashboard needs in one
call: recovery, fitness, recent load, activities, training load,
stress, and personal records.

Also returns a refreshed `token` — Garmin's access token can rotate
during the call, so the Next.js server re-encrypts and re-stores
whatever comes back here, keeping the session alive indefinitely
without ever re-asking for a password.

Gated by X-Internal-Secret so only our own Node routes can reach it.
"""
from http.server import BaseHTTPRequestHandler
import json
import traceback

try:
    from _garmin_lib import INTERNAL_FN_SECRET, resume_client, dump_token, get_snapshot
    IMPORT_ERROR: str | None = None
except Exception:
    IMPORT_ERROR = traceback.format_exc()
    INTERNAL_FN_SECRET = None  # type: ignore[assignment]


def _send(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        try:
            self._handle()
        except Exception:
            _send(self, 500, {
                "error": "function_crash",
                "message": traceback.format_exc()[-1800:],
            })

    def _handle(self) -> None:
        if IMPORT_ERROR:
            _send(self, 500, {"error": "import_error", "message": IMPORT_ERROR[-1800:]})
            return

        if self.headers.get("X-Internal-Secret") != INTERNAL_FN_SECRET:
            _send(self, 401, {"error": "unauthorized"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            data = {}

        token = data.get("token")
        if not token:
            _send(self, 400, {"error": "token is required"})
            return

        try:
            client = resume_client(token)
            snapshot = get_snapshot(client)
            fresh_token = dump_token(client)
        except Exception as e:
            cls_name = type(e).__name__
            if cls_name in ("GarminConnectAuthenticationError",):
                _send(self, 401, {
                    "error": "session_expired",
                    "message": "Your Garmin session expired. Please reconnect.",
                })
                return
            if cls_name == "GarminConnectTooManyRequestsError":
                _send(self, 429, {
                    "error": "rate_limited",
                    "message": "Garmin is rate-limiting requests. Wait a few minutes and try again.",
                })
                return
            _send(self, 502, {"error": "garmin_error", "message": str(e)})
            return

        _send(self, 200, {"token": fresh_token, "data": snapshot})
