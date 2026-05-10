import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth";
import { signOutAction } from "@/lib/auth-actions";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "CardAlarm — Watchlist Discovery",
  description:
    "Watchlist-driven sports card discovery for cards found across hobby stores.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile();

  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen">
        <header className="sticky top-0 z-50 border-b border-border bg-bg/95 backdrop-blur-sm">
          <div className="mx-auto flex h-12 max-w-[1600px] items-center justify-between px-4">
            <Link href="/" className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-text">
              Card<span className="text-accent">Alarm</span>
            </Link>
            <nav className="flex items-center gap-6">
              <Link
                href="/dashboard"
                className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text"
              >
                For You
              </Link>
              {profile ? (
                <Link
                  href="/watchlists"
                  className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text"
                >
                  Watchlists
                </Link>
              ) : null}
              {profile?.role === "admin" ? (
                <Link
                  href="/admin"
                  className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text"
                >
                  Admin
                </Link>
              ) : null}
              {profile ? (
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text"
                  >
                    Sign out
                  </button>
                </form>
              ) : (
                <Link
                  href="/login"
                  className="font-mono text-xs uppercase tracking-wider text-text-muted transition-colors hover:text-text"
                >
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
