"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export function TopNav() {
  const router = useRouter();

  async function disconnect() {
    await fetch("/api/garmin/disconnect", { method: "POST" });
    router.push("/connect");
  }

  return (
    <header className="flex items-center justify-between border-b border-surface-border px-6 py-4">
      <div className="flex items-center gap-2">
        <span className="text-xl">🏃</span>
        <span className="font-semibold tracking-tight">Coach</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={disconnect}
          className="rounded-lg px-3 py-1.5 text-xs text-ink-secondary transition hover:bg-surface-raised hover:text-ink-primary"
        >
          Disconnect Garmin
        </button>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-lg px-3 py-1.5 text-xs text-ink-secondary transition hover:bg-surface-raised hover:text-ink-primary"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
