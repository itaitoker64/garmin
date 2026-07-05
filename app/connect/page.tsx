import { ConnectGarminForm } from "@/components/ConnectGarminForm";

export default function ConnectPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-10 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-series-aqua/15 text-2xl">
          ⌚
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Connect Garmin</h1>
        <p className="mt-1 max-w-sm text-sm text-ink-muted">
          One-time login to pull your recovery, training load, and activity data into your coach.
        </p>
      </div>
      <ConnectGarminForm />
    </main>
  );
}
