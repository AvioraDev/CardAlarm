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
            className="btn btn-primary"
          >
            Try again
          </button>
        ) : null}
        <Link
          href="/"
          className="btn btn-secondary"
        >
          Go home
        </Link>
      </div>
    </section>
  );
}
