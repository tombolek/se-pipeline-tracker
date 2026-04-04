import { useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/auth';
import { usePipelineStore } from '../store/pipeline';
import { useUsers } from './useUsers';

/**
 * Returns the current team scope for manager-level filtering.
 * - For non-managers: seIds is always empty (no filter applied).
 * - For managers: seIds contains IDs of SEs whose manager_id matches the current scope.
 *   When teamScopeManagerId is null (Full View), seIds is empty (= no filter).
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

  // Memoize seIds so Set reference is stable between renders
  const seIds = useMemo(() => {
    if (!isManager || teamScopeManagerId === null || users.length === 0) {
      return new Set<number>();
    }
    const s = new Set<number>();
    for (const u of users) {
      if (u.manager_id === teamScopeManagerId) {
        s.add(u.id);
      }
    }
    return s;
  }, [isManager, teamScopeManagerId, users]);

  return {
    seIds,
    isFiltered: isManager && teamScopeManagerId !== null,
    isManager,
  };
}
