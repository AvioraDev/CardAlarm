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
              Admin Console
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
              Manage store sources, scan runs, and inventory QA away from the customer experience.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/admin/stores"
              className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent"
            >
              Store Sources
            </Link>
            <Link
              href="/admin/scans"
              className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
            >
              Scan Runs
            </Link>
            <Link
              href="/admin/scan-qa"
              className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent"
            >
              Scan QA
            </Link>
            <Link
              href="/admin/inventory"
              className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent"
            >
              Inventory QA
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <Link
          href="/admin/stores"
          className="rounded-3xl border border-border bg-card p-6 shadow-card transition-colors hover:border-accent"
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Store Sources</p>
          <h2 className="mt-3 text-xl font-semibold text-text">Manage store sources</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Add, edit, activate, or deactivate Shopify stores used by manual scans.
          </p>
        </Link>
        <Link
          href="/admin/scans"
          className="rounded-3xl border border-border bg-card p-6 shadow-card transition-colors hover:border-accent"
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Scan Runs</p>
          <h2 className="mt-3 text-xl font-semibold text-text">Run and monitor scan runs</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Start explicit manual scans and review current scan status away from the dashboard.
          </p>
        </Link>
        <Link
          href="/admin/inventory"
          className="rounded-3xl border border-border bg-card p-6 shadow-card transition-colors hover:border-accent"
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Inventory QA</p>
          <h2 className="mt-3 text-xl font-semibold text-text">Review scanned products</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Inspect available products for QA and matching validation.
          </p>
        </Link>
        <Link
          href="/admin/scan-qa"
          className="rounded-3xl border border-border bg-card p-6 shadow-card transition-colors hover:border-accent"
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Scan QA</p>
          <h2 className="mt-3 text-xl font-semibold text-text">Review scan evidence</h2>
          <p className="mt-2 text-sm leading-6 text-text-muted">
            Inspect per-store progress and recent watchlist match output without terminal logs.
          </p>
        </Link>
      </section>
    </div>
  );
}
