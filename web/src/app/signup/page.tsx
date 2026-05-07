import Link from "next/link";
import { signUpAction } from "@/lib/auth-actions";

interface SignupPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-border bg-card p-6 shadow-card">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Create account</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text">Start your watchlist</h1>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        Create an account so CardAlarm can isolate your watchlists and matches.
      </p>

      {error ? (
        <div className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text">
          {decodeURIComponent(error)}
        </div>
      ) : null}

      <form action={signUpAction} className="mt-6 space-y-4">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Password</span>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-full bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
        >
          Create account
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
