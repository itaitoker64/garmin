"""
POST /api/garmin/login
Body: {"email": str, "password": str}

Authenticates against Garmin Connect and returns an in-memory session
token string (via garminconnect's client.dumps()). The caller (the
Next.js server, never the browser directly) encrypts this token and
stores it in an httpOnly cookie, then resends it to snapshot.py on
every dashboard load so we never touch the filesystem for tokens.

Gated by X-Internal-Secret so only our own Node routes can reach it.
"""
from http.server import BaseHTTPRequestHandler
import json
import os

from _garmin_lib import build_client, dump_token


def _send(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


class handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        secret = os.environ.get("INTERNAL_FN_SECRET")
        if secret and self.headers.get("X-Internal-Secret") != secret:
            _send(self, 401, {"error": "unauthorized"})
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b""
        try:
            data = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            data = {}

        email = data.get("email")
        password = data.get("password")
        if not email or not password:
            _send(self, 400, {"error": "email and password are required"})
            return

        try:
            client = build_client(email, password)
            result = client.login()
            needs_mfa = isinstance(result, tuple) and result[0]
            if needs_mfa:
                _send(self, 428, {
                    "error": "mfa_required",
                    "message": (
                        "Your Garmin account has MFA/2FA enabled. This app "
                        "doesn't support interactive MFA yet — temporarily "
                        "disable it in Garmin Connect account security "
                        "settings, connect once, then you can re-enable it."
                    ),
                })
                return
            token = dump_token(client)
        except Exception as e:
            cls_name = type(e).__name__
            if cls_name == "GarminConnectAuthenticationError":
                _send(self, 401, {
                    "error": "invalid_credentials",
                    "message": "Garmin rejected that email/password.",
                })
                return
            if cls_name == "GarminConnectTooManyRequestsError":
                _send(self, 429, {
                    "error": "rate_limited",
                    "message": "Garmin is rate-limiting login attempts. Wait a few minutes and try again.",
                })
                return
            _send(self, 502, {"error": "garmin_error", "message": str(e)})
            return

        _send(self, 200, {"token": token})
