import Link from "next/link";
import { friendlyError } from "@/lib/friendly-error";
import { SubmitButton } from "@/app/components/submit-button";
import { signInAction } from "@/lib/auth-actions";

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;
  const message = typeof params.message === "string" ? params.message : undefined;
  const next = typeof params.next === "string" ? params.next : "/dashboard";

  return (
    <div className="panel mx-auto max-w-md p-6">
      <p className="eyebrow">Sign in</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text">Welcome back</h1>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        Sign in to view your CardAlarm dashboard and manage watchlists.
      </p>

      {message ? (
        <div role="status" className="mt-5 rounded-2xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-text">
          Check your email to confirm your account, then sign in.
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text">
          {friendlyError(error)}
        </div>
      ) : null}

      <form action={signInAction} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next} />
        <label className="block">
          <span className="field-label">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="field mt-1"
          />
        </label>
        <label className="block">
          <span className="field-label">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="field mt-1"
          />
        </label>
        <SubmitButton
          pendingLabel="Signing in…"
          className="btn btn-primary w-full"
        >
          Sign in
        </SubmitButton>
      </form>

      <p className="mt-5 text-center text-sm text-text-muted">
        No account yet?{" "}
        <Link href="/signup" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
