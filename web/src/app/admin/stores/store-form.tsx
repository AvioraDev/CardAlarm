import Link from "next/link";
import type { StoreRow } from "@/lib/types";

type StoreFormProps = {
  action: (formData: FormData) => Promise<void>;
  store?: StoreRow;
  submitLabel: string;
};

export function StoreForm({ action, store, submitLabel }: StoreFormProps) {
  return (
    <form action={action} className="rounded-3xl border border-border bg-card p-6 shadow-card md:p-8">
      {store ? <input type="hidden" name="id" value={store.id} /> : null}
      <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Name *</span>
          <input
            name="name"
            required
            defaultValue={store?.name}
            placeholder="TopPlay Sports Cards"
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Slug *</span>
          <input
            name="slug"
            required
            defaultValue={store?.slug}
            placeholder="topplay"
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 font-mono text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="block md:col-span-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Base URL *</span>
          <input
            name="base_url"
            required
            type="url"
            defaultValue={store?.base_url}
            placeholder="https://example-store.com"
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Source Type</span>
          <select
            name="source_type"
            defaultValue={store?.source_type ?? "shopify"}
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
          >
            <option value="shopify">Shopify</option>
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Scan Frequency Minutes</span>
          <input
            name="scan_frequency_minutes"
            type="number"
            min="15"
            max="10080"
            required
            defaultValue={store?.scan_frequency_minutes ?? 1440}
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Scan Strategy</span>
          <select
            name="scan_strategy"
            defaultValue={store?.scan_strategy ?? "incremental"}
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
          >
            <option value="incremental">Incremental</option>
            <option value="full">Full</option>
          </select>
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Early-Stop Full Pages</span>
          <input
            name="early_stop_unchanged_pages"
            type="number"
            min="1"
            max="50"
            required
            defaultValue={store?.early_stop_unchanged_pages ?? 2}
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Country Code</span>
          <input
            name="country_code"
            maxLength={2}
            defaultValue={store?.country_code ?? "NZ"}
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 font-mono text-sm uppercase text-text outline-none transition-colors focus:border-accent"
          />
        </label>
        <label className="block">
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">Currency</span>
          <input
            name="currency"
            maxLength={3}
            defaultValue={store?.currency ?? "NZD"}
            className="mt-1 w-full rounded-2xl border border-border bg-bg px-4 py-3 font-mono text-sm uppercase text-text outline-none transition-colors focus:border-accent"
          />
        </label>
      </div>
      <label className="mt-6 inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-text-muted">
        <input name="is_active" type="checkbox" defaultChecked={store?.is_active ?? true} className="accent-[var(--color-accent)]" />
        Active for scans
      </label>
      <label className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-text-muted sm:ml-3">
        <input name="early_stop_enabled" type="checkbox" defaultChecked={store?.early_stop_enabled ?? true} className="accent-[var(--color-accent)]" />
        Enable incremental early stop
      </label>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="submit" className="rounded-full bg-accent px-6 py-3 font-mono text-xs font-bold uppercase tracking-wider text-bg transition-colors hover:bg-accent-hover">
          {submitLabel}
        </button>
        <Link href="/admin/stores" className="rounded-full border border-border px-6 py-3 text-center font-mono text-xs font-bold uppercase tracking-wider text-text transition-colors hover:border-accent">
          Cancel
        </Link>
      </div>
    </form>
  );
}
