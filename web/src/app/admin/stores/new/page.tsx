import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createStoreAction } from "@/lib/store-actions";
import { StoreForm } from "../store-form";

export const dynamic = "force-dynamic";

type NewStorePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewStorePage({ searchParams }: NewStorePageProps) {
  await requireAdmin();
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/admin/stores" className="font-mono text-xs uppercase tracking-wider text-text-muted hover:text-text">
          ← Back to stores
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text">Add Shopify Store</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
          New active stores become eligible for manual scans from the admin scan page.
        </p>
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <StoreForm action={createStoreAction} submitLabel="Create Store" />
    </div>
  );
}
