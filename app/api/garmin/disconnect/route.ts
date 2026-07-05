import { NextResponse } from "next/server";
import { SESSION_COOKIE_PREFIX, SESSION_COOKIE_MAX_CHUNKS } from "@/lib/crypto";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  for (let i = 0; i < SESSION_COOKIE_MAX_CHUNKS; i++) {
    res.cookies.set(`${SESSION_COOKIE_PREFIX}.${i}`, "", { path: "/", maxAge: 0 });
  }
  return res;
}
