// Shared request handler for routes that resume a Garmin session from the
// encrypted cookie, call a Python data function, and re-store the refreshed
// token (Garmin rotates it) on the way out.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  encrypt,
  decrypt,
  chunkForCookies,
  joinCookieChunks,
  SESSION_COOKIE_PREFIX,
  SESSION_COOKIE_MAX_CHUNKS,
} from "@/lib/crypto";

export async function handleGarminData<T>(
  req: NextRequest,
  fetcher: (token: string) => Promise<{ token: string; data: T }>,
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const chunkValues: (string | undefined)[] = [];
  for (let i = 0; i < SESSION_COOKIE_MAX_CHUNKS; i++) {
    chunkValues.push(req.cookies.get(`${SESSION_COOKIE_PREFIX}.${i}`)?.value);
  }
  const encrypted = joinCookieChunks(chunkValues);
  if (!encrypted) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }

  let token: string;
  try {
    token = decrypt(encrypted);
  } catch {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }

  try {
    const { token: freshToken, data } = await fetcher(token);

    const res = NextResponse.json({ data });
    const chunks = chunkForCookies(encrypt(freshToken));
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
    const status = err.status || 502;
    const res = NextResponse.json(
      { error: err.code || "garmin_error", message: err.message },
      { status },
    );
    if (err.code === "session_expired") {
      for (let i = 0; i < SESSION_COOKIE_MAX_CHUNKS; i++) {
        res.cookies.set(`${SESSION_COOKIE_PREFIX}.${i}`, "", { path: "/", maxAge: 0 });
      }
    }
    return res;
  }
}
