import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getOpportunity } from '../api/opportunities';

type OppRef = { id: number; sf_opportunity_id: string };

/**
 * Syncs the drawer's selectedOppId with a `?oppId=<sf_opportunity_id>` URL query param.
 *
 * - URL → state: when the param is present, resolve sfId → numeric id (via the provided
 *   opps list first, then a detail fetch as fallback) and call setSelectedOppId.
 * - state → URL: when selectedOppId changes, write the matching sf_opportunity_id to the
 *   URL. Opening the drawer pushes history; closing replaces (avoids back-button pollution).
 * - Preserves all other existing search params.
 *
 * Pass the page's current list of opps so the common case (opp already loaded) doesn't
 * need an extra network round-trip.
 */
export function useOppUrlSync(
  selectedOppId: number | null,
  setSelectedOppId: (id: number | null) => void,
  opps: OppRef[] = []
): void {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlOppId = searchParams.get('oppId');

  // Track the last sf_opportunity_id we resolved so we don't loop / re-fetch unnecessarily
  const lastSyncedSfIdRef = useRef<string | null>(null);
  // Map numeric id → sf_opportunity_id for opps we've seen (covers the fallback-fetch case)
  const sfIdByIdRef = useRef<Map<number, string>>(new Map());

  // Keep the id→sfId map fresh from the list
  useEffect(() => {
    for (const o of opps) {
      if (o.sf_opportunity_id) sfIdByIdRef.current.set(o.id, o.sf_opportunity_id);
    }
  }, [opps]);

  // Effect A: URL → state
  useEffect(() => {
    if (!urlOppId) {
      // Param removed (e.g. user edited URL or hit back) — close drawer if open
      if (selectedOppId !== null) {
        lastSyncedSfIdRef.current = null;
        setSelectedOppId(null);
      }
      return;
    }

    // Already in sync with the current drawer state
    const currentSfId =
      selectedOppId !== null ? sfIdByIdRef.current.get(selectedOppId) : undefined;
    if (currentSfId === urlOppId) {
      lastSyncedSfIdRef.current = urlOppId;
      return;
    }

    // Try the local list first
    const fromList = opps.find(o => o.sf_opportunity_id === urlOppId);
    if (fromList) {
      sfIdByIdRef.current.set(fromList.id, fromList.sf_opportunity_id);
      lastSyncedSfIdRef.current = urlOppId;
      setSelectedOppId(fromList.id);
      return;
    }

    // Fallback: fetch by sfId and get the numeric id from the response
    let cancelled = false;
    (async () => {
      try {
        const opp = await getOpportunity(urlOppId);
        if (cancelled) return;
        sfIdByIdRef.current.set(opp.id, opp.sf_opportunity_id);
        lastSyncedSfIdRef.current = urlOppId;
        setSelectedOppId(opp.id);
      } catch {
        if (cancelled) return;
        // Bad sfId — strip the param silently
        const next = new URLSearchParams(searchParams);
        next.delete('oppId');
        setSearchParams(next, { replace: true });
        lastSyncedSfIdRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlOppId, opps]);

  // Effect B: state → URL
  useEffect(() => {
    const next = new URLSearchParams(searchParams);

    if (selectedOppId === null) {
      // Only strip the param if we previously wrote it ourselves. On initial load with a
      // shared URL, Effect A is still resolving sfId→id — don't race it.
      if (next.has('oppId') && lastSyncedSfIdRef.current !== null) {
        next.delete('oppId');
        setSearchParams(next, { replace: true });
        lastSyncedSfIdRef.current = null;
      }
      return;
    }

    let sfId = sfIdByIdRef.current.get(selectedOppId);
    if (!sfId) {
      // Unknown sfId — fetch the opp to learn it, then re-run via state update.
      let cancelled = false;
      (async () => {
        try {
          const opp = await getOpportunity(selectedOppId);
          if (cancelled) return;
          sfIdByIdRef.current.set(opp.id, opp.sf_opportunity_id);
          // Trigger Effect B to re-run by writing the URL directly here
          const n = new URLSearchParams(searchParams);
          if (n.get('oppId') !== opp.sf_opportunity_id) {
            n.set('oppId', opp.sf_opportunity_id);
            const replace = lastSyncedSfIdRef.current !== null;
            setSearchParams(n, { replace });
            lastSyncedSfIdRef.current = opp.sf_opportunity_id;
          }
        } catch {
          /* swallow */
        }
      })();
      return () => { cancelled = true; };
    }

    if (next.get('oppId') === sfId) {
      lastSyncedSfIdRef.current = sfId;
      return;
    }

    next.set('oppId', sfId);
    // Push on open (so back closes the drawer); replace on subsequent drawer switches
    const replace = lastSyncedSfIdRef.current !== null;
    setSearchParams(next, { replace });
    lastSyncedSfIdRef.current = sfId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOppId, opps]);
}
