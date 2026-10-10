import Link from "next/link";

interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorPanel({ title, message, onRetry }: ErrorPanelProps) {
  return (
    <section role="alert" className="panel mx-auto max-w-lg px-6 py-10 text-left md:px-10">
      <h1 className="section-title text-text">{title}</h1>
      <p className="mt-2 text-text-muted">{message}</p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        {onRetry ? (
          <button type="button" onClick={onRetry} className="btn btn-primary">
            Try again
          </button>
        ) : null}
        <Link href="/" className="btn btn-secondary">
          Go home
        </Link>
      </div>
    </section>
  );
}
