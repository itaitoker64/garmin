"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ConnectGarminForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/garmin/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "Couldn't connect to Garmin.");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Network error — try again.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
      <div>
        <label className="mb-1.5 block text-sm text-ink-secondary">Garmin email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-surface-border bg-surface-raised px-3.5 py-2.5 text-sm text-ink-primary outline-none focus:border-series-blue"
          placeholder="you@garmin-account.com"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm text-ink-secondary">Garmin password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-surface-border bg-surface-raised px-3.5 py-2.5 text-sm text-ink-primary outline-none focus:border-series-blue"
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-sm text-status-critical">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-series-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-series-blue/90 disabled:opacity-60"
      >
        {loading ? "Connecting…" : "Connect Garmin"}
      </button>
      <p className="text-xs leading-relaxed text-ink-muted">
        Your password is sent once over HTTPS to authenticate with Garmin, then discarded — only an
        encrypted session token is stored, in an httpOnly cookie tied to your login. We never write
        your Garmin password to disk. 2FA/MFA accounts aren&rsquo;t supported yet.
      </p>
    </form>
  );
}
