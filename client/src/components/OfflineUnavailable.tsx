/**
 * Friendly "this page isn't available offline" empty state (Issue #117).
 *
 * Pages that haven't been cached locally render this instead of their normal
 * error banner when the fetch fails due to network. Shows a small hint about
 * what to do (reconnect / visit the page while online first).
 *
 * Usage:
 *   if (offline && !data) return <OfflineUnavailable label="Calendar" />;
 */
interface Props {
  /** Short page name, e.g. "Calendar", "PoC Board". */
  label: string;
  /** Optional override for the body copy. */
  hint?: string;
}

export default function OfflineUnavailable({ label, hint }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-16 bg-gray-50">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-purple/10 border border-brand-purple/20 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-brand-purple" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636A9 9 0 005.636 18.364M5.636 5.636l12.728 12.728" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-brand-navy">{label} isn't available offline</h2>
        <p className="text-sm text-brand-navy-70 mt-2 leading-relaxed">
          {hint ?? `You're offline and ${label} hasn't been loaded yet in this browser. Reconnect to VPN or the internet to view live data. Favorited opportunities and previously-opened deal drawers are always available offline.`}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-5 px-4 py-2 rounded-lg bg-brand-purple text-white text-xs font-medium hover:bg-brand-purple-70 transition-colors"
        >
          Try reconnect
        </button>
      </div>
    </div>
  );
}
