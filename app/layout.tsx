import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Coach — your Garmin-powered training AI",
  description: "A personal training dashboard grounded in your real Garmin Connect data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-plane text-ink-primary antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
