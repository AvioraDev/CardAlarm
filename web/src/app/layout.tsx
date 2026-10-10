import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import Link from "next/link";
import { NavLink } from "@/app/components/nav-link";
import { getCurrentProfile } from "@/lib/auth";
import { signOutAction } from "@/lib/auth-actions";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  axes: ["opsz"],
  style: ["normal"],
});

export const metadata: Metadata = {
  title: "CardAlarm: never miss the card you're chasing",
  description:
    "Watchlists for NBA card collectors. CardAlarm checks hobby stores and shows matching singles that are in stock, with how sure we are that each one is right.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#1B1B19" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile();

  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${newsreader.variable}`}>
      <body className="flex min-h-screen flex-col">
        <header className="border-b border-border bg-surface sm:sticky sm:top-0 sm:z-50">
          <div className="mx-auto max-w-[1320px] px-4 md:px-6 xl:px-8">
            {profile ? (
              <div className="flex flex-wrap items-center sm:h-14 sm:flex-nowrap sm:gap-6">
                <Link
                  href="/"
                  className="mr-auto flex h-12 items-center font-serif text-[1.3125rem] font-semibold tracking-[-0.01em] text-text sm:h-auto"
                >
                  CardAlarm
                </Link>
                {/* Phone: Sign out sits on the wordmark row; the tabs get their own row below. */}
                <form action={signOutAction} className="sm:hidden">
                  <button type="submit" className="nav-link text-[0.8125rem]">
                    Sign out
                  </button>
                </form>
                <nav
                  aria-label="Main"
                  className="-mx-4 flex h-11 w-full gap-5 overflow-x-auto px-4 sm:mx-0 sm:h-14 sm:w-auto sm:gap-6 sm:overflow-visible sm:px-0"
                >
                  <NavLink href="/dashboard" className="nav-link h-11 shrink-0 whitespace-nowrap sm:h-14">
                    For You
                  </NavLink>
                  <NavLink href="/watchlists" className="nav-link h-11 shrink-0 whitespace-nowrap sm:h-14">
                    Watchlists
                  </NavLink>
                  <NavLink href="/saved" className="nav-link h-11 shrink-0 whitespace-nowrap sm:h-14">
                    Saved
                  </NavLink>
                  {profile.role === "admin" ? (
                    <NavLink href="/admin" className="nav-link h-11 shrink-0 whitespace-nowrap sm:h-14">
                      Admin
                    </NavLink>
                  ) : null}
                </nav>
                <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
                <form action={signOutAction} className="hidden sm:block">
                  <button type="submit" className="nav-link whitespace-nowrap">
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex h-12 items-center gap-4 sm:h-14 sm:gap-6">
                <Link
                  href="/"
                  className="mr-auto font-serif text-[1.3125rem] font-semibold tracking-[-0.01em] text-text"
                >
                  CardAlarm
                </Link>
                <nav aria-label="Main" className="flex items-center gap-4 sm:gap-6">
                  <NavLink href="/login" className="nav-link h-12 whitespace-nowrap sm:h-14">
                    Sign in
                  </NavLink>
                  <Link href="/signup" className="btn btn-primary btn-sm">
                    Get started
                  </Link>
                </nav>
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-5 md:px-6 md:py-8 xl:px-8">{children}</main>
        <footer className="mt-16 border-t border-border">
          <div className="mx-auto max-w-[1320px] space-y-1 px-4 py-8 text-[0.8125rem] leading-[1.125rem] text-text-muted md:px-6 xl:px-8">
            <p>
              CardAlarm finds NBA singles listed by online hobby stores. Prices, stock and condition are set by each
              store, so check the listing before you buy.
            </p>
            <p>&copy; 2026 CardAlarm</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
