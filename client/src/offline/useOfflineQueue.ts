/**
 * React hook for subscribing to the offline write-queue + conflict-queue
 * sizes. Re-renders any component when an entry is added / removed.
 *
 *   const { pending, conflicts } = useOfflineQueue();
 *
 * Cheap: a global pub/sub with a set of listeners; each tick refreshes
 * counts via idb.count().
 */
import { useEffect, useState } from 'react';
import { queueSize, listConflicts, subscribeQueue } from './queue';

interface Counts { pending: number; conflicts: number }

export function useOfflineQueue(): Counts {
  const [counts, setCounts] = useState<Counts>({ pending: 0, conflicts: 0 });

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const [p, c] = await Promise.all([queueSize(), listConflicts()]);
      if (!cancelled) setCounts({ pending: p, conflicts: c.length });
    }
    void refresh();
    const unsub = subscribeQueue(refresh);
    return () => { cancelled = true; unsub(); };
  }, []);

  return counts;
}
