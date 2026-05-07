import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "CardAlarm — Procurement Dashboard",
  description:
    "Local-first NBA card procurement engine. Stealth match detection for the NZ market.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen">
        <header className="border-b border-border sticky top-0 z-50 bg-bg/95 backdrop-blur-sm">
          <div className="max-w-[1600px] mx-auto px-4 h-12 flex items-center justify-between">
            <Link href="/" className="font-mono text-sm font-bold tracking-[0.2em] uppercase text-text">
              Card<span className="text-accent">Alarm</span>
            </Link>
            <nav className="flex items-center gap-6">
              <Link
                href="/"
                className="font-mono text-xs uppercase tracking-wider text-text-muted hover:text-text transition-colors"
              >
                Feed
              </Link>
              <Link
                href="/admin"
                className="font-mono text-xs uppercase tracking-wider text-text-muted hover:text-text transition-colors"
              >
                Watchlist
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-[1600px] mx-auto px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
