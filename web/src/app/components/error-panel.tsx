import Link from "next/link";

interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorPanel({ title, message, onRetry }: ErrorPanelProps) {
  return (
    <section
      role="alert"
      className="mx-auto max-w-xl rounded-3xl border border-danger/30 bg-card px-6 py-12 text-center shadow-card"
    >
      <h1 className="text-2xl font-semibold text-text">{title}</h1>
      <p className="mt-3 text-sm leading-6 text-text-muted">{message}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
          >
            Try again
          </button>
        ) : null}
        <Link
          href="/"
          className="rounded-full border border-border px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent"
        >
          Go home
        </Link>
      </div>
    </section>
  );
}
