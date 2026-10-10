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
    <div className="mx-auto max-w-[25rem] pt-6 md:pt-12">
      <div className="panel p-6 md:p-8">
        <h1 className="page-title text-text">Sign in</h1>
        <p className="mt-2 text-text-muted">Welcome back. Your watchlists and saved cards are where you left them.</p>

        {message ? (
          <div role="status" className="notice notice-success mt-5">
            Check your email to confirm your account, then sign in.
          </div>
        ) : null}
        {error ? (
          <div role="alert" className="notice notice-error mt-5">
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
              className="field"
            />
          </label>
          <label className="block">
            <span className="field-label">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="field"
            />
          </label>
          <SubmitButton
            pendingLabel="Signing in…"
            className="btn btn-primary w-full"
          >
            Sign in
          </SubmitButton>
        </form>

        <p className="mt-6 text-[0.875rem] leading-5 text-text-muted">
          No account yet?{" "}
          <Link href="/signup" className="link">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
