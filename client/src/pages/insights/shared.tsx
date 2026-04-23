/** Shared micro-components used across all insight views. */

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-brand-navy dark:text-fg-1">{title}</h1>
      {subtitle && <p className="text-sm text-brand-navy-70 dark:text-fg-2 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function Empty() {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-brand-navy-70 dark:text-fg-2">
      No items to show.
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-brand-navy-70 dark:text-fg-2">Loading…</div>
  );
}
