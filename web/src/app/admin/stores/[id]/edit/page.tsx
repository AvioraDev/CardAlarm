import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getStoreById } from "@/lib/queries";
import { updateStoreAction } from "@/lib/store-actions";
import { StoreForm } from "../../store-form";

export const dynamic = "force-dynamic";

type EditStorePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function EditStorePage({ params, searchParams }: EditStorePageProps) {
  await requireAdmin();
  const [{ id: idParam }, queryParams] = await Promise.all([params, searchParams]);
  const id = Number(idParam);
  if (!Number.isInteger(id)) notFound();

  const store = await getStoreById(id);
  if (!store) notFound();

  const error = typeof queryParams.error === "string" ? queryParams.error : null;

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/admin/stores" className="font-mono text-xs uppercase tracking-wider text-text-muted hover:text-text">
          ← Back to stores
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-text">Edit Store</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
          Update scan configuration for {store.name}. Deactivate the store to exclude it from future manual scans.
        </p>
      </div>

      {error ? (
        <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <StoreForm action={updateStoreAction} store={store} submitLabel="Save Store" />
    </div>
  );
}
