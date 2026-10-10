import Link from "next/link";
import { friendlyError } from "@/lib/friendly-error";
import { SubmitButton } from "@/app/components/submit-button";
import { signUpAction } from "@/lib/auth-actions";

interface SignupPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="panel mx-auto max-w-md p-6">
      <p className="eyebrow">Create account</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-text">Start your watchlist</h1>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        Create an account so CardAlarm can isolate your watchlists and matches.
      </p>

      {error ? (
        <div role="alert" className="mt-5 rounded-2xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-text">
          {friendlyError(error)}
        </div>
      ) : null}

      <form action={signUpAction} className="mt-6 space-y-4">
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
            minLength={8}
            autoComplete="new-password"
            className="field mt-1"
          />
        </label>
        <SubmitButton
          pendingLabel="Creating account…"
          className="btn btn-primary w-full"
        >
          Create account
        </SubmitButton>
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
