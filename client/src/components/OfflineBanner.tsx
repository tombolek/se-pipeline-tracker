/**
 * Thin banner that slides in at the top of the main content area when the
 * app is off-network. Explains what the user is seeing and gives them a
 * "Try reconnect" button. Hidden when online.
 *
 * Rendered in AppShell so it covers every route uniformly.
 */
import { useConnectionStatus } from '../offline/useConnectionStatus';

function timeAgo(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'less than a minute ago';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem === 0 ? `${hrs}h ago` : `${hrs}h ${rem}m ago`;
}

export default function OfflineBanner() {
  const { online, lastSync } = useConnectionStatus();
  if (online) return null;

  return (
    <div className="bg-brand-purple/[0.04] border-b border-brand-purple/20 px-5 py-2.5 flex items-center gap-3 flex-shrink-0">
      <svg className="w-4 h-4 text-brand-purple dark:text-accent-purple flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636A9 9 0 005.636 18.364M5.636 5.636l12.728 12.728" />
      </svg>
      <div className="flex-1 text-xs text-brand-navy dark:text-fg-1">
        <span className="font-medium">You're offline.</span>{' '}
        {lastSync !== null
          ? `Viewing cached data from ${timeAgo(lastSync)}. Your edits are queued and will sync when you reconnect.`
          : 'Reconnect to VPN or the internet to load data.'}
      </div>
      <button
        onClick={() => window.location.reload()}
        className="text-xs font-medium text-brand-purple dark:text-accent-purple hover:text-brand-purple-70 dark:text-accent-purple"
      >
        Try reconnect
      </button>
    </div>
  );
}
