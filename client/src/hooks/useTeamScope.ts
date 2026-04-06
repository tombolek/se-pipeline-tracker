import { useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../store/auth';
import { usePipelineStore } from '../store/pipeline';
import { useUsers } from './useUsers';

/**
 * Returns the current team scope for manager-level filtering.
 *
 * When a manager has territories assigned (user.teams):
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

  // SE IDs of all direct reports — always populated when My Team scope is active.
  // Used by filterOppUnion for cross-territory ownership checks.
  const teamSeIds = useMemo(() => {
    if (!isManager || teamScopeManagerId === null || users.length === 0) return new Set<number>();
    const s = new Set<number>();
    for (const u of users) {
      if (u.manager_id === teamScopeManagerId) s.add(u.id);
    }
    return s;
  }, [isManager, teamScopeManagerId, users]);

  // SE-based filtering for filterOpp: only active when manager has NO territory teams.
  // (When territory mode is on, filterOpp uses teamNames instead.)
  const seIds = useMemo(() => {
    if (teamNames.size > 0) return new Set<number>();
    return teamSeIds;
  }, [teamNames, teamSeIds]);

  /**
   * Effective territories for the current user:
   * - Manager: their own assigned territories
   * - SE: their manager's territories (inherited)
   * Used for pipeline default filter and calendar union filter for SEs.
   */
  const effectiveTeamNames: Set<string> = useMemo(() => {
    if (isManager) return teamNames;
    if (!user?.manager_id || users.length === 0) return new Set<string>();
    const manager = users.find(u => u.id === user.manager_id);
    if (!manager?.teams?.length) return new Set<string>();
    return new Set(manager.teams);
  }, [isManager, teamNames, user?.manager_id, users]);

  /**
   * Standard filter predicate for opportunity-level data.
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

  /**
   * Union filter for calendar, PoC board, RFx board.
   * In "My Team" scope: includes opps that match the territory OR where
   * the current user / a team member is the SE owner (cross-territory coverage).
   */
  const filterOppUnion = useCallback(
    (item: { se_owner_id?: number | null; team?: string | null }) => {
      if (!isFiltered) return true;
      // Territory match
      if (teamNames.size > 0 && item.team != null && teamNames.has(item.team)) return true;
      // SE ownership: self or direct report
      if (item.se_owner_id != null) {
        if (item.se_owner_id === user?.id) return true;
        if (teamSeIds.size > 0 && teamSeIds.has(item.se_owner_id)) return true;
      }
      return false;
    },
    [isFiltered, teamNames, teamSeIds, user?.id]
  );

  /**
   * Returns true when an item is shown via SE-ownership rather than territory
   * membership. Used to drive the "out of territory" info banner.
   */
  const isOutOfTerritory = useCallback(
    (item: { team?: string | null }) => {
      if (!isFiltered || teamNames.size === 0) return false;
      return item.team == null || !teamNames.has(item.team);
    },
    [isFiltered, teamNames]
  );

  return {
    seIds,
    teamNames,
    effectiveTeamNames,
    isFiltered,
    isManager,
    filterOpp,
    filterOppUnion,
    isOutOfTerritory,
  };
}
