"""
POST /api/garmin-data/login
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

from _garmin_lib import INTERNAL_FN_SECRET, build_client, dump_mfa_state, dump_token


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
                # Not a failure: hand the serialized pending-MFA state back to
                # the Node side, which stores it (encrypted, short-lived) and
                # asks the user for their 6-digit code. mfa.py finishes the job.
                _send(self, 200, {
                    "mfa_required": True,
                    "mfa_state": dump_mfa_state(client),
                    "mfa_method": getattr(client.client, "_mfa_method", None) or "email",
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
