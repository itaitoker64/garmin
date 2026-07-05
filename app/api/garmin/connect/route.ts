import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { garminLogin } from "@/lib/garminFn";
import { encrypt, chunkForCookies, SESSION_COOKIE_PREFIX, SESSION_COOKIE_MAX_CHUNKS } from "@/lib/crypto";

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
    const { token } = await garminLogin(email, password);
    const encrypted = encrypt(token);
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
