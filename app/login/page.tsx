import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) redirect("/dashboard");

  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-10 text-center">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-series-blue/15 text-2xl">
          🏃
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Coach</h1>
        <p className="mt-1 text-sm text-ink-muted">Your training, read from real data.</p>
      </div>
      <Suspense>
        <LoginForm googleEnabled={googleEnabled} />
      </Suspense>
    </main>
  );
}
