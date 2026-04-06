import { useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { usePipelineStore } from '../store/pipeline';
import { useUsers } from './useUsers';

/**
 * Returns the current team scope for manager-level filtering.
 *
 * When a manager has a `team` assigned (territory):
 *   My Team  → filter by opp.team === manager.team
 *   Full View → no filter
 *
 * When a manager has no `team` assigned (legacy SE-report based):
 *   My Team  → filter by SE IDs whose manager_id matches this manager
 *   Full View → no filter
 *
 * For non-managers: no filtering applied.
 */
export function useTeamScope() {
  const { user } = useAuthStore();
  const { teamScopeManagerId, teamScopeInitialized, initTeamScope } = usePipelineStore();
  const { users } = useUsers();

  const isManager = user?.role === 'manager';

  // Auto-init managers to "My Team" scope on first use
  useEffect(() => {
    if (!teamScopeInitialized && isManager && user?.id) {
      initTeamScope(user.id);
    }
  }, [teamScopeInitialized, isManager, user?.id, initTeamScope]);

  const isFiltered = isManager && teamScopeManagerId !== null;

  // Territory-based filtering takes priority when the manager has a team assigned
  const teamName: string | null = isFiltered && user?.team ? user.team : null;

  // SE-based filtering: only when My Team is active AND manager has no territory team
  const seIds = useMemo(() => {
    if (!isManager || teamScopeManagerId === null || teamName !== null || users.length === 0) {
      return new Set<number>();
    }
    const s = new Set<number>();
    for (const u of users) {
      if (u.manager_id === teamScopeManagerId) s.add(u.id);
    }
    return s;
  }, [isManager, teamScopeManagerId, teamName, users]);

  /**
   * Filter predicate for opportunity-level data.
   * Accepts any object with optional `se_owner_id` and `team` fields.
   */
  const filterOpp = useCallback(
    (item: { se_owner_id?: number | null; team?: string | null }) => {
      if (!isFiltered) return true;
      if (teamName !== null) return item.team === teamName;
      if (seIds.size > 0) return item.se_owner_id != null && seIds.has(item.se_owner_id);
      return true;
    },
    [isFiltered, teamName, seIds]
  );

  return {
    seIds,
    teamName,
    isFiltered,
    isManager,
    filterOpp,
  };
}
