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
    <div className="mx-auto max-w-[25rem] pt-6 md:pt-12">
      <div className="panel p-6 md:p-8">
        <h1 className="page-title text-text">Create your account</h1>
        <p className="mt-2 text-text-muted">Free while in beta. Next, you&apos;ll pick the first player to watch.</p>

        {error ? (
          <div role="alert" className="notice notice-error mt-5">
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
              className="field"
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
              className="field"
            />
          </label>
          <SubmitButton
            pendingLabel="Creating account…"
            className="btn btn-primary w-full"
          >
            Create account
          </SubmitButton>
        </form>

        <p className="mt-6 text-[0.875rem] leading-5 text-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
