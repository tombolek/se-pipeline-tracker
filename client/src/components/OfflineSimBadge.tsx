/**
 * Floating red chip shown while the "Simulate offline" dev toggle is on.
 * Mounted in AppShell so it's visible on every route.
 *
 * Fixed to the bottom-right corner and clickable — clicking turns sim off
 * so you can exit without having to navigate back to Settings.
 */
import { useSyncExternalStore } from 'react';
import { isOfflineSimEnabled, setOfflineSimEnabled, subscribeOfflineSim } from '../offline/offlineSim';

export default function OfflineSimBadge() {
  const on = useSyncExternalStore(subscribeOfflineSim, isOfflineSimEnabled, isOfflineSimEnabled);
  if (!on) return null;

  return (
    <button
      onClick={() => setOfflineSimEnabled(false)}
      title="Click to turn simulation off"
      className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-status-overdue text-white text-xs font-semibold shadow-lg hover:brightness-110 transition-all"
      style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}
    >
      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
      SIMULATED OFFLINE
      <span className="text-[10px] font-normal opacity-80">· click to exit</span>
    </button>
  );
}
