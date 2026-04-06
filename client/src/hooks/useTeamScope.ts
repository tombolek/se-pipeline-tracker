import { useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { usePipelineStore } from '../store/pipeline';
import { useUsers } from './useUsers';

/**
 * Returns the current team scope for manager-level filtering.
 *
 * When a manager has one or more territories assigned (user.teams):
 *   My Team  → filter by opp.team is in manager.teams
 *   Full View → no filter
 *
 * When a manager has no territories assigned (legacy SE-report based):
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

  // Territory-based filtering: set of teams assigned to this manager
  const teamNames: Set<string> = useMemo(() => {
    if (!isFiltered || !user?.teams?.length) return new Set<string>();
    return new Set(user.teams);
  }, [isFiltered, user?.teams]);

  // SE-based filtering: only when My Team is active AND manager has no territory teams
  const seIds = useMemo(() => {
    if (!isManager || teamScopeManagerId === null || teamNames.size > 0 || users.length === 0) {
      return new Set<number>();
    }
    const s = new Set<number>();
    for (const u of users) {
      if (u.manager_id === teamScopeManagerId) s.add(u.id);
    }
    return s;
  }, [isManager, teamScopeManagerId, teamNames, users]);

  /**
   * Filter predicate for opportunity-level data.
   * Accepts any object with optional `se_owner_id` and `team` fields.
   */
  const filterOpp = useCallback(
    (item: { se_owner_id?: number | null; team?: string | null }) => {
      if (!isFiltered) return true;
      if (teamNames.size > 0) return item.team != null && teamNames.has(item.team);
      if (seIds.size > 0) return item.se_owner_id != null && seIds.has(item.se_owner_id);
      return true;
    },
    [isFiltered, teamNames, seIds]
  );

  return {
    seIds,
    teamNames,
    isFiltered,
    isManager,
    filterOpp,
  };
}
