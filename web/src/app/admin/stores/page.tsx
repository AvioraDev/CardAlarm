import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getStores } from "@/lib/queries";
import { toggleStoreActiveAction } from "@/lib/store-actions";

export const dynamic = "force-dynamic";

type AdminStoresPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function errorMessage(params: Record<string, string | string[] | undefined>): string | null {
  return typeof params.error === "string" ? params.error : null;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-NZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function AdminStoresPage({ searchParams }: AdminStoresPageProps) {
  await requireAdmin();
  const [stores, params] = await Promise.all([getStores(), searchParams]);
  const error = errorMessage(params);

  return (
    <div>
      <section className="mb-6 rounded-3xl border border-border bg-card p-6 shadow-card">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-accent">Admin Stores</p>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-text">Store Management</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              Manage the canonical store records used by scanner runtime. Active Shopify stores are scanned from the
              database before the local fallback source list is considered.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/admin"
              className="inline-flex items-center justify-center rounded-full border border-border px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent"
            >
              Admin Home
            </Link>
            <Link
              href="/admin/stores/new"
              className="inline-flex items-center justify-center rounded-full bg-accent px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover"
            >
              New Store
            </Link>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-text">
            Configured Stores
          </h2>
          <span className="font-mono text-xs text-text-muted">{stores.length} stores</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1200px] text-left text-sm">
            <thead className="border-b border-border bg-surface/80 font-mono text-[10px] uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-3">Store</th>
                <th className="px-4 py-3">Base URL</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Country</th>
                <th className="px-4 py-3">Currency</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Frequency</th>
                <th className="px-4 py-3">Last Success</th>
                <th className="px-4 py-3">Last Failure</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {stores.map((store) => (
                <tr key={store.id} className="align-top">
                  <td className="px-4 py-4">
                    <div className="font-semibold text-text">{store.name}</div>
                    <div className="mt-1 font-mono text-xs text-text-muted">{store.slug}</div>
                  </td>
                  <td className="max-w-[280px] px-4 py-4">
                    <a
                      href={store.base_url}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all text-text-muted transition-colors hover:text-accent"
                    >
                      {store.base_url}
                    </a>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs uppercase text-text-muted">{store.source_type}</td>
                  <td className="px-4 py-4 font-mono text-xs text-text-muted">{store.country_code ?? "—"}</td>
                  <td className="px-4 py-4 font-mono text-xs text-text-muted">{store.currency ?? "—"}</td>
                  <td className="px-4 py-4">
                    <span
                      className={
                        store.is_active
                          ? "rounded-full border border-accent/50 bg-accent/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-accent"
                          : "rounded-full border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-text-muted"
                      }
                    >
                      {store.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-xs text-text-muted">
                    {store.scan_frequency_minutes} min
                  </td>
                  <td className="px-4 py-4 text-xs text-text-muted">{formatDate(store.last_successful_scan_at)}</td>
                  <td className="px-4 py-4 text-xs text-text-muted">{formatDate(store.last_failed_scan_at)}</td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/admin/stores/${store.id}/edit`}
                        className="rounded-full border border-border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-text transition-colors hover:border-accent"
                      >
                        Edit
                      </Link>
                      <form action={toggleStoreActiveAction}>
                        <input type="hidden" name="id" value={store.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-border px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-text-muted transition-colors hover:border-accent hover:text-text"
                        >
                          {store.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {stores.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-text-muted">
                    No stores configured yet. Add a Shopify store to make database-backed scans available.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
