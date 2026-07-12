"""
POST /api/garmin-data/login
Body: {"email": str, "password": str}

Authenticates against Garmin Connect and returns an in-memory session
token string (via garminconnect's client.dumps()). The caller (the
Next.js server, never the browser directly) encrypts this token and
stores it in an httpOnly cookie, then resends it to snapshot.py on
every dashboard load so we never touch the filesystem for tokens.

GET (no secret required) returns runtime diagnostics — python version
and whether the Garmin libraries import — so a platform-level 500 can
be told apart from a Garmin-side failure.

Gated by X-Internal-Secret so only our own Node routes can reach it.
"""
from http.server import BaseHTTPRequestHandler
import json
import sys
import traceback

# If anything in the import chain blows up (missing wheel, wrong Python,
# sibling module not bundled), surface the traceback as JSON instead of
# letting the platform swallow it into an opaque 500.
try:
    from _garmin_lib import INTERNAL_FN_SECRET, build_client, dump_mfa_state, dump_token
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


def _diagnostics() -> dict:
    info: dict = {"python": sys.version, "import_error": IMPORT_ERROR}
    for mod in ("garminconnect", "curl_cffi"):
        try:
            m = __import__(mod)
            info[mod] = getattr(m, "__version__", "ok")
        except Exception as e:
            info[mod] = f"IMPORT FAILED: {type(e).__name__}: {e}"
    return info


class handler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        _send(self, 200 if not IMPORT_ERROR else 500, _diagnostics())

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
