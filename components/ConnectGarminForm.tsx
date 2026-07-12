"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputClass =
  "w-full rounded-xl border border-surface-border bg-surface-raised px-3.5 py-2.5 text-sm text-ink-primary outline-none focus:border-series-blue";
const buttonClass =
  "w-full rounded-xl bg-series-blue px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-series-blue/90 disabled:opacity-60";

export function ConnectGarminForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaPrompt, setMfaPrompt] = useState<string | null>(null);
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
      if (res.status === 428 && json.error === "mfa_required") {
        setMfaPrompt(json.message || "Garmin sent you a security code.");
        setLoading(false);
        return;
      }
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

  async function onSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/garmin/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || "Verification failed — try again.");
        // Anything other than a retryable wrong code means starting over.
        if (json.error !== "invalid_mfa_code" && json.error !== "invalid_code") {
          setMfaPrompt(null);
          setCode("");
        }
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

  if (mfaPrompt) {
    return (
      <form onSubmit={onSubmitCode} className="w-full max-w-sm space-y-4">
        <p className="text-sm text-ink-secondary">{mfaPrompt}</p>
        <div>
          <label className="mb-1.5 block text-sm text-ink-secondary">Security code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{4,8}"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${inputClass} tracking-[0.3em] text-center text-base`}
            placeholder="123456"
            maxLength={8}
          />
        </div>
        {error && <p className="text-sm text-status-critical">{error}</p>}
        <button type="submit" disabled={loading || code.length < 4} className={buttonClass}>
          {loading ? "Verifying…" : "Verify code"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setMfaPrompt(null);
            setCode("");
            setError(null);
          }}
          className="w-full rounded-xl border border-surface-border px-4 py-2.5 text-sm text-ink-secondary transition hover:text-ink-primary disabled:opacity-60"
        >
          Start over
        </button>
        <p className="text-xs leading-relaxed text-ink-muted">
          The code expires after a few minutes. If it stops working, start over and log in again.
        </p>
      </form>
    );
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
          className={inputClass}
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
          className={inputClass}
          placeholder="••••••••"
        />
      </div>
      {error && <p className="text-sm text-status-critical">{error}</p>}
      <button type="submit" disabled={loading} className={buttonClass}>
        {loading ? "Connecting…" : "Connect Garmin"}
      </button>
      <p className="text-xs leading-relaxed text-ink-muted">
        Your password is sent once over HTTPS to authenticate with Garmin, then discarded — only an
        encrypted session token is stored, in an httpOnly cookie tied to your login. We never write
        your Garmin password to disk. If your account has 2FA enabled, you&rsquo;ll be asked for
        the security code Garmin sends you.
      </p>
    </form>
  );
}
