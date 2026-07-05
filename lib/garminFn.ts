// Calls the Python Vercel Functions in /api/garmin/*.py from the Node/Next.js
// side. They live in the same deployment, so we hit them over HTTP using the
// deployment's own URL rather than importing Python code into the Node runtime.

function baseUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.APP_URL || "http://localhost:3000";
}

async function callFn<T>(path: string, body: unknown): Promise<T> {
  const secret = process.env.INTERNAL_FN_SECRET;
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(secret ? { "X-Internal-Secret": secret } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(json?.message || json?.error || `${path} failed (${res.status})`);
    (err as Error & { code?: string; status?: number }).code = json?.error;
    (err as Error & { code?: string; status?: number }).status = res.status;
    throw err;
  }
  return json as T;
}

export function garminLogin(email: string, password: string) {
  return callFn<{ token: string }>("/api/_garmin/login", { email, password });
}

export function garminSnapshot(token: string) {
  return callFn<{ token: string; data: import("./types").GarminSnapshot }>(
    "/api/_garmin/snapshot",
    { token },
  );
}
