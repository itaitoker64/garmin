import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { garminLogin } from "@/lib/garminFn";
import {
  encrypt,
  chunkForCookies,
  SESSION_COOKIE_PREFIX,
  SESSION_COOKIE_MAX_CHUNKS,
  MFA_COOKIE_PREFIX,
  MFA_COOKIE_MAX_AGE_S,
} from "@/lib/crypto";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  }

  try {
    const result = await garminLogin(email, password);

    // Garmin wants a 2FA code. Park the (encrypted) pending-login state in a
    // short-lived cookie and tell the form to show the code input — the
    // /api/garmin/mfa route picks it up from there.
    if (result.mfa_required && result.mfa_state) {
      const res = NextResponse.json(
        {
          error: "mfa_required",
          mfa_method: result.mfa_method || "email",
          message:
            result.mfa_method === "sms"
              ? "Garmin sent a security code to your phone."
              : "Garmin sent a security code to your email.",
        },
        { status: 428 },
      );
      const chunks = chunkForCookies(encrypt(result.mfa_state), MFA_COOKIE_PREFIX);
      for (let i = 0; i < SESSION_COOKIE_MAX_CHUNKS; i++) {
        const chunk = chunks[i];
        res.cookies.set(`${MFA_COOKIE_PREFIX}.${i}`, chunk?.value ?? "", {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: chunk ? MFA_COOKIE_MAX_AGE_S : 0,
        });
      }
      return res;
    }

    const encrypted = encrypt(result.token);
    const chunks = chunkForCookies(encrypted);

    const res = NextResponse.json({ ok: true });
    for (let i = 0; i < SESSION_COOKIE_MAX_CHUNKS; i++) {
      const chunk = chunks[i];
      res.cookies.set(`${SESSION_COOKIE_PREFIX}.${i}`, chunk?.value ?? "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: chunk ? 60 * 60 * 24 * 180 : 0,
      });
    }
    return res;
  } catch (e) {
    const err = e as Error & { code?: string; status?: number };
    return NextResponse.json(
      { error: err.code || "garmin_error", message: err.message },
      { status: err.status || 502 },
    );
  }
}
