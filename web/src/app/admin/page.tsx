import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();

  return (
    <div>
      <section className="mb-6 rounded-3xl border border-border bg-card p-6 shadow-card">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Admin</p>
        <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text">
              Operations
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Manage operational configuration only. User-owned watchlists now live under
              the Watchlists area; legacy admin watchlist management is no longer active.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/admin/stores"
              className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent"
            >
              Manage Stores
            </Link>
            <Link
              href="/admin/scans"
              className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
            >
              Open Scans
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/stores"
          className="rounded-3xl border border-border bg-card p-6 shadow-card transition-colors hover:border-accent"
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Stores</p>
          <h2 className="mt-3 text-xl font-semibold text-text">Manage scan sources</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Add, edit, activate, or deactivate Shopify stores used by manual scans.
          </p>
        </Link>
        <Link
          href="/admin/scans"
          className="rounded-3xl border border-border bg-card p-6 shadow-card transition-colors hover:border-accent"
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Scans</p>
          <h2 className="mt-3 text-xl font-semibold text-text">Run and monitor scans</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Start explicit manual scans and review current scan status away from the dashboard.
          </p>
        </Link>
      </section>
    </div>
  );
}
