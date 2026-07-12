// Calls the Python Vercel Functions in /api/garmin/*.py from the Node/Next.js
// side. They live in the same deployment, so we hit them over HTTP using the
// deployment's own URL rather than importing Python code into the Node runtime.

import { INTERNAL_FN_SECRET } from "./defaults";

function baseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.APP_URL || "http://localhost:3000";
}

// Our own Python handlers always send {error, message} as flat strings, but a
// crash before user code runs (e.g. Vercel's platform-level function error)
// can hand back a nested shape like {error: {code, message}} instead. Walk a
// couple of levels looking for the first usable string so we never fall back
// to `new Error(someObject)`, which silently stringifies to "[object Object]".
function firstString(...candidates: unknown[]): string {
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
    if (c && typeof c === "object") {
      const nested = (c as Record<string, unknown>).message ?? (c as Record<string, unknown>).error;
      if (typeof nested === "string" && nested) return nested;
    }
  }
  return "Something went wrong talking to Garmin.";
}

async function callFn<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": INTERNAL_FN_SECRET,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const obj = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
    const message = firstString(obj.message, obj.error, `${path} failed (${res.status})`);
    const code = typeof obj.error === "string" ? obj.error : undefined;
    console.error(`[garminFn] ${path} -> ${res.status}`, JSON.stringify(obj).slice(0, 2000));
    const err = new Error(message);
    (err as Error & { code?: string; status?: number }).code = code;
    (err as Error & { code?: string; status?: number }).status = res.status;
    throw err;
  }
  return json as T;
}

export function garminLogin(email: string, password: string) {
  return callFn<{ token: string }>("/api/garmin-data/login", { email, password });
}

export function garminSnapshot(token: string) {
  return callFn<{ token: string; data: import("./types").GarminSnapshot }>(
    "/api/garmin-data/snapshot",
    { token },
  );
}
