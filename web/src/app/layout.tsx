import type { Metadata, Viewport } from "next";
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
  title: "CardAlarm: never miss the card you're chasing",
  description:
    "Watchlists for NBA card collectors. CardAlarm checks hobby stores and shows matching singles that are in stock, with how sure we are that each one is right.",
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#07080b",
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
          <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4">
            <Link href="/" className="text-base font-semibold tracking-tight text-text">
              Card<span className="text-accent">Alarm</span>
            </Link>
            <nav aria-label="Main" className="flex items-center gap-4 overflow-x-auto sm:gap-6 [&_a]:whitespace-nowrap [&_button]:whitespace-nowrap">
              {profile ? (
                <>
                  <Link href="/dashboard" className="nav-link">
                    For You
                  </Link>
                  <Link href="/watchlists" className="nav-link">
                    Watchlists
                  </Link>
                  <Link href="/saved" className="nav-link">
                    Saved
                  </Link>
                  {profile.role === "admin" ? (
                    <Link href="/admin" className="nav-link">
                      Admin
                    </Link>
                  ) : null}
                  <form action={signOutAction}>
                    <button type="submit" className="nav-link">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/login" className="nav-link">
                    Sign in
                  </Link>
                  <Link href="/signup" className="btn btn-primary btn-sm">
                    Get started
                  </Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
