"""
POST /api/garmin-data/mfa
Body: {"state": str, "code": str}

Completes a Garmin login that stopped at the MFA step. `state` is the
JSON blob produced by login.py (via dump_mfa_state) when Garmin asked
for a 2FA code; `code` is the 6-digit code the user received. Returns
the same kind of session token string as a clean login.

Gated by X-Internal-Secret so only our own Node routes can reach it.
"""
from http.server import BaseHTTPRequestHandler
import json

from _garmin_lib import INTERNAL_FN_SECRET, dump_token, resume_mfa


def _send(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        if self.headers.get("X-Internal-Secret") != INTERNAL_FN_SECRET:
            _send(self, 401, {"error": "unauthorized"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            data = {}

        state = data.get("state")
        code = data.get("code")
        if not state or not code:
            _send(self, 400, {"error": "state and code are required"})
            return

        try:
            client = resume_mfa(state, str(code).strip())
            token = dump_token(client)
        except Exception as e:
            cls_name = type(e).__name__
            message = str(e)
            if cls_name == "GarminConnectTooManyRequestsError":
                _send(self, 429, {
                    "error": "rate_limited",
                    "message": "Garmin is rate-limiting MFA attempts. Wait a few minutes and try again.",
                })
                return
            if cls_name == "GarminConnectAuthenticationError":
                _send(self, 401, {
                    "error": "invalid_mfa_code",
                    "message": (
                        "Garmin rejected that code. Check the latest code from "
                        "your email/authenticator and try again — or restart "
                        "the connection if too much time has passed."
                    ),
                })
                return
            _send(self, 502, {"error": "garmin_error", "message": message})
            return

        _send(self, 200, {"token": token})
