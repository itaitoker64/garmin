import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { garminMfa } from "@/lib/garminFn";
import {
  encrypt,
  decrypt,
  chunkForCookies,
  joinCookieChunks,
  SESSION_COOKIE_PREFIX,
  SESSION_COOKIE_MAX_CHUNKS,
  MFA_COOKIE_PREFIX,
} from "@/lib/crypto";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { code } = await req.json().catch(() => ({}));
  if (!code || !/^\d{4,8}$/.test(String(code).trim())) {
    return NextResponse.json(
      { error: "invalid_code", message: "Enter the numeric security code Garmin sent you." },
      { status: 400 },
    );
  }

  const chunkValues: (string | undefined)[] = [];
  for (let i = 0; i < SESSION_COOKIE_MAX_CHUNKS; i++) {
    chunkValues.push(req.cookies.get(`${MFA_COOKIE_PREFIX}.${i}`)?.value);
  }
  const encryptedState = joinCookieChunks(chunkValues);
  if (!encryptedState) {
    return NextResponse.json(
      {
        error: "mfa_state_missing",
        message: "The verification window expired. Enter your email and password again.",
      },
      { status: 410 },
    );
  }

  let state: string;
  try {
    state = decrypt(encryptedState);
  } catch {
    return NextResponse.json(
      {
        error: "mfa_state_missing",
        message: "The verification window expired. Enter your email and password again.",
      },
      { status: 410 },
    );
  }

  try {
    const { token } = await garminMfa(state, String(code).trim());

    const res = NextResponse.json({ ok: true });
    const chunks = chunkForCookies(encrypt(token));
    for (let i = 0; i < SESSION_COOKIE_MAX_CHUNKS; i++) {
      const chunk = chunks[i];
      res.cookies.set(`${SESSION_COOKIE_PREFIX}.${i}`, chunk?.value ?? "", {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: chunk ? 60 * 60 * 24 * 180 : 0,
      });
      // Login completed — the pending state has served its purpose.
      res.cookies.set(`${MFA_COOKIE_PREFIX}.${i}`, "", { path: "/", maxAge: 0 });
    }
    return res;
  } catch (e) {
    const err = e as Error & { code?: string; status?: number };
    const res = NextResponse.json(
      { error: err.code || "garmin_error", message: err.message },
      { status: err.status || 502 },
    );
    // A wrong code can be retried against the same pending state; anything
    // else (expired session, rate limit lockout) means starting over.
    if (err.code !== "invalid_mfa_code") {
      for (let i = 0; i < SESSION_COOKIE_MAX_CHUNKS; i++) {
        res.cookies.set(`${MFA_COOKIE_PREFIX}.${i}`, "", { path: "/", maxAge: 0 });
      }
    }
    return res;
  }
}
